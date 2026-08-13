// Prepare le logo TrillionX (photo fournie par l'utilisateur, fond gris
// clair uniforme) pour servir de filigrane sur le hero sombre de /login :
// fond rendu transparent (chroma-key) + tons eclaircis (le mark d'origine
// est tres sombre, invisible tel quel sur un fond navy). Script ponctuel,
// pas cable au build — relancer manuellement si la source change.
import sharp from 'sharp';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const src = path.join(root, 'public/brand/trillionx-source.jpg');
const out = path.join(root, 'public/brand/trillionx-watermark.png');

const BORDER = 8; // fine bordure noire autour de la photo source
const BG = { r: 233, g: 233, b: 233 };
const KEY_IN = 16;   // distance au fond en-dessous de laquelle le pixel est totalement transparent
const KEY_OUT = 42;  // distance au-dessus de laquelle le pixel est totalement opaque (degrade entre les deux)

const meta = await sharp(src).metadata();
const { data, info } = await sharp(src)
    .extract({ left: BORDER, top: BORDER, width: meta.width - BORDER * 2, height: meta.height - BORDER * 2 })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

const { width, height, channels } = info;
const out_buf = Buffer.from(data);

for (let i = 0; i < width * height; i++) {
    const o = i * channels;
    const r = data[o], g = data[o + 1], b = data[o + 2];
    const dist = Math.sqrt((r - BG.r) ** 2 + (g - BG.g) ** 2 + (b - BG.b) ** 2);

    let alpha;
    if (dist <= KEY_IN) alpha = 0;
    else if (dist >= KEY_OUT) alpha = 255;
    else alpha = Math.round(((dist - KEY_IN) / (KEY_OUT - KEY_IN)) * 255);

    out_buf[o] = Math.min(255, Math.round(r * 1.8 + 50));
    out_buf[o + 1] = Math.min(255, Math.round(g * 1.8 + 50));
    out_buf[o + 2] = Math.min(255, Math.round(b * 1.8 + 50));
    out_buf[o + 3] = alpha;
}

await sharp(out_buf, { raw: { width, height, channels } })
    .png()
    .trim()
    .resize({ width: 900, withoutEnlargement: true })
    .toFile(out);

console.log(`- ${path.relative(root, out)}`);
