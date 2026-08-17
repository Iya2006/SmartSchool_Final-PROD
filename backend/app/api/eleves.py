"""
SMARTSCHOOL API — Routes Élèves (CRUD complet)
"""
from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from sqlalchemy import func, exists, and_, or_, not_
from sqlalchemy.orm import aliased
from typing import List, Optional
from app.core.database import get_db
from app.core.auth import require_etablissement
from app.core.security import hash_password
from app.core.matricules import PREFIXE_ELEVE, generer_matricule
from app.core.identifiants import exiger_identifiants_libres
from datetime import date as date_type, datetime
from app.models.academique import (
    Eleve, Inscription, Classe, Niveau, Parent, EleveParent, Facture, EcheanceFacture, TypeFrais, TarifClasse,
    AnneeScolaire, Bulletin, Trimestre, Presence, Incident, SyncTombstone,
)
from app.schemas.schemas import EleveCreate, EleveUpdate, EleveOut, EleveListOut
from app.core.annee_lock import verifier_annee_modifiable as _verifier_annee_modifiable
from app.core.annee_lock import resolve_annee_id
from app.core.annee_courante import resoudre_annee
from app.core.numerotation import generer_numero_facture
from pydantic import BaseModel

router = APIRouter(prefix="/api/eleves", tags=["Élèves"])


@router.get("", response_model=List[EleveListOut])
def list_eleves(
    annee_id: int = Depends(resolve_annee_id),
    statut: Optional[str] = None,
    search: Optional[str] = None,
    classe_code: Optional[str] = None,
    skip: int = 0,
    limit: int = 50,
    db: Session = Depends(get_db),
    etablissement_id: int = Depends(require_etablissement),
):
    """Liste des élèves avec classe et niveau"""
    # Sans annee precisee, celle EN COURS DE CETTE ECOLE — jamais l'annee n°1,
    # qui appartient a la premiere ecole inscrite.
    annee_id = resoudre_annee(db, etablissement_id, annee_id)

    # Élève promu de l'an dernier, PRÉ-PLACÉ dans sa classe cible mais pas encore
    # réinscrit : on l'affiche dans la nouvelle année (inactif, à activer) avec la
    # classe où il ira (classe_cible résolue par la clôture). Les diplômés du BAC
    # et les non-réinscrits n'ont PAS le statut A_REINSCRIRE, donc ils n'entrent
    # pas ici. La classe cible doit appartenir à l'année affichée.
    InscCible = aliased(Inscription)   # inscription (année précédente) à réinscrire
    ClasseCible = aliased(Classe)      # sa classe cible, dans l'année affichée
    NiveauCible = aliased(Niveau)

    query = db.query(
        Eleve.eleve_id,
        Eleve.matricule,
        Eleve.nom,
        Eleve.prenom,
        Eleve.sexe,
        Eleve.date_naissance,
        Eleve.statut,
        Eleve.photo_url,
        Eleve.adresse,
        Eleve.groupe_sanguin,
        func.coalesce(Classe.code, ClasseCible.code).label("classe_code"),
        func.coalesce(Niveau.libelle, NiveauCible.libelle).label("niveau"),
        Inscription.inscription_id.label("insc_courante_id"),
        ClasseCible.classe_id.label("classe_cible_id"),
        InscCible.inscription_id.label("insc_cible_id"),
    ).outerjoin(
        Inscription, (Eleve.eleve_id == Inscription.eleve_id) &
                      (Inscription.statut == "ACTIVE") &
                      (Inscription.annee_id == annee_id)
    ).outerjoin(
        Classe, Inscription.classe_id == Classe.classe_id
    ).outerjoin(
        Niveau, Classe.niveau_id == Niveau.niveau_id
    ).outerjoin(
        InscCible, (Eleve.eleve_id == InscCible.eleve_id) &
                    (InscCible.statut_reinscription == "A_REINSCRIRE")
    ).outerjoin(
        ClasseCible, (InscCible.classe_cible_id == ClasseCible.classe_id) &
                      (ClasseCible.annee_id == annee_id)
    ).outerjoin(
        NiveauCible, ClasseCible.niveau_id == NiveauCible.niveau_id
    ).filter(
        Eleve.etablissement_id == etablissement_id
    )

    # On garde un élève s'il est : inscrit actif cette année (réinscrit/nouveau) ;
    # OU pré-placé vers une classe de cette année (à réinscrire) ; OU encore sans
    # aucune inscription (élève tout juste créé). Un diplômé/parti (inscription
    # dans l'ANCIENNE année, aucune cible ici) est exclu. Consultable à
    # l'identique sur une année passée : `annee_id` suit l'année sélectionnée.
    _ins_b = aliased(Inscription)
    a_une_inscription = exists().where(_ins_b.eleve_id == Eleve.eleve_id)
    query = query.filter(or_(
        Inscription.inscription_id.isnot(None),
        ClasseCible.classe_id.isnot(None),
        not_(a_une_inscription),
    ))

    if statut:
        query = query.filter(Eleve.statut == statut)
    if search:
        query = query.filter(
            (Eleve.nom.ilike(f"%{search}%")) |
            (Eleve.prenom.ilike(f"%{search}%")) |
            (Eleve.matricule.ilike(f"%{search}%"))
        )
    if classe_code:
        query = query.filter(func.coalesce(Classe.code, ClasseCible.code) == classe_code)

    results = query.order_by(Eleve.nom, Eleve.prenom).offset(skip).limit(limit).all()
    out = []
    for r in results:
        # À activer = pré-placé (classe cible dans l'année) et pas encore
        # (ré)inscrit cette année.
        a_reinscrire = r.classe_cible_id is not None and r.insc_courante_id is None
        out.append(EleveListOut(
            eleve_id=r.eleve_id, matricule=r.matricule, nom=r.nom,
            prenom=r.prenom, sexe=r.sexe, date_naissance=r.date_naissance,
            statut=r.statut, classe_code=r.classe_code, niveau=r.niveau,
            photo_url=r.photo_url, adresse=r.adresse, groupe_sanguin=r.groupe_sanguin,
            a_reinscrire=a_reinscrire,
            inscription_a_confirmer=r.insc_cible_id if a_reinscrire else None,
        ))
    return out


class EleveDeltaOut(BaseModel):
    items: List[EleveListOut]
    deleted_ids: List[int]
    sync_at: datetime


@router.get("/delta", response_model=EleveDeltaOut)
def delta_eleves(
    since: Optional[datetime] = None,
    annee_id: int = Depends(resolve_annee_id),
    db: Session = Depends(get_db),
    etablissement_id: int = Depends(require_etablissement),
):
    """Synchronisation delta (Étape C) — voir le plan approuvé.

    Ne renvoie que les élèves créés/modifiés depuis `since` (absent =
    première synchro, renvoie tout l'établissement), plus les ids supprimés
    depuis `since` (SyncTombstone, alimenté par DELETE /{eleve_id}
    ci-dessous). `sync_at` est l'horloge de la BASE (pas du serveur
    applicatif ni du client — évite tout décalage d'horloge), capturée
    AVANT les requêtes de lecture : une écriture concurrente entre ce
    calcul et la fin de cette requête ne sera peut-être pas incluse cette
    fois, mais elle a une garantie de l'être au prochain appel (son
    modified_date sera nécessairement >= ce sync_at). Même principe que
    `base_updated_at` déjà utilisé dans app/api/sync.py.

    Limite assumée (voir le plan) : détecte les modifications du dossier
    élève lui-même (Eleve.modified_date), PAS un changement de classe seul
    — Inscription n'a pas encore de suivi de modification dans ce pilote.
    """
    annee_id = resoudre_annee(db, etablissement_id, annee_id)
    sync_at = db.query(func.now()).scalar()

    query = db.query(
        Eleve.eleve_id,
        Eleve.matricule,
        Eleve.nom,
        Eleve.prenom,
        Eleve.sexe,
        Eleve.date_naissance,
        Eleve.statut,
        Eleve.photo_url,
        Eleve.adresse,
        Eleve.groupe_sanguin,
        Classe.code.label("classe_code"),
        Niveau.libelle.label("niveau")
    ).outerjoin(
        Inscription, (Eleve.eleve_id == Inscription.eleve_id) &
                      (Inscription.statut == "ACTIVE") &
                      (Inscription.annee_id == annee_id)
    ).outerjoin(
        Classe, Inscription.classe_id == Classe.classe_id
    ).outerjoin(
        Niveau, Classe.niveau_id == Niveau.niveau_id
    ).filter(
        Eleve.etablissement_id == etablissement_id
    )

    if since is not None:
        query = query.filter(Eleve.modified_date > since)

    results = query.order_by(Eleve.nom, Eleve.prenom).all()
    items = [EleveListOut(
        eleve_id=r.eleve_id, matricule=r.matricule, nom=r.nom,
        prenom=r.prenom, sexe=r.sexe, date_naissance=r.date_naissance,
        statut=r.statut, classe_code=r.classe_code, niveau=r.niveau,
        photo_url=r.photo_url, adresse=r.adresse, groupe_sanguin=r.groupe_sanguin
    ) for r in results]

    tombstones = db.query(SyncTombstone.entity_id).filter(
        SyncTombstone.entity_type == "eleve",
        SyncTombstone.etablissement_id == etablissement_id,
    )
    if since is not None:
        tombstones = tombstones.filter(SyncTombstone.deleted_at > since)
    deleted_ids = [row[0] for row in tombstones.all()]

    return EleveDeltaOut(items=items, deleted_ids=deleted_ids, sync_at=sync_at)


