'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useApp } from '@/context/AppContext';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Wallet, Plus, Search, RefreshCw, Download, Calendar, Tag,
    Loader2, Eye, X, Upload, FileText, CheckCircle, ChevronRight,
    TrendingDown, AlertCircle, ChevronDown, ChevronUp, Building2,
    GraduationCap, Users, ArrowUpDown, ArrowUp, ArrowDown
} from 'lucide-react';
import api from '@/lib/api';
import Link from 'next/link';

/* ───── Types ───── */
type Depense = {
    depense_id: number;
    etablissement_id: number;
    annee_id: number;
    categorie: string;
    libelle: string;
    montant: number;
    date_depense: string | null;
    fournisseur: string | null;
    statut: string;
    facture_url: string | null;
    source_fonds: string | null;
    classe_id: number | null;
    eleve_id: number | null;
    departement: string | null;
};

type ClasseItem = { classe_id: number; libelle: string; code: string };

const CATEGORIES = [
    { value: 'Salaires', label: 'Salaires et Personnel', color: '#10b981', bg: '#ecfdf5' },
    { value: 'Fournitures', label: 'Fournitures scolaires', color: '#3b82f6', bg: '#eff6ff' },
    { value: 'Loyer', label: 'Loyer / Immobilier', color: '#f59e0b', bg: '#fffbeb' },
    { value: 'Entretien', label: 'Entretien et Maintenance', color: '#8b5cf6', bg: '#f5f3ff' },
    { value: 'Autre', label: 'Autres dépenses', color: '#64748b', bg: '#f8fafc' }
];

const SOURCE_FONDS = [
    { value: 'CAISSE_PRINCIPALE', label: 'Caisse Principale (espèces)', color: '#10b981' },
    { value: 'BANQUE', label: 'Compte Bancaire', color: '#3b82f6' },
    { value: 'MOBILE_MONEY', label: 'Mobile Money (OM / MTN)', color: '#f59e0b' },
];

const DEPARTEMENTS = [
    'Maternelle', 'Primaire', 'Collège', 'Lycée',
    'Administration', 'Cantine', 'Transport', 'Informatique'
];

const STATUT_COLORS: Record<string, { bg: string; color: string; label: string }> = {
    'EN_ATTENTE': { bg: '#fef3c7', color: '#d97706', label: 'En attente' },
    'APPROUVEE': { bg: '#d1fae5', color: '#065f46', label: 'Approuvée' },
    'REJETEE': { bg: '#fee2e2', color: '#991b1b', label: 'Rejetée' },
    // rétro-compatibilité anciennes données
    'ANNULEE': { bg: '#fee2e2', color: '#991b1b', label: 'Rejetée' },
};

const fmt = (n: number) => n.toLocaleString('fr-GN') + ' GNF';

/* ───── Sorting ───── */
type SortKey = 'date_depense' | 'libelle' | 'categorie' | 'montant' | 'statut' | 'fournisseur';
type SortDir = 'asc' | 'desc';

