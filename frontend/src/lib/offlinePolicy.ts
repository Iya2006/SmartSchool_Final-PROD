/**
 * Registre formel des opérations Offline-First — Étape I.
 *
 * Source de vérité UNIQUE pour "qu'est-ce qui a le droit d'être hors-ligne,
 * et comment". Deux consommateurs concrets (pas juste de la doc) :
 *   - src/app/sw.ts   → ONLINE_ONLY_API_PREFIXES (jamais mis en cache lecture)
 *   - src/tests/offlinePolicy.test.ts → vérifie qu'aucune route de
 *     lib/api.ts (OFFLINE_QUEUEABLE_ROUTES, écriture hors-ligne) ne pointe
 *     vers un préfixe ONLINE_ONLY.
 *
 * Objectif explicite (cahier des charges fourni) : qu'un futur développeur
 * ne puisse pas rendre accidentellement offline une opération sensible sans
 * qu'un test échoue. Classification basée sur une lecture réelle du code
 * (routeurs backend/app/api/*.py), pas supposée — voir le détail par module
 * ci-dessous, daté de l'audit du 09/08/2026.
 */

export type OfflineClassification =
    | 'READ_ONLY_OFFLINE' // lecture depuis un cache applicatif (React Query/localStorage) autorisée hors-ligne, jamais d'écriture
    | 'WRITE_OFFLINE_SAFE' // écriture hors-ligne autorisée : idempotente par construction
    | 'WRITE_OFFLINE_CONTROLLED' // écriture hors-ligne envisageable mais pas encore implémentée : nécessite id local + validation serveur + gestion de conflit dédiée avant activation
    | 'ONLINE_ONLY'; // aucun cache applicatif dédié, aucune file d'écriture — module non préparé pour l'offline

export interface ModulePolicy {
    /** Préfixe(s) réel(s) des routes backend concernées (backend/app/api/*.py). */
    apiPrefixes: string[];
    /** Classification produit : peut-on afficher une version en cache hors-ligne ? (React Query/localStorage — PAS le Cache Storage du Service Worker, voir excludeFromServiceWorkerCache ci-dessous, une décision distincte). */
    read: OfflineClassification;
    write: OfflineClassification;
    /**
     * true = le Service Worker (src/app/sw.ts) ne doit JAMAIS mettre ces
     * réponses en Cache Storage, ni en lecture ni en écriture — décision de
     * sécurité indépendante de `read` : des données peuvent être
     * READ_ONLY_OFFLINE via un cache applicatif contrôlé (purgé au logout,
     * voir AuthContext.logout) tout en étant interdites du Cache Storage du
     * navigateur (persistance moins contrôlée, visible même après purge du
     * cache applicatif — §22/§23 du cahier des charges). N'exclut PAS pour
     * autant `finance_comptabilite` de la lecture applicative (son
     * dashboard reste caché côté React Query + Redis serveur, mécanisme
     * préexistant, distinct du Service Worker).
     */
    excludeFromServiceWorkerCache: boolean;
    /** Pourquoi cette classification — obligatoire, pour qu'un changement futur soit un choix conscient, pas un oubli. */
    justification: string;
}

/**
 * Une entrée par module audité. Complétez cette table (pas une nouvelle)
 * avant d'activer l'offline sur un nouveau module — c'est elle qui fait foi.
 */
