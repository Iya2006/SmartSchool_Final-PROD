'use client';

import { useApp } from '@/context/AppContext';
import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Settings, ChevronRight, Loader2, UserCheck, Users,
    CheckCircle2, AlertCircle, ArrowLeft, BookOpen, Crown, Search, Star, AlertTriangle, School, GraduationCap, Coins
} from 'lucide-react';
import api from '@/lib/api';
import Link from 'next/link';

interface Enseignant {
    enseignant_id: number;
    matricule: string;
    nom: string;
    prenom: string;
    sexe: string;
    specialite: string | null;
    telephone: string;
}

interface EleveDeClasse {
    eleve_id: number;
    matricule: string;
    nom: string;
    prenom: string;
    sexe: string;
    date_naissance: string;
}

interface ClasseInfo {
    classe_id: number;
    code: string;
    libelle: string;
    capacite_max: number;
    effectif_actuel: number;
    niveau: { niveau_id: number; code: string; libelle: string } | null;
    cycle_code: string | null;
    cycle_libelle: string | null;
    professeur_principal: Enseignant | null;
    eleves: EleveDeClasse[];
    matieres: any[];
    nb_matieres: number;
}

/** Reconnaît un frais d'entrée (inscription / réinscription), quel que soit
 *  l'accent ou la casse saisis à la création du type de frais. */
function estFraisEntree(categorie: string | null | undefined): boolean {
    const c = (categorie || '').toLowerCase();
    return c.includes('inscription') || c.includes('inscrip') || c.includes('réinscr') || c.includes('reinscr');
}

/** Ordre d'affichage : inscription/réinscription en tête, le reste ensuite. */
function rangFrais(categorie: string | null | undefined): number {
    return estFraisEntree(categorie) ? 0 : 1;
}

