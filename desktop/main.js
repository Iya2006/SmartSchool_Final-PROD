/**
 * SmartSchool — application installée sur l'ordinateur de l'école.
 *
 * Lance, sur cet ordinateur :
 *   - le moteur SmartSchool (le même serveur Python qu'en ligne, en mode
 *     « poste ») avec sa base de données locale, un fichier sur le disque ;
 *   - l'interface (la même qu'en ligne, compilée pour parler au moteur local) ;
 * puis ouvre la fenêtre. Tout fonctionne avec ou sans internet ; internet ne
 * sert qu'à installer l'école la première fois et à synchroniser.
 *
 * Emplacements de développement (dépôt) : l'installeur (phase C) fournira les
 * mêmes éléments empaquetés, via les mêmes variables d'environnement.
 */
const { app, BrowserWindow, dialog, Menu, shell } = require('electron');
const { spawn, spawnSync } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const PORT_MOTEUR = Number(process.env.SMARTSCHOOL_PORT_MOTEUR || 47830);
const PORT_INTERFACE = Number(process.env.SMARTSCHOOL_PORT_INTERFACE || 47831);
const RACINE_DEPOT = path.resolve(__dirname, '..');

const PYTHON = process.env.SMARTSCHOOL_PYTHON
    || path.join(RACINE_DEPOT, 'backend', 'venv', 'Scripts', 'python.exe');
const DOSSIER_MOTEUR = process.env.SMARTSCHOOL_DOSSIER_MOTEUR || path.join(RACINE_DEPOT, 'backend');
const DOSSIER_INTERFACE = process.env.SMARTSCHOOL_INTERFACE
    || path.join(RACINE_DEPOT, 'frontend', '.next-poste', 'standalone');

const processus = [];
let fenetre = null;

function dossiersDuPoste() {
    const base = process.env.SMARTSCHOOL_DONNEES || path.join(app.getPath('userData'), 'donnees');
    const d = {
        base,
        baseDeDonnees: path.join(base, 'smartschool.db'),
        fichiers: path.join(base, 'fichiers'),
        poste: path.join(base, 'poste'),
        journaux: path.join(base, 'journaux'),
    };
    for (const dossier of [d.base, d.fichiers, d.poste, d.journaux]) fs.mkdirSync(dossier, { recursive: true });
    return d;
}

/** Clé qui signe les sessions de CET ordinateur : créée une fois, jamais transmise. */
function cleDeSession(dossierPoste) {
    const chemin = path.join(dossierPoste, 'cle-session');
    if (!fs.existsSync(chemin)) fs.writeFileSync(chemin, crypto.randomBytes(48).toString('hex'), { mode: 0o600 });
    return fs.readFileSync(chemin, 'utf8').trim();
}

function lancer(nom, commande, args, options, dossierJournaux) {
    const journal = fs.createWriteStream(path.join(dossierJournaux, `${nom}.log`), { flags: 'a' });
    journal.write(`\n=== ${new Date().toISOString()} démarrage ${nom} ===\n`);
    const p = spawn(commande, args, { ...options, windowsHide: true });
    p.stdout.pipe(journal);
    p.stderr.pipe(journal);
    p.on('exit', (code) => journal.write(`=== ${nom} arrêté (code ${code}) ===\n`));
    processus.push(p);
    return p;
}

/** Attend qu'une adresse réponde (n'importe quelle réponse HTTP). */
function attendre(url, delaiMs) {
    const limite = Date.now() + delaiMs;
    return new Promise((resolve, reject) => {
        const essayer = () => {
            const req = http.get(url, (res) => { res.resume(); resolve(); });
            req.on('error', () => {
                if (Date.now() > limite) reject(new Error(`${url} ne répond pas`));
                else setTimeout(essayer, 400);
            });
            req.setTimeout(3000, () => req.destroy());
        };
        essayer();
    });
}

