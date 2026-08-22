'use client';

/**
 * Bannière « lecture seule » — affichée dès qu'on consulte une année qui n'est
 * PAS l'année en cours (année passée / clôturée). Le serveur refuse déjà toute
 * écriture sur ces années ; cette bannière rend l'état visible et rappelle
 * comment revenir à l'année en cours.
 *
 * En pratique, seul un rôle admin peut être en consultation (lui seul dispose
 * du sélecteur d'année) — les autres comptes restent toujours sur l'année en
 * cours, donc ne voient jamais cette bannière.
 */
import { AlertTriangle, RotateCcw } from 'lucide-react';
import { useApp } from '@/context/AppContext';

export default function LectureSeuleBanner() {
    const { lectureSeule, annees, anneeId, anneeCouranteId, setAnneeId } = useApp();
    if (!lectureSeule) return null;

    const libelle = annees.find(a => a.annee_id === anneeId)?.libelle || 'une année passée';

    return (
        <div
            className="no-print"
            role="status"
            style={{
                display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap',
                padding: '10px 18px', margin: '0 0 18px',
                background: '#fef3c7', border: '1px solid #fcd34d', borderRadius: '12px',
                color: '#92400e', fontSize: '13.5px', fontWeight: 600,
            }}
        >
            <AlertTriangle size={17} style={{ flexShrink: 0 }} />
            <span style={{ flex: 1, minWidth: '200px' }}>
                Vous consultez <strong>{libelle}</strong> — <strong>lecture seule</strong>. Aucune modification n'est possible sur une année qui n'est plus en cours.
            </span>
            <button
                onClick={() => setAnneeId(anneeCouranteId)}
                style={{
                    display: 'flex', alignItems: 'center', gap: '6px',
                    padding: '7px 14px', borderRadius: '9px', cursor: 'pointer',
                    border: '1px solid #d97706', background: '#ffffff', color: '#92400e',
                    fontSize: '12.5px', fontWeight: 700, whiteSpace: 'nowrap',
                }}
            >
                <RotateCcw size={14} /> Revenir à l'année en cours
            </button>
        </div>
    );
}
