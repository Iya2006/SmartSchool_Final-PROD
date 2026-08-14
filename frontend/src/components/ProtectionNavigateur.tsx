'use client';

/*
 * PROTECTION NAVIGATEUR — un garde-fou, pas une serrure.
 *
 * CE QUE CE COMPOSANT FAIT VRAIMENT
 * Il décourage le geste ordinaire : clic droit, F12, Ctrl+Maj+I, « afficher le
 * code source », glisser-déposer d'une image hors de la page. Un utilisateur
 * qui tape à côté ou qui fouille par curiosité s'arrête là.
 *
 * CE QU'IL NE FAIT PAS, ET QU'IL NE PEUT PAS FAIRE
 * Il ne protège aucune donnée. Tout ce que le navigateur affiche, la personne
 * devant l'écran peut l'obtenir : par le menu du navigateur, en désactivant
 * JavaScript, avec un proxy, ou simplement en rechargeant la page hors de
 * l'application. Aucune ligne de JavaScript ne peut empêcher cela — le code
 * qui interdit tourne dans le navigateur même qu'il prétend contrôler.
 *
 * LA VRAIE PROTECTION EST AILLEURS, ET ELLE EXISTE DÉJÀ
 * Le serveur ne renvoie à chaque compte que ce qui le concerne : l'école vient
 * du jeton et jamais de la page, une classe d'une autre école répond
 * « introuvable », la comptabilité est fermée à qui n'y a pas droit, et la
 * rémunération est masquée pour qui ne doit pas la voir. C'est là que se joue
 * la sécurité — ici, on évite seulement les fausses manœuvres.
 *
 * Le raccourci de rafraîchissement (F5, Ctrl+R) reste libre : le bloquer
 * empêcherait un utilisateur bloqué de se sortir d'un écran figé.
 */

import { useEffect } from 'react';

const TOUCHES_INSPECTION = (e: KeyboardEvent): boolean => {
    if (e.key === 'F12') return true;
    // Ctrl+Maj+I / J / C : outils de développement.
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && ['I', 'J', 'C'].includes(e.key.toUpperCase())) {
        return true;
    }
    // Ctrl+U : afficher le code source.
    if ((e.ctrlKey || e.metaKey) && e.key.toUpperCase() === 'U') return true;
    return false;
};

export default function ProtectionNavigateur() {
    useEffect(() => {
        const surClicDroit = (e: MouseEvent) => e.preventDefault();

        const surTouche = (e: KeyboardEvent) => {
            if (TOUCHES_INSPECTION(e)) {
                e.preventDefault();
                e.stopPropagation();
            }
        };

        // Une photo d'élève ne se glisse pas hors de l'application par
        // inadvertance — c'est la donnée personnelle la plus facile à sortir.
        const surGlisser = (e: DragEvent) => {
            const cible = e.target as HTMLElement | null;
            if (cible && cible.tagName === 'IMG') e.preventDefault();
        };

        document.addEventListener('contextmenu', surClicDroit);
        document.addEventListener('keydown', surTouche, true);
        document.addEventListener('dragstart', surGlisser);

        return () => {
            document.removeEventListener('contextmenu', surClicDroit);
            document.removeEventListener('keydown', surTouche, true);
            document.removeEventListener('dragstart', surGlisser);
        };
    }, []);

    return null;
}
