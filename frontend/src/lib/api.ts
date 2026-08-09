/**
 * SMARTSCHOOL — Configuration API centralisée
 * Toutes les requêtes HTTP passent par cette instance axios.
 * Intercepteur automatique pour le token JWT admin.
 */
import axios from 'axios';

export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8300';

const api = axios.create({
    baseURL: API_BASE_URL,
    timeout: 30000,
    headers: {
        'Content-Type': 'application/json',
    },
});


// ── Intercepteur de requête : ajoute le token JWT automatiquement ──
api.interceptors.request.use(
    (config) => {
        // Ne pas ajouter le token pour les routes de login
        const isLoginRoute = config.url?.includes('/auth/login') ||
                             config.url?.includes('/portail-parent/login') ||
                             config.url?.includes('/portail-enseignant/login') ||
                             config.url?.includes('/portail-eleve/login');

        if (!isLoginRoute && typeof window !== 'undefined') {
            const token = localStorage.getItem('smartschool_token');
            if (token) {
                config.headers.Authorization = `Bearer ${token}`;
            }
        }
        return config;
    },
    (error) => Promise.reject(error)
);


// Normalise error.response.data.detail en chaîne lisible avant que le reste
// de l'app ne le lise. FastAPI renvoie `detail` comme une string pour les
// HTTPException levées à la main ("400: message"), mais comme un TABLEAU
// d'objets {type, loc, msg, input, ctx} pour les erreurs de validation
// automatiques (422 — champ manquant/mal typé). Tout le code existant fait
// `showMsg(e.response?.data?.detail, 'error')` puis rend ça tel quel dans du
// JSX — un detail-tableau y provoque "Objects are not valid as a React
// child" au lieu d'afficher un message utile. Corrigé une seule fois ici,
// plutôt que dans chaque page qui lit `.detail`.
function normaliserDetailErreur(error: unknown) {
    const detail = (error as any)?.response?.data?.detail;
    if (!Array.isArray(detail)) return;
    const message = detail
        .map((item: any) => {
            if (typeof item === 'string') return item;
            const champ = Array.isArray(item?.loc) ? item.loc.filter((p: any) => p !== 'body').join('.') : null;
            const msg = item?.msg || 'Valeur invalide';
            return champ ? `${champ} : ${msg}` : msg;
        })
        .join(' — ');
    (error as any).response.data.detail = message || 'Requête invalide.';
}

// Endpoints éligibles à la mise en file hors-ligne — périmètre volontairement
// restreint (voir backend/app/api/sync.py pour notes/présences ; le reste,
// notamment la comptabilité/finance/utilisateurs, reste "connexion requise").
// Chaque route sait dériver `utilisateur_id` soit depuis l'URL (notes/
// présences, scoping par enseignant), soit depuis la session courante
// (notifications — action globale "pour l'utilisateur connecté", pas
// d'id dans l'URL).
interface OfflineQueueableRoute {
    method: 'post' | 'put';
    pattern: RegExp;
    type: 'note' | 'presence' | 'notification_read_all';
    utilisateurId: (match: RegExpMatchArray) => number | string;
}

function currentUserId(): number | string {
    try {
        const raw = localStorage.getItem('smartschool_user');
        const u = raw ? JSON.parse(raw) : null;
        return u?.id ?? 'inconnu';
    } catch {
        return 'inconnu';
    }
}

// Exporté pour src/tests/offlinePolicy.test.ts — vérifie qu'aucune route
// ci-dessous ne pointe vers un préfixe classé ONLINE_ONLY (lib/offlinePolicy.ts).
export const OFFLINE_QUEUEABLE_ROUTES: OfflineQueueableRoute[] = [
    { method: 'post', pattern: /^\/api\/sync\/(\d+)\/notes$/, type: 'note', utilisateurId: (m) => m[1] },
    { method: 'post', pattern: /^\/api\/sync\/(\d+)\/presences$/, type: 'presence', utilisateurId: (m) => m[1] },
    {
        method: 'put',
        pattern: /^\/api\/communication\/messages\/marquer-tous-lus$/,
        type: 'notification_read_all',
        utilisateurId: () => currentUserId(),
    },
];

