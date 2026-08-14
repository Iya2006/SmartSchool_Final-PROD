"""
SMARTSCHOOL API — Routes Finance (TypesFrais, Factures, Échéanciers, Paiements, Dépenses)
"""
import os
import uuid
import shutil
from fastapi import APIRouter, Depends, HTTPException, Response, UploadFile, File
from sqlalchemy.orm import Session
from sqlalchemy import func, or_
from typing import Dict, List, Optional

from pydantic import BaseModel
from datetime import date as date_type
from app.core.annee_courante import resoudre_annee
from app.core.numerotation import generer_numero_facture, generer_numero_recu
from app.core.modes_paiement import exiger_mode_paiement
from app.core.database import get_db
from app.core.auth import require_etablissement
from app.models.academique import (
    TypeFrais, TarifClasse, Facture, EcheanceFacture, Paiement, Depense,
    Inscription, Classe, Eleve, AnneeScolaire, Enseignant, Utilisateur,
    Employe, Avance, Prime, AbsencePersonnel, BulletinPaie, PresenceAgent,
    Message, ParametreComptabilite, Affectation,
)
import calendar
from app.schemas.schemas import (
    TypeFraisCreate, TypeFraisOut, TarifClasseEntry,
    FactureCreate, FactureOut,
    EcheanceFactureOut,
    PaiementCreate, PaiementOut,
    DepenseCreate, DepenseOut
)
# Pont automatique vers la Comptabilité Générale (SYSCOHADA) : chaque
# facture/paiement/dépense/salaire réel génère une écriture équilibrée,
# dans la même transaction, pour que Balance/Grand Livre/Auxiliaire soient
# toujours synchronisés avec les opérations financières réelles.
from app.api.comptabilite import (
    generer_ecriture_auto, compte_tresorerie_pour_mode, compte_charge_pour_categorie,
    COMPTE_ELEVES, COMPTE_PRODUITS_SCOLARITE, COMPTE_BANQUE,
)

router = APIRouter(prefix="/api/finance", tags=["Finance"])


def _invalidate_dashboard_cache(etablissement_id: int, annee_id: Optional[int] = None) -> None:
    """
    Invalide le cache Redis du tableau de bord financier (TTL 60s) après
    toute mutation (encaissement, décaissement, salaire...), pour que le
    dashboard reflète immédiatement l'opération au lieu de servir des
    chiffres périmés jusqu'à expiration du TTL.
    """
    from app.core.cache import cache_del
    cache_del(f"dashboard:{etablissement_id}:{annee_id}")


# Relocalisé dans app/core/annee_lock.py (Phase 3) — le garde n'est plus
# spécifique à la finance, il est désormais importé transversalement par
# evaluations.py/portail_enseignant.py/vie_scolaire.py/emploi_du_temps.py
# pour verrouiller aussi les mutations pédagogiques d'une année archivée.
# Alias conservé pour que tous les appels internes existants de ce fichier
# continuent de fonctionner sans modification.
from app.core.annee_lock import verifier_annee_modifiable as _verifier_annee_modifiable


UPLOAD_DIR_DEPENSES = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "uploads", "depenses")
os.makedirs(UPLOAD_DIR_DEPENSES, exist_ok=True)


@router.post("/upload-justificatif")
def upload_justificatif(
    file: UploadFile = File(...),
    etablissement_id: int = Depends(require_etablissement),
):
    # Deposer un fichier sur le serveur sans etre rattache a une ecole
    # laissait la porte ouverte a n'importe quel envoi.
    """Upload d'un justificatif (facture/reçu) attaché à une dépense, retourne son URL publique."""
    ext = os.path.splitext(file.filename or "")[1]
    unique_name = f"{uuid.uuid4().hex}{ext}"
    save_path = os.path.join(UPLOAD_DIR_DEPENSES, unique_name)
    with open(save_path, "wb") as f:
        shutil.copyfileobj(file.file, f)
    return {"facture_url": f"/uploads/depenses/{unique_name}"}


# ============================================================================
# PARAMÈTRES FINANCIERS — lecture des réglages configurables via /parametres/finance
# (stockés dans ss_parametres, categorie='FINANCE')
# ============================================================================
import json as _json

FINANCE_DEFAULTS = {
    "devise": "GNF",
    "modes_paiement": ["ESPECES", "VIREMENT", "ORANGE_MONEY", "MTN_MONEY", "CHEQUE"],
    "frequence_paiement": "ANNUEL",
    "recu_prefixe": "REC",
    "penalite_active": False,
    "penalite_type": "POURCENTAGE",  # POURCENTAGE | MONTANT
    "penalite_valeur": 0,
    "penalite_delai_jours": 0,
    "reduction_active": False,
    "reductions": [],  # ex: [{"rang": 2, "pourcentage": 10}, {"rang": 3, "pourcentage": 15}]
    "salaires_mois_debut": "",  # YYYY-MM — début de la période sur laquelle les salaires sont dus
    "salaires_mois_fin": "",    # YYYY-MM — vide = période toujours en cours
}


def get_finance_settings(db: Session, etablissement_id: int) -> dict:
    """Lit les paramètres de la catégorie FINANCE (ss_parametres), avec valeurs par défaut."""
    from app.models.academique import ParametreEtablissement
    settings = dict(FINANCE_DEFAULTS)
    rows = db.query(ParametreEtablissement).filter(
        ParametreEtablissement.etablissement_id == etablissement_id,
        ParametreEtablissement.categorie == "FINANCE"
    ).all()
    for row in rows:
        key = row.cle.replace("finance.", "")
        if key not in FINANCE_DEFAULTS:
            continue
        try:
            if row.type_valeur == "BOOLEAN":
                settings[key] = row.valeur == "true"
            elif row.type_valeur == "NUMBER":
                settings[key] = float(row.valeur)
            elif row.type_valeur == "JSON":
                settings[key] = _json.loads(row.valeur)
            else:
                settings[key] = row.valeur
        except (ValueError, _json.JSONDecodeError):
            continue
    return settings


def calculer_rang_fratrie(db: Session, eleve_id: int, annee_id: int) -> int:
    """Calcule le rang (1er, 2e, 3e enfant...) d'un élève parmi les enfants actifs
    liés au(x) même(s) parent(s), triés par date de naissance (aîné = rang 1)."""
    from app.models.academique import EleveParent

    lien = db.query(EleveParent).filter(EleveParent.eleve_id == eleve_id).first()
    if not lien:
        return 1

    freres_ids = [
        l.eleve_id for l in
        db.query(EleveParent).filter(EleveParent.parent_id == lien.parent_id).all()
    ]
    if len(freres_ids) <= 1:
        return 1

    freres = (
        db.query(Eleve)
        .join(Inscription, Inscription.eleve_id == Eleve.eleve_id)
        .filter(
            Eleve.eleve_id.in_(freres_ids),
            Inscription.annee_id == annee_id,
            Inscription.statut == "ACTIVE"
        )
        .order_by(Eleve.date_naissance.asc())
        .distinct()
        .all()
    )
    for idx, e in enumerate(freres, start=1):
        if e.eleve_id == eleve_id:
            return idx
    return 1


def calculer_reduction_montant(montant: float, rang: int, settings: dict) -> float:
    """Retourne le montant de la réduction fratrie applicable (0 si aucune règle ne correspond)."""
    if not settings.get("reduction_active"):
        return 0.0
    for regle in settings.get("reductions") or []:
        try:
            if int(regle.get("rang")) == rang:
                pourcentage = float(regle.get("pourcentage", 0))
                return round(montant * pourcentage / 100, 2)
        except (TypeError, ValueError):
            continue
    return 0.0


def calculer_penalite(montant_restant: float, jours_retard: int, settings: dict) -> float:
    """Calcule la pénalité de retard applicable, si activée et le délai de grâce dépassé."""
    if not settings.get("penalite_active") or jours_retard <= 0:
        return 0.0
    delai = int(settings.get("penalite_delai_jours", 0) or 0)
    if jours_retard <= delai:
        return 0.0
    if settings.get("penalite_type") == "MONTANT":
        return float(settings.get("penalite_valeur", 0) or 0)
    pourcentage = float(settings.get("penalite_valeur", 0) or 0)
    return round(montant_restant * pourcentage / 100, 2)


# ============================================================================
# TYPES DE FRAIS
# ============================================================================

# Les types de frais appartiennent à chaque école depuis la migration
# 2026_08_compta_01. Auparavant la table était partagée : une école renommant
# « Scolarité » changeait l'intitulé sur les factures et les reçus de toutes
# les autres, et pouvait supprimer un type qu'une voisine utilisait.

def _type_frais_ou_404(db: Session, type_frais_id: int, etablissement_id: int) -> TypeFrais:
    tf = db.query(TypeFrais).filter(
        TypeFrais.type_frais_id == type_frais_id,
        TypeFrais.etablissement_id == etablissement_id,
    ).first()
    if not tf:
        # 404 et non 403 : on ne confirme pas l'existence d'un type d'ailleurs.
        raise HTTPException(status_code=404, detail="Type de frais non trouvé")
    return tf


@router.get("/types-frais", response_model=List[TypeFraisOut])
def list_types_frais(
    db: Session = Depends(get_db),
    etablissement_id: int = Depends(require_etablissement),
):
    return db.query(TypeFrais).filter(
        TypeFrais.etablissement_id == etablissement_id
    ).order_by(TypeFrais.categorie, TypeFrais.libelle).all()


@router.post("/types-frais", response_model=TypeFraisOut, status_code=201)
def create_type_frais(
    data: TypeFraisCreate,
    db: Session = Depends(get_db),
    etablissement_id: int = Depends(require_etablissement),
):
    code = data.code.upper()
    # Le code n'est unique QUE dans l'école : deux établissements peuvent avoir
    # chacun leur « SCOL ». Le doublon se vérifie donc à ce périmètre.
    if db.query(TypeFrais).filter(
        TypeFrais.code == code,
        TypeFrais.etablissement_id == etablissement_id,
    ).first():
        raise HTTPException(
            status_code=409,
            detail=f"Le code « {data.code} » est déjà utilisé dans votre établissement.",
        )
    tf = TypeFrais(
        etablissement_id=etablissement_id,
        code=code,
        libelle=data.libelle,
        categorie=data.categorie,
        montant_defaut=data.montant_defaut,
        est_obligatoire=data.est_obligatoire,
        frequence=data.frequence,
        statut="ACTIF"
    )
    db.add(tf)
    db.commit()
    db.refresh(tf)
    return tf


@router.put("/types-frais/{type_frais_id}", response_model=TypeFraisOut)
def update_type_frais(
    type_frais_id: int,
    data: TypeFraisCreate,
    db: Session = Depends(get_db),
    etablissement_id: int = Depends(require_etablissement),
):
    tf = _type_frais_ou_404(db, type_frais_id, etablissement_id)
    code = data.code.upper()
    if code != tf.code:
        if db.query(TypeFrais).filter(
            TypeFrais.code == code,
            TypeFrais.etablissement_id == etablissement_id,
            TypeFrais.type_frais_id != type_frais_id,
        ).first():
            raise HTTPException(
                status_code=409,
                detail=f"Le code « {data.code} » est déjà utilisé dans votre établissement.",
            )
    tf.code = code
    tf.libelle = data.libelle
    tf.categorie = data.categorie
    tf.montant_defaut = data.montant_defaut
    tf.est_obligatoire = data.est_obligatoire
    tf.frequence = data.frequence
    db.commit()
    db.refresh(tf)
    return tf


@router.delete("/types-frais/{type_frais_id}")
def delete_type_frais(
    type_frais_id: int,
    db: Session = Depends(get_db),
    etablissement_id: int = Depends(require_etablissement),
):
    tf = _type_frais_ou_404(db, type_frais_id, etablissement_id)
    # Une facture émise reste une pièce comptable : supprimer son type de frais
    # la rendrait illisible.
    linked = db.query(Facture).filter(Facture.type_frais_id == type_frais_id).count()
    if linked > 0:
        raise HTTPException(
            status_code=400,
            detail=f"Ce type de frais est lié à {linked} facture(s). Impossible de le supprimer.",
        )
    db.delete(tf)
    db.commit()
    return {"message": "Type de frais supprimé"}


# ============================================================================
# TARIFS PAR CLASSE — un montant différent par classe pour un même type de frais.
# Éditable depuis la page Comptabilité (par type de frais, ?type_frais_id=) ou
# depuis la fiche de configuration d'une classe (par classe, ?classe_id=) : les
# deux écrans lisent/écrivent la même table ss_tarifs_classe, donc restent
# automatiquement synchronisés sans logique de synchro dédiée.
# ============================================================================

# ════════════════════════════════════════════════════════════════════════
# FACTURES RATTACHÉES À RIEN
# ════════════════════════════════════════════════════════════════════════
# Une facture sans type de frais n'apparaît sous aucun intitulé dans les
# rapports : le total « recettes par type de frais » l'ignore purement et
# simplement, alors que l'argent, lui, a bien été encaissé. La base en compte
# 45, toutes antérieures aux contrôles posés depuis.
#
# On ne devine pas ce qu'elles facturent — c'est de l'argent. On les montre à
# l'école, et on lui donne le moyen de le dire.


@router.get("/factures/sans-type")
def factures_sans_type(
    db: Session = Depends(get_db),
    etablissement_id: int = Depends(require_etablissement),
):
    """Factures de cette école qui ne sont rattachées à aucun type de frais."""
    lignes = (
        db.query(Facture, Eleve, Classe)
        .join(Inscription, Inscription.inscription_id == Facture.inscription_id)
        .join(Classe, Classe.classe_id == Inscription.classe_id)
        .join(Eleve, Eleve.eleve_id == Inscription.eleve_id)
        .filter(
            Classe.etablissement_id == etablissement_id,
            Facture.type_frais_id.is_(None),
        )
        .order_by(Facture.facture_id)
        .all()
    )
    return {
        "total": len(lignes),
        "montant_total": round(sum(float(f.montant_net or 0) for f, _, _ in lignes), 2),
        "factures": [
            {
                "facture_id": f.facture_id,
                "numero_facture": f.numero_facture,
                "montant_net": float(f.montant_net or 0),
                "statut": f.statut,
                "eleve": f"{e.prenom} {e.nom}",
                "classe": c.libelle,
            }
            for f, e, c in lignes
        ],
    }


class RattachementFactures(BaseModel):
    """Quelles factures, et à quel type de frais."""
    facture_ids: List[int]
    type_frais_id: int


@router.put("/factures/rattacher-type")
def rattacher_factures_a_un_type(
    data: RattachementFactures,
    db: Session = Depends(get_db),
    etablissement_id: int = Depends(require_etablissement),
):
    """Rattache des factures orphelines à un type de frais de cette école.

    Ne touche QUE les factures encore sans type : réaffecter une facture déjà
    rattachée déplacerait une recette déjà comptabilisée d'un intitulé à un
    autre, sans laisser de trace. Ce n'est pas une correction, c'est une
    réécriture — et ça ne se fait pas depuis un bouton.
    """
    if not data.facture_ids:
        raise HTTPException(400, "Aucune facture sélectionnée.")

    type_frais = db.query(TypeFrais).filter(
        TypeFrais.type_frais_id == data.type_frais_id,
        TypeFrais.etablissement_id == etablissement_id,
    ).first()
    if not type_frais:
        raise HTTPException(404, "Type de frais non trouvé")

    # Le bornage à l'école ET à l'état « sans type » est dans la requête, pas
    # dans une vérification que l'on pourrait oublier de faire.
    factures = (
        db.query(Facture)
        .join(Inscription, Inscription.inscription_id == Facture.inscription_id)
        .join(Classe, Classe.classe_id == Inscription.classe_id)
        .filter(
            Facture.facture_id.in_(data.facture_ids),
            Classe.etablissement_id == etablissement_id,
            Facture.type_frais_id.is_(None),
        )
        .all()
    )
    for f in factures:
        f.type_frais_id = type_frais.type_frais_id
    db.commit()

    ignorees = len(data.facture_ids) - len(factures)
    message = f"{len(factures)} facture(s) rattachée(s) à « {type_frais.libelle} »."
    if ignorees:
        message += (
            f" {ignorees} ignorée(s) : déjà rattachée(s), ou hors de cet établissement."
        )
    return {"message": message, "rattachees": len(factures), "ignorees": ignorees}


@router.get("/tarifs-classe")
def get_tarifs_classe(
    type_frais_id: Optional[int] = None,
    classe_id: Optional[int] = None,
    db: Session = Depends(get_db),
    etablissement_id: int = Depends(require_etablissement),
):
    if not type_frais_id and not classe_id:
        raise HTTPException(status_code=400, detail="type_frais_id ou classe_id requis")

    query = db.query(TarifClasse, Classe, TypeFrais).join(
        Classe, TarifClasse.classe_id == Classe.classe_id
    ).join(
        TypeFrais, TarifClasse.type_frais_id == TypeFrais.type_frais_id
    ).filter(Classe.etablissement_id == etablissement_id)
    if type_frais_id:
        query = query.filter(TarifClasse.type_frais_id == type_frais_id)
    if classe_id:
        query = query.filter(TarifClasse.classe_id == classe_id)

    return [
        {
            "tarif_id": t.tarif_id,
            "type_frais_id": t.type_frais_id,
            "type_frais_libelle": tf.libelle,
            "type_frais_categorie": tf.categorie,
            "classe_id": c.classe_id,
            "classe_libelle": c.libelle,
            "montant": float(t.montant),
        }
        for t, c, tf in query.all()
    ]


@router.get("/tarifs-classe/grille")
def grille_tarifs(
    annee_id: Optional[int] = None,
    db: Session = Depends(get_db),
    etablissement_id: int = Depends(require_etablissement),
):
    """Ce que coûte l'année, classe par classe.

    Le réglage le plus important du module vivait derrière un petit bouton, sur
    une ligne de la liste des types de frais : il fallait savoir qu'il existait
    pour le trouver, et l'ouvrir type de frais par type de frais pour voir le
    tarif d'une classe. Impossible de répondre à la seule question que se pose
    un fondateur — « la 6ᵉ, ça coûte combien à l'année ? » — sans ouvrir tous
    les types de frais les uns après les autres et additionner de tête.

    Ici, une lecture : chaque classe, ce qu'elle paie par type de frais, et son
    total annuel. Les manques sont comptés, pas masqués : une classe sans tarif
    sera facturée au montant tapé à la main, ce qui est exactement la façon dont
    une école se retrouve avec deux élèves de la même classe facturés
    différemment.
    """
    annee_id = resoudre_annee(db, etablissement_id, annee_id)

    classes = (
        db.query(Classe)
        .filter(
            Classe.etablissement_id == etablissement_id,
            Classe.annee_id == annee_id,
            Classe.statut == "ACTIVE",
        )
        .order_by(Classe.code)
        .all()
    )
    types = (
        db.query(TypeFrais)
        .filter(TypeFrais.etablissement_id == etablissement_id)
        .order_by(TypeFrais.categorie, TypeFrais.libelle)
        .all()
    )

    # Un seul aller-retour pour tous les tarifs : la grille fait
    # classes x types de frais, la remplir case par case serait un N+1 garanti.
    tarifs = {}
    if classes and types:
        for t in (
            db.query(TarifClasse)
            .filter(
                TarifClasse.classe_id.in_([c.classe_id for c in classes]),
                TarifClasse.type_frais_id.in_([tf.type_frais_id for tf in types]),
            )
            .all()
        ):
            tarifs[(t.classe_id, t.type_frais_id)] = float(t.montant or 0)

    lignes = []
    for c in classes:
        montants = {
            tf.type_frais_id: tarifs.get((c.classe_id, tf.type_frais_id))
            for tf in types
        }
        obligatoires_manquants = [
            tf.libelle for tf in types
            if tf.est_obligatoire == "O" and not montants.get(tf.type_frais_id)
        ]
        lignes.append({
            "classe_id": c.classe_id,
            "classe_code": c.code,
            "classe_libelle": c.libelle,
            "effectif": c.effectif_actuel or 0,
            "montants": montants,
            "total_annuel": round(sum(v for v in montants.values() if v), 2),
            "manquants": obligatoires_manquants,
        })

    return {
        "types_frais": [
            {
                "type_frais_id": tf.type_frais_id,
                "libelle": tf.libelle,
                "categorie": tf.categorie,
                "est_obligatoire": tf.est_obligatoire,
                "frequence": tf.frequence,
            }
            for tf in types
        ],
        "classes": lignes,
        "nb_classes_completes": sum(1 for l in lignes if not l["manquants"]),
        "nb_classes_incompletes": sum(1 for l in lignes if l["manquants"]),
    }


def _repercuter_tarif_sur_factures(db: Session, type_frais_id: int, classe_id: int, nouveau_montant: float) -> int:
    """
    Répercute un nouveau tarif de classe sur les factures déjà générées mais
    pas encore intégralement payées, pour les élèves actuellement inscrits
    dans cette classe. Sans ça, changer un tarif de classe n'avait aucun
    effet sur ce qui restait dû aux familles n'ayant pas encore payé (bug
    signalé) : le montant d'une facture est un instantané figé à la
    génération, jamais resynchronisé depuis SS_TARIFS_CLASSE.

    Le montant de remise (fratrie) déjà appliqué est conservé tel quel en
    valeur absolue ; seul le montant de base change. Les échéances non
    encore intégralement soldées absorbent la différence au prorata de leur
    poids actuel (une échéance déjà payée n'est jamais modifiée), chacune
    plafonnée à ne jamais descendre sous ce qui a déjà été réglé dessus.
    """
    factures = (
        db.query(Facture)
        .join(Inscription, Facture.inscription_id == Inscription.inscription_id)
        .filter(
            Facture.type_frais_id == type_frais_id,
            Inscription.classe_id == classe_id,
            Inscription.statut == "ACTIVE",
            Facture.statut != "PAYEE",
        )
        .all()
    )

    for facture in factures:
        montant_paye_facture = float(facture.montant_paye or 0)
        nouveau_montant_net = max(nouveau_montant - float(facture.montant_remise or 0), montant_paye_facture)

        facture.montant_total = nouveau_montant
        facture.montant_net = nouveau_montant_net
        facture.montant_restant = max(0.0, nouveau_montant_net - montant_paye_facture)
        if facture.montant_restant <= 0:
            facture.statut = "PAYEE"
        elif montant_paye_facture > 0:
            facture.statut = "PARTIELLEMENT_PAYEE"
        else:
            facture.statut = "EN_ATTENTE"

        echeances = db.query(EcheanceFacture).filter(EcheanceFacture.facture_id == facture.facture_id).all()
        soldees = [e for e in echeances if e.statut == "PAYEE"]
        non_soldees = [e for e in echeances if e.statut != "PAYEE"]
        if not non_soldees:
            continue

        total_soldees = sum(float(e.montant_attendu or 0) for e in soldees)
        cible_non_soldees = max(0.0, nouveau_montant_net - total_soldees)
        ancien_total_non_soldees = sum(float(e.montant_attendu or 0) for e in non_soldees)

        restant_a_repartir = cible_non_soldees
        for i, echeance in enumerate(non_soldees):
            montant_paye_ech = float(echeance.montant_paye or 0)
            if i == len(non_soldees) - 1:
                nouveau_attendu = restant_a_repartir
            elif ancien_total_non_soldees > 0:
                poids = float(echeance.montant_attendu or 0) / ancien_total_non_soldees
                nouveau_attendu = round(cible_non_soldees * poids, 2)
            else:
                nouveau_attendu = round(cible_non_soldees / len(non_soldees), 2)
            nouveau_attendu = max(nouveau_attendu, montant_paye_ech)
            restant_a_repartir -= nouveau_attendu

            echeance.montant_attendu = nouveau_attendu
            if montant_paye_ech >= nouveau_attendu and nouveau_attendu > 0:
                echeance.statut = "PAYEE"
            elif montant_paye_ech > 0:
                echeance.statut = "PARTIELLEMENT_PAYEE"
            else:
                echeance.statut = "EN_ATTENTE"

    return len(factures)


@router.put("/tarifs-classe")
def set_tarifs_classe(entries: List[TarifClasseEntry], db: Session = Depends(get_db), etablissement_id: int = Depends(require_etablissement)):
    """Upsert en masse. Un montant <= 0 supprime le tarif existant pour ce
    couple (type_frais_id, classe_id) — permet de "décocher" une classe."""
    classe_ids = {e.classe_id for e in entries}
    if classe_ids:
        trouvees = {c.classe_id for c in db.query(Classe.classe_id).filter(
            Classe.classe_id.in_(classe_ids), Classe.etablissement_id == etablissement_id
        ).all()}
        if trouvees != classe_ids:
            raise HTTPException(status_code=403, detail="Classe(s) invalide(s) pour cet établissement")

    # Les classes etaient verifiees, le type de frais non — alors qu'il
    # appartient lui aussi a une ecole depuis la migration 2026_08_compta_01.
    # Une ecole pouvait donc poser un tarif sur le type de frais d'une autre.
    types_ids = {e.type_frais_id for e in entries}
    if types_ids:
        types_ok = {t[0] for t in db.query(TypeFrais.type_frais_id).filter(
            TypeFrais.type_frais_id.in_(types_ids),
            TypeFrais.etablissement_id == etablissement_id,
        ).all()}
        if types_ok != types_ids:
            raise HTTPException(status_code=404, detail="Type de frais non trouvé")

    upserted, deleted, factures_maj = 0, 0, 0
    for entry in entries:
        existing = db.query(TarifClasse).filter(
            TarifClasse.type_frais_id == entry.type_frais_id,
            TarifClasse.classe_id == entry.classe_id,
        ).first()
        if entry.montant <= 0:
            if existing:
                db.delete(existing)
                deleted += 1
            continue
        if existing:
            existing.montant = entry.montant
        else:
            db.add(TarifClasse(type_frais_id=entry.type_frais_id, classe_id=entry.classe_id, montant=entry.montant))
        upserted += 1
        factures_maj += _repercuter_tarif_sur_factures(db, entry.type_frais_id, entry.classe_id, float(entry.montant))

    db.commit()
    _invalidate_dashboard_cache(etablissement_id)
    return {"message": f"{upserted} tarif(s) enregistré(s), {deleted} supprimé(s), {factures_maj} facture(s) impayée(s) mise(s) à jour"}


