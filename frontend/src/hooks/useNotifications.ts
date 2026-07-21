/**
 * useNotifications — Hook custom pour la gestion des notifications/messages.
 *
 * Centralise les appels API liés aux messages de communication.
 * Utilisé par TopbarNotifications et potentiellement la page /communication.
 *
 * refactor(topbar): extraire la logique de notifications dans un hook custom
 */

import { useState, useEffect, useCallback } from 'react';
import api from '@/lib/api';

// ─── Types ────────────────────────────────────────────────────────────────────
export interface Message {
    message_id: number;
    sujet: string;
    objet_type: string;
    statut: string;
    expediteur_type: string;
    expediteur_nom?: string;
    destinataire_type: string;
    destinataire_nom?: string;
    date_envoi: string;
}

interface UseNotificationsReturn {
    messages: Message[];
    unreadCount: number;
    loading: boolean;
    markAllAsRead: () => Promise<void>;
    refresh: () => Promise<void>;
}

// ─── Hook ────────────────────────────────────────────────────────────────────
export function useNotifications(pollIntervalMs = 30000): UseNotificationsReturn {
    const [messages, setMessages]         = useState<Message[]>([]);
    const [unreadCount, setUnreadCount]   = useState(0);
    const [loading, setLoading]           = useState(true);

    const fetchMessages = useCallback(async () => {
        try {
            const res = await api.get('/api/communication/messages?role=ADMIN');
            const data: Message[] = res.data || [];
            setMessages(data.slice(0, 8));
            setUnreadCount(
                data.filter(m => m.statut === 'ENVOYE' && m.expediteur_type !== 'ADMIN').length
            );
        } catch {
            // Silencieux — ne pas afficher d'erreur pour les notifications
        } finally {
            setLoading(false);
        }
    }, []);

    // Chargement initial + polling (seulement si authentifié)
    useEffect(() => {
        const token = typeof window !== 'undefined'
            ? localStorage.getItem('smartschool_token')
            : null;
        // Ne pas démarrer le polling si pas de token
        if (!token) {
            setLoading(false);
            return;
        }

        fetchMessages();
        const handleVisibility = () => {
            if (!document.hidden) fetchMessages();
        };
        document.addEventListener('visibilitychange', handleVisibility);
        return () => document.removeEventListener('visibilitychange', handleVisibility);
    }, [fetchMessages]);

    // Marquer tous comme lus
    const markAllAsRead = useCallback(async () => {
        try {
            await api.put('/api/communication/messages/marquer-tous-lus');
            setUnreadCount(0);
        } catch {
            // Silencieux
        }
    }, []);

    return {
        messages,
        unreadCount,
        loading,
        markAllAsRead,
        refresh: fetchMessages,
    };
}
