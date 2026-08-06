'use client';

import { useApp } from '@/context/AppContext';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { ArrowLeft, Save, UserPlus, CheckCircle2, Loader2, BookOpen, Users, Phone, Mail, Shield, Eye, EyeOff, Briefcase, MapPin, DollarSign, Receipt, FileText, AlertTriangle, GraduationCap, Smartphone, Lock } from 'lucide-react';
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

export default function NouveauEleve() {
    const router = useRouter();
    const { etablissementId, anneeId } = useApp();
    const [loading, setLoading] = useState(false);
    const [success, setSuccess] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [classes, setClasses] = useState<Classe[]>([]);
    const [typesFrais, setTypesFrais] = useState<TypeFrais[]>([]);
    const [initialLoading, setInitialLoading] = useState(true);
    const [showPassword, setShowPassword] = useState(false);
    const [resultData, setResultData] = useState<any>(null);

    const [formData, setFormData] = useState({
        nom: '', prenom: '', date_naissance: '', sexe: 'M',
        lieu_naissance: '', telephone: '', email: '', statut: 'ACTIF',
        classe_id: '',
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
            };

            // Ajouter les données parent si le téléphone est rempli
            if (formData.parent_telephone.trim()) {
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
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
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
                        <div style={{ padding: '14px 18px', borderRadius: '12px', background: '#fef3c7', border: '1px solid #fde68a', marginBottom: '18px' }}>
                            <p style={{ display: 'flex', alignItems: 'center', gap: '4px', margin: 0, fontSize: '13px', color: '#92400e', fontWeight: 600 }}>
                                <AlertTriangle size={14} /> Mot de passe par défaut : <code style={{ background: '#fff', padding: '2px 8px', borderRadius: '6px', fontFamily: 'monospace', fontSize: '14px', border: '1px solid #fed7aa' }}>smartschool</code>
                            </p>
                            <p style={{ margin: '6px 0 0', fontSize: '12px', color: '#78350f' }}>
                                Si vous ne saisissez rien, le mot de passe sera <strong>smartschool</strong>. Vous pouvez personnaliser ci-dessous.
                            </p>
                        </div>
                        <div style={{ position: 'relative', maxWidth: '420px' }}>
                            <input
                                type={showPassword ? 'text' : 'password'}
                                name="eleve_mot_de_passe"
                                value={formData.eleve_mot_de_passe}
                                onChange={handleChange}
                                placeholder="Laisser vide = mot de passe par défaut (smartschool)"
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
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
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
                    </div>
                </motion.div>

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
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '16px' }}>
                            {typesFrais.map(tf => {
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
                                            <DollarSign size={16} color="#64748b" />
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
                        type="submit" disabled={loading}
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
                        Inscrire l&apos;Élève + Créer Compte Parent
                    </button>
                </div>
            </form>
        </div>
    );
}
