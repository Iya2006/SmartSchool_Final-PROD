'use client';

import { useState, useEffect, useCallback, useRef, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
    FileText, Search, Printer, Download, ChevronDown, Users,
    Award, BarChart2, BookOpen, Eye, X, GraduationCap, Trophy, Save, Edit3, Send, CheckCircle2, XCircle, TrendingDown, ClipboardList, Clock, Loader2
} from 'lucide-react';
import { useApp } from '@/context/AppContext';
import api from '@/lib/api';
import Pagination from '@/components/Pagination';



// ═══════════════════════════════════════════════════════════
// COMPOSANT PRINCIPAL : PAGE BULLETINS
// ═══════════════════════════════════════════════════════════

function BulletinsContent() {
    const { etablissementId, etablissementNom, etablissementLogo, etablissementCachet, etablissementSignature, etablissementDirecteur } = useApp();
    const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8300';
    const getPhotoUrl = (url: string | null | undefined) => {
        if (!url) return null;
        if (url.startsWith('http')) return url;
        return `${API_BASE}${url.startsWith('/') ? '' : '/'}${url}`;
    };
    const searchParams = useSearchParams();
    const [classes, setClasses] = useState<any[]>([]);
    const [trimestres, setTrimestres] = useState<any[]>([]);
    const [selectedClasse, setSelectedClasse] = useState<number | null>(null);
    const [selectedTrimestre, setSelectedTrimestre] = useState<number>(1);
    const [bulletins, setBulletins] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [selectedBulletin, setSelectedBulletin] = useState<any>(null);
    const [search, setSearch] = useState('');
    const [editDecision, setEditDecision] = useState('');
    const [savingDecision, setSavingDecision] = useState(false);
    const [decisionSaved, setDecisionSaved] = useState(false);
    const [initDone, setInitDone] = useState(false);
    const [docSettings, setDocSettings] = useState<any>({});
    const printRef = useRef<HTMLDivElement>(null);

    // Bulletin de période (trimestre/semestre) ou bulletin annuel consolidé
    const [typeBulletin, setTypeBulletin] = useState<'PERIODE' | 'ANNUEL'>('PERIODE');
    const [calculAnnuel, setCalculAnnuel] = useState(false);
    const [annuelMsg, setAnnuelMsg] = useState('');

    // Pagination + KPIs classe entière (une classe réelle peut dépasser 150
    // élèves — sans ça, tous les bulletins s'affichaient sur une seule page).
    const [bulletinsPage, setBulletinsPage] = useState(1);
    const [bulletinsTotal, setBulletinsTotal] = useState(0);
    const [classeKpis, setClasseKpis] = useState<{ moyenne: number | null; meilleure: number | null; plusFaible: number | null }>({ moyenne: null, meilleure: null, plusFaible: null });
    const BULLETINS_PAGE_SIZE = 24;
    // Types d'évaluation configurés — sert à expliquer le calcul en clair
    const [typesEval, setTypesEval] = useState<any[]>([]);

    // Infos de classe pour le bulletin
    const selectedClasseInfo = classes.find(c => c.classe_id === selectedClasse);
    const selectedTrimestreInfo = trimestres.find((t: any) => t.trimestre_id === selectedTrimestre);

    useEffect(() => {
        const loadInit = async () => {
            try {
                const [clsRes, triRes, paramRes, notationRes] = await Promise.all([
                    api.get(`/api/classes?etablissement_id=${etablissementId}`),
                    api.get('/api/portail-enseignant/referentiels/trimestres'),
                    api.get(`/api/parametrage/settings?etablissement_id=${etablissementId}&categorie=DOCUMENTS`).catch(() => ({ data: [] })),
                    api.get(`/api/parametrage/settings?etablissement_id=${etablissementId}&categorie=NOTATION`).catch(() => ({ data: [] })),
                ]);
                setClasses(clsRes.data);
                setTrimestres(triRes.data);
                try {
                    const typesRes = await api.get('/api/evaluations/types');
                    setTypesEval((typesRes.data || []).filter((t: any) => t.statut === 'ACTIF'));
                } catch { setTypesEval([]); }

                const parsed: any = {
                    champ_photo: true,
                    champ_moyenne_classe: true,
                    champ_min_max: true,
                    champ_rang: true,
                    champ_graphique: false,
                    signature_directeur: true,
                    signature_prof: true,
                    signature_parent: true,
                    filigrane_actif: false,
                    filigrane_texte: "SMARTSCHOOL",
                    filigrane_opacite: 0.1,
                    filigrane_bulletins: true,
                };
                for (const p of paramRes.data) {
                    const key = p.cle.replace('documents.', '');
                    if (p.type_valeur === 'BOOLEAN') parsed[key] = p.valeur === 'true';
                    else if (p.type_valeur === 'NUMBER') parsed[key] = parseFloat(p.valeur);
                    else parsed[key] = p.valeur;
                }
                // Paramètres > Notation > Affichage Bulletins (`notation.display.*`)
                // prend le dessus sur son équivalent `documents.champ_*` quand
                // présent — même règle de fusion que le backend (voir
                // get_bulletin_display_flags), pour que CETTE modale reste
                // synchronisée quelle que soit la page utilisée pour configurer.
                const notationDisplay: Record<string, string> = {};
                for (const p of (notationRes.data || [])) {
                    if (p.cle.startsWith('notation.display.')) {
                        notationDisplay[p.cle.replace('notation.display.', '')] = p.valeur;
                    }
                }
                if ('rang' in notationDisplay) parsed.champ_rang = notationDisplay.rang === 'true';
                if ('stats_matiere' in notationDisplay) {
                    parsed.champ_moyenne_classe = notationDisplay.stats_matiere === 'true';
                    parsed.champ_min_max = notationDisplay.stats_matiere === 'true';
                }
                setDocSettings(parsed);

                // Auto-select class & trimester from URL params (coming from Centralisation)
                const urlClasseId = searchParams.get('classe_id');
                const urlTrimestreId = searchParams.get('trimestre_id');
                if (urlClasseId) {
                    setSelectedClasse(parseInt(urlClasseId));
                }
                if (urlTrimestreId) {
                    setSelectedTrimestre(parseInt(urlTrimestreId));
                }
                setInitDone(true);
            } catch (e) { console.error(e); }
        };
        loadInit();
    }, [etablissementId, searchParams]);

    const loadBulletins = useCallback(async () => {
        if (!selectedClasse) return;
        setLoading(true);
        try {
            const skip = (bulletinsPage - 1) * BULLETINS_PAGE_SIZE;
            // Bulletin annuel : pas de période, on interroge type_bulletin=ANNUEL
            const params = typeBulletin === 'ANNUEL'
                ? `type_bulletin=ANNUEL&skip=${skip}&limit=${BULLETINS_PAGE_SIZE}`
                : `trimestre_id=${selectedTrimestre}&skip=${skip}&limit=${BULLETINS_PAGE_SIZE}`;
            const res = await api.get(`/api/evaluations/classe/${selectedClasse}/bulletins?${params}`);
            setBulletins(res.data);
            const h = res.headers || {};
            setBulletinsTotal(h['x-total-count'] !== undefined ? Number(h['x-total-count']) : res.data.length);
            setClasseKpis({
                moyenne: h['x-moyenne-classe'] !== undefined ? Number(h['x-moyenne-classe']) : null,
                meilleure: h['x-meilleure-moyenne'] !== undefined ? Number(h['x-meilleure-moyenne']) : null,
                plusFaible: h['x-plus-faible-moyenne'] !== undefined ? Number(h['x-plus-faible-moyenne']) : null,
            });
        } catch (e) { console.error(e); setBulletins([]); setBulletinsTotal(0); }
        setLoading(false);
    }, [selectedClasse, selectedTrimestre, bulletinsPage, typeBulletin]);

    useEffect(() => {
        if (selectedClasse) loadBulletins();
    }, [selectedClasse, selectedTrimestre, loadBulletins]);

    // Revenir à la page 1 en changeant de classe/période/type
    useEffect(() => { setBulletinsPage(1); }, [selectedClasse, selectedTrimestre, typeBulletin]);

    // Génération des bulletins annuels (agrège les périodes déjà calculées)
    const handleCalculerAnnuel = async () => {
        if (!selectedClasse) return;
        if (!confirm("Générer les bulletins annuels de cette classe ?\n\nIls agrègent les résultats des périodes déjà calculées.")) return;
        setCalculAnnuel(true);
        try {
            const res = await api.post(`/api/evaluations/classe/${selectedClasse}/calculer-moyennes-annuelles`);
            setAnnuelMsg(res.data.message);
            setTimeout(() => setAnnuelMsg(''), 6000);
            setTypeBulletin('ANNUEL');
        } catch (e: any) {
            alert(e?.response?.data?.detail || 'Erreur lors du calcul annuel');
        }
        setCalculAnnuel(false);
    };

    // Cycle réel issu de la base (Classe → Niveau → Cycle), et non déduit du
    // libellé : « contient Année » rangeait la 7ème à la 12ème dans le primaire.
    const groupedClasses = classes.reduce((acc: any, cls: any) => {
        const cycle = cls.cycle_libelle || 'Autres';
        if (!acc[cycle]) acc[cycle] = [];
        acc[cycle].push(cls);
        return acc;
    }, {});

    const filteredBulletins = bulletins.filter(b =>
        `${b.nom} ${b.prenom}`.toLowerCase().includes(search.toLowerCase()) ||
        b.matricule?.toLowerCase().includes(search.toLowerCase())
    );

    const getNoteColor = (note: number | null) => {
        if (note === null) return '#94a3b8';
        if (note >= 16) return '#059669';
        if (note >= 14) return '#10b981';
        if (note >= 10) return '#3b82f6';
        if (note >= 8) return '#f59e0b';
        return '#ef4444';
    };

    const getMentionStyle = (mention: string | null) => {
        switch (mention) {
            case 'TRÈS BIEN': return { bg: '#ecfdf5', color: '#065f46', border: '#6ee7b7' };
            case 'BIEN': return { bg: '#f0fdf4', color: '#166534', border: '#86efac' };
            case 'ASSEZ BIEN': return { bg: '#eff6ff', color: '#1e40af', border: '#93c5fd' };
            case 'PASSABLE': return { bg: '#fffbeb', color: '#92400e', border: '#fcd34d' };
            default: return { bg: '#fef2f2', color: '#991b1b', border: '#fca5a5' };
        }
    };

    // ═══ OUVRIR BULLETIN ═══
    const openBulletin = (b: any) => {
        setSelectedBulletin(b);
        setEditDecision(b.decision || '');
        setDecisionSaved(false);
    };

    // ═══ SAUVEGARDER DÉCISION ═══
    const saveDecision = async () => {
        if (!selectedBulletin) return;
        setSavingDecision(true);
        try {
            await api.put(`/api/evaluations/bulletins/${selectedBulletin.bulletin_id}/decision`, { decision: editDecision || null });
            // Update local state
            setSelectedBulletin({ ...selectedBulletin, decision: editDecision || null });
            setBulletins(prev => prev.map(b => b.bulletin_id === selectedBulletin.bulletin_id ? { ...b, decision: editDecision || null } : b));
            setDecisionSaved(true);
            setTimeout(() => setDecisionSaved(false), 3000);
        } catch (e) { console.error(e); }
        setSavingDecision(false);
    };

    // ═══ PUBLICATION INDIVIDUELLE ═══
    const publishBulletin = async (bulletinId: number) => {
        try {
            await api.put(`/api/evaluations/bulletins/${bulletinId}/publier`, {});
            setBulletins(prev => prev.map(b => b.bulletin_id === bulletinId ? { ...b, statut: 'PUBLIE' } : b));
            if (selectedBulletin?.bulletin_id === bulletinId) {
                setSelectedBulletin((prev: any) => ({ ...prev, statut: 'PUBLIE' }));
            }
        } catch (e) { console.error(e); }
    };

    const unpublishBulletin = async (bulletinId: number) => {
        try {
            await api.put(`/api/evaluations/bulletins/${bulletinId}/depublier`, {});
            setBulletins(prev => prev.map(b => b.bulletin_id === bulletinId ? { ...b, statut: 'BROUILLON' } : b));
            if (selectedBulletin?.bulletin_id === bulletinId) {
                setSelectedBulletin((prev: any) => ({ ...prev, statut: 'BROUILLON' }));
            }
        } catch (e) { console.error(e); }
    };

    // ═══ PUBLICATION EN MASSE ═══
    const [publishing, setPublishing] = useState(false);
    const publishAll = async () => {
        if (!selectedClasse) return;
        setPublishing(true);
        try {
            await api.put(`/api/evaluations/classe/${selectedClasse}/bulletins/publier-tout?trimestre_id=${selectedTrimestre}`, {});
            setBulletins(prev => prev.map(b => ({ ...b, statut: 'PUBLIE' })));
        } catch (e) { console.error(e); }
        setPublishing(false);
    };

    // ═══ IMPRESSION ═══
    const handlePrint = () => {
        if (!printRef.current) return;
        const content = printRef.current.innerHTML;
        const printWindow = window.open('', '_blank');
        if (!printWindow) return;
        printWindow.document.write(`<!DOCTYPE html><html><head><title>Bulletin de Notes - SMARTSCHOOL</title>
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap" rel="stylesheet">
        <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { font-family: 'Inter', sans-serif; background: white; }
            .no-print { display: none !important; }
            @media print { 
                body { padding: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; } 
                @page { margin: 10mm; size: A4 portrait; }
                .no-print { display: none !important; }
            }
        </style></head><body>${content}</body></html>`);
        printWindow.document.close();
        setTimeout(() => printWindow.print(), 500);
    };

    return (
        <div style={{ padding: '24px 30px', maxWidth: '1600px', margin: '0 auto', fontFamily: "'Inter', sans-serif" }}>
            {/* ═══ HEADER ═══ */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '28px' }}>
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '6px' }}>
                        <div style={{ width: '42px', height: '42px', borderRadius: '12px', background: 'linear-gradient(135deg, #059669, #10b981)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <FileText size={22} color="white" />
                        </div>
                        <h1 style={{ margin: 0, fontSize: '26px', fontWeight: 800, color: '#0f172a' }}>Bulletins Scolaires</h1>
                    </div>
                    <p style={{ margin: 0, fontSize: '14px', color: '#64748b' }}>Consultez et imprimez les bulletins de notes par classe et trimestre</p>
                </div>
            </div>

            {/* ═══ EXPLICATION DU CALCUL — transparence pour l'admin ═══ */}
            <div style={{ padding: '12px 18px', borderRadius: '12px', background: '#f5f3ff', border: '1px solid #ddd6fe', marginBottom: '20px', fontSize: '12.5px', color: '#5b21b6', display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                <ClipboardList size={16} style={{ flexShrink: 0, marginTop: '1px' }} />
                <span>
                    <strong>Comment ces moyennes sont calculées :</strong> pour chaque matière, les notes d&apos;un même
                    type sont moyennées entre elles puis pondérées par le coefficient du type
                    {typesEval.length > 0 && <> — {typesEval.map((t: any) => `${t.libelle} (coef. ${t.coefficient})`).join(', ')}</>}.
                    Moyenne générale = somme (moyenne matière × coefficient matière) ÷ somme des coefficients.
                    {typeBulletin === 'ANNUEL' && <> <strong>Le bulletin annuel</strong> agrège les moyennes de toutes les périodes de l&apos;année.</>}
                    {' '}Coefficients configurables dans Paramètres &gt; Notation.
                </span>
            </div>

            {annuelMsg && (
                <div style={{ padding: '12px 18px', borderRadius: '12px', background: '#ecfdf5', border: '1px solid #a7f3d0', marginBottom: '16px', fontSize: '13px', color: '#065f46', fontWeight: 600 }}>
                    {annuelMsg}
                </div>
            )}

            {/* ═══ SÉLECTEURS ═══ */}
            <div style={{ display: 'flex', gap: '16px', marginBottom: '24px', flexWrap: 'wrap', alignItems: 'center' }}>
                <select value={selectedClasse || ''} onChange={e => setSelectedClasse(Number(e.target.value) || null)}
                    style={{ padding: '10px 16px', borderRadius: '10px', border: '1.5px solid #e2e8f0', fontSize: '14px', fontWeight: 600, minWidth: '280px', background: 'white', cursor: 'pointer' }}>
                    <option value="">— Sélectionner une classe —</option>
                    {Object.entries(groupedClasses).map(([cycle, cls]: [string, any]) => (
                        <optgroup key={cycle} label={`Cycle ${cycle}`}>
                            {cls.map((c: any) => <option key={c.classe_id} value={c.classe_id}>{c.libelle}</option>)}
                        </optgroup>
                    ))}
                </select>
                {/* Période ou bulletin annuel consolidé */}
                <div style={{ display: 'flex', borderRadius: '10px', overflow: 'hidden', border: '1.5px solid #e2e8f0' }}>
                    {([
                        { key: 'PERIODE' as const, label: 'Par période' },
                        { key: 'ANNUEL' as const, label: 'Annuel' },
                    ]).map(opt => (
                        <button key={opt.key} onClick={() => setTypeBulletin(opt.key)}
                            style={{
                                padding: '10px 18px', border: 'none', cursor: 'pointer',
                                fontSize: '13.5px', fontWeight: 700,
                                background: typeBulletin === opt.key ? '#059669' : 'white',
                                color: typeBulletin === opt.key ? 'white' : '#64748b',
                            }}>
                            {opt.label}
                        </button>
                    ))}
                </div>
                {typeBulletin === 'PERIODE' && (
                    <select value={selectedTrimestre} onChange={e => setSelectedTrimestre(Number(e.target.value))}
                        style={{ padding: '10px 16px', borderRadius: '10px', border: '1.5px solid #e2e8f0', fontSize: '14px', fontWeight: 600, minWidth: '200px', background: 'white', cursor: 'pointer' }}>
                        {trimestres.length > 0 ? trimestres.map((t: any) => (
                            <option key={t.trimestre_id} value={t.trimestre_id}>{t.libelle}</option>
                        )) : (
                            <>
                                <option value={1}>1er Trimestre</option>
                                <option value={2}>2ème Trimestre</option>
                                <option value={3}>3ème Trimestre</option>
                            </>
                        )}
                    </select>
                )}
                {typeBulletin === 'ANNUEL' && selectedClasse && (
                    <button onClick={handleCalculerAnnuel} disabled={calculAnnuel}
                        style={{ padding: '10px 18px', borderRadius: '10px', border: 'none', background: 'linear-gradient(135deg, #059669, #10b981)', color: 'white', fontSize: '13.5px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <ClipboardList size={15} /> {calculAnnuel ? 'Calcul...' : 'Générer les bulletins annuels'}
                    </button>
                )}
                {filteredBulletins.length > 0 && (
                    <div style={{ position: 'relative', marginLeft: 'auto' }}>
                        <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                        <input type="text" placeholder="Rechercher sur cette page..." value={search} onChange={e => setSearch(e.target.value)}
                            style={{ padding: '10px 12px 10px 36px', borderRadius: '10px', border: '1.5px solid #e2e8f0', fontSize: '13px', width: '250px' }} />
                    </div>
                )}
            </div>

            {/* ═══ CONTENU PRINCIPAL ═══ */}
            {loading ? (
                <div style={{ textAlign: 'center', padding: '80px', color: '#94a3b8' }}>
                    <div style={{ width: '40px', height: '40px', border: '3px solid #e2e8f0', borderTop: '3px solid #059669', borderRadius: '50%', margin: '0 auto 16px', animation: 'spin 1s linear infinite' }} />
                    <p>Chargement des bulletins...</p>
                </div>
            ) : !selectedClasse ? (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                    style={{ textAlign: 'center', padding: '80px', color: '#94a3b8', background: 'white', borderRadius: '16px', border: '1px solid #e2e8f0' }}>
                    <GraduationCap size={56} style={{ marginBottom: '16px', opacity: 0.3 }} />
                    <h3 style={{ fontSize: '18px', fontWeight: 700, margin: '0 0 8px' }}>Sélectionnez une classe</h3>
                    <p style={{ fontSize: '14px' }}>Choisissez une classe et un trimestre pour afficher les bulletins</p>
                </motion.div>
            ) : filteredBulletins.length === 0 ? (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                    style={{ textAlign: 'center', padding: '80px', color: '#94a3b8', background: 'white', borderRadius: '16px', border: '1px solid #e2e8f0' }}>
                    <FileText size={56} style={{ marginBottom: '16px', opacity: 0.3 }} />
                    <h3 style={{ fontSize: '18px', fontWeight: 700, margin: '0 0 8px' }}>Aucun bulletin disponible</h3>
                    <p style={{ fontSize: '14px' }}>Calculez d&apos;abord les moyennes depuis la page &quot;Centralisation des Notes&quot;</p>
                </motion.div>
            ) : (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                    {/* Stats Bar */}
                    <div style={{ display: 'flex', gap: '16px', marginBottom: '20px', flexWrap: 'wrap' }}>
                        {[
                            { label: 'Effectif', value: bulletinsTotal, icon: GraduationCap, bg: '#eef2ff', color: '#4f46e5' },
                            { label: 'Moy. Classe', value: classeKpis.moyenne !== null ? classeKpis.moyenne.toFixed(2) : '—', icon: BarChart2, bg: '#ecfdf5', color: '#059669' },
                            { label: 'Meilleure Moy.', value: classeKpis.meilleure !== null ? classeKpis.meilleure.toFixed(2) : '—', icon: Trophy, bg: '#fffbeb', color: '#d97706' },
                            { label: 'Plus Faible', value: classeKpis.plusFaible !== null ? classeKpis.plusFaible.toFixed(2) : '—', icon: TrendingDown, bg: '#fef2f2', color: '#dc2626' },
                        ].map((s, i) => (
                            <div key={i} style={{ flex: '1 1 200px', padding: '14px 18px', background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: s.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><s.icon size={20} color={s.color} /></div>
                                <div>
                                    <div style={{ fontSize: '20px', fontWeight: 800, color: '#0f172a' }}>{s.value}</div>
                                    <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 500 }}>{s.label}</div>
                                </div>
                            </div>
                        ))}
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '0 0 16px' }}>
                        <h2 style={{ fontSize: '18px', fontWeight: 800, margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <ClipboardList size={20} color="#059669" /> {bulletinsTotal} bulletin(s) — {selectedClasseInfo?.libelle} — {selectedTrimestreInfo?.libelle || `Trimestre ${selectedTrimestre}`}
                        </h2>
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                            <span style={{ background: '#f0fdf4', color: '#166534', padding: '6px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <CheckCircle2 size={14} /> {filteredBulletins.filter(b => b.statut === 'PUBLIE').length} publiés (page)
                            </span>
                            {filteredBulletins.some(b => b.statut !== 'PUBLIE') && (
                                <span style={{ padding: '6px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: 700, background: '#fef3c7', color: '#a16207', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <Clock size={14} /> {filteredBulletins.filter(b => b.statut !== 'PUBLIE').length} brouillon(s) (page)
                                </span>
                            )}
                            {filteredBulletins.some(b => b.statut !== 'PUBLIE') && (
                                <button onClick={publishAll} disabled={publishing}
                                    style={{ padding: '8px 16px', borderRadius: '12px', border: 'none', background: 'linear-gradient(135deg, #059669, #10b981)', color: 'white', fontSize: '13px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', boxShadow: '0 4px 15px rgba(16,185,129,0.3)' }}>
                                    <Send size={16} /> {publishing ? 'Publication...' : 'Publier Tout'}
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Cards Grid */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '16px' }}>
                        {filteredBulletins.map((b, idx) => {
                            const ms = getMentionStyle(b.mention);
                            return (
                                <motion.div key={b.bulletin_id || idx} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.03 }}
                                    style={{ background: 'white', borderRadius: '16px', border: '1px solid #e2e8f0', overflow: 'hidden', cursor: 'pointer', transition: 'all 0.2s' }}
                                    onClick={() => openBulletin(b)}
                                    onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 8px 25px rgba(0,0,0,0.1)'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
                                    onMouseLeave={e => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.transform = 'translateY(0)'; }}>
                                    
                                    <div style={{ padding: '18px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                            <div style={{ width: '42px', height: '42px', borderRadius: '12px', background: b.rang <= 3 ? 'linear-gradient(135deg, #f59e0b, #d97706)' : 'linear-gradient(135deg, #6366f1, #8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 800, fontSize: '14px' }}>
                                                {b.rang}e
                                            </div>
                                            <div>
                                                <div style={{ fontSize: '15px', fontWeight: 700, color: '#0f172a' }}>{b.nom} {b.prenom}</div>
                                                <div style={{ fontSize: '11px', color: '#94a3b8' }}>{b.matricule} • {b.sexe === 'M' ? '♂' : '♀'}</div>
                                            </div>
                                        </div>
                                        <div style={{ textAlign: 'right' }}>
                                            <div style={{ fontSize: '22px', fontWeight: 800, color: getNoteColor(b.moyenne_generale) }}>
                                                {b.moyenne_generale !== null ? Number(b.moyenne_generale).toFixed(2) : '—'}
                                            </div>
                                            <div style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 600 }}>/20</div>
                                        </div>
                                    </div>

                                    <div style={{ padding: '0 20px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                                            <span style={{ padding: '4px 12px', borderRadius: '20px', fontSize: '11px', fontWeight: 700, background: ms.bg, color: ms.color, border: `1px solid ${ms.border}` }}>
                                                {b.mention || 'Non défini'}
                                            </span>
                                            <span style={{ padding: '3px 10px', borderRadius: '20px', fontSize: '10px', fontWeight: 700, background: b.statut === 'PUBLIE' ? '#d1fae5' : '#fef3c7', color: b.statut === 'PUBLIE' ? '#15803d' : '#a16207' }}>
                                                <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                    {b.statut === 'PUBLIE' ? <><CheckCircle2 size={14} /> Publié</> : <><Clock size={14} /> Brouillon</>}
                                                </span>
                                            </span>
                                        </div>
                                        <button style={{ padding: '6px 14px', borderRadius: '8px', border: '1px solid #e2e8f0', background: 'white', fontSize: '12px', fontWeight: 700, cursor: 'pointer', color: '#059669', display: 'flex', alignItems: 'center', gap: '4px' }}
                                            onClick={e => { e.stopPropagation(); openBulletin(b); }}>
                                            <Eye size={12} /> Voir le bulletin
                                        </button>
                                    </div>
                                </motion.div>
                            );
                        })}
                    </div>
                    <div style={{ background: 'white', borderRadius: '16px', border: '1px solid #e2e8f0', marginTop: '4px' }}>
                        <Pagination page={bulletinsPage} pageSize={BULLETINS_PAGE_SIZE} total={bulletinsTotal} onPageChange={setBulletinsPage} />
                    </div>
                </motion.div>
            )}

            {/* ══════════════════════════════════════════════════════════
                 MODAL BULLETIN — DESIGN PREMIUM OFFICIEL GUINÉEN
               ══════════════════════════════════════════════════════════ */}
            <AnimatePresence>
                {selectedBulletin && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}
                        onClick={() => setSelectedBulletin(null)}>
                        <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
                            style={{ background: '#f8fafc', borderRadius: '20px', width: '100%', maxWidth: '850px', maxHeight: '90vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: '0 25px 60px rgba(0,0,0,0.3)' }}
                            onClick={e => e.stopPropagation()}>

                            {/* Modal Toolbar */}
                            <div style={{ padding: '12px 20px', background: 'white', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                    <span style={{ fontSize: '13px', fontWeight: 600, color: '#64748b' }}>Aperçu du bulletin</span>
                                    <span style={{ padding: '4px 10px', borderRadius: '12px', fontSize: '12px', fontWeight: 700, background: selectedBulletin.statut === 'PUBLIE' ? '#dcfce7' : '#fef3c7', color: selectedBulletin.statut === 'PUBLIE' ? '#16a34a' : '#d97706', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                        {selectedBulletin.statut === 'PUBLIE' ? <><CheckCircle2 size={14} /> Publié</> : <><Clock size={14} /> Brouillon</>}
                                    </span>
                                </div>
                                <div style={{ display: 'flex', gap: '8px' }}>
                                    {selectedBulletin.statut === 'PUBLIE' ? (
                                        <button onClick={() => unpublishBulletin(selectedBulletin.bulletin_id)}
                                            style={{ padding: '8px 18px', borderRadius: '8px', background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', fontSize: '12px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                            <XCircle size={14} /> Dépublier
                                        </button>
                                    ) : (
                                        <button onClick={() => publishBulletin(selectedBulletin.bulletin_id)}
                                            style={{ padding: '8px 18px', borderRadius: '8px', background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', border: 'none', color: 'white', fontSize: '12px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', boxShadow: '0 2px 8px rgba(99,102,241,0.3)' }}>
                                            <Send size={14} /> Publier
                                        </button>
                                    )}
                                    <button onClick={handlePrint}
                                        style={{ padding: '8px 18px', borderRadius: '8px', background: 'linear-gradient(135deg, #059669, #10b981)', border: 'none', color: 'white', fontSize: '12px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <Printer size={14} /> Imprimer
                                    </button>
                                    <button onClick={() => setSelectedBulletin(null)}
                                        style={{ background: '#f1f5f9', border: 'none', borderRadius: '8px', width: '34px', height: '34px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        <X size={16} color="#64748b" />
                                    </button>
                                </div>
                            </div>

                            {/* ═══ BULLETIN CONTENT (PRINTABLE) ═══ */}
                            <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
                                <div ref={printRef} style={{ position: 'relative' }}>
                                    {docSettings.filigrane_actif && docSettings.filigrane_bulletins && (
                                        <div style={{
                                            position: 'absolute',
                                            top: 0, left: 0, right: 0, bottom: 0,
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            pointerEvents: 'none',
                                            zIndex: 10,
                                            overflow: 'hidden'
                                        }}>
                                            <div style={{
                                                fontSize: '120px',
                                                fontWeight: 900,
                                                color: 'black',
                                                opacity: docSettings.filigrane_opacite || 0.1,
                                                transform: 'rotate(-45deg)',
                                                whiteSpace: 'nowrap',
                                                fontFamily: 'Inter, sans-serif'
                                            }}>
                                                {docSettings.filigrane_texte || 'SMARTSCHOOL'}
                                            </div>
                                        </div>
                                    )}
                                    <div style={{ background: 'white', borderRadius: '0', maxWidth: '794px', margin: '0 auto', boxShadow: '0 2px 15px rgba(0,0,0,0.08)', overflow: 'hidden' }}>

                                        {/* ═══ EN-TÊTE OFFICIEL — 3 colonnes ═══ */}
                                        <div style={{ background: 'linear-gradient(135deg, #064e3b, #059669)', padding: '16px 24px', color: 'white', position: 'relative', overflow: 'hidden' }}>
                                            <div style={{ position: 'absolute', top: '-30px', right: '-30px', width: '120px', height: '120px', background: 'rgba(255,255,255,0.05)', borderRadius: '50%' }} />
                                            <div style={{ position: 'absolute', bottom: '-20px', left: '-20px', width: '80px', height: '80px', background: 'rgba(255,255,255,0.03)', borderRadius: '50%' }} />
                                            
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'relative', zIndex: 1, gap: '12px' }}>
                                                
                                                {/* GAUCHE — Photo de l'élève */}
                                                <div style={{ flexShrink: 0, textAlign: 'center' }}>
                                                    {docSettings.champ_photo && (
                                                        <div style={{ width: '68px', height: '68px', borderRadius: '50%', background: 'rgba(255,255,255,0.15)', border: '2px solid rgba(255,255,255,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto', overflow: 'hidden' }}>
                                                            {selectedBulletin?.photo ? (
                                                                <img 
                                                                    src={getPhotoUrl(selectedBulletin.photo)!} 
                                                                    alt="Photo Élève" 
                                                                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                                                />
                                                            ) : (
                                                                <span style={{ fontSize: '9px', color: 'rgba(255,255,255,0.6)', fontWeight: 600, textAlign: 'center', lineHeight: 1.2 }}>Photo<br/>Élève</span>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>

                                                {/* CENTRE — Texte officiel */}
                                                <div style={{ textAlign: 'center', flex: 1 }}>
                                                    <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '3px', opacity: 0.9, textTransform: 'uppercase' }}>République de Guinée</div>
                                                    <div style={{ fontSize: '8px', opacity: 0.6, marginBottom: '6px', letterSpacing: '1px' }}>Travail — Justice — Solidarité</div>
                                                    <div style={{ fontSize: '22px', fontWeight: 900, letterSpacing: '1px', marginBottom: '2px', textTransform: 'uppercase' }}>{etablissementNom || 'SMARTSCHOOL'}</div>
                                                    <div style={{ fontSize: '8px', letterSpacing: '3px', opacity: 0.6, textTransform: 'uppercase', marginBottom: '8px' }}>Établissement Scolaire</div>
                                                    <div style={{ display: 'inline-block', padding: '4px 18px', background: 'rgba(255,255,255,0.15)', borderRadius: '20px', fontSize: '11px', fontWeight: 700, border: '1px solid rgba(255,255,255,0.25)' }}>
                                                        BULLETIN DE NOTES — {selectedTrimestreInfo?.libelle?.toUpperCase() || `${selectedTrimestre}ER TRIMESTRE`}
                                                    </div>
                                                    <div style={{ fontSize: '9px', marginTop: '4px', opacity: 0.6 }}>Année Scolaire 2025-2026</div>
                                                </div>

                                                {/* DROITE — Logo de l'école */}
                                                <div style={{ flexShrink: 0, textAlign: 'center' }}>
                                                    <div style={{ width: '68px', height: '68px', borderRadius: '50%', background: 'rgba(255,255,255,0.15)', border: '2px solid rgba(255,255,255,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto', overflow: 'hidden' }}>
                                                        {etablissementLogo ? (
                                                            <img src={getPhotoUrl(etablissementLogo)!} alt="Logo École" style={{ width: '54px', height: '54px', objectFit: 'contain', background: 'white', borderRadius: '50%' }} />
                                                        ) : (
                                                            <span style={{ fontSize: '9px', color: 'rgba(255,255,255,0.6)', fontWeight: 600, textAlign: 'center', lineHeight: 1.2 }}>Logo<br/>École</span>
                                                        )}
                                                    </div>
                                                    <div style={{ fontSize: '6px', opacity: 0.5, marginTop: '2px', letterSpacing: '1px' }}>ÉTABLISSEMENT</div>
                                                </div>
                                            </div>
                                        </div>

                                        {/* ═══ INFORMATIONS ÉLÈVE ═══ */}
                                        <div style={{ padding: '16px 28px', background: '#f0fdf4', borderBottom: '2px solid #d1fae5' }}>
                                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                                                <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                                                    <span style={{ fontSize: '11px', color: '#059669', fontWeight: 700, minWidth: '70px' }}>Nom :</span>
                                                    <span style={{ fontSize: '13px', fontWeight: 800, color: '#0f172a', textTransform: 'uppercase' }}>{selectedBulletin.nom} {selectedBulletin.prenom}</span>
                                                </div>
                                                <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                                                    <span style={{ fontSize: '11px', color: '#059669', fontWeight: 700, minWidth: '70px' }}>Matricule :</span>
                                                    <span style={{ fontSize: '12px', fontWeight: 600, color: '#334155' }}>{selectedBulletin.matricule}</span>
                                                </div>
                                                <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                                                    <span style={{ fontSize: '11px', color: '#059669', fontWeight: 700, minWidth: '70px' }}>Classe :</span>
                                                    <span style={{ fontSize: '12px', fontWeight: 600, color: '#334155' }}>{selectedClasseInfo?.libelle || '—'}</span>
                                                </div>
                                                <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                                                    <span style={{ fontSize: '11px', color: '#059669', fontWeight: 700, minWidth: '70px' }}>Sexe :</span>
                                                    <span style={{ fontSize: '12px', fontWeight: 600, color: '#334155' }}>{selectedBulletin.sexe === 'M' ? 'Masculin' : 'Féminin'}</span>
                                                </div>
                                            </div>
                                        </div>

                                        {/* ═══ TABLEAU DES NOTES ═══ */}
                                        <div style={{ padding: '0 28px' }}>
                                            <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '16px' }}>
                                                <thead>
                                                    <tr style={{ background: 'linear-gradient(135deg, #064e3b, #059669)' }}>
                                                        {/* Trois colonnes seulement : coefficient, moyenne, appréciation.
                                                            Moyenne de classe, min et max encombraient le bulletin
                                                            d'un élève avec des chiffres qui parlent de la classe. */}
                                                        <th style={{ padding: '10px 12px', fontSize: '10px', fontWeight: 700, color: 'white', textAlign: 'left', letterSpacing: '0.5px' }}>MATIÈRE</th>
                                                        <th style={{ padding: '10px 8px', fontSize: '10px', fontWeight: 700, color: 'white', textAlign: 'center', width: '80px' }}>COEFFICIENT</th>
                                                        <th style={{ padding: '10px 8px', fontSize: '10px', fontWeight: 700, color: '#fbbf24', textAlign: 'center', width: '90px' }}>MOYENNE</th>
                                                        <th style={{ padding: '10px 12px', fontSize: '10px', fontWeight: 700, color: 'white', textAlign: 'left' }}>APPRÉCIATION</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {selectedBulletin.lignes && selectedBulletin.lignes.length > 0 ? (
                                                        selectedBulletin.lignes.map((l: any, i: number) => {
                                                            const moyEleve = l.moyenne_matiere;
                                                            return (
                                                                <tr key={i} style={{ borderBottom: '1px solid #e2e8f0', background: i % 2 === 0 ? '#ffffff' : '#f8fafc' }}>
                                                                    <td style={{ padding: '9px 12px', fontSize: '12px', fontWeight: 600, color: '#0f172a' }}>{l.matiere}</td>
                                                                    <td style={{ padding: '9px 8px', fontSize: '12px', textAlign: 'center', color: '#64748b', fontWeight: 600 }}>{l.coefficient}</td>
                                                                    <td style={{ padding: '9px 8px', textAlign: 'center' }}>
                                                                        <span style={{
                                                                            fontWeight: 800, fontSize: '13px',
                                                                            color: moyEleve !== null ? getNoteColor(moyEleve) : '#cbd5e1',
                                                                            background: moyEleve !== null ? (moyEleve >= 16 ? '#ecfdf5' : moyEleve >= 10 ? '#eff6ff' : '#fef2f2') : '#f8fafc',
                                                                            padding: '2px 10px', borderRadius: '6px', display: 'inline-block'
                                                                        }}>
                                                                            {moyEleve !== null ? Number(moyEleve).toFixed(2) : '—'}
                                                                        </span>
                                                                    </td>
                                                                    <td style={{ padding: '9px 12px', fontSize: '11px', color: '#475569', fontStyle: 'italic' }}>
                                                                        {l.appreciation || '—'}
                                                                    </td>
                                                                </tr>
                                                            );
                                                        })
                                                    ) : (
                                                        <tr>
                                                            <td colSpan={4} style={{ padding: '30px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>
                                                                Détails par matière non disponibles
                                                            </td>
                                                        </tr>
                                                    )}
                                                </tbody>
                                            </table>
                                        </div>

                                        {/* ═══ RÉSULTATS GÉNÉRAUX ═══ */}
                                        <div style={{ padding: '20px 28px' }}>
                                            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                                                {/* Moyenne Générale */}
                                                <div style={{
                                                    flex: '1 1 180px', padding: '16px', borderRadius: '12px',
                                                    background: `linear-gradient(135deg, ${getNoteColor(selectedBulletin.moyenne_generale)}15, ${getNoteColor(selectedBulletin.moyenne_generale)}08)`,
                                                    border: `2px solid ${getNoteColor(selectedBulletin.moyenne_generale)}30`,
                                                    textAlign: 'center'
                                                }}>
                                                    <div style={{ fontSize: '10px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '4px' }}>Moyenne Générale</div>
                                                    <div style={{ fontSize: '32px', fontWeight: 900, color: getNoteColor(selectedBulletin.moyenne_generale), lineHeight: 1 }}>
                                                        {selectedBulletin.moyenne_generale !== null ? Number(selectedBulletin.moyenne_generale).toFixed(2) : '—'}
                                                    </div>
                                                    <div style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 600 }}>/20</div>
                                                </div>

                                                {/* Rang */}
                                                {docSettings.champ_rang !== false && (
                                                    <div style={{ flex: '1 1 120px', padding: '16px', borderRadius: '12px', background: 'linear-gradient(135deg, #fffbeb, #fef3c7)', border: '2px solid #fde68a', textAlign: 'center' }}>
                                                        <div style={{ fontSize: '10px', fontWeight: 700, color: '#92400e', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '4px' }}>Rang</div>
                                                        <div style={{ fontSize: '28px', fontWeight: 900, color: '#f59e0b' }}>
                                                            {selectedBulletin.rang}<sup style={{ fontSize: '14px' }}>e</sup>
                                                        </div>
                                                        <div style={{ fontSize: '11px', color: '#b45309', fontWeight: 600 }}>/ {selectedBulletin.effectif_classe} élèves</div>
                                                    </div>
                                                )}

                                                {/* Mention */}
                                                <div style={{
                                                    flex: '1 1 140px', padding: '16px', borderRadius: '12px',
                                                    background: `linear-gradient(135deg, ${getMentionStyle(selectedBulletin.mention).bg}, white)`,
                                                    border: `2px solid ${getMentionStyle(selectedBulletin.mention).border}`,
                                                    textAlign: 'center'
                                                }}>
                                                    <div style={{ fontSize: '10px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '4px' }}>Mention</div>
                                                    <div style={{ fontSize: '16px', fontWeight: 800, color: getMentionStyle(selectedBulletin.mention).color }}>
                                                        {selectedBulletin.mention || '—'}
                                                    </div>
                                                </div>

                                                {/* Total Coefficients */}
                                                <div style={{ flex: '1 1 100px', padding: '16px', borderRadius: '12px', background: 'linear-gradient(135deg, #eef2ff, #e0e7ff)', border: '2px solid #c7d2fe', textAlign: 'center' }}>
                                                    <div style={{ fontSize: '10px', fontWeight: 700, color: '#4338ca', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '4px' }}>Total Coef.</div>
                                                    <div style={{ fontSize: '24px', fontWeight: 900, color: '#6366f1' }}>
                                                        {selectedBulletin.total_coefficient || '—'}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        {/* GRAPHIQUE D'ÉVOLUTION */}
                                        {docSettings.champ_graphique && selectedBulletin.lignes && selectedBulletin.lignes.length > 0 && (
                                            <div style={{ padding: '0 28px 20px' }}>
                                                <div style={{ padding: '16px', borderRadius: '12px', background: 'white', border: '1px solid #e2e8f0' }}>
                                                    <div style={{ fontSize: '10px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '12px' }}>Profil de l'Élève par Matière</div>
                                                    <div style={{ display: 'flex', alignItems: 'flex-end', height: '120px', gap: '4px' }}>
                                                        {selectedBulletin.lignes.map((l: any, i: number) => {
                                                            const height = l.moyenne_matiere ? (Number(l.moyenne_matiere) / 20) * 100 : 0;
                                                            return (
                                                                <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', height: '100%' }}>
                                                                    <div style={{ width: '100%', flex: 1, display: 'flex', alignItems: 'flex-end', background: '#f8fafc', borderRadius: '4px', overflow: 'hidden' }}>
                                                                        <div style={{ width: '100%', height: `${Math.min(height, 100)}%`, background: getNoteColor(l.moyenne_matiere), borderRadius: '4px', transition: 'height 0.3s' }} />
                                                                    </div>
                                                                    <div style={{ fontSize: '7px', fontWeight: 700, color: '#64748b', writingMode: 'vertical-rl', transform: 'rotate(180deg)', height: '50px', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center' }}>{l.matiere.substring(0, 15)}</div>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            </div>
                                        )}

                                        {/* ═══ BANDE UNIQUE : DÉCISION + SIGNATURES ═══ */}
                                        <div style={{ padding: '0 28px 12px' }}>
                                            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 2fr', borderRadius: '10px', border: '2px solid #d1d5db', overflow: 'hidden', background: 'white' }}>

                                                {/* GAUCHE : Décision du Conseil */}
                                                <div style={{ padding: '14px 16px', borderRight: '1.5px solid #d1d5db', display: 'flex', flexDirection: 'column', justifySelf: 'stretch', justifyContent: 'center' }}>
                                                    <div style={{ fontSize: '9px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>
                                                        Décision du Conseil de Classe :
                                                    </div>
                                                    <div style={{ fontSize: '12px', fontWeight: 800, color: '#0f172a', lineHeight: 1.4 }}>
                                                        {selectedBulletin.decision || 'En attente du conseil de classe'}
                                                    </div>
                                                </div>

                                                {/* SIGNATURES */}
                                                <div style={{ display: 'flex', flexWrap: 'wrap' }}>
                                                    {docSettings.signature_prof !== false && (
                                                        <div style={{ padding: '14px 16px', flex: 1, borderRight: (docSettings.signature_directeur !== false || docSettings.signature_parent !== false) ? '1.5px solid #d1d5db' : 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                                                            <div style={{ fontSize: '9px', fontWeight: 700, color: '#0f172a', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '20px' }}>Professeur Principal</div>
                                                            <div style={{ borderBottom: '1.5px solid #334155', width: '90%', margin: '0 auto', marginBottom: '3px' }} />
                                                            <div style={{ fontSize: '7px', color: '#94a3b8', fontStyle: 'italic' }}>Signature</div>
                                                        </div>
                                                    )}

                                                    {docSettings.signature_directeur !== false && (
                                                        <div style={{ padding: '14px 12px', flex: 1.2, borderRight: docSettings.signature_parent !== false ? '1.5px solid #d1d5db' : 'none', display: 'flex', alignItems: 'center', gap: '10px', justifyContent: 'center' }}>
                                                            {/* Partie signature */}
                                                            <div style={{ textAlign: 'center', flex: '1' }}>
                                                                <div style={{ fontSize: '9px', fontWeight: 700, color: '#0f172a', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>La Direction</div>
                                                                {etablissementDirecteur && (
                                                                    <div style={{ fontSize: '8px', color: '#475569', marginBottom: '4px' }}>{etablissementDirecteur}</div>
                                                                )}
                                                                {/* Signature numérisée */}
                                                                {etablissementSignature ? (
                                                                    <img src={getPhotoUrl(etablissementSignature)!} alt="Signature" style={{ maxWidth: '80px', maxHeight: '35px', objectFit: 'contain', margin: '0 auto 2px' }} />
                                                                ) : (
                                                                    <div style={{ borderBottom: '1.5px solid #334155', width: '90%', margin: '0 auto 3px', marginTop: '20px' }} />
                                                                )}
                                                                <div style={{ fontSize: '7px', color: '#94a3b8', fontStyle: 'italic' }}>Signature et cachet</div>
                                                            </div>
                                                            {/* Cachet ou Logo */}
                                                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
                                                                <div style={{ width: '52px', height: '52px', borderRadius: '50%', border: etablissementCachet ? 'none' : '2px dashed #94a3b8', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8fafc', overflow: 'hidden' }}>
                                                                    {etablissementCachet ? (
                                                                        <img src={getPhotoUrl(etablissementCachet)!} alt="Cachet" style={{ width: '52px', height: '52px', objectFit: 'contain' }} />
                                                                    ) : etablissementLogo ? (
                                                                        <img src={getPhotoUrl(etablissementLogo)!} alt="Logo" style={{ width: '42px', height: '42px', objectFit: 'contain' }} />
                                                                    ) : (
                                                                        <span style={{ fontSize: '8px', color: '#94a3b8', fontWeight: 600, textAlign: 'center', lineHeight: 1.1 }}>Logo<br/>École</span>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    )}

                                                    {docSettings.signature_parent !== false && (
                                                        <div style={{ padding: '14px 16px', flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                                                            <div style={{ fontSize: '9px', fontWeight: 700, color: '#0f172a', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '20px' }}>Parent d&apos;Élève</div>
                                                            <div style={{ borderBottom: '1.5px solid #334155', width: '90%', margin: '0 auto', marginBottom: '3px' }} />
                                                            <div style={{ fontSize: '7px', color: '#94a3b8', fontStyle: 'italic' }}>Signature</div>
                                                        </div>
                                                    )}
                                                </div>

                                            </div>
                                        </div>

                                        {/* Zone d'édition de la décision (NON IMPRIMABLE) */}
                                        <div className="no-print" style={{ padding: '0 28px 12px' }}>
                                            <div style={{ padding: '12px 16px', background: '#fffbeb', borderRadius: '10px', border: '1.5px solid #fde68a' }}>
                                                <div style={{ fontSize: '11px', fontWeight: 700, color: '#92400e', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                    <Edit3 size={12} /> Modifier la décision du conseil
                                                </div>
                                                <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                                                    <textarea value={editDecision} onChange={e => setEditDecision(e.target.value)}
                                                        placeholder="Ex: ADMIS(E) — Félicitations du conseil. Excellent trimestre, poursuivez vos efforts."
                                                        style={{ flex: 1, padding: '10px 12px', borderRadius: '8px', border: '1.5px solid #e2e8f0', fontSize: '13px', fontFamily: 'Inter, sans-serif', minHeight: '50px', resize: 'vertical', outline: 'none', background: 'white' }}
                                                    />
                                                    <button onClick={saveDecision} disabled={savingDecision} className="btn btn-primary" style={{ flex: 1, display: 'flex', gap: '8px', justifyContent: 'center' }}>
                                                        <Save size={14} /> {savingDecision ? '...' : decisionSaved ? <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><CheckCircle2 size={14} /> Sauvé</span> : 'Enregistrer'}
                                                    </button>
                                                </div>
                                            </div>
                                        </div>

                                        {/* ═══ PIED DE PAGE ═══ */}
                                        <div style={{ padding: '10px 28px', background: 'linear-gradient(135deg, #064e3b, #059669)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <div style={{ fontSize: '9px', color: 'rgba(255,255,255,0.7)' }}>SMARTSCHOOL • Système de Gestion Scolaire</div>
                                            <div style={{ fontSize: '9px', color: 'rgba(255,255,255,0.7)' }}>Conakry, Guinée • {new Date().toLocaleDateString('fr-FR')}</div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
        </div>
    );
}

export default function BulletinsPage() {
    return (
        <Suspense fallback={
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '50vh' }}>
                <div style={{ width: '40px', height: '40px', border: '3px solid #e2e8f0', borderTop: '3px solid #059669', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
            </div>
        }>
            <BulletinsContent />
        </Suspense>
    );
}
