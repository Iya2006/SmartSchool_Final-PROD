"""
SMARTSCHOOL API — Routes Classes & Inscriptions
"""
from fastapi import APIRouter, Depends, HTTPException, Body, Response
from sqlalchemy.orm import Session
from sqlalchemy import func, or_
from typing import List, Optional
from pydantic import BaseModel, Field
from app.core.database import get_db
from app.core.auth import get_current_user, require_etablissement
from app.core.annee_lock import resolve_annee_id
from app.models.academique import Classe, Inscription, Eleve, Niveau, Enseignant, ClasseMatiere, Matiere, Cycle
from app.schemas.schemas import ClasseCreate, ClasseOut, InscriptionCreate, InscriptionOut
from app.core.annee_courante import resoudre_annee

router = APIRouter(prefix="/api/classes", tags=["Classes"])

# Mapping series code → Niveau codes in DB
SERIES_NIVEAU_CODES = {
    "SM": ["11SM", "12SM", "TSM"],
    "SE": ["11SE", "12SE", "TSE"],
    "SS": ["11SS", "12SS", "TSS"],
}

# Input validation schema
class MatiereCoefficientUpdate(BaseModel):
    matiere_id: int
    coefficient: float = Field(..., gt=0, le=10)
    note_sur: Optional[float] = Field(None, gt=0, le=100)

def check_admin_access(current_user: dict):
    role = current_user.get("role")
    if role not in {"SUPER_ADMIN", "FONDATEUR", "DG", "ADMIN", "INFORMATICIEN"}:
        raise HTTPException(
            status_code=403,
            detail="Accès interdit : privilèges insuffisants pour cette configuration"
        )

@router.get("/lycee-series-coefficients")
def get_lycee_series_coefficients(
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
    etablissement_id: int = Depends(require_etablissement),
):
    """
    Retourne les coefficients par matière pour chaque série lycée (SM, SE, SS).
    Calcule la moyenne des coefficients de ClasseMatiere pour les classes de chaque série.

    Restreint à l'établissement appelant : avant le Lot 7, la classe de
    référence (`classe_ids[0]`) pouvait appartenir à une AUTRE école, dont
    les coefficients étaient alors affichés comme étant ceux de la série.
    """
    check_admin_access(current_user)
    result = {}
    for serie, niveau_codes in SERIES_NIVEAU_CODES.items():
        # Get all classes belonging to this serie's niveaux
        niveaux = db.query(Niveau).filter(Niveau.code.in_(niveau_codes)).all()
        niveau_ids = [n.niveau_id for n in niveaux]
        classes = db.query(Classe).filter(
            Classe.niveau_id.in_(niveau_ids), Classe.statut == "ACTIVE",
            Classe.etablissement_id == etablissement_id,
        ).all()
        classe_ids = [c.classe_id for c in classes]

        # Get unique matières for these classes via JOIN (avoids N+1)
        matieres_data = []
        if classe_ids:
            ref_class_id = classe_ids[0]
            rows = (
                db.query(ClasseMatiere, Matiere)
                .join(Matiere, ClasseMatiere.matiere_id == Matiere.matiere_id)
                .filter(
                    ClasseMatiere.classe_id == ref_class_id,
                    ClasseMatiere.est_active == "O"
                )
                .all()
            )
            for cm, m in rows:
                matieres_data.append({
                    "matiere_id": m.matiere_id,
                    "code": m.code,
                    "libelle": m.libelle,
                    "categorie": m.categorie,
                    "coefficient": float(cm.coefficient),
                    "note_sur": float(m.note_sur) if m.note_sur else 20,
                })
        result[serie] = {
            "classes_count": len(classe_ids),
            "matieres": matieres_data
        }
    return result


