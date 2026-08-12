-- ============================================================================
-- Index de la deuxieme vague — tenir a un million d'eleves
-- Miroir SQL de backend/migrations/2026_08_perf_02_index_montee_en_charge.py
-- ============================================================================
-- La premiere vague (2026_08_12) a indexe le moteur de notation et les colonnes
-- d'isolation multi-ecoles. Il restait la facturation, les encaissements, les
-- presences, la paie, la comptabilite et les liens eleve<->parent : ces tables
-- ne portaient QUE leur cle primaire, donc un Seq Scan sur chaque lecture.
--
-- L'ordre de grandeur vise, a un million d'eleves :
--
--     ss_presences        1 000 000 x 180 jours x 2 demi-journees  ~ 360 M/an
--     ss_pointage_eleves  1 000 000 x 180 jours                    ~ 180 M/an
--     ss_notes            1 000 000 x 10 matieres x 6 epreuves     ~  60 M/an
--     ss_bulletin_lignes  1 000 000 x 10 matieres x 3 periodes     ~  30 M/an
--     ss_paiements                                                 ~  10 M/an
--     ss_factures         1 000 000 x 3 frais                      ~   3 M/an
--
-- Sur ss_presences, un Seq Scan lit 360 millions de lignes pour afficher
-- l'assiduite d'UN eleve. Ce n'est pas un gain de confort : c'est la difference
-- entre une page qui s'affiche et une page qui expire.
--
-- CONCURRENTLY : la table reste lisible ET modifiable pendant la construction.
-- A executer HORS transaction (psql -f, jamais dans un BEGIN/COMMIT).
--
-- Idempotent : IF NOT EXISTS partout. Rejouable sans risque.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- ss_presences
-- ---------------------------------------------------------------------------
-- assiduit? d'un ?l?ve, bulletin, alerte d'absent?isme ? la requ?te la plus co?teuse de l'application une fois le volume atteint
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_presences_inscription_date
    ON ss_presences (inscription_id, date_presence);

-- appel du jour et statistiques de pr?sence sur une p?riode
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_presences_date
    ON ss_presences (date_presence);


-- ---------------------------------------------------------------------------
-- ss_pointage_eleves
-- ---------------------------------------------------------------------------
-- pointage QR du jour pour une ?cole
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_pointage_eleves_etab_date
    ON ss_pointage_eleves (etablissement_id, date_pointage);

-- historique de pointage d'un ?l?ve
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_pointage_eleves_eleve_date
    ON ss_pointage_eleves (eleve_id, date_pointage);


-- ---------------------------------------------------------------------------
-- ss_eleves
-- ---------------------------------------------------------------------------
-- liste des ?l?ves tri?e par nom, et recherche par d?but de nom ; remplace un tri en m?moire sur toute l'?cole
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_eleves_etab_nom_prenom
    ON ss_eleves (etablissement_id, nom, prenom);

-- effectifs actifs / radi?s d'une ?cole
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_eleves_etab_statut
    ON ss_eleves (etablissement_id, statut);


-- ---------------------------------------------------------------------------
-- ss_inscriptions
-- ---------------------------------------------------------------------------
-- effectif d'une ann?e enti?re : cl?ture, promotion, statistiques
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_inscriptions_annee_statut
    ON ss_inscriptions (annee_id, statut);


-- ---------------------------------------------------------------------------
-- ss_eleve_parent
-- ---------------------------------------------------------------------------
-- parents d'un ?l?ve ? lu ? chaque ouverture de fiche ?l?ve
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_eleve_parent_eleve
    ON ss_eleve_parent (eleve_id);

-- enfants d'un parent ? point d'entr?e du portail parent
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_eleve_parent_parent
    ON ss_eleve_parent (parent_id);


-- ---------------------------------------------------------------------------
-- ss_factures
-- ---------------------------------------------------------------------------
-- factures d'un ?l?ve : la jointure de tout l'?cran de recouvrement
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_factures_inscription
    ON ss_factures (inscription_id);

-- impay?s de l'ann?e ? tableau de bord du comptable
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_factures_annee_statut
    ON ss_factures (annee_id, statut);

-- recettes par type de frais, et contr?le avant suppression d'un type
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_factures_type_frais
    ON ss_factures (type_frais_id);


-- ---------------------------------------------------------------------------
-- ss_echeances_factures
-- ---------------------------------------------------------------------------
-- ?ch?ancier d'une facture
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_echeances_facture
    ON ss_echeances_factures (facture_id);


-- ---------------------------------------------------------------------------
-- ss_paiements
-- ---------------------------------------------------------------------------
-- encaissements d'une facture ? recalcule le montant restant
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_paiements_facture
    ON ss_paiements (facture_id);

