Module Offline First – SmartSchool (PWA)
Objectif

Permettre à tous les utilisateurs autorisés (administration, direction, enseignants, comptabilité, secrétariat...) de continuer à travailler normalement en cas de coupure Internet, puis synchroniser automatiquement les données dès que la connexion revient.

Les parents et élèves, dont les actions sont principalement consultatives, pourront bénéficier d'un cache des dernières données disponibles, mais les opérations critiques resteront synchronisées avec le serveur.

1. Architecture Offline
Utilisateur

↓

PWA (Next.js)

↓

Service Worker

↓

IndexedDB (Base locale)

↓

Sync Engine

↓

API FastAPI

↓

PostgreSQL
2. Technologies
Frontend
Next.js (PWA)
Service Worker
IndexedDB
Workbox
React Query ou TanStack Query
Zustand ou Redux Toolkit
Dexie.js (surcouche IndexedDB)
Backend
FastAPI
PostgreSQL
Redis
RabbitMQ (ou Redis Streams)
Cloudflare R2
3. Données stockées localement

Toutes les données n'ont pas vocation à être téléchargées.

On conserve uniquement ce qui est nécessaire au fonctionnement de l'utilisateur connecté.

Directeur
Tableau de bord
Élèves
Personnel
Paiements
Classes
Notifications
Comptable
Élèves
Paiements
Reçus
Historique récent
Tarification
Enseignant
Classes
Matières
Élèves
Notes
Présences
Emploi du temps
Secrétaire
Inscriptions
Élèves
Parents
Documents administratifs
Parents
Dernières notes
Derniers paiements
Dernières absences
Dernières notifications
4. IndexedDB

Chaque module possède sa propre collection locale.

Exemple :

students

teachers

classes

grades

attendance

payments

notifications

users

settings

offline_queue
5. Offline Queue Locale

Toutes les modifications sont enregistrées localement.

Exemple

Modifier une note

↓

offline_queue

↓

Connexion retrouvée

↓

Synchronisation automatique

Chaque élément possède :

ID unique
type d'action
utilisateur
école
date
version
état
nombre de tentatives
6. Moteur de Synchronisation

Le Sync Engine fonctionne en permanence.

Il détecte :

retour de connexion
changement de réseau
ouverture de l'application
synchronisation planifiée

Puis :

envoie les nouvelles données
récupère les nouvelles données du serveur
met à jour IndexedDB
vide la file locale
7. Gestion des conflits

Chaque enregistrement contient :

id

updated_at

updated_by

version

Lors de la synchronisation :

Si personne n'a modifié la donnée :

→ Synchronisation automatique.

Si plusieurs utilisateurs ont modifié la même donnée :

→ Détection du conflit.

Selon le type de donnée :

dernière modification (Last Write Wins) pour les données simples ;
fusion automatique quand c'est possible ;
résolution manuelle pour les données sensibles (par exemple une note ou un paiement).

Toutes les résolutions sont tracées dans l'audit.

8. Cache intelligent

Les données fréquemment utilisées restent en mémoire.

Exemple :

liste des classes
enseignants
matières
paramètres
années scolaires

Le cache est rafraîchi automatiquement.

9. Synchronisation des médias

Les photos et documents sont stockés temporairement.

Pendant le mode hors ligne :

Photo

↓

Stockage local

↓

Synchronisation

↓

Cloudflare R2

↓

URL enregistrée dans PostgreSQL
10. Service Worker

Le Service Worker met en cache :

HTML
CSS
JavaScript
Icônes
Polices
Images statiques

L'application peut ainsi démarrer même sans connexion.

11. Modes de fonctionnement
Mode connecté

Toutes les données proviennent du serveur.

Le cache est mis à jour.

Mode dégradé

Connexion lente.

Lecture locale.

Synchronisation progressive.

Mode hors ligne

Toutes les opérations autorisées sont réalisées localement.

La synchronisation est différée.

12. Données non autorisées hors ligne

Certaines opérations doivent obligatoirement contacter le serveur.

Exemple :

changement de mot de passe
activation d'un abonnement
paiement en ligne
administration globale de la plateforme
création d'une nouvelle école
13. Sécurité locale

Les données stockées dans IndexedDB doivent être protégées.

Chiffrement des données sensibles (par exemple avec Web Crypto API).
Expiration automatique des sessions.
Suppression des données locales après déconnexion.
Possibilité d'effacement à distance lors de la prochaine connexion si un appareil est déclaré compromis.
14. Synchronisation intelligente

Au lieu de télécharger toute la base :

Dernière synchronisation

↓

07/08/2026 14:32

↓

Télécharger uniquement les nouveautés

Le serveur envoie uniquement les modifications.

15. Compression

Les échanges utilisent :

Gzip
Brotli
compression des images
compression des réponses JSON
16. File d'attente serveur

À distinguer de la file locale.

Une fois les données synchronisées :

IndexedDB

↓

API

↓

PostgreSQL

↓

RabbitMQ

↓

Workers

↓

Emails

SMS

Notifications

PDF

OCR

Exports

L'utilisateur n'attend jamais les traitements lourds.

17. Redis

Redis ne gère pas le mode hors ligne.

Il sert uniquement à :

cache
sessions
permissions
OTP
rate limiting
verrous distribués
statistiques
présence des utilisateurs
données fréquemment consultées
18. Monitoring

Le moteur de synchronisation doit être surveillé.

On suit notamment :

nombre d'actions en attente
durée moyenne de synchronisation
conflits détectés
erreurs de synchronisation
tentatives échouées
état des workers
santé des bases de données
19. Expérience utilisateur

L'utilisateur doit toujours savoir où en est l'application.

Prévoir un indicateur de statut :

🟢 En ligne – Synchronisation en temps réel

🟡 Connexion instable – Synchronisation différée

🔴 Hors ligne – Les modifications sont enregistrées localement

Lors du retour d'Internet :

une notification indique que la synchronisation est en cours ;
une confirmation s'affiche lorsque toutes les données sont synchronisées.