@router.get("/count")
def count_eleves(annee_id: Optional[int] = None, db: Session = Depends(get_db), etablissement_id: int = Depends(require_etablissement)):
    # Même périmètre que la liste (list_eleves) : on ne compte que les élèves
    # réellement présents l'année affichée — sinon « Total Élèves » affichait 4
    # (toute l'école, diplômés compris) alors que la liste n'en montrait qu'un.
    annee_id = resoudre_annee(db, etablissement_id, annee_id)
    _ins_a = aliased(Inscription)
    _ins_b = aliased(Inscription)
    insc_annee = exists().where(and_(
        _ins_a.eleve_id == Eleve.eleve_id,
        _ins_a.annee_id == annee_id,
        _ins_a.statut == "ACTIVE",
    ))
    a_une_inscription = exists().where(_ins_b.eleve_id == Eleve.eleve_id)
    perimetre = or_(insc_annee, not_(a_une_inscription))

    total = db.query(func.count(Eleve.eleve_id)).filter(
        Eleve.etablissement_id == etablissement_id, perimetre
    ).scalar()
    actifs = db.query(func.count(Eleve.eleve_id)).filter(
        Eleve.etablissement_id == etablissement_id, Eleve.statut == "ACTIF", perimetre
    ).scalar()

    # Nouvelles inscriptions de l'année (type_inscription == "NOUVELLE", donc les
    # admissions réelles, à distinguer des réinscriptions d'élèves déjà présents
    # l'an dernier) — remplace un ancien placeholder côté frontend
    # (Math.round(total * 0.14), une valeur fictive sans lien avec les données).
    nouvelles_inscriptions = 0
    if annee_id is not None:
        nouvelles_inscriptions = db.query(func.count(Inscription.inscription_id)).join(
            Eleve, Inscription.eleve_id == Eleve.eleve_id
        ).filter(
            Eleve.etablissement_id == etablissement_id,
            Inscription.annee_id == annee_id,
            Inscription.statut == "ACTIVE",
            Inscription.type_inscription == "NOUVELLE",
        ).scalar()

    return {
        "total": total, "actifs": actifs, "inactifs": total - actifs,
        "nouvelles_inscriptions": nouvelles_inscriptions,
    }


# ── Import en masse des élèves (Excel/CSV) ──────────────────────────────────
_COLONNES_IMPORT_ELEVES = [
    "Nom", "Prénom", "Sexe", "Date de naissance", "Lieu de naissance",
    "Téléphone", "E-mail", "Adresse", "Groupe sanguin", "Classe",
]


def _parse_date_naissance(brut: str):
    """Accepte JJ/MM/AAAA, AAAA-MM-JJ, JJ-MM-AAAA, JJ.MM.AAAA."""
    brut = (brut or "").strip()
    if not brut:
        return None
    for sep in ("/", "-", "."):
        if sep in brut:
            parts = brut.split(sep)
            if len(parts) == 3:
                try:
                    a, b, c = (p.strip() for p in parts)
                    if len(a) == 4:            # AAAA-MM-JJ
                        return date_type(int(a), int(b), int(c))
                    return date_type(int(c), int(b), int(a))  # JJ/MM/AAAA
                except (ValueError, TypeError):
                    return None
    return None


def _normalise_sexe(brut: str) -> str:
    v = (brut or "").strip().upper()
    if v in ("F", "FEMININ", "FÉMININ", "FILLE", "FEMME"):
        return "F"
    return "M"


@router.get("/import/modele")
def modele_import_eleves(etablissement_id: int = Depends(require_etablissement)):
    """Modèle CSV (séparateur `;`, lisible par Excel) à remplir pour l'import."""
    import csv, io
    buffer = io.StringIO()
    buffer.write("﻿")  # BOM : Excel ouvre alors l'UTF-8 sans casser les accents
    w = csv.writer(buffer, delimiter=";")
    w.writerow(_COLONNES_IMPORT_ELEVES)
    w.writerow(["Camara", "Mariam", "F", "12/03/2015", "Conakry",
                "620000000", "", "Quartier Madina", "O+", "2eme annee"])
    return StreamingResponse(
        iter([buffer.getvalue()]),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": 'attachment; filename="modele_import_eleves.csv"'},
    )


