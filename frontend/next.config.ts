import type { NextConfig } from "next";
import path from "path";

// @ts-expect-error next-pwa does not have perfect TS definitions
import withPWAInit from "next-pwa";

// Le Service Worker est normalement désactivé en dev (Turbopack fait déjà du
// hot-reload, les deux ne font pas bon ménage). NEXT_PUBLIC_PWA_DEV=1 permet
// de l'activer volontairement en local le temps de tester le mode hors-ligne
// (couper le réseau via DevTools) — voir docs/guides/guide_test_offline.html.
const pwaForcedInDev = process.env.NEXT_PUBLIC_PWA_DEV === "1";

const withPWA = withPWAInit({
  dest: "public",
  disable: process.env.NODE_ENV === "development" && !pwaForcedInDev,
  register: true,
  skipWaiting: true,
  runtimeCaching: [
    {
      // Lectures API : réseau prioritaire (données à jour), bascule sur le
      // cache si le serveur ne répond pas sous 3s ou pas du tout — c'est ce
      // qui permet à une page déjà visitée de continuer à afficher les
      // dernières données connues hors-ligne (mode dégradé/hors-ligne, voir
      // le guide fourni §11). N'intercepte que les GET (comportement par
      // défaut de Workbox) — les écritures (POST/PUT/DELETE) ne passent
      // jamais par ce cache, elles sont gérées par la file offline
      // (lib/offlineQueue.ts + lib/syncEngine.ts), jamais par le Service
      // Worker.
      urlPattern: ({ url }: { url: URL }) => url.pathname.startsWith("/api/"),
      handler: "NetworkFirst",
      options: {
        cacheName: "smartschool-api-cache",
        networkTimeoutSeconds: 3,
        expiration: { maxEntries: 300, maxAgeSeconds: 24 * 60 * 60 },
        cacheableResponse: { statuses: [0, 200] },
      },
    },
    {
      urlPattern: ({ request }: { request: Request }) => request.destination === "image",
      handler: "CacheFirst",
      options: {
        cacheName: "smartschool-images",
        expiration: { maxEntries: 200, maxAgeSeconds: 30 * 24 * 60 * 60 },
      },
    },
    {
      urlPattern: ({ request }: { request: Request }) =>
        ["style", "script", "font"].includes(request.destination),
      handler: "StaleWhileRevalidate",
      options: { cacheName: "smartschool-static-resources" },
    },
    {
      // App shell : permet à l'application de démarrer même sans connexion
      // (guide §10).
      urlPattern: ({ request }: { request: Request }) => request.mode === "navigate",
      handler: "NetworkFirst",
      options: { cacheName: "smartschool-pages", networkTimeoutSeconds: 3 },
    },
  ],
});

const nextConfig: NextConfig = {
  reactCompiler: true,
  turbopack: {
    root: path.resolve(__dirname),
  },
};

export default withPWA(nextConfig);
