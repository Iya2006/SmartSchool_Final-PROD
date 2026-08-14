"""
Tests — Lot 10 (chantier multi-écoles) : isolation de la configuration
(`parametrage.py`, `securite.py`).

Points les plus graves couverts ici : n'importe quel compte authentifié
pouvait réécrire l'identité et les paramètres (notation, finance) de
n'importe quelle école, lire et falsifier son journal d'audit, et la route
publique `/settings` rendait tout cela sans même un token.
"""
from datetime import date

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.models.academique import (
    AnneeScolaire, AuditLog, Cycle, Etablissement, Matiere, ParametreEtablissement,
    Role, Salle, Trimestre, Utilisateur,
)

_COUNTER = 0


def _uid() -> int:
    global _COUNTER
    _COUNTER += 1
    return _COUNTER


class Ecole:
    def __init__(self, db: Session, suffix: str, role: str = "ADMIN"):
        uid = _uid()
        self.etab = Etablissement(
            code=f"L10-{suffix}-{uid}", nom=f"École {suffix} {uid}", type_etablissement="LYCEE",
            adresse="Conakry",
        )
        db.add(self.etab); db.commit(); db.refresh(self.etab)

        self.annee = AnneeScolaire(
            etablissement_id=self.etab.etablissement_id, code=f"AN{uid}", libelle=f"2025-2026 {uid}",
            date_debut=date(2025, 9, 1), date_fin=date(2026, 7, 1), statut="EN_COURS", est_courante="O",
        )
        db.add(self.annee); db.commit(); db.refresh(self.annee)

        self.trimestre = Trimestre(
            annee_id=self.annee.annee_id, code=f"T1-{uid}", libelle="Trimestre 1", numero=1,
            date_debut=date(2025, 9, 1), date_fin=date(2025, 12, 15), statut="EN_COURS",
        )
        db.add(self.trimestre); db.commit(); db.refresh(self.trimestre)

        self.cycle = Cycle(etablissement_id=self.etab.etablissement_id, code=f"CY{uid}", libelle="Collège", ordre=1)
        db.add(self.cycle); db.commit(); db.refresh(self.cycle)

        self.matiere = Matiere(
            cycle_id=self.cycle.cycle_id, code=f"MAT{uid}", libelle="Maths",
            note_sur=20, coefficient_defaut=3,
        )
        db.add(self.matiere); db.commit(); db.refresh(self.matiere)

        self.salle = Salle(etablissement_id=self.etab.etablissement_id, code=f"S{uid}", nom="Salle 1")
        db.add(self.salle); db.commit(); db.refresh(self.salle)

        self.role = Role(
            etablissement_id=self.etab.etablissement_id, code=f"ROLE{uid}",
            libelle="Rôle test", est_systeme="N",
        )
        db.add(self.role); db.commit(); db.refresh(self.role)

        self.admin = Utilisateur(
            nom="Admin", prenom=f"L10{uid}", nom_utilisateur=f"l10.admin.{uid}",
            email=f"l10.admin.{uid}@smartschool.gn", telephone=f"61100{uid:04d}",
            mot_de_passe=hash_password("motdepasse123"), role=role, statut="ACTIF",
            etablissement_id=self.etab.etablissement_id,
        )
        db.add(self.admin); db.commit(); db.refresh(self.admin)

    def parametre(self, db: Session, categorie: str, cle: str, valeur: str) -> ParametreEtablissement:
        p = ParametreEtablissement(
            etablissement_id=self.etab.etablissement_id, categorie=categorie,
            cle=cle, valeur=valeur, type_valeur="TEXT",
        )
        db.add(p); db.commit(); db.refresh(p)
        return p

    def audit(self, db: Session) -> AuditLog:
        a = AuditLog(
            etablissement_id=self.etab.etablissement_id, nom_utilisateur="Système",
            module="finance", action="LECTURE", details="secret",
        )
        db.add(a); db.commit(); db.refresh(a)
        return a


def _headers(client: TestClient, identifiant: str) -> dict:
    resp = client.post("/api/auth/login", json={"identifiant": identifiant, "mot_de_passe": "motdepasse123"})
    assert resp.status_code == 200, f"Login échoué: {resp.text}"
    return {"Authorization": f"Bearer {resp.json()['token']}"}


# ══════════════════════════════════════════════════════════════
# ÉTABLISSEMENT — identité, logo, cachet, signature
# ══════════════════════════════════════════════════════════════

