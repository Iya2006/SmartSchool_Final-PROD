/**
 * SMARTSCHOOL — Configuration API centralisée
 * Toutes les requêtes HTTP passent par cette instance axios.
 * Intercepteur automatique pour le token JWT admin.
 */
import axios from 'axios';
import { estPageOuverteATous } from './pagesOuvertes';

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

        // Upload de fichier (FormData) : retirer le Content-Type JSON par défaut
        // pour laisser le navigateur poser `multipart/form-data; boundary=...`.
        // Sans ça, le corps multipart n'était pas analysé et l'API répondait
        // « fichier : Field required » (import CSV des élèves, photos, etc.).
        if (typeof FormData !== 'undefined' && config.data instanceof FormData) {
            if (config.headers) {
                delete (config.headers as Record<string, unknown>)['Content-Type'];
                delete (config.headers as Record<string, unknown>)['content-type'];
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
/** Établissement du compte connecté, tel que le serveur l'a dérivé au login.
 * `undefined` s'il n'est pas connaissable (compte plateforme, parent
 * multi-écoles, session antérieure à l'ajout du champ) — on ne retombe jamais
 * sur l'établissement 1. Métadonnée locale : le rejeu s'appuie sur le JWT. */
function etablissementDeLaSession(): number | undefined {
    try {
        const brut = localStorage.getItem('smartschool_user');
        if (!brut) return undefined;
        const id = JSON.parse(brut)?.etablissement_id;
        return typeof id === 'number' ? id : undefined;
    } catch {
        return undefined;
    }
}

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
            etablissement_id: etablissementDeLaSession(),
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

// Absence RÉSEAU (pas un refus serveur) — même détection que
// mettreEnFileSiHorsLigne ci-dessus et lib/syncEngine.ts (isNetworkError) :
// `error.code === 'ERR_NETWORK'` sans `error.response` du tout. Distinct de
// "route jamais visitée en ligne" (le Service Worker n'a alors rien à
// resservir depuis son cache — voir src/app/sw.ts, NetworkFirst) : dans les
// deux cas, l'appelant reçoit ce même rejet réseau, jamais une exception
// obscure ("Network Error" par défaut d'axios).
const MESSAGE_HORS_LIGNE =
    "Vous êtes hors-ligne et cette donnée n'a pas encore été chargée sur cet appareil. " +
    'Reconnectez-vous pour y accéder.';

// Pannes côté serveur, dites en français et sans rien de technique.
//
// L'utilisateur d'une école n'a que faire d'une adresse d'API, d'un code HTTP
// ou d'un texte d'outil de développement (« Request failed with status code
// 502 », « timeout of 30000ms exceeded »). Il a besoin de deux choses : savoir
// que la panne ne vient pas de lui, et savoir s'il doit réessayer. Le détail
// technique n'est pas perdu pour autant — il part en console (voir plus bas).
const MESSAGE_INDISPONIBLE = 'Serveur indisponible. Réessayez dans un instant.';
const MESSAGE_TROP_LENT = 'Le serveur met trop de temps à répondre. Réessayez dans un instant.';
const MESSAGE_PANNE_SERVEUR = 'Le serveur a rencontré un problème. Réessayez dans un instant.';

function estErreurReseau(error: any): boolean {
    return error?.code === 'ERR_NETWORK' && !error?.response;
}

/**
 * L'appareil se sait-il sans connexion ?
 *
 * Sert à distinguer « c'est vous qui êtes hors-ligne » de « c'est le serveur
 * qui ne répond pas » : les deux remontent la MÊME erreur réseau, mais
 * n'appellent pas le même geste. Dire « vous êtes hors-ligne » à quelqu'un
 * dont la connexion marche très bien pendant que le serveur redémarre, c'est
 * l'envoyer chercher la panne du mauvais côté.
 *
 * Hors navigateur (tests, rendu serveur), on suppose la connexion présente :
 * l'hypothèse prudente est que la panne vient du serveur.
 */
function appareilHorsLigne(): boolean {
    return typeof navigator !== 'undefined' && navigator.onLine === false;
}


// ────────────────────────────────────────────────────────────────────────
// Reprise automatique des coupures passagères
//
// Mesuré depuis Conakry : sur une même fenêtre de quelques minutes, la
// liaison perd des paquets par bouffées. 1 appel sur 30 n'aboutit pas du
// tout, et un tiers dépasse la seconde — Google et GitHub ralentissent en
// même temps, donc c'est la liaison, pas le serveur. Un fichier de 11 Ko
// tombe bien plus souvent qu'une petite réponse JSON : plus il y a
// d'octets sur le fil, plus il y a de chances d'être coupé.
//
// Sans reprise, le premier appel malchanceux affiche « Serveur
// indisponible » alors que tout fonctionne. L'utilisateur d'une école en
// conclut que le logiciel est fragile. On réessaie donc tout seul : quatre
// tentatives étalées sur environ sept secondes, pendant lesquelles il ne
// voit que l'indicateur de chargement habituel.
//
// Le délai dépassé (30 s) a un budget à part : le rejouer quatre fois
// ferait patienter deux minutes, ce qui est pire que l'erreur.
// Exporté pour src/tests/api.offlineQueueing.test.ts : ces tests décrivent le
// message vu APRÈS l'échec des reprises, et marquent donc le budget comme
// dépensé. Partager la constante leur évite de dériver si on change le nombre
// de tentatives ici.
export const DELAIS_REPRISE_MS = [400, 1000, 2000, 4000];
const REPRISES_MAX_DELAI_DEPASSE = 1;

function estDelaiDepasse(error: any): boolean {
    return error?.code === 'ECONNABORTED' || error?.code === 'ETIMEDOUT';
}

/** Panne qui a de bonnes chances de disparaître d'elle-même. */
function estPanneTransitoire(error: any): boolean {
    if (estDelaiDepasse(error)) return true;
    if (estErreurReseau(error)) return true;
    if (!error?.response) return true;
    const statut = error.response.status;
    // L'hébergeur répond à la place du serveur : redémarrage, sortie de
    // veille. Jamais un refus métier.
    return statut === 502 || statut === 503 || statut === 504;
}

/**
 * Cette requête peut-elle être renvoyée sans risque ?
 *
 * **C'est la question qui compte, et la réponse est non par défaut.**
 *
 * Une lecture peut être rejouée mille fois sans conséquence. Un
 * encaissement, non : si le serveur a bien enregistré le paiement et que
 * c'est sa réponse qui s'est perdue en route, un deuxième envoi encaisse le
 * même tarif deux fois. Dans un logiciel de comptabilité d'école, cette
 * faute-là coûte la confiance d'un parent et la crédibilité du produit —
 * très au-delà du désagrément d'un message d'erreur.
 *
 * Les connexions font exception : elles ne produisent qu'un jeton, les
 * rejouer ne laisse aucune trace. Et c'est précisément là que l'utilisateur
 * rencontrait le message, puisque c'est le premier écran de la journée.
 *
 * Les écritures restantes gardent donc leur message clair, et c'est un
 * humain qui décide de recommencer. Pour les protéger aussi, il faudrait un
 * identifiant d'opération que le serveur refuse en double.
 */
function peutEtreRejouee(config: any): boolean {
    const methode = (config?.method || 'get').toLowerCase();
    if (methode === 'get' || methode === 'head' || methode === 'options') return true;

    const url: string = config?.url || '';
    return methode === 'post' && /\/(auth|portail-parent|portail-enseignant|portail-eleve)\/login$/.test(url);
}

function patienter(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Rejoue la requête si c'est sans danger, et rend `null` sinon — l'appelant
 * poursuit alors vers le message d'erreur habituel.
 *
 * Hors-ligne déclaré : on ne réessaie pas. Insister ne sert à rien, et la
 * file locale (`mettreEnFileSiHorsLigne`) ou le message « vous êtes
 * hors-ligne » sont la bonne réponse. À l'inverse, pendant une bouffée de
 * pertes de paquets, `navigator.onLine` reste vrai : c'est exactement le cas
 * que cette reprise rattrape.
 */
async function reprendreSiPossible(error: any): Promise<any | null> {
    const config = error?.config;
    if (!config || appareilHorsLigne()) return null;
    if (!estPanneTransitoire(error) || !peutEtreRejouee(config)) return null;

    const faites: number = config.__reprises ?? 0;
    const budget = estDelaiDepasse(error) ? REPRISES_MAX_DELAI_DEPASSE : DELAIS_REPRISE_MS.length;
    if (faites >= budget) return null;

    config.__reprises = faites + 1;
    await patienter(DELAIS_REPRISE_MS[faites] ?? 4000);
    // L'échec éventuel de cette tentative repasse par cet intercepteur, qui
    // reprendra le compte là où il en est : pas de récursion à surveiller.
    return api.request(config);
}

/**
 * Traduit une panne en phrase compréhensible.
 *
 * Rend `undefined` quand l'erreur porte un vrai sens métier (4xx) : ce
 * message-là vient du serveur, il aide l'utilisateur, on ne l'écrase jamais.
 */
function messageDePanne(error: any): string | undefined {
    // Le dépassement de délai arrive sans réponse : à tester avant le cas
    // général « pas de réponse », sinon il serait annoncé comme une panne.
    if (error?.code === 'ECONNABORTED' || error?.code === 'ETIMEDOUT') return MESSAGE_TROP_LENT;
    if (estErreurReseau(error)) return appareilHorsLigne() ? MESSAGE_HORS_LIGNE : MESSAGE_INDISPONIBLE;
    // Aucune annulation de requête dans l'application (ni AbortController ni
    // CancelToken) : ici, « pas de réponse » veut bien dire « le serveur n'a
    // rien répondu », jamais « on a coupé la requête volontairement ».
    if (!error?.response) return MESSAGE_INDISPONIBLE;
    const statut = error.response.status;
    // 502/503/504 : l'hébergeur répond à la place du serveur, typiquement
    // pendant un redémarrage ou une sortie de veille. Ce n'est pas une panne
    // durable, d'où « réessayez » plutôt qu'un message d'échec définitif.
    if (statut === 502 || statut === 503 || statut === 504) return MESSAGE_INDISPONIBLE;
    if (statut >= 500) return MESSAGE_PANNE_SERVEUR;
    return undefined;
}

// ── Intercepteur de réponse : gère les erreurs 401 (token expiré) et 403 (accès interdit) ──
api.interceptors.response.use(
    (response) => response,
    async (error) => {
        normaliserDetailErreur(error);

        // Avant d'annoncer quoi que ce soit : réessayer. Une coupure de
        // quelques secondes ne doit pas devenir un message d'erreur.
        const reprise = await reprendreSiPossible(error);
        if (reprise) return reprise;

        const queued = await mettreEnFileSiHorsLigne(error);
        if (queued) return queued;

        // Ne touche QUE `error.message` (texte humain) — jamais
        // `error.response`, dont la présence/absence sert ailleurs dans
        // l'app à distinguer "le serveur a répondu" de "pas de réponse du
        // tout" (ex: le bloc juste en dessous). En fabriquer un faux
        // casserait cette distinction pour du code qui ne s'y attend pas.
        const panne = messageDePanne(error);
        if (panne) {
            // Le message d'origine est écrit en console AVANT d'être remplacé :
            // on retire le jargon de l'écran, pas du diagnostic.
            console.error(
                '[api]',
                error?.config?.method?.toUpperCase(),
                error?.config?.url,
                error?.response?.status ?? error?.code,
                error?.message,
            );
            error.message = panne;
        }

        if (typeof window !== 'undefined' && error.response) {
            const status = error.response.status;
            const currentPath = window.location.pathname;
            // Page ouverte à tous (vérification d'un reçu par QR code) : on n'en
            // chasse jamais le visiteur. Un jeton expiré, ou un compte parent
            // dont les écrans d'administration répondent 403, l'envoyaient vers
            // /login ou son portail avant même d'avoir vu le résultat.
            const pageOuverte = estPageOuverteATous(currentPath);

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
                    // La session morte est purgée partout ; seule la
                    // redirection est épargnée à une page ouverte à tous.
                    if (!pageOuverte) window.location.href = '/login';
                }
            } else if (status === 403 && !pageOuverte) {
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
