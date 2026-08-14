'use client';

import React, { useState, useEffect, useRef } from 'react';
import { History, Search, Calendar as CalendarIcon, Clock, Filter, User as UserIcon, RefreshCw, Download, Printer, FileText } from 'lucide-react';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';

interface PresenceRecord {
    presence_id: number;
    date: string;
    heure_arrivee: string | null;
    heure_depart: string | null;
    statut: string;
    agent: {
        nom: string;
        matricule: string;
        role: string;
        type: string;
        photo?: string | null;
    };
}

interface StatsData {
    kpis: {
        total_enregistrements: number;
        presences: number;
        absents: number;
        taux_presence: number;
        total_agents: number;
    };
    graphique_jours: { name: string; value: number; count: number }[];
    graphique_heures: { name: string; value: number }[];
}

export default function HistoriquePresences() {
    const [presences, setPresences] = useState<PresenceRecord[]>([]);
    const [stats, setStats] = useState<StatsData | null>(null);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [dateDebut, setDateDebut] = useState('');
    const [dateFin, setDateFin] = useState('');
    const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null);
    const [isMounted, setIsMounted] = useState(false);
    const [activeTab, setActiveTab] = useState<'personnel' | 'eleves'>('personnel');

    const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8300';
    const getPhotoUrl = (url: string | null | undefined) => {
        if (!url) return null;
        if (url.startsWith('http')) return url;
        return `${API_BASE}${url.startsWith('/') ? '' : '/'}${url}`;
    };
    
    // For print
    const componentRef = useRef<HTMLDivElement>(null);

    const fetchData = async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams();
            if (search) params.append('recherche', search);
            if (dateDebut) params.append('date_debut', dateDebut);
            if (dateFin) params.append('date_fin', dateFin);
            const baseUrl = activeTab === 'personnel' ? '/api/presences-agents' : '/api/pointage-eleves';
            
            const [historyRes, statsRes] = await Promise.all([
                api.get(`${baseUrl}/historique?${params.toString()}`),
                api.get(`${baseUrl}/stats?${params.toString()}`)
            ]);
            
            let normalizedPresences = [];
            if (activeTab === 'personnel') {
                normalizedPresences = historyRes.data;
            } else {
                normalizedPresences = historyRes.data.data.map((p: any) => ({
                    presence_id: p.pointage_id,
                    date: p.date,
                    heure_arrivee: p.heure_arrivee,
                    heure_depart: p.heure_depart,
                    statut: p.statut,
                    agent: {
                        nom: p.eleve.nom,
                        matricule: p.eleve.matricule,
                        role: `Élève (${p.eleve.classe || 'N/A'})`,
                        type: 'ELEVE',
                        photo: p.eleve.photo
                    }
                }));
            }
            
            let normalizedStats = statsRes.data;
            if (activeTab === 'eleves') {
                const kpis = statsRes.data.kpis || {};
                const total = kpis.total_eleves_actifs || 0;
                const presents = kpis.presents || kpis.total_arrivees || 0;
                const absents = total > presents ? total - presents : 0;
                const taux = total > 0 ? Math.round((presents / total) * 100) : 0;
                
                normalizedStats = {
                    kpis: {
                        total_agents: total,
                        presences: presents,
                        absents: absents,
                        taux_presence: taux,
                        total_enregistrements: kpis.total_pointages || 0
                    },
                    graphique_jours: statsRes.data.graphique_jours || [],
                    graphique_heures: statsRes.data.graphique_heures || []
                };
            }
            
            setPresences(normalizedPresences);
            setStats(normalizedStats);
        } catch (error: any) {
            toast.error("Erreur lors de la récupération des données");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        // Set default dates to current month
        const today = new Date();
        const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
        
        setDateDebut(firstDay.toISOString().split('T')[0]);
        setDateFin(today.toISOString().split('T')[0]);
        setIsMounted(true);
    }, []);

    // Fetch once dates and tab are set
    useEffect(() => {
        if (dateDebut && dateFin) {
            fetchData();
        }
    }, [dateDebut, dateFin, activeTab]); // eslint-disable-line react-hooks/exhaustive-deps

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault();
        fetchData();
    };

    const handleReset = () => {
        setSearch('');
        const today = new Date();
        setDateDebut(new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0]);
        setDateFin(today.toISOString().split('T')[0]);
        setTimeout(() => fetchData(), 100);
    };

    const handlePrint = () => {
        window.print();
    };

    const handleExportCSV = () => {
        if (presences.length === 0) return;
        
        const headers = ['Date', 'Nom', 'Matricule', 'Rôle', 'Heure Arrivée', 'Heure Départ', 'Statut'];
        const csvRows = [headers.join(',')];
        
        presences.forEach(p => {
            const row = [
                p.date,
                `"${p.agent.nom}"`,
                p.agent.matricule,
                `"${p.agent.role}"`,
                p.heure_arrivee || '-',
                p.heure_depart || '-',
                p.statut
            ];
            csvRows.push(row.join(','));
        });
        
        const csvString = csvRows.join('\n');
        const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.setAttribute('href', url);
        a.setAttribute('download', `Historique_Presences_${new Date().toLocaleDateString('fr-FR').replace(/\//g, '-')}.csv`);
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    };

    const formatDate = (dateStr: string) => {
        if (!dateStr || !isMounted) return '';
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return '';
        return d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' });
    };

    return (
        <div style={{ padding: '24px', maxWidth: '1400px', margin: '0 auto' }} ref={componentRef}>
            <div className="print-hide" style={{ marginBottom: '32px', display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: 'linear-gradient(135deg, #3b82f6, #2563eb)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white' }}>
                        <History size={24} />
                    </div>
                    <div>
                        <h1 style={{ fontSize: '24px', fontWeight: 800, color: '#1e293b', margin: 0 }}>Historique des Présences</h1>
                        <p style={{ color: '#64748b', margin: '4px 0 0 0', fontSize: '14px' }}>Tableau de bord de suivi du personnel et des enseignants</p>
                    </div>
                </div>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                    <button onClick={handleReset} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 16px', background: 'white', border: '1px solid #e2e8f0', borderRadius: '8px', color: '#64748b', fontSize: '14px', fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s' }}>
                        <RefreshCw size={16} /> Réinitialiser
                    </button>
                    <button onClick={handleExportCSV} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 16px', background: 'white', border: '1px solid #e2e8f0', borderRadius: '8px', color: '#10b981', fontSize: '14px', fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s' }}>
                        <FileText size={16} /> Excel / CSV
                    </button>
                    <button onClick={handlePrint} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 16px', background: 'white', border: '1px solid #e2e8f0', borderRadius: '8px', color: '#3b82f6', fontSize: '14px', fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s' }}>
                        <Printer size={16} /> Imprimer / PDF
                    </button>
                </div>
            </div>

            {/* Print Header only visible on print */}
            <div className="print-only" style={{ display: 'none', marginBottom: '30px', textAlign: 'center', borderBottom: '2px solid #000', paddingBottom: '20px' }}>
                <h1 style={{ fontSize: '24px', margin: 0, textTransform: 'uppercase' }}>Rapport de Présences</h1>
                <p style={{ margin: '5px 0 0 0' }}>Période du {formatDate(dateDebut)} au {formatDate(dateFin)}</p>
            </div>

            {/* Tabs */}
            <div className="print-hide" style={{ display: 'flex', gap: '10px', marginBottom: '24px', borderBottom: '2px solid #e2e8f0' }}>
                <button 
                    onClick={() => setActiveTab('personnel')}
                    style={{ 
                        padding: '12px 24px', background: 'transparent', border: 'none', 
                        borderBottom: activeTab === 'personnel' ? '3px solid #3b82f6' : '3px solid transparent',
                        color: activeTab === 'personnel' ? '#3b82f6' : '#64748b',
                        fontWeight: activeTab === 'personnel' ? 700 : 600, fontSize: '15px', cursor: 'pointer',
                        display: 'flex', alignItems: 'center', gap: '8px', transition: 'all 0.2s', marginBottom: '-2px'
                    }}
                >
                    <UserIcon size={18} /> Personnel
                </button>
                <button 
                    onClick={() => setActiveTab('eleves')}
                    style={{ 
                        padding: '12px 24px', background: 'transparent', border: 'none', 
                        borderBottom: activeTab === 'eleves' ? '3px solid #3b82f6' : '3px solid transparent',
                        color: activeTab === 'eleves' ? '#3b82f6' : '#64748b',
                        fontWeight: activeTab === 'eleves' ? 700 : 600, fontSize: '15px', cursor: 'pointer',
                        display: 'flex', alignItems: 'center', gap: '8px', transition: 'all 0.2s', marginBottom: '-2px'
                    }}
                >
                    <UserIcon size={18} /> Élèves
                </button>
            </div>

            {/* Filters */}
            <div className="print-hide" style={{ background: 'white', padding: '24px', borderRadius: '20px', boxShadow: '0 4px 25px rgba(0,0,0,0.05)', border: '1px solid #f1f5f9', marginBottom: '30px' }}>
                <form onSubmit={handleSearch} style={{ display: 'flex', flexWrap: 'wrap', gap: '20px', alignItems: 'flex-end' }}>
                    <div style={{ flex: '1 1 250px' }}>
                        <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: '#475569', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Rechercher un agent</label>
                        <div style={{ position: 'relative' }}>
                            <Search size={18} color="#94a3b8" style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)' }} />
                            <input 
                                type="text" 
                                placeholder="Nom, prénom ou matricule..." 
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                style={{ width: '100%', padding: '12px 16px 12px 44px', borderRadius: '12px', border: '1px solid #e2e8f0', outline: 'none', fontSize: '14px', background: '#f8fafc', transition: 'all 0.2s' }}
                            />
                        </div>
                    </div>
                    
                    <div style={{ flex: '1 1 180px' }}>
                        <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: '#475569', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Date de début</label>
                        <input 
                            type="date" 
                            value={dateDebut}
                            onChange={e => setDateDebut(e.target.value)}
                            style={{ width: '100%', padding: '12px 16px', borderRadius: '12px', border: '1px solid #e2e8f0', outline: 'none', fontSize: '14px', background: '#f8fafc' }}
                        />
                    </div>
                    
                    <div style={{ flex: '1 1 180px' }}>
                        <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: '#475569', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Date de fin</label>
                        <input 
                            type="date" 
                            value={dateFin}
                            onChange={e => setDateFin(e.target.value)}
                            style={{ width: '100%', padding: '12px 16px', borderRadius: '12px', border: '1px solid #e2e8f0', outline: 'none', fontSize: '14px', background: '#f8fafc' }}
                        />
                    </div>
                    
                    <div>
                        <button type="submit" style={{ padding: '12px 32px', borderRadius: '12px', border: 'none', background: '#1e293b', color: 'white', fontWeight: 600, fontSize: '14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', height: '46px', boxShadow: '0 4px 15px rgba(30,41,59,0.2)', transition: 'all 0.2s' }}>
                            <Filter size={18} /> Filtrer
                        </button>
                    </div>
                </form>
            </div>

            {loading ? (
                <div style={{ padding: '60px', textAlign: 'center', color: '#64748b' }}>
                    <RefreshCw size={40} className="animate-spin" style={{ margin: '0 auto 16px', opacity: 0.5 }} />
                    <p style={{ fontSize: '16px', fontWeight: 500 }}>Chargement des données statistiques...</p>
                </div>
            ) : (
                <>
                    {/* KPI Cards */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px', marginBottom: '30px' }}>
                        <div style={{ background: 'white', padding: '24px', borderRadius: '20px', border: '1px solid #e0e7ff', borderLeft: '4px solid #4f46e5', boxShadow: '0 4px 20px rgba(79,70,229,0.05)' }}>
                            <div style={{ fontSize: '13px', fontWeight: 700, color: '#6366f1', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>{activeTab === 'personnel' ? 'Total Personnels' : 'Total Élèves'}</div>
                            <div style={{ fontSize: '32px', fontWeight: 800, color: '#1e293b' }}>{stats?.kpis.total_agents || 0}</div>
                        </div>
                        <div style={{ background: 'white', padding: '24px', borderRadius: '20px', border: '1px solid #dcfce7', borderLeft: '4px solid #10b981', boxShadow: '0 4px 20px rgba(16,185,129,0.05)' }}>
                            <div style={{ fontSize: '13px', fontWeight: 700, color: '#059669', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>Présences</div>
                            <div style={{ fontSize: '32px', fontWeight: 800, color: '#1e293b' }}>{stats?.kpis.presences || 0}</div>
                        </div>
                        <div style={{ background: 'white', padding: '24px', borderRadius: '20px', border: '1px solid #fee2e2', borderLeft: '4px solid #ef4444', boxShadow: '0 4px 20px rgba(239,68,68,0.05)' }}>
                            <div style={{ fontSize: '13px', fontWeight: 700, color: '#dc2626', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>Absences (Estimé)</div>
                            <div style={{ fontSize: '32px', fontWeight: 800, color: '#1e293b' }}>{stats?.kpis.absents || 0}</div>
                        </div>
                        <div style={{ background: 'white', padding: '24px', borderRadius: '20px', border: '1px solid #ffedd5', borderLeft: '4px solid #f97316', boxShadow: '0 4px 20px rgba(249,115,22,0.05)' }}>
                            <div style={{ fontSize: '13px', fontWeight: 700, color: '#ea580c', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>Taux de présence</div>
                            <div style={{ fontSize: '32px', fontWeight: 800, color: '#1e293b' }}>{stats?.kpis.taux_presence || 0}%</div>
                        </div>
                    </div>

                    {/* Charts */}
                    <div className="print-break-inside" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '30px', marginBottom: '30px' }}>
                        
                        {/* Jours de semaine */}
                        <div style={{ background: 'white', padding: '24px', borderRadius: '20px', boxShadow: '0 4px 20px rgba(0,0,0,0.05)', border: '1px solid #f1f5f9' }}>
                            <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#1e293b', marginBottom: '24px' }}>Taux de Présence par Jour (%)</h3>
                            <div style={{ height: '250px' }}>
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={stats?.graphique_jours || []}>
                                        <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} />
                                        <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} domain={[0, 100]} />
                                        <Tooltip cursor={{ fill: '#f8fafc' }} contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.1)' }} />
                                        <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                                            {stats?.graphique_jours.map((entry, index) => (
                                                <Cell key={`cell-${index}`} fill={entry.value > 80 ? '#10b981' : entry.value > 50 ? '#f59e0b' : '#ef4444'} />
                                            ))}
                                        </Bar>
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </div>

                        {/* Heures d'arrivée */}
                        <div style={{ background: 'white', padding: '24px', borderRadius: '20px', boxShadow: '0 4px 20px rgba(0,0,0,0.05)', border: '1px solid #f1f5f9' }}>
                            <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#1e293b', marginBottom: '24px' }}>Répartition des Arrivées par Heure</h3>
                            <div style={{ height: '250px' }}>
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={stats?.graphique_heures || []}>
                                        <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} />
                                        <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} />
                                        <Tooltip cursor={{ fill: '#f8fafc' }} contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.1)' }} />
                                        <Bar dataKey="value" fill="#3b82f6" radius={[6, 6, 0, 0]} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </div>

                    </div>

                    {/* Table */}
                    <div style={{ background: 'white', borderRadius: '20px', boxShadow: '0 4px 25px rgba(0,0,0,0.05)', border: '1px solid #f1f5f9', overflow: 'hidden' }}>
                        <div style={{ padding: '24px', borderBottom: '1px solid #e2e8f0' }}>
                            <h3 style={{ fontSize: '18px', fontWeight: 700, color: '#1e293b', margin: 0 }}>Détail des présences</h3>
                        </div>
                        
                        {presences.length === 0 ? (
                            <div style={{ padding: '60px', textAlign: 'center', color: '#64748b' }}>
                                <History size={48} style={{ opacity: 0.2, margin: '0 auto 16px' }} />
                                <p style={{ fontSize: '16px', fontWeight: 500 }}>Aucune présence trouvée pour cette période.</p>
                            </div>
                        ) : (
                            <div style={{ overflowX: 'auto' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                                    <thead>
                                        <tr style={{ background: '#f8fafc' }}>
                                            <th style={{ padding: '16px 24px', fontSize: '12px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Date</th>
                                            <th style={{ padding: '16px 24px', fontSize: '12px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Agent</th>
                                            <th style={{ padding: '16px 24px', fontSize: '12px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Poste</th>
                                            <th style={{ padding: '16px 24px', fontSize: '12px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Statut</th>
                                            <th style={{ padding: '16px 24px', fontSize: '12px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Arrivée</th>
                                            <th style={{ padding: '16px 24px', fontSize: '12px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Départ</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {presences.map((p) => (
                                            <tr key={p.presence_id} style={{ borderBottom: '1px solid #f1f5f9', transition: 'background 0.2s' }} className="hover:bg-slate-50">
                                                <td style={{ padding: '16px 24px' }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#334155', fontWeight: 600, fontSize: '14px' }}>
                                                        {formatDate(p.date)}
                                                    </div>
                                                </td>
                                                <td style={{ padding: '16px 24px' }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                                        <div 
                                                            onClick={() => { const url = getPhotoUrl(p.agent.photo); if (url) setSelectedPhoto(url); }}
                                                            style={{ 
                                                                width: '40px', height: '40px', borderRadius: '50%', 
                                                                background: 'linear-gradient(135deg, #e2e8f0, #cbd5e1)', 
                                                                display: 'flex', alignItems: 'center', justifyContent: 'center', 
                                                                color: '#475569', fontWeight: 700, fontSize: '15px',
                                                                cursor: p.agent.photo ? 'pointer' : 'default',
                                                                overflow: 'hidden', border: '2px solid white', boxShadow: '0 2px 5px rgba(0,0,0,0.05)',
                                                                transition: 'transform 0.2s',
                                                                transform: 'scale(1)'
                                                            }}
                                                            onMouseOver={(e) => { if(p.agent.photo) e.currentTarget.style.transform = 'scale(1.1)'; }}
                                                            onMouseOut={(e) => e.currentTarget.style.transform = 'scale(1)'}
                                                        >
                                                            {p.agent.photo ? (
                                                                <img src={getPhotoUrl(p.agent.photo)!} alt="Profil" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                                            ) : (
                                                                p.agent.nom.charAt(0)
                                                            )}
                                                        </div>
                                                        <div>
                                                            <div style={{ fontWeight: 700, color: '#0f172a', fontSize: '14px' }}>{p.agent.nom}</div>
                                                            <div style={{ fontSize: '12px', color: '#64748b', fontWeight: 500 }}>{p.agent.matricule}</div>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td style={{ padding: '16px 24px' }}>
                                                    <span style={{ fontSize: '14px', color: '#475569', fontWeight: 500 }}>{p.agent.role}</span>
                                                </td>
                                                <td style={{ padding: '16px 24px' }}>
                                                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '6px 12px', borderRadius: '50px', background: '#ecfdf5', color: '#059669', fontSize: '12px', fontWeight: 700, border: '1px solid #a7f3d0' }}>
                                                        <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#10b981' }}></div>
                                                        {p.statut}
                                                    </div>
                                                </td>
                                                <td style={{ padding: '16px 24px' }}>
                                                    {p.heure_arrivee ? (
                                                        <span style={{ fontSize: '14px', fontWeight: 700, color: '#0f172a' }}>{p.heure_arrivee}</span>
                                                    ) : <span style={{ color: '#cbd5e1' }}>-</span>}
                                                </td>
                                                <td style={{ padding: '16px 24px' }}>
                                                    {p.heure_depart ? (
                                                        <span style={{ fontSize: '14px', fontWeight: 700, color: '#0f172a' }}>{p.heure_depart}</span>
                                                    ) : <span style={{ color: '#cbd5e1' }}>-</span>}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </>
            )}

            {/* Print specific styles */}
            <style dangerouslySetInnerHTML={{ __html: `
                @media print {
                    body { background: white !important; }
                    .print-hide { display: none !important; }
                    .print-only { display: block !important; }
                    .print-break-inside { page-break-inside: avoid; }
                    * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
                }
            ` }} />

            {/* Photo Modal */}
            {selectedPhoto && (
                <div 
                    onClick={() => setSelectedPhoto(null)}
                    style={{
                        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                        background: 'rgba(15, 23, 42, 0.85)', backdropFilter: 'blur(4px)', zIndex: 9999,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        cursor: 'pointer', padding: '20px', animation: 'fadeIn 0.2s ease-out'
                    }}
                >
                    <img 
                        src={selectedPhoto} 
                        style={{ maxWidth: '100%', maxHeight: '85vh', borderRadius: '16px', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)', border: '4px solid white' }} 
                        onClick={(e) => e.stopPropagation()}
                    />
                    <button 
                        onClick={() => setSelectedPhoto(null)}
                        style={{ position: 'absolute', top: '20px', right: '30px', background: 'white', border: 'none', width: '40px', height: '40px', borderRadius: '50%', fontSize: '20px', fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#0f172a' }}
                    >
                        ×
                    </button>
                </div>
            )}
        </div>
    );
}