@router.post("/import")
async def importer_eleves(
    fichier: UploadFile = File(...),
    dry_run: bool = False,
    annee_id: Optional[int] = None,
    db: Session = Depends(get_db),
    etablissement_id: int = Depends(require_etablissement),
):
    """Importe une liste d'élèves DÉJÀ de l'école (Excel/CSV).

    Chaque élève est créé (matricule auto-incrémenté, mot de passe par défaut
    12345678), inscrit en RÉINSCRIPTION dans la classe de la colonne « Classe »
    (par code ou libellé) de l'année en cours, et ses frais (scolarité +
    réinscription de sa classe) sont générés. Aucun parent — le directeur les
    ajoute ensuite. `dry_run=true` analyse sans rien écrire (même rapport)."""
    from collections import Counter
    from app.services.import_tabulaire import FichierIllisible, lire_lignes, valeur, normaliser_entete
    from app.api.reinscription import _est_frais_inscription
    from app.core.numerotation import (
        PREFIXE_FACTURE, _LARGEUR as _LARGEUR_FAC, annee_civile, _plus_haut_numero_existant,
    )
    from app.core.matricules import _LARGEUR as _LARGEUR_MAT
    from app.models.academique import SequenceMatricule

    annee_id = resoudre_annee(db, etablissement_id, annee_id)
    if annee_id is None:
        raise HTTPException(400, "Aucune année scolaire en cours : impossible d'importer.")
    _verifier_annee_modifiable(db, annee_id)

    contenu = await fichier.read()
    try:
        _, lignes = lire_lignes(fichier.filename or "import.csv", contenu)
    except FichierIllisible as e:
        raise HTTPException(400, str(e))
    if not lignes:
        raise HTTPException(400, "Le fichier ne contient aucune ligne d'élève.")

    # Classes de l'année, retrouvables par code OU libellé (tous cycles mélangés).
    classes = db.query(Classe).filter(
        Classe.etablissement_id == etablissement_id, Classe.annee_id == annee_id
    ).all()
    index_classe = {}
    for c in classes:
        index_classe[normaliser_entete(c.code)] = c
        index_classe[normaliser_entete(c.libelle)] = c

    # --- On VALIDE toutes les lignes avant d'écrire quoi que ce soit -----------
    valides, ignorees, apercu = [], [], []
    for i, ligne in enumerate(lignes, start=2):  # ligne 1 = en-tête
        nom = valeur(ligne, "nom", "nom de l eleve").strip()
        prenom = valeur(ligne, "prenom", "prenoms", "prenom de l eleve").strip()
        classe_txt = valeur(ligne, "classe", "classe cible").strip()
        date_naissance = _parse_date_naissance(
            valeur(ligne, "date de naissance", "date naissance", "naissance", "ne le", "nee le")
        )
        if not nom or not prenom:
            ignorees.append({"ligne": i, "eleve": f"{prenom} {nom}".strip(), "raison": "nom ou prénom manquant"})
            continue
        classe = index_classe.get(normaliser_entete(classe_txt)) if classe_txt else None
        if not classe:
            ignorees.append({"ligne": i, "eleve": f"{prenom} {nom}", "raison": f"classe introuvable : « {classe_txt} »"})
            continue
        if date_naissance is None:
            ignorees.append({"ligne": i, "eleve": f"{prenom} {nom}", "raison": "date de naissance manquante ou invalide"})
            continue
        valides.append((ligne, nom, prenom, classe, date_naissance))
        apercu.append({"ligne": i, "eleve": f"{prenom} {nom}", "classe": classe.libelle})

    if dry_run:
        return {
            "dry_run": True,
            "total_lignes": len(lignes),
            "crees": len(valides),
            "ignorees": ignorees,
            "apercu": apercu[:20],
            "message": f"{len(valides)} élève(s) seraient importés, {len(ignorees)} ligne(s) ignorée(s).",
        }

    # === ÉCRITURE EN MASSE ====================================================
    # Tout est calculé EN MÉMOIRE : les compteurs (matricule, facture) sont
    # amorcés UNE seule fois puis incrémentés localement, et les tarifs sont
    # préchargés par classe. L'ancienne version relançait, PAR ÉLÈVE, plusieurs
    # requêtes verrouillées + un re-scan complet de la table des factures :
    # sur 1000 élèves cela faisait des milliers d'allers-retours et dépassait le
    # délai du serveur (« Serveur injoignable »). Ici on reste sur une poignée
    # de requêtes, quel que soit le nombre d'élèves.
    mdp_defaut = hash_password("12345678")

    # 1) Compteur de matricules élèves — amorcé une fois (cf. matricules.py).
    seq_mat = db.query(SequenceMatricule).filter(
        SequenceMatricule.etablissement_id == etablissement_id,
        SequenceMatricule.type_entite == PREFIXE_ELEVE,
    ).with_for_update().first()
    if seq_mat is None:
        depart_mat = db.query(func.count(Eleve.matricule)).filter(
            Eleve.etablissement_id == etablissement_id
        ).scalar() or 0
        seq_mat = SequenceMatricule(
            etablissement_id=etablissement_id, type_entite=PREFIXE_ELEVE, dernier_numero=depart_mat
        )
        db.add(seq_mat)
        db.flush()
    num_mat = seq_mat.dernier_numero

    # 2) Élèves créés en bloc (un seul flush attribue tous les eleve_id).
    eleves_classe = []
    for (ligne, nom, prenom, classe, dn) in valides:
        num_mat += 1
        eleve = Eleve(
            etablissement_id=etablissement_id,
            matricule=f"{PREFIXE_ELEVE}-{etablissement_id}-{num_mat:0{_LARGEUR_MAT}d}",
            nom=nom, prenom=prenom, sexe=_normalise_sexe(valeur(ligne, "sexe")),
            date_naissance=dn,
            lieu_naissance=valeur(ligne, "lieu de naissance", "lieu naissance").strip() or None,
            telephone=valeur(ligne, "telephone", "tel").strip() or None,
            email=valeur(ligne, "e mail", "email", "mail").strip() or None,
            adresse=valeur(ligne, "adresse").strip() or None,
            quartier=valeur(ligne, "quartier").strip() or None,
            groupe_sanguin=valeur(ligne, "groupe sanguin", "groupe").strip() or None,
            mot_de_passe=mdp_defaut, statut="ACTIF",
        )
        db.add(eleve)
        eleves_classe.append((eleve, classe))
    seq_mat.dernier_numero = num_mat
    db.flush()

    # 3) Inscriptions en bloc (réinscription : élève déjà de l'école).
    inscriptions = []
    for (eleve, classe) in eleves_classe:
        insc = Inscription(
            eleve_id=eleve.eleve_id, classe_id=classe.classe_id, annee_id=annee_id,
            statut="ACTIVE", type_inscription="REINSCRIPTION",
        )
        db.add(insc)
        inscriptions.append((insc, classe))
    db.flush()

    # 4) Effectifs : +1 par élève, une écriture par classe.
    ajouts = Counter(classe.classe_id for _, classe in inscriptions)
    for classe in classes:
        n = ajouts.get(classe.classe_id, 0)
        if n:
            classe.effectif_actuel = (classe.effectif_actuel or 0) + n

    # 5) Frais obligatoires (scolarité + réinscription, PAS le frais d'entrée) —
    #    tarifs préchargés par classe, numéros de facture incrémentés en mémoire.
    classe_ids = [c.classe_id for c in classes]
    tarifs_par_classe: dict = {}
    if classe_ids:
        for tarif, tf in db.query(TarifClasse, TypeFrais).join(
            TypeFrais, TarifClasse.type_frais_id == TypeFrais.type_frais_id
        ).filter(
            TarifClasse.classe_id.in_(classe_ids),
            TypeFrais.est_obligatoire == "O",
            TypeFrais.statut == "ACTIF",
        ).all():
            if _est_frais_inscription(tf.categorie):
                continue  # réinscription : on n'ajoute jamais le frais d'entrée
            tarifs_par_classe.setdefault(tarif.classe_id, []).append(
                (float(tarif.montant), tf.type_frais_id)
            )

    an = annee_civile(db, annee_id)
    motif = f"{PREFIXE_FACTURE}-{etablissement_id}-{an}-"
    cle_fac = f"{PREFIXE_FACTURE}{annee_id or 0}"[:20]
    seq_fac = db.query(SequenceMatricule).filter(
        SequenceMatricule.etablissement_id == etablissement_id,
        SequenceMatricule.type_entite == cle_fac,
    ).with_for_update().first()
    if seq_fac is None:
        depart_fac = _plus_haut_numero_existant(db, Facture.numero_facture, motif)
        seq_fac = SequenceMatricule(
            etablissement_id=etablissement_id, type_entite=cle_fac, dernier_numero=depart_fac
        )
        db.add(seq_fac)
        db.flush()
    num_fac = seq_fac.dernier_numero

    factures_montants = []  # (facture, montant) pour créer les échéances après flush
    for (insc, classe) in inscriptions:
        for (montant, type_frais_id) in tarifs_par_classe.get(classe.classe_id, []):
            num_fac += 1
            facture = Facture(
                inscription_id=insc.inscription_id, annee_id=annee_id,
                type_frais_id=type_frais_id,
                numero_facture=f"{motif}{num_fac:0{_LARGEUR_FAC}d}",
                montant_total=montant, montant_remise=0, montant_net=montant,
                montant_paye=0, montant_restant=montant, statut="EN_ATTENTE",
            )
            db.add(facture)
            factures_montants.append((facture, montant))
    seq_fac.dernier_numero = num_fac
    if factures_montants:
        db.flush()
        for (facture, montant) in factures_montants:
            db.add(EcheanceFacture(
                facture_id=facture.facture_id, libelle="Paiement unique",
                date_limite=date_type.today(), montant_attendu=montant,
                montant_paye=0, statut="EN_ATTENTE",
            ))

    db.commit()

    return {
        "dry_run": False,
        "total_lignes": len(lignes),
        "crees": len(valides),
        "ignorees": ignorees,
        "apercu": apercu[:20],
        "message": f"{len(valides)} élève(s) importés, {len(ignorees)} ligne(s) ignorée(s).",
    }


@router.get("/{eleve_id}", response_model=EleveOut)
def get_eleve(eleve_id: int, db: Session = Depends(get_db), etablissement_id: int = Depends(require_etablissement)):
    eleve = db.query(Eleve).filter(
        Eleve.eleve_id == eleve_id, Eleve.etablissement_id == etablissement_id
    ).first()
    if not eleve:
        raise HTTPException(status_code=404, detail="Élève non trouvé")
        
    # Inject current class
    inscription = db.query(Inscription).filter(
        Inscription.eleve_id == eleve_id,
        Inscription.statut == "ACTIVE"
    ).first()
    if inscription:
        setattr(eleve, "classe_id", inscription.classe_id)
        
    return eleve


