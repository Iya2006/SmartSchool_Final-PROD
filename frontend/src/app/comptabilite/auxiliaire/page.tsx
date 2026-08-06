'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Search, UserPlus, FileText, ArrowRightLeft, ArrowUpRight, ArrowDownLeft, Calendar, ShieldCheck, User } from 'lucide-react';
import api from '@/lib/api';
import Pagination from '@/components/Pagination';

// Reusable styles matching the main theme
const CARD = { backgroundColor: 'white', borderRadius: '12px', padding: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' } as const;
const TH = { padding: '12px', textAlign: 'left' as const, color: '#64748b', fontWeight: '500' as const, fontSize: '14px' } as const;
const TH_RIGHT = { ...TH, textAlign: 'right' as const } as const;
const INPUT = { padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px', outline: 'none' } as const;
const BTN_GREEN = { padding: '10px 20px', background: '#10b981', color: 'white', border: 'none', borderRadius: '8px', fontWeight: '600', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '8px', fontSize: '14px' } as const;
const BTN_OUTLINE = { display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 16px', background: 'white', border: '1px solid #cbd5e1', borderRadius: '6px', color: '#475569', fontWeight: '500', cursor: 'pointer', fontSize: '14px' } as const;

export default function ComptabiliteAuxiliaire() {
    const searchParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
    const tabParam = searchParams?.get('tab') || 'parents';

    const [subTab, setSubTab] = useState<'parents' | 'fournisseurs'>('parents');

    useEffect(() => {
        if (tabParam === 'parents' || tabParam === 'fournisseurs') {
            setSubTab(tabParam);
        }
    }, [tabParam]);

    const [isLoading, setIsLoading] = useState(false);
    const [message, setMessage] = useState({ text: '', type: '' });

    // Data lists
    const [parentsList, setParentsList] = useState<any[]>([]);
    const [fournisseursList, setFournisseursList] = useState<any[]>([]);

    // Search filters
    const [searchParents, setSearchParents] = useState('');
    const [searchFournisseurs, setSearchFournisseurs] = useState('');

    // Selected Tier for Fiche de Compte (Ledger Detail)
    const [selectedEleve, setSelectedEleve] = useState<any>(null);
    const [eleveMouvements, setEleveMouvements] = useState<any>(null);

    const [selectedFournisseur, setSelectedFournisseur] = useState<any>(null);
    const [fournisseurMouvements, setFournisseurMouvements] = useState<any>(null);

    // Form to create Fournisseur
    const [showNewFournisseur, setShowNewFournisseur] = useState(false);
    const [newFournNom, setNewFournNom] = useState('');
    const [newFournCode, setNewFournCode] = useState('');
    const [newFournTel, setNewFournTel] = useState('');
    const [newFournEmail, setNewFournEmail] = useState('');
    const [newFournAdr, setNewFournAdr] = useState('');

    // Ajouter un frais individuellement à un élève (ex: adhésion tardive à la
    // cantine, frais de réinscription...) — sans imposer ce frais à toute sa
    // classe, contrairement à la génération de factures groupée de la page Frais.
    const [typesFraisOptions, setTypesFraisOptions] = useState<any[]>([]);
    const [showAjouterFrais, setShowAjouterFrais] = useState(false);
    const [ajouterFraisTypeId, setAjouterFraisTypeId] = useState('');
    const [ajouterFraisMontant, setAjouterFraisMontant] = useState('');
    const [ajouterFraisSaving, setAjouterFraisSaving] = useState(false);

    useEffect(() => {
        api.get('/api/finance/types-frais').then(res => setTypesFraisOptions(res.data || [])).catch(() => {});
    }, []);

    // Pagination
    const pageSize = 25;
    const [pageParents, setPageParents] = useState(1);
    const [totalParents, setTotalParents] = useState(0);
    const [pageFournisseurs, setPageFournisseurs] = useState(1);
    const [totalFournisseurs, setTotalFournisseurs] = useState(0);

    const showMessage = (text: string, type: 'success' | 'error') => {
        setMessage({ text, type });
        setTimeout(() => setMessage({ text: '', type: '' }), 4000);
    };

    const loadParents = useCallback(async (page: number = pageParents) => {
        setIsLoading(true);
        try {
            const skip = (page - 1) * pageSize;
            const params = new URLSearchParams({ skip: String(skip), limit: String(pageSize) });
            if (searchParents) params.set('search', searchParents);
            const res = await api.get(`/api/comptabilite/auxiliaire/parents-eleves?${params.toString()}`);
            setParentsList(res.data);
            const totalCount = res.headers?.['x-total-count'];
            setTotalParents(totalCount !== undefined ? Number(totalCount) : res.data.length);
        } catch (error) {
            console.error("Erreur chargement comptes parents:", error);
        } finally {
            setIsLoading(false);
        }
    }, [pageParents, searchParents]);

    const loadFournisseurs = useCallback(async (page: number = pageFournisseurs) => {
        setIsLoading(true);
        try {
            const skip = (page - 1) * pageSize;
            const params = new URLSearchParams({ skip: String(skip), limit: String(pageSize) });
            if (searchFournisseurs) params.set('search', searchFournisseurs);
            const res = await api.get(`/api/comptabilite/auxiliaire/fournisseurs?${params.toString()}`);
            setFournisseursList(res.data);
            const totalCount = res.headers?.['x-total-count'];
            setTotalFournisseurs(totalCount !== undefined ? Number(totalCount) : res.data.length);
        } catch (error) {
            console.error("Erreur chargement fournisseurs:", error);
        } finally {
            setIsLoading(false);
        }
    }, [pageFournisseurs, searchFournisseurs]);

    useEffect(() => {
        loadParents(pageParents);
    }, [pageParents, searchParents]);

    useEffect(() => {
        loadFournisseurs(pageFournisseurs);
    }, [pageFournisseurs, searchFournisseurs]);

    // Réinitialiser la pagination quand la recherche change, pour éviter une page vide
    useEffect(() => { setPageParents(1); }, [searchParents]);
    useEffect(() => { setPageFournisseurs(1); }, [searchFournisseurs]);

    // Load detailed ledger for student
    const handleSelectEleve = async (eleve: any) => {
        setSelectedEleve(eleve);
        setSelectedFournisseur(null);
        setEleveMouvements(null);
        try {
            const res = await api.get(`/api/comptabilite/auxiliaire/parents-eleves/${eleve.eleve_id}/compte`);
            setEleveMouvements(res.data);
        } catch (error) {
            console.error("Erreur lors de la récupération de l'historique élève:", error);
            setSelectedEleve(null);
            showMessage("Impossible de charger la fiche de compte de cet élève.", "error");
        }
    };

    // Facturer un frais individuellement à l'élève sélectionné (ex: adhésion
    // tardive à un service facultatif, frais de réinscription ponctuel...),
    // sans passer par la génération groupée pour toute une classe.
    const handleAjouterFrais = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedEleve || !eleveMouvements?.eleve?.inscription_id) {
            showMessage("Impossible de déterminer l'inscription active de cet élève.", "error");
            return;
        }
        const montant = parseFloat(ajouterFraisMontant);
        if (!ajouterFraisTypeId || !montant || montant <= 0) {
            showMessage("Sélectionnez un type de frais et un montant valide.", "error");
            return;
        }
        setAjouterFraisSaving(true);
        try {
            await api.post('/api/finance/factures', {
                inscription_id: eleveMouvements.eleve.inscription_id,
                type_frais_id: parseInt(ajouterFraisTypeId),
                montant_total: montant,
                echeances: [{ libelle: 'Paiement unique', montant_attendu: montant, date_limite: new Date().toISOString().split('T')[0] }],
            });
            showMessage('Frais facturé avec succès à cet élève.', 'success');
            setShowAjouterFrais(false);
            setAjouterFraisTypeId('');
            setAjouterFraisMontant('');
            await handleSelectEleve(selectedEleve);
        } catch (err: any) {
            showMessage(err.response?.data?.detail || 'Erreur lors de la facturation', 'error');
        } finally {
            setAjouterFraisSaving(false);
        }
    };

    // Load detailed ledger for supplier
    const handleSelectFournisseur = async (fourn: any) => {
        setSelectedFournisseur(fourn);
        setSelectedEleve(null);
        setFournisseurMouvements(null);
        try {
            const res = await api.get(`/api/comptabilite/auxiliaire/fournisseurs/${fourn.fournisseur_id}/compte`);
            setFournisseurMouvements(res.data);
        } catch (error) {
            console.error("Erreur lors de la récupération de l'historique fournisseur:", error);
            setSelectedFournisseur(null);
            showMessage("Impossible de charger la fiche de compte de ce fournisseur.", "error");
        }
    };

    // Create supplier
    const handleCreateFournisseur = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const payload = {
                nom: newFournNom,
                code: newFournCode.toUpperCase(),
                telephone: newFournTel || null,
                email: newFournEmail || null,
                adresse: newFournAdr || null
            };
            await api.post('/api/comptabilite/auxiliaire/fournisseurs', payload);
            showMessage("Fournisseur créé avec succès !", "success");
            setNewFournNom(''); setNewFournCode(''); setNewFournTel(''); setNewFournEmail(''); setNewFournAdr('');
            setShowNewFournisseur(false);
            loadFournisseurs();
        } catch (err: any) {
            showMessage(err.response?.data?.detail || "Erreur de création", "error");
        }
    };

    const fmt = (n: number | null | undefined) => (n || 0).toLocaleString('fr-FR');
    const fmtGNF = (n: number) => `${fmt(n)} GNF`;

    return (
        <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
            {/* Header Area */}
            <div style={{ ...CARD, marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                    <h2 style={{ margin: '0 0 6px 0', fontSize: '20px', color: '#0f172a', fontWeight: '700' }}>
                        Suivi des Comptes Parents & Fournisseurs
                    </h2>
                    <p style={{ margin: 0, fontSize: '13px', color: '#64748b' }}>
                        Visualisez les fiches de compte individuelles et suivez les règlements.
                    </p>
                </div>
                
                {/* Tab selectors */}
                <div style={{ display: 'flex', gap: '8px', backgroundColor: '#f1f5f9', padding: '4px', borderRadius: '8px' }}>
                    <button
                        onClick={() => { setSubTab('parents'); setSelectedEleve(null); setSelectedFournisseur(null); }}
                        style={{
                            padding: '8px 16px', borderRadius: '6px', border: 'none', fontWeight: '600', fontSize: '13px', cursor: 'pointer',
                            backgroundColor: subTab === 'parents' ? 'white' : 'transparent',
                            color: subTab === 'parents' ? '#0f172a' : '#64748b',
                            boxShadow: subTab === 'parents' ? '0 1px 2px rgba(0,0,0,0.05)' : 'none'
                        }}
                    >
                        Parents & Élèves ({totalParents})
                    </button>
                    <button
                        onClick={() => { setSubTab('fournisseurs'); setSelectedFournisseur(null); setSelectedEleve(null); }}
                        style={{
                            padding: '8px 16px', borderRadius: '6px', border: 'none', fontWeight: '600', fontSize: '13px', cursor: 'pointer',
                            backgroundColor: subTab === 'fournisseurs' ? 'white' : 'transparent',
                            color: subTab === 'fournisseurs' ? '#0f172a' : '#64748b',
                            boxShadow: subTab === 'fournisseurs' ? '0 1px 2px rgba(0,0,0,0.05)' : 'none'
                        }}
                    >
                        Fournisseurs ({totalFournisseurs})
                    </button>
                </div>
            </div>

            {message.text && (
                <div style={{ padding: '12px 16px', borderRadius: '8px', marginBottom: '20px', backgroundColor: message.type === 'error' ? '#fee2e2' : '#d1fae5', color: message.type === 'error' ? '#ef4444' : '#10b981', fontWeight: '600', fontSize: '14px' }}>
                    {message.text}
                </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: (selectedEleve || selectedFournisseur) ? '1fr 1fr' : '1fr', gap: '24px', transition: 'all 0.3s' }}>
                
                {/* LEFT COLUMN: LISTS */}
                <div style={CARD}>
                    {/* SUBTAB PARENTS / ELEVES */}
                    {subTab === 'parents' && (
                        <div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                                <h3 style={{ margin: 0, fontSize: '16px', color: '#0f172a' }}>Comptes Individuels des Parents & Élèves</h3>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#f8fafc', padding: '6px 12px', borderRadius: '6px', border: '1px solid #cbd5e1' }}>
                                    <Search size={16} color="#94a3b8" />
                                    <input 
                                        type="text" 
                                        placeholder="Rechercher nom, classe, matricule..." 
                                        value={searchParents} 
                                        onChange={e => setSearchParents(e.target.value)} 
                                        style={{ border: 'none', background: 'transparent', outline: 'none', fontSize: '13px', width: '220px' }} 
                                    />
                                </div>
                            </div>

                            <div style={{ overflowX: 'auto' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                    <thead style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #cbd5e1' }}>
                                        <tr>
                                            <th style={TH}>Élève</th>
                                            <th style={TH}>Classe</th>
                                            <th style={TH_RIGHT}>Facturé</th>
                                            <th style={TH_RIGHT}>Réglé</th>
                                            <th style={TH_RIGHT}>Solde (À payer)</th>
                                            <th style={{ ...TH, width: '40px' }}></th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {parentsList.map(p => {
                                            const isSelected = selectedEleve?.eleve_id === p.eleve_id;
                                            return (
                                                <tr key={p.eleve_id} style={{ borderBottom: '1px solid #f1f5f9', cursor: 'pointer', backgroundColor: isSelected ? '#ecfdf5' : 'white' }} onClick={() => handleSelectEleve(p)}>
                                                    <td style={{ padding: '12px' }}>
                                                        <div style={{ fontWeight: '600', color: '#0f172a', fontSize: '14px' }}>{p.prenom} {p.nom}</div>
                                                        <div style={{ fontSize: '11px', color: '#64748b' }}>Matricule: {p.matricule}</div>
                                                    </td>
                                                    <td style={{ padding: '12px', color: '#475569', fontSize: '14px' }}>{p.classe}</td>
                                                    <td style={{ padding: '12px', textAlign: 'right', color: '#475569', fontFamily: 'monospace' }}>{fmt(p.total_debit)}</td>
                                                    <td style={{ padding: '12px', textAlign: 'right', color: '#10b981', fontFamily: 'monospace' }}>{fmt(p.total_credit)}</td>
                                                    <td style={{ padding: '12px', textAlign: 'right', fontWeight: '700', color: p.solde > 0 ? '#ef4444' : '#10b981', fontFamily: 'monospace' }}>
                                                        {p.solde > 0 ? `${fmt(p.solde)} GNF` : p.solde < 0 ? `Trop-perçu: ${fmt(Math.abs(p.solde))}` : 'Soldé'}
                                                    </td>
                                                    <td style={{ padding: '12px', textAlign: 'center' }}>
                                                        <FileText size={16} color={isSelected ? '#10b981' : '#94a3b8'} />
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                        {parentsList.length === 0 && (
                                            <tr><td colSpan={6} style={{ padding: '30px', textAlign: 'center', color: '#64748b', fontSize: '14px' }}>Aucun élève trouvé ou mouvementé.</td></tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                            <Pagination page={pageParents} pageSize={pageSize} total={totalParents} onPageChange={setPageParents} />
                        </div>
                    )}

                    {/* SUBTAB FOURNISSEURS */}
                    {subTab === 'fournisseurs' && (
                        <div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                                <h3 style={{ margin: 0, fontSize: '16px', color: '#0f172a' }}>Fiches des Fournisseurs</h3>
                                <div style={{ display: 'flex', gap: '8px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#f8fafc', padding: '6px 12px', borderRadius: '6px', border: '1px solid #cbd5e1' }}>
                                        <Search size={16} color="#94a3b8" />
                                        <input 
                                            type="text" 
                                            placeholder="Rechercher fournisseur..." 
                                            value={searchFournisseurs} 
                                            onChange={e => setSearchFournisseurs(e.target.value)} 
                                            style={{ border: 'none', background: 'transparent', outline: 'none', fontSize: '13px', width: '180px' }} 
                                        />
                                    </div>
                                    <button onClick={() => setShowNewFournisseur(!showNewFournisseur)} style={{ ...BTN_GREEN, padding: '8px 12px', fontSize: '13px' }}>
                                        <UserPlus size={14} /> Nouveau
                                    </button>
                                </div>
                            </div>

                            {/* Create vendor form */}
                            {showNewFournisseur && (
                                <form onSubmit={handleCreateFournisseur} style={{ backgroundColor: '#f8fafc', padding: '16px', borderRadius: '8px', border: '1px solid #cbd5e1', marginBottom: '20px' }}>
                                    <h4 style={{ margin: '0 0 12px 0', fontSize: '14px', color: '#0f172a' }}>Ajouter un Nouveau Fournisseur</h4>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                                        <div>
                                            <label style={{ display: 'block', fontSize: '12px', color: '#475569', marginBottom: '4px' }}>Nom / Raison Sociale</label>
                                            <input type="text" value={newFournNom} onChange={e => setNewFournNom(e.target.value)} required placeholder="Ex: Librairie Nationale" style={{ ...INPUT, width: '100%' }} />
                                        </div>
                                        <div>
                                            <label style={{ display: 'block', fontSize: '12px', color: '#475569', marginBottom: '4px' }}>Code Unique</label>
                                            <input type="text" value={newFournCode} onChange={e => setNewFournCode(e.target.value)} required placeholder="Ex: LIBGUINEE" style={{ ...INPUT, width: '100%' }} />
                                        </div>
                                        <div>
                                            <label style={{ display: 'block', fontSize: '12px', color: '#475569', marginBottom: '4px' }}>Téléphone</label>
                                            <input type="text" value={newFournTel} onChange={e => setNewFournTel(e.target.value)} placeholder="Ex: 622 00 00 00" style={{ ...INPUT, width: '100%' }} />
                                        </div>
                                        <div>
                                            <label style={{ display: 'block', fontSize: '12px', color: '#475569', marginBottom: '4px' }}>Email</label>
                                            <input type="email" value={newFournEmail} onChange={e => setNewFournEmail(e.target.value)} placeholder="Ex: contact@librairie.gn" style={{ ...INPUT, width: '100%' }} />
                                        </div>
                                    </div>
                                    <div style={{ marginBottom: '12px' }}>
                                        <label style={{ display: 'block', fontSize: '12px', color: '#475569', marginBottom: '4px' }}>Adresse physique</label>
                                        <input type="text" value={newFournAdr} onChange={e => setNewFournAdr(e.target.value)} placeholder="Ex: Boulbinet, Kaloum, Conakry" style={{ ...INPUT, width: '100%' }} />
                                    </div>
                                    <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                                        <button type="submit" style={BTN_GREEN}>Enregistrer</button>
                                        <button type="button" onClick={() => setShowNewFournisseur(false)} style={BTN_OUTLINE}>Annuler</button>
                                    </div>
                                </form>
                            )}

                            <div style={{ overflowX: 'auto' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                    <thead style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #cbd5e1' }}>
                                        <tr>
                                            <th style={TH}>Fournisseur</th>
                                            <th style={TH}>Code</th>
                                            <th style={TH_RIGHT}>Factures d&apos;achat</th>
                                            <th style={TH_RIGHT}>Règlements émis</th>
                                            <th style={TH_RIGHT}>Solde (Dû)</th>
                                            <th style={{ ...TH, width: '40px' }}></th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {fournisseursList.map(f => {
                                            const isSelected = selectedFournisseur?.fournisseur_id === f.fournisseur_id;
                                            return (
                                                <tr key={f.fournisseur_id} style={{ borderBottom: '1px solid #f1f5f9', cursor: 'pointer', backgroundColor: isSelected ? '#ecfdf5' : 'white' }} onClick={() => handleSelectFournisseur(f)}>
                                                    <td style={{ padding: '12px' }}>
                                                        <div style={{ fontWeight: '600', color: '#0f172a', fontSize: '14px' }}>{f.nom}</div>
                                                        <div style={{ fontSize: '11px', color: '#64748b' }}>Tel: {f.telephone || 'Non renseigné'}</div>
                                                    </td>
                                                    <td style={{ padding: '12px', color: '#475569', fontSize: '14px', fontFamily: 'monospace' }}>{f.code}</td>
                                                    <td style={{ padding: '12px', textAlign: 'right', color: '#475569', fontFamily: 'monospace' }}>{fmt(f.total_credit)}</td>
                                                    <td style={{ padding: '12px', textAlign: 'right', color: '#10b981', fontFamily: 'monospace' }}>{fmt(f.total_debit)}</td>
                                                    <td style={{ padding: '12px', textAlign: 'right', fontWeight: '700', color: f.solde > 0 ? '#f59e0b' : '#10b981', fontFamily: 'monospace' }}>
                                                        {f.solde > 0 ? `${fmt(f.solde)} GNF` : f.solde < 0 ? `Trop payé: ${fmt(Math.abs(f.solde))}` : 'Soldé'}
                                                    </td>
                                                    <td style={{ padding: '12px', textAlign: 'center' }}>
                                                        <FileText size={16} color={isSelected ? '#10b981' : '#94a3b8'} />
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                        {fournisseursList.length === 0 && (
                                            <tr><td colSpan={6} style={{ padding: '30px', textAlign: 'center', color: '#64748b', fontSize: '14px' }}>Aucun fournisseur enregistré.</td></tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                            <Pagination page={pageFournisseurs} pageSize={pageSize} total={totalFournisseurs} onPageChange={setPageFournisseurs} />
                        </div>
                    )}
                </div>

                {/* RIGHT COLUMN: INDIVIDUAL LEDGER DETAIL (FICHE DE COMPTE) */}
                {(selectedEleve || selectedFournisseur) && (
                    <div style={CARD}>
                        {/* ELEVE / PARENT LEDGER DETAIL */}
                        {selectedEleve && eleveMouvements && (
                            <div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px', borderBottom: '1px solid #e2e8f0', paddingBottom: '16px' }}>
                                    <div>
                                        <span style={{ fontSize: '11px', fontWeight: '700', color: '#10b981', backgroundColor: '#e6fbf2', padding: '4px 8px', borderRadius: '4px', textTransform: 'uppercase' }}>Fiche Compte Élève</span>
                                        <h3 style={{ margin: '6px 0 2px 0', fontSize: '18px', color: '#0f172a' }}>{eleveMouvements.eleve.prenom} {eleveMouvements.eleve.nom}</h3>
                                        <p style={{ margin: 0, fontSize: '12px', color: '#64748b' }}>Matricule: {eleveMouvements.eleve.matricule}</p>
                                    </div>
                                    <div style={{ display: 'flex', gap: '8px' }}>
                                        <button onClick={() => setShowAjouterFrais(!showAjouterFrais)} style={{ ...BTN_OUTLINE, padding: '4px 10px', fontSize: '12px', borderColor: '#10b981', color: '#10b981' }}>
                                            + Ajouter un frais
                                        </button>
                                        <button onClick={() => setSelectedEleve(null)} style={{ ...BTN_OUTLINE, padding: '4px 10px', fontSize: '12px' }}>Fermer</button>
                                    </div>
                                </div>

                                {/* Facturer un frais individuellement — utile pour une adhésion tardive
                                    à un service facultatif (cantine...) sans l'imposer à toute la classe. */}
                                {showAjouterFrais && (
                                    <form onSubmit={handleAjouterFrais} style={{ display: 'flex', gap: '10px', alignItems: 'flex-end', flexWrap: 'wrap', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '14px', marginBottom: '20px' }}>
                                        <div style={{ flex: '2 1 220px' }}>
                                            <label style={{ display: 'block', fontSize: '11px', color: '#64748b', marginBottom: '4px' }}>Type de frais</label>
                                            <select value={ajouterFraisTypeId} onChange={e => setAjouterFraisTypeId(e.target.value)} required style={{ ...INPUT, width: '100%' }}>
                                                <option value="">-- Choisir --</option>
                                                {typesFraisOptions.map(tf => (
                                                    <option key={tf.type_frais_id} value={tf.type_frais_id}>
                                                        {tf.libelle}{tf.est_obligatoire !== 'O' ? ' (Facultatif)' : ''}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>
                                        <div style={{ flex: '1 1 140px' }}>
                                            <label style={{ display: 'block', fontSize: '11px', color: '#64748b', marginBottom: '4px' }}>Montant (GNF)</label>
                                            <input type="number" min="1" value={ajouterFraisMontant} onChange={e => setAjouterFraisMontant(e.target.value)} required style={{ ...INPUT, width: '100%' }} />
                                        </div>
                                        <button type="submit" disabled={ajouterFraisSaving} style={{ ...BTN_GREEN, opacity: ajouterFraisSaving ? 0.6 : 1 }}>
                                            {ajouterFraisSaving ? 'Enregistrement...' : 'Facturer'}
                                        </button>
                                    </form>
                                )}

                                {/* Summary KPIs */}
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginBottom: '20px' }}>
                                    <div style={{ padding: '12px', backgroundColor: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                                        <div style={{ fontSize: '11px', color: '#64748b', fontWeight: '500' }}>Total Facturé</div>
                                        <div style={{ fontSize: '16px', fontWeight: '700', color: '#0f172a', marginTop: '4px', fontFamily: 'monospace' }}>{fmtGNF(eleveMouvements.total_debit)}</div>
                                    </div>
                                    <div style={{ padding: '12px', backgroundColor: '#f0fdf4', borderRadius: '8px', border: '1px solid #bbf7d0' }}>
                                        <div style={{ fontSize: '11px', color: '#166534', fontWeight: '500' }}>Total Réglé</div>
                                        <div style={{ fontSize: '16px', fontWeight: '700', color: '#10b981', marginTop: '4px', fontFamily: 'monospace' }}>{fmtGNF(eleveMouvements.total_credit)}</div>
                                    </div>
                                    <div style={{ padding: '12px', backgroundColor: eleveMouvements.solde_final > 0 ? '#fef2f2' : '#f0fdf4', borderRadius: '8px', border: `1px solid ${eleveMouvements.solde_final > 0 ? '#fecaca' : '#bbf7d0'}` }}>
                                        <div style={{ fontSize: '11px', color: eleveMouvements.solde_final > 0 ? '#991b1b' : '#166534', fontWeight: '500' }}>Reste à payer</div>
                                        <div style={{ fontSize: '16px', fontWeight: '700', color: eleveMouvements.solde_final > 0 ? '#ef4444' : '#10b981', marginTop: '4px', fontFamily: 'monospace' }}>{fmtGNF(eleveMouvements.solde_final)}</div>
                                    </div>
                                </div>

                                {/* Ledgers table */}
                                <h4 style={{ margin: '0 0 10px 0', fontSize: '14px', color: '#475569' }}>Historique Chronologique</h4>
                                <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
                                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                        <thead style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                                            <tr>
                                                <th style={TH}>Date / Réf</th>
                                                <th style={TH}>Libellé / Compte</th>
                                                <th style={TH_RIGHT}>Factures (+)</th>
                                                <th style={TH_RIGHT}>Paiements (-)</th>
                                                <th style={TH_RIGHT}>Solde dû</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {eleveMouvements.mouvements.map((m: any, idx: number) => (
                                                <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9', fontSize: '13px' }}>
                                                    <td style={{ padding: '8px 12px' }}>
                                                        <div style={{ fontWeight: '600' }}>{new Date(m.date).toLocaleDateString('fr-FR')}</div>
                                                        <div style={{ fontSize: '11px', color: '#64748b', fontFamily: 'monospace' }}>{m.reference || 'N/A'}</div>
                                                    </td>
                                                    <td style={{ padding: '8px 12px' }}>
                                                        <div style={{ color: '#0f172a' }}>{m.libelle}</div>
                                                        <div style={{ fontSize: '11px', color: '#64748b' }}>Compte: {m.compte_general}</div>
                                                    </td>
                                                    <td style={{ padding: '8px 12px', textAlign: 'right', color: '#ef4444', fontFamily: 'monospace' }}>{m.debit > 0 ? fmt(m.debit) : '-'}</td>
                                                    <td style={{ padding: '8px 12px', textAlign: 'right', color: '#10b981', fontFamily: 'monospace' }}>{m.credit > 0 ? fmt(m.credit) : '-'}</td>
                                                    <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: '600', fontFamily: 'monospace' }}>{fmt(m.solde_progressif)}</td>
                                                </tr>
                                            ))}
                                            {eleveMouvements.mouvements.length === 0 && (
                                                <tr><td colSpan={5} style={{ padding: '20px', textAlign: 'center', color: '#64748b' }}>Aucun mouvement enregistré.</td></tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}

                        {/* FOURNISSEUR LEDGER DETAIL */}
                        {selectedFournisseur && fournisseurMouvements && (
                            <div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px', borderBottom: '1px solid #e2e8f0', paddingBottom: '16px' }}>
                                    <div>
                                        <span style={{ fontSize: '11px', fontWeight: '700', color: '#f59e0b', backgroundColor: '#fffbeb', padding: '4px 8px', borderRadius: '4px', textTransform: 'uppercase' }}>Fiche Compte Fournisseur</span>
                                        <h3 style={{ margin: '6px 0 2px 0', fontSize: '18px', color: '#0f172a' }}>{fournisseurMouvements.fournisseur.nom}</h3>
                                        <p style={{ margin: 0, fontSize: '12px', color: '#64748b' }}>Code: {fournisseurMouvements.fournisseur.code}</p>
                                    </div>
                                    <button onClick={() => setSelectedFournisseur(null)} style={{ ...BTN_OUTLINE, padding: '4px 10px', fontSize: '12px' }}>Fermer</button>
                                </div>

                                {/* Summary KPIs */}
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginBottom: '20px' }}>
                                    <div style={{ padding: '12px', backgroundColor: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                                        <div style={{ fontSize: '11px', color: '#64748b', fontWeight: '500' }}>Factures Reçues</div>
                                        <div style={{ fontSize: '16px', fontWeight: '700', color: '#0f172a', marginTop: '4px', fontFamily: 'monospace' }}>{fmtGNF(fournisseurMouvements.total_credit)}</div>
                                    </div>
                                    <div style={{ padding: '12px', backgroundColor: '#f0fdf4', borderRadius: '8px', border: '1px solid #bbf7d0' }}>
                                        <div style={{ fontSize: '11px', color: '#166534', fontWeight: '500' }}>Règlements Émis</div>
                                        <div style={{ fontSize: '16px', fontWeight: '700', color: '#10b981', marginTop: '4px', fontFamily: 'monospace' }}>{fmtGNF(fournisseurMouvements.total_debit)}</div>
                                    </div>
                                    <div style={{ padding: '12px', backgroundColor: fournisseurMouvements.solde_final > 0 ? '#fffbeb' : '#f0fdf4', borderRadius: '8px', border: `1px solid ${fournisseurMouvements.solde_final > 0 ? '#fde68a' : '#bbf7d0'}` }}>
                                        <div style={{ fontSize: '11px', color: fournisseurMouvements.solde_final > 0 ? '#b45309' : '#166534', fontWeight: '500' }}>Solde Dû par l&apos;école</div>
                                        <div style={{ fontSize: '16px', fontWeight: '700', color: fournisseurMouvements.solde_final > 0 ? '#d97706' : '#10b981', marginTop: '4px', fontFamily: 'monospace' }}>{fmtGNF(fournisseurMouvements.solde_final)}</div>
                                    </div>
                                </div>

                                {/* Ledgers table */}
                                <h4 style={{ margin: '0 0 10px 0', fontSize: '14px', color: '#475569' }}>Historique Chronologique</h4>
                                <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
                                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                        <thead style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                                            <tr>
                                                <th style={TH}>Date / Réf</th>
                                                <th style={TH}>Libellé / Compte</th>
                                                <th style={TH_RIGHT}>Factures (+)</th>
                                                <th style={TH_RIGHT}>Règlements (-)</th>
                                                <th style={TH_RIGHT}>Solde Dû</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {fournisseurMouvements.mouvements.map((m: any, idx: number) => (
                                                <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9', fontSize: '13px' }}>
                                                    <td style={{ padding: '8px 12px' }}>
                                                        <div style={{ fontWeight: '600' }}>{new Date(m.date).toLocaleDateString('fr-FR')}</div>
                                                        <div style={{ fontSize: '11px', color: '#64748b', fontFamily: 'monospace' }}>{m.reference || 'N/A'}</div>
                                                    </td>
                                                    <td style={{ padding: '8px 12px' }}>
                                                        <div style={{ color: '#0f172a' }}>{m.libelle}</div>
                                                        <div style={{ fontSize: '11px', color: '#64748b' }}>Compte: {m.compte_general}</div>
                                                    </td>
                                                    <td style={{ padding: '8px 12px', textAlign: 'right', color: '#d97706', fontFamily: 'monospace' }}>{m.credit > 0 ? fmt(m.credit) : '-'}</td>
                                                    <td style={{ padding: '8px 12px', textAlign: 'right', color: '#10b981', fontFamily: 'monospace' }}>{m.debit > 0 ? fmt(m.debit) : '-'}</td>
                                                    <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: '600', fontFamily: 'monospace' }}>{fmt(m.solde_progressif)}</td>
                                                </tr>
                                            ))}
                                            {fournisseurMouvements.mouvements.length === 0 && (
                                                <tr><td colSpan={5} style={{ padding: '20px', textAlign: 'center', color: '#64748b' }}>Aucun mouvement enregistré.</td></tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}
                    </div>
                )}

            </div>
        </div>
    );
}
