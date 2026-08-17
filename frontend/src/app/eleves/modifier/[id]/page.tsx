'use client';

import { useApp } from '@/context/AppContext';
import { useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter, useParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { ArrowLeft, Save, Edit, CheckCircle2, Loader2, BookOpen } from 'lucide-react';
import api from '@/lib/api';
import Link from 'next/link';

interface Classe {
    classe_id: number;
    libelle: string;
    code: string;
}

export default function ModifierEleve() {
    const router = useRouter();
    const { id } = useParams();
    const queryClient = useQueryClient();
    const { etablissementId, anneeId } = useApp();
    const [loading, setLoading] = useState(false);
    const [success, setSuccess] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [fetching, setFetching] = useState(true);
    const [classes, setClasses] = useState<Classe[]>([]);

    const [formData, setFormData] = useState({
        nom: '',
        prenom: '',
        date_naissance: '',
        sexe: 'M',
        lieu_naissance: '',
        telephone: '',
        email: '',
        statut: 'ACTIF',
        classe_id: '',
        adresse: '',
        groupe_sanguin: '',
        mot_de_passe: ''
    });

    useEffect(() => {
        if (!id) return;
        const fetchEleve = async () => {
            try {
                const [eleveRes, classesRes] = await Promise.all([
                    api.get(`/api/eleves/${id}`),
                    api.get(`/api/classes?etablissement_id=${etablissementId}&annee_id=${anneeId}`)
                ]);
                const e = eleveRes.data;
                setClasses(classesRes.data);

                setFormData({
                    nom: e.nom || '',
                    prenom: e.prenom || '',
                    date_naissance: e.date_naissance ? e.date_naissance.split('T')[0] : '', // format YYYY-MM-DD
                    sexe: e.sexe || 'M',
                    lieu_naissance: e.lieu_naissance || '',
                    telephone: e.telephone || '',
                    email: e.email || '',
                    statut: e.statut || 'ACTIF',
                    classe_id: e.classe_id || '',
                    adresse: e.adresse || '',
                    groupe_sanguin: e.groupe_sanguin || '',
                    mot_de_passe: ''
                });
            } catch (err) {
                console.error(err);
                setError("Impossible de charger les informations de l'élève ou les classes.");
            } finally {
                setFetching(false);
            }
        };
        fetchEleve();
    }, [id]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);
        try {
            const payload: any = { ...formData };
            if (payload.classe_id) {
                payload.classe_id = parseInt(payload.classe_id);
            } else {
                delete payload.classe_id;
            }
            // Mot de passe : envoyé seulement s'il est renseigné — un champ vide
            // ne doit PAS effacer le mot de passe existant de l'élève.
            if (!payload.mot_de_passe || !payload.mot_de_passe.trim()) {
                delete payload.mot_de_passe;
            }

            await api.put(`/api/eleves/${id}`, payload);
            // Sans invalidation, les listes (annuaire, classes) et la fiche
            // gardaient l'ancienne version en cache : la modification ne se
            // voyait nulle part tant qu'on ne rechargeait pas la page.
            await Promise.all([
                queryClient.invalidateQueries({ queryKey: ['eleves'] }),
                queryClient.invalidateQueries({ queryKey: ['eleves-classes'] }),
                queryClient.invalidateQueries({ queryKey: ['classes'] }),
                queryClient.invalidateQueries({ queryKey: ['classes-stats'] }),
                queryClient.invalidateQueries({ queryKey: ['eleve', id] }),
            ]);
            setSuccess(true);
            setTimeout(() => {
                router.push('/eleves');
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
                <Link href="/eleves" style={{ padding: '8px', borderRadius: '8px', background: 'var(--bg-surface)', border: '1px solid var(--border-light)', color: 'var(--text-secondary)' }}>
                    <ArrowLeft size={20} />
                </Link>
                <div>
                    <h1 style={{ fontSize: '24px', fontWeight: 800, color: 'var(--text-primary)' }}>Modifier l'élève</h1>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>Mettez à jour les informations de l'élève sélectionné.</p>
                </div>
            </div>

            {/* Form Card */}
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
                    <h2 style={{ fontSize: '16px', fontWeight: 700 }}>Mise à jour d'identité</h2>
                </div>

                <div style={{ padding: '32px' }}>
                    {error && (
                        <div style={{ padding: '16px', background: '#fee2e2', color: '#b91c1c', borderRadius: '8px', marginBottom: '24px', fontSize: '14px', fontWeight: 500 }}>
                            {error}
                        </div>
                    )}

                    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                        <div className="form-grid-2" style={{ gap: '24px' }}>

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
                                <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)' }}>Date de naissance *</label>
                                <input
                                    type="date"
                                    name="date_naissance"
                                    value={formData.date_naissance}
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
                                <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <BookOpen size={14} /> Classe Actuelle
                                </label>
                                <select
                                    name="classe_id"
                                    value={formData.classe_id}
                                    onChange={handleChange}
                                    style={{ padding: '12px 16px', borderRadius: '8px', border: '1px solid var(--border-focus)', outline: 'none', background: 'var(--bg-body)', fontSize: '14px', cursor: 'pointer' }}
                                >
                                    <option value="">-- Sans classe --</option>
                                    {classes.map(c => (
                                        <option key={c.classe_id} value={c.classe_id}>{c.libelle}</option>
                                    ))}
                                </select>
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)' }}>Téléphone (optionnel)</label>
                                <input
                                    type="tel"
                                    name="telephone"
                                    value={formData.telephone}
                                    onChange={handleChange}
                                    style={{ padding: '12px 16px', borderRadius: '8px', border: '1px solid var(--border-focus)', outline: 'none', background: 'var(--bg-body)', fontSize: '14px' }}
                                />
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
                                    <option value="RENVOYE">RENVOYE</option>
                                </select>
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)' }}>Adresse</label>
                                <input
                                    type="text"
                                    name="adresse"
                                    value={formData.adresse}
                                    onChange={handleChange}
                                    placeholder="Ex: Quartier Madina, Conakry"
                                    style={{ padding: '12px 16px', borderRadius: '8px', border: '1px solid var(--border-focus)', outline: 'none', background: 'var(--bg-body)', fontSize: '14px' }}
                                />
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)' }}>Groupe Sanguin</label>
                                <select
                                    name="groupe_sanguin"
                                    value={formData.groupe_sanguin}
                                    onChange={handleChange}
                                    style={{ padding: '12px 16px', borderRadius: '8px', border: '1px solid var(--border-focus)', outline: 'none', background: 'var(--bg-body)', fontSize: '14px', cursor: 'pointer' }}
                                >
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

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)' }}>Mot de passe du portail élève</label>
                                <input
                                    type="text"
                                    name="mot_de_passe"
                                    value={formData.mot_de_passe}
                                    onChange={handleChange}
                                    placeholder="Laisser vide pour ne pas changer"
                                    autoComplete="new-password"
                                    style={{ padding: '12px 14px', borderRadius: '8px', border: '1px solid var(--border-light)', fontSize: '14px', background: 'var(--bg-surface)' }}
                                />
                                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                                    Renseignez-le pour (ré)initialiser l&apos;accès de l&apos;élève. Vide = inchangé.
                                </span>
                            </div>

                        </div>

                        <div style={{ borderTop: '1px solid var(--border-light)', marginTop: '16px', paddingTop: '24px', display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                            <Link href="/eleves" style={{ padding: '12px 24px', borderRadius: '8px', border: '1px solid var(--border-light)', background: 'var(--bg-surface)', fontWeight: 600, color: 'var(--text-secondary)', cursor: 'pointer', textDecoration: 'none' }}>
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
                    </form>
                </div>
            </motion.div>
        </div>
    );
}
