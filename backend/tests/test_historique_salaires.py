"""
Historique des salaires (GET /api/finance/salaires/historique) :
- liste les paiements de salaire de l'école (enseignants + personnel) ;
- filtrable par mois concerné, cherchable par nom (insensible aux accents) ;
- isolation multi-école : l'école B ne voit pas les salaires de l'école A.
"""
from datetime import date

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.models.academique import (
    AnneeScolaire, BulletinPaie, Depense, Enseignant, Etablissement, Utilisateur,
)

_C = 0


def _uid() -> int:
    global _C
    _C += 1
    return _C


def _login(client: TestClient, identifiant: str) -> dict:
    r = client.post("/api/auth/login", json={"identifiant": identifiant, "mot_de_passe": "motdepasse123"})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['token']}"}


def _ecole(db: Session):
    uid = _uid()
    etab = Etablissement(code=f"HS-{uid}", nom=f"École {uid}", type_etablissement="PRIMAIRE")
    db.add(etab); db.commit(); db.refresh(etab)
    annee = AnneeScolaire(etablissement_id=etab.etablissement_id, code=f"AN{uid}", libelle="2026-2027",
                          date_debut=date(2026, 9, 1), date_fin=date(2027, 7, 1), statut="EN_COURS", est_courante="O")
    db.add(annee); db.commit(); db.refresh(annee)
    admin = Utilisateur(nom="Admin", prenom=f"H{uid}", nom_utilisateur=f"hs.admin.{uid}",
                        email=f"hs.admin.{uid}@smartschool.gn", telephone=f"66670{uid:04d}",
                        mot_de_passe=hash_password("motdepasse123"), role="ADMIN", statut="ACTIF",
                        etablissement_id=etab.etablissement_id)
    db.add(admin); db.commit(); db.refresh(admin)
    return etab, annee, admin


def _payer(db, etab, annee, ens, mois, montant, mode="ESPECES"):
    """Enregistre un salaire comme le fait _executer_paiement_salaire (Depense + Bulletin)."""
    bul = BulletinPaie(employe_id=ens.enseignant_id, mois_concerne=mois, salaire_base=montant,
                       total_primes=0, total_absences=0, total_avances=0, net_a_payer=montant,
                       date_paiement=date(int(mois[:4]), int(mois[5:7]), 5), mode_paiement=mode, statut="PAYE")
    db.add(bul); db.commit(); db.refresh(bul)
    dep = Depense(etablissement_id=etab.etablissement_id, annee_id=annee.annee_id, categorie="SALAIRES",
                  libelle=f"Salaire {ens.prenom} {ens.nom} — {mois}", montant=montant,
                  date_depense=bul.date_paiement, fournisseur=f"ENS_{ens.enseignant_id}",
                  statut="VALIDE", reference=str(bul.bulletin_id))
    db.add(dep); db.commit()


def _ens(db, etab, nom, prenom):
    uid = _uid()
    e = Enseignant(nom=nom, prenom=prenom, matricule=f"ENS-{etab.etablissement_id}-{uid}", sexe="M",
                   telephone=f"620{uid:06d}", mot_de_passe=hash_password("x"), statut="ACTIF",
                   etablissement_id=etab.etablissement_id)
    db.add(e); db.commit(); db.refresh(e)
    return e


def test_historique_liste_filtre_mois_et_recherche(client: TestClient, db: Session):
    etab, annee, admin = _ecole(db)
    e1 = _ens(db, etab, "Traoré", "Awa")
    e2 = _ens(db, etab, "Diallo", "Mamadou")
    _payer(db, etab, annee, e1, "2026-09", 1_500_000)
    _payer(db, etab, annee, e1, "2026-10", 1_500_000)
    _payer(db, etab, annee, e2, "2026-09", 1_200_000)
    headers = _login(client, admin.nom_utilisateur)

    # Tout l'historique.
    r = client.get("/api/finance/salaires/historique", headers=headers)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["nombre"] == 3
    assert d["total"] == 4_200_000

    # Filtre par mois concerné.
    r = client.get("/api/finance/salaires/historique?mois=2026-09", headers=headers)
    assert r.json()["nombre"] == 2

    # Recherche par nom SANS accent → trouve « Traoré ».
    r = client.get("/api/finance/salaires/historique?search=traore", headers=headers)
    d = r.json()
    assert d["nombre"] == 2
    assert all("Traoré" in p["employe"] for p in d["paiements"])


def test_historique_isolation_inter_ecoles(client: TestClient, db: Session):
    etab_a, annee_a, admin_a = _ecole(db)
    e_a = _ens(db, etab_a, "Camara", "Sekou")
    _payer(db, etab_a, annee_a, e_a, "2026-09", 900_000)

    etab_b, _, admin_b = _ecole(db)
    headers_b = _login(client, admin_b.nom_utilisateur)
    r = client.get("/api/finance/salaires/historique", headers=headers_b)
    assert r.status_code == 200
    assert r.json()["nombre"] == 0  # l'école B ne voit rien de l'école A