@router.post("", response_model=EleveOut, status_code=201)
def create_eleve(data: EleveCreate, db: Session = Depends(get_db), etablissement_id: int = Depends(require_etablissement)):
    # Matricule propre à l'établissement (voir app/core/matricules.py) : le
    # compteur global d'avant exposait le volume de toute la plateforme et
    # régressait après suppression, régénérant un matricule déjà pris.
    matricule = generer_matricule(db, Eleve, PREFIXE_ELEVE, etablissement_id)

    # data.etablissement_id (champ obligatoire du schéma EleveBase) est ignoré
    # et remplacé par l'établissement authentifié — avant le Lot 6, n'importe
    # quel client pouvait créer un élève dans l'école de son choix.
    payload = data.model_dump()
    payload["etablissement_id"] = etablissement_id

    eleve = Eleve(
        **payload,
        matricule=matricule
    )
    db.add(eleve)
    db.commit()
    db.refresh(eleve)
    return eleve


@router.put("/{eleve_id}", response_model=EleveOut)
def update_eleve(eleve_id: int, data: EleveUpdate, db: Session = Depends(get_db), etablissement_id: int = Depends(require_etablissement)):
    eleve = db.query(Eleve).filter(
        Eleve.eleve_id == eleve_id, Eleve.etablissement_id == etablissement_id
    ).first()
    if not eleve:
        raise HTTPException(status_code=404, detail="Élève non trouvé")

    update_data = data.model_dump(exclude_unset=True)
    classe_id = update_data.pop("classe_id", None)

    # Mot de passe du portail élève : on le hash s'il est fourni et non vide,
    # sinon on n'y touche pas (jamais stocké ni écrasé en clair). Corrige le
    # champ qui, sinon, aurait remplacé le hash par le texte brut saisi.
    mot_de_passe = update_data.pop("mot_de_passe", None)
    if mot_de_passe and mot_de_passe.strip():
        eleve.mot_de_passe = hash_password(mot_de_passe.strip())

    # La classe cible doit appartenir au même établissement — sans cette
    # vérification, un élève pouvait être déplacé dans la classe d'une autre
    # école (et son effectif incrémenté au passage).
    if classe_id is not None:
        classe_valide = db.query(Classe.classe_id).filter(
            Classe.classe_id == classe_id, Classe.etablissement_id == etablissement_id
        ).first()
        if not classe_valide:
            raise HTTPException(status_code=404, detail="Classe non trouvée")

    for key, value in update_data.items():
        setattr(eleve, key, value)

    if classe_id is not None:
        # Ces deux `annee_id = 1` inscrivaient l'eleve sur l'annee scolaire de
        # la premiere ecole inscrite. Pour toute autre ecole, l'inscription
        # creee n'apparaissait dans aucun de ses ecrans.
        annee_courante = resoudre_annee(db, etablissement_id, None)
        if annee_courante is None:
            raise HTTPException(
                status_code=400,
                detail="Aucune annee scolaire n'est ouverte : impossible d'inscrire dans une classe.",
            )
        current_insc = db.query(Inscription).filter(
            Inscription.eleve_id == eleve_id,
            Inscription.statut == "ACTIVE",
            Inscription.annee_id == annee_courante
        ).first()

        if current_insc and current_insc.classe_id != classe_id:
            current_insc.statut = "ANNULEE"
            old_class = db.query(Classe).filter(Classe.classe_id == current_insc.classe_id).first()
            if old_class and old_class.effectif_actuel and old_class.effectif_actuel > 0:
                old_class.effectif_actuel -= 1
            current_insc = None
            
        if not current_insc:
            new_insc = Inscription(
                eleve_id=eleve_id,
                classe_id=classe_id,
                annee_id=annee_courante,
                statut="ACTIVE"
            )
            db.add(new_insc)
            new_class = db.query(Classe).filter(Classe.classe_id == classe_id).first()
            if new_class:
                new_class.effectif_actuel = (new_class.effectif_actuel or 0) + 1

    db.commit()
    db.refresh(eleve)
    
    active_insc = db.query(Inscription).filter(
        Inscription.eleve_id == eleve_id,
        Inscription.statut == "ACTIVE"
    ).first()
    if active_insc:
        setattr(eleve, "classe_id", active_insc.classe_id)

    return eleve


# NOTE : l'ancien flux de réinscription (GET /reinscription/classe/{id},
# PUT /{id}/reactiver) a été retiré — remplacé par app/api/reinscription.py
# (Phase 2 de la refonte clôture/réinscription/tarifs), un système indépendant
# de la promotion piloté par Inscription.statut_reinscription (5 statuts),
# qui crée lui-même la nouvelle Inscription à la confirmation plutôt que de
# réactiver un compte dont l'inscription existait déjà.


# ================================================================
# INSCRIPTION COMPLÈTE : Élève + Parent en une seule opération
# ================================================================
class ParentData(BaseModel):
    nom: str
    prenom: str
    sexe: Optional[str] = None
    telephone_1: str
    telephone_2: Optional[str] = None
    email: Optional[str] = None
    profession: Optional[str] = None
    adresse: Optional[str] = None
    quartier: Optional[str] = None
    lien_parente: str = "PERE"
    mot_de_passe: Optional[str] = None

class FraisScolaireSelection(BaseModel):
    type_frais_id: int
    montant: float

class InscriptionCompleteData(BaseModel):
    # Élève
    nom: str
    prenom: str
    date_naissance: Optional[str] = None
    sexe: str = "M"
    lieu_naissance: Optional[str] = None
    telephone: Optional[str] = None
    email: Optional[str] = None
    statut: str = "ACTIF"
    # `None` = l'annee en cours de l'ecole appelante, resolue cote serveur.
    # Un client qui envoie 1 inscrirait l'eleve sur l'annee d'une autre ecole.
    # (Pydantic BaseModel — `Depends(...)` n'existe que pour les parametres
    # de fonction de route, pas pour un champ de modele : la resolution se
    # fait explicitement dans le corps de la route, voir plus bas.)
    annee_id: Optional[int] = None
    classe_id: Optional[int] = None
    eleve_mot_de_passe: Optional[str] = None  # MDP portail élève (optionnel, défaut: smartschool)
    # NOUVELLE = élève nouveau dans l'école (paie l'inscription) ;
    # REINSCRIPTION = élève qui continue (paie la réinscription). Détermine
    # quel frais d'entrée est facturé en plus de la scolarité.
    type_inscription: str = "NOUVELLE"
    # Parent
    parent: Optional[ParentData] = None
    # Facturation
    frais_scolaires: Optional[List[FraisScolaireSelection]] = None


