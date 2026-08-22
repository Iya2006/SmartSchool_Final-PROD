'use client';

import { useApp } from '@/context/AppContext';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { ArrowLeft, Save, UserPlus, CheckCircle2, Loader2, BookOpen, Users, Phone, Mail, Shield, Eye, EyeOff, Briefcase, MapPin, Banknote, Receipt, FileText, AlertTriangle, GraduationCap, Smartphone, Lock, Info, X, Search, UserCheck } from 'lucide-react';
import api from '@/lib/api';
import Link from 'next/link';
import BadgeCarte from '@/components/BadgeCarte';

interface Classe {
    classe_id: number;
    libelle: string;
    code: string;
}

interface TypeFrais {
    type_frais_id: number;
    code: string;
    libelle: string;
    categorie: string;
    montant_defaut: number;
    est_obligatoire: string;
    frequence: string;
}

const FIELD = { padding: '12px 16px', borderRadius: '10px', border: '1px solid var(--border-focus)', outline: 'none', background: 'var(--bg-body)', fontSize: '14px', fontFamily: 'inherit', width: '100%', boxSizing: 'border-box' as const, transition: 'border-color 0.2s' };
const LABEL = { fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '6px' };

/** Détection des frais d'entrée, quelle que soit la casse/accent saisis. */
const estFraisReinscription = (cat?: string) => {
    const c = (cat || '').toLowerCase();
    return c.includes('réinscr') || c.includes('reinscr');
};
const estFraisInscription = (cat?: string) => {
    const c = (cat || '').toLowerCase();
    return c.includes('inscription') && !estFraisReinscription(cat);
};