@router.post("/tarifs/copier")
def copier_tarifs(data: dict, db: Session = Depends(get_db), etablissement_id: int = Depends(require_etablissement)):
    """
    Copie les tarifs (TarifClasse) d'une année vers une autre, classe par
    classe appariée sur le même niveau_id (même logique d'appariement que la
    préparation des classes en promotion — une classe n'a pas le même
    classe_id d'une année à l'autre, seul le niveau se retrouve). Idempotent :
    un tarif déjà présent pour la classe cible n'est jamais écrasé.
    Corps attendu : {annee_source_id, annee_cible_id, mode}.
    mode="vide" ne fait rien (l'admin construira la grille à la main) ;
    mode="copier"/"copier_editer" copient — la distinction entre les deux
    n'a de sens que côté frontend (ouvrir ou non l'écran tarifs après coup).
    """
    annee_source_id = data.get("annee_source_id")
    annee_cible_id = data.get("annee_cible_id")
    mode = data.get("mode", "copier")

    if mode == "vide":
        return {"message": "Grille tarifaire laissée vide pour la nouvelle année.", "copies": 0}

    if not annee_source_id or not annee_cible_id:
        raise HTTPException(status_code=400, detail="annee_source_id et annee_cible_id sont obligatoires")
    if annee_source_id == annee_cible_id:
        raise HTTPException(status_code=400, detail="L'année source et l'année cible doivent être différentes")

    # Les deux années doivent appartenir à l'établissement appelant — avant
    # le Lot 2, rien n'empêchait de copier la grille tarifaire d'une AUTRE
    # école (annee_source_id) vers la sienne, ou l'inverse.
    for aid in (annee_source_id, annee_cible_id):
        if not db.query(AnneeScolaire).filter(
            AnneeScolaire.annee_id == aid, AnneeScolaire.etablissement_id == etablissement_id
        ).first():
            raise HTTPException(status_code=404, detail=f"Année scolaire {aid} non trouvée")

    classes_source = db.query(Classe).filter(Classe.annee_id == annee_source_id).all()
    classes_cible = db.query(Classe).filter(Classe.annee_id == annee_cible_id).all()
    cible_par_niveau = {}
    for c in classes_cible:
        cible_par_niveau.setdefault(c.niveau_id, []).append(c)

    tarifs_existants_cible = {
        (t.type_frais_id, t.classe_id)
        for t in db.query(TarifClasse).filter(TarifClasse.classe_id.in_([c.classe_id for c in classes_cible])).all()
    } if classes_cible else set()

    copies, ignores_deja_present, classes_sans_correspondance = 0, 0, set()
    for classe_src in classes_source:
        classes_dst = cible_par_niveau.get(classe_src.niveau_id)
        if not classes_dst:
            classes_sans_correspondance.add(classe_src.libelle)
            continue
        tarifs_src = db.query(TarifClasse).filter(TarifClasse.classe_id == classe_src.classe_id).all()
        for tarif in tarifs_src:
            for classe_dst in classes_dst:
                if (tarif.type_frais_id, classe_dst.classe_id) in tarifs_existants_cible:
                    ignores_deja_present += 1
                    continue
                db.add(TarifClasse(
                    type_frais_id=tarif.type_frais_id,
                    classe_id=classe_dst.classe_id,
                    montant=tarif.montant,
                ))
                tarifs_existants_cible.add((tarif.type_frais_id, classe_dst.classe_id))
                copies += 1

    db.commit()
    return {
        "message": f"{copies} tarif(s) copié(s) vers la nouvelle année.",
        "copies": copies,
        "ignores_deja_present": ignores_deja_present,
        "classes_sans_correspondance": sorted(classes_sans_correspondance),
    }


# ============================================================================
# FACTURES — avec info élève
# ============================================================================

@router.get("/factures")
def list_factures(
    response: Response,
    annee_id: Optional[int] = None,
    statut: Optional[str] = None,
    classe_id: Optional[int] = None,
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    etablissement_id: int = Depends(require_etablissement),
):
    """Retourne toutes les factures avec infos élève, classe et type de frais."""
    # Sans annee precisee, celle EN COURS DE CETTE ECOLE — et non
    # l'annee n°1, qui appartient a la premiere ecole inscrite.
    annee_id = resoudre_annee(db, etablissement_id, annee_id)
    query = (
        db.query(Facture, Eleve, Classe, TypeFrais)
        .join(Inscription, Facture.inscription_id == Inscription.inscription_id)
        .join(Eleve, Inscription.eleve_id == Eleve.eleve_id)
        .join(Classe, Inscription.classe_id == Classe.classe_id)
        .outerjoin(TypeFrais, Facture.type_frais_id == TypeFrais.type_frais_id)
        .filter(
            Classe.etablissement_id == etablissement_id,
            Inscription.annee_id == annee_id
        )
    )
    if statut:
        query = query.filter(Facture.statut == statut)
    if classe_id:
        query = query.filter(Classe.classe_id == classe_id)

    total = query.count()
    response.headers["X-Total-Count"] = str(total)

    results = query.order_by(Facture.date_facture.desc()).offset(skip).limit(limit).all()

    factures = []
    for facture, eleve, classe, type_frais in results:
        echeances = db.query(EcheanceFacture).filter(EcheanceFacture.facture_id == facture.facture_id).all()
        factures.append({
            "facture_id": facture.facture_id,
            "numero_facture": facture.numero_facture,
            "date_facture": str(facture.date_facture) if facture.date_facture else None,
            "montant_total": float(facture.montant_total or 0),
            "montant_paye": float(facture.montant_paye or 0),
            "montant_restant": float(facture.montant_restant or 0),
            "statut": facture.statut,
            "inscription_id": facture.inscription_id,
            "type_frais_id": facture.type_frais_id,
            "type_frais_libelle": type_frais.libelle if type_frais else "N/A",
            "eleve_id": eleve.eleve_id,
            "eleve_nom": eleve.nom,
            "eleve_prenom": eleve.prenom,
            "classe_nom": classe.libelle,
            "classe_id": classe.classe_id,
            "echeances": [
                {
                    "echeance_id": e.echeance_id,
                    "libelle": e.libelle,
                    "date_limite": str(e.date_limite),
                    "montant_attendu": float(e.montant_attendu or 0),
                    "montant_paye": float(e.montant_paye or 0),
                    "statut": e.statut
                } for e in echeances
            ]
        })
    return factures


@router.get("/factures/stats")
def stats_factures(
    annee_id: Optional[int] = None,
    classe_id: Optional[int] = None,
    statut: Optional[str] = None,
    type_frais_id: Optional[int] = None,
    db: Session = Depends(get_db),
    etablissement_id: int = Depends(require_etablissement),
):
    # Sans annee precisee, celle EN COURS DE CETTE ECOLE — et non
    # l'annee n°1, qui appartient a la premiere ecole inscrite.
    annee_id = resoudre_annee(db, etablissement_id, annee_id)
    query_base = (
        db.query(Facture)
        .join(Inscription, Facture.inscription_id == Inscription.inscription_id)
        .join(Classe, Inscription.classe_id == Classe.classe_id)
        .filter(Classe.etablissement_id == etablissement_id, Inscription.annee_id == annee_id)
    )
    if classe_id:
        query_base = query_base.filter(Classe.classe_id == classe_id)
    if type_frais_id:
        query_base = query_base.filter(Facture.type_frais_id == type_frais_id)
    if statut:
        query_base = query_base.filter(Facture.statut == statut)

    total_facture = query_base.with_entities(func.coalesce(func.sum(Facture.montant_net), 0)).scalar()
    total_paye = query_base.with_entities(func.coalesce(func.sum(Facture.montant_paye), 0)).scalar()
    total_restant = query_base.with_entities(func.coalesce(func.sum(Facture.montant_restant), 0)).scalar()

    nb_payees = query_base.filter(Facture.statut == "PAYEE").count()
    nb_en_retard = query_base.filter(Facture.statut == "EN_RETARD").count()
    nb_en_attente = query_base.filter(Facture.statut == "EN_ATTENTE").count()
    nb_partielles = query_base.filter(Facture.statut == "PARTIELLEMENT_PAYEE").count()
    nb_eleves_impayes = (
        query_base.filter(Facture.statut.in_(["EN_ATTENTE", "PARTIELLEMENT_PAYEE", "EN_RETARD"]))
        .with_entities(Inscription.eleve_id).distinct().count()
    )

    return {
        "total_facture": float(total_facture),
        "total_paye": float(total_paye),
        "total_restant": float(total_restant),
        "taux_recouvrement": round(float(total_paye) / float(total_facture) * 100, 1) if float(total_facture) > 0 else 0,
        "nb_payees": nb_payees,
        "nb_en_retard": nb_en_retard,
        "nb_en_attente": nb_en_attente,
        "nb_partielles": nb_partielles,
        "nb_eleves_impayes": nb_eleves_impayes,
        "total_factures": nb_payees + nb_en_retard + nb_en_attente + nb_partielles
    }


@router.post("/factures", status_code=201)
def create_facture(data: FactureCreate, db: Session = Depends(get_db), etablissement_id: int = Depends(require_etablissement)):
    """Crée une facture pour une inscription avec possibilité d'échéancier."""
    # Vérifier l'inscription — et qu'elle appartient bien à l'établissement
    # appelant (avant le Lot 2, n'importe quel inscription_id d'une AUTRE
    # école pouvait être facturé depuis ce compte).
    inscription = (
        db.query(Inscription)
        .join(Classe, Inscription.classe_id == Classe.classe_id)
        .filter(Inscription.inscription_id == data.inscription_id, Classe.etablissement_id == etablissement_id)
        .first()
    )
    if not inscription:
        raise HTTPException(status_code=404, detail="Inscription non trouvée")
    _verifier_annee_modifiable(db, inscription.annee_id)

    # Vérifier le type de frais
    # Le type de frais est desormais PROPRE A CHAQUE ECOLE : le chercher par son
    # seul identifiant permettait de facturer un eleve avec le type de frais
    # d'un autre etablissement — la facture portait alors le libelle d'une ecole
    # etrangere, et la recette se rangeait sous SON intitule.
    type_frais = db.query(TypeFrais).filter(
        TypeFrais.type_frais_id == data.type_frais_id,
        TypeFrais.etablissement_id == etablissement_id,
    ).first()
    if not type_frais:
        raise HTTPException(status_code=404, detail="Type de frais non trouvé")

    # Valider les échéances si fournies
    if data.echeances:
        total_echeances = sum(e.montant_attendu for e in data.echeances)
        if abs(total_echeances - data.montant_total) > 0.01:
            raise HTTPException(
                status_code=400,
                detail=f"La somme des échéances ({total_echeances:,.0f}) doit être égale au montant total ({data.montant_total:,.0f})"
            )

    # « Lire le dernier numéro, ajouter 1 » : deux saisies simultanées lisaient
    # le même dernier numéro et fabriquaient le même — la seconde tombait en
    # erreur 500 sur l'index unique. Et la séquence était commune à toutes les
    # écoles. Le compteur persistant règle les deux (app/core/numerotation.py).
    numero_facture = generer_numero_facture(db, etablissement_id, inscription.annee_id)

    facture = Facture(
        inscription_id=data.inscription_id,
        annee_id=inscription.annee_id,
        type_frais_id=data.type_frais_id,
        numero_facture=numero_facture,
        montant_total=data.montant_total,
        montant_remise=0,
        montant_net=data.montant_total,
        montant_paye=0,
        montant_restant=data.montant_total,
        statut="EN_ATTENTE"
    )
    db.add(facture)
    db.flush()  # Pour obtenir l'ID

    # Créer les échéances
    for ech_data in data.echeances:
        echeance = EcheanceFacture(
            facture_id=facture.facture_id,
            libelle=ech_data.libelle,
            date_limite=ech_data.date_limite,
            montant_attendu=ech_data.montant_attendu,
            montant_paye=0,
            statut="EN_ATTENTE"
        )
        db.add(echeance)

    # Comptabilité générale : constate la créance (Debit 4111 Élèves / Credit 7061 Produits)
    generer_ecriture_auto(
        db, date_ecriture=date_type.today(), journal_code="VE",
        libelle=f"Facturation {type_frais.libelle} — {numero_facture}",
        reference=numero_facture,
        lignes=[
            {"compte": COMPTE_ELEVES, "debit": float(facture.montant_net), "credit": 0,
             "eleve_id": inscription.eleve_id, "classe_id": inscription.classe_id, "description": numero_facture},
            {"compte": COMPTE_PRODUITS_SCOLARITE, "debit": 0, "credit": float(facture.montant_net),
             "classe_id": inscription.classe_id, "description": numero_facture},
        ],
        etablissement_id=etablissement_id,
    )

    db.commit()
    db.refresh(facture)
    _invalidate_dashboard_cache(etablissement_id, inscription.annee_id)

    return {
        "facture_id": facture.facture_id,
        "numero_facture": facture.numero_facture,
        "montant_total": float(facture.montant_total),
        "statut": facture.statut,
        "message": f"Facture {numero_facture} créée avec succès"
    }


from app.schemas.schemas import GenererFacturesClasseRequest

@router.post("/factures/generer-classe", status_code=201)
def generer_factures_classe(
    data: GenererFacturesClasseRequest,
    db: Session = Depends(get_db),
    etablissement_id: int = Depends(require_etablissement),
):
    """Génère les factures pour tous les élèves d'une classe en un clic."""
    _verifier_annee_modifiable(db, data.annee_id)

    # La classe doit appartenir à l'établissement appelant — avant le Lot 2,
    # rien n'empêchait de facturer en masse toute une classe d'une AUTRE école.
    classe = db.query(Classe).filter(
        Classe.classe_id == data.classe_id, Classe.etablissement_id == etablissement_id
    ).first()
    if not classe:
        raise HTTPException(status_code=404, detail="Classe non trouvée")

    # Récupérer toutes les inscriptions de la classe
    inscriptions = db.query(Inscription).filter(
        Inscription.classe_id == data.classe_id,
        Inscription.annee_id == data.annee_id,
        Inscription.statut == "ACTIVE"
    ).all()

    if not inscriptions:
        raise HTTPException(status_code=404, detail="Aucun élève actif dans cette classe")

    # Le type de frais est desormais PROPRE A CHAQUE ECOLE : le chercher par son
    # seul identifiant permettait de facturer un eleve avec le type de frais
    # d'un autre etablissement — la facture portait alors le libelle d'une ecole
    # etrangere, et la recette se rangeait sous SON intitule.
    type_frais = db.query(TypeFrais).filter(
        TypeFrais.type_frais_id == data.type_frais_id,
        TypeFrais.etablissement_id == etablissement_id,
    ).first()
    if not type_frais:
        raise HTTPException(status_code=404, detail="Type de frais non trouvé")

    # Le montant vient jusqu'ici uniquement du corps de la requête, sans jamais
    # être confronté au tarif réellement configuré (TarifClasse) — un montant
    # incohérent envoyé par erreur (ou un client tiers) pouvait être facturé
    # silencieusement à toute une classe. Si un tarif existe pour cette
    # (classe, type de frais), c'est LUI la source de vérité.
    tarif = db.query(TarifClasse).filter(
        TarifClasse.classe_id == data.classe_id, TarifClasse.type_frais_id == data.type_frais_id
    ).first()
    if tarif is not None and abs(float(tarif.montant) - float(data.montant)) > 0.01:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Le montant envoyé ({data.montant:,.0f} GNF) ne correspond pas au tarif configuré "
                f"pour cette classe ({float(tarif.montant):,.0f} GNF) — mettez à jour le tarif "
                "(Paramètres > Finance ou fiche de classe) plutôt que de forcer un montant différent."
            ),
        )

    # Un frais FACULTATIF (ex: cantine) n'a pas vocation à être facturé
    # automatiquement à TOUTE la classe : seules les familles qui y adhèrent
    # doivent être facturées (via l'inscription, où l'adhésion est cochée par
    # frais, ou individuellement ensuite). Sans ce garde-fou, générer les
    # factures "pour la classe" facturait la cantine à des familles qui n'y
    # avaient jamais adhéré (bug signalé). `forcer_optionnel` permet quand
    # même de facturer toute la classe si le comptable le confirme sciemment
    # (ex: un service qui devient collectif pour l'année).
    if type_frais.est_obligatoire != "O" and not data.forcer_optionnel:
        raise HTTPException(
            status_code=400,
            detail=(
                f"'{type_frais.libelle}' est un frais facultatif : le facturer à toute la classe "
                "l'imposerait aussi aux familles qui n'y ont pas adhéré. Facturez-le individuellement "
                "par élève (fiche de compte élève), ou confirmez explicitement vouloir l'appliquer à "
                "toute la classe."
            ),
        )

    created_count = 0
    skipped_count = 0

    # Le numéro se tire dans la boucle, une pièce à la fois : le calculer une
    # fois puis ajouter un décalage supposait qu'aucune autre facture n'était
    # créée pendant la génération — ce qui est précisément le cas où deux
    # secrétariats facturent deux classes en même temps.

    finance_settings = get_finance_settings(db, etablissement_id) if data.appliquer_reductions else None

    for inscription in inscriptions:
        # Vérifier si une facture de ce type existe déjà pour cette inscription
        existing = db.query(Facture).filter(
            Facture.inscription_id == inscription.inscription_id,
            Facture.type_frais_id == data.type_frais_id
        ).first()
        if existing:
            skipped_count += 1
            continue

        numero_facture = generer_numero_facture(
            db, etablissement_id, inscription.annee_id
        )

        # Réduction fratrie (optionnelle, configurée dans /parametres/finance)
        montant_remise = 0.0
        if finance_settings is not None:
            rang = calculer_rang_fratrie(db, inscription.eleve_id, data.annee_id)
            montant_remise = calculer_reduction_montant(data.montant, rang, finance_settings)
        montant_net = data.montant - montant_remise

        facture = Facture(
            inscription_id=inscription.inscription_id,
            annee_id=inscription.annee_id,
            type_frais_id=data.type_frais_id,
            numero_facture=numero_facture,
            montant_total=data.montant,
            montant_remise=montant_remise,
            montant_net=montant_net,
            montant_paye=0,
            montant_restant=montant_net,
            statut="EN_ATTENTE"
        )
        db.add(facture)
        db.flush()

        # Créer les échéances si fournies
        if data.echeances:
            for ech in data.echeances:
                echeance = EcheanceFacture(
                    facture_id=facture.facture_id,
                    libelle=ech.libelle,
                    date_limite=ech.date_limite,
                    montant_attendu=ech.montant_attendu,
                    montant_paye=0,
                    statut="EN_ATTENTE"
                )
                db.add(echeance)
        else:
            # Si aucune échéance n'est précisée, créer une échéance unique par défaut
            from datetime import date
            echeance = EcheanceFacture(
                facture_id=facture.facture_id,
                libelle="Paiement unique",
                date_limite=date.today(),
                montant_attendu=montant_net,
                montant_paye=0,
                statut="EN_ATTENTE"
            )
            db.add(echeance)

        # Comptabilité générale : constate la créance, exactement comme
        # create_facture (facture unitaire) — jusqu'ici cette génération en
        # masse ne créait AUCUNE écriture, donc les factures produites via
        # "Facturer une classe" restaient invisibles du Grand Livre et de la
        # Comptabilité Auxiliaire (compte élève toujours à 0, quel que soit le
        # tarif réellement facturé).
        generer_ecriture_auto(
            db, date_ecriture=date_type.today(), journal_code="VE",
            libelle=f"Facturation {type_frais.libelle} — {numero_facture}",
            reference=numero_facture,
            lignes=[
                {"compte": COMPTE_ELEVES, "debit": float(montant_net), "credit": 0,
                 "eleve_id": inscription.eleve_id, "classe_id": inscription.classe_id, "description": numero_facture},
                {"compte": COMPTE_PRODUITS_SCOLARITE, "debit": 0, "credit": float(montant_net),
                 "classe_id": inscription.classe_id, "description": numero_facture},
            ],
            etablissement_id=etablissement_id,
        )

        created_count += 1

    db.commit()
    return {
        "message": f"{created_count} facture(s) générée(s), {skipped_count} déjà existante(s)",
        "created": created_count,
        "skipped": skipped_count
    }


# ============================================================================
# PAIEMENTS — avec fractionnement et mise à jour des échéances
# ============================================================================

@router.get("/paiements")
def list_paiements(
    response: Response,
    annee_id: Optional[int] = None,
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    etablissement_id: int = Depends(require_etablissement),
):
    # Sans annee precisee, celle EN COURS DE CETTE ECOLE — et non
    # l'annee n°1, qui appartient a la premiere ecole inscrite.
    annee_id = resoudre_annee(db, etablissement_id, annee_id)
    query = (
        db.query(Paiement, Facture, Eleve)
        .join(Facture, Paiement.facture_id == Facture.facture_id)
        .join(Inscription, Facture.inscription_id == Inscription.inscription_id)
        .join(Eleve, Inscription.eleve_id == Eleve.eleve_id)
        .join(Classe, Inscription.classe_id == Classe.classe_id)
        .filter(Classe.etablissement_id == etablissement_id)
    )
    if annee_id is not None:
        query = query.filter(Inscription.annee_id == annee_id)

    total = query.count()
    response.headers["X-Total-Count"] = str(total)

    results = (
        query
        .order_by(Paiement.date_paiement.desc())
        .offset(skip).limit(limit).all()
    )

    return [
        {
            "paiement_id": p.paiement_id,
            "numero_recu": p.numero_recu,
            "date_paiement": str(p.date_paiement) if p.date_paiement else None,
            "montant": float(p.montant),
            "mode_paiement": p.mode_paiement,
            "reference_externe": p.reference_externe,
            "statut": p.statut,
            "facture_id": p.facture_id,
            "echeance_id": p.echeance_id,
            "numero_facture": f.numero_facture,
            "eleve_nom": e.nom,
            "eleve_prenom": e.prenom
        }
        for p, f, e in results
    ]


@router.post("/paiements", status_code=201)
def create_paiement(data: PaiementCreate, db: Session = Depends(get_db), etablissement_id: int = Depends(require_etablissement)):
    """Enregistre un paiement avec mise à jour facture et échéance si applicable."""
    # La facture doit appartenir à l'établissement appelant — avant le Lot 2,
    # n'importe quel facture_id d'une AUTRE école pouvait recevoir un paiement
    # depuis ce compte (enregistrement d'un règlement fictif ou détournement
    # de la comptabilité d'une autre école).
    facture = (
        db.query(Facture)
        .join(Inscription, Facture.inscription_id == Inscription.inscription_id)
        .join(Classe, Inscription.classe_id == Classe.classe_id)
        .filter(Facture.facture_id == data.facture_id, Classe.etablissement_id == etablissement_id)
        .first()
    )
    if not facture:
        raise HTTPException(status_code=404, detail="Facture non trouvée")

    _verifier_annee_modifiable(db, facture.annee_id)

    if float(facture.montant_restant or 0) <= 0:
        raise HTTPException(status_code=400, detail="Cette facture est déjà entièrement payée")

    if data.montant <= 0:
        raise HTTPException(status_code=400, detail="Le montant doit être supérieur à 0")

    if data.montant > float(facture.montant_restant or 0):
        raise HTTPException(
            status_code=400,
            detail=f"Le montant ({data.montant:,.0f}) dépasse le reste à payer ({float(facture.montant_restant):,.0f})"
        )

    # Mettre à jour l'échéance si précisée
    if data.echeance_id:
        echeance = db.query(EcheanceFacture).filter(
            EcheanceFacture.echeance_id == data.echeance_id,
            EcheanceFacture.facture_id == data.facture_id
        ).first()
        if not echeance:
            raise HTTPException(status_code=404, detail="Échéance non trouvée pour cette facture")

        restant_echeance = float(echeance.montant_attendu or 0) - float(echeance.montant_paye or 0)
        if data.montant > restant_echeance:
            raise HTTPException(
                status_code=400,
                detail=f"Le montant ({data.montant:,.0f}) dépasse le reste dû sur cette échéance ({restant_echeance:,.0f})"
            )

        echeance.montant_paye = float(echeance.montant_paye or 0) + data.montant
        if echeance.montant_paye >= float(echeance.montant_attendu or 0):
            echeance.statut = "PAYEE"
        else:
            echeance.statut = "PARTIELLEMENT_PAYEE"

    # Le numéro de reçu venait d'un COUNT global : il régressait dès qu'un
    # paiement était annulé, et réattribuait alors un numéro figurant sur un
    # reçu déjà remis à un parent. Deux pièces portant le même numéro, c'est un
    # litige que la comptabilité ne peut pas trancher.
    settings = get_finance_settings(db, etablissement_id)
    # « Especes », « ESPECES » et « Cash » etaient trois modes differents pour
    # la base : le panneau « Repartition par Mode » affichait 0 GNF partout,
    # faute de retrouver ses codes. On normalise a l'ecriture, pas a
    # l'affichage — un total ne se repare pas apres coup.
    mode_normalise = exiger_mode_paiement(
        data.mode_paiement, settings.get("modes_paiement")
    )
    numero_recu = generer_numero_recu(
        db, etablissement_id, facture.annee_id, settings.get("recu_prefixe") or "REC"
    )

    # Un encaissement porte la date a laquelle l'argent est entre, pas celle de
    # la saisie. Une date future serait en revanche une faute de frappe : on
    # n'encaisse pas demain.
    jour_encaissement = data.date_paiement or date_type.today()
    if jour_encaissement > date_type.today():
        raise HTTPException(
            status_code=400,
            detail="Un paiement ne peut pas etre date dans le futur.",
        )

    paiement = Paiement(
        facture_id=data.facture_id,
        annee_id=facture.annee_id,
        echeance_id=data.echeance_id,
        numero_recu=numero_recu,
        montant=data.montant,
        mode_paiement=mode_normalise,
        reference_externe=data.reference_externe,
        date_paiement=jour_encaissement,
        devise=settings.get("devise") or "GNF",
        statut="VALIDE"
    )
    db.add(paiement)

    # Mettre à jour la facture
    facture.montant_paye = float(facture.montant_paye or 0) + data.montant
    facture.montant_restant = float(facture.montant_net or 0) - float(facture.montant_paye)
    if facture.montant_restant <= 0:
        facture.statut = "PAYEE"
        facture.montant_restant = 0
    else:
        facture.statut = "PARTIELLEMENT_PAYEE"

    # Comptabilité générale : encaissement réel (Debit trésorerie / Credit 4111 Élèves)
    insc = db.query(Inscription).filter(Inscription.inscription_id == facture.inscription_id).first()
    compte_tresorerie, journal_tresorerie = compte_tresorerie_pour_mode(mode_normalise)
    # `eleve_id` n'est posé QUE sur la ligne 4111 (compte élève) — c'est elle
    # qui identifie le compte auxiliaire de l'élève. La poser aussi sur la
    # ligne de trésorerie (comme c'était le cas avant ce correctif) fausse le
    # solde auxiliaire de l'élève : les requêtes "compte individuel" (voir
    # comptabilite.py) somment débit/crédit par eleve_id sans filtrer par
    # compte, donc la ligne trésorerie (qui n'appartient pas à l'élève, elle
    # appartient à la caisse/banque de l'école) venait gonfler artificiellement
    # le total débit de l'élève d'exactement le montant payé — masquant tout
    # solde réellement dû (symptôme observé : "Facturé"/"Réglé" identiques,
    # toujours "Soldé", quel que soit le montant réellement facturé).
    generer_ecriture_auto(
        db, date_ecriture=jour_encaissement, journal_code=journal_tresorerie,
        libelle=f"Encaissement scolarité — {numero_recu}",
        reference=numero_recu,
        lignes=[
            {"compte": compte_tresorerie, "debit": float(data.montant), "credit": 0,
             "classe_id": insc.classe_id if insc else None,
             "description": numero_recu},
            {"compte": COMPTE_ELEVES, "debit": 0, "credit": float(data.montant),
             "eleve_id": insc.eleve_id if insc else None, "classe_id": insc.classe_id if insc else None,
             "description": numero_recu},
        ],
        etablissement_id=etablissement_id,
    )

    db.commit()
    db.refresh(paiement)
    _invalidate_dashboard_cache(etablissement_id, facture.annee_id)

    return {
        "paiement_id": paiement.paiement_id,
        "numero_recu": numero_recu,
        "montant": float(paiement.montant),
        "mode_paiement": paiement.mode_paiement,
        "statut": paiement.statut,
        "facture_statut": facture.statut,
        "message": f"Paiement enregistré. Reçu N° {numero_recu}"
    }


