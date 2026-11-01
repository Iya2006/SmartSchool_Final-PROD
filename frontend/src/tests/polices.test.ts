import { describe, it, expect, afterEach } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { adressesAbsolues, reglesDesPolices } from '@/lib/polices';

const SRC = path.resolve(__dirname, '..');

function fichiersDe(dossier: string): string[] {
    return readdirSync(dossier).flatMap((nom) => {
        const chemin = path.join(dossier, nom);
        if (statSync(chemin).isDirectory()) return nom === 'tests' ? [] : fichiersDe(chemin);
        return /\.(css|tsx?)$/.test(nom) ? [chemin] : [];
    });
}

describe('polices servies par l’application', () => {
    afterEach(() => { document.head.innerHTML = ''; });

    it('aucune police chargée depuis internet : elles manqueraient hors-ligne', () => {
        const externes = fichiersDe(SRC).filter((f) => /fonts\.(googleapis|gstatic)\.com/.test(readFileSync(f, 'utf8')));
        expect(externes.map((f) => path.relative(SRC, f))).toEqual([]);
    });

    it('chaque fichier déclaré dans polices.css existe', () => {
        const feuille = readFileSync(path.join(SRC, 'fonts', 'polices.css'), 'utf8');
        const fichiers = [...feuille.matchAll(/url\('\.\/([^']+)'\)/g)].map(([, nom]) => nom);
        expect(fichiers.length).toBeGreaterThan(0);
        for (const nom of fichiers) expect(statSync(path.join(SRC, 'fonts', nom)).size).toBeGreaterThan(0);
        // Celles des écrans, et les quatre choix de Paramètres › Apparence › Police.
        for (const famille of ['Inter', 'Sora', 'Plus Jakarta Sans', 'Fraunces', 'Nunito', 'Poppins']) {
            expect(feuille).toContain(`font-family: '${famille}'`);
        }
    });

    it('la fenêtre d’impression reçoit les @font-face de la page, et rien d’autre', () => {
        const style = document.createElement('style');
        style.textContent = "@font-face { font-family: 'Inter'; src: url('../media/inter-latin.woff2') format('woff2'); }"
            + ' body { color: red; }';
        document.head.appendChild(style);

        // jsdom ne restitue pas le descripteur `src` : les adresses sont
        // vérifiées ci-dessous, et dans un vrai navigateur.
        const regles = reglesDesPolices();
        expect(regles).toContain('@font-face');
        expect(regles).toContain('Inter');
        expect(regles).not.toContain('color: red');
    });

    it('les adresses des fichiers deviennent absolues, relatives à leur feuille de styles', () => {
        const feuille = 'http://127.0.0.1:47831/_next/static/chunks/app.css';
        expect(adressesAbsolues("src: url('../media/inter.woff2') format('woff2')", feuille))
            .toBe("src: url('http://127.0.0.1:47831/_next/static/media/inter.woff2') format('woff2')");
        expect(adressesAbsolues('src: url("/_next/static/media/sora.woff2")', feuille))
            .toBe('src: url("http://127.0.0.1:47831/_next/static/media/sora.woff2")');
        expect(adressesAbsolues('src: url(fraunces.woff2)', feuille))
            .toBe('src: url(http://127.0.0.1:47831/_next/static/chunks/fraunces.woff2)');
    });
});
