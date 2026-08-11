# LOT 8 — Enseignants — Rapport de fin de lot

## Fichiers modifiés
- `backend/app/api/enseignants.py` — **les 14 routes** auditées et corrigées (fichier de 485 lignes, lu en entier).

## Fichiers non modifiés
Tout le reste. **Aucune migration Supabase** : `Enseignant.etablissement_id` existe déjà (NOT NULL) ; `Affectation` reste OWNERSHIP (dérivée via son enseignant), conformément à la classification du plan. Aucun test préexistant n'a eu besoin d'être adapté pour ce lot.

## Corrections apportées

| Route | Avant | Après |
|---|---|---|
| `GET /api/enseignants` | `etablissement_id` en query param | `Depends(require_etablissement)` |
| `GET /api/enseignants/count` | idem | idem |
| `GET /api/enseignants/{id}` | **Aucune vérification** — la fiche expose salaire, RIB, numéro CNI, adresse, date de naissance | 404 cross-école |
| `GET /api/enseignants/{id}/affectations` | Idem | 404 cross-école |
| `GET /api/enseignants/{id}/emploi-du-temps` | Idem | 404 cross-école |
| `GET /api/enseignants/{id}/dashboard-stats` | Idem | 404 cross-école |
| `PUT /api/enseignants/{id}` | Idem, modification possible (dont le salaire) | 404 cross-école |
| `DELETE /api/enseignants/{id}` | Idem, **suppression** possible | 404 cross-école |
| `POST /api/enseignants` | `etablissement_id` **obligatoire dans le body** | Valeur ignorée, remplacée par l'établissement authentifié |
| `POST /api/enseignants/{id}/affectations` | **Les 3 entités non vérifiées** (enseignant, classe, matière) — un enseignant d'une école pouvait être affecté à la classe d'une autre | Les 3 vérifiées (matière via `Cycle`, OWNERSHIP) |
| `DELETE /api/enseignants/affectations/{id}` | Aucune vérification — suppression d'une affectation de n'importe quelle école | 404 cross-école (via jointure `Enseignant`) |
| `GET /salle-des-profs/affectations-globales` | **Aucun filtre** — « globales » signifiait littéralement toute la plateforme | Restreint à l'établissement |
| `GET /salle-des-profs/classes-matieres` | Déclarait un paramètre `etablissement_id`… **jamais utilisé dans la requête** — toutes les classes de la plateforme étaient retournées quelle que soit la valeur envoyée (faux sentiment de filtrage) | `Depends(require_etablissement)` réellement appliqué |
| `GET /salle-des-profs/stats` | **Aucun filtre** — nombre d'enseignants, affectations, heures et taux de couverture calculés sur toute la plateforme | Tous les agrégats restreints à l'établissement |

Le cas le plus insidieux est `classes-matieres` : le paramètre existait dans la signature, donc le code *paraissait* filtré à la lecture rapide, alors qu'aucune clause `WHERE` ne l'utilisait.

## Incident d'infrastructure pendant ce lot (sans impact sur le code)
Docker Desktop s'est arrêté en cours de lot, puis l'installation `pip` dans le conteneur jetable a échoué deux fois sur des timeouts réseau vers PyPI. J'ai redémarré Docker et construit une **image de test locale réutilisable** (`smartschool-tests:local`, dépendances préinstallées) — les exécutions suivantes ne dépendent plus du réseau. Aucun rapport avec les corrections de ce lot ; les résultats ci-dessous proviennent d'exécutions réelles complètes.

## Tests exécutés
- Nouveau fichier `backend/tests/test_lot8_enseignants_isolation.py` — **19 tests**, tous verts : liste et count isolés, 404 cross-école sur fiche/affectations/emploi du temps/stats/modification/suppression (non-suppression et salaire inchangé vérifiés en base), accès normal fonctionnel dans sa propre école, affectation refusée si l'enseignant **ou** la classe **ou** la matière vient d'une autre école, affectation normale fonctionnelle, suppression d'affectation cross-école refusée (persistance vérifiée en base), les 3 écrans Salle des Profs isolés (affectations globales, classes-matières, stats), injection `etablissement_id` neutralisée à la création, SUPER_ADMIN plateforme refusé (403).
- Suite backend complète : **285 passed, 10 skipped, 0 échec** (266 précédents + 19 nouveaux).
- Frontend : non concerné — `tsc --noEmit` vérifié propre.

## Verdict
**GO pour le Lot 9 (Autres modules)**, sous réserve de validation. Ce lot couvre 14 fichiers (`matieres.py`, `evaluations.py`, `emploi_du_temps.py`, `promotion.py`, `annee_scolaire.py`, `reinscription.py`, `vie_scolaire.py`, `pointage_eleves.py`, `devoirs.py`, `photos.py`, `presence_agent.py`, `fournitures.py`, `evenements.py`, `activites.py`) — nettement plus volumineux que les précédents ; je propose de le traiter en plusieurs passes avec un point d'étape intermédiaire.