# ============================================================================
# DÉPENSES
# ============================================================================

@router.get("/depenses", response_model=List[DepenseOut])
def list_depenses(
    response: Response,
    annee_id: Optional[int] = None,
    categorie: Optional[str] = None,
    classe_id: Optional[int] = None,
    statut: Optional[str] = None,
    search: Optional[str] = None,
    skip: int = 0,
    limit: int = 50,
    db: Session = Depends(get_db),
    etablissement_id: int = Depends(require_etablissement),
):
    # Sans annee precisee, celle EN COURS DE CETTE ECOLE — et non
    # l'annee n°1, qui appartient a la premiere ecole inscrite.
    annee_id = resoudre_annee(db, etablissement_id, annee_id)
    query = db.query(Depense).filter(
        Depense.etablissement_id == etablissement_id,
        Depense.annee_id == annee_id
    )
    # Les salaires sont enregistres comme des depenses de categorie SALAIRES,
    # mais ils relevent du module Salaires et de ses ecrans. Les afficher ici
    # doublerait les montants a l'oeil du comptable et rendrait illisibles les
    # depenses de fonctionnement. Meme perimetre que `stats_depenses`, sans
    # quoi le total affiche et la liste en dessous ne diraient pas la meme
    # chose. `categorie=SALAIRES` reste possible pour qui les demande.
    if categorie:
        query = query.filter(Depense.categorie == categorie)
    else:
        query = query.filter(
            func.upper(func.coalesce(Depense.categorie, "")) != "SALAIRES"
        )
    if classe_id:
        query = query.filter(Depense.classe_id == classe_id)
    if statut:
        query = query.filter(Depense.statut == statut)
    if search:
        like = f"%{search.strip()}%"
        query = query.filter(
            (Depense.libelle.ilike(like)) | (Depense.fournisseur.ilike(like)) | (Depense.categorie.ilike(like))
        )

    total = query.count()
    response.headers["X-Total-Count"] = str(total)

    return query.order_by(Depense.date_depense.desc(), Depense.depense_id.desc()).offset(skip).limit(limit).all()


@router.post("/depenses", response_model=DepenseOut, status_code=201)
def create_depense(data: DepenseCreate, db: Session = Depends(get_db), etablissement_id: int = Depends(require_etablissement)):
    _verifier_annee_modifiable(db, data.annee_id)
    if data.montant <= 0:
        raise HTTPException(status_code=400, detail="Le montant doit être supérieur à 0")
    # data.etablissement_id vient du corps de la requête (schéma DepenseBase) —
    # ignoré ici et remplacé par l'établissement authentifié : avant le Lot 2,
    # n'importe quel client pouvait choisir librement l'école propriétaire de
    # la dépense créée simplement en changeant ce champ dans le body.
    payload = data.model_dump()
    payload["etablissement_id"] = etablissement_id
    dep = Depense(**payload)
    db.add(dep)
    db.commit()
    db.refresh(dep)
    _invalidate_dashboard_cache(etablissement_id, data.annee_id)
    return dep


@router.put("/depenses/{depense_id}/approuver")
def approuver_depense(depense_id: int, db: Session = Depends(get_db), etablissement_id: int = Depends(require_etablissement)):
    dep = db.query(Depense).filter(
        Depense.depense_id == depense_id, Depense.etablissement_id == etablissement_id
    ).first()
    if not dep:
        raise HTTPException(status_code=404, detail="Dépense non trouvée")
    _verifier_annee_modifiable(db, dep.annee_id)
    if dep.statut != "EN_ATTENTE":
        raise HTTPException(status_code=400, detail="Cette dépense ne peut pas être approuvée")
    dep.statut = "APPROUVEE"
    db.commit()
    return {"message": "Dépense approuvée"}

@router.put("/depenses/{depense_id}/statut")
def changer_statut_depense(depense_id: int, statut: str, db: Session = Depends(get_db), etablissement_id: int = Depends(require_etablissement)):
    dep = db.query(Depense).filter(
        Depense.depense_id == depense_id, Depense.etablissement_id == etablissement_id
    ).first()
    if not dep:
        raise HTTPException(status_code=404, detail="Dépense non trouvée")
    _verifier_annee_modifiable(db, dep.annee_id)
    if dep.statut == "VALIDE":
        raise HTTPException(
            status_code=400,
            detail="Cette dépense est déjà validée et postée en comptabilité générale : son statut ne peut plus être changé depuis cet écran."
        )
    if statut not in ("EN_ATTENTE", "APPROUVEE", "REJETEE"):
        raise HTTPException(status_code=400, detail="Statut invalide")
    dep.statut = statut
    db.commit()
    _invalidate_dashboard_cache(etablissement_id, dep.annee_id)
    return {"message": f"Statut mis à jour en {statut}"}


@router.get("/depenses/stats")
def stats_depenses(annee_id: Optional[int] = None, db: Session = Depends(get_db), etablissement_id: int = Depends(require_etablissement)):
    # Sans annee precisee, celle EN COURS DE CETTE ECOLE — et non
    # l'annee n°1, qui appartient a la premiere ecole inscrite.
    annee_id = resoudre_annee(db, etablissement_id, annee_id)
    # Meme perimetre que la liste : les salaires relevent du module Salaires.
    # Sans cette exclusion, le total des depenses et la liste affichee en
    # dessous ne diraient pas la meme chose.
    query_base = db.query(Depense).filter(
        Depense.etablissement_id == etablissement_id,
        Depense.annee_id == annee_id,
        Depense.statut != "REJETEE",
        func.upper(func.coalesce(Depense.categorie, "")) != "SALAIRES",
    )
    total = query_base.with_entities(func.coalesce(func.sum(Depense.montant), 0)).scalar()
    par_categorie = query_base.with_entities(
        Depense.categorie,
        func.sum(Depense.montant).label("total"),
        func.count(Depense.depense_id).label("nb"),
    ).group_by(Depense.categorie).order_by(func.sum(Depense.montant).desc()).all()

    total_valide = query_base.filter(Depense.statut == "VALIDE").with_entities(
        func.coalesce(func.sum(Depense.montant), 0)
    ).scalar()
    total_en_attente = query_base.filter(Depense.statut.in_(["EN_ATTENTE", "APPROUVEE"])).with_entities(
        func.coalesce(func.sum(Depense.montant), 0)
    ).scalar()

    return {
        "total_depenses": float(total),
        "total_valide": float(total_valide),
        "total_en_attente": float(total_en_attente),
        "par_categorie": [{"categorie": r.categorie, "total": float(r.total), "nb": r.nb} for r in par_categorie]
    }


# ============================================================================
# MODULE IMPAYÉS — Suivi avancé des retards et impayés
# ============================================================================

@router.get("/impayes")
def list_impayes(
    response: Response,
    annee_id: Optional[int] = None,
    classe_id: Optional[int] = None,
    statut: Optional[str] = None,
    type_frais_id: Optional[int] = None,
    search: Optional[str] = None,
    skip: int = 0,
    limit: int = 200,
    db: Session = Depends(get_db),
    etablissement_id: int = Depends(require_etablissement),
):
    """
    Tableau complet des impayés avec informations élève, classe et parent.
    Retourne les factures non-payées avec calcul des jours de retard.
    """
    # Sans annee precisee, celle EN COURS DE CETTE ECOLE — et non
    # l'annee n°1, qui appartient a la premiere ecole inscrite.
    annee_id = resoudre_annee(db, etablissement_id, annee_id)
    from datetime import date as today_type
    from app.models.academique import Parent, EleveParent, Niveau

    today = today_type.today()
    finance_settings = get_finance_settings(db, etablissement_id)

    query = (
        db.query(Facture, Eleve, Classe, Inscription, TypeFrais)
        .join(Inscription, Facture.inscription_id == Inscription.inscription_id)
        .join(Eleve, Inscription.eleve_id == Eleve.eleve_id)
        .join(Classe, Inscription.classe_id == Classe.classe_id)
        .outerjoin(TypeFrais, Facture.type_frais_id == TypeFrais.type_frais_id)
        .filter(
            Classe.etablissement_id == etablissement_id,
            Inscription.annee_id == annee_id,
            Facture.statut.in_(["EN_ATTENTE", "PARTIELLEMENT_PAYEE", "EN_RETARD"])
        )
    )

    if classe_id:
        query = query.filter(Classe.classe_id == classe_id)
    if statut:
        query = query.filter(Facture.statut == statut)
    if type_frais_id:
        query = query.filter(Facture.type_frais_id == type_frais_id)
    if search:
        like = f"%{search.strip()}%"
        query = query.filter(
            (Eleve.nom.ilike(like)) | (Eleve.prenom.ilike(like)) | (Eleve.matricule.ilike(like))
        )

    total = query.count()
    response.headers["X-Total-Count"] = str(total)

    results = query.order_by(Facture.montant_restant.desc(), Facture.facture_id).offset(skip).limit(limit).all()

    impayes = []
    for facture, eleve, classe, inscription, type_frais in results:
        # Récupérer le parent responsable financier
        lien_parent = (
            db.query(EleveParent, Parent)
            .join(Parent, EleveParent.parent_id == Parent.parent_id)
            .filter(EleveParent.eleve_id == eleve.eleve_id)
            .first()
        )

        # Récupérer l'échéance la plus ancienne en retard
        echeances = db.query(EcheanceFacture).filter(
            EcheanceFacture.facture_id == facture.facture_id,
            EcheanceFacture.statut.in_(["EN_ATTENTE", "PARTIELLEMENT_PAYEE"])
        ).order_by(EcheanceFacture.date_limite).all()

        # Calculer les jours de retard depuis l'échéance la plus ancienne ;
        # à défaut d'échéancier (facture à paiement unique, sans EcheanceFacture),
        # on retombe sur l'ancienneté depuis la date de facturation elle-même,
        # seule référence temporelle disponible sur ce type de facture.
        jours_retard = 0
        date_limite_proche = None
        if echeances:
            date_limite_proche = echeances[0].date_limite
            if date_limite_proche and date_limite_proche < today:
                jours_retard = (today - date_limite_proche).days
        elif facture.date_facture and facture.date_facture < today:
            date_limite_proche = facture.date_facture
            jours_retard = (today - facture.date_facture).days

        parent_nom = ""
        parent_tel = ""
        if lien_parent:
            _, parent = lien_parent
            parent_nom = f"{parent.prenom} {parent.nom}"
            parent_tel = parent.telephone_1

        montant_restant = float(facture.montant_restant or 0)
        penalite_estimee = calculer_penalite(montant_restant, jours_retard, finance_settings)

        impayes.append({
            "facture_id": facture.facture_id,
            "numero_facture": facture.numero_facture,
            "type_frais_libelle": type_frais.libelle if type_frais else "N/A",
            "eleve_id": eleve.eleve_id,
            "eleve_nom": eleve.nom,
            "eleve_prenom": eleve.prenom,
            "eleve_matricule": eleve.matricule,
            "eleve_telephone": eleve.telephone or "",
            "classe_id": classe.classe_id,
            "classe_nom": classe.libelle,
            "parent_nom": parent_nom,
            "parent_telephone": parent_tel,
            "montant_total": float(facture.montant_total or 0),
            "montant_paye": float(facture.montant_paye or 0),
            "montant_restant": montant_restant,
            "statut": facture.statut,
            "date_facture": str(facture.date_facture) if facture.date_facture else None,
            "date_limite": str(date_limite_proche) if date_limite_proche else None,
            "jours_retard": jours_retard,
            "penalite_estimee": penalite_estimee,
            "montant_du_avec_penalite": round(montant_restant + penalite_estimee, 2),
        })

    return impayes


@router.get("/retards")
def list_retards(
    annee_id: Optional[int] = None,
    classe_id: Optional[int] = None,
    niveau_id: Optional[int] = None,
    jours_min: int = 0,
    skip: int = 0,
    limit: int = 200,
    db: Session = Depends(get_db),
    etablissement_id: int = Depends(require_etablissement),
):
    """
    Liste des élèves en retard de paiement, classés par ancienneté du retard.
    Calcule le nombre de jours de retard pour chaque échéance dépassée.
    """
    # Sans annee precisee, celle EN COURS DE CETTE ECOLE — et non
    # l'annee n°1, qui appartient a la premiere ecole inscrite.
    annee_id = resoudre_annee(db, etablissement_id, annee_id)
    from datetime import date as today_type
    from app.models.academique import Niveau

    today = today_type.today()
    finance_settings = get_finance_settings(db, etablissement_id)

    query = (
        db.query(EcheanceFacture, Facture, Eleve, Classe)
        .join(Facture, EcheanceFacture.facture_id == Facture.facture_id)
        .join(Inscription, Facture.inscription_id == Inscription.inscription_id)
        .join(Eleve, Inscription.eleve_id == Eleve.eleve_id)
        .join(Classe, Inscription.classe_id == Classe.classe_id)
        .filter(
            Classe.etablissement_id == etablissement_id,
            Inscription.annee_id == annee_id,
            EcheanceFacture.statut.in_(["EN_ATTENTE", "PARTIELLEMENT_PAYEE"]),
            EcheanceFacture.date_limite < today
        )
    )

    if classe_id:
        query = query.filter(Classe.classe_id == classe_id)
    if niveau_id:
        query = query.filter(Classe.niveau_id == niveau_id)

    results = query.order_by(EcheanceFacture.date_limite).offset(skip).limit(limit).all()

    retards = []
    for echeance, facture, eleve, classe in results:
        jours_retard = (today - echeance.date_limite).days if echeance.date_limite else 0
        if jours_retard < jours_min:
            continue
        montant_restant = float(echeance.montant_attendu or 0) - float(echeance.montant_paye or 0)
        penalite_estimee = calculer_penalite(montant_restant, jours_retard, finance_settings)

        retards.append({
            "echeance_id": echeance.echeance_id,
            "facture_id": facture.facture_id,
            "numero_facture": facture.numero_facture,
            "eleve_id": eleve.eleve_id,
            "eleve_nom": eleve.nom,
            "eleve_prenom": eleve.prenom,
            "classe_id": classe.classe_id,
            "classe_nom": classe.libelle,
            "libelle_echeance": echeance.libelle,
            "date_limite": str(echeance.date_limite),
            "montant_attendu": float(echeance.montant_attendu or 0),
            "montant_paye": float(echeance.montant_paye or 0),
            "montant_restant": montant_restant,
            "jours_retard": jours_retard,
            "statut": echeance.statut,
            "penalite_estimee": penalite_estimee,
            "montant_du_avec_penalite": round(montant_restant + penalite_estimee, 2),
        })

    # Trier par jours de retard décroissant (plus ancien en premier)
    retards.sort(key=lambda x: x["jours_retard"], reverse=True)
    return retards


@router.get("/solvabilite")
def tableau_solvabilite(
    annee_id: Optional[int] = None,
    classe_id: Optional[int] = None,
    db: Session = Depends(get_db),
    etablissement_id: int = Depends(require_etablissement),
):
    """
    Tableau de solvabilité : évalue la situation financière de chaque élève.
    Indicateurs : SOLVABLE (100% payé), PARTIEL (>50%), NON_SOLVABLE (<50%), CRITIQUE (0%)
    """
    # Sans annee precisee, celle EN COURS DE CETTE ECOLE — et non
    # l'annee n°1, qui appartient a la premiere ecole inscrite.
    annee_id = resoudre_annee(db, etablissement_id, annee_id)
    query = (
        db.query(Eleve, Inscription, Classe)
        .join(Inscription, Eleve.eleve_id == Inscription.eleve_id)
        .join(Classe, Inscription.classe_id == Classe.classe_id)
        .filter(
            Classe.etablissement_id == etablissement_id,
            Inscription.annee_id == annee_id,
            Inscription.statut == "ACTIVE"
        )
    )
    if classe_id:
        query = query.filter(Classe.classe_id == classe_id)

    results = query.order_by(Eleve.nom, Eleve.prenom).all()

    # Précharge TOUTES les factures des inscriptions concernées en une seule
    # requête plutôt qu'une par élève dans la boucle ci-dessous — à l'échelle
    # réelle (5000 élèves), la version précédente prenait ~20s (mesuré),
    # dépassant le seuil de patience de l'utilisateur et parfois le timeout
    # axios (30s) selon la charge — voir la règle N+1 déjà établie sur ce
    # projet (mémoire : "ne jamais faire de requête DB dans une boucle").
    inscription_ids = [insc.inscription_id for _, insc, _ in results]
    factures_par_inscription: Dict[int, List[Facture]] = {}
    if inscription_ids:
        for f in db.query(Facture).filter(Facture.inscription_id.in_(inscription_ids)).all():
            factures_par_inscription.setdefault(f.inscription_id, []).append(f)

    solvabilite = []
    for eleve, inscription, classe in results:
        factures = factures_par_inscription.get(inscription.inscription_id, [])

        total_facture = sum(float(f.montant_net or 0) for f in factures)
        total_paye = sum(float(f.montant_paye or 0) for f in factures)
        total_restant = total_facture - total_paye

        if total_facture == 0:
            taux = 100
            indicateur = "AUCUNE_FACTURE"
        else:
            taux = round(total_paye / total_facture * 100, 1)
            if taux >= 100:
                indicateur = "SOLVABLE"
            elif taux >= 50:
                indicateur = "PARTIEL"
            elif taux > 0:
                indicateur = "NON_SOLVABLE"
            else:
                indicateur = "CRITIQUE"

        solvabilite.append({
            "eleve_id": eleve.eleve_id,
            "eleve_nom": eleve.nom,
            "eleve_prenom": eleve.prenom,
            "eleve_matricule": eleve.matricule,
            "classe_id": classe.classe_id,
            "classe_nom": classe.libelle,
            "total_facture": total_facture,
            "total_paye": total_paye,
            "total_restant": total_restant,
            "taux_paiement": taux,
            "indicateur": indicateur,
            "nb_factures": len(factures),
        })

    return solvabilite


@router.get("/solde-eleve/{eleve_id}")
def solde_eleve(eleve_id: int, annee_id: Optional[int] = None, db: Session = Depends(get_db), etablissement_id: int = Depends(require_etablissement)):
    """
    Solde financier en temps réel d'un élève avec historique complet des paiements.
    Vérifie que l'élève appartient à l'établissement appelant — avant le
    Lot 2, n'importe quel eleve_id deviné exposait ce solde financier complet.
    """
    # Sans annee precisee, celle EN COURS DE CETTE ECOLE — et non
    # l'annee n°1, qui appartient a la premiere ecole inscrite.
    annee_id = resoudre_annee(db, etablissement_id, annee_id)
    eleve = db.query(Eleve).filter(
        Eleve.eleve_id == eleve_id, Eleve.etablissement_id == etablissement_id
    ).first()
    if not eleve:
        raise HTTPException(status_code=404, detail="Élève non trouvé")

    inscriptions = db.query(Inscription).filter(
        Inscription.eleve_id == eleve_id,
        Inscription.annee_id == annee_id,
        Inscription.statut == "ACTIVE"
    ).all()

    total_facture = 0
    total_paye = 0
    factures_detail = []

    for inscription in inscriptions:
        factures = db.query(Facture).filter(
            Facture.inscription_id == inscription.inscription_id
        ).all()

        for facture in factures:
            total_facture += float(facture.montant_net or 0)
            total_paye += float(facture.montant_paye or 0)

            type_frais = None
            if facture.type_frais_id:
                type_frais = db.query(TypeFrais).filter(TypeFrais.type_frais_id == facture.type_frais_id).first()
            libelle_frais = type_frais.libelle if type_frais else "Frais Scolaires (Standard)"

            paiements = db.query(Paiement).filter(
                Paiement.facture_id == facture.facture_id,
                Paiement.statut == "VALIDE"
            ).order_by(Paiement.date_paiement.desc()).all()

            echeances = db.query(EcheanceFacture).filter(
                EcheanceFacture.facture_id == facture.facture_id
            ).all()

            factures_detail.append({
                "facture_id": facture.facture_id,
                "numero_facture": facture.numero_facture,
                "type_frais_libelle": libelle_frais,
                "montant_total": float(facture.montant_net or 0),
                "montant_paye": float(facture.montant_paye or 0),
                "montant_restant": float(facture.montant_restant or 0),
                "statut": facture.statut,
                "date_facture": str(facture.date_facture) if facture.date_facture else None,
                "echeances": [
                    {
                        "echeance_id": e.echeance_id,
                        "libelle": e.libelle,
                        "date_limite": str(e.date_limite),
                        "montant_attendu": float(e.montant_attendu or 0),
                        "montant_paye": float(e.montant_paye or 0),
                        "statut": e.statut
                    } for e in echeances
                ],
                "paiements": [
                    {
                        "paiement_id": p.paiement_id,
                        "numero_recu": p.numero_recu,
                        "date_paiement": str(p.date_paiement),
                        "montant": float(p.montant),
                        "mode_paiement": p.mode_paiement,
                    } for p in paiements
                ]
            })

    return {
        "eleve_id": eleve.eleve_id,
        "eleve_nom": eleve.nom,
        "eleve_prenom": eleve.prenom,
        "eleve_matricule": eleve.matricule,
        "total_facture": total_facture,
        "total_paye": total_paye,
        "total_restant": total_facture - total_paye,
        "taux_paiement": round(total_paye / total_facture * 100, 1) if total_facture > 0 else 0,
        "factures": factures_detail,
    }


