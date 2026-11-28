/**
 * Dernières valeurs de démarrage connues (années scolaires, identité de
 * l'école, réglages du thème), pour qu'AppContext démarre correctement sans
 * réseau.
 *
 * Le cache du Service Worker sert déjà ces réponses hors-ligne ; cette copie
 * couvre les cas où il ne peut pas répondre : Service Worker pas encore actif
 * (premier chargement après une mise à jour), mode développement, cache vidé
 * par le navigateur. Sans elle, l'application démarrait sur l'année n°1 (celle
 * d'une autre école) avec le libellé « 2024-2025 ».
 *
 * La copie appartient à UN compte (lu dans le jeton) : un autre compte
 * connecté sur le même poste ne la lit jamais. Supprimée à la déconnexion
 * (lib/sessionCleanup.ts).
 */
import { compteDuJeton } from './offlineCacheKey';

export const CLE_MEMO_HORS_LIGNE = 'smartschool_memo_hors_ligne';

export interface MemoHorsLigne {
    compte: string;
    annees?: unknown[];
    reglages?: unknown[];
    etablissement?: Record<string, unknown>;
}

type Contenu = Omit<MemoHorsLigne, 'compte'>;

function compteCourant(): string | null {
    if (typeof window === 'undefined') return null;
    const jeton = localStorage.getItem('smartschool_token');
    return jeton ? compteDuJeton(`Bearer ${jeton}`) : null;
}

export function lireMemo(): MemoHorsLigne | null {
    const compte = compteCourant();
    if (!compte) return null;
    try {
        const brut = localStorage.getItem(CLE_MEMO_HORS_LIGNE);
        const memo = brut ? (JSON.parse(brut) as MemoHorsLigne) : null;
        return memo && memo.compte === compte ? memo : null;
    } catch {
        return null;
    }
}

export function ecrireMemo(partiel: Contenu): void {
    const compte = compteCourant();
    if (!compte) return;
    try {
        const actuel = lireMemo() ?? { compte };
        localStorage.setItem(CLE_MEMO_HORS_LIGNE, JSON.stringify({ ...actuel, ...partiel, compte }));
    } catch {
        // Stockage plein ou indisponible : on perd seulement le filet hors-ligne.
    }
}

export function effacerMemo(): void {
    try {
        localStorage.removeItem(CLE_MEMO_HORS_LIGNE);
    } catch {
        // idem
    }
}
