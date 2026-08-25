// Seuils de performance PROVISOIRES — à affiner après les premières mesures
// (cf. §8 de la mission). Les endpoints lourds (PDF/export/rapports) ont des
// seuils séparés des endpoints simples : on tague les requêtes côté lib/http.js
// (tag `kind`) et on cible ces tags ici.

export const thresholds = {
    // Global — tout ce qui n'est pas explicitement « lourd ».
    http_req_failed: ['rate<0.01'],                 // < 1% d'erreurs
    http_req_duration: ['p(95)<1000', 'p(99)<2000'],// p95<1s, p99<2s

    // Endpoints SIMPLES (lecture légère / dashboard caché).
    'http_req_duration{kind:light}': ['p(95)<800', 'p(99)<1500'],

    // Endpoints d'ÉCRITURE (batch notes/présences, création, paiement…).
    'http_req_duration{kind:write}': ['p(95)<1500', 'p(99)<3000'],

    // Endpoints LOURDS (génération PDF, export Excel, calcul de moyennes,
    // notes-centralisées). Seuils volontairement plus larges.
    'http_req_duration{kind:heavy}': ['p(95)<5000', 'p(99)<10000'],

    // Login (peut être rate-limité ; on surveille surtout qu'il réponde).
    'http_req_duration{kind:auth}': ['p(95)<2000'],

    // Les checks fonctionnels (statut correct, ISOLATION multi-tenant) ne
    // doivent JAMAIS échouer : une fuite cross-tenant casse le test.
    checks: ['rate>0.99'],
};

// Seuils spécifiques au test d'isolation : 100 % ou échec.
export const isolationThresholds = {
    checks: ['rate==1.00'],
    'checks{check:isolation}': ['rate==1.00'],
};
