# LOT 6 — Élèves — Rapport de fin de lot

## Fichiers modifiés
- `backend/app/api/eleves.py` — **les 11 routes** auditées et corrigées (fichier de 794 lignes, lu en entier).
- `backend/tests/test_eleves.py`, `backend/tests/test_eleves_delta.py` — helpers de token mis à jour (ajout d'`etablissement_id`), même correctif que Lots 2/3/4.

## Fichiers non modifiés
Tout le reste. **Aucune migration Supabase** : `Eleve.etablissement_id` existe déjà (NOT NULL), aucun changement de schéma nécessaire pour ce lot.

## Corrections apportées

| Route | Avant | Après |
|---|---|---|
| `GET /api/eleves` | `etablissement_id` en query param (choisissable librement) | `Depends(require_etablissement)` |
| `GET /api/eleves/count` | idem | idem |
| `GET /api/eleves/delta` | idem (synchro offline — la fuite se serait propagée dans IndexedDB côté client) | idem |
| `GET /api/eleves/{id}` | **Aucune vérification** — dossier complet (identité, adresse, contact d'urgence, groupe sanguin, allergies) de n'importe quel élève lisible en devinant l'ID | Filtre `etablissement_id`, 404 cross-école |
| `PUT /api/eleves/{id}` | Idem, modification possible | Idem, 404 cross-école |
| `DELETE /api/eleves/{id}` | Idem, **suppression physique** possible | Idem, 404 cross-école |
| `GET /api/eleves/{id}/inscriptions` | Idem (historique scolaire complet) | Idem, 404 cross-école |
| `GET /api/eleves/{id}/dossier/{insc_id}` | Idem (bulletins, absences, incidents disciplinaires) | Idem, 404 cross-école |
| `GET /api/eleves/{id}/certificat-scolarite/pdf` | Idem — **document officiel** générable pour l'élève de n'importe quelle école | Idem, 404 cross-école |
| `POST /api/eleves` | `EleveBase.etablissement_id` obligatoire **dans le body** — le client choisissait l'école | Valeur du body ignorée, remplacée par l'établissement authentifié |
| `POST /api/eleves/inscription-complete` | Idem + `classe_id` jamais vérifié | Idem + classe vérifiée appartenir à l'établissement |

**Injection de classe cross-école** (2 sites) : `PUT /{id}` et `POST /inscription-complete` acceptaient un `classe_id` sans vérification — un élève pouvait être rattaché à la classe d'une autre école, **en incrémentant au passage l'effectif de cette classe** (corruption de données cross-tenant, pas seulement une fuite en lecture). Corrigé aux deux endroits.

## Anomalie préexistante trouvée, corrigée de façon minimale (transparence)
`InscriptionCompleteData.date_naissance` est typé `str` (contrairement à `EleveBase` qui utilise `date`) et était passé tel quel à une colonne SQL `Date`. **Vérifié réellement** (insertion en transaction annulée sur le vrai Supabase, aucune donnée écrite) : PostgreSQL/pg8000 **accepte** une chaîne ISO — la route fonctionne donc en production ; seul SQLite (utilisé par les tests) la refuse. Il s'agit d'un bug de **portabilité** préexistant, sans rapport avec l'isolation.

Je l'ai corrigé (3 lignes : conversion ISO → `date`, 400 si format invalide) **uniquement parce qu'il empêchait matériellement d'écrire le test de sécurité de cette route** (injection d'`etablissement_id` dans le body, explicitement exigé par la consigne). Aucun changement de comportement en production : même valeur stockée. Signalé ici plutôt que passé sous silence, conformément à la règle sur les anomalies structurelles.

## Point de comportement à connaître (sans action requise)
Le frontend envoie encore `?etablissement_id=...` sur plusieurs appels (`useEleves.ts`, page communication, portail personnel, rapports comptabilité). FastAPI **ignore silencieusement** les paramètres de requête inconnus : ces appels continuent de fonctionner, et la valeur envoyée est désormais **sans effet** — exactement la propriété de sécurité recherchée. Aucune modification frontend nécessaire (règle de non-régression respectée).

Note de traçabilité : le test préexistant `test_eleves_delta.py::test_suppression_isolee_par_etablissement` supprimait un élève d'une autre école pour vérifier que son tombstone n'apparaissait pas dans le delta. Ce DELETE cross-école est désormais **refusé (404)** — le test passe toujours, mais pour une raison plus forte qu'auparavant.

## Tests exécutés
- Nouveau fichier `backend/tests/test_lot6_eleves_isolation.py` — **15 tests**, tous verts : liste/count/delta isolés, 404 cross-école sur détail/modification/suppression/historique/dossier/certificat PDF, non-suppression effective vérifiée en base, accès normal dans sa propre école, injection `etablissement_id` neutralisée sur les 2 routes de création, classe d'une autre école refusée sur `inscription-complete` et sur `PUT /{id}`, SUPER_ADMIN plateforme refusé (403).
- Suite backend complète : **247 passed, 10 skipped, 0 échec** (232 précédents + 15 nouveaux).
- Frontend : non concerné — `tsc --noEmit` vérifié propre.

## Verdict
**GO pour le Lot 7 (Classes)**, sous réserve de validation.
