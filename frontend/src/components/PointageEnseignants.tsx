'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { ArrowLeft, QrCode, PencilLine, History, Trash2, Save, Loader2, Search } from 'lucide-react';
import api from '@/lib/api';
import { useIsMobile } from '@/hooks/useIsMobile';
import PointagePersonnelScanner from '@/components/PointagePersonnelScanner';

interface Enseignant { enseignant_id: number; nom: string; prenom: string; matricule?: string; }
interface HistoLigne {
    presence_id: number;
    date: string;
    heure_arrivee: string | null;
    heure_depart: string | null;
    statut: string;
    agent: { nom: string; matricule: string; role: string; photo: string; type: string };
}

type Onglet = 'scanner' | 'manuel' | 'historique';

const aujourdHui = () => new Date().toISOString().split('T')[0];

/**
 * Pointage des enseignants : scanner le badge, OU le saisir à la main (pas de
 * courant/caméra), OU consulter et nettoyer l'historique. Écran unique partagé
 * par l'admin (dans le back-office) et le surveillant (dans son portail, avec
 * `onRetour` pour revenir à son poste).
 */
export default function PointageEnseignants({ onRetour }: { onRetour?: () => void }) {
    const isMobile = useIsMobile(900);
    const [onglet, setOnglet] = useState<Onglet>('scanner');
    const [enseignants, setEnseignants] = useState<Enseignant[]>([]);

    // Saisie manuelle
    const [mEnsId, setMEnsId] = useState('');
    const [mDate, setMDate] = useState(aujourdHui());
    const [mArrivee, setMArrivee] = useState('');
    const [mDepart, setMDepart] = useState('');
    const [mSaving, setMSaving] = useState(false);
    const [mMsg, setMMsg] = useState<{ ok: boolean; texte: string } | null>(null);

    // Historique
    const [histo, setHisto] = useState<HistoLigne[]>([]);
    const [histoLoading, setHistoLoading] = useState(false);
    const [recherche, setRecherche] = useState('');
    const [hDebut, setHDebut] = useState('');
    const [hFin, setHFin] = useState('');

    useEffect(() => {
        api.get('/api/enseignants').then(r => setEnseignants(r.data || [])).catch(() => setEnseignants([]));
    }, []);

    const chargerHistorique = useCallback(async () => {
        setHistoLoading(true);
        try {
            const params = new URLSearchParams();
            if (recherche.trim()) params.set('recherche', recherche.trim());
            if (hDebut) params.set('date_debut', hDebut);
            if (hFin) params.set('date_fin', hFin);
            const r = await api.get(`/api/presences-agents/historique?${params.toString()}`);
            setHisto(r.data || []);
        } catch { setHisto([]); }
        setHistoLoading(false);
    }, [recherche, hDebut, hFin]);

    useEffect(() => { if (onglet === 'historique') chargerHistorique(); }, [onglet, chargerHistorique]);

    const enregistrerManuel = async () => {
        if (!mEnsId) { setMMsg({ ok: false, texte: "Choisissez un enseignant." }); return; }
        if (!mArrivee && !mDepart) { setMMsg({ ok: false, texte: "Renseignez au moins l'heure d'arrivée." }); return; }
        setMSaving(true); setMMsg(null);
        try {
            await api.post('/api/presences-agents/manuel', {
                type_agent: 'ENSEIGNANT',
                agent_id: Number(mEnsId),
                date_presence: mDate,
                heure_arrivee: mArrivee || null,
                heure_depart: mDepart || null,
            });
            setMMsg({ ok: true, texte: 'Pointage manuel enregistré. Tout le monde le voit désormais.' });
            setMArrivee(''); setMDepart('');
        } catch (e: any) {
            setMMsg({ ok: false, texte: e?.response?.data?.detail || 'Enregistrement impossible.' });
        }
        setMSaving(false);
    };

    const supprimer = async (l: HistoLigne) => {
        if (!confirm(`Supprimer le pointage de ${l.agent.nom} du ${l.date} ?\n\nCette action est irréversible.`)) return;
        try {
            await api.delete(`/api/presences-agents/${l.presence_id}`);
            chargerHistorique();
        } catch (e: any) {
            alert(e?.response?.data?.detail || 'Suppression impossible');
        }
    };

    const ongletBtn = (cle: Onglet, libelle: string, Icone: React.ComponentType<{ size?: number }>) => (
        <button type="button" onClick={() => setOnglet(cle)} style={{
            flex: isMobile ? '1 1 0' : undefined,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: isMobile ? '6px' : '8px',
            padding: isMobile ? '10px 8px' : '10px 16px', borderRadius: '12px',
            fontSize: isMobile ? '13px' : '14px', whiteSpace: 'nowrap',
            border: onglet === cle ? '1px solid transparent' : '1px solid #cbd5e1',
            background: onglet === cle ? '#2563eb' : 'white', color: onglet === cle ? 'white' : '#0f172a',
            fontWeight: 800, cursor: 'pointer',
        }}>
            <Icone size={16} /> {libelle}
        </button>
    );

    return (
        <div style={{ minHeight: '100vh', background: 'linear-gradient(180deg, #f0fdf4 0%, #eff6ff 48%, #ffffff 100%)', padding: isMobile ? '12px' : '24px' }}>
            <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
                {onRetour && (
                    <button onClick={onRetour} style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '10px 16px', borderRadius: '12px', border: '1px solid #cbd5e1', background: 'white', color: '#0f172a', fontWeight: 800, cursor: 'pointer', marginBottom: '14px' }}>
                        <ArrowLeft size={16} /> Retour au poste surveillance
                    </button>
                )}

                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: isMobile ? '14px' : '18px' }}>
                    {ongletBtn('scanner', isMobile ? 'Scanner' : 'Scanner un badge', QrCode)}
                    {ongletBtn('manuel', isMobile ? 'Manuel' : 'Saisie manuelle', PencilLine)}
                    {ongletBtn('historique', 'Historique', History)}
                </div>

                {onglet === 'scanner' && (
                    <PointagePersonnelScanner titre="Pointage des enseignants" />
                )}

                {onglet === 'manuel' && (
                    <div style={{ background: 'white', borderRadius: '20px', border: '1px solid #e2e8f0', padding: isMobile ? '16px' : '24px', maxWidth: '620px' }}>
                        <h2 style={{ margin: '0 0 6px', fontSize: '18px', fontWeight: 800, color: '#0f172a' }}>Saisie manuelle du pointage</h2>
                        <p style={{ margin: '0 0 18px', fontSize: '13px', color: '#64748b', lineHeight: 1.6 }}>
                            À utiliser sans courant, sans caméra, ou pour corriger plus tard. Ré-enregistrer le même enseignant à la même date met à jour son pointage.
                        </p>
                        <div style={{ display: 'grid', gap: '14px' }}>
                            <label style={{ display: 'block' }}>
                                <span style={{ fontSize: '12px', fontWeight: 700, color: '#475569' }}>Enseignant</span>
                                <select value={mEnsId} onChange={e => setMEnsId(e.target.value)} style={{ width: '100%', marginTop: '5px', padding: '10px', borderRadius: '10px', border: '1px solid #cbd5e1', fontSize: '14px' }}>
                                    <option value="">— choisir —</option>
                                    {enseignants.map(e => (
                                        <option key={e.enseignant_id} value={e.enseignant_id}>{e.prenom} {e.nom}{e.matricule ? ` (${e.matricule})` : ''}</option>
                                    ))}
                                </select>
                            </label>
                            <label style={{ display: 'block' }}>
                                <span style={{ fontSize: '12px', fontWeight: 700, color: '#475569' }}>Date</span>
                                <input type="date" value={mDate} onChange={e => setMDate(e.target.value)} style={{ width: '100%', marginTop: '5px', padding: '10px', borderRadius: '10px', border: '1px solid #cbd5e1', fontSize: '14px' }} />
                            </label>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                                <label style={{ display: 'block' }}>
                                    <span style={{ fontSize: '12px', fontWeight: 700, color: '#475569' }}>Heure d&apos;arrivée</span>
                                    <input type="time" value={mArrivee} onChange={e => setMArrivee(e.target.value)} style={{ width: '100%', marginTop: '5px', padding: '10px', borderRadius: '10px', border: '1px solid #cbd5e1', fontSize: '14px' }} />
                                </label>
                                <label style={{ display: 'block' }}>
                                    <span style={{ fontSize: '12px', fontWeight: 700, color: '#475569' }}>Heure de départ (option.)</span>
                                    <input type="time" value={mDepart} onChange={e => setMDepart(e.target.value)} style={{ width: '100%', marginTop: '5px', padding: '10px', borderRadius: '10px', border: '1px solid #cbd5e1', fontSize: '14px' }} />
                                </label>
                            </div>
                            {mMsg && (
                                <div style={{ fontSize: '13px', fontWeight: 600, color: mMsg.ok ? '#059669' : '#b91c1c', background: mMsg.ok ? '#ecfdf5' : '#fef2f2', border: `1px solid ${mMsg.ok ? '#a7f3d0' : '#fecaca'}`, borderRadius: '10px', padding: '10px 12px' }}>
                                    {mMsg.texte}
                                </div>
                            )}
                            <button onClick={enregistrerManuel} disabled={mSaving} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '12px', borderRadius: '12px', border: 'none', background: '#2563eb', color: 'white', fontWeight: 800, fontSize: '14px', cursor: mSaving ? 'wait' : 'pointer' }}>
                                {mSaving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Enregistrer le pointage
                            </button>
                        </div>
                    </div>
                )}

                {onglet === 'historique' && (
                    <div style={{ background: 'white', borderRadius: '20px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
                        <div style={{ padding: '16px 20px', borderBottom: '1px solid #f1f5f9', display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
                            <div style={{ position: 'relative', flex: 1, minWidth: '200px' }}>
                                <Search size={15} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                                <input value={recherche} onChange={e => setRecherche(e.target.value)} placeholder="Nom ou matricule…" style={{ width: '100%', padding: '9px 10px 9px 32px', borderRadius: '10px', border: '1px solid #cbd5e1', fontSize: '13px' }} />
                            </div>
                            <input type="date" value={hDebut} onChange={e => setHDebut(e.target.value)} style={{ padding: '9px', borderRadius: '10px', border: '1px solid #cbd5e1', fontSize: '13px' }} />
                            <input type="date" value={hFin} onChange={e => setHFin(e.target.value)} style={{ padding: '9px', borderRadius: '10px', border: '1px solid #cbd5e1', fontSize: '13px' }} />
                        </div>
                        <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '640px' }}>
                                <thead>
                                    <tr style={{ background: '#f8fafc' }}>
                                        {['Enseignant', 'Date', 'Arrivée', 'Départ', ''].map((h, i) => (
                                            <th key={i} style={{ textAlign: i === 0 ? 'left' : 'center', padding: '10px 14px', fontSize: '11px', fontWeight: 800, color: '#64748b', textTransform: 'uppercase' }}>{h}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {histoLoading ? (
                                        <tr><td colSpan={5} style={{ padding: '30px', textAlign: 'center', color: '#94a3b8' }}><Loader2 size={22} className="animate-spin" /></td></tr>
                                    ) : histo.length === 0 ? (
                                        <tr><td colSpan={5} style={{ padding: '30px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>Aucun pointage sur cette période.</td></tr>
                                    ) : histo.map(l => (
                                        <tr key={l.presence_id} style={{ borderTop: '1px solid #f1f5f9' }}>
                                            <td style={{ padding: '10px 14px', fontSize: '13px' }}>
                                                <div style={{ fontWeight: 700, color: '#1e293b' }}>{l.agent.nom}</div>
                                                <div style={{ fontSize: '11px', color: '#94a3b8' }}>{l.agent.matricule} · {l.agent.role}</div>
                                            </td>
                                            <td style={{ padding: '10px 14px', fontSize: '13px', textAlign: 'center', color: '#475569' }}>{l.date}</td>
                                            <td style={{ padding: '10px 14px', fontSize: '13px', textAlign: 'center', fontWeight: 700, color: '#0f172a' }}>{l.heure_arrivee || '—'}</td>
                                            <td style={{ padding: '10px 14px', fontSize: '13px', textAlign: 'center', color: '#475569' }}>{l.heure_depart || '—'}</td>
                                            <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                                                <button onClick={() => supprimer(l)} title="Supprimer ce pointage" style={{ padding: '7px 10px', borderRadius: '8px', border: '1px solid #fecaca', background: 'white', color: '#b91c1c', cursor: 'pointer', display: 'inline-flex', alignItems: 'center' }}>
                                                    <Trash2 size={14} />
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
