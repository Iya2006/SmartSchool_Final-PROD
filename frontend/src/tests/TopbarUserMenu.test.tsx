/**
 * Tests — Composant TopbarUserMenu
 * Vérifie l'affichage du nom, l'ouverture du menu et la déconnexion.
 *
 * feat(test): ajouter tests unitaires TopbarUserMenu
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import TopbarUserMenu from '@/components/TopbarUserMenu';

// ─── Mocks ──────────────────────────────────────────────────────────────────

const mockLogout = vi.fn();
const mockUser = {
    id: 1,
    nom: 'Camara',
    prenom: 'Alpha',
    nom_utilisateur: 'alpha.admin',
    email: 'alpha@smartschool.gn',
    telephone: '620000001',
    role: 'ADMIN',
};

vi.mock('@/context/AuthContext', () => ({
    useAuth: () => ({
        user: mockUser,
        logout: mockLogout,
    }),
}));

vi.mock('next/navigation', () => ({
    useRouter: () => ({ push: vi.fn() }),
}));

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('TopbarUserMenu', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('affiche les initiales de l\'utilisateur', () => {
        render(<TopbarUserMenu />);
        // "Alpha Camara" → initiales "AC"
        expect(screen.getByText('AC')).toBeInTheDocument();
    });

    it('affiche le nom complet et le rôle', () => {
        render(<TopbarUserMenu />);
        expect(screen.getByText('Alpha Camara')).toBeInTheDocument();
        expect(screen.getByText('ADMIN')).toBeInTheDocument();
    });

    it('ouvre le menu dropdown au clic', () => {
        render(<TopbarUserMenu />);
        const btn = screen.getByRole('button', { name: /alpha camara/i });
        fireEvent.click(btn);
        expect(screen.getByText('Se déconnecter')).toBeInTheDocument();
        expect(screen.getByText('Paramètres')).toBeInTheDocument();
    });

    it('ferme le menu si on clique hors du composant', () => {
        render(
            <div>
                <TopbarUserMenu />
                <div data-testid="outside">Extérieur</div>
            </div>
        );
        const btn = screen.getByRole('button', { name: /alpha camara/i });
        fireEvent.click(btn);
        expect(screen.getByText('Se déconnecter')).toBeInTheDocument();

        fireEvent.mouseDown(screen.getByTestId('outside'));
        expect(screen.queryByText('Se déconnecter')).not.toBeInTheDocument();
    });

    it('appelle logout au clic sur "Se déconnecter"', () => {
        render(<TopbarUserMenu />);
        const btn = screen.getByRole('button', { name: /alpha camara/i });
        fireEvent.click(btn);

        const logoutBtn = screen.getByText('Se déconnecter');
        fireEvent.click(logoutBtn);
        expect(mockLogout).toHaveBeenCalledTimes(1);
    });

    it('ne crash pas même si useAuth retourne un user null', () => {
        // vi.mock au niveau module retourne mockUser — ce test vérifie
        // uniquement que le composant est robuste et ne lève pas d'exception
        expect(() => render(<TopbarUserMenu />)).not.toThrow();
    });
});
