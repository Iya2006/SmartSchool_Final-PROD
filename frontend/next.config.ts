import type { NextConfig } from "next";
import path from "path";

import withSerwistInit from "@serwist/next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

// Le Service Worker est normalement désactivé en dev (Turbopack fait déjà du
// hot-reload, les deux ne font pas bon ménage — @serwist/next nécessite de
// toute façon webpack pour la génération, pas Turbopack). NEXT_PUBLIC_PWA_DEV=1
// permet de l'activer volontairement en local (avec `next dev --webpack`) le
// temps de tester le mode hors-ligne — voir docs/guides/guide_test_offline.html.
const pwaForcedInDev = process.env.NEXT_PUBLIC_PWA_DEV === "1";

// Application installée (poste local) : l'interface est servie par
// l'ordinateur lui-même et parle à son moteur local, toujours disponible. Un
// Service Worker n'y apporterait rien, sinon des copies périmées après une
// mise à jour de l'application.
const estPoste = process.env.NEXT_PUBLIC_SMARTSCHOOL_POSTE === "1";

const withSerwist = withSerwistInit({
  swSrc: "src/app/sw.ts",
  swDest: "public/sw.js",
  cacheOnNavigation: true,
  // Pas de rechargement automatique au retour du réseau. Sur une connexion qui
  // coupe et revient sans cesse, chaque événement `online` rechargeait la page :
  // la navigation en cours était annulée (retour sur l'écran précédent, constaté
  // hors-ligne le 26/10/2026) et un formulaire en cours de saisie était perdu.
  // Le retour du réseau est déjà pris en charge sans recharger : rejeu de la
  // file (lib/syncEngine.ts), préparation hors-ligne (AppShell.tsx) et
  // rafraîchissement des données (React Query).
  reloadOnOnline: false,
  disable: estPoste || (process.env.NODE_ENV === "development" && !pwaForcedInDev),
});

const nextConfig: NextConfig = {
  // La version poste (application installée) se compile dans son propre
  // dossier (desktop/scripts/construire-interface.mjs), sans toucher au
  // `.next` du serveur de développement ni à celui de la version web.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  reactCompiler: true,
  // Sortie « standalone » requise par l'adaptateur Cloudflare (OpenNext) pour
  // empaqueter le serveur Next dans un Worker. Sans effet sur Vercel.
  output: "standalone",
  turbopack: {
    root: path.resolve(__dirname),
  },
};

// Permet à `next dev` d'accéder aux bindings Cloudflare en local (OpenNext).
// Sans effet sur le build de production.
initOpenNextCloudflareForDev();

export default withSerwist(nextConfig);
