"""
SMARTSCHOOL API — Routes Paramétrage (Établissements, Années, Cycles, Niveaux, Matières, Salles)
"""
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Body
import os, shutil, uuid
from datetime import timedelta
from sqlalchemy.orm import Session
from typing import List, Optional
from pydantic import BaseModel, Field
from app.core.database import get_db
from app.core.auth import (
    ADMIN_TIER_ROLES, etablissement_optionnel, require_etablissement, require_roles,
)
from app.models.academique import (
    Etablissement, AnneeScolaire, Trimestre, Cycle, Niveau, Salle, Matiere,
    ParametreEtablissement
)
from app.schemas.schemas import (
    EtablissementCreate, EtablissementUpdate, EtablissementOut,
    AnneeScolaireCreate, AnneeScolaireUpdate, AnneeScolaireOut,
    TrimestreCreate, TrimestreUpdate, TrimestreOut,
    MatiereCreate, MatiereOut,
    ParametreCreate, ParametreUpdate, ParametreOut
)

router = APIRouter(prefix="/api/parametrage", tags=["Paramétrage"])

# Operations de niveau plateforme (creer une ecole, lister toutes les ecoles) :
# reservees au SUPER_ADMIN. Ce ne sont pas des operations "tenant" — elles ne
# peuvent par nature pas etre filtrees par etablissement.
_require_super_admin = require_roles("SUPER_ADMIN")

# Toute ECRITURE de configuration est reservee a l'equipe de direction.
# Les LECTURES restent ouvertes a tout compte authentifie de l'etablissement :
# elles alimentent des pages non-admin (en-tete de l'app, bulletins, notes,
# archive, reinscription comptable) et ne portent que des donnees de reference
# de sa propre ecole.
_require_admin = require_roles(*ADMIN_TIER_ROLES)


def _annee_ou_404(db: Session, annee_id: int, etablissement_id: int) -> AnneeScolaire:
    """AnneeScolaire porte une colonne etablissement_id directe (Lot 10)."""
    a = db.query(AnneeScolaire).filter(
        AnneeScolaire.annee_id == annee_id,
        AnneeScolaire.etablissement_id == etablissement_id,
    ).first()
    if not a:
        raise HTTPException(404, "Année non trouvée")
    return a


def _trimestre_ou_404(db: Session, trimestre_id: int, etablissement_id: int) -> Trimestre:
    """Trimestre est OWNERSHIP via son AnneeScolaire (Lot 10)."""
    t = (
        db.query(Trimestre)
        .join(AnneeScolaire, AnneeScolaire.annee_id == Trimestre.annee_id)
        .filter(
            Trimestre.trimestre_id == trimestre_id,
            AnneeScolaire.etablissement_id == etablissement_id,
        )
        .first()
    )
    if not t:
        raise HTTPException(404, "Trimestre non trouvé")
    return t


def _cycle_ou_404(db: Session, cycle_id: int, etablissement_id: int) -> Cycle:
    """Cycle porte une colonne etablissement_id directe (Lot 10)."""
    c = db.query(Cycle).filter(
        Cycle.cycle_id == cycle_id, Cycle.etablissement_id == etablissement_id
    ).first()
    if not c:
        raise HTTPException(404, "Cycle non trouvé")
    return c


def _matiere_ou_404(db: Session, matiere_id: int, etablissement_id: int) -> Matiere:
    """Matiere est OWNERSHIP via son Cycle (meme regle qu'au Lot 9-A).

    Ces routes /api/parametrage/matieres doublonnent celles de /api/matieres
    securisees au Lot 9-A : sans ce controle, elles constituaient une porte
    derobee permettant de lire et modifier les matieres de toute autre ecole.
    """
    m = (
        db.query(Matiere)
        .join(Cycle, Cycle.cycle_id == Matiere.cycle_id)
        .filter(Matiere.matiere_id == matiere_id, Cycle.etablissement_id == etablissement_id)
        .first()
    )
    if not m:
        raise HTTPException(404, "Matière non trouvée")
    return m

# Router PUBLIC (sans JWT) pour les GET nécessaires avant login
public_router = APIRouter(prefix="/api/parametrage", tags=["Paramétrage (Public)"])


# ============================================================================
# ÉTABLISSEMENTS
# ============================================================================
@router.get("/etablissements", response_model=List[EtablissementOut],
            dependencies=[Depends(_require_super_admin)])
