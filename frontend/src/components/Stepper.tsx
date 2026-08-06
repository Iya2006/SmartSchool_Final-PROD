'use client';

import { CheckCircle2 } from 'lucide-react';

export type StepStatus = 'a_faire' | 'en_cours' | 'fait' | 'attention';

export interface StepDef {
    id: string;
    numero: number;
    label: string;
    status: StepStatus;
    description?: string;
}

const STATUS_STYLE: Record<StepStatus, { bg: string; color: string; label: string }> = {
    a_faire: { bg: '#f1f5f9', color: '#64748b', label: 'À faire' },
    en_cours: { bg: '#dbeafe', color: '#1d4ed8', label: 'En cours' },
    fait: { bg: '#d1fae5', color: '#059669', label: 'Fait' },
    attention: { bg: '#fef3c7', color: '#b45309', label: 'Attention' },
};

interface StepperProps {
    steps: StepDef[];
    activeId: string;
    onSelect: (id: string) => void;
}

/**
 * Liste verticale d'étapes réutilisable — navigation libre (pas de
 * verrouillage séquentiel côté client, les vraies contraintes restent
 * imposées par le backend). Utilisé par l'assistant de clôture d'année
 * (classes/cloture-annee/page.tsx).
 */
export default function Stepper({ steps, activeId, onSelect }: StepperProps) {
    return (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
            {steps.map((step, i) => {
                const isActive = step.id === activeId;
                const style = STATUS_STYLE[step.status];
                const isLast = i === steps.length - 1;
                return (
                    <div key={step.id} style={{ display: 'flex', gap: 14 }}>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                            <button onClick={() => onSelect(step.id)} title={step.label}
                                style={{
                                    width: 32, height: 32, borderRadius: '50%', border: 'none', cursor: 'pointer',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                                    background: isActive ? '#1e293b' : (step.status === 'fait' ? '#d1fae5' : '#f1f5f9'),
                                    color: isActive ? '#fff' : (step.status === 'fait' ? '#059669' : '#64748b'),
                                    fontWeight: 800, fontSize: 13, transition: 'all 0.15s',
                                }}>
                                {step.status === 'fait' ? <CheckCircle2 size={16} /> : step.numero}
                            </button>
                            {!isLast && <div style={{ width: 2, flex: 1, minHeight: 20, background: '#e2e8f0', margin: '4px 0' }} />}
                        </div>
                        <button onClick={() => onSelect(step.id)}
                            style={{ textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', paddingBottom: 22, flex: 1 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                <span style={{ fontWeight: isActive ? 800 : 600, fontSize: 14, color: isActive ? '#0f172a' : '#334155' }}>{step.label}</span>
                                <span style={{ padding: '2px 8px', borderRadius: 999, fontSize: 10, fontWeight: 700, background: style.bg, color: style.color, whiteSpace: 'nowrap' }}>{style.label}</span>
                            </div>
                            {step.description && <p style={{ margin: '4px 0 0', fontSize: 12, color: '#94a3b8' }}>{step.description}</p>}
                        </button>
                    </div>
                );
            })}
        </div>
    );
}
