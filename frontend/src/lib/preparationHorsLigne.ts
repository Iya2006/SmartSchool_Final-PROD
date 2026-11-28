/**
 * Préparation du poste pour le hors-ligne.
 *
 * Le Service Worker (src/app/sw.ts) garde une copie de chaque lecture de l'API,
 * mais seulement de ce qui a déjà été lu sur ce poste. Ce module comble le
 * reste, en arrière-plan, pendant que le réseau est là :
 *
 * - les écrans du rôle (HTML), pour qu'un écran jamais ouvert s'affiche
 *   quand même hors-ligne ;
 * - les lectures déjà faites par ce compte (mémorisées au fil de l'eau par
 *   lib/api.ts), relues pour que leur copie soit récente ;
 * - pour un enseignant, ses classes et listes d'élèves, même jamais ouvertes :
 *   c'est ce dont il a besoin pour faire l'appel et saisir les notes.
 *
 * Les lectures passent par `api` : le Service Worker les met en cache au
 * passage, avec la même clé cloisonnée par compte que d'habitude.
 *
 * Un écran jamais ouvert n'a pas seulement besoin de sa mise en page : sans
 * ses données, il s'afficherait hors-ligne comme vide (« Aucune matière dans le
 * système »), ce qui est trompeur. Au plus une fois par semaine, chaque écran
 * du rôle est donc ouvert en coulisse, dans une fenêtre invisible et passive
 * (lib/fenetrePreparation.ts) : il fait lui-même ses lectures, avec les bons
 * paramètres, sans qu'on ait à les recopier ici.
 */
import { createStore, get, set } from 'idb-keyval';
import api from './api';
import { compteDuJeton } from './offlineCacheKey';
import { NOM_FENETRE_PREPARATION, estFenetrePreparation } from './fenetrePreparation';
import { isOnlineOnlyPath } from './offlinePolicy';
import { ROUTES_APPLICATION } from './routesApplication';
import { canAccessPathForRole, getRedirectPathForRole } from './roleAccess';

const magasin = createStore('smartschool-preparation', 'lectures');

export const CLE_ETAT_PREPARATION = 'smartschool_preparation_hors_ligne';
export const CACHE_ECRANS = 'smartschool-pages';

const MAX_LECTURES = 1500;
const DUREE_VIE_LECTURE_MS = 30 * 24 * 60 * 60 * 1000;
const DELAI_ENREGISTREMENT_MS = 2000;
const PARALLELISME = 3;
const INTERVALLE_VISITES_MS = 7 * 24 * 60 * 60 * 1000;
// Un écran ouvert en coulisse est considéré chargé quand il n'a plus rien
// demandé depuis ce délai — plus long que DELAI_ENREGISTREMENT_MS, pour que ses
// lectures soient mémorisées avant que la fenêtre ne soit retirée.
const CALME_APRES_CHARGEMENT_MS = 2500;
const DUREE_MAX_VISITE_MS = 15000;

type Lectures = Record<string, number>;

interface Utilisateur {
    id: number | string;
    role: string;
    role_base?: string | null;
    acces_comptabilite?: string | null;
}

export interface EtatPreparation {
    compte: string;
    date: string;
    ecrans: number;
    donnees: number;
    echecs: number;
    /** Dernière fois que chaque écran a été ouvert en coulisse. */
    visites?: string;
}

export interface Progression {
    fait: number;
    total: number;
}

function compteConnecte(): string | null {
    if (typeof window === 'undefined') return null;
    const jeton = localStorage.getItem('smartschool_token');
    return jeton ? compteDuJeton(`Bearer ${jeton}`) : null;
}

function utilisateurConnecte(): Utilisateur | null {
    try {
        const brut = localStorage.getItem('smartschool_user');
        return brut ? (JSON.parse(brut) as Utilisateur) : null;
    } catch {
        return null;
    }
}

