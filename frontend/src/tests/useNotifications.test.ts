/**
 * Tests — Hook useNotifications
 * Vérifie le comptage des messages non lus et le polling.
 *
 * feat(test): ajouter tests unitaires hook useNotifications
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useNotifications } from '@/hooks/useNotifications';

// ─── Mocks ──────────────────────────────────────────────────────────────────

// Mock de l'API axios
vi.mock('@/lib/api', () => ({
    default: {
        get: vi.fn(),
        put: vi.fn(),
    },
}));

import api from '@/lib/api';
// Cast via unknown car AxiosInstance et le type Mock ne se chevauchent pas directement
const mockApi = api as unknown as { get: ReturnType<typeof vi.fn>; put: ReturnType<typeof vi.fn> };

const MESSAGES_MOCK = [
    {
        message_id: 1,
        sujet: 'Réunion parents',
        objet_type: 'REUNION',
        statut: 'ENVOYE',
        expediteur_type: 'PARENT',
        expediteur_nom: 'Camara Alpha',
        destinataire_type: 'ADMIN',
        date_envoi: new Date().toISOString(),
    },
    {
        message_id: 2,
        sujet: 'Note enfant',
        objet_type: 'GENERAL',
        statut: 'LU',
        expediteur_type: 'ADMIN',
        expediteur_nom: 'Administrateur',
        destinataire_type: 'PARENT',
        date_envoi: new Date().toISOString(),
    },
];

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('useNotifications', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // Simuler un token admin pour que le hook ne s'arrête pas tôt (vérification ligne 58 du hook)
        localStorage.setItem('smartschool_token', 'fake-admin-token-for-tests');
    });

    afterEach(() => {
        localStorage.clear();
    });

    it('retourne loading=true au démarrage', () => {
        mockApi.get.mockResolvedValue({ data: [] });
        const { result } = renderHook(() => useNotifications());
        expect(result.current.loading).toBe(true);
    });

    it('charge les messages depuis l\'API', async () => {
        mockApi.get.mockResolvedValue({ data: MESSAGES_MOCK });
        const { result } = renderHook(() => useNotifications());

        await waitFor(() => expect(result.current.loading).toBe(false));
        expect(result.current.messages).toHaveLength(2);
    });

    it('compte correctement les messages non lus', async () => {
        mockApi.get.mockResolvedValue({ data: MESSAGES_MOCK });
        const { result } = renderHook(() => useNotifications());

        await waitFor(() => expect(result.current.loading).toBe(false));
        // Seul le message_id=1 est non lu (ENVOYE + expediteur_type !== ADMIN)
        expect(result.current.unreadCount).toBe(1);
    });

    it('retourne 0 non lu si tous les messages sont lus', async () => {
        const allRead = MESSAGES_MOCK.map(m => ({ ...m, statut: 'LU' }));
        mockApi.get.mockResolvedValue({ data: allRead });
        const { result } = renderHook(() => useNotifications());

        await waitFor(() => expect(result.current.loading).toBe(false));
        expect(result.current.unreadCount).toBe(0);
    });

    it('markAllAsRead réinitialise le compteur à 0', async () => {
        mockApi.get.mockResolvedValue({ data: MESSAGES_MOCK });
        mockApi.put.mockResolvedValue({ data: { ok: true } });
        const { result } = renderHook(() => useNotifications());

        await waitFor(() => expect(result.current.unreadCount).toBe(1));
        await result.current.markAllAsRead();
        // setUnreadCount(0) est async → on attend le prochain cycle React
        await waitFor(() => expect(result.current.unreadCount).toBe(0));
        expect(mockApi.put).toHaveBeenCalledWith('/api/communication/messages/marquer-tous-lus');
    });

    it('gère les erreurs API silencieusement (loading=false, messages vides)', async () => {
        mockApi.get.mockRejectedValue(new Error('Network error'));
        const { result } = renderHook(() => useNotifications());

        await waitFor(() => expect(result.current.loading).toBe(false));
        expect(result.current.messages).toHaveLength(0);
        expect(result.current.unreadCount).toBe(0);
    });

    it('limite les messages affichés à 8 maximum', async () => {
        const manyMessages = Array.from({ length: 15 }, (_, i) => ({
            ...MESSAGES_MOCK[0],
            message_id: i + 1,
        }));
        mockApi.get.mockResolvedValue({ data: manyMessages });
        const { result } = renderHook(() => useNotifications());

        await waitFor(() => expect(result.current.loading).toBe(false));
        expect(result.current.messages.length).toBeLessThanOrEqual(8);
    });
});