def list_etablissements(db: Session = Depends(get_db)):
    """Annuaire de TOUTES les ecoles : operation plateforme, SUPER_ADMIN seul.

    Avant (Lot 10) : n'importe quel compte authentifie, y compris un eleve,
    pouvait enumerer tous les etablissements de la plateforme.
    """
    return db.query(Etablissement).order_by(Etablissement.nom).all()

# Route publique — accessible sans JWT (page login, portails)
@public_router.get("/etablissements/{id}", response_model=EtablissementOut)
def get_etablissement_public(id: int, db: Session = Depends(get_db)):
    e = db.query(Etablissement).filter(Etablissement.etablissement_id == id).first()
    if not e:
        raise HTTPException(404, "Établissement non trouvé")
    return e

@router.post("/etablissements", response_model=EtablissementOut, status_code=201,
             dependencies=[Depends(_require_super_admin)])
def create_etablissement(data: EtablissementCreate, db: Session = Depends(get_db)):
    """Creation d'une ecole : operation plateforme, SUPER_ADMIN seul (Lot 10)."""
    e = Etablissement(**data.model_dump())
    db.add(e)
    db.commit()
    db.refresh(e)
    return e

@router.put("/etablissements/{id}", response_model=EtablissementOut, dependencies=[Depends(_require_admin)])
def update_etablissement(
    id: int, data: EtablissementUpdate,
    db: Session = Depends(get_db),
    etablissement_id: int = Depends(require_etablissement),
):
    """Un compte ne peut modifier QUE son propre etablissement (Lot 10).

    Avant : `id` etait pris tel quel, donc n'importe quel compte authentifie
    pouvait reecrire le nom, le logo, l'adresse, le cachet ou la signature de
    n'importe quelle autre ecole.
    """
    if id != etablissement_id:
        raise HTTPException(404, "Établissement non trouvé")
    e = db.query(Etablissement).filter(Etablissement.etablissement_id == id).first()
    if not e:
        raise HTTPException(404, "Établissement non trouvé")
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(e, k, v)
    db.commit()
    db.refresh(e)
    return e


# ============================================================================
# UPLOAD FICHIERS ÉTABLISSEMENT
# ============================================================================
UPLOAD_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "uploads", "etablissements")
os.makedirs(UPLOAD_DIR, exist_ok=True)

@router.post("/etablissements/{id}/upload/{field}", dependencies=[Depends(_require_admin)])
async def upload_etablissement_file(
    id: int, field: str, fichier: UploadFile = File(...),
    db: Session = Depends(get_db),
    etablissement_id: int = Depends(require_etablissement),
):
    if field not in ["logo", "favicon", "cachet", "signature", "card_bg", "card_bg_eleve", "card_bg_prof"]:
        raise HTTPException(400, "Champ invalide")

    # Meme regle que update_etablissement : on ne televerse que pour SON ecole
    # (avant, on pouvait remplacer le cachet ou la signature de n'importe qui).
    if id != etablissement_id:
        raise HTTPException(404, "Établissement non trouvé")

    etablissement = db.query(Etablissement).filter(Etablissement.etablissement_id == id).first()
    if not etablissement:
        raise HTTPException(404, "Établissement non trouvé")

    ext = fichier.filename.split(".")[-1] if "." in fichier.filename else "png"
    filename = f"{id}_{field}_{uuid.uuid4().hex[:8]}.{ext}"
    filepath = os.path.join(UPLOAD_DIR, filename)

    with open(filepath, "wb") as buffer:
        shutil.copyfileobj(fichier.file, buffer)

    url_path = f"/uploads/etablissements/{filename}"
    
    if field in ["card_bg", "card_bg_eleve", "card_bg_prof"]:
        cle = "carte.bg_image_url"
        if field == "card_bg_eleve":
            cle = "carte.eleve.bg_image_url"
        elif field == "card_bg_prof":
            cle = "carte.prof.bg_image_url"

        setting = db.query(ParametreEtablissement).filter(
            ParametreEtablissement.etablissement_id == id,
            ParametreEtablissement.cle == cle
        ).first()
        if setting:
            setting.valeur = url_path
        else:
            setting = ParametreEtablissement(
                etablissement_id=id,
                categorie="CARTE",
                cle=cle,
                valeur=url_path,
                type_valeur="TEXT"
            )
            db.add(setting)
        db.commit()
    else:
        field_mapping = {
            "logo": "logo_url",
            "favicon": "favicon_url",
            "cachet": "cachet_url",
            "signature": "signature_url"
        }
        setattr(etablissement, field_mapping[field], url_path)
        db.commit()
        db.refresh(etablissement)

    return {"message": f"Fichier {field} uploadé avec succès", "url": url_path}


