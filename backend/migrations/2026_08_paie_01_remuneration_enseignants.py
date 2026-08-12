"""
Migration — rémunération des enseignants : au mois ou à l'heure.

LE PROBLÈME
-----------
Un enseignant portait UN SEUL `taux_horaire`, le même partout. Impossible donc
d'exprimer ce qui est la règle sur le terrain :

    Une heure de Terminale ne se paie pas comme une heure de 7ᵉ.

Et rien ne distinguait un instituteur du primaire — payé au mois, comme un
salarié — d'un vacataire du collège ou du lycée, payé à l'heure.

CE QU'ELLE FAIT
---------------
1. `ss_enseignants.mode_remuneration` — MENSUEL ou HORAIRE.
   Le primaire est au MENSUEL (salaire fixe), le collège et le lycée à
   l'HORAIRE. La valeur est portée par l'enseignant et non déduite de ses
   classes : un instituteur peut assurer une heure au collège sans changer de
   contrat pour autant.

2. `ss_affectations.taux_horaire` — EXCEPTION, nullable.
   Le taux de l'enseignant s'applique partout ; cette colonne ne se renseigne
   que là où il diffère (la Terminale, une spécialité). Même schéma que
   `coefficient_override` sur les évaluations : ne rien saisir là où rien ne
   varie.

Les heures, elles, existaient déjà : `ss_affectations.nb_heures_semaine`.

RATTACHEMENT
------------
Aucune valeur inventée. `mode_remuneration` est posé par DÉFAUT à HORAIRE — la
colonne `taux_horaire` existante étant celle qui était déjà remplie — puis
basculé à MENSUEL pour les enseignants qui n'ont QUE des classes du primaire,
ce qui se lit dans leurs affectations réelles. Un enseignant sans affectation
n'est pas devinable : il reste au défaut, et l'école tranchera sur sa fiche.

Idempotente.

Run with: python backend/migrations/2026_08_paie_01_remuneration_enseignants.py
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from sqlalchemy import text

from app.core.database import engine


def _colonne_existe(conn, table: str, colonne: str) -> bool:
    return conn.execute(text(
        "SELECT 1 FROM information_schema.columns WHERE table_name=:t AND column_name=:c"
    ), {"t": table, "c": colonne}).first() is not None


def migrate() -> int:
    with engine.begin() as conn:
        conn.execute(text(
            "ALTER TABLE ss_enseignants ADD COLUMN IF NOT EXISTS "
            "mode_remuneration VARCHAR(20) DEFAULT 'HORAIRE'"
        ))
        conn.execute(text(
            "UPDATE ss_enseignants SET mode_remuneration = 'HORAIRE' "
            "WHERE mode_remuneration IS NULL"
        ))
        conn.execute(text(
            "ALTER TABLE ss_enseignants ALTER COLUMN mode_remuneration SET NOT NULL"
        ))
    print("[OK] ss_enseignants.mode_remuneration present (defaut HORAIRE)")

    with engine.begin() as conn:
        conn.execute(text(
            "ALTER TABLE ss_affectations ADD COLUMN IF NOT EXISTS "
            "taux_horaire NUMERIC(10,2)"
        ))
    print("[OK] ss_affectations.taux_horaire present (exception, nullable)")

    # ── Le primaire passe au mensuel, d'apres ses affectations reelles ────
    # Ce n'est pas une supposition : on ne bascule que les enseignants dont
    # TOUTES les classes relevent d'un cycle primaire.
    with engine.connect() as conn:
        candidats = conn.execute(text("""
            SELECT e.enseignant_id, e.nom, e.prenom
            FROM ss_enseignants e
            WHERE e.mode_remuneration = 'HORAIRE'
              AND EXISTS (SELECT 1 FROM ss_affectations a WHERE a.enseignant_id = e.enseignant_id)
              AND NOT EXISTS (
                  SELECT 1 FROM ss_affectations a
                  JOIN ss_classes cl ON cl.classe_id = a.classe_id
                  JOIN ss_niveaux n  ON n.niveau_id  = cl.niveau_id
                  JOIN ss_cycles c   ON c.cycle_id   = n.cycle_id
                  WHERE a.enseignant_id = e.enseignant_id
                    AND upper(coalesce(c.code, '')) NOT IN ('PRM', 'PRIMAIRE')
              )
        """)).all()

    if candidats:
        with engine.begin() as conn:
            conn.execute(text(
                "UPDATE ss_enseignants SET mode_remuneration = 'MENSUEL' "
                "WHERE enseignant_id = ANY(:ids)"
            ), {"ids": [r[0] for r in candidats]})
        print(f"[OK] {len(candidats)} enseignant(s) du primaire passe(s) au MENSUEL :")
        for r in candidats[:10]:
            print(f"     #{r[0]:<4} {r[2]} {r[1]}")
    else:
        print("[=]  aucun enseignant exclusivement primaire a basculer")

    with engine.connect() as conn:
        sans_affectation = conn.execute(text("""
            SELECT count(*) FROM ss_enseignants e
            WHERE NOT EXISTS (SELECT 1 FROM ss_affectations a WHERE a.enseignant_id = e.enseignant_id)
        """)).scalar()
    if sans_affectation:
        print(f"[INFO] {sans_affectation} enseignant(s) sans affectation : mode non")
        print("       devinable, laisse a HORAIRE. A trancher sur leur fiche.")

    print("\n[DONE] Remuneration : mensuelle au primaire, horaire au-dela.")
    return 0


if __name__ == "__main__":
    sys.exit(migrate())
