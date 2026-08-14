'use client';

/*
 * SALAIRES — l'écran du comptable.
 *
 * Il portait sept onglets alors que la navigation n'en annonçait que quatre :
 * « Source des absences » et « Calendrier de paie » n'étaient atteignables que
 * par une URL devinée, et « Historique de paie » affichait exactement la même
 * table que « Bulletins », filtrée sur une personne.
 *
 * Quatre destinations suffisent, parce que payer son personnel c'est quatre
 * gestes : savoir qui on paie, préparer le mois, saisir primes et avances,
 * retrouver un versement. Les absences et la date de paie ne sont pas des
 * destinations : ce sont des éléments de la préparation du mois, ils y vivent
 * désormais, dépliables.
 */

import React, { useState, useEffect, useCallback, useMemo, Suspense } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useApp } from '@/context/AppContext';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Users, Calendar, FileText, Landmark, BookOpen, PlusCircle, MinusCircle,
    CheckCircle, Eye, Loader2, Printer, HelpCircle, RefreshCw, AlertCircle,
    AlertTriangle, Check, ChevronRight, ChevronDown, X, Clock,
} from 'lucide-react';
import api from '@/lib/api';
import Link from 'next/link';

const fmt = (n: number | null | undefined) => (n || 0).toLocaleString('fr-GN') + ' GNF';

const MOIS_FR = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin',
    'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

/** Les douze derniers mois, du plus récent au plus ancien.
 *  La liste était figée sur « Mai / Juin / Juillet 2026 » : en août l'écran
 *  proposait trois mois passés et aucun moyen de préparer le mois en cours. */
function derniersMois(n = 12) {
    const out: { valeur: string; libelle: string }[] = [];
    const d = new Date();
    for (let i = 0; i < n; i++) {
        const a = d.getFullYear(), m = d.getMonth();
        out.push({
            valeur: `${a}-${String(m + 1).padStart(2, '0')}`,
            libelle: `${MOIS_FR[m]} ${a}`,
        });
        d.setMonth(d.getMonth() - 1);
    }
    return out;
}

/** Mensuel fixe ou payé à l'heure — l'information décisive pour comprendre un
 *  montant, et elle n'était affichée nulle part. */
function BadgeMode({ mode }: { mode?: string }) {
    const horaire = (mode || '').toUpperCase() === 'HORAIRE';
    return (
        <span style={{
            padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 700,
            background: horaire ? '#eff6ff' : '#f0fdf4',
            color: horaire ? '#1d4ed8' : '#15803d',
            whiteSpace: 'nowrap',
        }}>
            {horaire ? "À l'heure" : 'Mensuel fixe'}
        </span>
    );
}

