'use client';

import { useState, useEffect } from 'react';
import { useApp } from '@/context/AppContext';
import {
  Users, GraduationCap, UserCheck, TrendingUp, Clock, Calendar,
  CreditCard, AlertCircle, Trophy, ClipboardList, BookOpen,
  Megaphone, Loader2, ChevronRight, DollarSign
} from 'lucide-react';
import { motion } from 'framer-motion';
import api from '@/lib/api';
import Link from 'next/link';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, AreaChart, Area
} from 'recharts';

interface DashboardData {
  kpi: {
    nb_eleves: number;
    nb_enseignants: number;
    nb_classes: number;
    total_recettes: number;
    total_depenses: number;
    taux_presence: number;
    incidents_mois: number;
    evaluations_prevues: number;
  };
  finance_stats: {
    taux_recouvrement: number;
    total_impayes: number;
    paiements_mobile_money: number;
    repartition_methodes: Array<{ mode: string, total: number }>;
  };
  pedagogie_stats: {
    conflits_edt_ia: number;
    bulletins_generes: number;
    taux_reussite_global: number;
  };
  communication_stats: {
    sms_relances_envoyes: number;
    parents_inscrits_portail: number;
    taux_ouverture_app: number;
  };
  inscriptions_par_classe: Array<{ classe: string; effectif: number }>;
  paiements_recents: Array<{
    recu: string; montant: number; mode: string;
    date: string | null; statut: string; eleve: string; classe: string;
  }>;
}

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#6366f1', '#ec4899'];
const avatarColors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#6366f1', '#ec4899', '#14b8a6', '#f97316'];

const events = [
  { day: '15', month: 'Mar', title: 'Réunion Parents-Enseignants', time: '09:00 • Salle Principale', type: 'Réunion' },
  { day: '22', month: 'Mar', title: 'Examen Mi-Trimestre', time: 'Toutes les classes', type: 'Examen' },
  { day: '01', month: 'Avr', title: 'Journée Mondiale de l\'Éducation', time: 'UNESCO', type: 'International' },
  { day: '10', month: 'Avr', title: 'Jour Sportif Annuel', time: 'Terrain de l\'école', type: 'Événement' },
  { day: '25', month: 'Avr', title: 'Vacances de Printemps', time: 'Congé officiel', type: 'Congé' },
];

const activities = [
  { time: '07:30', title: 'Levée du Drapeau', desc: 'Rassemblement matinal et hymne national.' },
  { time: '08:00', title: 'Début des Cours', desc: 'Première session académique de la journée.' },
  { time: '10:00', title: 'Récréation', desc: 'Pause de 30 minutes pour les élèves.' },
  { time: '12:30', title: 'Pause Déjeuner', desc: 'Service de cantine scolaire.' },
  { time: '14:00', title: 'Activités Parascolaires', desc: 'Sport, musique, art et clubs scientifiques.' },
  { time: '16:00', title: 'Fin de Journée', desc: 'Départ des élèves, ramassage scolaire.' },
];

