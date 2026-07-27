'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Calendar, Plus, Search, Filter, Clock, MapPin, Users,
  CheckCircle, AlertCircle, Edit, Trash2, X, Sparkles, ChevronRight, Tag, Megaphone
} from 'lucide-react';
import api from '@/lib/api';
import { useApp } from '@/context/AppContext';
import Link from 'next/link';

interface EvenementItem {
  evenement_id: number;
  etablissement_id: number;
  titre: string;
  description?: string;
  type_evenement: string;
  date_debut: string;
  date_fin?: string;
  heure_debut?: string;
  heure_fin?: string;
  lieu?: string;
  cible: string;
  couleur?: string;
  statut: string;
  created_by?: string;
  created_date?: string;
}

const TYPES_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  REUNION: { label: 'Réunion', color: '#3b82f6', bg: '#eff6ff' },
  EXAMEN: { label: 'Examen / Évaluation', color: '#ef4444', bg: '#fef2f2' },
  FETE: { label: 'Célébration / Fête', color: '#ec4899', bg: '#fdf2f8' },
  INTERCLASSE: { label: 'Compétition Interclasse', color: '#8b5cf6', bg: '#f5f3ff' },
  CONGE: { label: 'Congé / Vacances', color: '#f59e0b', bg: '#fffbeb' },
  JOURNEE_PEDAGOGIQUE: { label: 'Journée Pédagogique', color: '#10b981', bg: '#ecfdf5' },
  SPORT: { label: 'Événement Sportif', color: '#06b6d4', bg: '#ecfeff' },
  AUTRE: { label: 'Autre Événement', color: '#64748b', bg: '#f8fafc' },
};

const CIBLES_CONFIG: Record<string, string> = {
  TOUS: 'Toute la communauté',
  PARENTS: 'Parents d\'élèves',
  ENSEIGNANTS: 'Corps enseignant',
  ELEVES: 'Élèves',
  PERSONNEL: 'Personnel administratif',
};