-- recette du jour, du mois, de l'exercice
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_paiements_date_statut
    ON ss_paiements (date_paiement, statut);

-- rapprochement d'un versement avec son ?ch?ance
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_paiements_echeance
    ON ss_paiements (echeance_id);


-- ---------------------------------------------------------------------------
-- ss_tarifs_classe
-- ---------------------------------------------------------------------------
-- tarif d'un frais dans une classe. UNIQUE : deux montants pour le m?me frais dans la m?me classe est une saisie en double, pas un cas m?tier
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS ix_tarifs_classe_unique
    ON ss_tarifs_classe (classe_id, type_frais_id);


-- ---------------------------------------------------------------------------
-- ss_depenses
-- ---------------------------------------------------------------------------
-- d?penses d'une ?cole sur une ann?e, du plus r?cent au plus ancien
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_depenses_etab_annee_date
    ON ss_depenses (etablissement_id, annee_id, date_depense);

-- d?penses de fonctionnement hors salaires, et validation en attente
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_depenses_etab_categorie_statut
    ON ss_depenses (etablissement_id, categorie, statut);

-- historique de paie d'un employ? : la colonne porte 'ENS_x'/'PERS_x'
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_depenses_fournisseur
    ON ss_depenses (fournisseur);


-- ---------------------------------------------------------------------------
-- ss_ecritures_comptables
-- ---------------------------------------------------------------------------
-- journal comptable d'une ?cole sur une p?riode
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_ecritures_etab_date
    ON ss_ecritures_comptables (etablissement_id, date_ecriture);

-- cl?ture d'exercice, balance g?n?rale
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_ecritures_exercice
    ON ss_ecritures_comptables (exercice_id);


-- ---------------------------------------------------------------------------
-- ss_lignes_ecritures
-- ---------------------------------------------------------------------------
-- lignes d'une ?criture ? lues ? chaque affichage du journal
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_lignes_ecritures_ecriture
    ON ss_lignes_ecritures (ecriture_id);

-- grand livre d'un compte, balance
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_lignes_ecritures_compte
    ON ss_lignes_ecritures (compte_id);


-- ---------------------------------------------------------------------------
-- ss_employes
-- ---------------------------------------------------------------------------
-- miroir de paie retrouv? ? chaque calcul de salaire ('ENS_x'/'PERS_x')
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_employes_source_ref
    ON ss_employes (source_ref);


-- ---------------------------------------------------------------------------
-- ss_bulletins_paie
-- ---------------------------------------------------------------------------
-- bulletin d'un employ? pour un mois ? lu avant chaque paiement pour ne pas payer deux fois
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_bulletins_paie_employe_mois
    ON ss_bulletins_paie (employe_id, mois_concerne);


-- ---------------------------------------------------------------------------
-- ss_avances
-- ---------------------------------------------------------------------------
-- avances ? d?duire du salaire du mois
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_avances_employe_mois_statut
    ON ss_avances (employe_id, mois_concerne, statut);


-- ---------------------------------------------------------------------------
-- ss_primes
-- ---------------------------------------------------------------------------
-- primes ponctuelles du mois
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_primes_employe_mois
    ON ss_primes (employe_id, mois_concerne);


-- ---------------------------------------------------------------------------
-- ss_absences_personnel
-- ---------------------------------------------------------------------------
-- retenue pour absence non justifi?e
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_absences_personnel_employe_date
    ON ss_absences_personnel (employe_id, date_absence);


-- ---------------------------------------------------------------------------
-- ss_presences_agents
-- ---------------------------------------------------------------------------
-- pointage du personnel, source de la retenue automatique
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_presences_agents_agent_date
    ON ss_presences_agents (type_agent, agent_id, date_presence);


-- ---------------------------------------------------------------------------
-- ss_creneaux_emploi
-- ---------------------------------------------------------------------------
-- emploi du temps d'une classe
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_creneaux_annee_classe
    ON ss_creneaux_emploi (annee_id, classe_id);

-- emploi du temps personnel d'un enseignant, d?tection de conflit
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_creneaux_annee_enseignant
    ON ss_creneaux_emploi (annee_id, enseignant_id);


-- ---------------------------------------------------------------------------
-- ss_messages
-- ---------------------------------------------------------------------------
-- bo?te de r?ception : messages non lus d'un utilisateur
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_messages_destinataire
    ON ss_messages (destinataire_type, destinataire_id, statut);

-- fil de discussion et purge des anciens messages
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_messages_date_envoi
    ON ss_messages (date_envoi);

