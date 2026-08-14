'use client';

import { useApp } from '@/context/AppContext';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { ArrowLeft, Save, UserPlus, CheckCircle2, Loader2, Briefcase, Lock, Eye, EyeOff, Shield, Copy, Check, Smartphone, FileText, Lightbulb, AlertTriangle, RefreshCw } from 'lucide-react';
import api from '@/lib/api';
import Link from 'next/link';
import BadgeCarte from '@/components/BadgeCarte';

export default function NouveauEnseignant() {
    const router = useRouter();
    const { etablissementId, anneeId } = useApp();
    const [loading, setLoading] = useState(false);
    const [success, setSuccess] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [showPwd, setShowPwd] = useState(false);
    const [showConfPwd, setShowConfPwd] = useState(false);
    const [pwdError, setPwdError] = useState('');
    const [copied, setCopied] = useState(false);
    const [createdInfo, setCreatedInfo] = useState<{nom: string; prenom: string; matricule: string; telephone: string; mot_de_passe: string; enseignant_id: number; role: string} | null>(null);

    const [formData, setFormData] = useState({
        nom: '',
        prenom: '',
        telephone: '',
        email: '',
        specialite: '',
        type_contrat: 'PERMANENT',
        statut: 'ACTIF',
        sexe: 'M',
        diplome_plus_eleve: '',
        mot_de_passe: '',
        confirm_mot_de_passe: '',
        // Nouveaux champs Contrat et RH
        salaire_base: 0,
        taux_horaire: 0,
        prime_mensuelle: 0,
        heures_hebdo: 0,
        rib: '',
        mode_paiement_salaire: 'ESPECES',
        date_naissance: '',
        lieu_naissance: '',
        adresse: '',
        numero_cni: '',
        date_embauche: '',
    });

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
        if (e.target.name === 'confirm_mot_de_passe' || e.target.name === 'mot_de_passe') {
            setPwdError('');
        }
    };

    const generatePassword = () => {
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
        let pwd = '';
        for (let i = 0; i < 8; i++) pwd += chars.charAt(Math.floor(Math.random() * chars.length));
        setFormData({ ...formData, mot_de_passe: pwd, confirm_mot_de_passe: pwd });
        setShowPwd(true);
        setPwdError('');
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);
        setPwdError('');

        // Validate passwords match
        if (formData.mot_de_passe && formData.mot_de_passe !== formData.confirm_mot_de_passe) {
            setPwdError('Les mots de passe ne correspondent pas');
            setLoading(false);
            return;
        }

        try {
            const { confirm_mot_de_passe, ...rest } = formData;
            const payload = {
                ...rest,
                etablissement_id: etablissementId,
                mot_de_passe: rest.mot_de_passe || null,
                diplome_plus_eleve: rest.diplome_plus_eleve || null,
                date_naissance: rest.date_naissance || null,
                date_embauche: rest.date_embauche || null,
                salaire_base: Number(rest.salaire_base) || 0,
                taux_horaire: Number(rest.taux_horaire) || 0,
                prime_mensuelle: Number(rest.prime_mensuelle) || 0,
                heures_hebdo: Number(rest.heures_hebdo) || 0,
            };

            const res = await api.post('/api/enseignants', payload);
            
            setCreatedInfo({
                nom: formData.nom,
                prenom: formData.prenom,
                matricule: res.data.matricule,
                telephone: formData.telephone,
                mot_de_passe: formData.mot_de_passe || 'Non défini',
                enseignant_id: res.data.enseignant_id,
                role: 'Enseignant'
            });
            setSuccess(true);
        } catch (err: any) {
            console.error('Submit Error:', err);
            const errDetail = err.response?.data?.detail;
            const errMsg = errDetail 
                ? (typeof errDetail === 'string' ? errDetail : JSON.stringify(errDetail))
                : err.message || "Erreur inconnue";
            setError(`Erreur d'enregistrement: ${errMsg}`);
        } finally {
            setLoading(false);
        }
    };

    const copyCredentials = () => {
        if (!createdInfo) return;
        const text = `--- Identifiants Portail Enseignant ---\nNom: ${createdInfo.prenom} ${createdInfo.nom}\nMatricule: ${createdInfo.matricule}\nTéléphone: ${createdInfo.telephone}\nMot de passe: ${createdInfo.mot_de_passe}\n--- SMARTSCHOOL ---`;
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const inputStyle = {
        padding: '12px 16px', borderRadius: '10px',
        border: '1px solid var(--border-focus)', outline: 'none',
        background: 'var(--bg-body)', fontSize: '14px',
        fontFamily: 'Inter, sans-serif',
        width: '100%', boxSizing: 'border-box' as const,
    };

    const labelStyle = {
        fontSize: '13px', fontWeight: 600,
        color: 'var(--text-secondary)', display: 'block' as const,
        marginBottom: '6px',
    };

    /* ═══ SUCCESS SCREEN ═══ */
    if (success && createdInfo) {
        return (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '70vh', gap: '16px' }}>
                <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 200, damping: 20 }}>
                    <CheckCircle2 size={64} color="var(--success)" />
                </motion.div>
                <h2 style={{ fontSize: '24px', fontWeight: 700, textAlign: 'center' }}>Enseignant créé avec succès !</h2>
                <p style={{ color: 'var(--text-secondary)', textAlign: 'center', maxWidth: '500px' }}>
                    L&apos;enseignant <strong>{createdInfo.prenom} {createdInfo.nom}</strong> a été enregistré avec le matricule <strong>{createdInfo.matricule}</strong>.
                </p>

                <div style={{ display: 'flex', gap: '40px', alignItems: 'flex-start', marginTop: '20px' }}>
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        {/* Credentials Card */}
                {createdInfo.mot_de_passe !== 'Non défini' && (
                    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
                        style={{ background: 'linear-gradient(135deg, #fffbeb, #fef3c7)', border: '1px solid #fbbf24', borderRadius: '16px', padding: '24px 28px', maxWidth: '420px', width: '100%', marginTop: '8px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
                            <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'linear-gradient(135deg, #f59e0b, #d97706)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <Shield size={18} color="white" />
                            </div>
                            <div>
                                <p style={{ margin: 0, fontSize: '14px', fontWeight: 700, color: '#92400e' }}>Identifiants Portail Enseignant</p>
                                <p style={{ margin: 0, fontSize: '11px', color: '#b45309' }}>À communiquer à l&apos;enseignant</p>
                            </div>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', background: 'rgba(255,255,255,0.6)', borderRadius: '8px' }}>
                                <span style={{ fontSize: '12px', color: '#92400e', display: 'inline-flex', alignItems: 'center', gap: '4px' }}><Smartphone size={12} /> Téléphone</span>
                                <span style={{ fontSize: '13px', fontWeight: 700, color: '#78350f', fontFamily: 'monospace' }}>{createdInfo.telephone}</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', background: 'rgba(255,255,255,0.6)', borderRadius: '8px' }}>
                                <span style={{ fontSize: '12px', color: '#92400e', display: 'inline-flex', alignItems: 'center', gap: '4px' }}><Lock size={12} /> Mot de passe</span>
                                <span style={{ fontSize: '13px', fontWeight: 700, color: '#78350f', fontFamily: 'monospace' }}>{createdInfo.mot_de_passe}</span>
                            </div>
                        </div>
                        <button onClick={copyCredentials}
                            style={{ width: '100%', padding: '10px', marginTop: '14px', borderRadius: '10px', border: '1px solid #d97706', background: copied ? '#d97706' : 'transparent', color: copied ? 'white' : '#92400e', fontWeight: 700, fontSize: '12px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', transition: 'all 0.2s' }}>
                            {copied ? <><Check size={14} /> Copié !</> : <><Copy size={14} /> Copier les identifiants</>}
                        </button>
                    </motion.div>
                )}

                        <div style={{ display: 'flex', gap: '12px', marginTop: '16px' }}>
                            <Link href="/enseignants" style={{ padding: '12px 24px', borderRadius: '10px', border: '1px solid var(--border-light)', background: 'white', fontWeight: 600, color: 'var(--text-secondary)', textDecoration: 'none', fontSize: '13px' }}>
                                Retour à l'annuaire
                            </Link>
                            <button onClick={() => { setSuccess(false); setCreatedInfo(null); setFormData({ nom: '', prenom: '', telephone: '', email: '', specialite: '', type_contrat: 'PERMANENT', statut: 'ACTIF', sexe: 'M', diplome_plus_eleve: '', mot_de_passe: '', confirm_mot_de_passe: '', salaire_base: 0, taux_horaire: 0, prime_mensuelle: 0, heures_hebdo: 0, rib: '', mode_paiement_salaire: 'ESPECES', date_naissance: '', lieu_naissance: '', adresse: '', numero_cni: '', date_embauche: '' }); }}
                                style={{ padding: '12px 24px', borderRadius: '10px', border: 'none', background: 'var(--brand-primary)', color: 'white', fontWeight: 600, cursor: 'pointer', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <UserPlus size={16} /> Nouveau recrutement
                            </button>
                        </div>
                    </div>

                    <div style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
                        <BadgeCarte agent={{
                            nom: createdInfo.nom,
                            prenom: createdInfo.prenom,
                            matricule: createdInfo.matricule,
                            role: createdInfo.role,
                            photo_url: null // Pas de photo à la création selon vos directives
                        }} />
                    </div>
                </div>
            </div>
        );
    }

    /* ═══ FORM ═══ */
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', maxWidth: '800px', margin: '0 auto' }}>

            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                <Link href="/enseignants" style={{ padding: '8px', borderRadius: '8px', background: 'var(--bg-surface)', border: '1px solid var(--border-light)', color: 'var(--text-secondary)' }}>
                    <ArrowLeft size={20} />
                </Link>
                <div>
                    <h1 style={{ fontSize: '24px', fontWeight: 800, color: 'var(--text-primary)' }}>Nouveau Recrutement</h1>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>Renseignez les informations du nouvel enseignant et son accès au portail.</p>
                </div>
            </div>

            {error && (
                <div style={{ padding: '16px', background: '#fee2e2', color: '#b91c1c', borderRadius: '12px', fontSize: '14px', fontWeight: 500 }}>
                    {error}
                </div>
            )}

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

                {/* ═══ Section 1: Informations personnelles ═══ */}
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="card" style={{ overflow: 'visible' }}>
                    <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border-light)', display: 'flex', alignItems: 'center', gap: '12px', background: '#f8fafc' }}>
                        <div style={{ padding: '8px', background: 'var(--brand-primary)', color: 'white', borderRadius: '8px' }}>
                            <UserPlus size={18} />
                        </div>
                        <div>
                            <h2 style={{ fontSize: '15px', fontWeight: 700, margin: 0 }}>Informations personnelles</h2>
                            <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: 0 }}>Identité et contact de l&apos;enseignant</p>
                        </div>
                    </div>

                    <div style={{ padding: '24px' }}>
                        <div className="form-grid-2">

                            <div>
                                <label style={labelStyle}>Nom de famille *</label>
                                <input type="text" name="nom" value={formData.nom} onChange={handleChange} required placeholder="Ex: CAMARA" style={inputStyle} />
                            </div>
                            <div>
                                <label style={labelStyle}>Prénom(s) *</label>
                                <input type="text" name="prenom" value={formData.prenom} onChange={handleChange} required placeholder="Ex: Fodé" style={inputStyle} />
                            </div>
                            <div>
                                <label style={labelStyle}>Sexe *</label>
                                <select name="sexe" value={formData.sexe} onChange={handleChange} style={{ ...inputStyle, cursor: 'pointer' }}>
                                    <option value="M">Masculin</option>
                                    <option value="F">Féminin</option>
                                </select>
                            </div>
                            <div>
                                <label style={labelStyle}>Téléphone *</label>
                                <input type="tel" name="telephone" value={formData.telephone} onChange={handleChange} required placeholder="Ex: 622 00 00 00" style={inputStyle} />
                            </div>
                            <div style={{ gridColumn: '1 / -1' }}>
                                <label style={labelStyle}>Email (optionnel)</label>
                                <input type="email" name="email" value={formData.email} onChange={handleChange} placeholder="Ex: contact@ecole.com" style={inputStyle} />
                            </div>
                            <div>
                                <label style={labelStyle}>Date de naissance</label>
                                <input type="date" name="date_naissance" value={formData.date_naissance} onChange={handleChange} style={inputStyle} />
                            </div>
                            <div>
                                <label style={labelStyle}>Lieu de naissance</label>
                                <input type="text" name="lieu_naissance" value={formData.lieu_naissance} onChange={handleChange} placeholder="Lieu de naissance" style={inputStyle} />
                            </div>
                            <div>
                                <label style={labelStyle}>Numéro CNI / Passeport</label>
                                <input type="text" name="numero_cni" value={formData.numero_cni} onChange={handleChange} placeholder="N° Pièce d'identité" style={inputStyle} />
                            </div>
                            <div style={{ gridColumn: '1 / -1' }}>
                                <label style={labelStyle}>Adresse de résidence</label>
                                <input type="text" name="adresse" value={formData.adresse} onChange={handleChange} placeholder="Quartier, Rue, etc." style={inputStyle} />
                            </div>
                        </div>
                    </div>
                </motion.div>

                {/* ═══ Section 2: Informations professionnelles ═══ */}
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="card" style={{ overflow: 'visible' }}>
                    <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border-light)', display: 'flex', alignItems: 'center', gap: '12px', background: '#f8fafc' }}>
                        <div style={{ padding: '8px', background: '#10b981', color: 'white', borderRadius: '8px' }}>
                            <Briefcase size={18} />
                        </div>
                        <div>
                            <h2 style={{ fontSize: '15px', fontWeight: 700, margin: 0 }}>Informations professionnelles</h2>
                            <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: 0 }}>Compétences et type de contrat</p>
                        </div>
                    </div>

                    <div style={{ padding: '24px' }}>
                        <div className="form-grid-2">
                            <div>
                                <label style={labelStyle}>Spécialité *</label>
                                <input type="text" name="specialite" value={formData.specialite} onChange={handleChange} required placeholder="Ex: Mathématiques" style={inputStyle} />
                            </div>
                            <div>
                                <label style={labelStyle}>Diplôme le plus élevé</label>
                                <input type="text" name="diplome_plus_eleve" value={formData.diplome_plus_eleve} onChange={handleChange} placeholder="Ex: Master en Sciences" style={inputStyle} />
                            </div>
                            <div>
                                <label style={labelStyle}>Type de contrat *</label>
                                <select name="type_contrat" value={formData.type_contrat} onChange={handleChange} style={{ ...inputStyle, cursor: 'pointer' }}>
                                    <option value="PERMANENT">PERMANENT</option>
                                    <option value="CONTRACTUEL">CONTRACTUEL</option>
                                    <option value="VACATAIRE">VACATAIRE</option>
                                    <option value="STAGE">STAGE</option>
                                </select>
                            </div>
                            <div>
                                <label style={labelStyle}>Statut</label>
                                <select name="statut" value={formData.statut} onChange={handleChange} style={{ ...inputStyle, cursor: 'pointer' }}>
                                    <option value="ACTIF">ACTIF</option>
                                    <option value="INACTIF">INACTIF</option>
                                    <option value="SUSPENDU">SUSPENDU</option>
                                </select>
                            </div>
                        </div>
                    </div>
                </motion.div>

                {/* ═══ Section : Informations de Contrat et Rémunération ═══ */}
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="card" style={{ overflow: 'visible' }}>
                    <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border-light)', display: 'flex', alignItems: 'center', gap: '12px', background: '#f8fafc' }}>
                        <div style={{ padding: '8px', background: '#3b82f6', color: 'white', borderRadius: '8px' }}>
                            <FileText size={18} />
                        </div>
                        <div>
                            <h2 style={{ fontSize: '15px', fontWeight: 700, margin: 0 }}>Contrat & Rémunération</h2>
                            <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: 0 }}>Détails du salaire, primes et paiement</p>
                        </div>
                    </div>

                    <div style={{ padding: '24px' }}>
                        <div className="form-grid-2">
                            <div>
                                <label style={labelStyle}>Salaire Mensuel de Base (GNF)</label>
                                <input type="number" name="salaire_base" value={formData.salaire_base} onChange={handleChange} placeholder="0" style={inputStyle} />
                            </div>
                            <div>
                                <label style={labelStyle}>Taux Horaire (GNF/heure)</label>
                                <input type="number" name="taux_horaire" value={formData.taux_horaire} onChange={handleChange} placeholder="0" style={inputStyle} />
                            </div>
                            <div>
                                <label style={labelStyle}>Prime Mensuelle Fixe (GNF)</label>
                                <input type="number" name="prime_mensuelle" value={formData.prime_mensuelle} onChange={handleChange} placeholder="0" style={inputStyle} />
                            </div>
                            <div>
                                <label style={labelStyle}>Volume Horaire Hebdomadaire Prévu</label>
                                <input type="number" name="heures_hebdo" value={formData.heures_hebdo} onChange={handleChange} placeholder="Ex: 18" style={inputStyle} />
                            </div>
                            <div>
                                <label style={labelStyle}>Mode de Paiement Préféré</label>
                                <select name="mode_paiement_salaire" value={formData.mode_paiement_salaire} onChange={handleChange} style={{ ...inputStyle, cursor: 'pointer' }}>
                                    <option value="ESPECES">Espèces</option>
                                    <option value="VIREMENT">Virement Bancaire</option>
                                    <option value="MOBILE_MONEY">Mobile Money (Orange/MTN)</option>
                                    <option value="CHEQUE">Chèque</option>
                                </select>
                            </div>
                            <div>
                                <label style={labelStyle}>Numéro de Compte (RIB) / Numéro Mobile</label>
                                <input type="text" name="rib" value={formData.rib} onChange={handleChange} placeholder="IBAN ou N° Mobile" style={inputStyle} />
                            </div>
                        </div>
                    </div>
                </motion.div>

                {/* ═══ Section 3: Accès Portail Enseignant ═══ */}
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="card" style={{ overflow: 'visible' }}>
                    <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border-light)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'linear-gradient(135deg, #fffbeb, #fef3c7)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <div style={{ padding: '8px', background: 'linear-gradient(135deg, #f59e0b, #d97706)', color: 'white', borderRadius: '8px' }}>
                                <Shield size={18} />
                            </div>
                            <div>
                                <h2 style={{ fontSize: '15px', fontWeight: 700, margin: 0, color: '#92400e' }}>Accès Portail Enseignant</h2>
                                <p style={{ fontSize: '12px', color: '#b45309', margin: 0 }}>Créez les identifiants pour l&apos;accès au portail</p>
                            </div>
                        </div>
                        <button type="button" onClick={generatePassword}
                            style={{ padding: '8px 14px', borderRadius: '8px', border: '1px solid #d97706', background: 'rgba(245,158,11,0.1)', color: '#92400e', fontWeight: 600, fontSize: '12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <RefreshCw size={14} /> Générer un mot de passe
                        </button>
                    </div>

                    <div style={{ padding: '24px' }}>
                        <div style={{ padding: '14px 16px', background: '#eff6ff', borderRadius: '10px', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '10px', border: '1px solid #bfdbfe' }}>
                            <Lightbulb size={16} />
                            <p style={{ margin: 0, fontSize: '12px', color: '#1e40af', lineHeight: 1.5 }}>
                                L&apos;enseignant utilisera son <strong>numéro de téléphone</strong> et ce <strong>mot de passe</strong> pour se connecter au Portail Enseignant.
                                Si vous ne définissez pas de mot de passe, l&apos;accès au portail sera désactivé.
                            </p>
                        </div>

                        <div className="form-grid-2">
                            <div>
                                <label style={{ ...labelStyle, display: 'inline-flex', alignItems: 'center', gap: '4px' }}><Lock size={14} /> Mot de passe</label>
                                <div style={{ position: 'relative' }}>
                                    <Lock size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                                    <input
                                        type={showPwd ? 'text' : 'password'}
                                        name="mot_de_passe"
                                        value={formData.mot_de_passe}
                                        onChange={handleChange}
                                        placeholder="Mot de passe portail"
                                        style={{ ...inputStyle, paddingLeft: '38px', paddingRight: '38px', borderColor: pwdError ? '#ef4444' : undefined }}
                                    />
                                    <button type="button" onClick={() => setShowPwd(!showPwd)}
                                        style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: '4px' }}>
                                        {showPwd ? <EyeOff size={16} /> : <Eye size={16} />}
                                    </button>
                                </div>
                            </div>
                            <div>
                                <label style={{ ...labelStyle, display: 'inline-flex', alignItems: 'center', gap: '4px' }}><Lock size={14} /> Confirmer le mot de passe</label>
                                <div style={{ position: 'relative' }}>
                                    <Lock size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                                    <input
                                        type={showConfPwd ? 'text' : 'password'}
                                        name="confirm_mot_de_passe"
                                        value={formData.confirm_mot_de_passe}
                                        onChange={handleChange}
                                        placeholder="Confirmer le mot de passe"
                                        style={{ ...inputStyle, paddingLeft: '38px', paddingRight: '38px', borderColor: pwdError ? '#ef4444' : undefined }}
                                    />
                                    <button type="button" onClick={() => setShowConfPwd(!showConfPwd)}
                                        style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: '4px' }}>
                                        {showConfPwd ? <EyeOff size={16} /> : <Eye size={16} />}
                                    </button>
                                </div>
                            </div>
                        </div>
                        {pwdError && (
                            <p style={{ margin: '8px 0 0', fontSize: '12px', color: '#ef4444', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '4px' }}><AlertTriangle size={14} /> {pwdError}</p>
                        )}
                        {formData.mot_de_passe && formData.confirm_mot_de_passe && formData.mot_de_passe === formData.confirm_mot_de_passe && (
                            <p style={{ margin: '8px 0 0', fontSize: '12px', color: '#10b981', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <CheckCircle2 size={14} /> Mots de passe identiques ✓
                            </p>
                        )}
                    </div>
                </motion.div>

                {/* ═══ Submit Buttons ═══ */}
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '8px' }}>
                    <Link href="/enseignants" style={{ padding: '12px 24px', borderRadius: '10px', border: '1px solid var(--border-light)', background: 'var(--bg-surface)', fontWeight: 600, color: 'var(--text-secondary)', cursor: 'pointer', textDecoration: 'none', fontSize: '14px' }}>
                        Annuler
                    </Link>
                    <button
                        type="submit"
                        disabled={loading}
                        style={{ padding: '12px 28px', borderRadius: '10px', background: 'var(--brand-primary)', color: 'white', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px', cursor: loading ? 'not-allowed' : 'pointer', border: 'none', boxShadow: '0 4px 14px rgba(232, 134, 28, 0.4)', fontSize: '14px', transition: 'transform 0.15s' }}
                        onMouseOver={e => e.currentTarget.style.transform = 'translateY(-1px)'}
                        onMouseOut={e => e.currentTarget.style.transform = 'translateY(0)'}
                    >
                        {loading ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
                        Enregistrer l&apos;enseignant
                    </button>
                </div>
            </form>
        </div>
    );
}