function SortHeader({ label, sortKey, currentKey, currentDir, onSort }: {
    label: string; sortKey: SortKey; currentKey: SortKey; currentDir: SortDir;
    onSort: (key: SortKey) => void;
}) {
    const active = currentKey === sortKey;
    return (
        <th
            onClick={() => onSort(sortKey)}
            style={{
                padding: '14px 16px', textAlign: 'left', fontWeight: 600, color: '#475569',
                cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap',
                transition: 'background 0.15s',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = '#f1f5f9')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
        >
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                {label}
                {active ? (
                    currentDir === 'asc' ? <ArrowUp size={13} color="#10b981" /> : <ArrowDown size={13} color="#10b981" />
                ) : (
                    <ArrowUpDown size={13} style={{ opacity: 0.3 }} />
                )}
            </div>
        </th>
    );
}

export default function DepensesPage() {
    const { etablissementId, anneeId } = useApp();
    const [depenses, setDepenses] = useState<Depense[]>([]);
    const [classes, setClasses] = useState<ClasseItem[]>([]);
    const [stats, setStats] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [search, setSearch] = useState('');
    const [filterCategorie, setFilterCategorie] = useState('');
    const [filterClasse, setFilterClasse] = useState('');
    const [filterStatut, setFilterStatut] = useState('');
    const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

    // Sorting
    const [sortKey, setSortKey] = useState<SortKey>('date_depense');
    const [sortDir, setSortDir] = useState<SortDir>('desc');

    // Form modal state
    const [showForm, setShowForm] = useState(false);
    const [formLibelle, setFormLibelle] = useState('');
    const [formMontant, setFormMontant] = useState('');
    const [formCategorie, setFormCategorie] = useState('Fournitures');
    const [formCategorieLibre, setFormCategorieLibre] = useState('');
    const [formFournisseur, setFormFournisseur] = useState('');
    const [formSourceFonds, setFormSourceFonds] = useState('CAISSE_PRINCIPALE');
    const [formClasseId, setFormClasseId] = useState('');
    const [formEleveId, setFormEleveId] = useState('');
    const [formDepartement, setFormDepartement] = useState('');
    const [showAnalytique, setShowAnalytique] = useState(false);

    // File upload
    const [formFactureFile, setFormFactureFile] = useState<File | null>(null);
    const [formFactureUrl, setFormFactureUrl] = useState('');
    const fileInputRef = useRef<HTMLInputElement>(null);

    // View receipt modal
    const [selectedDepense, setSelectedDepense] = useState<Depense | null>(null);

    const showMsg = (text: string, type: 'success' | 'error') => {
        setMessage({ text, type });
        setTimeout(() => setMessage(null), 4000);
    };

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams({
                etablissement_id: String(etablissementId),
                annee_id: String(anneeId)
            });
            if (filterCategorie) params.set('categorie', filterCategorie);

            const [depRes, statsRes, classRes] = await Promise.all([
                api.get(`/api/finance/depenses?${params}`),
                api.get(`/api/finance/depenses/stats?etablissement_id=${etablissementId}&annee_id=${anneeId}`),
                api.get(`/api/classes?etablissement_id=${etablissementId}&annee_id=${anneeId}`)
            ]);

            setDepenses(depRes.data);
            setStats(statsRes.data);
            setClasses(classRes.data || []);
        } catch (err) {
            console.error(err);
            showMsg('Erreur de chargement des dépenses', 'error');
        }
        setLoading(false);
    }, [etablissementId, anneeId, filterCategorie]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setFormFactureFile(file);
            setFormFactureUrl(file.name);
        }
    };

    const handleCreateDepense = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!formLibelle || !formMontant) {
            showMsg('Veuillez remplir les champs obligatoires', 'error');
            return;
        }

        setSubmitting(true);
        try {
            // Déterminer la catégorie finale
            const categorie = formCategorie === '__LIBRE__' ? formCategorieLibre : formCategorie;

            if (!categorie) {
                showMsg('Veuillez saisir un libellé de catégorie', 'error');
                setSubmitting(false);
                return;
            }

            // Upload du fichier si présent
            let factureUrl = formFactureUrl || null;
            if (formFactureFile) {
                try {
                    const formData = new FormData();
                    formData.append('file', formFactureFile);
                    const uploadRes = await api.post('/api/finance/upload-justificatif', formData, {
                        headers: { 'Content-Type': 'multipart/form-data' }
                    });
                    factureUrl = uploadRes.data.url || uploadRes.data.filename || formFactureFile.name;
                } catch {
                    // Si l'upload échoue, on garde le nom du fichier
                    factureUrl = formFactureFile.name;
                }
            }

            const payload: any = {
                etablissement_id: etablissementId,
                annee_id: anneeId,
                categorie,
                libelle: formLibelle,
                montant: parseFloat(formMontant),
                fournisseur: formFournisseur || null,
                facture_url: factureUrl,
                source_fonds: formSourceFonds,
                classe_id: formClasseId ? parseInt(formClasseId) : null,
                eleve_id: formEleveId ? parseInt(formEleveId) : null,
                departement: formDepartement || null,
            };

            await api.post('/api/finance/depenses', payload);
            showMsg('Dépense enregistrée avec succès !', 'success');

            // Reset form
            setFormLibelle('');
            setFormMontant('');
            setFormCategorie('Fournitures');
            setFormCategorieLibre('');
            setFormFournisseur('');
            setFormSourceFonds('CAISSE_PRINCIPALE');
            setFormClasseId('');
            setFormEleveId('');
            setFormDepartement('');
            setFormFactureFile(null);
            setFormFactureUrl('');
            setShowAnalytique(false);
            setShowForm(false);

            fetchData();
        } catch (err) {
            console.error(err);
            showMsg('Erreur lors de la création de la dépense', 'error');
        }
        setSubmitting(false);
    };



    const handleChangeStatut = async (id: number, statut: string) => {
        try {
            await api.put(`/api/finance/depenses/${id}/statut?statut=${encodeURIComponent(statut)}`);
            showMsg('Statut de dépense mis à jour', 'success');
            fetchData();
        } catch (err) {
            console.error(err);
            showMsg('Erreur lors du changement de statut', 'error');
        }
    };

    // Filtering
    const filtered = depenses.filter(d => {
        // Class filter (frontend-side)
        if (filterClasse && d.classe_id !== parseInt(filterClasse)) return false;
        // Statut filter
        if (filterStatut && d.statut !== filterStatut) return false;
        // Search
        if (!search) return true;
        const q = search.toLowerCase();
        return d.libelle.toLowerCase().includes(q) ||
            (d.fournisseur && d.fournisseur.toLowerCase().includes(q)) ||
            d.categorie.toLowerCase().includes(q);
    });

    // Sorting
    const handleSort = (key: SortKey) => {
        if (sortKey === key) {
            setSortDir(prev => prev === 'asc' ? 'desc' : 'asc');
        } else {
            setSortKey(key);
            setSortDir('asc');
        }
    };

    const sorted = [...filtered].sort((a, b) => {
        const dir = sortDir === 'asc' ? 1 : -1;
        switch (sortKey) {
            case 'date_depense':
                return dir * ((a.date_depense || '').localeCompare(b.date_depense || ''));
            case 'libelle':
                return dir * a.libelle.localeCompare(b.libelle);
            case 'categorie':
                return dir * a.categorie.localeCompare(b.categorie);
            case 'montant':
                return dir * (a.montant - b.montant);
            case 'statut':
                return dir * a.statut.localeCompare(b.statut);
            case 'fournisseur':
                return dir * ((a.fournisseur || '').localeCompare(b.fournisseur || ''));
            default:
                return 0;
        }
    });

    const exportCSV = () => {
        const header = 'Date,Libellé,Catégorie,Fournisseur,Montant (GNF),Source Fonds,Statut,Département\n';
        const rows = sorted.map(d =>
            `"${d.date_depense || ''}","${d.libelle}","${d.categorie}","${d.fournisseur || ''}",${d.montant},"${d.source_fonds || ''}","${d.statut}","${d.departement || ''}"`
        ).join('\n');
        const blob = new Blob(['\ufeff' + header + rows], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `depenses_${new Date().toISOString().split('T')[0]}.csv`;
        link.click();
    };

    if (loading && depenses.length === 0) {
        return (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh', flexDirection: 'column', gap: 16 }}>
                <Loader2 size={40} className="animate-spin" color="#10b981" />
                <p style={{ color: '#64748b' }}>Chargement des dépenses...</p>
            </div>
        );
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* Toast */}
            <AnimatePresence>
                {message && (
                    <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
                        style={{ position: 'fixed', top: 20, right: 20, zIndex: 9999, padding: '12px 20px', borderRadius: 10, color: '#fff', fontWeight: 600, fontSize: 13, boxShadow: '0 4px 12px rgba(0,0,0,0.15)', background: message.type === 'success' ? '#10b981' : '#ef4444' }}>
                        {message.text}
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Breadcrumb */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#64748b' }}>
                <Link href="/comptabilite" style={{ color: '#10b981' }}>Comptabilité</Link>
                <ChevronRight size={14} />
                <span style={{ fontWeight: 600, color: '#1e293b' }}>Dépenses</span>
            </div>

            {/* Header section */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
                <div>
                    <h1 style={{ fontSize: 24, fontWeight: 800, color: '#1e293b' }}>Enregistrement des Dépenses</h1>
                    <p style={{ fontSize: 14, color: '#64748b', marginTop: 4 }}>Suivi et catégorisation de toutes les sorties d&apos;argent de l&apos;établissement</p>
                    <p style={{ fontSize: 11, color: '#10b981', marginTop: 6, fontWeight: 700 }}>UI COMPTA v3 — Statuts cliquables</p>
                </div>
                <button onClick={() => setShowForm(true)}
                    style={{ padding: '10px 20px', borderRadius: 10, background: '#10b981', color: '#fff', display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 600, border: 'none', cursor: 'pointer', boxShadow: '0 4px 6px -1px rgba(16,185,129,0.2)' }}>
                    <Plus size={18} /> Nouvelle sortie d&apos;argent
                </button>
            </div>

            {/* KPI Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>
                <div style={{ background: '#fff', borderRadius: 12, padding: '20px 24px', boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.06)', border: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                        <p style={{ fontSize: 12, color: '#64748b', fontWeight: 500, marginBottom: 4 }}>Total Dépenses</p>
                        <p style={{ fontSize: 24, fontWeight: 800, color: '#ef4444' }}>{fmt(stats?.total_depenses || 0)}</p>
                    </div>
                    <div style={{ width: 48, height: 48, borderRadius: 12, background: '#fee2e2', color: '#ef4444', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <TrendingDown size={24} />
                    </div>
                </div>

                {CATEGORIES.slice(0, 3).map((cat, i) => {
                    const catStat = stats?.par_categorie?.find((c: any) => c.categorie === cat.value);
                    const catTotal = catStat ? catStat.total : 0;
                    return (
                        <div key={i} style={{ background: '#fff', borderRadius: 12, padding: '20px 24px', boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.06)', border: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                                <p style={{ fontSize: 12, color: '#64748b', fontWeight: 500, marginBottom: 4 }}>{cat.label}</p>
                                <p style={{ fontSize: 20, fontWeight: 800, color: '#1e293b' }}>{fmt(catTotal)}</p>
                            </div>
                            <div style={{ width: 40, height: 40, borderRadius: 10, background: cat.bg, color: cat.color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <Tag size={20} />
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Filters bar */}
            <div style={{ background: '#fff', borderRadius: 12, padding: '16px 20px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)', border: '1px solid #e2e8f0', display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                <div style={{ position: 'relative', flex: '1 1 250px' }}>
                    <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                    <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher par libellé, fournisseur..."
                        style={{ width: '100%', padding: '10px 12px 10px 36px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13, outline: 'none' }} />
                </div>
                <select value={filterCategorie} onChange={e => setFilterCategorie(e.target.value)}
                    style={{ padding: '10px 14px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13, background: '#fff', cursor: 'pointer' }}>
                    <option value="">Toutes les catégories</option>
                    {CATEGORIES.map(cat => <option key={cat.value} value={cat.value}>{cat.label}</option>)}
                </select>
                <select value={filterClasse} onChange={e => setFilterClasse(e.target.value)}
                    style={{ padding: '10px 14px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13, background: '#fff', cursor: 'pointer' }}>
                    <option value="">Toutes les classes</option>
                    {classes.map(c => <option key={c.classe_id} value={c.classe_id}>{c.libelle}</option>)}
                </select>
                <select value={filterStatut} onChange={e => setFilterStatut(e.target.value)}
                    style={{ padding: '10px 14px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13, background: '#fff', cursor: 'pointer' }}>
                    <option value="">Tous les statuts</option>
                    <option value="EN_ATTENTE">En attente</option>
                    <option value="APPROUVEE">Approuvée</option>
                    <option value="REJETEE">Rejetée</option>
                </select>
                <button
                    onClick={fetchData}
                    disabled={loading}
                    style={{
                        padding: '10px 14px',
                        borderRadius: 8,
                        background: '#f1f5f9',
                        color: '#475569',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        fontSize: 13,
                        fontWeight: 600,
                        border: 'none',
                        cursor: loading ? 'not-allowed' : 'pointer',
                        opacity: loading ? 0.7 : 1
                    }}
                >
                    <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
                    {loading ? 'Actualisation...' : 'Actualiser'}
                </button>
                <button onClick={exportCSV} style={{ padding: '10px 14px', borderRadius: 8, background: '#10b981', color: '#fff', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, border: 'none', cursor: 'pointer' }}>
                    <Download size={14} /> Exporter CSV
                </button>
            </div>

            {/* Liste puis récapitulatif catégorie (en dessous) */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 20, alignItems: 'start' }}>

                {/* Main Table */}
                <div style={{ background: '#fff', borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.04)', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                        <thead>
                            <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                                <SortHeader label="Date" sortKey="date_depense" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} />
                                <SortHeader label="Libellé" sortKey="libelle" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} />
                                <SortHeader label="Catégorie" sortKey="categorie" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} />
                                <SortHeader label="Fournisseur" sortKey="fournisseur" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} />
                                <SortHeader label="Montant" sortKey="montant" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} />
                                <SortHeader label="Statut" sortKey="statut" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} />
                                <th style={{ padding: '14px 16px', textAlign: 'left', fontWeight: 600, color: '#475569' }}>Justificatif</th>
                                <th style={{ padding: '14px 16px', textAlign: 'left', fontWeight: 600, color: '#475569' }}>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {sorted.length === 0 ? (
                                <tr>
                                    <td colSpan={8} style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>
                                        <AlertCircle size={32} style={{ margin: '0 auto 8px', display: 'block', opacity: 0.5 }} />
                                        Aucune dépense enregistrée
                                    </td>
                                </tr>
                            ) : sorted.map((d) => (
                                <tr key={d.depense_id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                    <td style={{ padding: '14px 16px', whiteSpace: 'nowrap' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                            <Calendar size={14} style={{ color: '#64748b' }} />
                                            {d.date_depense || '—'}
                                        </div>
                                    </td>
                                    <td style={{ padding: '14px 16px', fontWeight: 600, color: '#1e293b', maxWidth: 200 }}>
                                        <div>{d.libelle}</div>
                                        {d.source_fonds && d.source_fonds !== 'CAISSE_PRINCIPALE' && (
                                            <span style={{ fontSize: 10, color: '#64748b', fontWeight: 400 }}>
                                                {SOURCE_FONDS.find(s => s.value === d.source_fonds)?.label || d.source_fonds}
                                            </span>
                                        )}
                                    </td>
                                    <td style={{ padding: '14px 16px' }}>
                                        {(() => {
                                            const catObj = CATEGORIES.find(c => c.value === d.categorie);
                                            return (
                                                <span style={{ padding: '3px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600, backgroundColor: catObj?.bg || '#f1f5f9', color: catObj?.color || '#475569' }}>
                                                    {catObj?.label || d.categorie}
                                                </span>
                                            );
                                        })()}
                                    </td>
                                    <td style={{ padding: '14px 16px', color: '#64748b' }}>{d.fournisseur || '—'}</td>
                                    <td style={{ padding: '14px 16px', fontWeight: 700, color: '#ef4444' }}>{fmt(d.montant)}</td>
                                    <td style={{ padding: '14px 16px' }}>
                                        {(() => {
                                            const c = STATUT_COLORS[d.statut] || { bg: '#f1f5f9', color: '#475569', label: d.statut };
                                            return <span style={{ padding: '3px 10px', borderRadius: 999, fontSize: 11, fontWeight: 700, backgroundColor: c.bg, color: c.color }}>{c.label}</span>;
                                        })()}
                                    </td>
                                    <td style={{ padding: '14px 16px' }}>
                                        {d.facture_url ? (
                                            <button onClick={() => setSelectedDepense(d)}
                                                style={{ border: 'none', background: 'none', color: '#3b82f6', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontWeight: 600, fontSize: 12 }}>
                                                <Eye size={14} /> Voir
                                            </button>
                                        ) : (
                                            <span style={{ color: '#94a3b8', fontSize: 12 }}>Aucun</span>
                                        )}
                                    </td>
                                    <td style={{ padding: '14px 16px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                            <select
                                                value={d.statut === 'ANNULEE' ? 'REJETEE' : d.statut}
                                                onChange={(e) => handleChangeStatut(d.depense_id, e.target.value)}
                                                style={{
                                                    padding: '6px 10px',
                                                    borderRadius: 8,
                                                    border: '1px solid #cbd5e1',
                                                    fontSize: 12,
                                                    fontWeight: 700,
                                                    background: '#fff',
                                                    cursor: 'pointer',
                                                    minWidth: 130
                                                }}
                                            >
                                                <option value="EN_ATTENTE">En attente</option>
                                                <option value="APPROUVEE">Approuvée</option>
                                                <option value="REJETEE">Rejetée</option>
                                            </select>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {/* Right Panel: Category Breakdown */}
                <div style={{ background: '#fff', borderRadius: 12, padding: 20, border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                    <h3 style={{ fontSize: 15, fontWeight: 700, color: '#1e293b', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Wallet size={16} style={{ color: '#10b981' }} />
                        Dépenses par catégorie
                    </h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                        {CATEGORIES.map(cat => {
                            const catStat = stats?.par_categorie?.find((c: any) => c.categorie === cat.value);
                            const catTotal = catStat ? catStat.total : 0;
                            const totalGlobal = stats?.total_depenses || 1;
                            const percentage = Math.round((catTotal / totalGlobal) * 100);

                            return (
                                <div key={cat.value}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                                        <span style={{ fontWeight: 600, color: '#475569' }}>{cat.label}</span>
                                        <span style={{ fontWeight: 700, color: '#1e293b' }}>{fmt(catTotal)}</span>
                                    </div>
                                    <div style={{ width: '100%', height: 6, background: '#f1f5f9', borderRadius: 999, overflow: 'hidden' }}>
                                        <div style={{ width: `${percentage}%`, height: '100%', background: cat.color, borderRadius: 999, transition: 'width 0.5s ease' }} />
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

            </div>

            {/* ══════════════════════════════════════════════════════════════════
                Modal: Nouvelle sortie d'argent — Formulaire complet
               ══════════════════════════════════════════════════════════════════ */}
            <AnimatePresence>
                {showForm && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
                        <motion.div initial={{ scale: 0.95, y: 10 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 10 }}
                            style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 560, maxHeight: '90vh', overflowY: 'auto', padding: 24, boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                                <h3 style={{ fontSize: 18, fontWeight: 700, color: '#1e293b', display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <Wallet size={20} color="#10b981" /> Nouvelle sortie d&apos;argent
                                </h3>
                                <button onClick={() => setShowForm(false)} style={{ border: 'none', background: '#f1f5f9', width: 28, height: 28, borderRadius: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                                    <X size={16} />
                                </button>
                            </div>

                            <form onSubmit={handleCreateDepense} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                                {/* Libellé */}
                                <div>
                                    <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#475569', marginBottom: 6 }}>Libellé de la dépense *</label>
                                    <input value={formLibelle} onChange={e => setFormLibelle(e.target.value)} required placeholder="Ex: Achat craies et stylos"
                                        style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13, outline: 'none' }} />
                                </div>

                                {/* Montant + Catégorie */}
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                                    <div>
                                        <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#475569', marginBottom: 6 }}>Montant (GNF) *</label>
                                        <input type="number" value={formMontant} onChange={e => setFormMontant(e.target.value)} required placeholder="Montant en GNF"
                                            style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13, outline: 'none' }} />
                                    </div>
                                    <div>
                                        <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#475569', marginBottom: 6 }}>Catégorie *</label>
                                        <select value={formCategorie} onChange={e => setFormCategorie(e.target.value)}
                                            style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13, outline: 'none', background: '#fff' }}>
                                            {CATEGORIES.map(cat => <option key={cat.value} value={cat.value}>{cat.label}</option>)}
                                            <option value="__LIBRE__">➕ Nouvelle catégorie...</option>
                                        </select>
                                    </div>
                                </div>

                                {/* Catégorie libre */}
                                {formCategorie === '__LIBRE__' && (
                                    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
                                        <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#475569', marginBottom: 6 }}>Libellé de la nouvelle catégorie *</label>
                                        <input value={formCategorieLibre} onChange={e => setFormCategorieLibre(e.target.value)} required placeholder="Ex: Transport scolaire"
                                            style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13, outline: 'none' }} />
                                    </motion.div>
                                )}

                                {/* Source de fonds */}
                                <div>
                                    <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#475569', marginBottom: 6 }}>
                                        <Wallet size={14} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} />
                                        Source des fonds *
                                    </label>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                                        {SOURCE_FONDS.map(sf => (
                                            <button type="button" key={sf.value}
                                                onClick={() => setFormSourceFonds(sf.value)}
                                                style={{
                                                    padding: '10px 8px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                                                    border: formSourceFonds === sf.value ? `2px solid ${sf.color}` : '1px solid #e2e8f0',
                                                    background: formSourceFonds === sf.value ? sf.color + '15' : '#fff',
                                                    color: formSourceFonds === sf.value ? sf.color : '#64748b',
                                                    cursor: 'pointer', textAlign: 'center', transition: 'all 0.15s',
                                                }}>
                                                {sf.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* Fournisseur */}
                                <div>
                                    <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#475569', marginBottom: 6 }}>Fournisseur (Optionnel)</label>
                                    <input value={formFournisseur} onChange={e => setFormFournisseur(e.target.value)} placeholder="Nom du fournisseur"
                                        style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13, outline: 'none' }} />
                                </div>

                                {/* Justificatif — Upload fichier */}
                                <div>
                                    <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#475569', marginBottom: 6 }}>
                                        <FileText size={14} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} />
                                        Justificatif (facture / reçu)
                                    </label>
                                    <input ref={fileInputRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" onChange={handleFileChange}
                                        style={{ display: 'none' }} />
                                    <div
                                        onClick={() => fileInputRef.current?.click()}
                                        style={{
                                            border: '2px dashed #e2e8f0', borderRadius: 10, padding: '20px 16px',
                                            textAlign: 'center', cursor: 'pointer', transition: 'all 0.15s',
                                            background: formFactureFile ? '#ecfdf5' : '#fafafa',
                                        }}
                                        onMouseEnter={e => { e.currentTarget.style.borderColor = '#10b981'; }}
                                        onMouseLeave={e => { e.currentTarget.style.borderColor = '#e2e8f0'; }}
                                    >
                                        {formFactureFile ? (
                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, color: '#10b981' }}>
                                                <CheckCircle size={18} />
                                                <span style={{ fontWeight: 600, fontSize: 13 }}>{formFactureFile.name}</span>
                                                <button type="button" onClick={(e) => { e.stopPropagation(); setFormFactureFile(null); setFormFactureUrl(''); }}
                                                    style={{ border: 'none', background: '#fee2e2', color: '#ef4444', borderRadius: 999, width: 20, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', marginLeft: 4 }}>
                                                    <X size={12} />
                                                </button>
                                            </div>
                                        ) : (
                                            <div style={{ color: '#94a3b8', fontSize: 13 }}>
                                                <Upload size={20} style={{ margin: '0 auto 6px', display: 'block' }} />
                                                Cliquez pour joindre une photo ou un PDF de la facture
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* ─── Accordéon : Suivi analytique (optionnel) ─── */}
                                <div style={{ border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden' }}>
                                    <button type="button" onClick={() => setShowAnalytique(!showAnalytique)}
                                        style={{
                                            width: '100%', padding: '12px 16px', display: 'flex', justifyContent: 'space-between',
                                            alignItems: 'center', border: 'none', background: '#f8fafc', cursor: 'pointer',
                                            fontSize: 13, fontWeight: 600, color: '#475569',
                                        }}>
                                        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                            <Building2 size={15} /> Suivi analytique (optionnel)
                                        </span>
                                        {showAnalytique ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                                    </button>
                                    <AnimatePresence>
                                        {showAnalytique && (
                                            <motion.div
                                                initial={{ height: 0, opacity: 0 }}
                                                animate={{ height: 'auto', opacity: 1 }}
                                                exit={{ height: 0, opacity: 0 }}
                                                style={{ overflow: 'hidden' }}
                                            >
                                                <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12, background: '#fff' }}>
                                                    <p style={{ fontSize: 11, color: '#94a3b8', margin: 0 }}>
                                                        Liez cette dépense à une classe, un département ou un élève pour un suivi détaillé.
                                                    </p>

                                                    {/* Classe */}
                                                    <div>
                                                        <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 4 }}>
                                                            <GraduationCap size={13} /> Classe concernée
                                                        </label>
                                                        <select value={formClasseId} onChange={e => setFormClasseId(e.target.value)}
                                                            style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #e2e8f0', fontSize: 12, background: '#fff' }}>
                                                            <option value="">— Aucune classe —</option>
                                                            {classes.map(c => <option key={c.classe_id} value={c.classe_id}>{c.libelle}</option>)}
                                                        </select>
                                                    </div>

                                                    {/* Département */}
                                                    <div>
                                                        <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 4 }}>
                                                            <Building2 size={13} /> Département
                                                        </label>
                                                        <select value={formDepartement} onChange={e => setFormDepartement(e.target.value)}
                                                            style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #e2e8f0', fontSize: 12, background: '#fff' }}>
                                                            <option value="">— Aucun département —</option>
                                                            {DEPARTEMENTS.map(d => <option key={d} value={d}>{d}</option>)}
                                                        </select>
                                                    </div>

                                                    {/* Élève (saisie libre d'ID pour le moment) */}
                                                    <div>
                                                        <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 4 }}>
                                                            <Users size={13} /> Élève concerné (ID)
                                                        </label>
                                                        <input type="number" value={formEleveId} onChange={e => setFormEleveId(e.target.value)}
                                                            placeholder="Laisser vide si non applicable"
                                                            style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #e2e8f0', fontSize: 12 }} />
                                                    </div>
                                                </div>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </div>

                                {/* Submit */}
                                <button type="submit" disabled={submitting}
                                    style={{ width: '100%', padding: '12px', borderRadius: 8, background: '#10b981', color: '#fff', fontWeight: 600, fontSize: 14, border: 'none', cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8, marginTop: 6, opacity: submitting ? 0.7 : 1 }}>
                                    {submitting && <Loader2 size={16} className="animate-spin" />}
                                    Valider et enregistrer
                                </button>
                            </form>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Modal: View Receipt / Facture */}
            <AnimatePresence>
                {selectedDepense && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
                        onClick={() => setSelectedDepense(null)}>
                        <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
                            onClick={e => e.stopPropagation()}
                            style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 500, padding: 32, boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)', textAlign: 'center' }}>
                            <div style={{ width: 64, height: 64, borderRadius: 999, background: '#ecfdf5', color: '#10b981', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                                <FileText size={32} />
                            </div>
                            <h3 style={{ fontSize: 18, fontWeight: 800, color: '#1e293b', marginBottom: 4 }}>Justificatif de dépense</h3>
                            <p style={{ fontSize: 12, color: '#64748b' }}>Fichier : {selectedDepense.facture_url}</p>

                            <div style={{ border: '1px dashed #e2e8f0', borderRadius: 10, padding: 16, margin: '20px 0', textAlign: 'left' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 13 }}>
                                    <span style={{ color: '#64748b' }}>Libellé :</span>
                                    <span style={{ fontWeight: 600, color: '#1e293b' }}>{selectedDepense.libelle}</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 13 }}>
                                    <span style={{ color: '#64748b' }}>Catégorie :</span>
                                    <span style={{ fontWeight: 600, color: '#1e293b' }}>{selectedDepense.categorie}</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 13 }}>
                                    <span style={{ color: '#64748b' }}>Fournisseur :</span>
                                    <span style={{ fontWeight: 600, color: '#1e293b' }}>{selectedDepense.fournisseur || '—'}</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 13 }}>
                                    <span style={{ color: '#64748b' }}>Source :</span>
                                    <span style={{ fontWeight: 600, color: '#1e293b' }}>{SOURCE_FONDS.find(s => s.value === selectedDepense.source_fonds)?.label || selectedDepense.source_fonds || '—'}</span>
                                </div>
                                {selectedDepense.departement && (
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 13 }}>
                                        <span style={{ color: '#64748b' }}>Département :</span>
                                        <span style={{ fontWeight: 600, color: '#1e293b' }}>{selectedDepense.departement}</span>
                                    </div>
                                )}
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, paddingTop: 8, borderTop: '1px solid #f1f5f9' }}>
                                    <span style={{ color: '#64748b', fontWeight: 600 }}>Montant :</span>
                                    <span style={{ fontWeight: 800, color: '#ef4444' }}>{fmt(selectedDepense.montant)}</span>
                                </div>
                            </div>

                            <div style={{ display: 'flex', gap: 10 }}>
                                <button onClick={() => alert('Téléchargement simulé pour le fichier ' + selectedDepense.facture_url)}
                                    style={{ flex: 1, padding: '10px', background: '#10b981', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>
                                    Télécharger le fichier
                                </button>
                                <button onClick={() => setSelectedDepense(null)}
                                    style={{ padding: '10px 16px', background: '#f1f5f9', color: '#475569', border: '1px solid #e2e8f0', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>
                                    Fermer
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            <style>{`
                .animate-spin { animation: spin 1s linear infinite; }
                @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
            `}</style>
        </div>
    );
}