class TestEtablissementIsolation:
    def test_modifier_etablissement_dautrui_refuse(self, client: TestClient, db: Session):
        a, b = Ecole(db, "EMA"), Ecole(db, "EMB")
        nom_avant = b.etab.nom
        headers = _headers(client, a.admin.nom_utilisateur)

        resp = client.put(
            f"/api/parametrage/etablissements/{b.etab.etablissement_id}",
            json={"nom": "École piratée"}, headers=headers,
        )
        assert resp.status_code == 404
        db.refresh(b.etab)
        assert b.etab.nom == nom_avant

    def test_modifier_son_propre_etablissement_fonctionne(self, client: TestClient, db: Session):
        a = Ecole(db, "EMOK")
        headers = _headers(client, a.admin.nom_utilisateur)

        resp = client.put(
            f"/api/parametrage/etablissements/{a.etab.etablissement_id}",
            json={"nom": "Nouveau nom"}, headers=headers,
        )
        assert resp.status_code == 200, resp.text
        db.refresh(a.etab)
        assert a.etab.nom == "Nouveau nom"

    def test_lister_toutes_les_ecoles_refuse_a_un_admin_detablissement(self, client: TestClient, db: Session):
        a = Ecole(db, "ELS")
        headers = _headers(client, a.admin.nom_utilisateur)

        resp = client.get("/api/parametrage/etablissements", headers=headers)
        assert resp.status_code == 403

    def test_creer_une_ecole_refuse_a_un_admin_detablissement(self, client: TestClient, db: Session):
        a = Ecole(db, "ECR")
        headers = _headers(client, a.admin.nom_utilisateur)

        resp = client.post(
            "/api/parametrage/etablissements",
            json={"code": f"PIRATE{_uid()}", "nom": "École pirate", "type_etablissement": "LYCEE"},
            headers=headers,
        )
        assert resp.status_code == 403

    def test_upload_fichier_etablissement_dautrui_refuse(self, client: TestClient, db: Session):
        a, b = Ecole(db, "EUA"), Ecole(db, "EUB")
        headers = _headers(client, a.admin.nom_utilisateur)

        resp = client.post(
            f"/api/parametrage/etablissements/{b.etab.etablissement_id}/upload/logo",
            files={"fichier": ("logo.png", b"fake-png-bytes", "image/png")},
            headers=headers,
        )
        assert resp.status_code == 404


# ══════════════════════════════════════════════════════════════
# PARAMÈTRES (SETTINGS)
# ══════════════════════════════════════════════════════════════

class TestSettingsIsolation:
    def test_lecture_authentifiee_ne_rend_que_son_etablissement(self, client: TestClient, db: Session):
        a, b = Ecole(db, "SLA"), Ecole(db, "SLB")
        a.parametre(db, "NOTATION", f"notation.a.{_uid()}", "12")
        p_b = b.parametre(db, "NOTATION", f"notation.b.{_uid()}", "99")
        headers = _headers(client, a.admin.nom_utilisateur)

        # Même en demandant explicitement l'école B, on ne reçoit que la sienne.
        resp = client.get(
            f"/api/parametrage/settings?etablissement_id={b.etab.etablissement_id}", headers=headers,
        )
        assert resp.status_code == 200
        etabs = {p["etablissement_id"] for p in resp.json()}
        assert etabs == {a.etab.etablissement_id}
        assert all(p["cle"] != p_b.cle for p in resp.json())

    def test_ecriture_ne_touche_que_son_etablissement(self, client: TestClient, db: Session):
        a, b = Ecole(db, "SEA"), Ecole(db, "SEB")
        cle = f"notation.seuil.{_uid()}"
        p_b = b.parametre(db, "NOTATION", cle, "10")
        headers = _headers(client, a.admin.nom_utilisateur)

        resp = client.put(
            f"/api/parametrage/settings?etablissement_id={b.etab.etablissement_id}",
            json=[{"etablissement_id": b.etab.etablissement_id, "categorie": "NOTATION",
                   "cle": cle, "valeur": "20", "type_valeur": "TEXT"}],
            headers=headers,
        )
        assert resp.status_code == 200, resp.text

        # Le paramètre de B est intact...
        db.refresh(p_b)
        assert p_b.valeur == "10"
        # ...et un nouveau a été créé chez A.
        chez_a = db.query(ParametreEtablissement).filter(
            ParametreEtablissement.etablissement_id == a.etab.etablissement_id,
            ParametreEtablissement.cle == cle,
        ).first()
        assert chez_a is not None and chez_a.valeur == "20"

    def test_anonyme_ne_voit_que_les_categories_daffichage(self, client: TestClient, db: Session):
        a = Ecole(db, "SAN")
        a.parametre(db, "THEME", f"theme.primary.{_uid()}", "#123456")
        secret = a.parametre(db, "FINANCE", f"finance.taux.{_uid()}", "42")

        resp = client.get(f"/api/parametrage/settings?etablissement_id={a.etab.etablissement_id}")
        assert resp.status_code == 200
        cles = {p["cle"] for p in resp.json()}
        assert any(c.startswith("theme.") for c in cles)
        assert secret.cle not in cles

    def test_anonyme_demandant_une_categorie_sensible_refuse(self, client: TestClient, db: Session):
        a = Ecole(db, "SAS")
        a.parametre(db, "FINANCE", f"finance.x.{_uid()}", "1")

        resp = client.get(
            f"/api/parametrage/settings?etablissement_id={a.etab.etablissement_id}&categorie=FINANCE"
        )
        assert resp.status_code == 401

    def test_anonyme_sans_etablissement_refuse(self, client: TestClient, db: Session):
        """Ne jamais retomber sur l'établissement 1 (ancien défaut)."""
        resp = client.get("/api/parametrage/settings")
        assert resp.status_code == 400


