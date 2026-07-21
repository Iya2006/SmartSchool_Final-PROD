'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useApp } from '@/context/AppContext';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Settings, Bell, FilePlus, Loader2, ChevronRight, CheckCircle2,
    Save, MessageSquare, AlertCircle
} from 'lucide-react';
import api from '@/lib/api';
import Link from 'next/link';

export default function AutomatisationsPage() {
    const { etablissementId, anneeId } = useApp();
    const [loading, setLoading] = useState(true);
    const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

    // Section 1: Rappels Config
    const [config, setConfig] = useState<any>({
        actif: true,
        avant_echeance_jours: [],
        apres_echeance_jours: [],
        canal: 'SYSTEME',
        message_template: ''
    });
    const [savingConfig, setSavingConfig] = useState(false);

    // Section 2: Notifications
    const [impayesCount, setImpayesCount] = useState(0);
    const [notifying, setNotifying] = useState(false);
    const [showConfirmNotif, setShowConfirmNotif] = useState(false);

    // Section 3: Génération de masse
    const [classes, setClasses] = useState<any[]>([]);
    const [typesFrais, setTypesFrais] = useState<any[]>([{ type_frais_id: 1, libelle: 'Frais Scolaires' }, { type_frais_id: 2, libelle: 'Inscription' }]); // Mock fallback if api fails
    const [genData, setGenData] = useState({ classe_id: '', type_frais_id: '', montant: '', nb_echeances: '1' });
    const [generating, setGenerating] = useState(false);

    const showMsg = (text: string, type: 'success' | 'error') => {
        setMessage({ text, type });
        setTimeout(() => setMessage(null), 4000);
    };

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const [confRes, impRes, clsRes] = await Promise.all([
                api.get('/api/finance/rappels/config'),
                api.get(`/api/finance/impayes?etablissement_id=${etablissementId}&annee_id=${anneeId}&limit=1`),
                api.get(`/api/classes?etablissement_id=${etablissementId}&annee_id=${anneeId}`)
            ]);
            setConfig(confRes.data);
            // Count can be approximated by checking if there's any data, or we could fetch without limit to get length
            const fullImpRes = await api.get(`/api/finance/impayes?etablissement_id=${etablissementId}&annee_id=${anneeId}`);
            setImpayesCount(fullImpRes.data.length);
            setClasses(clsRes.data || []);
            
            // Try fetching types frais if endpoint exists
            try {
                const tfRes = await api.get('/api/finance/types-frais');
                if (tfRes.data && tfRes.data.length > 0) setTypesFrais(tfRes.data);
            } catch { /* keep mock */ }
            
        } catch (e) {
            console.error(e);
        }
        setLoading(false);
    }, [etablissementId, anneeId]);

    useEffect(() => { fetchData(); }, [fetchData]);

    const handleSaveConfig = async () => {
        setSavingConfig(true);
        try {
            await api.post('/api/finance/rappels/configurer', config);
            showMsg('Configuration enregistrée avec succès', 'success');
        } catch { showMsg('Erreur lors de la sauvegarde', 'error'); }
        setSavingConfig(false);
    };

    const handleSendNotifications = async () => {
        setNotifying(true); setShowConfirmNotif(false);
        try {
            const res = await api.post(`/api/finance/communication/notifier-impayes?etablissement_id=${etablissementId}&annee_id=${anneeId}`);
            showMsg(`${res.data.nb_notifies} notifications envoyées !`, 'success');
        } catch { showMsg('Erreur lors de l\'envoi', 'error'); }
        setNotifying(false);
    };

    const handleGenerateFactures = async () => {
        if (!genData.classe_id || !genData.type_frais_id || !genData.montant) {
            showMsg('Veuillez remplir tous les champs obligatoires', 'error'); return;
        }
        setGenerating(true);
        try {
            const payload = {
                classe_id: parseInt(genData.classe_id),
                annee_id: anneeId,
                type_frais_id: parseInt(genData.type_frais_id),
                montant: parseFloat(genData.montant),
                // Simplification for echeances based on nb_echeances
                echeances: Array.from({ length: parseInt(genData.nb_echeances) }).map((_, i) => ({
                    libelle: `Échéance ${i + 1}`,
                    date_limite: new Date(Date.now() + (i * 30) * 86400000).toISOString().split('T')[0],
                    montant_attendu: parseFloat(genData.montant) / parseInt(genData.nb_echeances)
                }))
            };
            const res = await api.post('/api/finance/factures/generer-classe', payload);
            showMsg(`Succès : ${res.data.created} factures créées, ${res.data.skipped} ignorées.`, 'success');
        } catch (e: any) { 
            let errorMsg = 'Erreur lors de la génération';
            if (e.response?.data?.detail) {
                if (typeof e.response.data.detail === 'string') {
                    errorMsg = e.response.data.detail;
                } else if (Array.isArray(e.response.data.detail)) {
                    errorMsg = "Veuillez vérifier les champs du formulaire.";
                }
            }
            showMsg(errorMsg, 'error'); 
        }
        setGenerating(false);
    };

    const toggleDay = (type: 'avant' | 'apres', day: number) => {
        const key = type === 'avant' ? 'avant_echeance_jours' : 'apres_echeance_jours';
        const arr = config[key] || [];
        if (arr.includes(day)) setConfig({ ...config, [key]: arr.filter((d: number) => d !== day) });
        else setConfig({ ...config, [key]: [...arr, day].sort((a: number, b: number) => a - b) });
    };

    if (loading) return (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh', flexDirection: 'column', gap: 16 }}>
            <Loader2 size={40} className="animate-spin" color="#3b82f6" />
        </div>
    );

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

            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#64748b' }}>
                <Link href="/comptabilite" style={{ color: '#3b82f6' }}>Comptabilité</Link><ChevronRight size={14} />
                <span style={{ fontWeight: 600, color: '#1e293b' }}>Automatisations</span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: 20 }}>
                {/* CONFIGURATION RAPPELS */}
                <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
                    style={{ background: '#fff', borderRadius: 12, padding: 24, boxShadow: '0 1px 3px rgba(0,0,0,0.04)', border: '1px solid #e2e8f0' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                        <h2 style={{ fontSize: 16, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}><Settings size={18} color="#3b82f6" /> Configuration des Rappels</h2>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                            <span style={{ fontSize: 13, fontWeight: 600, color: config.actif ? '#10b981' : '#64748b' }}>{config.actif ? 'Actif' : 'Inactif'}</span>
                            <input type="checkbox" checked={config.actif} onChange={e => setConfig({ ...config, actif: e.target.checked })} style={{ width: 18, height: 18, accentColor: '#10b981' }} />
                        </label>
                    </div>

                    <div style={{ opacity: config.actif ? 1 : 0.5, pointerEvents: config.actif ? 'auto' : 'none', display: 'flex', flexDirection: 'column', gap: 16 }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                            <div style={{ background: '#f8fafc', padding: 16, borderRadius: 8 }}>
                                <p style={{ fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 10 }}>Avant échéance (jours)</p>
                                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                                    {[1, 3, 7].map(d => (
                                        <label key={d} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13 }}>
                                            <input type="checkbox" checked={config.avant_echeance_jours?.includes(d)} onChange={() => toggleDay('avant', d)} /> {d} j
                                        </label>
                                    ))}
                                </div>
                            </div>
                            <div style={{ background: '#f8fafc', padding: 16, borderRadius: 8 }}>
                                <p style={{ fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 10 }}>Après échéance (jours)</p>
                                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                                    {[1, 3, 7, 14].map(d => (
                                        <label key={d} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13 }}>
                                            <input type="checkbox" checked={config.apres_echeance_jours?.includes(d)} onChange={() => toggleDay('apres', d)} /> {d} j
                                        </label>
                                    ))}
                                </div>
                            </div>
                        </div>

                        <div>
                            <p style={{ fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 8 }}>Canal d'envoi</p>
                            <div style={{ display: 'flex', gap: 10 }}>
                                {['SYSTEME', 'SMS', 'EMAIL'].map(c => (
                                    <button key={c} onClick={() => setConfig({ ...config, canal: c })}
                                        style={{ padding: '6px 12px', borderRadius: 999, fontSize: 12, fontWeight: 600, background: config.canal === c ? '#3b82f6' : '#f1f5f9', color: config.canal === c ? '#fff' : '#64748b' }}>
                                        {c}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div>
                            <p style={{ fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 8 }}>Template du message</p>
                            <textarea value={config.message_template} onChange={e => setConfig({ ...config, message_template: e.target.value })}
                                style={{ width: '100%', padding: 12, borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13, minHeight: 80, outline: 'none' }} />
                            <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>Variables : {'{parent_nom}'}, {'{eleve_nom}'}, {'{montant}'}, {'{date_limite}'}</p>
                        </div>

                        <button onClick={handleSaveConfig} disabled={savingConfig}
                            style={{ padding: '10px 16px', borderRadius: 8, background: '#10b981', color: '#fff', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 8 }}>
                            {savingConfig ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Enregistrer la configuration
                        </button>
                    </div>
                </motion.div>

                {/* NOTIFICATIONS & GÉNÉRATION */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                    {/* ENVOI MANUEL */}
                    <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
                        style={{ background: '#fff', borderRadius: 12, padding: 24, boxShadow: '0 1px 3px rgba(0,0,0,0.04)', border: '1px solid #e2e8f0' }}>
                        <h2 style={{ fontSize: 16, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}><Bell size={18} color="#f59e0b" /> Envoi Manuel de Rappels</h2>
                        
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#fffbeb', padding: 16, borderRadius: 8, border: '1px solid #fde68a', marginBottom: 16 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                <AlertCircle size={24} color="#d97706" />
                                <div>
                                    <p style={{ fontSize: 14, fontWeight: 700, color: '#b45309' }}>{impayesCount} élèves en situation d'impayé</p>
                                    <p style={{ fontSize: 12, color: '#d97706' }}>Prêts à être notifiés.</p>
                                </div>
                            </div>
                        </div>

                        {showConfirmNotif ? (
                            <div style={{ background: '#f8fafc', padding: 16, borderRadius: 8, textAlign: 'center' }}>
                                <p style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>Confirmer l'envoi à {impayesCount} parents ?</p>
                                <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
                                    <button onClick={() => setShowConfirmNotif(false)} style={{ padding: '8px 16px', borderRadius: 8, background: '#e2e8f0', fontSize: 13, fontWeight: 600 }}>Annuler</button>
                                    <button onClick={handleSendNotifications} disabled={notifying} style={{ padding: '8px 16px', borderRadius: 8, background: '#f59e0b', color: '#fff', fontSize: 13, fontWeight: 600 }}>
                                        {notifying ? <Loader2 size={16} className="animate-spin" /> : 'Oui, Envoyer'}
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <button onClick={() => setShowConfirmNotif(true)} disabled={impayesCount === 0}
                                style={{ width: '100%', padding: '12px', borderRadius: 8, background: '#f59e0b', color: '#fff', fontSize: 14, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: impayesCount === 0 ? 0.5 : 1 }}>
                                <MessageSquare size={18} /> Envoyer les rappels maintenant
                            </button>
                        )}
                    </motion.div>

                    {/* GÉNÉRATION EN MASSE */}
                    <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
                        style={{ background: '#fff', borderRadius: 12, padding: 24, boxShadow: '0 1px 3px rgba(0,0,0,0.04)', border: '1px solid #e2e8f0' }}>
                        <h2 style={{ fontSize: 16, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}><FilePlus size={18} color="#8b5cf6" /> Génération de Factures en Masse</h2>
                        
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
                            <div>
                                <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 4, display: 'block' }}>Classe</label>
                                <select value={genData.classe_id} onChange={e => setGenData({...genData, classe_id: e.target.value})} style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13, background: '#fff' }}>
                                    <option value="">Sélectionner...</option>
                                    {classes.map(c => <option key={c.classe_id} value={c.classe_id}>{c.libelle || c.code}</option>)}
                                </select>
                            </div>
                            <div>
                                <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 4, display: 'block' }}>Type de Frais</label>
                                <select value={genData.type_frais_id} onChange={e => setGenData({...genData, type_frais_id: e.target.value})} style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13, background: '#fff' }}>
                                    <option value="">Sélectionner...</option>
                                    {typesFrais.map(t => <option key={t.type_frais_id} value={t.type_frais_id}>{t.libelle}</option>)}
                                </select>
                            </div>
                            <div>
                                <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 4, display: 'block' }}>Montant Total (GNF)</label>
                                <input type="number" value={genData.montant} onChange={e => setGenData({...genData, montant: e.target.value})} placeholder="Ex: 1500000" style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13, outline: 'none' }} />
                            </div>
                            <div>
                                <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 4, display: 'block' }}>Nombre d'échéances</label>
                                <select value={genData.nb_echeances} onChange={e => setGenData({...genData, nb_echeances: e.target.value})} style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13, background: '#fff' }}>
                                    <option value="1">1 (Paiement unique)</option>
                                    <option value="2">2 mensualités</option>
                                    <option value="3">3 trimestrialités</option>
                                    <option value="9">9 mensualités</option>
                                </select>
                            </div>
                        </div>

                        <button onClick={handleGenerateFactures} disabled={generating}
                            style={{ width: '100%', padding: '12px', borderRadius: 8, background: '#8b5cf6', color: '#fff', fontSize: 14, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                            {generating ? <Loader2 size={18} className="animate-spin" /> : <CheckCircle2 size={18} />} Générer les factures
                        </button>
                    </motion.div>
                </div>
            </div>
            
            <style>{`.animate-spin { animation: spin 1s linear infinite; } @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
        </div>
    );
}
