'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { ArrowLeft, Save, Edit, CheckCircle2, Loader2 } from 'lucide-react';
import api from '@/lib/api';
import Link from 'next/link';

export default function ModifierEnseignant() {
    const router = useRouter();
    const { id } = useParams();
    const [loading, setLoading] = useState(false);
    const [success, setSuccess] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [fetching, setFetching] = useState(true);

    const [formData, setFormData] = useState({
        nom: '',
        prenom: '',
        telephone: '',
        email: '',
        specialite: '',
        type_contrat: 'PERMANENT',
        statut: 'ACTIF',
        sexe: 'M',
        salaire_base: 0,
        taux_horaire: 0,
        prime_mensuelle: 0,
        heures_hebdo: 0,
        rib: '',
        mode_paiement_salaire: 'ESPECES',
        date_naissance: '',
        lieu_naissance: '',
        adresse: '',
        numero_cni: ''
    });

    useEffect(() => {
        if (!id) return;
        const fetchEnseignant = async () => {
            try {
                const res = await api.get(`/api/enseignants/${id}`);
                const e = res.data;
                setFormData({
                    nom: e.nom || '',
                    prenom: e.prenom || '',
                    sexe: e.sexe || 'M',
                    telephone: e.telephone || '',
                    email: e.email || '',
                    specialite: e.specialite || '',
                    type_contrat: e.type_contrat || 'PERMANENT',
                    statut: e.statut || 'ACTIF',
                    salaire_base: e.salaire_base || 0,
                    taux_horaire: e.taux_horaire || 0,
                    prime_mensuelle: e.prime_mensuelle || 0,
                    heures_hebdo: e.heures_hebdo || 0,
                    rib: e.rib || '',
                    mode_paiement_salaire: e.mode_paiement_salaire || 'ESPECES',
                    date_naissance: e.date_naissance ? String(e.date_naissance).split('T')[0] : '',
                    lieu_naissance: e.lieu_naissance || '',
                    adresse: e.adresse || '',
                    numero_cni: e.numero_cni || ''
                });
            } catch (err) {
                console.error(err);
                setError("Impossible de charger les informations de l'enseignant.");
            } finally {
                setFetching(false);
            }
        };
        fetchEnseignant();
    }, [id]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);
        try {
            await api.put(`/api/enseignants/${id}`, formData);
            setSuccess(true);
            setTimeout(() => {
                router.push('/enseignants');
            }, 2000);
        } catch (err: any) {
            console.error(err);
            setError(err.response?.data?.detail || "Une erreur s'est produite lors de la modification.");
        } finally {
            setLoading(false);
        }
    };

    if (success) {
        return (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60vh', gap: '16px' }}>
                <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: "spring", stiffness: 200, damping: 20 }}
                >
                    <CheckCircle2 size={64} color="var(--success)" />
                </motion.div>
                <h2 style={{ fontSize: '24px', fontWeight: 700 }}>Modifications enregistrées !</h2>
                <p style={{ color: 'var(--text-secondary)' }}>Redirection vers l'annuaire...</p>
            </div>
        );
    }

    if (fetching) {
        return (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh' }}>
                <Loader2 size={40} className="animate-spin" color="var(--brand-primary)" />
            </div>
        );
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '32px', maxWidth: '800px', margin: '0 auto' }}>

            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                <Link href="/enseignants" style={{ padding: '8px', borderRadius: '8px', background: 'var(--bg-surface)', border: '1px solid var(--border-light)', color: 'var(--text-secondary)' }}>
                    <ArrowLeft size={20} />
                </Link>
                <div>
                    <h1 style={{ fontSize: '24px', fontWeight: 800, color: 'var(--text-primary)' }}>Modifier l'enseignant</h1>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>Mettez à jour les informations du professeur sélectionné.</p>
                </div>
            </div>

            {/* Form Wrap */}
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="card"
                    style={{ overflow: 'visible' }}
                >
                    <div style={{ padding: '24px', borderBottom: '1px solid var(--border-light)', display: 'flex', alignItems: 'center', gap: '12px', background: '#f8fafc' }}>
                        <div style={{ padding: '8px', background: 'var(--brand-primary)', color: 'white', borderRadius: '8px' }}>
                            <Edit size={20} />
                        </div>
                        <h2 style={{ fontSize: '16px', fontWeight: 700 }}>Mise à jour professionnelle</h2>
                    </div>

                    <div style={{ padding: '32px' }}>
                        {error && (
                            <div style={{ padding: '16px', background: '#fee2e2', color: '#b91c1c', borderRadius: '8px', marginBottom: '24px', fontSize: '14px', fontWeight: 500 }}>
                                {error}
                            </div>
                        )}

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)' }}>Nom de famille *</label>
                                <input
                                    type="text"
                                    name="nom"
                                    value={formData.nom}
                                    onChange={handleChange}
                                    required
                                    style={{ padding: '12px 16px', borderRadius: '8px', border: '1px solid var(--border-focus)', outline: 'none', background: 'var(--bg-body)', fontSize: '14px' }}
                                />
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)' }}>Prénom(s) *</label>
                                <input
                                    type="text"
                                    name="prenom"
                                    value={formData.prenom}
                                    onChange={handleChange}
                                    required
                                    style={{ padding: '12px 16px', borderRadius: '8px', border: '1px solid var(--border-focus)', outline: 'none', background: 'var(--bg-body)', fontSize: '14px' }}
                                />
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)' }}>Sexe *</label>
                                <select
                                    name="sexe"
                                    value={formData.sexe}
                                    onChange={handleChange}
                                    style={{ padding: '12px 16px', borderRadius: '8px', border: '1px solid var(--border-focus)', outline: 'none', background: 'var(--bg-body)', fontSize: '14px', cursor: 'pointer' }}
                                >
                                    <option value="M">Masculin</option>
                                    <option value="F">Féminin</option>
                                </select>
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)' }}>Spécialité *</label>
                                <input
                                    type="text"
                                    name="specialite"
                                    value={formData.specialite}
                                    onChange={handleChange}
                                    required
                                    style={{ padding: '12px 16px', borderRadius: '8px', border: '1px solid var(--border-focus)', outline: 'none', background: 'var(--bg-body)', fontSize: '14px' }}
                                />
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)' }}>Type de contrat *</label>
                                <select
                                    name="type_contrat"
                                    value={formData.type_contrat}
                                    onChange={handleChange}
                                    style={{ padding: '12px 16px', borderRadius: '8px', border: '1px solid var(--border-focus)', outline: 'none', background: 'var(--bg-body)', fontSize: '14px', cursor: 'pointer' }}
                                >
                                    <option value="PERMANENT">PERMANENT</option>
                                    <option value="CONTRACTUEL">CONTRACTUEL</option>
                                    <option value="VACATAIRE">VACATAIRE</option>
                                    <option value="STAGE">STAGE</option>
                                </select>
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)' }}>Téléphone *</label>
                                <input
                                    type="tel"
                                    name="telephone"
                                    value={formData.telephone}
                                    onChange={handleChange}
                                    required
                                    style={{ padding: '12px 16px', borderRadius: '8px', border: '1px solid var(--border-focus)', outline: 'none', background: 'var(--bg-body)', fontSize: '14px' }}
                                />
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)' }}>Email (optionnel)</label>
                                <input
                                    type="email"
                                    name="email"
                                    value={formData.email}
                                    onChange={handleChange}
                                    style={{ padding: '12px 16px', borderRadius: '8px', border: '1px solid var(--border-focus)', outline: 'none', background: 'var(--bg-body)', fontSize: '14px' }}
                                />
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)' }}>Date de naissance</label>
                                <input type="date" name="date_naissance" value={formData.date_naissance} onChange={handleChange} style={{ padding: '12px 16px', borderRadius: '8px', border: '1px solid var(--border-focus)', outline: 'none', background: 'var(--bg-body)', fontSize: '14px' }} />
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)' }}>Lieu de naissance</label>
                                <input type="text" name="lieu_naissance" value={formData.lieu_naissance} onChange={handleChange} placeholder="Lieu de naissance" style={{ padding: '12px 16px', borderRadius: '8px', border: '1px solid var(--border-focus)', outline: 'none', background: 'var(--bg-body)', fontSize: '14px' }} />
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)' }}>Numéro CNI / Passeport</label>
                                <input type="text" name="numero_cni" value={formData.numero_cni} onChange={handleChange} placeholder="N° Pièce d'identité" style={{ padding: '12px 16px', borderRadius: '8px', border: '1px solid var(--border-focus)', outline: 'none', background: 'var(--bg-body)', fontSize: '14px' }} />
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', gridColumn: '1 / -1' }}>
                                <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)' }}>Adresse de résidence</label>
                                <input type="text" name="adresse" value={formData.adresse} onChange={handleChange} placeholder="Quartier, Rue, etc." style={{ padding: '12px 16px', borderRadius: '8px', border: '1px solid var(--border-focus)', outline: 'none', background: 'var(--bg-body)', fontSize: '14px' }} />
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)' }}>Statut *</label>
                                <select
                                    name="statut"
                                    value={formData.statut}
                                    onChange={handleChange}
                                    style={{ padding: '12px 16px', borderRadius: '8px', border: '1px solid var(--border-focus)', outline: 'none', background: 'var(--bg-body)', fontSize: '14px', cursor: 'pointer' }}
                                >
                                    <option value="ACTIF">ACTIF</option>
                                    <option value="INACTIF">INACTIF</option>
                                    <option value="CONGE">CONGE</option>
                                    <option value="SUSPENDU">SUSPENDU</option>
                                </select>
                            </div>

                        </div>
                    </div>
                </motion.div>

                {/* Section : Informations de Contrat et Rémunération */}
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="card" style={{ overflow: 'visible' }}>
                    <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border-light)', display: 'flex', alignItems: 'center', gap: '12px', background: '#f8fafc' }}>
                        <div style={{ padding: '8px', background: '#3b82f6', color: 'white', borderRadius: '8px' }}>
                            <span style={{ fontSize: '18px' }}>📄</span>
                        </div>
                        <div>
                            <h2 style={{ fontSize: '15px', fontWeight: 700, margin: 0 }}>Contrat & Rémunération</h2>
                            <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: 0 }}>Détails du salaire, primes et paiement</p>
                        </div>
                    </div>

                    <div style={{ padding: '32px' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)' }}>Salaire Mensuel de Base (GNF)</label>
                                <input type="number" name="salaire_base" value={formData.salaire_base} onChange={handleChange} placeholder="0" style={{ padding: '12px 16px', borderRadius: '8px', border: '1px solid var(--border-focus)', outline: 'none', background: 'var(--bg-body)', fontSize: '14px' }} />
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)' }}>Taux Horaire (GNF/heure)</label>
                                <input type="number" name="taux_horaire" value={formData.taux_horaire} onChange={handleChange} placeholder="0" style={{ padding: '12px 16px', borderRadius: '8px', border: '1px solid var(--border-focus)', outline: 'none', background: 'var(--bg-body)', fontSize: '14px' }} />
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)' }}>Prime Mensuelle Fixe (GNF)</label>
                                <input type="number" name="prime_mensuelle" value={formData.prime_mensuelle} onChange={handleChange} placeholder="0" style={{ padding: '12px 16px', borderRadius: '8px', border: '1px solid var(--border-focus)', outline: 'none', background: 'var(--bg-body)', fontSize: '14px' }} />
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)' }}>Volume Horaire Hebdomadaire Prévu</label>
                                <input type="number" name="heures_hebdo" value={formData.heures_hebdo} onChange={handleChange} placeholder="Ex: 18" style={{ padding: '12px 16px', borderRadius: '8px', border: '1px solid var(--border-focus)', outline: 'none', background: 'var(--bg-body)', fontSize: '14px' }} />
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)' }}>Mode de Paiement Préféré</label>
                                <select name="mode_paiement_salaire" value={formData.mode_paiement_salaire} onChange={handleChange} style={{ padding: '12px 16px', borderRadius: '8px', border: '1px solid var(--border-focus)', outline: 'none', background: 'var(--bg-body)', fontSize: '14px', cursor: 'pointer' }}>
                                    <option value="ESPECES">Espèces</option>
                                    <option value="VIREMENT">Virement Bancaire</option>
                                    <option value="MOBILE_MONEY">Mobile Money (Orange/MTN)</option>
                                    <option value="CHEQUE">Chèque</option>
                                </select>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)' }}>Numéro de Compte (RIB) / Numéro Mobile</label>
                                <input type="text" name="rib" value={formData.rib} onChange={handleChange} placeholder="IBAN ou N° Mobile" style={{ padding: '12px 16px', borderRadius: '8px', border: '1px solid var(--border-focus)', outline: 'none', background: 'var(--bg-body)', fontSize: '14px' }} />
                            </div>
                        </div>

                        <div style={{ borderTop: '1px solid var(--border-light)', marginTop: '16px', paddingTop: '24px', display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                            <Link href="/enseignants" style={{ padding: '12px 24px', borderRadius: '8px', border: '1px solid var(--border-light)', background: 'var(--bg-surface)', fontWeight: 600, color: 'var(--text-secondary)', cursor: 'pointer', textDecoration: 'none' }}>
                                Annuler
                            </Link>
                            <button
                                type="submit"
                                disabled={loading}
                                style={{ padding: '12px 24px', borderRadius: '8px', background: 'var(--brand-primary)', color: 'white', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px', cursor: loading ? 'not-allowed' : 'pointer', border: 'none', boxShadow: '0 4px 14px rgba(232, 134, 28, 0.4)' }}
                            >
                                {loading ? <Loader2 size={20} className="animate-spin" /> : <Save size={20} />}
                                Mettre à jour
                            </button>
                        </div>
                    </div>
                </motion.div>
            </form>
        </div>
    );
}