# ============================================================================
# ANNÉES SCOLAIRES
# ============================================================================

def _creer_trimestres_auto(db: Session, annee: AnneeScolaire) -> int:
    """
    Crée automatiquement les trimestres (3) ou semestres (2) d'une année
    scolaire tout juste créée, selon le découpage configuré dans Paramètres >
    Calendrier (ss_parametres, categorie='CALENDRIER', clé
    'calendrier.mode_decoupage' = 'TRIMESTRE' ou 'SEMESTRE', défaut TRIMESTRE
    si jamais configuré). Avant cette fonction, la création d'une année ne
    créait aucune période — il fallait toujours les saisir une par une à la
    main dans Paramètres > Calendrier.

    Découpage simple en parts égales entre date_debut et date_fin de l'année
    (les dates restent modifiables ensuite via PUT /trimestres/{id} si le
    découpage réel doit tenir compte des vacances).
    """
    if db.query(Trimestre).filter(Trimestre.annee_id == annee.annee_id).count() > 0:
        return 0  # des périodes existent déjà (ex: créées manuellement entre-temps)

    param = db.query(ParametreEtablissement).filter(
        ParametreEtablissement.etablissement_id == annee.etablissement_id,
        ParametreEtablissement.categorie == "CALENDRIER",
        ParametreEtablissement.cle == "calendrier.mode_decoupage",
    ).first()
    mode = (param.valeur if param else "TRIMESTRE") or "TRIMESTRE"

    nb_periodes = 2 if mode.upper() == "SEMESTRE" else 3
    prefixe = "Semestre" if nb_periodes == 2 else "Trimestre"
    code_prefixe = "S" if nb_periodes == 2 else "T"
    ordinaux = ["1er", "2ème", "3ème"]

    duree_totale = (annee.date_fin - annee.date_debut).days
    if duree_totale <= 0:
        return 0
    duree_periode = duree_totale // nb_periodes

    for i in range(nb_periodes):
        debut = annee.date_debut + timedelta(days=i * duree_periode)
        fin = (
            annee.date_fin if i == nb_periodes - 1
            else annee.date_debut + timedelta(days=(i + 1) * duree_periode - 1)
        )
        db.add(Trimestre(
            annee_id=annee.annee_id,
            code=f"{code_prefixe}{i + 1}",
            libelle=f"{ordinaux[i]} {prefixe}",
            numero=i + 1,
            date_debut=debut,
            date_fin=fin,
            statut="EN_COURS" if i == 0 else "PLANIFIE",
        ))
    return nb_periodes


@router.get("/annees", response_model=List[AnneeScolaireOut])
def list_annees(
    db: Session = Depends(get_db),
    etablissement_id: int = Depends(require_etablissement),
):
    return db.query(AnneeScolaire).filter(
        AnneeScolaire.etablissement_id == etablissement_id
    ).order_by(AnneeScolaire.date_debut.desc()).all()

@router.post("/annees", response_model=AnneeScolaireOut, status_code=201, dependencies=[Depends(_require_admin)])
def create_annee(
    data: AnneeScolaireCreate,
    db: Session = Depends(get_db),
    etablissement_id: int = Depends(require_etablissement),
):
    # etablissement_id impose par le compte authentifie : il venait du corps de
    # la requete, donc une ecole pouvait creer des annees scolaires chez une
    # autre (Lot 10).
    payload = data.model_dump()
    payload["etablissement_id"] = etablissement_id
    a = AnneeScolaire(**payload)
    db.add(a)
    db.flush()

    # Si la nouvelle année est créée comme "courante", désactiver les autres —
    # sans ça, deux années pouvaient rester marquées est_courante='O' en même
    # temps, et l'en-tête de l'école continuait d'afficher l'ancienne année
    # (celle trouvée en premier par l'ordre de tri côté frontend) au lieu de la
    # nouvelle qu'on venait de créer.
    if a.est_courante == "O":
        db.query(AnneeScolaire).filter(
            AnneeScolaire.etablissement_id == a.etablissement_id,
            AnneeScolaire.annee_id != a.annee_id
        ).update({"est_courante": "N"})

    # Auto-création des trimestres/semestres selon le découpage configuré
    # (Paramètres > Calendrier) — avant ça, il fallait toujours les saisir un
    # par un à la main après chaque création d'année.
    _creer_trimestres_auto(db, a)

    db.commit()
    db.refresh(a)
    return a

