-- ============================================================================
-- Le détail d'une retenue d'absence n'a pas de longueur maximale.
--
-- Miroir SQL de backend/migrations/2026_08_paie_01_details_absences_texte.py
--
-- POURQUOI
-- ss_bulletins_paie.details_absences était un VARCHAR(500). Ce champ porte la
-- justification ligne par ligne d'une retenue de salaire : date, horaire,
-- matière, classe et taux horaire de chaque heure de cours non assurée.
--
-- Un professeur qui manque une journée chargée dépasse les 500 caractères, et
-- le paiement de son salaire échouait en erreur serveur — constaté sur la
-- paie de TrillionX, deux mois sur neuf.
--
-- Tronquer n'était pas une option : une retenue de salaire se conteste, et un
-- justificatif coupé au milieu d'une ligne ne prouve plus rien.
-- ============================================================================

ALTER TABLE ss_bulletins_paie ALTER COLUMN details_absences TYPE TEXT;

-- Contrôle : les justificatifs qui frôlaient la limite sont peut-être
-- incomplets. Recalculer la paie du mois concerné les régénère entiers.
-- SELECT bulletin_id, mois_concerne, length(details_absences)
--   FROM ss_bulletins_paie
--  WHERE length(details_absences) >= 480;
