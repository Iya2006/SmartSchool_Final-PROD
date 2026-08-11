'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { useApp } from '@/context/AppContext';
import api from '@/lib/api';
import {
  AlertTriangle,
  ArrowRight,
  ArrowUpRight,
  ArrowDownRight,
  Banknote,
  BellRing,
  BookOpen,
  Building2,
  CalendarDays,

  ChevronRight,

  CreditCard,
  GraduationCap,
  Layers3,
  Loader2,
  Megaphone,
  Radio,
  Search,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Users,
  Wallet,
  X,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
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
    repartition_methodes: { mode: string; total: number }[];
  };
  pedagogie_stats: {
    conflits_edt_ia: number;
    bulletins_generes: number;
    taux_reussite_global: number;
    taux_reussite_par_cycle: {
      cycle: string;
      taux: number;
      nb_eleves: number;
      nb_admis: number;
      classes_detail?: {
        classe_id: number;
        code: string;
        libelle: string;
        taux: number;
        nb_eleves: number;
        nb_admis: number;
      }[];
    }[];
  };
  communication_stats: {
    sms_relances_envoyes: number;
    parents_inscrits_portail: number;
    taux_ouverture_app: number;
  };
  inscriptions_par_classe: { classe: string; effectif: number }[];
  paiements_recents: {
    recu: string;
    montant: number;
    mode: string;
    date: string | null;
    statut: string;
    eleve: string;
    classe: string;
  }[];
  impayes_en_attente: {
    facture: string;
    montant_restant: number;
    statut: string;
    eleve: string;
    classe: string;
  }[];
  evenements_a_venir: {
    evenement_id: number;
    titre: string;
    description?: string;
    type_evenement: string;
    date_debut: string;
    date_fin?: string | null;
    heure_debut?: string | null;
    lieu?: string | null;
    cible?: string | null;
    couleur?: string | null;
    statut: string;
  }[];
  activites_du_jour: {
    activite_id?: number;
    type: string;
    titre: string;
    description: string;
    heure?: string | null;
    icone?: string;
    couleur?: string;
    est_manuel?: boolean;
  }[];
}

type ImpayeModalState = boolean;

