"""
SMARTSCHOOL API — Réinscription V2 (Phase 2 de la refonte clôture/réinscription/tarifs)

Système INDÉPENDANT de la promotion (app/api/promotion.py) — pilote uniquement
`Inscription.statut_reinscription` sur les inscriptions dont la promotion a déjà
été validée (statut_promotion == "VALIDE"). 5 statuts : A_REINSCRIRE (défaut à
la validation) -> REINSCRIT (confirmé, matérialise la nouvelle inscription +
génère les frais) | NON_REINSCRIT | TRANSFERE | ABANDON (statuts terminaux,
traçabilité seulement, aucune Inscription créée).

C'est le SEUL endroit qui crée l'Inscription de l'année suivante — la
promotion (Phase 2, promotion.py) ne fait que la PROPOSER (classe_cible_id).
Aucune dette de l'année précédente n'est recopiée : la nouvelle Inscription et
ses factures sont indépendantes de l'ancienne.
"""
from datetime import date
from typing import Dict, List, Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.core.database import get_db
from app.core.auth import require_etablissement
from app.models.academique import Inscription, Eleve, Classe, Facture, EcheanceFacture, TypeFrais, TarifClasse
from app.core.annee_lock import verifier_annee_modifiable as _verifier_annee_modifiable
from app.core.numerotation import generer_numero_facture

router = APIRouter(prefix="/api/reinscription", tags=["Réinscription V2"])

STATUTS_TERMINAUX = ("NON_REINSCRIT", "TRANSFERE", "ABANDON")


# ── Helpers d'isolation (Lot 9) ───────────────────────────────────────────

def _classe_ou_404(db: Session, classe_id: int, etablissement_id: int) -> Classe:
    c = db.query(Classe).filter(
        Classe.classe_id == classe_id, Classe.etablissement_id == etablissement_id
    ).first()
    if not c:
        raise HTTPException(404, "Classe non trouvée")
    return c


def _inscription_ou_404(db: Session, inscription_id: int, etablissement_id: int) -> Inscription:
    """Inscription est OWNERSHIP via sa Classe."""
    insc = (
        db.query(Inscription)
        .join(Classe, Classe.classe_id == Inscription.classe_id)
        .filter(Inscription.inscription_id == inscription_id, Classe.etablissement_id == etablissement_id)
        .first()
    )
    if not insc:
        raise HTTPException(404, "Inscription non trouvée")
    return insc


def _est_frais_reinscription(categorie) -> bool:
    """Un frais de RÉinscription (élève qui continue dans l'école)."""
    c = (categorie or "").lower()
    return "réinscr" in c or "reinscr" in c


def _est_frais_inscription(categorie) -> bool:
    """Un frais d'inscription (nouvel élève) — sans confondre avec réinscription,
    dont « inscription » est un sous-mot."""
    c = (categorie or "").lower()
    return "inscription" in c and not _est_frais_reinscription(categorie)