@router.put("/lycee-series-coefficients/{serie}")
def update_lycee_series_coefficients(
    serie: str,
    updates: List[MatiereCoefficientUpdate] = Body(...),
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
    etablissement_id: int = Depends(require_etablissement),
):
    """
    Met à jour les coefficients des ClasseMatiere pour toutes les classes
    d'une série lycée DE CET ÉTABLISSEMENT.

    AVANT LE LOT 7 : cette route écrivait sur TOUTES les classes de série
    lycée de TOUTE la plateforme — la vulnérabilité en écriture la plus
    massive du chantier (un admin d'une école pouvait modifier d'un seul
    appel les coefficients de toutes les autres écoles). `Matiere.note_sur`
    était également modifiée sans aucune vérification d'appartenance.
    """
    check_admin_access(current_user)
    serie_upper = serie.upper()
    if serie_upper not in SERIES_NIVEAU_CODES:
        raise HTTPException(400, f"Série inconnue: {serie}. Valeurs acceptées: SM, SE, SS")

    niveau_codes = SERIES_NIVEAU_CODES[serie_upper]
    niveaux = db.query(Niveau).filter(Niveau.code.in_(niveau_codes)).all()
    niveau_ids = [n.niveau_id for n in niveaux]
    classes = db.query(Classe).filter(
        Classe.niveau_id.in_(niveau_ids), Classe.statut == "ACTIVE",
        Classe.etablissement_id == etablissement_id,
    ).all()

    # Les matières référencées doivent appartenir à cet établissement
    # (OWNERSHIP via Cycle) — `note_sur` est une colonne de Matiere, partagée
    # par toutes les classes qui l'utilisent : sans cette vérification, une
    # écriture pouvait toucher la matière d'une autre école.
    matiere_ids = {u.matiere_id for u in updates}
    matieres_valides = set()
    if matiere_ids:
        matieres_valides = {
            m.matiere_id for m in db.query(Matiere.matiere_id)
            .join(Cycle, Cycle.cycle_id == Matiere.cycle_id)
            .filter(Matiere.matiere_id.in_(matiere_ids), Cycle.etablissement_id == etablissement_id)
            .all()
        }
        if matieres_valides != matiere_ids:
            raise HTTPException(403, "Matière(s) invalide(s) pour cet établissement")

    updated = 0
    for cls in classes:
        for upd in updates:
            matiere_id = upd.matiere_id
            new_coef = upd.coefficient
            new_note_sur = upd.note_sur
            cm = db.query(ClasseMatiere).filter(
                ClasseMatiere.classe_id == cls.classe_id,
                ClasseMatiere.matiere_id == matiere_id,
                ClasseMatiere.est_active == "O"
            ).first()
            if cm and new_coef is not None:
                cm.coefficient = float(new_coef)
            # note_sur is on Matiere level — update the matiere directly
            if new_note_sur is not None:
                m = db.query(Matiere).filter(Matiere.matiere_id == matiere_id).first()
                if m:
                    m.note_sur = float(new_note_sur)
            updated += 1

    db.commit()
    return {"message": f"{updated} coefficients mis à jour pour la série {serie_upper}", "serie": serie_upper}




@router.get("", response_model=List[ClasseOut])
def list_classes(
    response: Response,
    annee_id: int = Depends(resolve_annee_id),
    statut: Optional[str] = "ACTIVE",
    search: Optional[str] = None,
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    etablissement_id: int = Depends(require_etablissement),
):
    # Sans annee precisee, celle EN COURS DE CETTE ECOLE. La valeur par defaut
    # etait 1 : l'annee de la premiere ecole inscrite, donc zero classe pour
    # toutes les autres.
    annee_id = resoudre_annee(db, etablissement_id, annee_id)
    query = db.query(Classe).filter(
        Classe.etablissement_id == etablissement_id,
        Classe.annee_id == annee_id
    )
    if statut:
        query = query.filter(Classe.statut == statut)
    if search:
        like = f"%{search}%"
        query = query.filter(or_(Classe.code.ilike(like), Classe.libelle.ilike(like)))
    # skip/limit et defaut (100) inchanges : cette route sert aussi de simple
    # selecteur "toutes les classes" a 40+ pages frontend qui n'envoient pas
    # ces parametres — search/X-Total-Count sont purement additifs.
    response.headers["X-Total-Count"] = str(query.count())
    classes = query.order_by(Classe.code).offset(skip).limit(limit).all()

    # Niveaux, cycles et compte de matieres actives : tous prechargés en
    # requêtes groupées, jamais une requête par classe dans la boucle.
    niveaux = {
        n.niveau_id: n for n in db.query(Niveau).filter(
            Niveau.niveau_id.in_([cl.niveau_id for cl in classes])
        ).all()
    } if classes else {}
    cycles = {
        c.cycle_id: c for c in db.query(Cycle).filter(
            Cycle.cycle_id.in_({n.cycle_id for n in niveaux.values()})
        ).all()
    } if niveaux else {}
    nb_matieres_par_classe = dict(
        db.query(ClasseMatiere.classe_id, func.count(ClasseMatiere.classe_matiere_id))
        .filter(
            ClasseMatiere.classe_id.in_([cl.classe_id for cl in classes]),
            ClasseMatiere.est_active == "O",
        )
        .group_by(ClasseMatiere.classe_id)
        .all()
    ) if classes else {}

    for cl in classes:
        cl.nb_matieres = nb_matieres_par_classe.get(cl.classe_id, 0)
        niv = niveaux.get(cl.niveau_id)
        cl.niveau_libelle = niv.libelle if niv else None
        cl.niveau_ordre = niv.ordre if niv else None
        cl.est_examen = niv.est_examen if niv else None
        cyc = cycles.get(niv.cycle_id) if niv else None
        cl.cycle_code = cyc.code if cyc else None
        cl.cycle_libelle = cyc.libelle if cyc else None
    return classes