async function demarrerServices() {
    const d = dossiersDuPoste();
    const environnementMoteur = {
        ...process.env,
        SMARTSCHOOL_MODE: 'poste',
        DATABASE_URL: `sqlite:///${d.baseDeDonnees.replace(/\\/g, '/')}`,
        SMARTSCHOOL_DOSSIER_FICHIERS: d.fichiers,
        SMARTSCHOOL_DOSSIER_POSTE: d.poste,
        SMARTSCHOOL_CLOUD_URL: process.env.SMARTSCHOOL_CLOUD_URL || 'https://api.trxsmartschool.com',
        // Le QR des reçus mène au site public, où ils se vérifient ; jamais à
        // l'interface locale de ce poste (127.0.0.1), injoignable du parent.
        FRONTEND_PUBLIC_URL: process.env.SMARTSCHOOL_SITE_URL || 'https://trxsmartschool.com',
        JWT_SECRET_KEY: cleDeSession(d.poste),
        CORS_ORIGINS: `http://127.0.0.1:${PORT_INTERFACE},http://localhost:${PORT_INTERFACE}`,
        PYTHONIOENCODING: 'utf-8',
        PYTHONUTF8: '1',
    };
    lancer('moteur', PYTHON,
        ['-m', 'uvicorn', 'main:app', '--host', '127.0.0.1', '--port', String(PORT_MOTEUR)],
        { cwd: DOSSIER_MOTEUR, env: environnementMoteur }, d.journaux);

    lancer('interface', process.execPath, [path.join(DOSSIER_INTERFACE, 'server.js')], {
        cwd: DOSSIER_INTERFACE,
        env: {
            ...process.env,
            ELECTRON_RUN_AS_NODE: '1',
            NODE_ENV: 'production',
            PORT: String(PORT_INTERFACE),
            HOSTNAME: '127.0.0.1',
        },
    }, d.journaux);

    await Promise.all([
        attendre(`http://127.0.0.1:${PORT_MOTEUR}/health`, 120000),
        attendre(`http://127.0.0.1:${PORT_INTERFACE}/login`, 120000),
    ]);
    return d;
}

function arreterServices() {
    for (const p of processus) {
        if (p.exitCode !== null) continue;
        // Sous Windows, le Python d'un environnement virtuel lance lui-même un
        // second processus : il faut arrêter l'arbre entier, sinon le moteur
        // continuerait de tourner (et d'occuper son port) après la fermeture.
        if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(p.pid), '/T', '/F'], { windowsHide: true });
        else p.kill();
    }
}

function creerFenetre() {
    fenetre = new BrowserWindow({
        width: 1440,
        height: 900,
        minWidth: 1024,
        minHeight: 680,
        show: false,
        title: 'SmartSchool',
        backgroundColor: '#0f172a',
        webPreferences: { contextIsolation: true, sandbox: true },
    });
    // Les liens externes s'ouvrent dans le navigateur, jamais dans l'application.
    fenetre.webContents.setWindowOpenHandler(({ url }) => {
        if (!url.startsWith(`http://127.0.0.1:${PORT_INTERFACE}`)) {
            void shell.openExternal(url);
            return { action: 'deny' };
        }
        return { action: 'allow' };
    });
    return fenetre;
}

const verrou = app.requestSingleInstanceLock();
if (!verrou) {
    app.quit();
} else {
    app.on('second-instance', () => {
        if (fenetre) {
            if (fenetre.isMinimized()) fenetre.restore();
            fenetre.focus();
        }
    });

    app.whenReady().then(async () => {
        Menu.setApplicationMenu(null);
        const chargement = new BrowserWindow({
            width: 460, height: 300, frame: false, resizable: false, backgroundColor: '#0f172a',
            webPreferences: { contextIsolation: true, sandbox: true },
        });
        void chargement.loadFile(path.join(__dirname, 'demarrage.html'));

        try {
            const d = await demarrerServices();
            const principale = creerFenetre();
            principale.once('ready-to-show', () => {
                chargement.destroy();
                principale.show();
            });
            await principale.loadURL(`http://127.0.0.1:${PORT_INTERFACE}/login`);
            principale.on('closed', () => { fenetre = null; });
            console.log(`SmartSchool prêt — données : ${d.base}`);
        } catch (erreur) {
            chargement.destroy();
            dialog.showErrorBox(
                'SmartSchool ne peut pas démarrer',
                `Le moteur SmartSchool de cet ordinateur n'a pas démarré.\n\n${erreur.message}\n\n`
                + 'Les journaux se trouvent dans le dossier de données de SmartSchool (sous-dossier « journaux »).',
            );
            app.quit();
        }
    });

    app.on('window-all-closed', () => app.quit());
    app.on('will-quit', arreterServices);
}
