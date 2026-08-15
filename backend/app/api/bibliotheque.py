"""
SMARTSCHOOL API — Bibliothèque scolaire
Catalogue, exemplaires, prêts et statistiques partagés par tous les portails.
"""
from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.auth import get_current_user, require_etablissement
from app.models.academique import Ouvrage, Exemplaire, Emprunt, Eleve, Enseignant
from app.schemas.schemas import (
    OuvrageCreate,
    OuvrageUpdate,
    OuvrageOut,
    ExemplaireCreate,
    ExemplaireOut,
    EmpruntCreate,
    EmpruntOut,
)

router = APIRouter(prefix="/api/bibliotheque", tags=["Bibliothèque"])

BIBLIOTHEQUE_WRITE_ROLES = {
    "SUPER_ADMIN", "FONDATEUR", "DG", "DIRECTEUR_NIVEAU", "ADMIN", "BIBLIOTHECAIRE"
}
BIBLIOTHEQUE_READ_ROLES = BIBLIOTHEQUE_WRITE_ROLES | {
    "ENSEIGNANT", "PARENT", "ELEVE", "SURVEILLANT", "OPERATEUR", "INFORMATICIEN"
}


def _require_read(current_user: dict):
    role = current_user.get("role", "")
    if role not in BIBLIOTHEQUE_READ_ROLES:
        raise HTTPException(status_code=403, detail="Accès bibliothèque interdit")


def _require_write(current_user: dict):
    role = current_user.get("role", "")
    if role not in BIBLIOTHEQUE_WRITE_ROLES:
        raise HTTPException(status_code=403, detail="Modification bibliothèque interdite")


def _ouvrage_to_dict(o: Ouvrage) -> dict:
    return {
        "ouvrage_id": o.ouvrage_id,
        "etablissement_id": o.etablissement_id,
        "isbn": o.isbn,
        "code_interne": o.code_interne,
        "titre": o.titre,
        "auteur": o.auteur,
        "editeur": o.editeur,
        "annee_publication": o.annee_publication,
        "categorie": o.categorie,
        "sous_categorie": o.sous_categorie,
        "langue": o.langue,
        "niveau_cible": o.niveau_cible,
        "matiere_associee": o.matiere_associee,
        "nb_exemplaires": o.nb_exemplaires or 0,
        "nb_disponibles": o.nb_disponibles or 0,
        "resume": o.resume,
        "couverture_url": o.couverture_url,
        "emplacement": o.emplacement,
        "statut": o.statut,
        "created_date": o.created_date,
    }


def _ouvrage_ou_404(db: Session, ouvrage_id: int, etablissement_id: int) -> Ouvrage:
    """Ouvrage porte une colonne etablissement_id directe (Lot 11)."""
    o = db.query(Ouvrage).filter(
        Ouvrage.ouvrage_id == ouvrage_id, Ouvrage.etablissement_id == etablissement_id
    ).first()
    if not o:
        raise HTTPException(status_code=404, detail="Ouvrage introuvable")
    return o


def _exemplaire_ou_404(db: Session, exemplaire_id: int, etablissement_id: int) -> Exemplaire:
    """Exemplaire est OWNERSHIP via son Ouvrage (Lot 11)."""
    ex = (
        db.query(Exemplaire)
        .join(Ouvrage, Ouvrage.ouvrage_id == Exemplaire.ouvrage_id)
        .filter(
            Exemplaire.exemplaire_id == exemplaire_id,
            Ouvrage.etablissement_id == etablissement_id,
        )
        .first()
    )
    if not ex:
        raise HTTPException(status_code=404, detail="Exemplaire introuvable")
    return ex


