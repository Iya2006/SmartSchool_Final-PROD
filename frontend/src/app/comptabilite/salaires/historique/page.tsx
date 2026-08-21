'use client';

/**
 * Comptabilité › Historique des salaires.
 *
 * Liste tous les salaires versés (enseignants + personnel) de l'école, avec
 * recherche par nom (insensible aux accents) et filtre par mois concerné.
 * Les données viennent de /api/finance/salaires/historique (isolé par
 * établissement côté serveur).
 */
import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Wallet, Search, ChevronRight, Loader2, Users } from 'lucide-react';
import api from '@/lib/api';

type Paiement = {
    depense_id: number; employe: string; type: string; mois: string | null;
    montant: number; date_paiement: string | null; mode_paiement: string | null; statut: string | null;
};

const fmt = (n: number) => (n || 0).toLocaleString('fr-GN') + ' GNF';
const moisLisible = (m: string | null) => {
    if (!m || !/^\d{4}-\d{2}$/.test(m)) return m || '—';
    const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
    const [a, mm] = m.split('-');
    return `${MOIS[parseInt(mm, 10) - 1]} ${a}`;
};

export default function HistoriqueSalairesPage() {
    const [search, setSearch] = useState('');
    const [debounced, setDebounced] = useState('');
    const [mois, setMois] = useState('');
    const [data, setData] = useState<{ total: number; nombre: number; paiements: Paiement[] } | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const t = setTimeout(() => setDebounced(search.trim()), 350);
        return () => clearTimeout(t);
    }, [search]);

    useEffect(() => {
        setLoading(true);
        const params = new URLSearchParams();
        if (mois) params.set('mois', mois);
        if (debounced) params.set('search', debounced);
        api.get(`/api/finance/salaires/historique?${params}`)
            .then(res => setData(res.data))
            .catch(() => setData({ total: 0, nombre: 0, paiements: [] }))
            .finally(() => setLoading(false));
    }, [mois, debounced]);

    const paiements = data?.paiements || [];

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#64748b' }}>
                <Link href="/comptabilite" style={{ color: '#3b82f6' }}>Comptabilité</Link>
                <ChevronRight size={14} />
                <span style={{ fontWeight: 600, color: '#1e293b' }}>Historique des salaires</span>
            </div>

            <h1 style={{ margin: 0, fontSize: 'clamp(19px,3vw,24px)', fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 10 }}>
                <Wallet size={22} style={{ color: '#3b82f6' }} /> Historique des salaires
            </h1>

            {/* KPI */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px,1fr))', gap: 14 }}>
                <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '18px 22px' }}>
                    <p style={{ margin: 0, fontSize: 12, color: '#64748b', fontWeight: 600 }}>Total versé (filtré)</p>
                    <p style={{ margin: '4px 0 0', fontSize: 22, fontWeight: 800, color: '#3b82f6' }}>{fmt(data?.total || 0)}</p>
                </div>
                <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '18px 22px' }}>
                    <p style={{ margin: 0, fontSize: 12, color: '#64748b', fontWeight: 600 }}>Paiements</p>
                    <p style={{ margin: '4px 0 0', fontSize: 22, fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Users size={18} style={{ color: '#94a3b8' }} /> {data?.nombre || 0}
                    </p>
                </div>
            </div>

            {/* Filtres */}
            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '14px 18px', display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                <div style={{ position: 'relative', flex: '1 1 260px' }}>
                    <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                    <input value={search} onChange={e => setSearch(e.target.value)}
                        placeholder="Rechercher un employé (nom, prénom)…"
                        style={{ width: '100%', padding: '10px 12px 10px 36px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
                </div>
                <label style={{ fontSize: 13, color: '#475569', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
                    Mois
                    <input type="month" value={mois} onChange={e => setMois(e.target.value)}
                        style={{ padding: '9px 12px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13 }} />
                </label>
                {mois && (
                    <button onClick={() => setMois('')}
                        style={{ padding: '9px 12px', borderRadius: 8, border: '1px solid #cbd5e1', background: '#fff', color: '#475569', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                        Tous les mois
                    </button>
                )}
            </div>

            {/* Table */}
            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, overflow: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 720 }}>
                    <thead>
                        <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                            {['Employé', 'Type', 'Mois', 'Montant net', 'Payé le', 'Mode', 'Statut'].map(h => (
                                <th key={h} style={{ padding: '12px 14px', textAlign: 'left', fontWeight: 600, color: '#475569', whiteSpace: 'nowrap' }}>{h}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr><td colSpan={7} style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>
                                <Loader2 size={22} className="animate-spin" style={{ display: 'inline-block' }} /> Chargement…
                            </td></tr>
                        ) : paiements.length === 0 ? (
                            <tr><td colSpan={7} style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>Aucun salaire versé sur cette période.</td></tr>
                        ) : paiements.map(p => (
                            <tr key={p.depense_id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                <td style={{ padding: '11px 14px', fontWeight: 600, color: '#0f172a' }}>{p.employe}</td>
                                <td style={{ padding: '11px 14px', color: '#64748b' }}>{p.type}</td>
                                <td style={{ padding: '11px 14px' }}>{moisLisible(p.mois)}</td>
                                <td style={{ padding: '11px 14px', fontWeight: 700, color: '#059669' }}>{fmt(p.montant)}</td>
                                <td style={{ padding: '11px 14px', color: '#64748b' }}>{p.date_paiement || '—'}</td>
                                <td style={{ padding: '11px 14px', color: '#64748b' }}>{p.mode_paiement || '—'}</td>
                                <td style={{ padding: '11px 14px' }}>
                                    <span style={{ padding: '3px 10px', borderRadius: 999, fontSize: 11, fontWeight: 700, background: '#ecfdf5', color: '#059669' }}>
                                        {p.statut || 'PAYE'}
                                    </span>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            <style>{`.animate-spin{animation:spin 1s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        </div>
    );
}