export default function ConfigurerClassePage() {
    const params = useParams();
    const router = useRouter();
    const classeId = params.id as string;

    const [classe, setClasse] = useState<ClasseInfo | null>(null);
    const [enseignants, setEnseignants] = useState<Enseignant[]>([]);
    const { etablissementId, anneeId } = useApp();
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [successMsg, setSuccessMsg] = useState<string | null>(null);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);

    // Config state
    const [selectedProfId, setSelectedProfId] = useState<number | null>(null);
    const [chefDeClasse, setChefDeClasse] = useState<number[]>([]);
    const [searchProf, setSearchProf] = useState('');
    const [searchEleve, setSearchEleve] = useState('');
    const [showManualModal, setShowManualModal] = useState(false);
    const [matieresGroupes, setMatieresGroupes] = useState<any[]>([]);

    // Frais de scolarité de cette classe — même table (ss_tarifs_classe) que celle
    // gérée depuis la page Comptabilité > Frais, par type de frais cette fois-ci :
    // les deux écrans restent automatiquement synchronisés.
    const [typesFrais, setTypesFrais] = useState<{ type_frais_id: number; libelle: string; categorie: string }[]>([]);
    const [tarifs, setTarifs] = useState<Record<number, string>>({});
    const [savingTarifs, setSavingTarifs] = useState(false);

    useEffect(() => {
        const fetchData = async () => {
            try {
                const [classeRes, ensRes, tfRes, tarifsRes] = await Promise.all([
                    api.get(`/api/classes/${classeId}/profil`),
                    api.get(`/api/enseignants?etablissement_id=${etablissementId}&skip=0&limit=200`),
                    api.get('/api/finance/types-frais').catch(() => ({ data: [] })),
                    api.get(`/api/finance/tarifs-classe?classe_id=${classeId}`).catch(() => ({ data: [] })),
                ]);
                setClasse(classeRes.data);
                setEnseignants(ensRes.data);
                setTypesFrais(tfRes.data || []);
                const tarifsMap: Record<number, string> = {};
                (tarifsRes.data || []).forEach((t: any) => { tarifsMap[t.type_frais_id] = String(t.montant); });
                setTarifs(tarifsMap);
                if (classeRes.data.professeur_principal) {
                    setSelectedProfId(classeRes.data.professeur_principal.enseignant_id);
                }
                if (classeRes.data.chefs_de_classe && classeRes.data.chefs_de_classe.length > 0) {
                    setChefDeClasse(classeRes.data.chefs_de_classe.map((c: any) => c.eleve_id));
                }
            } catch (err) {
                console.error(err);
                setErrorMsg("Impossible de charger les données de la classe.");
            } finally {
                setLoading(false);
            }
        };
        if (classeId) fetchData();
    }, [classeId]);

    const handleSaveTarifs = async () => {
        setSavingTarifs(true);
        setErrorMsg(null);
        try {
            const entries = typesFrais.map(tf => ({
                type_frais_id: tf.type_frais_id,
                classe_id: parseInt(classeId),
                montant: parseFloat(tarifs[tf.type_frais_id] || '0') || 0,
            }));
            await api.put('/api/finance/tarifs-classe', entries);
            setSuccessMsg('Frais de scolarité de la classe enregistrés !');
            setTimeout(() => setSuccessMsg(null), 3000);
        } catch (err: any) {
            setErrorMsg(err.response?.data?.detail || "Erreur lors de l'enregistrement des frais.");
        } finally {
            setSavingTarifs(false);
        }
    };

    const handleSave = async () => {
        // Validation chefs de classe
        if (chefDeClasse.length > 0 && chefDeClasse.length !== 3) {
            setErrorMsg("Vous devez désigner exactement 3 chefs de classe, ou aucun.");
            setTimeout(() => setErrorMsg(null), 4000);
            return;
        }
        if (chefDeClasse.length === 3 && classe) {
            const selectedStudents = classe.eleves.filter(e => chefDeClasse.includes(e.eleve_id));
            const hasGirl = selectedStudents.some(e => e.sexe === 'F');
            if (!hasGirl) {
                setErrorMsg("Il faut au moins une fille parmi les 3 chefs de classe !");
                setTimeout(() => setErrorMsg(null), 5000);
                return;
            }
        }

        try {
            setSaving(true);
            setErrorMsg(null);
            await api.put(`/api/classes/${classeId}/configurer`, {
                professeur_principal_id: selectedProfId,
                chefs_de_classe: chefDeClasse,
            });
            setSuccessMsg("Classe configurée avec succès !");
            setTimeout(() => {
                setSuccessMsg(null);
                router.push(`/classes/${classeId}`);
            }, 2000);
        } catch (err: any) {
            setErrorMsg(err.response?.data?.detail || "Erreur lors de la sauvegarde.");
        } finally {
            setSaving(false);
        }
    };

    const toggleChef = (eleveId: number) => {
        setChefDeClasse(prev => {
            if (prev.includes(eleveId)) return prev.filter(id => id !== eleveId);
            if (prev.length >= 3) {
                setErrorMsg("Vous ne pouvez sélectionner que 3 chefs de classe maximum.");
                setTimeout(() => setErrorMsg(null), 3000);
                return prev;
            }
            return [...prev, eleveId];
        });
    };

    const filteredEnseignants = enseignants.filter(e =>
        `${e.prenom} ${e.nom} ${e.specialite || ''} ${e.matricule}`.toLowerCase().includes(searchProf.toLowerCase())
    );

    const filteredEleves = (classe?.eleves || []).filter(e =>
        `${e.prenom} ${e.nom} ${e.matricule}`.toLowerCase().includes(searchEleve.toLowerCase())
    );

    // Count filles among selected chefs
    const chefsSelectionnes = (classe?.eleves || []).filter(e => chefDeClasse.includes(e.eleve_id));
    const nbFillesChefs = chefsSelectionnes.filter(e => e.sexe === 'F').length;

    if (loading) return (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '120px' }}>
            <Loader2 size={44} className="animate-spin" color="var(--brand-primary)" />
        </div>
    );

    if (!classe) return (
        <div style={{ textAlign: 'center', padding: '80px', color: 'var(--text-muted)' }}>Classe introuvable.</div>
    );

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

            {/* Breadcrumb */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                <div className="breadcrumb">
                    <Link href="/">Accueil</Link>
                    <ChevronRight size={14} />
                    <Link href="/classes">Classes</Link>
                    <ChevronRight size={14} />
                    <Link href={`/classes/${classe.classe_id}`}>{classe.libelle}</Link>
                    <ChevronRight size={14} />
                    <span>Configuration</span>
                </div>
                <Link href={`/classes/${classe.classe_id}`} style={{
                    display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px', borderRadius: '10px',
                    border: '1px solid var(--border-light)', color: 'var(--text-secondary)', textDecoration: 'none',
                    fontSize: '13px', fontWeight: 600, background: 'white'
                }}>
                    <ArrowLeft size={15} /> Retour au profil
                </Link>
            </div>

            {/* Messages */}
            <AnimatePresence>
                {errorMsg && (
                    <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                        style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '14px 20px', background: '#fef2f2', color: '#b91c1c', borderRadius: '14px', fontSize: '14px', fontWeight: 500, border: '1px solid #fecaca' }}>
                        <AlertCircle size={18} /> {errorMsg}
                    </motion.div>
                )}
                {successMsg && (
                    <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                        style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '14px 20px', background: '#f0fdf4', color: '#166534', borderRadius: '14px', fontSize: '14px', fontWeight: 500, border: '1px solid #bbf7d0' }}>
                        <CheckCircle2 size={18} /> {successMsg}
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Header */}
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
                className="card" style={{ padding: '28px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <div style={{
                        padding: '14px', borderRadius: '16px',
                        background: 'linear-gradient(135deg, #4f46e5, #7c3aed)', color: 'white'
                    }}>
                        <Settings size={26} />
                    </div>
                    <div>
                        <h1 style={{ fontSize: '24px', fontWeight: 800, margin: 0, color: 'var(--text-primary)' }}>
                            Configurer — {classe.libelle}
                        </h1>
                        <p style={{ color: 'var(--text-secondary)', margin: '4px 0 0', fontSize: '14px' }}>
                            {classe.niveau?.libelle} • {classe.eleves.length} élèves • {classe.nb_matieres} matières
                        </p>
                    </div>
                </div>
            </motion.div>

            {/* ═══════════════════════════════════════════ */}
            {/* Section 0: Frais de Scolarité de la classe */}
            {/* ═══════════════════════════════════════════ */}
            <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }}
                className="card" style={{ padding: '24px' }}>
                <h3 style={{ fontSize: '17px', fontWeight: 700, margin: '0 0 6px', display: 'flex', alignItems: 'center', gap: '10px', color: 'var(--text-primary)' }}>
                    <div style={{ padding: '8px', borderRadius: '10px', background: '#d1fae5', color: '#059669' }}>
                        <Coins size={18} />
                    </div>
                    Frais de Scolarité de cette classe
                </h3>
                <p style={{ color: 'var(--text-secondary)', fontSize: '13px', margin: '0 0 20px' }}>
                    Montant propre à cette classe pour chaque type de frais — <strong>y compris le prix
                    d'inscription et de réinscription</strong> (une école n'a pas la même scolarité en
                    maternelle qu'en terminale). Laissez à 0 pour ne rien facturer de ce type à cette
                    classe. Modifiable également depuis Comptabilité &gt; Frais Scolaires.
                </p>
                {typesFrais.length === 0 ? (
                    <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>Aucun type de frais configuré pour l'instant (Comptabilité &gt; Frais Scolaires).</p>
                ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '12px' }}>
                        {/* Inscription et réinscription d'abord, mis en avant : c'est
                            le prix que le fondateur cherche en priorité au moment
                            d'accueillir un élève. */}
                        {[...typesFrais].sort((a, b) => rangFrais(a.categorie) - rangFrais(b.categorie)).map(tf => {
                            const enAvant = estFraisEntree(tf.categorie);
                            return (
                                <div key={tf.type_frais_id} style={{
                                    display: 'flex', flexDirection: 'column', gap: '4px', padding: '12px', borderRadius: '12px',
                                    border: `1px solid ${enAvant ? '#6ee7b7' : 'var(--border-light)'}`,
                                    background: enAvant ? '#f0fdf4' : 'transparent',
                                }}>
                                    <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)' }}>
                                        {tf.libelle} <span style={{ color: enAvant ? '#059669' : 'var(--text-muted)', fontWeight: enAvant ? 700 : 400 }}>({tf.categorie})</span>
                                    </label>
                                    <input type="number" min="0" value={tarifs[tf.type_frais_id] || ''}
                                        onChange={e => setTarifs(prev => ({ ...prev, [tf.type_frais_id]: e.target.value }))}
                                        placeholder="0" style={{ padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--border-light)', fontSize: '14px', fontWeight: 600 }} />
                                </div>
                            );
                        })}
                    </div>
                )}
                {typesFrais.length > 0 && (() => {
                    // Ce que paie réellement une famille : la scolarité et les autres
                    // frais + UN SEUL frais d'entrée (inscription OU réinscription,
                    // jamais les deux). On montre donc les deux totaux.
                    const val = (id: number) => Number(tarifs[id] || 0) || 0;
                    const inscriptionId = typesFrais.find(tf => /inscript/i.test(tf.categorie) && !/r[ée]inscript/i.test(tf.categorie))?.type_frais_id;
                    const reinscriptionId = typesFrais.find(tf => /r[ée]inscript/i.test(tf.categorie))?.type_frais_id;
                    const base = typesFrais
                        .filter(tf => tf.type_frais_id !== inscriptionId && tf.type_frais_id !== reinscriptionId)
                        .reduce((s, tf) => s + val(tf.type_frais_id), 0);
                    const totalNouvel = base + (inscriptionId ? val(inscriptionId) : 0);
                    const totalReinsc = base + (reinscriptionId ? val(reinscriptionId) : 0);
                    const fmt = (n: number) => `${n.toLocaleString('fr-GN')} GNF`;
                    return (
                        <div style={{ marginTop: '16px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
                            <div style={{ padding: '14px 16px', borderRadius: '12px', background: '#eff6ff', border: '1px solid #bfdbfe' }}>
                                <p style={{ margin: 0, fontSize: '11px', fontWeight: 800, color: '#1e40af', textTransform: 'uppercase', letterSpacing: '0.4px' }}>Total à payer — nouvel élève</p>
                                <p style={{ margin: '4px 0 0', fontSize: '20px', fontWeight: 800, color: '#0f172a' }}>{fmt(totalNouvel)}</p>
                                <p style={{ margin: '2px 0 0', fontSize: '11px', color: '#64748b' }}>scolarité + frais + inscription</p>
                            </div>
                            <div style={{ padding: '14px 16px', borderRadius: '12px', background: '#f0fdf4', border: '1px solid #bbf7d0' }}>
                                <p style={{ margin: 0, fontSize: '11px', fontWeight: 800, color: '#15803d', textTransform: 'uppercase', letterSpacing: '0.4px' }}>Total à payer — réinscription</p>
                                <p style={{ margin: '4px 0 0', fontSize: '20px', fontWeight: 800, color: '#0f172a' }}>{fmt(totalReinsc)}</p>
                                <p style={{ margin: '2px 0 0', fontSize: '11px', color: '#64748b' }}>scolarité + frais + réinscription</p>
                            </div>
                        </div>
                    );
                })()}
                {typesFrais.length > 0 && (
                    <button onClick={handleSaveTarifs} disabled={savingTarifs}
                        style={{ marginTop: '18px', display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 20px', borderRadius: '10px', border: 'none', background: 'linear-gradient(135deg, #10b981, #059669)', color: 'white', fontWeight: 700, fontSize: '13px', cursor: 'pointer', opacity: savingTarifs ? 0.6 : 1 }}>
                        {savingTarifs ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />}
                        {savingTarifs ? 'Enregistrement...' : 'Enregistrer les frais de cette classe'}
                    </button>
                )}
            </motion.div>

            {/* ═══════════════════════════════════════════ */}
            {/* Section 1: Professeur Principal — PRIMAIRE seulement */}
            {/* Au collège et au lycée, il n'y a pas de professeur principal :
                chaque matière a son enseignant. On masque donc cette section
                hors primaire. */}
            {/* ═══════════════════════════════════════════ */}
            {classe?.cycle_code === 'PRM' && (
            <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
                className="card" style={{ padding: '24px' }}>
                <h3 style={{ fontSize: '17px', fontWeight: 700, margin: '0 0 6px', display: 'flex', alignItems: 'center', gap: '10px', color: 'var(--text-primary)' }}>
                    <div style={{ padding: '8px', borderRadius: '10px', background: '#dbeafe', color: '#2563eb' }}>
                        <UserCheck size={18} />
                    </div>
                    Désigner le Professeur Principal (instituteur titulaire)
                </h3>
                <p style={{ color: 'var(--text-secondary)', fontSize: '13px', margin: '0 0 20px' }}>
                    Cliquez sur un enseignant pour le sélectionner comme professeur principal de cette classe.
                </p>

                {/* Search */}
                <div style={{ position: 'relative', marginBottom: '16px', maxWidth: '400px' }}>
                    <Search size={16} color="var(--text-muted)" style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)' }} />
                    <input type="text" placeholder="Rechercher un enseignant..." value={searchProf}
                        onChange={(e) => setSearchProf(e.target.value)}
                        style={{
                            width: '100%', padding: '10px 14px 10px 38px', borderRadius: '10px',
                            border: '1px solid var(--border-light)', outline: 'none', fontSize: '13px', background: 'var(--bg-body)'
                        }} />
                </div>

                {/* Teacher Grid */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '12px', maxHeight: '360px', overflowY: 'auto', paddingRight: '4px' }}>
                    {filteredEnseignants.map((ens, i) => {
                        const isSelected = selectedProfId === ens.enseignant_id;
                        return (
                            <motion.div key={ens.enseignant_id}
                                initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                                transition={{ delay: i * 0.02 }}
                                onClick={() => setSelectedProfId(isSelected ? null : ens.enseignant_id)}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: '12px',
                                    padding: '14px', borderRadius: '14px', cursor: 'pointer',
                                    border: isSelected ? '2px solid #2563eb' : '1px solid var(--border-light)',
                                    background: isSelected ? '#eff6ff' : 'white',
                                    transition: 'all 0.15s', position: 'relative'
                                }}
                                onMouseOver={(e) => { if (!isSelected) e.currentTarget.style.borderColor = '#93c5fd'; }}
                                onMouseOut={(e) => { if (!isSelected) e.currentTarget.style.borderColor = 'var(--border-light)'; }}
                            >
                                {isSelected && (
                                    <div style={{ position: 'absolute', top: '-6px', right: '-6px', width: '24px', height: '24px', borderRadius: '50%', background: '#2563eb', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        <CheckCircle2 size={14} />
                                    </div>
                                )}
                                <div style={{
                                    width: '42px', height: '42px', borderRadius: '12px', flexShrink: 0,
                                    background: isSelected ? 'linear-gradient(135deg, #3b82f6, #2563eb)' : '#f1f5f9',
                                    color: isSelected ? 'white' : '#64748b',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    fontWeight: 700, fontSize: '14px'
                                }}>
                                    {ens.prenom[0]}{ens.nom[0]}
                                </div>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <p style={{ fontWeight: 600, margin: 0, fontSize: '14px', color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                        {ens.prenom} {ens.nom}
                                    </p>
                                    <p style={{ margin: '2px 0 0', fontSize: '12px', color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                        {ens.specialite || 'Enseignant'} • {ens.matricule}
                                    </p>
                                </div>
                            </motion.div>
                        );
                    })}
                </div>
            </motion.div>
            )}

            {/* ═══════════════════════════════════════════ */}
            {/* Section 2: Chefs de Classe */}
            {/* ═══════════════════════════════════════════ */}
            <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
                className="card" style={{ padding: '24px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px', marginBottom: '16px' }}>
                    <div>
                        <h3 style={{ fontSize: '17px', fontWeight: 700, margin: '0 0 6px', display: 'flex', alignItems: 'center', gap: '10px', color: 'var(--text-primary)' }}>
                            <div style={{ padding: '8px', borderRadius: '10px', background: '#fef3c7', color: '#d97706' }}>
                                <Crown size={18} />
                            </div>
                            Désigner les Chefs de Classe (3)
                        </h3>
                        <p style={{ color: 'var(--text-secondary)', fontSize: '13px', margin: 0 }}>
                            Sélectionnez 3 élèves. <strong style={{ color: '#b91c1c' }}>Au moins 1 fille obligatoire.</strong>
                        </p>
                    </div>

                    {/* Chips Selection Summary */}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
                        <span style={{
                            padding: '6px 14px', borderRadius: '20px', fontSize: '12px', fontWeight: 700,
                            background: chefDeClasse.length === 3 ? '#dcfce7' : '#f1f5f9',
                            color: chefDeClasse.length === 3 ? '#166534' : '#64748b'
                        }}>
                            {chefDeClasse.length}/3 sélectionnés
                        </span>
                        {chefDeClasse.length > 0 && (
                            <span style={{
                                padding: '6px 14px', borderRadius: '20px', fontSize: '12px', fontWeight: 700,
                                background: nbFillesChefs > 0 ? '#dcfce7' : '#fef2f2',
                                color: nbFillesChefs > 0 ? '#166534' : '#b91c1c'
                            }}>
                                {nbFillesChefs > 0 ? <>{nbFillesChefs} fille(s) <CheckCircle2 size={12} style={{display:'inline', verticalAlign:'middle'}}/></> : <><AlertTriangle size={12} style={{display:'inline', verticalAlign:'middle'}}/> Aucune fille</>}
                            </span>
                        )}
                    </div>
                </div>

                {/* Search */}
                <div style={{ position: 'relative', marginBottom: '16px', maxWidth: '400px' }}>
                    <Search size={16} color="var(--text-muted)" style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)' }} />
                    <input type="text" placeholder="Rechercher un élève..." value={searchEleve}
                        onChange={(e) => setSearchEleve(e.target.value)}
                        style={{
                            width: '100%', padding: '10px 14px 10px 38px', borderRadius: '10px',
                            border: '1px solid var(--border-light)', outline: 'none', fontSize: '13px', background: 'var(--bg-body)'
                        }} />
                </div>

                {classe.eleves.length === 0 ? (
                    <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)', background: '#f8fafc', borderRadius: '12px' }}>
                        <Users size={36} style={{ opacity: 0.3, margin: '0 auto 10px' }} />
                        <p style={{ fontWeight: 600 }}>Aucun élève dans cette classe.</p>
                    </div>
                ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '10px', maxHeight: '380px', overflowY: 'auto', paddingRight: '4px' }}>
                        {filteredEleves.map((e, i) => {
                            const isChef = chefDeClasse.includes(e.eleve_id);
                            const isFille = e.sexe === 'F';
                            return (
                                <motion.div key={e.eleve_id}
                                    initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                                    transition={{ delay: i * 0.015 }}
                                    onClick={() => toggleChef(e.eleve_id)}
                                    style={{
                                        display: 'flex', alignItems: 'center', gap: '10px',
                                        padding: '12px 14px', borderRadius: '12px', cursor: 'pointer',
                                        border: isChef ? `2px solid ${isFille ? '#db2777' : '#f59e0b'}` : '1px solid var(--border-light)',
                                        background: isChef ? (isFille ? '#fdf2f8' : '#fffbeb') : 'white',
                                        transition: 'all 0.15s', position: 'relative'
                                    }}
                                    onMouseOver={(e) => { if (!isChef) e.currentTarget.style.background = '#f8fafc'; }}
                                    onMouseOut={(e) => { if (!isChef) e.currentTarget.style.background = 'white'; }}
                                >
                                    {isChef && (
                                        <div style={{
                                            position: 'absolute', top: '-5px', right: '-5px',
                                            width: '22px', height: '22px', borderRadius: '50%',
                                            background: isFille ? '#db2777' : '#f59e0b', color: 'white',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center'
                                        }}>
                                            <Star size={12} fill="white" />
                                        </div>
                                    )}
                                    <div style={{
                                        width: '38px', height: '38px', borderRadius: '10px', flexShrink: 0,
                                        background: isFille ? '#fce7f3' : '#dbeafe',
                                        color: isFille ? '#db2777' : '#2563eb',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        fontWeight: 700, fontSize: '13px'
                                    }}>
                                        {e.prenom[0]}{e.nom[0]}
                                    </div>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <p style={{ fontWeight: 600, margin: 0, fontSize: '13px', color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                            {e.prenom} {e.nom}
                                        </p>
                                        <p style={{ margin: '1px 0 0', fontSize: '11px', color: 'var(--text-muted)' }}>
                                            {isFille ? 'Fille' : 'Garçon'} • {e.matricule}
                                        </p>
                                    </div>
                                </motion.div>
                            );
                        })}
                    </div>
                )}
            </motion.div>

            {/* ═══════════════════════════════════════════ */}
            {/* Section 3: Matières (Info Only) */}
            {/* ═══════════════════════════════════════════ */}
            <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
                className="card" style={{ padding: '24px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px', marginBottom: '16px' }}>
                    <div>
                        <h3 style={{ fontSize: '17px', fontWeight: 700, margin: '0 0 6px', display: 'flex', alignItems: 'center', gap: '10px', color: 'var(--text-primary)' }}>
                            <div style={{ padding: '8px', borderRadius: '10px', background: '#e0e7ff', color: '#4f46e5' }}>
                                <BookOpen size={18} />
                            </div>
                            Matières Attribuées ({classe.nb_matieres})
                        </h3>
                        <p style={{ color: 'var(--text-secondary)', fontSize: '13px', margin: 0 }}>
                            Attribuez les matières automatiquement selon le programme guinéen ou manuellement.
                        </p>
                    </div>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                        {/* Bouton Génération Auto */}
                        <button
                            onClick={async () => {
                                try {
                                    setSaving(true); setErrorMsg(null);
                                    await api.post('/api/matieres/auto-generation');
                                    await api.post(`/api/matieres/attribuer-programme-classe/${classeId}`);
                                    const res = await api.get(`/api/classes/${classeId}/profil`);
                                    setClasse(res.data);
                                    if (res.data.nb_matieres > 0) {
                                        setSuccessMsg(`${res.data.nb_matieres} matières du programme guinéen attribuées !`);
                                    } else {
                                        setErrorMsg("Aucune matière pour ce niveau. Vérifiez la config.");
                                    }
                                    setTimeout(() => { setSuccessMsg(null); setErrorMsg(null); }, 5000);
                                } catch (err: any) {
                                    setErrorMsg(err.response?.data?.detail || "Erreur. Réessayez.");
                                    setTimeout(() => setErrorMsg(null), 5000);
                                } finally { setSaving(false); }
                            }}
                            disabled={saving}
                            style={{
                                display: 'inline-flex', alignItems: 'center', gap: '6px',
                                padding: '8px 16px', borderRadius: '10px', fontSize: '12px', fontWeight: 700,
                                background: 'linear-gradient(135deg, #4f46e5, #7c3aed)', color: 'white',
                                border: 'none', cursor: saving ? 'not-allowed' : 'pointer',
                                boxShadow: '0 2px 8px rgba(79,70,229,0.25)'
                            }}
                        >
                            {saving ? <Loader2 size={13} className="animate-spin" /> : <BookOpen size={13} />}
                            Générer automatiquement
                        </button>
                        {/* Bouton Attribution Manuelle */}
                        <button
                            onClick={async () => {
                                try {
                                    const res = await api.get('/api/matieres/par-cycle/groupes');
                                    setMatieresGroupes(res.data);
                                    setShowManualModal(true);
                                } catch (err) {
                                    setErrorMsg("Impossible de charger les matières.");
                                    setTimeout(() => setErrorMsg(null), 3000);
                                }
                            }}
                            style={{
                                display: 'inline-flex', alignItems: 'center', gap: '6px',
                                padding: '8px 16px', borderRadius: '10px', fontSize: '12px', fontWeight: 700,
                                background: 'white', color: '#4f46e5', border: '1.5px solid #c7d2fe',
                                cursor: 'pointer'
                            }}
                        >
                            <span style={{ fontSize: '16px', lineHeight: 1 }}>+</span> Ajouter manuellement
                        </button>
                    </div>
                </div>

                {/* Warning Alert Box */}
                <div style={{
                    display: 'flex', gap: '12px', padding: '14px 18px',
                    background: '#fffbeb', border: '1px solid #fde68a',
                    borderRadius: '12px', color: '#b45309', fontSize: '13px',
                    lineHeight: 1.5, marginBottom: '16px'
                }}>
                    <AlertCircle size={20} style={{ flexShrink: 0, marginTop: '2px', color: '#d97706' }} />
                    <div style={{ flex: 1 }}>
                        <strong><AlertTriangle size={14} style={{display:'inline', verticalAlign:'middle'}}/> Vérification nécessaire :</strong> Après avoir utilisé la génération automatique, veuillez valider que la liste des matières et leurs coefficients sont corrects pour cette classe. Utilisez le bouton <strong>« Ajouter manuellement »</strong> pour combler les manques, ou cliquez sur la croix <strong>(×)</strong> pour retirer des matières inappropriées.
                    </div>
                </div>


                {classe.matieres.length === 0 ? (
                    <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)', background: '#f8fafc', borderRadius: '12px' }}>
                        <BookOpen size={36} style={{ opacity: 0.3, margin: '0 auto 10px' }} />
                        <p style={{ fontWeight: 600, margin: '0 0 4px' }}>Aucune matière attribuée.</p>
                        <p style={{ fontSize: '12px', margin: 0 }}>Utilisez le bouton « Générer automatiquement » ou « Ajouter manuellement ».</p>
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                        {classe.matieres.map((m: any, idx: number) => (
                            <span key={`${m.matiere_id || idx}-${idx}`} style={{
                                padding: '6px 14px', borderRadius: '20px', fontSize: '12px', fontWeight: 600,
                                background: '#f1f5f9', color: '#475569', border: '1px solid #e2e8f0',
                                display: 'inline-flex', alignItems: 'center', gap: '6px'
                            }}>
                                {m.libelle} (coef {m.coefficient})
                                <button onClick={async (e) => {
                                    e.stopPropagation();
                                    try {
                                        await api.delete(`/api/matieres/classe/${classeId}/matiere/${m.matiere_id}`);
                                        const res = await api.get(`/api/classes/${classeId}/profil`);
                                        setClasse(res.data);
                                    } catch (err: any) {
                                        setErrorMsg(err.response?.data?.detail || "Erreur suppression");
                                        setTimeout(() => setErrorMsg(null), 3000);
                                    }
                                }} style={{
                                    background: 'none', border: 'none', cursor: 'pointer', padding: '0 0 0 2px',
                                    color: '#94a3b8', fontSize: '14px', lineHeight: 1
                                }} title="Retirer cette matière">×</button>
                            </span>
                        ))}
                    </div>
                )}

                {/* Modal Attribution Manuelle — Organisé par Cycle */}
                <AnimatePresence>
                    {showManualModal && (
                        <motion.div
                            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                            style={{
                                position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
                                display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 9999
                            }}
                            onClick={() => setShowManualModal(false)}
                        >
                            <motion.div
                                initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                                exit={{ scale: 0.95, opacity: 0 }}
                                onClick={(e) => e.stopPropagation()}
                                style={{
                                    background: 'white', borderRadius: '20px', padding: '28px',
                                    width: '90%', maxWidth: '560px', maxHeight: '80vh', overflowY: 'auto',
                                    boxShadow: '0 20px 60px rgba(0,0,0,0.15)'
                                }}
                            >
                                <h3 style={{ margin: '0 0 4px', fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)' }}>
                                    Ajouter une matière
                                </h3>
                                <p style={{ color: 'var(--text-secondary)', fontSize: '13px', margin: '0 0 20px' }}>
                                    Sélectionnez les matières à ajouter à <strong>{classe.libelle}</strong>
                                </p>

                                {/* Sections par Cycle */}
                                {matieresGroupes.map((group: any) => {
                                    const cycleColors: Record<string, { bg: string; border: string; text: string; badge: any }> = {
                                        'PRM': { bg: '#fef3c7', border: '#fbbf24', text: '#92400e', badge: <><School size={12} style={{display:'inline', verticalAlign:'middle'}}/> Primaire</> },
                                        'CLG': { bg: '#dbeafe', border: '#3b82f6', text: '#1e40af', badge: <><BookOpen size={12} style={{display:'inline', verticalAlign:'middle'}}/> Collège</> },
                                        'LYC': { bg: '#ede9fe', border: '#8b5cf6', text: '#5b21b6', badge: <><GraduationCap size={12} style={{display:'inline', verticalAlign:'middle'}}/> Lycée</> },
                                    };
                                    const colors = cycleColors[group.cycle_code] || { bg: '#f1f5f9', border: '#94a3b8', text: '#475569', badge: group.cycle_libelle };
                                    const availableMats = group.matieres.filter(
                                        (m: any) => !classe.matieres.some((cm: any) => cm.matiere_id === m.matiere_id)
                                    );
                                    if (availableMats.length === 0) return null;

                                    return (
                                        <div key={group.cycle_id} style={{ marginBottom: '16px' }}>
                                            {/* Cycle Header */}
                                            <div style={{
                                                display: 'flex', alignItems: 'center', gap: '8px',
                                                marginBottom: '8px', padding: '6px 12px',
                                                background: colors.bg, borderRadius: '8px',
                                                borderLeft: `3px solid ${colors.border}`
                                            }}>
                                                <span style={{ fontWeight: 700, fontSize: '13px', color: colors.text }}>
                                                    {colors.badge}
                                                </span>
                                                <span style={{ fontSize: '11px', color: colors.text, opacity: 0.7 }}>
                                                    ({availableMats.length} disponible{availableMats.length > 1 ? 's' : ''})
                                                </span>
                                            </div>
                                            {/* Matières */}
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', paddingLeft: '8px' }}>
                                                {availableMats.map((m: any) => (
                                                    <button key={m.matiere_id} onClick={async () => {
                                                        try {
                                                            await api.post(`/api/matieres/classe/${classeId}/matiere`, {
                                                                matiere_id: m.matiere_id,
                                                                coefficient: m.coefficient_defaut || 2,
                                                                nb_heures_semaine: m.nb_heures_semaine || 2
                                                            });
                                                            const res = await api.get(`/api/classes/${classeId}/profil`);
                                                            setClasse(res.data);
                                                            setSuccessMsg(`${m.libelle} ajoutée !`);
                                                            setTimeout(() => setSuccessMsg(null), 2000);
                                                        } catch (err: any) {
                                                            setErrorMsg(err.response?.data?.detail || "Erreur");
                                                            setTimeout(() => setErrorMsg(null), 3000);
                                                        }
                                                    }} style={{
                                                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                                        padding: '10px 14px', borderRadius: '10px', border: '1px solid #e2e8f0',
                                                        background: 'white', cursor: 'pointer', textAlign: 'left',
                                                        transition: 'all 0.15s'
                                                    }}
                                                    onMouseOver={(e) => { e.currentTarget.style.borderColor = colors.border; e.currentTarget.style.background = colors.bg; }}
                                                    onMouseOut={(e) => { e.currentTarget.style.borderColor = '#e2e8f0'; e.currentTarget.style.background = 'white'; }}
                                                    >
                                                        <div>
                                                            <span style={{ fontWeight: 600, fontSize: '13px', color: 'var(--text-primary)' }}>{m.libelle}</span>
                                                            <span style={{ fontSize: '10px', color: '#94a3b8', marginLeft: '8px', fontWeight: 500 }}>{m.categorie}</span>
                                                        </div>
                                                        <span style={{ fontSize: '18px', color: colors.border, fontWeight: 700 }}>+</span>
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    );
                                })}

                                {/* Si tout est attribué */}
                                {matieresGroupes.every((g: any) => g.matieres.every((m: any) => classe.matieres.some((cm: any) => cm.matiere_id === m.matiere_id))) && (
                                    <p style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '20px', fontSize: '13px' }}>
                                        Toutes les matières disponibles sont déjà attribuées.
                                    </p>
                                )}

                                <button onClick={() => setShowManualModal(false)} style={{
                                    marginTop: '16px', width: '100%', padding: '10px', borderRadius: '10px',
                                    border: '1px solid var(--border-light)', background: '#f8fafc', cursor: 'pointer',
                                    fontWeight: 600, fontSize: '13px', color: 'var(--text-secondary)'
                                }}>Fermer</button>
                            </motion.div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </motion.div>

            {/* ═══════════════════════════════════════════ */}
            {/* Save Button */}
            {/* ═══════════════════════════════════════════ */}
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }}
                style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', paddingBottom: '32px' }}>
                <Link href={`/classes/${classe.classe_id}`} style={{
                    padding: '12px 24px', borderRadius: '12px', fontSize: '14px', fontWeight: 600,
                    border: '1px solid var(--border-light)', color: 'var(--text-secondary)',
                    textDecoration: 'none', background: 'white'
                }}>
                    Annuler
                </Link>
                <button onClick={handleSave} disabled={saving}
                    style={{
                        display: 'flex', alignItems: 'center', gap: '8px',
                        padding: '12px 32px', borderRadius: '12px', fontSize: '14px', fontWeight: 700,
                        background: 'linear-gradient(135deg, #4f46e5, #7c3aed)', color: 'white',
                        border: 'none', cursor: saving ? 'not-allowed' : 'pointer',
                        boxShadow: '0 4px 16px rgba(79,70,229,0.3)', transition: 'all 0.2s'
                    }}
                    onMouseOver={(e) => { if (!saving) e.currentTarget.style.transform = 'translateY(-2px)'; }}
                    onMouseOut={(e) => e.currentTarget.style.transform = 'translateY(0)'}
                >
                    {saving ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
                    Sauvegarder la Configuration
                </button>
            </motion.div>
        </div>
    );
}
