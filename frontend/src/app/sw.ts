/// <reference lib="webworker" />
/**
 * Service Worker — app shell hors-ligne (remplace next-pwa, incompatible
 * avec Turbopack — voir next.config.ts). Ne remplace PAS la file offline
 * notes/présences (lib/offlineQueue.ts + lib/syncEngine.ts), qui n'a jamais
 * dépendu du Service Worker et continue de fonctionner indépendamment.
 *
 * Règle volontaire (docs/module-offlineFirst.md §22) : ne pas mettre
 * aveuglément toutes les réponses API en cache. Les routes financières,
 * comptables, d'authentification et de sécurité/permissions ne passent
 * jamais par ce cache — cohérent avec la décision déjà actée
 * ("comptabilité = connexion requise").
 *
 * Ce fichier est exclu du tsconfig principal (voir tsconfig.json) : les
 * globals "webworker" (self, ServiceWorkerGlobalScope...) et "dom" (le
 * reste de l'app) sont mutuellement incompatibles dans un même programme
 * TypeScript. @serwist/next compile ce fichier séparément (compileSrc),
 * donc l'exclure ne change rien à la génération réelle du Service Worker.
 *
 * Étape I : la liste des routes sensibles n'est plus dupliquée ici — elle
 * vient de lib/offlinePolicy.ts (registre formel, seule source de vérité),
 * vérifiée par src/tests/offlinePolicy.test.ts.
 */
import type { PrecacheEntry, RuntimeCaching, SerwistGlobalConfig } from "serwist";
import {
    CacheableResponsePlugin,
    CacheFirst,
    ExpirationPlugin,
    NetworkFirst,
    NetworkOnly,
    Serwist,
    StaleWhileRevalidate,
} from "serwist";
import { isOnlineOnlyPath } from "../lib/offlinePolicy";

declare global {
    interface WorkerGlobalScope extends SerwistGlobalConfig {
        __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
    }
}

declare const self: ServiceWorkerGlobalScope;

const runtimeCaching: RuntimeCaching[] = [
    {
        // Jamais de cache, lecture ou écriture, sur les routes ONLINE_ONLY
        // (voir lib/offlinePolicy.ts).
        matcher: ({ url, sameOrigin }) => sameOrigin && isOnlineOnlyPath(url.pathname),
        handler: new NetworkOnly(),
    },
    {
        // Lectures API : réseau prioritaire (données à jour), bascule sur le
        // cache si le serveur ne répond pas sous 3s ou pas du tout — permet à
        // une page déjà visitée de continuer à afficher les dernières données
        // connues hors-ligne. N'intercepte que les GET — les écritures
        // (POST/PUT/DELETE) ne passent jamais par ce cache, elles sont gérées
        // par la file offline (lib/offlineQueue.ts + lib/syncEngine.ts).
        matcher: ({ url, sameOrigin }) => sameOrigin && url.pathname.startsWith("/api/"),
        method: "GET",
        handler: new NetworkFirst({
            cacheName: "smartschool-api-cache",
            networkTimeoutSeconds: 3,
            plugins: [
                new ExpirationPlugin({ maxEntries: 300, maxAgeSeconds: 24 * 60 * 60 }),
                new CacheableResponsePlugin({ statuses: [0, 200] }),
            ],
        }),
    },
    {
        matcher: ({ request }) => request.destination === "image",
        handler: new CacheFirst({
            cacheName: "smartschool-images",
            plugins: [new ExpirationPlugin({ maxEntries: 200, maxAgeSeconds: 30 * 24 * 60 * 60 })],
        }),
    },
    {
        matcher: ({ request }) => ["style", "script", "font"].includes(request.destination),
        handler: new StaleWhileRevalidate({ cacheName: "smartschool-static-resources" }),
    },
    {
        // App shell : permet à l'application de démarrer même sans connexion.
        matcher: ({ request }) => request.mode === "navigate",
        handler: new NetworkFirst({ cacheName: "smartschool-pages", networkTimeoutSeconds: 3 }),
    },
];

const serwist = new Serwist({
    precacheEntries: self.__SW_MANIFEST,
    skipWaiting: true,
    clientsClaim: true,
    navigationPreload: true,
    runtimeCaching,
    fallbacks: {
        entries: [
            {
                url: "/hors-ligne",
                matcher({ request }) {
                    return request.destination === "document";
                },
            },
        ],
    },
});

// Précache la page de repli hors-ligne indépendamment du scan de public/
// (elle vit sous src/app/, pas dans public/) — nécessaire pour que le
// fallback ci-dessus puisse la servir dès le premier accès sans réseau.
serwist.addToPrecacheList([{ url: "/hors-ligne", revision: "1" }]);

serwist.addEventListeners();
