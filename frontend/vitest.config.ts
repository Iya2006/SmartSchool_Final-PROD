import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

/**
 * Configuration Vitest pour les tests frontend SmartSchool.
 *
 * Installation (nécessite internet) :
 *   npm install -D vitest @vitejs/plugin-react @testing-library/react @testing-library/jest-dom jsdom
 *
 * Lancement :
 *   npm run test          — mode watch
 *   npm run test:run      — mode CI (une seule fois)
 *   npm run test:coverage — avec rapport de couverture
 *
 * feat(test): configurer vitest pour les tests frontend
 */
export default defineConfig({
    plugins: [react()],
    test: {
        // Simuler le DOM du navigateur
        environment: 'jsdom',

        // Fichier de setup global (matchers jest-dom)
        setupFiles: ['./src/tests/setup.ts'],

        // Trouver tous les fichiers de test
        include: ['src/**/*.{test,spec}.{ts,tsx}'],

        // Exclure node_modules et .next
        exclude: ['node_modules', '.next'],

        // Rapport de couverture
        coverage: {
            reporter: ['text', 'html'],
            include: ['src/components/**', 'src/hooks/**'],
            exclude: ['src/tests/**'],
        },

        // Alias pour les imports @/
        alias: {
            '@': path.resolve(__dirname, './src'),
        },

        // Globals pour ne pas importer describe/it/expect partout
        globals: true,
    },
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src'),
        },
    },
});
