"""
SMARTSCHOOL — Vérification publique d'un reçu de paiement.

Le QR code imprimé sur chaque reçu ouvre /verifier-recu sur le site, qui
interroge cette route SANS compte : n'importe qui (parent, banque, autre
école) doit pouvoir s'assurer qu'un reçu est authentique.

Elle ne répond qu'avec le numéro ET le code de vérification du reçu (HMAC
signé par le serveur, voir app/core/recu_paiement.py). Un numéro seul ne
donne rien, et un numéro inconnu répond exactement comme un code faux :
impossible de parcourir les reçus d'une école en devinant les numéros. Le
numéro se retrouve sans tenir compte de la casse (« rec-… » tapé à la main).

Elle ne renvoie que ce qui est IMPRIMÉ sur le reçu, situation de la facture
à la date du reçu comprise. Pas la situation d'aujourd'hui (reste à payer,
statut actuel) : quiconque tient le papier — banque, autre école, ancien
employeur — apprendrait sinon, des mois plus tard, si la famille a fini de
payer.
"""
from fastapi import APIRouter, Depends, Request
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.rate_limit import limiter
from app.models.academique import Classe, Eleve, Facture, Inscription, Paiement

router = APIRouter(prefix="/api/public/recus", tags=["Reçus — vérification publique"])


@router.get("/verifier")
@limiter.limit("30/minute")
def verifier_recu(request: Request, n: str = "", c: str = "", db: Session = Depends(get_db)):
    from app.core.recu_paiement import charger_donnees_recu, code_est_valide

    numero = (n or "").strip()
    if not numero or not c:
        return {"authentique": False}

    candidats = (
        db.query(Paiement, Facture, Inscription, Eleve, Classe)
        .join(Facture, Paiement.facture_id == Facture.facture_id)
        .join(Inscription, Facture.inscription_id == Inscription.inscription_id)
        .join(Eleve, Inscription.eleve_id == Eleve.eleve_id)
        .join(Classe, Inscription.classe_id == Classe.classe_id)
        .filter(func.upper(Paiement.numero_recu) == numero.upper())
        .all()
    )
    # Le même numéro peut exister dans deux écoles (anciens numéros sans code
    # d'école), ou ne différer que par la casse : c'est le code qui désigne
    # le bon reçu, pas le premier venu.
    result = next((r for r in candidats if code_est_valide(r[0], c)), None)
    if not result:
        return {"authentique": False}

    paiement, facture, inscription, eleve, classe = result
    d = charger_donnees_recu(db, paiement, facture, inscription, eleve, classe)
    etab = d["etablissement"]
    fac = d["facture"]
    # Seulement ce qui figure déjà sur le reçu lui-même — rien de plus (pas
    # de téléphone du parent, pas d'autres factures, pas la situation
    # actuelle de la facture).
    return {
        "authentique": True,
        "statut": d["statut"],
        "numero_recu": d["numero_recu"],
        "date_paiement": d["date_paiement"],
        "heure": d["heure"],
        "montant": d["montant"],
        "montant_en_lettres": d["montant_en_lettres"],
        "somme_en_lettres": d["somme_en_lettres"],
        "devise": d["devise"],
        "mode_paiement": d["mode_paiement_libelle"],
        "tranche": d["tranche"],
        "motif": fac["motif"],
        "numero_facture": fac["numero_facture"],
        "facture": {
            "montant_total": fac["montant_total"],
            "paye_a_date": fac["paye_a_date"],
            "reste_a_date": fac["reste_a_date"],
        },
        "eleve": {
            "prenom": d["eleve"]["prenom"],
            "nom": d["eleve"]["nom"],
            "matricule": d["eleve"]["matricule"],
            "classe": d["eleve"]["classe"],
        },
        "annee_libelle": d["annee_libelle"],
        "etablissement": {
            "nom": etab["nom"],
            "logo_url": etab["logo_url"],
            "couleur": etab["couleur"],
            "adresse": etab["adresse"],
            "telephone": etab["telephone"],
        },
    }
