'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Activity, Clock, UserPlus, CreditCard, AlertTriangle, FileText,
  Calendar, CheckCircle2, ChevronRight, Search, Plus, Edit, Trash2, X, RefreshCw, Megaphone
} from 'lucide-react';
import api from '@/lib/api';
import { useApp } from '@/context/AppContext';
import Link from 'next/link';

interface ActivityItem {
  activite_id?: number;
  type?: string;
  type_activite?: string;
  titre: string;
  description: string;
  heure?: string;
  icone?: string;
  couleur?: string;
  est_manuel?: boolean;
  est_actif?: string;
  statut?: string;
  date_activite?: string;
}

const TYPES_ACTIVITES: Record<string, { label: string; color: string; bg: string }> = {
  ACADEMIQUE: { label: 'Académique / Cours', color: '#3b82f6', bg: '#eff6ff' },
  PARASCOLAIRE: { label: 'Parascolaire / Sport', color: '#10b981', bg: '#ecfdf5' },
  REUNION: { label: 'Réunion / Rassemblement', color: '#8b5cf6', bg: '#f5f3ff' },
  PAUSE: { label: 'Pause / Récréation / Repas', color: '#f59e0b', bg: '#fffbeb' },
  GENERALE: { label: 'Activité Générale', color: '#64748b', bg: '#f8fafc' },
};

const ICONES_OPTIONS = [
  { value: 'Activity', label: 'Activité' },
  { value: 'Clock', label: 'Horloge' },
  { value: 'Calendar', label: 'Calendrier' },
  { value: 'UserPlus', label: 'Inscription' },
  { value: 'CreditCard', label: 'Paiement' },
  { value: 'AlertTriangle', label: 'Incident' },
  { value: 'FileText', label: 'Document' },
];