// ── Mémorisation des lectures ──────────────────────────────────────────────
// Regroupées en mémoire puis écrites d'un coup : des dizaines de lectures
// arrivent en parallèle au chargement d'un écran, des écritures IndexedDB
// concurrentes (lire-modifier-écrire) s'écraseraient entre elles.

const tampon = new Map<string, Lectures>();
let minuteur: ReturnType<typeof setTimeout> | null = null;

function elaguer(lectures: Lectures): Lectures {
    const limite = Date.now() - DUREE_VIE_LECTURE_MS;
    return Object.fromEntries(
        Object.entries(lectures)
            .filter(([, vue]) => vue >= limite)
            .sort((a, b) => b[1] - a[1])
            .slice(0, MAX_LECTURES),
    );
}

async function enregistrerTampon(): Promise<void> {
    minuteur = null;
    const lots = Array.from(tampon.entries());
    tampon.clear();
    for (const [compte, lot] of lots) {
        try {
            const actuelles = (await get<Lectures>(compte, magasin)) ?? {};
            await set(compte, elaguer({ ...actuelles, ...lot }), magasin);
        } catch {
            // IndexedDB indisponible : on perd seulement le préchargement.
        }
    }
}

/** `chemin` = chemin relatif de l'API, requête comprise (`/api/eleves?page=2`). */
export function memoriserLecture(chemin: string): void {
    if (!chemin.startsWith('/api/')) return;
    if (isOnlineOnlyPath(chemin.split('?')[0])) return;
    const compte = compteConnecte();
    if (!compte) return;
    const lot = tampon.get(compte) ?? {};
    lot[chemin] = Date.now();
    tampon.set(compte, lot);
    if (!minuteur) minuteur = setTimeout(() => void enregistrerTampon(), DELAI_ENREGISTREMENT_MS);
}

async function oublierLecture(compte: string, chemin: string): Promise<void> {
    try {
        const lectures = (await get<Lectures>(compte, magasin)) ?? {};
        delete lectures[chemin];
        await set(compte, lectures, magasin);
    } catch {
        // idem
    }
}

/** Lectures mémorisées pour ce compte. `vuesAvant` : seulement celles qui n'ont
 * pas été relues depuis cette date (inutile de relire ce qu'une visite en
 * coulisse vient de rafraîchir). */
export async function lecturesMemorisees(compte: string, vuesAvant?: number): Promise<string[]> {
    try {
        const lectures = elaguer((await get<Lectures>(compte, magasin)) ?? {});
        return Object.entries(lectures)
            .filter(([, vue]) => vuesAvant === undefined || vue < vuesAvant)
            .map(([chemin]) => chemin);
    } catch {
        return [];
    }
}

/**
 * Ouvre `ecran` dans une fenêtre invisible et attend qu'il ait fini ses
 * lectures (plus aucune requête depuis CALME_APRES_CHARGEMENT_MS), sans jamais
 * dépasser DUREE_MAX_VISITE_MS. Ne rejette jamais.
 */
function visiterEnCoulisse(ecran: string): Promise<void> {
    return new Promise((resolve) => {
        const cadre = document.createElement('iframe');
        cadre.name = NOM_FENETRE_PREPARATION;
        cadre.setAttribute('aria-hidden', 'true');
        cadre.tabIndex = -1;
        // Hors de l'écran mais à taille réelle : certains écrans ne chargent
        // leurs données qu'une fois mis en page.
        cadre.style.cssText =
            'position:fixed;left:-20000px;top:0;width:1280px;height:800px;border:0;opacity:0;pointer-events:none;';

        const debut = Date.now();
        let nombrePrecedent = -1;
        let calmeDepuis = debut;
        let fini = false;
        const terminer = () => {
            if (fini) return;
            fini = true;
            clearInterval(sonde);
            clearTimeout(limite);
            cadre.remove();
            resolve();
        };
        const limite = setTimeout(terminer, DUREE_MAX_VISITE_MS);
        const sonde = setInterval(() => {
            try {
                const fenetre = cadre.contentWindow;
                if (!fenetre || fenetre.document.readyState !== 'complete') return;
                const nombre = fenetre.performance.getEntriesByType('resource').length;
                if (nombre !== nombrePrecedent) {
                    nombrePrecedent = nombre;
                    calmeDepuis = Date.now();
                } else if (Date.now() - calmeDepuis >= CALME_APRES_CHARGEMENT_MS) {
                    terminer();
                }
            } catch {
                terminer();
            }
        }, 500);

        cadre.src = ecran;
        document.body.appendChild(cadre);
    });
}

