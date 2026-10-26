'use client';

/**
 * Indicateur de statut de synchronisation — module Offline-First Phase 1.
 *
 * 🟢 En ligne — rien en attente / synchronisation en temps réel.
 * 🟡 Connexion instable ou synchronisation en cours — des éléments restent
 *    en file, ils seront rejoués automatiquement.
 * 🔴 Hors ligne — les saisies sont enregistrées localement, en attente de
 *    connexion.
 *
 * Périmètre Phase 1 : placé dans le portail enseignant uniquement (seul
 * module où la saisie hors-ligne est activée pour l'instant — voir le plan
 * approuvé). `syncEngine.subscribe` notifie ce composant à chaque changement
 * (nouvel élément mis en file, synchronisation démarrée/terminée).
 */
import { useEffect, useState } from 'react';
import { Wifi, WifiOff, RefreshCw, AlertTriangle, ShieldAlert, HardDriveDownload } from 'lucide-react';
import { subscribe, flushQueue, retryAllBlocked, SyncState } from '@/lib/syncEngine';
import { isTokenLikelyExpired } from '@/lib/sessionExpiry';
import {
    lireEtatPreparation,
    preparerPoste,
    suivrePreparation,
    type EtatPreparation,
    type Progression,
} from '@/lib/preparationHorsLigne';