def _generer_frais_reinscription(db: Session, inscription: Inscription, classe: Classe,
                                 etablissement_id: int, type_inscription: str = "NOUVELLE") -> int:
    """
    Génère les factures des frais OBLIGATOIRES configurés (TarifClasse) pour la
    classe cible — grille tarifaire réelle de l'année comme seule source de
    vérité (jamais un montant client, cohérent avec la correction de
    generer_factures_classe en Phase 1). Les frais facultatifs (ex: cantine) ne
    sont jamais générés automatiquement, cohérent avec le garde-fou
    `forcer_optionnel` déjà en place sur generer_factures_classe. Idempotent :
    ignore un type de frais déjà facturé sur cette inscription. Retourne le
    nombre de factures créées. Réutilisé par
    `POST /api/eleves/inscription-complete` (inscription d'un nouvel élève).

    `etablissement_id` EST UN PARAMÈTRE, et il doit le rester
    ----------------------------------------------------------
    Il était lu comme s'il venait du contexte : `NameError`, donc 500, sur la
    toute première facture. Le défaut restait invisible parce que la fonction
    sort avant (`if not tarifs: return 0`) quand la classe cible n'a aucun
    tarif — c'est-à-dire dans une école qui n'a pas encore posé sa grille. Une
    école qui travaille pour de vrai, elle, tombait dessus à chaque
    réinscription.
    """
    tarifs = db.query(TarifClasse, TypeFrais).join(
        TypeFrais, TarifClasse.type_frais_id == TypeFrais.type_frais_id
    ).filter(
        TarifClasse.classe_id == classe.classe_id,
        TypeFrais.est_obligatoire == "O",
        TypeFrais.statut == "ACTIF",
    ).all()
    if not tarifs:
        return 0

    deja_facture = {
        f.type_frais_id for f in db.query(Facture).filter(Facture.inscription_id == inscription.inscription_id).all()
    }

    # Frais d'ENTRÉE : un nouvel élève paie l'inscription, pas la réinscription ;
    # un élève qui continue paie la réinscription, pas l'inscription. On écarte
    # donc le frais d'entrée qui ne correspond pas au type d'inscription. La
    # scolarité et les autres frais obligatoires, eux, s'appliquent aux deux.
    est_reinscription = (type_inscription or "NOUVELLE").upper() == "REINSCRIPTION"

    created = 0
    for tarif, type_frais in tarifs:
        if type_frais.type_frais_id in deja_facture:
            continue
        if est_reinscription and _est_frais_inscription(type_frais.categorie):
            continue
        if not est_reinscription and _est_frais_reinscription(type_frais.categorie):
            continue
        montant = float(tarif.montant)
        numero_facture = generer_numero_facture(
            db, etablissement_id, inscription.annee_id
        )

        facture = Facture(
            inscription_id=inscription.inscription_id,
            annee_id=inscription.annee_id,
            type_frais_id=type_frais.type_frais_id,
            numero_facture=numero_facture,
            montant_total=montant,
            montant_remise=0,
            montant_net=montant,
            montant_paye=0,
            montant_restant=montant,
            statut="EN_ATTENTE",
        )
        db.add(facture)
        db.flush()

        db.add(EcheanceFacture(
            facture_id=facture.facture_id,
            libelle="Paiement unique",
            date_limite=date.today(),
            montant_attendu=montant,
            montant_paye=0,
            statut="EN_ATTENTE",
        ))
        created += 1

    return created


@router.get("/classe-cible/{classe_id}")
def liste_campagne_classe(classe_id: int, db: Session = Depends(get_db), etablissement_id: int = Depends(require_etablissement)):
    """
    Élèves en campagne de réinscription vers cette classe (classe_cible_id,
    proposé/validé par la promotion). Une fois REINSCRIT, affiche le statut de
    paiement des frais générés à la confirmation — purement informatif : la
    réinscription elle-même n'est jamais bloquée par le paiement (changement
    assumé par rapport à l'ancien système, voir confirmer_reinscription).
    """
    classe = _classe_ou_404(db, classe_id, etablissement_id)

    rows = db.query(Inscription, Eleve).join(
        Eleve, Inscription.eleve_id == Eleve.eleve_id
    ).filter(
        Inscription.classe_cible_id == classe_id,
        Inscription.statut_reinscription.isnot(None),
    ).order_by(Eleve.nom, Eleve.prenom).all()

    eleve_ids = [e.eleve_id for _, e in rows]
    nouvelles_inscriptions: Dict[int, Inscription] = {}
    if eleve_ids:
        nouvelles_inscriptions = {
            i.eleve_id: i for i in db.query(Inscription).filter(
                Inscription.eleve_id.in_(eleve_ids),
                Inscription.classe_id == classe_id,
                Inscription.statut == "ACTIVE",
            ).all()
        }

    factures_par_inscription: Dict[int, List[Facture]] = {}
    nouvelle_ids = [i.inscription_id for i in nouvelles_inscriptions.values()]
    if nouvelle_ids:
        for f in db.query(Facture).filter(Facture.inscription_id.in_(nouvelle_ids)).all():
            factures_par_inscription.setdefault(f.inscription_id, []).append(f)

    result = []
    for insc, eleve in rows:
        nouvelle = nouvelles_inscriptions.get(eleve.eleve_id)
        factures = factures_par_inscription.get(nouvelle.inscription_id, []) if nouvelle else []
        result.append({
            "eleve_id": eleve.eleve_id,
            "inscription_id": insc.inscription_id,
            "matricule": eleve.matricule,
            "nom": eleve.nom,
            "prenom": eleve.prenom,
            "sexe": eleve.sexe,
            "decision_fin_annee": insc.decision_fin_annee,
            "moyenne_annuelle": float(insc.moyenne_annuelle) if insc.moyenne_annuelle is not None else None,
            "statut_reinscription": insc.statut_reinscription,
            "nouvelle_inscription_id": nouvelle.inscription_id if nouvelle else None,
            "montant_du": sum(float(f.montant_net or 0) for f in factures),
            "montant_paye": sum(float(f.montant_paye or 0) for f in factures),
        })
    return result


