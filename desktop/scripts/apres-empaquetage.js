/**
 * Étape « afterPack » d'electron-builder : place le Python autonome, le moteur
 * et l'interface dans les ressources de l'application, TELS QUELS.
 *
 * Pourquoi pas `extraResources` : electron-builder y écarte en silence les
 * dossiers `node_modules` et ceux dont le nom commence par un point. Le serveur
 * de l'interface perdait ainsi Next.js (`node_modules/next`) et ses pages
 * compilées (`.next-poste`) : l'application installée ne s'ouvrait pas
 * (« Cannot find module 'next' »), alors que tout fonctionnait en développement.
 *
 * Exécutée après l'assemblage de l'application et avant la construction de
 * l'installeur : ce qui est copié ici part dans SmartSchool-Setup.exe.
 */
const fs = require('node:fs');
const path = require('node:path');

const ELEMENTS = ['python', 'moteur', 'interface'];

// Windows refuse les chemins de plus de 259 caractères, et l'installeur ne le
// signale pas : il saute le fichier, puis échoue à la mise à jour suivante
// (constaté avec un dossier d'installation de 132 caractères). L'application
// s'installe dans C:\Users\<nom>\AppData\Local\Programs\smartschool-poste\,
// soit une cinquantaine de caractères ; on en réserve cent pour un nom de
// profil long. Le chemin le plus long dans l'application ne doit pas dépasser
// le reste.
const RESERVE_DOSSIER_INSTALLATION = 100;
const LONGUEUR_MAX = 259 - RESERVE_DOSSIER_INSTALLATION;

function cheminLePlusLong(racine) {
    let plusLong = '';
    const parcourir = (dossier) => {
        for (const entree of fs.readdirSync(dossier, { withFileTypes: true })) {
            const chemin = path.join(dossier, entree.name);
            if (entree.isDirectory()) parcourir(chemin);
            else {
                const relatif = path.relative(racine, chemin);
                if (relatif.length > plusLong.length) plusLong = relatif;
            }
        }
    };
    parcourir(racine);
    return plusLong;
}

exports.default = async function apresEmpaquetage(contexte) {
    const source = path.join(contexte.packager.projectDir, 'empaquetage');
    const ressources = path.join(contexte.appOutDir, 'resources');
    for (const element of ELEMENTS) {
        const de = path.join(source, element);
        if (!fs.existsSync(de)) throw new Error(`Élément à empaqueter introuvable : ${de}`);
        const vers = path.join(ressources, element);
        fs.rmSync(vers, { recursive: true, force: true });
        fs.cpSync(de, vers, { recursive: true });
    }
    // Contrôle : ce sans quoi l'interface ne démarre pas.
    for (const indispensable of [
        path.join('interface', 'server.js'),
        path.join('interface', 'node_modules', 'next', 'package.json'),
        path.join('interface', '.next-poste', 'BUILD_ID'),
        path.join('python', 'python.exe'),
        path.join('moteur', 'main.pyc'),
    ]) {
        if (!fs.existsSync(path.join(ressources, indispensable))) {
            throw new Error(`Manquant dans l'application empaquetée : ${indispensable}`);
        }
    }
    const plusLong = cheminLePlusLong(contexte.appOutDir);
    if (plusLong.length > LONGUEUR_MAX) {
        throw new Error(`Chemin trop long pour Windows une fois installé (${plusLong.length} > ${LONGUEUR_MAX}) : ${plusLong}`);
    }
};
