'use client';

import { Calendar } from 'lucide-react';
import { useApp } from '@/context/AppContext';

interface AnneeScolaireOption {
    annee_id: number;
    libelle: string;
    est_courante?: string;
}

interface AnneeFilterProps {
    value: number;
    onChange: (anneeId: number) => void;
    style?: React.CSSProperties;
}

/**
 * Sélecteur d'année scolaire réutilisable pour les pages de comptabilité.
 * Se base sur la liste d'années chargée dans AppContext ; par défaut le
 * parent doit initialiser `value` avec `anneeId` (l'année courante).
 */
export default function AnneeFilter({ value, onChange, style }: AnneeFilterProps) {
    const { annees, anneeId } = useApp();
    const list: AnneeScolaireOption[] = annees && annees.length > 0
        ? annees
        : [{ annee_id: anneeId, libelle: '' }];

    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', ...style }}>
            <Calendar size={15} color="#64748b" />
            <select
                value={value}
                onChange={(e) => onChange(parseInt(e.target.value, 10))}
                style={{
                    padding: '8px 12px',
                    borderRadius: '10px',
                    border: '1px solid #cbd5e1',
                    background: 'white',
                    fontSize: '13px',
                    fontWeight: 700,
                    color: '#1e293b',
                    cursor: 'pointer',
                }}
            >
                {[...list]
                    .sort((a, b) => b.annee_id - a.annee_id)
                    .map((a) => (
                        <option key={a.annee_id} value={a.annee_id}>
                            {a.libelle}{a.annee_id === anneeId ? ' (en cours)' : ''}
                        </option>
                    ))}
            </select>
        </div>
    );
}
