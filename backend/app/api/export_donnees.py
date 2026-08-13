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
    Matiere, Trimestre,
)

router = APIRouter(prefix="/api/export", tags=["Export des données"])

# Sortir les données d'une école n'est pas une consultation ordinaire :
# réservé au tiers direction, comme la configuration.
_require_admin = require_roles(*ADMIN_TIER_ROLES)


# Un export se lit ligne a ligne : rien ne justifie de detenir le fichier
# entier avant d'en envoyer le premier octet.
_LIGNES_PAR_ENVOI = 500


def _fichier_csv(entetes: list, lignes, nom: str) -> StreamingResponse:
    """CSV `;` avec BOM UTF-8 : c'est ce qu'attend Excel en configuration
    française. Sans le BOM les accents sont illisibles ; sans le `;` tout
    atterrit dans une seule colonne.

    `lignes` accepte une liste OU un générateur, et le contenu part par paquets
    au fur et à mesure. La version précédente écrivait tout dans un `StringIO`,
    puis en prenait une COPIE complète (`iter([tampon.getvalue()])`) : le
    fichier tenait donc deux fois en mémoire avant que le premier octet ne
    parte. Sur une école de quelques centaines d'élèves c'est indolore ; sur un
    export de notes à l'échelle du million, c'est le serveur qui tombe — et il
    tombe pour tout le monde, pas seulement pour celui qui a cliqué.
    """
    def flux():
        tampon = io.StringIO()
        writer = csv.writer(tampon, delimiter=";", lineterminator="\r\n")
        tampon.write("﻿")
        writer.writerow(entetes)

        depuis = 0
        for ligne in lignes:
            writer.writerow(ligne)
            depuis += 1
            if depuis >= _LIGNES_PAR_ENVOI:
                yield tampon.getvalue()
                tampon.seek(0)
                tampon.truncate(0)
                depuis = 0
        reste = tampon.getvalue()
        if reste:
            yield reste

    horodatage = datetime.now().strftime("%Y%m%d_%H%M")
    return StreamingResponse(
        flux(),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{nom}_{horodatage}.csv"'},
    )


# `.all()` charge tout le resultat d'un coup. `.yield_per()` demande a
# PostgreSQL de livrer par paquets : la memoire ne depend plus du volume.
_LIGNES_PAR_LOT = 1000


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
    factures = (
        db.query(Facture)
        .join(Inscription, Inscription.inscription_id == Facture.inscription_id)
        .join(Classe, Classe.classe_id == Inscription.classe_id)
        .filter(Classe.etablissement_id == etablissement_id)
        .count()
    )
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

    lignes = (
        [
            e.matricule, e.nom, e.prenom, e.sexe,
            e.date_naissance.isoformat() if e.date_naissance else "",
            e.lieu_naissance or "", c.libelle if c else "",
            e.telephone or "", e.email or "", e.quartier or "", e.statut or "",
        ]
        for e, c in requete.order_by(Eleve.nom, Eleve.prenom).yield_per(_LIGNES_PAR_LOT)
    )
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

    # Une ligne par eleve et par matiere et par periode : c'est l'export qui
    # grossit le plus vite de tout le systeme.
    lignes = (
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
        ).yield_per(_LIGNES_PAR_LOT)
    )
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
    # Une facture ne porte pas d'ecole : elle se rattache par son inscription,
    # qui porte l'eleve ET la classe. C'est aussi ce qui l'isole.
    factures = (
        db.query(Facture, Eleve, Classe)
        .join(Inscription, Inscription.inscription_id == Facture.inscription_id)
        .join(Eleve, Eleve.eleve_id == Inscription.eleve_id)
        .join(Classe, Classe.classe_id == Inscription.classe_id)
        .filter(Classe.etablissement_id == etablissement_id)
        .order_by(Facture.date_facture.desc())
        .yield_per(_LIGNES_PAR_LOT)
    )

    # `montant_paye` et `montant_restant` sont tenus a jour sur la facture
    # elle-meme : les recalculer depuis les paiements ferait courir le risque
    # d'afficher un chiffre different de celui de l'ecran comptabilite.
    def lignes():
        for f, el, cl in factures:
            total = float(f.montant_net or f.montant_total or 0)
            paye = float(f.montant_paye or 0)
            yield [
                f.numero_facture or f.facture_id,
                el.matricule if el else "", el.nom if el else "", el.prenom if el else "",
                cl.libelle if cl else "",
                f.date_facture.isoformat() if f.date_facture else "",
                total, paye,
                float(f.montant_restant) if f.montant_restant is not None else round(total - paye, 2),
                f.statut or "",
            ]
    return _fichier_csv(
        ["Facture", "Matricule", "Nom", "Prénom", "Classe", "Date",
         "Montant total", "Payé", "Restant", "Statut"],
        lignes(), f"paiements_{_nom_ecole(db, etablissement_id)}",
    )