@router.get("/stats", summary="Agrégats globaux (effectif, capacité) de toutes les classes")
def stats_classes(
    annee_id: int = Depends(resolve_annee_id),
    statut: Optional[str] = "ACTIVE",
    db: Session = Depends(get_db),
    etablissement_id: int = Depends(require_etablissement),
):
    """Total classes/effectif/capacité en agrégats SQL — jamais en sommant la
    page actuellement affichée côté frontend (qui est paginée depuis l'ajout
    de skip/limit sur `list_classes`)."""
    query = db.query(
        func.count(Classe.classe_id),
        func.coalesce(func.sum(Classe.effectif_actuel), 0),
        func.coalesce(func.sum(Classe.capacite_max), 0),
    ).filter(Classe.etablissement_id == etablissement_id, Classe.annee_id == annee_id)
    if statut:
        query = query.filter(Classe.statut == statut)
    total_classes, total_effectif, total_capacite = query.one()
    return {
        "total_classes": total_classes,
        "total_effectif": total_effectif,
        "total_capacite": total_capacite,
    }


@router.get("/{classe_id}", response_model=ClasseOut)
def get_classe(classe_id: int, db: Session = Depends(get_db), etablissement_id: int = Depends(require_etablissement)):
    cl = db.query(Classe).filter(
        Classe.classe_id == classe_id, Classe.etablissement_id == etablissement_id
    ).first()
    if not cl:
        raise HTTPException(status_code=404, detail="Classe non trouvée")
    cl.nb_matieres = db.query(ClasseMatiere).filter(
        ClasseMatiere.classe_id == cl.classe_id,
        ClasseMatiere.est_active == "O"
    ).count()
    niv = db.query(Niveau).filter(Niveau.niveau_id == cl.niveau_id).first()
    cl.niveau_libelle = niv.libelle if niv else None
    return cl


@router.get("/{classe_id}/eleves")
def get_classe_eleves(classe_id: int, db: Session = Depends(get_db), etablissement_id: int = Depends(require_etablissement)):
    classe_valide = db.query(Classe.classe_id).filter(
        Classe.classe_id == classe_id, Classe.etablissement_id == etablissement_id
    ).first()
    if not classe_valide:
        raise HTTPException(status_code=404, detail="Classe non trouvée")

    results = db.query(
        Eleve.eleve_id,
        Eleve.matricule,
        Eleve.nom,
        Eleve.prenom,
        Eleve.sexe,
        Eleve.date_naissance,
        Inscription.statut.label("statut_inscription")
    ).join(
        Inscription, Eleve.eleve_id == Inscription.eleve_id
    ).filter(
        Inscription.classe_id == classe_id,
        Inscription.statut == "ACTIVE"
    ).order_by(Eleve.nom, Eleve.prenom).all()

    return [
        {
            "eleve_id": r.eleve_id, "matricule": r.matricule,
            "nom": r.nom, "prenom": r.prenom, "sexe": r.sexe,
            "date_naissance": str(r.date_naissance),
            "statut_inscription": r.statut_inscription
        } for r in results
    ]


def _verifier_niveau_et_annee(db: Session, niveau_id: int, annee_id: int, etablissement_id: int) -> None:
    """Le niveau et l'année désignés doivent appartenir à CETTE école.

    Deux problèmes réglés d'un coup :
      * un `niveau_id` inexistant provoquait une violation de clé étrangère non
        capturée, donc un **500** illisible — c'est ce que voyaient les écoles
        neuves, dont aucun cycle n'est encore créé (« Une erreur s'est produite
        lors de la création ») ;
      * un `niveau_id` appartenant à une AUTRE école était accepté tel quel :
        la classe se retrouvait rattachée au niveau d'un autre établissement.
        `Niveau` est OWNERSHIP via `Cycle`, il faut donc joindre pour le
        vérifier.
    """
    niveau = (
        db.query(Niveau.niveau_id)
        .join(Cycle, Cycle.cycle_id == Niveau.cycle_id)
        .filter(Niveau.niveau_id == niveau_id, Cycle.etablissement_id == etablissement_id)
        .first()
    )
    if not niveau:
        # Ne renvoie PAS vers un écran de création de cycles : il n'en existe
        # aucun. Le référentiel scolaire est semé à l'inscription de l'école
        # (`amorcer_referentiel_scolaire`) ; s'il manque, c'est une anomalie
        # d'installation, pas quelque chose que l'utilisateur peut corriger.
        raise HTTPException(
            status_code=404,
            detail="Ce niveau n'appartient pas à votre établissement. Si la liste des "
                   "niveaux est vide, signalez-le à votre administrateur : le "
                   "référentiel scolaire de l'école n'a pas été installé.",
        )

    from app.models.academique import AnneeScolaire

    annee = db.query(AnneeScolaire.annee_id).filter(
        AnneeScolaire.annee_id == annee_id,
        AnneeScolaire.etablissement_id == etablissement_id,
    ).first()
    if not annee:
        raise HTTPException(status_code=404, detail="Année scolaire introuvable pour cet établissement.")


