// Genere les icones PWA/favicon a partir des SVG sources — script ponctuel,
// pas cable au build. Relancer manuellement (`node scripts/generate-icons.mjs`)
// si les SVG sources changent.
import sharp from 'sharp';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const sourceMark = path.join(root, 'public/icons/source-mark.svg');
const sourceMaskable = path.join(root, 'public/icons/source-mark-maskable.svg');

const targets = [
    { src: sourceMark, out: path.join(root, 'public/icons/icon-192.png'), size: 192 },
    { src: sourceMark, out: path.join(root, 'public/icons/icon-512.png'), size: 512 },
    { src: sourceMaskable, out: path.join(root, 'public/icons/icon-maskable-512.png'), size: 512 },
    { src: sourceMark, out: path.join(root, 'src/app/icon.png'), size: 512 },
    { src: sourceMark, out: path.join(root, 'src/app/apple-icon.png'), size: 180 },
];

for (const t of targets) {
    await sharp(t.src, { density: 384 }).resize(t.size, t.size).png().toFile(t.out);
    console.log(`- ${path.relative(root, t.out)} (${t.size}x${t.size})`);
}
