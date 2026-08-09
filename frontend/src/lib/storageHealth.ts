/**
 * Détection de l'état du stockage local — Étape D (§16).
 *
 * Objectif limité et volontaire : DÉTECTER un stockage presque plein ou
 * une erreur IndexedDB, pas encore une politique d'éviction automatique
 * (différée — voir le rapport Étape C : pas de données d'usage réelles
 * pour la calibrer sans deviner). Le principe non négociable reste :
 * échec cache ≠ échec application. Rien ici ne doit jamais lever
 * d'exception vers l'appelant.
 */

export interface StorageHealth {
    /** `false` si navigator.storage.estimate() est indisponible (navigateur
     * trop ancien, contexte non sécurisé) — pas une erreur, juste "inconnu". */
    available: boolean;
    usageBytes: number | null;
    quotaBytes: number | null;
    percentUsed: number | null;
    /** true si percentUsed >= 90% — seuil simple, pas encore configurable. */
    critical: boolean;
}

const CRITICAL_THRESHOLD_PERCENT = 90;

export async function getStorageHealth(): Promise<StorageHealth> {
    const unavailable: StorageHealth = { available: false, usageBytes: null, quotaBytes: null, percentUsed: null, critical: false };

    if (typeof navigator === 'undefined' || !navigator.storage?.estimate) {
        return unavailable;
    }

    try {
        const { usage, quota } = await navigator.storage.estimate();
        if (usage === undefined || quota === undefined || quota === 0) {
            return unavailable;
        }
        const percentUsed = (usage / quota) * 100;
        return {
            available: true,
            usageBytes: usage,
            quotaBytes: quota,
            percentUsed,
            critical: percentUsed >= CRITICAL_THRESHOLD_PERCENT,
        };
    } catch {
        // navigator.storage.estimate() a lui-même échoué — traité comme
        // "inconnu", jamais propagé.
        return unavailable;
    }
}

/** true si une erreur ressemble à un dépassement de quota IndexedDB — les
 * navigateurs n'utilisent pas tous le même nom d'exception. */
export function isQuotaExceededError(error: unknown): boolean {
    if (!(error instanceof DOMException)) return false;
    return error.name === 'QuotaExceededError' || error.code === 22;
}
