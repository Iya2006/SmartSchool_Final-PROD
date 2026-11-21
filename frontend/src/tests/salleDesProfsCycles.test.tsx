/**
 * Tests — Salle des Profs : aucune classe ne doit être invisible.
 *
 * L'écran ne parcourait qu'une liste de cycles figée dans le code,
 * ['MAT','PRM','CLG','LYC']. Toute classe dont le cycle portait un autre code
 * — ou aucun — était écartée de l'affichage alors que le serveur l'avait bien
 * renvoyée. Une école lisait donc « 0 classe » avec ses douze classes en base,
 * sans aucune explication, et même avec le filtre « Tous ».
 *
 * Les codes de cycle sont créés par chaque école : rien ne garantit qu'elle
 * emploie les quatre codes habituels. Ces tests fixent la règle — ce qui
 * revient du serveur s'affiche.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import SalleDesProfsPage from '@/app/salle-des-profs/page';

vi.mock('@/lib/api', () => ({
    default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
}));

vi.mock('@/context/AppContext', () => ({
    useApp: () => ({ etablissementId: 7, anneeId: 3 }),
}));

import api from '@/lib/api';
const mockApi = api as unknown as { get: ReturnType<typeof vi.fn> };

const STATS = { total_classes: 0, total_matieres: 0, total_affectations: 0, taux_couverture: 0 };

function classe(id: number, libelle: string, cycleCode: string, cycle: string) {
    return {
        classe_id: id,
        code: `C${id}`,
        libelle,
        cycle,
        cycle_code: cycleCode,
        niveau: libelle,
        evaluation_simple: false,
        professeur_principal: null,
        nb_matieres: 0,
        nb_affectes: 0,
        matieres: [],
    };
}

function repondreAvec(classes: unknown[]) {
    mockApi.get.mockImplementation((url: string) => {
        if (url.includes('salle-des-profs/stats')) return Promise.resolve({ data: STATS });
        if (url.includes('classes-matieres')) return Promise.resolve({ data: classes });
        return Promise.resolve({ data: [] });   // enseignants
    });
}

describe('Salle des Profs — affichage des cycles', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("affiche une classe dont le cycle a un code inattendu", async () => {
        // Le cas réel : une école dont les cycles ne portent pas les codes
        // habituels. Avant correction, cet écran affichait « 0 classe ».
        repondreAvec([classe(1, '1 ANNEE', 'CYCLE1', 'Cycle élémentaire')]);
        render(<SalleDesProfsPage />);
        expect(await screen.findByText('1 ANNEE')).toBeTruthy();
    });

    it("affiche une classe dont le cycle est absent", async () => {
        repondreAvec([classe(2, 'Petite Section', '—', '—')]);
        render(<SalleDesProfsPage />);
        expect(await screen.findByText('Petite Section')).toBeTruthy();
    });

    it("affiche ensemble les cycles connus et les autres", async () => {
        repondreAvec([
            classe(1, 'Terminale', 'LYC', 'Lycée'),
            classe(2, 'Atelier', 'PRO', 'Professionnel'),
            classe(3, 'Petite Section', 'MAT', 'Maternelle'),
        ]);
        render(<SalleDesProfsPage />);
        await waitFor(() => {
            expect(screen.getByText('Terminale')).toBeTruthy();
            expect(screen.getByText('Atelier')).toBeTruthy();
            expect(screen.getByText('Petite Section')).toBeTruthy();
        });
    });

    it("propose un bouton de filtre pour le cycle propre à l'école", async () => {
        // La barre de filtres était figée sur les quatre mêmes libellés : un
        // cycle maison n'était ni affiché ni filtrable.
        repondreAvec([classe(1, 'Atelier', 'PRO', 'Professionnel')]);
        render(<SalleDesProfsPage />);
        expect(await screen.findByRole('button', { name: 'Professionnel' })).toBeTruthy();
    });

    it("ne propose pas de filtre pour un cycle que l'école n'a pas", async () => {
        repondreAvec([classe(1, 'Petite Section', 'MAT', 'Maternelle')]);
        render(<SalleDesProfsPage />);
        await screen.findByText('Petite Section');
        expect(screen.queryByRole('button', { name: 'Lycée' })).toBeNull();
    });
});