# ══════════════════════════════════════════════════════════════
# ANNÉES / TRIMESTRES / CYCLES / SALLES
# ══════════════════════════════════════════════════════════════

class TestCalendrierIsolation:
    def test_liste_annees_isolee(self, client: TestClient, db: Session):
        a, b = Ecole(db, "CAA"), Ecole(db, "CAB")
        headers = _headers(client, a.admin.nom_utilisateur)

        resp = client.get("/api/parametrage/annees", headers=headers)
        assert resp.status_code == 200
        ids = {x["annee_id"] for x in resp.json()}
        assert a.annee.annee_id in ids and b.annee.annee_id not in ids

    def test_activer_annee_dautrui_refuse(self, client: TestClient, db: Session):
        a, b = Ecole(db, "CTA"), Ecole(db, "CTB")
        headers = _headers(client, a.admin.nom_utilisateur)

        resp = client.put(f"/api/parametrage/annees/{b.annee.annee_id}/activer", headers=headers)
        assert resp.status_code == 404

    def test_creer_annee_rattachee_a_la_bonne_ecole(self, client: TestClient, db: Session):
        a, b = Ecole(db, "CCA"), Ecole(db, "CCB")
        headers = _headers(client, a.admin.nom_utilisateur)

        resp = client.post(
            "/api/parametrage/annees",
            json={"etablissement_id": b.etab.etablissement_id, "code": f"X{_uid()}",
                  "libelle": "2026-2027", "date_debut": "2026-09-01", "date_fin": "2027-07-01"},
            headers=headers,
        )
        assert resp.status_code == 201, resp.text
        creee = db.query(AnneeScolaire).filter(
            AnneeScolaire.annee_id == resp.json()["annee_id"]
        ).first()
        assert creee.etablissement_id == a.etab.etablissement_id

    def test_lire_trimestres_dune_annee_dautrui_refuse(self, client: TestClient, db: Session):
        a, b = Ecole(db, "CLA"), Ecole(db, "CLB")
        headers = _headers(client, a.admin.nom_utilisateur)

        resp = client.get(f"/api/parametrage/trimestres?annee_id={b.annee.annee_id}", headers=headers)
        assert resp.status_code == 404

    def test_cloturer_trimestre_dautrui_refuse(self, client: TestClient, db: Session):
        a, b = Ecole(db, "CCLA"), Ecole(db, "CCLB")
        headers = _headers(client, a.admin.nom_utilisateur)

        resp = client.put(
            f"/api/parametrage/trimestres/{b.trimestre.trimestre_id}/cloturer", headers=headers,
        )
        assert resp.status_code == 404
        db.refresh(b.trimestre)
        assert b.trimestre.statut == "EN_COURS"

    def test_supprimer_trimestre_dautrui_refuse(self, client: TestClient, db: Session):
        a, b = Ecole(db, "CSA"), Ecole(db, "CSB")
        headers = _headers(client, a.admin.nom_utilisateur)

        resp = client.delete(f"/api/parametrage/trimestres/{b.trimestre.trimestre_id}", headers=headers)
        assert resp.status_code == 404
        assert db.query(Trimestre).filter(
            Trimestre.trimestre_id == b.trimestre.trimestre_id
        ).first() is not None

    def test_cycles_et_salles_isoles(self, client: TestClient, db: Session):
        a, b = Ecole(db, "CYA"), Ecole(db, "CYB")
        headers = _headers(client, a.admin.nom_utilisateur)

        cycles = client.get("/api/parametrage/cycles", headers=headers)
        assert cycles.status_code == 200
        assert {c["cycle_id"] for c in cycles.json()} == {a.cycle.cycle_id}

        salles = client.get("/api/parametrage/salles", headers=headers)
        assert salles.status_code == 200
        assert {s["salle_id"] for s in salles.json()} == {a.salle.salle_id}