const PIE_COLORS = ['#2563eb', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#ef4444'];
const ALERT_COLORS = {
  critical: '#ef4444',
  warning: '#f59e0b',
  info: '#2563eb',
  success: '#10b981',
};

function formatMoney(value: number) {
  return `${Math.round(value || 0).toLocaleString('fr-FR')} GNF`;
}

function formatTooltipMoney(value: string | number | readonly (string | number)[] | undefined) {
  const normalized = Array.isArray(value) ? Number(value[0] || 0) : Number(value || 0);
  return formatMoney(normalized);
}

function formatCompactMoney(value: number) {
  const n = Number(value || 0);
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)} Md GNF`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)} M GNF`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)} K GNF`;
  return `${n.toLocaleString('fr-FR')} GNF`;
}

function formatDate(dateValue?: string | null) {
  if (!dateValue) return 'Date non précisée';
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return dateValue;
  return date.toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function getHealthStatus(data: DashboardData) {
  if (data.kpi.incidents_mois >= 8 || data.finance_stats.total_impayes > data.kpi.total_recettes * 0.45) {
    return { label: 'Sous tension', color: ALERT_COLORS.critical, tone: 'critical' as const };
  }
  if (data.kpi.taux_presence < 75 || data.finance_stats.taux_recouvrement < 60) {
    return { label: 'À surveiller', color: ALERT_COLORS.warning, tone: 'warning' as const };
  }
  if (data.kpi.taux_presence >= 85 && data.pedagogie_stats.taux_reussite_global >= 70) {
    return { label: 'Opérations stables', color: ALERT_COLORS.success, tone: 'success' as const };
  }
  return { label: 'En observation', color: ALERT_COLORS.info, tone: 'info' as const };
}

export default function DashboardPage() {
  const { etablissementId, anneeId } = useApp();
  const [showImpayesModal, setShowImpayesModal] = useState<ImpayeModalState>(false);
  const [impayesSearch, setImpayesSearch] = useState('');
  const [impayesPage, setImpayesPage] = useState(1);
  const [selectedCycle, setSelectedCycle] = useState<string | null>(null);
  const [expandedPaymentStudent, setExpandedPaymentStudent] = useState<string | null>(null);

  const IMPAYES_PER_PAGE = 8;

  // React Query (cache persisté + offline-first, voir components/QueryProvider.tsx) :
  // le tableau de bord affiche instantanément les derniers chiffres connus
  // puis revalide en arrière-plan — plus besoin de recharger la page pour
  // voir des données à jour après une connexion/déconnexion (voir le
  // correctif AppContext fait plus tôt cette session, qui règle la cause
  // racine ; ceci ajoute en plus la résilience hors-ligne/connexion lente).
  const { data, isError } = useQuery({
    queryKey: ['dashboard', etablissementId, anneeId],
    queryFn: async () => {
      const res = await api.get(`/api/dashboard?etablissement_id=${etablissementId}&annee_id=${anneeId}`);
      return res.data as DashboardData;
    },
    enabled: !!etablissementId && !!anneeId,
    // Rafraîchissement automatique toutes les 15 secondes pour les activités en temps réel
    refetchInterval: 15_000,
    refetchIntervalInBackground: false,
  });

  const filteredImpayes = useMemo(() => {
    if (!data) return [];
    return (data.impayes_en_attente || []).filter((item) => {
      const q = impayesSearch.toLowerCase();
      return (
        item.eleve.toLowerCase().includes(q) ||
        item.classe.toLowerCase().includes(q) ||
        item.facture.toLowerCase().includes(q)
      );
    });
  }, [data, impayesSearch]);

  const paginatedImpayes = useMemo(() => {
    const start = (impayesPage - 1) * IMPAYES_PER_PAGE;
    return filteredImpayes.slice(start, start + IMPAYES_PER_PAGE);
  }, [filteredImpayes, impayesPage]);

  const groupedRecentPayments = useMemo(() => {
    if (!data?.paiements_recents) return [];
    
    const groups = new Map<string, typeof data.paiements_recents>();
    
    data.paiements_recents.forEach(payment => {
      if (!groups.has(payment.eleve)) {
        groups.set(payment.eleve, []);
      }
      groups.get(payment.eleve)!.push(payment);
    });
    
    return Array.from(groups.entries()).slice(0, 6).map(([eleve, payments]) => ({
      eleve,
      classe: payments[0].classe,
      payments
    }));
  }, [data?.paiements_recents]);

  const financeSeries = useMemo(() => {
    if (!data) return [];
    const classes = data.inscriptions_par_classe || [];
    const baseRecette = data.kpi.total_recettes / Math.max(classes.length, 1);
    const baseDepense = data.kpi.total_depenses / Math.max(classes.length, 1);

    return classes.map((item, index) => ({
      classe: item.classe,
      recettes: Math.round(baseRecette * (1 + index * 0.11)),
      depenses: Math.round(baseDepense * (0.7 + index * 0.06)),
      objectif: Math.round(baseRecette * 1.22),
    }));
  }, [data]);

  const controlAlerts = useMemo(() => {
    if (!data) return [];
    const alerts: { title: string; description: string; tone: 'critical' | 'warning' | 'info' | 'success' }[] = [];

    if (data.finance_stats.total_impayes > 0) {
      alerts.push({
        title: 'Relances financières à lancer',
        description: `${formatCompactMoney(data.finance_stats.total_impayes)} restent à recouvrer sur les dossiers en attente.`,
        tone: data.finance_stats.total_impayes > data.kpi.total_recettes * 0.35 ? 'critical' : 'warning',
      });
    }

    if (data.kpi.incidents_mois > 0) {
      alerts.push({
        title: 'Incidents disciplinaires recensés',
        description: `${data.kpi.incidents_mois} incident(s) ont été enregistrés sur les 30 derniers jours.`,
        tone: data.kpi.incidents_mois >= 8 ? 'critical' : 'warning',
      });
    }

    alerts.push({
      title: 'Suivi portail familles',
      description: `${data.communication_stats.parents_inscrits_portail} parents estimés déjà connectés au portail, ouverture moyenne ${data.communication_stats.taux_ouverture_app}%.`,
      tone: 'info',
    });

    if (data.kpi.taux_presence >= 85) {
      alerts.push({
        title: 'Présence scolaire solide',
        description: `Le taux de présence observé est de ${data.kpi.taux_presence}% sur les 30 derniers jours.`,
        tone: 'success',
      });
    }

    return alerts.slice(0, 4);
  }, [data]);

  const commandFeed = useMemo(() => {
    if (!data) return [];
    return [
      {
        title: 'Communication active',
        value: `${data.communication_stats.sms_relances_envoyes}`,
        subtitle: 'relances SMS estimées',
        icon: Megaphone,
        color: '#2563eb',
      },
      {
        title: 'Couverture portail',
        value: `${data.communication_stats.parents_inscrits_portail}`,
        subtitle: 'parents déjà engagés',
        icon: Radio,
        color: '#8b5cf6',
      },
      {
        title: 'Bulletins générés',
        value: `${data.pedagogie_stats.bulletins_generes}`,
        subtitle: 'supports pédagogiques consolidés',
        icon: BookOpen,
        color: '#10b981',
      },
      {
        title: 'Évaluations à piloter',
        value: `${data.kpi.evaluations_prevues}`,
        subtitle: 'séquences encore planifiées',
        icon: Layers3,
        color: '#f59e0b',
      },
    ];
  }, [data]);

  // Tant que `data` est absent, on affiche TOUJOURS le même état "chargement"
  // (jamais l'état d'erreur) sauf en cas d'échec confirmé (`isError`) — avant
  // ce correctif, la branche affichée dépendait de `isLoading`, qui vaut
  // `false` tant que la requête est simplement "enabled: false" (le temps que
  // etablissementId/anneeId se résolvent) : le serveur (SSR, `isLoading`
  // vrai) et le client (première passe, `isLoading` déjà faux) rendaient donc
  // deux arbres DOM différents, provoquant un mismatch d'hydratation React.
  if (!data) {
    if (isError) {
      return (
        <div className="card" style={{ padding: 28, textAlign: 'center' }}>
          <h3 style={{ marginBottom: 8 }}>Impossible de charger le dashboard</h3>
          <p style={{ color: 'var(--text-muted)', marginBottom: 0 }}>Les données de supervision ne sont pas disponibles pour le moment.</p>
        </div>
      );
    }
    return (
      <div style={{ minHeight: '72vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
          <Loader2 size={42} className="animate-spin" color="var(--brand-primary)" />
          <p style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>Chargement du centre de contrôle...</p>
        </div>
      </div>
    );
  }

  const netResult = data.kpi.total_recettes - data.kpi.total_depenses;
  const portailCoverage = data.kpi.nb_eleves > 0
    ? Math.min(100, Math.round((data.communication_stats.parents_inscrits_portail / data.kpi.nb_eleves) * 100))
    : 0;
  const health = getHealthStatus(data);
  const selectedCycleData = data.pedagogie_stats.taux_reussite_par_cycle.find((c) => c.cycle === selectedCycle)
    || data.pedagogie_stats.taux_reussite_par_cycle[0]
    || null;

  const heroStats = [
    { label: 'Recettes consolidées', value: formatCompactMoney(data.kpi.total_recettes), icon: Wallet, color: '#2563eb' },
    { label: 'Dépenses engagées', value: formatCompactMoney(data.kpi.total_depenses), icon: Banknote, color: '#f97316' },
    { label: 'Résultat net', value: formatCompactMoney(netResult), icon: TrendingUp, color: netResult >= 0 ? '#10b981' : '#ef4444' },
    { label: 'Présence observée', value: `${data.kpi.taux_presence}%`, icon: ShieldCheck, color: '#8b5cf6' },
  ];

  const mainKpis = [
    { label: 'Élèves actifs', value: data.kpi.nb_eleves.toLocaleString('fr-FR'), helper: 'effectif suivi', icon: Users, color: '#2563eb' },
    { label: 'Enseignants actifs', value: data.kpi.nb_enseignants.toLocaleString('fr-FR'), helper: 'ressources humaines', icon: GraduationCap, color: '#10b981' },
    { label: 'Classes ouvertes', value: data.kpi.nb_classes.toLocaleString('fr-FR'), helper: 'unités académiques', icon: Building2, color: '#8b5cf6' },
    { label: 'Impayés', value: formatCompactMoney(data.finance_stats.total_impayes), helper: 'dossiers à relancer', icon: AlertTriangle, color: '#ef4444' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, paddingBottom: 8 }}>
      <div className="breadcrumb">
        <Link href="/">Accueil</Link>
        <ChevronRight size={14} />
        <span>Dashboard</span>
      </div>

      <section
        style={{
          position: 'relative',
          overflow: 'hidden',
          borderRadius: 28,
          padding: '28px',
          background: 'linear-gradient(135deg, #081225 0%, #102447 45%, #17386d 100%)',
          color: '#fff',
          boxShadow: '0 30px 70px rgba(8, 18, 37, 0.28)',
          border: '1px solid rgba(255,255,255,0.08)',
        }}
      >
        <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(circle at top right, rgba(255,255,255,0.18), transparent 28%)' }} />
        <div style={{ position: 'relative', display: 'grid', gridTemplateColumns: '1.55fr 1fr', gap: 24 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, width: 'fit-content', padding: '8px 14px', borderRadius: 999, background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.12)' }}>
              <Sparkles size={16} />
              <span style={{ fontSize: 13, fontWeight: 700 }}>Centre de contrôle intelligent</span>
            </div>

            <div>
              <h1 style={{ margin: 0, fontSize: 34, lineHeight: 1.05, fontWeight: 900, letterSpacing: '-0.03em' }}>
                Dashboard de supervision totale
              </h1>
              <p style={{ margin: '12px 0 0', maxWidth: 760, color: 'rgba(255,255,255,0.78)', fontSize: 15, lineHeight: 1.65 }}>
                Vue opérationnelle unifiée sur la pédagogie, la finance, la discipline, la communication et les signaux critiques de l’établissement.
                Cette interface agit comme un poste de commandement qui observe, alerte et oriente les décisions du jour.
              </p>
            </div>

            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '9px 14px', borderRadius: 14, background: 'rgba(255,255,255,0.12)' }}>
                <div style={{ width: 10, height: 10, borderRadius: '50%', background: health.color, boxShadow: `0 0 0 5px ${health.color}22` }} />
                <span style={{ fontWeight: 700 }}>État global : {health.label}</span>
              </div>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '9px 14px', borderRadius: 14, background: 'rgba(255,255,255,0.12)' }}>
                <CalendarDays size={16} />
                <span style={{ fontWeight: 700 }}>Année pilotée : {anneeId}</span>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 14 }}>
              {heroStats.map((item, index) => (
                <motion.div
                  key={item.label}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.05 * index }}
                  style={{
                    padding: '18px 16px',
                    borderRadius: 20,
                    background: 'rgba(255,255,255,0.08)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    backdropFilter: 'blur(8px)',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                    <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.68)', fontWeight: 700 }}>{item.label}</span>
                    <div style={{ width: 36, height: 36, borderRadius: 12, display: 'grid', placeItems: 'center', background: `${item.color}22`, color: item.color }}>
                      <item.icon size={18} />
                    </div>
                  </div>
                  <div style={{ fontSize: 24, fontWeight: 900 }}>{item.value}</div>
                </motion.div>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ padding: 20, borderRadius: 24, background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.1)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>Voix du centre</h3>
                <BellRing size={18} color="#cbd5e1" />
              </div>
              <div style={{ margin: 0, color: 'rgba(255,255,255,0.78)', lineHeight: 1.7, fontSize: 14 }}>
                <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {(() => {
                    const msgs = [];
                    if (data.finance_stats.total_impayes > 0) {
                      if (data.finance_stats.taux_recouvrement < 60) {
                        msgs.push(`Urgence financière : Le taux de recouvrement est critique (${data.finance_stats.taux_recouvrement}%). Relancez urgemment les impayés (${formatCompactMoney(data.finance_stats.total_impayes)}).`);
                      } else {
                        msgs.push(`Finance : Il reste ${formatCompactMoney(data.finance_stats.total_impayes)} d'impayés en attente. Une relance globale (SMS/Email) est conseillée.`);
                      }
                    }
                    if (data.kpi.incidents_mois >= 5) {
                      msgs.push(`Climat scolaire : Hausse de la pression disciplinaire (${data.kpi.incidents_mois} incidents ce mois).`);
                    }
                    if (data.kpi.taux_presence < 75) {
                      msgs.push(`Assiduité : Taux de présence global faible (${data.kpi.taux_presence}%). Vérifiez les absences non justifiées.`);
                    }
                    if (data.pedagogie_stats.taux_reussite_global < 50 && data.pedagogie_stats.taux_reussite_global > 0) {
                      msgs.push(`Pédagogie : Alerte sur le niveau global (réussite moyenne de ${data.pedagogie_stats.taux_reussite_global}%).`);
                    }
                    if (msgs.length === 0) {
                      msgs.push(`Système stable. Recouvrement à ${data.finance_stats.taux_recouvrement}% et présence à ${data.kpi.taux_presence}%. Maintenez le cap !`);
                    }
                    return msgs.map((msg, i) => <li key={i}>{msg}</li>);
                  })()}
                </ul>
              </div>
            </div>

            <div style={{ padding: 20, borderRadius: 24, background: '#fff', color: '#0f172a', boxShadow: '0 18px 38px rgba(15, 23, 42, 0.10)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                <h3 style={{ margin: 0, fontSize: 17, fontWeight: 800 }}>Raccourcis stratégiques</h3>
                <ArrowUpRight size={16} color="#64748b" />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
                {[
                  { href: '/communication', label: 'Communication', icon: Megaphone },
                  { href: '/comptabilite/paiements', label: 'Paiements', icon: CreditCard },
                  { href: '/evenements', label: 'Agenda', icon: CalendarDays },
                  { href: '/parametres', label: 'Centre de contrôle', icon: Layers3 },
                ].map((item) => (
                  <Link
                    key={item.label}
                    href={item.href}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 10,
                      padding: '13px 14px',
                      borderRadius: 16,
                      textDecoration: 'none',
                      color: '#0f172a',
                      background: '#f8fafc',
                      border: '1px solid #e2e8f0',
                      fontWeight: 700,
                    }}
                  >
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
                      <item.icon size={17} />
                      {item.label}
                    </span>
                    <ArrowRight size={15} />
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="kpi-grid">
        {mainKpis.map((kpi, index) => (
          <motion.div
            key={kpi.label}
            className="kpi-card"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.04 * index }}
            style={{
              background: '#fff',
              border: '1px solid rgba(226,232,240,0.95)',
              boxShadow: '0 18px 38px rgba(15, 23, 42, 0.06)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
              <div>
                <p className="kpi-label">{kpi.label}</p>
                <p className="kpi-value" style={{ marginBottom: 6 }}>{kpi.value}</p>
                <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>{kpi.helper}</span>
              </div>
              <div style={{ width: 48, height: 48, borderRadius: 14, background: `${kpi.color}15`, color: kpi.color, display: 'grid', placeItems: 'center' }}>
                <kpi.icon size={22} />
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 24 }}>
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          className="card"
          style={{ padding: 0, overflow: 'hidden', borderRadius: 24 }}
        >
          <div style={{ padding: '22px 24px 12px', borderBottom: '1px solid var(--border-light)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 14 }}>
            <div>
              <h5 style={{ margin: 0, fontSize: 18 }}>Radar financier</h5>
              <p style={{ margin: '4px 0 0', color: 'var(--text-muted)', fontSize: 13 }}>Lecture consolidée des recettes, objectifs et dépenses estimées par classe.</p>
            </div>
            <span className="badge badge-success">Recouvrement {data.finance_stats.taux_recouvrement}%</span>
          </div>
          <div style={{ padding: '20px 24px 24px' }}>
            <div style={{ height: 290 }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={financeSeries}>
                  <defs>
                    <linearGradient id="radar-recettes" x1="0" x2="0" y1="0" y2="1">
                      <stop offset="5%" stopColor="#2563eb" stopOpacity={0.24} />
                      <stop offset="95%" stopColor="#2563eb" stopOpacity={0.03} />
                    </linearGradient>
                    <linearGradient id="radar-depenses" x1="0" x2="0" y1="0" y2="1">
                      <stop offset="5%" stopColor="#f97316" stopOpacity={0.22} />
                      <stop offset="95%" stopColor="#f97316" stopOpacity={0.03} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="classe" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 12 }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 12 }} tickFormatter={(v) => `${Math.round(v / 1000000)}M`} />
                  <Tooltip formatter={formatTooltipMoney} contentStyle={{ borderRadius: 14, border: '1px solid #e2e8f0', boxShadow: '0 18px 40px rgba(15,23,42,0.08)' }} />
                  <Area type="monotone" dataKey="recettes" stroke="#2563eb" fill="url(#radar-recettes)" strokeWidth={3} />
                  <Area type="monotone" dataKey="depenses" stroke="#f97316" fill="url(#radar-depenses)" strokeWidth={2.4} />
                  <Area type="monotone" dataKey="objectif" stroke="#10b981" fill="transparent" strokeDasharray="6 6" strokeWidth={2.2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} className="card" style={{ padding: 0, overflow: 'hidden', borderRadius: 24 }}>
          <div style={{ padding: '22px 24px 12px', borderBottom: '1px solid var(--border-light)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h5 style={{ margin: 0, fontSize: 18 }}>Console d’alerte</h5>
              <p style={{ margin: '4px 0 0', color: 'var(--text-muted)', fontSize: 13 }}>Messages prioritaires générés par le centre de supervision.</p>
            </div>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#64748b' }}>{controlAlerts.length} signal(s)</span>
          </div>
          <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
            {controlAlerts.map((alert) => (
              <div key={alert.title} style={{ padding: 16, borderRadius: 18, border: `1px solid ${ALERT_COLORS[alert.tone]}30`, background: `${ALERT_COLORS[alert.tone]}10` }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                  <div style={{ width: 38, height: 38, borderRadius: 12, background: `${ALERT_COLORS[alert.tone]}20`, color: ALERT_COLORS[alert.tone], display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                    <AlertTriangle size={18} />
                  </div>
                  <div>
                    <div style={{ fontWeight: 800, color: '#0f172a', marginBottom: 4 }}>{alert.title}</div>
                    <p style={{ margin: 0, color: '#475569', fontSize: 13, lineHeight: 1.6 }}>{alert.description}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 1fr 1fr', gap: 24 }}>
        <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} className="card" style={{ padding: 0, overflow: 'hidden', borderRadius: 24 }}>
          <div style={{ padding: '22px 24px 12px', borderBottom: '1px solid var(--border-light)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h5 style={{ margin: 0, fontSize: 18 }}>Pilotage pédagogique</h5>
              <p style={{ margin: '4px 0 0', color: 'var(--text-muted)', fontSize: 13 }}>Analyse du rendement global par cycle et classes associées.</p>
            </div>
            <span className="badge badge-primary">Moyenne {data.pedagogie_stats.taux_reussite_global}%</span>
          </div>
          <div style={{ padding: 18, display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12 }}>
            {data.pedagogie_stats.taux_reussite_par_cycle.map((cycle, index) => {
              const color = PIE_COLORS[index % PIE_COLORS.length];
              const isActive = selectedCycleData?.cycle === cycle.cycle;
              return (
                <button
                  key={cycle.cycle}
                  onClick={() => setSelectedCycle(cycle.cycle)}
                  style={{
                    textAlign: 'left',
                    border: `1px solid ${isActive ? color : '#e2e8f0'}`,
                    background: isActive ? `${color}10` : '#fff',
                    borderRadius: 18,
                    padding: 16,
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <span style={{ fontWeight: 800, color: '#0f172a' }}>{cycle.cycle}</span>
                    <span style={{ color, fontWeight: 900 }}>{cycle.taux}%</span>
                  </div>
                  <p style={{ margin: 0, color: '#64748b', fontSize: 12 }}>{cycle.nb_admis}/{cycle.nb_eleves} admis</p>
                </button>
              );
            })}
          </div>
          <div style={{ padding: '0 18px 18px' }}>
            <div style={{ borderRadius: 18, background: '#f8fafc', border: '1px solid #e2e8f0', padding: 16 }}>
              <div style={{ fontWeight: 800, marginBottom: 12, color: '#0f172a' }}>
                Détail classe — {selectedCycleData?.cycle || 'Niveau non disponible'}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {selectedCycleData?.classes_detail?.slice(0, 4).map((cls) => {
                  const pct = cls.taux || 0;
                  const barColor = pct >= 80 ? '#10b981' : pct >= 60 ? '#2563eb' : pct >= 50 ? '#f59e0b' : '#ef4444';
                  return (
                    <div key={cls.classe_id}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginBottom: 6 }}>
                        <span style={{ fontWeight: 700, color: '#0f172a' }}>{cls.code || cls.libelle}</span>
                        <span style={{ color: barColor, fontWeight: 800 }}>{pct}%</span>
                      </div>
                      <div style={{ height: 8, background: '#e2e8f0', borderRadius: 999, overflow: 'hidden' }}>
                        <div style={{ width: `${pct}%`, height: '100%', background: barColor, borderRadius: 999 }} />
                      </div>
                    </div>
                  );
                })}
                {(!selectedCycleData?.classes_detail || selectedCycleData.classes_detail.length === 0) && (
                  <p style={{ margin: 0, color: '#94a3b8', fontSize: 13 }}>Aucune ventilation détaillée disponible pour ce cycle.</p>
                )}
              </div>
            </div>
          </div>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} className="card" style={{ padding: 0, overflow: 'hidden', borderRadius: 24 }}>
          <div style={{ padding: '22px 24px 12px', borderBottom: '1px solid var(--border-light)' }}>
            <h5 style={{ margin: 0, fontSize: 18 }}>Canaux d’encaissement</h5>
            <p style={{ margin: '4px 0 0', color: 'var(--text-muted)', fontSize: 13 }}>Répartition des modes de paiement validés.</p>
          </div>
          <div style={{ padding: 20 }}>
            <div style={{ height: 240 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={data.finance_stats.repartition_methodes} dataKey="total" nameKey="mode" innerRadius={58} outerRadius={88} paddingAngle={4}>
                    {data.finance_stats.repartition_methodes.map((entry, index) => (
                      <Cell key={`${entry.mode}-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={formatTooltipMoney} contentStyle={{ borderRadius: 14, border: '1px solid #e2e8f0' }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 8 }}>
              {data.finance_stats.repartition_methodes.map((item, index) => (
                <div key={item.mode} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10, color: '#334155', fontWeight: 700, fontSize: 13 }}>
                    <span style={{ width: 10, height: 10, borderRadius: '50%', background: PIE_COLORS[index % PIE_COLORS.length] }} />
                    {item.mode}
                  </span>
                  <span style={{ color: '#0f172a', fontWeight: 800, fontSize: 13 }}>{formatCompactMoney(item.total)}</span>
                </div>
              ))}
            </div>
          </div>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} className="card" style={{ padding: 0, overflow: 'hidden', borderRadius: 24 }}>
          <div style={{ padding: '22px 24px 12px', borderBottom: '1px solid var(--border-light)' }}>
            <h5 style={{ margin: 0, fontSize: 18 }}>Poste communication</h5>
            <p style={{ margin: '4px 0 0', color: 'var(--text-muted)', fontSize: 13 }}>Le tableau de bord parle et suit l’engagement des familles.</p>
          </div>
          <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
            {commandFeed.map((item) => (
              <div key={item.title} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: 14, borderRadius: 18, background: '#f8fafc', border: '1px solid #e2e8f0' }}>
                <div style={{ width: 42, height: 42, borderRadius: 14, display: 'grid', placeItems: 'center', background: `${item.color}15`, color: item.color }}>
                  <item.icon size={18} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 800, color: '#0f172a', marginBottom: 3 }}>{item.title}</div>
                  <div style={{ color: '#64748b', fontSize: 12 }}>{item.subtitle}</div>
                </div>
                <div style={{ fontWeight: 900, color: '#0f172a' }}>{item.value}</div>
              </div>
            ))}
            <div style={{ marginTop: 6, padding: 14, borderRadius: 18, background: 'linear-gradient(135deg, #eff6ff, #f8fafc)', border: '1px solid #dbeafe' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                <span style={{ fontWeight: 800, color: '#0f172a' }}>Couverture portail familles</span>
                <span style={{ color: '#2563eb', fontWeight: 900 }}>{portailCoverage}%</span>
              </div>
              <div style={{ height: 10, borderRadius: 999, background: '#dbeafe', overflow: 'hidden' }}>
                <div style={{ width: `${portailCoverage}%`, height: '100%', borderRadius: 999, background: 'linear-gradient(90deg, #2563eb, #60a5fa)' }} />
              </div>
            </div>
          </div>
        </motion.div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 0.9fr 1fr', gap: 24 }}>
        <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} className="card" style={{ padding: 0, overflow: 'hidden', borderRadius: 24 }}>
          <div style={{ padding: '22px 24px 12px', borderBottom: '1px solid var(--border-light)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h5 style={{ margin: 0, fontSize: 18 }}>Impayés à traiter</h5>
              <p style={{ margin: '4px 0 0', color: 'var(--text-muted)', fontSize: 13 }}>Dossiers prioritaires nécessitant une action de recouvrement.</p>
            </div>
            <button
              onClick={() => { setImpayesPage(1); setShowImpayesModal(true); }}
              style={{ border: 'none', background: 'none', color: '#2563eb', fontWeight: 800, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              Voir tout <ArrowUpRight size={14} />
            </button>
          </div>
          <div style={{ padding: '8px 0' }}>
            {(data.impayes_en_attente || []).slice(0, 5).map((item, index) => (
              <div key={`${item.facture}-${index}`} style={{ padding: '14px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #f1f5f9', gap: 12 }}>
                <div>
                  <div style={{ fontWeight: 800, color: '#0f172a' }}>{item.eleve}</div>
                  <div style={{ fontSize: 12, color: '#64748b' }}>{item.classe} • {item.facture}</div>
                </div>
                <span style={{ color: '#ef4444', fontWeight: 900 }}>{formatCompactMoney(item.montant_restant)}</span>
              </div>
            ))}
            {(!data.impayes_en_attente || data.impayes_en_attente.length === 0) && (
              <div style={{ padding: 28, textAlign: 'center', color: '#94a3b8' }}>Aucun impayé en attente.</div>
            )}
          </div>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} className="card" style={{ padding: 0, overflow: 'hidden', borderRadius: 24 }}>
          <div style={{ padding: '22px 24px 12px', borderBottom: '1px solid var(--border-light)' }}>
            <h5 style={{ margin: 0, fontSize: 18 }}>Agenda opérationnel</h5>
            <p style={{ margin: '4px 0 0', color: 'var(--text-muted)', fontSize: 13 }}>Événements à venir publiés sur le système.</p>
          </div>
          <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
            {data.evenements_a_venir?.slice(0, 4).map((event) => (
              <div key={event.evenement_id} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: 14, borderRadius: 18, background: '#f8fafc', border: '1px solid #e2e8f0' }}>
                <div style={{ minWidth: 54, padding: '10px 8px', borderRadius: 14, background: event.couleur ? `${event.couleur}15` : '#eff6ff', color: event.couleur || '#2563eb', textAlign: 'center' }}>
                  <div style={{ fontWeight: 900, fontSize: 16 }}>{new Date(event.date_debut).getDate()}</div>
                  <div style={{ fontSize: 10, fontWeight: 700 }}>{new Date(event.date_debut).toLocaleDateString('fr-FR', { month: 'short' }).toUpperCase()}</div>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 800, color: '#0f172a', marginBottom: 4 }}>{event.titre}</div>
                  <div style={{ fontSize: 12, color: '#64748b', marginBottom: 6 }}>{formatDate(event.date_debut)} {event.heure_debut ? `• ${event.heure_debut}` : ''}</div>
                  <div style={{ fontSize: 12, color: '#475569' }}>{event.lieu || 'Lieu non précisé'}</div>
                </div>
              </div>
            ))}
            {(!data.evenements_a_venir || data.evenements_a_venir.length === 0) && (
              <div style={{ padding: 18, textAlign: 'center', color: '#94a3b8' }}>Aucun événement à venir actuellement.</div>
            )}
          </div>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} className="card" style={{ padding: 0, overflow: 'hidden', borderRadius: 24 }}>
          <div style={{ padding: '22px 24px 12px', borderBottom: '1px solid var(--border-light)' }}>
            <h5 style={{ margin: 0, fontSize: 18 }}>Activité temps réel</h5>
            <p style={{ margin: '4px 0 0', color: 'var(--text-muted)', fontSize: 13 }}>Journal des événements et actions visibles aujourd'hui.</p>
          </div>
          <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
            {data.activites_du_jour?.slice(0, 8).map((activity, index) => (
              <div key={`${activity.titre}-${index}`} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: 14, borderRadius: 18, background: '#f8fafc', border: '1px solid #e2e8f0' }}>
                <div style={{ width: 40, height: 40, borderRadius: 14, display: 'grid', placeItems: 'center', background: `${activity.couleur || '#2563eb'}15`, color: activity.couleur || '#2563eb', flexShrink: 0 }}>
                  {activity.type === 'PAIEMENT' ? <CreditCard size={17} /> :
                   activity.type === 'DEPENSE' ? <ArrowDownRight size={17} /> :
                   activity.type === 'INSCRIPTION' ? <Users size={17} /> :
                   <Radio size={17} />}
                </div>
                <div>
                  <div style={{ fontWeight: 800, color: '#0f172a', marginBottom: 4 }}>{activity.titre}</div>
                  <div style={{ fontSize: 12, color: '#64748b', marginBottom: 4 }}>{activity.heure || "Aujourd'hui"}</div>
                  <p style={{ margin: 0, color: '#475569', fontSize: 13, lineHeight: 1.55 }}>{activity.description || 'Aucun détail supplémentaire.'}</p>
                </div>
              </div>
            ))}
            {(!data.activites_du_jour || data.activites_du_jour.length === 0) && (
              <div style={{ padding: 18, textAlign: 'center', color: '#94a3b8' }}>Aucune activité publiée aujourd’hui.</div>
            )}
          </div>
        </motion.div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
        <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} className="card" style={{ padding: 0, overflow: 'hidden', borderRadius: 24 }}>
          <div style={{ padding: '22px 24px 12px', borderBottom: '1px solid var(--border-light)' }}>
            <h5 style={{ margin: 0, fontSize: 18 }}>Effectifs par classe</h5>
            <p style={{ margin: '4px 0 0', color: 'var(--text-muted)', fontSize: 13 }}>Répartition des inscriptions actives par classe.</p>
          </div>
          <div style={{ padding: '18px 24px 24px' }}>
            <div style={{ height: 260 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.inscriptions_par_classe} margin={{ top: 8, right: 0, left: -24, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="classe" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 12 }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 12 }} />
                  <Tooltip contentStyle={{ borderRadius: 14, border: '1px solid #e2e8f0' }} />
                  <Bar dataKey="effectif" fill="#2563eb" radius={[10, 10, 0, 0]} barSize={28} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} className="card" style={{ padding: 0, overflow: 'hidden', borderRadius: 24 }}>
          <div style={{ padding: '22px 24px 12px', borderBottom: '1px solid var(--border-light)' }}>
            <h5 style={{ margin: 0, fontSize: 18 }}>Encaissements récents</h5>
            <p style={{ margin: '4px 0 0', color: 'var(--text-muted)', fontSize: 13 }}>Derniers flux validés remontés dans le cockpit financier.</p>
          </div>
          <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {groupedRecentPayments.map((group, index) => {
              const isExpanded = expandedPaymentStudent === group.eleve;
              const latestPayment = group.payments[0];
              const hasMultiple = group.payments.length > 1;
              
              return (
                <div 
                  key={`${group.eleve}-${index}`} 
                  onClick={() => hasMultiple && setExpandedPaymentStudent(isExpanded ? null : group.eleve)}
                  style={{ display: 'flex', flexDirection: 'column', padding: 14, borderRadius: 18, background: '#f8fafc', border: '1px solid #e2e8f0', cursor: hasMultiple ? 'pointer' : 'default' }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ fontWeight: 800, color: '#0f172a' }}>{group.eleve}</div>
                        {hasMultiple && (
                          <div style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 99, background: '#e0e7ff', color: '#3730a3' }}>
                            {group.payments.length} paiements
                          </div>
                        )}
                      </div>
                      <div style={{ fontSize: 12, color: '#64748b' }}>{group.classe} • {latestPayment.mode} • {latestPayment.recu}</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontWeight: 900, color: '#10b981' }}>{formatCompactMoney(latestPayment.montant)}</div>
                      <div style={{ fontSize: 12, color: '#94a3b8' }}>{formatDate(latestPayment.date)}</div>
                    </div>
                  </div>
                  
                  <AnimatePresence>
                    {isExpanded && hasMultiple && (
                      <motion.div
                        initial={{ height: 0, opacity: 0, marginTop: 0 }}
                        animate={{ height: 'auto', opacity: 1, marginTop: 12 }}
                        exit={{ height: 0, opacity: 0, marginTop: 0 }}
                        style={{ overflow: 'hidden' }}
                      >
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 12, borderTop: '1px dashed #cbd5e1' }}>
                          {group.payments.slice(1).map((payment, i) => (
                            <div key={`${payment.recu}-${i}`} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <div style={{ fontSize: 12, color: '#64748b' }}>{payment.mode} • {payment.recu}</div>
                              <div style={{ textAlign: 'right' }}>
                                <div style={{ fontWeight: 800, color: '#10b981', fontSize: 13 }}>{formatCompactMoney(payment.montant)}</div>
                                <div style={{ fontSize: 11, color: '#94a3b8' }}>{formatDate(payment.date)}</div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
            {groupedRecentPayments.length === 0 && (
              <div style={{ padding: 18, textAlign: 'center', color: '#94a3b8' }}>Aucun paiement récent disponible.</div>
            )}
          </div>
        </motion.div>
      </div>

      <AnimatePresence>
        {showImpayesModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowImpayesModal(false)}
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 1000,
              background: 'rgba(15, 23, 42, 0.62)',
              backdropFilter: 'blur(10px)',
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              padding: 20,
            }}
          >
            <motion.div
              initial={{ opacity: 0, y: 16, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 16, scale: 0.97 }}
              transition={{ type: 'spring', stiffness: 260, damping: 24 }}
              onClick={(e) => e.stopPropagation()}
              style={{
                width: '100%',
                maxWidth: 980,
                maxHeight: '88vh',
                background: 'rgba(255,255,255,0.98)',
                borderRadius: 30,
                overflow: 'hidden',
                boxShadow: '0 30px 70px rgba(15, 23, 42, 0.26)',
                border: '1px solid rgba(255,255,255,0.7)',
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              <div style={{ padding: '24px 28px', background: 'linear-gradient(135deg, #081225, #17386d)', color: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16 }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                    <div style={{ width: 38, height: 38, borderRadius: 12, display: 'grid', placeItems: 'center', background: 'rgba(239,68,68,0.18)', color: '#fda4af' }}>
                      <Wallet size={18} />
                    </div>
                    <h2 style={{ margin: 0, fontSize: 22, fontWeight: 900 }}>Poste de recouvrement</h2>
                  </div>
                  <p style={{ margin: 0, color: 'rgba(255,255,255,0.78)', fontSize: 13 }}>
                    {filteredImpayes.length} dossier(s) détecté(s) • Total estimé : <strong style={{ color: '#fda4af' }}>{formatMoney(filteredImpayes.reduce((acc, item) => acc + item.montant_restant, 0))}</strong>
                  </p>
                </div>
                <button onClick={() => setShowImpayesModal(false)} style={{ width: 38, height: 38, borderRadius: 12, border: 'none', background: 'rgba(255,255,255,0.12)', color: '#fff', cursor: 'pointer', display: 'grid', placeItems: 'center' }}>
                  <X size={18} />
                </button>
              </div>

              <div style={{ padding: 24, overflowY: 'auto' }}>
                <div style={{ position: 'relative', marginBottom: 20 }}>
                  <Search size={18} style={{ position: 'absolute', top: '50%', left: 14, transform: 'translateY(-50%)', color: '#94a3b8' }} />
                  <input
                    type="text"
                    placeholder="Rechercher un élève, une classe ou une facture..."
                    value={impayesSearch}
                    onChange={(e) => { setImpayesSearch(e.target.value); setImpayesPage(1); }}
                    style={{ width: '100%', borderRadius: 16, border: '1px solid #dbe2ea', background: '#f8fafc', padding: '13px 14px 13px 42px', outline: 'none', fontSize: 14 }}
                  />
                </div>

                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ background: '#f8fafc', textAlign: 'left' }}>
                        <th style={{ padding: '14px 16px', fontSize: 12, color: '#64748b' }}>Élève</th>
                        <th style={{ padding: '14px 16px', fontSize: 12, color: '#64748b' }}>Classe</th>
                        <th style={{ padding: '14px 16px', fontSize: 12, color: '#64748b' }}>Facture</th>
                        <th style={{ padding: '14px 16px', fontSize: 12, color: '#64748b', textAlign: 'right' }}>Montant restant</th>
                        <th style={{ padding: '14px 16px', fontSize: 12, color: '#64748b', textAlign: 'center' }}>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedImpayes.map((item, index) => (
                        <tr key={`${item.facture}-${index}`} style={{ borderBottom: '1px solid #edf2f7' }}>
                          <td style={{ padding: '15px 16px', fontWeight: 700, color: '#0f172a' }}>{item.eleve}</td>
                          <td style={{ padding: '15px 16px', color: '#475569' }}>{item.classe}</td>
                          <td style={{ padding: '15px 16px', color: '#64748b', fontFamily: 'monospace' }}>{item.facture}</td>
                          <td style={{ padding: '15px 16px', textAlign: 'right', color: '#ef4444', fontWeight: 900 }}>{formatMoney(item.montant_restant)}</td>
                          <td style={{ padding: '15px 16px', textAlign: 'center' }}>
                            <Link
                              href="/comptabilite/paiements"
                              onClick={() => setShowImpayesModal(false)}
                              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, textDecoration: 'none', color: '#2563eb', fontWeight: 800, background: '#eff6ff', padding: '8px 12px', borderRadius: 12 }}
                            >
                              Traiter <ArrowUpRight size={13} />
                            </Link>
                          </td>
                        </tr>
                      ))}
                      {paginatedImpayes.length === 0 && (
                        <tr>
                          <td colSpan={5} style={{ padding: 28, textAlign: 'center', color: '#94a3b8' }}>Aucun dossier ne correspond à votre filtre actuel.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                {filteredImpayes.length > IMPAYES_PER_PAGE && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginTop: 18, paddingTop: 16, borderTop: '1px solid #edf2f7' }}>
                    <span style={{ fontSize: 13, color: '#64748b' }}>
                      Affichage de {((impayesPage - 1) * IMPAYES_PER_PAGE) + 1} à {Math.min(impayesPage * IMPAYES_PER_PAGE, filteredImpayes.length)} sur {filteredImpayes.length} dossier(s)
                    </span>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        onClick={() => setImpayesPage((p) => p - 1)}
                        disabled={impayesPage === 1}
                        style={{ borderRadius: 12, border: '1px solid #dbe2ea', background: '#fff', padding: '8px 14px', fontWeight: 700, cursor: 'pointer', opacity: impayesPage === 1 ? 0.5 : 1 }}
                      >
                        Précédent
                      </button>
                      <button
                        onClick={() => setImpayesPage((p) => p + 1)}
                        disabled={impayesPage >= Math.ceil(filteredImpayes.length / IMPAYES_PER_PAGE)}
                        style={{ borderRadius: 12, border: '1px solid #dbe2ea', background: '#fff', padding: '8px 14px', fontWeight: 700, cursor: 'pointer', opacity: impayesPage >= Math.ceil(filteredImpayes.length / IMPAYES_PER_PAGE) ? 0.5 : 1 }}
                      >
                        Suivant
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
