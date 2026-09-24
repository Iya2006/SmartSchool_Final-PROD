import { useEffect, useState, useCallback } from 'react';

const STORAGE_KEY = 'smartschool_whats_new_vu';

interface WhatsNewContenu {
    version: string;
    titre: string;
    points: string[];
}

// Vérifie assez souvent pour sembler "en direct" sans multiplier les
// requêtes inutilement.
const INTERVALLE_VERIF_MS = 2 * 60 * 1000;

/**
 * Détection réelle de nouvelle version — jamais de simulation.
 *
 * Premier essai (session précédente) : ne s'appuyait QUE sur l'évènement
 * `controlling` de `window.serwist`. En usage réel, un onglet déjà
 * ouvert qui ne navigue pas ne déclenche pas forcément de vérification
 * de Service Worker par le navigateur avant longtemps (le SW ne
 * s'occupe pas tout seul de vérifier régulièrement) — le popup n'est
 * jamais apparu lors du test réel. Corrigé avec DEUX déclencheurs actifs
 * en plus de l'écoute passive :
 *  1. Un intervalle qui relit directement `whats-new.json` (signal
 *     simple et fiable, indépendant des subtilités de cycle de vie du
 *     Service Worker) + appelle `window.serwist.update()` pour aussi
 *     forcer la vérification d'une nouvelle version de l'app elle-même.
 *  2. Un nouveau contrôle dès que l'onglet redevient visible
 *     (`visibilitychange`) — l'utilisateur qui revient sur l'app après
 *     l'avoir laissée en arrière-plan (mobile, autre onglet).
 * L'évènement `controlling` reste écouté en plus, sans coût : s'il se
 * déclenche plus tôt, tant mieux.
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
            serwist?: {
                addEventListener: (t: string, l: (e: { isUpdate?: boolean }) => void) => void;
                removeEventListener: (t: string, l: (e: { isUpdate?: boolean }) => void) => void;
                update: () => Promise<void>;
            };
        }).serwist;

        const onControlling = (event: { isUpdate?: boolean }) => {
            if (event.isUpdate) verifier();
        };
        serwist?.addEventListener('controlling', onControlling);

        // Déclencheur actif n°1 : intervalle. Relit whats-new.json (signal
        // direct) et demande au Service Worker de vérifier une nouvelle
        // version de l'app — sans ça, un onglet resté ouvert sans naviguer
        // peut ne jamais se re-vérifier avant longtemps.
        const intervalle = setInterval(() => {
            verifier();
            serwist?.update().catch(() => {});
        }, INTERVALLE_VERIF_MS);

        // Déclencheur actif n°2 : retour sur l'onglet après l'avoir laissé
        // en arrière-plan (mobile en particulier).
        const onVisibilite = () => {
            if (document.visibilityState === 'visible') {
                verifier();
                serwist?.update().catch(() => {});
            }
        };
        document.addEventListener('visibilitychange', onVisibilite);

        return () => {
            serwist?.removeEventListener('controlling', onControlling);
            clearInterval(intervalle);
            document.removeEventListener('visibilitychange', onVisibilite);
        };
    }, [verifier]);

    const confirmerLecture = useCallback(() => {
        if (!contenu) return;
        localStorage.setItem(STORAGE_KEY, contenu.version);
        window.location.reload();
    }, [contenu]);

    return { show, contenu, confirmerLecture };
}
