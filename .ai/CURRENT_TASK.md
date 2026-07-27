# 🎯 TÂCHE EN COURS

## Tâche active
**Stabilisation urgente des portails enseignant / élève / parent / admin et parcours critiques (hors TODO.md)**

### Objectif
Corriger les dysfonctionnements signalés sur les portails déjà existants afin que le système soit prêt à l’usage : téléchargements de sujets/documents, ressources partagées enseignant→élève, messagerie, profils, paramètres, boutons de contact et parcours admin.

### Décision de périmètre
- Le chantier des rôles internes (`BIBLIOTHECAIRE`, `INFORMATICIEN`, `SURVEILLANT`, `OPERATEUR`) est mis en stand-by après les dernières refontes dynamiques.
- Pour l’instant, les rôles système prioritaires restent : `FONDATEUR`, `DG`, `ADMIN` côté interface admin globale.
- Les portails historiques à stabiliser sont prioritaires : enseignant, élève, parent et admin.
- Ne pas travailler dans `.ai/TODO.md` pour cette tâche.

### Problèmes à traiter
1. **Portail enseignant — documents / partages**
   - Le téléchargement dans l’historique des sujets/documents ne fonctionne pas.
   - Il manque une action pour ajouter des liens externes aux élèves.
   - Les liens externes ajoutés par l’enseignant doivent apparaître automatiquement côté élève dans les ressources.
   - Les informations de paiements/salaire de l’enseignant ne sont pas visibles.

2. **Portail élève**
   - Les ressources doivent afficher les liens externes envoyés par l’enseignant.
   - L’historique des messages envoyés par l’élève ne s’affiche pas correctement dans la messagerie.
   - Un message envoyé ne doit jamais disparaître.

3. **Portail parent**
   - La page profil ne se charge pas.
   - La page paramètres/profil est mal affichée et doit être redesignée proprement.

4. **Admin**
   - Les sujets envoyés par les enseignants donnent une erreur 404 au téléchargement.
   - La page profil admin manque / ne fonctionne pas et doit être créée/refondue de façon professionnelle.
   - Le bouton paramètres dans le menu utilisateur du header ne fonctionne pas.

5. **Dossiers élèves / enseignants côté admin**
   - Dans le dossier élève, le bouton `Contacter` doit ouvrir la messagerie avec l’élève ou son destinataire préselectionné.
   - Dans le dossier enseignant, supprimer le bouton `Email`.
   - Dans le dossier enseignant, le bouton message doit ouvrir la messagerie avec l’enseignant préselectionné.

6. **Pointage tuteur / élèves**
   - Le pointage personnel fonctionne, mais le pointage tuteur/élèves n’est pas encore géré. À auditer puis implémenter ou cadrer proprement selon l’existant.

7. **Scalabilité / pagination**
   - Vérifier que les pages concernées respectent la pagination et ne chargent pas inutilement des volumes énormes.
   - Garder en tête le scénario multi-établissements avec millions de données.

### Fichiers potentiellement concernés
- `frontend/src/app/portail-enseignant/**`
- `frontend/src/app/portail-eleve/**`
- `frontend/src/app/portail-parent/**`
- `frontend/src/app/enseignants/**`
- `frontend/src/app/eleves/**`
- `frontend/src/app/messages/**` ou pages de communication existantes
- `frontend/src/components/Topbar*`
- `frontend/src/app/profil/**` ou nouvelle route profil admin
- `backend/app/api/portail_enseignant.py`
- `backend/app/api/portail_eleve.py`
- `backend/app/api/portail_parent.py`
- `backend/app/api/examens.py`
- `backend/app/api/communication.py`
- `backend/app/api/devoirs.py`
- `backend/app/api/photos.py`
- éventuels modèles/schémas nécessaires
- `.ai/CURRENT_TASK.md`
- `.ai/PROJECT_MEMORY.md`

### Stratégie
1. Auditer les endpoints et pages existants avant modification.
2. Corriger d’abord les téléchargements 404, car ils impactent enseignant/admin.
3. Brancher les liens externes enseignant → ressources élève.
4. Corriger la messagerie élève pour conserver et afficher l’historique.
5. Corriger/redesigner profils et paramètres parent/admin.
6. Corriger les boutons de contact admin.
7. Vérifier pagination et validation TypeScript/backend.

### Règle mémoire importante
Mettre à jour `.ai/CURRENT_TASK.md` et `.ai/PROJECT_MEMORY.md` régulièrement, surtout avant une limite de contexte/tokens ou une interruption possible.
