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
 * Installée (`app.isPackaged`), l'application trouve le Python autonome, le
 * moteur et l'interface dans ses ressources (desktop/scripts/empaqueter.mjs).
 * En développement, ceux du dépôt.
 *
 * Secrets de l'ordinateur (clé de la base, clé des sessions) : tirés au hasard
 * une fois, protégés par `safeStorage` (DPAPI, liée au compte Windows), jamais
 * écrits en clair. La base de l'école est chiffrée avec la première : un
 * ordinateur volé ne livre rien.
 */
const { app, BrowserWindow, dialog, Menu, safeStorage, shell } = require('electron');
const { spawn, spawnSync } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const PORT_MOTEUR = Number(process.env.SMARTSCHOOL_PORT_MOTEUR || 47830);
const PORT_INTERFACE = Number(process.env.SMARTSCHOOL_PORT_INTERFACE || 47831);
const RACINE_DEPOT = path.resolve(__dirname, '..');
const RESSOURCES = app.isPackaged ? process.resourcesPath : null;

const PYTHON = process.env.SMARTSCHOOL_PYTHON || (RESSOURCES
    ? path.join(RESSOURCES, 'python', 'python.exe')
    : path.join(RACINE_DEPOT, 'backend', 'venv', 'Scripts', 'python.exe'));
const DOSSIER_MOTEUR = process.env.SMARTSCHOOL_DOSSIER_MOTEUR || (RESSOURCES
    ? path.join(RESSOURCES, 'moteur')
    : path.join(RACINE_DEPOT, 'backend'));
const DOSSIER_INTERFACE = process.env.SMARTSCHOOL_INTERFACE || (RESSOURCES
    ? path.join(RESSOURCES, 'interface')
    : path.join(RACINE_DEPOT, 'frontend', '.next-poste', 'standalone'));

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

/**
 * Secret propre à CET ordinateur : tiré au hasard la première fois, gardé
 * chiffré par Windows (DPAPI, lié au compte de l'utilisateur), jamais écrit
 * en clair, jamais transmis. Un ancien secret en clair (version précédente)
 * est repris puis effacé.
 */
function secretDuPoste(dossierPoste, nom, octets) {
    if (!safeStorage.isEncryptionAvailable()) {
        throw new Error('La protection des secrets de Windows est indisponible sur cet ordinateur.');
    }
    const protege = path.join(dossierPoste, `${nom}.protege`);
    if (fs.existsSync(protege)) return safeStorage.decryptString(fs.readFileSync(protege));
    const ancien = path.join(dossierPoste, nom);
    const valeur = fs.existsSync(ancien)
        ? fs.readFileSync(ancien, 'utf8').trim()
        : crypto.randomBytes(octets).toString('hex');
    fs.writeFileSync(protege, safeStorage.encryptString(valeur));
    if (fs.existsSync(ancien)) fs.rmSync(ancien);
    return valeur;
}

/**
 * Le journal n'est fermé qu'une fois le service arrêté ET ses deux sorties
 * vidées (« close »). Avant, le premier tube terminé fermait le journal, et la
 * ligne « arrêté » écrite ensuite levait une exception dans le processus
 * principal : fenêtre « A JavaScript error occurred » à la fermeture de
 * l'application (constaté sur l'application installée). Un journal qui ne
 * s'écrit pas (disque plein) ne doit jamais arrêter l'application.
 */
function lancer(nom, commande, args, options, dossierJournaux) {
    const journal = fs.createWriteStream(path.join(dossierJournaux, `${nom}.log`), { flags: 'a' });
    journal.on('error', () => {});
    journal.write(`\n=== ${new Date().toISOString()} démarrage ${nom} ===\n`);
    const p = spawn(commande, args, { ...options, windowsHide: true });
    p.stdout.pipe(journal, { end: false });
    p.stderr.pipe(journal, { end: false });
    p.on('error', (erreur) => {
        if (!journal.writableEnded) journal.write(`=== ${nom} n'a pas pu démarrer : ${erreur.message} ===\n`);
    });
    p.on('close', (code) => journal.end(`=== ${nom} arrêté (code ${code}) ===\n`));
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
        JWT_SECRET_KEY: secretDuPoste(d.poste, 'cle-session', 48),
        // 256 bits : la base de l'école est chiffrée (SQLCipher), illisible sans elle.
        SMARTSCHOOL_CLE_BASE: secretDuPoste(d.poste, 'cle-base', 32),
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

/**
 * Mises à jour : vérifiées au démarrage puis toutes les 6 heures, quand
 * internet est là ; téléchargées en arrière-plan (seuls les blocs modifiés).
 * Une fois prêtes, on propose de redémarrer ; sinon, elles s'installent à la
 * prochaine fermeture. Sans internet, rien ne se passe : le poste fonctionne.
 *
 * Source : le dépôt GitHub public des installeurs (package.json, « publish »).
 * SMARTSCHOOL_MISES_A_JOUR_URL la remplace par un flux de test (fournisseur
 * « generic ») : on vérifie ainsi les mises à jour de bout en bout sans rien
 * publier. SMARTSCHOOL_MISE_A_JOUR_SANS_QUESTION installe sans demander (tests
 * automatisés : une fenêtre native ne se pilote pas).
 */
function surveillerLesMisesAJour(dossierJournaux) {
    if (!app.isPackaged) return;
    const { autoUpdater } = require('electron-updater');
    const journal = fs.createWriteStream(path.join(dossierJournaux, 'mises-a-jour.log'), { flags: 'a' });
    journal.on('error', () => {});
    const ecrire = (niveau) => (message) => journal.write(`${new Date().toISOString()} ${niveau} ${message}\n`);
    autoUpdater.logger = { info: ecrire('INFO'), warn: ecrire('ATTENTION'), error: ecrire('ERREUR'), debug: () => {} };
    if (process.env.SMARTSCHOOL_MISES_A_JOUR_URL) {
        autoUpdater.setFeedURL({ provider: 'generic', url: process.env.SMARTSCHOOL_MISES_A_JOUR_URL });
    }
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;

    autoUpdater.on('update-downloaded', async (info) => {
        if (process.env.SMARTSCHOOL_MISE_A_JOUR_SANS_QUESTION) {
            autoUpdater.quitAndInstall(true, true);
            return;
        }
        const { response } = await dialog.showMessageBox(fenetre ?? undefined, {
            type: 'info',
            title: 'Mise à jour de SmartSchool',
            message: `SmartSchool ${info.version} est prêt à être installé.`,
            detail: 'Le redémarrage ne prend que quelques secondes, et rien de ce qui est enregistré n’est perdu. '
                + 'Si vous choisissez « Plus tard », la mise à jour s’installera à la prochaine fermeture.',
            buttons: ['Redémarrer maintenant', 'Plus tard'],
            defaultId: 0,
            cancelId: 1,
        });
        if (response === 0) autoUpdater.quitAndInstall(true, true);
    });

    const verifier = () => autoUpdater.checkForUpdates().catch((erreur) => ecrire('INFO')(`pas de vérification : ${erreur.message}`));
    void verifier();
    setInterval(verifier, 6 * 3600 * 1000);
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
            console.log(`SmartSchool ${app.getVersion()} prêt — données : ${d.base}`);
            surveillerLesMisesAJour(d.journaux);
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
