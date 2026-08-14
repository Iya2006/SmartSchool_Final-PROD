'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useApp } from '@/context/AppContext';
import {
    User, Mail, Building, Edit2, Loader2, Save, X,
    Key, CheckCircle2, Lock, Shield, Activity,
    Sparkles, LogOut, Check, Eye, EyeOff, Camera
} from 'lucide-react';
import api from '@/lib/api';
import toast from 'react-hot-toast';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8300';

export default function ProfilPage() {
    const { user, logout } = useAuth();
    const { etablissementNom } = useApp();
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<'profil' | 'securite'>('profil');

    // User Profile Form State — chargé depuis GET /api/personnel/{id} (fiche
    // réelle), pas depuis /api/auth/me (qui ne renvoie que 6 champs du JWT).
    const [nom, setNom] = useState('');
    const [prenom, setPrenom] = useState('');
    const [email, setEmail] = useState('');
    const [telephone, setTelephone] = useState('');
    const [fonction, setFonction] = useState(''); // lecture seule : dérivé du vrai rôle
    const [photoUrl, setPhotoUrl] = useState('');
    // Un SUPER_ADMIN plateforme n'a pas de fiche /api/personnel (pas rattaché
    // à une école) — on retombe alors sur une vue minimale, en lecture seule.
    const [profilComplet, setProfilComplet] = useState(true);

    const [isSaving, setIsSaving] = useState(false);
    const [editMode, setEditMode] = useState(false);
    const [photoUploading, setPhotoUploading] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Security Form State
    const [oldPassword, setOldPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPass, setShowPass] = useState(false);
    const [ancienPin, setAncienPin] = useState('');
    const [pinAccess, setPinAccess] = useState(''); // nouveau PIN à définir
    const [pinConfigured, setPinConfigured] = useState<boolean | null>(null);
    const [isSavingSecurity, setIsSavingSecurity] = useState(false);

    useEffect(() => {
        const loadProfileData = async () => {
            if (!user?.id) { setLoading(false); return; }
            try {
                const res = await api.get(`/api/personnel/${user.id}`);
                const p = res.data;
                setNom(p.nom || '');
                setPrenom(p.prenom || '');
                setEmail(p.email || '');
                setTelephone(p.telephone || '');
                setFonction(p.role || user.role || '');
                setPhotoUrl(p.photo_url || '');
                setProfilComplet(true);
            } catch (err) {
                // SUPER_ADMIN plateforme (pas de fiche personnel) ou fiche
                // introuvable : on affiche quand même l'essentiel connu du
                // jeton, en lecture seule plutôt que de bloquer la page.
                setNom(user?.nom || '');
                setPrenom(user?.prenom || '');
                setEmail(user?.email || '');
                setTelephone(user?.telephone || '');
                setFonction(user?.role || '');
                setProfilComplet(false);
            } finally {
                setLoading(false);
            }
        };

        loadProfileData();
    }, [user]);

    useEffect(() => {
        api.get('/api/comptabilite/pin/status')
            .then(res => setPinConfigured(!!res.data?.configured))
            .catch(() => setPinConfigured(null));
    }, []);

    const handleSaveProfile = async () => {
        if (!user?.id) return;
        setIsSaving(true);
        try {
            // Jamais role/statut dans ce payload : un admin ne doit pas
            // pouvoir s'auto-attribuer un rôle supérieur via son propre profil.
            await api.put(`/api/personnel/${user.id}`, { nom, prenom, email, telephone });
            toast.success("Profil mis à jour avec succès !");
            setEditMode(false);
        } catch (err: any) {
            toast.error(err.response?.data?.detail || "Erreur lors de la sauvegarde du profil.");
        } finally {
            setIsSaving(false);
        }
    };

    const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !user?.id) return;
        setPhotoUploading(true);
        try {
            const fd = new FormData();
            fd.append('fichier', file);
            const res = await api.post(`/api/photos/upload/personnel/${user.id}`, fd, {
                headers: { 'Content-Type': 'multipart/form-data' },
            });
            setPhotoUrl(res.data.photo_url || '');
            toast.success('Photo mise à jour.');
        } catch (err: any) {
            toast.error(err.response?.data?.detail || "Erreur lors de l'envoi de la photo.");
        } finally {
            setPhotoUploading(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const handleUpdatePassword = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!oldPassword) {
            toast.error("Veuillez saisir votre mot de passe actuel.");
            return;
        }
        if (newPassword.length < 6) {
            toast.error("Le nouveau mot de passe doit contenir au moins 6 caractères.");
            return;
        }
        if (newPassword !== confirmPassword) {
            toast.error("Les mots de passe ne correspondent pas.");
            return;
        }

        setIsSavingSecurity(true);
        try {
            await api.put('/api/personnel/me/changer-mot-de-passe', {
                ancien_mdp: oldPassword,
                nouveau_mdp: newPassword,
            });
            setOldPassword('');
            setNewPassword('');
            setConfirmPassword('');
            toast.success("Mot de passe modifié avec succès !");
        } catch (err: any) {
            toast.error(err.response?.data?.detail || "Erreur lors du changement de mot de passe.");
        } finally {
            setIsSavingSecurity(false);
        }
    };

    const handleSavePin = async () => {
        if (!ancienPin) {
            toast.error("Veuillez saisir le code PIN actuel.");
            return;
        }
        if (!pinAccess || pinAccess.length < 4) {
            toast.error("Le nouveau code PIN doit contenir au moins 4 chiffres.");
            return;
        }
        try {
            await api.put('/api/comptabilite/pin', {
                ancien_pin: ancienPin,
                nouveau_pin: pinAccess
            });
            toast.success('Code PIN mis à jour avec succès.');
            setPinConfigured(true);
            setAncienPin('');
            setPinAccess('');
        } catch (err: any) {
            toast.error(err.response?.data?.detail || "Erreur lors de la modification du PIN.");
        }
    };

    const initials = `${prenom ? prenom.charAt(0) : 'A'}${nom ? nom.charAt(0) : 'D'}`.toUpperCase();
    const photoSrc = photoUrl ? `${API_BASE}${photoUrl}` : '';

    return (
        <div style={{ maxWidth: '1280px', margin: '0 auto', padding: '24px 20px', fontFamily: '"Inter", sans-serif' }}>
            <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
            
            {loading ? (
                <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', height: '70vh', gap: '16px' }}>
                    <Loader2 size={44} color="#3b82f6" className="animate-spin" style={{ animation: 'spin 1s linear infinite' }} />
                    <p style={{ color: '#64748b', fontWeight: 600, fontSize: '15px' }}>Chargement du Profil Administrateur...</p>
                </div>
            ) : (
                <>
                    {/* ════════════════════════════════════════════════════════════ */}
                    {/* HERO HEADER — BADGE ADMIN EXECUTIVE                        */}
                    {/* ════════════════════════════════════════════════════════════ */}
                    <div style={{
                        background: 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #312e81 100%)',
                        borderRadius: '24px',
                        padding: '36px',
                        color: 'white',
                        marginBottom: '32px',
                        boxShadow: '0 20px 40px rgba(15, 23, 42, 0.25)',
                        position: 'relative',
                        overflow: 'hidden'
                    }}>
                {/* Visual Background Ornaments */}
                <div style={{
                    position: 'absolute', right: '-40px', top: '-40px',
                    width: '300px', height: '300px', borderRadius: '50%',
                    background: 'radial-gradient(circle, rgba(99,102,241,0.15) 0%, rgba(255,255,255,0) 70%)',
                    pointerEvents: 'none'
                }} />
                
                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '24px', position: 'relative', zIndex: 1 }}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '24px', minWidth: 0 }}>
                        {/* Avatar */}
                        <div style={{ position: 'relative' }}>
                            <input ref={fileInputRef} type="file" accept="image/*" hidden onChange={handlePhotoUpload} />
                            <div style={{
                                width: '96px', height: '96px', borderRadius: '24px',
                                background: photoSrc ? `url(${photoSrc}) center/cover` : 'linear-gradient(135deg, #6366f1, #3b82f6)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontSize: '36px', fontWeight: 800, color: 'white',
                                boxShadow: '0 10px 25px rgba(0,0,0,0.3)',
                                border: '3px solid rgba(255,255,255,0.2)'
                            }}>
                                {!photoSrc && initials}
                            </div>
                            <div title="En ligne" style={{
                                position: 'absolute', bottom: '-4px', right: '-4px',
                                background: '#10b981', width: '22px', height: '22px',
                                borderRadius: '50%', border: '3px solid #0f172a'
                            }} />
                            <button
                                type="button"
                                onClick={() => fileInputRef.current?.click()}
                                disabled={photoUploading || !profilComplet}
                                title="Changer la photo"
                                style={{
                                    position: 'absolute', bottom: '-4px', left: '-4px',
                                    width: '30px', height: '30px', borderRadius: '50%',
                                    background: '#3b82f6', border: '3px solid #0f172a',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    cursor: profilComplet ? 'pointer' : 'not-allowed', opacity: profilComplet ? 1 : 0.5,
                                }}
                            >
                                {photoUploading ? <Loader2 size={13} color="white" style={{ animation: 'spin 1s linear infinite' }} /> : <Camera size={13} color="white" />}
                            </button>
                        </div>

                        {/* Nom & Roles */}
                        <div style={{ minWidth: 0 }}>
                            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
                                <span style={{
                                    background: 'rgba(99,102,241,0.25)', border: '1px solid rgba(129,140,248,0.4)',
                                    color: '#a5b4fc', padding: '4px 12px', borderRadius: '50px',
                                    fontSize: '12px', fontWeight: 700, letterSpacing: '0.5px',
                                    display: 'flex', alignItems: 'center', gap: '6px'
                                }}>
                                    <Sparkles size={13} /> {fonction}
                                </span>
                                <span style={{
                                    background: 'rgba(16,185,129,0.2)', color: '#34d399',
                                    padding: '4px 12px', borderRadius: '50px',
                                    fontSize: '12px', fontWeight: 700
                                }}>
                                    Compte Actif
                                </span>
                            </div>
                            <h1 style={{ margin: 0, fontSize: 'clamp(20px, 5vw, 28px)', fontWeight: 800, letterSpacing: '-0.5px', wordBreak: 'break-word' }}>
                                {prenom} {nom}
                            </h1>
                            <p style={{ margin: '6px 0 0', opacity: 0.8, fontSize: '14px', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px 16px' }}>
                                <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><Mail size={14} /> {email}</span>
                                <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><Building size={14} /> {etablissementNom}</span>
                            </p>
                        </div>
                    </div>

                    {/* Actions de l'en-tête */}
                    <div style={{ display: 'flex', gap: '12px' }}>
                        <button
                            onClick={() => setActiveTab('profil')}
                            style={{
                                padding: '12px 20px', borderRadius: '12px', border: 'none',
                                background: 'rgba(255,255,255,0.15)', color: 'white',
                                fontWeight: 700, fontSize: '14px', cursor: 'pointer',
                                display: 'flex', alignItems: 'center', gap: '8px',
                                backdropFilter: 'blur(10px)', transition: 'all 0.2s'
                            }}
                        >
                            <Edit2 size={16} /> Gérer Profil
                        </button>
                        <button
                            onClick={logout}
                            style={{
                                padding: '12px 20px', borderRadius: '12px', border: 'none',
                                background: '#ef4444', color: 'white',
                                fontWeight: 700, fontSize: '14px', cursor: 'pointer',
                                display: 'flex', alignItems: 'center', gap: '8px',
                                boxShadow: '0 4px 15px rgba(239,68,68,0.3)'
                            }}
                        >
                            <LogOut size={16} /> Déconnexion
                        </button>
                    </div>
                </div>

                {/* Métriques / Badges Administrateur */}
                <div style={{
                    display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                    gap: '16px', marginTop: '28px', paddingTop: '24px',
                    borderTop: '1px solid rgba(255,255,255,0.1)'
                }}>
                    <div style={{ background: 'rgba(255,255,255,0.06)', borderRadius: '14px', padding: '14px 18px' }}>
                        <div style={{ fontSize: '12px', opacity: 0.7, marginBottom: '4px' }}>Niveau d'Accès</div>
                        <div style={{ fontSize: '16px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <Shield size={16} color="#818cf8" /> Accès Total (Niveau 1)
                        </div>
                    </div>
                    <div style={{ background: 'rgba(255,255,255,0.06)', borderRadius: '14px', padding: '14px 18px' }}>
                        <div style={{ fontSize: '12px', opacity: 0.7, marginBottom: '4px' }}>Code PIN Comptabilité</div>
                        <div style={{ fontSize: '16px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <Lock size={16} color="#34d399" /> {pinConfigured === false ? 'Non configuré' : 'Configuré'}
                        </div>
                    </div>
                    <div style={{ background: 'rgba(255,255,255,0.06)', borderRadius: '14px', padding: '14px 18px' }}>
                        <div style={{ fontSize: '12px', opacity: 0.7, marginBottom: '4px' }}>Session Actuelle</div>
                        <div style={{ fontSize: '16px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <Activity size={16} color="#60a5fa" /> Authentifié par Token JWT
                        </div>
                    </div>
                </div>
            </div>

            {/* ════════════════════════════════════════════════════════════ */}
            {/* TABS BAR                                                     */}
            {/* ════════════════════════════════════════════════════════════ */}
            <div style={{
                display: 'flex', gap: '8px', marginBottom: '24px',
                borderBottom: '2px solid #e2e8f0', overflowX: 'auto', paddingBottom: '2px'
            }}>
                <button
                    onClick={() => setActiveTab('profil')}
                    style={{
                        padding: '12px 20px', background: 'transparent', border: 'none',
                        borderBottom: activeTab === 'profil' ? '3px solid #3b82f6' : '3px solid transparent',
                        color: activeTab === 'profil' ? '#3b82f6' : '#64748b',
                        fontWeight: activeTab === 'profil' ? 700 : 600, fontSize: '15px', cursor: 'pointer',
                        display: 'flex', alignItems: 'center', gap: '8px', transition: 'all 0.2s', whiteSpace: 'nowrap'
                    }}
                >
                    <User size={18} /> Profil & Informations
                </button>

                <button
                    onClick={() => setActiveTab('securite')}
                    style={{
                        padding: '12px 20px', background: 'transparent', border: 'none',
                        borderBottom: activeTab === 'securite' ? '3px solid #3b82f6' : '3px solid transparent',
                        color: activeTab === 'securite' ? '#3b82f6' : '#64748b',
                        fontWeight: activeTab === 'securite' ? 700 : 600, fontSize: '15px', cursor: 'pointer',
                        display: 'flex', alignItems: 'center', gap: '8px', transition: 'all 0.2s', whiteSpace: 'nowrap'
                    }}
                >
                    <Key size={18} /> Sécurité & PIN
                </button>
            </div>

            {/* ════════════════════════════════════════════════════════════ */}
            {/* TAB 1 : PROFIL & INFORMATIONS                                */}
            {/* ════════════════════════════════════════════════════════════ */}
            {activeTab === 'profil' && (
                <div style={{ background: 'white', borderRadius: '20px', padding: '32px', border: '1px solid #f1f5f9', boxShadow: '0 4px 20px rgba(0,0,0,0.03)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                        <div>
                            <h2 style={{ fontSize: '20px', fontWeight: 700, margin: 0, color: '#0f172a' }}>Informations Générales</h2>
                            <p style={{ color: '#64748b', fontSize: '14px', margin: '4px 0 0' }}>Mettez à jour vos coordonnées administratives.</p>
                        </div>
                        {!editMode ? (
                            <button
                                onClick={() => setEditMode(true)}
                                disabled={!profilComplet}
                                style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 18px', background: '#eff6ff', color: '#3b82f6', border: 'none', borderRadius: '10px', fontWeight: 700, cursor: profilComplet ? 'pointer' : 'not-allowed', fontSize: '14px', opacity: profilComplet ? 1 : 0.5 }}
                            >
                                <Edit2 size={16} /> Éditer les données
                            </button>
                        ) : (
                            <div style={{ display: 'flex', gap: '10px' }}>
                                <button
                                    onClick={handleSaveProfile}
                                    disabled={isSaving}
                                    style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 20px', background: '#10b981', color: 'white', border: 'none', borderRadius: '10px', fontWeight: 700, cursor: 'pointer', fontSize: '14px' }}
                                >
                                    {isSaving ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> : <Check size={16} />} Enregistrer
                                </button>
                                <button
                                    onClick={() => setEditMode(false)}
                                    style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 18px', background: '#f1f5f9', color: '#64748b', border: 'none', borderRadius: '10px', fontWeight: 600, cursor: 'pointer', fontSize: '14px' }}
                                >
                                    <X size={16} /> Annuler
                                </button>
                            </div>
                        )}
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '24px' }}>
                        <div>
                            <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: '#475569', marginBottom: '8px' }}>Prénom</label>
                            <input
                                type="text"
                                disabled={!editMode}
                                value={prenom}
                                onChange={e => setPrenom(e.target.value)}
                                style={{ width: '100%', padding: '12px 16px', borderRadius: '12px', border: '1px solid #e2e8f0', background: editMode ? 'white' : '#f8fafc', fontSize: '14px', outline: 'none' }}
                            />
                        </div>

                        <div>
                            <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: '#475569', marginBottom: '8px' }}>Nom de famille</label>
                            <input
                                type="text"
                                disabled={!editMode}
                                value={nom}
                                onChange={e => setNom(e.target.value)}
                                style={{ width: '100%', padding: '12px 16px', borderRadius: '12px', border: '1px solid #e2e8f0', background: editMode ? 'white' : '#f8fafc', fontSize: '14px', outline: 'none' }}
                            />
                        </div>

                        <div>
                            <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: '#475569', marginBottom: '8px' }}>Adresse Email Officielle</label>
                            <input
                                type="email"
                                disabled={!editMode}
                                value={email}
                                onChange={e => setEmail(e.target.value)}
                                style={{ width: '100%', padding: '12px 16px', borderRadius: '12px', border: '1px solid #e2e8f0', background: editMode ? 'white' : '#f8fafc', fontSize: '14px', outline: 'none' }}
                            />
                        </div>

                        <div>
                            <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: '#475569', marginBottom: '8px' }}>Numéro de Téléphone</label>
                            <input
                                type="text"
                                disabled={!editMode}
                                value={telephone}
                                onChange={e => setTelephone(e.target.value)}
                                style={{ width: '100%', padding: '12px 16px', borderRadius: '12px', border: '1px solid #e2e8f0', background: editMode ? 'white' : '#f8fafc', fontSize: '14px', outline: 'none' }}
                            />
                        </div>

                        <div>
                            <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: '#475569', marginBottom: '8px' }}>Titre / Fonction</label>
                            <input
                                type="text"
                                disabled
                                value={fonction}
                                style={{ width: '100%', padding: '12px 16px', borderRadius: '12px', border: '1px solid #e2e8f0', background: '#f8fafc', fontSize: '14px', outline: 'none' }}
                            />
                            <p style={{ margin: '6px 0 0', fontSize: '11px', color: '#94a3b8' }}>Non modifiable ici — géré dans Personnel.</p>
                        </div>

                        <div>
                            <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: '#475569', marginBottom: '8px' }}>Établissement Principal</label>
                            <input
                                type="text"
                                disabled
                                value={etablissementNom}
                                style={{ width: '100%', padding: '12px 16px', borderRadius: '12px', border: '1px solid #e2e8f0', background: '#f8fafc', fontSize: '14px', outline: 'none' }}
                            />
                            <p style={{ margin: '6px 0 0', fontSize: '11px', color: '#94a3b8' }}>Non modifiable ici — géré dans Paramètres.</p>
                        </div>
                    </div>

                    {!profilComplet && (
                        <div style={{ marginTop: '24px', padding: '14px 18px', borderRadius: '14px', background: '#fffbeb', border: '1px solid #fde68a', fontSize: '13px', color: '#92400e' }}>
                            Vue partielle : ce compte n'est rattaché à aucun établissement (administrateur plateforme), la fiche complète (photo, édition) n'est donc pas disponible ici.
                        </div>
                    )}
                </div>
            )}


            {/* ════════════════════════════════════════════════════════════ */}
            {/* TAB 3 : SÉCURITÉ & AUTHENTIFICATION                          */}
            {/* ════════════════════════════════════════════════════════════ */}
            {activeTab === 'securite' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
                    {/* Changement Mot de Passe */}
                    <div style={{ background: 'white', borderRadius: '20px', padding: '32px', border: '1px solid #f1f5f9', boxShadow: '0 4px 20px rgba(0,0,0,0.03)' }}>
                        <h2 style={{ fontSize: '20px', fontWeight: 700, margin: '0 0 8px 0', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Key color="#3b82f6" size={22} /> Modifier le Mot de Passe
                        </h2>
                        <p style={{ color: '#64748b', fontSize: '14px', marginBottom: '24px' }}>Protégez votre compte d'administration principal.</p>

                        <form onSubmit={handleUpdatePassword} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            <div>
                                <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>Mot de passe actuel</label>
                                <input
                                    type={showPass ? 'text' : 'password'}
                                    value={oldPassword}
                                    onChange={e => setOldPassword(e.target.value)}
                                    style={{ width: '100%', padding: '12px 16px', borderRadius: '12px', border: '1px solid #e2e8f0', outline: 'none', fontSize: '14px' }}
                                />
                            </div>

                            <div>
                                <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>Nouveau mot de passe</label>
                                <input
                                    type={showPass ? 'text' : 'password'}
                                    value={newPassword}
                                    onChange={e => setNewPassword(e.target.value)}
                                    style={{ width: '100%', padding: '12px 16px', borderRadius: '12px', border: '1px solid #e2e8f0', outline: 'none', fontSize: '14px' }}
                                />
                            </div>

                            <div>
                                <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>Confirmer le nouveau mot de passe</label>
                                <input
                                    type={showPass ? 'text' : 'password'}
                                    value={confirmPassword}
                                    onChange={e => setConfirmPassword(e.target.value)}
                                    style={{ width: '100%', padding: '12px 16px', borderRadius: '12px', border: '1px solid #e2e8f0', outline: 'none', fontSize: '14px' }}
                                />
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }} onClick={() => setShowPass(!showPass)}>
                                {showPass ? <EyeOff size={16} color="#64748b" /> : <Eye size={16} color="#64748b" />}
                                <span style={{ fontSize: '13px', color: '#64748b', fontWeight: 500 }}>Afficher le mot de passe</span>
                            </div>

                            <button
                                type="submit"
                                disabled={isSavingSecurity}
                                style={{
                                    padding: '14px', borderRadius: '12px', border: 'none',
                                    background: '#0f172a', color: 'white', fontWeight: 700,
                                    fontSize: '15px', cursor: 'pointer', display: 'flex',
                                    alignItems: 'center', justifyContent: 'center', gap: '8px',
                                    marginTop: '8px'
                                }}
                            >
                                {isSavingSecurity ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />} Mettre à jour
                            </button>
                        </form>
                    </div>

                    {/* Code PIN & Sécurité renforcée */}
                    <div style={{ background: 'white', borderRadius: '20px', padding: '32px', border: '1px solid #f1f5f9', boxShadow: '0 4px 20px rgba(0,0,0,0.03)' }}>
                        <h2 style={{ fontSize: '20px', fontWeight: 700, margin: '0 0 8px 0', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Lock color="#10b981" size={22} /> Code PIN de Sécurité (Comptabilité)
                        </h2>
                        <p style={{ color: '#64748b', fontSize: '14px', marginBottom: '24px' }}>Ce code PIN permet d'accéder au module financier et aux actions sensibles.</p>

                        <div style={{ background: '#ecfdf5', padding: '20px', borderRadius: '16px', border: '1px solid #a7f3d0', marginBottom: '24px' }}>
                            <div style={{ fontSize: '13px', color: '#047857', fontWeight: 600, marginBottom: '4px' }}>Statut</div>
                            <div style={{ fontSize: '20px', fontWeight: 800, color: '#065f46' }}>
                                {pinConfigured === null ? '...' : pinConfigured ? 'PIN configuré' : 'Aucun PIN configuré'}
                            </div>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            <div>
                                <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>Code PIN actuel</label>
                                <input
                                    type="text"
                                    maxLength={6}
                                    value={ancienPin}
                                    onChange={e => setAncienPin(e.target.value)}
                                    placeholder="PIN actuel"
                                    style={{ width: '100%', padding: '12px 16px', borderRadius: '12px', border: '1px solid #e2e8f0', outline: 'none', fontSize: '18px', fontWeight: 700, letterSpacing: '3px' }}
                                />
                            </div>
                            <div>
                                <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>Nouveau code PIN</label>
                                <input
                                    type="text"
                                    maxLength={6}
                                    value={pinAccess}
                                    onChange={e => setPinAccess(e.target.value)}
                                    placeholder="Nouveau PIN"
                                    style={{ width: '100%', padding: '12px 16px', borderRadius: '12px', border: '1px solid #e2e8f0', outline: 'none', fontSize: '18px', fontWeight: 700, letterSpacing: '3px' }}
                                />
                            </div>

                            <button
                                onClick={handleSavePin}
                                style={{
                                    padding: '14px', borderRadius: '12px', border: 'none',
                                    background: '#10b981', color: 'white', fontWeight: 700,
                                    fontSize: '15px', cursor: 'pointer', display: 'flex',
                                    alignItems: 'center', justifyContent: 'center', gap: '8px'
                                }}
                            >
                                <CheckCircle2 size={18} /> Enregistrer le nouveau PIN
                            </button>
                        </div>
                    </div>
                </div>
            )}

                </>
            )}
        </div>
    );
}
