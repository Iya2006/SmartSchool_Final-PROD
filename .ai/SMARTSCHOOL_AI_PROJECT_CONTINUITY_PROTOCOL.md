# SMARTSCHOOL AI PROJECT CONTINUITY PROTOCOL

Tu travailles sur le projet SMART_SCHOOL_FINAL.

Le projet possède un système de continuité et de mémoire persistante situé dans le dossier `.ai/`.

Les trois fichiers importants sont :

- `.ai/TODO.md` : liste officielle des tâches du projet.
- `.ai/CURRENT_TASK.md` : tâche actuellement en cours.
- `.ai/PROJECT_MEMORY.md` : mémoire persistante du travail effectué par les agents IA.

==================================================
RÈGLE 1 — TODO.MD EST LA SOURCE PRINCIPALE DU TRAVAIL
==================================================

Au début de chaque session :

1. Lire obligatoirement `.ai/TODO.md`.
2. Lire `.ai/CURRENT_TASK.md` s'il contient déjà une tâche en cours.
3. Lire `.ai/PROJECT_MEMORY.md` s'il contient déjà des informations.

IMPORTANT :

`.ai/PROJECT_MEMORY.md` peut être complètement vide au début du projet ou au début de la première session.

S'il est vide, ne considère pas cela comme une erreur.
Commence simplement à construire la mémoire au fur et à mesure du travail.

==================================================
RÈGLE 2 — INTERPRÉTATION DE TODO.MD
==================================================

Dans `.ai/TODO.md` :

- `[x]` signifie qu'une tâche est indiquée comme terminée.
- `[ ]` signifie qu'une tâche reste à faire.

Pour chaque tâche déjà marquée `[x]` :

1. Vérifier que l'implémentation existe réellement.
2. Vérifier qu'elle fonctionne correctement.
3. Vérifier qu'elle ne présente pas d'erreur évidente.
4. Ne jamais supposer qu'une tâche est réellement terminée uniquement parce qu'elle est cochée.

Après cette vérification, identifier la prochaine tâche `[ ]` à traiter.

==================================================
RÈGLE 3 — AVANT DE COMMENCER UNE TÂCHE
==================================================

Avant toute modification du code :

1. Identifier clairement la tâche à traiter depuis `.ai/TODO.md`.
2. Mettre à jour `.ai/CURRENT_TASK.md`.
3. Documenter :
   - l'objectif de la tâche ;
   - les fichiers concernés ;
   - les étapes prévues ;
   - les éventuels risques ou dépendances.

==================================================
RÈGLE 4 — PENDANT LE TRAVAIL
==================================================

Travaille de manière méthodique.

Après chaque étape importante :

- vérifie le résultat ;
- exécute les tests appropriés lorsque cela est possible ;
- documente les problèmes rencontrés ;
- mets à jour la mémoire si l'état du projet change de manière importante.

==================================================
RÈGLE 5 — APRÈS LA FIN D'UNE TÂCHE
==================================================

Lorsqu'une tâche est réellement terminée :

1. Vérifier le code.
2. Exécuter les tests appropriés.
3. Corriger les erreurs découvertes.
4. Mettre à jour `.ai/TODO.md`.
5. Marquer la tâche `[x]` uniquement si elle est réellement terminée.
6. Mettre à jour `.ai/PROJECT_MEMORY.md`.
7. Mettre à jour `.ai/CURRENT_TASK.md`.

==================================================
RÈGLE 6 — PROJECT_MEMORY.MD
==================================================

`.ai/PROJECT_MEMORY.md` est la mémoire persistante du projet.

Elle doit progressivement contenir :

- l'état actuel du projet ;
- les tâches terminées ;
- la tâche actuellement en cours ;
- les fichiers récemment modifiés ;
- les problèmes rencontrés ;
- les erreurs connues ;
- les tests exécutés ;
- les résultats des tests ;
- les fonctionnalités partiellement terminées ;
- les prochaines étapes exactes.

Ne remplis pas inutilement la mémoire avec des informations sans importance.

L'objectif est qu'une nouvelle session puisse comprendre rapidement où le travail s'est arrêté et puisse reprendre exactement au bon endroit.

==================================================
RÈGLE 7 — SI LA SESSION OU LES TOKENS RISQUENT DE SE TERMINER
==================================================

Si tu détectes que ta session, ton contexte ou tes tokens risquent de devenir insuffisants :

ARRÊTE immédiatement toute nouvelle implémentation non essentielle.

Avant que la session ne se termine, mets à jour immédiatement :

1. `.ai/PROJECT_MEMORY.md`
2. `.ai/CURRENT_TASK.md`
3. `.ai/TODO.md` si l'état de la tâche a changé

Documente précisément :

- ce qui est terminé ;
- ce qui est partiellement terminé ;
- le dernier fichier modifié ;
- la dernière fonction ou section modifiée ;
- la prochaine action exacte à effectuer ;
- les erreurs éventuelles ;
- les tests restant à exécuter ;
- les problèmes non résolus.

NE LAISSE JAMAIS une tâche partiellement implémentée sans documenter précisément où reprendre.

==================================================
RÈGLE 8 — REPRISE D'UNE NOUVELLE SESSION
==================================================

Lorsqu'une nouvelle session commence :

1. Lire `.ai/TODO.md`.
2. Lire `.ai/CURRENT_TASK.md`.
3. Lire `.ai/PROJECT_MEMORY.md`.
4. Déterminer exactement où la session précédente s'est arrêtée.
5. Reprendre à partir de la prochaine action documentée.

Ne recommence pas inutilement une analyse complète du projet si les fichiers de continuité contiennent déjà les informations nécessaires.

==================================================
RÈGLE 9 — PRIORITÉ
==================================================

La continuité du projet est prioritaire.

Une tâche partiellement terminée mais correctement documentée est préférable à une tâche commencée puis laissée sans aucune trace.

La mémoire doit être mise à jour avant la fin de toute session importante.