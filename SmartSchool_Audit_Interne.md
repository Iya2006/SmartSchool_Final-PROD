# SmartSchool — Audit interne (document équipe, ne pas diffuser au client)

> Établi par lecture directe du code (backend FastAPI + frontend Next.js + PostgreSQL).
> Source de vérité : routeurs `backend/app/api/`, modèles `backend/app/models/academique.py`,
> pages `frontend/src/app/`, contrôle d'accès `frontend/src/lib/roleAccess.ts`.
> Tout ce qui est marqué **PARTIEL** ou **À VENIR** ne doit pas être présenté comme disponible au client.

## 1. Architecture réelle

- **Backend** : FastAPI (Python 3.12), SQLAlchemy, PostgreSQL (pilote pg8000). File d'attente RQ + Redis pour les calculs lourds (paie, moyennes de masse).
- **Frontend** : Next.js 16 (Turbopack), React, TypeScript. PWA (manifest + service worker `frontend/public/sw.js`).
- **Ports de dev** : backend 8300, frontend 3300, PostgreSQL 5433 (Docker), Redis 6379.
- **Pas d'Alembic** : migrations Python idempotentes dans `backend/migrations/` + miroirs SQL dans `database/migrations/`.
- **⚠️ Le cahier des charges client suppose Clerk / Prisma / Next-only : FAUX.** Aucune trace de Clerk (`grep -rli clerk` = vide). L'authentification est **maison**, par JWT signé (`app/core/auth.py`, `import jwt`, `create_access_token`, `verify_password`). Ne jamais écrire « Clerk » dans le document client.

## 2. Authentification et accès

