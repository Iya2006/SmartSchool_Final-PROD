-- ============================================================================
-- Types d'évaluation propres à chaque école
-- Miroir SQL de backend/migrations/2026_08_notation_09_type_evaluation_etablissement.py
-- ============================================================================
-- `ss_types_evaluation` était partagée par toute la plateforme : renommer
-- « Composition » dans une école changeait l'intitulé des colonnes de bulletin
-- de toutes les autres. Le poids des types était déjà réglable par école
-- (paramètre notation.coef_type.{cycle}.{code}) ; désormais leur nom et leur
-- existence le sont aussi.
--
-- L'unicité du code passe de GLOBALE à PAR ÉCOLE : sans cela, deux écoles ne
-- pourraient pas avoir chacune leur « COMPO ».
--
-- Le rattachement des lignes existantes n'est PAS fait ici : c'est une
-- décision humaine, portée par le script Python via --rattacher-a.
-- ============================================================================

ALTER TABLE ss_types_evaluation
    ADD COLUMN IF NOT EXISTS etablissement_id INTEGER
    REFERENCES ss_etablissements(etablissement_id);

-- L'ancienne unicité globale sur `code` doit être retirée ; son nom dépend de
-- la base (contrainte ou index selon l'historique). Le script Python la
-- détecte et la supprime — ici on donne le cas nominal.
ALTER TABLE ss_types_evaluation DROP CONSTRAINT IF EXISTS ss_types_evaluation_code_key;
DROP INDEX IF EXISTS ss_types_evaluation_code_key;

CREATE UNIQUE INDEX IF NOT EXISTS uq_types_evaluation_etablissement_code
    ON ss_types_evaluation (etablissement_id, code);

-- À exécuter UNIQUEMENT après avoir décidé à qui appartiennent les types
-- existants, et remplacé <ETABLISSEMENT_ID> :
--
--   UPDATE ss_types_evaluation
--      SET etablissement_id = <ETABLISSEMENT_ID>
--    WHERE etablissement_id IS NULL;
--
--   ALTER TABLE ss_types_evaluation ALTER COLUMN etablissement_id SET NOT NULL;
