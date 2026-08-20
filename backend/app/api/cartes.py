"""
SMARTSCHOOL — Contenu du QR d'une carte scolaire.

Le QR d'une carte (élève / enseignant) n'encode plus le seul matricule : il porte
un TEXTE lisible, de sorte qu'un simple lecteur de QR (téléphone) affiche
directement l'identité et les infos utiles. Ce texte est calculé ICI, à partir
des données réelles de l'établissement — jamais un ID brut ni une valeur codée
en dur, et jamais les données d'une autre école (isolation via
`require_etablissement`, tiré du JWT).

Ce n'est PAS un écran/module de scan : c'est uniquement le CONTENU du QR, que le
composant carte (frontend) récupère au moment d'imprimer/afficher la carte.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.auth import require_etablissement
from app.models.academique import (
    Eleve, Enseignant, Inscription, Classe, AnneeScolaire, Etablissement,
    EleveParent, Parent, Affectation, Matiere, Niveau,
)

router = APIRouter(prefix="/api/cartes", tags=["Cartes scolaires (QR)"])


def _texte_eleve(db: Session, eleve: Eleve, etablissement_id: int) -> str:
    etab = db.query(Etablissement.nom).filter(
        Etablissement.etablissement_id == etablissement_id
    ).first()
    ecole = etab[0] if etab else "École"

    ligne = (
        db.query(Classe.libelle, AnneeScolaire.libelle)
        .select_from(Inscription)
        .join(Classe, Inscription.classe_id == Classe.classe_id)
        .join(AnneeScolaire, Inscription.annee_id == AnneeScolaire.annee_id)
        .filter(Inscription.eleve_id == eleve.eleve_id, Inscription.statut == "ACTIVE")
        .order_by(AnneeScolaire.annee_id.desc())
        .first()
    )
    classe = ligne[0] if ligne else "—"
    annee = ligne[1] if ligne else "—"

    parent = (
        db.query(Parent)
        .join(EleveParent, EleveParent.parent_id == Parent.parent_id)
        .filter(EleveParent.eleve_id == eleve.eleve_id)
        .order_by(EleveParent.est_contact_principal.desc())
        .first()
    )

    lignes = [
        f"ÉLÈVE — {ecole}",
        f"{eleve.prenom} {eleve.nom}",
        f"Matricule : {eleve.matricule}",
        f"Classe : {classe} ({annee})",
    ]
    if parent:
        lignes.append(f"Parent : {(parent.prenom or '')} {(parent.nom or '')}".rstrip())
        tel = parent.telephone_1 or parent.telephone_2
        if tel:
            lignes.append(f"Tél parent : {tel}")
        adr = parent.adresse or parent.quartier
        if adr:
            lignes.append(f"Adresse : {adr}")
    return "\n".join(lignes)


def _texte_enseignant(db: Session, ens: Enseignant, etablissement_id: int) -> str:
    etab = db.query(Etablissement.nom).filter(
        Etablissement.etablissement_id == etablissement_id
    ).first()
    ecole = etab[0] if etab else "École"

    lignes_aff = (
        db.query(Classe.libelle, Matiere.libelle)
        .select_from(Affectation)
        .join(Classe, Affectation.classe_id == Classe.classe_id)
        .outerjoin(Matiere, Affectation.matiere_id == Matiere.matiere_id)
        .filter(Affectation.enseignant_id == ens.enseignant_id, Affectation.statut == "ACTIVE")
        .all()
    )
    classes, matieres = [], []
    for c_lib, m_lib in lignes_aff:
        if c_lib and c_lib not in classes:
            classes.append(c_lib)
        if m_lib and m_lib not in matieres:
            matieres.append(m_lib)
    # Classes de maternelle (titulaire par professeur principal, sans matière).
    for (lib,) in db.query(Classe.libelle).join(
        Niveau, Classe.niveau_id == Niveau.niveau_id
    ).filter(
        Classe.professeur_principal == ens.enseignant_id,
        Classe.etablissement_id == etablissement_id,
    ).all():
        if lib and lib not in classes:
            classes.append(lib)

    lignes = [
        f"ENSEIGNANT — {ecole}",
        f"{ens.prenom} {ens.nom}",
        f"Matricule : {ens.matricule}",
    ]
    if ens.telephone:
        lignes.append(f"Tél : {ens.telephone}")
    if ens.adresse:
        lignes.append(f"Adresse : {ens.adresse}")
    if classes:
        lignes.append(f"Classes : {', '.join(sorted(classes))}")
    if matieres:
        lignes.append(f"Matières : {', '.join(sorted(matieres))}")
    return "\n".join(lignes)


@router.get("/contenu-qr/{matricule}")
def contenu_qr(
    matricule: str,
    db: Session = Depends(get_db),
    etablissement_id: int = Depends(require_etablissement),
):
    """Texte lisible à encoder dans le QR de la carte (élève ou enseignant).

    Résolu DANS l'établissement appelant uniquement (404 sinon).
    """
    matricule = (matricule or "").strip()
    if not matricule:
        raise HTTPException(404, "Matricule manquant.")

    eleve = db.query(Eleve).filter(
        Eleve.matricule == matricule, Eleve.etablissement_id == etablissement_id
    ).first()
    if eleve:
        return {"type": "ELEVE", "texte": _texte_eleve(db, eleve, etablissement_id)}

    ens = db.query(Enseignant).filter(
        Enseignant.matricule == matricule, Enseignant.etablissement_id == etablissement_id
    ).first()
    if ens:
        return {"type": "ENSEIGNANT", "texte": _texte_enseignant(db, ens, etablissement_id)}

    raise HTTPException(404, "Carte inconnue dans cet établissement.")
