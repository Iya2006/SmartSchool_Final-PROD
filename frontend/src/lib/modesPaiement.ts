import api from '@/lib/api';

// Doit rester cohérent avec FINANCE_DEFAULTS["modes_paiement"] dans
// backend/app/api/finance.py — utilisé uniquement si aucune configuration
// n'existe encore côté Paramètres > Finance & Comptabilité.
export const DEFAULT_MODES_PAIEMENT = ['ESPECES', 'VIREMENT', 'ORANGE_MONEY', 'MTN_MONEY', 'CHEQUE'];

export const MODE_LABELS: Record<string, string> = {
    ESPECES: 'Espèces',
    VIREMENT: 'Virement bancaire',
    ORANGE_MONEY: 'Orange Money',
    MTN_MONEY: 'MTN Money',
    CHEQUE: 'Chèque',
    CARTE_BANCAIRE: 'Carte bancaire',
    MOBILE_MONEY: 'Mobile Money',
    AUTRE: 'Autre',
};

export function modePaiementLabel(value: string): string {
    return MODE_LABELS[value] || value.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

/**
 * Récupère la liste des modes de paiement configurés dans Paramètres >
 * Finance & Comptabilité — source unique de vérité. Avant l'introduction de
 * ce helper, chaque écran d'encaissement/décaissement gardait sa propre
 * liste codée en dur (et divergente d'un écran à l'autre), donc un mode
 * ajouté dans Paramètres n'apparaissait jamais dans les formulaires réels.
 */
export async function fetchModesPaiement(): Promise<string[]> {
    try {
        const res = await api.get('/api/parametrage/settings?etablissement_id=1&categorie=FINANCE');
        const row = (res.data || []).find((p: any) => p.cle === 'finance.modes_paiement');
        if (row?.valeur) {
            const parsed = JSON.parse(row.valeur);
            if (Array.isArray(parsed) && parsed.length > 0) return parsed;
        }
    } catch {
        // silencieux : on retombe sur la liste par défaut
    }
    return DEFAULT_MODES_PAIEMENT;
}