@router.post("", response_model=ClasseOut, status_code=201)
def create_classe(data: ClasseCreate, db: Session = Depends(get_db), etablissement_id: int = Depends(require_etablissement)):
    # `data.etablissement_id` (obligatoire dans ClasseBase) est ignoré et
    # remplacé par l'établissement authentifié — avant le Lot 7, une classe
    # pouvait être créée dans l'école de son choix.
    _verifier_niveau_et_annee(db, data.niveau_id, data.annee_id, etablissement_id)

    existing = db.query(Classe).filter(
        Classe.etablissement_id == etablissement_id,
        Classe.annee_id == data.annee_id,
        ((Classe.libelle == data.libelle) | (Classe.code == data.code))
    ).first()

    if existing:
        raise HTTPException(
            status_code=409,
            detail=f"Une classe avec le libellé '{data.libelle}' ou le code '{data.code}' existe déjà."
        )

    payload = data.model_dump()
    payload["etablissement_id"] = etablissement_id
    cl = Classe(**payload)
    db.add(cl)
    db.commit()
    db.refresh(cl)
    return cl


@router.put("/{classe_id}", response_model=ClasseOut)
def update_classe(classe_id: int, data: ClasseCreate, db: Session = Depends(get_db), etablissement_id: int = Depends(require_etablissement)):
    cl = db.query(Classe).filter(
        Classe.classe_id == classe_id, Classe.etablissement_id == etablissement_id
    ).first()
    if not cl:
        raise HTTPException(status_code=404, detail="Classe non trouvée")
    # Même contrôle qu'à la création : sans lui, une modification pouvait
    # rattacher la classe au niveau ou à l'année d'une autre école.
    _verifier_niveau_et_annee(db, data.niveau_id, data.annee_id, etablissement_id)
    # `etablissement_id` retiré du payload : une classe ne peut pas être
    # déplacée vers une autre école via cette route.
    update_data = data.model_dump(exclude_unset=True)
    update_data.pop("etablissement_id", None)
    for key, value in update_data.items():
        setattr(cl, key, value)
    db.commit()
    db.refresh(cl)
    return cl


def blocages_suppression_classe(db: Session, classe_id: int) -> List[str]:
    """Ce qui empêche de supprimer une classe : de la vraie histoire à préserver
    (élève actif, note saisie, facture, dépense/écriture comptable). Liste vide
    = la classe est un simple échafaudage, supprimable. Partagé avec la
    suppression d'année (une année ne se supprime que si toutes ses classes le
    permettent)."""
    from app.models.academique import Evaluation, Note, Depense, LigneEcriture, Facture

    inscription_ids = [i.inscription_id for i in db.query(Inscription.inscription_id).filter(
        Inscription.classe_id == classe_id
    ).all()]
    nb_actifs = db.query(Inscription).filter(
        Inscription.classe_id == classe_id, Inscription.statut == "ACTIVE"
    ).count()
    nb_notes = db.query(Note).join(Evaluation, Note.evaluation_id == Evaluation.evaluation_id).filter(
        Evaluation.classe_id == classe_id
    ).count()
    nb_factures = db.query(Facture).filter(Facture.inscription_id.in_(inscription_ids)).count() if inscription_ids else 0
    nb_depenses = db.query(Depense).filter(Depense.classe_id == classe_id).count()
    nb_ecritures = db.query(LigneEcriture).filter(LigneEcriture.classe_id == classe_id).count()

    blocages = []
    if nb_actifs:
        blocages.append(f"{nb_actifs} inscription(s) d'élève active(s)")
    if nb_notes:
        blocages.append(f"{nb_notes} note(s) déjà saisie(s)")
    if nb_factures:
        blocages.append(f"{nb_factures} facture(s)")
    if nb_depenses:
        blocages.append(f"{nb_depenses} dépense(s) comptable(s)")
    if nb_ecritures:
        blocages.append(f"{nb_ecritures} écriture(s) comptable(s)")
    return blocages


