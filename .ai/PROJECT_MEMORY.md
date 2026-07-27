# 🧠 MÉMOIRE PERSISTANTE DU PROJET — SMART_SCHOOL_FINAL

> Dernière mise à jour : 21/07/2026

## État actuel
Module **Paramètres (Centre de Contrôle)** — architecture Next.js (frontend) + FastAPI (backend).

Sections terminées et **vérifiées par lecture de code réelle** (pages + endpoints existants et cohérents) :
- Phase 0 — Fondations Techniques (5/5)
- Section 1 — Identité (11/11)
- Section 4 — Apparence (14/14)
- Section 5 — Cartes Scolaires (10/10)
- Section 3 — Notation (10/10)
- Section 7 — Finance (9/9)
- Section 6 — Format Bulletins & Documents PDF (9/9)
- Section 8 — Sécurité & Gestion des Accès (7/7)

Section **non terminée malgré une case cochée par erreur** :
- Section 2 — Calendrier & Vacances (0/5) — voir correction ci-dessous.

Progression globale réelle : **80/101 tâches (79%)**.

## ⚠️ Incident corrigé le 21/07/2026 : conflit Git non résolu + case cochée à tort
- **Constat** : `.ai/TODO.md`, `.ai/CURRENT_TASK.md` et `.ai/PROJECT_MEMORY.md`
  contenaient des marqueurs de conflit Git (`<<<<<<< HEAD` / `=======` /
  `>>>>>>> 5cae788`) non résolus, hérités du merge de la PR #5
  (`iya-dev-parametres`). Aucun `MERGE_HEAD` actif — les marqueurs avaient été
  commités tels quels (fichiers ajoutés à l'index sans résoudre le conflit).
- **Vérification effectuée (RÈGLE 2 du protocole)** : avant de résoudre, le
  code réel a été inspecté pour les sections en conflit (2, 6, 7, 8) :
  - Section 7 (Finance) : confirmée complète (`finance/page.tsx`,
    `finance.py` avec `calculer_rang_fratrie`, `calculer_reduction_montant`,
    `calculer_penalite`, `get_finance_settings` ; `comptabilite.py` avec
    `/pin/status`, `/pin/verify`, `/pin`).
  - Section 6 (Documents) : confirmée complète (`documents/page.tsx`,
    `documents_settings.py` avec templates de bulletin, filigrane,
    appréciations automatiques).
  - Section 8 (Sécurité) : confirmée complète (`securite/page.tsx`,
    `securite.py` avec CRUD rôles/permissions/audit log,
    `security_settings.py` avec politique de mot de passe et session).
  - **Section 2 (Calendrier) : NON complète**, contrairement à ce que les
    deux côtés du conflit et les cases `[x]` du fichier laissaient penser.
    La page `frontend/src/app/parametres/calendrier/page.tsx` n'existe pas.
    Côté backend (`backend/app/api/parametrage.py`), seuls `list_annees`,
    `create_annee`, `activer_annee`, `list_trimestres` existent : pas de
    `update_annee`, pas de CRUD trimestres complet, pas de stockage des
    vacances scolaires, pas de toggle Semestre/Trimestre.
- **Correction appliquée** :
  - `.ai/TODO.md` : sous-tâches 2.1 à 2.5 recochées `[ ]` avec note explicative ;
    tableau de progression nettoyé des marqueurs de conflit et recalculé
    (75/101, 74%).
  - `.ai/CURRENT_TASK.md` : remis à jour avec l'état réel et la prochaine
    tâche (Section 2).
  - `.ai/PROJECT_MEMORY.md` (ce fichier) : historique consolidé.

## Historique — Section 7 (Finance), terminée le 19/07/2026
### Fichiers créés
- `frontend/src/app/parametres/finance/page.tsx` — page de paramètres (5 onglets :
  Général, Types de frais, Pénalités, Réductions, Reçus & Sécurité).
- `frontend/src/app/parametres/finance/Finance.module.css` — styles (thème émeraude).

### Fichiers modifiés
- `backend/app/api/finance.py` :
  - Ajout de `FINANCE_DEFAULTS`, `get_finance_settings()`, `calculer_rang_fratrie()`,
    `calculer_reduction_montant()`, `calculer_penalite()` (lecture des paramètres
    `ss_parametres` categorie=`FINANCE`, avec valeurs par défaut).
  - `create_paiement` : utilise désormais `devise` et `recu_prefixe` configurables
    au lieu des valeurs `"GNF"` / `"REC-"` codées en dur.
  - `generer_factures_classe` : nouveau champ optionnel `appliquer_reductions`
    (schema) → applique la réduction fratrie (via `EleveParent` + rang par date de
    naissance) si activée. Comportement par défaut inchangé (`false`).
  - `list_impayes` / `list_retards` : ajout des champs `penalite_estimee` et
    `montant_du_avec_penalite` dans la réponse (calculés seulement si
    `penalite_active` est vrai dans les paramètres).
- `backend/app/api/comptabilite.py` :
  - Nouveaux endpoints : `GET /api/comptabilite/pin/status`,
    `POST /api/comptabilite/pin/verify`, `PUT /api/comptabilite/pin` (changement de
    PIN avec vérification de l'ancien).
- `backend/app/schemas/schemas.py` :
  - `GenererFacturesClasseRequest` : ajout du champ `appliquer_reductions: bool = False`.

## Historique — Sections 6 (Documents) et 8 (Sécurité), terminées le 21/07/2026
- **Correction du Bug HTTP 422 sur la Section 6 (Documents PDF)** :
  - **Origine du problème** : dans `frontend/src/app/parametres/documents/page.tsx`,
    l'appel `api.put('/api/parametrage/settings', { etablissement_id, categorie, parametres })`
    envoyait un objet JSON enveloppé, alors que l'API FastAPI
    `PUT /api/parametrage/settings` attend un paramètre query `etablissement_id: int`
    et un corps JSON contenant un tableau direct de `List[ParametreCreate]`.
  - **Correction** :
    ```typescript
    await api.put(`/api/parametrage/settings?etablissement_id=${ETABLISSEMENT_ID}`, paramsToSave);
    ```
  - **Résultat** : enregistrement fonctionnel (200 OK). Build Next.js réussi (53/53 pages).
- **Section 8 — Sécurité & Gestion des Accès** :
  - Fichiers créés : `backend/app/core/security_settings.py`, `backend/app/api/securite.py`,
    `frontend/src/app/parametres/securite/page.tsx`, `Securite.module.css`.
  - Modèles SQLAlchemy ajoutés : `Role` (`ss_roles`), `Permission` (`ss_permissions`),
    `AuditLog` (`ss_audit_log`).
- **Section 6 — Documents & Bulletins PDF** :
  - Fichiers créés : `backend/app/core/documents_settings.py`,
    `frontend/src/app/parametres/documents/page.tsx`, `Documents.module.css`.

### Réutilisé sans modification
- API générique `/api/parametrage/settings` (GET/PUT, catégorie FINANCE/DOCUMENTS/SECURITE)
  — existante depuis la Phase 0, utilisée pour tous les nouveaux paramètres.
- CRUD `/api/finance/types-frais` (GET/POST/PUT/DELETE) — déjà complet côté backend,
  simplement exposé dans l'onglet "Types de frais" de la page finance.

## Tests exécutés
- Backend : `python -m py_compile` sur `finance.py`, `comptabilite.py`, `schemas.py`
  → OK (aucune erreur de syntaxe).
- `diagnostics` sur ces fichiers → uniquement du bruit de typage Pyright déjà
  présent partout dans le projet (SQLAlchemy `Column[...]` vs valeurs Python),
  pas d'erreur nouvelle liée aux changements.
- Frontend : `npx tsc --noEmit` sur tout le projet → 0 erreur.
- `diagnostics` sur `finance/page.tsx` → uniquement des warnings ESLint mineurs
  (`any`, apostrophes non échappées), cohérents avec le reste du code existant.
- **Non exécuté** : aucun test d'intégration réel contre une base de données
  (pas d'environnement Python/FastAPI actif dans ce contexte). La logique
  métier (`calculer_rang_fratrie`, `calculer_penalite`, etc.) n'a été validée
  que par lecture de code.

## Problèmes connus / points d'attention pour la suite
- Le calcul de rang de fratrie (`calculer_rang_fratrie`) suppose qu'un élève n'a
  qu'un seul parent responsable lié via `EleveParent` pour le calcul du groupe
  de frères/sœurs ; cas non testé avec des données réelles (parents séparés,
  tuteurs multiples).
- Les modes de paiement restent stockés en texte libre sur `Paiement.mode_paiement`
  (pas de contrainte DB) — la liste configurée dans `/parametres/finance` est
  indicative/UX uniquement.
- Pas de nouvelle migration DB nécessaire pour Finance/Documents/Sécurité (hors
  tables `ss_roles`/`ss_permissions`/`ss_audit_log` ajoutées pour la Section 8) :
  le reste est stocké via la table générique `ss_parametres` (Phase 0.1).
- Ce dépôt Git va être abandonné : le projet est en cours de migration vers un
  nouveau repo GitHub (`Iya2006/SMARTSCHOOL_NEW_VERSION`) pour un travail en
  équipe (branches `main` / `collaboration` / `IA-develop`). Voir
  `.ai/CURRENT_TASK.md` pour la suite du travail sur la Section 2.

## Historique — Section 2 (Calendrier), terminée le 27/07/2026
- **Backend complété** dans `backend/app/api/parametrage.py` :
  - ajout de `PUT /api/parametrage/annees/{id}` pour la modification des années scolaires ;
  - ajout du CRUD complet des périodes :
    `POST /api/parametrage/trimestres`,
    `PUT /api/parametrage/trimestres/{id}`,
    `DELETE /api/parametrage/trimestres/{id}` ;
  - `GET /api/parametrage/trimestres` utilise maintenant `response_model=List[TrimestreOut]`.
- **Schémas ajoutés** dans `backend/app/schemas/schemas.py` :
  - `AnneeScolaireUpdate`
  - `TrimestreBase`
  - `TrimestreCreate`
  - `TrimestreUpdate`
  - `TrimestreOut`
- **Frontend créé** :
  - `frontend/src/app/parametres/calendrier/page.tsx`
  - `frontend/src/app/parametres/calendrier/Calendrier.module.css`
- **Choix d’implémentation** :
  - le toggle `TRIMESTRE` / `SEMESTRE` est stocké dans `ss_parametres`
    avec la clé `calendrier.mode_decoupage` ;
  - les vacances scolaires sont stockées en JSON dans `ss_parametres`
    avec la clé `calendrier.vacances` ;
  - aucun changement de schéma SQLAlchemy ni migration DB supplémentaire n’a été
    nécessaire pour cette section.
- **Capacités UI livrées** :
  - création/modification/activation d’année scolaire ;
  - sélection de l’année active à piloter ;
  - création/modification/suppression des trimestres ou semestres ;
  - bascule visuelle du vocabulaire `trimestre` ↔ `semestre` selon le mode choisi ;
  - édition d’une liste de vacances scolaires configurable.

## Tests exécutés
- `python -m py_compile backend/app/api/parametrage.py backend/app/schemas/schemas.py`
  → OK.
- `diagnostics` sur `backend/app/schemas/schemas.py` → OK.
- `diagnostics` sur `frontend/src/app/parametres/calendrier/page.tsx` → OK.
- `diagnostics` sur `backend/app/api/parametrage.py` → uniquement du bruit Pyright
  existant sur l’usage des modèles SQLAlchemy (`Column[...]` vs valeurs Python),
  cohérent avec le reste du dépôt ; pas d’erreur de syntaxe nouvelle bloquante.
- `npx tsc --noEmit` → non exécutable dans cet environnement car le binaire
  TypeScript n’est pas installé localement (`This is not the tsc command you are looking for`).

## Problèmes connus / points d’attention pour la suite
- La table existante reste nommée `ss_trimestres` et le modèle SQLAlchemy reste
  `Trimestre` même quand le mode `SEMESTRE` est choisi ; la différence est donc
  fonctionnelle/UI et de configuration, pas structurelle en base.
- Le frontend utilise encore `ETABLISSEMENT_ID = 1` en dur, comme plusieurs
  autres pages Paramètres déjà présentes dans le projet.
- Les endpoints calendrier n’empêchent pas encore les chevauchements de dates
  entre périodes d’une même année ; une validation métier plus stricte pourra être
  ajoutée plus tard si nécessaire.

## Historique — Refonte du Dashboard Admin (hors TODO), réalisée le 27/07/2026
- **Route concernée** : `frontend/src/app/dashboard/page.tsx`
- **Constat de départ** : la route `dashboard` existait déjà, mais la page restait un tableau de bord mixte ancien style, partiellement premium, avec beaucoup de styles inline et une identité encore peu affirmée comme véritable poste de supervision central.
- **Refonte livrée** :
  - changement d’identité visible vers un **Dashboard de supervision totale** ;
  - hero principal transformé en cockpit premium avec état global, ton opérationnel et raccourcis stratégiques ;
  - ajout d’une lecture “qui parle” du système via une section **Voix du centre** et une **Console d’alerte** ;
  - réorganisation des KPIs pour mieux couvrir effectifs, finance, présence, impayés, communication et pédagogie ;
  - consolidation d’un véritable centre de contrôle avec :
    - radar financier,
    - pilotage pédagogique par cycle,
    - canaux d’encaissement,
    - poste communication,
    - impayés prioritaires,
    - agenda opérationnel,
    - activité temps réel,
    - encaissements récents,
    - effectifs par classe ;
  - conservation des données déjà exposées par `GET /api/dashboard` sans ouvrir de chantier backend supplémentaire ;
  - modal des impayés conservée mais redessinée dans l’esprit cockpit premium.
- **Aucune route renommée** n’était nécessaire : la route réelle était déjà `dashboard`. Le travail a donc porté sur l’identité visuelle, le contenu et le positionnement UX de la page.

## Tests exécutés
- `diagnostics` sur `frontend/src/app/dashboard/page.tsx` → à vérifier dans la session courante après correction des types Recharts.
- Aucun test backend nécessaire : refonte frontend basée sur l’API dashboard existante.

## Historique — Refonte AppShell / Entête / Sidebar, réalisée le 27/07/2026
- **Fichiers modifiés** :
  - `frontend/src/components/AppShell.tsx`
  - `frontend/src/components/Topbar.tsx`
  - `frontend/src/components/Topbar.module.css`
  - `frontend/src/components/Sidebar.tsx`
  - `frontend/src/components/Sidebar.module.css`
  - `frontend/src/context/UIContext.tsx`
- **Entête améliorée** :
  - topbar premium à fond flouté/statique (sticky) ;
  - meilleure hiérarchie visuelle ;
  - badge année scolaire modernisé ;
  - bouton de contrôle du menu latéral intégré à l’entête.
- **Recherche rendue fonctionnelle** :
  - la barre de recherche du header ne se contente plus d’un champ décoratif ;
  - elle propose désormais des résultats de navigation rapides vers les modules principaux ;
  - validation par `Enter` ou clic sur un résultat.
- **Sidebar refondue** :
  - menu latéral plus premium ;
  - libellé `Admin` remplacé par `Dashboard` ;
  - comportement **coulissant / collapsible** avec état compact et état étendu ;
  - ajustement dynamique du layout principal via `UIContext`.
- **Validation** : diagnostics OK sur `Topbar.tsx`, `Sidebar.tsx`, `AppShell.tsx`, `Topbar.module.css`, `Sidebar.module.css`, `UIContext.tsx`.
- **Warnings restants non bloquants** : dans `Sidebar.tsx`, un warning ESLint existant sur `any` (compteur messages) et l’usage de `<img>` au lieu de `next/image` pour le logo établissement.

## Problèmes connus / points d’attention pour la suite
- La page `dashboard` reste très riche en styles inline ; une prochaine étape utile pourrait être d’extraire cela vers un module CSS ou des composants dédiés si d’autres refontes premium sont prévues.
- Certains indicateurs “centre de contrôle” restent des lectures calculées côté frontend à partir des données déjà disponibles ; ils sont cohérents UX mais pas tous directement fournis comme métriques métier natives par le backend.
- La recherche d’entête est actuellement une navigation intelligente vers les pages principales ; elle n’exécute pas encore de recherche métier transverse en base (élèves/messages/factures).

## Historique — Refonte Personnel / rôles / redirections / portails non-admin, réalisée le 27/07/2026
- **Fichiers frontend créés / modifiés** :
  - `frontend/src/lib/roleAccess.ts`
  - `frontend/src/context/AuthContext.tsx`
  - `frontend/src/app/login/page.tsx`
  - `frontend/src/app/personnel/page.tsx`
  - `frontend/src/app/personnel/nouveau/page.tsx`
  - `frontend/src/app/personnel/portail/[role]/page.tsx`
  - `frontend/src/components/AppShell.tsx`
  - `frontend/src/app/comptabilite/layout.tsx`
- **Fichiers backend modifiés / créés** :
  - `backend/main.py`
  - `backend/app/models/academique.py`
  - `backend/app/schemas/schemas.py`
  - `backend/app/api/bibliotheque.py`
  - `backend/app/api/informatique.py`
- **Travaux effectivement livrés** :
  - centralisation de la cartographie rôle → interface → route dans `roleAccess.ts` ;
  - correction des redirections frontend par rôle pour éviter les routes fantômes ;
  - mise en place d’un guard de navigation plus fiable dans `AuthContext.tsx` ;
  - refonte premium de la page `login` ;
  - refonte premium de la page `personnel` ;
  - refonte premium de la page `personnel/nouveau` ;
  - création d’une première base de portails dédiés pour `BIBLIOTHECAIRE`, `INFORMATICIEN`, `SURVEILLANT`, `OPERATEUR` ;
  - correction d’un blocage backend `403` sur `/api/personnel` via création de `PERSONNEL_ROLES` dans `backend/main.py` ;
  - séparation explicite entre rôles admin système et rôles non-admin ;
  - isolation du shell admin : seuls `SUPER_ADMIN`, `FONDATEUR`, `DG`, `DIRECTEUR_NIVEAU`, `ADMIN` conservent l’interface système globale ;
  - création du backend bibliothèque partagé (`/api/bibliotheque`) basé sur les tables existantes `SS_OUVRAGES`, `SS_EXEMPLAIRES`, `SS_EMPRUNTS` ;
  - ajout des modèles SQLAlchemy `Ouvrage`, `Exemplaire`, `Emprunt` et des schémas Pydantic associés ;
  - refonte du portail `bibliothecaire` en espace dynamique : chargement stats/catalogue réels, ajout de livre, création automatique d’exemplaires initiaux, état vide, recherche locale et design bibliothèque plus scolaire/chaleureux ;
  - refonte du portail `surveillant` en espace dynamique connecté à `/api/vie-scolaire` : stats présences, incidents, déclaration réelle d’incident ;
  - refonte du portail `operateur` en bureau scolarité connecté à `dashboard`, `eleves`, `classes`, `enseignants` : KPIs réels, recherche de dossiers élèves, classes à orienter ;
  - création du module API informatique `/api/informatique` avec inventaire matériel et tickets de panne ;
  - ajout des modèles SQLAlchemy `EquipementInformatique` et `TicketInformatique` ;
  - refonte du portail `informaticien` en centre informatique dynamique : stats IT, inventaire réel, tickets, ajout équipement et création ticket.
- **Décision importante actée** :
  - `COMPTABLE`, `BIBLIOTHECAIRE`, `INFORMATICIEN`, `SURVEILLANT`, `OPERATEUR`, `ENSEIGNANT`, `PARENT`, `ELEVE` doivent tous disposer d’une interface dédiée hors shell admin ;
  - les rôles sans accès (`AGENT_ENTRETIEN`, `GARDIEN`, `CHAUFFEUR`, `AUTRE`) restent visibles en RH uniquement sans portail de connexion par défaut.
- **État actuel après cette étape** :
  - l’isolation structurelle admin / non-admin est posée ;
  - les portails enseignant / parent / élève existent déjà dans le projet ;
  - la comptabilité existe déjà comme espace séparé ;
  - le portail bibliothécaire n’est plus une page vitrine : il écrit/lit désormais le catalogue partagé via API ;
  - les portails `informaticien`, `surveillant`, `opérateur` ne sont plus des pages vitrines : ils lisent désormais des APIs métier réelles et proposent des actions concrètes quand le backend existe.
- **PDF de référence exploité** :
  - le fichier `docs/SmartSchool V2 Complet.pdf` a été extrait avec succès après installation de `pypdf` / `pymupdf` ;
  - extraction texte générée dans `docs/SmartSchool V2 Complet.extracted.txt` ;
  - le document confirme les rôles et responsabilités métier : Fondateur, DG, Directeur de niveau, Enseignant, Administration/Scolarité, Comptable/Caissier, Bibliothécaire, Responsable informatique/labo, Parent, Élève, Super Admin ;
  - le rôle `SURVEILLANT` du projet correspond principalement au bloc SG / absences globales / discipline ;
  - le rôle `OPERATEUR` correspond principalement au bloc Administration/Scolarité : inscriptions, dossiers, documents, annuaire, communications administratives.

## Validation récente — Portails métier internes
- Backend : `python -m py_compile backend/app/api/bibliotheque.py backend/app/api/informatique.py backend/app/models/academique.py backend/main.py` → OK.
- Diagnostics ciblés : `backend/app/api/bibliotheque.py`, `backend/app/api/informatique.py`, `backend/app/schemas/schemas.py`, `frontend/src/app/personnel/portail/[role]/page.tsx` → OK.
- `backend/main.py` garde uniquement un diagnostic Pyright préexistant sur `app.add_exception_handler(RateLimitExceeded, ...)`, sans lien avec ces ajouts.
- Frontend : `npm run type-check` → OK.
- Frontend : `npm run lint` → 0 erreur, uniquement des warnings préexistants nombreux sur l’ensemble du projet.

## Nouvelle tâche active hors TODO — Stabilisation portails et parcours critiques
Demandée après la refonte des portails internes. Le chantier rôles internes (`BIBLIOTHECAIRE`, `INFORMATICIEN`, `SURVEILLANT`, `OPERATEUR`) est mis en stand-by pour l’instant.

### Priorités signalées
- Portail enseignant : téléchargement historique sujets/documents cassé, ajout de liens externes manquant, ressources à pousser vers élèves, paiements/salaires enseignant non visibles.
- Portail élève : afficher les liens externes dans ressources, conserver/afficher l’historique des messages envoyés, aucun message ne doit disparaître.
- Portail parent : page profil ne charge pas, page paramètres/profil mal affichée à redesigner.
- Admin : téléchargement sujets enseignants en 404, page profil admin manquante/non fonctionnelle, bouton paramètres du menu header cassé.
- Dossiers admin : bouton `Contacter` élève doit ouvrir la messagerie avec destinataire préselectionné ; dossier enseignant doit supprimer le bouton `Email` et faire fonctionner le bouton message.
- Pointage tuteur/élèves : à auditer et gérer.
- Scalabilité : vérifier pagination/cache pour supporter de gros volumes multi-établissements.

### Prochaine étape exacte
Auditer les fichiers/endpoints concernés (`portail_enseignant`, `portail_eleve`, `portail_parent`, `examens`, `communication`, pages admin profils/messages) puis corriger d’abord les téléchargements 404 et le flux ressources enseignant → élève.