// Sur un appel vers une route ci-dessus qui échoue par ABSENCE RÉSEAU (pas un
// vrai refus serveur), on met la requête en file locale au lieu de la
// rejeter — l'appelant voit un succès optimiste et n'a besoin d'aucune
// logique offline spécifique : il continue à faire un simple
// `api.post(...)`/`api.put(...)` comme s'il était en ligne. `syncEngine.ts`
// (pas importé ici pour éviter un cycle api.ts <-> syncEngine.ts qui importe
// déjà `api`) rejouera la file dès le retour de connexion.
async function mettreEnFileSiHorsLigne(error: any): Promise<any> {
    const config = error?.config;
    const isNetworkError = error?.code === 'ERR_NETWORK' && !error?.response;
    const url: string = config?.url || '';
    const method: string = (config?.method || '').toLowerCase();
    const route = OFFLINE_QUEUEABLE_ROUTES.find((r) => r.method === method && r.pattern.test(url));
    const match = route ? url.match(route.pattern) : null;

    if (!isNetworkError || !route || !match || typeof window === 'undefined') {
        return null;
    }

    try {
        const { enqueue } = await import('./offlineQueue');
        let payload: unknown = config.data;
        if (typeof payload === 'string') {
            try { payload = JSON.parse(payload); } catch { /* corps non-JSON, on le garde tel quel */ }
        }
        await enqueue({
            type: route.type,
            method: route.method,
            endpoint: url,
            payload,
            utilisateur_id: route.utilisateurId(match),
            etablissement_id: 1,
        });
        return {
            data: { queued: true, message: 'Enregistré localement — sera synchronisé dès le retour de connexion.' },
            status: 202,
            statusText: 'Accepted (offline queue)',
            headers: {},
            config,
        };
    } catch {
        // La mise en file elle-même a échoué (IndexedDB indisponible...) —
        // on retombe sur le rejet normal plutôt que de faire semblant.
        return null;
    }
}

// ── Intercepteur de réponse : gère les erreurs 401 (token expiré) et 403 (accès interdit) ──
api.interceptors.response.use(
    (response) => response,
    async (error) => {
        normaliserDetailErreur(error);

        const queued = await mettreEnFileSiHorsLigne(error);
        if (queued) return queued;

        if (typeof window !== 'undefined' && error.response) {
            const status = error.response.status;
            const currentPath = window.location.pathname;

            if (status === 401) {
                // Le module Comptabilité n'a plus de session parallèle : un 401
                // se traite exactement comme partout ailleurs dans l'admin.
                if (currentPath !== '/login') {
                    localStorage.clear();
                    sessionStorage.clear();
                    // Étape C : ce chemin (session expirée) ne purgeait avant
                    // ni Cache Storage ni la file offline/le cache delta,
                    // contrairement au logout manuel (AuthContext.logout) —
                    // incohérence trouvée par l'audit, corrigée en partageant
                    // la même purge (lib/sessionCleanup.ts).
                    const { purgeLocalSessionData } = await import('./sessionCleanup');
                    await purgeLocalSessionData();
                    window.location.href = '/login';
                }
            } else if (status === 403) {
                // Erreur de rôle / permission → rediriger selon le rôle sauvegardé
                const savedUser = localStorage.getItem('smartschool_user');
                if (savedUser) {
                    try {
                        const u = JSON.parse(savedUser);
                        if (u.role === 'PARENT' && !currentPath.startsWith('/portail-parent')) {
                            window.location.href = '/portail-parent';
                            return Promise.reject(error);
                        }
                        if (u.role === 'ENSEIGNANT' && !currentPath.startsWith('/portail-enseignant')) {
                            window.location.href = '/portail-enseignant';
                            return Promise.reject(error);
                        }
                        if (u.role === 'ELEVE' && !currentPath.startsWith('/portail-eleve')) {
                            window.location.href = '/portail-eleve';
                            return Promise.reject(error);
                        }
                    } catch {}
                }
            }
        }
        return Promise.reject(error);
    }
);


export default api;