def purger_classe(db: Session, classe_id: int) -> None:
    """Supprime la classe et tout son échafaudage (évaluations sans notes,
    emploi du temps, affectations, tarifs, matières rattachées, inscriptions
    inactives sans note ni facture), enfants d'abord. NE VÉRIFIE RIEN : l'appelant
    garantit d'abord (via blocages_suppression_classe) qu'aucune vraie histoire
    n'est rattachée. Ne commit pas — l'appelant gère la transaction."""
    from app.models.academique import (
        Evaluation, EvaluationSession, PeriodeEpreuve, Note, Bulletin, BulletinLigne,
        Seance, CreneauEmploi, Affectation, Disponibilite, SujetExamen, CreneauExamen,
        Devoir, FournitureScolaire, TarifClasse, Presence, ResultatOfficielExamen,
    )

    inscription_ids = [i.inscription_id for i in db.query(Inscription.inscription_id).filter(
        Inscription.classe_id == classe_id
    ).all()]
    eval_ids = [e.evaluation_id for e in db.query(Evaluation.evaluation_id).filter(
        Evaluation.classe_id == classe_id
    ).all()]

    if eval_ids:
        db.query(Note).filter(Note.evaluation_id.in_(eval_ids)).delete(synchronize_session=False)
        db.query(PeriodeEpreuve).filter(PeriodeEpreuve.evaluation_id.in_(eval_ids)).delete(synchronize_session=False)
    db.query(PeriodeEpreuve).filter(PeriodeEpreuve.classe_id == classe_id).delete(synchronize_session=False)
    db.query(Evaluation).filter(Evaluation.classe_id == classe_id).delete(synchronize_session=False)
    db.query(EvaluationSession).filter(EvaluationSession.classe_id == classe_id).delete(synchronize_session=False)

    if inscription_ids:
        bulletin_ids = [b.bulletin_id for b in db.query(Bulletin.bulletin_id).filter(
            Bulletin.inscription_id.in_(inscription_ids)
        ).all()]
        if bulletin_ids:
            db.query(BulletinLigne).filter(BulletinLigne.bulletin_id.in_(bulletin_ids)).delete(synchronize_session=False)
        db.query(Bulletin).filter(Bulletin.inscription_id.in_(inscription_ids)).delete(synchronize_session=False)
        db.query(Presence).filter(Presence.inscription_id.in_(inscription_ids)).delete(synchronize_session=False)
        db.query(ResultatOfficielExamen).filter(ResultatOfficielExamen.inscription_id.in_(inscription_ids)).delete(synchronize_session=False)
    db.query(Inscription).filter(Inscription.classe_id == classe_id).delete(synchronize_session=False)

    # Une autre inscription peut viser cette classe comme cible de promotion.
    db.query(Inscription).filter(Inscription.classe_cible_id == classe_id).update(
        {Inscription.classe_cible_id: None}, synchronize_session=False
    )

    db.query(Seance).filter(Seance.classe_id == classe_id).delete(synchronize_session=False)
    db.query(CreneauEmploi).filter(CreneauEmploi.classe_id == classe_id).delete(synchronize_session=False)
    db.query(Affectation).filter(Affectation.classe_id == classe_id).delete(synchronize_session=False)
    db.query(Disponibilite).filter(Disponibilite.classe_id == classe_id).delete(synchronize_session=False)
    db.query(SujetExamen).filter(SujetExamen.classe_id == classe_id).delete(synchronize_session=False)
    db.query(CreneauExamen).filter(CreneauExamen.classe_id == classe_id).delete(synchronize_session=False)
    db.query(Devoir).filter(Devoir.classe_id == classe_id).delete(synchronize_session=False)
    db.query(FournitureScolaire).filter(FournitureScolaire.classe_id == classe_id).delete(synchronize_session=False)
    db.query(TarifClasse).filter(TarifClasse.classe_id == classe_id).delete(synchronize_session=False)
    db.query(ClasseMatiere).filter(ClasseMatiere.classe_id == classe_id).delete(synchronize_session=False)
    db.query(Classe).filter(Classe.classe_id == classe_id).delete(synchronize_session=False)


