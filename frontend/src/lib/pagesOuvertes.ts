/**
 * Pages ouvertes à TOUS, connectés ou non, sans redirection : la
 * vérification d'un reçu (ouverte par son QR code) doit marcher aussi bien
 * pour un visiteur que pour un comptable connecté qui scanne un reçu.
 *
 * Partagé entre la garde de navigation (context/AuthContext.tsx) et
 * l'intercepteur 401/403 de lib/api.ts : si l'un des deux l'oubliait, une
 * session expirée (ou un compte parent) renverrait quand même le visiteur
 * vers /login ou vers son portail au lieu de lui montrer la vérification.
 */
export const PAGES_OUVERTES_A_TOUS = ['/verifier-recu'];

export function estPageOuverteATous(chemin: string | null | undefined): boolean {
    if (!chemin) return false;
    return PAGES_OUVERTES_A_TOUS.some(p => chemin === p || chemin.startsWith(`${p}/`));
}