@router.get("/ouvrages", response_model=list[OuvrageOut])
def list_ouvrages(
    etablissement_id: int = Depends(require_etablissement),
    q: Optional[str] = None,
    categorie: Optional[str] = None,
    statut: Optional[str] = None,
    limit: int = Query(100, le=500),
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    _require_read(current_user)
    query = db.query(Ouvrage).filter(Ouvrage.etablissement_id == etablissement_id)
    if q:
        pattern = f"%{q}%"
        query = query.filter(or_(Ouvrage.titre.ilike(pattern), Ouvrage.auteur.ilike(pattern), Ouvrage.code_interne.ilike(pattern)))
    if categorie:
        query = query.filter(Ouvrage.categorie == categorie)
    if statut:
        query = query.filter(Ouvrage.statut == statut)
    return [_ouvrage_to_dict(o) for o in query.order_by(Ouvrage.created_date.desc()).limit(limit).all()]


@router.get("/stats")
def stats_bibliotheque(
    etablissement_id: int = Depends(require_etablissement),
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    _require_read(current_user)
    base = db.query(Ouvrage).filter(Ouvrage.etablissement_id == etablissement_id)
    total_ouvrages = base.count()
    total_exemplaires = db.query(func.coalesce(func.sum(Ouvrage.nb_exemplaires), 0)).filter(Ouvrage.etablissement_id == etablissement_id).scalar() or 0
    total_disponibles = db.query(func.coalesce(func.sum(Ouvrage.nb_disponibles), 0)).filter(Ouvrage.etablissement_id == etablissement_id).scalar() or 0
    emprunts_en_cours = db.query(Emprunt).join(Exemplaire).join(Ouvrage).filter(Ouvrage.etablissement_id == etablissement_id, Emprunt.statut.in_(["EN_COURS", "EN_RETARD"])).count()
    # UN RETARD SE LIT SUR LE CALENDRIER, PAS SUR UN STATUT
    # Ce compteur cherchait `statut == 'EN_RETARD'`. Or aucune ligne du
    # logiciel n'écrit jamais cette valeur : un prêt reste « EN_COURS »
    # jusqu'à son retour. Le tableau du bibliothécaire annonçait donc
    # « 0 retard » en permanence — y compris avec 27 livres sortis depuis
    # plus de deux mois. La date de retour prévue, elle, ne dépend d'aucun
    # traitement nocturne : elle est déjà là.
    retards = db.query(Emprunt).join(Exemplaire).join(Ouvrage).filter(
        Ouvrage.etablissement_id == etablissement_id,
        Emprunt.date_retour_effective.is_(None),
        Emprunt.statut.in_(["EN_COURS", "EN_RETARD"]),
        Emprunt.date_retour_prevue < date.today(),
    ).count()
    categories = db.query(Ouvrage.categorie, func.count(Ouvrage.ouvrage_id)).filter(Ouvrage.etablissement_id == etablissement_id).group_by(Ouvrage.categorie).all()
    return {
        "total_ouvrages": total_ouvrages,
        "total_exemplaires": int(total_exemplaires),
        "total_disponibles": int(total_disponibles),
        "emprunts_en_cours": emprunts_en_cours,
        "retards": retards,
        "categories": [{"categorie": c or "AUTRE", "total": n} for c, n in categories],
    }


@router.post("/ouvrages", response_model=OuvrageOut, status_code=201)
def create_ouvrage(
    data: OuvrageCreate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
    etablissement_id: int = Depends(require_etablissement),
):
    _require_write(current_user)
    existing = db.query(Ouvrage).filter(
        Ouvrage.etablissement_id == etablissement_id,
        Ouvrage.code_interne == data.code_interne,
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="Ce code interne existe déjà pour cet établissement")

    nb_initial = max(0, data.nb_exemplaires_initial or 0)
    # etablissement_id imposé par le compte authentifié : il venait du corps de
    # la requête (`OuvrageBase`, qui valait 1 par défaut), donc un ouvrage
    # pouvait être créé dans le catalogue d'une autre école (Lot 11).
    payload = data.model_dump(exclude={"nb_exemplaires_initial"})
    payload["etablissement_id"] = etablissement_id
    ouvrage = Ouvrage(
        **payload,
        nb_exemplaires=nb_initial,
        nb_disponibles=nb_initial,
        created_by=current_user.get("nom", current_user.get("sub", "SYSTEM")),
    )
    db.add(ouvrage)
    db.flush()

    for index in range(nb_initial):
        code = f"{data.code_interne}-{index + 1:03d}"
        db.add(Exemplaire(
            ouvrage_id=ouvrage.ouvrage_id,
            code_exemplaire=code,
            etat="BON",
            statut="DISPONIBLE",
            date_acquisition=date.today(),
            created_by=current_user.get("nom", current_user.get("sub", "SYSTEM")),
        ))

    db.commit()
    db.refresh(ouvrage)
    return _ouvrage_to_dict(ouvrage)


@router.put("/ouvrages/{ouvrage_id}", response_model=OuvrageOut)
def update_ouvrage(
    ouvrage_id: int,
    data: OuvrageUpdate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
    etablissement_id: int = Depends(require_etablissement),
):
    _require_write(current_user)
    ouvrage = _ouvrage_ou_404(db, ouvrage_id, etablissement_id)
    modifications = data.model_dump(exclude_unset=True)
    modifications.pop("etablissement_id", None)
    for key, value in modifications.items():
        setattr(ouvrage, key, value)
    ouvrage.modified_by = current_user.get("nom", current_user.get("sub", "SYSTEM"))
    db.commit()
    db.refresh(ouvrage)
    return _ouvrage_to_dict(ouvrage)


@router.post("/exemplaires", response_model=ExemplaireOut, status_code=201)
def create_exemplaire(
    data: ExemplaireCreate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
    etablissement_id: int = Depends(require_etablissement),
):
    _require_write(current_user)
    ouvrage = _ouvrage_ou_404(db, data.ouvrage_id, etablissement_id)
    code = data.code_exemplaire or f"{ouvrage.code_interne}-{(ouvrage.nb_exemplaires or 0) + 1:03d}"
    if db.query(Exemplaire).filter(Exemplaire.code_exemplaire == code).first():
        raise HTTPException(status_code=400, detail="Ce code exemplaire existe déjà")
    ex = Exemplaire(**data.model_dump(exclude={"code_exemplaire"}), code_exemplaire=code, created_by=current_user.get("nom", current_user.get("sub", "SYSTEM")))
    db.add(ex)
    current_total = int(getattr(ouvrage, "nb_exemplaires", 0) or 0)
    current_available = int(getattr(ouvrage, "nb_disponibles", 0) or 0)
    setattr(ouvrage, "nb_exemplaires", current_total + 1)
    if data.statut == "DISPONIBLE":
        setattr(ouvrage, "nb_disponibles", current_available + 1)
    db.commit()
    db.refresh(ex)
    return ex


@router.get("/emprunts")
def list_emprunts(
    statut: Optional[str] = Query(None, description="EN_COURS, EN_RETARD ou RENDU"),
    q: Optional[str] = Query(None, description="Titre, code d'exemplaire ou emprunteur"),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, le=200),
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
    etablissement_id: int = Depends(require_etablissement),
):
    """Qui a quoi, et depuis quand.

    Cette route n'existait pas. On pouvait enregistrer un prêt, jamais le
    retrouver : le tableau du bibliothécaire affichait « 27 prêts en cours »
    sans aucun moyen de savoir de quels livres il s'agissait ni chez qui ils
    étaient. Un compteur sans liste derrière ne permet de récupérer aucun
    ouvrage.
    """
    _require_read(current_user)

    base = (
        db.query(Emprunt, Exemplaire, Ouvrage)
        .join(Exemplaire, Exemplaire.exemplaire_id == Emprunt.exemplaire_id)
        .join(Ouvrage, Ouvrage.ouvrage_id == Exemplaire.ouvrage_id)
        .filter(Ouvrage.etablissement_id == etablissement_id)
    )

    aujourdhui = date.today()
    if statut == "RENDU":
        base = base.filter(Emprunt.date_retour_effective.isnot(None))
    elif statut == "EN_RETARD":
        base = base.filter(
            Emprunt.date_retour_effective.is_(None),
            Emprunt.date_retour_prevue < aujourdhui,
        )
    elif statut == "EN_COURS":
        base = base.filter(Emprunt.date_retour_effective.is_(None))

    if q:
        motif = f"%{q.strip()}%"
        base = base.filter(or_(
            Ouvrage.titre.ilike(motif),
            Ouvrage.auteur.ilike(motif),
            Exemplaire.code_exemplaire.ilike(motif),
        ))

    total = base.count()
    lignes = (base.order_by(Emprunt.date_retour_prevue.asc())
                  .offset(skip).limit(limit).all())

    # Les noms des emprunteurs en DEUX requêtes, pas une par ligne : cette
    # liste est celle qu'on ouvre en fin d'année avec des centaines de prêts.
    eleve_ids = {e.eleve_id for e, _, _ in lignes if e.eleve_id}
    ens_ids = {e.enseignant_id for e, _, _ in lignes if e.enseignant_id}
    eleves = {
        r.eleve_id: (f"{r.prenom} {r.nom}", r.matricule)
        for r in db.query(Eleve.eleve_id, Eleve.prenom, Eleve.nom, Eleve.matricule)
        .filter(Eleve.eleve_id.in_(eleve_ids)).all()
    } if eleve_ids else {}
    enseignants = {
        r.enseignant_id: f"{r.prenom} {r.nom}"
        for r in db.query(Enseignant.enseignant_id, Enseignant.prenom, Enseignant.nom)
        .filter(Enseignant.enseignant_id.in_(ens_ids)).all()
    } if ens_ids else {}

    items = []
    for emprunt, exemplaire, ouvrage in lignes:
        rendu = emprunt.date_retour_effective is not None
        # Le retard se recalcule à l'affichage tant que le livre est dehors :
        # il grandit chaque jour, il ne peut pas être figé à l'écriture.
        if rendu:
            retard = int(emprunt.nb_jours_retard or 0)
        else:
            retard = max(0, (aujourdhui - emprunt.date_retour_prevue).days)
        nom, matricule = (eleves.get(emprunt.eleve_id, (None, None))
                          if emprunt.eleve_id else (enseignants.get(emprunt.enseignant_id), None))
        items.append({
            "emprunt_id": emprunt.emprunt_id,
            "titre": ouvrage.titre,
            "auteur": ouvrage.auteur,
            "code_exemplaire": exemplaire.code_exemplaire,
            "emprunteur": nom or "Emprunteur supprimé",
            "type_emprunteur": "ELEVE" if emprunt.eleve_id else "ENSEIGNANT",
            "matricule": matricule,
            "date_emprunt": emprunt.date_emprunt,
            "date_retour_prevue": emprunt.date_retour_prevue,
            "date_retour_effective": emprunt.date_retour_effective,
            "jours_de_retard": retard,
            "en_retard": (not rendu) and retard > 0,
            "statut": "RENDU" if rendu else ("EN_RETARD" if retard > 0 else "EN_COURS"),
            "rappel_envoye": emprunt.rappel_envoye == "O",
            "etat_retour": emprunt.etat_retour,
        })
    return {"total": total, "skip": skip, "limit": limit, "items": items}


@router.post("/emprunts/{emprunt_id}/retour")
def enregistrer_retour(
    emprunt_id: int,
    data: Optional[dict] = None,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
    etablissement_id: int = Depends(require_etablissement),
):
    """Le livre revient : l'exemplaire redevient prêtable.

    Sans cette route, un exemplaire prêté restait « EMPRUNTE » à vie et
    `nb_disponibles` ne remontait jamais — le fonds s'épuisait à l'écran sans
    qu'un seul livre ait quitté l'école.
    """
    _require_write(current_user)

    ligne = (
        db.query(Emprunt, Exemplaire, Ouvrage)
        .join(Exemplaire, Exemplaire.exemplaire_id == Emprunt.exemplaire_id)
        .join(Ouvrage, Ouvrage.ouvrage_id == Exemplaire.ouvrage_id)
        .filter(Emprunt.emprunt_id == emprunt_id,
                Ouvrage.etablissement_id == etablissement_id)
        .first()
    )
    if not ligne:
        raise HTTPException(status_code=404, detail="Emprunt introuvable")
    emprunt, exemplaire, ouvrage = ligne
    if emprunt.date_retour_effective is not None:
        raise HTTPException(status_code=400, detail="Ce livre a déjà été rendu")

    data = data or {}
    etat = (data.get("etat_retour") or "BON").upper()
    if etat not in {"BON", "USE", "ABIME", "PERDU"}:
        raise HTTPException(status_code=400, detail="État de retour inconnu")

    aujourdhui = date.today()
    emprunt.date_retour_effective = aujourdhui
    emprunt.nb_jours_retard = max(0, (aujourdhui - emprunt.date_retour_prevue).days)
    emprunt.etat_retour = etat
    emprunt.observation = data.get("observation") or emprunt.observation
    emprunt.statut = "RENDU"
    emprunt.modified_by = current_user.get("nom", current_user.get("sub", "SYSTEM"))

    # Un livre perdu ne retourne pas au rayon : il sort du fonds prêtable.
    exemplaire.etat = etat if etat in {"USE", "ABIME"} else exemplaire.etat
    if etat == "PERDU":
        exemplaire.statut = "PERDU"
    else:
        exemplaire.statut = "DISPONIBLE"
        ouvrage.nb_disponibles = int(ouvrage.nb_disponibles or 0) + 1

    db.commit()
    return {
        "emprunt_id": emprunt.emprunt_id,
        "statut": emprunt.statut,
        "jours_de_retard": emprunt.nb_jours_retard,
        "message": (
            f"Retour enregistré avec {emprunt.nb_jours_retard} jour(s) de retard."
            if emprunt.nb_jours_retard else "Retour enregistré dans les délais."
        ),
    }


@router.post("/emprunts", response_model=EmpruntOut, status_code=201)
def create_emprunt(
    data: EmpruntCreate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
    etablissement_id: int = Depends(require_etablissement),
):
    _require_write(current_user)
    if not data.eleve_id and not data.enseignant_id:
        raise HTTPException(status_code=400, detail="Un emprunteur élève ou enseignant est requis")

    # Prêter depuis le catalogue : on n'a que l'ouvrage, le serveur retient un
    # exemplaire disponible de CETTE école. Le bibliothécaire n'a pas à connaître
    # le numéro de la copie.
    exemplaire_id = data.exemplaire_id
    if not exemplaire_id:
        if not data.ouvrage_id:
            raise HTTPException(status_code=400, detail="Précisez l'exemplaire ou l'ouvrage à prêter.")
        dispo = (
            db.query(Exemplaire)
            .join(Ouvrage, Ouvrage.ouvrage_id == Exemplaire.ouvrage_id)
            .filter(
                Exemplaire.ouvrage_id == data.ouvrage_id,
                Ouvrage.etablissement_id == etablissement_id,
                Exemplaire.statut == "DISPONIBLE",
            )
            .order_by(Exemplaire.exemplaire_id)
            .first()
        )
        if not dispo:
            raise HTTPException(status_code=400, detail="Aucun exemplaire disponible pour ce livre.")
        exemplaire_id = dispo.exemplaire_id

    # Lot 11 — l'exemplaire ET l'emprunteur doivent relever de cette école.
    # Sans ces contrôles on pouvait prêter un exemplaire d'une autre école, ou
    # inscrire au nom d'un élève/enseignant d'une autre école un emprunt qu'il
    # devrait ensuite rendre.
    ex = _exemplaire_ou_404(db, exemplaire_id, etablissement_id)
    if data.eleve_id and not db.query(Eleve.eleve_id).filter(
        Eleve.eleve_id == data.eleve_id, Eleve.etablissement_id == etablissement_id
    ).first():
        raise HTTPException(status_code=404, detail="Élève introuvable")
    if data.enseignant_id and not db.query(Enseignant.enseignant_id).filter(
        Enseignant.enseignant_id == data.enseignant_id,
        Enseignant.etablissement_id == etablissement_id,
    ).first():
        raise HTTPException(status_code=404, detail="Enseignant introuvable")

    if getattr(ex, "statut", None) != "DISPONIBLE":
        raise HTTPException(status_code=400, detail="Cet exemplaire n'est pas disponible")
    emprunt = Emprunt(
        exemplaire_id=exemplaire_id,
        eleve_id=data.eleve_id,
        enseignant_id=data.enseignant_id,
        date_retour_prevue=data.date_retour_prevue,
        observation=data.observation,
        created_by=current_user.get("nom", current_user.get("sub", "SYSTEM")),
    )
    setattr(ex, "statut", "EMPRUNTE")
    if ex.ouvrage:
        current_available = int(getattr(ex.ouvrage, "nb_disponibles", 0) or 0)
        setattr(ex.ouvrage, "nb_disponibles", max(current_available - 1, 0))
    db.add(emprunt)
    db.commit()
    db.refresh(emprunt)
    return emprunt


@router.post("/emprunts/rappels")
def envoyer_rappels_retards(
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
    etablissement_id: int = Depends(require_etablissement),
):
    """Un rappel à tous les élèves qui ont un livre en retard non rendu.

    Le bibliothécaire voyait la liste des retards mais devait prévenir chaque
    élève de vive voix. Ce bouton dépose, dans l'espace de chaque élève
    concerné, un message nommant le livre et le nombre de jours de retard —
    il le lit lui-même, sans qu'on ait à le chercher dans la cour.

    Ne renvoie pas un rappel déjà envoyé : rappeler dix fois le même jour n'est
    pas rappeler, c'est harceler. Une requête pour trouver les retards, un
    message par élève.
    """
    from app.models.academique import Message

    _require_write(current_user)
    aujourdhui = date.today()

    retards = (
        db.query(Emprunt, Exemplaire, Ouvrage)
        .join(Exemplaire, Exemplaire.exemplaire_id == Emprunt.exemplaire_id)
        .join(Ouvrage, Ouvrage.ouvrage_id == Exemplaire.ouvrage_id)
        .filter(
            Ouvrage.etablissement_id == etablissement_id,
            Emprunt.eleve_id.isnot(None),
            Emprunt.date_retour_effective.is_(None),
            Emprunt.date_retour_prevue < aujourdhui,
            Emprunt.rappel_envoye != "O",
        )
        .all()
    )

    envoyes = 0
    for emprunt, _ex, ouvrage in retards:
        jours = max(0, (aujourdhui - emprunt.date_retour_prevue).days)
        db.add(Message(
            etablissement_id=etablissement_id,
            expediteur_type="ADMIN",
            destinataire_type="ELEVE",
            destinataire_id=emprunt.eleve_id,
            objet_type="GENERAL",
            sujet="Livre à rendre à la bibliothèque",
            contenu=(
                f"Le livre « {ouvrage.titre} » que vous avez emprunté est en retard "
                f"de {jours} jour(s). Merci de le rapporter à la bibliothèque au plus vite."
            ),
            statut="ENVOYE",
        ))
        emprunt.rappel_envoye = "O"
        emprunt.date_rappel = aujourdhui
        envoyes += 1

    db.commit()
    return {
        "rappels_envoyes": envoyes,
        "message": (
            f"{envoyes} rappel(s) déposé(s) dans l'espace des élèves concernés."
            if envoyes else
            "Aucun nouveau rappel à envoyer : tous les retards ont déjà été signalés."
        ),
    }
