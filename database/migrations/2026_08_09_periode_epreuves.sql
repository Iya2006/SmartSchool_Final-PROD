-- ============================================================================
-- Migration Postgres (voir database/migrations/2026_07_30_paie_source_ref.sql
-- pour le rappel : ce dossier migrations/ est la source de vérité du schéma
-- Postgres réel). Miroir SQL de backend/migrations/2026_08_notation_08_periode_epreuves.py
-- ============================================================================
-- Objectif : laisser l'école décider quelles épreuves comptent pour le résultat
-- officiel d'une période. Le calcul prenait jusqu'ici toutes les évaluations
-- centralisées du trimestre, alors qu'un résultat de période peut être le fruit
-- de deux ou trois évaluations sans composition, ou d'une composition seule.
--
-- Règle de lecture (compatibilité ascendante) :
--   aucune ligne pour (classe, trimestre) -> toutes les évaluations centralisées
--                                            comptent, comme avant ;
--   au moins une ligne                    -> seules les évaluations listées
--                                            comptent.
-- ============================================================================

CREATE TABLE IF NOT EXISTS ss_periode_epreuves (
    periode_epreuve_id SERIAL PRIMARY KEY,
    classe_id INTEGER NOT NULL REFERENCES ss_classes(classe_id),
    trimestre_id INTEGER NOT NULL REFERENCES ss_trimestres(trimestre_id),
    evaluation_id INTEGER NOT NULL REFERENCES ss_evaluations(evaluation_id) ON DELETE CASCADE,
    created_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(100)
);

-- Une même évaluation ne peut être retenue qu'une fois pour une période :
-- sans cette contrainte, un double clic la ferait compter deux fois.
CREATE UNIQUE INDEX IF NOT EXISTS ux_periode_epreuves
    ON ss_periode_epreuves(classe_id, trimestre_id, evaluation_id);

CREATE INDEX IF NOT EXISTS ix_periode_epreuves_periode
    ON ss_periode_epreuves(classe_id, trimestre_id);