// ── Ce qu'il faut précharger ───────────────────────────────────────────────

export function ecransDuRole(utilisateur: Utilisateur): string[] {
    const ecrans = ROUTES_APPLICATION.filter((r) =>
        canAccessPathForRole(utilisateur.role, r, utilisateur.role_base, utilisateur.acces_comptabilite),
    );
    // Les portails du personnel (`/personnel/portail/<role>`) sont des écrans à
    // paramètre, absents de la liste fixe : on ajoute celui du compte.
    const accueil = getRedirectPathForRole(utilisateur.role, utilisateur.role_base, utilisateur.acces_comptabilite);
    if (accueil !== '/login' && !ecrans.includes(accueil)) ecrans.push(accueil);
    return ecrans;
}

/** Lectures indispensables même si l'écran n'a jamais été ouvert. Aujourd'hui :
 * l'enseignant, pour l'appel et les notes. Les autres rôles s'appuient sur les
 * lectures mémorisées. */
async function lecturesDeDepart(utilisateur: Utilisateur): Promise<string[]> {
    if (utilisateur.role !== 'ENSEIGNANT') return [];
    const base = `/api/portail-enseignant/${utilisateur.id}`;
    const chemins = [
        `${base}/dashboard`,
        `${base}/seances/jour`,
        `${base}/seances/historique`,
        `${base}/emploi-du-temps`,
        `${base}/evaluations`,
        `${base}/historique-appels`,
        '/api/portail-enseignant/referentiels/trimestres',
        '/api/portail-enseignant/referentiels/types-evaluation',
        `/api/devoirs/enseignant/${utilisateur.id}`,
        '/api/evenements',
        '/api/activites',
    ];
    try {
        const { data } = await api.get(`${base}/dashboard`);
        const classes = new Set<number>((data?.affectations ?? []).map((a: { classe_id: number }) => a.classe_id));
        for (const classe of classes) chemins.push(`${base}/classe/${classe}/eleves`);
    } catch {
        // Le tableau de bord sera retenté avec le reste.
    }
    return chemins;
}

// ── Déroulement ────────────────────────────────────────────────────────────

const abonnes = new Set<(p: Progression | null) => void>();
let progression: Progression | null = null;
let enCours = false;

function emettre(p: Progression | null) {
    progression = p;
    abonnes.forEach((f) => f(p));
}

/** Suit la progression (`null` = aucune préparation en cours). */
export function suivrePreparation(f: (p: Progression | null) => void): () => void {
    abonnes.add(f);
    f(progression);
    return () => abonnes.delete(f);
}

export function lireEtatPreparation(): EtatPreparation | null {
    const compte = compteConnecte();
    if (!compte) return null;
    try {
        const brut = localStorage.getItem(CLE_ETAT_PREPARATION);
        const etat = brut ? (JSON.parse(brut) as EtatPreparation) : null;
        return etat && etat.compte === compte ? etat : null;
    } catch {
        return null;
    }
}

async function parLots<T>(elements: T[], taille: number, traiter: (e: T) => Promise<void>): Promise<void> {
    let index = 0;
    const travailleurs = Array.from({ length: Math.min(taille, elements.length) }, async () => {
        while (index < elements.length) {
            const element = elements[index++];
            await traiter(element);
        }
    });
    await Promise.all(travailleurs);
}

