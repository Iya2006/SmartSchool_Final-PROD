#!/usr/bin/env python3
"""
Seeder de DONNÉES SYNTHÉTIQUES pour les tests de charge k6.

- Crée N établissements ISOLÉS (préfixe LOAD-) avec admins, enseignants,
  élèves, parents, classes, matières, évaluations, notes, présences.
- Écrit tests/load/data/accounts.json (comptes + IDs) pour les scripts k6.
- Respecte l'isolation multi-tenant réelle (chaque compte est rattaché à SON
  établissement).

SÉCURITÉ :
- REFUSE de tourner si DATABASE_URL ne pointe pas sur localhost/127.0.0.1,
  sauf --i-understand-this-is-not-prod.
- Toutes les données portent le préfixe LOAD- et sont supprimables (--reset).

Usage (depuis backend/, avec la DATABASE_URL locale) :
    python ../tests/load/scripts/seed_load_data.py --etablissements 5 --i-understand-this-is-not-prod
    python ../tests/load/scripts/seed_load_data.py --reset --i-understand-this-is-not-prod
"""
import argparse
import json
import os
import sys
from datetime import date

# --- Rendre le package backend importable, quel que soit le CWD ------------
_HERE = os.path.dirname(os.path.abspath(__file__))
_BACKEND = os.path.abspath(os.path.join(_HERE, "..", "..", "..", "backend"))
if _BACKEND not in sys.path:
    sys.path.insert(0, _BACKEND)

CODE_PREFIX = "LOAD-"
DATA_OUT = os.path.abspath(os.path.join(_HERE, "..", "data", "accounts.json"))
MDP = "loadtest123"


def _garde_fou_non_prod(force: bool):
    url = os.getenv("DATABASE_URL", "")
    u = url.lower()
    est_local = ("localhost" in u) or ("127.0.0.1" in u) or (url == "")
    suspect = ("supabase" in u) or ("amazonaws" in u) or ("render" in u) or ("pooler" in u)
    if (not est_local or suspect) and not force:
        print("REFUS : DATABASE_URL ne ressemble pas à une base LOCALE de test.")
        print(f"  DATABASE_URL = {url or '(non défini)'}")
        print("  → pointe une base de test locale, ou passe --i-understand-this-is-not-prod.")
        sys.exit(2)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--etablissements", type=int, default=5)
    ap.add_argument("--enseignants", type=int, default=10, help="par école")
    ap.add_argument("--classes", type=int, default=5, help="par école")
    ap.add_argument("--eleves", type=int, default=20, help="par classe")
    ap.add_argument("--reset", action="store_true", help="supprime toutes les données LOAD- puis sort")
    ap.add_argument("--i-understand-this-is-not-prod", dest="force", action="store_true")
    args = ap.parse_args()

    _garde_fou_non_prod(args.force)

    # Imports tardifs (après le garde-fou et le sys.path).
    from app.core.database import SessionLocal
    from app.core.security import hash_password
    from app.models.academique import (
        Affectation, AnneeScolaire, Classe, ClasseMatiere, Cycle, Eleve, EleveParent,
        Enseignant, Etablissement, Evaluation, Inscription, Matiere, Niveau, Note,
        Parent, Presence, Trimestre, TypeEvaluation, Utilisateur,
    )

    modeles = {"Affectation": Affectation, "AnneeScolaire": AnneeScolaire, "Classe": Classe, "ClasseMatiere": ClasseMatiere,
               "Cycle": Cycle, "Eleve": Eleve, "EleveParent": EleveParent, "Enseignant": Enseignant,
               "Etablissement": Etablissement, "Evaluation": Evaluation, "Inscription": Inscription,
               "Matiere": Matiere, "Niveau": Niveau, "Note": Note, "Parent": Parent,
               "Presence": Presence, "Trimestre": Trimestre, "TypeEvaluation": TypeEvaluation,
               "Utilisateur": Utilisateur}

    db = SessionLocal()
    try:
        if args.reset:
            _reset(db, Etablissement)
            print("Données LOAD- supprimées.")
            return

        mdp_hash = hash_password(MDP)
        out = {"etablissements": []}
        seq = _Seq(db, Etablissement)

        for i in range(1, args.etablissements + 1):
            code = f"{CODE_PREFIX}ECOLE-{i}"
            if db.query(Etablissement).filter(Etablissement.code == code).first():
                print(f"  {code} existe déjà — ignoré (utilise --reset pour repartir).")
                continue
            # Réessai avec connexion FRAÎCHE : sur un réseau distant instable, le
            # pooler peut lâcher en plein batch. L'école étant atomique (commit
            # unique), un échec ne laisse rien — on rejoue proprement.
            rec = None
            for tentative in range(1, 5):
                try:
                    rec = _creer_ecole(db, code, i, args, mdp_hash, seq, modeles)
                    break
                except Exception as exc:  # noqa: BLE001 — résilience réseau volontaire
                    try:
                        db.rollback()
                        db.close()
                    except Exception:
                        pass
                    db = SessionLocal()  # pool_pre_ping fournit une connexion vivante
                    print(f"  {code} : tentative {tentative} échouée ({type(exc).__name__}), on réessaie…")
            if rec is None:
                print(f"  {code} : ABANDON après 4 tentatives.")
                continue
            out["etablissements"].append(rec)
            print(f"  {code} : {len(rec['enseignants'])} ens, {len(rec['eleves'])} élèves, {len(rec['classe_ids'])} classes.")

        os.makedirs(os.path.dirname(DATA_OUT), exist_ok=True)
        with open(DATA_OUT, "w", encoding="utf-8") as f:
            json.dump(out, f, ensure_ascii=False, indent=2)
        print(f"\nDataset écrit : {DATA_OUT}")
        print(f"  Écoles créées : {len(out['etablissements'])}")
        print(f"  Mot de passe de tous les comptes : {MDP}")
    finally:
        db.close()


