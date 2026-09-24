import { useEffect, useState, useCallback } from 'react';

const STORAGE_KEY = 'smartschool_whats_new_vu';

interface WhatsNewContenu {
    version: string;
    titre: string;
    points: string[];
}

/**
 * Détection réelle de nouvelle version — jamais de simulation. Deux
 * déclencheurs :
 *  1. Au montage (utilisateur qui se (re)connecte) : compare le fichier
 *     `whats-new.json` courant à la dernière version accusée réception.
 *  2. En direct, pendant que l'app est déjà ouverte : le Service Worker
 *     (déjà configuré avec skipWaiting/clientsClaim, voir sw.ts) prend le
 *     contrôle de l'onglet en silence dès qu'un nouveau déploiement est
 *     disponible — `window.serwist` (auto-injecté par @serwist/next,
 *     aucune inscription manuelle) émet alors `controlling` avec
 *     `isUpdate: true`. On réutilise cet évènement plutôt que d'inventer
 *     un sondage — comportement déjà en place, on ne fait qu'écouter.
 *
 * Un tout premier passage (aucune version jamais accusée réception)
 * n'affiche rien : un nouvel utilisateur n'a pas à voir un historique de
 * changements avant d'avoir utilisé l'app.
 */
export function useWhatsNew() {
    const [contenu, setContenu] = useState<WhatsNewContenu | null>(null);
    const [show, setShow] = useState(false);

    const verifier = useCallback(async () => {
        try {
            const res = await fetch('/whats-new.json', { cache: 'no-store' });
            if (!res.ok) return;
            const data = (await res.json()) as WhatsNewContenu;
            const derniereVue = localStorage.getItem(STORAGE_KEY);

            if (derniereVue === null) {
                // Premier passage jamais vu : on marque comme vu sans afficher.
                localStorage.setItem(STORAGE_KEY, data.version);
                return;
            }
            if (derniereVue !== data.version) {
                setContenu(data);
                setShow(true);
            }
        } catch {
            // Hors ligne ou fichier indisponible : pas de notification, pas d'erreur bloquante.
        }
    }, []);

    useEffect(() => {
        verifier();

        // Typage local minimal : ce projet n'a pas d'augmentation globale
        // pour `window.serwist` (@serwist/next l'injecte à l'exécution,
        // pas dans les types globaux du projet) — accès défensif plutôt
        // que de toucher la config TypeScript partagée pour ça seul.
        const serwist = (window as unknown as {
            serwist?: { addEventListener: (t: string, l: (e: { isUpdate?: boolean }) => void) => void; removeEventListener: (t: string, l: (e: { isUpdate?: boolean }) => void) => void };
        }).serwist;
        if (!serwist) return;

        const onControlling = (event: { isUpdate?: boolean }) => {
            if (event.isUpdate) verifier();
        };
        serwist.addEventListener('controlling', onControlling);
        return () => serwist.removeEventListener('controlling', onControlling);
    }, [verifier]);

    const confirmerLecture = useCallback(() => {
        if (!contenu) return;
        localStorage.setItem(STORAGE_KEY, contenu.version);
        window.location.reload();
    }, [contenu]);

    return { show, contenu, confirmerLecture };
}