# ══════════════════════════════════════════════════════════════
# MATIÈRES — porte dérobée doublonnant /api/matieres (Lot 9-A)
# ══════════════════════════════════════════════════════════════

class TestMatieresParametrageIsolation:
    def test_liste_isolee(self, client: TestClient, db: Session):
        a, b = Ecole(db, "MLA"), Ecole(db, "MLB")
        headers = _headers(client, a.admin.nom_utilisateur)

        resp = client.get("/api/parametrage/matieres", headers=headers)
        assert resp.status_code == 200
        ids = {m["matiere_id"] for m in resp.json()}
        assert a.matiere.matiere_id in ids and b.matiere.matiere_id not in ids

    def test_modifier_matiere_dautrui_refuse(self, client: TestClient, db: Session):
        a, b = Ecole(db, "MMA"), Ecole(db, "MMB")
        headers = _headers(client, a.admin.nom_utilisateur)

        resp = client.put(
            f"/api/parametrage/matieres/{b.matiere.matiere_id}",
            json={"coefficient_defaut": 9}, headers=headers,
        )
        assert resp.status_code == 404
        db.refresh(b.matiere)
        assert float(b.matiere.coefficient_defaut) == 3.0

    def test_batch_refuse_des_quune_matiere_est_etrangere(self, client: TestClient, db: Session):
        a, b = Ecole(db, "MBA"), Ecole(db, "MBB")
        headers = _headers(client, a.admin.nom_utilisateur)

        resp = client.put(
            "/api/parametrage/matieres-batch",
            json=[
                {"matiere_id": a.matiere.matiere_id, "coefficient_defaut": 7},
                {"matiere_id": b.matiere.matiere_id, "coefficient_defaut": 7},
            ],
            headers=headers,
        )
        assert resp.status_code == 404
        db.refresh(b.matiere)
        assert float(b.matiere.coefficient_defaut) == 3.0

    def test_creer_matiere_dans_un_cycle_dautrui_refuse(self, client: TestClient, db: Session):
        a, b = Ecole(db, "MCA"), Ecole(db, "MCB")
        headers = _headers(client, a.admin.nom_utilisateur)

        resp = client.post(
            "/api/parametrage/matieres",
            json={"cycle_id": b.cycle.cycle_id, "code": f"PIR{_uid()}", "libelle": "Pirate"},
            headers=headers,
        )
        assert resp.status_code == 404

    def test_auto_generation_cree_ses_propres_cycles(self, client: TestClient, db: Session):
        """Les cycles étaient cherchés par code sans filtre d'école et créés
        avec `etablissement_id=1` en dur : la 2e école rattachait ses matières
        aux cycles de la 1re."""
        a, b = Ecole(db, "MGA"), Ecole(db, "MGB")

        assert client.post(
            "/api/parametrage/matieres/auto-generation",
            headers=_headers(client, a.admin.nom_utilisateur),
        ).status_code == 201
        assert client.post(
            "/api/parametrage/matieres/auto-generation",
            headers=_headers(client, b.admin.nom_utilisateur),
        ).status_code == 201

        for ecole in (a, b):
            codes = {
                c.code for c in db.query(Cycle).filter(
                    Cycle.etablissement_id == ecole.etab.etablissement_id
                ).all()
            }
            assert {"PRM", "CLG", "LYC"} <= codes, f"cycles manquants pour {ecole.etab.code}"

        # Chaque école a bien ses propres matières, jamais celles de l'autre.
        for ecole in (a, b):
            n = (
                db.query(Matiere)
                .join(Cycle, Cycle.cycle_id == Matiere.cycle_id)
                .filter(Cycle.etablissement_id == ecole.etab.etablissement_id)
                .count()
            )
            assert n > 10, f"{ecole.etab.code} n'a que {n} matières"


# ══════════════════════════════════════════════════════════════
# SÉCURITÉ — rôles, permissions, journal d'audit
# ══════════════════════════════════════════════════════════════

