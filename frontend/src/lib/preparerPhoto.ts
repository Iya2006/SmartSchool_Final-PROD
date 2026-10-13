/**
 * Prépare une photo d'identité avant envoi au serveur.
 *
 * Une photo prise au téléphone pèse souvent 3 à 8 Mo (le serveur refuse
 * au-delà de 5 Mo) et peut arriver en HEIC, format qu'il n'accepte pas. On la
 * redessine donc en JPEG de 1000 px maximum : largement assez pour une carte
 * scolaire, et quelques centaines de Ko à envoyer sur une connexion mobile.
 *
 * Si le navigateur ne sait pas décoder l'image, on renvoie le fichier tel quel
 * et le serveur tranche (message d'erreur explicite).
 */
const COTE_MAX = 1000;

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
