# 🎯 TÂCHE EN COURS

Aucune tâche en cours.

## Dernière tâche réellement terminée et vérifiée
- **Section :** 🔒 SECTION 8 — Sécurité & Gestion des Accès (Priorité 8)
- **Terminée le :** 21/07/2026
- **Sous-tâches :** 8.1 à 8.7 (7/7)
- Sections 6 (Documents) et 7 (Finance) sont également terminées et vérifiées par lecture de code.

## ⚠️ Correction importante (21/07/2026)
Un conflit de fusion Git non résolu (marqueurs `<<<<<<< HEAD` / `=======` / `>>>>>>>`)
a été trouvé dans `.ai/TODO.md`, `.ai/CURRENT_TASK.md` et `.ai/PROJECT_MEMORY.md`.
En le résolvant, une vérification du code réel a montré que la **Section 2 —
Gestion Années & Trimestres** avait été cochée `[x]` par erreur alors qu'elle
n'est **pas implémentée** :
- La page `frontend/src/app/parametres/calendrier/page.tsx` n'existe pas.
- Le backend (`backend/app/api/parametrage.py`) ne contient que `list_annees`,
  `create_annee`, `activer_annee`, `list_trimestres` — pas de update/delete
  années, pas de CRUD trimestres complet, pas de stockage des vacances
  scolaires, pas de toggle Semestre/Trimestre.

`.ai/TODO.md` a été corrigé : Section 2 (2.1 à 2.5) recochée `[ ]`.
Progression globale réelle : **75/101 tâches (74%)**.

## Prochaine tâche à traiter
**📅 SECTION 2 — Gestion Années & Trimestres (Priorité 6)**
- Page à créer : `frontend/src/app/parametres/calendrier/page.tsx`
- Backend à compléter dans `backend/app/api/parametrage.py` :
  - Ajouter `update_annee` (PUT `/annees/{id}`)
  - Ajouter CRUD complet des trimestres (create/update/delete)
  - Ajouter un stockage des vacances scolaires (probablement via
    `ss_parametres`, catégorie `CALENDRIER`, en JSON — même pattern que
    `FINANCE`/`SECURITE`/`DOCUMENTS`)
  - Ajouter un toggle Semestre vs Trimestre (même pattern `ss_parametres`)

À remplir avec l'objectif détaillé, les fichiers concernés, les étapes prévues
et les risques dès que cette tâche démarre réellement (voir RÈGLE 3 du
protocole).