@router.delete("/{classe_id}")
def delete_classe(classe_id: int, db: Session = Depends(get_db), etablissement_id: int = Depends(require_etablissement)):
    """Supprime une classe vide (typiquement créée par erreur ou pour un test).

    On refuse UNIQUEMENT si la classe porte de la vraie histoire qui serait
    perdue : des élèves ACTIFS (des inscrits en cours), des NOTES saisies, des
    FACTURES, ou des écritures/dépenses comptables. Le message dit précisément
    ce qui bloque, au lieu de laisser PostgreSQL répondre par une violation de
    clé étrangère illisible. Le reste (échafaudage) est nettoyé par purger_classe.
    """
    from sqlalchemy.exc import SQLAlchemyError

    cl = db.query(Classe).filter(
        Classe.classe_id == classe_id, Classe.etablissement_id == etablissement_id
    ).first()
    if not cl:
        raise HTTPException(status_code=404, detail="Classe non trouvée")

    blocages = blocages_suppression_classe(db, classe_id)
    if blocages:
        raise HTTPException(
            status_code=409,
            detail=("Cette classe ne peut pas être supprimée : elle contient "
                    + " et ".join(blocages)
                    + ". Archivez-la plutôt (statut INACTIVE) pour conserver son historique."),
        )

    libelle = cl.libelle
    try:
        purger_classe(db, classe_id)
        db.commit()
    except SQLAlchemyError:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail=("Cette classe ne peut pas être supprimée : des données y sont "
                    "encore rattachées. Archivez-la plutôt (statut INACTIVE)."),
        )
    return {"message": f"Classe « {libelle} » supprimée."}


@router.get("/{classe_id}/profil")
def get_classe_profil(classe_id: int, db: Session = Depends(get_db), etablissement_id: int = Depends(require_etablissement)):
    """Profil complet d'une classe: infos, enseignant principal, élèves, matières"""
    from app.models.academique import ClasseMatiere, Matiere

    cl = db.query(Classe).filter(
        Classe.classe_id == classe_id, Classe.etablissement_id == etablissement_id
    ).first()
    if not cl:
        raise HTTPException(404, "Classe non trouvée")
    
    # Niveau + cycle (le cycle sert au frontend a distinguer le primaire, ou il
    # y a un instituteur titulaire, du college/lycee, ou chaque matiere a son
    # enseignant et ou il n'y a pas de professeur principal).
    niveau = db.query(Niveau).filter(Niveau.niveau_id == cl.niveau_id).first()
    cycle = db.query(Cycle).filter(Cycle.cycle_id == niveau.cycle_id).first() if niveau else None

    # Prof principal
    prof = None
    if cl.professeur_principal:
        ens = db.query(Enseignant).filter(Enseignant.enseignant_id == cl.professeur_principal).first()
        if ens:
            prof = {
                "enseignant_id": ens.enseignant_id, "matricule": ens.matricule,
                "nom": ens.nom, "prenom": ens.prenom, "sexe": ens.sexe,
                "specialite": ens.specialite, "telephone": ens.telephone
            }
    
    # Élèves
    eleves_data = db.query(
        Eleve.eleve_id, Eleve.matricule, Eleve.nom, Eleve.prenom,
        Eleve.sexe, Eleve.date_naissance,
        Inscription.statut.label("statut_inscription"),
        Inscription.role_classe
    ).join(
        Inscription, Eleve.eleve_id == Inscription.eleve_id
    ).filter(
        Inscription.classe_id == classe_id, Inscription.statut == "ACTIVE"
    ).order_by(Eleve.nom, Eleve.prenom).all()
    
    # Historique de redoublement — compté en UNE requête groupée (pas une par
    # élève) sur TOUTES les inscriptions passées de cette classe, quelle que
    # soit l'année, marquées REDOUBLANT par une clôture précédente (voir
    # app/api/promotion.py). Sert à afficher un badge "redoublant Nx" côté
    # admin sur la fiche classe.
    eleve_ids = [e.eleve_id for e in eleves_data]
    nb_redoublements = {}
    if eleve_ids:
        rows = db.query(Inscription.eleve_id, func.count(Inscription.inscription_id)).filter(
            Inscription.eleve_id.in_(eleve_ids), Inscription.decision_fin_annee == "REDOUBLANT"
        ).group_by(Inscription.eleve_id).all()
        nb_redoublements = {eid: n for eid, n in rows}

    eleves = [{
        "eleve_id": e.eleve_id, "matricule": e.matricule,
        "nom": e.nom, "prenom": e.prenom, "sexe": e.sexe,
        "date_naissance": str(e.date_naissance),
        "statut_inscription": e.statut_inscription,
        "role_classe": e.role_classe,
        "nb_redoublements": nb_redoublements.get(e.eleve_id, 0),
    } for e in eleves_data]
    
    # Chefs de classe
    chefs = [e for e in eleves if e["role_classe"] and e["role_classe"].startswith("CHEF")]
    
    # Matières attribuées — matières préchargées en une requête groupée
    # (IN sur les ids), pas une requête par matière dans la boucle.
    matieres_assoc = db.query(ClasseMatiere).filter(
        ClasseMatiere.classe_id == classe_id, ClasseMatiere.est_active == "O"
    ).all()
    matiere_ids = [a.matiere_id for a in matieres_assoc]
    matieres_map = {
        m.matiere_id: m for m in db.query(Matiere).filter(Matiere.matiere_id.in_(matiere_ids)).all()
    } if matiere_ids else {}
    matieres = []
    for a in matieres_assoc:
        m = matieres_map.get(a.matiere_id)
        if m:
            matieres.append({
                "matiere_id": m.matiere_id, "code": m.code,
                "libelle": m.libelle, "categorie": m.categorie,
                "coefficient": float(a.coefficient),
                "nb_heures_semaine": a.nb_heures_semaine
            })
    
    nb_garcons = len([e for e in eleves if e["sexe"] == "M"])
    nb_filles = len([e for e in eleves if e["sexe"] == "F"])
    
    # Top 10 sur les VRAIES moyennes : on ne fabrique jamais de note. On lit le
    # bulletin le plus récent de chaque élève (l'annuel s'il existe, sinon le
    # dernier trimestre calculé). Un élève sans moyenne calculée n'apparaît pas
    # — mieux vaut une liste courte que des notes inventées.
    from app.models.academique import Bulletin
    insc_rows = db.query(Inscription.inscription_id, Inscription.eleve_id).filter(
        Inscription.classe_id == classe_id, Inscription.statut == "ACTIVE"
    ).all()
    insc_to_eleve = {r.inscription_id: r.eleve_id for r in insc_rows}
    moyennes_reelles = {}
    if insc_to_eleve:
        bulletins = (
            db.query(Bulletin.inscription_id, Bulletin.moyenne_generale, Bulletin.trimestre_id)
            .filter(
                Bulletin.inscription_id.in_(list(insc_to_eleve.keys())),
                Bulletin.moyenne_generale.isnot(None),
            )
            # trimestre_id NULL = bulletin annuel : on le veut en dernier pour
            # qu'il prime (le plus récent) si présent.
            .order_by(func.coalesce(Bulletin.trimestre_id, 999999).asc())
            .all()
        )
        for b in bulletins:
            moyennes_reelles[insc_to_eleve[b.inscription_id]] = round(float(b.moyenne_generale), 2)
    top10 = [
        {**e, "moyenne_generale": moyennes_reelles[e["eleve_id"]]}
        for e in eleves if e["eleve_id"] in moyennes_reelles
    ]
    top10.sort(key=lambda x: x["moyenne_generale"], reverse=True)
    top10 = top10[:10]
    
    return {
        "classe_id": cl.classe_id, "code": cl.code, "libelle": cl.libelle,
        "capacite_max": cl.capacite_max, "effectif_actuel": cl.effectif_actuel,
        "statut": cl.statut,
        "niveau": {"niveau_id": niveau.niveau_id, "code": niveau.code, "libelle": niveau.libelle} if niveau else None,
        "cycle_code": cycle.code if cycle else None,
        "cycle_libelle": cycle.libelle if cycle else None,
        "professeur_principal": prof,
        "chefs_de_classe": chefs,
        "nb_garcons": nb_garcons, "nb_filles": nb_filles,
        "nb_matieres": len(matieres),
        "eleves": eleves,
        "matieres": matieres,
        "top10": top10,
    }


