import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  reactCompiler: true,
  // Définir le répertoire racine pour Turbopack pour éviter l'avertissement
  // de détection de lockfiles multiples (Next.js 16 — hors experimental)
  turbopack: {
    root: path.resolve(__dirname),
  },
};

export default nextConfig;