@router.put("/annees/{id}", response_model=AnneeScolaireOut, dependencies=[Depends(_require_admin)])
def update_annee(
    id: int, data: AnneeScolaireUpdate,
    db: Session = Depends(get_db),
    etablissement_id: int = Depends(require_etablissement),
):
    annee = _annee_ou_404(db, id, etablissement_id)

    payload = data.model_dump(exclude_unset=True)
    payload.pop("etablissement_id", None)
    if "date_debut" in payload and "date_fin" in payload and payload["date_debut"] > payload["date_fin"]:
        raise HTTPException(400, "La date de début doit être antérieure à la date de fin")

    future_date_debut = payload.get("date_debut", annee.date_debut)
    future_date_fin = payload.get("date_fin", annee.date_fin)
    if future_date_debut > future_date_fin:
        raise HTTPException(400, "La date de début doit être antérieure à la date de fin")

    for k, v in payload.items():
        setattr(annee, k, v)

    if annee.est_courante == "O":
        db.query(AnneeScolaire).filter(
            AnneeScolaire.etablissement_id == annee.etablissement_id,
            AnneeScolaire.annee_id != id
        ).update({"est_courante": "N"})
        if annee.statut == "PLANIFIEE":
            annee.statut = "EN_COURS"

    db.commit()
    db.refresh(annee)
    return annee

@router.put("/annees/{id}/activer", dependencies=[Depends(_require_admin)])
def activer_annee(
    id: int,
    db: Session = Depends(get_db),
    etablissement_id: int = Depends(require_etablissement),
):
    """Permet d'activer une année (et désactiver les autres)"""
    annee = _annee_ou_404(db, id, etablissement_id)
    # Désactiver toutes les autres
    db.query(AnneeScolaire).filter(
        AnneeScolaire.etablissement_id == annee.etablissement_id,
        AnneeScolaire.annee_id != id
    ).update({"est_courante": "N"})
    annee.est_courante = "O"
    annee.statut = "EN_COURS"
    db.commit()
    return {"message": f"Année {annee.code} activée"}


# ============================================================================
# TRIMESTRES
# ============================================================================
@router.get("/trimestres", response_model=List[TrimestreOut])
def list_trimestres(
    annee_id: int,
    db: Session = Depends(get_db),
    etablissement_id: int = Depends(require_etablissement),
):
    # L'annee demandee doit etre celle de l'appelant : sans ce controle, il
    # suffisait d'incrementer annee_id pour lire le calendrier d'une autre
    # ecole (et la valeur par defaut 1 visait l'ecole 1). Lot 10.
    _annee_ou_404(db, annee_id, etablissement_id)
    return db.query(Trimestre).filter(
        Trimestre.annee_id == annee_id
    ).order_by(Trimestre.numero).all()

@router.post("/trimestres", response_model=TrimestreOut, status_code=201, dependencies=[Depends(_require_admin)])
def create_trimestre(
    data: TrimestreCreate,
    db: Session = Depends(get_db),
    etablissement_id: int = Depends(require_etablissement),
):
    _annee_ou_404(db, data.annee_id, etablissement_id)
    if data.date_debut > data.date_fin:
        raise HTTPException(400, "La date de début doit être antérieure à la date de fin")

    trimestre = Trimestre(**data.model_dump())
    db.add(trimestre)
    db.commit()
    db.refresh(trimestre)
    return trimestre

@router.put("/trimestres/{id}", response_model=TrimestreOut, dependencies=[Depends(_require_admin)])
def update_trimestre(
    id: int, data: TrimestreUpdate,
    db: Session = Depends(get_db),
    etablissement_id: int = Depends(require_etablissement),
):
    trimestre = _trimestre_ou_404(db, id, etablissement_id)

    payload = data.model_dump(exclude_unset=True)
    future_date_debut = payload.get("date_debut", trimestre.date_debut)
    future_date_fin = payload.get("date_fin", trimestre.date_fin)
    if future_date_debut > future_date_fin:
        raise HTTPException(400, "La date de début doit être antérieure à la date de fin")

    for k, v in payload.items():
        setattr(trimestre, k, v)

    db.commit()
    db.refresh(trimestre)
    return trimestre

