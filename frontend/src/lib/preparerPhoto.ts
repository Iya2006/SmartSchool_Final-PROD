/**
 * Prépare une photo d'identité avant envoi au serveur.
 *
 * Une photo prise au téléphone pèse souvent 3 à 8 Mo (le serveur refuse
 * au-delà de 5 Mo). On la redessine donc en JPEG de 1000 px maximum :
 * largement assez pour une carte scolaire, et quelques centaines de Ko à
 * envoyer sur une connexion mobile. Un HEIC devient JPEG au passage, mais
 * seulement là où le navigateur sait le lire (Safari).
 *
 * Si le navigateur ne sait pas décoder l'image, on renvoie le fichier tel quel :
 * vérifier ensuite `formatPhotoAccepte` avant de l'envoyer.
 */
const COTE_MAX = 1000;

/** Formats acceptés par le serveur (voir `_valider_fichier_image`). */
const FORMATS_ACCEPTES = ['image/jpeg', 'image/png', 'image/webp'];

export const MESSAGE_FORMAT_REFUSE =
    "Ce format de photo n'est pas lisible ici (HEIC par exemple). Choisissez une photo JPG ou PNG, ou utilisez « Prendre une photo ».";

export function formatPhotoAccepte(fichier: File): boolean {
    return FORMATS_ACCEPTES.includes(fichier.type);
}

export async function preparerPhoto(fichier: File): Promise<File> {
    try {
        const url = URL.createObjectURL(fichier);
        try {
            const img = await new Promise<HTMLImageElement>((resolve, reject) => {
                const i = new Image();
                i.onload = () => resolve(i);
                i.onerror = reject;
                i.src = url;
            });
            const echelle = Math.min(1, COTE_MAX / Math.max(img.naturalWidth, img.naturalHeight));
            const largeur = Math.max(1, Math.round(img.naturalWidth * echelle));
            const hauteur = Math.max(1, Math.round(img.naturalHeight * echelle));
            const canvas = document.createElement('canvas');
            canvas.width = largeur;
            canvas.height = hauteur;
            const ctx = canvas.getContext('2d');
            if (!ctx) return fichier;
            // Fond blanc : un PNG transparent ne doit pas devenir noir en JPEG.
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, largeur, hauteur);
            ctx.drawImage(img, 0, 0, largeur, hauteur);
            const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.86));
            if (!blob) return fichier;
            const base = (fichier.name || 'photo').replace(/\.[^.]+$/, '') || 'photo';
            return new File([blob], `${base}.jpg`, { type: 'image/jpeg' });
        } finally {
            URL.revokeObjectURL(url);
        }
    } catch {
        return fichier;
    }
}