export default function ActivitesPage() {
  const { etablissementId, anneeId } = useApp();
  const [activites, setActivites] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQ, setSearchQ] = useState('');

  // Modal State
  const [showModal, setShowModal] = useState(false);
  const [editingAct, setEditingAct] = useState<ActivityItem | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Toast state
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  // Form State
  const [titre, setTitre] = useState('');
  const [description, setDescription] = useState('');
  const [heure, setHeure] = useState('08:00');
  const [typeActivite, setTypeActivite] = useState('GENERALE');
  const [icone, setIcone] = useState('Activity');
  const [couleur, setCouleur] = useState('#3b82f6');
  const [dateActivite, setDateActivite] = useState('');

  const loadActivites = useCallback(async () => {
    setLoading(true);
    try {
      // 1. Manually added activities from /api/activites
      const resManual = await api.get(`/api/activites?etablissement_id=${etablissementId}`);
      const manualActs: ActivityItem[] = (resManual.data || []).map((m: any) => ({
        activite_id: m.activite_id,
        type: m.type_activite || 'GENERALE',
        titre: m.titre,
        description: m.description || '',
        heure: m.heure || '08:00',
        icone: m.icone || 'Activity',
        couleur: m.couleur || '#3b82f6',
        est_manuel: true,
        est_actif: m.est_actif || 'N',
        statut: m.statut || (m.est_actif === 'O' ? 'PUBLIE' : 'BROUILLON'),
        date_activite: m.date_activite
      }));

      // 2. Dashboard activities (includes automatic logs)
      const resDash = await api.get(`/api/dashboard?etablissement_id=${etablissementId}&annee_id=${anneeId}`);
      const dashActs: ActivityItem[] = resDash.data?.activites_du_jour || [];

      // Merge avoiding duplicates
      const autoActs = dashActs.filter(a => !a.est_manuel);
      setActivites([...manualActs, ...autoActs]);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [etablissementId, anneeId]);

  useEffect(() => {
    loadActivites();
    const today = new Date().toISOString().split('T')[0];
    setDateActivite(today);
  }, [loadActivites]);

  const openCreateModal = () => {
    setEditingAct(null);
    setTitre('');
    setDescription('');
    setHeure('08:00');
    setTypeActivite('GENERALE');
    setIcone('Activity');
    setCouleur('#3b82f6');
    const today = new Date().toISOString().split('T')[0];
    setDateActivite(today);
    setShowModal(true);
  };

  const openEditModal = (act: ActivityItem) => {
    setEditingAct(act);
    setTitre(act.titre);
    setDescription(act.description || '');
    setHeure(act.heure || '08:00');
    setTypeActivite(act.type || 'GENERALE');
    setIcone(act.icone || 'Activity');
    setCouleur(act.couleur || '#3b82f6');
    setDateActivite(act.date_activite || new Date().toISOString().split('T')[0]);
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!titre) return;

    setSubmitting(true);
    try {
      const payload = {
        etablissement_id: etablissementId,
        titre,
        description,
        heure,
        type_activite: typeActivite,
        icone,
        couleur: TYPES_ACTIVITES[typeActivite]?.color || couleur,
        date_activite: dateActivite || new Date().toISOString().split('T')[0]
      };

      if (editingAct && editingAct.activite_id) {
        await api.put(`/api/activites/${editingAct.activite_id}`, payload);
        showToast('Activité modifiée avec succès');
      } else {
        await api.post('/api/activites', payload);
        showToast('Activité créée avec succès');
      }

      setShowModal(false);
      loadActivites();
    } catch (err) {
      console.error(err);
      showToast('Erreur lors de l\'enregistrement de l\'activité', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Voulez-vous vraiment supprimer cette activité ?')) return;
    try {
      await api.delete(`/api/activites/${id}`);
      showToast('Activité supprimée avec succès');
      loadActivites();
    } catch (err) {
      console.error(err);
      showToast('Erreur lors de la suppression', 'error');
    }
  };

  const getIconComponent = (iconName?: string) => {
    switch (iconName) {
      case 'UserPlus': return UserPlus;
      case 'CreditCard': return CreditCard;
      case 'AlertTriangle': return AlertTriangle;
      case 'FileText': return FileText;
      case 'Calendar': return Calendar;
      case 'Clock': return Clock;
      default: return Activity;
    }
  };

  const filteredActivites = activites.filter(a =>
    a.titre.toLowerCase().includes(searchQ.toLowerCase()) ||
    a.description.toLowerCase().includes(searchQ.toLowerCase())
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <div className="breadcrumb" style={{ marginBottom: '8px' }}>
            <Link href="/dashboard">Dashboard</Link>
            <ChevronRight size={14} />
            <span>Activités du Jour</span>
          </div>
          <h1 style={{ fontSize: '28px', fontWeight: 800, margin: 0, color: 'var(--text-primary)' }}>
            Gestion & Journal des Activités du Jour
          </h1>
          <p style={{ color: 'var(--text-secondary)', margin: '4px 0 0 0', fontSize: '14px' }}>
            Planifiez le programme de la journée et suivez toutes les opérations en temps réel.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '12px' }}>
          <button 
            onClick={loadActivites}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '8px',
              padding: '10px 18px', borderRadius: '12px', border: '1px solid var(--border-color)',
              background: 'var(--bg-card)', color: 'var(--text-primary)', fontWeight: 600, cursor: 'pointer'
            }}
          >
            <RefreshCw size={16} /> Actualiser
          </button>

          <button 
            onClick={openCreateModal}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '8px',
              padding: '10px 22px', borderRadius: '12px', background: 'linear-gradient(135deg, #3b82f6, #1d4ed8)',
              color: 'white', fontWeight: 700, border: 'none', cursor: 'pointer',
              boxShadow: '0 4px 14px rgba(59,130,246,0.4)'
            }}
          >
            <Plus size={18} /> Nouvelle Activité
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="card" style={{ padding: '16px 24px' }}>
        <div style={{ position: 'relative', maxWidth: '400px' }}>
          <Search size={18} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input 
            type="text"
            placeholder="Rechercher une activité..."
            value={searchQ}
            onChange={e => setSearchQ(e.target.value)}
            style={{
              width: '100%', padding: '10px 14px 10px 42px', borderRadius: '10px',
              border: '1px solid var(--border-color)', background: 'var(--bg-card)', fontSize: '14px'
            }}
          />
        </div>
      </div>

      {/* Activities List */}
      <div className="card" style={{ padding: '24px' }}>
        {loading ? (
          <div style={{ padding: '48px', textAlign: 'center', color: 'var(--text-muted)' }}>
            Chargement du journal d'activités...
          </div>
        ) : filteredActivites.length === 0 ? (
          <div style={{ padding: '48px', textAlign: 'center' }}>
            <Activity size={48} color="var(--text-muted)" style={{ margin: '0 auto 16px' }} />
            <h3>Aucune activité enregistrée pour aujourd'hui</h3>
            <p style={{ color: 'var(--text-muted)' }}>Cliquez sur "+ Nouvelle Activité" pour planifier une nouvelle tâche du jour.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {filteredActivites.map((act, i) => {
              const IconComp = getIconComponent(act.icone);
              const color = act.couleur || '#3b82f6';
              return (
                <motion.div 
                  key={i}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.05 }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '16px', padding: '16px 20px',
                    borderRadius: '14px', background: 'var(--bg-light)', border: '1px solid var(--border-light)'
                  }}
                >
                  <div style={{
                    width: '48px', height: '48px', borderRadius: '12px',
                    background: `${color}15`, color: color,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
                  }}>
                    <IconComp size={24} />
                  </div>

                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
                      <h4 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)' }}>
                        {act.titre}
                      </h4>
                      {act.est_manuel ? (
                        <span className="badge badge-primary" style={{ fontSize: '11px', padding: '2px 8px' }}>Programme</span>
                      ) : (
                        <span className="badge badge-info" style={{ fontSize: '11px', padding: '2px 8px' }}>Système Log</span>
                      )}
                    </div>
                    <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-secondary)' }}>
                      {act.description}
                    </p>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: 'var(--text-muted)', fontWeight: 700 }}>
                      <Clock size={14} color={color} />
                      <span>{act.heure || 'Toute la journée'}</span>
                    </div>

                    {act.est_manuel && act.activite_id && (
                      <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                        {act.est_actif === 'O' || act.statut === 'PUBLIE' ? (
                          <span className="badge badge-success" style={{ fontSize: '11px', padding: '4px 10px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <CheckCircle2 size={12} /> Publié & Notifié
                          </span>
                        ) : (
                          <button 
                            onClick={async () => {
                              try {
                                const res = await api.post(`/api/activites/${act.activite_id}/publier`);
                                showToast('Activité publiée ! Les destinataires ont été notifiés.');
                                setActivites(prev => prev.map(item => item.activite_id === act.activite_id ? { ...item, est_actif: 'O', statut: 'PUBLIE' } : item));
                                loadActivites();
                              } catch { showToast('Erreur lors de la publication', 'error'); }
                            }}
                            style={{ border: 'none', background: '#ecfdf5', color: '#059669', padding: '6px 12px', borderRadius: '8px', cursor: 'pointer', fontWeight: 700, fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}
                          >
                            <Megaphone size={14} /> Publier
                          </button>
                        )}
                        <button 
                          onClick={() => openEditModal(act)}
                          style={{ border: 'none', background: 'var(--bg-card)', padding: '6px 10px', borderRadius: '8px', cursor: 'pointer', color: 'var(--text-primary)' }}
                          title="Modifier"
                        >
                          <Edit size={14} />
                        </button>
                        <button 
                          onClick={() => handleDelete(act.activite_id!)}
                          style={{ border: 'none', background: '#fef2f2', padding: '6px 10px', borderRadius: '8px', cursor: 'pointer', color: '#ef4444' }}
                          title="Supprimer"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal Haute Lisibilité (Fond blanc pur & texte très contrasté) */}
      {showModal && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 1000,
          background: 'rgba(15, 23, 42, 0.65)', backdropFilter: 'blur(8px)',
          display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px'
        }} onClick={() => setShowModal(false)}>
          
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            onClick={e => e.stopPropagation()}
            style={{
              width: '100%', maxWidth: '560px', background: '#ffffff', color: '#0f172a',
              borderRadius: '20px', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
              overflow: 'hidden', border: '1px solid #cbd5e1'
            }}
          >
            <div style={{ padding: '24px', background: 'linear-gradient(135deg, #0f172a, #1e293b)', color: '#ffffff', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ width: '38px', height: '38px', borderRadius: '10px', background: 'rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Activity size={20} color="#ffffff" />
                </div>
                <h2 style={{ fontSize: '18px', fontWeight: 800, margin: 0, color: '#ffffff' }}>
                  {editingAct ? 'Modifier l\'Activité' : 'Ajouter une Activité du Jour'}
                </h2>
              </div>
              <button onClick={() => setShowModal(false)} style={{ border: 'none', background: 'rgba(255,255,255,0.1)', color: '#ffffff', width: '32px', height: '32px', borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSubmit} style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{ fontSize: '13px', fontWeight: 700, color: '#1e293b', marginBottom: '6px', display: 'block' }}>
                  Titre de l'activité *
                </label>
                <input 
                  type="text" 
                  required
                  placeholder="Ex: Levée du Drapeau, Pause Déjeuner, Contrôle général"
                  value={titre}
                  onChange={e => setTitre(e.target.value)}
                  style={{ width: '100%', padding: '12px 14px', borderRadius: '10px', border: '1px solid #cbd5e1', background: '#ffffff', color: '#0f172a', fontSize: '14px', outline: 'none' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div>
                  <label style={{ fontSize: '13px', fontWeight: 700, color: '#1e293b', marginBottom: '6px', display: 'block' }}>
                    Heure (HH:MM)
                  </label>
                  <input 
                    type="time" 
                    value={heure}
                    onChange={e => setHeure(e.target.value)}
                    style={{ width: '100%', padding: '12px 14px', borderRadius: '10px', border: '1px solid #cbd5e1', background: '#ffffff', color: '#0f172a', fontSize: '14px', outline: 'none' }}
                  />
                </div>

                <div>
                  <label style={{ fontSize: '13px', fontWeight: 700, color: '#1e293b', marginBottom: '6px', display: 'block' }}>
                    Type d'activité
                  </label>
                  <select 
                    value={typeActivite}
                    onChange={e => setTypeActivite(e.target.value)}
                    style={{ width: '100%', padding: '12px 14px', borderRadius: '10px', border: '1px solid #cbd5e1', background: '#ffffff', color: '#0f172a', fontSize: '14px', outline: 'none' }}
                  >
                    {Object.keys(TYPES_ACTIVITES).map(k => (
                      <option key={k} value={k}>{TYPES_ACTIVITES[k].label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div>
                  <label style={{ fontSize: '13px', fontWeight: 700, color: '#1e293b', marginBottom: '6px', display: 'block' }}>
                    Icône
                  </label>
                  <select 
                    value={icone}
                    onChange={e => setIcone(e.target.value)}
                    style={{ width: '100%', padding: '12px 14px', borderRadius: '10px', border: '1px solid #cbd5e1', background: '#ffffff', color: '#0f172a', fontSize: '14px', outline: 'none' }}
                  >
                    {ICONES_OPTIONS.map(o => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{ fontSize: '13px', fontWeight: 700, color: '#1e293b', marginBottom: '6px', display: 'block' }}>
                    Date
                  </label>
                  <input 
                    type="date"
                    value={dateActivite}
                    onChange={e => setDateActivite(e.target.value)}
                    style={{ width: '100%', padding: '12px 14px', borderRadius: '10px', border: '1px solid #cbd5e1', background: '#ffffff', color: '#0f172a', fontSize: '14px', outline: 'none' }}
                  />
                </div>
              </div>

              <div>
                <label style={{ fontSize: '13px', fontWeight: 700, color: '#1e293b', marginBottom: '6px', display: 'block' }}>
                  Description / Consignes
                </label>
                <textarea 
                  rows={3}
                  placeholder="Détails de l'activité du jour..."
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  style={{ width: '100%', padding: '12px 14px', borderRadius: '10px', border: '1px solid #cbd5e1', background: '#ffffff', color: '#0f172a', fontSize: '14px', outline: 'none', resize: 'vertical' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '12px' }}>
                <button 
                  type="button" 
                  onClick={() => setShowModal(false)}
                  style={{ padding: '10px 20px', borderRadius: '10px', border: '1px solid #cbd5e1', background: '#f8fafc', color: '#334155', cursor: 'pointer', fontWeight: 700 }}
                >
                  Annuler
                </button>
                <button 
                  type="submit"
                  disabled={submitting}
                  style={{ padding: '10px 24px', borderRadius: '10px', border: 'none', background: 'linear-gradient(135deg, #3b82f6, #1d4ed8)', color: 'white', cursor: 'pointer', fontWeight: 700 }}
                >
                  {submitting ? 'Enregistrement...' : editingAct ? 'Mettre à jour' : 'Ajouter l\'activité'}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      {/* Floating Glassmorphic Toast Notification */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -40, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.9 }}
            transition={{ type: 'spring', stiffness: 400, damping: 25 }}
            style={{
              position: 'fixed', top: '24px', right: '24px', zIndex: 9999,
              background: toast.type === 'success' ? 'rgba(15, 23, 42, 0.94)' : 'rgba(153, 27, 27, 0.94)',
              backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
              color: 'white', padding: '14px 22px', borderRadius: '16px',
              boxShadow: toast.type === 'success' ? '0 16px 36px -10px rgba(16,185,129,0.5), 0 0 1px 1px rgba(255,255,255,0.1)' : '0 16px 36px -10px rgba(239,68,68,0.5)',
              border: toast.type === 'success' ? '1px solid rgba(52, 211, 153, 0.5)' : '1px solid rgba(248, 113, 113, 0.5)',
              display: 'flex', alignItems: 'center', gap: '12px', minWidth: '320px'
            }}
          >
            <div style={{
              width: '34px', height: '34px', borderRadius: '10px',
              background: toast.type === 'success' ? 'linear-gradient(135deg, #10b981, #059669)' : 'linear-gradient(135deg, #ef4444, #dc2626)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              boxShadow: '0 4px 12px rgba(0,0,0,0.2)'
            }}>
              {toast.type === 'success' ? <CheckCircle2 size={20} color="white" /> : <AlertTriangle size={20} color="white" />}
            </div>
            <div style={{ flex: 1 }}>
              <p style={{ margin: 0, fontWeight: 800, fontSize: '14px', letterSpacing: '-0.2px' }}>{toast.type === 'success' ? 'Succès' : 'Attention'}</p>
              <p style={{ margin: '2px 0 0 0', fontSize: '12px', color: '#cbd5e1', lineHeight: '1.4' }}>{toast.message}</p>
            </div>
            <button onClick={() => setToast(null)} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '4px', borderRadius: '6px', display: 'flex', alignItems: 'center' }}>
              <X size={16} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
