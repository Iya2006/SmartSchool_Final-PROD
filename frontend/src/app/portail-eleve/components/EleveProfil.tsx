'use client';

import React, { useState } from 'react';
import { Upload, Loader2, Lock, User, Shield, AlertTriangle } from 'lucide-react';
import api from '@/lib/api';
import BadgeCarte from '@/components/BadgeCarte';
import styles from '../portail-eleve.module.css';
import { EleveInfo, PendingPhoto } from '../types';

interface EleveProfilProps {
    eleveId: number;
    eleveData: EleveInfo;
    pendingPhoto: PendingPhoto | null;
    setPendingPhoto: (photo: PendingPhoto | null) => void;
    apiBase: string;
    couleurPortail: string;
}

export default function EleveProfil({
    eleveId,
    eleveData,
    pendingPhoto,
    setPendingPhoto,
    apiBase,
    couleurPortail,
}: EleveProfilProps) {
    // Password change states
    const [oldPwd, setOldPwd] = useState('');
    const [newPwd, setNewPwd] = useState('');
    const [confirmPwd, setConfirmPwd] = useState('');
    const [pwdLoading, setPwdLoading] = useState(false);
    const [pwdSuccess, setPwdSuccess] = useState('');
    const [pwdError, setPwdError] = useState('');

    // Photo upload states
    const [photoUploading, setPhotoUploading] = useState(false);
    const [photoSuccess, setPhotoSuccess] = useState('');
    const [photoError, setPhotoError] = useState('');

    const initials = ((eleveData.prenom?.[0] || '') + (eleveData.nom?.[0] || '')).toUpperCase();
    
    // Resolve dynamic photo source
    const pendingPhotoUrl = pendingPhoto ? (pendingPhoto.photo_url || (pendingPhoto as any).file_path) : null;
    const photoSrc = pendingPhotoUrl 
        ? `${apiBase}${pendingPhotoUrl}` 
        : (eleveData.photo_url ? `${apiBase}${eleveData.photo_url}` : null);

    const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setPhotoUploading(true);
        setPhotoSuccess('');
        setPhotoError('');

        try {
            const formData = new FormData();
            formData.append('fichier', file);

            const res = await api.post(`/api/photos/upload/eleve/${eleveId}`, formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            
            setPhotoSuccess('Photo soumise ! En attente de validation.');
            
            if (res.data && res.data.photo_url) {
                setPendingPhoto({ photo_url: res.data.photo_url });
            } else {
                const pendRes = await api.get(`/api/photos/pending/eleve/${eleveId}`);
                if (pendRes.data) {
                    setPendingPhoto(pendRes.data);
                }
            }
        } catch (err: any) {
            setPhotoError(err.response?.data?.detail || "Erreur de chargement.");
        } finally {
            setPhotoUploading(false);
            e.target.value = '';
        }
    };

    const handlePasswordChange = async () => {
        if (newPwd !== confirmPwd) {
            setPwdError('Les mots de passe ne correspondent pas.');
            return;
        }

        setPwdLoading(true);
        setPwdError('');
        setPwdSuccess('');

        try {
            await api.put(`/api/portail-eleve/${eleveId}/changer-mot-de-passe`, {
                ancien_mdp: oldPwd,
                nouveau_mdp: newPwd
            });
            setPwdSuccess('Mot de passe mis à jour.');
            setOldPwd('');
            setNewPwd('');
            setConfirmPwd('');
        } catch (err: any) {
            setPwdError(err.response?.data?.detail || 'Erreur lors du changement.');
        } finally {
            setPwdLoading(false);
        }
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 800 }}>Mon Profil Élève</h2>
            </div>

            <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
                {/* Details Card */}
                <div className={styles.card} style={{ flex: '1.6 1 420px', display: 'flex', flexDirection: 'column', border: '1px solid #cbd5e1' }}>
                    <div 
                        style={{ 
                            background: `linear-gradient(135deg, ${couleurPortail} 0%, ${couleurPortail}dd 100%)`, 
                            padding: '32px 28px', 
                            display: 'flex', 
                            alignItems: 'center', 
                            gap: '20px', 
                            color: 'white',
                            position: 'relative',
                            overflow: 'hidden'
                        }}
                    >
                        <div style={{ position: 'absolute', top: '-20px', right: '-20px', width: '120px', height: '120px', borderRadius: '50%', background: 'rgba(255,255,255,0.08)' }} />
                        <div 
                            style={{
                                width: '80px', 
                                height: '80px', 
                                borderRadius: '50%', 
                                flexShrink: 0,
                                backgroundImage: photoSrc ? `url(${photoSrc})` : 'none',
                                backgroundColor: photoSrc ? 'transparent' : 'white',
                                display: 'flex', 
                                alignItems: 'center', 
                                justifyContent: 'center',
                                fontSize: '28px', 
                                fontWeight: 800, 
                                color: couleurPortail,
                                border: '4px solid rgba(255,255,255,0.25)',
                                backgroundPosition: 'center',
                                backgroundSize: 'cover',
                                backgroundRepeat: 'no-repeat',
                                cursor: 'zoom-in'
                            }}
                        >
                            {!photoSrc && initials}
                        </div>
                        <div>
                            <h3 style={{ margin: 0, fontSize: '20px', fontWeight: 850, letterSpacing: '-0.5px' }}>
                                {eleveData.prenom} {eleveData.nom}
                            </h3>
                            <p style={{ margin: '4px 0 0', opacity: 0.8, fontSize: '13.5px', fontWeight: 550 }}>
                                Matricule : {eleveData.matricule}
                            </p>
                            <span style={{ display: 'inline-block', marginTop: '8px', padding: '3px 12px', background: 'rgba(255,255,255,0.18)', borderRadius: '20px', fontSize: '11px', fontWeight: 700 }}>
                                {eleveData.classe || 'Aucune classe'}
                            </span>
                        </div>
                    </div>

                    <div style={{ padding: '24px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
                        {[
                            { label: 'Nom complet', value: `${eleveData.prenom} ${eleveData.nom}` },
                            { label: 'Identifiant / Matricule', value: eleveData.matricule },
                            { label: 'Classe active', value: eleveData.classe || '—' },
                            { label: 'Date de naissance', value: eleveData.date_naissance ? new Date(eleveData.date_naissance).toLocaleDateString('fr-FR') : '—' },
                            { label: 'Lieu de naissance', value: eleveData.lieu_naissance || '—' },
                            { label: 'Sexe de l\'élève', value: eleveData.sexe === 'M' ? 'Masculin' : 'Féminin' },
                        ].map((f, i) => (
                            <div key={i} style={{ background: '#f8fafc', borderRadius: '12px', padding: '14px 16px', border: '1px solid #f1f5f9' }}>
                                <p style={{ margin: 0, fontSize: '11px', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                    {f.label}
                                </p>
                                <p style={{ margin: '6px 0 0', fontSize: '13.5px', fontWeight: 700, color: '#1e293b' }}>
                                    {f.value}
                                </p>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Photo Update panel */}
                <div className={styles.card} style={{ flex: '1 1 300px', padding: '24px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', border: '1px solid #cbd5e1' }}>
                    <h3 style={{ margin: '0 0 16px', fontSize: '14px', fontWeight: 750, display: 'flex', alignItems: 'center', gap: '8px', alignSelf: 'flex-start', color: '#334155' }}>
                        <User size={16} color={couleurPortail} /> Photo d'identité scolaire
                    </h3>
                    <div style={{ width: '108px', height: '108px', borderRadius: '50%', background: '#f8fafc', marginBottom: '18px', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid #e2e8f0', boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.02)' }}>
                        {photoSrc ? (
                            <img src={photoSrc} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="Profil Preview" />
                        ) : (
                            <User size={44} color="#cbd5e1" />
                        )}
                    </div>
                    
                    <input 
                        type="file" 
                        id="photo-upload" 
                        style={{ display: 'none' }} 
                        accept="image/*" 
                        onChange={handlePhotoUpload} 
                    />
                    <label 
                        htmlFor="photo-upload" 
                        style={{ 
                            display: 'inline-flex', 
                            alignItems: 'center', 
                            gap: '8px', 
                            padding: '11px 18px', 
                            background: '#f1f5f9', 
                            borderRadius: '10px', 
                            fontSize: '12.5px', 
                            fontWeight: 700, 
                            color: '#334155', 
                            cursor: photoUploading ? 'not-allowed' : 'pointer',
                            border: '1px solid #cbd5e1',
                            transition: 'all 0.15s'
                        }}
                    >
                        {photoUploading ? <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> : <Upload size={15} />}
                        <span>Modifier la photo</span>
                    </label>

                    {photoSuccess && <p style={{ margin: '12px 0 0', fontSize: '11.5px', color: '#10b981', fontWeight: 700 }}>✓ {photoSuccess}</p>}
                    {photoError && <p style={{ margin: '12px 0 0', fontSize: '11.5px', color: '#ef4444', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}><AlertTriangle size={14} /> {photoError}</p>}
                </div>
            </div>

            <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
                {/* Password card */}
                <div className={styles.card} style={{ flex: '1 1 300px', padding: '24px', border: '1px solid #cbd5e1' }}>
                    <h3 style={{ margin: '0 0 16px', fontSize: '14px', fontWeight: 750, display: 'flex', alignItems: 'center', gap: '8px', color: '#334155' }}>
                        <Shield size={16} color={couleurPortail} /> Modifier mon mot de passe
                    </h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        <input 
                            type="password" 
                            placeholder="Mot de passe actuel" 
                            value={oldPwd} 
                            onChange={e => setOldPwd(e.target.value)} 
                            style={{ padding: '11px 14px', borderRadius: '10px', border: '1px solid #e2e8f0', fontSize: '13px', outline: 'none' }} 
                        />
                        <input 
                            type="password" 
                            placeholder="Nouveau mot de passe" 
                            value={newPwd} 
                            onChange={e => setNewPwd(e.target.value)} 
                            style={{ padding: '11px 14px', borderRadius: '10px', border: '1px solid #e2e8f0', fontSize: '13px', outline: 'none' }} 
                        />
                        <input 
                            type="password" 
                            placeholder="Confirmer le nouveau" 
                            value={confirmPwd} 
                            onChange={e => setConfirmPwd(e.target.value)} 
                            style={{ padding: '11px 14px', borderRadius: '10px', border: '1px solid #e2e8f0', fontSize: '13px', outline: 'none' }} 
                        />
                        {pwdError && <p style={{ margin: 0, color: '#ef4444', fontSize: '11.5px', fontWeight: 600 }}>{pwdError}</p>}
                        {pwdSuccess && <p style={{ margin: 0, color: '#10b981', fontSize: '11.5px', fontWeight: 700 }}>{pwdSuccess}</p>}
                        
                        <button 
                            onClick={handlePasswordChange} 
                            disabled={pwdLoading || !oldPwd || !newPwd || !confirmPwd} 
                            style={{ 
                                background: couleurPortail, 
                                color: 'white', 
                                border: 'none', 
                                borderRadius: '10px', 
                                padding: '11px', 
                                fontSize: '13px', 
                                fontWeight: 700, 
                                cursor: (pwdLoading || !oldPwd || !newPwd || !confirmPwd) ? 'not-allowed' : 'pointer', 
                                opacity: (pwdLoading || !oldPwd || !newPwd || !confirmPwd) ? 0.6 : 1,
                                transition: 'opacity 0.2s',
                                boxShadow: `0 4px 12px ${couleurPortail}20`
                            }}
                        >
                            {pwdLoading ? 'Envoi...' : 'Valider le changement'}
                        </button>
                    </div>
                </div>

                {/* Badge Card preview */}
                <div className={styles.card} style={{ flex: '1.3 1 320px', padding: '24px', display: 'flex', flexDirection: 'column', alignItems: 'center', border: '1px solid #cbd5e1' }}>
                    <h3 style={{ margin: '0 0 16px', fontSize: '14px', fontWeight: 750, display: 'flex', alignItems: 'center', gap: '8px', alignSelf: 'flex-start', color: '#334155' }}>
                        <User size={16} color="#10b981" /> Badge & Carte Scolaire Digitale
                    </h3>
                    <p style={{ margin: '0 0 18px', fontSize: '12px', color: '#94a3b8', textAlign: 'center', fontWeight: 550 }}>
                        Téléchargez votre badge officiel.
                    </p>
                    <BadgeCarte 
                        agent={{
                            nom: eleveData.nom || '',
                            prenom: eleveData.prenom || '',
                            matricule: eleveData.matricule || '',
                            photo_url: eleveData.photo_url || undefined,
                            role: 'ÉLÈVE',
                            classe: eleveData.classe || undefined,
                            date_naissance: eleveData.date_naissance,
                            adresse: eleveData.adresse,
                            groupe_sanguin: eleveData.groupe_sanguin
                        }} 
                    />
                </div>
            </div>
        </div>
    );
}
