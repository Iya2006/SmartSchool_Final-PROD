'use client';

/**
 * Résultats de fin d'année — écran dédié.
 *
 * Réunit ce qui était jusqu'ici éparpillé entre la page Bulletins (moyenne
 * annuelle) et l'assistant de clôture (résultats ministériels) : à la fin de
 * l'année, l'école veut voir en un seul endroit le classement annuel de la
 * classe et, pour les classes d'examen, le résultat officiel qui décide
 * réellement du passage.
 *
 * Distinction volontairement visible à l'écran : pour une 6ème, une 10ème ou
 * une Terminale, la moyenne annuelle est un indicateur pédagogique — c'est
 * l'examen national qui tranche.
 */
import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
    Trophy, GraduationCap, Save, AlertTriangle, CheckCircle2,
    Calculator, FileText, Search,
} from 'lucide-react';
import { useApp } from '@/context/AppContext';
import api from '@/lib/api';
import { lancerTache } from '@/lib/taskPolling';
import Pagination from '@/components/Pagination';

interface LigneAnnuelle {
    inscription_id: number; eleve_id: number;
    nom: string; prenom: string; matricule: string;
    moyenne_generale: number | null; rang: number | null; mention: string | null;
    moyennes_periodes: number[]; nb_periodes: number;
}
interface LigneOfficielle {
    inscription_id: number; nom: string; prenom: string; matricule: string;
    moyenne_annuelle: number | null; resultat: string | null; observation: string | null;
}

const PAGE_SIZE = 25;

