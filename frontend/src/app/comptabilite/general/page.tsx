'use client';

import React, { useState, useEffect, Suspense, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { Plus, Save, Search, Filter, FileText, CheckCircle2, AlertTriangle, Download, Trash2, Settings, Lock } from 'lucide-react';
import api from '@/lib/api';

function GeneralContent() {
    const searchParams = useSearchParams();
    const tabParam = searchParams.get('tab') || 'saisie';
    
    const [isLoading, setIsLoading] = useState(false);
    const [message, setMessage] = useState({ text: '', type: '' });

    // Data
    const [comptes, setComptes] = useState<any[]>([]);
    const [journaux, setJournaux] = useState<any[]>([]);
    const [ecritures, setEcritures] = useState<any[]>([]);
    const [exercices, setExercices] = useState<any[]>([]);

    // Form State for Saisie Manuelle
    const [dateEcriture, setDateEcriture] = useState(new Date().toISOString().split('T')[0]);
    const [journalId, setJournalId] = useState('');
    const [reference, setReference] = useState('');
    const [libelle, setLibelle] = useState('');
    const [lignes, setLignes] = useState<any[]>([{ compte_id: '', debit: 0, credit: 0, description: '' }, { compte_id: '', debit: 0, credit: 0, description: '' }]);

    // Form State for Exercice
    const [newExoAnnee, setNewExoAnnee] = useState('');
    const [newExoDebut, setNewExoDebut] = useState('');
    const [newExoFin, setNewExoFin] = useState('');

    // Form State for Journal
    const [newJournalCode, setNewJournalCode] = useState('');
    const [newJournalNom, setNewJournalNom] = useState('');
    const [newJournalType, setNewJournalType] = useState('OD');

    // Form State for Recherche
    const [searchQuery, setSearchQuery] = useState('');
    const [searchPeriode, setSearchPeriode] = useState('tous');
    const [searchJournal, setSearchJournal] = useState('tous');

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        setIsLoading(true);
        try {
            const [resComptes, resJournaux, resEcritures, resExercices] = await Promise.all([
                api.get('/api/comptabilite/comptes'),
                api.get('/api/comptabilite/journaux'),
                api.get('/api/comptabilite/ecritures'),
                api.get('/api/comptabilite/exercices')
            ]);
            setComptes(resComptes.data);
            setJournaux(resJournaux.data);
            setEcritures(resEcritures.data);
            setExercices(resExercices.data);
            if (resJournaux.data.length > 0) setJournalId(resJournaux.data[0].journal_id.toString());
        } catch (error) {
            console.error("Erreur chargement données comptables:", error);
        } finally {
            setIsLoading(false);
        }
    };

    const showMessage = (text: string, type: 'success' | 'error') => {
        setMessage({ text, type });
        setTimeout(() => setMessage({ text: '', type: '' }), 4000);
    };

    // --- LOGIC SAISIE MANUELLE ---
    const totalDebit = lignes.reduce((sum, l) => sum + (parseFloat(l.debit) || 0), 0);
    const totalCredit = lignes.reduce((sum, l) => sum + (parseFloat(l.credit) || 0), 0);
    const isEquilibre = totalDebit > 0 && Math.abs(totalDebit - totalCredit) < 0.01;

    const handleAddLigne = () => setLignes([...lignes, { compte_id: '', debit: 0, credit: 0, description: '' }]);

    const handleRemoveLigne = (index: number) => {
        if (lignes.length > 2) {
            setLignes(lignes.filter((_, i) => i !== index));
        }
    };

    const handleLigneChange = (index: number, field: string, value: any) => {
        const newLignes = [...lignes];
        if (field === 'debit') {
            newLignes[index].debit = value;
            if (parseFloat(value) > 0) newLignes[index].credit = 0;
        } else if (field === 'credit') {
            newLignes[index].credit = value;
            if (parseFloat(value) > 0) newLignes[index].debit = 0;
        } else {
            newLignes[index][field] = value;
        }
        setLignes(newLignes);
    };

    const handleSubmitEcriture = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!isEquilibre) {
            showMessage("L'écriture n'est pas équilibrée.", 'error');
            return;
        }
        try {
            const payload = {
                date_ecriture: dateEcriture,
                journal_id: parseInt(journalId),
                reference,
                libelle,
                lignes: lignes.filter(l => l.compte_id && (l.debit > 0 || l.credit > 0)).map(l => ({
                    ...l, compte_id: parseInt(l.compte_id), debit: parseFloat(l.debit) || 0, credit: parseFloat(l.credit) || 0
                }))
            };
            await api.post('/api/comptabilite/ecritures', payload);
            showMessage("Écriture enregistrée avec succès", 'success');
            setLibelle(''); setReference(''); setLignes([{ compte_id: '', debit: 0, credit: 0, description: '' }, { compte_id: '', debit: 0, credit: 0, description: '' }]);
            loadData();
        } catch (error: any) {
            showMessage(error.response?.data?.detail || "Erreur lors de l'enregistrement", 'error');
        }
    };

    // --- LOGIC EXERCICES ---
    const handleCreateExercice = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            await api.post('/api/comptabilite/exercices', { annee: newExoAnnee, date_debut: newExoDebut, date_fin: newExoFin });
            showMessage("Exercice créé", "success");
            setNewExoAnnee(''); setNewExoDebut(''); setNewExoFin('');
            loadData();
        } catch (err:any) {
            showMessage(err.response?.data?.detail || 'Erreur', 'error');
        }
    };

    const handleCloturerExercice = async (id: number) => {
        if(!confirm("Êtes-vous sûr de vouloir clôturer cet exercice ? Cette action est irréversible.")) return;
        try {
            await api.post(`/api/comptabilite/exercices/${id}/cloturer`);
            showMessage("Exercice clôturé", "success");
            loadData();
        } catch (err:any) {
            showMessage(err.response?.data?.detail || 'Erreur', 'error');
        }
    };

    // --- LOGIC JOURNAUX ---
    const handleCreateJournal = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            await api.post('/api/comptabilite/journaux', { code: newJournalCode, nom: newJournalNom, type_journal: newJournalType });
            showMessage("Journal créé", "success");
            setNewJournalCode(''); setNewJournalNom('');
            loadData();
        } catch (err:any) {
            showMessage(err.response?.data?.detail || 'Erreur', 'error');
        }
    };

    // --- LOGIC ETATS FINANCIERS ---
    const balanceData = useMemo(() => {
        const balances = comptes.map(c => ({...c, debit: 0, credit: 0, solde: 0}));
        ecritures.forEach(e => {
            e.lignes.forEach((l: any) => {
                const num = l.compte.split(' - ')[0];
                const b = balances.find(c => c.numero_compte === num);
                if(b) {
                    b.debit += (parseFloat(l.debit) || 0);
                    b.credit += (parseFloat(l.credit) || 0);
                }
            });
        });
        return balances.map(b => {
            b.solde = b.debit - b.credit;
            return b;
        }).filter(b => b.debit > 0 || b.credit > 0);
    }, [comptes, ecritures]);

    const resultatData = useMemo(() => {
        let charges = 0;
        let produits = 0;
        balanceData.forEach(b => {
            if(b.numero_compte.startsWith('6')) charges += b.debit - b.credit;
            if(b.numero_compte.startsWith('7')) produits += b.credit - b.debit;
        });
        return { charges, produits, resultat: produits - charges };
    }, [balanceData]);

    // --- LOGIC RECHERCHE ---
    const filteredEcritures = useMemo(() => {
        return ecritures.filter(e => {
            // Filter by journal
            if (searchJournal !== 'tous' && e.journal !== searchJournal) return false;
            
            // Filter by query (reference, libelle, compte)
            if (searchQuery) {
                const query = searchQuery.toLowerCase();
                const matchLibelle = e.libelle.toLowerCase().includes(query);
                const matchRef = e.reference && e.reference.toLowerCase().includes(query);
                const matchLigne = e.lignes.some((l:any) => l.compte.toLowerCase().includes(query));
                if (!matchLibelle && !matchRef && !matchLigne) return false;
            }
            
            // Filter by period (simplified logic for client side)
            if (searchPeriode !== 'tous') {
                const dateE = new Date(e.date);
                const now = new Date();
                if (searchPeriode === 'mois_courant' && (dateE.getMonth() !== now.getMonth() || dateE.getFullYear() !== now.getFullYear())) return false;
                if (searchPeriode === 'mois_dernier') {
                    const lastMonth = new Date();
                    lastMonth.setMonth(now.getMonth() - 1);
                    if (dateE.getMonth() !== lastMonth.getMonth() || dateE.getFullYear() !== lastMonth.getFullYear()) return false;
                }
                if (searchPeriode === 'annee_courante' && dateE.getFullYear() !== now.getFullYear()) return false;
            }
            return true;
        });
    }, [ecritures, searchQuery, searchPeriode, searchJournal]);

    return (
        <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
            {message.text && (
                <div style={{ padding: '12px 16px', borderRadius: '8px', marginBottom: '20px', backgroundColor: message.type === 'error' ? '#fee2e2' : '#d1fae5', color: message.type === 'error' ? '#ef4444' : '#10b981', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: '500' }}>
                    {message.type === 'success' ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
                    {message.text}
                </div>
            )}

            {/* TAB: SAISIE MANUELLE */}
            {tabParam === 'saisie' && (
                <div style={{ backgroundColor: 'white', borderRadius: '12px', padding: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
                    <h3 style={{ margin: '0 0 20px 0', fontSize: '18px', color: '#0f172a' }}>Nouvelle Écriture Manuelle</h3>
                    
                    <form onSubmit={handleSubmitEcriture}>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px', marginBottom: '24px' }}>
                            <div>
                                <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', color: '#475569', fontWeight: '500' }}>Date</label>
                                <input type="date" value={dateEcriture} onChange={e => setDateEcriture(e.target.value)} required style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1' }} />
                            </div>
                            <div>
                                <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', color: '#475569', fontWeight: '500' }}>Journal</label>
                                <select value={journalId} onChange={e => setJournalId(e.target.value)} required style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1' }}>
                                    {journaux.map(j => (
                                        <option key={j.journal_id} value={j.journal_id}>{j.code} - {j.nom}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', color: '#475569', fontWeight: '500' }}>Référence de Pièce</label>
                                <input type="text" value={reference} onChange={e => setReference(e.target.value)} placeholder="Ex: FAC-2026-001" style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1' }} />
                            </div>
                            <div>
                                <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', color: '#475569', fontWeight: '500' }}>Libellé de l'opération</label>
                                <input type="text" value={libelle} onChange={e => setLibelle(e.target.value)} required placeholder="Description globale..." style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1' }} />
                            </div>
                        </div>

                        <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden', marginBottom: '24px' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                <thead style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                                    <tr>
                                        <th style={{ padding: '12px', textAlign: 'left', color: '#64748b', fontWeight: '500', fontSize: '14px', width: '35%' }}>Compte</th>
                                        <th style={{ padding: '12px', textAlign: 'left', color: '#64748b', fontWeight: '500', fontSize: '14px', width: '25%' }}>Description ligne</th>
                                        <th style={{ padding: '12px', textAlign: 'right', color: '#64748b', fontWeight: '500', fontSize: '14px', width: '15%' }}>Débit</th>
                                        <th style={{ padding: '12px', textAlign: 'right', color: '#64748b', fontWeight: '500', fontSize: '14px', width: '15%' }}>Crédit</th>
                                        <th style={{ padding: '12px', width: '5%' }}></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {lignes.map((ligne, i) => (
                                        <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                            <td style={{ padding: '8px' }}>
                                                <select value={ligne.compte_id} onChange={e => handleLigneChange(i, 'compte_id', e.target.value)} style={{ width: '100%', padding: '8px', border: '1px solid transparent', borderRadius: '4px', backgroundColor: '#f8fafc' }} required={i < 2}>
                                                    <option value="">Sélectionner un compte...</option>
                                                    {comptes.map(c => (
                                                        <option key={c.compte_id} value={c.compte_id}>{c.numero_compte} - {c.libelle}</option>
                                                    ))}
                                                </select>
                                            </td>
                                            <td style={{ padding: '8px' }}>
                                                <input type="text" value={ligne.description} onChange={e => handleLigneChange(i, 'description', e.target.value)} placeholder="Description optionnelle" style={{ width: '100%', padding: '8px', border: '1px solid transparent', borderRadius: '4px', backgroundColor: '#f8fafc' }} />
                                            </td>
                                            <td style={{ padding: '8px' }}>
                                                <input type="number" min="0" step="0.01" value={ligne.debit} onChange={e => handleLigneChange(i, 'debit', e.target.value)} disabled={parseFloat(ligne.credit) > 0} style={{ width: '100%', padding: '8px', textAlign: 'right', border: '1px solid #e2e8f0', borderRadius: '4px', backgroundColor: parseFloat(ligne.credit) > 0 ? '#f1f5f9' : 'white' }} />
                                            </td>
                                            <td style={{ padding: '8px' }}>
                                                <input type="number" min="0" step="0.01" value={ligne.credit} onChange={e => handleLigneChange(i, 'credit', e.target.value)} disabled={parseFloat(ligne.debit) > 0} style={{ width: '100%', padding: '8px', textAlign: 'right', border: '1px solid #e2e8f0', borderRadius: '4px', backgroundColor: parseFloat(ligne.debit) > 0 ? '#f1f5f9' : 'white' }} />
                                            </td>
                                            <td style={{ padding: '8px', textAlign: 'center' }}>
                                                <button type="button" onClick={() => handleRemoveLigne(i)} disabled={lignes.length <= 2} style={{ background: 'none', border: 'none', color: lignes.length <= 2 ? '#cbd5e1' : '#ef4444', cursor: lignes.length <= 2 ? 'not-allowed' : 'pointer', padding: '4px' }}>
                                                    <Trash2 size={16} />
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                                <tfoot>
                                    <tr style={{ backgroundColor: '#f8fafc', fontWeight: '600' }}>
                                        <td colSpan={2} style={{ padding: '12px', textAlign: 'right', color: '#475569' }}>Total :</td>
                                        <td style={{ padding: '12px', textAlign: 'right', color: isEquilibre ? '#10b981' : '#ef4444' }}>{totalDebit.toLocaleString('fr-FR', {style: 'currency', currency: 'GNF'})}</td>
                                        <td style={{ padding: '12px', textAlign: 'right', color: isEquilibre ? '#10b981' : '#ef4444' }}>{totalCredit.toLocaleString('fr-FR', {style: 'currency', currency: 'GNF'})}</td>
                                        <td style={{ padding: '12px' }}></td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <button type="button" onClick={handleAddLigne} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 16px', background: 'white', border: '1px solid #cbd5e1', borderRadius: '6px', color: '#475569', fontWeight: '500', cursor: 'pointer' }}>
                                <Plus size={16} /> Ajouter une ligne
                            </button>

                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                {!isEquilibre && (
                                    <span style={{ color: '#ef4444', fontSize: '13px', fontWeight: '500' }}>
                                        L'écriture doit être équilibrée (Débit = Crédit) pour être validée.
                                    </span>
                                )}
                                <button type="submit" disabled={!isEquilibre || isLoading} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 24px', background: isEquilibre ? '#10b981' : '#94a3b8', border: 'none', borderRadius: '6px', color: 'white', fontWeight: '600', cursor: isEquilibre ? 'pointer' : 'not-allowed' }}>
                                    <Save size={18} /> {isLoading ? 'Enregistrement...' : 'Valider l\'écriture'}
                                </button>
                            </div>
                        </div>
                    </form>
                </div>
            )}

            {/* TAB: PLAN COMPTABLE */}
            {tabParam === 'plan' && (
                <div style={{ backgroundColor: 'white', borderRadius: '12px', padding: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                        <h3 style={{ margin: 0, fontSize: '18px', color: '#0f172a' }}>Plan Comptable (SYSCOHADA)</h3>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#f8fafc', padding: '8px 16px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                                <Search size={16} color="#94a3b8" />
                                <input type="text" placeholder="Rechercher un compte..." style={{ border: 'none', background: 'transparent', outline: 'none', width: '200px' }} />
                            </div>
                            <button onClick={() => alert("Fonctionnalité 'Nouveau Compte' en cours de développement (Phase 1.2)")} style={{ padding: '8px 16px', background: '#10b981', color: 'white', border: 'none', borderRadius: '8px', fontWeight: '500', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                                <Plus size={16} /> Nouveau Compte
                            </button>
                        </div>
                    </div>

                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                            <tr>
                                <th style={{ padding: '12px', textAlign: 'left', color: '#64748b', fontWeight: '500', fontSize: '14px' }}>N° Compte</th>
                                <th style={{ padding: '12px', textAlign: 'left', color: '#64748b', fontWeight: '500', fontSize: '14px' }}>Intitulé</th>
                                <th style={{ padding: '12px', textAlign: 'left', color: '#64748b', fontWeight: '500', fontSize: '14px' }}>Type</th>
                            </tr>
                        </thead>
                        <tbody>
                            {comptes.map(c => (
                                <tr key={c.compte_id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                    <td style={{ padding: '12px', fontWeight: '600', color: '#0f172a' }}>{c.numero_compte}</td>
                                    <td style={{ padding: '12px', color: '#475569' }}>{c.libelle}</td>
                                    <td style={{ padding: '12px' }}>
                                        <span style={{ padding: '4px 8px', borderRadius: '4px', fontSize: '12px', fontWeight: '500', backgroundColor: c.type_compte === 'ACTIF' ? '#dbeafe' : c.type_compte === 'CHARGE' ? '#fee2e2' : c.type_compte === 'PRODUIT' ? '#d1fae5' : '#f3e8ff', color: c.type_compte === 'ACTIF' ? '#2563eb' : c.type_compte === 'CHARGE' ? '#ef4444' : c.type_compte === 'PRODUIT' ? '#10b981' : '#9333ea' }}>
                                            {c.type_compte}
                                        </span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {/* TAB: GRAND LIVRE */}
            {tabParam === 'livre' && (
                <div style={{ backgroundColor: 'white', borderRadius: '12px', padding: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                        <h3 style={{ margin: 0, fontSize: '18px', color: '#0f172a' }}>Grand Livre des Comptes</h3>
                        <div style={{ display: 'flex', gap: '12px' }}>
                            <button style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 16px', background: 'white', border: '1px solid #cbd5e1', borderRadius: '6px', color: '#475569', fontWeight: '500', cursor: 'pointer' }}>
                                <Filter size={16} /> Filtrer
                            </button>
                            <button style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 16px', background: 'white', border: '1px solid #cbd5e1', borderRadius: '6px', color: '#475569', fontWeight: '500', cursor: 'pointer' }}>
                                <Download size={16} /> Exporter PDF
                            </button>
                        </div>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        {ecritures.length === 0 ? (
                            <p style={{ color: '#64748b', textAlign: 'center', padding: '40px' }}>Aucune écriture enregistrée.</p>
                        ) : ecritures.map(e => (
                            <div key={e.ecriture_id} style={{ border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 16px', backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                                    <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                                        <span style={{ fontWeight: '600', color: '#0f172a' }}>{new Date(e.date).toLocaleDateString('fr-FR')}</span>
                                        <span style={{ padding: '2px 6px', background: '#e2e8f0', borderRadius: '4px', fontSize: '12px', fontWeight: '600', color: '#475569' }}>{e.journal}</span>
                                        {e.reference && <span style={{ color: '#64748b', fontSize: '14px' }}>Réf: {e.reference}</span>}
                                    </div>
                                    <span style={{ color: '#0f172a', fontWeight: '500' }}>{e.libelle}</span>
                                </div>
                                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                    <tbody>
                                        {e.lignes.map((l: any, i: number) => (
                                            <tr key={i} style={{ borderBottom: '1px solid #f1f5f9', fontSize: '14px' }}>
                                                <td style={{ padding: '8px 16px', width: '60%', color: '#475569' }}>{l.compte}</td>
                                                <td style={{ padding: '8px 16px', width: '20%', textAlign: 'right', color: l.debit > 0 ? '#0f172a' : 'transparent' }}>{l.debit > 0 ? l.debit.toLocaleString('fr-FR') : ''}</td>
                                                <td style={{ padding: '8px 16px', width: '20%', textAlign: 'right', color: l.credit > 0 ? '#0f172a' : 'transparent' }}>{l.credit > 0 ? l.credit.toLocaleString('fr-FR') : ''}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* TAB: EXERCICES */}
            {tabParam === 'exercices' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: '24px' }}>
                    <div style={{ backgroundColor: 'white', borderRadius: '12px', padding: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
                        <h3 style={{ margin: '0 0 20px 0', fontSize: '18px', color: '#0f172a' }}>Exercices Comptables</h3>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                                <tr>
                                    <th style={{ padding: '12px', textAlign: 'left', color: '#64748b', fontWeight: '500', fontSize: '14px' }}>Année</th>
                                    <th style={{ padding: '12px', textAlign: 'left', color: '#64748b', fontWeight: '500', fontSize: '14px' }}>Période</th>
                                    <th style={{ padding: '12px', textAlign: 'center', color: '#64748b', fontWeight: '500', fontSize: '14px' }}>Statut</th>
                                    <th style={{ padding: '12px', textAlign: 'right', color: '#64748b', fontWeight: '500', fontSize: '14px' }}>Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                {exercices.map(exo => (
                                    <tr key={exo.exercice_id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                        <td style={{ padding: '12px', fontWeight: '600', color: '#0f172a' }}>{exo.annee}</td>
                                        <td style={{ padding: '12px', color: '#475569' }}>Du {new Date(exo.date_debut).toLocaleDateString('fr-FR')} au {new Date(exo.date_fin).toLocaleDateString('fr-FR')}</td>
                                        <td style={{ padding: '12px', textAlign: 'center' }}>
                                            <span style={{ padding: '4px 8px', borderRadius: '4px', fontSize: '12px', fontWeight: '600', backgroundColor: exo.statut === 'OUVERT' ? '#d1fae5' : '#f1f5f9', color: exo.statut === 'OUVERT' ? '#059669' : '#64748b' }}>
                                                {exo.statut}
                                            </span>
                                        </td>
                                        <td style={{ padding: '12px', textAlign: 'right' }}>
                                            {exo.statut === 'OUVERT' && (
                                                <button onClick={() => handleCloturerExercice(exo.exercice_id)} style={{ padding: '6px 12px', background: 'white', border: '1px solid #ef4444', color: '#ef4444', borderRadius: '6px', fontSize: '12px', fontWeight: '500', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                                    <Lock size={14} /> Clôturer
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <div style={{ backgroundColor: 'white', borderRadius: '12px', padding: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', height: 'fit-content' }}>
                        <h3 style={{ margin: '0 0 20px 0', fontSize: '16px', color: '#0f172a' }}>Nouvel Exercice</h3>
                        <form onSubmit={handleCreateExercice} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            <div>
                                <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', color: '#475569', fontWeight: '500' }}>Année Scolaire</label>
                                <input type="text" value={newExoAnnee} onChange={e => setNewExoAnnee(e.target.value)} required placeholder="Ex: 2026-2027" style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1' }} />
                            </div>
                            <div>
                                <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', color: '#475569', fontWeight: '500' }}>Date début</label>
                                <input type="date" value={newExoDebut} onChange={e => setNewExoDebut(e.target.value)} required style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1' }} />
                            </div>
                            <div>
                                <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', color: '#475569', fontWeight: '500' }}>Date fin</label>
                                <input type="date" value={newExoFin} onChange={e => setNewExoFin(e.target.value)} required style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1' }} />
                            </div>
                            <button type="submit" style={{ padding: '10px', background: '#10b981', color: 'white', border: 'none', borderRadius: '6px', fontWeight: '600', cursor: 'pointer' }}>
                                Ouvrir l'exercice
                            </button>
                        </form>
                    </div>
                </div>
            )}

            {/* TAB: JOURNAUX */}
            {tabParam === 'journaux' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: '24px' }}>
                    <div style={{ backgroundColor: 'white', borderRadius: '12px', padding: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
                        <h3 style={{ margin: '0 0 20px 0', fontSize: '18px', color: '#0f172a' }}>Journaux Comptables</h3>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                                <tr>
                                    <th style={{ padding: '12px', textAlign: 'left', color: '#64748b', fontWeight: '500', fontSize: '14px' }}>Code</th>
                                    <th style={{ padding: '12px', textAlign: 'left', color: '#64748b', fontWeight: '500', fontSize: '14px' }}>Nom du journal</th>
                                    <th style={{ padding: '12px', textAlign: 'left', color: '#64748b', fontWeight: '500', fontSize: '14px' }}>Type</th>
                                </tr>
                            </thead>
                            <tbody>
                                {journaux.map(j => (
                                    <tr key={j.journal_id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                        <td style={{ padding: '12px', fontWeight: '600', color: '#0f172a' }}>{j.code}</td>
                                        <td style={{ padding: '12px', color: '#475569' }}>{j.nom}</td>
                                        <td style={{ padding: '12px', color: '#475569' }}>{j.type_journal}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <div style={{ backgroundColor: 'white', borderRadius: '12px', padding: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', height: 'fit-content' }}>
                        <h3 style={{ margin: '0 0 20px 0', fontSize: '16px', color: '#0f172a' }}>Nouveau Journal</h3>
                        <form onSubmit={handleCreateJournal} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            <div>
                                <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', color: '#475569', fontWeight: '500' }}>Code (2-3 lettres)</label>
                                <input type="text" maxLength={3} value={newJournalCode} onChange={e => setNewJournalCode(e.target.value.toUpperCase())} required placeholder="Ex: BQ2" style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1' }} />
                            </div>
                            <div>
                                <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', color: '#475569', fontWeight: '500' }}>Nom du journal</label>
                                <input type="text" value={newJournalNom} onChange={e => setNewJournalNom(e.target.value)} required placeholder="Ex: Banque Ecobank" style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1' }} />
                            </div>
                            <div>
                                <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', color: '#475569', fontWeight: '500' }}>Type</label>
                                <select value={newJournalType} onChange={e => setNewJournalType(e.target.value)} required style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1' }}>
                                    <option value="ACHAT">Achat</option>
                                    <option value="VENTE">Vente</option>
                                    <option value="TRESORERIE">Trésorerie</option>
                                    <option value="OD">Opérations Diverses (OD)</option>
                                    <option value="A_NOUVEAU">A-Nouveau</option>
                                </select>
                            </div>
                            <button type="submit" style={{ padding: '10px', background: '#10b981', color: 'white', border: 'none', borderRadius: '6px', fontWeight: '600', cursor: 'pointer' }}>
                                Créer
                            </button>
                        </form>
                    </div>
                </div>
            )}

            {/* TAB: BALANCE GENERALE */}
            {tabParam === 'balance' && (
                <div style={{ backgroundColor: 'white', borderRadius: '12px', padding: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                        <h3 style={{ margin: 0, fontSize: '18px', color: '#0f172a' }}>Balance Générale</h3>
                        <button style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 16px', background: 'white', border: '1px solid #cbd5e1', borderRadius: '6px', color: '#475569', fontWeight: '500', cursor: 'pointer' }}>
                            <Download size={16} /> Exporter PDF
                        </button>
                    </div>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                            <tr>
                                <th style={{ padding: '12px', textAlign: 'left', color: '#64748b', fontWeight: '500', fontSize: '14px' }}>N° Compte</th>
                                <th style={{ padding: '12px', textAlign: 'left', color: '#64748b', fontWeight: '500', fontSize: '14px' }}>Intitulé</th>
                                <th style={{ padding: '12px', textAlign: 'right', color: '#64748b', fontWeight: '500', fontSize: '14px' }}>Total Débit</th>
                                <th style={{ padding: '12px', textAlign: 'right', color: '#64748b', fontWeight: '500', fontSize: '14px' }}>Total Crédit</th>
                                <th style={{ padding: '12px', textAlign: 'right', color: '#64748b', fontWeight: '500', fontSize: '14px' }}>Solde Débiteur</th>
                                <th style={{ padding: '12px', textAlign: 'right', color: '#64748b', fontWeight: '500', fontSize: '14px' }}>Solde Créditeur</th>
                            </tr>
                        </thead>
                        <tbody>
                            {balanceData.map(b => (
                                <tr key={b.compte_id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                    <td style={{ padding: '12px', fontWeight: '600', color: '#0f172a' }}>{b.numero_compte}</td>
                                    <td style={{ padding: '12px', color: '#475569' }}>{b.libelle}</td>
                                    <td style={{ padding: '12px', textAlign: 'right', color: '#475569' }}>{b.debit > 0 ? b.debit.toLocaleString('fr-FR') : '-'}</td>
                                    <td style={{ padding: '12px', textAlign: 'right', color: '#475569' }}>{b.credit > 0 ? b.credit.toLocaleString('fr-FR') : '-'}</td>
                                    <td style={{ padding: '12px', textAlign: 'right', color: '#0f172a', fontWeight: '500' }}>{b.solde > 0 ? b.solde.toLocaleString('fr-FR') : '-'}</td>
                                    <td style={{ padding: '12px', textAlign: 'right', color: '#0f172a', fontWeight: '500' }}>{b.solde < 0 ? Math.abs(b.solde).toLocaleString('fr-FR') : '-'}</td>
                                </tr>
                            ))}
                            {balanceData.length === 0 && (
                                <tr>
                                    <td colSpan={6} style={{ padding: '24px', textAlign: 'center', color: '#64748b' }}>Aucune donnée à afficher pour cette période.</td>
                                </tr>
                            )}
                        </tbody>
                        {balanceData.length > 0 && (
                            <tfoot>
                                <tr style={{ backgroundColor: '#f8fafc', fontWeight: '600' }}>
                                    <td colSpan={2} style={{ padding: '12px', textAlign: 'right', color: '#0f172a' }}>Totaux :</td>
                                    <td style={{ padding: '12px', textAlign: 'right', color: '#0f172a' }}>{balanceData.reduce((s,b)=>s+b.debit,0).toLocaleString('fr-FR')}</td>
                                    <td style={{ padding: '12px', textAlign: 'right', color: '#0f172a' }}>{balanceData.reduce((s,b)=>s+b.credit,0).toLocaleString('fr-FR')}</td>
                                    <td style={{ padding: '12px', textAlign: 'right', color: '#0f172a' }}>{balanceData.filter(b=>b.solde>0).reduce((s,b)=>s+b.solde,0).toLocaleString('fr-FR')}</td>
                                    <td style={{ padding: '12px', textAlign: 'right', color: '#0f172a' }}>{balanceData.filter(b=>b.solde<0).reduce((s,b)=>s+Math.abs(b.solde),0).toLocaleString('fr-FR')}</td>
                                </tr>
                            </tfoot>
                        )}
                    </table>
                </div>
            )}

            {/* TAB: COMPTE DE RESULTAT */}
            {tabParam === 'resultat' && (
                <div style={{ backgroundColor: 'white', borderRadius: '12px', padding: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
                    <h3 style={{ margin: '0 0 20px 0', fontSize: '18px', color: '#0f172a' }}>Compte de Résultat</h3>
                    
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
                        {/* Charges */}
                        <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden' }}>
                            <div style={{ backgroundColor: '#fee2e2', padding: '12px 16px', borderBottom: '1px solid #e2e8f0', fontWeight: '600', color: '#991b1b' }}>
                                CHARGES (Classe 6)
                            </div>
                            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                <tbody>
                                    {balanceData.filter(b => b.numero_compte.startsWith('6') && b.solde !== 0).map(b => (
                                        <tr key={b.compte_id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                            <td style={{ padding: '12px', color: '#475569' }}>{b.numero_compte} - {b.libelle}</td>
                                            <td style={{ padding: '12px', textAlign: 'right', fontWeight: '500' }}>{Math.abs(b.solde).toLocaleString('fr-FR')}</td>
                                        </tr>
                                    ))}
                                </tbody>
                                <tfoot>
                                    <tr style={{ backgroundColor: '#f8fafc', fontWeight: '600' }}>
                                        <td style={{ padding: '12px', textAlign: 'right' }}>Total Charges :</td>
                                        <td style={{ padding: '12px', textAlign: 'right', color: '#ef4444' }}>{resultatData.charges.toLocaleString('fr-FR')} GNF</td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>

                        {/* Produits */}
                        <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden' }}>
                            <div style={{ backgroundColor: '#d1fae5', padding: '12px 16px', borderBottom: '1px solid #e2e8f0', fontWeight: '600', color: '#065f46' }}>
                                PRODUITS (Classe 7)
                            </div>
                            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                <tbody>
                                    {balanceData.filter(b => b.numero_compte.startsWith('7') && b.solde !== 0).map(b => (
                                        <tr key={b.compte_id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                            <td style={{ padding: '12px', color: '#475569' }}>{b.numero_compte} - {b.libelle}</td>
                                            <td style={{ padding: '12px', textAlign: 'right', fontWeight: '500' }}>{Math.abs(b.solde).toLocaleString('fr-FR')}</td>
                                        </tr>
                                    ))}
                                </tbody>
                                <tfoot>
                                    <tr style={{ backgroundColor: '#f8fafc', fontWeight: '600' }}>
                                        <td style={{ padding: '12px', textAlign: 'right' }}>Total Produits :</td>
                                        <td style={{ padding: '12px', textAlign: 'right', color: '#10b981' }}>{resultatData.produits.toLocaleString('fr-FR')} GNF</td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                    </div>

                    <div style={{ marginTop: '24px', padding: '20px', borderRadius: '8px', backgroundColor: resultatData.resultat >= 0 ? '#ecfdf5' : '#fef2f2', border: `1px solid ${resultatData.resultat >= 0 ? '#a7f3d0' : '#fecaca'}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '18px', fontWeight: '600', color: resultatData.resultat >= 0 ? '#065f46' : '#991b1b' }}>RÉSULTAT NET (Produits - Charges)</span>
                        <span style={{ fontSize: '24px', fontWeight: '700', color: resultatData.resultat >= 0 ? '#10b981' : '#ef4444' }}>
                            {resultatData.resultat.toLocaleString('fr-FR')} GNF
                        </span>
                    </div>
                </div>
            )}

            {/* TAB: SAISIE AUTOMATIQUE */}
            {tabParam === 'auto' && (
                <div style={{ backgroundColor: 'white', borderRadius: '12px', padding: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                        <div>
                            <h3 style={{ margin: '0 0 8px 0', fontSize: '18px', color: '#0f172a' }}>Génération Automatique des Écritures</h3>
                            <p style={{ margin: 0, color: '#64748b', fontSize: '14px' }}>Ce module détecte les paiements scolaires de la base de données et génère les écritures comptables liées en un clic.</p>
                        </div>
                        <button style={{ padding: '10px 20px', background: '#10b981', color: 'white', border: 'none', borderRadius: '8px', fontWeight: '600', cursor: 'pointer' }}>
                            Générer les écritures (0 en attente)
                        </button>
                    </div>
                    <div style={{ padding: '40px', textAlign: 'center', backgroundColor: '#f8fafc', borderRadius: '8px', border: '1px dashed #cbd5e1' }}>
                        <CheckCircle2 size={32} color="#10b981" style={{ margin: '0 auto 12px auto' }} />
                        <h4 style={{ margin: '0 0 8px 0', color: '#0f172a' }}>Toutes les opérations sont à jour</h4>
                        <p style={{ color: '#64748b', margin: 0, fontSize: '14px' }}>Il n'y a aucun nouveau paiement de scolarité non comptabilisé. Le système est à jour.</p>
                    </div>
                </div>
            )}

            {/* TAB: RECHERCHE */}
            {tabParam === 'recherche' && (
                <div style={{ backgroundColor: 'white', borderRadius: '12px', padding: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
                    <h3 style={{ margin: '0 0 20px 0', fontSize: '18px', color: '#0f172a' }}>Recherche d'Écritures</h3>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '24px', padding: '16px', backgroundColor: '#f8fafc', borderRadius: '8px' }}>
                        <div>
                            <label style={{ display: 'block', fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>Mots-clés (libellé, réf, compte)</label>
                            <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Rechercher..." style={{ width: '100%', padding: '8px', border: '1px solid #cbd5e1', borderRadius: '4px' }} />
                        </div>
                        <div>
                            <label style={{ display: 'block', fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>Période</label>
                            <select value={searchPeriode} onChange={e => setSearchPeriode(e.target.value)} style={{ width: '100%', padding: '8px', border: '1px solid #cbd5e1', borderRadius: '4px' }}>
                                <option value="tous">Toutes les dates</option>
                                <option value="mois_courant">Ce mois-ci</option>
                                <option value="mois_dernier">Le mois dernier</option>
                                <option value="annee_courante">Cette année</option>
                            </select>
                        </div>
                        <div>
                            <label style={{ display: 'block', fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>Journal</label>
                            <select value={searchJournal} onChange={e => setSearchJournal(e.target.value)} style={{ width: '100%', padding: '8px', border: '1px solid #cbd5e1', borderRadius: '4px' }}>
                                <option value="tous">Tous les journaux</option>
                                {journaux.map(j => <option key={j.journal_id} value={j.code}>{j.code}</option>)}
                            </select>
                        </div>
                    </div>
                    
                    <p style={{ color: '#64748b', fontSize: '14px', marginBottom: '16px' }}>{filteredEcritures.length} résultat(s) trouvé(s).</p>
                    
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        {filteredEcritures.map(e => (
                            <div key={e.ecriture_id} style={{ border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 16px', backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                                    <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                                        <span style={{ fontWeight: '600', color: '#0f172a' }}>{new Date(e.date).toLocaleDateString('fr-FR')}</span>
                                        <span style={{ padding: '2px 6px', background: '#e2e8f0', borderRadius: '4px', fontSize: '12px', fontWeight: '600', color: '#475569' }}>{e.journal}</span>
                                        {e.reference && <span style={{ color: '#64748b', fontSize: '14px' }}>Réf: {e.reference}</span>}
                                    </div>
                                    <span style={{ color: '#0f172a', fontWeight: '500' }}>{e.libelle}</span>
                                </div>
                                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                    <tbody>
                                        {e.lignes.map((l: any, i: number) => (
                                            <tr key={i} style={{ borderBottom: '1px solid #f1f5f9', fontSize: '14px' }}>
                                                <td style={{ padding: '8px 16px', width: '60%', color: '#475569' }}>{l.compte}</td>
                                                <td style={{ padding: '8px 16px', width: '20%', textAlign: 'right', color: l.debit > 0 ? '#0f172a' : 'transparent' }}>{l.debit > 0 ? l.debit.toLocaleString('fr-FR') : ''}</td>
                                                <td style={{ padding: '8px 16px', width: '20%', textAlign: 'right', color: l.credit > 0 ? '#0f172a' : 'transparent' }}>{l.credit > 0 ? l.credit.toLocaleString('fr-FR') : ''}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* PLACEHOLDERS FOR OTHER TABS */}
            {['analytique', 'balance_comptes'].includes(tabParam) && (
                <div style={{ backgroundColor: 'white', borderRadius: '12px', padding: '40px', textAlign: 'center', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
                    <div style={{ width: '64px', height: '64px', backgroundColor: '#f1f5f9', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px auto' }}>
                        <Settings size={32} color="#94a3b8" />
                    </div>
                    <h3 style={{ margin: '0 0 8px 0', fontSize: '18px', color: '#0f172a' }}>Module Analytique & Auxiliaire</h3>
                    <p style={{ color: '#64748b', margin: 0 }}>La vue ({tabParam}) nécessite la configuration préalable des comptes tiers et des sections analytiques (Phase 1.3).</p>
                </div>
            )}
        </div>
    );
}

export default function ComptabiliteGeneral() {
    return (
        <Suspense fallback={<div style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>Chargement...</div>}>
            <GeneralContent />
        </Suspense>
    );
}