@router.delete("/trimestres/{id}", dependencies=[Depends(_require_admin)])
def delete_trimestre(
    id: int,
    db: Session = Depends(get_db),
    etablissement_id: int = Depends(require_etablissement),
):
    trimestre = _trimestre_ou_404(db, id, etablissement_id)
    db.delete(trimestre)
    db.commit()
    return {"message": "Période supprimée avec succès"}


@router.put("/trimestres/{id}/cloturer", dependencies=[Depends(_require_admin)])
def cloturer_trimestre(
    id: int,
    db: Session = Depends(get_db),
    etablissement_id: int = Depends(require_etablissement),
):
    """
    Clôture un trimestre/semestre : verrouille la saisie de nouvelles
    évaluations/notes pour cette période (voir la garde dans
    backend/app/api/evaluations.py et portail_enseignant.py) et fait
    automatiquement passer la période suivante de PLANIFIE à EN_COURS.
    Avant cet endpoint, il n'existait aucun mécanisme de clôture pour les
    trimestres — seul l'exercice comptable pouvait être clôturé.
    """
    trimestre = _trimestre_ou_404(db, id, etablissement_id)
    if trimestre.statut == "CLOTURE":
        raise HTTPException(400, "Cette période est déjà clôturée")

    trimestre.statut = "CLOTURE"

    suivant = (
        db.query(Trimestre)
        .filter(Trimestre.annee_id == trimestre.annee_id, Trimestre.numero == trimestre.numero + 1)
        .first()
    )
    if suivant and suivant.statut == "PLANIFIE":
        suivant.statut = "EN_COURS"

    db.commit()
    return {
        "message": f"{trimestre.libelle} clôturé avec succès",
        "periode_suivante": suivant.libelle if suivant else None,
    }


# ============================================================================
# CYCLES & NIVEAUX
# ============================================================================
@router.get("/cycles")
def list_cycles(
    db: Session = Depends(get_db),
    etablissement_id: int = Depends(require_etablissement),
):
    cycles = db.query(Cycle).filter(
        Cycle.etablissement_id == etablissement_id
    ).order_by(Cycle.ordre).all()

    result = []
    for c in cycles:
        niveaux = db.query(Niveau).filter(
            Niveau.cycle_id == c.cycle_id
        ).order_by(Niveau.ordre).all()

        result.append({
            "cycle_id": c.cycle_id,
            "code": c.code,
            "libelle": c.libelle,
            "ordre": c.ordre,
            "niveaux": [
                {
                    "niveau_id": n.niveau_id,
                    "code": n.code,
                    "libelle": n.libelle,
                    "ordre": n.ordre,
                    "est_examen": n.est_examen
                } for n in niveaux
            ]
        })
    return result


# ============================================================================
# MATIÈRES
# ============================================================================
@router.get("/matieres", response_model=List[MatiereOut])
def list_matieres(
    cycle_id: Optional[int] = None,
    db: Session = Depends(get_db),
    etablissement_id: int = Depends(require_etablissement),
):
    # Matiere est OWNERSHIP via Cycle : sans cette jointure, cette route
    # listait les matieres de TOUTES les ecoles (elle doublonne /api/matieres,
    # securisee au Lot 9-A, et constituait donc une porte derobee). Lot 10.
    query = db.query(Matiere).join(Cycle, Cycle.cycle_id == Matiere.cycle_id).filter(
        Cycle.etablissement_id == etablissement_id
    )
    if cycle_id:
        query = query.filter(Matiere.cycle_id == cycle_id)
    return query.order_by(Matiere.libelle).all()

@router.post("/matieres", response_model=MatiereOut, status_code=201, dependencies=[Depends(_require_admin)])
def create_matiere(
    data: MatiereCreate,
    db: Session = Depends(get_db),
    etablissement_id: int = Depends(require_etablissement),
):
    # Le cycle cible doit appartenir a l'appelant, sinon la matiere serait
    # creee dans une autre ecole (Lot 10).
    _cycle_ou_404(db, data.cycle_id, etablissement_id)
    m = Matiere(**data.model_dump())
    db.add(m)
    db.commit()
    db.refresh(m)
    return m

