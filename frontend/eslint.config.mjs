import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  // ── Règles personnalisées SmartSchool ──────────────────────────────
  {
    rules: {
      // `any` toléré comme WARNING dans les réponses API et code legacy.
      // À éliminer progressivement en typant les réponses API.
      "@typescript-eslint/no-explicit-any": "warn",

      // Images : préférer next/image mais pas bloquant (code legacy)
      "@next/next/no-img-element": "warn",

      // Variables inutilisées : warning (pas bloquant)
      "@typescript-eslint/no-unused-vars": ["warn", {
        "argsIgnorePattern": "^_",
        "varsIgnorePattern": "^_"
      }],

      // Texte français avec apostrophes dans JSX → faux positifs inévitables.
      // "Aujourd'hui", "n'a pas", etc. sont du texte valide en français.
      // Downgraded en warning, à corriger avec &apos; dans les cas critiques.
      "react/no-unescaped-entities": "warn",

      // setState dans useEffect : acceptable pour l'initialisation depuis
      // localStorage ou pour les refs/reducers. Pas un vrai cycle de render.
      "react-hooks/set-state-in-effect": "warn",

      // Dépendances de hooks : warning (certains [] intentionnels)
      "react-hooks/exhaustive-deps": "warn",
    }
  }
]);

export default eslintConfig;