@router.post("/inscription-complete", status_code=201)
def inscription_complete(data: InscriptionCompleteData, db: Session = Depends(get_db), etablissement_id: int = Depends(require_etablissement)):
    """Inscription complète : crée l'élève, l'inscription et le parent en une seule opération.

    `data.etablissement_id` est ignoré et remplacé par l'établissement
    authentifié ; la classe cible est vérifiée appartenir à cet
    établissement (sinon un élève pouvait être inscrit dans la classe d'une
    autre école, en incrémentant son effectif au passage).

    `data.annee_id` absent = l'annee EN COURS DE CETTE ECOLE. Le client ne
    choisit pas l'annee d'inscription : elle se resout ici, sinon un formulaire
    qui envoie 1 par defaut inscrit l'eleve chez quelqu'un d'autre."""
    annee_id = resoudre_annee(db, etablissement_id, data.annee_id)
    if annee_id is None:
        raise HTTPException(
            status_code=400,
            detail="Aucune annee scolaire n'est ouverte pour cet etablissement.",
        )
    _verifier_annee_modifiable(db, annee_id)

    if data.classe_id:
        classe_valide = db.query(Classe.classe_id).filter(
            Classe.classe_id == data.classe_id, Classe.etablissement_id == etablissement_id
        ).first()
        if not classe_valide:
            raise HTTPException(404, "Classe non trouvée")

    # `date_naissance` est typé `str` dans InscriptionCompleteData (contrairement
    # à EleveBase qui utilise `date`) et était passé tel quel à une colonne Date.
    # PostgreSQL/pg8000 accepte une chaîne ISO (vérifié réellement — la route
    # fonctionne donc en production), mais pas SQLite : bug de portabilité
    # préexistant, sans rapport avec l'isolation, corrigé ici de façon minimale
    # car il empêchait d'écrire le test de sécurité de cette route. Aucun
    # changement de comportement en production (même valeur stockée).
    date_naissance = data.date_naissance
    if isinstance(date_naissance, str) and date_naissance:
        try:
            date_naissance = date_type.fromisoformat(date_naissance)
        except ValueError:
            raise HTTPException(400, "date_naissance invalide (format attendu : AAAA-MM-JJ)")

    try:
        # 1. Créer l'élève
        matricule = generer_matricule(db, Eleve, PREFIXE_ELEVE, etablissement_id)

        eleve = Eleve(
            nom=data.nom,
            prenom=data.prenom,
            date_naissance=date_naissance,
            sexe=data.sexe,
            lieu_naissance=data.lieu_naissance,
            telephone=data.telephone,
            email=data.email,
            statut=data.statut,
            etablissement_id=etablissement_id,
            matricule=matricule,
            mot_de_passe=hash_password(data.eleve_mot_de_passe) if data.eleve_mot_de_passe else None,
        )
        db.add(eleve)
        db.flush()  # Get eleve_id without committing

        # 2. Créer l'inscription si classe_id fourni
        inscription = None
        if data.classe_id:
            type_insc = (data.type_inscription or "NOUVELLE").upper()
            if type_insc not in ("NOUVELLE", "REINSCRIPTION"):
                type_insc = "NOUVELLE"
            inscription = Inscription(
                eleve_id=eleve.eleve_id,
                classe_id=data.classe_id,
                annee_id=annee_id,
                statut="ACTIVE",
                type_inscription=type_insc,
            )
            db.add(inscription)
            # Update effectif
            classe = db.query(Classe).filter(Classe.classe_id == data.classe_id).first()
            if classe:
                classe.effectif_actuel = (classe.effectif_actuel or 0) + 1

        # 3. Traiter le parent si fourni
        parent_info = None
        if data.parent and data.parent.telephone_1:
            # Un parent a UNE FICHE PAR ÉCOLE (migration 2026_08_multi_01).
            # La recherche est donc bornée à l'établissement appelant :
            #
            #   - même école, numéro déjà connu  -> c'est un frère ou une sœur,
            #     on réutilise la fiche et on la met à jour ;
            #   - autre école                    -> invisible ici, cette école
            #     crée sa propre fiche.
            #
            # Ce filtre remplace un montage plus fragile : la fiche d'une autre
            # école était réutilisée telle quelle, et il avait fallu un contrôle
            # séparé pour empêcher qu'un administrateur ne réécrive le mot de
            # passe d'un parent d'ailleurs — donc ne prenne son compte. Ici le
            # cas ne peut plus se présenter : cette fiche n'est jamais chargée.
            existing_parent = db.query(Parent).filter(
                Parent.telephone_1 == data.parent.telephone_1,
                Parent.etablissement_id == etablissement_id,
            ).first()

            if existing_parent:
                parent = existing_parent
                # Mettre à jour le mot de passe si fourni
                if data.parent.mot_de_passe:
                    parent.mot_de_passe = hash_password(data.parent.mot_de_passe)
                # Mettre à jour les infos si elles étaient vides
                if data.parent.email and not parent.email:
                    parent.email = data.parent.email
                if data.parent.profession and not parent.profession:
                    parent.profession = data.parent.profession
            else:
                # Aucun parent ne porte ce téléphone : on en crée un. Son
                # e-mail sert lui aussi à se connecter, il doit donc être libre
                # (le téléphone, lui, vient d'être vérifié juste au-dessus).
                exiger_identifiants_libres(
                    db, [data.parent.email], etablissement_id=etablissement_id
                )
                parent = Parent(
                    # Le parent appartient a l'ecole de l'appelant. Une meme
                    # personne ayant des enfants ailleurs a une fiche par ecole.
                    etablissement_id=etablissement_id,
                    nom=data.parent.nom,
                    prenom=data.parent.prenom,
                    sexe=data.parent.sexe,
                    telephone_1=data.parent.telephone_1,
                    telephone_2=data.parent.telephone_2,
                    email=data.parent.email,
                    profession=data.parent.profession,
                    adresse=data.parent.adresse,
                    quartier=data.parent.quartier,
                    mot_de_passe=hash_password(data.parent.mot_de_passe) if data.parent.mot_de_passe else None,
                    statut="ACTIF",
                )
                db.add(parent)
                db.flush()

            # 4. Créer le lien Elève-Parent
            existing_link = db.query(EleveParent).filter(
                EleveParent.eleve_id == eleve.eleve_id,
                EleveParent.parent_id == parent.parent_id
            ).first()
            if not existing_link:
                link = EleveParent(
                    eleve_id=eleve.eleve_id,
                    parent_id=parent.parent_id,
                    lien_parente=data.parent.lien_parente,
                    est_contact_principal="O",
                    est_responsable_financier="O",
                )
                db.add(link)

            # La fiche renvoyée relève forcément de l'établissement appelant :
            # la recherche y est bornée, une fiche d'ailleurs n'est jamais
            # chargée. Le détour qui masquait l'identité d'un parent d'une autre
            # école n'a plus d'objet — il protégeait d'une fuite désormais
            # impossible par construction.
            parent_info = {
                "parent_id": parent.parent_id,
                "nom": parent.nom,
                "prenom": parent.prenom,
                "telephone": data.parent.telephone_1,
                "is_new": not bool(existing_parent),
            }

        # 5. Créer les factures initiales (si applicables) — le montant envoyé
        # par le frontend n'est fait confiance QUE s'il n'existe aucun tarif
        # configuré pour ce couple (classe, type de frais) ; dès qu'un
        # TarifClasse existe, c'est LUI la source de vérité (même correction
        # que generer_factures_classe, Phase 1 de la refonte tarifs) — évite
        # qu'un montant incohérent soit facturé à l'inscription.
        # LA GRILLE DE LA CLASSE S'APPLIQUE D'ELLE-MÊME
        # -------------------------------------------------------------------
        # L'écran d'inscription préchargeait les montants depuis
        # `TypeFrais.montant_defaut`, le défaut d'établissement. Or dans une
        # école qui tarifie par classe — le cas courant, et celui de nos
        # données réelles — ce défaut vaut 0 : le montant vit dans
        # `TarifClasse`, pas là. Le formulaire envoyait donc 0, et ce `0`
        # tombait dans un `continue` silencieux. L'élève était inscrit, assis
        # dans sa classe... et ne devait rien. Aucune facture, aucune erreur,
        # aucun message : l'école perdait la scolarité sans que personne
        # puisse le voir depuis l'écran.
        #
        # Désormais, quand l'appelant n'envoie rien, la grille obligatoire de
        # la classe s'applique — exactement la règle de la réinscription, et
        # la même fonction, pour qu'il n'y ait qu'un seul endroit où cette
        # règle est écrite.
        factures_generees = 0
        if inscription and not data.frais_scolaires:
            from app.api.reinscription import _generer_frais_reinscription
            classe_cible = db.query(Classe).filter(
                Classe.classe_id == data.classe_id
            ).first()
            if classe_cible is not None:
                factures_generees = _generer_frais_reinscription(
                    db, inscription, classe_cible, etablissement_id,
                    type_inscription=type_insc,
                )
        elif inscription and data.frais_scolaires:
            # Le type de frais appartient a une ecole depuis la migration
            # 2026_08_compta_01. Sans ce controle, un client pouvait envoyer
            # l'identifiant du type de frais d'un autre etablissement : la
            # facture emise portait alors le libelle d'une ecole etrangere.
            from app.api.reinscription import _est_frais_inscription, _est_frais_reinscription
            types_ecole = {
                t.type_frais_id: t.categorie for t in db.query(TypeFrais).filter(
                    TypeFrais.etablissement_id == etablissement_id
                ).all()
            }
            est_reinscription = type_insc == "REINSCRIPTION"
            for frais in data.frais_scolaires:
                if frais.type_frais_id not in types_ecole:
                    raise HTTPException(404, "Type de frais non trouvé")
                # Garde-fou : on n'accepte jamais le frais d'entrée qui ne
                # correspond pas au type d'inscription, même si l'écran l'envoie.
                categorie_frais = types_ecole.get(frais.type_frais_id)
                if est_reinscription and _est_frais_inscription(categorie_frais):
                    continue
                if not est_reinscription and _est_frais_reinscription(categorie_frais):
                    continue
                tarif = db.query(TarifClasse).filter(
                    TarifClasse.classe_id == data.classe_id, TarifClasse.type_frais_id == frais.type_frais_id
                ).first()

                # Un frais coché à 0 alors que la classe a un tarif, ce n'est
                # pas « gratuit » : c'est un écran qui ne connaissait pas le
                # montant. C'est le tarif qui vaut. Sans tarif configuré et
                # sans montant, il n'y a rien à facturer — on passe.
                if frais.montant <= 0:
                    if tarif is None:
                        continue
                    montant = float(tarif.montant)
                else:
                    montant = float(tarif.montant) if tarif is not None else frais.montant
                    if tarif is not None and abs(float(tarif.montant) - frais.montant) > 0.01:
                        raise HTTPException(
                            400,
                            f"Le montant envoyé ({frais.montant:,.0f} GNF) ne correspond pas au tarif configuré "
                            f"pour cette classe ({float(tarif.montant):,.0f} GNF).",
                        )

                # Ce numéro venait d'un COMPTAGE de factures : supprimez-en
                # une, et la suivante réutilisait un numéro déjà attribué.
                numero_facture = generer_numero_facture(
                    db, etablissement_id, inscription.annee_id
                )
                facture = Facture(
                    inscription_id=inscription.inscription_id,
                    annee_id=inscription.annee_id,
                    type_frais_id=frais.type_frais_id,
                    numero_facture=numero_facture,
                    montant_total=montant,
                    montant_remise=0,
                    montant_net=montant,
                    montant_paye=0,
                    montant_restant=montant,
                    statut="EN_ATTENTE"
                )
                db.add(facture)
                db.flush()

                # Créer une échéance unique par défaut
                echeance = EcheanceFacture(
                    facture_id=facture.facture_id,
                    libelle="Paiement unique",
                    date_limite=date_type.today(),
                    montant_attendu=montant,
                    montant_paye=0,
                    statut="EN_ATTENTE"
                )
                db.add(echeance)
                factures_generees += 1

        db.commit()
        db.refresh(eleve)

        return {
            "eleve_id": eleve.eleve_id,
            "matricule": eleve.matricule,
            "parent_id": parent_info["parent_id"] if parent_info else None,
            "factures_generees": factures_generees,
            "eleve": {
                "eleve_id": eleve.eleve_id,
                "matricule": eleve.matricule,
                "nom": eleve.nom,
                "prenom": eleve.prenom,
            },
            "parent": parent_info,
            "classe_id": data.classe_id,
            "message": "Inscription complète réussie !"
        }
    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(500, f"Erreur lors de l'inscription : {str(e)}")


