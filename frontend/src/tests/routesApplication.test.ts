/**
 * Garde-fou : la liste des écrans préchargés pour le hors-ligne suit les pages
 * réellement présentes. Un nouvel écran oublié ici ne serait pas disponible
 * sans réseau tant qu'il n'a pas été ouvert une première fois.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, statSync } from 'fs';
import path from 'path';
import { ROUTES_APPLICATION, ROUTES_PUBLIQUES } from '@/lib/routesApplication';

function pagesStatiques(dossier: string, prefixe = ''): string[] {
    const routes: string[] = [];
    for (const nom of readdirSync(dossier)) {
        const chemin = path.join(dossier, nom);
        if (!statSync(chemin).isDirectory()) {
            if (nom === 'page.tsx') routes.push(prefixe || '/');
            continue;
        }
        if (nom.startsWith('[')) continue; // écran à identifiant : mis en cache à la visite
        routes.push(...pagesStatiques(chemin, `${prefixe}/${nom}`));
    }
    return routes;
}

describe('routesApplication', () => {
    it('chaque écran fixe de src/app est soit préchargé, soit déclaré public', () => {
        const reelles = pagesStatiques(path.resolve(__dirname, '../app')).sort();
        const declarees = [...ROUTES_APPLICATION, ...ROUTES_PUBLIQUES].sort();
        expect(declarees).toEqual(reelles);
    });

    it('aucun écran n’est à la fois préchargé et public', () => {
        const publiques = new Set(ROUTES_PUBLIQUES);
        expect(ROUTES_APPLICATION.filter((r) => publiques.has(r))).toEqual([]);
    });
});