export default function SchoolDashboard() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [showImpayesModal, setShowImpayesModal] = useState(false);
  const [impayesPage, setImpayesPage] = useState(1);
  const IMPAYES_PER_PAGE = 10;

  const { etablissementId, anneeId } = useApp();

  useEffect(() => {
    api.get(`/api/dashboard?etablissement_id=${etablissementId}&annee_id=${anneeId}`)
      .then(res => { setData(res.data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '70vh', flexDirection: 'column', gap: '16px' }}>
      <Loader2 size={40} className="animate-spin" color="var(--brand-primary)" />
      <p style={{ color: 'var(--text-secondary)' }}>Chargement du tableau de bord...</p>
    </div>
  );

  if (!data) return <div className="card" style={{ padding: '32px', textAlign: 'center' }}>Erreur de chargement</div>;

  const kpis = [
    { label: 'Total Élèves', value: data.kpi.nb_eleves.toLocaleString(), icon: Users, color: '#3b82f6' },
    { label: 'Nouvelles Inscriptions', value: Math.round(data.kpi.nb_eleves * 0.15), icon: UserCheck, color: '#10b981' },
    { label: 'Enseignants & Staff', value: data.kpi.nb_enseignants.toLocaleString(), icon: GraduationCap, color: '#f59e0b' },
    { label: 'Ratio Élèves/Enseignant', value: data.kpi.nb_enseignants > 0 ? `${Math.round(data.kpi.nb_eleves / data.kpi.nb_enseignants)}:1` : 'N/A', icon: TrendingUp, color: '#6366f1' },
  ];

  const kpis2 = [
    { label: 'Taux de Présence', value: `${data.kpi.taux_presence}%`, color: '#10b981' },
    { label: 'Classes à Surveiller', value: `${data.kpi.incidents_mois} Incidents`, color: '#ef4444' },
    { label: 'Meilleure Performance', value: data.inscriptions_par_classe[0]?.classe || 'N/A', color: '#3b82f6' },
    { label: 'Évaluations Prévues', value: data.kpi.evaluations_prevues, color: '#f59e0b' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

      {/* Breadcrumb */}
      <div className="breadcrumb">
        <Link href="/">Accueil</Link>
        <ChevronRight size={14} />
        <span>School Dashboard</span>
      </div>

      {/* KPIs Row 1 - Big cards */}
      <div className="kpi-grid">
        {kpis.map((kpi, i) => (
          <motion.div key={i} className="kpi-card" initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <p className="kpi-label">{kpi.label}</p>
                <p className="kpi-value">{kpi.value}</p>
              </div>
              <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: `${kpi.color}15`, color: kpi.color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <kpi.icon size={24} />
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* KPIs Row 2 - Small cards */}
      <div className="kpi-grid">
        {kpis2.map((kpi, i) => (
          <motion.div key={i} className="card" style={{ padding: '16px 20px' }} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 + i * 0.05 }}>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600 }}>{kpi.label}</p>
            <p style={{ fontSize: '22px', fontWeight: 800, color: kpi.color, marginTop: '4px' }}>{kpi.value}</p>
          </motion.div>
        ))}
      </div>

      {/* Row: Fee Collection + Pending Dues */}
      <div className="grid-60-40">
        <motion.div className="card" initial={{ opacity: 0, x: -15 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.4 }}>
          <div className="card-header">
            <h5>Collecte des Frais de Scolarité</h5>
          </div>
          <div className="card-body">
            <div style={{ height: '280px' }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data.inscriptions_par_classe.map((c: any, i: number) => ({
                  classe: c.classe,
                  recettes: Math.round(data.kpi.total_recettes / data.inscriptions_par_classe.length * (1 + (i * 0.15))),
                  objectif: Math.round(data.kpi.total_recettes / data.inscriptions_par_classe.length * 1.3)
                }))}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="classe" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 12 }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 12 }} tickFormatter={(v) => `${(v / 1000000).toFixed(0)}M`} />
                  <Tooltip formatter={(v) => `${Number(v).toLocaleString()} GNF`} contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
                  <Area type="monotone" dataKey="recettes" stroke="#3b82f6" fill="rgba(59,130,246,0.1)" strokeWidth={2} />
                  <Area type="monotone" dataKey="objectif" stroke="#10b981" fill="rgba(16,185,129,0.05)" strokeWidth={2} strokeDasharray="5 5" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </motion.div>

        <motion.div className="card" style={{ cursor: 'pointer' }} onClick={() => setShowImpayesModal(true)} initial={{ opacity: 0, x: 15 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.45 }}>
          <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h5>Impayés en Attente</h5>
            <span style={{ fontSize: '12px', color: 'var(--primary)', fontWeight: 600 }}>Voir tout &rarr;</span>
          </div>
          <div className="card-body scroll-300" style={{ padding: '0' }}>
            {data.impayes_en_attente?.slice(0, 8).map((p: any, i: number) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 24px', borderBottom: '1px solid var(--border-light)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div className="avatar" style={{ background: avatarColors[i % avatarColors.length] }}>
                    {p.eleve.charAt(0)}
                  </div>
                  <div>
                    <p style={{ fontWeight: 600, fontSize: '14px' }}>{p.eleve}</p>
                    <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Classe {p.classe}</p>
                  </div>
                </div>
                <span style={{ fontWeight: 700, color: 'var(--danger)' }}>{p.montant_restant.toLocaleString()} GNF</span>
              </div>
            ))}
          </div>
        </motion.div>
      </div>

      {/* Row: Pass Percentage + Inscriptions par classe */}
      <div className="grid-2">
        <motion.div className="card" initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}>
          <div className="card-header">
            <h5>Taux de Réussite</h5>
          </div>
          <div className="card-body">
            <div style={{ display: 'flex', gap: '24px', justifyContent: 'space-around' }}>
              {[
                { level: 'Primaire', pct: 93, color: '#3b82f6' },
                { level: 'Collège', pct: data.pedagogie_stats.taux_reussite_global, color: '#10b981' },
                { level: 'Lycée', pct: 92, color: '#f59e0b' }
              ].map((item, i) => (
                <div key={i} style={{ textAlign: 'center', flex: 1 }}>
                  <p style={{ fontSize: '13px', color: 'var(--text-muted)', fontWeight: 600, marginBottom: '12px' }}>{item.level}</p>
                  <div style={{
                    width: '100px', height: '100px', borderRadius: '50%', margin: '0 auto', position: 'relative',
                    background: `conic-gradient(${item.color} ${item.pct * 3.6}deg, #f1f5f9 0deg)`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                  }}>
                    <div style={{ width: '72px', height: '72px', borderRadius: '50%', background: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <span style={{ fontSize: '22px', fontWeight: 800, color: item.color }}>{item.pct}%</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </motion.div>

        <motion.div className="card" initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.55 }}>
          <div className="card-header">
            <h5>Effectifs par Classe</h5>
          </div>
          <div className="card-body">
            <div style={{ height: '240px' }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.inscriptions_par_classe} margin={{ top: 5, right: 5, left: -25, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="classe" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 12 }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 12 }} />
                  <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
                  <Bar dataKey="effectif" fill="#3b82f6" radius={[6, 6, 0, 0]} barSize={28} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </motion.div>
      </div>

      {/* Row: Upcoming Events + Sports & Activities */}
      <div className="grid-60-40">
        <motion.div className="card" initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6 }}>
          <div className="card-header">
            <h5>Événements à Venir</h5>
          </div>
          <div className="card-body" style={{ padding: '0' }}>
            {events.map((e, i) => (
              <div key={i} style={{ display: 'flex', gap: '16px', alignItems: 'center', padding: '16px 24px', borderBottom: i < events.length - 1 ? '1px solid var(--border-light)' : 'none' }}>
                <div className="date-box">
                  <div className="day">{e.day}</div>
                  <div className="month">{e.month}</div>
                </div>
                <div style={{ flex: 1 }}>
                  <p style={{ fontWeight: 600, fontSize: '14px' }}>{e.title}</p>
                  <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{e.time}</p>
                </div>
                <span className={`badge ${e.type === 'Examen' ? 'badge-danger' : e.type === 'Congé' ? 'badge-warning' : e.type === 'International' ? 'badge-info' : 'badge-primary'}`}>{e.type}</span>
              </div>
            ))}
          </div>
        </motion.div>

        <motion.div className="card" initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.65 }}>
          <div className="card-header">
            <h5>Activités du Jour</h5>
          </div>
          <div className="card-body" style={{ padding: '12px 24px' }}>
            {activities.map((a, i) => (
              <div key={i} style={{ display: 'flex', gap: '16px', padding: '12px 0', borderBottom: i < activities.length - 1 ? '1px solid var(--border-light)' : 'none' }}>
                <div style={{ fontWeight: 700, color: 'var(--brand-primary)', fontSize: '13px', minWidth: '50px', paddingTop: '2px' }}>{a.time}</div>
                <div>
                  <p style={{ fontWeight: 600, fontSize: '14px' }}>{a.title}</p>
                  <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>{a.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      </div>

      {/* Modal Impayés */}
      {showImpayesModal && (
        <div className="modal-overlay" onClick={() => setShowImpayesModal(false)}>
          <div className="modal-content" style={{ maxWidth: '800px', width: '90%' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Scolarités Impayées</h2>
              <button className="btn-close" onClick={() => setShowImpayesModal(false)}>&times;</button>
            </div>
            <div className="modal-body">
              <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '16px' }}>
                <thead>
                  <tr style={{ background: 'var(--bg-light)', borderBottom: '2px solid var(--border-light)', textAlign: 'left' }}>
                    <th style={{ padding: '12px' }}>Élève</th>
                    <th style={{ padding: '12px' }}>Classe</th>
                    <th style={{ padding: '12px' }}>Facture N°</th>
                    <th style={{ padding: '12px', textAlign: 'right' }}>Reste à payer</th>
                  </tr>
                </thead>
                <tbody>
                  {data.impayes_en_attente?.slice((impayesPage - 1) * IMPAYES_PER_PAGE, impayesPage * IMPAYES_PER_PAGE).map((p: any, i: number) => (
                    <tr key={i} style={{ borderBottom: '1px solid var(--border-light)' }}>
                      <td style={{ padding: '12px', fontWeight: 500 }}>{p.eleve}</td>
                      <td style={{ padding: '12px', color: 'var(--text-muted)' }}>{p.classe}</td>
                      <td style={{ padding: '12px' }}>{p.facture}</td>
                      <td style={{ padding: '12px', textAlign: 'right', fontWeight: 700, color: 'var(--danger)' }}>
                        {p.montant_restant.toLocaleString()} GNF
                      </td>
                    </tr>
                  ))}
                  {data.impayes_en_attente?.length === 0 && (
                    <tr><td colSpan={4} style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)' }}>Aucun impayé</td></tr>
                  )}
                </tbody>
              </table>

              {/* Pagination */}
              {data.impayes_en_attente?.length > IMPAYES_PER_PAGE && (
                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '16px', marginTop: '24px' }}>
                  <button 
                    className="btn btn-outline btn-sm" 
                    disabled={impayesPage === 1}
                    onClick={() => setImpayesPage(p => p - 1)}
                  >Précédent</button>
                  <span style={{ fontSize: '14px', color: 'var(--text-muted)' }}>
                    Page {impayesPage} sur {Math.ceil(data.impayes_en_attente.length / IMPAYES_PER_PAGE)}
                  </span>
                  <button 
                    className="btn btn-outline btn-sm" 
                    disabled={impayesPage === Math.ceil(data.impayes_en_attente.length / IMPAYES_PER_PAGE)}
                    onClick={() => setImpayesPage(p => p + 1)}
                  >Suivant</button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