class TestSecuriteIsolation:
    def test_liste_roles_isolee(self, client: TestClient, db: Session):
        a, b = Ecole(db, "RLA"), Ecole(db, "RLB")
        headers = _headers(client, a.admin.nom_utilisateur)

        resp = client.get("/api/securite/roles", headers=headers)
        assert resp.status_code == 200
        ids = {r["role_id"] for r in resp.json()}
        assert a.role.role_id in ids and b.role.role_id not in ids

    def test_supprimer_role_dautrui_refuse(self, client: TestClient, db: Session):
        a, b = Ecole(db, "RSA"), Ecole(db, "RSB")
        headers = _headers(client, a.admin.nom_utilisateur)

        resp = client.delete(f"/api/securite/roles/{b.role.role_id}", headers=headers)
        assert resp.status_code == 404
        assert db.query(Role).filter(Role.role_id == b.role.role_id).first() is not None

    def test_modifier_permissions_dun_role_dautrui_refuse(self, client: TestClient, db: Session):
        a, b = Ecole(db, "RPA"), Ecole(db, "RPB")
        headers = _headers(client, a.admin.nom_utilisateur)

        resp = client.put(
            f"/api/securite/roles/{b.role.role_id}/permissions",
            json={"permissions": [{"module": "finance", "action": "ecriture", "est_autorise": "O"}]},
            headers=headers,
        )
        assert resp.status_code == 404

    def test_creer_role_rattache_a_la_bonne_ecole(self, client: TestClient, db: Session):
        a, b = Ecole(db, "RCA"), Ecole(db, "RCB")
        headers = _headers(client, a.admin.nom_utilisateur)

        resp = client.post(
            "/api/securite/roles",
            # `role_base` est devenu obligatoire depuis : un rôle qui ne
            # reprend l'espace d'aucun rôle standard n'ouvre aucun écran, et
            # l'écran fabriquait des rôles décoratifs. Ce test-ci ne porte pas
            # sur cette règle, mais sur l'école à laquelle le rôle se rattache.
            json={"etablissement_id": b.etab.etablissement_id, "code": f"NEW{_uid()}",
                  "libelle": "Nouveau rôle", "role_base": "SURVEILLANT"},
            headers=headers,
        )
        assert resp.status_code == 201, resp.text
        cree = db.query(Role).filter(Role.role_id == resp.json()["role_id"]).first()
        assert cree.etablissement_id == a.etab.etablissement_id

    def test_journal_audit_isole(self, client: TestClient, db: Session):
        a, b = Ecole(db, "AJA"), Ecole(db, "AJB")
        b.audit(db)
        headers = _headers(client, a.admin.nom_utilisateur)

        resp = client.get("/api/securite/audit-log", headers=headers)
        assert resp.status_code == 200
        assert resp.json()["total"] == 0

    def test_ecriture_audit_ne_peut_pas_viser_une_autre_ecole(self, client: TestClient, db: Session):
        a, b = Ecole(db, "AEA"), Ecole(db, "AEB")
        headers = _headers(client, a.admin.nom_utilisateur)

        resp = client.post(
            "/api/securite/audit-log",
            json={"etablissement_id": b.etab.etablissement_id, "module": "finance",
                  "action": "FAUX", "details": "entrée forgée"},
            headers=headers,
        )
        assert resp.status_code == 201, resp.text

        # Rien n'a été écrit chez B ; tout est allé chez A.
        assert db.query(AuditLog).filter(
            AuditLog.etablissement_id == b.etab.etablissement_id
        ).count() == 0
        assert db.query(AuditLog).filter(
            AuditLog.etablissement_id == a.etab.etablissement_id,
            AuditLog.action == "FAUX",
        ).count() == 1


class TestSuperAdminPlateformeRefuse:
    def test_routes_tenant_refusees_a_un_super_admin_sans_etablissement(self, client: TestClient, db: Session):
        uid = _uid()
        admin = Utilisateur(
            nom="Super", prenom="Admin", nom_utilisateur=f"l10.super.{uid}",
            email=f"l10.super.{uid}@smartschool.gn", telephone=f"61200{uid:04d}",
            mot_de_passe=hash_password("motdepasse123"), role="SUPER_ADMIN", statut="ACTIF",
            etablissement_id=None,
        )
        db.add(admin); db.commit()
        headers = _headers(client, admin.nom_utilisateur)

        assert client.get("/api/parametrage/annees", headers=headers).status_code == 403
        assert client.get("/api/securite/roles", headers=headers).status_code == 403
        assert client.get("/api/securite/audit-log", headers=headers).status_code == 403
        # ...mais les opérations plateforme lui restent ouvertes.
        assert client.get("/api/parametrage/etablissements", headers=headers).status_code == 200
