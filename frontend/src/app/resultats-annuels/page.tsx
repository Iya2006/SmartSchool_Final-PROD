'use client';

/**
 * Résultats de fin d'année — écran dédié.
 *
 * Réunit ce qui était jusqu'ici éparpillé entre la page Bulletins (moyenne
 * annuelle) et l'assistant de clôture (résultats ministériels) : à la fin de
 * l'année, l'école veut voir en un seul endroit le classement annuel de la
 * classe, imprimer sa fiche de résultats, sortir le bulletin annuel de chaque
 * élève, et — pour les classes d'examen — saisir ou importer le résultat
 * officiel qui décide réellement du passage.
 *
 * Distinction volontairement visible à l'écran : pour une 6ème, une 10ème ou
 * une Terminale, la moyenne annuelle est un indicateur pédagogique — c'est
 * l'examen national qui tranche. Le bloc examen est autonome : il s'affiche
 * même quand aucune moyenne annuelle n'a encore été calculée, sinon l'écran de
 * saisie des résultats nationaux resterait invisible tant que le calcul
 * pédagogique n'a pas tourné.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import {
    Trophy, GraduationCap, Save, AlertTriangle, CheckCircle2,
    Calculator, FileText, Search, Upload, Download, Printer, X, FileDown,
} from 'lucide-react';
import { useApp } from '@/context/AppContext';
import api from '@/lib/api';
import { lancerTache } from '@/lib/taskPolling';
import Pagination from '@/components/Pagination';

interface Periode { trimestre_id: number; libelle: string; numero: number; moyenne?: number }
interface LigneAnnuelle {
    inscription_id: number; eleve_id: number;
    nom: string; prenom: string; matricule: string;
    moyenne_generale: number | null; rang: number | null; mention: string | null;
    periodes: Periode[]; nb_periodes: number;
}
interface LigneOfficielle {
    inscription_id: number; eleve_id: number;
    nom: string; prenom: string; matricule: string;
    moyenne_annuelle: number | null; resultat: string | null; observation: string | null;
}
interface Synthese {
    evalues: number; sans_moyenne: number;
    moyenne_classe: number | null; moyenne_max: number | null; moyenne_min: number | null;
    premier: string | null; dernier: string | null;
    seuil_passage: number; atteignent_seuil: number; taux_reussite: number | null;
    mentions: Record<string, number>;
}
interface RapportImport {
    classe: string; fichier: string; lignes_lues: number;
    a_appliquer: number; remplacements: number; admis: number; non_admis: number;
    details: {
        ligne: number; inscription_id: number; matricule: string; eleve: string;
        resultat: string; observation: string | null;
        ancien_resultat: string | null; remplace: boolean;
    }[];
    ignorees: { ligne: number; eleve: string; raison: string }[];
    eleves_sans_resultat: { eleve: string; matricule: string }[];
    message: string;
}

const PAGE_SIZE = 25;
const MENTIONS_ORDRE = ['TRÈS BIEN', 'BIEN', 'ASSEZ BIEN', 'PASSABLE', 'INSUFFISANT'];

export default function ResultatsAnnuelsPage() {
    const { etablissementId, anneeId } = useApp();

    const [classes, setClasses] = useState<any[]>([]);
    const [selectedClasse, setSelectedClasse] = useState<number | null>(null);
    const [lignes, setLignes] = useState<LigneAnnuelle[]>([]);
    const [periodes, setPeriodes] = useState<Periode[]>([]);
    const [synthese, setSynthese] = useState<Synthese | null>(null);
    const [officiels, setOfficiels] = useState<LigneOfficielle[]>([]);
    const [bulletinParEleve, setBulletinParEleve] = useState<Record<number, number>>({});
    const [classeExamen, setClasseExamen] = useState(false);
    // Maternelle : jugée admis/non SANS moyenne (pas de notes). Même écran de
    // saisie que les classes d'examen, mais l'appréciation compte plus que tout.
    const [evaluationSimple, setEvaluationSimple] = useState(false);
    const [attestationPossible, setAttestationPossible] = useState(false);
    const [examenNational, setExamenNational] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [calcul, setCalcul] = useState(false);
    const [etatTache, setEtatTache] = useState('');
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState('');
    const [page, setPage] = useState(1);
    const [recherche, setRecherche] = useState('');
    const [rapport, setRapport] = useState<RapportImport | null>(null);
    const [importEnCours, setImportEnCours] = useState(false);
    const fichierRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        // Filtré par année : sinon le sélecteur de classe mélangeait les années
        // (ex. la « 3ème année » de l'an prochain apparaissait en consultant une
        // année passée).
        api.get(`/api/classes?etablissement_id=${etablissementId}&annee_id=${anneeId}`)
            .then(r => setClasses(r.data))
            .catch(() => setClasses([]));
    }, [etablissementId, anneeId]);

    const charger = useCallback(async () => {
        if (!selectedClasse) return;
        setLoading(true);
        try {
            const [annuel, off, bull] = await Promise.all([
                api.get(`/api/evaluations/classe/${selectedClasse}/resultats-annuels`),
                api.get(`/api/promotion/classe/${selectedClasse}/resultats-officiels`)
                    .catch(() => ({ data: null })),
                // Sert à ouvrir le bulletin annuel d'un élève : l'aperçu des
                // résultats ne connaît pas les bulletins déjà générés.
                api.get(`/api/evaluations/classe/${selectedClasse}/bulletins?type_bulletin=ANNUEL&limit=500`)
                    .catch(() => ({ data: [] })),
            ]);
            setLignes(annuel.data?.resultats || []);
            setPeriodes(annuel.data?.periodes || []);
            setSynthese(annuel.data?.synthese || null);
            setClasseExamen(!!(off.data?.classe_examen ?? annuel.data?.classe_examen));
            setEvaluationSimple(!!off.data?.evaluation_simple);
            setAttestationPossible(!!off.data?.attestation_possible);
            setExamenNational(off.data?.examen_national || annuel.data?.examen_national || null);
            setOfficiels(off.data?.eleves || []);
            setBulletinParEleve(Object.fromEntries(
                (bull.data || []).map((b: any) => [b.eleve_id, b.bulletin_id])));
        } catch {
            setLignes([]); setOfficiels([]); setPeriodes([]); setSynthese(null);
        }
        setLoading(false);
        setPage(1);
    }, [selectedClasse]);

    useEffect(() => { charger(); }, [charger]);

    const flash = (texte: string) => {
        setMessage(texte);
        setTimeout(() => setMessage(''), 6000);
    };

    // Le calcul annuel agrège les bulletins de période : il suppose que chaque
    // période a bien été calculée. Le message d'erreur du serveur le dit.
    const calculerAnnuel = async () => {
        if (!selectedClasse) return;
        setCalcul(true); setEtatTache('');
        try {
            const base = `/api/evaluations/classe/${selectedClasse}`;
            const res: any = await lancerTache(`${base}/calculer-moyennes-annuelles-async`, {
                urlSynchrone: `${base}/calculer-moyennes-annuelles`,
                onProgress: e => setEtatTache(
                    e.status === 'PENDING' ? 'En file d’attente…'
                        : e.status === 'RUNNING' ? 'Calcul en cours…' : ''),
            });
            flash(res.message || `Résultats annuels calculés — ${res.bulletins_total ?? ''} élèves`);
            await charger();
        } catch (e: any) {
            alert(e?.response?.data?.detail || e.message);
        }
        setEtatTache(''); setCalcul(false);
    };

    // Le jeton d'authentification ne passe pas dans une simple ouverture
    // d'onglet : on récupère le fichier via l'API puis on l'ouvre.
    const ouvrirFichier = async (url: string, type: string, telecharger?: string) => {
        try {
            const res = await api.get(url, { responseType: 'blob' });
            const blobUrl = URL.createObjectURL(new Blob([res.data], { type }));
            if (telecharger) {
                const a = document.createElement('a');
                a.href = blobUrl; a.download = telecharger;
                a.click();
            } else {
                window.open(blobUrl, '_blank');
            }
            setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
        } catch (e: any) {
            // Le message du serveur (« calculez d'abord les moyennes… ») arrive
            // en blob : sans cette relecture, l'utilisateur ne verrait rien.
            let detail = e?.message;
            try { detail = JSON.parse(await e?.response?.data?.text())?.detail || detail; } catch { }
            alert(detail);
        }
    };

    const imprimerFiche = () => selectedClasse && ouvrirFichier(
        `/api/evaluations/classe/${selectedClasse}/fiche-annuelle/pdf`, 'application/pdf');

    const ouvrirBulletinAnnuel = (eleveId: number) => {
        const bulletinId = bulletinParEleve[eleveId];
        if (!bulletinId) {
            alert('Bulletin annuel non encore généré — lancez « Calculer les résultats annuels ».');
            return;
        }
        ouvrirFichier(`/api/evaluations/bulletins/${bulletinId}/pdf`, 'application/pdf');
    };

    // Génération en lot des bulletins annuels de la classe : un PDF par élève,
    // produit côté serveur pour ne pas ouvrir autant d'onglets que d'élèves.
    const genererBulletinsAnnuels = async () => {
        if (!selectedClasse) return;
        setCalcul(true);
        try {
            const res: any = await lancerTache(
                `/api/evaluations/classe/${selectedClasse}/bulletins/generer-pdf-async?type_bulletin=ANNUEL`,
                { onProgress: e => setEtatTache(e.status === 'RUNNING' ? 'Génération en cours…' : 'En file d’attente…') });
            flash(`${res.nb_generes} bulletin(s) annuel(s) généré(s)${res.nb_echecs ? ` — ${res.nb_echecs} en échec` : ''}.`);
        } catch (e: any) {
            alert(e?.response?.data?.detail || e.message);
        }
        setEtatTache(''); setCalcul(false);
    };

    const definirResultat = (inscriptionId: number, resultat: string) =>
        setOfficiels(prev => prev.map(o =>
            o.inscription_id === inscriptionId ? { ...o, resultat } : o));

    // Appréciation libre (essentielle en maternelle : c'est tout ce que reçoit
    // l'enfant à la place d'une note).
    const definirObservation = (inscriptionId: number, observation: string) =>
        setOfficiels(prev => prev.map(o =>
            o.inscription_id === inscriptionId ? { ...o, observation } : o));

    // Écran de saisie admis/non : classes d'examen OU maternelle (sans moyenne).
    const modeSaisie = classeExamen || evaluationSimple;

    const enregistrerOfficiels = async () => {
        const resultats = officiels.filter(o => o.resultat)
            .map(o => ({ inscription_id: o.inscription_id, resultat: o.resultat, observation: o.observation }));
        if (!resultats.length) { alert('Aucun résultat saisi.'); return; }
        setSaving(true);
        try {
            const res = await api.post('/api/promotion/resultats-officiels/bulk', { resultats });
            flash(res.data.message || `${resultats.length} résultats enregistrés`);
            await charger();
        } catch (e: any) {
            alert(e?.response?.data?.detail || e.message);
        }
        setSaving(false);
    };

    // ═══ IMPORT DU FICHIER DE RÉSULTATS ═══
    // Deux temps volontairement : analyse d'abord (rien n'est écrit), puis
    // confirmation. Un résultat d'examen déjà saisi ne doit jamais être écrasé
    // sans que l'école ait vu ce qui allait changer.
    const analyserFichier = async (fichier: File) => {
        if (!selectedClasse) return;
        setImportEnCours(true);
        const form = new FormData();
        form.append('fichier', fichier);
        try {
            const res = await api.post(
                `/api/promotion/classe/${selectedClasse}/resultats-officiels/import?dry_run=true`,
                form, { headers: { 'Content-Type': 'multipart/form-data' } });
            setRapport(res.data);
        } catch (e: any) {
            alert(e?.response?.data?.detail || e.message);
        }
        setImportEnCours(false);
        if (fichierRef.current) fichierRef.current.value = '';
    };

    const confirmerImport = async () => {
        if (!rapport) return;
        setImportEnCours(true);
        try {
            // On applique le rapport tel qu'il a été affiché, pas une seconde
            // lecture du fichier : ce que l'école a validé à l'écran est
            // exactement ce qui est écrit, même si le fichier a changé entre-temps.
            const res = await api.post('/api/promotion/resultats-officiels/bulk', {
                resultats: rapport.details.map(d => ({
                    inscription_id: d.inscription_id,
                    resultat: d.resultat,
                    observation: d.observation,
                })),
            });
            flash(res.data.message || `${rapport.details.length} résultats importés`);
            setRapport(null);
            await charger();
        } catch (e: any) {
            alert(e?.response?.data?.detail || e.message);
        }
        setImportEnCours(false);
    };

    const groupes = classes.reduce((acc: any, c: any) => {
        const cycle = c.cycle_libelle || 'Autres';
        (acc[cycle] = acc[cycle] || []).push(c);
        return acc;
    }, {});

    const officielPar = Object.fromEntries(officiels.map(o => [o.inscription_id, o]));
    const corresp = (texte: string) =>
        !recherche.trim() || texte.toLowerCase().includes(recherche.toLowerCase());
    const filtrees = lignes.filter(l => corresp(`${l.nom} ${l.prenom} ${l.matricule}`));
    const officielsFiltres = officiels.filter(o => corresp(`${o.nom} ${o.prenom} ${o.matricule}`));
    const sansResultat = officiels.filter(o => !o.resultat).length;
    const admisCount = officiels.filter(o => o.resultat === 'ADMIS').length;

    const btn = (couleur: string, plein?: boolean) => ({
        padding: '9px 16px', borderRadius: '10px',
        border: plein ? 'none' : `1.5px solid ${couleur}`,
        background: plein ? couleur : 'white',
        color: plein ? 'white' : couleur,
        fontSize: '13px', fontWeight: 700, cursor: 'pointer',
        display: 'flex', alignItems: 'center', gap: '7px',
    } as React.CSSProperties);

    const th: React.CSSProperties = {
        padding: '11px 12px', fontSize: '10.5px', fontWeight: 700,
        color: '#64748b', textAlign: 'left', letterSpacing: '0.4px',
    };

    return (
        <div style={{ padding: '24px 28px', maxWidth: '1500px', margin: '0 auto' }}>
            <div style={{ marginBottom: '20px' }}>
                <h1 style={{ margin: 0, fontSize: '22px', fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <Trophy size={22} color="#6366f1" /> Résultats de fin d&apos;année
                </h1>
                <p style={{ margin: '6px 0 0', fontSize: '14px', color: '#64748b' }}>
                    Classement annuel, fiche de résultats de la classe, bulletin annuel de chaque
                    élève et résultats des examens nationaux.
                </p>
            </div>

            {message && (
                <div style={{ padding: '12px 16px', borderRadius: '10px', background: '#ecfdf5', border: '1px solid #a7f3d0', color: '#065f46', fontSize: '13.5px', fontWeight: 600, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <CheckCircle2 size={16} /> {message}
                </div>
            )}

            <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: '18px' }}>
                <div>
                    <label style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', display: 'block', marginBottom: '4px' }}>CLASSE</label>
                    <select value={selectedClasse ?? ''} onChange={e => setSelectedClasse(Number(e.target.value) || null)}
                        style={{ padding: '9px 14px', borderRadius: '10px', border: '1.5px solid #cbd5e1', fontSize: '13.5px', fontWeight: 600, minWidth: '250px' }}>
                        <option value="">— choisir une classe —</option>
                        {Object.entries(groupes).map(([cycle, liste]: any) => (
                            <optgroup key={cycle} label={cycle}>
                                {liste.map((c: any) => (
                                    <option key={c.classe_id} value={c.classe_id}>{c.libelle}</option>
                                ))}
                            </optgroup>
                        ))}
                    </select>
                </div>
                {selectedClasse && (
                    <>
                        <button onClick={calculerAnnuel} disabled={calcul} style={btn('#6366f1', true)}>
                            <Calculator size={15} /> {calcul ? (etatTache || 'Calcul…') : 'Calculer les résultats annuels'}
                        </button>
                        <button onClick={imprimerFiche} style={btn('#0f766e')}>
                            <Printer size={15} /> Fiche de résultats
                        </button>
                        <button onClick={genererBulletinsAnnuels} disabled={calcul} style={btn('#7c3aed')}>
                            <FileDown size={15} /> Bulletins annuels
                        </button>
                        <div style={{ position: 'relative', marginLeft: 'auto' }}>
                            <Search size={15} style={{ position: 'absolute', left: '11px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                            <input value={recherche} onChange={e => { setRecherche(e.target.value); setPage(1); }}
                                placeholder="Rechercher un élève…"
                                style={{ padding: '9px 12px 9px 34px', borderRadius: '10px', border: '1.5px solid #e2e8f0', fontSize: '13px', width: '220px' }} />
                        </div>
                    </>
                )}
            </div>

            {!selectedClasse ? (
                <div style={{ padding: '60px', textAlign: 'center', color: '#94a3b8', background: 'white', borderRadius: '16px', border: '1px solid #e2e8f0' }}>
                    <FileText size={40} style={{ opacity: 0.35 }} />
                    <p style={{ fontSize: '14px', marginTop: '10px' }}>Choisissez une classe pour afficher ses résultats de fin d&apos;année.</p>
                </div>
            ) : loading ? (
                <div style={{ padding: '60px', textAlign: 'center', color: '#94a3b8' }}>Chargement…</div>
            ) : (
                <>
                    {/* ═══ SYNTHÈSE ═══ */}
                    {synthese && synthese.evalues > 0 && (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', marginBottom: '18px' }}>
                            {[
                                { label: 'ÉLÈVES CLASSÉS', valeur: `${synthese.evalues}`, couleur: '#0f172a' },
                                { label: 'MOYENNE DE CLASSE', valeur: synthese.moyenne_classe?.toFixed(2) ?? '—', couleur: '#0f172a' },
                                {
                                    label: `MOYENNE ≥ ${synthese.seuil_passage}`,
                                    valeur: `${synthese.atteignent_seuil}/${synthese.evalues} · ${synthese.taux_reussite ?? 0}%`,
                                    couleur: (synthese.taux_reussite ?? 0) >= 50 ? '#059669' : '#b91c1c',
                                },
                                { label: 'PREMIER DE LA CLASSE', valeur: synthese.premier ?? '—', couleur: '#6366f1' },
                            ].map(c => (
                                <div key={c.label} style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '12px 15px' }}>
                                    <div style={{ fontSize: '10px', fontWeight: 700, color: '#94a3b8', letterSpacing: '0.5px' }}>{c.label}</div>
                                    <div style={{ fontSize: '17px', fontWeight: 800, color: c.couleur, marginTop: '4px' }}>{c.valeur}</div>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* ═══ RÉSULTAT ADMIS/NON — examen national OU maternelle ═══ */}
                    {modeSaisie && (
                        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                            style={{ background: 'white', borderRadius: '16px', border: '1.5px solid #fcd34d', overflow: 'hidden', marginBottom: '22px' }}>
                            <div style={{ padding: '14px 18px', background: '#fffbeb', borderBottom: '1px solid #fde68a' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                                    <div style={{ fontSize: '14px', fontWeight: 800, color: '#92400e', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <GraduationCap size={18} />
                                        {evaluationSimple
                                            ? 'Résultats de fin d’année — Maternelle (admis / non admis)'
                                            : `Examen national${examenNational ? ` — ${examenNational}` : ''}`}
                                    </div>
                                    {!evaluationSimple && (
                                    <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                        <input ref={fichierRef} type="file" accept=".csv,.xlsx,.xlsm,.txt" style={{ display: 'none' }}
                                            onChange={e => e.target.files?.[0] && analyserFichier(e.target.files[0])} />
                                        <button onClick={() => ouvrirFichier(
                                            `/api/promotion/classe/${selectedClasse}/resultats-officiels/modele`,
                                            'text/csv', `resultats_${selectedClasse}.csv`)} style={btn('#a16207')}>
                                            <Download size={14} /> Modèle
                                        </button>
                                        <button onClick={() => fichierRef.current?.click()} disabled={importEnCours} style={btn('#b45309', true)}>
                                            <Upload size={14} /> {importEnCours ? 'Lecture…' : 'Importer les résultats'}
                                        </button>
                                    </div>
                                    )}
                                </div>
                                <div style={{ fontSize: '12.5px', color: '#a16207', marginTop: '7px' }}>
                                    {evaluationSimple
                                        ? 'Pas de notes en maternelle : l’enseignant met Admis ou Non admis et une appréciation. Un admis passe à la section (ou l’année) suivante.'
                                        : 'Le passage dépend uniquement de ce résultat — la moyenne annuelle reste un indicateur pédagogique. Fichier accepté : CSV ou Excel, colonnes MATRICULE et RESULTAT.'}
                                    {sansResultat > 0 && (
                                        <> <strong>{sansResultat} élève{sansResultat > 1 ? 's' : ''}</strong> sans résultat —
                                            la validation de la classe restera bloquée.</>
                                    )}
                                </div>
                            </div>

                            {officiels.length === 0 ? (
                                <div style={{ padding: '30px', textAlign: 'center', color: '#94a3b8', fontSize: '13.5px' }}>
                                    Aucun élève inscrit dans cette classe.
                                </div>
                            ) : (
                                <>
                                    <div style={{ display: 'flex', gap: '18px', padding: '10px 18px', fontSize: '12.5px', fontWeight: 700, borderBottom: '1px solid #f1f5f9' }}>
                                        <span style={{ color: '#059669' }}>Admis : {admisCount}</span>
                                        <span style={{ color: '#b91c1c' }}>Non admis : {officiels.length - admisCount - sansResultat}</span>
                                        <span style={{ color: '#94a3b8' }}>Non saisis : {sansResultat}</span>
                                        <span style={{ color: '#64748b', marginLeft: 'auto' }}>Effectif : {officiels.length}</span>
                                    </div>
                                    <div style={{ overflowX: 'auto', maxHeight: '460px' }}>
                                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                                            <thead>
                                                <tr style={{ background: '#f8fafc' }}>
                                                    <th style={th}>MATRICULE</th>
                                                    <th style={th}>ÉLÈVE</th>
                                                    {!evaluationSimple && <th style={{ ...th, textAlign: 'center' }}>MOY. ANNUELLE</th>}
                                                    <th style={{ ...th, textAlign: 'center', color: '#92400e' }}>{evaluationSimple ? 'ADMIS / NON ADMIS' : 'RÉSULTAT OFFICIEL'}</th>
                                                    <th style={th}>APPRÉCIATION</th>
                                                    {attestationPossible && <th style={{ ...th, textAlign: 'center' }}>ATTESTATION</th>}
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {officielsFiltres.map(o => (
                                                    <tr key={o.inscription_id} style={{ borderTop: '1px solid #f1f5f9' }}>
                                                        <td style={{ padding: '9px 12px', color: '#94a3b8', fontSize: '12px' }}>{o.matricule || '—'}</td>
                                                        <td style={{ padding: '9px 12px', color: '#0f172a', fontWeight: 600 }}>{o.nom} {o.prenom}</td>
                                                        {!evaluationSimple && (
                                                            <td style={{ padding: '9px 12px', textAlign: 'center', color: '#64748b' }}>
                                                                {o.moyenne_annuelle != null ? o.moyenne_annuelle.toFixed(2) : '—'}
                                                            </td>
                                                        )}
                                                        <td style={{ padding: '9px 12px', textAlign: 'center' }}>
                                                            <select value={o.resultat || ''}
                                                                onChange={e => definirResultat(o.inscription_id, e.target.value)}
                                                                style={{
                                                                    padding: '6px 10px', borderRadius: '8px', fontSize: '12.5px', fontWeight: 700,
                                                                    border: `1.5px solid ${o.resultat === 'ADMIS' ? '#059669' : o.resultat === 'NON_ADMIS' ? '#b91c1c' : '#cbd5e1'}`,
                                                                    color: o.resultat === 'ADMIS' ? '#059669' : o.resultat === 'NON_ADMIS' ? '#b91c1c' : '#64748b',
                                                                    background: 'white',
                                                                }}>
                                                                <option value="">— non saisi —</option>
                                                                <option value="ADMIS">Admis</option>
                                                                <option value="NON_ADMIS">Non admis</option>
                                                            </select>
                                                        </td>
                                                        <td style={{ padding: '9px 12px' }}>
                                                            <input value={o.observation || ''}
                                                                onChange={e => definirObservation(o.inscription_id, e.target.value)}
                                                                placeholder={evaluationSimple ? 'Appréciation de l’enfant…' : 'Observation (facultatif)'}
                                                                style={{ width: '100%', minWidth: '180px', padding: '6px 10px', borderRadius: '8px', fontSize: '12.5px', border: '1px solid #e2e8f0', background: 'white' }} />
                                                        </td>
                                                        {attestationPossible && (
                                                            <td style={{ padding: '9px 12px', textAlign: 'center' }}>
                                                                {o.resultat === 'ADMIS' ? (
                                                                    <button onClick={() => ouvrirFichier(
                                                                        `/api/promotion/attestation-maternelle/${o.inscription_id}`,
                                                                        'application/pdf', `attestation_${o.nom}_${o.prenom}.pdf`)}
                                                                        style={btn('#7c3aed')}>
                                                                        <Download size={13} /> Attestation
                                                                    </button>
                                                                ) : <span style={{ color: '#cbd5e1' }}>—</span>}
                                                            </td>
                                                        )}
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                    <div style={{ padding: '12px 18px', borderTop: '1px solid #f1f5f9', display: 'flex', justifyContent: 'flex-end' }}>
                                        <button onClick={enregistrerOfficiels} disabled={saving} style={btn('#059669', true)}>
                                            <Save size={15} /> {saving ? 'Enregistrement…' : 'Enregistrer les résultats officiels'}
                                        </button>
                                    </div>
                                </>
                            )}
                        </motion.div>
                    )}

                    {/* ═══ CLASSEMENT ANNUEL ═══ */}
                    {lignes.length === 0 ? (
                        <div style={{ padding: '50px', textAlign: 'center', background: 'white', borderRadius: '16px', border: '1px solid #e2e8f0' }}>
                            <AlertTriangle size={34} color="#f59e0b" />
                            <p style={{ fontSize: '14px', color: '#475569', marginTop: '10px', fontWeight: 600 }}>
                                Aucun résultat annuel calculé pour cette classe.
                            </p>
                            <p style={{ fontSize: '13px', color: '#94a3b8' }}>
                                Calculez d&apos;abord les moyennes de chaque période, puis lancez le calcul annuel.
                            </p>
                        </div>
                    ) : (
                        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                            style={{ background: 'white', borderRadius: '16px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
                            <div style={{ padding: '13px 18px', borderBottom: '1px solid #f1f5f9', fontSize: '14px', fontWeight: 800, color: '#0f172a' }}>
                                Classement annuel
                                <span style={{ fontSize: '12px', fontWeight: 500, color: '#94a3b8', marginLeft: '10px' }}>
                                    moyenne annuelle = somme des moyennes de période ÷ nombre de périodes
                                </span>
                            </div>
                            <div style={{ overflowX: 'auto' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                                    <thead>
                                        <tr style={{ background: '#f8fafc' }}>
                                            <th style={th}>RANG</th>
                                            <th style={th}>ÉLÈVE</th>
                                            <th style={th}>MATRICULE</th>
                                            {/* Une colonne par période réellement calculée : une école à
                                                2 semestres n'en voit que 2. */}
                                            {periodes.map(p => (
                                                <th key={p.trimestre_id} style={{ ...th, textAlign: 'center' }}>
                                                    {p.libelle.toUpperCase()}
                                                </th>
                                            ))}
                                            <th style={{ ...th, textAlign: 'center' }}>MOYENNE ANNUELLE</th>
                                            <th style={th}>MENTION</th>
                                            {classeExamen && <th style={{ ...th, textAlign: 'center', color: '#92400e' }}>{(examenNational || 'EXAMEN').toUpperCase()}</th>}
                                            <th style={{ ...th, textAlign: 'center' }}>BULLETIN</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filtrees.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map(l => {
                                            const off = officielPar[l.inscription_id];
                                            const parPeriode = Object.fromEntries(
                                                (l.periodes || []).map(p => [p.trimestre_id, p.moyenne]));
                                            const sousSeuil = l.moyenne_generale !== null && synthese
                                                && l.moyenne_generale < synthese.seuil_passage;
                                            return (
                                                <tr key={l.inscription_id} style={{ borderTop: '1px solid #f1f5f9' }}>
                                                    <td style={{ padding: '10px 12px', fontWeight: 800, color: '#6366f1' }}>{l.rang ?? '—'}</td>
                                                    <td style={{ padding: '10px 12px', color: '#0f172a', fontWeight: 600 }}>{l.nom} {l.prenom}</td>
                                                    <td style={{ padding: '10px 12px', color: '#94a3b8', fontSize: '12px' }}>{l.matricule || '—'}</td>
                                                    {periodes.map(p => (
                                                        <td key={p.trimestre_id} style={{ padding: '10px 12px', textAlign: 'center', color: '#475569', fontSize: '12.5px' }}>
                                                            {parPeriode[p.trimestre_id] != null ? parPeriode[p.trimestre_id]!.toFixed(2) : '—'}
                                                        </td>
                                                    ))}
                                                    <td style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 800, fontSize: '14px', color: sousSeuil ? '#b91c1c' : '#0f172a' }}>
                                                        {l.moyenne_generale !== null ? l.moyenne_generale.toFixed(2) : '—'}
                                                    </td>
                                                    <td style={{ padding: '10px 12px', color: '#64748b', fontSize: '12px' }}>{l.mention || '—'}</td>
                                                    {classeExamen && (
                                                        <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                                                            <span style={{
                                                                padding: '3px 9px', borderRadius: '999px', fontSize: '11px', fontWeight: 700,
                                                                background: off?.resultat === 'ADMIS' ? '#ecfdf5' : off?.resultat === 'NON_ADMIS' ? '#fef2f2' : '#f1f5f9',
                                                                color: off?.resultat === 'ADMIS' ? '#059669' : off?.resultat === 'NON_ADMIS' ? '#b91c1c' : '#94a3b8',
                                                            }}>
                                                                {off?.resultat === 'ADMIS' ? 'Admis' : off?.resultat === 'NON_ADMIS' ? 'Non admis' : 'en attente'}
                                                            </span>
                                                        </td>
                                                    )}
                                                    <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                                                        <button onClick={() => ouvrirBulletinAnnuel(l.eleve_id)} title="Bulletin annuel de l'élève"
                                                            style={{ padding: '5px 10px', borderRadius: '8px', border: '1.5px solid #e2e8f0', background: 'white', color: '#6366f1', fontSize: '11.5px', fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                                                            <FileText size={13} /> PDF
                                                        </button>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>

                            <div style={{ padding: '12px 16px', borderTop: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                                <Pagination page={page} pageSize={PAGE_SIZE} total={filtrees.length} onPageChange={setPage} />
                                {synthese && (
                                    <div style={{ fontSize: '12px', color: '#64748b' }}>
                                        {MENTIONS_ORDRE.filter(m => synthese.mentions[m])
                                            .map(m => `${m} : ${synthese.mentions[m]}`).join('   ·   ') || 'Aucune mention'}
                                    </div>
                                )}
                            </div>
                        </motion.div>
                    )}
                </>
            )}

            {/* ═══ RAPPORT D'IMPORT (avant écriture) ═══ */}
            {rapport && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}
                    onClick={() => setRapport(null)}>
                    <motion.div initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }}
                        onClick={e => e.stopPropagation()}
                        style={{ background: 'white', borderRadius: '16px', width: '100%', maxWidth: '760px', maxHeight: '85vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                        <div style={{ padding: '16px 20px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <Upload size={18} color="#b45309" />
                            <div>
                                <div style={{ fontSize: '15px', fontWeight: 800, color: '#0f172a' }}>Vérification avant import</div>
                                <div style={{ fontSize: '12.5px', color: '#64748b' }}>{rapport.fichier} — {rapport.lignes_lues} ligne(s) lue(s)</div>
                            </div>
                            <button onClick={() => setRapport(null)} style={{ marginLeft: 'auto', border: 'none', background: 'transparent', cursor: 'pointer', color: '#94a3b8' }}>
                                <X size={20} />
                            </button>
                        </div>

                        <div style={{ padding: '16px 20px', overflowY: 'auto' }}>
                            <div style={{ display: 'flex', gap: '18px', flexWrap: 'wrap', fontSize: '13px', fontWeight: 700, marginBottom: '14px' }}>
                                <span style={{ color: '#0f172a' }}>À importer : {rapport.a_appliquer}</span>
                                <span style={{ color: '#059669' }}>Admis : {rapport.admis}</span>
                                <span style={{ color: '#b91c1c' }}>Non admis : {rapport.non_admis}</span>
                                {rapport.remplacements > 0 && (
                                    <span style={{ color: '#b45309' }}>Remplace {rapport.remplacements} résultat(s) déjà saisi(s)</span>
                                )}
                            </div>

                            {rapport.ignorees.length > 0 && (
                                <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '10px', padding: '11px 14px', marginBottom: '14px' }}>
                                    <div style={{ fontSize: '12.5px', fontWeight: 800, color: '#b91c1c', marginBottom: '6px' }}>
                                        {rapport.ignorees.length} ligne(s) ignorée(s)
                                    </div>
                                    {rapport.ignorees.slice(0, 12).map((i, k) => (
                                        <div key={k} style={{ fontSize: '12px', color: '#991b1b' }}>
                                            Ligne {i.ligne} — {i.eleve} : {i.raison}
                                        </div>
                                    ))}
                                    {rapport.ignorees.length > 12 && (
                                        <div style={{ fontSize: '12px', color: '#991b1b' }}>… et {rapport.ignorees.length - 12} autre(s)</div>
                                    )}
                                </div>
                            )}

                            {rapport.eleves_sans_resultat.length > 0 && (
                                <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '10px', padding: '11px 14px', marginBottom: '14px', fontSize: '12.5px', color: '#92400e' }}>
                                    <strong>{rapport.eleves_sans_resultat.length} élève(s) de la classe</strong> ne figurent
                                    pas dans le fichier et resteront sans résultat :{' '}
                                    {rapport.eleves_sans_resultat.slice(0, 6).map(e => e.eleve).join(', ')}
                                    {rapport.eleves_sans_resultat.length > 6 ? '…' : ''}
                                </div>
                            )}

                            <div className="table-scroll">
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px', minWidth: '480px' }}>
                                <thead>
                                    <tr style={{ background: '#f8fafc' }}>
                                        <th style={th}>MATRICULE</th>
                                        <th style={th}>ÉLÈVE</th>
                                        <th style={{ ...th, textAlign: 'center' }}>RÉSULTAT</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {rapport.details.map(d => (
                                        <tr key={d.ligne} style={{ borderTop: '1px solid #f1f5f9' }}>
                                            <td style={{ padding: '7px 12px', color: '#94a3b8' }}>{d.matricule || '—'}</td>
                                            <td style={{ padding: '7px 12px', color: '#0f172a' }}>{d.eleve}</td>
                                            <td style={{ padding: '7px 12px', textAlign: 'center', fontWeight: 700, color: d.resultat === 'ADMIS' ? '#059669' : '#b91c1c' }}>
                                                {d.resultat === 'ADMIS' ? 'Admis' : 'Non admis'}
                                                {d.remplace && (
                                                    <span style={{ color: '#b45309', fontWeight: 500 }}> (remplace {d.ancien_resultat === 'ADMIS' ? 'Admis' : 'Non admis'})</span>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            </div>
                        </div>

                        <div style={{ padding: '14px 20px', borderTop: '1px solid #f1f5f9', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                            <button onClick={() => setRapport(null)} style={btn('#94a3b8')}>Annuler</button>
                            <button onClick={confirmerImport} disabled={importEnCours || rapport.a_appliquer === 0} style={btn('#059669', true)}>
                                <CheckCircle2 size={15} /> {importEnCours ? 'Import…' : `Importer ${rapport.a_appliquer} résultat(s)`}
                            </button>
                        </div>
                    </motion.div>
                </div>
            )}
        </div>
    );
}