@router.put("/matieres/{matiere_id}", dependencies=[Depends(_require_admin)])
def update_matiere(
    matiere_id: int, data: dict,
    db: Session = Depends(get_db),
    etablissement_id: int = Depends(require_etablissement),
):
    """Met à jour le coefficient et/ou note_sur d'une matière."""
    m = _matiere_ou_404(db, matiere_id, etablissement_id)
    if "coefficient_defaut" in data:
        m.coefficient_defaut = float(data["coefficient_defaut"])
    if "note_sur" in data:
        m.note_sur = float(data["note_sur"])
    db.commit()
    db.refresh(m)
    return {"message": "Matière mise à jour", "matiere_id": matiere_id}

class MatiereBatchUpdateItem(BaseModel):
    matiere_id: int
    coefficient_defaut: Optional[float] = Field(None, gt=0, le=10)
    note_sur: Optional[float] = Field(None, gt=0, le=100)

@router.put("/matieres-batch", dependencies=[Depends(_require_admin)])
def update_matieres_batch(
    updates: List[MatiereBatchUpdateItem] = Body(...),
    db: Session = Depends(get_db),
    etablissement_id: int = Depends(require_etablissement),
):
    """Mise à jour en lot des coefficients et barèmes des matières."""
    count = 0
    for item in updates:
        # CHAQUE matiere du lot est verifiee : une matiere d'une autre ecole
        # glissee dans la liste etait modifiee sans controle (Lot 10).
        m = _matiere_ou_404(db, item.matiere_id, etablissement_id)
        if item.coefficient_defaut is not None:
            m.coefficient_defaut = float(item.coefficient_defaut)
        if item.note_sur is not None:
            m.note_sur = float(item.note_sur)
        count += 1
    db.commit()
    return {"message": f"{count} matières mises à jour avec succès"}

