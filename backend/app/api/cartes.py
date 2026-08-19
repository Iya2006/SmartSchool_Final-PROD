"""
SMARTSCHOOL API — Vérification d'une carte scolaire au SCAN.

Le QR d'une carte (élève ou enseignant) encode le MATRICULE. Scanner la carte
ne doit plus se limiter à afficher ce matricule : cet endpoint le résout en une
FICHE d'identité lisible, en respectant deux garde-fous non négociables :

1. Isolation multi-école (Lot 9) : le matricule est résolu UNIQUEMENT dans
   l'établissement de l'utilisateur connecté (`require_etablissement`, tiré du
   JWT — jamais du frontend). Scanner la carte d'une autre école → 404, même si
   le matricule est devinable. La ressource ne « fuit » jamais.

2. Données sensibles (Partie 5) : l'identité, la classe et l'établissement sont
   toujours renvoyés ; le CONTACT (téléphone/adresse du parent ou de
   l'enseignant) n'est renvoyé qu'aux rôles autorisés à le voir. Sinon il est
   masqué (`contact_masque=true`), la carte reste identifiable sans exposer les
   coordonnées personnelles à n'importe quel porteur de scanner.

Toutes les valeurs proviennent de la base (Etablissement.nom, AnneeScolaire.
libelle, Classe.libelle, Affectation…) — jamais d'un ID brut ni d'un libellé
codé en dur.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.auth import get_current_user, require_etablissement, ADMIN_TIER_ROLES
from app.models.academique import (
    Eleve, Enseignant, Inscription, Classe, AnneeScolaire, Etablissement,
    EleveParent, Parent, Affectation, Matiere, Niveau,
)

router = APIRouter(prefix="/api/cartes", tags=["Cartes scolaires (QR)"])

# Rôles autorisés à voir les COORDONNÉES (téléphone/adresse) sur une fiche
# scannée : la direction et le secrétariat/surveillance qui gèrent réellement
# les personnes. Les autres voient l'identité et la classe, pas le contact.
ROLES_VOIR_CONTACT = ADMIN_TIER_ROLES | {
    "DIRECTEUR", "DIRECTRICE", "SECRETAIRE", "CENSEUR",
    "SURVEILLANT", "SURVEILLANT_GENERAL", "COMPTABLE",
}


def _peut_voir_contact(current_user: dict) -> bool:
    return (current_user.get("role") or "").upper() in ROLES_VOIR_CONTACT


def _fiche_eleve(db: Session, eleve: Eleve, etablissement_id: int, voir_contact: bool) -> dict:
    etab = db.query(Etablissement.nom).filter(
        Etablissement.etablissement_id == etablissement_id
    ).first()

    # Classe + année ACTUELLES : inscription active la plus récente de l'élève.
    ligne = (
        db.query(Classe.libelle, AnneeScolaire.libelle)
        .select_from(Inscription)
        .join(Classe, Inscription.classe_id == Classe.classe_id)
        .join(AnneeScolaire, Inscription.annee_id == AnneeScolaire.annee_id)
        .filter(Inscription.eleve_id == eleve.eleve_id, Inscription.statut == "ACTIVE")
        .order_by(AnneeScolaire.annee_id.desc())
        .first()
    )
    classe_libelle = ligne[0] if ligne else None
    annee_libelle = ligne[1] if ligne else None

    parent = None
    if voir_contact:
        lien = (
            db.query(Parent)
            .join(EleveParent, EleveParent.parent_id == Parent.parent_id)
            .filter(EleveParent.eleve_id == eleve.eleve_id)
            .order_by(EleveParent.est_contact_principal.desc())
            .first()
        )
        if lien:
            parent = {
                "nom": f"{lien.prenom or ''} {lien.nom or ''}".strip() or None,
                "telephone": lien.telephone_1 or lien.telephone_2 or None,
                "adresse": lien.adresse or lien.quartier or None,
            }

    return {
        "type": "ELEVE",
        "identite": {
            "nom": eleve.nom,
            "prenom": eleve.prenom,
            "matricule": eleve.matricule,
        },
        "scolarite": {
            "classe": classe_libelle,
            "annee_scolaire": annee_libelle,
            "etablissement": etab[0] if etab else None,
        },
        "parent": parent,
        "contact_masque": not voir_contact,
    }


def _fiche_enseignant(db: Session, ens: Enseignant, etablissement_id: int, voir_contact: bool) -> dict:
    etab = db.query(Etablissement.nom).filter(
        Etablissement.etablissement_id == etablissement_id
    ).first()

    # Classes + matières RÉELLES via les affectations actives (jamais codées en dur).
    lignes = (
        db.query(Classe.libelle, Matiere.libelle)
        .select_from(Affectation)
        .join(Classe, Affectation.classe_id == Classe.classe_id)
        .outerjoin(Matiere, Affectation.matiere_id == Matiere.matiere_id)
        .filter(
            Affectation.enseignant_id == ens.enseignant_id,
            Affectation.statut == "ACTIVE",
        )
        .all()
    )
    classes, matieres = [], []
    for classe_lib, matiere_lib in lignes:
        if classe_lib and classe_lib not in classes:
            classes.append(classe_lib)
        if matiere_lib and matiere_lib not in matieres:
            matieres.append(matiere_lib)

    # Classes de MATERNELLE dont il est titulaire (lien par professeur principal,
    # sans affectation matière) — sinon un instituteur de maternelle apparaîtrait
    # sans aucune classe.
    for (lib,) in db.query(Classe.libelle).join(
        Niveau, Classe.niveau_id == Niveau.niveau_id
    ).filter(
        Classe.professeur_principal == ens.enseignant_id,
        Classe.etablissement_id == etablissement_id,
    ).all():
        if lib and lib not in classes:
            classes.append(lib)

    return {
        "type": "ENSEIGNANT",
        "identite": {
            "nom": ens.nom,
            "prenom": ens.prenom,
            "matricule": ens.matricule,
        },
        "contact": (
            {"telephone": ens.telephone or None, "adresse": ens.adresse or None}
            if voir_contact else None
        ),
        "etablissement": etab[0] if etab else None,
        "classes": sorted(classes),
        "matieres": sorted(matieres),
        "contact_masque": not voir_contact,
    }


@router.get("/verifier/{matricule}")
def verifier_carte(
    matricule: str,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
    etablissement_id: int = Depends(require_etablissement),
):
    """Résout le matricule scané en fiche d'identité, DANS l'école appelante.

    Renvoie une fiche ÉLÈVE ou ENSEIGNANT selon le matricule. 404 si le matricule
    n'appartient à personne DE CETTE ÉCOLE (isolation multi-école).
    """
    matricule = (matricule or "").strip()
    if not matricule:
        raise HTTPException(404, "Carte illisible.")

    voir_contact = _peut_voir_contact(current_user)

    eleve = db.query(Eleve).filter(
        Eleve.matricule == matricule, Eleve.etablissement_id == etablissement_id
    ).first()
    if eleve:
        return _fiche_eleve(db, eleve, etablissement_id, voir_contact)

    ens = db.query(Enseignant).filter(
        Enseignant.matricule == matricule, Enseignant.etablissement_id == etablissement_id
    ).first()
    if ens:
        return _fiche_enseignant(db, ens, etablissement_id, voir_contact)

    # Ni élève ni enseignant de cette école : 404 (ne révèle pas une carte d'ailleurs).
    raise HTTPException(404, "Carte inconnue dans cet établissement.")
