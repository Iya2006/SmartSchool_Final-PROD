'use client';

import React, { useState, useEffect, useCallback, Suspense } from 'react';
import { useApp } from '@/context/AppContext';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Users, Plus, Trash2, Calendar, FileText, Landmark, UserPlus, BookOpen,
    UserCheck, UserMinus, PlusCircle, MinusCircle, CheckCircle, Eye,
    Loader2, Search, Printer, Wallet, HelpCircle, RefreshCw,
    AlertCircle, FileDown, Check, ChevronRight, X
} from 'lucide-react';
import api from '@/lib/api';
import Link from 'next/link';

const fmt = (n: number) => n.toLocaleString('fr-GN') + ' GNF';

function SalairesContent() {
    const { etablissementId } = useApp();
    const searchParams = useSearchParams();
    const router = useRouter();
    
    const activeTab = searchParams.get('tab') || 'personnel';
    const [employes, setEmployes] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

    // Global selected month
    const [selectedMonth, setSelectedMonth] = useState('2026-06');
    const [paydayDate, setPaydayDate] = useState('');
    const [savingPayday, setSavingPayday] = useState(false);

    // Tab 1: Personnel forms & modals
    const [showEmpForm, setShowEmpForm] = useState(false);
    const [editingEmp, setEditingEmp] = useState<any>(null);
    const [empNom, setEmpNom] = useState('');
    const [empPrenom, setEmpPrenom] = useState('');
    const [empPoste, setEmpPoste] = useState('Enseignant');
    const [empSalaire, setEmpSalaire] = useState('');
    const [empContrat, setEmpContrat] = useState('CDI');
    const [empMobile, setEmpMobile] = useState('');

    // Tab 2: Calcul des salaires
    const [salairesCalculated, setSalairesCalculated] = useState<any[]>([]);
    const [showPayModal, setShowPayModal] = useState<any>(null);
    const [payMode, setPayMode] = useState('Cash');

    // Tab 3: Avances, absences, primes forms
    const [showAvanceForm, setShowAvanceForm] = useState(false);
    const [showAbsenceForm, setShowAbsenceForm] = useState(false);
    const [showPrimeForm, setShowPrimeForm] = useState(false);
    
    const [targetEmpId, setTargetEmpId] = useState('');
    const [formMontant, setFormMontant] = useState('');
    const [formMotif, setFormMotif] = useState('');
    const [formDate, setFormDate] = useState(new Date().toISOString().split('T')[0]);
    const [formJustifie, setFormJustifie] = useState('N');

    // Tab 4: Bulletins list & details
    const [bulletins, setBulletins] = useState<any[]>([]);
    const [selectedBulletin, setSelectedBulletin] = useState<any>(null);
    const [bulletinDetails, setBulletinDetails] = useState<any>(null);
    const [bulletinLoading, setBulletinLoading] = useState(false);

    // Tab 5: Historique
    const [historyEmpId, setHistoryEmpId] = useState('');
    const [historyList, setHistoryList] = useState<any[]>([]);

    // Tab 6: Source des absences (lecture seule)
    const [sourceEmpId, setSourceEmpId] = useState('');
    const [absenceSourceRows, setAbsenceSourceRows] = useState<any[]>([]);
    const [absenceSourceTotal, setAbsenceSourceTotal] = useState(0);

    // Tab 7: Calendrier de paie
    const [alertHistory, setAlertHistory] = useState<any[]>([]);

    // School info
    const [etablissementInfo, setEtablissementInfo] = useState<any>(null);

    useEffect(() => {
        api.get(`/api/parametrage/etablissements/${etablissementId}`)
            .then(res => setEtablissementInfo(res.data))
            .catch(() => {});
    }, [etablissementId]);

    useEffect(() => {
        api.get(`/api/finance/salaires/date-paie?etablissement_id=${etablissementId}&mois_concerne=${selectedMonth}`)
            .then(res => setPaydayDate(res.data?.date_paie || ''))
            .catch(() => setPaydayDate(''));
    }, [etablissementId, selectedMonth]);

    // Selected employee detail panel (teacher affectations)
    const [selectedEmpDetail, setSelectedEmpDetail] = useState<any>(null);
    const [teacherAffectations, setTeacherAffectations] = useState<any[]>([]);
    const [affectLoading, setAffectLoading] = useState(false);

    const handleSelectEmp = async (emp: any) => {
        setSelectedEmpDetail(emp);
        setTeacherAffectations([]);
        if (emp.poste === 'Enseignant') {
            setAffectLoading(true);
            try {
                // Find matching enseignant by name
                const ensRes = await api.get(`/api/enseignants?etablissement_id=${etablissementId}&search=${encodeURIComponent(emp.nom)}`);
                const match = (ensRes.data || []).find((e: any) =>
                    e.nom.toUpperCase() === emp.nom.toUpperCase() && e.prenom.toUpperCase() === emp.prenom.toUpperCase()
                );
                if (match) {
                    const affRes = await api.get(`/api/enseignants/${match.enseignant_id}/affectations?annee_id=1`);
                    setTeacherAffectations(affRes.data || []);
                }
            } catch { }
            setAffectLoading(false);
        }
    };

    const showMsg = (text: string, type: 'success' | 'error') => {
        setMessage({ text, type });
        setTimeout(() => setMessage(null), 4000);
    };

    const fetchEmployes = useCallback(async () => {
        setLoading(true);
        try {
            const res = await api.get(`/api/finance/employes?etablissement_id=${etablissementId}`);
            setEmployes(res.data);
            if (res.data.length > 0) {
                const firstId = res.data[0].employe_id.toString();
                setTargetEmpId(prev => prev || firstId);
                setHistoryEmpId(prev => prev || firstId);
                setSourceEmpId(prev => prev || firstId);
            }
        } catch {
            showMsg('Erreur de chargement du personnel', 'error');
        }
        setLoading(false);
    }, [etablissementId]);

    const fetchCalculatedSalaires = useCallback(async () => {
        setLoading(true);
        try {
            const res = await api.get(`/api/finance/salaires/calculer?etablissement_id=${etablissementId}&mois_concerne=${selectedMonth}`);
            setSalairesCalculated(res.data);
        } catch {
            showMsg('Erreur de calcul des salaires', 'error');
        }
        setLoading(false);
    }, [etablissementId, selectedMonth]);

    const fetchBulletins = useCallback(async () => {
        setLoading(true);
        try {
            // Generate list of all paid bulletins for the establishment
            const allBulletins: any[] = [];
            const empRes = await api.get(`/api/finance/employes?etablissement_id=${etablissementId}`);
            await Promise.all(empRes.data.map(async (emp: any) => {
                const res = await api.get(`/api/finance/salaires/historique/${emp.employe_id}`);
                res.data.forEach((b: any) => {
                    allBulletins.push({
                        ...b,
                        employe_id: emp.employe_id,
                        nom: emp.nom,
                        prenom: emp.prenom,
                        poste: emp.poste
                    });
                });
            }));
            setBulletins(allBulletins);
        } catch {
            showMsg('Erreur de chargement des bulletins', 'error');
        }
        setLoading(false);
    }, [etablissementId]);

    const fetchHistory = useCallback(async () => {
        if (!historyEmpId) return;
        setLoading(true);
        try {
            const res = await api.get(`/api/finance/salaires/historique/${historyEmpId}`);
            setHistoryList(res.data);
        } catch {
            showMsg('Erreur de chargement de l\'historique', 'error');
        }
        setLoading(false);
    }, [historyEmpId]);

    const fetchAbsenceSources = useCallback(async () => {
        setLoading(true);
        try {
            const url = sourceEmpId
                ? `/api/finance/salaires/absences-source?etablissement_id=${etablissementId}&mois_concerne=${selectedMonth}&employe_id=${sourceEmpId}`
                : `/api/finance/salaires/absences-source?etablissement_id=${etablissementId}&mois_concerne=${selectedMonth}`;
            const res = await api.get(url);
            setAbsenceSourceRows(res.data?.absences || []);
            setAbsenceSourceTotal(res.data?.total_retenue_estimee || 0);
        } catch {
            showMsg('Erreur de chargement des sources d\'absences', 'error');
        }
        setLoading(false);
    }, [etablissementId, selectedMonth, sourceEmpId]);

    const fetchAlertHistory = useCallback(async () => {
        setLoading(true);
        try {
            const res = await api.get(`/api/finance/salaires/alertes/historique?etablissement_id=${etablissementId}&mois_concerne=${selectedMonth}`);
            setAlertHistory(res.data || []);
        } catch {
            showMsg('Erreur de chargement de l\'historique des alertes', 'error');
        }
        setLoading(false);
    }, [etablissementId, selectedMonth]);

    useEffect(() => {
        if (activeTab === 'personnel' || activeTab === 'avances') {
            fetchEmployes();
        } else if (activeTab === 'paie') {
            fetchCalculatedSalaires();
        } else if (activeTab === 'bulletins') {
            fetchBulletins();
        } else if (activeTab === 'historique') {
            fetchEmployes();
            fetchHistory();
        } else if (activeTab === 'sources') {
            fetchEmployes();
            fetchAbsenceSources();
        } else if (activeTab === 'calendrier') {
            fetchAlertHistory();
        }
    }, [activeTab, fetchEmployes, fetchCalculatedSalaires, fetchBulletins, fetchHistory, fetchAbsenceSources, fetchAlertHistory, selectedMonth]);

    const handleCreateOrUpdateEmp = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!empNom || !empPrenom || !empSalaire) {
            showMsg('Veuillez remplir les champs obligatoires', 'error');
            return;
        }

        try {
            const payload = {
                etablissement_id: etablissementId,
                nom: empNom,
                prenom: empPrenom,
                poste: empPoste,
                salaire_base: parseFloat(empSalaire),
                type_contrat: empContrat,
                mobile_money: empMobile || null
            };

            if (editingEmp) {
                await api.put(`/api/finance/employes/${editingEmp.employe_id}`, payload);
                showMsg('Employé modifié avec succès', 'success');
            } else {
                await api.post('/api/finance/employes', payload);
                showMsg('Employé ajouté avec succès', 'success');
            }

            // Reset
            setEmpNom(''); setEmpPrenom(''); setEmpPoste('Enseignant');
            setEmpSalaire(''); setEmpContrat('CDI'); setEmpMobile('');
            setEditingEmp(null); setShowEmpForm(false);
            fetchEmployes();
        } catch {
            showMsg('Erreur lors de l\'enregistrement', 'error');
        }
    };

    const handleToggleStatut = async (id: number, currentStatut: string) => {
        const next = currentStatut === 'ACTIF' ? 'INACTIF' : 'ACTIF';
        if (!confirm(`Confirmer la désactivation/activation de cet employé ?`)) return;
        try {
            await api.put(`/api/finance/employes/${id}/statut?statut=${next}`);
            showMsg('Statut employé mis à jour', 'success');
            fetchEmployes();
        } catch {
            showMsg('Erreur de changement de statut', 'error');
        }
    };

    // Tab 2 actions
    const handlePayIndividual = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!showPayModal) return;

        try {
            const res = await api.post(`/api/finance/salaires/payer?employe_id=${showPayModal.employe_id}&mois_concerne=${selectedMonth}&mode_paiement=${payMode}&total_primes=${showPayModal.total_primes}&total_absences=${showPayModal.total_absences}&total_avances=${showPayModal.total_avances}&net_a_payer=${showPayModal.net_a_payer}`);
            showMsg(res.data.message, 'success');
            setShowPayModal(null);
            fetchCalculatedSalaires();
        } catch {
            showMsg('Erreur lors du paiement', 'error');
        }
    };

    const handlePayGroup = async () => {
        if (!confirm(`Confirmer le paiement de tout le personnel actif en 1 clic pour le mois de ${selectedMonth} ?`)) return;
        try {
            const res = await api.post(`/api/finance/salaires/payer-group?etablissement_id=${etablissementId}&mois_concerne=${selectedMonth}&mode_paiement=Cash`);
            showMsg(res.data.message, 'success');
            fetchCalculatedSalaires();
        } catch {
            showMsg('Erreur lors du paiement groupé', 'error');
        }
    };

    // Tab 3 actions
    const handleAddBonus = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            await api.post('/api/finance/primes', {
                employe_id: parseInt(targetEmpId),
                montant: parseFloat(formMontant),
                motif: formMotif,
                mois_concerne: selectedMonth
            });
            showMsg('Prime ajoutée avec succès !', 'success');
            setFormMontant(''); setFormMotif(''); setShowPrimeForm(false);
        } catch {
            showMsg('Erreur lors de l\'ajout', 'error');
        }
    };

    const handleAddAdvance = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            await api.post('/api/finance/avances', {
                employe_id: parseInt(targetEmpId),
                montant: parseFloat(formMontant),
                mois_concerne: selectedMonth
            });
            showMsg('Avance sur salaire enregistrée !', 'success');
            setFormMontant(''); setShowAvanceForm(false);
        } catch {
            showMsg('Erreur lors de l\'enregistrement', 'error');
        }
    };

    const handleAddAbsence = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            await api.post('/api/absences', {
                employe_id: parseInt(targetEmpId),
                date_absence: formDate,
                motif: formMotif || null,
                est_justifie: formJustifie
            });
            showMsg('Absence ou retard enregistré !', 'success');
            setFormMotif(''); setShowAbsenceForm(false);
        } catch {
            showMsg('Erreur lors de l\'enregistrement', 'error');
        }
    };

    // Bulletin detail
    const viewBulletinDetail = async (id: number) => {
        setBulletinLoading(true);
        setSelectedBulletin(id);
        try {
            const res = await api.get(`/api/finance/salaires/bulletin-detail/${id}`);
            setBulletinDetails(res.data);
        } catch {
            showMsg('Erreur de chargement du bulletin', 'error');
            setSelectedBulletin(null);
        }
        setBulletinLoading(false);
    };

    const handleSavePayday = async () => {
        if (!paydayDate) {
            showMsg('Veuillez choisir une date de paie', 'error');
            return;
        }
        try {
            setSavingPayday(true);
            await api.put(`/api/finance/salaires/date-paie?etablissement_id=${etablissementId}&mois_concerne=${selectedMonth}&date_paie=${paydayDate}`);
            showMsg('Date de paie enregistrée', 'success');
        } catch {
            showMsg('Erreur lors de l\'enregistrement de la date de paie', 'error');
        }
        setSavingPayday(false);
    };

    const handleSendPayAlerts = async (force: boolean = false) => {
        try {
            await api.post(`/api/finance/salaires/alertes?etablissement_id=${etablissementId}&mois_concerne=${selectedMonth}&force=${force}`);
            showMsg('Alertes de paie envoyées', 'success');
            fetchAlertHistory();
        } catch {
            showMsg('Erreur lors de l\'envoi des alertes', 'error');
        }
    };

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
                <span style={{ fontWeight: 600, color: '#1e293b' }}>Salaires et Personnel</span>
            </div>

            {/* Header / Month selection */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
                <div>
                    <h1 style={{ fontSize: 24, fontWeight: 800, color: '#1e293b' }}>Gestion des Salaires</h1>
                    <p style={{ fontSize: 14, color: '#64748b', marginTop: 4 }}>Fiches employés, primes, avances et calcul automatique des bulletins de paie</p>
                </div>
                
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                    <label style={{ fontSize: 13, fontWeight: 600, color: '#475569' }}>Mois concerné :</label>
                    <select value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)}
                        style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13, fontWeight: 600, background: '#fff', outline: 'none' }}>
                        <option value="2026-05">Mai 2026</option>
                        <option value="2026-06">Juin 2026</option>
                        <option value="2026-07">Juillet 2026</option>
                    </select>

                    <label style={{ fontSize: 13, fontWeight: 600, color: '#475569', marginLeft: 8 }}>Date de paie :</label>
                    <input
                        type="date"
                        value={paydayDate}
                        onChange={e => setPaydayDate(e.target.value)}
                        style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13, background: '#fff', outline: 'none' }}
                    />
                    <button
                        onClick={handleSavePayday}
                        disabled={savingPayday}
                        style={{ padding: '8px 12px', borderRadius: 8, border: 'none', background: '#10b981', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', opacity: savingPayday ? 0.7 : 1 }}
                    >
                        Enregistrer
                    </button>
                    <button
                        onClick={() => handleSendPayAlerts(false)}
                        style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', color: '#334155', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
                    >
                        Alerter J-7
                    </button>
                </div>
            </div>

            {/* Sub-tabs Navigation */}
            <div style={{ display: 'flex', borderBottom: '2px solid #f1f5f9', gap: 16 }}>
                {[
                    { id: 'personnel', label: 'Liste du personnel', icon: Users },
                    { id: 'paie', label: 'Calcul des salaires', icon: Landmark },
                    { id: 'avances', label: 'Primes & Avances', icon: PlusCircle },
                    { id: 'sources', label: 'Source des absences', icon: HelpCircle },
                    { id: 'calendrier', label: 'Calendrier de paie', icon: Calendar },
                    { id: 'bulletins', label: 'Bulletins de paie', icon: FileText },
                    { id: 'historique', label: 'Historique de paie', icon: Calendar },
                ].map(tab => (
                    <button key={tab.id} onClick={() => router.push(`/comptabilite/salaires?tab=${tab.id}`)}
                        style={{
                            padding: '12px 6px',
                            border: 'none',
                            background: 'none',
                            fontSize: 14,
                            fontWeight: activeTab === tab.id ? 700 : 500,
                            color: activeTab === tab.id ? '#10b981' : '#64748b',
                            borderBottom: activeTab === tab.id ? '3px solid #10b981' : '3px solid transparent',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                            marginBottom: -2,
                            transition: 'all 0.15s'
                        }}>
                        <tab.icon size={16} />
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* Main Tabs Content */}
            <div style={{ marginTop: 8 }}>
                
                {/* 1. PERSONNEL LIST TAB */}
                {activeTab === 'personnel' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <p style={{ fontSize: 13, color: '#64748b' }}>
                                <Users size={14} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 6 }} />
                                Personnel enregistré par la direction — cliquez sur un employé pour voir ses détails
                            </p>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: selectedEmpDetail ? '1fr 1fr' : '1fr', gap: 16 }}>
                            <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.04)', overflow: 'hidden' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                                    <thead>
                                        <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                                            {['Nom', 'Prénom', 'Poste / Rôle', 'Salaire de Base', 'Contrat', 'Statut'].map(h => (
                                                <th key={h} style={{ padding: '14px 16px', textAlign: 'left', fontWeight: 600, color: '#475569' }}>{h}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {employes.length === 0 ? (
                                            <tr>
                                                <td colSpan={6} style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>Aucun employé enregistré</td>
                                            </tr>
                                        ) : employes.map((emp) => (
                                            <tr key={emp.employe_id}
                                                onClick={() => handleSelectEmp(emp)}
                                                style={{
                                                    borderBottom: '1px solid #f1f5f9',
                                                    opacity: emp.statut === 'ACTIF' ? 1 : 0.6,
                                                    cursor: 'pointer',
                                                    background: selectedEmpDetail?.employe_id === emp.employe_id ? '#f0fdf4' : 'transparent',
                                                    transition: 'background 0.15s'
                                                }}
                                                onMouseEnter={e => { if (selectedEmpDetail?.employe_id !== emp.employe_id) e.currentTarget.style.background = '#f8fafc'; }}
                                                onMouseLeave={e => { if (selectedEmpDetail?.employe_id !== emp.employe_id) e.currentTarget.style.background = 'transparent'; }}>
                                                <td style={{ padding: '14px 16px', fontWeight: 600 }}>{emp.nom}</td>
                                                <td style={{ padding: '14px 16px' }}>{emp.prenom}</td>
                                                <td style={{ padding: '14px 16px', fontWeight: 500, color: '#3b82f6' }}>{emp.poste}</td>
                                                <td style={{ padding: '14px 16px', fontWeight: 700 }}>{fmt(emp.salaire_base)}</td>
                                                <td style={{ padding: '14px 16px' }}>{emp.type_contrat}</td>
                                                <td style={{ padding: '14px 16px' }}>
                                                    <span style={{ padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 700, backgroundColor: emp.statut === 'ACTIF' ? '#e6fcf5' : '#fee2e2', color: emp.statut === 'ACTIF' ? '#0e9f6e' : '#c81e1e' }}>
                                                        {emp.statut}
                                                    </span>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            {/* Right Panel: Employee Details / Teacher Affectations */}
                            {selectedEmpDetail && (
                                <motion.div initial={{ opacity: 0, x: 15 }} animate={{ opacity: 1, x: 0 }}
                                    style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.04)', padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                        <div>
                                            <h3 style={{ fontSize: 16, fontWeight: 800, color: '#1e293b' }}>{selectedEmpDetail.prenom} {selectedEmpDetail.nom}</h3>
                                            <p style={{ fontSize: 13, color: '#3b82f6', fontWeight: 600, marginTop: 2 }}>{selectedEmpDetail.poste}</p>
                                        </div>
                                        <button onClick={() => setSelectedEmpDetail(null)} style={{ border: 'none', background: '#f1f5f9', width: 28, height: 28, borderRadius: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                                            <X size={14} />
                                        </button>
                                    </div>

                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, fontSize: 13 }}>
                                        <div style={{ background: '#f8fafc', borderRadius: 8, padding: 12 }}>
                                            <p style={{ color: '#94a3b8', fontSize: 10, fontWeight: 700, textTransform: 'uppercase' }}>Salaire de Base</p>
                                            <p style={{ fontSize: 16, fontWeight: 800, color: '#10b981', marginTop: 2 }}>{fmt(selectedEmpDetail.salaire_base)}</p>
                                        </div>
                                        <div style={{ background: '#f8fafc', borderRadius: 8, padding: 12 }}>
                                            <p style={{ color: '#94a3b8', fontSize: 10, fontWeight: 700, textTransform: 'uppercase' }}>Contrat</p>
                                            <p style={{ fontSize: 14, fontWeight: 700, color: '#1e293b', marginTop: 2 }}>{selectedEmpDetail.type_contrat}</p>
                                        </div>
                                    </div>

                                    {selectedEmpDetail.mobile_money && (
                                        <p style={{ fontSize: 12, color: '#64748b' }}>Mobile Money : <strong>{selectedEmpDetail.mobile_money}</strong></p>
                                    )}

                                    {selectedEmpDetail.poste === 'Enseignant' ? (
                                        <div>
                                            <h4 style={{ fontSize: 13, fontWeight: 700, color: '#1e293b', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                                                <BookOpen size={14} color="#3b82f6" /> Classes et heures enseignées
                                            </h4>
                                            {affectLoading ? (
                                                <div style={{ textAlign: 'center', padding: 20 }}><Loader2 size={20} className="animate-spin" color="#10b981" /></div>
                                            ) : teacherAffectations.length > 0 ? (() => {
                                                const totalHeuresSemaine = teacherAffectations.reduce((s, a) => s + (a.heures || 0), 0);
                                                const totalHeuresMois = totalHeuresSemaine * 4.33;
                                                const tauxHoraire = totalHeuresMois > 0 ? selectedEmpDetail.salaire_base / totalHeuresMois : 0;
                                                return (
                                                    <>
                                                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, marginBottom: 12 }}>
                                                            <thead>
                                                                <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                                                                    <th style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 600 }}>Matière</th>
                                                                    <th style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 600 }}>Classe</th>
                                                                    <th style={{ padding: '8px 10px', textAlign: 'center', fontWeight: 600 }}>H/sem</th>
                                                                    <th style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 600 }}>Gain/mois</th>
                                                                </tr>
                                                            </thead>
                                                            <tbody>
                                                                {teacherAffectations.map((a, i) => {
                                                                    const heuresMois = (a.heures || 0) * 4.33;
                                                                    const gainMois = heuresMois * tauxHoraire;
                                                                    return (
                                                                        <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                                                            <td style={{ padding: '8px 10px', fontWeight: 600 }}>{a.matiere}</td>
                                                                            <td style={{ padding: '8px 10px', color: '#3b82f6' }}>{a.classe}</td>
                                                                            <td style={{ padding: '8px 10px', textAlign: 'center', fontWeight: 600 }}>{a.heures}h</td>
                                                                            <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700, color: '#10b981' }}>{fmt(Math.round(gainMois))}</td>
                                                                        </tr>
                                                                    );
                                                                })}
                                                            </tbody>
                                                        </table>
                                                        <div style={{ background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: 10, padding: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                            <div>
                                                                <p style={{ fontSize: 10, color: '#059669', fontWeight: 700, textTransform: 'uppercase' }}>Total heures/semaine</p>
                                                                <p style={{ fontSize: 16, fontWeight: 800, color: '#059669' }}>{totalHeuresSemaine}h</p>
                                                            </div>
                                                            <div style={{ textAlign: 'center' }}>
                                                                <p style={{ fontSize: 10, color: '#059669', fontWeight: 700, textTransform: 'uppercase' }}>Taux horaire moyen</p>
                                                                <p style={{ fontSize: 14, fontWeight: 800, color: '#059669' }}>{fmt(Math.round(tauxHoraire))}/h</p>
                                                            </div>
                                                            <div style={{ textAlign: 'right' }}>
                                                                <p style={{ fontSize: 10, color: '#059669', fontWeight: 700, textTransform: 'uppercase' }}>Salaire mensuel</p>
                                                                <p style={{ fontSize: 16, fontWeight: 800, color: '#059669' }}>{fmt(selectedEmpDetail.salaire_base)}</p>
                                                            </div>
                                                        </div>
                                                    </>
                                                );
                                            })() : (
                                                <div style={{ padding: 16, textAlign: 'center', color: '#94a3b8', fontSize: 12, background: '#f8fafc', borderRadius: 8 }}>
                                                    Aucune affectation trouvée pour cet enseignant
                                                </div>
                                            )}
                                        </div>
                                    ) : (
                                        <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 10, padding: 16, textAlign: 'center' }}>
                                            <Landmark size={24} color="#3b82f6" style={{ margin: '0 auto 8px' }} />
                                            <p style={{ fontSize: 13, fontWeight: 700, color: '#1e40af' }}>Poste à rémunération mensuelle fixe contractuelle</p>
                                            <p style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>Le salaire de base est versé mensuellement sans calcul horaire.</p>
                                        </div>
                                    )}
                                </motion.div>
                            )}
                        </div>
                    </div>
                )}

                {/* 2. CALCUL DES SALAIRES TAB */}
                {activeTab === 'paie' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, color: '#64748b' }}>
                                <AlertCircle size={16} style={{ color: '#3b82f6' }} />
                                Net à payer = Salaire de base + Primes - Absences (non justifiées) - Avances
                            </div>
                            <div style={{ display: 'flex', gap: 8 }}>
                                <button onClick={handlePayGroup}
                                    style={{ padding: '8px 16px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <CheckCircle size={16} /> Paiement groupé (1 clic)
                                </button>
                                <button onClick={fetchCalculatedSalaires}
                                    style={{ padding: '8px', background: '#f1f5f9', color: '#475569', border: '1px solid #e2e8f0', borderRadius: 8, cursor: 'pointer' }}>
                                    <RefreshCw size={16} />
                                </button>
                            </div>
                        </div>

                        <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.04)', overflow: 'hidden' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                                <thead>
                                    <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                                        {['Nom complet', 'Poste', 'Salaire Base', 'Primes (+)', 'Absences (-)', 'Avances (-)', 'Net à payer', 'Statut', 'Actions'].map(h => (
                                            <th key={h} style={{ padding: '14px 16px', textAlign: 'left', fontWeight: 600, color: '#475569' }}>{h}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {salairesCalculated.length === 0 ? (
                                        <tr>
                                            <td colSpan={9} style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>Aucun salaire disponible pour le calcul</td>
                                        </tr>
                                    ) : salairesCalculated.map((sal, idx) => (
                                        <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                            <td style={{ padding: '14px 16px', fontWeight: 600 }}>{sal.prenom} {sal.nom}</td>
                                            <td style={{ padding: '14px 16px', color: '#64748b' }}>{sal.poste}</td>
                                            <td style={{ padding: '14px 16px' }}>{fmt(sal.salaire_base)}</td>
                                            <td style={{ padding: '14px 16px', color: '#10b981', fontWeight: 600 }}>+{sal.total_primes.toLocaleString()}</td>
                                            <td style={{ padding: '14px 16px', color: '#ef4444', fontWeight: 600 }}>-{sal.total_absences.toLocaleString()}</td>
                                            <td style={{ padding: '14px 16px', color: '#e59e0b', fontWeight: 600 }}>-{sal.total_avances.toLocaleString()}</td>
                                            <td style={{ padding: '14px 16px', fontWeight: 800, color: '#10b981', fontSize: 14 }}>{fmt(sal.net_a_payer)}</td>
                                            <td style={{ padding: '14px 16px' }}>
                                                <span style={{ padding: '3px 10px', borderRadius: 999, fontSize: 11, fontWeight: 700, backgroundColor: sal.statut === 'PAYE' ? '#d1fae5' : '#fee2e2', color: sal.statut === 'PAYE' ? '#03543f' : '#9b1c1c' }}>
                                                    {sal.statut === 'PAYE' ? 'Payé' : 'Non payé'}
                                                </span>
                                            </td>
                                            <td style={{ padding: '14px 16px' }}>
                                                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                                    <button
                                                        onClick={() => {
                                                            setSourceEmpId(String(sal.employe_id));
                                                            router.push('/comptabilite/salaires?tab=sources');
                                                        }}
                                                        style={{ padding: '6px 10px', background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}
                                                    >
                                                        Source absences
                                                    </button>
                                                    {sal.statut === 'PAYE' ? (
                                                        <span style={{ color: '#10b981', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                                                            <Check size={14} /> Réglé
                                                        </span>
                                                    ) : (
                                                        <button onClick={() => setShowPayModal(sal)}
                                                            style={{ padding: '6px 12px', background: '#10b981', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
                                                            Payer
                                                        </button>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {/* 3. PRIMES & AVANCES TAB */}
                {activeTab === 'avances' && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 20 }}>
                        {/* Box 1: Primes */}
                        <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: 20, boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                                <div style={{ width: 40, height: 40, borderRadius: 10, background: '#ecfdf5', color: '#10b981', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <PlusCircle size={20} />
                                </div>
                                <div>
                                    <h3 style={{ fontSize: 16, fontWeight: 700, color: '#1e293b' }}>Ajouter une Prime</h3>
                                    <p style={{ fontSize: 12, color: '#64748b' }}>Rendement, présence, etc.</p>
                                </div>
                            </div>
                            <form onSubmit={handleAddBonus} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                <div>
                                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 4 }}>Employé</label>
                                    <select value={targetEmpId} onChange={e => setTargetEmpId(e.target.value)}
                                        style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13, background: '#fff', outline: 'none' }}>
                                        {employes.map(e => <option key={e.employe_id} value={e.employe_id}>{e.prenom} {e.nom}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 4 }}>Montant (GNF)</label>
                                    <input type="number" required value={formMontant} onChange={e => setFormMontant(e.target.value)} placeholder="Ex: 100000"
                                        style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13, outline: 'none' }} />
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 4 }}>Motif / Libellé</label>
                                    <input required value={formMotif} onChange={e => setFormMotif(e.target.value)} placeholder="Ex: Prime de rendement"
                                        style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13, outline: 'none' }} />
                                </div>
                                <button type="submit" style={{ padding: '10px', background: '#10b981', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 600, cursor: 'pointer', marginTop: 8 }}>
                                    Ajouter la prime
                                </button>
                            </form>
                        </div>

                        {/* Box 2: Avances */}
                        <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: 20, boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                                <div style={{ width: 40, height: 40, borderRadius: 10, background: '#fffbeb', color: '#f59e0b', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <MinusCircle size={20} />
                                </div>
                                <div>
                                    <h3 style={{ fontSize: 16, fontWeight: 700, color: '#1e293b' }}>Enregistrer une Avance</h3>
                                    <p style={{ fontSize: 12, color: '#64748b' }}>Déduite sur le prochain salaire</p>
                                </div>
                            </div>
                            <form onSubmit={handleAddAdvance} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                <div>
                                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 4 }}>Employé</label>
                                    <select value={targetEmpId} onChange={e => setTargetEmpId(e.target.value)}
                                        style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13, background: '#fff', outline: 'none' }}>
                                        {employes.map(e => <option key={e.employe_id} value={e.employe_id}>{e.prenom} {e.nom}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 4 }}>Montant de l'avance (GNF)</label>
                                    <input type="number" required value={formMontant} onChange={e => setFormMontant(e.target.value)} placeholder="Ex: 200000"
                                        style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13, outline: 'none' }} />
                                </div>
                                <button type="submit" style={{ padding: '10px', background: '#f59e0b', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 600, cursor: 'pointer', marginTop: 8 }}>
                                    Enregistrer l'avance
                                </button>
                            </form>
                        </div>

                        {/* Box 3: Information RH / Absences */}
                        <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: 20, boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                                <div style={{ width: 40, height: 40, borderRadius: 10, background: '#eff6ff', color: '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <HelpCircle size={20} />
                                </div>
                                <div>
                                    <h3 style={{ fontSize: 16, fontWeight: 700, color: '#1e293b' }}>Absences & présence (automatique)</h3>
                                    <p style={{ fontSize: 12, color: '#64748b' }}>La saisie RH n&apos;est pas faite par le comptable</p>
                                </div>
                            </div>

                            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: 14, fontSize: 13, color: '#475569', lineHeight: 1.6 }}>
                                <p style={{ margin: 0 }}>
                                    Les absences/retards et la présence des enseignants sont enregistrés dans les modules RH/Vie scolaire.
                                    Ici, le comptable <strong>consulte</strong> les montants calculés (primes, absences, avances) puis valide la paie.
                                </p>
                                <p style={{ margin: '10px 0 0 0', color: '#64748b' }}>
                                    Déduction appliquée automatiquement dans le calcul mensuel du salaire.
                                </p>
                            </div>
                        </div>
                    </div>
                )}

                {/* 4. SOURCE DES ABSENCES TAB (lecture seule) */}
                {activeTab === 'sources' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: 14 }}>
                            <label style={{ fontSize: 13, fontWeight: 700, color: '#334155' }}>Employé :</label>
                            <select
                                value={sourceEmpId}
                                onChange={e => setSourceEmpId(e.target.value)}
                                style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13, background: '#fff' }}
                            >
                                <option value="">Tous</option>
                                {employes.map(e => <option key={e.employe_id} value={e.employe_id}>{e.prenom} {e.nom} ({e.poste})</option>)}
                            </select>
                            <button
                                onClick={fetchAbsenceSources}
                                style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', color: '#334155', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
                            >
                                Actualiser
                            </button>
                            <div style={{ marginLeft: 'auto', fontSize: 13, color: '#64748b' }}>
                                Retenue estimée du mois: <strong style={{ color: '#dc2626' }}>{fmt(absenceSourceTotal)}</strong>
                            </div>
                        </div>

                        <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.04)', overflow: 'hidden' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                                <thead>
                                    <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                                        {['Date', 'Employé', 'Poste', 'Justifiée', 'Motif', 'Source', 'Retenue estimée'].map(h => (
                                            <th key={h} style={{ padding: '12px 14px', textAlign: 'left', fontWeight: 600, color: '#475569' }}>{h}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {absenceSourceRows.length === 0 ? (
                                        <tr>
                                            <td colSpan={7} style={{ padding: 32, textAlign: 'center', color: '#94a3b8' }}>
                                                Aucune absence trouvée pour {selectedMonth}
                                            </td>
                                        </tr>
                                    ) : absenceSourceRows.map((a, idx) => (
                                        <tr key={a.absence_id || idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                            <td style={{ padding: '12px 14px' }}>{a.date_absence}</td>
                                            <td style={{ padding: '12px 14px', fontWeight: 600 }}>{a.prenom} {a.nom}</td>
                                            <td style={{ padding: '12px 14px', color: '#64748b' }}>{a.poste}</td>
                                            <td style={{ padding: '12px 14px' }}>
                                                <span style={{ padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 700, background: a.est_justifie === 'O' ? '#dcfce7' : '#fee2e2', color: a.est_justifie === 'O' ? '#166534' : '#991b1b' }}>
                                                    {a.est_justifie === 'O' ? 'Oui' : 'Non'}
                                                </span>
                                            </td>
                                            <td style={{ padding: '12px 14px', color: '#64748b' }}>{a.motif || '—'}</td>
                                            <td style={{ padding: '12px 14px', color: '#64748b' }}>{a.source}</td>
                                            <td style={{ padding: '12px 14px', fontWeight: 700, color: a.retenue_estimee > 0 ? '#dc2626' : '#16a34a' }}>{fmt(a.retenue_estimee || 0)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {/* 5. CALENDRIER DE PAIE TAB */}
                {activeTab === 'calendrier' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                        <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: 16, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                            <label style={{ fontSize: 13, fontWeight: 700, color: '#334155' }}>Date officielle de paie ({selectedMonth}) :</label>
                            <input
                                type="date"
                                value={paydayDate}
                                onChange={e => setPaydayDate(e.target.value)}
                                style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13, background: '#fff' }}
                            />
                            <button
                                onClick={handleSavePayday}
                                disabled={savingPayday}
                                style={{ padding: '8px 12px', borderRadius: 8, border: 'none', background: '#10b981', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', opacity: savingPayday ? 0.7 : 1 }}
                            >
                                Enregistrer
                            </button>
                            <button
                                onClick={() => handleSendPayAlerts(false)}
                                style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', color: '#334155', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
                            >
                                Envoyer alertes (règle J-7)
                            </button>
                            <button
                                onClick={() => handleSendPayAlerts(true)}
                                style={{ padding: '8px 12px', borderRadius: 8, border: 'none', background: '#1d4ed8', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
                            >
                                Envoyer maintenant (force)
                            </button>
                            <button
                                onClick={fetchAlertHistory}
                                style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', color: '#334155', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
                            >
                                Rafraîchir historique
                            </button>
                        </div>

                        <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                                <thead>
                                    <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                                        {['Date envoi', 'Destinataire', 'Sujet', 'Statut'].map(h => (
                                            <th key={h} style={{ padding: '12px 14px', textAlign: 'left', fontWeight: 600, color: '#475569' }}>{h}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {alertHistory.length === 0 ? (
                                        <tr>
                                            <td colSpan={4} style={{ padding: 32, textAlign: 'center', color: '#94a3b8' }}>
                                                Aucun envoi d'alerte trouvé pour ce mois.
                                            </td>
                                        </tr>
                                    ) : alertHistory.map((m, idx) => (
                                        <tr key={m.message_id || idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                            <td style={{ padding: '12px 14px' }}>{m.date_envoi || '—'}</td>
                                            <td style={{ padding: '12px 14px' }}>{m.destinataire_type}</td>
                                            <td style={{ padding: '12px 14px', fontWeight: 600 }}>{m.sujet}</td>
                                            <td style={{ padding: '12px 14px' }}>{m.statut}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {/* 6. BULLETINS DE PAIE TAB */}
                {activeTab === 'bulletins' && (
                    <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.04)', overflow: 'hidden' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                            <thead>
                                <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                                    {['Mois', 'Employé', 'Poste', 'Salaire de Base', 'Net Perçu', 'Date Paiement', 'Mode', 'Actions'].map(h => (
                                        <th key={h} style={{ padding: '14px 16px', textAlign: 'left', fontWeight: 600, color: '#475569' }}>{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {bulletins.length === 0 ? (
                                    <tr>
                                        <td colSpan={8} style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>Aucun bulletin de paie archivé</td>
                                    </tr>
                                ) : bulletins.map((b, idx) => (
                                    <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                        <td style={{ padding: '14px 16px', fontWeight: 700, color: '#3b82f6' }}>{b.mois_concerne}</td>
                                        <td style={{ padding: '14px 16px', fontWeight: 600 }}>{b.prenom} {b.nom}</td>
                                        <td style={{ padding: '14px 16px', color: '#64748b' }}>{b.poste}</td>
                                        <td style={{ padding: '14px 16px' }}>{fmt(b.salaire_base)}</td>
                                        <td style={{ padding: '14px 16px', fontWeight: 800, color: '#10b981' }}>{fmt(b.net_a_payer)}</td>
                                        <td style={{ padding: '14px 16px' }}>{b.date_paiement || '—'}</td>
                                        <td style={{ padding: '14px 16px' }}>{b.mode_paiement || '—'}</td>
                                        <td style={{ padding: '14px 16px' }}>
                                            <button onClick={() => viewBulletinDetail(b.bulletin_id)}
                                                style={{ padding: '6px 12px', background: '#eff6ff', color: '#3b82f6', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                                                <Eye size={14} /> Fiche de Paie
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                {/* 5. HISTORIQUE DE PAIE TAB */}
                {activeTab === 'historique' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                        <div style={{ display: 'flex', gap: 12, alignItems: 'center', background: '#fff', padding: 16, borderRadius: 12, border: '1px solid #e2e8f0' }}>
                            <label style={{ fontSize: 13, fontWeight: 600, color: '#475569' }}>Sélectionner un employé :</label>
                            <select value={historyEmpId} onChange={e => setHistoryEmpId(e.target.value)}
                                style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13, background: '#fff', outline: 'none', minWidth: 200 }}>
                                {employes.map(e => <option key={e.employe_id} value={e.employe_id}>{e.prenom} {e.nom} ({e.poste})</option>)}
                            </select>
                            <button onClick={fetchHistory} style={{ padding: '8px 12px', background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: 8, cursor: 'pointer', fontSize: 13 }}>
                                Charger l'historique
                            </button>
                        </div>

                        <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.04)', overflow: 'hidden' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                                <thead>
                                    <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                                        {['Mois', 'Salaire Base', 'Total Primes', 'Total Absences', 'Total Avances', 'Net Payé', 'Date Paiement', 'Mode', 'Actions'].map(h => (
                                            <th key={h} style={{ padding: '14px 16px', textAlign: 'left', fontWeight: 600, color: '#475569' }}>{h}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {historyList.length === 0 ? (
                                        <tr>
                                            <td colSpan={9} style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>Aucun historique de paie pour cet employé</td>
                                        </tr>
                                    ) : historyList.map((b, idx) => (
                                        <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                            <td style={{ padding: '14px 16px', fontWeight: 700, color: '#3b82f6' }}>{b.mois_concerne}</td>
                                            <td style={{ padding: '14px 16px' }}>{fmt(b.salaire_base)}</td>
                                            <td style={{ padding: '14px 16px', color: '#10b981' }}>+{b.total_primes.toLocaleString()}</td>
                                            <td style={{ padding: '14px 16px', color: '#ef4444' }}>-{b.total_absences.toLocaleString()}</td>
                                            <td style={{ padding: '14px 16px', color: '#e59e0b' }}>-{b.total_avances.toLocaleString()}</td>
                                            <td style={{ padding: '14px 16px', fontWeight: 800, color: '#10b981' }}>{fmt(b.net_a_payer)}</td>
                                            <td style={{ padding: '14px 16px' }}>{b.date_paiement || '—'}</td>
                                            <td style={{ padding: '14px 16px' }}>{b.mode_paiement || '—'}</td>
                                            <td style={{ padding: '14px 16px' }}>
                                                <button onClick={() => viewBulletinDetail(b.bulletin_id)}
                                                    style={{ padding: '4px 8px', background: '#eff6ff', color: '#3b82f6', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12 }}>
                                                    Bulletin
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

            {/* MODAL: Employee Form — masqué pour le comptable (géré par la direction) */}

            {/* MODAL: Pay Individual Employee */}
            <AnimatePresence>
                {showPayModal && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
                        <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
                            style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 450, padding: 24, boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                                <h3 style={{ fontSize: 16, fontWeight: 700, color: '#1e293b' }}>Confirmer le paiement du salaire</h3>
                                <button onClick={() => setShowPayModal(null)} style={{ border: 'none', background: '#f1f5f9', width: 28, height: 28, borderRadius: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                                    <X size={16} />
                                </button>
                            </div>

                            <form onSubmit={handlePayIndividual} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                                <div style={{ background: '#f8fafc', padding: 14, borderRadius: 8, fontSize: 13 }}>
                                    <p style={{ fontWeight: 700, marginBottom: 8 }}>{showPayModal.prenom} {showPayModal.nom} ({showPayModal.poste})</p>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                                        <span>Salaire de Base :</span>
                                        <span style={{ fontWeight: 600 }}>{fmt(showPayModal.salaire_base)}</span>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, color: '#10b981' }}>
                                        <span>Primes (+) :</span>
                                        <span>+{showPayModal.total_primes.toLocaleString()} GNF</span>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, color: '#ef4444' }}>
                                        <span>Absences (-) :</span>
                                        <span>-{showPayModal.total_absences.toLocaleString()} GNF</span>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, color: '#e59e0b' }}>
                                        <span>Avances (-) :</span>
                                        <span>-{showPayModal.total_avances.toLocaleString()} GNF</span>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 15, fontWeight: 800, borderTop: '1px solid #e2e8f0', paddingTop: 8, color: '#10b981' }}>
                                        <span>Net à Payer :</span>
                                        <span>{fmt(showPayModal.net_a_payer)}</span>
                                    </div>
                                </div>

                                <div>
                                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 4 }}>Mode de Règlement *</label>
                                    <select value={payMode} onChange={e => setPayMode(e.target.value)}
                                        style={{ width: '100%', padding: '10px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13, background: '#fff' }}>
                                        <option value="Cash">Cash / Espèces</option>
                                        <option value="Mobile Money">Mobile Money (Orange/MTN)</option>
                                        <option value="Virement">Virement bancaire</option>
                                        <option value="Cheque">Chèque</option>
                                    </select>
                                </div>

                                <button type="submit"
                                    style={{ width: '100%', padding: '12px', background: '#10b981', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer', marginTop: 8 }}>
                                    Confirmer le règlement
                                </button>
                            </form>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* MODAL: Printable Bulletin / Pay Slip */}
            <AnimatePresence>
                {selectedBulletin && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
                        onClick={() => setSelectedBulletin(null)}>
                        <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
                            onClick={e => e.stopPropagation()}
                            style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 700, maxHeight: '90vh', overflow: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
                            
                            {bulletinLoading ? (
                                <div style={{ padding: 60, textAlign: 'center' }}>
                                    <Loader2 size={32} className="animate-spin" color="#10b981" />
                                </div>
                            ) : bulletinDetails ? (
                                <div id="bulletin-print">
                                    {/* Action Bar (non-printable) */}
                                    <div className="no-print" style={{ padding: '16px 24px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <h3 style={{ fontSize: 16, fontWeight: 700 }}>Bulletin de Salaire</h3>
                                        <div style={{ display: 'flex', gap: 8 }}>
                                            <button onClick={() => window.print()}
                                                style={{ padding: '8px 16px', borderRadius: 8, background: '#10b981', color: '#fff', border: 'none', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                                                <Printer size={14} /> Imprimer
                                            </button>
                                            <button onClick={() => setSelectedBulletin(null)} style={{ padding: 8, borderRadius: 8, background: '#f1f5f9', border: 'none', cursor: 'pointer' }}>
                                                <X size={16} />
                                            </button>
                                        </div>
                                    </div>

                                    {/* Pay Slip Print Content */}
                                    <div style={{ padding: 36, fontFamily: 'system-ui' }}>
                                        {/* School Header */}
                                        <div style={{ textAlign: 'center', marginBottom: 28, paddingBottom: 16, borderBottom: '2px solid #1e293b' }}>
                                            <h2 style={{ fontSize: 20, fontWeight: 800, color: '#1e293b', textTransform: 'uppercase' }}>{etablissementInfo?.nom || 'ÉCOLE'}</h2>
                                            <p style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>{etablissementInfo?.adresse || 'République de Guinée'} {etablissementInfo?.telephone ? `• Tél: ${etablissementInfo.telephone}` : ''}</p>
                                            <h3 style={{ fontSize: 15, fontWeight: 700, marginTop: 12, color: '#10b981', letterSpacing: 1 }}>BULLETIN DE PAIE — {bulletinDetails.bulletin.mois_concerne}</h3>
                                        </div>

                                        {/* Employee details */}
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginBottom: 24, fontSize: 13 }}>
                                            <div>
                                                <p style={{ color: '#94a3b8', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', marginBottom: 4 }}>EMPLOYÉ</p>
                                                <p style={{ fontSize: 16, fontWeight: 800 }}>{bulletinDetails.employe.prenom} {bulletinDetails.employe.nom}</p>
                                                <p style={{ color: '#475569', marginTop: 2 }}>Poste : <strong>{bulletinDetails.employe.poste}</strong></p>
                                                <p style={{ color: '#475569' }}>Contrat : {bulletinDetails.employe.type_contrat}</p>
                                            </div>
                                            <div style={{ textAlign: 'right' }}>
                                                <p style={{ color: '#94a3b8', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', marginBottom: 4 }}>PAIEMENT</p>
                                                <p style={{ color: '#475569' }}>Date : <strong>{bulletinDetails.bulletin.date_paiement}</strong></p>
                                                <p style={{ color: '#475569' }}>Mode : {bulletinDetails.bulletin.mode_paiement}</p>
                                                {bulletinDetails.employe.mobile_money && <p style={{ color: '#475569' }}>Mobile Money : {bulletinDetails.employe.mobile_money}</p>}
                                            </div>
                                        </div>

                                        {/* Detail Table */}
                                        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 28, fontSize: 13 }}>
                                            <thead>
                                                <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                                                    <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 700 }}>Description de l'élément</th>
                                                    <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700 }}>Gain (+)</th>
                                                    <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700 }}>Retenu (-)</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                                                    <td style={{ padding: '12px' }}>Salaire de Base Contractuel</td>
                                                    <td style={{ padding: '12px', textAlign: 'right', fontWeight: 600 }}>{bulletinDetails.bulletin.salaire_base.toLocaleString()} GNF</td>
                                                    <td style={{ padding: '12px', textAlign: 'right', color: '#94a3b8' }}>—</td>
                                                </tr>
                                                
                                                {/* Primes list */}
                                                {bulletinDetails.details.primes.map((p: any, i: number) => (
                                                    <tr key={i} style={{ borderBottom: '1px solid #f1f5f9', color: '#03543f' }}>
                                                        <td style={{ padding: '12px' }}>+ Prime : {p.motif}</td>
                                                        <td style={{ padding: '12px', textAlign: 'right', fontWeight: 600 }}>+{p.montant.toLocaleString()} GNF</td>
                                                        <td style={{ padding: '12px', textAlign: 'right', color: '#94a3b8' }}>—</td>
                                                    </tr>
                                                ))}

                                                {/* Absences deduction */}
                                                {bulletinDetails.bulletin.total_absences > 0 && (
                                                    <tr style={{ borderBottom: '1px solid #f1f5f9', color: '#9b1c1c' }}>
                                                        <td style={{ padding: '12px' }}>- Retenu Absences non justifiées ({bulletinDetails.details.absences.length} jour(s))</td>
                                                        <td style={{ padding: '12px', textAlign: 'right', color: '#94a3b8' }}>—</td>
                                                        <td style={{ padding: '12px', textAlign: 'right', fontWeight: 600 }}>-{bulletinDetails.bulletin.total_absences.toLocaleString()} GNF</td>
                                                    </tr>
                                                )}

                                                {/* Avances deduction */}
                                                {bulletinDetails.bulletin.total_avances > 0 && (
                                                    <tr style={{ borderBottom: '1px solid #f1f5f9', color: '#b25e02' }}>
                                                        <td style={{ padding: '12px' }}>- Déduction Avance sur salaire perçue</td>
                                                        <td style={{ padding: '12px', textAlign: 'right', color: '#94a3b8' }}>—</td>
                                                        <td style={{ padding: '12px', textAlign: 'right', fontWeight: 600 }}>-{bulletinDetails.bulletin.total_avances.toLocaleString()} GNF</td>
                                                    </tr>
                                                )}
                                            </tbody>
                                        </table>

                                        {/* Total / Net pay box */}
                                        <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12, padding: '20px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <div>
                                                <p style={{ fontSize: 11, color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase' }}>Net à percevoir ce mois</p>
                                                <p style={{ fontSize: 22, fontWeight: 900, color: '#10b981', marginTop: 4 }}>{fmt(bulletinDetails.bulletin.net_a_payer)}</p>
                                            </div>
                                            
                                            <div style={{ textAlign: 'right', fontSize: 11, color: '#64748b' }}>
                                                <p>{etablissementInfo?.nom || 'L\'Établissement'}</p>
                                                <p style={{ fontWeight: 600, marginTop: 4 }}>Signature du Comptable</p>
                                                <p style={{ fontStyle: 'italic', color: '#94a3b8', marginTop: 16 }}>(Document Officiel Électronique)</p>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ) : null}
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Print & Spin styles */}
            <style>{`
                @media print {
                    body * { visibility: hidden; }
                    #bulletin-print, #bulletin-print * { visibility: visible; }
                    #bulletin-print { position: absolute; left: 0; top: 0; width: 100%; }
                    .no-print { display: none !important; }
                }
                .animate-spin { animation: spin 1s linear infinite; }
                @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
            `}</style>
        </div>
    );
}

export default function SalairesPage() {
    return (
        <Suspense fallback={
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh' }}>
                <Loader2 size={40} className="animate-spin" color="#10b981" />
            </div>
        }>
            <SalairesContent />
        </Suspense>
    );
}
