'use client';

/*
 * ABSENCES DES ENSEIGNANTS — l'écran où la direction tranche.
 *
 * Constater et décider sont deux gestes différents. Le surveillant voit qu'un
 * professeur n'est pas venu ; c'est la direction qui décide si cela se retient
 * sur sa paie. Avant, la seule route qui enregistrait une absence
 * d'enseignant vivait dans le module financier : le comptable décidait qu'un
 * professeur était absent, alors qu'il n'était pas dans la cour à 8 h.
 *
 * Cet écran est le second temps : ce qui a été constaté, et ce qu'on en fait.
 * Tant qu'un signalement n'est pas validé, aucun franc ne bouge.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, Check, Loader2, RefreshCw, ShieldCheck, X } from 'lucide-react';
import api from '@/lib/api';

type Signalement = {
    absence_id: number;
    employe_id: number;
    employe: string;
    poste?: string | null;
    date_absence: string;
    motif?: string | null;
    est_justifie: boolean;
    statut: 'SIGNALE' | 'VALIDE' | 'ECARTE';
    signale_par?: string | null;
    valide_par?: string | null;
    retient_sur_la_paie: boolean;
};

const ONGLETS = [
    { id: 'SIGNALE', label: 'À trancher', couleur: '#b45309' },
    { id: 'VALIDE', label: 'Retenues confirmées', couleur: '#b91c1c' },
    { id: 'ECARTE', label: 'Écartées', couleur: '#475569' },
] as const;

export default function AbsencesEnseignantsPage() {
    const [onglet, setOnglet] = useState<'SIGNALE' | 'VALIDE' | 'ECARTE'>('SIGNALE');
    const [lignes, setLignes] = useState<Signalement[]>([]);
    const [chargement, setChargement] = useState(true);
    const [enCours, setEnCours] = useState<number | null>(null);
    const [message, setMessage] = useState<{ texte: string; type: 'ok' | 'ko' } | null>(null);

    const charger = useCallback(async () => {
        setChargement(true);
        try {
            const res = await api.get<{ items: Signalement[] }>(
                `/api/vie-scolaire/absences-enseignant?statut=${onglet}`);
            setLignes(res.data?.items || []);
        } catch (err: any) {
            setMessage({ texte: err?.response?.data?.detail || 'Chargement impossible.', type: 'ko' });
            setLignes([]);
        }
        setChargement(false);
    }, [onglet]);

    useEffect(() => { charger(); }, [charger]);

    const trancher = async (ligne: Signalement, statut: 'VALIDE' | 'ECARTE') => {
        setEnCours(ligne.absence_id);
        setMessage(null);
        try {
            const res = await api.put(`/api/vie-scolaire/absences-enseignant/${ligne.absence_id}`,
                { statut });
            setMessage({ texte: `${ligne.employe} — ${res.data?.message || 'Décision enregistrée.'}`, type: 'ok' });
            await charger();
        } catch (err: any) {
            setMessage({ texte: err?.response?.data?.detail || 'Décision impossible.', type: 'ko' });
        }
        setEnCours(null);
    };

    const aTrancher = useMemo(() => lignes.filter((l) => l.statut === 'SIGNALE').length, [lignes]);

    const carte: React.CSSProperties = {
        background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0',
        boxShadow: '0 1px 3px rgba(15,23,42,0.04)',
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18, padding: '24px', maxWidth: 1100, margin: '0 auto' }}>
            <div style={{ fontSize: 13, color: '#64748b' }}>
                <Link href="/dashboard" style={{ color: '#0f766e' }}>Tableau de bord</Link>
                <span> · Vie scolaire · Absences des enseignants</span>
            </div>

            <header>
                <h1 style={{ margin: 0, fontSize: 27, fontWeight: 800, color: '#0f172a' }}>
                    Absences des enseignants
                </h1>
                <p style={{ margin: '8px 0 0', fontSize: 14.5, color: '#475569', maxWidth: '72ch', lineHeight: 1.65 }}>
                    La surveillance constate qu&apos;un professeur n&apos;a pas assuré son cours.
                    C&apos;est ici que vous décidez si cela se retient sur sa paie.
                    <strong> Tant qu&apos;un signalement n&apos;est pas validé, aucun franc ne bouge.</strong>
                </p>
            </header>

            {message && (
                <div style={{
                    ...carte, padding: '13px 16px', fontSize: 14, fontWeight: 600,
                    borderLeft: `3px solid ${message.type === 'ok' ? '#059669' : '#dc2626'}`,
                    color: message.type === 'ok' ? '#065f46' : '#991b1b',
                    background: message.type === 'ok' ? '#ecfdf5' : '#fef2f2',
                }}>
                    {message.texte}
                </div>
            )}

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                {ONGLETS.map((o) => (
                    <button key={o.id} onClick={() => setOnglet(o.id)}
                        style={{
                            padding: '10px 18px', borderRadius: 10, cursor: 'pointer', fontSize: 13.5, fontWeight: 700,
                            border: onglet === o.id ? `1px solid ${o.couleur}` : '1px solid #e2e8f0',
                            background: onglet === o.id ? o.couleur : '#fff',
                            color: onglet === o.id ? '#fff' : '#475569',
                        }}>
                        {o.label}
                        {o.id === 'SIGNALE' && aTrancher > 0 && onglet === 'SIGNALE' ? ` (${aTrancher})` : ''}
                    </button>
                ))}
                <button onClick={charger} disabled={chargement}
                    style={{ marginLeft: 'auto', padding: '10px 16px', borderRadius: 10, border: '1px solid #e2e8f0', background: '#fff', color: '#475569', fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                    {chargement ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />} Rafraîchir
                </button>
            </div>

            <div style={{ ...carte, overflow: 'hidden' }}>
                {chargement ? (
                    <p style={{ textAlign: 'center', padding: 42, color: '#94a3b8', fontWeight: 600 }}>
                        <Loader2 size={19} className="animate-spin" style={{ verticalAlign: 'middle', marginRight: 8 }} />
                        Chargement…
                    </p>
                ) : lignes.length === 0 ? (
                    <p style={{ textAlign: 'center', padding: 42, color: '#94a3b8', fontWeight: 600 }}>
                        {onglet === 'SIGNALE' ? 'Aucun signalement en attente — rien à trancher.'
                            : onglet === 'VALIDE' ? 'Aucune retenue confirmée.'
                            : 'Aucun signalement écarté.'}
                    </p>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                        {lignes.map((l, i) => (
                            <div key={l.absence_id} style={{
                                display: 'flex', alignItems: 'center', gap: 16, padding: '15px 20px',
                                borderTop: i === 0 ? 'none' : '1px solid #f1f5f9', flexWrap: 'wrap',
                            }}>
                                <div style={{ minWidth: 210, flex: '1 1 240px' }}>
                                    <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#0f172a' }}>{l.employe}</p>
                                    <p style={{ margin: '3px 0 0', fontSize: 12.5, color: '#94a3b8' }}>
                                        {l.poste || 'Enseignant'} · absent le {l.date_absence}
                                    </p>
                                </div>

                                <div style={{ flex: '1 1 260px', minWidth: 200 }}>
                                    <p style={{ margin: 0, fontSize: 13.5, color: '#334155' }}>
                                        {l.motif || <span style={{ color: '#94a3b8', fontStyle: 'italic' }}>Aucun motif indiqué</span>}
                                    </p>
                                    <p style={{ margin: '3px 0 0', fontSize: 12, color: '#94a3b8' }}>
                                        {/* Une retenue se conteste : elle doit pouvoir dire d'où elle vient. */}
                                        Constaté par {l.signale_par || 'inconnu'}
                                        {l.valide_par ? ` · tranché par ${l.valide_par}` : ''}
                                    </p>
                                </div>

                                <div style={{ minWidth: 168 }}>
                                    {l.est_justifie ? (
                                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 999, background: '#eff6ff', color: '#1d4ed8', fontSize: 12.5, fontWeight: 700 }}>
                                            <ShieldCheck size={14} /> Justifiée
                                        </span>
                                    ) : l.retient_sur_la_paie ? (
                                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 999, background: '#fee2e2', color: '#991b1b', fontSize: 12.5, fontWeight: 700 }}>
                                            <AlertTriangle size={14} /> Retenue appliquée
                                        </span>
                                    ) : (
                                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 999, background: '#f8fafc', color: '#64748b', fontSize: 12.5, fontWeight: 700 }}>
                                            Sans effet sur la paie
                                        </span>
                                    )}
                                </div>

                                {l.statut === 'SIGNALE' && (
                                    <div style={{ display: 'flex', gap: 8, marginLeft: 'auto' }}>
                                        <button onClick={() => trancher(l, 'ECARTE')} disabled={enCours === l.absence_id}
                                            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 15px', borderRadius: 10, border: '1px solid #e2e8f0', background: '#fff', color: '#475569', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                                            <X size={15} /> Écarter
                                        </button>
                                        <button onClick={() => trancher(l, 'VALIDE')} disabled={enCours === l.absence_id}
                                            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 17px', borderRadius: 10, border: 'none', background: '#b91c1c', color: '#fff', fontSize: 13, fontWeight: 700, cursor: enCours === l.absence_id ? 'wait' : 'pointer' }}>
                                            {enCours === l.absence_id ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
                                            Confirmer la retenue
                                        </button>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <p style={{ fontSize: 12.5, color: '#94a3b8', maxWidth: '76ch', lineHeight: 1.6 }}>
                Une absence justifiée n&apos;entraîne aucune retenue, même confirmée.
                Pour un enseignant payé à l&apos;heure, la retenue porte sur les heures
                réellement prévues ce jour-là dans son emploi du temps — pas sur une
                journée forfaitaire.
            </p>

            <style>{`.animate-spin { animation: spin 1s linear infinite; }
                @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
        </div>
    );
}