function SalairesContent() {
    const { etablissementId } = useApp();
    const searchParams = useSearchParams();
    const router = useRouter();
    const queryClient = useQueryClient();

    const ONGLETS = [
        { id: 'personnel', label: 'Personnel', icon: Users },
        { id: 'paie', label: 'Préparer la paie', icon: Landmark },
        { id: 'avances', label: 'Primes & avances', icon: PlusCircle },
        { id: 'bulletins', label: 'Bulletins de paie', icon: FileText },
    ];
    // Une URL portant l'un des anciens onglets (?tab=sources, ?tab=calendrier,
    // ?tab=historique) ne doit pas afficher une page vide : elle retombe sur
    // l'onglet qui a absorbé son contenu.
    const REDIRIGES: Record<string, string> = {
        sources: 'paie', calendrier: 'paie', historique: 'bulletins',
    };
    const tabBrut = searchParams.get('tab') || 'personnel';
    const activeTab = REDIRIGES[tabBrut] || (ONGLETS.some(o => o.id === tabBrut) ? tabBrut : 'personnel');

    const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

    const moisDisponibles = useMemo(() => derniersMois(12), []);
    const [selectedMonth, setSelectedMonth] = useState(() => {
        const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    });

    const [paydayDate, setPaydayDate] = useState('');
    // Combien de jours nous separent du versement. Negatif = la date est
    // passee et le personnel attend : c'est ce que l'ecran doit crier.
    const joursAvantPaie = useMemo(() => {
        if (!paydayDate) return null;
        const jour = new Date(paydayDate); jour.setHours(0, 0, 0, 0);
        const aujourdhui = new Date(); aujourdhui.setHours(0, 0, 0, 0);
        return Math.round((jour.getTime() - aujourdhui.getTime()) / 86400000);
    }, [paydayDate]);
    const [savingPayday, setSavingPayday] = useState(false);

    // Primes / avances / absences
    const [targetEmpId, setTargetEmpId] = useState('');
    const [formMontant, setFormMontant] = useState('');
    const [formMotif, setFormMotif] = useState('');

    // Bulletins (la liste, et le détail imprimable)
    const [bulletinEmpFiltre, setBulletinEmpFiltre] = useState('');
    const [selectedBulletin, setSelectedBulletin] = useState<number | null>(null);
    const [bulletinDetails, setBulletinDetails] = useState<any>(null);
    const [bulletinLoading, setBulletinLoading] = useState(false);

    // Panneaux dépliables de la préparation de paie
    const [voirAbsences, setVoirAbsences] = useState(false);
    const [absenceRows, setAbsenceRows] = useState<any[]>([]);
    const [absenceTotal, setAbsenceTotal] = useState(0);

    const [etablissementInfo, setEtablissementInfo] = useState<any>(null);

    const showMsg = (text: any, type: 'success' | 'error') => {
        let messageText = typeof text === 'string' ? text : 'Erreur inattendue';
        if (Array.isArray(text)) messageText = text.map((t: any) => t.msg || JSON.stringify(t)).join(', ');
        else if (typeof text === 'object' && text !== null) messageText = text.msg || text.message || JSON.stringify(text);
        setMessage({ text: messageText, type });
        setTimeout(() => setMessage(null), 4000);
    };

    useEffect(() => {
        api.get(`/api/parametrage/etablissements/${etablissementId}`)
            .then(res => setEtablissementInfo(res.data)).catch(() => { });
    }, [etablissementId]);

    useEffect(() => {
        api.get(`/api/finance/salaires/date-paie?etablissement_id=${etablissementId}&mois_concerne=${selectedMonth}`)
            .then(res => setPaydayDate(res.data?.date_paie || '')).catch(() => setPaydayDate(''));
    }, [etablissementId, selectedMonth]);

    // ─── Le personnel ────────────────────────────────────────────────────
    const { data: employesRaw, isLoading: empLoading } = useQuery({
        queryKey: ['salaires-employes', etablissementId, selectedMonth],
        queryFn: async () => {
            // Le mois est transmis : sans lui, « payé ce mois » se calculait
            // sur le mois en cours et non sur celui que le comptable regarde.
            const res = await api.get(
                `/api/finance/salaires/employes?etablissement_id=${etablissementId}&mois=${selectedMonth}`);
            return (res.data || []).map((emp: any) => ({
                ...emp, employe_id: emp.id, poste: emp.role_label,
            }));
        },
        staleTime: 1000 * 60 * 5,
    });
    const employes: any[] = useMemo(() => employesRaw || [], [employesRaw]);

    // ── DEUX METIERS, DEUX LISTES ────────────────────────────────────────
    // Un enseignant du secondaire est payé aux heures qu'il assure ; un
    // surveillant, un comptable, un gardien touchent un montant fixe par mois.
    // Mélangés dans un seul tableau, le comptable ne peut ni recouper la masse
    // salariale enseignante ni vérifier que tout le personnel est passé — et
    // la colonne « heures » n'a de sens que pour une moitié des lignes.
    const groupes = useMemo(() => {
        const enseignants = employes.filter(e => e.type_employe === 'ENSEIGNANT');
        const personnel = employes.filter(e => e.type_employe !== 'ENSEIGNANT');
        const somme = (l: any[]) => l.reduce((t, e) => t + (Number(e.salaire_base) || 0), 0);
        return [
            {
                cle: 'ENSEIGNANT', titre: 'Enseignants', lignes: enseignants,
                total: somme(enseignants),
                payes: enseignants.filter(e => e.paye_ce_mois).length,
                note: "Au collège et au lycée, le salaire se calcule sur les heures de l'emploi du temps.",
            },
            {
                cle: 'PERSONNEL', titre: 'Personnel non enseignant', lignes: personnel,
                total: somme(personnel),
                payes: personnel.filter(e => e.paye_ce_mois).length,
                note: 'Direction, comptabilité, surveillance, entretien : salaire mensuel fixe.',
            },
        ].filter(g => g.lignes.length > 0);
    }, [employes]);

    useEffect(() => {
        if (employes.length > 0) setTargetEmpId(prev => prev || String(employes[0].employe_id));
    }, [employes]);

    const invalidateEmployes = useCallback(
        () => queryClient.invalidateQueries({ queryKey: ['salaires-employes', etablissementId, selectedMonth] }),
        [etablissementId, selectedMonth, queryClient]);

    // ─── Le calcul du mois ───────────────────────────────────────────────
    const { data: salairesData, isFetching: salLoading } = useQuery({
        queryKey: ['salaires-calculer', etablissementId, selectedMonth],
        queryFn: async () => {
            const res = await api.get(`/api/finance/salaires/calculer?etablissement_id=${etablissementId}&mois_concerne=${selectedMonth}`);
            return res.data || [];
        },
        enabled: activeTab === 'paie',
        staleTime: 1000 * 60 * 3,
    });
    const salaires: any[] = useMemo(() => salairesData || [], [salairesData]);

    const invalidateSalaires = useCallback(
        () => queryClient.invalidateQueries({ queryKey: ['salaires-calculer', etablissementId, selectedMonth] }),
        [etablissementId, selectedMonth, queryClient]);

    /* Le total ne se contente plus d'additionner : il dit aussi ce qui manque.
       Un employé sans montant et un employé en erreur ne doivent pas se noyer
       dans une somme qui laisse croire que la paie est prête. */
    const bilan = useMemo(() => {
        const enErreur = salaires.filter(s => s.statut === 'ERREUR');
        const payes = salaires.filter(s => s.statut === 'PAYE');
        const aCompleter = salaires.filter(s => s.statut === 'NON_PAYE' && (s.net_a_payer || 0) <= 0);
        const aPayer = salaires.filter(s => s.statut === 'NON_PAYE' && (s.net_a_payer || 0) > 0);
        return {
            enErreur, payes, aCompleter, aPayer,
            resteAVerser: aPayer.reduce((t, s) => t + (s.net_a_payer || 0), 0),
            dejaVerse: payes.reduce((t, s) => t + (s.net_a_payer || 0), 0),
        };
    }, [salaires]);

    // ─── Les bulletins déjà émis ─────────────────────────────────────────
    // Ils vivent dans l'historique renvoyé par /salaires/employes : plus besoin
    // d'un second appel ni d'un onglet séparé pour les filtrer par personne.
    const bulletins = useMemo(() => {
        const out: any[] = [];
        employes.forEach((emp: any) => {
            (emp.historique || []).forEach((b: any) => {
                out.push({
                    ...b,
                    employe_id: emp.employe_id,
                    nom: emp.nom, prenom: emp.prenom, poste: emp.poste,
                    salaire_base: b.salaire_base ?? emp.salaire_base,
                    net_a_payer: b.net_a_payer ?? b.montant,
                    total_primes: b.total_primes ?? (emp.prime_mensuelle || 0),
                    total_absences: b.total_absences || 0,
                    total_avances: b.total_avances || 0,
                });
            });
        });
        const filtres = bulletinEmpFiltre ? out.filter(b => b.employe_id === bulletinEmpFiltre) : out;
        return filtres.sort((a, b) => String(b.mois_concerne || '').localeCompare(String(a.mois_concerne || '')));
    }, [employes, bulletinEmpFiltre]);

    // ─── Détail d'un enseignant : ses heures, au tarif réel ───────────────
    // L'écran retrouvait l'enseignant par une recherche sur son NOM, puis
    // reconstituait un taux horaire en divisant son salaire par ses heures ×
    // 4,33. Deux inventions : deux homonymes se mélangeaient, et le taux
    // affiché n'était celui d'aucune affectation. Le backend calcule tout ça.
    const [selectedEmpDetail, setSelectedEmpDetail] = useState<any>(null);
    const [detailPaie, setDetailPaie] = useState<any>(null);
    const [detailLoading, setDetailLoading] = useState(false);

    const handleSelectEmp = async (emp: any) => {
        setSelectedEmpDetail(emp);
        setDetailPaie(null);
        const ref = String(emp.employe_id || '');
        if (!ref.startsWith('ENS_')) return;
        setDetailLoading(true);
        try {
            const res = await api.get(`/api/finance/remuneration/enseignant/${ref.slice(4)}`);
            setDetailPaie(res.data);
        } catch { setDetailPaie(null); }
        setDetailLoading(false);
    };

    const chargerAbsences = useCallback(async () => {
        try {
            const params = new URLSearchParams({
                etablissement_id: String(etablissementId), mois_concerne: selectedMonth,
            });
            const res = await api.get(`/api/finance/salaires/absences-source?${params.toString()}`);
            setAbsenceRows(res.data?.absences || []);
            setAbsenceTotal(res.data?.total_retenue_estimee || 0);
        } catch { setAbsenceRows([]); setAbsenceTotal(0); }
    }, [etablissementId, selectedMonth]);

    useEffect(() => {
        if (activeTab === 'paie' && voirAbsences) chargerAbsences();
    }, [activeTab, voirAbsences, chargerAbsences]);

    // ─── Actions ─────────────────────────────────────────────────────────
    const handlePayGroup = async () => {
        if (bilan.aPayer.length === 0) {
            showMsg('Aucun salaire à verser pour ce mois.', 'error');
            return;
        }
        if (!confirm(
            `Payer ${bilan.aPayer.length} personne(s) pour ${selectedMonth} ?\n` +
            `Total : ${fmt(bilan.resteAVerser)}`
        )) return;
        try {
            const res = await api.post(`/api/finance/salaires/payer-group?etablissement_id=${etablissementId}&mois_concerne=${selectedMonth}&mode_paiement=ESPECES`);
            const echecs = res.data?.echecs || [];
            showMsg(res.data?.message || 'Paiements effectués', echecs.length ? 'error' : 'success');
            invalidateSalaires(); invalidateEmployes();
            queryClient.invalidateQueries({ queryKey: ['depenses'] });
        } catch (err: any) {
            showMsg(err.response?.data?.detail || 'Erreur lors du paiement groupé', 'error');
        }
    };

    /* PAYER UNE PERSONNE — sur place.
       Ce bouton renvoyait vers le module « Décaissement », qui rouvrait la
       liste complète des 46 employés dans une fenêtre de 600 px : pour payer
       Oumar, le comptable revoyait tout le monde, et cette liste-là lisait
       `etablissement_id=1` en dur — donc le personnel d'une AUTRE école.
       Le comptable a déjà la ligne sous les yeux : il lui faut la confirmation
       de ce qu'il verse, pas un second écran. */
    const [aPayer, setAPayer] = useState<any>(null);
    const [paiementEnCours, setPaiementEnCours] = useState(false);

    const ficheDeLaPersonne = useMemo(
        () => (aPayer ? employes.find(e => e.employe_id === aPayer.employe_id) : null),
        [aPayer, employes]);

    const confirmerPaiement = async () => {
        if (!aPayer) return;
        setPaiementEnCours(true);
        try {
            const res = await api.post('/api/finance/salaires/payer', {
                // L'école vient du jeton, jamais du corps de la requête.
                enseignant_id: aPayer.employe_id,
                mois: selectedMonth,
                mode_paiement: 'ESPECES',
            });
            showMsg(res.data?.message || `${aPayer.prenom} ${aPayer.nom} payé(e) pour ${selectedMonth}`, 'success');
            setAPayer(null);
            invalidateSalaires(); invalidateEmployes();
            queryClient.invalidateQueries({ queryKey: ['depenses'] });
        } catch (err: any) {
            showMsg(err.response?.data?.detail || 'Erreur lors du paiement', 'error');
        }
        setPaiementEnCours(false);
    };

    const apresMouvement = () => {
        invalidateSalaires(); invalidateEmployes();
        queryClient.invalidateQueries({ queryKey: ['depenses'] });
    };

    const handleAddBonus = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            await api.post('/api/finance/primes', {
                employe_id: targetEmpId, montant: parseFloat(formMontant),
                motif: formMotif, mois_concerne: selectedMonth,
            });
            showMsg('Prime ajoutée', 'success');
            setFormMontant(''); setFormMotif(''); apresMouvement();
        } catch (err: any) {
            showMsg(err.response?.data?.detail || "Erreur lors de l'ajout", 'error');
        }
    };

    const handleAddAdvance = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            await api.post('/api/finance/avances', {
                employe_id: targetEmpId, montant: parseFloat(formMontant),
                mois_concerne: selectedMonth,
            });
            showMsg('Avance enregistrée — elle sera déduite du salaire du mois', 'success');
            setFormMontant(''); apresMouvement();
        } catch (err: any) {
            showMsg(err.response?.data?.detail || "Erreur lors de l'enregistrement", 'error');
        }
    };

    const viewBulletinDetail = async (id: number) => {
        setBulletinLoading(true); setSelectedBulletin(id);
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
        if (!paydayDate) { showMsg('Choisissez d\'abord une date', 'error'); return; }
        try {
            setSavingPayday(true);
            await api.put('/api/finance/salaires/date-paie', {
                etablissement_id: etablissementId, mois: selectedMonth, date_paie: paydayDate,
            });
            showMsg('Date de paie enregistrée', 'success');
        } catch { showMsg('Erreur lors de l\'enregistrement', 'error'); }
        setSavingPayday(false);
    };

    const handleSendPayAlerts = async () => {
        try {
            await api.post('/api/finance/salaires/alertes', {
                etablissement_id: etablissementId, mois_concerne: selectedMonth,
                force: true, type: 'FORCE',
            });
            showMsg('Le personnel a été prévenu de la date de paie', 'success');
        } catch { showMsg('Erreur lors de l\'envoi', 'error'); }
    };

    // ─── Styles partagés ─────────────────────────────────────────────────
    const carte: React.CSSProperties = {
        background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0',
        boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
    };
    const th: React.CSSProperties = { padding: '13px 16px', textAlign: 'left', fontWeight: 600, color: '#475569' };
    const td: React.CSSProperties = { padding: '13px 16px' };
    const champ: React.CSSProperties = {
        width: '100%', padding: '9px 10px', borderRadius: 8,
        border: '1px solid #e2e8f0', fontSize: 13, outline: 'none', boxSizing: 'border-box',
    };
    const label: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 4 };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <AnimatePresence>
                {message && (
                    <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
                        style={{ position: 'fixed', top: 20, right: 20, zIndex: 9999, padding: '12px 20px', borderRadius: 10, color: '#fff', fontWeight: 600, fontSize: 13, maxWidth: 420, boxShadow: '0 4px 12px rgba(0,0,0,0.15)', background: message.type === 'success' ? '#10b981' : '#ef4444' }}>
                        {message.text}
                    </motion.div>
                )}
            </AnimatePresence>

            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#64748b' }}>
                <Link href="/comptabilite" style={{ color: '#10b981' }}>Comptabilité</Link>
                <ChevronRight size={14} />
                <span style={{ fontWeight: 600, color: '#1e293b' }}>Salaires</span>
            </div>

            {/* En-tête : le mois, et rien d'autre. La date de paie et les alertes
                ne sont pas des réglages permanents — elles appartiennent à la
                préparation du mois, où elles servent. */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
                <div>
                    <h1 style={{ fontSize: 24, fontWeight: 800, color: '#1e293b' }}>Salaires</h1>
                    <p style={{ fontSize: 14, color: '#64748b', marginTop: 4 }}>
                        Qui l&apos;école paie, combien, et ce qui a déjà été versé.
                    </p>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <label style={{ fontSize: 13, fontWeight: 600, color: '#475569' }}>Mois :</label>
                    <select value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)}
                        style={{ padding: '9px 12px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13, fontWeight: 600, background: '#fff', outline: 'none', textTransform: 'capitalize' }}>
                        {moisDisponibles.map(m => (
                            <option key={m.valeur} value={m.valeur} style={{ textTransform: 'capitalize' }}>{m.libelle}</option>
                        ))}
                    </select>
                </div>
            </div>

            <div style={{ display: 'flex', borderBottom: '2px solid #f1f5f9', gap: 18, flexWrap: 'wrap' }}>
                {ONGLETS.map(tab => (
                    <button key={tab.id} onClick={() => router.push(`/comptabilite/salaires?tab=${tab.id}`)}
                        style={{
                            padding: '12px 4px', border: 'none', background: 'none', fontSize: 14,
                            fontWeight: activeTab === tab.id ? 700 : 500,
                            color: activeTab === tab.id ? '#10b981' : '#64748b',
                            borderBottom: activeTab === tab.id ? '3px solid #10b981' : '3px solid transparent',
                            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, marginBottom: -2,
                        }}>
                        <tab.icon size={16} />{tab.label}
                    </button>
                ))}
            </div>

            {/* ═══════════ 1. PERSONNEL ═══════════ */}
            {activeTab === 'personnel' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <p style={{ fontSize: 13, color: '#64748b' }}>
                        <Users size={14} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 6 }} />
                        Le personnel est enregistré par la direction. Cliquez sur une ligne pour voir d&apos;où vient son salaire.
                    </p>

                    <div style={{ display: 'grid', gridTemplateColumns: selectedEmpDetail ? 'minmax(0,1fr) minmax(0,1fr)' : '1fr', gap: 16 }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                            {empLoading ? (
                                <div style={{ ...carte, padding: 40, textAlign: 'center' }}>
                                    <Loader2 size={22} className="animate-spin" color="#10b981" />
                                </div>
                            ) : groupes.length === 0 ? (
                                <div style={{ ...carte, padding: 40, textAlign: 'center', color: '#94a3b8' }}>
                                    Aucun employé enregistré
                                </div>
                            ) : groupes.map(groupe => (
                                <div key={groupe.cle} style={{ ...carte, overflow: 'hidden' }}>
                                    <div style={{ padding: '14px 18px', borderBottom: '1px solid #e2e8f0', background: '#fbfdfc' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
                                            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: '#0f172a' }}>
                                                {groupe.titre}
                                                <span style={{ marginLeft: 8, fontSize: 12, fontWeight: 600, color: '#64748b' }}>
                                                    {groupe.lignes.length}
                                                </span>
                                            </h3>
                                            <span style={{ fontSize: 13, fontWeight: 700, color: '#10b981' }}>
                                                {fmt(groupe.total)} / mois
                                            </span>
                                        </div>
                                        <p style={{ margin: '4px 0 0', fontSize: 12, color: '#64748b' }}>{groupe.note}</p>
                                        <p style={{ margin: '6px 0 0', fontSize: 12, fontWeight: 600, color: groupe.payes === groupe.lignes.length ? '#059669' : '#b45309' }}>
                                            {groupe.payes} / {groupe.lignes.length} payé{groupe.payes > 1 ? 's' : ''} pour {selectedMonth}
                                        </p>
                                    </div>
                                    <div style={{ overflowX: 'auto' }}>
                                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                                            <thead>
                                                <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                                                    <th style={th}>Nom</th>
                                                    <th style={th}>Poste</th>
                                                    <th style={th}>Rémunération</th>
                                                    <th style={th}>Salaire du mois</th>
                                                    <th style={th}>{selectedMonth}</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {groupe.lignes.map((emp: any) => (
                                                    <tr key={emp.employe_id} onClick={() => handleSelectEmp(emp)}
                                                        style={{
                                                            borderBottom: '1px solid #f1f5f9', cursor: 'pointer',
                                                            background: selectedEmpDetail?.employe_id === emp.employe_id ? '#f0fdf4' : 'transparent',
                                                        }}>
                                                        <td style={{ ...td, fontWeight: 600 }}>{emp.prenom} {emp.nom}</td>
                                                        <td style={{ ...td, color: '#3b82f6', fontWeight: 500 }}>{emp.poste}</td>
                                                        <td style={td}><BadgeMode mode={emp.mode_remuneration} /></td>
                                                        <td style={{ ...td, fontWeight: 700 }}>
                                                            {(emp.salaire_base || 0) > 0 ? fmt(emp.salaire_base) : (
                                                                <span style={{ color: '#b45309', fontWeight: 600, fontSize: 12 }}>À compléter</span>
                                                            )}
                                                        </td>
                                                        {/* Un mois payé ne se repaie pas : l'écran doit le
                                                            dire avant que le comptable ne clique. */}
                                                        <td style={td}>
                                                            <span style={{
                                                                padding: '3px 10px', borderRadius: 999, fontSize: 11, fontWeight: 700,
                                                                background: emp.paye_ce_mois ? '#dcfce7' : '#fef3c7',
                                                                color: emp.paye_ce_mois ? '#166534' : '#92400e',
                                                            }}>
                                                                {emp.paye_ce_mois ? 'Payé' : 'À payer'}
                                                            </span>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            ))}
                        </div>

                        {selectedEmpDetail && (
                            <motion.div initial={{ opacity: 0, x: 15 }} animate={{ opacity: 1, x: 0 }}
                                style={{ ...carte, padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                    <div>
                                        <h3 style={{ fontSize: 16, fontWeight: 800, color: '#1e293b' }}>
                                            {selectedEmpDetail.prenom} {selectedEmpDetail.nom}
                                        </h3>
                                        <p style={{ fontSize: 13, color: '#3b82f6', fontWeight: 600, marginTop: 2 }}>{selectedEmpDetail.poste}</p>
                                    </div>
                                    <button onClick={() => setSelectedEmpDetail(null)}
                                        style={{ border: 'none', background: '#f1f5f9', width: 28, height: 28, borderRadius: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                                        <X size={14} />
                                    </button>
                                </div>

                                <div style={{ background: '#f8fafc', borderRadius: 10, padding: 14 }}>
                                    <p style={{ color: '#94a3b8', fontSize: 10, fontWeight: 700, textTransform: 'uppercase' }}>Salaire du mois</p>
                                    <p style={{ fontSize: 20, fontWeight: 800, color: '#10b981', marginTop: 2 }}>{fmt(selectedEmpDetail.salaire_base)}</p>
                                    <p style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
                                        {selectedEmpDetail.explication_salaire || 'Salaire mensuel fixe.'}
                                    </p>
                                </div>

                                {detailLoading ? (
                                    <div style={{ textAlign: 'center', padding: 20 }}><Loader2 size={20} className="animate-spin" color="#10b981" /></div>
                                ) : detailPaie && detailPaie.lignes?.length > 0 ? (
                                    <div>
                                        <h4 style={{ fontSize: 13, fontWeight: 700, color: '#1e293b', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                                            <BookOpen size={14} color="#3b82f6" />
                                            {detailPaie.mode === 'HORAIRE' ? 'Ce qui compose son salaire' : 'Ses classes (à titre indicatif)'}
                                        </h4>
                                        <div style={{ overflowX: 'auto' }}>
                                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                                                <thead>
                                                    <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                                                        <th style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 600 }}>Matière</th>
                                                        <th style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 600 }}>Classe</th>
                                                        <th style={{ padding: '8px 10px', textAlign: 'center', fontWeight: 600 }}>H/sem</th>
                                                        <th style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 600 }}>Tarif</th>
                                                        {detailPaie.mode === 'HORAIRE' && (
                                                            <th style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 600 }}>Par mois</th>
                                                        )}
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {detailPaie.lignes.map((l: any) => (
                                                        <tr key={l.affectation_id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                                            <td style={{ padding: '8px 10px', fontWeight: 600 }}>{l.matiere}</td>
                                                            <td style={{ padding: '8px 10px', color: '#3b82f6' }}>{l.classe}</td>
                                                            <td style={{ padding: '8px 10px', textAlign: 'center', fontWeight: 600 }}>{l.heures_semaine}h</td>
                                                            <td style={{ padding: '8px 10px', textAlign: 'right' }}>
                                                                {fmt(l.taux_horaire)}/h
                                                                {l.taux_specifique && (
                                                                    <span title="Tarif propre à cette classe" style={{ marginLeft: 4, color: '#7c3aed', fontWeight: 700 }}>*</span>
                                                                )}
                                                            </td>
                                                            {detailPaie.mode === 'HORAIRE' && (
                                                                <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700, color: '#10b981' }}>
                                                                    {fmt(Math.round(l.montant_mensuel))}
                                                                </td>
                                                            )}
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                        <p style={{ fontSize: 11.5, color: '#94a3b8', marginTop: 8 }}>
                                            {detailPaie.total_heures}h par semaine au total.
                                            {detailPaie.lignes.some((l: any) => l.taux_specifique) && ' Le * signale un tarif propre à cette classe.'}
                                        </p>
                                    </div>
                                ) : String(selectedEmpDetail.employe_id).startsWith('ENS_') ? (
                                    <div style={{ padding: 16, textAlign: 'center', color: '#b45309', fontSize: 12.5, background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10 }}>
                                        Aucune classe ne lui est affectée cette année. Un enseignant payé à
                                        l&apos;heure sans affectation n&apos;a aucun salaire à percevoir.
                                    </div>
                                ) : (
                                    <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 10, padding: 16, textAlign: 'center' }}>
                                        <Landmark size={22} color="#3b82f6" style={{ margin: '0 auto 8px' }} />
                                        <p style={{ fontSize: 12.5, color: '#1e40af' }}>
                                            Salaire fixe versé chaque mois, sans calcul d&apos;heures.
                                        </p>
                                    </div>
                                )}
                            </motion.div>
                        )}
                    </div>
                </div>
            )}

            {/* ═══════════ 2. PRÉPARER LA PAIE ═══════════ */}
            {activeTab === 'paie' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

                    {/* Le bilan avant le tableau : ce qui reste à verser, et ce qui
                        bloque. Le total seul laissait croire que tout était prêt. */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 12 }}>
                        {/* LE JOUR DE PAIE, EN PREMIER
                            « Qui l'école paie, combien, et ce qui a déjà été versé »
                            manquait de la seule information qui déclenche le geste :
                            QUAND. Le comptable avait le montant sous les yeux sans
                            savoir si le versement est pour aujourd'hui, dans dix
                            jours, ou en retard. */}
                        <div style={{ ...carte, padding: 16, borderColor: joursAvantPaie !== null && joursAvantPaie < 0 ? '#fecaca' : '#e2e8f0', background: joursAvantPaie !== null && joursAvantPaie < 0 ? '#fef2f2' : '#fff' }}>
                            <p style={{ fontSize: 10.5, color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase' }}>Jour de paie</p>
                            <p style={{ fontSize: 20, fontWeight: 800, color: joursAvantPaie !== null && joursAvantPaie < 0 ? '#b91c1c' : '#0f172a', marginTop: 4 }}>
                                {paydayDate
                                    ? new Date(paydayDate).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })
                                    : '—'}
                            </p>
                            <p style={{ fontSize: 12, color: joursAvantPaie !== null && joursAvantPaie < 0 ? '#991b1b' : '#64748b' }}>
                                {!paydayDate ? 'À fixer ci-dessous'
                                    : joursAvantPaie === 0 ? "C'est aujourd'hui"
                                    : joursAvantPaie! > 0 ? `Dans ${joursAvantPaie} jour${joursAvantPaie! > 1 ? 's' : ''}`
                                    : `Dépassé de ${Math.abs(joursAvantPaie!)} jour${Math.abs(joursAvantPaie!) > 1 ? 's' : ''}`}
                            </p>
                        </div>
                        <div style={{ ...carte, padding: 16 }}>
                            <p style={{ fontSize: 10.5, color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase' }}>Reste à verser</p>
                            <p style={{ fontSize: 20, fontWeight: 800, color: '#10b981', marginTop: 4 }}>{fmt(bilan.resteAVerser)}</p>
                            <p style={{ fontSize: 12, color: '#64748b' }}>{bilan.aPayer.length} personne(s)</p>
                        </div>
                        <div style={{ ...carte, padding: 16 }}>
                            <p style={{ fontSize: 10.5, color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase' }}>Déjà payé ce mois</p>
                            <p style={{ fontSize: 20, fontWeight: 800, color: '#1e293b', marginTop: 4 }}>{fmt(bilan.dejaVerse)}</p>
                            <p style={{ fontSize: 12, color: '#64748b' }}>{bilan.payes.length} personne(s)</p>
                        </div>
                        <div style={{ ...carte, padding: 16, borderColor: bilan.aCompleter.length ? '#fde68a' : '#e2e8f0', background: bilan.aCompleter.length ? '#fffbeb' : '#fff' }}>
                            <p style={{ fontSize: 10.5, color: '#b45309', fontWeight: 700, textTransform: 'uppercase' }}>Salaire à compléter</p>
                            <p style={{ fontSize: 20, fontWeight: 800, color: '#b45309', marginTop: 4 }}>{bilan.aCompleter.length}</p>
                            <p style={{ fontSize: 12, color: '#92400e' }}>
                                {bilan.aCompleter.length ? bilan.aCompleter.map(s => `${s.prenom} ${s.nom}`).join(', ').slice(0, 60) : 'Aucun'}
                            </p>
                        </div>
                        {bilan.enErreur.length > 0 && (
                            <div style={{ ...carte, padding: 16, borderColor: '#fecaca', background: '#fef2f2' }}>
                                <p style={{ fontSize: 10.5, color: '#b91c1c', fontWeight: 700, textTransform: 'uppercase' }}>Calcul impossible</p>
                                <p style={{ fontSize: 20, fontWeight: 800, color: '#b91c1c', marginTop: 4 }}>{bilan.enErreur.length}</p>
                                <p style={{ fontSize: 12, color: '#991b1b' }}>Voir les lignes en rouge</p>
                            </div>
                        )}
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#64748b' }}>
                            <AlertCircle size={15} style={{ color: '#3b82f6' }} />
                            Net à payer = salaire + primes − absences non justifiées − avances déjà versées
                        </div>
                        <div style={{ display: 'flex', gap: 8 }}>
                            <button onClick={handlePayGroup}
                                style={{ padding: '9px 16px', background: '#10b981', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                                <CheckCircle size={16} /> Tout payer ({bilan.aPayer.length})
                            </button>
                            <button onClick={invalidateSalaires} title="Recalculer"
                                style={{ padding: '9px', background: '#f1f5f9', color: '#475569', border: '1px solid #e2e8f0', borderRadius: 8, cursor: 'pointer' }}>
                                <RefreshCw size={16} className={salLoading ? 'animate-spin' : ''} />
                            </button>
                        </div>
                    </div>

                    <div style={{ ...carte, overflow: 'hidden' }}>
                        <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                                <thead>
                                    <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                                        <th style={th}>Employé</th>
                                        <th style={th}>Salaire</th>
                                        <th style={th}>Primes</th>
                                        <th style={th}>Retenues</th>
                                        <th style={th}>Net à payer</th>
                                        <th style={th}></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {salLoading && salaires.length === 0 ? (
                                        <tr><td colSpan={6} style={{ padding: 40, textAlign: 'center' }}>
                                            <Loader2 size={22} className="animate-spin" color="#10b981" />
                                        </td></tr>
                                    ) : salaires.length === 0 ? (
                                        <tr><td colSpan={6} style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>
                                            Aucun personnel actif à payer.
                                        </td></tr>
                                    ) : salaires.map((sal, idx) => {
                                        const enErreur = sal.statut === 'ERREUR';
                                        const retenues = (sal.total_absences || 0) + (sal.total_avances || 0);
                                        return (
                                            <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9', background: enErreur ? '#fef2f2' : 'transparent' }}>
                                                <td style={td}>
                                                    <div style={{ fontWeight: 600 }}>{sal.prenom} {sal.nom}</div>
                                                    <div style={{ fontSize: 11.5, color: '#94a3b8', display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                                                        {sal.poste}
                                                        {!enErreur && <BadgeMode mode={sal.mode_remuneration} />}
                                                    </div>
                                                </td>
                                                {enErreur ? (
                                                    <td colSpan={4} style={{ ...td, color: '#b91c1c', fontWeight: 600, fontSize: 12.5 }}>
                                                        <AlertTriangle size={14} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 6 }} />
                                                        Calcul impossible : {sal.erreur}
                                                    </td>
                                                ) : (
                                                    <>
                                                        <td style={td}>
                                                            {fmt(sal.salaire_base)}
                                                            {(sal.total_heures || 0) > 0 && (
                                                                <div style={{ fontSize: 11, color: '#94a3b8' }}>{sal.total_heures}h/sem</div>
                                                            )}
                                                        </td>
                                                        <td style={{ ...td, color: (sal.total_primes || 0) > 0 ? '#10b981' : '#cbd5e1', fontWeight: 600 }}>
                                                            {(sal.total_primes || 0) > 0 ? `+${fmt(sal.total_primes)}` : '—'}
                                                        </td>
                                                        <td style={{ ...td, color: retenues > 0 ? '#ef4444' : '#cbd5e1', fontWeight: 600 }}>
                                                            {retenues > 0 ? `−${fmt(retenues)}` : '—'}
                                                            {retenues > 0 && (
                                                                <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 400 }}>
                                                                    {(sal.total_absences || 0) > 0 && `absences ${fmt(sal.total_absences)}`}
                                                                    {(sal.total_absences || 0) > 0 && (sal.total_avances || 0) > 0 && ' · '}
                                                                    {(sal.total_avances || 0) > 0 && `avances ${fmt(sal.total_avances)}`}
                                                                </div>
                                                            )}
                                                        </td>
                                                        <td style={{ ...td, fontWeight: 800, fontSize: 14, color: (sal.net_a_payer || 0) > 0 ? '#10b981' : '#b45309' }}>
                                                            {(sal.net_a_payer || 0) > 0 ? fmt(sal.net_a_payer) : 'À compléter'}
                                                        </td>
                                                    </>
                                                )}
                                                <td style={{ ...td, textAlign: 'right' }}>
                                                    {enErreur ? null : sal.statut === 'PAYE' ? (
                                                        <span style={{ color: '#10b981', fontWeight: 600, fontSize: 12.5, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                                            <Check size={14} /> Payé
                                                        </span>
                                                    ) : (sal.net_a_payer || 0) > 0 ? (
                                                        <button onClick={() => setAPayer(sal)}
                                                            style={{ padding: '6px 14px', background: '#10b981', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
                                                            Payer
                                                        </button>
                                                    ) : null}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* La date de paie : un réglage du mois, pas une destination. */}
                    <div style={{ ...carte, padding: 16, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                        <Calendar size={16} color="#64748b" />
                        <label style={{ fontSize: 13, fontWeight: 600, color: '#334155' }}>Date de paie annoncée :</label>
                        <input type="date" value={paydayDate} onChange={e => setPaydayDate(e.target.value)}
                            style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13 }} />
                        <button onClick={handleSavePayday} disabled={savingPayday}
                            style={{ padding: '8px 14px', borderRadius: 8, border: 'none', background: '#10b981', color: '#fff', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', opacity: savingPayday ? 0.6 : 1 }}>
                            Enregistrer
                        </button>
                        <button onClick={handleSendPayAlerts} disabled={!paydayDate}
                            style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', color: '#334155', fontSize: 12.5, fontWeight: 700, cursor: paydayDate ? 'pointer' : 'not-allowed', opacity: paydayDate ? 1 : 0.5 }}>
                            Prévenir le personnel
                        </button>
                    </div>

                    {/* Les absences justifient les retenues affichées plus haut.
                        Elles vivent donc ici, sous la colonne qu'elles expliquent. */}
                    <div style={{ ...carte, overflow: 'hidden' }}>
                        <button onClick={() => setVoirAbsences(v => !v)}
                            style={{ width: '100%', padding: '14px 16px', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600, color: '#334155', textAlign: 'left' }}>
                            {voirAbsences ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                            <HelpCircle size={15} color="#3b82f6" />
                            D&apos;où viennent les retenues d&apos;absence ?
                            {absenceTotal > 0 && (
                                <span style={{ marginLeft: 'auto', color: '#dc2626', fontWeight: 700 }}>−{fmt(absenceTotal)}</span>
                            )}
                        </button>
                        {voirAbsences && (
                            <div style={{ borderTop: '1px solid #f1f5f9' }}>
                                <p style={{ padding: '12px 16px 0', fontSize: 12.5, color: '#64748b', margin: 0 }}>
                                    Les absences sont pointées par la vie scolaire, jamais saisies ici.
                                    Le comptable les constate.
                                </p>
                                <div style={{ overflowX: 'auto' }}>
                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, marginTop: 8 }}>
                                        <thead>
                                            <tr style={{ background: '#f8fafc', borderTop: '1px solid #e2e8f0', borderBottom: '1px solid #e2e8f0' }}>
                                                {['Date', 'Employé', 'Justifiée', 'Motif', 'Retenue'].map(h => (
                                                    <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: '#475569' }}>{h}</th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {absenceRows.length === 0 ? (
                                                <tr><td colSpan={5} style={{ padding: 28, textAlign: 'center', color: '#94a3b8' }}>
                                                    Aucune absence enregistrée pour ce mois.
                                                </td></tr>
                                            ) : absenceRows.map((a, idx) => (
                                                <tr key={a.absence_id || idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                                    <td style={{ padding: '10px 14px' }}>{a.date_absence}</td>
                                                    <td style={{ padding: '10px 14px', fontWeight: 600 }}>{a.prenom} {a.nom}</td>
                                                    <td style={{ padding: '10px 14px' }}>
                                                        <span style={{ padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 700, background: a.est_justifie === 'O' ? '#dcfce7' : '#fee2e2', color: a.est_justifie === 'O' ? '#166534' : '#991b1b' }}>
                                                            {a.est_justifie === 'O' ? 'Oui' : 'Non'}
                                                        </span>
                                                    </td>
                                                    <td style={{ padding: '10px 14px', color: '#64748b' }}>{a.motif || '—'}</td>
                                                    <td style={{ padding: '10px 14px', fontWeight: 700, color: a.retenue_estimee > 0 ? '#dc2626' : '#16a34a' }}>
                                                        {fmt(a.retenue_estimee || 0)}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* ═══════════ 3. PRIMES & AVANCES ═══════════ */}
            {activeTab === 'avances' && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 18 }}>
                    <div style={{ ...carte, padding: 20 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                            <div style={{ width: 38, height: 38, borderRadius: 10, background: '#ecfdf5', color: '#10b981', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <PlusCircle size={19} />
                            </div>
                            <div>
                                <h3 style={{ fontSize: 15, fontWeight: 700, color: '#1e293b' }}>Ajouter une prime</h3>
                                <p style={{ fontSize: 12, color: '#64748b' }}>S&apos;ajoute au salaire de {selectedMonth}</p>
                            </div>
                        </div>
                        <form onSubmit={handleAddBonus} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                            <div>
                                <label style={label}>Employé</label>
                                <select value={targetEmpId} onChange={e => setTargetEmpId(e.target.value)} style={{ ...champ, background: '#fff' }}>
                                    {employes.map(e => <option key={e.employe_id} value={e.employe_id}>{e.prenom} {e.nom}</option>)}
                                </select>
                            </div>
                            <div>
                                <label style={label}>Montant (GNF)</label>
                                <input type="number" min={1} required value={formMontant} onChange={e => setFormMontant(e.target.value)} placeholder="100000" style={champ} />
                            </div>
                            <div>
                                <label style={label}>Motif</label>
                                <input required value={formMotif} onChange={e => setFormMotif(e.target.value)} placeholder="Prime de rendement" style={champ} />
                            </div>
                            <button type="submit" style={{ padding: 10, background: '#10b981', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 600, cursor: 'pointer', marginTop: 4 }}>
                                Ajouter la prime
                            </button>
                        </form>
                    </div>

                    <div style={{ ...carte, padding: 20 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                            <div style={{ width: 38, height: 38, borderRadius: 10, background: '#fffbeb', color: '#f59e0b', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <MinusCircle size={19} />
                            </div>
                            <div>
                                <h3 style={{ fontSize: 15, fontWeight: 700, color: '#1e293b' }}>Enregistrer une avance</h3>
                                <p style={{ fontSize: 12, color: '#64748b' }}>Déduite du salaire de {selectedMonth}</p>
                            </div>
                        </div>
                        <form onSubmit={handleAddAdvance} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                            <div>
                                <label style={label}>Employé</label>
                                <select value={targetEmpId} onChange={e => setTargetEmpId(e.target.value)} style={{ ...champ, background: '#fff' }}>
                                    {employes.map(e => <option key={e.employe_id} value={e.employe_id}>{e.prenom} {e.nom}</option>)}
                                </select>
                            </div>
                            <div>
                                <label style={label}>Montant remis (GNF)</label>
                                <input type="number" min={1} required value={formMontant} onChange={e => setFormMontant(e.target.value)} placeholder="200000" style={champ} />
                            </div>
                            <button type="submit" style={{ padding: 10, background: '#f59e0b', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 600, cursor: 'pointer', marginTop: 4 }}>
                                Enregistrer l&apos;avance
                            </button>
                        </form>
                    </div>

                    <div style={{ ...carte, padding: 20 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                            <div style={{ width: 38, height: 38, borderRadius: 10, background: '#eff6ff', color: '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <Clock size={19} />
                            </div>
                            <div>
                                <h3 style={{ fontSize: 15, fontWeight: 700, color: '#1e293b' }}>Et les absences ?</h3>
                                <p style={{ fontSize: 12, color: '#64748b' }}>Elles ne se saisissent pas ici</p>
                            </div>
                        </div>
                        <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: 14, fontSize: 12.5, color: '#475569', lineHeight: 1.65 }}>
                            <p style={{ margin: 0 }}>
                                Les absences sont pointées par la vie scolaire. La retenue est
                                calculée toute seule et apparaît dans <strong>Préparer la paie</strong>.
                            </p>
                            <button onClick={() => { setVoirAbsences(true); router.push('/comptabilite/salaires?tab=paie'); }}
                                style={{ marginTop: 12, padding: '8px 12px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, cursor: 'pointer', fontSize: 12.5, fontWeight: 600, color: '#334155' }}>
                                Voir les absences du mois
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ═══════════ 4. BULLETINS ═══════════ */}
            {/* « Historique de paie » affichait cette même table filtrée sur une
                personne : c'est devenu un filtre, pas un onglet. */}
            {activeTab === 'bulletins' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <div style={{ ...carte, padding: 14, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                        <label style={{ fontSize: 13, fontWeight: 600, color: '#334155' }}>Afficher :</label>
                        <select value={bulletinEmpFiltre} onChange={e => setBulletinEmpFiltre(e.target.value)}
                            style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13, background: '#fff', minWidth: 220 }}>
                            <option value="">Tout le personnel</option>
                            {employes.map(e => <option key={e.employe_id} value={e.employe_id}>{e.prenom} {e.nom}</option>)}
                        </select>
                        <span style={{ marginLeft: 'auto', fontSize: 13, color: '#64748b' }}>
                            {bulletins.length} versement(s) —{' '}
                            <strong style={{ color: '#1e293b' }}>
                                {fmt(bulletins.reduce((t, b) => t + (b.net_a_payer || 0), 0))}
                            </strong>
                        </span>
                    </div>

                    <div style={{ ...carte, overflow: 'hidden' }}>
                        <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                                <thead>
                                    <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                                        <th style={th}>Mois</th>
                                        <th style={th}>Employé</th>
                                        <th style={th}>Salaire</th>
                                        <th style={th}>Net versé</th>
                                        <th style={th}>Payé le</th>
                                        <th style={th}>Mode</th>
                                        <th style={th}></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {bulletins.length === 0 ? (
                                        <tr><td colSpan={7} style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>
                                            Aucun salaire versé pour l&apos;instant.
                                        </td></tr>
                                    ) : bulletins.map((b, idx) => (
                                        <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                            <td style={{ ...td, fontWeight: 700, color: '#3b82f6' }}>{b.mois_concerne || '—'}</td>
                                            <td style={{ ...td, fontWeight: 600 }}>
                                                {b.prenom} {b.nom}
                                                <div style={{ fontSize: 11.5, color: '#94a3b8' }}>{b.poste}</div>
                                            </td>
                                            <td style={td}>{fmt(b.salaire_base)}</td>
                                            <td style={{ ...td, fontWeight: 800, color: '#10b981' }}>{fmt(b.net_a_payer)}</td>
                                            <td style={td}>{b.date_paiement || '—'}</td>
                                            <td style={td}>{b.mode_paiement || '—'}</td>
                                            <td style={{ ...td, textAlign: 'right' }}>
                                                {/* La route attend un depense_id : lui passer le
                                                    bulletin_id affichait le bulletin d'une AUTRE
                                                    personne — deux numerotations independantes. */}
                                                {b.bulletin_id ? (
                                                    <button onClick={() => viewBulletinDetail(b.depense_id)}
                                                        style={{ padding: '6px 12px', background: '#eff6ff', color: '#3b82f6', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                                        <Eye size={14} /> Fiche de paie
                                                    </button>
                                                ) : (
                                                    <span style={{ fontSize: 11.5, color: '#94a3b8' }}>—</span>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {/* MODAL : bulletin imprimable */}
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
                                    <div className="no-print" style={{ padding: '16px 24px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <h3 style={{ fontSize: 16, fontWeight: 700 }}>Bulletin de salaire</h3>
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

                                    <div style={{ padding: 36, fontFamily: 'system-ui' }}>
                                        <div style={{ textAlign: 'center', marginBottom: 28, paddingBottom: 16, borderBottom: '2px solid #1e293b' }}>
                                            <h2 style={{ fontSize: 20, fontWeight: 800, color: '#1e293b', textTransform: 'uppercase' }}>{etablissementInfo?.nom || 'ÉCOLE'}</h2>
                                            <p style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>
                                                {etablissementInfo?.adresse || 'République de Guinée'}
                                                {etablissementInfo?.telephone ? ` • Tél : ${etablissementInfo.telephone}` : ''}
                                            </p>
                                            <h3 style={{ fontSize: 15, fontWeight: 700, marginTop: 12, color: '#10b981', letterSpacing: 1 }}>
                                                BULLETIN DE PAIE — {bulletinDetails.bulletin.mois_concerne}
                                            </h3>
                                        </div>

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
                                            </div>
                                        </div>

                                        <div className="table-scroll">
                                        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 28, fontSize: 13, minWidth: '420px' }}>
                                            <thead>
                                                <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                                                    <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 700 }}>Élément</th>
                                                    <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700 }}>Gain (+)</th>
                                                    <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700 }}>Retenue (−)</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                                                    <td style={{ padding: 12 }}>Salaire de base</td>
                                                    <td style={{ padding: 12, textAlign: 'right', fontWeight: 600 }}>{fmt(bulletinDetails.bulletin.salaire_base)}</td>
                                                    <td style={{ padding: 12, textAlign: 'right', color: '#94a3b8' }}>—</td>
                                                </tr>
                                                {(bulletinDetails.details?.primes || []).map((p: any, i: number) => (
                                                    <tr key={i} style={{ borderBottom: '1px solid #f1f5f9', color: '#03543f' }}>
                                                        <td style={{ padding: 12 }}>Prime : {p.motif}</td>
                                                        <td style={{ padding: 12, textAlign: 'right', fontWeight: 600 }}>+{fmt(p.montant)}</td>
                                                        <td style={{ padding: 12, textAlign: 'right', color: '#94a3b8' }}>—</td>
                                                    </tr>
                                                ))}
                                                {bulletinDetails.bulletin.total_absences > 0 && (
                                                    <tr style={{ borderBottom: '1px solid #f1f5f9', color: '#9b1c1c' }}>
                                                        <td style={{ padding: 12 }}>
                                                            Retenue absences
                                                            {bulletinDetails.details?.details_absences_texte && (
                                                                <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
                                                                    {bulletinDetails.details.details_absences_texte}
                                                                </div>
                                                            )}
                                                        </td>
                                                        <td style={{ padding: 12, textAlign: 'right', color: '#94a3b8' }}>—</td>
                                                        <td style={{ padding: 12, textAlign: 'right', fontWeight: 600 }}>−{fmt(bulletinDetails.bulletin.total_absences)}</td>
                                                    </tr>
                                                )}
                                                {bulletinDetails.bulletin.total_avances > 0 && (
                                                    <tr style={{ borderBottom: '1px solid #f1f5f9', color: '#b25e02' }}>
                                                        <td style={{ padding: 12 }}>Avance déjà perçue</td>
                                                        <td style={{ padding: 12, textAlign: 'right', color: '#94a3b8' }}>—</td>
                                                        <td style={{ padding: 12, textAlign: 'right', fontWeight: 600 }}>−{fmt(bulletinDetails.bulletin.total_avances)}</td>
                                                    </tr>
                                                )}
                                            </tbody>
                                        </table>
                                        </div>

                                        <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12, padding: '20px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <div>
                                                <p style={{ fontSize: 11, color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase' }}>Net perçu</p>
                                                <p style={{ fontSize: 22, fontWeight: 900, color: '#10b981', marginTop: 4 }}>{fmt(bulletinDetails.bulletin.net_a_payer)}</p>
                                            </div>
                                            <div style={{ textAlign: 'right', fontSize: 11, color: '#64748b' }}>
                                                <p>{etablissementInfo?.nom || 'L\'établissement'}</p>
                                                <p style={{ fontWeight: 600, marginTop: 4 }}>Signature du comptable</p>
                                                <p style={{ fontStyle: 'italic', color: '#94a3b8', marginTop: 16 }}>(Document officiel électronique)</p>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ) : null}
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ── CONFIRMER UN VERSEMENT ──────────────────────────────────────
                Qui l'école paie, combien, et ce qui a déjà été versé. Rien
                d'autre : ni la liste des collègues, ni un montant à ressaisir. */}
            <AnimatePresence>
                {aPayer && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        onClick={() => !paiementEnCours && setAPayer(null)}
                        style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 16 }}>
                        <motion.div initial={{ scale: 0.96, y: 8 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.96, y: 8 }}
                            onClick={e => e.stopPropagation()}
                            style={{ background: '#fff', borderRadius: 14, width: '100%', maxWidth: 440, overflow: 'hidden' }}>

                            <div style={{ padding: '18px 22px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                <div>
                                    <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#0f172a' }}>
                                        {aPayer.prenom} {aPayer.nom}
                                    </h3>
                                    <p style={{ margin: '3px 0 0', fontSize: 12.5, color: '#64748b' }}>
                                        {aPayer.poste}
                                        {ficheDeLaPersonne?.telephone ? ` · ${ficheDeLaPersonne.telephone}` : ''}
                                    </p>
                                </div>
                                <button onClick={() => setAPayer(null)} disabled={paiementEnCours}
                                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: 2 }}>
                                    <X size={18} />
                                </button>
                            </div>

                            <div style={{ padding: '18px 22px', display: 'flex', flexDirection: 'column', gap: 9 }}>
                                <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>
                                    Salaire de {moisDisponibles.find(m => m.valeur === selectedMonth)?.libelle || selectedMonth}
                                </p>
                                {[
                                    ['Salaire de base', fmt(aPayer.salaire_base), '#0f172a'],
                                    ...((aPayer.total_primes || 0) > 0
                                        ? [['Primes', `+${fmt(aPayer.total_primes)}`, '#10b981'] as const] : []),
                                    ...((aPayer.total_absences || 0) > 0
                                        ? [['Retenue absences', `−${fmt(aPayer.total_absences)}`, '#ef4444'] as const] : []),
                                    ...((aPayer.total_avances || 0) > 0
                                        ? [['Avances déjà remises', `−${fmt(aPayer.total_avances)}`, '#ef4444'] as const] : []),
                                ].map(([libelle, montant, couleur]: any) => (
                                    <div key={libelle} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13.5 }}>
                                        <span style={{ color: '#475569' }}>{libelle}</span>
                                        <span style={{ fontWeight: 600, color: couleur }}>{montant}</span>
                                    </div>
                                ))}
                                <div style={{ borderTop: '1px solid #e2e8f0', marginTop: 4, paddingTop: 11, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                                    <span style={{ fontSize: 13.5, fontWeight: 700, color: '#334155' }}>Net à verser</span>
                                    <span style={{ fontSize: 21, fontWeight: 900, color: '#10b981' }}>{fmt(aPayer.net_a_payer)}</span>
                                </div>
                                {ficheDeLaPersonne && (
                                    <p style={{ margin: '2px 0 0', fontSize: 12, color: '#94a3b8' }}>
                                        Déjà versé cette année : {fmt(ficheDeLaPersonne.total_paye_annee)}
                                        {(ficheDeLaPersonne.nb_paiements || 0) > 0
                                            ? ` sur ${ficheDeLaPersonne.nb_paiements} mois` : ''}
                                    </p>
                                )}
                            </div>

                            <div style={{ padding: '14px 22px', background: '#f8fafc', borderTop: '1px solid #e2e8f0', display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                                <button onClick={() => setAPayer(null)} disabled={paiementEnCours}
                                    style={{ padding: '9px 16px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', color: '#475569', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                                    Annuler
                                </button>
                                <button onClick={confirmerPaiement} disabled={paiementEnCours}
                                    style={{ padding: '9px 20px', borderRadius: 8, border: 'none', background: '#10b981', color: '#fff', fontSize: 13, fontWeight: 700, cursor: paiementEnCours ? 'not-allowed' : 'pointer', opacity: paiementEnCours ? 0.6 : 1, display: 'flex', alignItems: 'center', gap: 7 }}>
                                    {paiementEnCours && <Loader2 size={15} className="animate-spin" />}
                                    Verser {fmt(aPayer.net_a_payer)}
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

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
