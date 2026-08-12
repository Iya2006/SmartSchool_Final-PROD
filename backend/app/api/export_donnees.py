"""
SMARTSCHOOL API — Export des données de l'école.

Ce que ce module fait : sortir en CSV (lisible par Excel) les données que
l'école pourrait avoir besoin de relire ailleurs — ses élèves, ses notes, ses
paiements.

Ce qu'il NE FAIT PAS, volontairement : la sauvegarde complète de la base. Un
fichier contenant toute une école ne se télécharge pas depuis un écran web sans
précautions — il contient des mots de passe hachés, des coordonnées de familles
et l'intégralité de la comptabilité. Une sauvegarde relève de l'exploitation du
serveur (`pg_dump`, planifié, chiffré, hors de portée du navigateur), pas d'un
bouton dans une interface.

Chaque export est borné à l'école appelante : `require_etablissement` sur toutes
les routes, et le filtre part toujours d'une relation réelle (l'élève, la
classe) plutôt que d'un identifiant fourni par le client.
"""
import csv
import io
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.core.auth import ADMIN_TIER_ROLES, require_etablissement, require_roles
from app.core.database import get_db
from app.models.academique import (
    Bulletin, BulletinLigne, Classe, Eleve, Etablissement, Facture, Inscription,
    Matiere, Paiement, Trimestre,
)

router = APIRouter(prefix="/api/export", tags=["Export des données"])

# Sortir les données d'une école n'est pas une consultation ordinaire :
# réservé au tiers direction, comme la configuration.
_require_admin = require_roles(*ADMIN_TIER_ROLES)


def _fichier_csv(entetes: list, lignes: list, nom: str) -> StreamingResponse:
    """CSV `;` avec BOM UTF-8 : c'est ce qu'attend Excel en configuration
    française. Sans le BOM les accents sont illisibles ; sans le `;` tout
    atterrit dans une seule colonne."""
    tampon = io.StringIO()
    tampon.write("﻿")
    writer = csv.writer(tampon, delimiter=";", lineterminator="\r\n")
    writer.writerow(entetes)
    writer.writerows(lignes)
    tampon.seek(0)

    horodatage = datetime.now().strftime("%Y%m%d_%H%M")
    return StreamingResponse(
        iter([tampon.getvalue()]),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{nom}_{horodatage}.csv"'},
    )


def _nom_ecole(db: Session, etablissement_id: int) -> str:
    e = db.query(Etablissement.nom).filter(
        Etablissement.etablissement_id == etablissement_id
    ).first()
    return (e[0] if e else "ecole").replace(" ", "_")[:40]


@router.get("/catalogue", dependencies=[Depends(_require_admin)])
def catalogue(
    db: Session = Depends(get_db),
    etablissement_id: int = Depends(require_etablissement),
):
    """Ce qui est exportable, avec le volume réel.

    Annoncer « Élèves » sans dire combien laisse l'utilisateur télécharger un
    fichier vide sans comprendre pourquoi.
    """
    eleves = db.query(Eleve).filter(Eleve.etablissement_id == etablissement_id).count()
    classes = db.query(Classe).filter(Classe.etablissement_id == etablissement_id).count()
    bulletins = (
        db.query(Bulletin)
        .join(Inscription, Inscription.inscription_id == Bulletin.inscription_id)
        .join(Classe, Classe.classe_id == Inscription.classe_id)
        .filter(Classe.etablissement_id == etablissement_id)
        .count()
    )
    factures = db.query(Facture).filter(Facture.etablissement_id == etablissement_id).count()
    return [
        {"cle": "eleves", "libelle": "Élèves", "volume": eleves,
         "description": "Identité, classe, contacts."},
        {"cle": "classes", "libelle": "Classes", "volume": classes,
         "description": "Classes et effectifs."},
        {"cle": "notes", "libelle": "Notes et bulletins", "volume": bulletins,
         "description": "Moyennes par matière, rang et mention, période par période."},
        {"cle": "paiements", "libelle": "Paiements", "volume": factures,
         "description": "Factures, montants réglés et restant dû."},
    ]


@router.get("/eleves", dependencies=[Depends(_require_admin)])
def exporter_eleves(
    classe_id: Optional[int] = None,
    db: Session = Depends(get_db),
    etablissement_id: int = Depends(require_etablissement),
):
    """Élèves de l'école, avec leur classe."""
    requete = (
        db.query(Eleve, Classe)
        .outerjoin(Inscription, (Inscription.eleve_id == Eleve.eleve_id)
                   & (Inscription.statut == "ACTIVE"))
        .outerjoin(Classe, Classe.classe_id == Inscription.classe_id)
        .filter(Eleve.etablissement_id == etablissement_id)
    )
    if classe_id:
        # La classe doit être de cette école, sinon le filtre servirait à
        # sonder l'existence de celles des voisines.
        if not db.query(Classe.classe_id).filter(
            Classe.classe_id == classe_id, Classe.etablissement_id == etablissement_id
        ).first():
            raise HTTPException(404, "Classe non trouvée")
        requete = requete.filter(Inscription.classe_id == classe_id)

    lignes = [
        [
            e.matricule, e.nom, e.prenom, e.sexe,
            e.date_naissance.isoformat() if e.date_naissance else "",
            e.lieu_naissance or "", c.libelle if c else "",
            e.telephone or "", e.email or "", e.quartier or "", e.statut or "",
        ]
        for e, c in requete.order_by(Eleve.nom, Eleve.prenom).all()
    ]
    return _fichier_csv(
        ["Matricule", "Nom", "Prénom", "Sexe", "Date de naissance", "Lieu de naissance",
         "Classe", "Téléphone", "E-mail", "Quartier", "Statut"],
        lignes, f"eleves_{_nom_ecole(db, etablissement_id)}",
    )


