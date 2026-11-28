/**
 * Compile l'interface SmartSchool pour l'application installée (version poste).
 *
 * Même code que la version web, compilé avec :
 *   - NEXT_PUBLIC_API_URL      → le moteur local de l'ordinateur ;
 *   - NEXT_PUBLIC_SMARTSCHOOL_POSTE=1 → écran d'installation, pas de Service Worker ;
 *   - NEXT_DIST_DIR=.next-poste → dossier à part, sans toucher au `.next` du
 *     serveur de développement ni à celui de la version web.
 *
 * Puis complète le serveur autonome (`standalone`) de Next avec les fichiers
 * statiques, comme le demande la documentation de Next.
 */
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ici = path.dirname(fileURLToPath(import.meta.url));
const frontend = path.resolve(ici, '..', '..', 'frontend');
const DIST = '.next-poste';
const PORT_MOTEUR = process.env.SMARTSCHOOL_PORT_MOTEUR || '47830';

const sortie = path.join(frontend, DIST);
if (existsSync(sortie)) rmSync(sortie, { recursive: true, force: true });

const env = {
    ...process.env,
    NEXT_PUBLIC_API_URL: `http://127.0.0.1:${PORT_MOTEUR}`,
    NEXT_PUBLIC_SMARTSCHOOL_POSTE: '1',
    NEXT_DIST_DIR: DIST,
    NEXT_TELEMETRY_DISABLED: '1',
};
const resultat = spawnSync('npx', ['next', 'build', '--webpack'], { cwd: frontend, env, stdio: 'inherit', shell: true });
if (resultat.status !== 0) process.exit(resultat.status ?? 1);

const autonome = path.join(sortie, 'standalone');
cpSync(path.join(sortie, 'static'), path.join(autonome, DIST, 'static'), { recursive: true });
// Sans les Service Workers laissés dans public/ par une compilation web : la
// version poste n'en enregistre aucun.
const estServiceWorker = (chemin) => /[\\/](sw\.js(\.map)?|swe-worker-[^\\/]*\.js)$/.test(chemin);
cpSync(path.join(frontend, 'public'), path.join(autonome, 'public'), {
    recursive: true,
    filter: (source) => !estServiceWorker(source),
});
console.log(`Interface poste prête : ${autonome}`);
