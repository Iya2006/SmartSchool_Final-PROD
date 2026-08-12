# Fluidité à grande échelle + Galerie paginée + Profil admin réel — Rapport

*Branche `IYA`. Développé après la fusion `origin/main` (voir
`.ai/FUSION_MAIN_DANS_IYA_RAPPORT.md`), sur demande explicite de
l'utilisateur : le système doit rester fluide jusqu'à 1 000 000 d'élèves
par école, sans toucher au travail backend du collaborateur (notation,
comptabilité, examens) ; la page Galerie plantait à 5000 élèves ; la page
Profil admin était en grande partie factice.*

## Méthode

Audit en lecture seule d'abord (3 agents Explore en parallèle + 1 agent
Plan), plan écrit et approuvé (Plan Mode) avant tout code — voir le
fichier de plan pour le détail complet des constats. Un point de décision
produit (que faire des 3 onglets 100% factices de la page Profil) a été
posé explicitement à l'utilisateur avant d'implémenter : **retirés**
(pas juste masqués), ne restent que Profil et Sécurité.

## 1. Fluidité à grande échelle

### Nouveau fichier de migration
`backend/migrations/2026_08_perf_02_index_gestion.py` — même motif
idempotent exact que `2026_08_perf_01_index_notation.py` du collaborateur
(non modifié), 12 nouveaux index composites sur les tables
personnel/finance/vie scolaire (`ss_utilisateurs`, `ss_enseignants`,
`ss_factures`, `ss_paiements`, `ss_echeances_factures`, `ss_presences`,
`ss_incidents`), calqués sur les vrais points de filtrage du code (pas
devinés). Mirroré dans `backend/app/models/academique.py` via
`__table_args__` (même convention que le collaborateur). Exécuté sur la
base locale : 12/12 créés.

### Pagination backend ajoutée
- `personnel.py::list_personnel` — aucun `skip`/`limit` avant ce travail ;
  ajouté (défaut 50) + `X-Total-Count`.
- `classes.py::list_classes` — avait déjà `skip`/`limit` (défaut 100,
  **inchangé** : cette route sert de simple sélecteur "toutes les classes"
  à 40+ pages qui n'envoient pas ces paramètres) ; ajout additif de
  `search` + `X-Total-Count`.
- `enseignants.py::list_enseignants` — avait déjà `skip`/`limit`/`search`
  côté backend (seul le frontend ne les utilisait pas) ; ajout de
  `X-Total-Count`.
- Nouvelle route `GET /api/classes/stats` (agrégats effectif/capacité,
  jamais calculés en sommant la page affichée).
- `personnel.py::stats_personnel` étendu avec `actifs`/`avec_acces` par
  rôle (agrégats SQL), pour les mêmes raisons.

### Pagination frontend
`frontend/src/components/Pagination.tsx` (déjà utilisé par ~16 pages,
`familles/page.tsx` comme meilleur exemple) branché sur
`personnel/page.tsx` et `classes/page.tsx` (React Query, motif calqué sur
`useEleves.ts` pour le total via en-tête). `enseignants/page.tsx` :
remplacement du faux pagineur client (tranchait un lot fixe de 50 déjà
chargé — au-delà du 50e enseignant, rien n'apparaissait malgré un
pagineur qui laissait croire le contraire) par un vrai fetch par page.

**Piège trouvé et corrigé sur les trois pages** : les cartes de
statistiques ("Effectif Global", "Total Classes", "Présents"/"En Congé")
étaient calculées en sommant le tableau local `personnel`/`classes`/
`enseignants` — devenu une seule page de résultats après l'ajout de la
pagination, ces totaux auraient silencieusement cessé de représenter
toute l'école. Corrigé en les recalculant depuis les nouveaux agrégats
serveur (`/stats`), jamais depuis la page affichée.

### Corrections N+1 réelles (règle déjà documentée dans
`.ai/PROJECT_MEMORY.md` : jamais de `db.query()` dans une boucle sur des
lignes déjà chargées)
- `classes.py::list_classes` — un `COUNT` par classe pour `nb_matieres` →
  une requête groupée.
- `classes.py::get_classe_profil` — une requête `Matiere` par matière →
  préchargement `IN`.
