/**
 * Le texte à montrer quand une requête échoue.
 *
 * Le serveur explique ses refus (« Le nom ne peut pas être vide », « L'identifiant
 * … est déjà utilisé ») : c'est ce texte-là qu'on affiche. Sans réponse, ou sur
 * une panne du serveur, lib/api.ts a déjà remplacé `message` par une phrase
 * claire (hors ligne, serveur indisponible). Sinon, le texte prévu par l'écran —
 * jamais « Request failed with status code 400 ».
 */
export function texteErreur(erreur: unknown, parDefaut: string): string {
    const e = erreur as { isAxiosError?: boolean; message?: string; response?: { status?: number; data?: { detail?: unknown } } } | null;
    const detail = e?.response?.data?.detail;
    if (typeof detail === 'string' && detail.trim()) return detail;
    const sansReponseOuPanne = !e?.response || (e.response.status ?? 0) >= 500;
    if (e?.isAxiosError && sansReponseOuPanne && e.message) return e.message;
    return parDefaut;
}