class _Seq:
    """Compteur global unique (téléphones/matricules) à partir du max existant."""
    def __init__(self, db, Etablissement):
        self.n = 100000 + (db.query(Etablissement).count() * 1000)

    def next(self):
        self.n += 1
        return self.n


def _creer_ecole(db, code, idx, args, mdp_hash, seq, M):
    # UNE école = UNE transaction (flush pour obtenir les IDs, un seul commit à
    # la fin). Sur un réseau instable (batch distant), l'école est ainsi
    # atomique et REJOUABLE : un échec ne laisse aucune donnée partielle.
    etab = M["Etablissement"](code=code, nom=f"École de charge {idx}", type_etablissement="COLLEGE")
    db.add(etab); db.flush()
    annee = M["AnneeScolaire"](etablissement_id=etab.etablissement_id, code=f"{code}-AN", libelle="2026-2027",
                               date_debut=date(2026, 9, 1), date_fin=date(2027, 7, 1),
                               statut="EN_COURS", est_courante="O")
    db.add(annee); db.flush()
    trimestre = M["Trimestre"](annee_id=annee.annee_id, code=f"L{idx}T1", libelle="1er Trimestre", numero=1,
                               date_debut=date(2026, 9, 1), date_fin=date(2026, 12, 20), statut="EN_COURS")
    db.add(trimestre); db.flush()
    cycle = M["Cycle"](etablissement_id=etab.etablissement_id, code=f"{code}-CY", libelle="Collège", ordre=2)
    db.add(cycle); db.flush()
    niveau = M["Niveau"](cycle_id=cycle.cycle_id, code=f"{code}-N", libelle="6e", ordre=1)
    db.add(niveau); db.flush()
    type_eval = M["TypeEvaluation"](etablissement_id=etab.etablissement_id, code="COMPO", libelle="Composition",
                                    coefficient=2, statut="ACTIF")
    db.add(type_eval); db.flush()

    admin = M["Utilisateur"](nom="Admin", prenom=f"Ecole{idx}", nom_utilisateur=f"load.admin.{idx}",
                             email=f"load.admin.{idx}@loadtest.local", telephone=f"6{seq.next():09d}"[:12],
                             mot_de_passe=mdp_hash, role="ADMIN", statut="ACTIF",
                             etablissement_id=etab.etablissement_id)
    db.add(admin); db.flush()

    # Enseignants
    enseignants = []
    for e in range(args.enseignants):
        ens = M["Enseignant"](etablissement_id=etab.etablissement_id, matricule=f"{code}-ENS-{e:03d}",
                              nom="Prof", prenom=f"{idx}-{e}", sexe="M", telephone=f"7{seq.next():09d}"[:12],
                              mot_de_passe=mdp_hash, statut="ACTIF")
        db.add(ens); enseignants.append(ens)
    db.flush()

    classe_ids, eleve_ids, eleves_rec, parents_rec = [], [], [], []
    prof_classe = {}  # enseignant_id -> classe_id (affectation réelle)
    matiere = M["Matiere"](cycle_id=cycle.cycle_id, code=f"{code}-MATH", libelle="Mathématiques", note_sur=20)
    db.add(matiere); db.flush()

    for c in range(args.classes):
        classe = M["Classe"](etablissement_id=etab.etablissement_id, annee_id=annee.annee_id,
                             niveau_id=niveau.niveau_id, code=f"{code}-CL-{c}", libelle=f"6e {c+1}", statut="ACTIVE")
        db.add(classe); db.flush()
        classe_ids.append(classe.classe_id)
        db.add(M["ClasseMatiere"](classe_id=classe.classe_id, matiere_id=matiere.matiere_id,
                                  coefficient=2, nb_heures_semaine=4, est_active="O"))

        prof = enseignants[c % len(enseignants)]
        # Affectation réelle prof ↔ classe ↔ matière (sinon les endpoints
        # enseignant qui vérifient l'affectation renvoient 403/404).
        db.add(M["Affectation"](enseignant_id=prof.enseignant_id, matiere_id=matiere.matiere_id,
                                classe_id=classe.classe_id, annee_id=annee.annee_id,
                                nb_heures_semaine=4, est_principal="O", statut="ACTIVE"))
        prof_classe.setdefault(prof.enseignant_id, classe.classe_id)
        # Une évaluation centralisée par classe (pour peupler bulletins/notes).
        ev = M["Evaluation"](matiere_id=matiere.matiere_id, classe_id=classe.classe_id,
                             trimestre_id=trimestre.trimestre_id, type_eval_id=type_eval.type_eval_id,
                             enseignant_id=prof.enseignant_id, libelle="Compo T1", date_evaluation=date(2026, 10, 1),
                             note_sur=20, coefficient=2, statut="CENTRALISEE")
        db.add(ev); db.flush()

        for s in range(args.eleves):
            elv = M["Eleve"](etablissement_id=etab.etablissement_id, matricule=f"{code}-ELV-{c}-{s:03d}",
                            nom="Eleve", prenom=f"{c}-{s}", date_naissance=date(2013, 1, 1), sexe="F",
                            statut="ACTIF", mot_de_passe=mdp_hash)
            db.add(elv); db.flush()
            insc = M["Inscription"](eleve_id=elv.eleve_id, classe_id=classe.classe_id,
                                    annee_id=annee.annee_id, statut="ACTIVE")
            db.add(insc); db.flush()
            db.add(M["Note"](evaluation_id=ev.evaluation_id, inscription_id=insc.inscription_id,
                             valeur=12, est_absent="N"))
            db.add(M["Presence"](inscription_id=insc.inscription_id, date_presence=date(2026, 10, 1),
                                 demi_journee="MATIN", statut_presence="PRESENT", seance_id=None))
            eleve_ids.append(elv.eleve_id)
            eleves_rec.append({"matricule": elv.matricule, "mot_de_passe": MDP,
                               "eleve_id": elv.eleve_id, "classe_id": classe.classe_id})

            parent = M["Parent"](etablissement_id=etab.etablissement_id, nom="Parent", prenom=f"{c}-{s}",
                                 telephone_1=f"62{seq.next():08d}"[:12], mot_de_passe=mdp_hash, statut="ACTIF")
            db.add(parent); db.flush()
            db.add(M["EleveParent"](eleve_id=elv.eleve_id, parent_id=parent.parent_id, lien_parente="MERE"))
            parents_rec.append({"telephone": parent.telephone_1, "mot_de_passe": MDP,
                                "parent_id": parent.parent_id, "enfant_ids": [elv.eleve_id]})

    db.commit()  # UN seul commit : l'école entière ou rien.

    ens_rec = [{"identifiant": e.matricule, "mot_de_passe": MDP, "enseignant_id": e.enseignant_id,
                "classe_id": prof_classe.get(e.enseignant_id)}
               for e in enseignants]

    return {
        "code": code,
        "etablissement_id": etab.etablissement_id,
        "annee_id": annee.annee_id,
        "trimestre_id": trimestre.trimestre_id,
        "admins": [{"identifiant": admin.nom_utilisateur, "mot_de_passe": MDP}],
        "enseignants": ens_rec,
        "enseignant_ids": [e.enseignant_id for e in enseignants],
        "eleves": eleves_rec,
        "eleve_ids": eleve_ids,
        "parents": parents_rec,
        "parent_ids": [p["parent_id"] for p in parents_rec],
        "classe_ids": classe_ids,
    }


