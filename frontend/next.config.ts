import type { NextConfig } from "next";
import path from "path";

import withSerwistInit from "@serwist/next";

// Le Service Worker est normalement désactivé en dev (Turbopack fait déjà du
// hot-reload, les deux ne font pas bon ménage — @serwist/next nécessite de
// toute façon webpack pour la génération, pas Turbopack). NEXT_PUBLIC_PWA_DEV=1
// permet de l'activer volontairement en local (avec `next dev --webpack`) le
// temps de tester le mode hors-ligne — voir docs/guides/guide_test_offline.html.
const pwaForcedInDev = process.env.NEXT_PUBLIC_PWA_DEV === "1";

const withSerwist = withSerwistInit({
  swSrc: "src/app/sw.ts",
  swDest: "public/sw.js",
  cacheOnNavigation: true,
  reloadOnOnline: true,
  disable: process.env.NODE_ENV === "development" && !pwaForcedInDev,
});

const nextConfig: NextConfig = {
  reactCompiler: true,
  turbopack: {
    root: path.resolve(__dirname),
  },
};

export default withSerwist(nextConfig);
