-- ============================================================================
-- Centre des Examens : rattacher les sujets aux vraies périodes
--
-- ss_sujets_examen.trimestre était un entier 1/2/3 sans lien avec les périodes
-- configurées par l'établissement. Le reste du système gère de 1 à 12 périodes
-- nommées librement : ce module imposait encore trois trimestres, si bien
-- qu'une école à deux semestres se voyait proposer un « T3 » inexistant.
--
-- Additif : la colonne historique est conservée et reste alimentée (numéro de
-- la période), pour ne casser aucun client existant.
--
-- Miroir de backend/migrations/2026_08_examens_01_sujet_trimestre_id.py
-- ============================================================================

ALTER TABLE ss_sujets_examen
    ADD COLUMN IF NOT EXISTS trimestre_id INTEGER NULL
    REFERENCES ss_trimestres(trimestre_id);

CREATE INDEX IF NOT EXISTS idx_sujets_examen_trimestre_id
    ON ss_sujets_examen(trimestre_id);

-- Backfill : rapprochement de l'ancien numéro et de la période correspondante
-- de l'année courante. Ce qu'on ne sait pas rattacher reste NULL.
UPDATE ss_sujets_examen s
SET trimestre_id = (
    SELECT t.trimestre_id
    FROM ss_trimestres t
    JOIN ss_annees_scolaires a ON a.annee_id = t.annee_id
    WHERE t.numero = s.trimestre AND a.est_courante = 'O'
    LIMIT 1
)
WHERE s.trimestre_id IS NULL AND s.trimestre IS NOT NULL;

ALTER TABLE ss_sujets_examen ALTER COLUMN trimestre DROP NOT NULL;
