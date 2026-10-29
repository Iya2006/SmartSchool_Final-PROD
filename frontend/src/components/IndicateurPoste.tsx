'use client';

/**
 * État de la synchronisation d'un poste installé (application de bureau).
 *
 * Le moteur du poste se synchronise seul en arrière-plan avec le cloud
 * (backend app/sync/service.py). Cet indicateur dit, en un coup d'œil :
 * synchronisé (et quand), en cours, hors ligne depuis…, combien de
 * changements attendent, et s'il y a des choses à vérifier. Un clic lance
 * un échange immédiat.
 *
 * Au-delà de 7 jours sans synchronisation, il le signale : le cloud est la
 * sauvegarde du poste. Un ordinateur perdu ou en panne ne rend que ce qui a
 * été synchronisé.
 */
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CloudOff, RefreshCw, CheckCircle2, ShieldAlert } from 'lucide-react';
import api from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { canAccessPathForRole } from '@/lib/roleAccess';

interface EtatSynchro {
    statut: 'INACTIF' | 'EN_COURS' | 'SYNCHRONISE' | 'HORS_LIGNE' | 'REFUSE' | 'ERREUR';
    en_attente: number;
    // Refusé par le cloud ou impossible à appliquer sur ce poste.
    mis_de_cote: number;
    // Gardé de côté par le cloud pour la direction, toute l'école confondue.
    a_verifier: number;
    derniere_reussite: string | null;
    hors_ligne_depuis: string | null;
    erreur: string | null;
}

const SEPT_JOURS = 7 * 24 * 3600 * 1000;

function heure(iso: string): string {
    const d = new Date(iso);
    const aujourdHui = new Date().toDateString() === d.toDateString();
    return aujourdHui
        ? d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
        : d.toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export function decrireEtat(etat: EtatSynchro, maintenant: number = Date.now()) {
    const ancienne = etat.derniere_reussite
        ? maintenant - new Date(etat.derniere_reussite).getTime() > SEPT_JOURS
        : false;
    if (etat.statut === 'REFUSE') {
        return { ton: 'rouge' as const, Icone: ShieldAlert, texte: 'Poste retiré par la direction', detail: etat.erreur };
    }
    if (etat.statut === 'EN_COURS') {
        return { ton: 'orange' as const, Icone: RefreshCw, texte: 'Synchronisation…', detail: null };
    }
    if (etat.statut === 'HORS_LIGNE') {
        const depuis = etat.hors_ligne_depuis ? ` depuis ${heure(etat.hors_ligne_depuis)}` : '';
        const attente = etat.en_attente > 0 ? ` — ${etat.en_attente} changement(s) en attente` : '';
        return {
            ton: ancienne ? 'rouge' as const : 'gris' as const, Icone: CloudOff,
            texte: `Hors ligne${depuis}${attente}`,
            detail: ancienne
                ? 'Plus de 7 jours sans synchronisation : connectez ce poste à internet pour sauvegarder vos données.'
                : 'Vous pouvez continuer à travailler : tout sera envoyé dès le retour d’internet.',
        };
    }
    if (etat.statut === 'ERREUR') {
        return { ton: 'orange' as const, Icone: AlertTriangle, texte: 'Synchronisation à reprendre', detail: etat.erreur };
    }
    if (etat.en_attente > 0) {
        return { ton: 'orange' as const, Icone: RefreshCw, texte: `${etat.en_attente} changement(s) en attente`, detail: null };
    }
    return {
        ton: 'vert' as const, Icone: CheckCircle2,
        texte: etat.derniere_reussite ? `Synchronisé à ${heure(etat.derniere_reussite)}` : 'Synchronisation…',
        detail: null,
    };
}

const TONS = {
    vert: { fond: '#d1fae5', texte: '#047857' },
    orange: { fond: '#fef3c7', texte: '#b45309' },
    rouge: { fond: '#fee2e2', texte: '#b91c1c' },
    gris: { fond: '#f1f5f9', texte: '#475569' },
};

export default function IndicateurPoste() {
    const { user } = useAuth();
    const [etat, setEtat] = useState<EtatSynchro | null>(null);
    // Seule la direction tranche ; les autres voient le signal sans le lien.
    const peutTrancher = canAccessPathForRole(user?.role, '/synchronisation', user?.role_base);

    const lire = useCallback(async () => {
        try {
            setEtat((await api.get('/api/poste/synchronisation')).data);
        } catch {
            // Session expirée ou moteur en redémarrage : l'indicateur attend.
        }
    }, []);

    useEffect(() => {
        void lire();
        const minuteur = setInterval(() => void lire(), 15000);
        return () => clearInterval(minuteur);
    }, [lire]);

    if (!etat) return null;
    const { ton, Icone, texte, detail } = decrireEtat(etat);
    const couleurs = TONS[ton];
    const aVerifier = (etat.mis_de_cote || 0) + (etat.a_verifier || 0);

    const synchroniser = async () => {
        try {
            setEtat((await api.post('/api/poste/synchroniser')).data);
            setTimeout(() => void lire(), 2500);
        } catch { /* l'état suivant le dira */ }
    };

    return (
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <button
                onClick={() => void synchroniser()}
                title={`${detail ? `${detail}\n` : ''}Cliquer pour synchroniser maintenant.`}
                aria-label={`${texte}. Synchroniser maintenant.`}
                style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    padding: '5px 12px', borderRadius: 999, border: 'none', cursor: 'pointer',
                    background: couleurs.fond, color: couleurs.texte, fontSize: 12, fontWeight: 700,
                }}
            >
                <Icone size={13} className={etat.statut === 'EN_COURS' ? 'animate-spin' : undefined} />
                {texte}
            </button>
            {aVerifier > 0 && (() => {
                const style = {
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    padding: '5px 12px', borderRadius: 999, textDecoration: 'none',
                    background: TONS.rouge.fond, color: TONS.rouge.texte, fontSize: 12, fontWeight: 700,
                } as const;
                const contenu = <><AlertTriangle size={13} /> {aVerifier} à vérifier</>;
                const titre = 'Des changements n’ont pas pu être fusionnés automatiquement : la direction doit choisir.';
                return peutTrancher
                    ? <Link href="/synchronisation" title={titre} style={style}>{contenu}</Link>
                    : <span title={titre} style={style}>{contenu}</span>;
            })()}
        </div>
    );
}