@router.get("/classes", dependencies=[Depends(_require_admin)])
def exporter_classes(
    db: Session = Depends(get_db),
    etablissement_id: int = Depends(require_etablissement),
):
    classes = db.query(Classe).filter(
        Classe.etablissement_id == etablissement_id
    ).order_by(Classe.code).all()
    lignes = [
        [c.code, c.libelle, c.effectif_actuel or 0, c.capacite_max or "", c.statut or ""]
        for c in classes
    ]
    return _fichier_csv(
        ["Code", "Libellé", "Effectif", "Capacité", "Statut"],
        lignes, f"classes_{_nom_ecole(db, etablissement_id)}",
    )


@router.get("/notes", dependencies=[Depends(_require_admin)])
def exporter_notes(
    trimestre_id: Optional[int] = None,
    db: Session = Depends(get_db),
    etablissement_id: int = Depends(require_etablissement),
):
    """Une ligne par élève et par matière : c'est la forme qui se retraite le
    plus facilement dans un tableur (filtres, tableaux croisés)."""
    requete = (
        db.query(Bulletin, BulletinLigne, Eleve, Classe, Matiere, Trimestre)
        .join(Inscription, Inscription.inscription_id == Bulletin.inscription_id)
        .join(Eleve, Eleve.eleve_id == Inscription.eleve_id)
        .join(Classe, Classe.classe_id == Inscription.classe_id)
        .join(BulletinLigne, BulletinLigne.bulletin_id == Bulletin.bulletin_id)
        .outerjoin(Matiere, Matiere.matiere_id == BulletinLigne.matiere_id)
        .outerjoin(Trimestre, Trimestre.trimestre_id == Bulletin.trimestre_id)
        .filter(Classe.etablissement_id == etablissement_id)
    )
    if trimestre_id:
        requete = requete.filter(Bulletin.trimestre_id == trimestre_id)

    lignes = [
        [
            el.matricule, el.nom, el.prenom, cl.libelle,
            tr.libelle if tr else "Annuel",
            mat.libelle if mat else "",
            float(lg.moyenne_matiere) if lg.moyenne_matiere is not None else "",
            float(lg.coefficient) if lg.coefficient is not None else "",
            float(b.moyenne_generale) if b.moyenne_generale is not None else "",
            b.rang or "", b.effectif_classe or "", b.mention or "", b.statut or "",
        ]
        for b, lg, el, cl, mat, tr in requete.order_by(
            Classe.libelle, Eleve.nom, Eleve.prenom
        ).all()
    ]
    return _fichier_csv(
        ["Matricule", "Nom", "Prénom", "Classe", "Période", "Matière",
         "Moyenne matière", "Coefficient", "Moyenne générale", "Rang",
         "Effectif", "Mention", "Statut du bulletin"],
        lignes, f"notes_{_nom_ecole(db, etablissement_id)}",
    )


@router.get("/paiements", dependencies=[Depends(_require_admin)])
def exporter_paiements(
    db: Session = Depends(get_db),
    etablissement_id: int = Depends(require_etablissement),
):
    """Factures avec ce qui a été réglé et ce qui reste dû."""
    factures = (
        db.query(Facture, Eleve, Classe)
        .outerjoin(Eleve, Eleve.eleve_id == Facture.eleve_id)
        .outerjoin(Inscription, (Inscription.eleve_id == Eleve.eleve_id)
                   & (Inscription.statut == "ACTIVE"))
        .outerjoin(Classe, Classe.classe_id == Inscription.classe_id)
        .filter(Facture.etablissement_id == etablissement_id)
        .order_by(Facture.date_emission.desc())
        .all()
    )
    if not factures:
        return _fichier_csv(
            ["Facture", "Matricule", "Nom", "Prénom", "Classe", "Date",
             "Montant total", "Payé", "Restant", "Statut"],
            [], f"paiements_{_nom_ecole(db, etablissement_id)}",
        )

    # Total payé par facture en UNE requête : une par ligne remettrait le N+1
    # que ce projet a déjà payé cher ailleurs.
    from sqlalchemy import func as _func
    payes = dict(
        db.query(Paiement.facture_id, _func.sum(Paiement.montant))
        .filter(Paiement.facture_id.in_([f.facture_id for f, _, _ in factures]))
        .group_by(Paiement.facture_id)
        .all()
    )

    lignes = []
    for f, el, cl in factures:
        total = float(f.montant_total or 0)
        paye = float(payes.get(f.facture_id, 0) or 0)
        lignes.append([
            f.numero_facture or f.facture_id,
            el.matricule if el else "", el.nom if el else "", el.prenom if el else "",
            cl.libelle if cl else "",
            f.date_emission.isoformat() if f.date_emission else "",
            total, paye, round(total - paye, 2), f.statut or "",
        ])
    return _fichier_csv(
        ["Facture", "Matricule", "Nom", "Prénom", "Classe", "Date",
         "Montant total", "Payé", "Restant", "Statut"],
        lignes, f"paiements_{_nom_ecole(db, etablissement_id)}",
    )