@router.get("/en-attente-filiere/{annee_source_id}")
def liste_en_attente_filiere(annee_source_id: int, db: Session = Depends(get_db), etablissement_id: int = Depends(require_etablissement)):
    """
    Élèves de 10e année admis (décision EN_ATTENTE_FILIERE) dont la promotion
    est déjà validée mais qui n'ont pas encore de classe cible — ils sont donc
    invisibles de `GET /classe-cible/{id}` (filtré par classe_cible_id, qui est
    NULL pour eux). Une fois `PUT /api/promotion/eleve/{id}/choisir-filiere`
    appelé pour l'un d'eux, il sort naturellement de cette liste et apparaît
    dans la campagne normale de sa classe cible pour confirmation.
    """
    rows = db.query(Inscription, Eleve, Classe).join(
        Eleve, Inscription.eleve_id == Eleve.eleve_id
    ).join(
        Classe, Inscription.classe_id == Classe.classe_id
    ).filter(
        Inscription.annee_id == annee_source_id,
        Inscription.decision_fin_annee == "EN_ATTENTE_FILIERE",
        Inscription.classe_cible_id.is_(None),
        Inscription.statut_reinscription.isnot(None),
        Classe.etablissement_id == etablissement_id,
    ).order_by(Eleve.nom, Eleve.prenom).all()

    return [
        {
            "eleve_id": eleve.eleve_id,
            "inscription_id": insc.inscription_id,
            "matricule": eleve.matricule,
            "nom": eleve.nom,
            "prenom": eleve.prenom,
            "sexe": eleve.sexe,
            "classe_actuelle": classe.libelle,
            "moyenne_annuelle": float(insc.moyenne_annuelle) if insc.moyenne_annuelle is not None else None,
        }
        for insc, eleve, classe in rows
    ]


@router.get("/etat/{annee_cible_id}")
def etat_reinscription_annee(annee_cible_id: int, db: Session = Depends(get_db), etablissement_id: int = Depends(require_etablissement)):
    """
    Comptage des réinscriptions par statut pour une année cible, toutes
    classes DE CET ÉTABLISSEMENT confondues — vue d'ensemble pour l'assistant
    de clôture (Phase 4), sans avoir à interroger classe par classe.
    """
    classes_cible_ids = [c.classe_id for c in db.query(Classe).filter(
        Classe.annee_id == annee_cible_id, Classe.etablissement_id == etablissement_id
    ).all()]
    if not classes_cible_ids:
        return {"total": 0, "par_statut": {}}

    inscriptions = db.query(Inscription).filter(
        Inscription.classe_cible_id.in_(classes_cible_ids),
        Inscription.statut_reinscription.isnot(None),
    ).all()

    par_statut: Dict[str, int] = {}
    for i in inscriptions:
        par_statut[i.statut_reinscription] = par_statut.get(i.statut_reinscription, 0) + 1

    return {"total": len(inscriptions), "par_statut": par_statut}