@router.post("/matieres/auto-generation", status_code=201, dependencies=[Depends(_require_admin)])
def auto_generate_matieres_guinee(
    db: Session = Depends(get_db),
    etablissement_id: int = Depends(require_etablissement),
):
    """Génère automatiquement les matières du programme Guinéen par cycle (Primaire, Collège, Lycée)

    Lot 10 — deux contaminations inter-écoles corrigées ici :
      * les cycles manquants étaient créés avec `etablissement_id=1` en dur ;
      * les cycles existants étaient recherchés par leur seul `code`, sans
        filtre d'établissement, si bien qu'une école déclenchant la génération
        rattachait ses matières aux cycles d'une AUTRE école (le premier
        « PRM »/« CLG »/« LYC » trouvé sur la plateforme).
    """
    
    # S'assurer que les cycles de base existent
    cycles_base = [
        {"code": "PRM", "libelle": "Primaire", "ordre": 1},
        {"code": "CLG", "libelle": "Collège", "ordre": 2},
        {"code": "LYC", "libelle": "Lycée", "ordre": 3}
    ]
    
    cycle_map = {}
    for cb in cycles_base:
        c = db.query(Cycle).filter(
            Cycle.code == cb["code"], Cycle.etablissement_id == etablissement_id
        ).first()
        if not c:
            c = Cycle(etablissement_id=etablissement_id, code=cb["code"],
                      libelle=cb["libelle"], ordre=cb["ordre"])
            db.add(c)
            db.commit()
            db.refresh(c)
        cycle_map[cb["code"]] = c.cycle_id

    # Définition du programme
    matieres_guinee = [
        # =============================================================
        # PRIMAIRE
        # =============================================================
        {"cycle": "PRM", "code": "FRA-P", "libelle": "Français / Langage", "categorie": "Langues", "coef": 5},
        {"cycle": "PRM", "code": "MAT-P", "libelle": "Mathématiques", "categorie": "Sciences", "coef": 4},
        {"cycle": "PRM", "code": "SCT-P", "libelle": "Sciences et Technologie", "categorie": "Sciences", "coef": 2},
        {"cycle": "PRM", "code": "HG-P", "libelle": "Histoire-Géographie", "categorie": "Sciences Sociales", "coef": 2},
        {"cycle": "PRM", "code": "ECM-P", "libelle": "Éducation Civique et Morale", "categorie": "Sciences Sociales", "coef": 1},
        {"cycle": "PRM", "code": "EPS-P", "libelle": "Éducation Physique et Sportive", "categorie": "Pratique", "coef": 1},
        {"cycle": "PRM", "code": "ART-P", "libelle": "Arts (Plastiques, Musique)", "categorie": "Pratique", "coef": 1},
        {"cycle": "PRM", "code": "ANG-P", "libelle": "Anglais (Initiation)", "categorie": "Langues", "coef": 1},

        # =============================================================
        # COLLÈGE (Tronc Commun + LV2)
        # =============================================================
        {"cycle": "CLG", "code": "FRA-C", "libelle": "Français", "categorie": "Langues", "coef": 4},
        {"cycle": "CLG", "code": "MAT-C", "libelle": "Mathématiques", "categorie": "Sciences", "coef": 4},
        {"cycle": "CLG", "code": "HG-C", "libelle": "Histoire-Géographie", "categorie": "Sciences Sociales", "coef": 2},
        {"cycle": "CLG", "code": "PC-C", "libelle": "Physique-Chimie", "categorie": "Sciences", "coef": 3},
        {"cycle": "CLG", "code": "SVT-C", "libelle": "Sciences de la Vie et de la Terre (SVT)", "categorie": "Sciences", "coef": 3},
        {"cycle": "CLG", "code": "ANG-C", "libelle": "Anglais (LV1)", "categorie": "Langues", "coef": 3},
        {"cycle": "CLG", "code": "ECJS-C", "libelle": "Éducation Civique, Juridique et Sociale", "categorie": "Sciences Sociales", "coef": 1},
        {"cycle": "CLG", "code": "EPS-C", "libelle": "Éducation Physique et Sportive", "categorie": "Pratique", "coef": 2},
        {"cycle": "CLG", "code": "TIC-C", "libelle": "Technologie et Informatique (TIC)", "categorie": "Pratique", "coef": 1},
        {"cycle": "CLG", "code": "ART-C", "libelle": "Arts (Plastiques, Musique)", "categorie": "Pratique", "coef": 1},
        {"cycle": "CLG", "code": "ESP-C", "libelle": "Espagnol / Autre (LV2)", "categorie": "Langues", "coef": 2},

        # =============================================================
        # LYCÉE (Profils SM, SE, SS fusionnés pour la configuration)
        # =============================================================
        {"cycle": "LYC", "code": "FRA-L", "libelle": "Français", "categorie": "Langues", "coef": 3},
        {"cycle": "LYC", "code": "MAT-L", "libelle": "Mathématiques (Tronc commun)", "categorie": "Sciences", "coef": 3},
        {"cycle": "LYC", "code": "MATS-L", "libelle": "Mathématiques Spéciales (Profil SM)", "categorie": "Sciences", "coef": 5},
        {"cycle": "LYC", "code": "PC-L", "libelle": "Physique-Chimie", "categorie": "Sciences", "coef": 4},
        {"cycle": "LYC", "code": "PCA-L", "libelle": "Physique-Chimie (Approfondie SM)", "categorie": "Sciences", "coef": 5},
        {"cycle": "LYC", "code": "SVT-L", "libelle": "SVT (Tronc commun)", "categorie": "Sciences", "coef": 3},
        {"cycle": "LYC", "code": "SVTS-L", "libelle": "SVT (Spécialité SE)", "categorie": "Sciences", "coef": 5},
        {"cycle": "LYC", "code": "PHI-L", "libelle": "Philosophie", "categorie": "Sciences Sociales", "coef": 4},
        {"cycle": "LYC", "code": "HG-L", "libelle": "Histoire-Géographie", "categorie": "Sciences Sociales", "coef": 3},
        {"cycle": "LYC", "code": "ANG-L", "libelle": "Anglais (LV1)", "categorie": "Langues", "coef": 2},
        {"cycle": "LYC", "code": "SES-L", "libelle": "Sciences Économiques et Sociales (SES)", "categorie": "Sciences Sociales", "coef": 5},
        {"cycle": "LYC", "code": "ECM-L", "libelle": "Éducation Civique", "categorie": "Sciences Sociales", "coef": 1},
        {"cycle": "LYC", "code": "EPS-L", "libelle": "Éducation Physique et Sportive", "categorie": "Pratique", "coef": 2},
        {"cycle": "LYC", "code": "TIC-L", "libelle": "Informatique (Option)", "categorie": "Pratique", "coef": 1},
    ]

    added_count = 0

    for mat in matieres_guinee:
        c_id = cycle_map.get(mat["cycle"])
        if not c_id: continue

        # Check if already exists
        exists = db.query(Matiere).filter(Matiere.code == mat["code"], Matiere.cycle_id == c_id).first()
        if not exists:
            m = Matiere(
                cycle_id=c_id,
                code=mat["code"],
                libelle=mat["libelle"],
                categorie=mat["categorie"],
                coefficient_defaut=mat["coef"],
                est_obligatoire="O" if "Option" not in mat["libelle"] else "N",
                note_sur=20,
                nb_heures_semaine=2
            )
            db.add(m)
            added_count += 1
            
    db.commit()
    return {"message": f"{added_count} matières du programme Guinéen ont été déployées avec succès sous 3 cycles (Primaire, Collège, Lycée)."}