@router.delete("/{eleve_id}")
def delete_eleve(eleve_id: int, db: Session = Depends(get_db), etablissement_id: int = Depends(require_etablissement)):
    eleve = db.query(Eleve).filter(
        Eleve.eleve_id == eleve_id, Eleve.etablissement_id == etablissement_id
    ).first()
    if not eleve:
        raise HTTPException(status_code=404, detail="Élève non trouvé")
    # Tombstone (Étape C, synchro delta) : la suppression est physique
    # (db.delete), donc c'est le SEUL moyen pour un client ayant un delta
    # obsolète de savoir que cet élève a disparu — voir GET /delta et
    # SyncTombstone. Même transaction que le DELETE, avant le commit.
    db.add(SyncTombstone(entity_type="eleve", entity_id=eleve_id, etablissement_id=eleve.etablissement_id))
    db.delete(eleve)
    db.commit()
    return {"message": "Élève supprimé"}


# ════════════════════════════════════════════════════════════
# CENTRE D'HISTORIQUE — Dossier archive d'un élève (Phase 3)
# ════════════════════════════════════════════════════════════

@router.get("/{eleve_id}/inscriptions")
def get_historique_inscriptions(eleve_id: int, db: Session = Depends(get_db), etablissement_id: int = Depends(require_etablissement)):
    """
    Historique complet des inscriptions d'un élève, toutes années confondues
    — alimente le centre d'historique (page /archive/eleve/{id}). Remplace
    les données précédemment simulées côté frontend.
    """
    eleve = db.query(Eleve).filter(
        Eleve.eleve_id == eleve_id, Eleve.etablissement_id == etablissement_id
    ).first()
    if not eleve:
        raise HTTPException(status_code=404, detail="Élève non trouvé")

    rows = db.query(Inscription, Classe, AnneeScolaire).join(
        Classe, Inscription.classe_id == Classe.classe_id
    ).join(
        AnneeScolaire, Inscription.annee_id == AnneeScolaire.annee_id
    ).filter(
        Inscription.eleve_id == eleve_id
    ).order_by(AnneeScolaire.date_debut.desc()).all()

    return [
        {
            "inscription_id": insc.inscription_id,
            "annee_id": annee.annee_id,
            "annee": annee.libelle,
            "annee_statut": annee.statut,
            "en_cours": annee.statut in ("PLANIFIEE", "EN_COURS"),
            "classe_id": classe.classe_id,
            "classe": classe.libelle,
            "statut_inscription": insc.statut,
            "type_inscription": insc.type_inscription,
            "moyenne_annuelle": float(insc.moyenne_annuelle) if insc.moyenne_annuelle is not None else None,
            "total_points": float(insc.total_points) if insc.total_points is not None else None,
            "rang_final": insc.rang_final,
            "decision_fin_annee": insc.decision_fin_annee,
        }
        for insc, classe, annee in rows
    ]


@router.get("/{eleve_id}/dossier/{inscription_id}")
def get_dossier_annee(eleve_id: int, inscription_id: int, db: Session = Depends(get_db), etablissement_id: int = Depends(require_etablissement)):
    """
    Dossier complet d'UNE année pour cet élève : bulletins de tous les
    trimestres, résumé de présence, incidents disciplinaires — alimente les
    onglets Bulletins/Discipline du centre d'historique (lecture seule).
    """
    eleve_valide = db.query(Eleve.eleve_id).filter(
        Eleve.eleve_id == eleve_id, Eleve.etablissement_id == etablissement_id
    ).first()
    if not eleve_valide:
        raise HTTPException(status_code=404, detail="Élève non trouvé")

    insc = db.query(Inscription).filter(
        Inscription.inscription_id == inscription_id, Inscription.eleve_id == eleve_id
    ).first()
    if not insc:
        raise HTTPException(status_code=404, detail="Inscription non trouvée pour cet élève")

    bulletins = db.query(Bulletin, Trimestre).join(
        Trimestre, Bulletin.trimestre_id == Trimestre.trimestre_id
    ).filter(
        Bulletin.inscription_id == inscription_id
    ).order_by(Trimestre.numero).all()

    presences = db.query(Presence).filter(Presence.inscription_id == inscription_id).all()
    presence_resume = {
        "total": len(presences),
        "absences": sum(1 for p in presences if p.statut_presence == "ABSENT"),
        "retards": sum(1 for p in presences if p.statut_presence == "RETARD"),
    }

    incidents = []
    annee = db.query(AnneeScolaire).filter(AnneeScolaire.annee_id == insc.annee_id).first()
    if annee:
        incidents = db.query(Incident).filter(
            Incident.eleve_id == eleve_id,
            Incident.date_incident >= annee.date_debut,
            Incident.date_incident <= annee.date_fin,
        ).order_by(Incident.date_incident.desc()).all()

    return {
        "bulletins": [
            {
                "bulletin_id": b.bulletin_id,
                "trimestre": t.libelle,
                "moyenne_generale": float(b.moyenne_generale) if b.moyenne_generale is not None else None,
                "rang": b.rang,
                "effectif_classe": b.effectif_classe,
                "mention": b.mention,
                "statut": b.statut,
            }
            for b, t in bulletins
        ],
        "presence": presence_resume,
        "incidents": [
            {
                "incident_id": i.incident_id,
                "date": str(i.date_incident),
                "type": i.type_incident,
                "gravite": i.gravite,
                "description": i.description,
                "statut": i.statut,
            }
            for i in incidents
        ],
    }


