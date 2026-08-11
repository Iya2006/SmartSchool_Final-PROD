"""
Migration — Étape C (synchronisation delta) : prépare Eleve pour la synchro
delta et crée le journal des suppressions (tombstones).

1. Crée ss_sync_tombstones (voir app/models/academique.py:SyncTombstone).
2. Backfille ss_eleves.modified_date pour les lignes existantes (jamais
   assignée jusqu'ici — voir le commentaire sur Eleve.modified_date) :
   sans backfill, un premier appel à GET /api/eleves/delta avec un `since`
   ancien raterait toutes les lignes créées avant ce backfill (NULL n'est
   jamais > since). modified_date = created_date pour ces lignes : c'est
   la meilleure approximation disponible (on ne sait pas quand elles ont
   été réellement modifiées pour la dernière fois, seulement quand créées).

Run with: python backend/migrations/add_sync_tracking.py
"""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from sqlalchemy import text
from app.core.database import engine
from app.models.academique import SyncTombstone


def migrate():
    print("Création de ss_sync_tombstones (si absente)...")
    SyncTombstone.__table__.create(bind=engine, checkfirst=True)
    print("✅ ss_sync_tombstones prête.")

    with engine.connect() as conn:
        result = conn.execute(
            text("UPDATE ss_eleves SET modified_date = created_date WHERE modified_date IS NULL")
        )
        conn.commit()
        print(f"✅ Backfill ss_eleves.modified_date : {result.rowcount} ligne(s) mise(s) à jour.")

    print("🎉 Migration complete!")


if __name__ == "__main__":
    migrate()