export default function EvenementsPage() {
  const { etablissementId } = useApp();
  const [evenements, setEvenements] = useState<EvenementItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQ, setSearchQ] = useState('');
  const [filterType, setFilterType] = useState<string>('TOUS');
  const [filterStatut, setFilterStatut] = useState<string>('TOUS');
  
  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [editingEvt, setEditingEvt] = useState<EvenementItem | null>(null);

  // Toast state
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };
  const [submitting, setSubmitting] = useState(false);

  // Form state
  const [titre, setTitre] = useState('');
  const [description, setDescription] = useState('');
  const [typeEvenement, setTypeEvenement] = useState('REUNION');
  const [dateDebut, setDateDebut] = useState('');
  const [dateFin, setDateFin] = useState('');
  const [heureDebut, setHeureDebut] = useState('');
  const [heureFin, setHeureFin] = useState('');
  const [lieu, setLieu] = useState('');
  const [cible, setCible] = useState('TOUS');
  const [statut, setStatut] = useState('PLANIFIE');

  const loadEvenements = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get(`/api/evenements?etablissement_id=${etablissementId}`);
      setEvenements(res.data || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [etablissementId]);

  useEffect(() => {
    loadEvenements();
  }, [loadEvenements]);

  const openCreateModal = () => {
    setEditingEvt(null);
    setTitre('');
    setDescription('');
    setTypeEvenement('REUNION');
    const today = new Date().toISOString().split('T')[0];
    setDateDebut(today);
    setDateFin('');
    setHeureDebut('09:00');
    setHeureFin('11:00');
    setLieu('');
    setCible('TOUS');
    setStatut('PLANIFIE');
    setShowModal(true);
  };

  const openEditModal = (evt: EvenementItem) => {
    setEditingEvt(evt);
    setTitre(evt.titre);
    setDescription(evt.description || '');
    setTypeEvenement(evt.type_evenement);
    setDateDebut(evt.date_debut || '');
    setDateFin(evt.date_fin || '');
    setHeureDebut(evt.heure_debut || '');
    setHeureFin(evt.heure_fin || '');
    setLieu(evt.lieu || '');
    setCible(evt.cible || 'TOUS');
    setStatut(evt.statut || 'PLANIFIE');
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!titre || !dateDebut) return;

    setSubmitting(true);
    try {
      const payload = {
        etablissement_id: etablissementId,
        titre,
        description,
        type_evenement: typeEvenement,
        date_debut: dateDebut,
        date_fin: dateFin || null,
        heure_debut: heureDebut || null,
        heure_fin: heureFin || null,
        lieu,
        cible,
        statut,
        couleur: TYPES_CONFIG[typeEvenement]?.color || '#3b82f6'
      };

      if (editingEvt) {
        await api.put(`/api/evenements/${editingEvt.evenement_id}`, payload);
        showToast('Événement modifié avec succès');
      } else {
        await api.post('/api/evenements', payload);
        showToast('Événement créé avec succès');
      }

      setShowModal(false);
      loadEvenements();
    } catch (err) {
      console.error(err);
      showToast('Erreur lors de l\'enregistrement de l\'événement', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Voulez-vous vraiment supprimer cet événement ?')) return;
    try {
      await api.delete(`/api/evenements/${id}`);
      showToast('Événement supprimé avec succès');
      loadEvenements();
    } catch (err) {
      console.error(err);
      showToast('Erreur lors de la suppression', 'error');
    }
  };

  // Filtered list
  const filteredEvenements = evenements.filter(e => {
    const matchSearch = e.titre.toLowerCase().includes(searchQ.toLowerCase()) ||
                        (e.description && e.description.toLowerCase().includes(searchQ.toLowerCase())) ||
                        (e.lieu && e.lieu.toLowerCase().includes(searchQ.toLowerCase()));
    const matchType = filterType === 'TOUS' || e.type_evenement === filterType;
    const matchStatut = filterStatut === 'TOUS' || e.statut === filterStatut;
    return matchSearch && matchType && matchStatut;
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      
      {/* Breadcrumb & Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <div className="breadcrumb" style={{ marginBottom: '8px' }}>
            <Link href="/dashboard">Dashboard</Link>
            <ChevronRight size={14} />
            <span>Gestion des Événements</span>
          </div>
          <h1 style={{ fontSize: '28px', fontWeight: 800, margin: 0, color: 'var(--text-primary)' }}>
            Agenda & Événements Scolaires
          </h1>
          <p style={{ color: 'var(--text-secondary)', margin: '4px 0 0 0', fontSize: '14px' }}>
            Planifiez, organisez et suivez tous les événements institutionnels et pédagogiques.
          </p>
        </div>

        <button 
          onClick={openCreateModal}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: '8px',
            padding: '12px 24px', borderRadius: '12px', background: 'linear-gradient(135deg, #3b82f6, #1d4ed8)',
            color: 'white', fontWeight: 700, fontSize: '14px', border: 'none', cursor: 'pointer',
            boxShadow: '0 4px 14px rgba(59,130,246,0.4)', transition: 'transform 0.2s'
          }}
        >
          <Plus size={18} /> Nouvel Événement
        </button>
      </div>

      {/* Filters Bar */}
      <div className="card" style={{ padding: '16px 24px' }}>
        <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
          
          <div style={{ flex: 1, minWidth: '240px', position: 'relative' }}>
            <Search size={18} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input 
              type="text"
              placeholder="Rechercher un événement, lieu..."
              value={searchQ}
              onChange={e => setSearchQ(e.target.value)}
              style={{
                width: '100%', padding: '10px 14px 10px 42px', borderRadius: '10px',
                border: '1px solid var(--border-color)', background: 'var(--bg-card)', fontSize: '14px'
              }}
            />
          </div>

          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            <select 
              value={filterType}
              onChange={e => setFilterType(e.target.value)}
              style={{ padding: '10px 14px', borderRadius: '10px', border: '1px solid var(--border-color)', background: 'var(--bg-card)', fontSize: '14px' }}
            >
              <option value="TOUS">Tous les types</option>
              {Object.keys(TYPES_CONFIG).map(k => (
                <option key={k} value={k}>{TYPES_CONFIG[k].label}</option>
              ))}
            </select>

            <select 
              value={filterStatut}
              onChange={e => setFilterStatut(e.target.value)}
              style={{ padding: '10px 14px', borderRadius: '10px', border: '1px solid var(--border-color)', background: 'var(--bg-card)', fontSize: '14px' }}
            >
              <option value="TOUS">Tous les statuts</option>
              <option value="PLANIFIE">Planifié</option>
              <option value="EN_COURS">En cours</option>
              <option value="TERMINE">Terminé</option>
              <option value="ANNULE">Annulé</option>
            </select>
          </div>

        </div>
      </div>

      {/* Events Grid */}
      {loading ? (
        <div style={{ padding: '48px', textAlign: 'center', color: 'var(--text-muted)' }}>
          Chargement des événements...
        </div>
      ) : filteredEvenements.length === 0 ? (
        <div className="card" style={{ padding: '48px', textAlign: 'center' }}>
          <Calendar size={48} color="var(--text-muted)" style={{ margin: '0 auto 16px' }} />
          <h3>Aucun événement trouvé</h3>
          <p style={{ color: 'var(--text-muted)' }}>Créez un nouvel événement ou ajustez vos critères de recherche.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '20px' }}>
          {filteredEvenements.map((evt, i) => {
            const typeConf = TYPES_CONFIG[evt.type_evenement] || TYPES_CONFIG.AUTRE;
            const dateObj = new Date(evt.date_debut);
            const day = dateObj.getDate();
            const month = dateObj.toLocaleDateString('fr-FR', { month: 'short' }).toUpperCase();
            const year = dateObj.getFullYear();

            return (
              <motion.div 
                key={evt.evenement_id}
                className="card"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                style={{
                  display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
                  borderTop: `4px solid ${typeConf.color}`, padding: '20px'
                }}
              >
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '14px' }}>
                    <div style={{
                      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                      width: '54px', height: '54px', borderRadius: '12px', background: typeConf.bg,
                      border: `1px solid ${typeConf.color}30`
                    }}>
                      <span style={{ fontSize: '18px', fontWeight: 800, color: typeConf.color, lineHeight: 1 }}>{day}</span>
                      <span style={{ fontSize: '10px', fontWeight: 700, color: typeConf.color }}>{month}</span>
                    </div>

                    <div style={{ display: 'flex', gap: '6px' }}>
                      <span className="badge" style={{ background: typeConf.bg, color: typeConf.color, border: `1px solid ${typeConf.color}30` }}>
                        {typeConf.label}
                      </span>
                    </div>
                  </div>

                  <h3 style={{ fontSize: '16px', fontWeight: 700, margin: '0 0 8px 0', color: 'var(--text-primary)' }}>
                    {evt.titre}
                  </h3>

                  {evt.description && (
                    <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: '0 0 16px 0', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                      {evt.description}
                    </p>
                  )}

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '12px', color: 'var(--text-muted)' }}>
                    {evt.heure_debut && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Clock size={14} color={typeConf.color} />
                        <span>{evt.heure_debut} {evt.heure_fin ? `à ${evt.heure_fin}` : ''}</span>
                      </div>
                    )}
                    {evt.lieu && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <MapPin size={14} color={typeConf.color} />
                        <span>{evt.lieu}</span>
                      </div>
                    )}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Users size={14} color={typeConf.color} />
                      <span>Cible : {CIBLES_CONFIG[evt.cible] || evt.cible}</span>
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '20px', paddingTop: '12px', borderTop: '1px solid var(--border-light)' }}>
                  <span className={`badge ${evt.statut === 'PUBLIE' ? 'badge-success' : evt.statut === 'EN_COURS' ? 'badge-success' : evt.statut === 'TERMINE' ? 'badge-info' : evt.statut === 'ANNULE' ? 'badge-danger' : 'badge-warning'}`}>
                    {evt.statut === 'PUBLIE' ? 'Publié & Notifié' : evt.statut}
                  </span>

                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    {evt.statut !== 'PUBLIE' && (
                      <button 
                        onClick={async () => {
                          try {
                            await api.post(`/api/evenements/${evt.evenement_id}/publier`);
                            showToast('Événement publié ! Les destinataires ont été notifiés.');
                            setEvenements(prev => prev.map(item => item.evenement_id === evt.evenement_id ? { ...item, statut: 'PUBLIE' } : item));
                            loadEvenements();
                          } catch { showToast('Erreur lors de la publication', 'error'); }
                        }}
                        style={{ border: 'none', background: '#ecfdf5', color: '#059669', padding: '6px 12px', borderRadius: '8px', cursor: 'pointer', fontWeight: 700, fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}
                      >
                        <Megaphone size={14} /> Publier
                      </button>
                    )}
                    <button 
                      onClick={() => openEditModal(evt)}
                      style={{ border: 'none', background: 'var(--bg-light)', padding: '6px 10px', borderRadius: '8px', cursor: 'pointer', color: 'var(--text-primary)' }}
                      title="Modifier"
                    >
                      <Edit size={14} />
                    </button>
                    <button 
                      onClick={() => handleDelete(evt.evenement_id)}
                      style={{ border: 'none', background: '#fef2f2', padding: '6px 10px', borderRadius: '8px', cursor: 'pointer', color: '#ef4444' }}
                      title="Supprimer"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>

              </motion.div>
            );
          })}
        </div>
      )}

      {/* Modal Modern Creation/Edition (Haute Lisibilité) */}
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
              width: '100%', maxWidth: '640px', background: '#ffffff', color: '#0f172a',
              borderRadius: '20px', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
              overflow: 'hidden', border: '1px solid #cbd5e1'
            }}
          >
            <div style={{ padding: '24px', background: 'linear-gradient(135deg, #0f172a, #1e293b)', color: '#ffffff', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'linear-gradient(135deg, #3b82f6, #1d4ed8)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white' }}>
                  <Calendar size={20} />
                </div>
                <h2 style={{ fontSize: '20px', fontWeight: 800, margin: 0, color: '#ffffff' }}>
                  {editingEvt ? 'Modifier l\'Événement' : 'Créer un Événement'}
                </h2>
              </div>
              <button onClick={() => setShowModal(false)} style={{ border: 'none', background: 'rgba(255,255,255,0.1)', color: '#ffffff', width: '32px', height: '32px', borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSubmit} style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{ fontSize: '13px', fontWeight: 700, color: '#1e293b', marginBottom: '6px', display: 'block' }}>
                  Titre de l'événement *
                </label>
                <input 
                  type="text" 
                  required
                  placeholder="Ex: Réunion d'orientation des parents"
                  value={titre}
                  onChange={e => setTitre(e.target.value)}
                  style={{ width: '100%', padding: '12px 14px', borderRadius: '10px', border: '1px solid #cbd5e1', background: '#ffffff', color: '#0f172a', fontSize: '14px', outline: 'none' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div>
                  <label style={{ fontSize: '13px', fontWeight: 700, color: '#1e293b', marginBottom: '6px', display: 'block' }}>
                    Type d'événement
                  </label>
                  <select 
                    value={typeEvenement}
                    onChange={e => setTypeEvenement(e.target.value)}
                    style={{ width: '100%', padding: '12px 14px', borderRadius: '10px', border: '1px solid #cbd5e1', background: '#ffffff', color: '#0f172a', fontSize: '14px', outline: 'none' }}
                  >
                    {Object.keys(TYPES_CONFIG).map(k => (
                      <option key={k} value={k}>{TYPES_CONFIG[k].label}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{ fontSize: '13px', fontWeight: 700, color: '#1e293b', marginBottom: '6px', display: 'block' }}>
                    Cible / Audience
                  </label>
                  <select 
                    value={cible}
                    onChange={e => setCible(e.target.value)}
                    style={{ width: '100%', padding: '12px 14px', borderRadius: '10px', border: '1px solid #cbd5e1', background: '#ffffff', color: '#0f172a', fontSize: '14px', outline: 'none' }}
                  >
                    {Object.keys(CIBLES_CONFIG).map(k => (
                      <option key={k} value={k}>{CIBLES_CONFIG[k]}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div>
                  <label style={{ fontSize: '13px', fontWeight: 700, color: '#1e293b', marginBottom: '6px', display: 'block' }}>
                    Date Début *
                  </label>
                  <input 
                    type="date"
                    required
                    value={dateDebut}
                    onChange={e => setDateDebut(e.target.value)}
                    style={{ width: '100%', padding: '12px 14px', borderRadius: '10px', border: '1px solid #cbd5e1', background: '#ffffff', color: '#0f172a', fontSize: '14px', outline: 'none' }}
                  />
                </div>

                <div>
                  <label style={{ fontSize: '13px', fontWeight: 700, color: '#1e293b', marginBottom: '6px', display: 'block' }}>
                    Date Fin (optionnel)
                  </label>
                  <input 
                    type="date"
                    value={dateFin}
                    onChange={e => setDateFin(e.target.value)}
                    style={{ width: '100%', padding: '12px 14px', borderRadius: '10px', border: '1px solid #cbd5e1', background: '#ffffff', color: '#0f172a', fontSize: '14px', outline: 'none' }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>
                <div>
                  <label style={{ fontSize: '13px', fontWeight: 700, color: '#1e293b', marginBottom: '6px', display: 'block' }}>
                    Heure Début
                  </label>
                  <input 
                    type="time"
                    value={heureDebut}
                    onChange={e => setHeureDebut(e.target.value)}
                    style={{ width: '100%', padding: '12px 14px', borderRadius: '10px', border: '1px solid #cbd5e1', background: '#ffffff', color: '#0f172a', fontSize: '14px', outline: 'none' }}
                  />
                </div>

                <div>
                  <label style={{ fontSize: '13px', fontWeight: 700, color: '#1e293b', marginBottom: '6px', display: 'block' }}>
                    Heure Fin
                  </label>
                  <input 
                    type="time"
                    value={heureFin}
                    onChange={e => setHeureFin(e.target.value)}
                    style={{ width: '100%', padding: '12px 14px', borderRadius: '10px', border: '1px solid #cbd5e1', background: '#ffffff', color: '#0f172a', fontSize: '14px', outline: 'none' }}
                  />
                </div>

                <div>
                  <label style={{ fontSize: '13px', fontWeight: 700, color: '#1e293b', marginBottom: '6px', display: 'block' }}>
                    Statut
                  </label>
                  <select 
                    value={statut}
                    onChange={e => setStatut(e.target.value)}
                    style={{ width: '100%', padding: '12px 14px', borderRadius: '10px', border: '1px solid #cbd5e1', background: '#ffffff', color: '#0f172a', fontSize: '14px', outline: 'none' }}
                  >
                    <option value="PLANIFIE">Planifié</option>
                    <option value="EN_COURS">En cours</option>
                    <option value="TERMINE">Terminé</option>
                    <option value="ANNULE">Annulé</option>
                  </select>
                </div>
              </div>

              <div>
                <label style={{ fontSize: '13px', fontWeight: 700, color: '#1e293b', marginBottom: '6px', display: 'block' }}>
                  Lieu (Salle / Emplacement)
                </label>
                <input 
                  type="text"
                  placeholder="Ex: Amphi A, Cour Principale, Visioconférence"
                  value={lieu}
                  onChange={e => setLieu(e.target.value)}
                  style={{ width: '100%', padding: '12px 14px', borderRadius: '10px', border: '1px solid #cbd5e1', background: '#ffffff', color: '#0f172a', fontSize: '14px', outline: 'none' }}
                />
              </div>

              <div>
                <label style={{ fontSize: '13px', fontWeight: 700, color: '#1e293b', marginBottom: '6px', display: 'block' }}>
                  Description / Ordre du jour
                </label>
                <textarea 
                  rows={3}
                  placeholder="Détails de l'événement..."
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
                  {submitting ? 'Enregistrement...' : editingEvt ? 'Mettre à jour' : 'Créer l\'événement'}
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
              {toast.type === 'success' ? <CheckCircle size={20} color="white" /> : <AlertCircle size={20} color="white" />}
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
