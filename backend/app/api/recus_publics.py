"""
SMARTSCHOOL — Vérification publique d'un reçu de paiement.

Le QR code imprimé sur chaque reçu ouvre /verifier-recu sur le site, qui
interroge cette route SANS compte : n'importe qui (parent, banque, autre
école) doit pouvoir s'assurer qu'un reçu est authentique.

Elle ne répond qu'avec le numéro ET le code de vérification du reçu (HMAC
signé par le serveur, voir app/core/recu_paiement.py). Un numéro seul ne
donne rien, et un numéro inconnu répond exactement comme un code faux :
impossible de parcourir les reçus d'une école en devinant les numéros.
"""
from fastapi import APIRouter, Depends, Request
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

    result = (
        db.query(Paiement, Facture, Inscription, Eleve, Classe)
        .join(Facture, Paiement.facture_id == Facture.facture_id)
        .join(Inscription, Facture.inscription_id == Inscription.inscription_id)
        .join(Eleve, Inscription.eleve_id == Eleve.eleve_id)
        .join(Classe, Inscription.classe_id == Classe.classe_id)
        .filter(Paiement.numero_recu == numero)
        .first()
    )
    if not result or not code_est_valide(result[0], c):
        return {"authentique": False}

    paiement, facture, inscription, eleve, classe = result
    d = charger_donnees_recu(db, paiement, facture, inscription, eleve, classe)
    etab = d["etablissement"]
    fac = d["facture"]
    # Seulement ce qui figure déjà sur le reçu lui-même — rien de plus (pas
    # de téléphone du parent, pas d'autres factures).
    return {
        "authentique": True,
        "statut": d["statut"],
        "numero_recu": d["numero_recu"],
        "date_paiement": d["date_paiement"],
        "heure": d["heure"],
        "montant": d["montant"],
        "montant_en_lettres": d["montant_en_lettres"],
        "devise": d["devise"],
        "mode_paiement": d["mode_paiement_libelle"],
        "tranche": d["tranche"],
        "motif": fac["motif"],
        "numero_facture": fac["numero_facture"],
        "facture": {
            "montant_total": fac["montant_total"],
            "paye_a_date": fac["paye_a_date"],
            "reste_a_date": fac["reste_a_date"],
            "reste_actuel": fac["montant_restant"],
            "statut_actuel": fac["statut"],
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