@router.get("/dashboard")
def dashboard_financier(
    annee_id: Optional[int] = None,
    db: Session = Depends(get_db),
    etablissement_id: int = Depends(require_etablissement),
):
    """
    Tableau de bord financier complet avec KPIs, évolution mensuelle et répartition.

    Mis en cache dans Redis (TTL 60s) pour limiter la charge sur la base de
    données et rester réactif même en cas de connexion instable.
    """
    # Sans annee precisee, celle EN COURS DE CETTE ECOLE — et non
    # l'annee n°1, qui appartient a la premiere ecole inscrite.
    annee_id = resoudre_annee(db, etablissement_id, annee_id)
    from datetime import date as today_type, timedelta
    from sqlalchemy import extract
    from app.core.cache import cache_get, cache_set

    cache_key = f"dashboard:{etablissement_id}:{annee_id}"
    cached = cache_get(cache_key)
    if cached is not None:
        return cached

    today = today_type.today()

    # === KPIs de base ===
    query_base = (
        db.query(Facture)
        .join(Inscription, Facture.inscription_id == Inscription.inscription_id)
        .join(Classe, Inscription.classe_id == Classe.classe_id)
        .filter(Classe.etablissement_id == etablissement_id, Inscription.annee_id == annee_id)
    )

    total_facture = float(query_base.with_entities(func.coalesce(func.sum(Facture.montant_net), 0)).scalar())
    total_paye = float(query_base.with_entities(func.coalesce(func.sum(Facture.montant_paye), 0)).scalar())
    total_restant = float(query_base.with_entities(func.coalesce(func.sum(Facture.montant_restant), 0)).scalar())

    nb_impayes = query_base.filter(
        Facture.statut.in_(["EN_ATTENTE", "PARTIELLEMENT_PAYEE", "EN_RETARD"])
    ).count()
    nb_payees = query_base.filter(Facture.statut == "PAYEE").count()
    total_eleves = (
        db.query(func.count(Inscription.inscription_id))
        .join(Classe, Inscription.classe_id == Classe.classe_id)
        .filter(Classe.etablissement_id == etablissement_id, Inscription.annee_id == annee_id, Inscription.statut == "ACTIVE")
        .scalar()
    ) or 0

    taux_recouvrement = round(total_paye / total_facture * 100, 1) if total_facture > 0 else 0

    total_depenses = float(
        db.query(func.coalesce(func.sum(Depense.montant), 0))
        .filter(
            Depense.etablissement_id == etablissement_id,
            Depense.annee_id == annee_id,
            Depense.statut == "VALIDE"
        ).scalar()
    )
    solde_caisse = total_paye - total_depenses

    # === Revenus du jour / semaine / mois ===
    debut_semaine = today - timedelta(days=today.weekday())
    debut_mois = today.replace(day=1)
    debut_annee = today.replace(month=1, day=1)

    def sum_paiements_periode(date_debut: today_type):
        result = (
            db.query(func.coalesce(func.sum(Paiement.montant), 0))
            .join(Facture, Paiement.facture_id == Facture.facture_id)
            .join(Inscription, Facture.inscription_id == Inscription.inscription_id)
            .join(Classe, Inscription.classe_id == Classe.classe_id)
            .filter(
                Classe.etablissement_id == etablissement_id,
                Paiement.date_paiement >= date_debut,
                Paiement.statut == "VALIDE"
            ).scalar()
        )
        return float(result)

    revenus_jour = sum_paiements_periode(today)
    revenus_semaine = sum_paiements_periode(debut_semaine)
    revenus_mois = sum_paiements_periode(debut_mois)
    revenus_annee = sum_paiements_periode(debut_annee)

    def sum_depenses_periode(date_debut: today_type):
        result = (
            db.query(func.coalesce(func.sum(Depense.montant), 0))
            .filter(
                Depense.etablissement_id == etablissement_id,
                Depense.date_depense >= date_debut,
                Depense.statut == "VALIDE"
            ).scalar()
        )
        return float(result)

    debut_trimestre = today.replace(month=((today.month - 1) // 3) * 3 + 1, day=1)
    depenses_mois = sum_depenses_periode(debut_mois)
    revenus_trimestre = sum_paiements_periode(debut_trimestre)
    depenses_trimestre = sum_depenses_periode(debut_trimestre)

    # === Évolution mensuelle (12 derniers mois) ===
    evolution = []
    MOIS_LABELS = ["Jan", "Fév", "Mar", "Avr", "Mai", "Jun", "Jul", "Aoû", "Sep", "Oct", "Nov", "Déc"]
    for i in range(11, -1, -1):
        mois_date = (today.replace(day=1) - timedelta(days=i * 30))
        mois_num = mois_date.month
        annee_num = mois_date.year

        montant_mois = float(
            db.query(func.coalesce(func.sum(Paiement.montant), 0))
            .join(Facture, Paiement.facture_id == Facture.facture_id)
            .join(Inscription, Facture.inscription_id == Inscription.inscription_id)
            .join(Classe, Inscription.classe_id == Classe.classe_id)
            .filter(
                Classe.etablissement_id == etablissement_id,
                Inscription.annee_id == annee_id,
                extract("month", Paiement.date_paiement) == mois_num,
                extract("year", Paiement.date_paiement) == annee_num,
                Paiement.statut == "VALIDE"
            ).scalar()
        )

        facture_mois = float(
            db.query(func.coalesce(func.sum(Facture.montant_net), 0))
            .join(Inscription, Facture.inscription_id == Inscription.inscription_id)
            .join(Classe, Inscription.classe_id == Classe.classe_id)
            .filter(
                Classe.etablissement_id == etablissement_id,
                Inscription.annee_id == annee_id,
                extract("month", Facture.date_facture) == mois_num,
                extract("year", Facture.date_facture) == annee_num,
            ).scalar()
        )

        depense_mois_evo = float(
            db.query(func.coalesce(func.sum(Depense.montant), 0))
            .filter(
                Depense.etablissement_id == etablissement_id,
                Depense.annee_id == annee_id,
                Depense.statut == "VALIDE",
                extract("month", Depense.date_depense) == mois_num,
                extract("year", Depense.date_depense) == annee_num,
            ).scalar()
        )

        evolution.append({
            "mois": MOIS_LABELS[mois_num - 1],
            "encaisse": montant_mois,
            "facture": facture_mois,
            "depense": depense_mois_evo,
        })

    # === Répartition par classe ===
    repartition_classes = (
        db.query(
            Classe.libelle,
            func.coalesce(func.sum(Facture.montant_paye), 0).label("total_paye"),
            func.coalesce(func.sum(Facture.montant_restant), 0).label("total_restant"),
        )
        .join(Inscription, Classe.classe_id == Inscription.classe_id)
        .join(Facture, Inscription.inscription_id == Facture.inscription_id)
        .filter(Classe.etablissement_id == etablissement_id, Inscription.annee_id == annee_id)
        .group_by(Classe.libelle)
        .order_by(func.sum(Facture.montant_paye).desc())
        .limit(10)
        .all()
    )

    # === Répartition par mode de paiement ===
    repartition_modes = (
        db.query(
            Paiement.mode_paiement,
            func.count(Paiement.paiement_id).label("nb"),
            func.sum(Paiement.montant).label("total"),
        )
        .join(Facture, Paiement.facture_id == Facture.facture_id)
        .join(Inscription, Facture.inscription_id == Inscription.inscription_id)
        .join(Classe, Inscription.classe_id == Classe.classe_id)
        .filter(Classe.etablissement_id == etablissement_id, Inscription.annee_id == annee_id, Paiement.statut == "VALIDE")
        .group_by(Paiement.mode_paiement)
        .all()
    )

    nb_eleves_impayes = (
        query_base.filter(Facture.statut.in_(["EN_ATTENTE", "PARTIELLEMENT_PAYEE", "EN_RETARD"]))
        .with_entities(Inscription.eleve_id).distinct().count()
    )

    resultat = {
        "kpis": {
            "total_facture": total_facture,
            "total_paye": total_paye,
            "total_restant": total_restant,
            "taux_recouvrement": taux_recouvrement,
            "nb_impayes": nb_impayes,
            "nb_payees": nb_payees,
            "nb_eleves": total_eleves,
            "revenus_jour": revenus_jour,
            "revenus_semaine": revenus_semaine,
            "revenus_mois": revenus_mois,
            "revenus_annee": revenus_annee,
            "revenus_trimestre": revenus_trimestre,
            "total_depenses": total_depenses,
            "depenses_mois": depenses_mois,
            "depenses_trimestre": depenses_trimestre,
            "solde_caisse": solde_caisse,
            "nb_eleves_impayes": nb_eleves_impayes,
        },
        "evolution_mensuelle": evolution,
        "repartition_classes": [
            {"classe": r.libelle, "encaisse": float(r.total_paye), "restant": float(r.total_restant)}
            for r in repartition_classes
        ],
        "repartition_modes": [
            {"mode": r.mode_paiement, "nb": r.nb, "total": float(r.total)}
            for r in repartition_modes
        ],
    }

    cache_set(cache_key, resultat, ttl_seconds=60)
    return resultat


@router.get("/rapports/journalier")
def rapport_journalier(
    annee_id: Optional[int] = None,
    date_rapport: Optional[str] = None,
    db: Session = Depends(get_db),
    etablissement_id: int = Depends(require_etablissement),
):
    """Rapport financier journalier avec détail des paiements du jour."""
    # Sans annee precisee, celle EN COURS DE CETTE ECOLE — et non
    # l'annee n°1, qui appartient a la premiere ecole inscrite.
    annee_id = resoudre_annee(db, etablissement_id, annee_id)
    from datetime import date as today_type
    target_date = today_type.fromisoformat(date_rapport) if date_rapport else today_type.today()

    paiements = (
        db.query(Paiement, Facture, Eleve, Classe)
        .join(Facture, Paiement.facture_id == Facture.facture_id)
        .join(Inscription, Facture.inscription_id == Inscription.inscription_id)
        .join(Eleve, Inscription.eleve_id == Eleve.eleve_id)
        .join(Classe, Inscription.classe_id == Classe.classe_id)
        .filter(
            Classe.etablissement_id == etablissement_id,
            Paiement.date_paiement == target_date,
            Paiement.statut == "VALIDE"
        )
        .order_by(Paiement.created_date.desc())
        .all()
    )

    total_jour = sum(float(p.montant) for p, _, _, _ in paiements)

    return {
        "date": str(target_date),
        "total_encaisse": total_jour,
        "nb_paiements": len(paiements),
        "paiements": [
            {
                "numero_recu": p.numero_recu,
                "eleve_nom": f"{e.prenom} {e.nom}",
                "classe": c.libelle,
                "montant": float(p.montant),
                "mode_paiement": p.mode_paiement,
                "numero_facture": f.numero_facture,
            }
            for p, f, e, c in paiements
        ]
    }


@router.get("/rapports/mensuel")
def rapport_mensuel(
    annee_id: Optional[int] = None,
    mois: Optional[int] = None,
    annee: Optional[int] = None,
    db: Session = Depends(get_db),
    etablissement_id: int = Depends(require_etablissement),
):
    """Rapport financier mensuel avec KPIs et détail par classe."""
    # Sans annee precisee, celle EN COURS DE CETTE ECOLE — et non
    # l'annee n°1, qui appartient a la premiere ecole inscrite.
    annee_id = resoudre_annee(db, etablissement_id, annee_id)
    from datetime import date as today_type
    from sqlalchemy import extract

    today = today_type.today()
    mois_cible = mois or today.month
    annee_cible = annee or today.year

    query_pay = (
        db.query(Paiement, Facture, Eleve, Classe)
        .join(Facture, Paiement.facture_id == Facture.facture_id)
        .join(Inscription, Facture.inscription_id == Inscription.inscription_id)
        .join(Eleve, Inscription.eleve_id == Eleve.eleve_id)
        .join(Classe, Inscription.classe_id == Classe.classe_id)
        .filter(
            Classe.etablissement_id == etablissement_id,
            extract("month", Paiement.date_paiement) == mois_cible,
            extract("year", Paiement.date_paiement) == annee_cible,
            Paiement.statut == "VALIDE"
        )
    )

    paiements = query_pay.all()
    total_encaisse = sum(float(p.montant) for p, _, _, _ in paiements)

    # Par classe
    par_classe: dict = {}
    for p, f, e, c in paiements:
        nom_classe = c.libelle
        if nom_classe not in par_classe:
            par_classe[nom_classe] = {"classe": nom_classe, "encaisse": 0, "nb_paiements": 0}
        par_classe[nom_classe]["encaisse"] += float(p.montant)
        par_classe[nom_classe]["nb_paiements"] += 1

    # Impayés du mois
    query_impayes = (
        db.query(func.coalesce(func.sum(Facture.montant_restant), 0))
        .join(Inscription, Facture.inscription_id == Inscription.inscription_id)
        .join(Classe, Inscription.classe_id == Classe.classe_id)
        .filter(
            Classe.etablissement_id == etablissement_id,
            Inscription.annee_id == annee_id,
            Facture.statut.in_(["EN_ATTENTE", "PARTIELLEMENT_PAYEE", "EN_RETARD"])
        )
    )
    total_impayes = float(query_impayes.scalar())

    total_depenses = float((
        db.query(func.coalesce(func.sum(Depense.montant), 0))
        .filter(
            Depense.etablissement_id == etablissement_id,
            extract("month", Depense.date_depense) == mois_cible,
            extract("year", Depense.date_depense) == annee_cible,
            Depense.statut == "VALIDE"
        )
        .scalar() or 0
    ))

    MOIS_LABELS = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
                   "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"]

    return {
        "mois": MOIS_LABELS[mois_cible - 1],
        "annee": annee_cible,
        "total_encaisse": total_encaisse,
        "total_impayes": total_impayes,
        "total_depenses": total_depenses,
        "solde_final": total_encaisse - total_depenses,
        "nb_paiements": len(paiements),
        "par_classe": list(par_classe.values()),
        "paiements": [
            {
                "numero_recu": p.numero_recu,
                "eleve_nom": f"{e.prenom} {e.nom}",
                "classe": c.libelle,
                "montant": float(p.montant),
                "mode_paiement": p.mode_paiement,
                "date_paiement": str(p.date_paiement),
            }
            for p, f, e, c in paiements
        ]
    }


@router.get("/rapports/annuel")
def rapport_annuel(
    annee_id: Optional[int] = None,
    annee: Optional[int] = None,
    db: Session = Depends(get_db),
    etablissement_id: int = Depends(require_etablissement),
):
    """Rapport financier annuel : recettes, dépenses, masse salariale et résultat net.

    L'ANNÉE D'UNE ÉCOLE N'EST PAS L'ANNÉE DU CALENDRIER
    Ce rapport bornait sa période sur `extract("year", date_paiement) == 2025`,
    c'est-à-dire janvier à décembre. Or l'année scolaire va de septembre à
    juillet. Pour l'école qui clôturait son année 2025-2026, le « rapport
    annuel » additionnait donc septembre–décembre 2025 avec janvier–juillet
    2025 : la moitié de l'année en cours manquait, et la moitié affichée
    appartenait à l'année précédente. Le paramètre `annee_id` était bien résolu,
    puis jamais utilisé.

    La période suit désormais les dates de l'année scolaire de cette école.
    `annee` (millésime civil) reste accepté pour qui veut expressément un
    janvier–décembre : la période retenue est renvoyée dans la réponse, pour
    que l'écran affiche sur quoi porte le total.
    """
    from datetime import date as today_type

    from sqlalchemy import extract

    # Sans annee precisee, celle EN COURS DE CETTE ECOLE — et non
    # l'annee n°1, qui appartient a la premiere ecole inscrite.
    annee_id = resoudre_annee(db, etablissement_id, annee_id)

    debut = fin = None
    libelle_periode = None
    if annee is None and annee_id:
        scolaire = (
            db.query(AnneeScolaire)
            .filter(
                AnneeScolaire.annee_id == annee_id,
                AnneeScolaire.etablissement_id == etablissement_id,
            )
            .first()
        )
        if scolaire and scolaire.date_debut and scolaire.date_fin:
            debut, fin = scolaire.date_debut, scolaire.date_fin
            libelle_periode = scolaire.libelle

    today = today_type.today()
    annee_cible = annee or (debut.year if debut else today.year)

    if debut and fin:
        borne_paiement = (Paiement.date_paiement >= debut, Paiement.date_paiement <= fin)
        borne_depense = (Depense.date_depense >= debut, Depense.date_depense <= fin)
    else:
        # Repli : millésime civil demandé explicitement, ou année scolaire sans
        # dates renseignées.
        borne_paiement = (extract("year", Paiement.date_paiement) == annee_cible,)
        borne_depense = (extract("year", Depense.date_depense) == annee_cible,)
        libelle_periode = f"Année civile {annee_cible}"

    total_encaisse = float((
        db.query(func.coalesce(func.sum(Paiement.montant), 0))
        .join(Facture, Paiement.facture_id == Facture.facture_id)
        .join(Inscription, Facture.inscription_id == Inscription.inscription_id)
        .join(Classe, Inscription.classe_id == Classe.classe_id)
        .filter(
            Classe.etablissement_id == etablissement_id,
            *borne_paiement,
            Paiement.statut == "VALIDE"
        )
        .scalar() or 0
    ))

    query_dep = db.query(Depense).filter(
        Depense.etablissement_id == etablissement_id,
        *borne_depense,
        Depense.statut == "VALIDE"
    )
    total_depenses = float(
        query_dep.with_entities(func.coalesce(func.sum(Depense.montant), 0)).scalar() or 0
    )
    masse_salariale = float(
        query_dep.filter(Depense.categorie == "SALAIRES")
        .with_entities(func.coalesce(func.sum(Depense.montant), 0)).scalar() or 0
    )

    return {
        "annee": annee_cible,
        # Sur quoi porte réellement ce total — un rapport dont on ignore la
        # période n'est pas vérifiable.
        "periode_libelle": libelle_periode or f"Année civile {annee_cible}",
        "periode_debut": debut.isoformat() if debut else None,
        "periode_fin": fin.isoformat() if fin else None,
        "total_encaisse": total_encaisse,
        "total_depenses": total_depenses,
        "masse_salariale": masse_salariale,
        "solde_final": total_encaisse - total_depenses,
    }


@router.get("/avis-paiement/{facture_id}")
def avis_paiement(facture_id: int, db: Session = Depends(get_db), etablissement_id: int = Depends(require_etablissement)):
    """
    Données structurées pour générer un avis de paiement / reçu PDF.
    Contient toutes les informations nécessaires à l'impression.
    """
    from app.models.academique import Etablissement, Parent, EleveParent, Niveau

    facture = db.query(Facture).filter(Facture.facture_id == facture_id).first()
    if not facture:
        raise HTTPException(status_code=404, detail="Facture non trouvée")

    inscription = db.query(Inscription).filter(
        Inscription.inscription_id == facture.inscription_id
    ).first()
    if not inscription:
        raise HTTPException(status_code=404, detail="Inscription associée à cette facture introuvable")
    eleve = db.query(Eleve).filter(Eleve.eleve_id == inscription.eleve_id).first()
    classe = db.query(Classe).filter(Classe.classe_id == inscription.classe_id).first()
    if not eleve or not classe:
        raise HTTPException(status_code=404, detail="Élève ou classe associé(e) à cette facture introuvable")
    if classe.etablissement_id != etablissement_id:
        raise HTTPException(status_code=404, detail="Facture non trouvée")
    etablissement = db.query(Etablissement).filter(
        Etablissement.etablissement_id == classe.etablissement_id
    ).first()

    type_frais = None
    if facture.type_frais_id:
        type_frais = db.query(TypeFrais).filter(TypeFrais.type_frais_id == facture.type_frais_id).first()

    echeances = db.query(EcheanceFacture).filter(
        EcheanceFacture.facture_id == facture_id
    ).all()

    paiements = db.query(Paiement).filter(
        Paiement.facture_id == facture_id,
        Paiement.statut == "VALIDE"
    ).order_by(Paiement.date_paiement).all()

    lien_parent = (
        db.query(EleveParent, Parent)
        .join(Parent, EleveParent.parent_id == Parent.parent_id)
        .filter(EleveParent.eleve_id == eleve.eleve_id)
        .first()
    )
    parent_info = {}
    if lien_parent:
        _, parent = lien_parent
        parent_info = {
            "nom": f"{parent.prenom} {parent.nom}",
            "telephone": parent.telephone_1,
            "email": parent.email or "",
        }

    return {
        "facture": {
            "facture_id": facture.facture_id,
            "numero_facture": facture.numero_facture,
            "date_facture": str(facture.date_facture) if facture.date_facture else None,
            "montant_total": float(facture.montant_total or 0),
            "montant_net": float(facture.montant_net or 0),
            "montant_paye": float(facture.montant_paye or 0),
            "montant_restant": float(facture.montant_restant or 0),
            "statut": facture.statut,
            "type_frais": type_frais.libelle if type_frais else "Frais scolaires",
        },
        "eleve": {
            "eleve_id": eleve.eleve_id,
            "nom": eleve.nom,
            "prenom": eleve.prenom,
            "matricule": eleve.matricule,
            "classe": classe.libelle if classe else "",
        },
        "etablissement": {
            "nom": etablissement.nom if etablissement else "SmartSchool",
            "adresse": getattr(etablissement, "adresse", "") or "",
            "telephone": getattr(etablissement, "telephone", "") or "",
            "email": getattr(etablissement, "email", "") or "",
            "logo_url": getattr(etablissement, "logo_url", "") or "",
            "directeur": getattr(etablissement, "directeur", "") or "",
        },
        "parent": parent_info,
        "echeances": [
            {
                "echeance_id": e.echeance_id,
                "libelle": e.libelle,
                "date_limite": str(e.date_limite),
                "montant_attendu": float(e.montant_attendu or 0),
                "montant_paye": float(e.montant_paye or 0),
                "statut": e.statut,
            } for e in echeances
        ],
        "paiements": [
            {
                "paiement_id": p.paiement_id,
                "numero_recu": p.numero_recu,
                "date_paiement": str(p.date_paiement),
                "montant": float(p.montant),
                "mode_paiement": p.mode_paiement,
            } for p in paiements
        ]
    }


# ============================================================================
# RAPPELS AUTOMATIQUES — Configuration et notifications
# ============================================================================

# Stockage en mémoire (en production, utiliser une table BDD)
_rappels_config = {
    "actif": True,
    "avant_echeance_jours": [3, 7],
    "apres_echeance_jours": [1, 3, 7, 14],
    "canal": "SYSTEME",
    "message_template": "Cher(e) {parent_nom}, le paiement de {montant} GNF pour {eleve_nom} est attendu le {date_limite}. Merci de régulariser."
}


# La configuration des rappels vivait dans une variable Python globale
# (`_rappels_config`) : elle était donc PARTAGÉE par toutes les écoles — celle
# qui la modifiait la changeait pour tout le monde — et perdue à chaque
# redémarrage du serveur. Elle est désormais persistée par école, dans la table
# des paramètres, comme tous les autres réglages.

_CLE_RAPPELS = "finance.rappels"


def _lire_rappels(db: Session, etablissement_id: int) -> dict:
    from app.models.academique import ParametreEtablissement
    param = db.query(ParametreEtablissement).filter(
        ParametreEtablissement.etablissement_id == etablissement_id,
        ParametreEtablissement.cle == _CLE_RAPPELS,
    ).first()
    config = dict(_rappels_config)
    if param and param.valeur:
        try:
            config.update(json.loads(param.valeur))
        except (ValueError, TypeError):
            # Une valeur illisible ne doit pas empêcher l'écran de s'ouvrir :
            # on retombe sur les valeurs par défaut.
            pass
    return config


@router.get("/rappels/config")
def get_rappels_config(
    db: Session = Depends(get_db),
    etablissement_id: int = Depends(require_etablissement),
):
    """Configuration des rappels automatiques DE CETTE ÉCOLE."""
    return _lire_rappels(db, etablissement_id)


@router.post("/rappels/configurer")
def configurer_rappels(
    config: dict,
    db: Session = Depends(get_db),
    etablissement_id: int = Depends(require_etablissement),
):
    """Enregistre la configuration des rappels de cette école."""
    from app.models.academique import ParametreEtablissement

    fusionnee = _lire_rappels(db, etablissement_id)
    fusionnee.update(config or {})

    param = db.query(ParametreEtablissement).filter(
        ParametreEtablissement.etablissement_id == etablissement_id,
        ParametreEtablissement.cle == _CLE_RAPPELS,
    ).first()
    if param:
        param.valeur = json.dumps(fusionnee)
    else:
        db.add(ParametreEtablissement(
            etablissement_id=etablissement_id,
            categorie="FINANCE",
            cle=_CLE_RAPPELS,
            valeur=json.dumps(fusionnee),
            type_valeur="JSON",
        ))
    db.commit()
    return {"message": "Configuration des rappels mise à jour", "config": fusionnee}


@router.post("/communication/notifier-impayes")
def notifier_impayes(
    annee_id: Optional[int] = None,
    db: Session = Depends(get_db),
    etablissement_id: int = Depends(require_etablissement),
):
    """
    Déclenche l'envoi de notifications groupées aux parents des élèves en retard.
    Prépare les messages (canal SYSTEME pour l'instant, extensible SMS/Email).
    """
    # Sans annee precisee, celle EN COURS DE CETTE ECOLE — et non
    # l'annee n°1, qui appartient a la premiere ecole inscrite.
    annee_id = resoudre_annee(db, etablissement_id, annee_id)
    from app.models.academique import Parent, EleveParent, Message
    from datetime import date as today_type

    if not _rappels_config.get("actif", True):
        raise HTTPException(
            status_code=400,
            detail="Les rappels automatiques sont désactivés dans la configuration. Activez-les avant d'envoyer."
        )

    today = today_type.today()
    template = _rappels_config.get("message_template") or (
        "Cher(e) {parent_nom}, le paiement de {montant} GNF pour {eleve_nom} est attendu le {date_limite}. Merci de régulariser."
    )

    # Récupérer tous les impayés actifs
    impayes = (
        db.query(Facture, Eleve, Classe)
        .join(Inscription, Facture.inscription_id == Inscription.inscription_id)
        .join(Eleve, Inscription.eleve_id == Eleve.eleve_id)
        .join(Classe, Inscription.classe_id == Classe.classe_id)
        .filter(
            Classe.etablissement_id == etablissement_id,
            Inscription.annee_id == annee_id,
            Facture.statut.in_(["EN_ATTENTE", "PARTIELLEMENT_PAYEE", "EN_RETARD"])
        )
        .all()
    )

    notifies = 0
    for facture, eleve, classe in impayes:
        lien = (
            db.query(EleveParent, Parent)
            .join(Parent, EleveParent.parent_id == Parent.parent_id)
            .filter(EleveParent.eleve_id == eleve.eleve_id)
            .first()
        )
        if lien:
            _, parent = lien
            echeance = (
                db.query(EcheanceFacture)
                .filter(EcheanceFacture.facture_id == facture.facture_id, EcheanceFacture.statut.in_(["EN_ATTENTE", "PARTIELLEMENT_PAYEE"]))
                .order_by(EcheanceFacture.date_limite)
                .first()
            )
            date_limite = str(echeance.date_limite) if echeance and echeance.date_limite else str(today)
            contenu = template.format(
                parent_nom=f"{parent.prenom} {parent.nom}",
                montant=f"{float(facture.montant_restant or 0):,.0f}",
                eleve_nom=f"{eleve.prenom} {eleve.nom}",
                date_limite=date_limite,
            )
            # Créer un message de notification dans le système (seul canal réellement
            # implémenté pour l'instant ; SMS/Email nécessiteraient une intégration
            # opérateur dédiée, hors périmètre de cette correction)
            message = Message(
                etablissement_id=etablissement_id,
                expediteur_type="ADMIN",
                destinataire_type="PARENT",
                destinataire_id=parent.parent_id,
                objet_type="PAIEMENT",
                sujet=f"Rappel de paiement — {eleve.prenom} {eleve.nom}",
                contenu=contenu,
                statut="ENVOYE",
            )
            db.add(message)
            notifies += 1

    db.commit()
    return {
        "message": f"{notifies} notification(s) envoyée(s) aux parents",
        "nb_notifies": notifies,
        "nb_impayes": len(impayes)
    }


# ============================================================================
# REÇU — Détail JSON pour affichage/impression à l'écran (voir aussi
# /paiements/{id}/recu-pdf ci-dessous pour le téléchargement PDF)
# ============================================================================

@router.get("/recu/{paiement_id}")
def get_recu(paiement_id: int, db: Session = Depends(get_db), etablissement_id: int = Depends(require_etablissement)):
    """Détail complet d'un reçu de paiement pour affichage/impression écran."""
    from app.models.academique import Etablissement, Parent, EleveParent

    result = (
        db.query(Paiement, Facture, Inscription, Eleve, Classe)
        .join(Facture, Paiement.facture_id == Facture.facture_id)
        .join(Inscription, Facture.inscription_id == Inscription.inscription_id)
        .join(Eleve, Inscription.eleve_id == Eleve.eleve_id)
        .join(Classe, Inscription.classe_id == Classe.classe_id)
        .filter(Paiement.paiement_id == paiement_id, Classe.etablissement_id == etablissement_id)
        .first()
    )
    if not result:
        raise HTTPException(status_code=404, detail="Paiement non trouvé")

    paiement, facture, inscription, eleve, classe = result

    type_frais = None
    if facture.type_frais_id:
        type_frais = db.query(TypeFrais).filter(TypeFrais.type_frais_id == facture.type_frais_id).first()

    etablissement = db.query(Etablissement).filter(Etablissement.etablissement_id == classe.etablissement_id).first()

    lien_parent = (
        db.query(Parent)
        .join(EleveParent, EleveParent.parent_id == Parent.parent_id)
        .filter(EleveParent.eleve_id == eleve.eleve_id)
        .first()
    )

    historique = (
        db.query(Paiement)
        .filter(Paiement.facture_id == facture.facture_id, Paiement.statut == "VALIDE")
        .order_by(Paiement.date_paiement.desc())
        .all()
    )

    return {
        "recu": {
            "numero_recu": paiement.numero_recu,
            "date_paiement": str(paiement.date_paiement) if paiement.date_paiement else None,
            "montant": float(paiement.montant),
            "mode_paiement": paiement.mode_paiement,
            "reference_externe": paiement.reference_externe,
            "devise": paiement.devise or "GNF",
        },
        "facture": {
            "facture_id": facture.facture_id,
            "numero_facture": facture.numero_facture,
            "montant_total": float(facture.montant_net or 0),
            "montant_paye": float(facture.montant_paye or 0),
            "montant_restant": float(facture.montant_restant or 0),
            "statut": facture.statut,
            "type_frais": type_frais.libelle if type_frais else "Frais Scolaires (Standard)",
        },
        "eleve": {
            "eleve_id": eleve.eleve_id,
            "nom": eleve.nom,
            "prenom": eleve.prenom,
            "matricule": eleve.matricule,
            "classe": classe.libelle,
        },
        "etablissement": {
            "nom": etablissement.nom if etablissement else "SmartSchool",
            "adresse": (etablissement.adresse if etablissement else "") or "",
            "telephone": (etablissement.telephone if etablissement else "") or "",
            "email": (etablissement.email if etablissement else "") or "",
            "directeur": (etablissement.directeur if etablissement else "") or "",
        },
        "parent": {
            "nom": f"{lien_parent.prenom} {lien_parent.nom}" if lien_parent else None,
            "telephone": lien_parent.telephone_1 if lien_parent else None,
        },
        "historique_paiements": [
            {
                "numero_recu": p.numero_recu,
                "date_paiement": str(p.date_paiement) if p.date_paiement else None,
                "montant": float(p.montant),
                "mode_paiement": p.mode_paiement,
            }
            for p in historique
        ],
    }


# ============================================================================
# REÇU PDF — Génération de reçu de paiement au format PDF
# ============================================================================

@router.get("/paiements/{paiement_id}/recu-pdf")
def generer_recu_pdf(paiement_id: int, db: Session = Depends(get_db), etablissement_id: int = Depends(require_etablissement)):
    """Génère un reçu de paiement au format PDF et le retourne en téléchargement."""
    from reportlab.lib.pagesizes import A4
    from reportlab.pdfgen import canvas
    from reportlab.lib.units import cm, mm
    from fastapi.responses import StreamingResponse
    from app.models.academique import Etablissement
    import io
    from datetime import date as today_type

    # Récupérer le paiement avec toutes les jointures nécessaires
    result = (
        db.query(Paiement, Facture, Inscription, Eleve, Classe)
        .join(Facture, Paiement.facture_id == Facture.facture_id)
        .join(Inscription, Facture.inscription_id == Inscription.inscription_id)
        .join(Eleve, Inscription.eleve_id == Eleve.eleve_id)
        .join(Classe, Inscription.classe_id == Classe.classe_id)
        .filter(Paiement.paiement_id == paiement_id, Classe.etablissement_id == etablissement_id)
        .first()
    )

    if not result:
        raise HTTPException(status_code=404, detail="Paiement non trouvé")

    paiement, facture, inscription, eleve, classe = result

    # Récupérer l'établissement
    etablissement = db.query(Etablissement).filter(
        Etablissement.etablissement_id == classe.etablissement_id
    ).first()

    nom_ecole = etablissement.nom if etablissement else "SmartSchool"
    adresse_ecole = getattr(etablissement, "adresse", "") or ""
    tel_ecole = getattr(etablissement, "telephone", "") or ""
    email_ecole = getattr(etablissement, "email", "") or ""

    # Type de frais concerné par ce paiement — sans ça, le reçu affiche un
    # montant sans jamais préciser à quoi il correspond (scolarité, cantine...).
    type_frais_recu = None
    if facture.type_frais_id:
        type_frais_recu = db.query(TypeFrais).filter(TypeFrais.type_frais_id == facture.type_frais_id).first()
    libelle_type_frais = type_frais_recu.libelle if type_frais_recu else "Frais Scolaires (Standard)"

    # Numéro de tranche : position de l'échéance réglée par CE paiement parmi
    # toutes les échéances de la facture (permet d'indiquer "Tranche 2 sur 3",
    # utile pour les parents qui paient en plusieurs fois).
    tranche_info = None
    if paiement.echeance_id:
        echeances_facture = (
            db.query(EcheanceFacture)
            .filter(EcheanceFacture.facture_id == facture.facture_id)
            .order_by(EcheanceFacture.date_limite.asc(), EcheanceFacture.echeance_id.asc())
            .all()
        )
        for idx, ech in enumerate(echeances_facture, start=1):
            if ech.echeance_id == paiement.echeance_id:
                tranche_info = (idx, len(echeances_facture), ech.libelle)
                break

    # Historique des règlements déjà effectués sur cette facture AVANT ce
    # paiement-ci — affiché en récapitulatif quand ce n'est pas le tout premier
    # versement, pour que le reçu de la dernière tranche retrace bien toutes
    # les tranches précédentes (dates + montants), pas seulement la dernière.
    historique_anterieur = (
        db.query(Paiement)
        .filter(
            Paiement.facture_id == facture.facture_id,
            Paiement.statut == "VALIDE",
            Paiement.paiement_id != paiement.paiement_id,
        )
        .order_by(Paiement.date_paiement.asc(), Paiement.paiement_id.asc())
        .all()
    )

    # Créer le buffer PDF
    buffer = io.BytesIO()
    pdf = canvas.Canvas(buffer, pagesize=A4)
    largeur, hauteur = A4

    # === En-tête : informations de l'établissement ===
    y = hauteur - 2 * cm

    # Logo de l'école — lit le même réglage que les bulletins
    # (documents.entete_logo) et le fichier réellement uploadé
    # (Etablissement.logo_url), au lieu d'un rectangle "LOGO" statique.
    from app.core.documents_settings import get_documents_settings, dessiner_filigrane, _bool
    doc_settings = get_documents_settings(db, classe.etablissement_id)
    logo_dessine = False
    if _bool(doc_settings.get("documents.entete_logo", "true")) and etablissement and getattr(etablissement, "logo_url", None):
        backend_root = os.path.dirname(os.path.dirname(os.path.dirname(__file__)))
        logo_path = os.path.join(backend_root, etablissement.logo_url.lstrip("/").replace("/", os.sep))
        if os.path.isfile(logo_path):
            try:
                from reportlab.lib.utils import ImageReader
                pdf.drawImage(
                    ImageReader(logo_path), 2 * cm, y - 1.7 * cm, width=2.5 * cm, height=2.2 * cm,
                    preserveAspectRatio=True, mask='auto', anchor='c'
                )
                logo_dessine = True
            except Exception:
                logo_dessine = False
    if not logo_dessine:
        pdf.setStrokeColorRGB(0.7, 0.7, 0.7)
        pdf.rect(2 * cm, y - 1.5 * cm, 2.5 * cm, 2 * cm)
        pdf.setFont("Helvetica", 8)
        pdf.drawCentredString(3.25 * cm, y - 0.7 * cm, "LOGO")

    # Nom de l'école
    pdf.setFont("Helvetica-Bold", 16)
    pdf.drawCentredString(largeur / 2, y, nom_ecole)
    y -= 0.6 * cm
    pdf.setFont("Helvetica", 9)
    if adresse_ecole:
        pdf.drawCentredString(largeur / 2, y, adresse_ecole)
        y -= 0.4 * cm
    if tel_ecole or email_ecole:
        contact = f"Tél: {tel_ecole}" if tel_ecole else ""
        if email_ecole:
            contact += f"  |  Email: {email_ecole}" if contact else f"Email: {email_ecole}"
        pdf.drawCentredString(largeur / 2, y, contact)
        y -= 0.4 * cm

    # Ligne de séparation
    y -= 0.5 * cm
    pdf.setLineWidth(1.5)
    pdf.setStrokeColorRGB(0.2, 0.4, 0.8)
    pdf.line(2 * cm, y, largeur - 2 * cm, y)

    # === Titre du reçu ===
    y -= 1.2 * cm
    pdf.setFont("Helvetica-Bold", 18)
    pdf.drawCentredString(largeur / 2, y, "REÇU DE PAIEMENT")

    # Numéro de reçu
    y -= 0.8 * cm
    pdf.setFont("Helvetica-Bold", 11)
    pdf.drawCentredString(largeur / 2, y, f"N° {paiement.numero_recu}")

    # === Informations de l'élève ===
    y -= 1.5 * cm
    pdf.setFont("Helvetica-Bold", 11)
    pdf.drawString(2 * cm, y, "INFORMATIONS DE L'ÉLÈVE")
    y -= 0.2 * cm
    pdf.setLineWidth(0.5)
    pdf.setStrokeColorRGB(0.5, 0.5, 0.5)
    pdf.line(2 * cm, y, largeur - 2 * cm, y)

    y -= 0.6 * cm
    pdf.setFont("Helvetica", 10)
    pdf.drawString(2.5 * cm, y, f"Nom complet :  {eleve.prenom} {eleve.nom}")
    y -= 0.5 * cm
    pdf.drawString(2.5 * cm, y, f"Matricule :  {eleve.matricule or 'N/A'}")
    y -= 0.5 * cm
    pdf.drawString(2.5 * cm, y, f"Classe :  {classe.libelle}")

    # === Détails du paiement ===
    y -= 1.2 * cm
    pdf.setFont("Helvetica-Bold", 11)
    pdf.drawString(2 * cm, y, "DÉTAILS DU PAIEMENT")
    y -= 0.2 * cm
    pdf.line(2 * cm, y, largeur - 2 * cm, y)

    y -= 0.6 * cm
    pdf.setFont("Helvetica", 10)
    pdf.drawString(2.5 * cm, y, f"Motif :  {libelle_type_frais}")
    y -= 0.5 * cm
    pdf.drawString(2.5 * cm, y, f"Montant payé :  {float(paiement.montant):,.0f} GNF")
    y -= 0.5 * cm
    pdf.drawString(2.5 * cm, y, f"Mode de paiement :  {paiement.mode_paiement or 'N/A'}")
    y -= 0.5 * cm
    date_str = str(paiement.date_paiement) if paiement.date_paiement else str(today_type.today())
    pdf.drawString(2.5 * cm, y, f"Date du paiement :  {date_str}")
    y -= 0.5 * cm
    pdf.drawString(2.5 * cm, y, f"Référence :  {paiement.reference_externe or 'N/A'}")
    y -= 0.5 * cm
    pdf.drawString(2.5 * cm, y, f"Devise :  {paiement.devise or 'GNF'}")
    if tranche_info:
        idx, total, libelle_echeance = tranche_info
        y -= 0.5 * cm
        suffixe = " — dernière tranche" if idx == total else ""
        pdf.drawString(2.5 * cm, y, f"Tranche :  {idx} sur {total} ({libelle_echeance}){suffixe}")

    # === Informations de la facture ===
    y -= 1.2 * cm
    pdf.setFont("Helvetica-Bold", 11)
    pdf.drawString(2 * cm, y, "INFORMATIONS DE LA FACTURE")
    y -= 0.2 * cm
    pdf.line(2 * cm, y, largeur - 2 * cm, y)

    y -= 0.6 * cm
    pdf.setFont("Helvetica", 10)
    pdf.drawString(2.5 * cm, y, f"N° Facture :  {facture.numero_facture}")
    y -= 0.5 * cm
    pdf.drawString(2.5 * cm, y, f"Montant total :  {float(facture.montant_total or 0):,.0f} GNF")
    y -= 0.5 * cm
    pdf.drawString(2.5 * cm, y, f"Total payé :  {float(facture.montant_paye or 0):,.0f} GNF")
    y -= 0.5 * cm
    pdf.drawString(2.5 * cm, y, f"Reste à payer :  {float(facture.montant_restant or 0):,.0f} GNF")
    y -= 0.5 * cm
    pdf.drawString(2.5 * cm, y, f"Statut facture :  {facture.statut}")

    # === Historique des règlements antérieurs sur cette facture ===
    # Affiché dès que ce n'est pas le tout premier versement — utile en
    # particulier pour le reçu de la dernière tranche, qui doit retracer
    # toutes les tranches déjà réglées (dates + montants), pas seulement
    # celle-ci.
    if historique_anterieur:
        y -= 1.2 * cm
        pdf.setFont("Helvetica-Bold", 11)
        pdf.drawString(2 * cm, y, "RÈGLEMENTS ANTÉRIEURS SUR CETTE FACTURE")
        y -= 0.2 * cm
        pdf.line(2 * cm, y, largeur - 2 * cm, y)

        y -= 0.55 * cm
        pdf.setFont("Helvetica", 9)
        # Limité aux 6 derniers pour rester sur une page (reçu simple, pas de pagination).
        entries = historique_anterieur[-6:]
        if len(historique_anterieur) > len(entries):
            pdf.drawString(2.5 * cm, y, f"({len(historique_anterieur) - len(entries)} règlement(s) antérieur(s) supplémentaire(s) non affiché(s) ici)")
            y -= 0.45 * cm
        for h in entries:
            h_date = str(h.date_paiement) if h.date_paiement else ""
            pdf.drawString(2.5 * cm, y, f"{h_date}  —  {float(h.montant):,.0f} GNF  ({h.mode_paiement or 'N/A'}, reçu N° {h.numero_recu})")
            y -= 0.45 * cm

    # === Pied de page : date et signature ===
    y -= 2 * cm
    pdf.setLineWidth(1)
    pdf.setStrokeColorRGB(0.2, 0.4, 0.8)
    pdf.line(2 * cm, y, largeur - 2 * cm, y)

    y -= 0.8 * cm
    pdf.setFont("Helvetica", 9)
    pdf.drawString(2 * cm, y, f"Date d'émission : {today_type.today().strftime('%d/%m/%Y')}")
    pdf.drawRightString(largeur - 2 * cm, y, "Signature et cachet")

    y -= 1.5 * cm
    pdf.setFont("Helvetica-Oblique", 8)
    pdf.drawCentredString(largeur / 2, y, "Ce reçu est généré automatiquement par SmartSchool. Conservez-le pour vos archives.")

    # === Filigrane ===
    if _bool(doc_settings.get("documents.filigrane_recus", "false")):
        dessiner_filigrane(pdf, largeur, hauteur, doc_settings)

    # Finaliser le PDF
    pdf.showPage()
    pdf.save()
    buffer.seek(0)

    # Retourner le PDF en téléchargement
    filename = f"recu_{paiement.numero_recu}.pdf"
    return StreamingResponse(
        buffer,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


# ============================================================================
# FOURNISSEURS — Liste des fournisseurs avec totaux
# ============================================================================

@router.get("/fournisseurs")
def list_fournisseurs(
    annee_id: Optional[int] = None,
    db: Session = Depends(get_db),
    etablissement_id: int = Depends(require_etablissement),
):
    """Retourne la liste des fournisseurs uniques avec le total des dépenses et le nombre de transactions."""
    # Sans annee precisee, celle EN COURS DE CETTE ECOLE — et non
    # l'annee n°1, qui appartient a la premiere ecole inscrite.
    annee_id = resoudre_annee(db, etablissement_id, annee_id)
    results = (
        db.query(
            Depense.fournisseur,
            func.coalesce(func.sum(Depense.montant), 0).label("total_depenses"),
            func.count(Depense.depense_id).label("nb_transactions"),
        )
        .filter(
            Depense.etablissement_id == etablissement_id,
            Depense.annee_id == annee_id,
            Depense.fournisseur.isnot(None),
            Depense.fournisseur != ""
        )
        .group_by(Depense.fournisseur)
        .order_by(func.sum(Depense.montant).desc())
        .all()
    )

    return [
        {
            "fournisseur": r.fournisseur,
            "total_depenses": float(r.total_depenses),
            "nb_transactions": r.nb_transactions,
        }
        for r in results
    ]


# ============================================================================
# RÈGLEMENTS FOURNISSEURS — Créer un paiement fournisseur (dépense)
# ============================================================================

@router.post("/reglements-fournisseurs", status_code=201)
def creer_reglement_fournisseur(
    data: dict,
    db: Session = Depends(get_db),
    etablissement_id: int = Depends(require_etablissement),
):
    """
    Crée un décaissement (dépense) de n'importe quelle catégorie.
    Champs attendus : categorie, fournisseur (optionnel), montant, description,
                       reference, mode_paiement, beneficiaire, annee_id (optionnel, défaut 1).
    L'établissement est toujours dérivé du compte authentifié, jamais du body
    (avant le Lot 2, un champ `etablissement_id` optionnel dans le body,
    défaulté à 1, permettait à n'importe quel client de choisir librement
    l'école propriétaire du décaissement créé).
    """
    CATEGORIES_VALIDES = [
        'FOURNISSEUR', 'SALAIRES', 'FOURNITURES', 'MAINTENANCE',
        'EQUIPEMENT', 'TRANSPORT', 'COMMUNICATION', 'AUTRE'
    ]

    categorie = data.get("categorie", "FOURNITURES").upper()
    if categorie not in CATEGORIES_VALIDES:
        categorie = "AUTRE"

    montant = data.get("montant")
    if not montant or float(montant) <= 0:
        raise HTTPException(status_code=400, detail="Le montant doit être supérieur à 0")

    description = data.get("description", "")
    reference = data.get("reference", "")
    fournisseur = data.get("fournisseur") or data.get("beneficiaire") or ""
    annee_id = data.get("annee_id", 1)
    classe_id = data.get("classe_id") or None
    eleve_id = data.get("eleve_id") or None

    # Un axe analytique (classe/élève) référencé doit appartenir à CET
    # établissement — jamais accepté aveuglément depuis le body.
    if classe_id and not db.query(Classe.classe_id).filter(
        Classe.classe_id == classe_id, Classe.etablissement_id == etablissement_id
    ).first():
        raise HTTPException(status_code=403, detail="Classe invalide pour cet établissement")
    if eleve_id and not db.query(Eleve.eleve_id).filter(
        Eleve.eleve_id == eleve_id, Eleve.etablissement_id == etablissement_id
    ).first():
        raise HTTPException(status_code=403, detail="Élève invalide pour cet établissement")

    libelle = description[:300] if description else f"Décaissement {categorie}"

    dep = Depense(
        etablissement_id=etablissement_id,
        annee_id=annee_id,
        categorie=categorie,
        libelle=libelle,
        montant=float(montant),
        fournisseur=fournisseur,
        reference=reference[:150] if reference else None,
        statut="EN_ATTENTE",
        mode_paiement=data.get("mode_paiement") or None,
        facture_url=data.get("facture_url") or None,
        source_fonds=data.get("source_fonds") or None,
        classe_id=classe_id,
        eleve_id=eleve_id,
        departement=data.get("departement") or None,
    )
    db.add(dep)
    db.commit()
    db.refresh(dep)
    _invalidate_dashboard_cache(etablissement_id, annee_id)

    return {
        "depense_id": dep.depense_id,
        "fournisseur": dep.fournisseur,
        "reference": dep.reference,
        "montant": float(dep.montant),
        "categorie": dep.categorie,
        "statut": dep.statut,
        "message": f"Décaissement '{categorie}' créé avec succès"
    }


@router.put("/depenses/{depense_id}/valider")
def valider_depense(depense_id: int, db: Session = Depends(get_db), etablissement_id: int = Depends(require_etablissement)):
    """
    Valide une dépense (décaissement) qui était EN_ATTENTE.
    """
    dep = db.query(Depense).filter(
        Depense.depense_id == depense_id, Depense.etablissement_id == etablissement_id
    ).first()
    if not dep:
        raise HTTPException(status_code=404, detail="Dépense non trouvée")

    _verifier_annee_modifiable(db, dep.annee_id)

    if dep.statut == "VALIDE":
        raise HTTPException(status_code=400, detail="Cette dépense est déjà validée")

    dep.statut = "VALIDE"

    # Comptabilité générale : sortie de fonds réelle (Debit charge / Credit Banque)
    compte_charge = compte_charge_pour_categorie(dep.categorie)
    generer_ecriture_auto(
        db, date_ecriture=date_type.today(), journal_code="OD",
        libelle=f"Dépense validée — {dep.libelle}",
        reference=dep.reference or f"DEP-{dep.depense_id}",
        lignes=[
            {"compte": compte_charge, "debit": float(dep.montant), "credit": 0, "description": dep.libelle},
            {"compte": COMPTE_BANQUE, "debit": 0, "credit": float(dep.montant), "description": dep.libelle},
        ],
        etablissement_id=dep.etablissement_id,
    )

    db.commit()
    db.refresh(dep)
    _invalidate_dashboard_cache(etablissement_id, dep.annee_id)

    return {"message": "Dépense validée avec succès", "depense_id": dep.depense_id, "statut": dep.statut}


# ============================================================================
# DÉCAISSEMENTS — Vue consolidée des sorties de fonds
# ============================================================================

@router.get("/decaissements")
def list_decaissements(
    response: Response,
    annee_id: Optional[int] = None,
    date_debut: Optional[str] = None,
    date_fin: Optional[str] = None,
    categorie: Optional[str] = None,
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    etablissement_id: int = Depends(require_etablissement),
):
    """
    Vue consolidée de toutes les sorties de fonds (dépenses).
    Retourne les transactions détaillées et un résumé par catégorie.
    """
    # Sans annee precisee, celle EN COURS DE CETTE ECOLE — et non
    # l'annee n°1, qui appartient a la premiere ecole inscrite.
    annee_id = resoudre_annee(db, etablissement_id, annee_id)
    from datetime import date as today_type

    query = db.query(Depense).filter(
        Depense.etablissement_id == etablissement_id,
        Depense.annee_id == annee_id
    )

    # Filtres optionnels
    if date_debut:
        query = query.filter(Depense.date_depense >= today_type.fromisoformat(date_debut))
    if date_fin:
        query = query.filter(Depense.date_depense <= today_type.fromisoformat(date_fin))
    if categorie:
        query = query.filter(Depense.categorie == categorie)

    total = query.count()
    response.headers["X-Total-Count"] = str(total)

    # Récupérer les transactions
    transactions = query.order_by(Depense.date_depense.desc()).offset(skip).limit(limit).all()

    # Calculer les totaux par catégorie (sur la même base filtrée, sans pagination)
    query_totaux = db.query(
        Depense.categorie,
        func.coalesce(func.sum(Depense.montant), 0).label("total"),
        func.count(Depense.depense_id).label("nb"),
    ).filter(
        Depense.etablissement_id == etablissement_id,
        Depense.annee_id == annee_id
    )
    if date_debut:
        query_totaux = query_totaux.filter(Depense.date_depense >= today_type.fromisoformat(date_debut))
    if date_fin:
        query_totaux = query_totaux.filter(Depense.date_depense <= today_type.fromisoformat(date_fin))
    if categorie:
        query_totaux = query_totaux.filter(Depense.categorie == categorie)

    totaux_par_categorie = query_totaux.group_by(Depense.categorie).all()

    # Total général
    total_general = sum(float(r.total) for r in totaux_par_categorie)

    return {
        "total_general": total_general,
        "par_categorie": [
            {"categorie": r.categorie, "total": float(r.total), "nb_transactions": r.nb}
            for r in totaux_par_categorie
        ],
        "transactions": [
            {
                "depense_id": d.depense_id,
                "categorie": d.categorie,
                "description": d.libelle,
                "montant": float(d.montant or 0),
                "date_depense": str(d.date_depense) if d.date_depense else None,
                "fournisseur": d.fournisseur or "",
                "reference": d.reference or "",
                "statut": d.statut,
            }
            for d in transactions
        ],
    }


# ============================================================================
# ANNULATION DE PAIEMENT — Annuler un paiement et reverser les montants
# ============================================================================

@router.put("/paiements/{paiement_id}/annuler")
def annuler_paiement(
    paiement_id: int,
    data: dict,
    db: Session = Depends(get_db),
    etablissement_id: int = Depends(require_etablissement),
):
    """
    Annule un paiement et reverse les montants sur la facture et l'échéance associée.
    Champs attendus : motif (raison de l'annulation).
    """
    motif = data.get("motif", "")
    if not motif:
        raise HTTPException(status_code=400, detail="Le motif d'annulation est obligatoire")

    # Récupérer le paiement
    paiement = db.query(Paiement).filter(Paiement.paiement_id == paiement_id).first()
    if not paiement:
        raise HTTPException(status_code=404, detail="Paiement non trouvé")

    # Vérifie que ce paiement appartient bien à l'établissement appelant —
    # avant le Lot 2, n'importe quel paiement_id deviné pouvait être annulé
    # (avec reversement des montants) depuis n'importe quelle école.
    proprietaire = (
        db.query(Classe.etablissement_id)
        .join(Inscription, Inscription.classe_id == Classe.classe_id)
        .join(Facture, Facture.inscription_id == Inscription.inscription_id)
        .filter(Facture.facture_id == paiement.facture_id)
        .scalar()
    )
    if proprietaire != etablissement_id:
        raise HTTPException(status_code=404, detail="Paiement non trouvé")

    if paiement.statut == "ANNULE":
        raise HTTPException(status_code=400, detail="Ce paiement est déjà annulé")

    _verifier_annee_modifiable(db, paiement.annee_id)

    montant_paiement = float(paiement.montant or 0)

    # Mettre à jour le statut du paiement
    paiement.statut = "ANNULE"
    paiement.motif_annulation = motif

    # Reverser les montants sur la facture
    facture = db.query(Facture).filter(Facture.facture_id == paiement.facture_id).first()
    if facture:
        facture.montant_paye = max(0, float(facture.montant_paye or 0) - montant_paiement)
        facture.montant_restant = float(facture.montant_net or 0) - float(facture.montant_paye)

        # Mettre à jour le statut de la facture
        if facture.montant_paye <= 0:
            facture.statut = "EN_ATTENTE"
        elif facture.montant_restant <= 0:
            facture.statut = "PAYEE"
            facture.montant_restant = 0
        else:
            facture.statut = "PARTIELLEMENT_PAYEE"

    # Reverser les montants sur l'échéance si applicable
    if paiement.echeance_id:
        echeance = db.query(EcheanceFacture).filter(
            EcheanceFacture.echeance_id == paiement.echeance_id
        ).first()
        if echeance:
            echeance.montant_paye = max(0, float(echeance.montant_paye or 0) - montant_paiement)
            if echeance.montant_paye <= 0:
                echeance.statut = "EN_ATTENTE"
            elif echeance.montant_paye >= float(echeance.montant_attendu or 0):
                echeance.statut = "PAYEE"
            else:
                echeance.statut = "PARTIELLEMENT_PAYEE"

    # Comptabilité générale : contre-passation de l'écriture d'encaissement d'origine
    insc = db.query(Inscription).filter(Inscription.inscription_id == facture.inscription_id).first() if facture else None
    compte_tresorerie, journal_tresorerie = compte_tresorerie_pour_mode(paiement.mode_paiement)
    generer_ecriture_auto(
        db, date_ecriture=date_type.today(), journal_code=journal_tresorerie,
        libelle=f"Annulation paiement {paiement.numero_recu} — {motif}",
        reference=paiement.numero_recu,
        lignes=[
            # eleve_id uniquement sur la ligne 4111 (compte élève) — voir le
            # même correctif dans create_paiement pour l'explication complète.
            {"compte": COMPTE_ELEVES, "debit": montant_paiement, "credit": 0,
             "eleve_id": insc.eleve_id if insc else None, "classe_id": insc.classe_id if insc else None},
            {"compte": compte_tresorerie, "debit": 0, "credit": montant_paiement,
             "classe_id": insc.classe_id if insc else None},
        ],
        etablissement_id=etablissement_id,
    )

    db.commit()

    return {
        "paiement_id": paiement.paiement_id,
        "numero_recu": paiement.numero_recu,
        "montant_annule": montant_paiement,
        "motif": motif,
        "facture_statut": facture.statut if facture else None,
        "message": f"Paiement {paiement.numero_recu} annulé avec succès. Montant de {montant_paiement:,.0f} GNF reversé."
    }


# ============================================================================
# ACOMPTES — Paiements partiels (avances sur factures non soldées)
# ============================================================================

@router.get("/acomptes")
def list_acomptes(
    response: Response,
    annee_id: Optional[int] = None,
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    etablissement_id: int = Depends(require_etablissement),
):
    """
    Liste les paiements qui constituent des acomptes (avances).
    Un acompte est un paiement validé dont la facture associée a encore un montant restant > 0.
    """
    # Sans annee precisee, celle EN COURS DE CETTE ECOLE — et non
    # l'annee n°1, qui appartient a la premiere ecole inscrite.
    annee_id = resoudre_annee(db, etablissement_id, annee_id)
    query = (
        db.query(Paiement, Facture, Eleve, Classe)
        .join(Facture, Paiement.facture_id == Facture.facture_id)
        .join(Inscription, Facture.inscription_id == Inscription.inscription_id)
        .join(Eleve, Inscription.eleve_id == Eleve.eleve_id)
        .join(Classe, Inscription.classe_id == Classe.classe_id)
        .filter(
            Classe.etablissement_id == etablissement_id,
            Inscription.annee_id == annee_id,
            Paiement.statut == "VALIDE",
            Facture.montant_restant > 0
        )
    )

    total = query.count()
    response.headers["X-Total-Count"] = str(total)

    results = (
        query
        .order_by(Paiement.date_paiement.desc())
        .offset(skip).limit(limit)
        .all()
    )

    # Calculer les totaux
    total_acomptes = sum(float(p.montant) for p, _, _, _ in results)
    total_restant = sum(float(f.montant_restant or 0) for _, f, _, _ in results)

    return {
        "total_acomptes": total_acomptes,
        "total_restant_du": total_restant,
        "nb_acomptes": len(results),
        "acomptes": [
            {
                "paiement_id": p.paiement_id,
                "numero_recu": p.numero_recu,
                "date_paiement": str(p.date_paiement) if p.date_paiement else None,
                "montant_paye": float(p.montant),
                "mode_paiement": p.mode_paiement,
                "facture_id": f.facture_id,
                "numero_facture": f.numero_facture,
                "montant_total_facture": float(f.montant_total or 0),
                "montant_paye_facture": float(f.montant_paye or 0),
                "montant_restant_facture": float(f.montant_restant or 0),
                "statut_facture": f.statut,
                "eleve_nom": e.nom,
                "eleve_prenom": e.prenom,
                "eleve_matricule": e.matricule,
                "classe_nom": c.libelle,
            }
            for p, f, e, c in results
        ],
    }


# ============================================================================
# FACTURES — Générer PDF
# ============================================================================

@router.get("/factures/{facture_id}/pdf")
def generer_facture_pdf(facture_id: int, db: Session = Depends(get_db), etablissement_id: int = Depends(require_etablissement)):
    """Génère une facture au format PDF et la retourne en téléchargement."""
    from reportlab.lib.pagesizes import A4
    from reportlab.pdfgen import canvas
    from reportlab.lib.units import cm, mm
    from fastapi.responses import StreamingResponse
    from app.models.academique import Etablissement, Inscription, Eleve, Classe, TypeFrais
    import io

    # Récupérer la facture avec toutes les jointures nécessaires
    result = (
        db.query(Facture, Inscription, Eleve, Classe, TypeFrais)
        .join(Inscription, Facture.inscription_id == Inscription.inscription_id)
        .join(Eleve, Inscription.eleve_id == Eleve.eleve_id)
        .join(Classe, Inscription.classe_id == Classe.classe_id)
        .outerjoin(TypeFrais, Facture.type_frais_id == TypeFrais.type_frais_id)
        .filter(Facture.facture_id == facture_id, Classe.etablissement_id == etablissement_id)
        .first()
    )

    if not result:
        raise HTTPException(status_code=404, detail="Facture non trouvée")

    facture, inscription, eleve, classe, type_frais = result

    # Récupérer l'établissement
    etablissement = db.query(Etablissement).filter(
        Etablissement.etablissement_id == classe.etablissement_id
    ).first()

    nom_ecole = etablissement.nom if etablissement else "SmartSchool"
    adresse_ecole = getattr(etablissement, "adresse", "") or ""
    tel_ecole = getattr(etablissement, "telephone", "") or ""
    email_ecole = getattr(etablissement, "email", "") or ""

    # Créer le buffer PDF
    buffer = io.BytesIO()
    pdf = canvas.Canvas(buffer, pagesize=A4)
    largeur, hauteur = A4

    # === En-tête : informations de l'établissement ===
    y = hauteur - 2 * cm

    # Zone logo (placeholder rectangle)
    pdf.setStrokeColorRGB(0.7, 0.7, 0.7)
    pdf.rect(2 * cm, y - 1.5 * cm, 2.5 * cm, 2 * cm)
    pdf.setFont("Helvetica", 8)
    pdf.drawCentredString(3.25 * cm, y - 0.7 * cm, "LOGO")

    # Nom de l'école
    pdf.setFont("Helvetica-Bold", 16)
    pdf.drawCentredString(largeur / 2, y, nom_ecole)
    y -= 0.6 * cm
    pdf.setFont("Helvetica", 9)
    if adresse_ecole:
        pdf.drawCentredString(largeur / 2, y, adresse_ecole)
        y -= 0.4 * cm
    if tel_ecole or email_ecole:
        contact = f"Tél: {tel_ecole}" if tel_ecole else ""
        if email_ecole:
            contact += f"  |  Email: {email_ecole}" if contact else f"Email: {email_ecole}"
        pdf.drawCentredString(largeur / 2, y, contact)
        y -= 0.4 * cm

    # Ligne de séparation
    y -= 0.5 * cm
    pdf.setLineWidth(1.5)
    pdf.setStrokeColorRGB(0.2, 0.4, 0.8)
    pdf.line(2 * cm, y, largeur - 2 * cm, y)

    # === Titre de la facture ===
    y -= 1.2 * cm
    pdf.setFont("Helvetica-Bold", 18)
    pdf.drawCentredString(largeur / 2, y, "FACTURE")

    # Numéro de facture
    y -= 0.8 * cm
    pdf.setFont("Helvetica-Bold", 11)
    pdf.drawCentredString(largeur / 2, y, f"N° {facture.numero_facture}")
    
    # Date de facture
    y -= 0.6 * cm
    pdf.setFont("Helvetica", 10)
    pdf.drawCentredString(largeur / 2, y, f"Date: {facture.date_facture}")

    # === Informations de l'élève ===
    y -= 1.5 * cm
    pdf.setFont("Helvetica-Bold", 11)
    pdf.drawString(2 * cm, y, "INFORMATIONS DE L'ÉLÈVE")
    y -= 0.2 * cm
    pdf.setLineWidth(0.5)
    pdf.setStrokeColorRGB(0.5, 0.5, 0.5)
    pdf.line(2 * cm, y, largeur - 2 * cm, y)

    y -= 0.6 * cm
    pdf.setFont("Helvetica", 10)
    pdf.drawString(2.5 * cm, y, f"Nom complet :  {eleve.prenom} {eleve.nom}")
    y -= 0.5 * cm
    pdf.drawString(2.5 * cm, y, f"Matricule :  {eleve.matricule or 'N/A'}")
    y -= 0.5 * cm
    pdf.drawString(2.5 * cm, y, f"Classe :  {classe.libelle}")

    # === Détails de la facture ===
    y -= 1.5 * cm
    pdf.setFont("Helvetica-Bold", 11)
    pdf.drawString(2 * cm, y, "DÉTAILS DE LA FACTURE")
    y -= 0.2 * cm
    pdf.setLineWidth(0.5)
    pdf.line(2 * cm, y, largeur - 2 * cm, y)

    y -= 0.6 * cm
    pdf.setFont("Helvetica", 10)
    libelle_frais = type_frais.libelle if type_frais else "Frais Scolaires (Non spécifié)"
    pdf.drawString(2.5 * cm, y, f"Motif :  {libelle_frais}")
    
    y -= 0.5 * cm
    pdf.drawString(2.5 * cm, y, f"Statut :  {facture.statut}")

    y -= 1.0 * cm
    pdf.setFont("Helvetica-Bold", 11)
    pdf.drawString(2.5 * cm, y, f"Montant Total : {float(facture.montant_total or 0):,.0f} GNF")
    y -= 0.5 * cm
    if float(facture.montant_remise or 0) > 0:
        pdf.drawString(2.5 * cm, y, f"Remise : -{float(facture.montant_remise):,.0f} GNF")
        y -= 0.5 * cm
    pdf.drawString(2.5 * cm, y, f"Montant Net : {float(facture.montant_net or 0):,.0f} GNF")
    y -= 0.5 * cm
    pdf.drawString(2.5 * cm, y, f"Montant Payé : {float(facture.montant_paye or 0):,.0f} GNF")
    y -= 0.7 * cm
    pdf.setFont("Helvetica-Bold", 12)
    pdf.setFillColorRGB(0.8, 0.1, 0.1) # Rouge pour le reste
    pdf.drawString(2.5 * cm, y, f"Reste à payer : {float(facture.montant_restant or 0):,.0f} GNF")
    
    pdf.setFillColorRGB(0, 0, 0) # Retour noir

    # === Bas de page ===
    y -= 3 * cm
    pdf.setFont("Helvetica", 9)
    pdf.drawCentredString(largeur / 2, y, "Merci de votre confiance.")
    
    # Numérotation page
    pdf.drawString(largeur - 3 * cm, 2 * cm, "Page 1/1")

    # === Filigrane ===
    from app.core.documents_settings import get_documents_settings, dessiner_filigrane, _bool
    settings = get_documents_settings(db, classe.etablissement_id)
    if _bool(settings.get("documents.filigrane_recus", "false")):
        dessiner_filigrane(pdf, largeur, hauteur, settings)

    pdf.showPage()
    pdf.save()
    buffer.seek(0)

    return StreamingResponse(
        buffer,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=facture_{facture.numero_facture}.pdf"}
    )


# ============================================================================
# SALAIRES — Gestion des salaires des employés
# ============================================================================

@router.get("/salaires/employes")
def list_employes_salaires(
    annee_id: Optional[int] = None,
    mois: Optional[str] = None,   # format: "2026-06"
    db: Session = Depends(get_db),
    etablissement_id: int = Depends(require_etablissement),
):
    """
    Liste tous les enseignants et le personnel administratif actifs avec leur historique de paiements.
    """
    # Sans annee precisee, celle EN COURS DE CETTE ECOLE — et non
    # l'annee n°1, qui appartient a la premiere ecole inscrite.
    annee_id = resoudre_annee(db, etablissement_id, annee_id)
    enseignants = (
        db.query(Enseignant)
        .filter(
            Enseignant.etablissement_id == etablissement_id,
            Enseignant.statut == "ACTIF"
        )
        .all()
    )

    personnel = (
        db.query(Utilisateur)
        .filter(
            Utilisateur.etablissement_id == etablissement_id,
            Utilisateur.statut == "ACTIF",
            Utilisateur.role != "SUPER_ADMIN",
        )
        .all()
    )

    from app.services import paie as _paie
    _annee_paie = _paie.annee_courante_id(db, etablissement_id)
    # Meme raison que dans preparer_la_paie : un seul appel pour toute la liste.
    _salaires = _paie.salaires_enseignants(
        db, [e.enseignant_id for e in enseignants], _annee_paie
    )

    result = []
    # --- Traitement des Enseignants ---
    for ens in enseignants:
        # Le salaire affiche ici doit etre celui que la paie versera. Pour un
        # vacataire il se calcule a partir des heures ; la colonne
        # `ens.salaire_base` vaut 0 et ne veut rien dire.
        _r = _salaires.get(ens.enseignant_id) or {
            "base": 0.0, "mode": "MENSUEL", "total_heures": 0.0, "lignes": []
        }
        depenses = (
            db.query(Depense)
            .filter(
                Depense.etablissement_id == etablissement_id,
                Depense.categorie == "SALAIRES",
                Depense.fournisseur == f"ENS_{ens.enseignant_id}",
                Depense.statut == "VALIDE"
            )
            .order_by(Depense.date_depense.desc())
            .limit(12)
            .all()
        )

        historique = []
        for dep in depenses:
            bulletin = None
            if dep.reference and dep.reference.isdigit():
                bulletin = db.query(BulletinPaie).filter(BulletinPaie.bulletin_id == int(dep.reference)).first()

            historique.append({
                "depense_id": dep.depense_id,
                "bulletin_id": bulletin.bulletin_id if bulletin else None,
                "date": dep.date_depense.isoformat() if dep.date_depense else None,
                "date_paiement": bulletin.date_paiement.isoformat() if bulletin and bulletin.date_paiement else (dep.date_depense.isoformat() if dep.date_depense else None),
                "mois_concerne": bulletin.mois_concerne if bulletin else None,
                "mode_paiement": bulletin.mode_paiement if bulletin else None,
                "montant": float(dep.montant),
                "libelle": dep.libelle,
                "statut": dep.statut,
                "salaire_base": float(bulletin.salaire_base) if bulletin else float(ens.salaire_base or 0),
                "total_primes": float(bulletin.total_primes) if bulletin else float(ens.prime_mensuelle or 0),
                "total_absences": float(bulletin.total_absences) if bulletin else 0,
                "total_avances": float(bulletin.total_avances) if bulletin else 0,
                "net_a_payer": float(bulletin.net_a_payer) if bulletin else float(dep.montant),
                "details_absences": bulletin.details_absences if bulletin else None
            })

        paye_ce_mois = any(dep["mois_concerne"] == mois for dep in historique) if mois else False

        total_paye = sum(float(dep["montant"]) for dep in historique)

        result.append({
            "id": f"ENS_{ens.enseignant_id}",
            "type_employe": "ENSEIGNANT",
            "nom": ens.nom,
            "prenom": ens.prenom,
            "role_label": "Enseignant",
            "salaire_base": _r["base"],
            "mode_remuneration": _r["mode"],
            "total_heures": _r["total_heures"],
            "explication_salaire": _r.get("explication", ""),
            "prime_mensuelle": float(ens.prime_mensuelle) if ens.prime_mensuelle else 0,
            "telephone": ens.telephone,
            "paye_ce_mois": paye_ce_mois,
            "total_paye_annee": total_paye,
            "nb_paiements": len(historique),
            "historique": historique
        })

    # --- Traitement du Personnel ---
    for p in personnel:
        depenses = (
            db.query(Depense)
            .filter(
                Depense.etablissement_id == etablissement_id,
                Depense.categorie == "SALAIRES",
                Depense.fournisseur == f"PERS_{p.utilisateur_id}",
                Depense.statut == "VALIDE"
            )
            .order_by(Depense.date_depense.desc())
            .limit(12)
            .all()
        )

        historique = []
        for dep in depenses:
            bulletin = None
            if dep.reference and dep.reference.isdigit():
                bulletin = db.query(BulletinPaie).filter(BulletinPaie.bulletin_id == int(dep.reference)).first()

            historique.append({
                "depense_id": dep.depense_id,
                "bulletin_id": bulletin.bulletin_id if bulletin else None,
                "date": dep.date_depense.isoformat() if dep.date_depense else None,
                "date_paiement": bulletin.date_paiement.isoformat() if bulletin and bulletin.date_paiement else (dep.date_depense.isoformat() if dep.date_depense else None),
                "mois_concerne": bulletin.mois_concerne if bulletin else None,
                "mode_paiement": bulletin.mode_paiement if bulletin else None,
                "montant": float(dep.montant),
                "libelle": dep.libelle,
                "statut": dep.statut,
                "salaire_base": float(bulletin.salaire_base) if bulletin else float(p.salaire_base or 0),
                "total_primes": float(bulletin.total_primes) if bulletin else float(p.prime_mensuelle or 0),
                "total_absences": float(bulletin.total_absences) if bulletin else 0,
                "total_avances": float(bulletin.total_avances) if bulletin else 0,
                "net_a_payer": float(bulletin.net_a_payer) if bulletin else float(dep.montant),
                "details_absences": bulletin.details_absences if bulletin else None
            })

        paye_ce_mois = any(dep["mois_concerne"] == mois for dep in historique) if mois else False

        total_paye = sum(float(dep["montant"]) for dep in historique)

        result.append({
            "id": f"PERS_{p.utilisateur_id}",
            "type_employe": "PERSONNEL",
            "nom": p.nom,
            "prenom": p.prenom,
            "role_label": p.role,
            "salaire_base": float(p.salaire_base) if p.salaire_base else 0,
            "mode_remuneration": "MENSUEL",
            "total_heures": 0.0,
            "explication_salaire": "Salaire mensuel fixe.",
            "prime_mensuelle": float(p.prime_mensuelle) if p.prime_mensuelle else 0,
            "telephone": p.telephone,
            "paye_ce_mois": paye_ce_mois,
            "total_paye_annee": total_paye,
            "nb_paiements": len(historique),
            "historique": historique
        })

    # Tri global par nom, prénom
    result.sort(key=lambda x: (x["nom"].lower(), x["prenom"].lower()))

    return result


@router.post("/salaires/payer", status_code=201)
def payer_salaire_employe(data: dict, db: Session = Depends(get_db), etablissement_id: int = Depends(require_etablissement)):
    """
    Enregistre le paiement de salaire d'un employé (Enseignant ou Personnel).
    """
    employe_id_str = data.get("enseignant_id")
    mois = data.get("mois", "")
    # Les deux mêmes défauts que le paiement groupé, corrigés là-bas mais pas
    # ici : « Cash » n'appartient à aucune liste de référence (la dépense
    # disparaissait du rapprochement de caisse) et `annee_id = 1` faisait
    # enregistrer la charge sur l'année scolaire d'une AUTRE école.
    mode_paiement = exiger_mode_paiement(data.get("mode_paiement") or "ESPECES")
    annee_id = resoudre_annee(db, etablissement_id, data.get("annee_id"))
    date_versement = _lire_date(data.get("date_versement"))

    if not employe_id_str or not mois:
        raise HTTPException(status_code=400, detail="Identifiant employé et mois obligatoires")

    try:
        result = _executer_paiement_salaire(
            db=db,
            employe_id_str=employe_id_str,
            mois_concerne=mois,
            mode_paiement=mode_paiement,
            etablissement_id=etablissement_id,
            annee_id=annee_id,
            date_versement=date_versement,
        )
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


JOURS_OUVRABLES_MOIS = 26  # convention pour le taux journalier de retenue/absence


def _bornes_mois(mois_concerne: str):
    """Retourne (date_debut, date_fin) du mois au format YYYY-MM."""
    annee, mois = (int(x) for x in mois_concerne.split("-"))
    dernier_jour = calendar.monthrange(annee, mois)[1]
    return date_type(annee, mois, 1), date_type(annee, mois, dernier_jour)


def _identifier_employe(employe_id_str: str, db: Session, etablissement_id: int) -> dict:
    """Retrouve l'enseignant/personnel réel derrière une référence 'ENS_x'/'PERS_x'.

    Vérifie que cet employé appartient bien à l'établissement appelant — avant
    le Lot 2 du chantier multi-écoles, cette fonction ne filtrait par aucun
    établissement : n'importe quel compte FINANCE_ROLES pouvait consulter ou
    payer le salaire d'un enseignant/personnel d'une AUTRE école en devinant
    son ID ('ENS_42', 'PERS_17'...). Utilisée par toutes les routes de paie
    individuelle (salaires, primes, avances, absences)."""
    if not employe_id_str or "_" not in employe_id_str:
        raise HTTPException(status_code=400, detail="Identifiant employé invalide")
    prefix, emp_id_raw = employe_id_str.split("_", 1)
    try:
        emp_id = int(emp_id_raw)
    except ValueError:
        raise HTTPException(status_code=400, detail="Identifiant employé invalide")

    if prefix == "ENS":
        ens = db.query(Enseignant).filter(
            Enseignant.enseignant_id == emp_id, Enseignant.etablissement_id == etablissement_id
        ).first()
        if not ens:
            raise HTTPException(status_code=404, detail="Enseignant introuvable")
        # Au primaire, le salaire est un montant fixe inscrit sur la fiche.
        # Au college et au lycee, il n'existe nulle part en base : il se CALCULE
        # a partir des heures reellement affectees. Lire `ens.salaire_base` pour
        # tout le monde renvoyait donc 0 pour chaque vacataire — un net a payer
        # nul, une retenue d'absence nulle, et l'enseignant purement absent de la
        # paie du mois. Le calcul vit dans services/paie.py et nulle part
        # ailleurs : le passer ici garantit que la preparation, le paiement, les
        # arrieres et le bulletin lisent tous le meme chiffre.
        from app.services import paie as _paie

        _r = _paie.salaire_enseignant(
            db, emp_id, _paie.annee_courante_id(db, etablissement_id)
        )
        return {
            "nom": ens.nom, "prenom": ens.prenom, "poste": "Enseignant",
            "salaire_base": _r["base"],
            "prime_mensuelle": float(ens.prime_mensuelle or 0),
            "type_contrat": ens.type_contrat or "PERMANENT", "mobile_money": None,
            "type_agent": "ENSEIGNANT", "agent_id": emp_id,
            "date_embauche": ens.date_embauche,
            "mode_remuneration": _r["mode"],
            "total_heures": _r["total_heures"],
            "explication_salaire": _r.get("explication", ""),
        }
    elif prefix == "PERS":
        pers = db.query(Utilisateur).filter(
            Utilisateur.utilisateur_id == emp_id, Utilisateur.etablissement_id == etablissement_id
        ).first()
        if not pers:
            raise HTTPException(status_code=404, detail="Membre du personnel introuvable")
        return {
            "nom": pers.nom, "prenom": pers.prenom, "poste": pers.role,
            "salaire_base": float(pers.salaire_base or 0),
            "prime_mensuelle": float(pers.prime_mensuelle or 0),
            "type_contrat": pers.type_contrat or "PERMANENT", "mobile_money": None,
            "type_agent": "PERSONNEL", "agent_id": emp_id,
            # On ne doit rien a quelqu'un pour les mois qui precedent son
            # arrivee : voir `_avant_embauche`.
            "date_embauche": pers.date_embauche,
            # Un comptable, un surveillant, un gardien ne sont pas payes a
            # l'heure de cours : leur salaire est fixe, par mois.
            "mode_remuneration": "MENSUEL",
            "total_heures": 0.0,
            "explication_salaire": "Salaire mensuel fixe.",
        }
    raise HTTPException(status_code=400, detail="Type d'employé inconnu")


def _get_or_sync_employe_paie(db: Session, employe_id_str: str, infos: dict, etablissement_id: int) -> Employe:
    """
    Retrouve (ou crée) la ligne SS_EMPLOYES miroir correspondant à un
    enseignant/personnel réel, indispensable pour y rattacher primes/avances/
    absences (clé étrangère SS_EMPLOYES obligatoire côté base). Les infos
    (nom/prénom/poste/salaire) sont resynchronisées à chaque appel pour ne
    jamais désynchroniser ce miroir de la vraie fiche RH (Enseignant/Utilisateur).

    `etablissement_id` provient de l'appelant (déjà vérifié par
    _identifier_employe), jamais d'une valeur par défaut codée en dur.
    """
    employe = db.query(Employe).filter(Employe.source_ref == employe_id_str).first()
    if not employe:
        employe = Employe(
            etablissement_id=etablissement_id,
            nom=infos["nom"], prenom=infos["prenom"], poste=infos["poste"],
            salaire_base=infos["salaire_base"], type_contrat=infos["type_contrat"],
            mobile_money=infos["mobile_money"], statut="ACTIF",
            source_ref=employe_id_str,
        )
        db.add(employe)
        db.flush()
    else:
        employe.nom = infos["nom"]
        employe.prenom = infos["prenom"]
        employe.poste = infos["poste"]
        employe.salaire_base = infos["salaire_base"]
    return employe


def _calculer_salaire(db: Session, employe_id_str: str, mois_concerne: str, etablissement_id: int) -> dict:
    """Calcule le net à payer réel d'un employé pour un mois donné, à partir
    des vraies données (salaire de base, primes fixes + ponctuelles, absences
    non justifiées pointées, avances en attente)."""
    infos = _identifier_employe(employe_id_str, db, etablissement_id)
    employe = _get_or_sync_employe_paie(db, employe_id_str, infos, etablissement_id)
    debut_mois, fin_mois = _bornes_mois(mois_concerne)

    bulletin_existant = (
        db.query(BulletinPaie)
        .filter(BulletinPaie.employe_id == employe.employe_id, BulletinPaie.mois_concerne == mois_concerne)
        .order_by(BulletinPaie.bulletin_id.desc())
        .first()
    )
    if bulletin_existant and bulletin_existant.statut == "PAYE":
        # Une fois payé, on fige les montants réellement versés (bulletin) au lieu de
        # recalculer en direct : ajouter une prime/avance plus tard pour ce même mois
        # ne doit jamais faire dériver ce qui est affiché comme "déjà payé" (c'était la
        # cause d'un écart constaté entre le "net à payer" affiché et le montant réel
        # de l'historique de paiement pour un même mois).
        return {
            "employe_id": employe_id_str,
            "employe_pk": employe.employe_id,
            "nom": infos["nom"], "prenom": infos["prenom"], "poste": infos["poste"],
            "salaire_base": float(bulletin_existant.salaire_base),
            "total_primes": float(bulletin_existant.total_primes),
            "total_absences": float(bulletin_existant.total_absences),
            "total_avances": float(bulletin_existant.total_avances),
            "net_a_payer": float(bulletin_existant.net_a_payer),
            "statut": "PAYE",
            "bulletin_id": bulletin_existant.bulletin_id,
            "nom_complet": f"{infos['prenom']} {infos['nom']}",
            "details_absences": bulletin_existant.details_absences,
            "mode_remuneration": infos.get("mode_remuneration", "MENSUEL"),
            "total_heures": infos.get("total_heures", 0.0),
            "explication_salaire": infos.get("explication_salaire", ""),
        }

    primes_ponctuelles = (
        db.query(func.coalesce(func.sum(Prime.montant), 0))
        .filter(Prime.employe_id == employe.employe_id, Prime.mois_concerne == mois_concerne)
        .scalar()
    )
    total_primes = float(infos["prime_mensuelle"]) + float(primes_ponctuelles or 0)

    # On releve les JOURS d'absence, pas seulement leur nombre : pour un
    # professeur paye a l'heure, ce qui compte est ce qu'il avait a donner ces
    # jours-la, et ca se lit dans son emploi du temps.
    jours_pointage = [
        r[0] for r in db.query(PresenceAgent.date_presence).filter(
            PresenceAgent.type_agent == infos["type_agent"],
            PresenceAgent.agent_id == infos["agent_id"],
            PresenceAgent.statut == "ABSENT",
            PresenceAgent.date_presence >= debut_mois,
            PresenceAgent.date_presence <= fin_mois,
        ).all()
    ]
    jours_manuels = [
        r[0] for r in db.query(AbsencePersonnel.date_absence).filter(
            AbsencePersonnel.employe_id == employe.employe_id,
            AbsencePersonnel.est_justifie == "N",
            AbsencePersonnel.date_absence >= debut_mois,
            AbsencePersonnel.date_absence <= fin_mois,
        ).all()
    ]
    nb_absences_pointage = len(jours_pointage)
    nb_absences_manuelles = len(jours_manuels)
    jours_absents = sorted(set(jours_pointage) | set(jours_manuels))

    details_absences_parts = []
    heures_perdues = 0.0

    if infos.get("mode_remuneration") == "HORAIRE" and infos["type_agent"] == "ENSEIGNANT":
        # AU COLLEGE ET AU LYCEE, on retient les HEURES REELLEMENT MANQUEES.
        # Le taux journalier (salaire / 26) retenait la meme somme pour un
        # mardi a deux heures de cours et un jeudi a six : trop dans un cas,
        # pas assez dans l'autre, jamais le bon montant. Un vacataire n'est pas
        # paye pour etre la, il est paye pour les heures qu'il donne.
        from app.services import paie as _paie

        manque = _paie.heures_manquees(
            db, infos["agent_id"], jours_absents,
            _paie.annee_courante_id(db, etablissement_id),
        )
        total_absences = round(manque["montant"], 2)
        heures_perdues = manque["heures"]
        if heures_perdues:
            details_absences_parts.append(
                f"{heures_perdues:g} h de cours non assurees sur "
                f"{len(jours_absents)} jour(s) d'absence"
            )
            details_absences_parts.extend(
                f"{l['date']} {l['creneau']} {l['matiere']} ({l['classe']}) — "
                f"{l['heures']:g} h x {l['taux_horaire']:,.0f}"
                for l in manque["lignes"][:8]
            )
        elif jours_absents:
            # Absent un jour ou il n'avait pas cours : rien a retenir, et il
            # faut le dire plutot que de laisser croire a un oubli.
            details_absences_parts.append(
                f"{len(jours_absents)} jour(s) d'absence sans cours prevu — aucune retenue"
            )
    else:
        # Au primaire et pour le personnel : le salaire est mensuel, la presence
        # est due tous les jours. Le taux journalier est alors le bon calcul.
        taux_journalier = infos["salaire_base"] / JOURS_OUVRABLES_MOIS if infos["salaire_base"] else 0
        total_absences = round(len(jours_absents) * taux_journalier, 2)
        if nb_absences_pointage > 0:
            details_absences_parts.append(f"{nb_absences_pointage} absence(s) pointage QR")
        if nb_absences_manuelles > 0:
            details_absences_parts.append(f"{nb_absences_manuelles} absence(s) saisie(s) manuellement (non justifiée)")
    
    details_absences_texte = None
    if details_absences_parts:
        details_absences_texte = " | ".join(details_absences_parts) + f" — Retenue totale: {total_absences} GNF"

    # TOUT CE QUI A ÉTÉ PRIS DEPUIS LA DERNIÈRE PAIE SE DÉDUIT ICI
    # Une avance ne se rattachait qu'au mois inscrit à la main sur sa fiche.
    # Une avance prise le 15 mars et étiquetée « avril » par erreur — ou par
    # habitude — n'était donc jamais déduite en mars, et le comptable versait
    # le salaire entier sans s'en apercevoir.
    #
    # La règle est celle de la caisse : une avance reste due tant qu'elle n'a
    # pas été retenue. Toute avance encore EN_ATTENTE à la fin du mois payé
    # est donc déduite maintenant, quelle que soit l'étiquette qu'elle porte.
    # Elle passe ensuite en DEDUITE et ne peut plus revenir.
    fin_du_mois = _jour_de_versement(mois_concerne)
    avances_dues = db.query(Avance).filter(
        Avance.employe_id == employe.employe_id,
        Avance.statut == "EN_ATTENTE",
        or_(Avance.date_avance.is_(None), Avance.date_avance <= fin_du_mois),
    ).all()
    total_avances = float(sum(float(a.montant or 0) for a in avances_dues))
    detail_avances = " | ".join(
        f"{a.date_avance.strftime('%d/%m/%Y') if a.date_avance else 'sans date'} : "
        f"{float(a.montant):,.0f} GNF"
        for a in avances_dues
    ) or None

    # On ne doit rien a quelqu'un pour les mois qui precedent son arrivee.
    avant_arrivee = _avant_embauche(infos.get("date_embauche"), mois_concerne)

    # Une retenue superieure au salaire donnerait un net negatif — un
    # « paiement » que l'ecole devrait recevoir de son employe.
    total_absences = min(total_absences, infos["salaire_base"] + total_primes)
    net_a_payer = round(infos["salaire_base"] + total_primes - total_absences - total_avances, 2)

    return {
        "employe_id": employe_id_str,
        "employe_pk": employe.employe_id,
        "nom": infos["nom"], "prenom": infos["prenom"], "poste": infos["poste"],
        "salaire_base": infos["salaire_base"],
        "total_primes": total_primes,
        "total_absences": total_absences,
        "total_avances": total_avances,
        "net_a_payer": 0 if avant_arrivee else max(net_a_payer, 0),
        # « Ce mois précède son arrivée » n'est pas la même chose que « rien à
        # verser » : l'écran doit pouvoir le dire, pas juste afficher zéro.
        "avant_embauche": avant_arrivee,
        # Le detail de ce qui est retenu : une avance se conteste comme une
        # retenue d'absence, elle doit se justifier ligne par ligne.
        "details_avances": detail_avances,
        "nb_avances": len(avances_dues),
        "date_embauche": str(infos["date_embauche"]) if infos.get("date_embauche") else None,
        "statut": "AVANT_EMBAUCHE" if avant_arrivee else "NON_PAYE",
        "bulletin_id": None,
        "nom_complet": f"{infos['prenom']} {infos['nom']}",
        "details_absences": details_absences_texte,
        "mode_remuneration": infos.get("mode_remuneration", "MENSUEL"),
        "total_heures": infos.get("total_heures", 0.0),
        "explication_salaire": infos.get("explication_salaire", ""),
    }


def _lister_employes_actifs(db: Session, etablissement_id: int):
    """Tout le personnel actif a payer ('ENS_x'/'PERS_x').

    La liste filtrait sur `salaire_base > 0`. Un vacataire du college a
    `salaire_base = 0` en base — son salaire se calcule a partir de ses heures
    — donc il ne figurait dans AUCUNE liste de paie : ni preparation, ni
    paiement groupe. Il n'apparaissait nulle part et personne ne pouvait s'en
    apercevoir, puisqu'il ne s'affichait meme pas comme impaye.

    On ne filtre donc plus sur le montant. Un employe sans salaire renseigne
    reste visible et ressort comme « montant a completer » : un manque affiche
    vaut mieux qu'un employe efface.

    Le SUPER_ADMIN est l'editeur de la plateforme, pas un salarie de l'ecole.
    """
    refs = []
    for ens in db.query(Enseignant).filter(
        Enseignant.etablissement_id == etablissement_id, Enseignant.statut == "ACTIF"
    ).all():
        refs.append(f"ENS_{ens.enseignant_id}")
    for pers in db.query(Utilisateur).filter(
        Utilisateur.etablissement_id == etablissement_id,
        Utilisateur.statut == "ACTIF",
        Utilisateur.role != "SUPER_ADMIN",
    ).all():
        refs.append(f"PERS_{pers.utilisateur_id}")
    return refs


def _avant_embauche(date_embauche: Optional[date_type], mois_concerne: str) -> bool:
    """Ce mois précède-t-il l'arrivée de la personne ?

    ON NE DOIT RIEN À QUELQU'UN AVANT SON ARRIVÉE
    La liste des arriérés parcourait les douze derniers mois glissants et
    calculait un salaire pour chacun, sans jamais regarder la date d'embauche.
    Un comptable recruté aujourd'hui apparaissait donc avec « Mois en retard
    (12) — Total dû : 12 000 000 GNF », et un clic suffisait à lui verser une
    année de salaire pour du travail qu'il n'a pas fourni.

    Le mois d'arrivée est dû en entier : découper un salaire au prorata des
    jours est une décision d'école, pas une règle du logiciel — et la trancher
    ici en silence serait pire que de la laisser à la direction.
    """
    if not date_embauche or not mois_concerne:
        return False
    return mois_concerne < date_embauche.strftime("%Y-%m")


def _lire_date(valeur) -> Optional[date_type]:
    """« 2025-10-31 » -> date. Vide ou absent -> None. Illisible -> 400.

    Ces endpoints reçoivent un `dict` brut, pas un schéma Pydantic : sans cette
    lecture explicite, une date mal formée arriverait telle quelle en base ou
    passerait silencieusement à la trappe.
    """
    if not valeur:
        return None
    if isinstance(valeur, date_type):
        return valeur
    try:
        return date_type.fromisoformat(str(valeur)[:10])
    except ValueError:
        raise HTTPException(400, f"Date illisible : « {valeur} ». Format attendu : AAAA-MM-JJ.")


def _jour_de_versement(mois_concerne: str, date_versement: Optional[date_type] = None) -> date_type:
    """Date à porter sur la dépense, l'écriture et le bulletin de paie.

    UN SALAIRE D'OCTOBRE SE DATE EN OCTOBRE
    Ces trois dates étaient figées à `date.today()`. Payer en retard la paie
    d'octobre — cas ordinaire dans une école qui attend les scolarités — la
    faisait tomber dans le mois de la saisie. La courbe de trésorerie montrait
    alors neuf mois de salaires versés le même jour, et le compte de résultat
    chargeait un seul mois de toute l'année.

    Règle : la date fournie si l'école la précise ; sinon le dernier jour du
    mois concerné, qui est la pratique — on paie en fin de mois. Jamais une
    date postérieure à aujourd'hui : on n'enregistre pas un versement qui
    n'a pas encore eu lieu.
    """
    if date_versement:
        if date_versement > date_type.today():
            raise HTTPException(400, "Date de versement dans le futur : "
                                     "un salaire ne s'enregistre pas à l'avance.")
        return date_versement
    try:
        annee, mois = (int(x) for x in mois_concerne.split("-")[:2])
    except (ValueError, AttributeError):
        return date_type.today()
    dernier = calendar.monthrange(annee, mois)[1]
    return min(date_type(annee, mois, dernier), date_type.today())


def _executer_paiement_salaire(db: Session, employe_id_str: str, mois_concerne: str, mode_paiement: str, etablissement_id: int, annee_id: int, date_versement: Optional[date_type] = None) -> dict:
    """Exécute réellement le paiement calculé (Dépense + Bulletin + écriture comptable + avances soldées).

    `etablissement_id` provient toujours de l'établissement authentifié de
    l'appelant (Depends(require_etablissement)), jamais d'une valeur par
    défaut ni d'un champ fourni par le client."""
    # ON NE PAIE PAS UN MOIS QUI N'EST PAS ENCORE ARRIVÉ
    # « On paie par mois, et ça bloque tant que le mois prochain n'est pas
    # venu. » Sans ce contrôle, régler septembre en août revient à verser un
    # salaire pour du travail qui n'a pas encore eu lieu — et à priver l'école
    # du seul garde-fou qu'elle avait : le calendrier.
    if mois_concerne > date_type.today().strftime("%Y-%m"):
        raise HTTPException(
            status_code=400,
            detail=f"Le mois {mois_concerne} n'est pas encore arrivé : "
                   f"un salaire ne se verse pas à l'avance.",
        )

    calc = _calculer_salaire(db, employe_id_str, mois_concerne, etablissement_id)
    if calc["statut"] == "PAYE":
        raise HTTPException(status_code=400, detail=f"{calc['nom_complet']} est déjà payé(e) pour {mois_concerne}")
    if calc.get("avant_embauche"):
        raise HTTPException(
            status_code=400,
            detail=f"{calc['nom_complet']} a été embauché(e) le "
                   f"{calc['date_embauche']} : rien n'est dû pour {mois_concerne}.",
        )
    if calc["net_a_payer"] <= 0:
        raise HTTPException(status_code=400, detail="Le net à payer calculé est nul ou négatif")

    jour = _jour_de_versement(mois_concerne, date_versement)
    libelle = f"Salaire {calc['nom_complet']} — {mois_concerne}"
    dep = Depense(
        etablissement_id=etablissement_id, annee_id=annee_id, categorie="SALAIRES",
        libelle=libelle[:300], montant=calc["net_a_payer"], date_depense=jour,
        fournisseur=employe_id_str, statut="VALIDE",
    )
    db.add(dep)
    db.flush()

    compte_charge = compte_charge_pour_categorie("SALAIRES")
    generer_ecriture_auto(
        db, date_ecriture=dep.date_depense, journal_code="OD",
        libelle=libelle, reference=f"SAL-{dep.depense_id}",
        lignes=[
            {"compte": compte_charge, "debit": float(dep.montant), "credit": 0, "description": libelle},
            {"compte": COMPTE_BANQUE, "debit": 0, "credit": float(dep.montant), "description": libelle},
        ],
        etablissement_id=dep.etablissement_id,
    )

    bulletin = BulletinPaie(
        employe_id=calc["employe_pk"], mois_concerne=mois_concerne,
        salaire_base=calc["salaire_base"], total_primes=calc["total_primes"],
        total_absences=calc["total_absences"], total_avances=calc["total_avances"],
        net_a_payer=calc["net_a_payer"], date_paiement=jour,
        mode_paiement=mode_paiement, statut="PAYE",
        details_absences=calc.get("details_absences")
    )
    db.add(bulletin)
    db.flush()
    dep.reference = str(bulletin.bulletin_id)  # lien pour pouvoir annuler proprement plus tard

    # Les avances soldees sont celles qui viennent d etre retenues : memes
    # conditions que le calcul, sinon une avance deduite du net resterait
    # EN_ATTENTE et serait retenue une seconde fois le mois suivant.
    db.query(Avance).filter(
        Avance.employe_id == calc["employe_pk"],
        Avance.statut == "EN_ATTENTE",
        or_(Avance.date_avance.is_(None),
            Avance.date_avance <= _jour_de_versement(mois_concerne)),
    ).update({"statut": "DEDUITE"}, synchronize_session=False)

    db.commit()
    _invalidate_dashboard_cache(etablissement_id, annee_id)
    return {"message": f"Salaire de {calc['nom_complet']} payé avec succès ({mois_concerne})", "net_a_payer": calc["net_a_payer"]}


from datetime import date
from app.models.academique import ParametreEtablissement

@router.get("/salaires/calculer")
def calculer_salaires_endpoint(
    mois_concerne: str = None,
    db: Session = Depends(get_db),
    etablissement_id: int = Depends(require_etablissement),
):
    """
    Calcule les salaires pour le mois concerné.
    """
    if not mois_concerne:
        mois_concerne = date_type.today().strftime("%Y-%m")

    refs = _lister_employes_actifs(db, etablissement_id)
    result = []

    for ref in refs:
        try:
            calc = _calculer_salaire(db, ref, mois_concerne, etablissement_id)
            result.append({
                "employe_id": ref,
                "nom": calc["nom"],
                "prenom": calc["prenom"],
                "poste": calc["poste"],
                "salaire_base": calc["salaire_base"],
                "total_primes": calc["total_primes"],
                "total_absences": calc["total_absences"],
                "total_avances": calc["total_avances"],
                "net_a_payer": calc["net_a_payer"],
                "statut": calc["statut"],
                "deja_paye": calc["statut"] == "PAYE",
                "mode_remuneration": calc.get("mode_remuneration", "MENSUEL"),
                "total_heures": calc.get("total_heures", 0.0),
                "explication_salaire": calc.get("explication_salaire", ""),
                "erreur": None,
            })
        except Exception as e:
            # Cette boucle faisait `continue` : l'employe dont le calcul echouait
            # disparaissait purement et simplement du tableau. Le comptable payait
            # cinq personnes sur six en croyant avoir tout paye, et rien a l'ecran
            # ne le lui disait. On garde donc la ligne, avec sa raison.
            db.rollback()
            result.append({
                "employe_id": ref,
                "nom": ref, "prenom": "", "poste": "—",
                "salaire_base": 0, "total_primes": 0,
                "total_absences": 0, "total_avances": 0,
                "net_a_payer": 0,
                "statut": "ERREUR", "deja_paye": False,
                "mode_remuneration": "", "total_heures": 0.0,
                "explication_salaire": "",
                "erreur": str(getattr(e, "detail", None) or e)[:200],
            })

    return result

@router.get("/salaires/date-paie")
def get_date_paie_endpoint(mois_concerne: str = None, db: Session = Depends(get_db), etablissement_id: int = Depends(require_etablissement)):
    if not mois_concerne:
        return {"date_paie": None, "mois": mois_concerne}
    cle = f"finance.date_paie_{mois_concerne}"
    param = db.query(ParametreEtablissement).filter(
        ParametreEtablissement.etablissement_id == etablissement_id,
        ParametreEtablissement.categorie == 'FINANCE',
        ParametreEtablissement.cle == cle
    ).first()
    if param:
        return {"date_paie": param.valeur, "mois": mois_concerne}
    return {"date_paie": f"{mois_concerne}-25", "mois": mois_concerne}

@router.put("/salaires/date-paie")
def put_date_paie_endpoint(data: dict, db: Session = Depends(get_db), etablissement_id: int = Depends(require_etablissement)):
    mois = data.get("mois")
    date_paie = data.get("date_paie")
    if not mois or not date_paie:
        raise HTTPException(status_code=400, detail="Mois et date_paie requis")
        
    cle = f"finance.date_paie_{mois}"
    param = db.query(ParametreEtablissement).filter(
        ParametreEtablissement.etablissement_id == etablissement_id,
        ParametreEtablissement.categorie == 'FINANCE',
        ParametreEtablissement.cle == cle
    ).first()
    
    if param:
        param.valeur = date_paie
    else:
        param = ParametreEtablissement(
            etablissement_id=etablissement_id,
            categorie='FINANCE',
            cle=cle,
            valeur=date_paie
        )
        db.add(param)
    db.commit()
    return {"date_paie": date_paie, "mois": mois}

@router.post("/salaires/payer-group")
def payer_group_endpoint(
    mois_concerne: str = None,
    # « Cash » n'appartient a aucune liste de reference : ce defaut ecrivait un
    # mode que les totaux par mode ne savaient pas classer, et la depense
    # salariale disparaissait du rapprochement de caisse.
    mode_paiement: str = "ESPECES",
    # Jour réel du versement. Sans lui, la paie d'un mois passé se datait du
    # jour de la saisie : voir `_jour_de_versement`.
    date_versement: Optional[date_type] = None,
    db: Session = Depends(get_db),
    etablissement_id: int = Depends(require_etablissement),
):
    if not mois_concerne:
        mois_concerne = date_type.today().strftime("%Y-%m")

    # `annee_id=1` etait code en dur : l'ecole n°37 enregistrait ses depenses de
    # salaires sur l'annee scolaire n°1, qui appartient a la premiere ecole
    # inscrite. C'est l'annee EN COURS DE CETTE ECOLE qui fait foi.
    annee_id = resoudre_annee(db, etablissement_id, None)
    mode_paiement = exiger_mode_paiement(mode_paiement)

    refs = _lister_employes_actifs(db, etablissement_id)
    payes, ignores, echecs = [], [], []

    for ref in refs:
        try:
            calc = _calculer_salaire(db, ref, mois_concerne, etablissement_id)
            if calc["statut"] == "PAYE":
                ignores.append({"nom": calc["nom_complet"], "raison": "deja paye ce mois"})
                continue
            if calc["net_a_payer"] <= 0:
                ignores.append({"nom": calc["nom_complet"], "raison": "aucun montant a verser"})
                continue
            _executer_paiement_salaire(
                db=db,
                employe_id_str=ref,
                mois_concerne=mois_concerne,
                mode_paiement=mode_paiement,
                etablissement_id=etablissement_id,
                annee_id=annee_id,
                date_versement=date_versement,
            )
            payes.append({"nom": calc["nom_complet"], "montant": calc["net_a_payer"]})
        except Exception as e:
            # `except: pass` renvoyait « 3 salaires payes » sans jamais dire que
            # deux autres avaient echoue. Un paiement qui ne passe pas doit se
            # voir : c'est de l'argent que quelqu'un attend.
            db.rollback()
            echecs.append({
                "employe_id": ref,
                "raison": str(getattr(e, "detail", None) or e)[:200],
            })

    message = f"{len(payes)} salaire(s) paye(s)"
    if ignores:
        message += f", {len(ignores)} sans rien a verser"
    if echecs:
        message += f", {len(echecs)} EN ECHEC"
    return {
        "message": message + ".",
        "payes": payes,
        "ignores": ignores,
        "echecs": echecs,
        "total_verse": round(sum(p["montant"] for p in payes), 2),
    }


def _derniers_mois(n: int):
    """Liste des n derniers mois (format YYYY-MM), du plus ancien au plus récent,
    en remontant depuis le mois en cours (inclus)."""
    today = date_type.today()
    mois = []
    annee, m = today.year, today.month
    for _ in range(n):
        mois.append(f"{annee:04d}-{m:02d}")
        m -= 1
        if m == 0:
            m = 12
            annee -= 1
    return list(reversed(mois))


def _mois_entre(debut: str, fin: str):
    """Liste des mois (YYYY-MM) de `debut` à `fin` inclus, dans l'ordre chronologique."""
    a1, m1 = (int(x) for x in debut.split("-"))
    a2, m2 = (int(x) for x in fin.split("-"))
    mois = []
    a, m = a1, m1
    while (a, m) <= (a2, m2):
        mois.append(f"{a:04d}-{m:02d}")
        m += 1
        if m == 13:
            m = 1
            a += 1
    return mois


def _mois_periode_paie(db: Session, etablissement_id: int, nb_mois_fallback: int):
    """
    Période sur laquelle les salaires sont considérés dus, telle que configurée dans
    Paramètres > Finance & Comptabilité > Salaires (ss_parametres, finance.salaires_mois_*).

    UNE ANNÉE SCOLAIRE NE FAIT PAS DOUZE MOIS
    Sans configuration, on retombait sur douze mois glissants. Or l'année de
    TrillionX va d'octobre à juin : neuf mois. Le comptable se voyait donc
    proposer juillet, août et septembre — des mois où l'école ne paie personne —
    et un employé arrivé en cours d'année réclamait des salaires antérieurs à
    la rentrée elle-même.

    À défaut de réglage explicite, on borne donc sur l'ANNÉE SCOLAIRE EN COURS
    de cette école, et jamais au-delà du mois d'aujourd'hui. Les douze mois
    glissants ne servent plus que d'ultime repli, quand aucune année n'est
    ouverte.
    """
    settings = get_finance_settings(db, etablissement_id)
    mois_debut = (settings.get("salaires_mois_debut") or "").strip()
    if not mois_debut:
        annee = db.query(AnneeScolaire).filter(
            AnneeScolaire.etablissement_id == etablissement_id,
            AnneeScolaire.est_courante == "O",
        ).first()
        if annee and annee.date_debut and annee.date_fin:
            debut = annee.date_debut.strftime("%Y-%m")
            fin = min(annee.date_fin.strftime("%Y-%m"),
                      date_type.today().strftime("%Y-%m"))
            return _mois_entre(debut, fin) if debut <= fin else []
        return _derniers_mois(nb_mois_fallback)
    mois_fin = (settings.get("salaires_mois_fin") or "").strip() or date_type.today().strftime("%Y-%m")
    mois_courant = date_type.today().strftime("%Y-%m")
    if mois_fin > mois_courant:
        mois_fin = mois_courant  # jamais au-delà du mois en cours
    if mois_debut > mois_fin:
        return []
    return _mois_entre(mois_debut, mois_fin)


@router.get("/salaires/arrieres/{employe_id_str}")
def arrieres_salaire_endpoint(
    employe_id_str: str,
    nb_mois: int = 12,
    db: Session = Depends(get_db),
    etablissement_id: int = Depends(require_etablissement),
):
    """
    Liste, pour un employé, tous les mois de la période de paie configurée (Paramètres
    > Finance > Salaires ; à défaut, les `nb_mois` derniers mois glissants) qui restent
    NON payés avec un net à payer positif — permet au comptable de régler un ou
    plusieurs mois de retard manuellement, ou la totalité en un clic, plutôt que d'être
    limité au seul mois actuellement sélectionné dans le calendrier de paie.

    LES MOIS D'AVANT L'ARRIVÉE NE SONT PAS DES ARRIÉRÉS
    Cette liste parcourait les douze derniers mois sans jamais regarder la date
    d'embauche. Un comptable recruté le jour même s'affichait avec « Mois en
    retard (12) — Total dû : 12 000 000 GNF », et un clic suffisait à lui
    verser une année de salaire pour du travail qu'il n'a pas fourni.
    """
    mois_du = []
    total_du = 0.0
    ignores_avant_embauche = 0
    embauche = None
    for mois in _mois_periode_paie(db, etablissement_id, nb_mois):
        try:
            calc = _calculer_salaire(db, employe_id_str, mois, etablissement_id)
        except HTTPException:
            continue
        if calc.get("avant_embauche"):
            ignores_avant_embauche += 1
            embauche = calc.get("date_embauche")
            continue
        if calc["statut"] != "PAYE" and calc["net_a_payer"] > 0:
            mois_du.append({
                "mois_concerne": mois,
                "salaire_base": calc["salaire_base"],
                "total_primes": calc["total_primes"],
                "total_absences": calc["total_absences"],
                "total_avances": calc["total_avances"],
                "net_a_payer": calc["net_a_payer"],
            })
            total_du += calc["net_a_payer"]
    return {
        "mois_du": mois_du,
        "total_du": round(total_du, 2),
        # L'écran doit pouvoir expliquer pourquoi la liste est courte : « 11
        # mois écartés, arrivé le 14/08/2026 » vaut mieux qu'une liste vide
        # dont on se demande si elle est juste.
        "mois_avant_embauche": ignores_avant_embauche,
        "date_embauche": embauche,
    }


@router.post("/salaires/payer-plusieurs-mois")
def payer_plusieurs_mois_endpoint(data: dict, db: Session = Depends(get_db), etablissement_id: int = Depends(require_etablissement)):
    """
    Règle en une seule action une sélection de mois en retard pour un même employé
    (paiement manuel mois par mois, ou totalité des arriérés cochés en un clic) —
    un BulletinPaie + une écriture comptable distincts sont générés par mois, comme
    pour un paiement individuel classique.
    """
    employe_id_str = data.get("enseignant_id") or data.get("employe_id")
    mois_list = data.get("mois_list") or []
    # Mêmes corrections que sur le paiement individuel : mode normalisé et
    # année scolaire de CETTE école.
    mode_paiement = exiger_mode_paiement(data.get("mode_paiement") or "ESPECES")
    annee_id = resoudre_annee(db, etablissement_id, data.get("annee_id"))
    date_versement = _lire_date(data.get("date_versement"))

    if not employe_id_str or not mois_list:
        raise HTTPException(status_code=400, detail="employe_id et mois_list requis")

    payes, erreurs = [], []
    total_paye = 0.0
    for mois in mois_list:
        try:
            result = _executer_paiement_salaire(
                db=db, employe_id_str=employe_id_str, mois_concerne=mois,
                mode_paiement=mode_paiement, etablissement_id=etablissement_id,
                annee_id=annee_id, date_versement=date_versement,
            )
            payes.append({"mois": mois, "net_a_payer": result.get("net_a_payer")})
            total_paye += float(result.get("net_a_payer") or 0)
        except HTTPException as e:
            erreurs.append({"mois": mois, "detail": e.detail})
        except Exception as e:
            erreurs.append({"mois": mois, "detail": str(e)})

    return {
        "message": f"{len(payes)} mois payé(s), {len(erreurs)} erreur(s)",
        "payes": payes, "erreurs": erreurs, "total_paye": round(total_paye, 2),
    }


@router.post("/primes")
def primes_endpoint(data: dict, db: Session = Depends(get_db), etablissement_id: int = Depends(require_etablissement)):
    employe_id_str = data.get("employe_id")
    montant = data.get("montant")
    motif = data.get("motif") or "Prime exceptionnelle"
    mois = data.get("mois_concerne")
    if not employe_id_str or not montant or not mois:
        raise HTTPException(status_code=400, detail="Données incomplètes (employe_id, montant, mois_concerne)")

    infos = _identifier_employe(employe_id_str, db, etablissement_id)
    employe = _get_or_sync_employe_paie(db, employe_id_str, infos, etablissement_id)

    prime = Prime(
        employe_id=employe.employe_id,
        montant=float(montant),
        motif=motif,
        mois_concerne=mois
    )
    db.add(prime)
    
    # Trace the prime directly as an expense for immediate accounting if needed, 
    # but wait, a prime is paid WITH the salary, so it shouldn't be a separate expense today.
    # It just increases the net salary on payday.
    
    db.commit()
    return {"message": "Prime ajoutée avec succès"}
@router.post("/avances")
def avances_endpoint(data: dict, db: Session = Depends(get_db), etablissement_id: int = Depends(require_etablissement)):
    employe_id_str = data.get("employe_id")
    montant = data.get("montant")
    motif = data.get("motif") or "Avance sur salaire"
    mois = data.get("mois_concerne") or date_type.today().strftime("%Y-%m")
    if not employe_id_str or not montant:
        raise HTTPException(status_code=400, detail="Données incomplètes")

    infos = _identifier_employe(employe_id_str, db, etablissement_id)
    employe = _get_or_sync_employe_paie(db, employe_id_str, infos, etablissement_id)
    
    avance = Avance(
        employe_id=employe.employe_id,
        montant=float(montant),
        date_avance=date_type.today(),
        mois_concerne=mois,
        statut="EN_ATTENTE"
    )
    db.add(avance)
    
    # Une avance, c'est de l'argent qui sort de la caisse aujourd'hui : elle
    # devient une dépense immédiatement. Sur l'année de CETTE école — `1` était
    # l'année de la première école inscrite, donc une dépense invisible dans la
    # comptabilité de celle qui l'a réellement versée.
    dep = Depense(
        etablissement_id=etablissement_id,
        annee_id=resoudre_annee(db, etablissement_id, None),
        categorie="AVANCE_SALAIRE",
        libelle=f"{motif} {infos['nom']} {infos['prenom']} — {mois}",
        montant=float(montant),
        date_depense=date_type.today(),
        fournisseur=employe_id_str,
        statut="VALIDE",
    )
    db.add(dep)
    
    compte_charge = compte_charge_pour_categorie("AVANCE_SALAIRE")
    generer_ecriture_auto(
        db, date_ecriture=dep.date_depense, journal_code="OD",
        libelle=dep.libelle, reference=f"ADV",
        lignes=[
            {"compte": compte_charge, "debit": float(dep.montant), "credit": 0, "description": dep.libelle},
            {"compte": COMPTE_BANQUE, "debit": 0, "credit": float(dep.montant), "description": dep.libelle},
        ],
        etablissement_id=dep.etablissement_id,
    )
    
    db.commit()
    return {"message": "Avance enregistrée avec succès"}
@router.post("/absences")
def absences_endpoint(data: dict, db: Session = Depends(get_db), etablissement_id: int = Depends(require_etablissement)):
    employe_id_str = data.get("employe_id")
    date_absence = data.get("date_absence")
    motif = data.get("motif")
    est_justifie = "Y" if data.get("est_justifie") else "N"

    if not employe_id_str or not date_absence:
        raise HTTPException(status_code=400, detail="Données incomplètes")

    infos = _identifier_employe(employe_id_str, db, etablissement_id)
    employe = _get_or_sync_employe_paie(db, employe_id_str, infos, etablissement_id)
    
    absence = AbsencePersonnel(
        employe_id=employe.employe_id,
        date_absence=date_type.fromisoformat(date_absence),
        motif=motif,
        est_justifie=est_justifie
    )
    db.add(absence)
    db.commit()
    return {"message": "Absence enregistrée avec succès"}
@router.get("/salaires/historique/{employe_id}")
def historique_salaire_endpoint(employe_id: str, db: Session = Depends(get_db), etablissement_id: int = Depends(require_etablissement)):
    historique = db.query(Depense).filter(
        Depense.fournisseur == employe_id,
        Depense.categorie == "SALAIRES",
        Depense.statut == "VALIDE",
        Depense.etablissement_id == etablissement_id,
    ).order_by(Depense.date_depense.desc()).all()
    
    return [
        {
            "depense_id": dep.depense_id,
            "date_paiement": dep.date_depense.isoformat() if dep.date_depense else None,
            "montant": float(dep.montant),
            "libelle": dep.libelle,
            "statut": dep.statut,
        }
        for dep in historique
    ]

@router.get("/salaires/bulletin-detail/{depense_id}")
def bulletin_detail_endpoint(depense_id: int, db: Session = Depends(get_db), etablissement_id: int = Depends(require_etablissement)):
    dep = db.query(Depense).filter(
        Depense.depense_id == depense_id, Depense.etablissement_id == etablissement_id
    ).first()
    if not dep:
        raise HTTPException(status_code=404, detail="Paiement introuvable")

    bulletin = None
    if dep.reference and dep.reference.isdigit():
        bulletin = db.query(BulletinPaie).filter(BulletinPaie.bulletin_id == int(dep.reference)).first()

    infos = _identifier_employe(dep.fournisseur, db, etablissement_id)
    
    if bulletin:
        employe_id = bulletin.employe_id
        primes = db.query(Prime).filter(Prime.employe_id == employe_id, Prime.mois_concerne == bulletin.mois_concerne).all()
        absences = db.query(AbsencePersonnel).filter(AbsencePersonnel.employe_id == employe_id, func.to_char(AbsencePersonnel.date_absence, 'YYYY-MM') == bulletin.mois_concerne).all()
        
        return {
            "bulletin": {
                "bulletin_id": bulletin.bulletin_id,
                "mois_concerne": bulletin.mois_concerne,
                "net_a_payer": float(bulletin.net_a_payer),
                "date_paiement": bulletin.date_paiement.isoformat() if bulletin.date_paiement else None,
                "mode_paiement": bulletin.mode_paiement,
                "salaire_base": float(bulletin.salaire_base),
                "total_primes": float(bulletin.total_primes),
                "total_absences": float(bulletin.total_absences),
                "total_avances": float(bulletin.total_avances)
            },
            "employe": {
                "nom": infos["nom"],
                "prenom": infos["prenom"],
                "poste": infos["poste"],
                "type_contrat": infos["type_contrat"],
                "mobile_money": infos["mobile_money"],
            },
            "details": {
                "primes": [{"montant": float(p.montant), "motif": p.motif} for p in primes],
                "absences": [{"date": a.date_absence.isoformat(), "motif": a.motif} for a in absences],
                "details_absences_texte": bulletin.details_absences
            }
        }
    
    # Fallback for old payments without BulletinPaie
    return {
        "bulletin": {
            "bulletin_id": dep.depense_id,
            "mois_concerne": dep.date_depense.strftime("%Y-%m") if dep.date_depense else "",
            "net_a_payer": float(dep.montant),
            "date_paiement": dep.date_depense.isoformat() if dep.date_depense else None,
            "mode_paiement": "VIREMENT",
            "salaire_base": float(dep.montant),
            "total_primes": 0,
            "total_absences": 0,
            "total_avances": 0
        },
        "employe": {
            "nom": infos["nom"],
            "prenom": infos["prenom"],
            "poste": infos["poste"],
        },
        "details": {
            "primes": [],
            "absences": [],
            "details_absences_texte": None
        }
    }

@router.get("/salaires/absences-source")
def absences_source_endpoint(
    mois_concerne: str = None,
    employe_id: str = None,
    db: Session = Depends(get_db),
    etablissement_id: int = Depends(require_etablissement),
):
    """
    Détaille, pour le mois donné, chaque absence retenue sur salaire (pointage
    QR ABSENT + saisie manuelle non justifiée), avec la retenue estimée
    correspondante — mêmes deux sources et même taux journalier que
    `_calculer_salaire` (onglet "Calcul des salaires"), pour que ce tableau de
    diagnostic reste cohérent avec le montant réellement déduit du net à payer.
    """
    if not mois_concerne:
        mois_concerne = date_type.today().strftime("%Y-%m")
    debut_mois, fin_mois = _bornes_mois(mois_concerne)

    refs = [employe_id] if employe_id else _lister_employes_actifs(db, etablissement_id)

    absences = []
    total_retenue = 0.0
    for ref in refs:
        try:
            infos = _identifier_employe(ref, db, etablissement_id)
        except HTTPException:
            continue
        employe = _get_or_sync_employe_paie(db, ref, infos, etablissement_id)
        taux_journalier = infos["salaire_base"] / JOURS_OUVRABLES_MOIS if infos["salaire_base"] else 0

        pointages = db.query(PresenceAgent).filter(
            PresenceAgent.type_agent == infos["type_agent"],
            PresenceAgent.agent_id == infos["agent_id"],
            PresenceAgent.statut == "ABSENT",
            PresenceAgent.date_presence >= debut_mois,
            PresenceAgent.date_presence <= fin_mois,
        ).order_by(PresenceAgent.date_presence).all()
        for p in pointages:
            retenue = round(taux_journalier, 2)
            absences.append({
                "absence_id": f"presence-{p.presence_id}",
                "nom": infos["nom"], "prenom": infos["prenom"], "poste": infos["poste"],
                "date_absence": p.date_presence.isoformat() if p.date_presence else None,
                "source": "Pointage QR", "motif": None, "est_justifie": "N",
                "retenue_estimee": retenue,
            })
            total_retenue += retenue

        manuelles = db.query(AbsencePersonnel).filter(
            AbsencePersonnel.employe_id == employe.employe_id,
            AbsencePersonnel.est_justifie == "N",
            AbsencePersonnel.date_absence >= debut_mois,
            AbsencePersonnel.date_absence <= fin_mois,
        ).order_by(AbsencePersonnel.date_absence).all()
        for a in manuelles:
            retenue = round(taux_journalier, 2)
            absences.append({
                "absence_id": f"manuelle-{a.absence_id}",
                "nom": infos["nom"], "prenom": infos["prenom"], "poste": infos["poste"],
                "date_absence": a.date_absence.isoformat() if a.date_absence else None,
                "source": "Saisie manuelle", "motif": a.motif, "est_justifie": "N",
                "retenue_estimee": retenue,
            })
            total_retenue += retenue

    absences.sort(key=lambda r: r["date_absence"] or "")
    return {"absences": absences, "total_retenue_estimee": round(total_retenue, 2)}

@router.get("/salaires/alertes/historique")
def alertes_historique_endpoint(mois_concerne: str = None, db: Session = Depends(get_db), etablissement_id: int = Depends(require_etablissement)):
    """Historique réel des envois d'alertes de paie (persistés via Message, même
    mécanisme que les rappels d'impayés — voir notifier_impayes).

    Gap comblé au Lot 5 (Communication) : Message porte désormais
    etablissement_id (voir migrations/lot5_communication_etablissement.py)."""
    query = db.query(Message).filter(
        Message.objet_type == "PAIEMENT", Message.sujet.like("Alerte paie%"),
        Message.etablissement_id == etablissement_id,
    )
    if mois_concerne:
        query = query.filter(Message.sujet == f"Alerte paie {mois_concerne}")
    rows = query.order_by(Message.date_envoi.desc()).limit(50).all()
    return [
        {
            "message_id": m.message_id,
            "date_envoi": m.date_envoi.isoformat() if m.date_envoi else None,
            "destinataire_type": m.destinataire_type,
            "sujet": m.sujet,
            "statut": m.statut,
            "contenu": m.contenu,
        }
        for m in rows
    ]

@router.post("/salaires/alertes")
def alertes_endpoint(data: dict, db: Session = Depends(get_db), etablissement_id: int = Depends(require_etablissement)):
    """Envoie une alerte de paie (rappel interne) et persiste la trace de l'envoi,
    avec la liste des employés encore non payés pour le mois concerné."""
    mois_concerne = data.get("mois_concerne")
    type_alerte = data.get("type", "J7")
    if not mois_concerne:
        raise HTTPException(status_code=400, detail="mois_concerne requis")

    refs = _lister_employes_actifs(db, etablissement_id)
    non_payes = []
    for ref in refs:
        try:
            calc = _calculer_salaire(db, ref, mois_concerne, etablissement_id)
        except HTTPException:
            continue
        if calc["statut"] != "PAYE":
            non_payes.append(calc["nom_complet"])

    message = Message(
        etablissement_id=etablissement_id,
        expediteur_type="ADMIN",
        destinataire_type="TOUS_ENSEIGNANTS",
        objet_type="PAIEMENT",
        sujet=f"Alerte paie {mois_concerne}",
        contenu=f"Type {type_alerte} — {len(non_payes)} employé(s) non payé(s) pour {mois_concerne}"
                + (f" : {', '.join(non_payes)}" if non_payes else ""),
        statut="ENVOYE",
    )
    db.add(message)
    db.commit()
    return {"message": "Alerte envoyée avec succès", "type": type_alerte, "nb_non_payes": len(non_payes)}


@router.delete("/salaires/{depense_id}")
def annuler_salaire(depense_id: int, db: Session = Depends(get_db), etablissement_id: int = Depends(require_etablissement)):
    """Annule un paiement de salaire (et le bulletin de paie associé, pour permettre un nouveau paiement)."""
    dep = db.query(Depense).filter(
        Depense.depense_id == depense_id,
        Depense.categorie == "SALAIRES",
        Depense.etablissement_id == etablissement_id,
    ).first()
    if not dep:
        raise HTTPException(status_code=404, detail="Paiement introuvable")
    dep.statut = "ANNULE"
    if dep.reference:
        try:
            bulletin = db.query(BulletinPaie).filter(BulletinPaie.bulletin_id == int(dep.reference)).first()
            if bulletin:
                bulletin.statut = "ANNULE"
        except ValueError:
            pass
    db.commit()
    return {"message": "Paiement annulé"}


# ════════════════════════════════════════════════════════════════════════
# RÉMUNÉRATION — au mois ou à l'heure
# ════════════════════════════════════════════════════════════════════════
# Un enseignant portait un seul taux horaire, le même partout : impossible
# d'exprimer qu'une heure de Terminale ne se paie pas comme une heure de 7ᵉ.
# Et rien ne distinguait l'instituteur du primaire, payé au mois, du vacataire
# du collège payé à l'heure.
#
# Le calcul vit dans `app/services/paie.py` — jamais réécrit ici, sous peine de
# voir deux chiffres différents pour le même salaire selon l'écran consulté.


from pydantic import BaseModel as _BaseModel


class TauxAffectation(_BaseModel):
    """Exception de tarif sur une affectation précise.

    `None` et `0` ne sont PAS équivalents : `None` remet le taux de
    l'enseignant, `0` signifie que cette heure n'est pas rémunérée (bénévolat,
    forfait déjà couvert).
    """
    taux_horaire: Optional[float] = None


@router.get("/remuneration/enseignant/{enseignant_id}")
def remuneration_enseignant(
    enseignant_id: int,
    db: Session = Depends(get_db),
    etablissement_id: int = Depends(require_etablissement),
):
    """Rémunération mensuelle d'un enseignant, avec le détail de ses heures.

    Le détail est renvoyé même en mode MENSUEL : l'école doit pouvoir voir la
    charge réelle d'un instituteur, même si elle ne détermine pas sa paie. Un
    total sans son détail n'est pas contestable, donc pas vérifiable.
    """
    from app.services import paie as _paie

    ens = db.query(Enseignant).filter(
        Enseignant.enseignant_id == enseignant_id,
        Enseignant.etablissement_id == etablissement_id,
    ).first()
    if not ens:
        raise HTTPException(404, "Enseignant non trouvé")

    resultat = _paie.salaire_enseignant(
        db, enseignant_id, _paie.annee_courante_id(db, etablissement_id)
    )
    resultat["enseignant"] = f"{ens.prenom} {ens.nom}"
    resultat["taux_reference"] = float(ens.taux_horaire or 0)
    resultat["salaire_mensuel"] = float(ens.salaire_base or 0)
    return resultat


@router.put("/remuneration/affectation/{affectation_id}/taux")
def definir_taux_affectation(
    affectation_id: int,
    data: TauxAffectation,
    db: Session = Depends(get_db),
    etablissement_id: int = Depends(require_etablissement),
):
    """Fixe — ou retire — l'exception de tarif d'une affectation."""
    aff = (
        db.query(Affectation)
        .join(Enseignant, Enseignant.enseignant_id == Affectation.enseignant_id)
        .filter(
            Affectation.affectation_id == affectation_id,
            Enseignant.etablissement_id == etablissement_id,
        )
        .first()
    )
    if not aff:
        raise HTTPException(404, "Affectation non trouvée")
    if data.taux_horaire is not None and data.taux_horaire < 0:
        raise HTTPException(400, "Un taux horaire ne peut pas être négatif.")

    aff.taux_horaire = data.taux_horaire
    db.commit()
    return {
        "message": ("Tarif spécifique enregistré." if data.taux_horaire is not None
                    else "Tarif spécifique retiré : le taux de l'enseignant s'applique."),
        "affectation_id": affectation_id,
        "taux_horaire": data.taux_horaire,
    }


@router.get("/remuneration/preparer")
def preparer_la_paie(
    db: Session = Depends(get_db),
    etablissement_id: int = Depends(require_etablissement),
):
    """UNE seule préparation de paie : enseignants ET personnel.

    Les deux populations étaient calculées par des chemins séparés, obligeant
    le comptable à faire deux fois le travail sans jamais pouvoir recouper le
    total. Ici, tout le monde figure dans la même liste, avec la raison de son
    montant.
    """
    from app.services import paie as _paie

    annee_id = _paie.annee_courante_id(db, etablissement_id)
    lignes = []

    enseignants = db.query(Enseignant).filter(
        Enseignant.etablissement_id == etablissement_id,
        Enseignant.statut == "ACTIF",
    ).order_by(Enseignant.nom, Enseignant.prenom).all()

    # Un appel pour tout le monde, pas un par personne : la version en boucle
    # lancait quatre requetes par enseignant, soit plus de deux cents sur un
    # etablissement de cinquante employes — 1,6 seconde d'affichage quand les
    # autres ecrans repondent en 200 ms. Le cout ne depend plus de l'effectif.
    salaires = _paie.salaires_enseignants(
        db, [e.enseignant_id for e in enseignants], annee_id
    )

    for ens in enseignants:
        r = salaires.get(ens.enseignant_id) or {
            "mode": _paie.MODE_HORAIRE, "base": 0.0, "total_heures": 0.0, "lignes": []
        }
        lignes.append({
            "type": "ENSEIGNANT",
            "id": ens.enseignant_id,
            "nom": f"{ens.prenom} {ens.nom}",
            "fonction": "Enseignant",
            "mode": r["mode"],
            "base": r["base"],
            "total_heures": r["total_heures"],
            "explication": r.get("explication", ""),
            "nb_affectations": len(r["lignes"]),
        })

    # Le SUPER_ADMIN est l'editeur de la plateforme : il n'est pas salarie de
    # l'ecole et n'a donc rien a faire dans sa paie.
    for u in db.query(Utilisateur).filter(
        Utilisateur.etablissement_id == etablissement_id,
        Utilisateur.statut == "ACTIF",
        Utilisateur.role != "SUPER_ADMIN",
    ).order_by(Utilisateur.nom, Utilisateur.prenom).all():
        r = _paie.salaire_personnel(db, u.utilisateur_id)
        lignes.append({
            "type": "PERSONNEL",
            "id": u.utilisateur_id,
            "nom": f"{u.prenom} {u.nom}",
            "fonction": u.role,
            "mode": r["mode"],
            "base": r["base"],
            "total_heures": 0.0,
            "explication": r.get("explication", ""),
            "nb_affectations": 0,
        })

    # Les salaires non renseignes sont comptes a part : les noyer dans le total
    # laisserait croire que la paie est prete alors qu'il manque des montants.
    a_completer = [l for l in lignes if l["base"] <= 0]
    return {
        "lignes": lignes,
        "effectif": len(lignes),
        "total_a_payer": round(sum(l["base"] for l in lignes), 2),
        "a_completer": len(a_completer),
        "noms_a_completer": [l["nom"] for l in a_completer][:20],
    }
