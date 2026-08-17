# Chiffrement du cache React Query persisté — 17/08/2026

## Contexte

Investigation précédente (voir historique de session) : `lib/localEncryption.ts`
existait déjà (chiffrement AES-GCM, clé dérivée du JWT via HKDF, jamais
persistée) mais protégeait uniquement `hooks/useElevesDeltaCache.ts` — un
pilote testé mais jamais branché dans une page réelle. Le cache **réellement
utilisé** par toute l'app (`useEleves.ts`, toute page sous `useQuery`, via
`components/QueryProvider.tsx`) transitait en clair dans
`localStorage['smartschool-query-cache']` pendant toute session active —
adresse, groupe sanguin, date de naissance inclus.

## Fonctionnalité développée

Le cache React Query persisté est maintenant chiffré, en réutilisant
`lib/localEncryption.ts` sans le modifier.

## Pourquoi un nouveau paquet a été nécessaire

`createSyncStoragePersister` (utilisé avant) est **deprecié côté TanStack**
et surtout n'accepte que des `serialize`/`deserialize` **synchrones** —
incompatible avec Web Crypto (intrinsèquement async). `createAsyncStoragePersister`
est le variant officiel de la même famille `@tanstack/query-persist-client-core`,
conçu précisément pour ce cas ; c'est le seul changement structurel, le
stockage sous-jacent reste `window.localStorage`.

## Fichiers modifiés

- `frontend/src/components/QueryProvider.tsx` — `createSyncStoragePersister`
  → `createAsyncStoragePersister` ; ajout de `serialize()`/`deserialize()`
  (exportées, testables) qui appellent `encryptValue`/`decryptValue` de
  `lib/localEncryption.ts` — **non modifié**.

## Fichiers créés

- `frontend/src/tests/queryProviderEncryption.test.ts` — 5 tests, vraie Web
  Crypto (pas mockée) : round-trip, absence de donnée en clair dans la
  chaîne persistée, refus de persister sans session, rejet propre sur
  session différente, rejet propre sur un ancien cache non chiffré
  (migration automatique : au premier chargement après déploiement, l'ancien
  cache en clair échoue au déchiffrement, est écarté, resynchronisation
  complète depuis le serveur — comportement déjà prévu par
  `localEncryption.ts`, pas de migration à écrire).

## Dépendances

- Ajoutée : `@tanstack/query-async-storage-persister@5.101.4` (même version
  que le reste de la famille `@tanstack/react-query` déjà utilisée).
- Retirée : `@tanstack/query-sync-storage-persister` (devenue inutilisée,
  confirmé par recherche exhaustive avant suppression).

## Architecture touchée

Offline/PWA : oui, uniquement `QueryProvider.tsx`. **Non touchés** :
`offlineQueue.ts`, `syncEngine.ts`, `sw.ts`, `offlinePolicy.ts`,
`deltaSync.ts`, `useElevesDeltaCache.ts`, `localEncryption.ts`,
`lib/queryClient.ts`, `lib/sessionCleanup.ts`, `AuthContext.tsx` (la purge
au logout fait un `removeItem` simple, indifférent au format du contenu).

## Tests réalisés

- `tsc --noEmit` : propre.
- `vitest run` : 107/107 verts (102 existants + 5 nouveaux), aucune
  régression sur les suites offline existantes (`offlineQueue.test.ts`,
  `offlinePolicy.test.ts`, `deltaSync.test.ts`, `useElevesDeltaCache.test.ts`,
  `localEncryption.test.ts`, `api.offlineQueueing.test.ts`,
  `sessionCleanup.test.ts`).
- `next build` : propre, Service Worker toujours généré.
- **Non testé** : rendu dans un vrai navigateur (pas d'outil disponible ici).
  Le round-trip chiffrement/déchiffrement est vérifié avec la vraie Web
  Crypto API (Node/jsdom), mais le parcours complet utilisateur (login →
  navigation → coupure réseau → rechargement → données toujours affichées)
  reste à confirmer en conditions réelles.

## Risques restants

- Le paquet retiré (`query-sync-storage-persister`) n'est plus dans
  `package.json`/`package-lock.json` — si un autre développeur l'utilisait
  ailleurs sans que la recherche l'ait détecté, un `npm install` échouerait
  clairement (pas un risque silencieux).
- La menace explicitement hors périmètre (documentée dans
  `localEncryption.ts` dès le départ) reste la même : du JavaScript
  malveillant exécuté dans l'origine de l'app aurait accès au même token
  que ce module, donc à la même clé dérivée. Le chiffrement protège contre
  l'inspection du stockage par quelqu'un sans session active (poste
  partagé), pas contre une compromission XSS de l'app elle-même.