# ============================================================================
# SALLES
# ============================================================================
@router.get("/salles")
def list_salles(
    db: Session = Depends(get_db),
    etablissement_id: int = Depends(require_etablissement),
):
    return db.query(Salle).filter(
        Salle.etablissement_id == etablissement_id
    ).order_by(Salle.code).all()


# ============================================================================
# PARAMÈTRES (SETTINGS)
# ============================================================================
# Categories affichables sans authentification : strictement ce dont la page
# de login et les portails ont besoin AVANT de se connecter (marque, couleurs,
# fonds de carte). Tout le reste — NOTATION, FINANCE, DOCUMENTS, CALENDRIER —
# exige un compte, et n'est alors servi que pour SON etablissement.
CATEGORIES_PUBLIQUES = {"THEME", "IDENTITE", "CARTE"}


# Route publique — accessible sans JWT (page login, portails)
@public_router.get("/settings", response_model=List[ParametreOut])
def list_parametres_public(
    etablissement_id: Optional[int] = None,
    categorie: Optional[str] = None,
    db: Session = Depends(get_db),
    etablissement_du_compte: Optional[int] = Depends(etablissement_optionnel),
):
    """Paramètres d'affichage.

    Lot 10 — avant, cette route rendait SANS AUCUNE AUTHENTIFICATION la
    totalité des paramètres de n'importe quelle école (`?etablissement_id=N`),
    y compris NOTATION et FINANCE.

    Désormais :
      * appelant authentifié -> tous les paramètres, mais uniquement ceux de
        SON établissement (le paramètre de requête est ignoré) ;
      * appelant anonyme -> uniquement les catégories d'affichage, pour
        l'établissement demandé (nécessaire avant le login).
    """
    if etablissement_du_compte is not None:
        query = db.query(ParametreEtablissement).filter(
            ParametreEtablissement.etablissement_id == etablissement_du_compte
        )
        if categorie:
            query = query.filter(ParametreEtablissement.categorie == categorie)
        return query.all()

    if categorie and categorie.upper() not in CATEGORIES_PUBLIQUES:
        raise HTTPException(401, "Authentification requise pour cette catégorie de paramètres")

    # Un appelant anonyme doit désigner explicitement l'établissement dont il
    # veut la marque : retomber sur l'établissement 1 est interdit (il servirait
    # les couleurs et le logo d'une école arbitraire à toutes les autres).
    if etablissement_id is None:
        raise HTTPException(400, "etablissement_id est requis pour un appel non authentifié")

    query = db.query(ParametreEtablissement).filter(
        ParametreEtablissement.etablissement_id == etablissement_id,
        ParametreEtablissement.categorie.in_(CATEGORIES_PUBLIQUES),
    )
    if categorie:
        query = query.filter(ParametreEtablissement.categorie == categorie.upper())
    return query.all()


@router.put("/settings", dependencies=[Depends(_require_admin)])
def update_parametres(
    settings: List[ParametreCreate],
    db: Session = Depends(get_db),
    etablissement_id: int = Depends(require_etablissement),
):
    """Lot 10 : `etablissement_id` était un paramètre de requête fourni par le
    client — n'importe quel compte authentifié pouvait donc réécrire les
    paramètres (notation, finance, identité) de n'importe quelle école."""
    # Upsert logic
    for s in settings:
        param = db.query(ParametreEtablissement).filter(
            ParametreEtablissement.etablissement_id == etablissement_id,
            ParametreEtablissement.cle == s.cle
        ).first()
        if param:
            param.valeur = s.valeur
            if s.type_valeur:
                param.type_valeur = s.type_valeur
        else:
            payload = s.model_dump()
            payload["etablissement_id"] = etablissement_id
            new_param = ParametreEtablissement(**payload)
            db.add(new_param)
    db.commit()
    return {"message": "Paramètres mis à jour avec succès"}
