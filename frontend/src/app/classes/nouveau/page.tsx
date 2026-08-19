'use client';

import { useApp } from '@/context/AppContext';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { ArrowLeft, Save, Loader2, BookOpen, CheckCircle2, AlertTriangle } from 'lucide-react';
import api from '@/lib/api';
import Link from 'next/link';

interface NiveauOption {
    niveau_id: number;
    code: string;
    libelle: string;
}

interface CycleAvecNiveaux {
    cycle_id: number;
    code: string;
    libelle: string;
    niveaux: NiveauOption[];
}

export default function NouvelleClasse() {
    const router = useRouter();
    const { etablissementId, anneeId } = useApp();
    const [loading, setLoading] = useState(false);
    const [success, setSuccess] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Les niveaux appartiennent à l'école via leur cycle : ils DOIVENT être
    // chargés, jamais devinés. Ce formulaire envoyait `niveau_id: 1` en dur,
    // c'est-à-dire le premier niveau de la première école inscrite. Pour toute
    // autre école, la classe se retrouvait rattachée au niveau d'un
    // établissement étranger.
    const [cycles, setCycles] = useState<CycleAvecNiveaux[]>([]);
    const [chargementNiveaux, setChargementNiveaux] = useState(true);

    const [formData, setFormData] = useState({
        libelle: '',
        code: '',
        capacite_max: 50,
        niveau_id: '',
        // Le backend filtre les classes sur « ACTIVE » : envoyer « ACTIF »
        // créait une classe que la liste n'affichait jamais.
        statut: 'ACTIVE'
    });

    // Prix de la classe, saisis dès la création (scolarité + frais d'entrée).
    // Ils sont enregistrés comme tarifs de la classe juste après sa création.
    const [prix, setPrix] = useState({ scolarite: '', inscription: '', reinscription: '' });

    const [activationMat, setActivationMat] = useState(false);

    const chargerCycles = () => {
        setChargementNiveaux(true);
        api.get<CycleAvecNiveaux[]>('/api/parametrage/cycles')
            .then((res) => setCycles(res.data || []))
            .catch(() => setCycles([]))
            .finally(() => setChargementNiveaux(false));
    };
    useEffect(() => { chargerCycles(); }, [etablissementId]);

    const niveauxDisponibles = cycles.some((c) => (c.niveaux || []).length > 0);
    const maternellePresente = cycles.some((c) => c.code === 'MAT');

    const activerMaternelle = async () => {
        setActivationMat(true); setError(null);
        try {
            await api.post('/api/parametrage/cycles/activer-maternelle');
            chargerCycles();  // les 3 sections apparaissent dans le menu Niveau
        } catch {
            setError("Impossible d'activer la maternelle.");
        } finally {
            setActivationMat(false);
        }
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);
        try {
            const payload = {
                ...formData,
                capacite_max: parseInt(formData.capacite_max.toString()),
                niveau_id: parseInt(formData.niveau_id.toString()),
                etablissement_id: etablissementId,
                // L'année courante de CETTE école. `1` en dur désignait
                // l'année de la première école inscrite.
                annee_id: anneeId,
            };

            const creation = await api.post('/api/classes', payload);
            const classeId = creation.data?.classe_id;

            // Enregistrer les prix de la classe (scolarité + inscription +
            // réinscription). On s'assure d'abord que les types de frais
            // existent, puis on pose le tarif de cette classe pour chacun.
            const saisis = [
                { cat: 'scolarite', montant: parseFloat(prix.scolarite) || 0 },
                { cat: 'inscription', montant: parseFloat(prix.inscription) || 0 },
                { cat: 'reinscription', montant: parseFloat(prix.reinscription) || 0 },
            ].filter(p => p.montant > 0);

            if (classeId && saisis.length > 0) {
                try {
                    const typesRes = await api.post('/api/finance/types-frais/assurer-entree');
                    const types: { type_frais_id: number; categorie: string }[] = typesRes.data || [];
                    const trouverType = (cat: string) => {
                        const c = (s: string) => (s || '').toLowerCase();
                        if (cat === 'reinscription') return types.find(t => c(t.categorie).includes('réinscr') || c(t.categorie).includes('reinscr'));
                        if (cat === 'inscription') return types.find(t => c(t.categorie).includes('inscription') && !c(t.categorie).includes('réinscr') && !c(t.categorie).includes('reinscr'));
                        return types.find(t => c(t.categorie).startsWith('scolar'));
                    };
                    const entries = saisis
                        .map(p => ({ type: trouverType(p.cat), montant: p.montant }))
                        .filter(e => e.type)
                        .map(e => ({ type_frais_id: e.type!.type_frais_id, classe_id: classeId, montant: e.montant }));
                    if (entries.length > 0) await api.put('/api/finance/tarifs-classe', entries);
                } catch {
                    // La classe est créée ; si les tarifs échouent, on ne bloque
                    // pas — ils restent réglables dans Configurer.
                }
            }

            setSuccess(true);
            setTimeout(() => {
                router.push('/classes');
            }, 2000);
        } catch (err: any) {
            console.error(err);
            // Handling the 409 Conflict we added in the backend
            if (err.response?.status === 409) {
                setError("Cette classe ou ce code existe déjà dans la base de données. Veuillez utiliser un identifiant unique.");
            } else {
                setError(err.response?.data?.detail || "Une erreur s'est produite lors de la création.");
            }
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
                    style={{ width: '80px', height: '80px', borderRadius: '50%', background: '#10b98120', color: '#10b981', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                >
                    <CheckCircle2 size={40} />
                </motion.div>
                <h2 style={{ fontSize: '24px', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>Classe Ajoutée !</h2>
                <p style={{ color: 'var(--text-muted)' }}>La nouvelle classe a été enregistrée avec succès.</p>
                <Loader2 size={24} className="animate-spin" color="var(--brand-primary)" style={{ marginTop: '12px' }} />
            </div>
        );
    }

    return (
        <div style={{ maxWidth: '800px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '24px' }}>

            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                <Link href="/classes" style={{
                    width: '40px', height: '40px', borderRadius: '12px', background: 'white',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.05)', border: '1px solid var(--border-light)'
                }}>
                    <ArrowLeft size={20} />
                </Link>
                <div>
                    <h1 style={{ fontSize: '24px', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>Créer une Nouvelle Classe</h1>
                    <p style={{ color: 'var(--text-muted)', margin: '4px 0 0 0', fontSize: '14px' }}>Ajouter une classe à la base de données de l'établissement</p>
                </div>
            </div>

            {/* Error Message */}
            {error && (
                <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} style={{
                    padding: '16px 20px', background: '#fee2e2', borderLeft: '4px solid #ef4444', borderRadius: '8px', color: '#b91c1c', fontSize: '14px', fontWeight: 500
                }}>
                    {error}
                </motion.div>
            )}

            {!chargementNiveaux && !niveauxDisponibles && (
                <div style={{ display: 'flex', gap: '10px', padding: '16px 20px', background: '#fffbeb', borderLeft: '4px solid #f59e0b', borderRadius: '8px', color: '#78350f', fontSize: '14px' }}>
                    <AlertTriangle size={18} style={{ flexShrink: 0, marginTop: 2 }} />
                    <span>
                        Aucun niveau n&apos;est configuré pour cet établissement. Signalez-le à
                        votre administrateur : le référentiel scolaire de l&apos;école n&apos;a
                        pas été installé.
                    </span>
                </div>
            )}

            {/* Formulaire */}
            <motion.div
                initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
                style={{ background: 'white', borderRadius: '24px', padding: '32px', boxShadow: '0 10px 40px -10px rgba(0,0,0,0.05)', border: '1px solid var(--border-light)' }}
            >
                <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

                    <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)', margin: 0, paddingBottom: '12px', borderBottom: '1px solid var(--border-light)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <BookOpen size={18} color="var(--brand-primary)" />
                        Informations de la Classe
                    </h3>

                    <div className="form-grid-2">
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)' }}>Nom de la Classe (Libellé) *</label>
                            <input
                                type="text"
                                name="libelle"
                                value={formData.libelle}
                                onChange={handleChange}
                                required
                                placeholder="Ex: 10ème Année A"
                                style={{ padding: '12px 16px', borderRadius: '8px', border: '1px solid var(--border-focus)', outline: 'none', background: 'var(--bg-body)', fontSize: '14px' }}
                            />
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)' }}>Code ou Identifiant Court *</label>
                            <input
                                type="text"
                                name="code"
                                value={formData.code}
                                onChange={handleChange}
                                required
                                placeholder="Ex: 10A"
                                style={{ padding: '12px 16px', borderRadius: '8px', border: '1px solid var(--border-focus)', outline: 'none', background: 'var(--bg-body)', fontSize: '14px' }}
                            />
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)' }}>Capacité Maximale d'Élèves *</label>
                            <input
                                type="number"
                                name="capacite_max"
                                value={formData.capacite_max}
                                onChange={handleChange}
                                required
                                min="10"
                                max="150"
                                style={{ padding: '12px 16px', borderRadius: '8px', border: '1px solid var(--border-focus)', outline: 'none', background: 'var(--bg-body)', fontSize: '14px' }}
                            />
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)' }}>Niveau *</label>
                            <select
                                name="niveau_id"
                                value={formData.niveau_id}
                                onChange={handleChange}
                                required
                                disabled={chargementNiveaux || !niveauxDisponibles}
                                style={{ padding: '12px 16px', borderRadius: '8px', border: '1px solid var(--border-focus)', outline: 'none', background: 'var(--bg-body)', fontSize: '14px', cursor: 'pointer' }}
                            >
                                <option value="">
                                    {chargementNiveaux ? 'Chargement…' : 'Choisissez un niveau'}
                                </option>
                                {cycles.map((cycle) => (
                                    <optgroup key={cycle.cycle_id} label={cycle.libelle}>
                                        {(cycle.niveaux || []).map((n) => (
                                            <option key={n.niveau_id} value={n.niveau_id}>{n.libelle}</option>
                                        ))}
                                    </optgroup>
                                ))}
                            </select>
                            {!chargementNiveaux && !maternellePresente && (
                                <div style={{ fontSize: '12.5px', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                    <span>Vous ouvrez une maternelle ? Les 3 sections n&apos;apparaissent pas ici.</span>
                                    <button type="button" onClick={activerMaternelle} disabled={activationMat}
                                        style={{ padding: '6px 12px', borderRadius: '8px', border: '1px solid #a7f3d0', background: '#ecfdf5', color: '#059669', fontSize: '12.5px', fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                                        {activationMat ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />} Activer la maternelle
                                    </button>
                                </div>
                            )}
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)' }}>Statut *</label>
                            <select
                                name="statut"
                                value={formData.statut}
                                onChange={handleChange}
                                style={{ padding: '12px 16px', borderRadius: '8px', border: '1px solid var(--border-focus)', outline: 'none', background: 'var(--bg-body)', fontSize: '14px', cursor: 'pointer' }}
                            >
                                <option value="ACTIVE">Active</option>
                                <option value="INACTIVE">Inactive</option>
                            </select>
                        </div>
                    </div>

                    {/* Prix de la classe — saisis dès la création, enregistrés
                        comme tarifs de la classe. Modifiables ensuite dans Configurer. */}
                    <div style={{ marginTop: '24px', paddingTop: '20px', borderTop: '1px solid var(--border-light)' }}>
                        <h3 style={{ fontSize: '15px', fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 4px' }}>Prix de la classe</h3>
                        <p style={{ fontSize: '12.5px', color: 'var(--text-secondary)', margin: '0 0 14px' }}>
                            Scolarité de l&apos;année, plus le prix d&apos;inscription (nouvel élève) et de réinscription (élève qui continue).
                            Laissez à 0 si non concerné. Modifiable ensuite dans « Configurer ».
                        </p>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '14px' }}>
                            {([
                                { cle: 'scolarite' as const, label: 'Scolarité (année)' },
                                { cle: 'inscription' as const, label: "Prix d'inscription" },
                                { cle: 'reinscription' as const, label: 'Prix de réinscription' },
                            ]).map(f => (
                                <div key={f.cle} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)' }}>{f.label}</label>
                                    <div style={{ position: 'relative' }}>
                                        <input type="number" min="0" value={prix[f.cle]}
                                            onChange={e => setPrix(p => ({ ...p, [f.cle]: e.target.value }))}
                                            placeholder="0"
                                            style={{ padding: '12px 46px 12px 16px', borderRadius: '8px', border: '1px solid var(--border-focus)', outline: 'none', background: 'var(--bg-body)', fontSize: '14px', width: '100%', boxSizing: 'border-box' }} />
                                        <span style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600 }}>GNF</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '24px', paddingTop: '24px', borderTop: '1px solid var(--border-light)' }}>
                        <Link href="/classes" className="btn btn-outline" style={{ display: 'inline-flex' }}>
                            Annuler
                        </Link>
                        <button type="submit" className="btn btn-primary" disabled={loading || !formData.niveau_id}>
                            {loading ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
                            {loading ? 'Création...' : 'Créer la classe'}
                        </button>
                    </div>

                </form>
            </motion.div>
        </div>
    );
}