@router.put("/{classe_id}/configurer")
def configurer_classe(classe_id: int, config: dict, db: Session = Depends(get_db), etablissement_id: int = Depends(require_etablissement)):
    """Configure une classe: prof principal + chefs de classe.

    L'enseignant et les élèves désignés sont vérifiés appartenir au même
    établissement — avant le Lot 7, un enseignant d'une autre école pouvait
    être nommé professeur principal.
    """
    cl = db.query(Classe).filter(
        Classe.classe_id == classe_id, Classe.etablissement_id == etablissement_id
    ).first()
    if not cl:
        raise HTTPException(404, "Classe non trouvée")

    # Prof principal
    if "professeur_principal_id" in config:
        prof_id = config["professeur_principal_id"]
        if prof_id:
            ens = db.query(Enseignant).filter(
                Enseignant.enseignant_id == prof_id, Enseignant.etablissement_id == etablissement_id
            ).first()
            if not ens:
                raise HTTPException(404, "Enseignant non trouvé")
            cl.professeur_principal = prof_id
        else:
            cl.professeur_principal = None
    
    # Chefs de classe (liste de 3 eleve_ids)
    if "chefs_de_classe" in config:
        chef_ids = config["chefs_de_classe"]
        if len(chef_ids) > 0 and len(chef_ids) != 3:
            raise HTTPException(400, "Vous devez désigner exactement 3 chefs de classe.")
        
        if len(chef_ids) == 3:
            # Validation: au moins 1 fille — élèves restreints à cet établissement
            chefs = db.query(Eleve).filter(
                Eleve.eleve_id.in_(chef_ids), Eleve.etablissement_id == etablissement_id
            ).all()
            if len(chefs) != len(set(chef_ids)):
                raise HTTPException(404, "Élève(s) désigné(s) introuvable(s) pour cet établissement")
            nb_filles = sum(1 for c in chefs if c.sexe == 'F')
            if nb_filles < 1:
                raise HTTPException(400, "Au moins une fille doit figurer parmi les 3 chefs de classe.")
            
            # Reset all existing chefs in class
            inscriptions = db.query(Inscription).filter(
                Inscription.classe_id == classe_id, Inscription.statut == "ACTIVE"
            ).all()
            for insc in inscriptions:
                if insc.role_classe and insc.role_classe.startswith("CHEF"):
                    insc.role_classe = None
            
            # Assign new chefs
            for i, eid in enumerate(chef_ids, 1):
                insc = db.query(Inscription).filter(
                    Inscription.classe_id == classe_id,
                    Inscription.eleve_id == eid,
                    Inscription.statut == "ACTIVE"
                ).first()
                if insc:
                    insc.role_classe = f"CHEF_{i}"
    
    db.commit()
    db.refresh(cl)
    return {"message": "Classe configurée avec succès"}