def _reset(db, Etablissement):
    """Supprime toutes les écoles LOAD- et TOUTES leurs données dérivées, dans
    l'ordre des clés étrangères (enfants d'abord). Scopé par etablissement_id :
    ne touche QUE les données créées par ce seeder."""
    from sqlalchemy import text
    etabs = db.query(Etablissement).filter(Etablissement.code.like(f"{CODE_PREFIX}%")).all()
    if not etabs:
        print("Aucune donnée LOAD- à supprimer.")
        return
    ids = tuple(e.etablissement_id for e in etabs)
    inlist = "(" + ",".join(str(i) for i in ids) + ")"

    # Sous-ensembles réutilisés.
    classes = f"SELECT classe_id FROM ss_classes WHERE etablissement_id IN {inlist}"
    inscriptions = f"SELECT inscription_id FROM ss_inscriptions WHERE classe_id IN ({classes})"
    evals = f"SELECT evaluation_id FROM ss_evaluations WHERE classe_id IN ({classes})"
    annees = f"SELECT annee_id FROM ss_annees_scolaires WHERE etablissement_id IN {inlist}"
    cycles = f"SELECT cycle_id FROM ss_cycles WHERE etablissement_id IN {inlist}"

    # Ordre : enfants → parents.
    statements = [
        f"DELETE FROM ss_notes WHERE inscription_id IN ({inscriptions})",
        f"DELETE FROM ss_notes WHERE evaluation_id IN ({evals})",
        f"DELETE FROM ss_presences WHERE inscription_id IN ({inscriptions})",
        f"DELETE FROM ss_eleve_parent WHERE eleve_id IN (SELECT eleve_id FROM ss_eleves WHERE etablissement_id IN {inlist})",
        f"DELETE FROM ss_inscriptions WHERE classe_id IN ({classes})",
        f"DELETE FROM ss_affectations WHERE classe_id IN ({classes})",
        f"DELETE FROM ss_evaluations WHERE classe_id IN ({classes})",
        f"DELETE FROM ss_classe_matieres WHERE classe_id IN ({classes})",
        f"DELETE FROM ss_classes WHERE etablissement_id IN {inlist}",
        f"DELETE FROM ss_trimestres WHERE annee_id IN ({annees})",
        f"DELETE FROM ss_matieres WHERE cycle_id IN ({cycles})",
        f"DELETE FROM ss_niveaux WHERE cycle_id IN ({cycles})",
        f"DELETE FROM ss_types_evaluation WHERE etablissement_id IN {inlist}",
        f"DELETE FROM ss_annees_scolaires WHERE etablissement_id IN {inlist}",
        f"DELETE FROM ss_cycles WHERE etablissement_id IN {inlist}",
        f"DELETE FROM ss_eleves WHERE etablissement_id IN {inlist}",
        f"DELETE FROM ss_parents WHERE etablissement_id IN {inlist}",
        f"DELETE FROM ss_enseignants WHERE etablissement_id IN {inlist}",
        f"DELETE FROM ss_utilisateurs WHERE etablissement_id IN {inlist}",
        f"DELETE FROM ss_etablissements WHERE etablissement_id IN {inlist}",
    ]
    for sql in statements:
        try:
            db.execute(text(sql))
        except Exception as exc:
            db.rollback()
            print(f"Échec sur : {sql}\n  {exc}")
            raise
    db.commit()
    print(f"Supprimé : {len(etabs)} école(s) LOAD- et leurs données.")


if __name__ == "__main__":
    main()