- **Connexion unifiée** : `POST /api/auth/login` (`unified_login`) cherche successivement dans `Utilisateur` → `Enseignant` → `Parent` → `Eleve`. Identifiant = nom d'utilisateur / email / téléphone / matricule selon l'entité.
- **Mot de passe** : haché (`hash_password`/`verify_password`). Un compte sans mot de passe est refusé avec un message explicite (l'admin doit en attribuer un). Corrige une faille réelle : un parent entrait avec son seul numéro de téléphone.
- **JWT** porte : `sub`, `role`, `type`, `etablissement_id`, `roles_secondaires`, `role_base`. `etablissement_id = None` ⇒ SUPER_ADMIN plateforme uniquement.
- **Rate limiting** : login limité (5/min) via slowapi. Inscription publique d'école limitée 3/h.
- **Code établissement** : `login/ecole` (page dédiée enseignants/parents) + champ `code_etablissement` dans `LoginRequest`. Sert à lever l'ambiguïté quand un même identifiant existe dans plusieurs écoles (`_exiger_un_seul`).
- **Sélection d'établissement actif** : `GET /api/auth/etablissements-disponibles` + `POST /api/auth/etablissement-actif` + page `selection-etablissement`. Permet à un compte relevant de plusieurs écoles de choisir l'espace courant.

## 3. Multi-établissement (isolation)

- **Modèle** : quasiment toutes les tables portent `etablissement_id` NOT NULL. `Eleve`, `Enseignant`, `Parent`, `Utilisateur`, `Classe`, etc. sont **une fiche par école** (migrations `2026_08_multi_*`).
- **Règle** : `etablissement_id` vient TOUJOURS du JWT via `require_etablissement` ; jamais du corps de requête. Cross-école ⇒ **404** (jamais 403), pour ne pas confirmer l'existence.
- **Chantier tenu par un tiers (Johnny)** : 13 lots d'isolation, ~330 tests. Ne pas refaire seul. Voir `.ai/MULTI_TENANT_PLAN.md`, `docs/MULTI_ECOLES_REGLES_DEV.md`.
- **Une même personne dans plusieurs écoles** : représentée par plusieurs fiches (une par école), reliées à la connexion par email/téléphone/matricule + code établissement. Ce n'est PAS un compte unique qui bascule ; c'est une résolution à la connexion. À formuler prudemment au client.
- **Dette connue** : ~15 écrans frontend envoient encore `etablissement_id=1` en dur dans les URL — **sans effet** (le serveur reprend l'école du JWT), mais à nettoyer.

## 4. Rôles réels (`roleAccess.ts`)

SUPER_ADMIN, FONDATEUR, DG, DIRECTEUR_NIVEAU, ADMIN, COMPTABLE, BIBLIOTHECAIRE, INFORMATICIEN, SURVEILLANT, OPERATEUR, ENSEIGNANT, PARENT, ELEVE, AGENT_ENTRETIEN, GARDIEN, CHAUFFEUR, AUTRE.

- **Espaces complets vérifiés** : ADMIN/direction, COMPTABLE, SURVEILLANT, BIBLIOTHECAIRE, INFORMATICIEN, ENSEIGNANT, ELEVE, PARENT.
- **OPERATEUR (secrétariat)** : espace **lecture seule** — 5 GET, 0 écriture. **PARTIEL** : une secrétaire ne peut inscrire personne depuis son espace (le comptable/admin le fait).
- **Rôles personnalisés (ex. CENSEUR)** : créables et enregistrés, `role_base` résout l'espace hérité à la connexion. **PARTIEL** : non attribuables via l'écran standard (`ROLES_ATTRIBUABLES` figé) — signalé dans MIGRATION_NOTES.
- **AGENT_ENTRETIEN / GARDIEN / CHAUFFEUR / AUTRE** : comptes existants, espaces minimaux/statiques. **PARTIEL**.
- Le fondateur = ADMIN de son école (créé à l'inscription). SUPER_ADMIN = éditeur de la plateforme (multi-écoles), distinct.

## 5. Modules et routeurs (backend/main.py)

auth, inscription_etablissement, dashboard, eleves, enseignants, classes, inscriptions, promotion, reinscription, annee_scolaire, evaluations, notes, matieres, emploi_du_temps, examens, centre-evaluation, vie_scolaire (présences, incidents), seances (pédagogiques), pointage_eleves (QR), presence_agent (QR personnel), finance, comptabilite, bibliotheque, informatique, fournitures, activites, evenements, galerie/photos, communication, securite, parametrage, monitoring, export_donnees, sync, tasks, personnel, portails eleve/enseignant/parent.

## 6. Évaluations, notes, bulletins (refonte majeure — voir MIGRATION_NOTES.md §1)

- Moteur central unique : `app/services/notation.py`. Plus de règle figée.
- Coefficients configurables par école, par cycle, par type d'évaluation, surcharge ponctuelle. Barème en cascade. Nombre de périodes libre.
- Compositions groupées (`EvaluationSession`), résultats intermédiaires, bulletins de période + **annuels** (calcul).
- Classes d'examen (`Niveau.est_examen`) : passage décidé par résultat officiel du Ministère (`ResultatOfficielExamen`), import CSV/XLSX.
- Recette calcul vérifiée sur TrillionX (école 3) : recalcul manuel = moteur au centime, 3 étages.
- **PARTIEL côté familles** : bulletin **annuel** non atteignable dans l'UI parent/élève (seuls des boutons de période) ; publication annuelle non couverte par `publier-tout` (exige un trimestre). Classement mensuel/semestre/annuel non exposé aux portails (seul le classement par épreuve l'est).
- Bulletins gate `statut == "PUBLIE"` pour les familles (correct). Bulletins démo école 3 publiés manuellement pour la recette.

## 7. Présences (deux mécanismes distincts, reliés)

- **Pointage QR** : `pointage_eleves` (élèves, `PointageEleve`) et `presence_agent` (personnel/enseignants, `PresenceAgent`) — arrivée/départ, prouve la présence *à l'école*. Le scan personnel reconnaît déjà le matricule enseignant. **Constat** : 0 enseignant pointé dans les données (manque d'usage, pas de code).
- **Appel en classe** : `Presence` (par demi-journée au primaire ; par matière/séance au collège-lycée). Fait par l'enseignant (portail) ou le surveillant (filet).
- **Séances** : `Seance` matérialisée depuis l'emploi du temps à l'ouverture de l'écran (`_materialiser_le_jour`) ou par le portail enseignant. Statut PREVUE→EFFECTUEE/NON_EFFECTUEE.
- **Absence enseignant** : le surveillant SIGNALE (par heures précises, `seance_ids`), la direction TRANCHE (`vie_scolaire`), puis la paie retient (`finance`). Une seule ligne d'absence par jour (la paie compte des jours).
- Feuille d'appel enrichie : montre qui est entré au portail, signale « entré mais absent en cours » et « jamais entré ».

## 8. Finance / comptabilité (module riche)

Routes (`finance.py`) : factures, paiements, reçus (PDF), impayés, tarifs par classe (`TarifClasse` = source de vérité), types de frais, solvabilité, solde élève, avis/rappels de paiement, salaires/rémunération, primes, avances, acomptes, absences (retenues), dépenses, fournisseurs, décaissements, règlements fournisseurs, rapports, dashboard. `comptabilite.py` : exercices, PIN, écritures.

- Accès `FINANCE_ROLES = SUPER_ADMIN, ADMIN, FONDATEUR, DG, COMPTABLE`.
- Scolarité générée depuis la grille tarifaire de la classe à l'inscription/réinscription (corrigé récemment : perdait la scolarité en silence).

## 9. Hors-ligne / synchronisation

- `frontend/public/sw.js` (service worker), `lib/offlineQueue.ts`, `lib/syncEngine.ts`, `lib/deltaSync.ts`, `lib/offlinePolicy.ts`, `lib/localEncryption.ts`, `SyncStatusIndicator.tsx`, page `hors-ligne`.
- Backend `sync.py` : Last-Write-Wins écrit à la main pour `Note` (champ par champ). Toute nouvelle colonne synchronisable doit être ajoutée explicitement (pas générique).
- **À formuler prudemment** : certaines consultations/actions restent possibles hors-ligne selon `offlinePolicy`, remise à jour au retour du réseau. Ne PAS dire « fonctionne entièrement sans Internet ».

## 10. Mobile

- PWA installable (`manifest.json`, bouton « Installer SmartSchool » sur login, `display: standalone`). Utilisable ordinateur/tablette/téléphone (design responsive — travail responsive fait sur main, cf. PR #8/#10).
- Pas d'application native (pas de store). À dire tel quel.

## 11. Communication / notifications

- `Message` (ss_messages) : ADMIN/ENSEIGNANT/PARENT ↔ destinataires (PARENT, TOUS_PARENTS, CLASSE_PARENTS, ENSEIGNANT, TOUS_ENSEIGNANTS, TOUS). Objets : GENERAL, PAIEMENT, BULLETIN, DISCIPLINE, EMPLOI, REUNION, EXAMENS.
- Avis/rappels de paiement générés côté finance.
- **PARTIEL** : pas de messagerie bidirectionnelle parent↔enseignant complète (parent écrit surtout à l'administration). Fuite inter-écoles des messages parent **corrigée** ce jour (filtre établissement ajouté + test).
- Pas de système de notifications push mobiles. Ne pas le promettre.

## 12. Historique / journaux / exports / impressions

- **AuditLog** (ss_audit_logs) : par école, utilisateur, module, action, détails, IP, date. Journal des actions.
- **Exports CSV** : `export_donnees.py` (élèves, classes, notes, catalogue) réservés admin.
- **Impressions PDF** (reportlab) : bulletins, reçus, fiche de classement, fiche annuelle, examens. `tasks.py` pour les gros travaux.
- **Monitoring** : `monitoring.py` (santé base + Redis/queue) — technique, pour l'exploitant.

## 13. Sécurité (points saillants)

- JWT signé, secret via fichier monté en prod (`core/secrets.py`).
- Isolation 404 cross-école systématique ; `etablissement_id` du JWT.
- `ProtectionNavigateur.tsx` : décourage clic droit / F12 — **garde-fou, pas serrure** (documenté comme tel). Vraie protection = serveur.
- Faille corrigée : `/api/presences-agents/*` était ouvert à tout compte authentifié (heures du personnel) → restreint aux rôles internes.
- Index de performance posés (25 index, cf. MIGRATION_NOTES §perf).

## 14. État par fonctionnalité (résumé démo)

| Fonctionnalité | État |
|---|---|
| Inscription d'école + validation plateforme | ✅ |
| Connexion multi-entités + code établissement | ✅ |
| Isolation multi-école | ✅ (tiers) |
| Classes / élèves / enseignants / matières / affectations | ✅ |
| Emploi du temps / séances | ✅ |
| Évaluations / notes / compositions groupées / bulletins de période | ✅ |
| Bulletin annuel (calcul) | ✅ ; **PARTIEL** côté familles (UI) |
| Classement par épreuve | ✅ ; classement mensuel/semestre/annuel portails **À VENIR** |
| Présences élèves (appel + QR) | ✅ |
| Présences/absences enseignants (signale→tranche→paie) | ✅ |
| Finance / comptabilité | ✅ |
| Bibliothèque / informatique (tickets) / fournitures | ✅ |
| Portails élève / parent | ✅ (lecture) |
| Messagerie parent↔enseignant bidirectionnelle | **À VENIR** |
| Secrétariat (Opérateur) en écriture | **PARTIEL** (lecture seule) |
| Rôles personnalisés attribuables | **PARTIEL** |
| Hors-ligne / PWA | ✅ (périmètre `offlinePolicy`) |
| Notifications push mobiles | **Absent** |

## 15. À vérifier / risques avant démonstration

1. Publier les bulletins de l'école de démo (sinon « non disponible » côté famille).
2. Éviter d'enchaîner >5 logins/min (rate limit 429).
3. Bulletin annuel : ne pas le promettre côté famille tant que l'UI ne l'expose pas.
4. Messagerie parent↔prof : présenter comme « communication avec l'administration » aujourd'hui.
5. Secrétariat : présenter comme consultation, pas saisie.
6. Ne jamais dire « fonctionne 100 % sans Internet » ni « application native ».
7. Fusion `sams`→`main` : la branche de travail est `sams` ; le fondateur crée la PR.
