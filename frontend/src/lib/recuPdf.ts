/**
 * Ouvre / télécharge le reçu PDF généré par le serveur — le SEUL modèle de
 * reçu de l'application (backend/app/core/recu_paiement.py).
 *
 * Sur iPhone, Safari bloque `window.open` appelé APRÈS une attente réseau
 * (il n'y voit plus un geste de l'utilisateur). On ouvre donc l'onglet tout
 * de suite, au clic, puis on y charge le PDF quand il est prêt. Si le
 * navigateur refuse quand même l'onglet, on retombe sur un téléchargement.
 */
import api from '@/lib/api';

export async function ouvrirRecuPdf(endpoint: string, nomFichier: string): Promise<void> {
    const onglet = typeof window !== 'undefined' ? window.open('', '_blank') : null;
    if (onglet) {
        try {
            onglet.document.title = 'Reçu…';
            onglet.document.body.style.cssText = 'font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;color:#475569';
            onglet.document.body.textContent = 'Préparation du reçu…';
        } catch { /* onglet d'une autre origine : sans importance */ }
    }
    try {
        const res = await api.get(endpoint, { responseType: 'blob' });
        const url = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
        if (onglet && !onglet.closed) {
            onglet.location.href = url;
        } else {
            telecharger(url, nomFichier);
        }
        // Laisser le temps à l'onglet de charger le PDF avant de libérer l'URL.
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (e) {
        if (onglet && !onglet.closed) onglet.close();
        throw e;
    }
}

export async function telechargerRecuPdf(endpoint: string, nomFichier: string): Promise<void> {
    const res = await api.get(endpoint, { responseType: 'blob' });
    const url = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
    telecharger(url, nomFichier);
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

function telecharger(url: string, nomFichier: string) {
    const lien = document.createElement('a');
    lien.href = url;
    lien.download = nomFichier.endsWith('.pdf') ? nomFichier : `${nomFichier}.pdf`;
    document.body.appendChild(lien);
    lien.click();
    lien.remove();
}
