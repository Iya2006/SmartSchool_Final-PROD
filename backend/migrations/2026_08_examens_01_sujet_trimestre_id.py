"""
Migration: Centre des Examens — rattachement des sujets aux vraies périodes

`ss_sujets_examen.trimestre` est un simple entier 1/2/3, sans lien avec les
périodes réellement configurées par l'établissement. Le reste du système gère
désormais de 1 à 12 périodes nommées librement (« 1er Semestre », « 2ème
Trimestre »…) : ce module était le dernier à imposer trois trimestres.

Conséquences concrètes du défaut : une école à deux semestres se voyait
proposer un « T3 » qui ne correspond à rien, et aucun écran n'affichait jamais
le nom réel de la période.

Ajout **additif** d'une colonne `trimestre_id` référençant `ss_trimestres` :
  - colonne nullable, l'ancienne `trimestre` est conservée et reste alimentée
    (numéro de la période) pour ne casser aucun client existant ;
  - backfill des lignes existantes en rapprochant `trimestre` du `numero` de
    la période de l'année courante.

Run with: python backend/migrations/2026_08_examens_01_sujet_trimestre_id.py
"""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from app.core.database import engine
from sqlalchemy import text


def run(conn, sql, ok_msg):
    """Exécute une instruction dans sa propre transaction.

    Sans ça, Postgres avorte la transaction entière au premier « colonne déjà
    existante » et le script cesse d'être rejouable.
    """
    try:
        conn.execute(text(sql))
        conn.commit()
        print(ok_msg)
    except Exception as e:
        conn.rollback()
        msg = str(e).lower()
        if "duplicate column" in msg or "already exists" in msg:
            print(f"SKIP (déjà appliqué) : {ok_msg}")
        else:
            print(f"ERREUR sur [{sql[:60]}...] : {e}")


def migrate():
    with engine.connect() as conn:
        run(conn, """
            ALTER TABLE ss_sujets_examen
            ADD COLUMN trimestre_id INTEGER NULL
            REFERENCES ss_trimestres(trimestre_id)
        """, "OK : ss_sujets_examen.trimestre_id ajoutée")

        run(conn, """
            CREATE INDEX IF NOT EXISTS idx_sujets_examen_trimestre_id
            ON ss_sujets_examen(trimestre_id)
        """, "OK : index sur trimestre_id")

        # Backfill : on rapproche l'ancien numéro de la période correspondante
        # de l'année courante. Les lignes qu'on ne sait pas rattacher restent
        # à NULL — jamais rattachées au hasard.
        run(conn, """
            UPDATE ss_sujets_examen s
            SET trimestre_id = (
                SELECT t.trimestre_id FROM ss_trimestres t
                JOIN ss_annees_scolaires a ON a.annee_id = t.annee_id
                WHERE t.numero = s.trimestre AND a.est_courante = 'O'
                LIMIT 1
            )
            WHERE s.trimestre_id IS NULL AND s.trimestre IS NOT NULL
        """, "OK : sujets existants rattachés à leur période")

        # La colonne historique devient facultative : un sujet créé par le
        # nouveau code renseigne `trimestre_id`, et `trimestre` n'est plus
        # qu'un miroir du numéro de période.
        run(conn, """
            ALTER TABLE ss_sujets_examen ALTER COLUMN trimestre DROP NOT NULL
        """, "OK : ss_sujets_examen.trimestre rendue facultative")

        restants = conn.execute(text(
            "SELECT COUNT(*) FROM ss_sujets_examen WHERE trimestre_id IS NULL"
        )).scalar()
        total = conn.execute(text("SELECT COUNT(*) FROM ss_sujets_examen")).scalar()
        print(f"\n{total} sujet(s) en base, dont {restants} sans période rattachée.")


if __name__ == "__main__":
    print("=== Migration Examens 01 : sujets rattachés aux vraies périodes ===")
    migrate()
    print("=== Terminé ===")
