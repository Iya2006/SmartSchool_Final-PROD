/**
 * Écran « Synchronisation » (app/synchronisation) : ce qui sert à comparer les
 * deux versions d'une donnée que la synchronisation n'a pas pu fusionner.
 */

// Colonnes techniques, sans intérêt pour trancher.
const IGNOREES = new Set(['created_date', 'created_at', 'updated_at', 'modified_date', 'code_verification']);

export interface VersionsEnConflit {
    version_poste: Record<string, unknown> | null;
    version_serveur: Record<string, unknown> | null;
}

export function valeurLisible(v: unknown): string {
    if (v === null || v === undefined || v === '') return '—';
    return typeof v === 'object' ? JSON.stringify(v) : String(v);
}

/** Les champs où les deux versions diffèrent ; tous, si l'une des deux manque
 * (ligne supprimée d'un côté, ou refusée par le serveur). */
export function champsEnDesaccord(c: VersionsEnConflit): string[] {
    const poste = c.version_poste || {};
    const serveur = c.version_serveur || {};
    const noms = new Set([...Object.keys(poste), ...Object.keys(serveur)]);
    const unSeulCote = !c.version_poste || !c.version_serveur;
    return [...noms].filter(n => !IGNOREES.has(n)
        && (unSeulCote || valeurLisible(poste[n]) !== valeurLisible(serveur[n])));
}

/** « montant_remise » → « Montant remise », « classe_id » → « Classe ». */
export function libelleChamp(nom: string): string {
    const texte = nom.replace(/_id$/, '').replace(/_/g, ' ');
    return texte.charAt(0).toUpperCase() + texte.slice(1);
}
