-- ============================================================================
-- Un membre du personnel peut exister sans compte de connexion.
--
-- Miroir SQL de backend/migrations/2026_08_personnel_01_compte_facultatif.py
--
-- POURQUOI
-- L'API annonce depuis toujours qu'un membre du personnel sans mot de passe
-- est un « staff technique sans accès » : gardien, agent d'entretien,
-- chauffeur. La base l'interdisait — les deux colonnes étaient NOT NULL — et
-- la création échouait en erreur serveur.
--
-- Ces personnes doivent pourtant exister en base : elles n'ont aucun écran à
-- consulter, mais elles ont un salaire mensuel, des absences et un bulletin
-- de paie.
--
-- Un compte sans mot de passe ne peut de toute façon plus s'ouvrir : voir
-- app/core/security.py::verify_password, qui n'accepte plus de passe-partout.
--
-- L'index unique sur nom_utilisateur est conservé : PostgreSQL autorise
-- plusieurs NULL dans un index unique.
-- ============================================================================

ALTER TABLE ss_utilisateurs ALTER COLUMN nom_utilisateur DROP NOT NULL;
ALTER TABLE ss_utilisateurs ALTER COLUMN mot_de_passe   DROP NOT NULL;

-- Contrôle : les comptes à moitié ouverts (login sans mot de passe, ou
-- l'inverse) sont inutilisables. On les liste, on ne les corrige pas d'office :
-- seule l'école sait si la personne doit avoir un accès.
-- SELECT utilisateur_id, nom, prenom, role
--   FROM ss_utilisateurs
--  WHERE (nom_utilisateur IS NULL) <> (mot_de_passe IS NULL);