# ════════════════════════════════════════════════════════════
# GÉNÉRATION PDF — Certificat de Scolarité
# ════════════════════════════════════════════════════════════

@router.get("/{eleve_id}/certificat-scolarite/pdf")
def generer_certificat_scolarite_pdf(
    eleve_id: int,
    annee_id: int = Depends(resolve_annee_id),
    db: Session = Depends(get_db),
    etablissement_id: int = Depends(require_etablissement),
):
    """Génère un certificat de scolarité officiel au format PDF."""
    # Un certificat emis sur l'annee d'une autre ecole est un faux document.
    annee_id = resoudre_annee(db, etablissement_id, annee_id)
    from reportlab.lib.pagesizes import A4
    from reportlab.pdfgen import canvas
    from reportlab.lib.units import cm
    from fastapi.responses import StreamingResponse
    from app.models.academique import Etablissement, AnneeScolaire
    from app.core.documents_settings import get_documents_settings, dessiner_filigrane, _bool
    import io
    from datetime import date

    # ── Charger les données ──
    eleve = db.query(Eleve).filter(
        Eleve.eleve_id == eleve_id, Eleve.etablissement_id == etablissement_id
    ).first()
    if not eleve:
        raise HTTPException(404, "Élève non trouvé")

    inscription = db.query(Inscription).filter(
        Inscription.eleve_id == eleve_id,
        Inscription.annee_id == annee_id,
        Inscription.statut == "ACTIVE"
    ).first()
    if not inscription:
        raise HTTPException(404, "Aucune inscription active pour cette année")

    classe = db.query(Classe).filter(Classe.classe_id == inscription.classe_id).first()
    annee = db.query(AnneeScolaire).filter(AnneeScolaire.annee_id == annee_id).first()
    etablissement = db.query(Etablissement).filter(
        Etablissement.etablissement_id == classe.etablissement_id
    ).first()

    settings = get_documents_settings(db, classe.etablissement_id)
    nom_ecole = etablissement.nom if etablissement else "SmartSchool"
    directeur = getattr(etablissement, "nom_directeur", "") or "Le Directeur"
    adresse = getattr(etablissement, "adresse", "") or ""
    tel = getattr(etablissement, "telephone", "") or ""

    # ── Construire le PDF ──
    buffer = io.BytesIO()
    pdf = canvas.Canvas(buffer, pagesize=A4)
    largeur, hauteur = A4

    y = hauteur - 2 * cm

    # === En-tête officiel ===
    if _bool(settings.get("documents.entete_republique", "true")):
        pdf.setFont("Helvetica-Bold", 12)
        pdf.setFillColorRGB(0, 0.3, 0.1)
        pdf.drawCentredString(largeur / 2, y, "RÉPUBLIQUE DE GUINÉE")
        y -= 0.4 * cm
        pdf.setFont("Helvetica", 8)
        pdf.drawCentredString(largeur / 2, y, "Travail — Justice — Solidarité")
        y -= 0.3 * cm
        pdf.setFont("Helvetica", 8)
        pdf.drawCentredString(largeur / 2, y, "Ministère de l'Éducation Nationale")
        y -= 0.8 * cm

    # Logo placeholder
    if _bool(settings.get("documents.entete_logo", "true")):
        pdf.setStrokeColorRGB(0.7, 0.7, 0.7)
        pdf.rect(2 * cm, y - 1.5 * cm, 2.5 * cm, 2 * cm)
        pdf.setFont("Helvetica", 8)
        pdf.setFillColorRGB(0.5, 0.5, 0.5)
        pdf.drawCentredString(3.25 * cm, y - 0.7 * cm, "LOGO")

    # Nom école
    pdf.setFont("Helvetica-Bold", 16)
    pdf.setFillColorRGB(0, 0.3, 0.1)
    pdf.drawCentredString(largeur / 2, y, nom_ecole)
    y -= 0.5 * cm
    if adresse:
        pdf.setFont("Helvetica", 9)
        pdf.setFillColorRGB(0.3, 0.3, 0.3)
        pdf.drawCentredString(largeur / 2, y, adresse)
        y -= 0.4 * cm
    if tel:
        pdf.setFont("Helvetica", 9)
        pdf.drawCentredString(largeur / 2, y, f"Tél: {tel}")
        y -= 0.4 * cm

    # Séparation
    y -= 0.5 * cm
    pdf.setLineWidth(2)
    pdf.setStrokeColorRGB(0, 0.4, 0.15)
    pdf.line(2 * cm, y, largeur - 2 * cm, y)

    # === Titre ===
    y -= 2 * cm
    pdf.setFont("Helvetica-Bold", 22)
    pdf.setFillColorRGB(0, 0.3, 0.1)
    pdf.drawCentredString(largeur / 2, y, "CERTIFICAT DE SCOLARITÉ")

    y -= 0.5 * cm
    pdf.setLineWidth(1)
    pdf.line(largeur / 2 - 4 * cm, y, largeur / 2 + 4 * cm, y)

    # === Corps du certificat ===
    y -= 2 * cm
    pdf.setFont("Helvetica", 12)
    pdf.setFillColorRGB(0, 0, 0)

    annee_label = annee.libelle if annee else "N/A"
    sexe_il = "l'élève" 
    sexe_inscrit = "inscrit(e)"

    texte_lines = [
        f"Le soussigné, {directeur}, Directeur de l'établissement",
        f"{nom_ecole},",
        "",
        f"certifie que {sexe_il} :",
        "",
        f"Nom : {eleve.nom}",
        f"Prénom(s) : {eleve.prenom}",
        f"Matricule : {eleve.matricule or 'N/A'}",
        f"Date de naissance : {eleve.date_naissance or 'N/A'}",
        "",
        f"est régulièrement {sexe_inscrit} dans notre établissement",
        f"en classe de {classe.libelle} pour l'année scolaire {annee_label}.",
        "",
        "En foi de quoi, le présent certificat est délivré pour servir",
        "et valoir ce que de droit.",
    ]

    for line in texte_lines:
        pdf.drawCentredString(largeur / 2, y, line)
        y -= 0.6 * cm

    # === Date et lieu ===
    y -= 1 * cm
    ville = getattr(etablissement, "ville", "") or "Conakry"
    pdf.setFont("Helvetica", 11)
    pdf.drawRightString(
        largeur - 2 * cm, y,
        f"Fait à {ville}, le {date.today().strftime('%d/%m/%Y')}"
    )

    # === Signature du directeur ===
    y -= 1.5 * cm
    pdf.setFont("Helvetica-Bold", 11)
    pdf.drawRightString(largeur - 2 * cm, y, "Le Directeur")
    y -= 0.3 * cm
    pdf.setFont("Helvetica", 10)
    pdf.drawRightString(largeur - 2 * cm, y, directeur)
    # Ligne de signature
    pdf.line(largeur - 6 * cm, y - 1.5 * cm, largeur - 2 * cm, y - 1.5 * cm)

    # === Cachet placeholder ===
    y -= 3 * cm
    pdf.setStrokeColorRGB(0.7, 0.7, 0.7)
    pdf.setDash(3, 3)
    pdf.circle(4 * cm, y, 1.5 * cm)
    pdf.setDash()
    pdf.setFont("Helvetica", 7)
    pdf.setFillColorRGB(0.5, 0.5, 0.5)
    pdf.drawCentredString(4 * cm, y - 0.1 * cm, "CACHET")

    # === Filigrane ===
    if _bool(settings.get("documents.filigrane_certificats", "true")):
        dessiner_filigrane(pdf, largeur, hauteur, settings)

    # === Finaliser ===
    pdf.showPage()
    pdf.save()
    buffer.seek(0)

    filename = f"certificat_{eleve.nom}_{eleve.prenom}.pdf".replace(" ", "_")
    return StreamingResponse(
        buffer,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


# ════════════════════════════════════════════════════════════════════════
# PARENTS D'UN ÉLÈVE — ajout d'un second parent, rattachement après coup
# ════════════════════════════════════════════════════════════════════════
# Le lien parent-enfant ne se créait qu'à l'inscription de l'élève, et pour UN
# seul contact. Conséquences : la mère ne pouvait pas être ajoutée après le
# père, et un élève inscrit sans parent le restait définitivement.


class ParentLienCreate(BaseModel):
    """Rattacher un parent à un élève.

    Deux usages en une seule route, parce que c'est le même geste vu par
    l'école : « qui est le parent de cet enfant ? »

      - `parent_id` fourni  -> on rattache un parent DÉJÀ enregistré (le père
        est là, on ajoute la mère qui suit déjà un aîné) ;
      - sinon                -> on crée la fiche à partir des informations
        saisies, puis on la rattache.
    """
    parent_id: Optional[int] = None
    lien_parente: str = "PERE"
    est_contact_principal: bool = False
    est_responsable_financier: bool = False
    # Utilisés uniquement à la création
    nom: Optional[str] = None
    prenom: Optional[str] = None
    sexe: Optional[str] = None
    telephone_1: Optional[str] = None
    telephone_2: Optional[str] = None
    email: Optional[str] = None
    profession: Optional[str] = None
    adresse: Optional[str] = None
    mot_de_passe: Optional[str] = None


class ParentLienUpdate(BaseModel):
    lien_parente: Optional[str] = None
    est_contact_principal: Optional[bool] = None
    est_responsable_financier: Optional[bool] = None


def _eleve_de_l_ecole_ou_404(db: Session, eleve_id: int, etablissement_id: int) -> Eleve:
    eleve = db.query(Eleve).filter(
        Eleve.eleve_id == eleve_id,
        Eleve.etablissement_id == etablissement_id,
    ).first()
    if not eleve:
        raise HTTPException(404, "Élève non trouvé")
    return eleve


@router.get("/{eleve_id}/parents")
def lister_parents_eleve(
    eleve_id: int,
    db: Session = Depends(get_db),
    etablissement_id: int = Depends(require_etablissement),
):
    """Parents rattachés à un élève, avec la nature du lien."""
    _eleve_de_l_ecole_ou_404(db, eleve_id, etablissement_id)
    lignes = (
        db.query(EleveParent, Parent)
        .join(Parent, Parent.parent_id == EleveParent.parent_id)
        .filter(EleveParent.eleve_id == eleve_id)
        .all()
    )
    return [
        {
            "lien_id": lien.eleve_parent_id,
            "parent_id": parent.parent_id,
            "nom": parent.nom,
            "prenom": parent.prenom,
            "telephone_1": parent.telephone_1,
            "telephone_2": parent.telephone_2,
            "email": parent.email,
            "profession": parent.profession,
            "lien_parente": lien.lien_parente,
            "est_contact_principal": lien.est_contact_principal == "O",
            "est_responsable_financier": lien.est_responsable_financier == "O",
        }
        for lien, parent in lignes
    ]


@router.post("/{eleve_id}/parents", status_code=201)
def rattacher_parent_eleve(
    eleve_id: int,
    data: ParentLienCreate,
    db: Session = Depends(get_db),
    etablissement_id: int = Depends(require_etablissement),
):
    """Ajoute un parent à un élève : un second contact, ou le premier s'il
    manquait."""
    eleve = _eleve_de_l_ecole_ou_404(db, eleve_id, etablissement_id)
    _verifier_annee_modifiable(db, None)

    if data.parent_id:
        # Le parent doit relever de CETTE école. Une fiche d'ailleurs n'est
        # jamais rattachée : chaque école a la sienne (migration 2026_08_multi_01).
        parent = db.query(Parent).filter(
            Parent.parent_id == data.parent_id,
            Parent.etablissement_id == etablissement_id,
        ).first()
        if not parent:
            raise HTTPException(404, "Parent non trouvé")
    else:
        if not data.telephone_1 or not data.nom or not data.prenom:
            raise HTTPException(
                400, "Nom, prénom et téléphone sont requis pour créer un nouveau parent."
            )
        # Déjà enregistré dans cette école ? On le réutilise plutôt que de
        # créer un doublon que l'index refuserait de toute façon.
        parent = db.query(Parent).filter(
            Parent.telephone_1 == data.telephone_1,
            Parent.etablissement_id == etablissement_id,
        ).first()
        if not parent:
            exiger_identifiants_libres(
                db, [data.telephone_1, data.email], etablissement_id=etablissement_id
            )
            parent = Parent(
                etablissement_id=etablissement_id,
                nom=data.nom, prenom=data.prenom, sexe=data.sexe,
                telephone_1=data.telephone_1, telephone_2=data.telephone_2,
                email=data.email, profession=data.profession, adresse=data.adresse,
                mot_de_passe=hash_password(data.mot_de_passe) if data.mot_de_passe else None,
                statut="ACTIF",
            )
            db.add(parent)
            db.flush()

    if db.query(EleveParent).filter(
        EleveParent.eleve_id == eleve_id,
        EleveParent.parent_id == parent.parent_id,
    ).first():
        raise HTTPException(409, f"{parent.prenom} {parent.nom} est déjà rattaché à cet élève.")

    # Un seul contact principal, un seul responsable financier : poser le
    # drapeau sur un parent le retire aux autres, sinon deux « principaux »
    # coexistent et plus personne ne sait qui appeler.
    if data.est_contact_principal or data.est_responsable_financier:
        for autre in db.query(EleveParent).filter(EleveParent.eleve_id == eleve_id).all():
            if data.est_contact_principal:
                autre.est_contact_principal = "N"
            if data.est_responsable_financier:
                autre.est_responsable_financier = "N"

    lien = EleveParent(
        eleve_id=eleve_id,
        parent_id=parent.parent_id,
        lien_parente=data.lien_parente,
        est_contact_principal="O" if data.est_contact_principal else "N",
        est_responsable_financier="O" if data.est_responsable_financier else "N",
    )
    db.add(lien)
    db.commit()
    db.refresh(lien)
    return {
        "message": f"{parent.prenom} {parent.nom} rattaché à {eleve.prenom} {eleve.nom}.",
        "lien_id": lien.eleve_parent_id,
        "parent_id": parent.parent_id,
    }


@router.put("/{eleve_id}/parents/{lien_id}")
def modifier_lien_parent(
    eleve_id: int,
    lien_id: int,
    data: ParentLienUpdate,
    db: Session = Depends(get_db),
    etablissement_id: int = Depends(require_etablissement),
):
    """Change la nature du lien, ou désigne le contact principal."""
    _eleve_de_l_ecole_ou_404(db, eleve_id, etablissement_id)
    lien = db.query(EleveParent).filter(
        EleveParent.eleve_parent_id == lien_id,
        EleveParent.eleve_id == eleve_id,
    ).first()
    if not lien:
        raise HTTPException(404, "Lien non trouvé")

    if data.lien_parente is not None:
        lien.lien_parente = data.lien_parente
    for champ, valeur in (
        ("est_contact_principal", data.est_contact_principal),
        ("est_responsable_financier", data.est_responsable_financier),
    ):
        if valeur is None:
            continue
        if valeur:
            for autre in db.query(EleveParent).filter(
                EleveParent.eleve_id == eleve_id,
                EleveParent.eleve_parent_id != lien_id,
            ).all():
                setattr(autre, champ, "N")
        setattr(lien, champ, "O" if valeur else "N")

    db.commit()
    return {"message": "Lien mis à jour."}


@router.delete("/{eleve_id}/parents/{lien_id}")
def detacher_parent_eleve(
    eleve_id: int,
    lien_id: int,
    db: Session = Depends(get_db),
    etablissement_id: int = Depends(require_etablissement),
):
    """Détache un parent d'un élève.

    Seul le LIEN est supprimé : la fiche du parent reste, avec ses autres
    enfants et son accès au portail. Supprimer la fiche couperait l'accès d'un
    parent aux frères et sœurs encore scolarisés.
    """
    _eleve_de_l_ecole_ou_404(db, eleve_id, etablissement_id)
    lien = db.query(EleveParent).filter(
        EleveParent.eleve_parent_id == lien_id,
        EleveParent.eleve_id == eleve_id,
    ).first()
    if not lien:
        raise HTTPException(404, "Lien non trouvé")
    db.delete(lien)
    db.commit()
    return {"message": "Parent détaché de cet élève. Sa fiche et ses autres enfants sont conservés."}