/** Les lectures faites dans la fenêtre invisible sont mémorisées par sa propre
 * copie de ce module, après DELAI_ENREGISTREMENT_MS : on leur laisse le temps
 * d'arriver dans IndexedDB avant de relire la liste. */
function attendreEnregistrement(): Promise<void> {
    return new Promise((r) => setTimeout(r, DELAI_ENREGISTREMENT_MS + 500));
}

function serviceWorkerActif(): boolean {
    return typeof navigator !== 'undefined' && !!navigator.serviceWorker?.controller;
}

/**
 * Lance une préparation complète. Ne fait rien hors-ligne, sans compte
 * connecté, sans Service Worker actif (rien ne serait gardé), ou si une
 * préparation est déjà en cours.
 */
export async function preparerPoste(): Promise<EtatPreparation | null> {
    if (enCours || typeof window === 'undefined' || navigator.onLine === false || !serviceWorkerActif()) return null;
    // Jamais depuis la fenêtre invisible elle-même (préparation imbriquée).
    if (estFenetrePreparation() || window.top !== window) return null;
    const compte = compteConnecte();
    const utilisateur = utilisateurConnecte();
    if (!compte || !utilisateur) return null;

    enCours = true;
    let echecs = 0;
    try {
        const debut = Date.now();
        await enregistrerTampon();
        const precedent = lireEtatPreparation();
        const visitesDues = !precedent?.visites
            || debut - new Date(precedent.visites).getTime() >= INTERVALLE_VISITES_MS;
        const ecrans = ecransDuRole(utilisateur);
        const depart = await lecturesDeDepart(utilisateur);
        // Le total exact des lectures n'est connu qu'après les visites :
        // la progression l'estime d'abord sur ce qui est déjà mémorisé.
        let total = ecrans.length * (visitesDues ? 2 : 1)
            + depart.length + (await lecturesMemorisees(compte)).length;
        let fait = 0;
        emettre({ fait, total });

        const cacheEcrans = await caches.open(CACHE_ECRANS);
        await parLots(ecrans, PARALLELISME, async (ecran) => {
            try {
                await cacheEcrans.add(ecran);
            } catch {
                echecs++;
            }
            emettre({ fait: ++fait, total });
        });

        // Une visite à la fois : chaque écran charge toute l'application.
        if (visitesDues) {
            for (const ecran of ecrans) {
                await visiterEnCoulisse(ecran);
                emettre({ fait: ++fait, total });
            }
            await attendreEnregistrement();
        }

        // Ce que les visites viennent de relire n'est pas relu une seconde fois.
        const lectures = Array.from(new Set([
            ...depart,
            ...(await lecturesMemorisees(compte, debut)),
        ]));
        total = fait + lectures.length;
        emettre({ fait, total });

        await parLots(lectures, PARALLELISME, async (chemin) => {
            try {
                await api.get(chemin);
            } catch (err) {
                echecs++;
                const statut = (err as { response?: { status?: number } })?.response?.status;
                // Donnée supprimée ou plus accessible à ce compte : inutile de
                // la redemander à chaque préparation.
                if (statut === 403 || statut === 404) await oublierLecture(compte, chemin);
            }
            emettre({ fait: ++fait, total });
        });

        const etat: EtatPreparation = {
            compte,
            date: new Date().toISOString(),
            ecrans: ecrans.length,
            donnees: (await lecturesMemorisees(compte)).length,
            echecs,
            visites: visitesDues ? new Date(debut).toISOString() : precedent?.visites,
        };
        localStorage.setItem(CLE_ETAT_PREPARATION, JSON.stringify(etat));
        return etat;
    } finally {
        enCours = false;
        emettre(null);
    }
}

/** Lance la préparation si la dernière date de plus de `intervalleMs`. */
export function preparerSiNecessaire(intervalleMs: number): void {
    const etat = lireEtatPreparation();
    if (etat && Date.now() - new Date(etat.date).getTime() < intervalleMs) return;
    void preparerPoste();
}