export default function NouveauEleve() {
    const router = useRouter();
    const { etablissementId, anneeId, lectureSeule } = useApp();
    const [loading, setLoading] = useState(false);
    const [success, setSuccess] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [classes, setClasses] = useState<Classe[]>([]);
    const [typesFrais, setTypesFrais] = useState<TypeFrais[]>([]);
    const [initialLoading, setInitialLoading] = useState(true);
    const [showPassword, setShowPassword] = useState(false);
    const [resultData, setResultData] = useState<any>(null);

    // ── Parent existant vs nouveau parent ──────────────────────────────────
    // Pour éviter de recréer un compte parent quand un même parent a déjà un
    // enfant dans l'école (2e enfant de la famille). En mode « existant », on
    // choisit un parent déjà enregistré et le nouvel élève lui est rattaché.
    const [parentMode, setParentMode] = useState<'nouveau' | 'existant'>('nouveau');
    const [existingParents, setExistingParents] = useState<any[]>([]);
    const [parentSearch, setParentSearch] = useState('');
    const [parentsLoading, setParentsLoading] = useState(false);
    const [selectedParentId, setSelectedParentId] = useState<number | null>(null);
    const [selectedParent, setSelectedParent] = useState<any>(null);
    const [previewParent, setPreviewParent] = useState<any>(null); // aperçu « œil »

    const [formData, setFormData] = useState({
        nom: '', prenom: '', date_naissance: '', sexe: 'M',
        lieu_naissance: '', telephone: '', email: '', statut: 'ACTIF',
        classe_id: '',
        // NOUVELLE = nouvel élève de l'école (paie l'inscription) ;
        // REINSCRIPTION = élève qui continue (paie la réinscription).
        type_inscription: 'NOUVELLE',
        adresse: '', groupe_sanguin: '',
        // Portail élève
        eleve_mot_de_passe: '',
        // Parent fields
        parent_nom: '', parent_prenom: '', parent_sexe: 'M',
        parent_telephone: '', parent_telephone_2: '',
        parent_email: '', parent_profession: '',
        parent_adresse: '', parent_quartier: '',
        parent_lien: 'PERE', parent_mot_de_passe: '',
    });

    const [fraisFacturation, setFraisFacturation] = useState<Record<number, { selectionne: boolean, montant: number }>>({});
    // Ce que coûte VRAIMENT la classe choisie. L'écran chargeait les montants
    // par défaut de l'établissement, qui valent 0 dans une école qui tarifie
    // par classe : l'élève arrivait sans scolarité. Le montant vit dans la
    // grille de la classe, on va donc le chercher là.
    const [tarifsClasse, setTarifsClasse] = useState<Record<number, number> | null>(null);
    const [tarifsLoading, setTarifsLoading] = useState(false);

    useEffect(() => {
        const fetchData = async () => {
            try {
                const [classesRes, fraisRes] = await Promise.all([
                    api.get(`/api/classes?etablissement_id=${etablissementId}&annee_id=${anneeId}`),
                    api.get('/api/finance/types-frais')
                ]);
                setClasses(classesRes.data);
                
                // Initialiser les frais
                const tFrais: TypeFrais[] = fraisRes.data;
                setTypesFrais(tFrais);
                
                const initialFacturation: Record<number, { selectionne: boolean, montant: number }> = {};
                tFrais.forEach(tf => {
                    initialFacturation[tf.type_frais_id] = {
                        selectionne: tf.est_obligatoire === 'O',
                        montant: tf.montant_defaut || 0
                    };
                });
                setFraisFacturation(initialFacturation);

            } catch (err) { console.error("Failed to load data", err); }
            finally { setInitialLoading(false); }
        };
        fetchData();
    }, []);

    // Charger les parents déjà enregistrés (mode « Parent existant »), avec un
    // petit délai anti-rebond sur la recherche pour ne pas requêter à chaque
    // frappe.
    useEffect(() => {
        if (parentMode !== 'existant') return;
        let annule = false;
        setParentsLoading(true);
        const t = setTimeout(() => {
            const q = parentSearch.trim() ? `?search=${encodeURIComponent(parentSearch.trim())}` : '';
            api.get(`/api/eleves/parents-existants${q}`)
                .then(res => { if (!annule) setExistingParents(res.data || []); })
                .catch(() => { if (!annule) setExistingParents([]); })
                .finally(() => { if (!annule) setParentsLoading(false); });
        }, 250);
        return () => { annule = true; clearTimeout(t); };
    }, [parentMode, parentSearch]);

    // Sélectionner un parent existant : remplir automatiquement la fiche et
    // retenir son id pour que le nouvel élève lui soit directement rattaché.
    const choisirParent = (p: any) => {
        setSelectedParentId(p.parent_id);
        setSelectedParent(p);
        setPreviewParent(null);
        setFormData(prev => ({
            ...prev,
            parent_nom: p.nom || '',
            parent_prenom: p.prenom || '',
            parent_sexe: p.sexe || 'M',
            parent_telephone: p.telephone_1 || '',
            parent_telephone_2: p.telephone_2 || '',
            parent_email: p.email || '',
            parent_profession: p.profession || '',
            parent_adresse: p.adresse || '',
            parent_quartier: p.quartier || '',
        }));
    };

    const deselectionnerParent = () => {
        setSelectedParentId(null);
        setSelectedParent(null);
    };

    // Choisir une classe, c'est connaître sa scolarité. Tant qu'aucune classe
    // n'est choisie, on n'affiche aucun montant : on ne sait pas encore.
    useEffect(() => {
        const classeId = formData.classe_id ? parseInt(formData.classe_id) : null;
        if (!classeId) { setTarifsClasse(null); return; }

        let annule = false;
        setTarifsLoading(true);
        api.get(`/api/finance/tarifs-classe?classe_id=${classeId}`)
            .then((res) => {
                if (annule) return;
                const grille: Record<number, number> = {};
                (res.data as Array<{ type_frais_id: number; montant: number }>)
                    .forEach((t) => { grille[t.type_frais_id] = t.montant; });
                setTarifsClasse(grille);
                // Les montants affichés deviennent ceux de la classe. Le
                // serveur refuse de toute façon un montant qui contredit sa
                // grille — autant que l'écran dise la vérité tout de suite.
                setFraisFacturation((prev) => {
                    const suite = { ...prev };
                    Object.entries(grille).forEach(([id, montant]) => {
                        const k = Number(id);
                        if (suite[k]) suite[k] = { ...suite[k], montant };
                    });
                    return suite;
                });
            })
            .catch(() => { if (!annule) setTarifsClasse(null); })
            .finally(() => { if (!annule) setTarifsLoading(false); });

        return () => { annule = true; };
    }, [formData.classe_id]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true); setError(null);
        try {
            const payload: any = {
                nom: formData.nom,
                prenom: formData.prenom,
                date_naissance: formData.date_naissance || null,
                sexe: formData.sexe,
                lieu_naissance: formData.lieu_naissance || null,
                telephone: formData.telephone || null,
                email: formData.email || null,
                adresse: formData.adresse || null,
                groupe_sanguin: formData.groupe_sanguin || null,
                statut: formData.statut,
                etablissement_id: etablissementId,
                annee_id: anneeId,
                classe_id: formData.classe_id ? parseInt(formData.classe_id) : null,
                eleve_mot_de_passe: formData.eleve_mot_de_passe.trim() || null,
                type_inscription: formData.type_inscription,
            };

            // Parent : soit on rattache un parent EXISTANT (choisi dans la
            // liste), soit on en crée un nouveau à partir des champs saisis.
            if (parentMode === 'existant') {
                if (!selectedParentId) {
                    setError("Veuillez sélectionner un parent existant, ou passer en « Nouveau parent ».");
                    setLoading(false);
                    return;
                }
                payload.parent = {
                    parent_id: selectedParentId,
                    lien_parente: formData.parent_lien,
                };
            } else if (formData.parent_telephone.trim()) {
                payload.parent = {
                    nom: formData.parent_nom || formData.nom,
                    prenom: formData.parent_prenom,
                    sexe: formData.parent_sexe,
                    telephone_1: formData.parent_telephone,
                    telephone_2: formData.parent_telephone_2 || null,
                    email: formData.parent_email || null,
                    profession: formData.parent_profession || null,
                    adresse: formData.parent_adresse || null,
                    quartier: formData.parent_quartier || null,
                    lien_parente: formData.parent_lien,
                    mot_de_passe: formData.parent_mot_de_passe || null,
                };
            }

            payload.frais_scolaires = Object.entries(fraisFacturation)
                .filter(([_, data]) => data.selectionne)
                .map(([id, data]) => ({
                    type_frais_id: parseInt(id),
                    montant: data.montant
                }));

            const res = await api.post('/api/eleves/inscription-complete', payload);
            setResultData(res.data);
            setSuccess(true);
        } catch (err: any) {
            console.error(err);
            setError(err.response?.data?.detail || "Une erreur s'est produite lors de l'inscription.");
        } finally { setLoading(false); }
    };

    if (initialLoading) {
        return (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh' }}>
                <Loader2 size={40} className="animate-spin" color="var(--brand-primary)" />
            </div>
        );
    }

    if (success) {
        // Trouver la classe pour l'affichage
        const selectedClasse = classes.find(c => c.classe_id === (formData.classe_id ? parseInt(formData.classe_id) : 0));
        
        return (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', gap: '24px', padding: '40px 20px' }}>
                <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 200, damping: 20 }} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <CheckCircle2 size={40} color="#10b981" />
                    <h2 style={{ fontSize: '28px', fontWeight: 800, color: '#0f172a', margin: 0 }}>Inscription réussie !</h2>
                </motion.div>
                
                <p style={{ color: '#64748b', fontSize: '15px', maxWidth: '500px', textAlign: 'center' }}>
                    Le dossier de l'élève a été créé avec succès. Voici sa carte scolaire provisoire (sans photo). 
                    Vous pouvez la télécharger ou l'imprimer en survolant la carte.
                </p>

                {resultData && (
                    <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.2 }}>
                        <BadgeCarte
                            agent={{
                                nom: resultData.eleve.nom,
                                prenom: resultData.eleve.prenom,
                                matricule: resultData.eleve.matricule,
                                role: "ÉLÈVE",
                                classe: selectedClasse ? selectedClasse.libelle : undefined,
                                date_naissance: resultData.eleve.date_naissance,
                                adresse: resultData.eleve.adresse,
                                groupe_sanguin: resultData.eleve.groupe_sanguin
                            }}
                        />
                    </motion.div>
                )}

                {/* Identifiants de connexion — l'identifiant, c'est le matricule.
                    On l'affiche noir sur blanc à côté du mot de passe : sans ça,
                    le fondateur voyait le mot de passe mais cherchait en vain
                    « où est son identifiant ». */}
                {resultData && (
                    <motion.div initial={{ y: 16, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.3 }}
                        style={{ background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: '14px', padding: '18px 20px', maxWidth: '440px', width: '100%' }}>
                        <p style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: 800, color: '#0369a1', margin: '0 0 12px 0', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                            <Lock size={15} /> Accès au portail élève
                        </p>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                                <span style={{ fontSize: '13px', color: '#475569', fontWeight: 600 }}>Identifiant de connexion</span>
                                <code style={{ background: '#fff', border: '1px solid #bae6fd', padding: '5px 12px', borderRadius: '8px', fontSize: '15px', fontWeight: 800, color: '#0f172a', letterSpacing: '0.5px' }}>
                                    {resultData.eleve.matricule}
                                </code>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                                <span style={{ fontSize: '13px', color: '#475569', fontWeight: 600 }}>Mot de passe</span>
                                <code style={{ background: '#fff', border: '1px solid #bae6fd', padding: '5px 12px', borderRadius: '8px', fontSize: '15px', fontWeight: 800, color: '#0f172a', letterSpacing: '0.5px' }}>
                                    {formData.eleve_mot_de_passe.trim() || '(non défini — à définir dans Modifier)'}
                                </code>
                            </div>
                        </div>
                        <p style={{ fontSize: '11.5px', color: '#64748b', margin: '12px 0 0 0', lineHeight: 1.5 }}>
                            L&apos;élève se connecte avec son <strong>matricule</strong> comme identifiant. Notez-les : le mot de passe pourra être changé plus tard.
                        </p>
                    </motion.div>
                )}

                <div style={{ display: 'flex', gap: '16px', marginTop: '24px' }}>
                    <button onClick={() => {
                        setSuccess(false);
                        setFormData({ ...formData, nom: '', prenom: '', date_naissance: '', lieu_naissance: '', telephone: '', email: '', eleve_mot_de_passe: '', parent_nom: '', parent_prenom: '', parent_telephone: '', parent_telephone_2: '', parent_email: '', parent_profession: '', parent_adresse: '', parent_quartier: '', parent_mot_de_passe: '' });
                    }} style={{ padding: '12px 24px', background: 'white', border: '1px solid #e2e8f0', borderRadius: '12px', fontWeight: 600, color: '#334155', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}>
                        <UserPlus size={18} /> Inscrire un autre élève
                    </button>
                    <Link href="/eleves" style={{ padding: '12px 24px', background: '#3b82f6', border: 'none', borderRadius: '12px', fontWeight: 600, color: 'white', cursor: 'pointer', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '8px', boxShadow: '0 4px 12px rgba(59,130,246,0.3)' }}>
                        <FileText size={18} /> Aller à l'annuaire
                    </Link>
                </div>
            </div>
        );
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '28px', maxWidth: '900px', margin: '0 auto' }}>

            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                <Link href="/eleves" style={{ padding: '8px', borderRadius: '8px', background: 'var(--bg-surface)', border: '1px solid var(--border-light)', color: 'var(--text-secondary)' }}>
                    <ArrowLeft size={20} />
                </Link>
                <div>
                    <h1 style={{ fontSize: '24px', fontWeight: 800, color: 'var(--text-primary)' }}>Nouvelle Inscription</h1>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>Renseignez les informations de l&apos;élève et du parent/tuteur.</p>
                </div>
            </div>

            {error && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '16px', background: '#fee2e2', color: '#b91c1c', borderRadius: '12px', fontSize: '14px', fontWeight: 500, border: '1px solid #fecaca' }}>
                    <AlertTriangle size={16} /> {error}
                </div>
            )}

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

                {/* ═══ TYPE D'INSCRIPTION ═══ */}
                <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="card" style={{ padding: '18px 22px' }}>
                    <h2 style={{ fontSize: '15px', fontWeight: 800, margin: '0 0 4px', color: 'var(--text-primary)' }}>Type d&apos;inscription</h2>
                    <p style={{ fontSize: '12.5px', color: 'var(--text-secondary)', margin: '0 0 14px' }}>
                        Un <strong>nouvel élève</strong> de l&apos;école paie le frais d&apos;<strong>inscription</strong> ; un élève qui <strong>continue</strong> paie la <strong>réinscription</strong>. La scolarité s&apos;applique dans les deux cas.
                    </p>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
                        {([
                            { val: 'NOUVELLE', titre: 'Nouvel élève', sous: 'Inscription (nouveau dans l’école)' },
                            { val: 'REINSCRIPTION', titre: 'Réinscription', sous: 'Élève qui continue dans l’école' },
                        ] as const).map(opt => {
                            const actif = formData.type_inscription === opt.val;
                            return (
                                <button key={opt.val} type="button"
                                    onClick={() => setFormData(f => ({ ...f, type_inscription: opt.val }))}
                                    style={{
                                        textAlign: 'left', padding: '14px 16px', borderRadius: '12px', cursor: 'pointer',
                                        border: `2px solid ${actif ? '#6366f1' : 'var(--border-light)'}`,
                                        background: actif ? '#eef2ff' : 'white',
                                    }}>
                                    <p style={{ margin: 0, fontSize: '14px', fontWeight: 800, color: actif ? '#4338ca' : 'var(--text-primary)' }}>{opt.titre}</p>
                                    <p style={{ margin: '3px 0 0', fontSize: '12px', color: 'var(--text-muted)' }}>{opt.sous}</p>
                                </button>
                            );
                        })}
                    </div>
                </motion.div>

                {/* ═══ SECTION 1: INFORMATIONS ÉLÈVE ═══ */}
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="card" style={{ overflow: 'visible' }}>
                    <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border-light)', display: 'flex', alignItems: 'center', gap: '12px', background: 'linear-gradient(135deg, #f8fafc, #f1f5f9)', borderRadius: '12px 12px 0 0' }}>
                        <div style={{ padding: '10px', background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: 'white', borderRadius: '12px' }}>
                            <UserPlus size={20} />
                        </div>
                        <div>
                            <h2 style={{ fontSize: '16px', fontWeight: 700, margin: 0 }}>Informations de l&apos;Élève</h2>
                            <p style={{ fontSize: '12px', color: '#94a3b8', margin: 0 }}>Identité et inscription scolaire</p>
                        </div>
                    </div>

                    <div style={{ padding: '28px' }}>
                        <div className="form-grid-2">
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                <label style={LABEL}>Nom de famille *</label>
                                <input type="text" name="nom" value={formData.nom} onChange={handleChange} required placeholder="Ex: DIALLO" style={FIELD} />
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                <label style={LABEL}>Prénom(s) *</label>
                                <input type="text" name="prenom" value={formData.prenom} onChange={handleChange} required placeholder="Ex: Amadou" style={FIELD} />
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                <label style={LABEL}>Date de naissance *</label>
                                <input type="date" name="date_naissance" value={formData.date_naissance} onChange={handleChange} required style={FIELD} />
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                <label style={LABEL}>Sexe *</label>
                                <select name="sexe" value={formData.sexe} onChange={handleChange} style={{ ...FIELD, cursor: 'pointer' }}>
                                    <option value="M">Masculin</option>
                                    <option value="F">Féminin</option>
                                </select>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                <label style={LABEL}><BookOpen size={14} /> Classe pour l&apos;année en cours</label>
                                <select name="classe_id" value={formData.classe_id} onChange={handleChange} style={{ ...FIELD, cursor: 'pointer' }}>
                                    <option value="">-- Sélectionner une classe --</option>
                                    {classes.map(c => (
                                        <option key={c.classe_id} value={c.classe_id}>{c.libelle}</option>
                                    ))}
                                </select>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                <label style={LABEL}><MapPin size={14} /> Lieu de naissance</label>
                                <input type="text" name="lieu_naissance" value={formData.lieu_naissance} onChange={handleChange} placeholder="Ex: Conakry" style={FIELD} />
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                <label style={LABEL}><Phone size={14} /> Téléphone élève (optionnel)</label>
                                <input type="tel" name="telephone" value={formData.telephone} onChange={handleChange} placeholder="Ex: 622 00 00 00" style={FIELD} />
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                <label style={LABEL}><Mail size={14} /> Email élève (optionnel)</label>
                                <input type="email" name="email" value={formData.email} onChange={handleChange} placeholder="Ex: amadou@email.com" style={FIELD} />
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                <label style={LABEL}>Adresse résidentielle</label>
                                <input type="text" name="adresse" value={formData.adresse} onChange={handleChange} placeholder="Ex: Quartier Madina, Conakry" style={FIELD} />
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                <label style={LABEL}>Groupe Sanguin</label>
                                <select name="groupe_sanguin" value={formData.groupe_sanguin} onChange={handleChange} style={{ ...FIELD, cursor: 'pointer' }}>
                                    <option value="">-- Non renseigné --</option>
                                    <option value="A+">A+</option>
                                    <option value="A-">A-</option>
                                    <option value="B+">B+</option>
                                    <option value="B-">B-</option>
                                    <option value="AB+">AB+</option>
                                    <option value="AB-">AB-</option>
                                    <option value="O+">O+</option>
                                    <option value="O-">O-</option>
                                </select>
                            </div>
                        </div>
                    </div>
                </motion.div>

                {/* ═══ SECTION 1b: ACCÈS PORTAIL ÉLÈVE ═══ */}
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="card" style={{ overflow: 'visible' }}>
                    <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border-light)', display: 'flex', alignItems: 'center', gap: '12px', background: 'linear-gradient(135deg, #eff6ff, #dbeafe)', borderRadius: '12px 12px 0 0' }}>
                        <div style={{ padding: '10px', background: 'linear-gradient(135deg, #3b82f6, #2563eb)', color: 'white', borderRadius: '12px' }}>
                            <Shield size={20} />
                        </div>
                        <div>
                            <h2 style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '16px', fontWeight: 700, margin: 0 }}>Accès Portail Élève <GraduationCap size={16} /></h2>
                            <p style={{ fontSize: '12px', color: '#94a3b8', margin: 0 }}>
                                L&apos;élève utilisera son <strong>matricule</strong> + ce mot de passe pour se connecter
                            </p>
                        </div>
                    </div>
                    <div style={{ padding: '24px 28px' }}>
                        {/* L'identifiant n'a pas de champ à remplir : c'est le matricule,
                            généré automatiquement. On le dit ici pour lever la question
                            « où est le champ identifiant ? ». */}
                        <div style={{ padding: '14px 18px', borderRadius: '12px', background: '#eff6ff', border: '1px solid #bfdbfe', marginBottom: '14px' }}>
                            <p style={{ display: 'flex', alignItems: 'center', gap: '6px', margin: 0, fontSize: '13px', color: '#1e40af', fontWeight: 600 }}>
                                <Info size={14} /> Identifiant de connexion = le <strong>matricule</strong>
                            </p>
                            <p style={{ margin: '6px 0 0', fontSize: '12px', color: '#1e3a8a' }}>
                                Pas de champ à remplir : le matricule (ex&nbsp;: <code style={{ background: '#fff', padding: '1px 6px', borderRadius: '5px', fontFamily: 'monospace' }}>ELV-10-00001</code>) est
                                généré automatiquement à la création et affiché à la fin. Vous n&apos;avez qu&apos;à définir le mot de passe ci-dessous.
                            </p>
                        </div>
                        <div style={{ padding: '14px 18px', borderRadius: '12px', background: '#eff6ff', border: '1px solid #bfdbfe', marginBottom: '18px' }}>
                            <p style={{ display: 'flex', alignItems: 'center', gap: '6px', margin: 0, fontSize: '13px', color: '#1e40af', fontWeight: 600 }}>
                                <AlertTriangle size={14} /> Ce mot de passe donne accès au portail de l&apos;élève.
                            </p>
                            <p style={{ margin: '6px 0 0', fontSize: '12px', color: '#1e3a8a' }}>
                                Il n&apos;y a <strong>aucun mot de passe par défaut</strong>. Si vous le laissez vide, l&apos;élève n&apos;aura pas
                                accès au portail tant qu&apos;un mot de passe ne sera pas défini (vous pourrez le faire plus tard via <strong>Modifier</strong>).
                            </p>
                        </div>
                        <div style={{ position: 'relative', maxWidth: '420px' }}>
                            <input
                                type={showPassword ? 'text' : 'password'}
                                name="eleve_mot_de_passe"
                                value={formData.eleve_mot_de_passe}
                                onChange={handleChange}
                                placeholder="Mot de passe du portail élève (facultatif)"
                                style={{ ...FIELD, paddingRight: '48px', borderColor: '#3b82f6' }}
                            />
                            <button type="button" onClick={() => setShowPassword(!showPassword)}
                                style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: '4px' }}
                            >
                                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                            </button>
                        </div>
                    </div>
                </motion.div>

                {/* ═══ SECTION 2: INFORMATIONS PARENT/TUTEUR ═══ */}
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="card" style={{ overflow: 'visible' }}>
                    <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border-light)', display: 'flex', alignItems: 'center', gap: '12px', background: 'linear-gradient(135deg, #f0fdf4, #dcfce7)', borderRadius: '12px 12px 0 0' }}>
                        <div style={{ padding: '10px', background: 'linear-gradient(135deg, #10b981, #059669)', color: 'white', borderRadius: '12px' }}>
                            <Users size={20} />
                        </div>
                        <div>
                            <h2 style={{ fontSize: '16px', fontWeight: 700, margin: 0 }}>Parent / Tuteur Responsable</h2>
                            <p style={{ fontSize: '12px', color: '#94a3b8', margin: 0 }}>
                                Ces informations permettront au parent d&apos;accéder au <strong>Portail Parent</strong> <Lock size={12} style={{ display: 'inline', verticalAlign: 'middle' }} />
                            </p>
                        </div>
                    </div>

                    <div style={{ padding: '28px' }}>
                        {/* Choix du mode : rattacher un parent EXISTANT (évite les
                            doublons de comptes) ou en créer un NOUVEAU. */}
                        <div style={{ display: 'flex', gap: '10px', marginBottom: '22px', flexWrap: 'wrap' }}>
                            <button type="button" onClick={() => setParentMode('existant')}
                                style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 16px', borderRadius: '10px', fontWeight: 700, fontSize: '13px', cursor: 'pointer',
                                    border: parentMode === 'existant' ? '2px solid #059669' : '1px solid var(--border-light)',
                                    background: parentMode === 'existant' ? '#ecfdf5' : 'white',
                                    color: parentMode === 'existant' ? '#065f46' : '#475569' }}>
                                <UserCheck size={16} /> Parent existant
                            </button>
                            <button type="button" onClick={() => { setParentMode('nouveau'); deselectionnerParent(); }}
                                style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 16px', borderRadius: '10px', fontWeight: 700, fontSize: '13px', cursor: 'pointer',
                                    border: parentMode === 'nouveau' ? '2px solid #059669' : '1px solid var(--border-light)',
                                    background: parentMode === 'nouveau' ? '#ecfdf5' : 'white',
                                    color: parentMode === 'nouveau' ? '#065f46' : '#475569' }}>
                                <UserPlus size={16} /> Nouveau parent
                            </button>
                        </div>

                        {parentMode === 'existant' ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                <label style={LABEL}>Rechercher un parent déjà enregistré</label>
                                <div style={{ position: 'relative' }}>
                                    <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                                    <input value={parentSearch} onChange={e => setParentSearch(e.target.value)} placeholder="Nom, prénom ou téléphone…" style={{ ...FIELD, paddingLeft: '38px' }} />
                                </div>
                            </div>

                            {!selectedParentId && (
                                <div style={{ border: '1px solid var(--border-light)', borderRadius: '12px', maxHeight: '300px', overflowY: 'auto' }}>
                                    {parentsLoading ? (
                                        <div style={{ padding: '24px', textAlign: 'center', color: '#94a3b8', fontSize: '13px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}><Loader2 size={16} className="animate-spin" /> Chargement…</div>
                                    ) : existingParents.length === 0 ? (
                                        <div style={{ padding: '24px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>Aucun parent trouvé. Passez en « Nouveau parent » pour en créer un.</div>
                                    ) : existingParents.map(p => (
                                        <div key={p.parent_id} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 14px', borderBottom: '1px solid var(--border-light)' }}>
                                            <div style={{ width: '38px', height: '38px', borderRadius: '50%', background: '#ecfdf5', color: '#059669', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, flexShrink: 0, fontSize: '13px' }}>
                                                {((p.prenom?.[0] || '') + (p.nom?.[0] || '')).toUpperCase()}
                                            </div>
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <p style={{ margin: 0, fontWeight: 700, fontSize: '14px', color: 'var(--text-primary)' }}>{p.prenom} {p.nom}</p>
                                                <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#64748b' }}>{p.telephone_1 || '—'} • {p.nb_enfants} enfant{p.nb_enfants > 1 ? 's' : ''} dans l&apos;école</p>
                                            </div>
                                            <button type="button" title="Voir les informations du parent" aria-label="Voir les informations du parent" onClick={() => setPreviewParent(p)}
                                                style={{ background: '#f1f5f9', border: 'none', borderRadius: '8px', padding: '8px', cursor: 'pointer', color: '#475569', display: 'flex', flexShrink: 0 }}>
                                                <Eye size={16} />
                                            </button>
                                            <button type="button" onClick={() => choisirParent(p)}
                                                style={{ background: '#059669', border: 'none', borderRadius: '8px', padding: '8px 14px', cursor: 'pointer', color: 'white', fontWeight: 700, fontSize: '13px', flexShrink: 0 }}>
                                                Choisir
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {selectedParent && (
                                <div style={{ border: '1px solid #a7f3d0', background: '#ecfdf5', borderRadius: '14px', padding: '18px' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', marginBottom: '14px', flexWrap: 'wrap' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                            <CheckCircle2 size={18} color="#059669" />
                                            <p style={{ margin: 0, fontWeight: 800, color: '#065f46', fontSize: '15px' }}>Parent rattaché : {selectedParent.prenom} {selectedParent.nom}</p>
                                        </div>
                                        <button type="button" onClick={deselectionnerParent} style={{ background: 'white', border: '1px solid #d1fae5', borderRadius: '8px', padding: '6px 14px', cursor: 'pointer', fontSize: '12px', fontWeight: 700, color: '#065f46' }}>Changer de parent</button>
                                    </div>
                                    <div className="form-grid-2">
                                        <div><p style={{ margin: 0, fontSize: '11px', color: '#047857', fontWeight: 700, textTransform: 'uppercase' }}>Téléphone</p><p style={{ margin: '2px 0 0', fontSize: '14px', color: '#065f46' }}>{selectedParent.telephone_1 || '—'}</p></div>
                                        <div><p style={{ margin: 0, fontSize: '11px', color: '#047857', fontWeight: 700, textTransform: 'uppercase' }}>Email</p><p style={{ margin: '2px 0 0', fontSize: '14px', color: '#065f46' }}>{selectedParent.email || '—'}</p></div>
                                        <div><p style={{ margin: 0, fontSize: '11px', color: '#047857', fontWeight: 700, textTransform: 'uppercase' }}>Profession</p><p style={{ margin: '2px 0 0', fontSize: '14px', color: '#065f46' }}>{selectedParent.profession || '—'}</p></div>
                                        <div><p style={{ margin: 0, fontSize: '11px', color: '#047857', fontWeight: 700, textTransform: 'uppercase' }}>Quartier</p><p style={{ margin: '2px 0 0', fontSize: '14px', color: '#065f46' }}>{selectedParent.quartier || '—'}</p></div>
                                    </div>
                                    <div style={{ marginTop: '16px', maxWidth: '340px' }}>
                                        <label style={LABEL}>Lien de parenté avec cet élève *</label>
                                        <select name="parent_lien" value={formData.parent_lien} onChange={handleChange} style={{ ...FIELD, cursor: 'pointer' }}>
                                            <option value="PERE">Père</option>
                                            <option value="MERE">Mère</option>
                                            <option value="TUTEUR">Tuteur</option>
                                            <option value="ONCLE">Oncle</option>
                                            <option value="TANTE">Tante</option>
                                            <option value="FRERE">Frère/Sœur</option>
                                            <option value="AUTRE">Autre</option>
                                        </select>
                                    </div>
                                    <p style={{ margin: '14px 0 0', fontSize: '12px', color: '#047857', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <Info size={14} /> Le nouvel élève sera rattaché à ce compte parent existant — aucun nouveau compte ne sera créé.
                                    </p>
                                </div>
                            )}
                        </div>
                        ) : (
                        <>
                        <div className="form-grid-2">
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                <label style={LABEL}>Nom du parent *</label>
                                <input type="text" name="parent_nom" value={formData.parent_nom} onChange={handleChange} placeholder="Ex: DIALLO" style={FIELD} />
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                <label style={LABEL}>Prénom du parent *</label>
                                <input type="text" name="parent_prenom" value={formData.parent_prenom} onChange={handleChange} placeholder="Ex: Mamadou" style={FIELD} />
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                <label style={LABEL}>Lien de parenté *</label>
                                <select name="parent_lien" value={formData.parent_lien} onChange={handleChange} style={{ ...FIELD, cursor: 'pointer' }}>
                                    <option value="PERE">Père</option>
                                    <option value="MERE">Mère</option>
                                    <option value="TUTEUR">Tuteur</option>
                                    <option value="ONCLE">Oncle</option>
                                    <option value="TANTE">Tante</option>
                                    <option value="FRERE">Frère/Sœur</option>
                                    <option value="AUTRE">Autre</option>
                                </select>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                <label style={LABEL}>Sexe du parent</label>
                                <select name="parent_sexe" value={formData.parent_sexe} onChange={handleChange} style={{ ...FIELD, cursor: 'pointer' }}>
                                    <option value="M">Masculin</option>
                                    <option value="F">Féminin</option>
                                </select>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                <label style={{ ...LABEL, color: '#10b981' }}><Smartphone size={14} /> Téléphone principal * <span style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 400 }}>(Identifiant portail)</span></label>
                                <input type="tel" name="parent_telephone" value={formData.parent_telephone} onChange={handleChange} placeholder="Ex: 620 00 00 01" style={{ ...FIELD, borderColor: '#10b981' }} />
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                <label style={LABEL}><Phone size={14} /> Téléphone secondaire</label>
                                <input type="tel" name="parent_telephone_2" value={formData.parent_telephone_2} onChange={handleChange} placeholder="Ex: 622 00 00 02" style={FIELD} />
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                <label style={LABEL}><Mail size={14} /> Email parent</label>
                                <input type="email" name="parent_email" value={formData.parent_email} onChange={handleChange} placeholder="Ex: parent@email.com" style={FIELD} />
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                <label style={LABEL}><Briefcase size={14} /> Profession</label>
                                <input type="text" name="parent_profession" value={formData.parent_profession} onChange={handleChange} placeholder="Ex: Commerçant" style={FIELD} />
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                <label style={LABEL}><MapPin size={14} /> Adresse</label>
                                <input type="text" name="parent_adresse" value={formData.parent_adresse} onChange={handleChange} placeholder="Ex: Kaloum, Conakry" style={FIELD} />
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                <label style={LABEL}><MapPin size={14} /> Quartier</label>
                                <input type="text" name="parent_quartier" value={formData.parent_quartier} onChange={handleChange} placeholder="Ex: Boulbinet" style={FIELD} />
                            </div>
                        </div>

                        {/* Mot de passe Portail Parent */}
                        <div style={{ marginTop: '24px', padding: '20px', borderRadius: '14px', background: 'linear-gradient(135deg, #ede9fe, #f5f3ff)', border: '1px solid #ddd6fe' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
                                <Shield size={20} color="#6366f1" />
                                <div>
                                    <p style={{ margin: 0, fontSize: '14px', fontWeight: 700, color: '#1e293b' }}>Accès Portail Parent</p>
                                    <p style={{ margin: 0, fontSize: '11px', color: '#94a3b8' }}>
                                        Le parent utilisera son téléphone + ce mot de passe pour se connecter
                                    </p>
                                </div>
                            </div>
                            <div style={{ position: 'relative', maxWidth: '400px' }}>
                                <input
                                    type={showPassword ? 'text' : 'password'}
                                    name="parent_mot_de_passe"
                                    value={formData.parent_mot_de_passe}
                                    onChange={handleChange}
                                    placeholder="Mot de passe du portail parent"
                                    style={{ ...FIELD, paddingRight: '48px', borderColor: '#8b5cf6' }}
                                />
                                <button type="button" onClick={() => setShowPassword(!showPassword)}
                                    style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: '4px' }}
                                >
                                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                                </button>
                            </div>
                        </div>
                        </>
                        )}
                    </div>
                </motion.div>

                {/* Aperçu « œil » d'un parent avant de le choisir — évite de se
                    tromper de personne quand plusieurs portent le même nom. */}
                {previewParent && (
                    <div onClick={() => setPreviewParent(null)}
                        style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
                        <div onClick={e => e.stopPropagation()}
                            style={{ background: 'white', borderRadius: '18px', width: '460px', maxWidth: '95vw', maxHeight: '90vh', overflow: 'auto', boxShadow: '0 25px 50px rgba(0,0,0,0.25)' }}>
                            <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border-light)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                    <div style={{ width: '44px', height: '44px', borderRadius: '50%', background: '#ecfdf5', color: '#059669', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>
                                        {((previewParent.prenom?.[0] || '') + (previewParent.nom?.[0] || '')).toUpperCase()}
                                    </div>
                                    <div>
                                        <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800 }}>{previewParent.prenom} {previewParent.nom}</h3>
                                        <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#64748b' }}>{previewParent.nb_enfants} enfant{previewParent.nb_enfants > 1 ? 's' : ''} déjà inscrit{previewParent.nb_enfants > 1 ? 's' : ''} dans l&apos;école</p>
                                    </div>
                                </div>
                                <button type="button" onClick={() => setPreviewParent(null)} style={{ background: '#f1f5f9', border: 'none', borderRadius: '8px', padding: '6px', cursor: 'pointer' }}><X size={18} /></button>
                            </div>
                            <div style={{ padding: '24px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                                {[
                                    { k: 'Téléphone principal', v: previewParent.telephone_1 },
                                    { k: 'Téléphone secondaire', v: previewParent.telephone_2 },
                                    { k: 'Email', v: previewParent.email },
                                    { k: 'Profession', v: previewParent.profession },
                                    { k: 'Adresse', v: previewParent.adresse },
                                    { k: 'Quartier', v: previewParent.quartier },
                                ].map((f, i) => (
                                    <div key={i}>
                                        <p style={{ margin: 0, fontSize: '11px', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase' }}>{f.k}</p>
                                        <p style={{ margin: '2px 0 0', fontSize: '14px', color: 'var(--text-primary)' }}>{f.v || '—'}</p>
                                    </div>
                                ))}
                            </div>
                            <div style={{ padding: '0 24px 24px', display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                                <button type="button" onClick={() => setPreviewParent(null)} style={{ background: 'white', border: '1px solid var(--border-light)', borderRadius: '10px', padding: '10px 18px', cursor: 'pointer', fontWeight: 700, fontSize: '13px', color: '#475569' }}>Fermer</button>
                                <button type="button" onClick={() => choisirParent(previewParent)} style={{ background: '#059669', border: 'none', borderRadius: '10px', padding: '10px 18px', cursor: 'pointer', fontWeight: 700, fontSize: '13px', color: 'white', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <UserCheck size={16} /> Choisir ce parent
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* ═══ SECTION 3: FACTURATION ═══ */}
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="card" style={{ overflow: 'visible' }}>
                    <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border-light)', display: 'flex', alignItems: 'center', gap: '12px', background: 'linear-gradient(135deg, #f0fdf4, #dcfce7)', borderRadius: '12px 12px 0 0' }}>
                        <div style={{ padding: '10px', background: 'linear-gradient(135deg, #10b981, #059669)', color: 'white', borderRadius: '12px' }}>
                            <Receipt size={20} />
                        </div>
                        <div>
                            <h2 style={{ fontSize: '16px', fontWeight: 700, margin: 0, color: '#065f46' }}>Facturation Initiale</h2>
                            <p style={{ fontSize: '12px', color: '#047857', margin: 0 }}>Sélectionnez les frais à facturer lors de l&apos;inscription</p>
                        </div>
                    </div>
                    <div style={{ padding: '28px' }}>
                        {/* CE QUE DOIT L'ÉLÈVE, DIT AVANT D'ENREGISTRER
                            Le montant ne se devine pas : il vient de la grille
                            de la classe choisie, et c'est le serveur qui
                            tranche. L'écran le montre pour qu'on ne découvre
                            pas la scolarité après coup. */}
                        {!formData.classe_id ? (
                            <div style={{ marginBottom: '20px', padding: '14px 18px', borderRadius: '12px', background: '#f8fafc', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <GraduationCap size={18} color="#64748b" />
                                <span style={{ fontSize: '13.5px', color: '#475569', fontWeight: 600 }}>
                                    Choisissez la classe : la scolarité qui s&apos;applique en découle.
                                </span>
                            </div>
                        ) : tarifsLoading ? (
                            <div style={{ marginBottom: '20px', padding: '14px 18px', borderRadius: '12px', background: '#f8fafc', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <Loader2 size={16} className="animate-spin" color="#64748b" />
                                <span style={{ fontSize: '13.5px', color: '#475569', fontWeight: 600 }}>
                                    Lecture de la grille tarifaire de la classe…
                                </span>
                            </div>
                        ) : tarifsClasse && Object.keys(tarifsClasse).length > 0 ? (
                            <div style={{ marginBottom: '20px', padding: '14px 18px', borderRadius: '12px', background: '#f0fdf4', border: '1px solid #bbf7d0' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
                                    <Banknote size={18} color="#16a34a" />
                                    <span style={{ fontSize: '13.5px', color: '#166534', fontWeight: 800 }}>
                                        Grille de cette classe — montants appliqués automatiquement
                                    </span>
                                </div>
                                <p style={{ margin: 0, fontSize: '12.5px', color: '#15803d' }}>
                                    Total des frais obligatoires :{' '}
                                    <strong>
                                        {typesFrais
                                            .filter(tf => tf.est_obligatoire === 'O' && tarifsClasse[tf.type_frais_id])
                                            .reduce((s, tf) => s + tarifsClasse[tf.type_frais_id], 0)
                                            .toLocaleString('fr-FR')} GNF
                                    </strong>
                                </p>
                            </div>
                        ) : (
                            <div style={{ marginBottom: '20px', padding: '14px 18px', borderRadius: '12px', background: '#fffbeb', border: '1px solid #fde68a' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                    <AlertTriangle size={18} color="#b45309" />
                                    <span style={{ fontSize: '13.5px', color: '#92400e', fontWeight: 700 }}>
                                        Aucun tarif configuré pour cette classe.
                                    </span>
                                </div>
                                <p style={{ margin: '6px 0 0', fontSize: '12.5px', color: '#a16207' }}>
                                    L&apos;élève sera inscrit sans facture. Posez la grille dans
                                    Comptabilité → Frais pour que la scolarité suive.
                                </p>
                            </div>
                        )}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '16px' }}>
                            {typesFrais
                                // On n'affiche que le frais d'entrée correspondant au type
                                // choisi : inscription pour un nouvel élève, réinscription
                                // pour un élève qui continue — jamais les deux.
                                .filter(tf => formData.type_inscription === 'REINSCRIPTION'
                                    ? !estFraisInscription(tf.categorie)
                                    : !estFraisReinscription(tf.categorie))
                                .map(tf => {
                                const state = fraisFacturation[tf.type_frais_id];
                                if (!state) return null;
                                const isObligatoire = tf.est_obligatoire === 'O';
                                
                                return (
                                    <div key={tf.type_frais_id} style={{ 
                                        padding: '16px', 
                                        borderRadius: '12px', 
                                        border: `2px solid ${state.selectionne ? '#10b981' : '#e2e8f0'}`,
                                        background: state.selectionne ? '#f0fdf4' : 'white',
                                        transition: 'all 0.2s',
                                        cursor: isObligatoire ? 'not-allowed' : 'pointer'
                                    }}
                                    onClick={() => {
                                        if (isObligatoire) return;
                                        setFraisFacturation(prev => ({
                                            ...prev,
                                            [tf.type_frais_id]: { ...prev[tf.type_frais_id], selectionne: !prev[tf.type_frais_id].selectionne }
                                        }));
                                    }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                                            <div>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                    <span style={{ fontWeight: 700, color: '#1e293b', fontSize: '15px' }}>{tf.libelle}</span>
                                                    {isObligatoire && <span style={{ fontSize: '10px', background: '#fee2e2', color: '#dc2626', padding: '2px 6px', borderRadius: '4px', fontWeight: 600 }}>Obligatoire</span>}
                                                </div>
                                                <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>Catégorie: {tf.categorie}</div>
                                            </div>
                                            <div style={{ 
                                                width: '20px', height: '20px', borderRadius: '6px', 
                                                background: state.selectionne ? '#10b981' : 'white',
                                                border: `2px solid ${state.selectionne ? '#10b981' : '#cbd5e1'}`,
                                                display: 'flex', alignItems: 'center', justifyContent: 'center'
                                            }}>
                                                {state.selectionne && <CheckCircle2 size={14} color="white" />}
                                            </div>
                                        </div>
                                        
                                        <div onClick={(e) => e.stopPropagation()} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <Banknote size={16} color="#64748b" />
                                            <input 
                                                type="number" 
                                                value={state.montant}
                                                onChange={(e) => setFraisFacturation(prev => ({
                                                    ...prev,
                                                    [tf.type_frais_id]: { ...prev[tf.type_frais_id], montant: parseFloat(e.target.value) || 0 }
                                                }))}
                                                style={{ 
                                                    padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', 
                                                    width: '100%', fontSize: '14px', fontWeight: 600, color: '#0f172a'
                                                }}
                                            />
                                            <span style={{ fontSize: '13px', color: '#64748b', fontWeight: 600 }}>GNF</span>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </motion.div>

                {/* ═══ SUBMIT BUTTONS ═══ */}
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginBottom: '40px' }}>
                    <Link href="/eleves" style={{ padding: '14px 28px', borderRadius: '12px', border: '1px solid var(--border-light)', background: 'var(--bg-surface)', fontWeight: 600, color: 'var(--text-secondary)', cursor: 'pointer', textDecoration: 'none', fontSize: '14px' }}>
                        Annuler
                    </Link>
                    <button
                        type="submit" disabled={loading || lectureSeule}
                        title={lectureSeule ? "Année en lecture seule — inscription impossible" : undefined}
                        style={{
                            padding: '14px 32px', borderRadius: '12px',
                            background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: 'white',
                            fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px',
                            cursor: loading ? 'not-allowed' : 'pointer', border: 'none',
                            boxShadow: '0 4px 14px rgba(99,102,241,0.4)', fontSize: '14px',
                            transition: 'transform 0.15s, box-shadow 0.15s',
                        }}
                    >
                        {loading ? <Loader2 size={20} className="animate-spin" /> : <Save size={20} />}
                        {parentMode === 'existant' ? "Inscrire l'Élève + Rattacher au Parent" : "Inscrire l'Élève + Créer Compte Parent"}
                    </button>
                </div>
            </form>
        </div>
    );
}
