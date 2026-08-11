"""
MIGRATION — Lot 12 (chantier multi-écoles)
Table `ss_sequences_matricule` : compteur de matricules par établissement.

Contexte
--------
Les matricules étaient calculés par `COUNT(*) + 1` sur toute la table, sans
filtre d'établissement. Conséquences : compteur partagé entre les écoles (fuite
du volume de la plateforme), réattribution d'un matricule après suppression
d'une fiche (alors qu'il figure sur des cartes et des archives), et collision
entre deux créations simultanées.

Cette migration crée le compteur persistant qui remplace ce calcul, et
l'AMORCE pour chaque établissement ayant déjà des fiches, afin qu'aucun
matricule existant ne puisse être réattribué.

Sécurité
--------
- Purement ADDITIVE : crée une table, ne touche à aucune table existante,
  ne modifie ni ne supprime aucune donnée métier.
- Idempotente : `CREATE TABLE IF NOT EXISTS`, et l'amorçage ignore les
  établissements déjà présents dans le compteur.
- L'amorçage prend le MAXIMUM entre le nombre de fiches existantes et la
  valeur déjà enregistrée : le compteur ne peut jamais reculer.

Usage :
    cd backend && python migrations/lot12_sequences_matricule.py
"""
import os
import sys

import sqlalchemy as sa

DATABASE_URL = os.environ.get("DATABASE_URL")
if not DATABASE_URL:
    print("[STOP] DATABASE_URL n'est pas defini.")
    sys.exit(1)

# (prefixe utilise comme type_entite, table source)
ENTITES = [("ELV", "ss_eleves"), ("ENS", "ss_enseignants")]


def main() -> int:
    engine = sa.create_engine(DATABASE_URL)

    with engine.begin() as conn:
        conn.execute(sa.text("""
            CREATE TABLE IF NOT EXISTS ss_sequences_matricule (
                etablissement_id INTEGER NOT NULL
                    REFERENCES ss_etablissements(etablissement_id),
                type_entite VARCHAR(20) NOT NULL,
                dernier_numero INTEGER NOT NULL DEFAULT 0,
                PRIMARY KEY (etablissement_id, type_entite)
            )
        """))
        print("[OK] Table ss_sequences_matricule prete.")

        total_amorces = 0
        for prefixe, table in ENTITES:
            lignes = conn.execute(sa.text(f"""
                SELECT etablissement_id, COUNT(*) AS n
                FROM {table}
                WHERE etablissement_id IS NOT NULL
                GROUP BY etablissement_id
                ORDER BY etablissement_id
            """)).fetchall()

            if not lignes:
                print(f"[OK] {table} : aucune fiche, rien a amorcer.")
                continue

            for etablissement_id, n in lignes:
                # GREATEST : le compteur ne recule jamais, meme si la migration
                # est rejouee apres des suppressions.
                conn.execute(sa.text("""
                    INSERT INTO ss_sequences_matricule (etablissement_id, type_entite, dernier_numero)
                    VALUES (:etab, :type, :n)
                    ON CONFLICT (etablissement_id, type_entite) DO UPDATE
                    SET dernier_numero = GREATEST(
                        ss_sequences_matricule.dernier_numero, EXCLUDED.dernier_numero
                    )
                """), {"etab": etablissement_id, "type": prefixe, "n": n})
                print(f"[OK] {table} : etablissement {etablissement_id} amorce a {n}.")
                total_amorces += 1

    print(f"\n[DONE] Migration Lot 12 terminee ({total_amorces} compteur(s) amorce(s)).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