# ============================================================================
# INSCRIPTIONS
# ============================================================================
inscriptions_router = APIRouter(prefix="/api/inscriptions", tags=["Inscriptions"])


def _inscription_de_letablissement(db: Session, inscription_id: int, etablissement_id: int) -> Inscription:
    """Charge une inscription en vérifiant qu'elle appartient à l'établissement
    appelant. Inscription n'a pas de colonne etablissement_id (OWNERSHIP —
    voir .ai/MULTI_TENANT_PLAN.md section E) : on passe par sa classe.
    404 (pas 403) pour ne pas confirmer l'existence d'une inscription d'une
    autre école."""
    insc = (
        db.query(Inscription)
        .join(Classe, Classe.classe_id == Inscription.classe_id)
        .filter(Inscription.inscription_id == inscription_id, Classe.etablissement_id == etablissement_id)
        .first()
    )
    if not insc:
        raise HTTPException(status_code=404, detail="Inscription non trouvée")
    return insc


@inscriptions_router.post("", response_model=InscriptionOut, status_code=201)
def create_inscription(data: InscriptionCreate, db: Session = Depends(get_db), etablissement_id: int = Depends(require_etablissement)):
    # L'élève ET la classe doivent appartenir à l'établissement appelant —
    # avant le Lot 7, aucun des deux n'était vérifié : un élève d'une autre
    # école pouvait être inscrit dans une classe d'une troisième école.
    eleve_valide = db.query(Eleve.eleve_id).filter(
        Eleve.eleve_id == data.eleve_id, Eleve.etablissement_id == etablissement_id
    ).first()
    if not eleve_valide:
        raise HTTPException(status_code=404, detail="Élève non trouvé")

    classe = db.query(Classe).filter(
        Classe.classe_id == data.classe_id, Classe.etablissement_id == etablissement_id
    ).first()
    if not classe:
        raise HTTPException(status_code=404, detail="Classe non trouvée")

    # Vérifier doublon
    existing = db.query(Inscription).filter(
        Inscription.eleve_id == data.eleve_id,
        Inscription.annee_id == data.annee_id,
        Inscription.statut == "ACTIVE"
    ).first()
    if existing:
        raise HTTPException(status_code=409, detail="Cet élève est déjà inscrit pour cette année")

    insc = Inscription(**data.model_dump())
    db.add(insc)

    # Mettre à jour l'effectif de la classe
    classe.effectif_actuel = (classe.effectif_actuel or 0) + 1

    db.commit()
    db.refresh(insc)
    return insc


@inscriptions_router.get("/{inscription_id}", response_model=InscriptionOut)
def get_inscription(inscription_id: int, db: Session = Depends(get_db), etablissement_id: int = Depends(require_etablissement)):
    return _inscription_de_letablissement(db, inscription_id, etablissement_id)


@inscriptions_router.delete("/{inscription_id}")
def annuler_inscription(inscription_id: int, db: Session = Depends(get_db), etablissement_id: int = Depends(require_etablissement)):
    insc = _inscription_de_letablissement(db, inscription_id, etablissement_id)
    insc.statut = "ANNULEE"
    classe = db.query(Classe).filter(Classe.classe_id == insc.classe_id).first()
    if classe and classe.effectif_actuel and classe.effectif_actuel > 0:
        classe.effectif_actuel -= 1
    db.commit()
    return {"message": "Inscription annulée"}
