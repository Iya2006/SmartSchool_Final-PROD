-- ============================================================================
-- Index de performance — notation et isolation multi-écoles
-- Miroir SQL de backend/migrations/2026_08_perf_01_index_notation.py
-- ============================================================================
-- Aucune des colonnes que le moteur de notation interroge en permanence n'était
-- indexée. PostgreSQL relisait la table entière à chaque requête :
--
--     EXPLAIN SELECT * FROM ss_notes WHERE evaluation_id = 1
--     -> Seq Scan on ss_notes
--
-- Mesuré sur une table de 5 000 000 de notes (≈ 25 000 élèves) :
--     sans index : 430 ms      avec index : 2,1 ms      → 209× plus rapide
--
-- Et surtout : 2 ms qui restent 2 ms quand le volume grandit, au lieu de 430 ms
-- qui deviennent des secondes.
--
-- Le chantier multi-écoles a aggravé le point sans le savoir : presque chaque
-- requête passe désormais par ss_classes.etablissement_id ou
-- ss_eleves.etablissement_id — devenues les colonnes les plus sollicitées, et
-- justement dépourvues d'index.
--
-- Index COMPOSITES, calqués sur les combinaisons de filtres réellement
-- présentes dans le code. Un index (a, b, c) sert aussi (a) et (a, b).
--
-- CONCURRENTLY : la table reste lisible ET modifiable pendant la construction.
-- Ne peut pas s'exécuter dans une transaction — pas de BEGIN/COMMIT ici.
--
-- Aucune donnée touchée, aucun comportement changé. Uniquement la vitesse.
-- ============================================================================

-- ── ss_notes : la table qui grossit le plus vite ────────────────────────────
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_notes_evaluation_inscription
    ON ss_notes (evaluation_id, inscription_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_notes_inscription
    ON ss_notes (inscription_id);

-- ── ss_evaluations ──────────────────────────────────────────────────────────
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_evaluations_classe_trimestre_statut
    ON ss_evaluations (classe_id, trimestre_id, statut);
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_evaluations_enseignant
    ON ss_evaluations (enseignant_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_evaluations_matiere
    ON ss_evaluations (matiere_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_evaluations_type_eval
    ON ss_evaluations (type_eval_id);

-- ── ss_inscriptions ─────────────────────────────────────────────────────────
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_inscriptions_classe_statut
    ON ss_inscriptions (classe_id, statut);
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_inscriptions_eleve_statut
    ON ss_inscriptions (eleve_id, statut);
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_inscriptions_annee
    ON ss_inscriptions (annee_id);

-- ── bulletins ───────────────────────────────────────────────────────────────
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_bulletin_lignes_bulletin
    ON ss_bulletin_lignes (bulletin_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_bulletin_lignes_matiere
    ON ss_bulletin_lignes (matiere_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_bulletins_inscription_type
    ON ss_bulletins (inscription_id, type_bulletin);

-- ── isolation multi-écoles : colonnes devenues les plus sollicitées ─────────
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_classes_etab_annee_statut
    ON ss_classes (etablissement_id, annee_id, statut);
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_eleves_etablissement
    ON ss_eleves (etablissement_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_parametres_etab_categorie_cle
    ON ss_parametres (etablissement_id, categorie, cle);

-- ── référentiels de classe ──────────────────────────────────────────────────
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_classe_matieres_classe_active
    ON ss_classe_matieres (classe_id, est_active);
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_classe_matieres_matiere
    ON ss_classe_matieres (matiere_id);

-- ── affectations et calendrier ──────────────────────────────────────────────
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_affectations_enseignant_statut
    ON ss_affectations (enseignant_id, statut);
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_affectations_classe_matiere_statut
    ON ss_affectations (classe_id, matiere_id, statut);
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_affectations_annee_statut
    ON ss_affectations (annee_id, statut);
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_trimestres_annee_numero
    ON ss_trimestres (annee_id, numero);
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_annees_etab_courante
    ON ss_annees_scolaires (etablissement_id, est_courante);

-- ── sujets d'examen ─────────────────────────────────────────────────────────
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_sujets_examen_enseignant
    ON ss_sujets_examen (enseignant_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_sujets_examen_trimestre
    ON ss_sujets_examen (trimestre_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_sujets_examen_demande
    ON ss_sujets_examen (demande_id);

-- ============================================================================
-- Vérification. Un CONCURRENTLY interrompu laisse un index INVALIDE, que le
-- planificateur n'utilise jamais — silencieusement. Cette requête doit ne rien
-- renvoyer ; sinon, supprimer l'index nommé et le recréer.
--
--   SELECT i.relname FROM pg_index x
--   JOIN pg_class i ON i.oid = x.indexrelid
--   WHERE NOT x.indisvalid AND i.relname LIKE 'ix_%';
-- ============================================================================