export default function ResultatsAnnuelsPage() {
    const { etablissementId } = useApp();

    const [classes, setClasses] = useState<any[]>([]);
    const [selectedClasse, setSelectedClasse] = useState<number | null>(null);
    const [lignes, setLignes] = useState<LigneAnnuelle[]>([]);
    const [officiels, setOfficiels] = useState<LigneOfficielle[]>([]);
    const [classeExamen, setClasseExamen] = useState(false);
    const [examenNational, setExamenNational] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [calcul, setCalcul] = useState(false);
    const [etatTache, setEtatTache] = useState('');
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState('');
    const [page, setPage] = useState(1);
    const [recherche, setRecherche] = useState('');

    useEffect(() => {
        api.get(`/api/classes?etablissement_id=${etablissementId}`)
            .then(r => setClasses(r.data))
            .catch(() => setClasses([]));
    }, [etablissementId]);

    const charger = useCallback(async () => {
        if (!selectedClasse) return;
        setLoading(true);
        try {
            const [annuel, off] = await Promise.all([
                api.get(`/api/evaluations/classe/${selectedClasse}/resultats-annuels`),
                api.get(`/api/promotion/classe/${selectedClasse}/resultats-officiels`)
                    .catch(() => ({ data: null })),
            ]);
            setLignes(annuel.data?.resultats || []);
            setClasseExamen(!!off.data?.classe_examen);
            setExamenNational(off.data?.examen_national || null);
            setOfficiels(off.data?.eleves || []);
        } catch {
            setLignes([]); setOfficiels([]);
        }
        setLoading(false);
        setPage(1);
    }, [selectedClasse]);

    useEffect(() => { charger(); }, [charger]);

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
            setMessage(res.message || `Résultats annuels calculés — ${res.bulletins_total ?? ''} élèves`);
            setTimeout(() => setMessage(''), 6000);
            await charger();
        } catch (e: any) {
            alert(e?.response?.data?.detail || e.message);
        }
        setEtatTache(''); setCalcul(false);
    };

    const definirResultat = (inscriptionId: number, resultat: string) =>
        setOfficiels(prev => prev.map(o =>
            o.inscription_id === inscriptionId ? { ...o, resultat } : o));

    const enregistrerOfficiels = async () => {
        const resultats = officiels.filter(o => o.resultat)
            .map(o => ({ inscription_id: o.inscription_id, resultat: o.resultat, observation: o.observation }));
        if (!resultats.length) { alert('Aucun résultat saisi.'); return; }
        setSaving(true);
        try {
            const res = await api.post('/api/promotion/resultats-officiels/bulk', { resultats });
            setMessage(res.data.message || `${resultats.length} résultats enregistrés`);
            setTimeout(() => setMessage(''), 6000);
            await charger();
        } catch (e: any) {
            alert(e?.response?.data?.detail || e.message);
        }
        setSaving(false);
    };

    const groupes = classes.reduce((acc: any, c: any) => {
        const cycle = c.cycle_libelle || 'Autres';
        (acc[cycle] = acc[cycle] || []).push(c);
        return acc;
    }, {});

    const officielPar = Object.fromEntries(officiels.map(o => [o.inscription_id, o]));
    const filtrees = lignes.filter(l =>
        !recherche.trim()
        || `${l.nom} ${l.prenom} ${l.matricule}`.toLowerCase().includes(recherche.toLowerCase()));
    const sansResultat = classeExamen
        ? officiels.filter(o => !o.resultat).length : 0;

    return (
        <div style={{ padding: '24px 28px', maxWidth: '1400px', margin: '0 auto' }}>
            <div style={{ marginBottom: '20px' }}>
                <h1 style={{ margin: 0, fontSize: '22px', fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <Trophy size={22} color="#6366f1" /> Résultats de fin d&apos;année
                </h1>
                <p style={{ margin: '6px 0 0', fontSize: '14px', color: '#64748b' }}>
                    Moyenne annuelle et classement de la classe. Pour les classes d&apos;examen,
                    le résultat officiel du Ministère décide seul du passage.
                </p>
            </div>

            {message && (
                <div style={{ padding: '12px 16px', borderRadius: '10px', background: '#ecfdf5', border: '1px solid #a7f3d0', color: '#065f46', fontSize: '13.5px', fontWeight: 600, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <CheckCircle2 size={16} /> {message}
                </div>
            )}

            <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: '20px' }}>
                <div>
                    <label style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', display: 'block', marginBottom: '4px' }}>CLASSE</label>
                    <select value={selectedClasse ?? ''} onChange={e => setSelectedClasse(Number(e.target.value) || null)}
                        style={{ padding: '9px 14px', borderRadius: '10px', border: '1.5px solid #cbd5e1', fontSize: '13.5px', fontWeight: 600, minWidth: '260px' }}>
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
                        <button onClick={calculerAnnuel} disabled={calcul}
                            style={{ padding: '10px 20px', borderRadius: '10px', border: 'none', background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: 'white', fontSize: '13.5px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Calculator size={15} /> {calcul ? (etatTache || 'Calcul…') : 'Calculer les résultats annuels'}
                        </button>
                        <div style={{ position: 'relative' }}>
                            <Search size={15} style={{ position: 'absolute', left: '11px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                            <input value={recherche} onChange={e => { setRecherche(e.target.value); setPage(1); }}
                                placeholder="Rechercher un élève…"
                                style={{ padding: '9px 12px 9px 34px', borderRadius: '10px', border: '1.5px solid #e2e8f0', fontSize: '13px', width: '230px' }} />
                        </div>
                    </>
                )}
            </div>

            {classeExamen && (
                <div style={{ padding: '14px 18px', borderRadius: '12px', background: '#fffbeb', border: '1px solid #fcd34d', marginBottom: '20px' }}>
                    <div style={{ fontSize: '13.5px', fontWeight: 800, color: '#92400e', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <GraduationCap size={17} /> Classe d&apos;examen national{examenNational ? ` — ${examenNational}` : ''}
                    </div>
                    <div style={{ fontSize: '12.5px', color: '#a16207', marginTop: '4px' }}>
                        La moyenne annuelle ci-dessous reste un <strong>indicateur pédagogique</strong> : le passage
                        dépend uniquement du résultat officiel du Ministère.
                        {sansResultat > 0 && (
                            <> <strong>{sansResultat} élève{sansResultat > 1 ? 's' : ''}</strong> sans résultat saisi —
                            la validation de la classe restera bloquée.</>
                        )}
                    </div>
                </div>
            )}

            {!selectedClasse ? (
                <div style={{ padding: '60px', textAlign: 'center', color: '#94a3b8', background: 'white', borderRadius: '16px', border: '1px solid #e2e8f0' }}>
                    <FileText size={40} style={{ opacity: 0.35 }} />
                    <p style={{ fontSize: '14px', marginTop: '10px' }}>Choisissez une classe pour afficher ses résultats de fin d&apos;année.</p>
                </div>
            ) : loading ? (
                <div style={{ padding: '60px', textAlign: 'center', color: '#94a3b8' }}>Chargement…</div>
            ) : lignes.length === 0 ? (
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
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                            <thead>
                                <tr style={{ background: '#f8fafc' }}>
                                    {['RANG', 'ÉLÈVE', 'MATRICULE', 'MOYENNES DES PÉRIODES', 'MOYENNE ANNUELLE', 'MENTION']
                                        .map(h => (
                                            <th key={h} style={{ padding: '11px 14px', fontSize: '11px', fontWeight: 700, color: '#64748b', textAlign: 'left', letterSpacing: '0.4px' }}>{h}</th>
                                        ))}
                                    {classeExamen && (
                                        <th style={{ padding: '11px 14px', fontSize: '11px', fontWeight: 700, color: '#92400e', textAlign: 'center' }}>
                                            RÉSULTAT OFFICIEL
                                        </th>
                                    )}
                                </tr>
                            </thead>
                            <tbody>
                                {filtrees.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map(l => {
                                    const off = officielPar[l.inscription_id];
                                    return (
                                        <tr key={l.inscription_id} style={{ borderTop: '1px solid #f1f5f9' }}>
                                            <td style={{ padding: '10px 14px', fontWeight: 800, color: '#6366f1' }}>{l.rang ?? '—'}</td>
                                            <td style={{ padding: '10px 14px', color: '#0f172a', fontWeight: 600 }}>{l.nom} {l.prenom}</td>
                                            <td style={{ padding: '10px 14px', color: '#94a3b8', fontSize: '12px' }}>{l.matricule || '—'}</td>
                                            {/* Le détail qui justifie la moyenne : sans lui, une famille
                                                qui recompte à la main ne retrouve pas le chiffre. */}
                                            <td style={{ padding: '10px 14px', color: '#475569', fontSize: '12.5px' }}>
                                                {l.moyennes_periodes?.length
                                                    ? `${l.moyennes_periodes.map(m => m.toFixed(2)).join('  +  ')}  ÷ ${l.nb_periodes}`
                                                    : '—'}
                                            </td>
                                            <td style={{ padding: '10px 14px', fontWeight: 800, fontSize: '14px', color: l.moyenne_generale !== null && l.moyenne_generale < 10 ? '#b91c1c' : '#0f172a' }}>
                                                {l.moyenne_generale !== null ? l.moyenne_generale.toFixed(2) : '—'}
                                            </td>
                                            <td style={{ padding: '10px 14px', color: '#64748b', fontSize: '12px' }}>{l.mention || '—'}</td>
                                            {classeExamen && (
                                                <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                                                    <select value={off?.resultat || ''}
                                                        onChange={e => definirResultat(l.inscription_id, e.target.value)}
                                                        style={{
                                                            padding: '6px 10px', borderRadius: '8px', fontSize: '12.5px', fontWeight: 700,
                                                            border: `1.5px solid ${off?.resultat === 'ADMIS' ? '#059669' : off?.resultat === 'NON_ADMIS' ? '#b91c1c' : '#cbd5e1'}`,
                                                            color: off?.resultat === 'ADMIS' ? '#059669' : off?.resultat === 'NON_ADMIS' ? '#b91c1c' : '#64748b',
                                                            background: 'white',
                                                        }}>
                                                        <option value="">— non saisi —</option>
                                                        <option value="ADMIS">Admis</option>
                                                        <option value="NON_ADMIS">Non admis</option>
                                                    </select>
                                                </td>
                                            )}
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>

                    <div style={{ padding: '12px 16px', borderTop: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                        <Pagination page={page} pageSize={PAGE_SIZE} total={filtrees.length} onPageChange={setPage} />
                        {classeExamen && (
                            <button onClick={enregistrerOfficiels} disabled={saving}
                                style={{ padding: '10px 20px', borderRadius: '10px', border: 'none', background: '#059669', color: 'white', fontSize: '13.5px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <Save size={15} /> {saving ? 'Enregistrement…' : 'Enregistrer les résultats officiels'}
                            </button>
                        )}
                    </div>
                </motion.div>
            )}
        </div>
    );
}