@router.post("/{inscription_id}/confirmer")
def confirmer_reinscription(inscription_id: int, db: Session = Depends(get_db), etablissement_id: int = Depends(require_etablissement)):
    """
    Matérialise la réinscription : crée la nouvelle Inscription (année/classe
    cible), réactive l'élève, incrémente l'effectif, génère les frais
    obligatoires de la nouvelle année. Tout en une seule transaction. Aucune
    dette/facture de l'année précédente n'est recopiée.
    """
    insc = _inscription_ou_404(db, inscription_id, etablissement_id)
    if insc.statut_promotion != "VALIDE":
        raise HTTPException(400, "La promotion de cet élève n'a pas encore été validée")
    if insc.statut_reinscription == "REINSCRIT":
        return {"message": "Cet élève est déjà réinscrit", "statut_reinscription": "REINSCRIT"}
    if insc.statut_reinscription not in ("A_REINSCRIRE", "NON_REINSCRIT"):
        raise HTTPException(400, f"Statut de réinscription actuel incompatible : {insc.statut_reinscription}")
    if not insc.classe_cible_id:
        raise HTTPException(400, "Aucune classe cible résolue pour cet élève")

    classe_cible = db.query(Classe).filter(
        Classe.classe_id == insc.classe_cible_id, Classe.etablissement_id == etablissement_id
    ).first()
    if not classe_cible:
        raise HTTPException(404, "Classe cible introuvable")

    _verifier_annee_modifiable(db, classe_cible.annee_id)

    eleve = db.query(Eleve).filter(Eleve.eleve_id == insc.eleve_id).first()
    if not eleve:
        raise HTTPException(404, "Élève introuvable")

    nouvelle_inscription = Inscription(
        eleve_id=insc.eleve_id,
        classe_id=classe_cible.classe_id,
        annee_id=classe_cible.annee_id,
        statut="ACTIVE",
        type_inscription="REINSCRIPTION",
    )
    db.add(nouvelle_inscription)
    db.flush()

    classe_cible.effectif_actuel = (classe_cible.effectif_actuel or 0) + 1
    eleve.statut = "ACTIF"
    insc.statut_reinscription = "REINSCRIT"

    # RÉINSCRIPTION, pas NOUVELLE : l'élève était déjà dans l'école, il paie le
    # frais de RÉinscription, jamais celui d'inscription (réservé aux nouveaux
    # élèves créés via l'inscription). Sans ce type, la génération retombait sur
    # « NOUVELLE » et facturait l'inscription à un réinscrit.
    nb_factures = _generer_frais_reinscription(
        db, nouvelle_inscription, classe_cible, etablissement_id,
        type_inscription="REINSCRIPTION",
    )

    db.commit()
    return {
        "message": f"{eleve.prenom} {eleve.nom} réinscrit(e) dans {classe_cible.libelle}",
        "nouvelle_inscription_id": nouvelle_inscription.inscription_id,
        "factures_generees": nb_factures,
    }


class StatutReinscriptionRequest(BaseModel):
    statut: str  # NON_REINSCRIT | TRANSFERE | ABANDON


@router.put("/{inscription_id}/statut")
def changer_statut_reinscription(inscription_id: int, data: StatutReinscriptionRequest, db: Session = Depends(get_db), etablissement_id: int = Depends(require_etablissement)):
    """Statuts terminaux (pas de réinscription) — simple traçabilité, aucun effet de bord sur Inscription/Facture."""
    if data.statut not in STATUTS_TERMINAUX:
        raise HTTPException(400, f"Statut invalide — attendu l'un de : {', '.join(STATUTS_TERMINAUX)}")
    insc = _inscription_ou_404(db, inscription_id, etablissement_id)
    if insc.statut_reinscription == "REINSCRIT":
        raise HTTPException(400, "Cet élève est déjà réinscrit — non modifiable")
    insc.statut_reinscription = data.statut
    db.commit()
    return {"message": f"Statut mis à jour : {data.statut}"}
