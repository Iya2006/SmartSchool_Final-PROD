'use client';

import { useState, useEffect, useRef } from 'react';
import { useApp } from '@/context/AppContext';
import api from '@/lib/api';
import { 
    Building, Save, Upload, MapPin, Phone, Mail, User, 
    Hash, Globe, Image as ImageIcon, Loader2, CheckCircle,
    Camera
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import SettingsLayout from '@/components/SettingsLayout';
import styles from './Identite.module.css';

export default function IdentiteEtablissementPage() {
    const { etablissementId, setEtablissementNom, setEtablissementLogo, refreshEtablissement } = useApp();
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [success, setSuccess] = useState(false);
    const [etablissement, setEtablissement] = useState<any>(null);
    const [hasChanges, setHasChanges] = useState(false);

    const [formData, setFormData] = useState({
        nom: '', code: '', type_etablissement: '', 
        adresse: '', ville: '', region: '', prefecture: '',
        telephone: '', email: '', directeur: '', 
        slogan: '', capacite_max: 0
    });

    const fileInputs = {
        logo: useRef<HTMLInputElement>(null),
        favicon: useRef<HTMLInputElement>(null),
        cachet: useRef<HTMLInputElement>(null),
        signature: useRef<HTMLInputElement>(null)
    };

    const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8300';
    const getPhotoUrl = (url: string | null | undefined) => {
        if (!url) return null;
        if (url.startsWith('http')) return url;
        return `${API_BASE}${url.startsWith('/') ? '' : '/'}${url}`;
    };

    useEffect(() => {
        if (etablissementId) {
            api.get(`/api/parametrage/etablissements/${etablissementId}?_t=${Date.now()}`)
                .then(res => {
                    setEtablissement(res.data);
                    setFormData({
                        nom: res.data.nom || '',
                        code: res.data.code || '',
                        type_etablissement: res.data.type_etablissement || '',
                        adresse: res.data.adresse || '',
                        ville: res.data.ville || '',
                        region: res.data.region || '',
                        prefecture: res.data.prefecture || '',
                        telephone: res.data.telephone || '',
                        email: res.data.email || '',
                        directeur: res.data.directeur || '',
                        slogan: res.data.slogan || '',
                        capacite_max: res.data.capacite_max || 0
                    });
                    setHasChanges(false);
                })
                .finally(() => setLoading(false));
        }
    }, [etablissementId]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
        setHasChanges(true);
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            await api.put(`/api/parametrage/etablissements/${etablissementId}`, formData);
            setEtablissementNom(formData.nom);
            refreshEtablissement(); // Synchronise tout (logo, cachet, signature, etc.) globalement
            setSuccess(true);
            setHasChanges(false);
            setTimeout(() => setSuccess(false), 3000);
        } catch (err) {
            console.error(err);
            alert("Erreur lors de la sauvegarde.");
        } finally {
            setSaving(false);
        }
    };

    const handleFileUpload = async (field: 'logo' | 'favicon' | 'cachet' | 'signature') => {
        const file = fileInputs[field].current?.files?.[0];
        if (!file) return;

        const formDataData = new FormData();
        formDataData.append('fichier', file);

        try {
            const res = await api.post(`/api/parametrage/etablissements/${etablissementId}/upload/${field}`, formDataData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            const newUrl = res.data.url;
            setEtablissement({ ...etablissement, [`${field}_url`]: newUrl });
            
            if (field === 'logo' || field === 'favicon') {
                setEtablissementLogo(newUrl);
            }
            refreshEtablissement(); // Synchronise tout globalement après chaque upload
        } catch (err) {
            console.error(err);
            alert("Erreur lors de l'upload du fichier.");
        }
    };

    if (loading) {
        return (
            <SettingsLayout title="Identité de l'Établissement" subtitle="Chargement...">
                <div className={styles.loaderContainer}>
                    <Loader2 className={styles.spinner} size={32} />
                    <span>Chargement des paramètres...</span>
                </div>
            </SettingsLayout>
        );
    }

    const FileUploadCard = ({ title, field, currentUrl, desc }: { title: string, field: 'logo'|'favicon'|'cachet'|'signature', currentUrl: string, desc: string }) => {
        const photoUrl = currentUrl ? (currentUrl.startsWith('http') ? currentUrl : `${API_BASE}${currentUrl.startsWith('/') ? '' : '/'}${currentUrl}`) : null;
        
        return (
            <div className={styles.uploadCard}>
                <div className={styles.uploadHeader}>
                    <h4>{title}</h4>
                    <p>{desc}</p>
                </div>
                <div className={styles.uploadBody}>
                    <div className={styles.previewContainer}>
                        {photoUrl ? (
                            <img src={photoUrl} alt={title} className={styles.previewImage} />
                        ) : (
                            <div className={styles.emptyPreview}>
                                <ImageIcon size={32} color="#cbd5e1" />
                            </div>
                        )}
                    </div>
                    <div className={styles.uploadActions}>
                        <input 
                            type="file" 
                            accept="image/*"
                            ref={fileInputs[field]}
                            style={{ display: 'none' }}
                            onChange={() => handleFileUpload(field)}
                        />
                        <button 
                            type="button" 
                            className={styles.uploadBtn}
                            onClick={() => fileInputs[field].current?.click()}
                        >
                            <Upload size={16} />
                            <span>Parcourir</span>
                        </button>
                    </div>
                </div>
            </div>
        );
    };

    return (
        <SettingsLayout 
            title="Identité de l'Établissement" 
            subtitle="Configurez les informations légales et visuelles de votre école."
        >
            <div className={styles.formContainer}>
                
                {/* Section 1: Informations Générales */}
                <section className={styles.formSection}>
                    <div className={styles.sectionHeader}>
                        <Building size={20} className={styles.sectionIcon} />
                        <h3>Informations Générales</h3>
                    </div>
                    <div className={styles.grid2}>
                        <div className={styles.formGroup}>
                            <label>Nom de l'établissement</label>
                            <div className={styles.inputWrapper}>
                                <Building className={styles.inputIcon} size={18} />
                                <input type="text" name="nom" value={formData.nom} onChange={handleChange} placeholder="Ex: Lycée d'Excellence" />
                            </div>
                        </div>
                        <div className={styles.formGroup}>
                            <label>Code / Numéro d'Agrément</label>
                            <div className={styles.inputWrapper}>
                                <Hash className={styles.inputIcon} size={18} />
                                <input type="text" name="code" value={formData.code} onChange={handleChange} placeholder="Ex: ETAB-2026-001" />
                            </div>
                        </div>
                        <div className={styles.formGroup}>
                            <label>Slogan / Devise</label>
                            <div className={styles.inputWrapper}>
                                <Globe className={styles.inputIcon} size={18} />
                                <input type="text" name="slogan" value={formData.slogan} onChange={handleChange} placeholder="Ex: Excellence et Rigueur" />
                            </div>
                        </div>
                        <div className={styles.formGroup}>
                            <label>Type d'établissement</label>
                            <select name="type_etablissement" value={formData.type_etablissement} onChange={handleChange} className={styles.selectInput}>
                                <option value="PUBLIC">Public</option>
                                <option value="PRIVE">Privé</option>
                                <option value="FRANCO_ARABE">Franco-Arabe</option>
                            </select>
                        </div>
                    </div>
                </section>

                {/* Section 2: Contact et Localisation */}
                <section className={styles.formSection}>
                    <div className={styles.sectionHeader}>
                        <MapPin size={20} className={styles.sectionIcon} />
                        <h3>Contact & Localisation</h3>
                    </div>
                    <div className={styles.grid2}>
                        <div className={styles.formGroup} style={{ gridColumn: '1 / -1' }}>
                            <label>Adresse complète</label>
                            <div className={styles.inputWrapper}>
                                <MapPin className={styles.inputIcon} size={18} />
                                <input type="text" name="adresse" value={formData.adresse} onChange={handleChange} placeholder="Ex: Quartier Kipé, Commune de Ratoma" />
                            </div>
                        </div>
                        <div className={styles.formGroup}>
                            <label>Ville</label>
                            <input type="text" name="ville" value={formData.ville} onChange={handleChange} className={styles.simpleInput} />
                        </div>
                        <div className={styles.formGroup}>
                            <label>Préfecture</label>
                            <input type="text" name="prefecture" value={formData.prefecture} onChange={handleChange} className={styles.simpleInput} />
                        </div>
                        <div className={styles.formGroup}>
                            <label>Téléphone principal</label>
                            <div className={styles.inputWrapper}>
                                <Phone className={styles.inputIcon} size={18} />
                                <input type="text" name="telephone" value={formData.telephone} onChange={handleChange} placeholder="+224 ..." />
                            </div>
                        </div>
                        <div className={styles.formGroup}>
                            <label>Email de contact</label>
                            <div className={styles.inputWrapper}>
                                <Mail className={styles.inputIcon} size={18} />
                                <input type="email" name="email" value={formData.email} onChange={handleChange} placeholder="contact@ecole.com" />
                            </div>
                        </div>
                    </div>
                </section>

                {/* Section 3: Direction */}
                <section className={styles.formSection}>
                    <div className={styles.sectionHeader}>
                        <User size={20} className={styles.sectionIcon} />
                        <h3>Direction & Capacité</h3>
                    </div>
                    <div className={styles.grid2}>
                        <div className={styles.formGroup}>
                            <label>Nom du Directeur / Fondateur</label>
                            <div className={styles.inputWrapper}>
                                <User className={styles.inputIcon} size={18} />
                                <input type="text" name="directeur" value={formData.directeur} onChange={handleChange} />
                            </div>
                        </div>
                        <div className={styles.formGroup}>
                            <label>Capacité maximale d'accueil</label>
                            <div className={styles.inputWrapper}>
                                <Building className={styles.inputIcon} size={18} />
                                <input type="number" name="capacite_max" value={formData.capacite_max} onChange={handleChange} />
                            </div>
                        </div>
                    </div>
                </section>

                {/* Section 4: Identité Visuelle */}
                <section className={styles.formSection}>
                    <div className={styles.sectionHeader}>
                        <Camera size={20} className={styles.sectionIcon} />
                        <h3>Identité Visuelle</h3>
                    </div>
                    <div className={styles.uploadGrid}>
                        <FileUploadCard 
                            title="Logo Principal" 
                            field="logo" 
                            desc="Affiché dans le menu, les factures et les cartes."
                            currentUrl={etablissement?.logo_url} 
                        />
                        <FileUploadCard 
                            title="Favicon" 
                            field="favicon" 
                            desc="Logo réduit, icône de l'onglet du navigateur."
                            currentUrl={etablissement?.favicon_url} 
                        />
                        <FileUploadCard 
                            title="Cachet Officiel" 
                            field="cachet" 
                            desc="Apposé sur les bulletins et certificats."
                            currentUrl={etablissement?.cachet_url} 
                        />
                        <FileUploadCard 
                            title="Signature du Directeur" 
                            field="signature" 
                            desc="Signature numérisée pour documents officiels."
                            currentUrl={etablissement?.signature_url} 
                        />
                    </div>
                </section>
                
                {/* Espace pour éviter que le bouton sticky cache le contenu */}
                <div style={{ height: '80px' }}></div>

                {/* Sticky Action Bar */}
                <AnimatePresence>
                    {hasChanges && (
                        <motion.div 
                            className={styles.stickyBar}
                            initial={{ y: 100, opacity: 0 }}
                            animate={{ y: 0, opacity: 1 }}
                            exit={{ y: 100, opacity: 0 }}
                        >
                            <div className={styles.stickyContent}>
                                <span className={styles.unsavedText}>Changements non enregistrés</span>
                                <div className={styles.stickyActions}>
                                    <button 
                                        className={styles.cancelBtn} 
                                        onClick={() => window.location.reload()}
                                    >
                                        Annuler
                                    </button>
                                    <button 
                                        className={styles.saveBtn} 
                                        onClick={handleSave} 
                                        disabled={saving}
                                    >
                                        {saving ? <Loader2 size={18} className={styles.spinner} /> : <Save size={18} />}
                                        <span>Enregistrer les modifications</span>
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Success Toast */}
                <AnimatePresence>
                    {success && (
                        <motion.div 
                            className={styles.toast}
                            initial={{ opacity: 0, y: -20 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -20 }}
                        >
                            <CheckCircle size={20} />
                            <span>Paramètres enregistrés avec succès !</span>
                        </motion.div>
                    )}
                </AnimatePresence>

            </div>
        </SettingsLayout>
    );
}
