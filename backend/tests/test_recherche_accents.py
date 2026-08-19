"""
Reproduction : la recherche d'élève par NOM doit ignorer les accents.

Les noms guinéens sont pleins d'accents (Traoré, Néné, Fatoumata…). Un
directeur tape « traore » sans accent : il doit trouver « Traoré ». Avant
correctif, `ilike` distinguait é ≠ e, donc seul le matricule (sans accent)
répondait — d'où « la recherche par nom ne marche pas, seul le matricule ».
"""
from datetime import date

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.models.academique import (
    AnneeScolaire, Classe, Cycle, Eleve, Etablissement, Facture, Inscription,
    Niveau, Utilisateur,
)

_C = 0


def _uid() -> int:
    global _C
    _C += 1
    return _C


def _headers(client: TestClient, identifiant: str) -> dict:
    r = client.post("/api/auth/login", json={"identifiant": identifiant, "mot_de_passe": "motdepasse123"})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['token']}"}


def test_impayes_recherche_ignore_les_accents(client: TestClient, db: Session):
    uid = _uid()
    etab = Etablissement(code=f"AC-{uid}", nom=f"École {uid}", type_etablissement="PRIMAIRE")
    db.add(etab); db.commit(); db.refresh(etab)
    annee = AnneeScolaire(
        etablissement_id=etab.etablissement_id, code=f"AN{uid}", libelle="2026-2027",
        date_debut=date(2026, 9, 1), date_fin=date(2027, 7, 1), statut="EN_COURS", est_courante="O",
    )
    db.add(annee); db.commit(); db.refresh(annee)
    cycle = Cycle(etablissement_id=etab.etablissement_id, code="PRM", libelle="Primaire", ordre=1)
    db.add(cycle); db.commit(); db.refresh(cycle)
    niveau = Niveau(cycle_id=cycle.cycle_id, code=f"N{uid}", libelle="2ème", ordre=2)
    db.add(niveau); db.commit(); db.refresh(niveau)
    classe = Classe(
        etablissement_id=etab.etablissement_id, annee_id=annee.annee_id, niveau_id=niveau.niveau_id,
        code=f"C-{uid}", libelle="2eme annee", statut="ACTIVE",
    )
    db.add(classe); db.commit(); db.refresh(classe)
    eleve = Eleve(
        etablissement_id=etab.etablissement_id, matricule=f"ELV-AC{uid}", nom="Traoré", prenom="Aïcha",
        sexe="F", date_naissance=date(2015, 5, 5), mot_de_passe=hash_password("x"), statut="ACTIF",
    )
    db.add(eleve); db.commit(); db.refresh(eleve)
    insc = Inscription(
        eleve_id=eleve.eleve_id, classe_id=classe.classe_id, annee_id=annee.annee_id,
        statut="ACTIVE", type_inscription="NOUVELLE",
    )
    db.add(insc); db.commit(); db.refresh(insc)
    db.add(Facture(
        inscription_id=insc.inscription_id, annee_id=annee.annee_id, numero_facture=f"FAC-{uid}",
        montant_total=100000, montant_net=100000, montant_paye=0, montant_restant=100000,
        statut="EN_ATTENTE",
    ))
    db.commit()
    admin = Utilisateur(
        nom="Admin", prenom=f"A{uid}", nom_utilisateur=f"ac.admin.{uid}",
        email=f"ac.admin.{uid}@smartschool.gn", telephone=f"66620{uid:04d}",
        mot_de_passe=hash_password("motdepasse123"), role="ADMIN", statut="ACTIF",
        etablissement_id=etab.etablissement_id,
    )
    db.add(admin); db.commit()
    headers = _headers(client, admin.nom_utilisateur)

    base = f"/api/finance/impayes?annee_id={annee.annee_id}"

    def _trouve(term: str) -> int:
        r = client.get(f"{base}&search={term}", headers=headers)
        assert r.status_code == 200, r.text
        return len(r.json())

    # Sans accent (ce que tape un utilisateur) : DOIT trouver « Traoré ».
    assert _trouve("traore") == 1, "recherche par nom sans accent introuvable"
    # Avec accent, et par prénom accentué aussi.
    assert _trouve("Traoré") == 1
    assert _trouve("aicha") == 1
    # Matricule reste bien cherché.
    assert _trouve(eleve.matricule) == 1
    # Un nom absent ne remonte rien.
    assert _trouve("zzzzz") == 0