- `vie_scolaire.py::saisie_presences_batch` — jusqu'à 2 requêtes par élève
  du lot (vérification d'appartenance + recherche de présence existante)
  → 2-3 requêtes groupées avant la boucle, même sémantique de verrouillage
  d'année préservée. La fonction `_inscription_ou_404`, devenue inutilisée
  après ce changement, a été supprimée (pas laissée en code mort).
- `photos.py::get_all_pending` — 1-2 requêtes par photo en attente
  (propriétaire + nom) → 2 requêtes groupées, détaillé en partie 2.

### Explicitement hors périmètre (signalé, pas corrigé)
- Aucun fichier `comptabilite.py`, `evaluations.py`, `examens*.py`,
  `notation.py` touché.
- Pseudo-pagination Python de `comptabilite.py`
  (`get_auxiliaire_fournisseurs`/`get_auxiliaire_parents_eleves`, tranche
  un résultat déjà entièrement chargé) — domaine du collaborateur.
- `eleves.py::delta_eleves` (sync hors-ligne) reste non paginé — mécanisme
  de fond, pas un ralentissement visible.
- `vie_scolaire.py::list_presences` reste non paginé.
- Pas de virtualisation (react-window etc.) — le projet n'utilise nulle
  part ce motif, la pagination reste l'approche établie.
- Pas de redimensionnement/miniatures d'images.

## 2. Galerie — pagination réelle (50 par page)

Vérifié avant tout changement : `/api/photos/galerie/all` et
`/api/photos/pending/all` n'avaient qu'un seul appelant chacun
(`galerie/page.tsx`) — forme de réponse changée librement.

### Backend (`backend/app/api/photos.py`)
`get_galerie` (3 requêtes SQL brutes non bornées, tout chargé d'un coup)
remplacée par :
- `GET /api/photos/galerie/meta` — statistiques + liste des classes,
  uniquement des `COUNT`, jamais de charge de ligne complète.
- `GET /api/photos/galerie/{tab}` (`eleves|enseignants|parents`) —
  `skip`/`limit` (défaut 50), `search`, `classe_code`, `filter_photo`,
  filtré côté SQL (ORM, plus en Python), `X-Total-Count`.
- `get_all_pending` — N+1 corrigé (préchargement par lot des
  élèves/parents propriétaires) + paginé (défaut 50).
- Nouvelle route légère `GET /api/photos/pending/ids` (sans jointure de
  nom) pour que le badge "photo en attente" reste exact sur tous les
  onglets même une fois la file elle-même paginée.

**Changement UX nécessaire, assumé** : l'onglet "Élèves" affichait un
accordéon groupé par classe avec TOUTES les classes ouvertes
simultanément. Avec la pagination (indispensable pour ne plus planter),
"Toutes les classes" devient une grille plate paginée ; le regroupement
par classe reste disponible en sélectionnant une classe précise.

### Frontend (`frontend/src/app/galerie/page.tsx`)
Remplacement du chargement unique (`fetchData`, tout en mémoire) par :
fetch `galerie/meta` au montage, fetch `galerie/{tab}` re-déclenché à
chaque changement de page/recherche/filtre/classe/onglet, fetch
`pending/all` paginé pour l'onglet "En attente", fetch `pending/ids` pour
les badges. Filtrage client (`matchSearch`/`matchFilter`) retiré — fait
côté serveur désormais. `<Pagination>` ajoutée.

### Vérifié contre la base réelle locale (5000 élèves, le volume exact qui
plantait avant ce travail)
```
galerie/meta   -> 200, total_eleves=5000, 19 classes (comptages seuls)
galerie/eleves -> 200, X-Total-Count=5000, 5 lignes retournées (limit=5)
```
Le problème d'origine (charger les 5000 élèves d'un coup) est confirmé
résolu sur les vraies données, pas seulement en théorie.

## 3. Profil admin — données et actions réelles

