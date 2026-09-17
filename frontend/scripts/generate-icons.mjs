// Genere les icones PWA/favicon a partir d'une source — script ponctuel,
// pas cable au build. Relancer manuellement (`node scripts/generate-icons.mjs`)
// si la source change.
//
// Source raster (public/brand/logo-mark.png) plutot que SVG : le logo
// fourni (blason degrade, style illustratif) ne se vectorise pas
// proprement sans perte — contrairement a l'ancien symbole (3 barres,
// symbol-source*.svg, conserve sur disque mais plus utilise ici). Deja
// recadre + place sur un canevas carre blanc avec marge de securite
// (~16%) pour la variante maskable.
import sharp from 'sharp';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const sourceMark = path.join(root, 'public/brand/logo-mark.png');

const targets = [
    { src: sourceMark, out: path.join(root, 'public/icons/icon-192.png'), size: 192 },
    { src: sourceMark, out: path.join(root, 'public/icons/icon-512.png'), size: 512 },
    { src: sourceMark, out: path.join(root, 'public/icons/icon-maskable-512.png'), size: 512 },
    { src: sourceMark, out: path.join(root, 'src/app/icon.png'), size: 512 },
    { src: sourceMark, out: path.join(root, 'src/app/apple-icon.png'), size: 180 },
];

for (const t of targets) {
    await sharp(t.src).resize(t.size, t.size).png().toFile(t.out);
    console.log(`- ${path.relative(root, t.out)} (${t.size}x${t.size})`);
}
