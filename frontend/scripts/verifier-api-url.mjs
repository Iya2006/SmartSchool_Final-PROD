/*
 * Refuse un deploiement dont l'adresse d'API pointe sur la machine locale.
 *
 * POURQUOI CE GARDE-FOU EXISTE
 * `NEXT_PUBLIC_API_URL` est figee dans le bundle au moment du build. Or Next.js
 * donne la priorite a `.env.local` sur `.env.production` :
 *
 *   variable du shell  >  .env.local  >  .env.production
 *
 * Un deploiement lance depuis un poste de dev embarque donc silencieusement le
 * `http://localhost:8300` de `.env.local`. Le site se charge normalement, la
 * page de connexion s'affiche, et l'erreur n'apparait qu'au premier appel :
 * « Serveur injoignable ». C'est deja arrive une fois — d'ou ce controle, qui
 * echoue AVANT la construction plutot qu'apres la mise en ligne.
 *
 * Un build en CI (Cloudflare Workers Builds) n'a pas de `.env.local` : il lit
 * `.env.production` et passe sans rien avoir a faire.
 */
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const racine = join(dirname(fileURLToPath(import.meta.url)), '..');
const VARIABLE = 'NEXT_PUBLIC_API_URL';

/** Lit une variable dans un fichier .env, sans dependance externe. */
function lireDansFichier(nomFichier) {
    const chemin = join(racine, nomFichier);
    if (!existsSync(chemin)) return undefined;
    for (const ligne of readFileSync(chemin, 'utf8').split(/\r?\n/)) {
        const nette = ligne.trim();
        if (!nette || nette.startsWith('#')) continue;
        const separateur = nette.indexOf('=');
        if (separateur === -1) continue;
        if (nette.slice(0, separateur).trim() !== VARIABLE) continue;
        return nette.slice(separateur + 1).trim().replace(/^["']|["']$/g, '');
    }
    return undefined;
}

// Le meme ordre de priorite que Next.js, sinon le controle validerait une
// valeur que la construction n'utilisera pas. La source est retenue en meme
// temps que la valeur : les deux doivent designer la meme origine, sinon le
// message d'erreur enverrait chercher le probleme dans le mauvais fichier.
const candidats = [
    ['variable du shell', process.env[VARIABLE]?.trim()],
    ['.env.local', lireDansFichier('.env.local')],
    ['.env.production', lireDansFichier('.env.production')],
];
const [source, valeur] = candidats.find(([, v]) => v) ?? ['aucune source', undefined];

const estLocale = (adresse) => /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(:|\/|$)/i.test(adresse);

if (!valeur) {
    console.error(`\n[deploiement refuse] ${VARIABLE} n'est definie nulle part.`);
    console.error(`Sans elle, l'application deployee retombe sur le defaut de lib/api.ts`);
    console.error(`(http://localhost:8300) et ne joint plus le backend.\n`);
    process.exit(1);
}

if (estLocale(valeur)) {
    console.error(`\n[deploiement refuse] ${VARIABLE} = ${valeur}  (source : ${source})`);
    console.error(`Cette adresse ne designe que votre machine : mise en ligne, l'application`);
    console.error(`afficherait « Serveur injoignable » des la premiere connexion.\n`);
    console.error(`Pour deployer depuis ce poste, forcez l'adresse de production :`);
    console.error(`  PowerShell : $env:${VARIABLE} = "https://api.trxsmartschool.com"; npm run cf:deploy`);
    console.error(`  Bash       : ${VARIABLE}="https://api.trxsmartschool.com" npm run cf:deploy\n`);
    process.exit(1);
}

console.log(`[deploiement] ${VARIABLE} = ${valeur}  (source : ${source})`);