function dateCourte(iso: string): string {
    return new Date(iso).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

const INITIAL_STATE: SyncState = {
    syncing: false,
    pendingCount: 0,
    blockedCount: 0,
    lastSyncAt: null,
    lastConflicts: [],
    lastError: null,
};

export default function SyncStatusIndicator() {
    const [state, setState] = useState<SyncState>(INITIAL_STATE);
    const [online, setOnline] = useState(true);
    const [sessionLikelyExpired, setSessionLikelyExpired] = useState(false);
    const [preparation, setPreparation] = useState<Progression | null>(null);
    const [etatPreparation, setEtatPreparation] = useState<EtatPreparation | null>(null);

    useEffect(() => {
        setOnline(typeof navigator !== 'undefined' ? navigator.onLine : true);
        const unsubscribe = subscribe(setState);
        setEtatPreparation(lireEtatPreparation());
        const arreterSuivi = suivrePreparation((p) => {
            setPreparation(p);
            // Fin de préparation : la date des données hors-ligne a changé.
            if (p === null) setEtatPreparation(lireEtatPreparation());
        });

        const onOnline = () => setOnline(true);
        const onOffline = () => setOnline(false);
        window.addEventListener('online', onOnline);
        window.addEventListener('offline', onOffline);

        // Étape D (§6/§7) : signal côté client uniquement, pas une
        // vérification — voir lib/sessionExpiry.ts. Vérifié périodiquement
        // (pas juste au montage) car un enseignant peut rester hors-ligne
        // longtemps sans recharger la page.
        const checkExpiry = () => {
            const token = typeof window !== 'undefined' ? localStorage.getItem('smartschool_token') : null;
            setSessionLikelyExpired(isTokenLikelyExpired(token));
        };
        checkExpiry();
        const expiryInterval = setInterval(checkExpiry, 60_000);

        return () => {
            unsubscribe();
            arreterSuivi();
            window.removeEventListener('online', onOnline);
            window.removeEventListener('offline', onOffline);
            clearInterval(expiryInterval);
        };
    }, []);

    let color: string;
    let bg: string;
    let label: string;
    let Icon = Wifi;

    if (!online) {
        color = '#b91c1c'; bg = '#fee2e2'; Icon = WifiOff;
        // L'âge des données affichées compte autant que le fait d'être hors-ligne.
        const age = etatPreparation ? ` — données du ${dateCourte(etatPreparation.date)}` : '';
        label = state.pendingCount > 0
            ? `Hors ligne — ${state.pendingCount} saisie(s) en attente${age}`
            : `Hors ligne${age}`;
    } else if (state.syncing || state.pendingCount > 0) {
        color = '#b45309'; bg = '#fef3c7'; Icon = RefreshCw;
        label = state.syncing ? 'Synchronisation en cours…' : `${state.pendingCount} en attente de synchronisation`;
    } else {
        color = '#059669'; bg = '#d1fae5'; Icon = Wifi;
        label = 'En ligne — à jour';
    }

    // Quand TOUT va bien (en ligne, rien en attente), on n'affiche RIEN ici :
    // le badge « En ligne — à jour » encombrait le header et masquait l'année
    // en cours. Le statut « en ligne » est désormais porté par la pastille verte
    // de l'avatar (Topbar). L'indicateur ne réapparaît que s'il y a un vrai
    // signal (hors-ligne, synchro en attente, action requise, session à renouveler).
    const toutVaBien = online && !state.syncing && state.pendingCount === 0
        && state.blockedCount === 0 && !sessionLikelyExpired;

    if (online && preparation) {
        return (
            <span
                title="Copie des écrans et des données sur ce poste, pour pouvoir travailler sans connexion."
                style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    padding: '5px 12px', borderRadius: 999,
                    background: '#e0e7ff', color: '#3730a3', fontSize: 12, fontWeight: 700,
                }}
            >
                <HardDriveDownload size={13} />
                Préparation hors-ligne… {preparation.fait}/{preparation.total}
            </span>
        );
    }

    // Tout va bien : un simple bouton-icône, discret, qui dit si le poste est
    // prêt pour le hors-ligne et permet de mettre ses données à jour.
    if (toutVaBien) {
        return (
            <button
                onClick={() => void preparerPoste()}
                aria-label="Préparer ce poste pour le hors-ligne"
                title={etatPreparation
                    ? `Poste prêt pour le hors-ligne — données du ${dateCourte(etatPreparation.date)}. Cliquer pour les mettre à jour.`
                    : 'Ce poste n’est pas encore prêt pour le hors-ligne. Cliquer pour le préparer.'}
                style={{
                    display: 'inline-grid', placeItems: 'center', width: 30, height: 30,
                    borderRadius: 999, border: 'none', cursor: 'pointer',
                    background: etatPreparation ? '#d1fae5' : '#f1f5f9',
                    color: etatPreparation ? '#059669' : '#64748b',
                }}
            >
                <HardDriveDownload size={15} />
            </button>
        );
    }

    return (
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <button
                onClick={() => void flushQueue()}
                title={state.lastConflicts.length > 0
                    ? `${state.lastConflicts.length} conflit(s) résolu(s) automatiquement lors de la dernière synchronisation`
                    : label}
                style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    padding: '5px 12px', borderRadius: 999, border: 'none',
                    background: bg, color, fontSize: 12, fontWeight: 700,
                    cursor: 'pointer',
                }}
            >
                <Icon size={13} className={state.syncing ? 'animate-spin' : undefined} />
                {label}
            </button>
            {state.blockedCount > 0 && (
                <button
                    onClick={() => void retryAllBlocked()}
                    title={`${state.blockedCount} saisie(s) refusée(s) par le serveur — n'ont pas pu être synchronisées (raison affichée au survol de chaque saisie). Cliquer pour réessayer.`}
                    style={{
                        display: 'inline-flex', alignItems: 'center', gap: 6,
                        padding: '5px 12px', borderRadius: 999, border: 'none',
                        background: '#fee2e2', color: '#b91c1c', fontSize: 12, fontWeight: 700,
                        cursor: 'pointer',
                    }}
                >
                    <AlertTriangle size={13} />
                    {state.blockedCount} action(s) requise(s)
                </button>
            )}
            {sessionLikelyExpired && (!online || state.pendingCount > 0 || state.blockedCount > 0) && (
                <span
                    title="Ta session semble expirée. Le travail hors-ligne est conservé et sera soumis à la reconnexion, mais le serveur pourrait le refuser si la session ne redevient pas valide — reconnecte-toi dès que possible."
                    style={{
                        display: 'inline-flex', alignItems: 'center', gap: 6,
                        padding: '5px 12px', borderRadius: 999,
                        background: '#fef3c7', color: '#92400e', fontSize: 12, fontWeight: 700,
                    }}
                >
                    <ShieldAlert size={13} />
                    Session à renouveler
                </span>
            )}
        </div>
    );
}
