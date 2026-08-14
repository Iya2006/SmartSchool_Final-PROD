"""
Migration — IYA0 : introduit la table ss_seances et la colonne seance_id
(nullable) sur ss_presences.

Contexte
--------
`Presence` (ss_presences) ne portait jusqu'ici que inscription_id +
date_presence + demi_journee (MATIN/APRES_MIDI) + statut_presence — aucune
matière, aucun enseignant, aucune séance. Un enseignant qui enseigne
plusieurs matières à la même classe ne pouvait enregistrer qu'un seul appel
par demi-journée : le second écrasait silencieusement le premier. `Seance`
(classe + matière + enseignant + date + créneau) devient l'ancre de l'appel
pédagogique, distincte de PresenceAgent (pointage physique, inchangé).

Sécurité
--------
- ss_seances est une TABLE NEUVE (CREATE TABLE IF NOT EXISTS) : aucune
  décision de rattachement à prendre, aucun risque.
- ss_presences.seance_id est ajoutée NULLABLE et n'est JAMAIS backfillée :
  les lignes historiques n'ont aucune attribution matière/enseignant fiable
  — les deviner reviendrait à inventer une donnée (interdit par le cahier
  des charges de ce chantier).
- Idempotente : CREATE TABLE IF NOT EXISTS / ADD COLUMN IF NOT EXISTS /
  CREATE INDEX IF NOT EXISTS.

Usage :
    cd backend && python migrations/iya0_seances.py
"""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from sqlalchemy import text
from app.core.database import engine


def migrate():
    with engine.connect() as conn:
        nb_presences = conn.execute(text("SELECT count(*) FROM ss_presences")).scalar()
    print(f"État réel avant migration : ss_presences = {nb_presences} ligne(s) (ne seront PAS modifiées)")

    with engine.begin() as conn:
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS ss_seances (
                seance_id SERIAL PRIMARY KEY,
                creneau_id INTEGER REFERENCES ss_creneaux_emploi(creneau_id),
                classe_id INTEGER NOT NULL REFERENCES ss_classes(classe_id),
                matiere_id INTEGER NOT NULL REFERENCES ss_matieres(matiere_id),
                annee_id INTEGER NOT NULL REFERENCES ss_annees_scolaires(annee_id),
                enseignant_prevu_id INTEGER NOT NULL REFERENCES ss_enseignants(enseignant_id),
                enseignant_reel_id INTEGER REFERENCES ss_enseignants(enseignant_id),
                date_seance DATE NOT NULL,
                heure_debut_prevue VARCHAR(5) NOT NULL,
                heure_fin_prevue VARCHAR(5) NOT NULL,
                heure_debut_reelle TIMESTAMP,
                heure_fin_reelle TIMESTAMP,
                salle VARCHAR(50),
                statut VARCHAR(20) NOT NULL DEFAULT 'PREVUE',
                motif_statut VARCHAR(300),
                appel_fait VARCHAR(1) NOT NULL DEFAULT 'N',
                appel_fait_le TIMESTAMP,
                nb_presents INTEGER,
                nb_absents INTEGER,
                nb_retards INTEGER,
                created_date TIMESTAMP DEFAULT now(),
                updated_at TIMESTAMP DEFAULT now(),
                updated_by VARCHAR(100),
                CONSTRAINT uq_seance_creneau_date UNIQUE (creneau_id, date_seance)
            )
        """))
        print("[OK] ss_seances prête (créée si absente).")

        conn.execute(text(
            "ALTER TABLE ss_presences ADD COLUMN IF NOT EXISTS seance_id INTEGER "
            "REFERENCES ss_seances(seance_id)"
        ))
        print("[OK] ss_presences.seance_id ajoutée (NULL sur les lignes existantes).")

        # Défense en profondeur seulement (Postgres) — la vraie garantie
        # anti-doublon est l'upsert applicatif (seance_id, inscription_id)
        # dans POST /seances/{id}/appel. Index PARTIEL : n'affecte jamais
        # les lignes legacy (seance_id NULL), rien à trancher ici.
        conn.execute(text("""
            CREATE UNIQUE INDEX IF NOT EXISTS ux_presences_seance_inscription
            ON ss_presences (seance_id, inscription_id) WHERE seance_id IS NOT NULL
        """))
        print("[OK] Index unique ux_presences_seance_inscription prêt.")

    print("\n[DONE] Migration IYA0 (séances) terminée.")


if __name__ == "__main__":
    migrate()
