-- Le fondateur choisit si le directeur général voit la comptabilité.
-- « O » par défaut : les comptes existants gardent leur accès actuel.
-- Miroir de backend/migrations/2026_08_dg_acces_comptabilite.py
ALTER TABLE ss_utilisateurs ADD COLUMN IF NOT EXISTS acces_comptabilite VARCHAR(1) DEFAULT 'O';
UPDATE ss_utilisateurs SET acces_comptabilite = 'O' WHERE acces_comptabilite IS NULL;