export const MODULE_POLICY: Record<string, ModulePolicy> = {
    notes_presences: {
        apiPrefixes: ['/api/sync'],
        read: 'READ_ONLY_OFFLINE',
        write: 'WRITE_OFFLINE_SAFE',
        excludeFromServiceWorkerCache: false,
        justification:
            "Périmètre Phase 1 d'origine. Écriture rejouée élément par élément côté serveur (backend/app/api/sync.py), " +
            'conflit détecté (Last-Write-Wins signalé) pour les notes, upsert naturel pour les présences.',
    },
    notifications: {
        apiPrefixes: ['/api/communication/messages'],
        read: 'READ_ONLY_OFFLINE',
        write: 'WRITE_OFFLINE_SAFE',
        excludeFromServiceWorkerCache: false,
        justification:
            "marquer-tous-lus est un UPDATE ... WHERE statut='ENVOYE' — idempotent par construction, un rejeu ne fait rien " +
            'de plus la 2e fois. Aucune donnée financière ni sensible. Étape B, 09/08/2026.',
    },
    classes: {
        apiPrefixes: ['/api/classes'],
        read: 'READ_ONLY_OFFLINE',
        write: 'ONLINE_ONLY',
        excludeFromServiceWorkerCache: false,
        justification:
            'Lecture déjà en cache React Query (useEleves.ts). Écriture (création/config de classe) rare, aucun gain à ' +
            "rendre offline — pas encore auditée pour une éventuelle promotion en WRITE_OFFLINE_CONTROLLED.",
    },
    eleves: {
        apiPrefixes: ['/api/eleves'],
        read: 'READ_ONLY_OFFLINE',
        write: 'ONLINE_ONLY',
        excludeFromServiceWorkerCache: false,
        justification:
            'Lecture déjà en cache. Écriture (PUT /api/eleves/{id}) NON auditée en détail (validations métier ' +
            'famille/tarifs potentiellement complexes, backend/app/api/eleves.py:142) — ne PAS activer sans lire ce ' +
            'endpoint en détail d\'abord. Candidat WRITE_OFFLINE_CONTROLLED, pas encore promu.',
    },
    personnel: {
        apiPrefixes: ['/api/personnel'],
        read: 'ONLINE_ONLY',
        write: 'ONLINE_ONLY',
        // Pas dans finance/comptabilite/auth/securite : le personnel n'est
        // pas assez sensible pour justifier l'exclusion explicite du Cache
        // Storage (contrairement à des montants ou des permissions) —
        // aucun cache applicatif ne l'exploite aujourd'hui de toute façon,
        // donc en pratique ce cache incident (règle générique /api/* du SW)
        // reste inutilisé.
        excludeFromServiceWorkerCache: false,
        justification:
            "Aucun cache offline actuellement (page frontend en fetch direct axios, pas React Query — vrai refactor " +
            "requis, pas un copier-coller). Écriture touche potentiellement la paie (finance.py) via changement de " +
            'statut/suppression — reste online.',
    },
    vie_scolaire_incidents: {
        apiPrefixes: ['/api/vie-scolaire/incidents'],
        read: 'ONLINE_ONLY',
        write: 'ONLINE_ONLY',
        excludeFromServiceWorkerCache: false,
        justification:
            "Incident n'a AUCUNE FK vers l'année scolaire (trouvé lors d'une session précédente) — pas d'ancrage " +
            'fiable pour un verrou de cohérence. Ne pas rendre offline tant que ce point structurel n\'est pas réglé.',
    },
    finance_comptabilite: {
        apiPrefixes: ['/api/finance', '/api/comptabilite'],
        read: 'READ_ONLY_OFFLINE',
        write: 'ONLINE_ONLY',
        // Lecture offline réelle mais via un cache applicatif dédié
        // uniquement (React Query + Redis serveur, TTL 60s côté backend,
        // purgé au logout — voir AuthContext.logout) : le Service Worker,
        // lui, ne doit JAMAIS voir passer ces réponses en cache — c'est la
        // décision de l'Étape A (voir sw.ts), plus stricte que la simple
        // classification produit ci-dessus.
        excludeFromServiceWorkerCache: true,
        justification:
            "Décision actée dès la Phase 1 : opérations financières jamais résolues automatiquement en cas de " +
            "conflit. Paiements/factures/salaires exclus du Cache Storage du Service Worker en plus d'être " +
            "online-only en écriture — cohérent avec §6/§7 du cahier des charges fourni.",
    },
    auth: {
        apiPrefixes: ['/api/auth'],
        read: 'ONLINE_ONLY',
        write: 'ONLINE_ONLY',
        excludeFromServiceWorkerCache: true,
        justification: 'Authentification — aucune mise en cache, aucune file offline, par nature.',
    },
    securite_permissions: {
        apiPrefixes: ['/api/securite'],
        read: 'ONLINE_ONLY',
        write: 'ONLINE_ONLY',
        excludeFromServiceWorkerCache: true,
        justification:
            'Rôles/permissions/audit-log (backend/app/api/securite.py) — modification de permission jamais offline ' +
            "(§8 du cahier des charges fourni : une modification offline de permission ne doit être autorisée que si " +
            "l'analyse démontre l'absence de risque de sécurité, non démontré ici).",
    },
};

/**
 * Dérivé de MODULE_POLICY.excludeFromServiceWorkerCache — préfixes dont
 * AUCUNE réponse ne doit jamais être mise en Cache Storage par le Service
 * Worker (voir src/app/sw.ts), ni en lecture ni en écriture. Source unique :
 * modifier MODULE_POLICY ci-dessus, pas cette liste directement. Ne PAS
 * confondre avec `write !== 'ONLINE_ONLY'` (la mise en FILE d'écriture,
 * gérée séparément par lib/api.ts/OFFLINE_QUEUEABLE_ROUTES).
 */
export const ONLINE_ONLY_API_PREFIXES: string[] = Object.values(MODULE_POLICY)
    .filter((m) => m.excludeFromServiceWorkerCache)
    .flatMap((m) => m.apiPrefixes);

/** true si `pathname` correspond à un module exclu du Cache Storage du
 * Service Worker — utilisé par sw.ts et par le test de non-régression sur
 * les routes hors-ligne. */
export function isOnlineOnlyPath(pathname: string): boolean {
    return ONLINE_ONLY_API_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

/**
 * Liste blanche (pas juste liste noire) des préfixes explicitement classés
 * WRITE_OFFLINE_SAFE — le SEUL statut qui autorise une route à apparaître
 * dans OFFLINE_QUEUEABLE_ROUTES (lib/api.ts). Volontairement plus strict que
 * `!isOnlineOnlyPath` : une route touchant un module WRITE_OFFLINE_CONTROLLED
 * (candidat identifié mais pas encore activé, ex: élèves) ou simplement
 * ONLINE_ONLY-mais-pas-marqué-sensible (ex: personnel) doit AUSSI être
 * refusée, pas seulement les 4 modules les plus critiques.
 */
export const WRITE_OFFLINE_SAFE_API_PREFIXES: string[] = Object.values(MODULE_POLICY)
    .filter((m) => m.write === 'WRITE_OFFLINE_SAFE')
    .flatMap((m) => m.apiPrefixes);

/** true si `pathname` appartient à un module explicitement classé
 * WRITE_OFFLINE_SAFE — utilisé comme garde-fou positif par le test sur
 * OFFLINE_QUEUEABLE_ROUTES (à la différence de isOnlineOnlyPath, qui ne
 * couvre que le sous-ensemble exclu du Cache Storage). */
export function isWriteOfflineSafePath(pathname: string): boolean {
    return WRITE_OFFLINE_SAFE_API_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}
