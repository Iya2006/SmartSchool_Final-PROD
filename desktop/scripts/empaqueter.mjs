/**
 * Construit l'installeur Windows de SmartSchool : `dist/SmartSchool-Setup.exe`.
 *
 * Tout ce dont un poste a besoin, sans rien à installer à côté :
 *   1. l'interface (même code que la version web, compilée pour le moteur local) ;
 *   2. un Python autonome (« embeddable » officiel, empreinte vérifiée) avec les
 *      bibliothèques du moteur, aux versions testées (backend/requirements-poste.txt) ;
 *   3. le moteur SmartSchool, compilé (.pyc) et sans ses sources ;
 *   4. l'installeur (electron-builder, NSIS), puis les fichiers de mise à jour.
 *
 * Garde-fous, l'empaquetage s'arrête si :
 *   - un secret (.env, dossier secrets/) ou une base de données se glisse dans le moteur ;
 *   - la version de l'application (package.json) et celle du moteur
 *     (backend/app/core/version.py) divergent : un poste annoncerait au cloud
 *     une version qui n'est pas la sienne.
 *
 * Usage : npm run empaqueter            (tout)
 *         npm run empaqueter -- --sans-interface   (réutilise l'interface déjà compilée)
 * Rien n'est publié : la publication (GitHub) est une étape à part, décidée.
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ici = path.dirname(fileURLToPath(import.meta.url));
const desktop = path.resolve(ici, '..');
const depot = path.resolve(desktop, '..');
const backend = path.join(depot, 'backend');
const sortie = path.join(desktop, 'empaquetage');
const cache = path.join(desktop, '.cache-empaquetage');

const PYTHON = {
    version: '3.14.2',
    fichier: 'python-3.14.2-embed-amd64.zip',
    // Empreinte publiée par python.org (bundle sigstore de l'archive).
    sha256: 'f05e28d161c6b15af64a7cb7f08b4a22b3a6b03eee71baee24ea557b3bdd5798',
    pth: 'python314._pth',
};
const PYTHON_DEV = path.join(backend, 'venv', 'Scripts', 'python.exe');

function executer(commande, args, options = {}) {
    const r = spawnSync(commande, args, { stdio: 'inherit', shell: process.platform === 'win32', ...options });
    if (r.status !== 0) throw new Error(`échec : ${commande} ${args.join(' ')}`);
}

function etape(texte) {
    console.log(`\n── ${texte} ──`);
}

// ── 0. Versions alignées ────────────────────────────────────────────────────
const versionApplication = JSON.parse(readFileSync(path.join(desktop, 'package.json'), 'utf8')).version;
const versionMoteur = readFileSync(path.join(backend, 'app', 'core', 'version.py'), 'utf8')
    .match(/^VERSION = "([^"]+)"/m)?.[1];
if (versionApplication !== versionMoteur) {
    throw new Error(`Versions divergentes : application ${versionApplication}, moteur ${versionMoteur}. `
        + 'Alignez desktop/package.json et backend/app/core/version.py.');
}
console.log(`SmartSchool ${versionApplication}`);

rmSync(sortie, { recursive: true, force: true });
mkdirSync(sortie, { recursive: true });
mkdirSync(cache, { recursive: true });

// ── 1. Interface ────────────────────────────────────────────────────────────
const interfaceCompilee = path.join(depot, 'frontend', '.next-poste', 'standalone');
if (!process.argv.includes('--sans-interface') || !existsSync(interfaceCompilee)) {
    etape('Interface');
    executer('node', [path.join(ici, 'construire-interface.mjs')]);
}
// Sans les fichiers d'environnement que Next recopie dans son serveur autonome :
// le serveur les relirait au démarrage, et ils visent le cloud, pas le moteur
// local (l'adresse du moteur est déjà inscrite dans l'interface compilée).
cpSync(interfaceCompilee, path.join(sortie, 'interface'), {
    recursive: true,
    filter: (source) => !/[\\/]\.env[^\\/]*$/.test(source),
});

// ── 2. Python autonome ──────────────────────────────────────────────────────
etape(`Python ${PYTHON.version}`);
const archive = path.join(cache, PYTHON.fichier);
if (!existsSync(archive)) {
    executer('curl', ['-sSL', '-o', archive, `https://www.python.org/ftp/python/${PYTHON.version}/${PYTHON.fichier}`]);
}
const empreinte = createHash('sha256').update(readFileSync(archive)).digest('hex');
if (empreinte !== PYTHON.sha256) {
    rmSync(archive, { force: true });
    throw new Error(`Archive Python altérée : empreinte ${empreinte}, attendue ${PYTHON.sha256}.`);
}
const python = path.join(sortie, 'python');
mkdirSync(python, { recursive: true });
// Le tar de Windows (bsdtar) : il lit les zip et les chemins « C:\ ». Celui de
// Git, s'il passe devant dans le PATH, prend « C: » pour un hôte distant.
const TAR = process.platform === 'win32' ? path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe') : 'tar';
executer(TAR, ['-xf', archive, '-C', python]);
// Le Python embarqué ignore PYTHONPATH : ses chemins sont déclarés ici,
// dont le dossier du moteur, voisin dans les ressources de l'application.
writeFileSync(path.join(python, PYTHON.pth),
    [`python${PYTHON.version.split('.').slice(0, 2).join('')}.zip`, '.', 'Lib\\site-packages', '..\\moteur', 'import site', ''].join('\r\n'));
executer(PYTHON_DEV, [
    '-m', 'pip', 'install', '--disable-pip-version-check', '--no-compile',
    '--target', path.join(python, 'Lib', 'site-packages'),
    '--only-binary=:all:', '--platform', 'win_amd64', '--implementation', 'cp',
    '--python-version', PYTHON.version.split('.').slice(0, 2).join('.'),
    '-r', path.join(backend, 'requirements-poste.txt'),
]);

// ── 3. Moteur, compilé, sans sources ni secrets ─────────────────────────────
etape('Moteur');
const moteur = path.join(sortie, 'moteur');
const INTERDITS = /(^|[\\/])(\.env[^\\/]*|secrets|__pycache__|tests?|venv|uploads|poste-local)([\\/]|$)|\.(db|db-wal|db-shm|sqlite)$/i;
for (const element of ['main.py', 'app', 'migrations']) {
    cpSync(path.join(backend, element), path.join(moteur, element), {
        recursive: true,
        filter: (source) => !INTERDITS.test(path.relative(backend, source)),
    });
}
executer(path.join(python, 'python.exe'), ['-m', 'compileall', '-b', '-q', moteur]);
function parcourir(dossier, rappel) {
    for (const nom of readdirSync(dossier)) {
        const chemin = path.join(dossier, nom);
        if (statSync(chemin).isDirectory()) parcourir(chemin, rappel);
        else rappel(chemin);
    }
}
parcourir(moteur, (fichier) => { if (fichier.endsWith('.py')) unlinkSync(fichier); });
// Contrôle final : rien d'interdit, et plus aucune source.
parcourir(moteur, (fichier) => {
    const relatif = path.relative(moteur, fichier);
    if (INTERDITS.test(relatif) || relatif.endsWith('.py')) {
        throw new Error(`Fichier qui ne doit pas être livré : ${relatif}`);
    }
});

parcourir(path.join(sortie, 'interface'), (fichier) => {
    if (/[\\/]\.env[^\\/]*$/.test(fichier)) throw new Error(`Fichier d'environnement dans l'interface : ${fichier}`);
});

// ── 4. Installeur ───────────────────────────────────────────────────────────
etape('Installeur');
cpSync(path.join(depot, 'frontend', 'public', 'icons', 'icon-512.png'), path.join(sortie, 'icon.png'));
executer('npx', ['electron-builder', '--win', 'nsis', '--x64', '--publish', 'never'], { cwd: desktop });
console.log(`\nInstalleur prêt : ${path.join(desktop, 'dist', 'SmartSchool-Setup.exe')}`);
