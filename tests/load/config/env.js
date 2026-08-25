// Configuration commune lue depuis les variables d'environnement k6 (__ENV).
// AUCUNE URL de production n'est codée en dur : BASE_URL est obligatoire à
// l'exécution ; le défaut local sert juste à ne pas planter en smoke.

export const BASE_URL = (__ENV.BASE_URL || 'http://localhost:8300').replace(/\/+$/, '');
export const TEST_ENV = __ENV.TEST_ENV || 'local';
export const DATA_FILE = __ENV.DATA_FILE || './data/accounts.json';

// Paramètres génériques (surchargés par --env selon le palier de test).
export const VUS = parseInt(__ENV.VUS || '10', 10);
export const DURATION = __ENV.DURATION || '1m';
export const RATE = parseInt(__ENV.RATE || '50', 10); // req/s pour les scénarios arrival-rate

// Garde-fou : refuser d'écraser une prod par erreur. On BLOQUE si l'URL
// ressemble à une prod (supabase, onrender, https public) sans I_UNDERSTAND=1.
export function assertNotProd() {
    const u = BASE_URL.toLowerCase();
    const suspect = u.includes('supabase') || u.includes('onrender.com') ||
        u.includes('vercel.app') || (u.startsWith('https://') && !u.includes('localhost') && !u.includes('127.0.0.1'));
    if (suspect && __ENV.I_UNDERSTAND !== '1') {
        throw new Error(
            `BASE_URL="${BASE_URL}" ressemble à une PRODUCTION. ` +
            `Refus. Utilise une cible de test, ou passe I_UNDERSTAND=1 en connaissance de cause.`
        );
    }
}
