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
import { Wifi, WifiOff, RefreshCw } from 'lucide-react';
import { subscribe, flushQueue, SyncState } from '@/lib/syncEngine';

const INITIAL_STATE: SyncState = {
    syncing: false,
    pendingCount: 0,
    lastSyncAt: null,
    lastConflicts: [],
    lastError: null,
};

export default function SyncStatusIndicator() {
    const [state, setState] = useState<SyncState>(INITIAL_STATE);
    const [online, setOnline] = useState(true);

    useEffect(() => {
        setOnline(typeof navigator !== 'undefined' ? navigator.onLine : true);
        const unsubscribe = subscribe(setState);

        const onOnline = () => setOnline(true);
        const onOffline = () => setOnline(false);
        window.addEventListener('online', onOnline);
        window.addEventListener('offline', onOffline);

        return () => {
            unsubscribe();
            window.removeEventListener('online', onOnline);
            window.removeEventListener('offline', onOffline);
        };
    }, []);

    let color: string;
    let bg: string;
    let label: string;
    let Icon = Wifi;

    if (!online) {
        color = '#b91c1c'; bg = '#fee2e2'; Icon = WifiOff;
        label = state.pendingCount > 0
            ? `Hors ligne — ${state.pendingCount} saisie(s) en attente`
            : 'Hors ligne';
    } else if (state.syncing || state.pendingCount > 0) {
        color = '#b45309'; bg = '#fef3c7'; Icon = RefreshCw;
        label = state.syncing ? 'Synchronisation en cours…' : `${state.pendingCount} en attente de synchronisation`;
    } else {
        color = '#059669'; bg = '#d1fae5'; Icon = Wifi;
        label = 'En ligne — à jour';
    }

    return (
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
    );
}
