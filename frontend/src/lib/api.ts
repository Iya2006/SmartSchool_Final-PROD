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

// Endpoints éligibles à la mise en file hors-ligne — périmètre Phase 1
// volontairement restreint aux notes/présences enseignants (voir
// backend/app/api/sync.py ; le reste, notamment la comptabilité, reste
// "connexion requise", cohérent avec le plan approuvé).
const OFFLINE_QUEUEABLE = /^\/api\/sync\/(\d+)\/(notes|presences)$/;

// Sur un POST vers un endpoint de sync qui échoue par ABSENCE RÉSEAU (pas un
// vrai refus serveur), on met la requête en file locale au lieu de la
// rejeter — l'appelant (portail enseignant) voit un succès optimiste et n'a
// besoin d'aucune logique offline spécifique : il continue à faire un simple
// `api.post('/api/sync/{id}/notes', payload)` comme s'il était en ligne.
// `syncEngine.ts` (pas importé ici pour éviter un cycle api.ts <-> syncEngine.ts
// qui importe déjà `api`) rejouera la file dès le retour de connexion.
async function mettreEnFileSiHorsLigne(error: any): Promise<any> {
    const config = error?.config;
    const isNetworkError = error?.code === 'ERR_NETWORK' && !error?.response;
    const url: string = config?.url || '';
    const method: string = (config?.method || '').toLowerCase();
    const match = method === 'post' ? url.match(OFFLINE_QUEUEABLE) : null;

    if (!isNetworkError || !match || typeof window === 'undefined') {
        return null;
    }

    try {
        const { enqueue } = await import('./offlineQueue');
        let payload: unknown = config.data;
        if (typeof payload === 'string') {
            try { payload = JSON.parse(payload); } catch { /* corps non-JSON, on le garde tel quel */ }
        }
        await enqueue({
            type: match[2] === 'notes' ? 'note' : 'presence',
            endpoint: url,
            payload,
            utilisateur_id: match[1],
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
