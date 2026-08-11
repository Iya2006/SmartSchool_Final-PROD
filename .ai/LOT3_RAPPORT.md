# LOT 3 — Personnel — Rapport de fin de lot

## Fichiers modifiés
- `backend/app/api/personnel.py` — les 7 routes corrigées (fichier de 235 lignes, entièrement audité).

## Fichiers non modifiés
Tout le reste. Aucune migration Supabase (la colonne `etablissement_id` existe déjà sur `ss_utilisateurs`, nullable — voir Lot 0).

## Corrections apportées

`personnel.py` gère la table `ss_utilisateurs`, **partagée avec les comptes admin/SUPER_ADMIN** (voir Lot 0) — les IDOR ici sont donc particulièrement critiques : un DELETE ou UPDATE cross-école pouvait aller jusqu'à supprimer ou modifier le compte administrateur d'une autre école.

| Route | Avant | Après |
|---|---|---|
| `GET /api/personnel` | `etablissement_id` en query param **obligatoire**, jamais vérifié contre le compte authentifié | `Depends(require_etablissement)` |
| `GET /api/personnel/stats` | idem | idem |
| `GET /api/personnel/salaires/liste` | idem | idem |
| `GET /api/personnel/{id}` | **Aucune vérification d'établissement** — n'importe quelle fiche RH (RIB, CNI, salaire, adresse) de n'importe quelle école lisible en devinant l'ID | Filtre `etablissement_id` ajouté, 404 cross-école |
| `PUT /api/personnel/{id}` | Idem, modification possible | Idem, 404 cross-école |
| `PATCH /api/personnel/{id}/statut` | Idem | Idem, 404 cross-école |
| `DELETE /api/personnel/{id}` | Idem — **suppression possible d'un compte d'une autre école, y compris potentiellement son admin** | Idem, 404 cross-école |
| `POST /api/personnel` | `PersonnelBase.etablissement_id` **obligatoire dans le body** — le client choisissait librement l'école propriétaire du compte créé | Valeur du body ignorée, remplacée par l'établissement authentifié |

## Anomalie préexistante trouvée en testant (non corrigée, hors périmètre)
`Utilisateur.mot_de_passe` est `NOT NULL` en base, mais le docstring de `create_personnel` affirme explicitement : *"Si mot_de_passe absent → staff technique sans accès (nettoyeurs, gardiens…)"*. En pratique, créer aujourd'hui un membre du personnel sans mot de passe lève une `IntegrityError` (500), pas le comportement documenté. **Bug fonctionnel préexistant, sans rapport avec l'isolation multi-écoles** — non corrigé dans ce lot (règle de non-régression : ne pas élargir le périmètre). Signalé ici pour trace ; à corriger séparément si confirmé gênant en usage réel.

## Tests exécutés
- Nouveau fichier `backend/tests/test_lot3_personnel_isolation.py` — **10 tests**, tous verts : liste/stats/salaires isolés par établissement, 404 cross-école sur détail/update/statut/delete, non-suppression effective vérifiée en base, suppression fonctionnelle dans sa propre école, injection `etablissement_id` dans le body de création neutralisée, SUPER_ADMIN plateforme refusé (403).
- Suite backend complète : **201 passed, 10 skipped, 0 échec** (191 précédents + 10 nouveaux).
- Frontend : non concerné — `tsc --noEmit` vérifié propre.

## Verdict
**GO pour le Lot 4 (Examens)**, sous réserve de validation.
