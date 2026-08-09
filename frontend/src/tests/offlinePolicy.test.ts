/**
 * Tests du registre Offline-First (Étape I) — lib/offlinePolicy.ts.
 *
 * Le but n'est PAS de tester une logique métier complexe : c'est un
 * garde-fou. Si un futur développeur ajoute une route à
 * OFFLINE_QUEUEABLE_ROUTES (lib/api.ts) qui pointe vers un module classé
 * ONLINE_ONLY (paiements, comptabilité, auth, sécurité/permissions), CE
 * TEST DOIT ÉCHOUER — c'est la vérification concrète exigée par le cahier
 * des charges ("empêcher qu'un futur développeur rende accidentellement
 * offline une opération sensible").
 */
import { describe, it, expect } from 'vitest';
import {
    MODULE_POLICY,
    ONLINE_ONLY_API_PREFIXES,
    isOnlineOnlyPath,
    isWriteOfflineSafePath,
} from '@/lib/offlinePolicy';
import { OFFLINE_QUEUEABLE_ROUTES } from '@/lib/api';

// Une URL d'exemple valide par type de route offline-queueable existant —
// complétez en ajoutant un nouveau type dans OFFLINE_QUEUEABLE_ROUTES.
const SAMPLE_URLS: Record<string, string> = {
    note: '/api/sync/1/notes',
    presence: '/api/sync/1/presences',
    notification_read_all: '/api/communication/messages/marquer-tous-lus',
};

describe('offlinePolicy — registre', () => {
    it('chaque module a au moins un préfixe et une justification substantielle', () => {
        for (const [key, policy] of Object.entries(MODULE_POLICY)) {
            expect(policy.apiPrefixes.length, `module ${key}: apiPrefixes vide`).toBeGreaterThan(0);
            expect(policy.justification.length, `module ${key}: justification trop courte`).toBeGreaterThan(20);
        }
    });

    it('finance/comptabilite/auth/securite sont exclus du Cache Storage du Service Worker, et jamais écrits offline', () => {
        // finance/comptabilite restent lisibles offline (cache applicatif
        // React Query + Redis serveur, préexistant — voir
        // comptabilite/dashboard/page.tsx) mais JAMAIS via le Service
        // Worker (deux mécanismes distincts, voir la doc du champ
        // excludeFromServiceWorkerCache dans offlinePolicy.ts).
        expect(MODULE_POLICY.finance_comptabilite.read).toBe('READ_ONLY_OFFLINE');
        expect(MODULE_POLICY.finance_comptabilite.excludeFromServiceWorkerCache).toBe(true);
        expect(MODULE_POLICY.finance_comptabilite.write).toBe('ONLINE_ONLY');

        expect(MODULE_POLICY.auth.excludeFromServiceWorkerCache).toBe(true);
        expect(MODULE_POLICY.securite_permissions.excludeFromServiceWorkerCache).toBe(true);
        expect(MODULE_POLICY.securite_permissions.write).toBe('ONLINE_ONLY');
    });

    it.each([
        ['/api/finance/paiements', true],
        ['/api/finance/salaires/1', true],
        ['/api/comptabilite/grand-livre', true],
        ['/api/auth/login', true],
        ['/api/securite/roles', true],
        ['/api/securite/audit-log', true],
        ['/api/eleves', false],
        ['/api/classes/1/profil', false],
        ['/api/communication/messages', false],
        ['/api/sync/1/notes', false],
        ['/api/personnel', false], // ONLINE_ONLY en classification produit, mais pas assez sensible pour justifier l'exclusion explicite du Cache Storage (voir commentaire dans MODULE_POLICY.personnel)
    ] as const)('isOnlineOnlyPath(%s) === %s', (path, expected) => {
        expect(isOnlineOnlyPath(path)).toBe(expected);
    });
});

describe('offlinePolicy — garde-fou : toute route offline-queueable doit être explicitement approuvée', () => {
    it('OFFLINE_QUEUEABLE_ROUTES (lib/api.ts) ne contient aucun préfixe exclu du Cache Storage (denylist)', () => {
        expect(ONLINE_ONLY_API_PREFIXES.length).toBeGreaterThan(0); // sanity : le registre n'est pas vide

        for (const route of OFFLINE_QUEUEABLE_ROUTES) {
            for (const prefix of ONLINE_ONLY_API_PREFIXES) {
                expect(
                    route.pattern.source.includes(prefix),
                    `La route offline-queueable ${route.pattern} correspond au préfixe "${prefix}" (exclu du Cache ` +
                        `Storage — le plus sensible) — une opération critique serait mise en file hors-ligne. Voir lib/offlinePolicy.ts.`
                ).toBe(false);
            }
        }
    });

    it('chaque route offline-queueable pointe vers un module explicitement WRITE_OFFLINE_SAFE (allowlist)', () => {
        // Plus strict que le test denylist ci-dessus : couvre AUSSI les
        // modules ONLINE_ONLY non "critiques" (ex: personnel) et les
        // WRITE_OFFLINE_CONTROLLED pas encore activés (ex: élèves) — pas
        // seulement les 4 modules les plus sensibles.
        for (const route of OFFLINE_QUEUEABLE_ROUTES) {
            const sample = SAMPLE_URLS[route.type];
            expect(sample, `pas d'URL d'exemple pour le type "${route.type}" — complétez SAMPLE_URLS ci-dessus`).toBeDefined();
            expect(
                route.pattern.test(sample),
                `l'URL d'exemple "${sample}" ne correspond pas au pattern de la route "${route.type}"`
            ).toBe(true);
            expect(
                isWriteOfflineSafePath(sample),
                `La route "${route.type}" (${sample}) n'est pas classée WRITE_OFFLINE_SAFE dans lib/offlinePolicy.ts ` +
                    `(MODULE_POLICY) — une écriture offline non explicitement approuvée serait mise en file.`
            ).toBe(true);
        }
    });

    it('les routes offline-queueable actuelles sont exactement celles attendues (notes, présences, notifications)', () => {
        // Filet de sécurité redondant mais volontaire : si cette liste change,
        // ce test force une revue explicite plutôt qu'un ajout silencieux.
        const types = OFFLINE_QUEUEABLE_ROUTES.map((r) => r.type).sort();
        expect(types).toEqual(['note', 'notification_read_all', 'presence']);
    });
});
