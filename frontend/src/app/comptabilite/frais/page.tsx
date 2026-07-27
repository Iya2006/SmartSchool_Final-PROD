'use client';

import React, { useState, useEffect, useCallback, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import api from '@/lib/api';
import {
    PlusCircle, Trash2, Edit2, CheckCircle2, AlertTriangle, XCircle,
    Search, RefreshCw, FileText, DollarSign, Users, Calendar,
    ChevronDown, ChevronRight, Banknote, CreditCard, Smartphone, X, Coins, Lightbulb
} from 'lucide-react';


// --- Types ---
type TypeFrais = {
    type_frais_id: number; code: string; libelle: string;
    categorie: string; montant_defaut: number; est_obligatoire: string; frequence: string; statut: string;
};
type Echeance = {
    echeance_id: number; libelle: string; date_limite: string;
    montant_attendu: number; montant_paye: number; statut: string;
};
type Facture = {
    facture_id: number; numero_facture: string; date_facture: string;
    montant_total: number; montant_paye: number; montant_restant: number;
    statut: string; type_frais_libelle: string; eleve_nom: string;
    eleve_prenom: string; classe_nom: string; classe_id: number;
    inscription_id: number; type_frais_id: number; echeances: Echeance[];
};
type Paiement = {
    paiement_id: number; numero_recu: string; date_paiement: string;
    montant: number; mode_paiement: string; statut: string;
    numero_facture: string; eleve_nom: string; eleve_prenom: string;
    echeance_id: number | null;
};

const CATEGORIES_FRAIS = [
    'Inscription', 'Scolarité', 'Transport', 'Cantine',
    'Uniforme', 'Fournitures', 'Activités', 'Réinscription', 'Autre'
];

const FREQUENCES = ['ANNUEL', 'TRIMESTRIEL', 'MENSUEL', 'UNIQUE'];

const MODES_PAIEMENT = [
    { value: 'ESPECES', label: 'Espèces', icon: Banknote },
    { value: 'CHEQUE', label: 'Chèque', icon: FileText },
    { value: 'MOBILE_MONEY', label: 'Mobile Money', icon: Smartphone },
    { value: 'VIREMENT', label: 'Virement bancaire', icon: CreditCard },
];

const STATUT_COLORS: Record<string, { bg: string; color: string; label: string }> = {
    'EN_ATTENTE': { bg: '#fef3c7', color: '#d97706', label: 'En attente' },
    'PARTIELLEMENT_PAYEE': { bg: '#dbeafe', color: '#2563eb', label: 'Partielle' },
    'PAYEE': { bg: '#d1fae5', color: '#059669', label: 'Payée' },
    'EN_RETARD': { bg: '#fee2e2', color: '#dc2626', label: 'En retard' },
};

function Badge({ statut }: { statut: string }) {
    const s = STATUT_COLORS[statut] || { bg: '#f1f5f9', color: '#475569', label: statut };
    return (
        <span style={{ padding: '3px 10px', borderRadius: '999px', fontSize: '12px', fontWeight: '600', backgroundColor: s.bg, color: s.color }}>
            {s.label}
        </span>
    );
}

function FraisScolaritePage() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const tabParam = searchParams.get('tab') || 'types';

    // Data
    const [typesFrais, setTypesFrais] = useState<TypeFrais[]>([]);
    const [factures, setFactures] = useState<Facture[]>([]);
    const [paiements, setPaiements] = useState<Paiement[]>([]);
    const [classes, setClasses] = useState<any[]>([]);
    const [stats, setStats] = useState<any>(null);

    // UI State
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
    const [searchFacture, setSearchFacture] = useState('');
    const [activeTab, setActiveTab] = useState('Scolarité');
    const [filterStatut, setFilterStatut] = useState('');

    // Modals
    const [showTypeFraisModal, setShowTypeFraisModal] = useState(false);
    const [editingTypeFrais, setEditingTypeFrais] = useState<TypeFrais | null>(null);
    const [showFactureModal, setShowFactureModal] = useState(false);
    const [showPaiementModal, setShowPaiementModal] = useState(false);
    const [selectedFacture, setSelectedFacture] = useState<Facture | null>(null);

    // Form States - Type Frais
    const [tfCode, setTfCode] = useState('');
    const [tfLibelle, setTfLibelle] = useState('');
    const [tfCategorie, setTfCategorie] = useState('Scolarité');
    const [tfMontantDefaut, setTfMontantDefaut] = useState('');
    const [tfObligatoire, setTfObligatoire] = useState('O');
    const [tfFrequence, setTfFrequence] = useState('ANNUEL');

    // Form States - Facture
    const [factClasseId, setFactClasseId] = useState('');
    const [factTypeFraisId, setFactTypeFraisId] = useState('');
    const [factMontant, setFactMontant] = useState('');
    const [factNbEcheances, setFactNbEcheances] = useState('1');
    const [factEcheances, setFactEcheances] = useState<any[]>([]);

    // Form States - Paiement
    const [payMontant, setPayMontant] = useState('');
    const [payMode, setPayMode] = useState('ESPECES');
    const [payReference, setPayReference] = useState('');
    const [payEcheanceId, setPayEcheanceId] = useState('');

    const showMsg = (text: string, type: 'success' | 'error') => {
        setMessage({ text, type });
        setTimeout(() => setMessage(null), 4000);
    };

    useEffect(() => {
        const total = parseFloat(factMontant) || 0;
        const nb = parseInt(factNbEcheances) || 1;
        if (total > 0) {
            if (nb === 1) {
                setFactEcheances([{ libelle: 'Paiement unique', montant_attendu: total, date_limite: new Date().toISOString().split('T')[0] }]);
            } else {
                const tranches = [];
                const splitAmount = Math.round(total / nb);
                for(let i=0; i<nb; i++){
                    const d = new Date();
                    d.setMonth(d.getMonth() + i);
                    tranches.push({
                        libelle: `Tranche ${i+1}/${nb}`,
                        montant_attendu: i === nb-1 ? total - (splitAmount * (nb-1)) : splitAmount,
                        date_limite: d.toISOString().split('T')[0]
                    });
                }
                setFactEcheances(tranches);
            }
        } else {
            setFactEcheances([]);
        }
    }, [factMontant, factNbEcheances]);

    const loadAll = useCallback(async () => {
        setLoading(true);
        try {
            const [tfRes, factRes, payRes, statsRes, classRes] = await Promise.all([
                api.get('/api/finance/types-frais'),
                api.get('/api/finance/factures?etablissement_id=1&annee_id=1&limit=200'),
                api.get('/api/finance/paiements?etablissement_id=1&limit=200'),
                api.get('/api/finance/factures/stats?etablissement_id=1&annee_id=1'),
                api.get('/api/classes?etablissement_id=1&annee_id=1&limit=100'),
            ]);
            setTypesFrais(tfRes.data);
            setFactures(factRes.data);
            setPaiements(payRes.data);
            setStats(statsRes.data);
            setClasses(classRes.data);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { loadAll(); }, [loadAll]);

    // --- TypeFrais CRUD ---
    const openNewTypeFrais = () => {
        setEditingTypeFrais(null);
        setTfCode(''); setTfLibelle(''); setTfCategorie('Scolarité');
        setTfMontantDefaut(''); setTfObligatoire('O'); setTfFrequence('ANNUEL');
        setShowTypeFraisModal(true);
    };

    const openEditTypeFrais = (tf: TypeFrais) => {
        setEditingTypeFrais(tf);
        setTfCode(tf.code); setTfLibelle(tf.libelle); setTfCategorie(tf.categorie);
        setTfMontantDefaut(tf.montant_defaut?.toString() || '0');
        setTfObligatoire(tf.est_obligatoire); setTfFrequence(tf.frequence);
        setShowTypeFraisModal(true);
    };

    const submitTypeFrais = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const payload = { code: tfCode, libelle: tfLibelle, categorie: tfCategorie, montant_defaut: parseFloat(tfMontantDefaut) || 0, est_obligatoire: tfObligatoire, frequence: tfFrequence };
            if (editingTypeFrais) {
                await api.put(`/api/finance/types-frais/${editingTypeFrais.type_frais_id}`, payload);
                showMsg('Type de frais mis à jour', 'success');
            } else {
                await api.post('/api/finance/types-frais', payload);
                showMsg('Type de frais créé', 'success');
            }
            setShowTypeFraisModal(false);
            loadAll();
        } catch (err: any) {
            showMsg(err.response?.data?.detail || 'Erreur', 'error');
        }
    };

    const deleteTypeFrais = async (id: number) => {
        if (!confirm('Supprimer ce type de frais ?')) return;
        try {
            await api.delete(`/api/finance/types-frais/${id}`);
            showMsg('Supprimé', 'success');
            loadAll();
        } catch (err: any) {
            showMsg(err.response?.data?.detail || 'Erreur', 'error');
        }
    };

    // --- Facture creation ---
    const submitFacture = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            // Validate the sum
            const totalEcheances = factEcheances.reduce((acc, ech) => acc + parseFloat(ech.montant_attendu || 0), 0);
            if (Math.abs(totalEcheances - parseFloat(factMontant)) > 1) {
                showMsg('Le total des échéances doit correspondre au montant total.', 'error');
                return;
            }

            const res = await api.post('/api/finance/factures/generer-classe', {
                classe_id: parseInt(factClasseId),
                annee_id: 1,
                type_frais_id: parseInt(factTypeFraisId),
                montant: parseFloat(factMontant),
                echeances: factEcheances.map(ech => ({
                    libelle: ech.libelle,
                    montant_attendu: parseFloat(ech.montant_attendu),
                    date_limite: ech.date_limite
                }))
            });
            showMsg('Factures générées avec succès', 'success');
            setShowFactureModal(false);
            loadAll();
        } catch (err: any) {
            showMsg(err.response?.data?.detail || 'Erreur', 'error');
        }
    };

    // --- Paiement ---
    const openPaiement = (f: Facture) => {
        setSelectedFacture(f);
        setPayMontant(f.montant_restant.toString());
        setPayMode('ESPECES');
        setPayReference('');
        setPayEcheanceId('');
        setShowPaiementModal(true);
    };

    const submitPaiement = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedFacture) return;
        try {
            const res = await api.post('/api/finance/paiements', {
                facture_id: selectedFacture.facture_id,
                echeance_id: payEcheanceId ? parseInt(payEcheanceId) : null,
                montant: parseFloat(payMontant),
                mode_paiement: payMode,
                reference_externe: payReference || null,
            });
            showMsg(res.data.message, 'success');
            setShowPaiementModal(false);
            // Non-blocking refresh
            api.get('/api/finance/factures?etablissement_id=1&annee_id=1&limit=200').then(r => setFactures(r.data));
            api.get('/api/finance/paiements?etablissement_id=1&limit=200').then(r => setPaiements(r.data));
            api.get('/api/finance/factures/stats?etablissement_id=1&annee_id=1').then(r => setStats(r.data));
        } catch (err: any) {
            showMsg(err.response?.data?.detail || 'Erreur', 'error');
        }
    };

    // Extract Categories for tabs
    const categories = Array.from(new Set(typesFrais.map(tf => tf.categorie)));
    if (!categories.includes('Scolarité')) categories.unshift('Scolarité');
    if (!categories.includes('Cantine')) categories.push('Cantine');
    if (!categories.includes('Inscription')) categories.push('Inscription');

    // Filtered factures
    const filteredFactures = factures.filter(f => {
        const tf = typesFrais.find(t => t.type_frais_id === f.type_frais_id);
        const cat = tf ? tf.categorie : 'Scolarité';
        if (cat !== activeTab) return false;
        
        if (filterStatut && f.statut !== filterStatut) return false;
        if (searchFacture) {
            const q = searchFacture.toLowerCase();
            if (!f.eleve_nom.toLowerCase().includes(q) &&
                !f.eleve_prenom.toLowerCase().includes(q) &&
                !f.numero_facture.toLowerCase().includes(q) &&
                !f.classe_nom.toLowerCase().includes(q)) return false;
        }
        return true;
    });

    const fmtMoney = (n: number) => n.toLocaleString('fr-FR') + ' GNF';

    return (
        <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
            {/* Message */}
            {message && (
                <div style={{ padding: '12px 16px', borderRadius: '8px', marginBottom: '20px', backgroundColor: message.type === 'error' ? '#fee2e2' : '#d1fae5', color: message.type === 'error' ? '#ef4444' : '#10b981', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: '500' }}>
                    {message.type === 'success' ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
                    {message.text}
                </div>
            )}

            {/* Stats Cards */}
            {stats && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px', marginBottom: '24px' }}>
                    {[
                        { label: 'Total Facturé', value: fmtMoney(stats.total_facture), color: '#3b82f6', icon: FileText },
                        { label: 'Total Encaissé', value: fmtMoney(stats.total_paye), color: '#10b981', icon: CheckCircle2 },
                        { label: 'Reste à Recouvrer', value: fmtMoney(stats.total_restant), color: '#f59e0b', icon: AlertTriangle },
                        { label: 'Taux de Recouvrement', value: `${stats.taux_recouvrement}%`, color: stats.taux_recouvrement >= 80 ? '#10b981' : '#f59e0b', icon: RefreshCw },
                    ].map(({ label, value, color, icon: Icon }) => (
                        <div key={label} style={{ backgroundColor: 'white', borderRadius: '12px', padding: '16px', boxShadow: '0 1px 3px rgba(0,0,0,0.08)', borderLeft: `4px solid ${color}` }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                <div>
                                    <p style={{ margin: '0 0 4px 0', fontSize: '12px', color: '#64748b', fontWeight: '500' }}>{label}</p>
                                    <p style={{ margin: 0, fontSize: '16px', fontWeight: '700', color: '#0f172a' }}>{value}</p>
                                </div>
                                <Icon size={20} color={color} />
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* =========== TAB: TYPES DE FRAIS =========== */}
            {tabParam === 'types' && (
                <div style={{ backgroundColor: 'white', borderRadius: '12px', padding: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                        <div>
                            <h3 style={{ margin: '0 0 4px 0', fontSize: '18px', color: '#0f172a' }}>Paramétrage des Tarifs</h3>
                            <p style={{ margin: 0, color: '#64748b', fontSize: '13px' }}>Gérez tous les types de frais applicables aux élèves</p>
                        </div>
                        <button onClick={openNewTypeFrais} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 18px', background: 'linear-gradient(135deg, #10b981, #059669)', color: 'white', border: 'none', borderRadius: '8px', fontWeight: '600', cursor: 'pointer', fontSize: '14px' }}>
                            <PlusCircle size={16} /> Nouveau type de frais
                        </button>
                    </div>

                    {/* Category Groups */}
                    {CATEGORIES_FRAIS.map(cat => {
                        const items = typesFrais.filter(tf => tf.categorie === cat);
                        if (items.length === 0) return null;
                        return (
                            <div key={cat} style={{ marginBottom: '20px' }}>
                                <div style={{ fontSize: '12px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px', padding: '8px 0', borderBottom: '1px solid #f1f5f9', marginBottom: '8px' }}>
                                    {cat}
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    {items.map(tf => (
                                        <div key={tf.type_frais_id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', border: '1px solid #e2e8f0', borderRadius: '8px', backgroundColor: '#fafafa' }}>
                                            <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                                                <span style={{ fontWeight: '700', fontSize: '13px', color: '#475569', padding: '2px 8px', backgroundColor: '#e2e8f0', borderRadius: '4px' }}>{tf.code}</span>
                                                <div>
                                                    <p style={{ margin: '0 0 2px 0', fontWeight: '600', color: '#0f172a', fontSize: '14px' }}>{tf.libelle}</p>
                                                    <p style={{ margin: 0, color: '#94a3b8', fontSize: '12px' }}>
                                                        {tf.frequence} · {tf.est_obligatoire === 'O' ? <><AlertTriangle size={12} style={{display:'inline', verticalAlign:'middle'}}/> Obligatoire</> : '✓ Facultatif'}
                                                        {tf.montant_defaut > 0 && <><Coins size={12} style={{display:'inline', verticalAlign:'middle'}}/> {' ' + tf.montant_defaut.toLocaleString('fr-FR') + ' GNF'}</>}
                                                    </p>
                                                </div>
                                            </div>
                                            <div style={{ display: 'flex', gap: '8px' }}>
                                                <button onClick={() => openEditTypeFrais(tf)} style={{ padding: '6px 10px', background: '#eff6ff', color: '#3b82f6', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>
                                                    <Edit2 size={14} />
                                                </button>
                                                <button onClick={() => deleteTypeFrais(tf.type_frais_id)} style={{ padding: '6px 10px', background: '#fee2e2', color: '#ef4444', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>
                                                    <Trash2 size={14} />
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        );
                    })}

                    {typesFrais.length === 0 && (
                        <div style={{ textAlign: 'center', padding: '60px', color: '#94a3b8' }}>
                            <Coins size={40} style={{ margin: '0 auto 12px auto' }} />
                            <p style={{ fontWeight: '600' }}>Aucun type de frais configuré</p>
                            <p style={{ fontSize: '13px' }}>Commencez par créer vos catégories de frais (Inscription, Scolarité, etc.)</p>
                        </div>
                    )}
                </div>
            )}

            {/* =========== TAB: FACTURES =========== */}
            {tabParam === 'factures' && (
                <div style={{ backgroundColor: 'white', borderRadius: '12px', padding: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                        <div>
                            <h3 style={{ margin: '0 0 4px 0', fontSize: '18px', color: '#0f172a' }}>Gestion des Factures</h3>
                            <p style={{ margin: 0, color: '#64748b', fontSize: '13px' }}>{filteredFactures.length} facture(s) trouvée(s)</p>
                        </div>
                        <button onClick={() => setShowFactureModal(true)} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 18px', background: 'linear-gradient(135deg, #10b981, #059669)', color: 'white', border: 'none', borderRadius: '8px', fontWeight: '600', cursor: 'pointer', fontSize: '14px' }}>
                            <PlusCircle size={16} /> Facturer une classe
                        </button>
                    </div>
                    {/* Tabs */}
                    <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', overflowX: 'auto', paddingBottom: '4px' }}>
                        {categories.map((cat: any) => (
                            <button
                                key={cat}
                                onClick={() => setActiveTab(cat)}
                                style={{
                                    padding: '8px 16px',
                                    borderRadius: '20px',
                                    border: 'none',
                                    fontWeight: '500',
                                    fontSize: '14px',
                                    cursor: 'pointer',
                                    whiteSpace: 'nowrap',
                                    backgroundColor: activeTab === cat ? '#3b82f6' : '#f1f5f9',
                                    color: activeTab === cat ? 'white' : '#64748b',
                                    transition: 'all 0.2s'
                                }}
                            >
                                {cat}
                            </button>
                        ))}
                    </div>

                    {/* Filters */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '12px', marginBottom: '20px' }}>
                        <div style={{ position: 'relative' }}>
                            <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                            <input value={searchFacture} onChange={e => setSearchFacture(e.target.value)} placeholder="Rechercher par nom, numéro, classe..." style={{ width: '100%', padding: '10px 12px 10px 36px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '14px', boxSizing: 'border-box' }} />
                        </div>
                        <select value={filterStatut} onChange={e => setFilterStatut(e.target.value)} style={{ padding: '10px 12px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '14px', backgroundColor: 'white', cursor: 'pointer' }}>
                            <option value="">Tous les statuts</option>
                            <option value="EN_ATTENTE">En attente</option>
                            <option value="PARTIELLEMENT_PAYEE">Partiellement payées</option>
                            <option value="PAYEE">Payées</option>
                            <option value="EN_RETARD">En retard</option>
                        </select>
                    </div>

                    {/* Table */}
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
                            <thead>
                                <tr style={{ backgroundColor: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                                    {['N° Facture', 'Élève', 'Classe', 'Type de frais', 'Montant', 'Payé', 'Reste', 'Statut', 'Action'].map(h => (
                                        <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontWeight: '600', color: '#475569', fontSize: '12px', textTransform: 'uppercase' }}>{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {filteredFactures.map(f => (
                                    <tr key={f.facture_id} style={{ borderBottom: '1px solid #f1f5f9' }} onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#f8fafc')} onMouseLeave={e => (e.currentTarget.style.backgroundColor = '')}>
                                        <td style={{ padding: '10px 12px', fontWeight: '600', color: '#3b82f6' }}>{f.numero_facture}</td>
                                        <td style={{ padding: '10px 12px', fontWeight: '500', color: '#0f172a' }}>{f.eleve_prenom} {f.eleve_nom}</td>
                                        <td style={{ padding: '10px 12px', color: '#475569' }}>{f.classe_nom}</td>
                                        <td style={{ padding: '10px 12px', color: '#475569' }}>{f.type_frais_libelle}</td>
                                        <td style={{ padding: '10px 12px', fontWeight: '600', color: '#0f172a' }}>{fmtMoney(f.montant_total)}</td>
                                        <td style={{ padding: '10px 12px', color: '#10b981', fontWeight: '600' }}>{fmtMoney(f.montant_paye)}</td>
                                        <td style={{ padding: '10px 12px', color: f.montant_restant > 0 ? '#f59e0b' : '#10b981', fontWeight: '600' }}>{fmtMoney(f.montant_restant)}</td>
                                        <td style={{ padding: '10px 12px' }}><Badge statut={f.statut} /></td>
                                        <td style={{ padding: '10px 12px' }}>
                                            {f.statut !== 'PAYEE' && (
                                                <button onClick={() => openPaiement(f)} style={{ padding: '6px 12px', background: '#10b981', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: '600' }}>
                                                    Encaisser
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        {filteredFactures.length === 0 && (
                            <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>Aucune facture trouvée</div>
                        )}
                    </div>
                </div>
            )}

            {/* =========== TAB: ÉCHEANCIERS =========== */}
            {tabParam === 'echeances' && (
                <div style={{ backgroundColor: 'white', borderRadius: '12px', padding: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
                    <h3 style={{ margin: '0 0 4px 0', fontSize: '18px', color: '#0f172a' }}>Suivi des Échéanciers</h3>
                    <p style={{ margin: '0 0 20px 0', color: '#64748b', fontSize: '13px' }}>Vue d'ensemble des paiements fractionnés et de leurs échéances</p>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        {factures.filter(f => f.echeances && f.echeances.length > 0).map(f => (
                            <div key={f.facture_id} style={{ border: '1px solid #e2e8f0', borderRadius: '10px', overflow: 'hidden' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                                    <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                                        <span style={{ fontWeight: '700', color: '#3b82f6', fontSize: '14px' }}>{f.numero_facture}</span>
                                        <span style={{ color: '#0f172a', fontWeight: '600' }}>{f.eleve_prenom} {f.eleve_nom}</span>
                                        <span style={{ color: '#64748b', fontSize: '13px' }}>{f.classe_nom}</span>
                                    </div>
                                    <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                                        <span style={{ fontWeight: '600', color: '#0f172a' }}>{fmtMoney(f.montant_total)}</span>
                                        <Badge statut={f.statut} />
                                        {f.statut !== 'PAYEE' && (
                                            <button onClick={() => openPaiement(f)} style={{ padding: '5px 12px', background: '#10b981', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: '600' }}>
                                                Payer
                                            </button>
                                        )}
                                    </div>
                                </div>
                                <div style={{ padding: '0 16px' }}>
                                    {f.echeances.map((e, i) => (
                                        <div key={e.echeance_id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: i < f.echeances.length - 1 ? '1px solid #f1f5f9' : 'none' }}>
                                            <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                                                <Calendar size={14} color="#94a3b8" />
                                                <span style={{ fontSize: '13px', color: '#475569' }}>{e.libelle}</span>
                                                <span style={{ fontSize: '12px', color: '#94a3b8' }}>Échéance : {new Date(e.date_limite).toLocaleDateString('fr-FR')}</span>
                                            </div>
                                            <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                                                <span style={{ fontSize: '13px', fontWeight: '600', color: '#0f172a' }}>{fmtMoney(e.montant_attendu)}</span>
                                                <span style={{ fontSize: '12px', color: '#10b981' }}>Payé: {fmtMoney(e.montant_paye)}</span>
                                                <Badge statut={e.statut} />
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}
                        {factures.filter(f => f.echeances && f.echeances.length > 0).length === 0 && (
                            <div style={{ textAlign: 'center', padding: '60px', color: '#94a3b8' }}>
                                <Calendar size={40} style={{ margin: '0 auto 12px auto' }} />
                                <p style={{ fontWeight: '600' }}>Aucun échéancier créé</p>
                                <p style={{ fontSize: '13px' }}>Les factures générées avec fractionnement apparaîtront ici.</p>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* =========== TAB: PAIEMENTS =========== */}
            {tabParam === 'paiements' && (
                <div style={{ backgroundColor: 'white', borderRadius: '12px', padding: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
                    <h3 style={{ margin: '0 0 4px 0', fontSize: '18px', color: '#0f172a' }}>Suivi des Encaissements</h3>
                    <p style={{ margin: '0 0 20px 0', color: '#64748b', fontSize: '13px' }}>Historique de tous les paiements enregistrés</p>

                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
                            <thead>
                                <tr style={{ backgroundColor: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                                    {['N° Reçu', 'Date', 'Élève', 'N° Facture', 'Montant', 'Mode', 'Statut'].map(h => (
                                        <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontWeight: '600', color: '#475569', fontSize: '12px', textTransform: 'uppercase' }}>{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {paiements.map(p => (
                                    <tr key={p.paiement_id} style={{ borderBottom: '1px solid #f1f5f9' }} onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#f8fafc')} onMouseLeave={e => (e.currentTarget.style.backgroundColor = '')}>
                                        <td style={{ padding: '10px 12px', fontWeight: '700', color: '#10b981' }}>{p.numero_recu}</td>
                                        <td style={{ padding: '10px 12px', color: '#475569' }}>{new Date(p.date_paiement).toLocaleDateString('fr-FR')}</td>
                                        <td style={{ padding: '10px 12px', fontWeight: '500', color: '#0f172a' }}>{p.eleve_prenom} {p.eleve_nom}</td>
                                        <td style={{ padding: '10px 12px', color: '#3b82f6' }}>{p.numero_facture}</td>
                                        <td style={{ padding: '10px 12px', fontWeight: '700', color: '#0f172a' }}>{fmtMoney(p.montant)}</td>
                                        <td style={{ padding: '10px 12px' }}>
                                            <span style={{ padding: '3px 8px', borderRadius: '4px', fontSize: '12px', backgroundColor: '#f1f5f9', color: '#475569' }}>
                                                {MODES_PAIEMENT.find(m => m.value === p.mode_paiement)?.label || p.mode_paiement}
                                            </span>
                                        </td>
                                        <td style={{ padding: '10px 12px' }}>
                                            <span style={{ padding: '3px 10px', borderRadius: '999px', fontSize: '12px', fontWeight: '600', backgroundColor: '#d1fae5', color: '#059669' }}>✓ Validé</span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        {paiements.length === 0 && (
                            <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>Aucun encaissement enregistré</div>
                        )}
                    </div>
                </div>
            )}

            {/* =========== MODAL: TYPE FRAIS =========== */}
            {showTypeFraisModal && (
                <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
                    <div style={{ backgroundColor: 'white', borderRadius: '16px', padding: '28px', width: '480px', maxWidth: '95vw', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                            <h3 style={{ margin: 0, fontSize: '18px', color: '#0f172a' }}>{editingTypeFrais ? 'Modifier' : 'Nouveau'} type de frais</h3>
                            <button onClick={() => setShowTypeFraisModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}><X size={20} /></button>
                        </div>
                        <form onSubmit={submitTypeFrais} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '12px' }}>
                                <div>
                                    <label style={{ display: 'block', fontSize: '13px', color: '#475569', marginBottom: '6px', fontWeight: '500' }}>Code *</label>
                                    <input value={tfCode} onChange={e => setTfCode(e.target.value)} required placeholder="ex: SCOL" style={{ width: '100%', padding: '10px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '14px', boxSizing: 'border-box', textTransform: 'uppercase' }} />
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontSize: '13px', color: '#475569', marginBottom: '6px', fontWeight: '500' }}>Libellé *</label>
                                    <input value={tfLibelle} onChange={e => setTfLibelle(e.target.value)} required placeholder="ex: Frais de scolarité" style={{ width: '100%', padding: '10px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '14px', boxSizing: 'border-box' }} />
                                </div>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                                <div>
                                    <label style={{ display: 'block', fontSize: '13px', color: '#475569', marginBottom: '6px', fontWeight: '500' }}>Catégorie</label>
                                    <select value={tfCategorie} onChange={e => setTfCategorie(e.target.value)} style={{ width: '100%', padding: '10px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '14px' }}>
                                        {CATEGORIES_FRAIS.map(c => <option key={c}>{c}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontSize: '13px', color: '#475569', marginBottom: '6px', fontWeight: '500' }}>Montant par défaut (GNF)</label>
                                    <input type="number" value={tfMontantDefaut} onChange={e => setTfMontantDefaut(e.target.value)} placeholder="ex: 150000" style={{ width: '100%', padding: '10px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '14px', boxSizing: 'border-box' }} />
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontSize: '13px', color: '#475569', marginBottom: '6px', fontWeight: '500' }}>Fréquence</label>
                                    <select value={tfFrequence} onChange={e => setTfFrequence(e.target.value)} style={{ width: '100%', padding: '10px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '14px' }}>
                                        {FREQUENCES.map(f => <option key={f}>{f}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontSize: '13px', color: '#475569', marginBottom: '6px', fontWeight: '500' }}>Obligatoire ?</label>
                                    <select value={tfObligatoire} onChange={e => setTfObligatoire(e.target.value)} style={{ width: '100%', padding: '10px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '14px' }}>
                                        <option value="O">Oui</option>
                                        <option value="N">Non</option>
                                    </select>
                                </div>
                            </div>
                            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', paddingTop: '8px' }}>
                                <button type="button" onClick={() => setShowTypeFraisModal(false)} style={{ padding: '10px 20px', background: '#f1f5f9', color: '#475569', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: '600' }}>Annuler</button>
                                <button type="submit" style={{ padding: '10px 20px', background: 'linear-gradient(135deg, #10b981, #059669)', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: '600' }}>
                                    {editingTypeFrais ? 'Mettre à jour' : 'Créer'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* =========== MODAL: GENERER FACTURES =========== */}
            {showFactureModal && (
                <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
                    <div style={{ backgroundColor: 'white', borderRadius: '16px', padding: '28px', width: '500px', maxWidth: '95vw', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                            <h3 style={{ margin: 0, fontSize: '18px', color: '#0f172a' }}>Facturer une Classe</h3>
                            <button onClick={() => setShowFactureModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}><X size={20} /></button>
                        </div>
                        <div style={{ padding: '12px', backgroundColor: '#eff6ff', borderRadius: '8px', marginBottom: '16px', fontSize: '13px', color: '#2563eb' }}>
                            <Lightbulb size={16} color="#d97706" style={{display:'inline', verticalAlign:'middle'}}/> Génère automatiquement une facture pour chaque élève actif de la classe sélectionnée, sans double saisie.
                        </div>
                        <form onSubmit={submitFacture} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            <div>
                                <label style={{ display: 'block', fontSize: '13px', color: '#475569', marginBottom: '6px', fontWeight: '500' }}>Classe *</label>
                                <select value={factClasseId} onChange={e => setFactClasseId(e.target.value)} required style={{ width: '100%', padding: '10px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '14px' }}>
                                    <option value="">-- Sélectionner une classe --</option>
                                    {classes.map((c: any) => <option key={c.classe_id} value={c.classe_id}>{c.libelle}</option>)}
                                </select>
                            </div>
                            <div>
                                <label style={{ display: 'block', fontSize: '13px', color: '#475569', marginBottom: '6px', fontWeight: '500' }}>Type de frais *</label>
                                <select value={factTypeFraisId} onChange={e => setFactTypeFraisId(e.target.value)} required style={{ width: '100%', padding: '10px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '14px' }}>
                                    <option value="">-- Sélectionner un type --</option>
                                    {typesFrais.map(tf => <option key={tf.type_frais_id} value={tf.type_frais_id}>{tf.libelle} ({tf.categorie})</option>)}
                                </select>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                                <div>
                                    <label style={{ display: 'block', fontSize: '13px', color: '#475569', marginBottom: '6px', fontWeight: '500' }}>Montant (GNF) *</label>
                                    <input type="number" value={factMontant} onChange={e => setFactMontant(e.target.value)} required min="1" placeholder="ex: 500000" style={{ width: '100%', padding: '10px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '14px', boxSizing: 'border-box' }} />
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontSize: '13px', color: '#475569', marginBottom: '6px', fontWeight: '500' }}>Fractionnement</label>
                                    <select value={factNbEcheances} onChange={e => setFactNbEcheances(e.target.value)} style={{ width: '100%', padding: '10px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '14px' }}>
                                        <option value="1">Paiement unique</option>
                                        <option value="2">2 versements</option>
                                        <option value="3">3 versements (Trimestriel)</option>
                                        <option value="6">6 versements</option>
                                        <option value="9">9 versements</option>
                                        <option value="10">10 versements</option>
                                    </select>
                                </div>
                            {factEcheances.length > 0 && (
                                <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    <label style={{ fontSize: '13px', color: '#475569', fontWeight: '600' }}>Configuration des échéances</label>
                                    {factEcheances.map((ech, i) => (
                                        <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', alignItems: 'center' }}>
                                            <input type="text" value={ech.libelle} onChange={e => {
                                                const newEch = [...factEcheances];
                                                newEch[i].libelle = e.target.value;
                                                setFactEcheances(newEch);
                                            }} style={{ padding: '8px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '13px', width: '100%', boxSizing: 'border-box' }} placeholder="Libellé (ex: Tranche 1)" required />
                                            <input type="number" value={ech.montant_attendu} onChange={e => {
                                                const newEch = [...factEcheances];
                                                newEch[i].montant_attendu = e.target.value ? parseFloat(e.target.value) : '';
                                                setFactEcheances(newEch);
                                            }} style={{ padding: '8px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '13px', width: '100%', boxSizing: 'border-box' }} placeholder="Montant" required />
                                            <input type="date" value={ech.date_limite} onChange={e => {
                                                const newEch = [...factEcheances];
                                                newEch[i].date_limite = e.target.value;
                                                setFactEcheances(newEch);
                                            }} style={{ padding: '8px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '13px', width: '100%', boxSizing: 'border-box' }} required />
                                        </div>
                                    ))}
                                    <div style={{ textAlign: 'right', fontSize: '12px', color: '#64748b', marginTop: '4px' }}>
                                        Total configuré : <strong style={{ color: Math.abs(factEcheances.reduce((a, b) => a + (parseFloat(b.montant_attendu) || 0), 0) - (parseFloat(factMontant) || 0)) > 1 ? '#ef4444' : '#10b981' }}>
                                            {factEcheances.reduce((a, b) => a + (parseFloat(b.montant_attendu) || 0), 0).toLocaleString()} GNF
                                        </strong>
                                    </div>
                                </div>
                            )}
                            </div>
                            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', paddingTop: '8px' }}>
                                <button type="button" onClick={() => setShowFactureModal(false)} style={{ padding: '10px 20px', background: '#f1f5f9', color: '#475569', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: '600' }}>Annuler</button>
                                <button type="submit" style={{ padding: '10px 20px', background: 'linear-gradient(135deg, #10b981, #059669)', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: '600' }}>
                                    Générer les factures
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* =========== MODAL: PAIEMENT =========== */}
            {showPaiementModal && selectedFacture && (
                <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
                    <div style={{ backgroundColor: 'white', borderRadius: '16px', padding: '28px', width: '520px', maxWidth: '95vw', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                            <h3 style={{ margin: 0, fontSize: '18px', color: '#0f172a' }}>Enregistrer un Paiement</h3>
                            <button onClick={() => setShowPaiementModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}><X size={20} /></button>
                        </div>

                        {/* Recap Facture */}
                        <div style={{ padding: '14px', backgroundColor: '#f8fafc', borderRadius: '10px', marginBottom: '20px', border: '1px solid #e2e8f0' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                                <span style={{ fontSize: '13px', color: '#64748b' }}>Élève</span>
                                <span style={{ fontWeight: '600', color: '#0f172a' }}>{selectedFacture.eleve_prenom} {selectedFacture.eleve_nom}</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                                <span style={{ fontSize: '13px', color: '#64748b' }}>Facture</span>
                                <span style={{ fontWeight: '600', color: '#3b82f6' }}>{selectedFacture.numero_facture}</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '8px', borderTop: '1px solid #e2e8f0' }}>
                                <span style={{ fontSize: '13px', color: '#64748b' }}>Reste à payer</span>
                                <span style={{ fontWeight: '700', color: '#f59e0b', fontSize: '16px' }}>{fmtMoney(selectedFacture.montant_restant)}</span>
                            </div>
                        </div>

                        <form onSubmit={submitPaiement} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            {/* Échéance si dispo */}
                            {selectedFacture.echeances && selectedFacture.echeances.length > 0 && (
                                <div>
                                    <label style={{ display: 'block', fontSize: '13px', color: '#475569', marginBottom: '6px', fontWeight: '500' }}>Appliquer à l'échéance (optionnel)</label>
                                    <select value={payEcheanceId} onChange={e => {
                                        setPayEcheanceId(e.target.value);
                                        if (e.target.value) {
                                            const ech = selectedFacture.echeances.find(ec => ec.echeance_id === parseInt(e.target.value));
                                            if (ech) setPayMontant((ech.montant_attendu - ech.montant_paye).toString());
                                        }
                                    }} style={{ width: '100%', padding: '10px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '14px' }}>
                                        <option value="">-- Paiement libre --</option>
                                        {selectedFacture.echeances.filter(e => e.statut !== 'PAYEE').map(e => (
                                            <option key={e.echeance_id} value={e.echeance_id}>
                                                {e.libelle} — Reste: {fmtMoney(e.montant_attendu - e.montant_paye)}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            )}

                            <div>
                                <label style={{ display: 'block', fontSize: '13px', color: '#475569', marginBottom: '6px', fontWeight: '500' }}>Montant encaissé (GNF) *</label>
                                <input type="number" value={payMontant} onChange={e => setPayMontant(e.target.value)} required min="1" max={selectedFacture.montant_restant} style={{ width: '100%', padding: '10px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '16px', fontWeight: '700', boxSizing: 'border-box' }} />
                            </div>

                            <div>
                                <label style={{ display: 'block', fontSize: '13px', color: '#475569', marginBottom: '8px', fontWeight: '500' }}>Mode de paiement *</label>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                                    {MODES_PAIEMENT.map(m => (
                                        <button key={m.value} type="button" onClick={() => setPayMode(m.value)} style={{
                                            padding: '10px', border: `2px solid ${payMode === m.value ? '#10b981' : '#e2e8f0'}`,
                                            borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: '600',
                                            backgroundColor: payMode === m.value ? '#ecfdf5' : 'white',
                                            color: payMode === m.value ? '#059669' : '#475569', transition: 'all 0.2s'
                                        }}>
                                            {m.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {(payMode === 'CHEQUE' || payMode === 'MOBILE_MONEY' || payMode === 'VIREMENT') && (
                                <div>
                                    <label style={{ display: 'block', fontSize: '13px', color: '#475569', marginBottom: '6px', fontWeight: '500' }}>Référence externe</label>
                                    <input value={payReference} onChange={e => setPayReference(e.target.value)} placeholder="N° de chèque, transaction, etc." style={{ width: '100%', padding: '10px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '14px', boxSizing: 'border-box' }} />
                                </div>
                            )}

                            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', paddingTop: '8px' }}>
                                <button type="button" onClick={() => setShowPaiementModal(false)} style={{ padding: '10px 20px', background: '#f1f5f9', color: '#475569', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: '600' }}>Annuler</button>
                                <button type="submit" style={{ padding: '10px 24px', background: 'linear-gradient(135deg, #10b981, #059669)', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: '700', fontSize: '15px' }}>
                                    ✓ Valider le paiement
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}

export default function Page() {
    return (
        <Suspense fallback={<div style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>Chargement...</div>}>
            <FraisScolaritePage />
        </Suspense>
    );
}