### Backend
- `photos.py::ENTITY_MAP` — 4e entrée `"personnel"` ajoutée (vérifié :
  aucun autre appelant que `photos.py` lui-même, `patch_photos.py` est un
  script mort jamais importé). `_entite_appartient_a_etablissement` et
  `upload_photo` généralisés (la branche d'écriture directe, déjà
  utilisée pour les enseignants, s'applique maintenant aussi au
  personnel — un self-upload n'a pas besoin de validation).
- `personnel.py` — nouvelle route `PUT /api/personnel/me/changer-mot-de-passe`
  (aucune collision de chemin avec `PUT /{personnel_id}`, nombre de
  segments différent), calquée sur le motif déjà fonctionnel de
  `portail_enseignant.py` (vérifie l'ancien mot de passe via
  `verify_password`, minimum 6 caractères).
- `PersonnelUpdate`/`schemas.py` volontairement **non modifié** — la photo
  passe entièrement par les routes `photos.py`, pas par ce schéma partagé.

### Frontend (`frontend/src/app/profil/page.tsx`)
- Données réelles : `GET /api/personnel/{user.id}` au lieu de
  `/api/auth/me` (qui ne renvoyait que 6 champs du JWT) + repli localStorage.
  Cas SUPER_ADMIN plateforme (aucune fiche personnel) géré proprement :
  vue minimale en lecture seule plutôt qu'un blocage de page.
- "Titre/Fonction" et "Établissement" : passés en lecture seule (le premier
  pour éviter qu'un admin s'auto-attribue un rôle supérieur via son propre
  profil ; le second vient de `useApp().etablissementNom`, déjà chargé
  ailleurs, réel).
- "Note/Bio" retirée — aucune colonne ne porte cette donnée, pas de
  migration ajoutée pour ce qui n'était pas demandé.
- Sauvegarde réelle : `PUT /api/personnel/{id}` avec uniquement
  `{nom, prenom, telephone, email}` (jamais `role`/`statut`).
- Mot de passe réel : `PUT /api/personnel/me/changer-mot-de-passe`,
  erreurs serveur affichées telles quelles.
- Photo réelle : le champ texte URL remplacé par un vrai bouton caméra +
  `<input type="file">` caché, upload multipart vers
  `POST /api/photos/upload/personnel/{id}`, aperçu mis à jour
  immédiatement.
- **3 onglets 100% factices retirés** (décision utilisateur) : Annonces
  (état local jamais persisté, remis à zéro au rafraîchissement),
  Préférences Système (interrupteurs sans aucune sauvegarde), Journal
  d'Audit (tableau de 4 lignes codées en dur). Suppression complète du
  JSX et du state associé — pas de `{false && (...)}` laissé en code mort.

## Fichiers touchés

- **Nouveau** : `backend/migrations/2026_08_perf_02_index_gestion.py`
- **Backend modifié** : `personnel.py`, `classes.py`, `vie_scolaire.py`,
  `photos.py`, `enseignants.py`, `academique.py` (mirroring `__table_args__`)
- **Frontend modifié** : `galerie/page.tsx`, `profil/page.tsx`,
  `personnel/page.tsx`, `classes/page.tsx`, `enseignants/page.tsx`
- **Test mis à jour** : `test_lot9c_modules_secondaires_isolation.py`
  (`test_galerie_isolee` adapté au nouveau contrat `/galerie/meta` +
  `/galerie/eleves`, remplaçant l'ancien `/galerie/all`)
- **Non touché, volontairement** : tout fichier `comptabilite*`,
  `notation*`, `evaluations.py`, `examens*`, `schemas.py`
  (`PersonnelUpdate` non élargi)

## Tests exécutés

- Suite backend complète (Docker `python:3.12-slim`) : **667 passed, 11
  skipped, 0 échec** (inchangé après tous ces changements).
- `npx tsc --noEmit` propre sur les 5 fichiers frontend modifiés.
- `npx vitest run` : **102/102**, aucune régression.
- Vérification fonctionnelle directe contre la base réelle locale (pas
  seulement en théorie) : `ENTITY_MAP`/`_entite_appartient_a_etablissement`
  pour `personnel`, plan de requête confirmant l'usage réel des nouveaux
  index, et surtout — le scénario exact du signalement utilisateur
  (galerie à 5000 élèves) rejoué en conditions réelles via `TestClient` :
  `galerie/meta` (comptages seuls) et `galerie/eleves` (5 lignes + 
  `X-Total-Count: 5000`) confirmés fonctionnels de bout en bout.

## Non vérifié (comme pour tout le reste de cette session)

Rendu visuel réel dans un vrai navigateur — aucun outil d'automatisation
disponible cette session. Scénario manuel recommandé pour l'utilisateur :
- Galerie : naviguer entre les pages sur l'onglet Élèves (doit rester
  fluide, 50 à la fois), changer de classe, uploader/valider/rejeter une
  photo en attente et vérifier que les compteurs se mettent à jour.
- Profil : modifier nom/téléphone, rafraîchir la page et confirmer que ça
  persiste (pas seulement le localStorage comme avant) ; changer le mot
  de passe avec un mauvais ancien mot de passe (doit être refusé) puis un
  bon ; uploader une vraie photo de profil ; confirmer que les onglets
  Annonces/Préférences/Audit ont bien disparu.
- Personnel/Classes/Enseignants : vérifier que la pagination fonctionne et
  que les cartes de statistiques en haut de page restent correctes en
  changeant de page.

## Verdict

**GO.** Le plantage de la galerie à 5000 élèves est corrigé et vérifié
avec les vraies données qui le déclenchaient. Fluidité à grande échelle
traitée par 12 nouveaux index + pagination ajoutée partout où elle
manquait réellement, sans toucher au domaine du collaborateur (notation/
comptabilité/examens). Page Profil admin entièrement reconnectée à des
données réelles (photo, mot de passe, informations), 3 onglets factices
proprement retirés sur décision explicite de l'utilisateur. 667 tests
backend / 102 tests frontend toujours verts. Reste, comme pour tout le
reste de cette session : le rendu visuel réel non vérifiable sans outil
d'automatisation navigateur.
