'use client';

/**
 * Vérification d'une carte scolaire au scan.
 *
 * On scanne le QR d'une carte (élève ou enseignant) — il contient le matricule —
 * ou on le saisit à la main, puis le backend renvoie une FICHE d'identité :
 * identité, classe/matières, établissement, et le contact seulement si le rôle
 * du scanneur y est autorisé. Toutes les valeurs viennent de l'API, jamais du
 * frontend (isolation multi-école côté serveur).
 */
import React, { useEffect, useRef, useState } from 'react';
import { Html5QrcodeScanner, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import {
    ScanLine, IdCard, GraduationCap, User, Phone, MapPin, School,
    BookOpen, Users as UsersIcon, AlertTriangle, Lock, RefreshCw, Search,
} from 'lucide-react';
import api from '@/lib/api';

type Fiche = {
    type: 'ELEVE' | 'ENSEIGNANT';
    identite: { nom: string; prenom: string; matricule: string };
    scolarite?: { classe: string | null; annee_scolaire: string | null; etablissement: string | null };
    parent?: { nom: string | null; telephone: string | null; adresse: string | null } | null;
    contact?: { telephone: string | null; adresse: string | null } | null;
    etablissement?: string | null;
    classes?: string[];
    matieres?: string[];
    contact_masque: boolean;
};

export default function VerifierCartePage() {
    const [scanning, setScanning] = useState(false);
    const [loading, setLoading] = useState(false);
    const [fiche, setFiche] = useState<Fiche | null>(null);
    const [erreur, setErreur] = useState<string | null>(null);
    const [saisie, setSaisie] = useState('');
    const scannerRef = useRef<Html5QrcodeScanner | null>(null);
    const busy = useRef(false);

    const verifier = async (matricule: string) => {
        const m = (matricule || '').trim();
        if (!m) return;
        setLoading(true); setErreur(null); setFiche(null);
        try {
            const res = await api.get(`/api/cartes/verifier/${encodeURIComponent(m)}`);
            setFiche(res.data);
        } catch (e: unknown) {
            const err = e as { response?: { status?: number; data?: { detail?: string } } };
            setErreur(err?.response?.status === 404
                ? (err.response.data?.detail || "Carte inconnue dans cet établissement.")
                : "Vérification impossible. Réessayez.");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (scanning && !fiche) {
            scannerRef.current = new Html5QrcodeScanner('reader', {
                fps: 15,
                qrbox: (w: number, h: number) => {
                    const e = Math.min(w, h);
                    return { width: Math.floor(e * 0.85), height: Math.floor(e * 0.85) };
                },
                rememberLastUsedCamera: true,
                formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
                videoConstraints: { facingMode: 'environment' },
            }, false);
            scannerRef.current.render(async (text: string) => {
                if (busy.current) return;
                busy.current = true;
                setScanning(false);
                await verifier(text);
                busy.current = false;
            }, () => { });
        }
        return () => {
            if (scannerRef.current) {
                try { scannerRef.current.clear().catch(() => { }); } catch { }
                scannerRef.current = null;
            }
        };
    }, [scanning, fiche]);

    const recommencer = () => { setFiche(null); setErreur(null); setSaisie(''); };

    return (
        <div style={{ padding: 'clamp(16px,3vw,28px)', maxWidth: 720, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div>
                <h1 style={{ margin: 0, fontSize: 'clamp(20px,3vw,26px)', fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 10 }}>
                    <IdCard size={24} style={{ color: '#3b82f6' }} /> Vérifier une carte
                </h1>
                <p style={{ margin: '4px 0 0', fontSize: 13.5, color: '#64748b' }}>
                    Scannez le QR d&apos;une carte élève ou enseignant, ou saisissez le matricule.
                </p>
            </div>

            {/* Saisie manuelle + bouton scan */}
            {!fiche && (
                <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <div style={{ position: 'relative', flex: '1 1 220px' }}>
                            <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                            <input value={saisie} onChange={e => setSaisie(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter') verifier(saisie); }}
                                placeholder="Matricule (ex. ELV-… ou ENS-…)"
                                style={{ width: '100%', padding: '11px 12px 11px 36px', borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 14, outline: 'none', boxSizing: 'border-box' }} />
                        </div>
                        <button onClick={() => verifier(saisie)} disabled={loading || !saisie.trim()}
                            style={{ padding: '11px 18px', borderRadius: 10, border: 'none', background: '#3b82f6', color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>
                            Vérifier
                        </button>
                        <button onClick={() => { setErreur(null); setScanning(s => !s); }}
                            style={{ padding: '11px 16px', borderRadius: 10, border: '1px solid #cbd5e1', background: scanning ? '#eff6ff' : '#fff', color: '#334155', fontWeight: 700, fontSize: 14, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                            <ScanLine size={16} /> {scanning ? 'Arrêter' : 'Scanner'}
                        </button>
                    </div>
                    {scanning && <div id="reader" style={{ width: '100%' }} />}
                </div>
            )}

            {loading && (
                <div style={{ textAlign: 'center', color: '#64748b', fontSize: 14, padding: 20 }}>Vérification…</div>
            )}

            {erreur && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', borderRadius: 12, background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', fontSize: 14 }}>
                    <AlertTriangle size={18} /> {erreur}
                </div>
            )}

            {fiche && <FicheCarte fiche={fiche} onReset={recommencer} />}
        </div>
    );
}

function Ligne({ icon, label, valeur }: { icon: React.ReactNode; label: string; valeur: React.ReactNode }) {
    return (
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            <span style={{ color: '#94a3b8', marginTop: 1 }}>{icon}</span>
            <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.4 }}>{label}</div>
                <div style={{ fontSize: 14.5, fontWeight: 600, color: '#0f172a' }}>{valeur ?? '—'}</div>
            </div>
        </div>
    );
}

function FicheCarte({ fiche, onReset }: { fiche: Fiche; onReset: () => void }) {
    const eleve = fiche.type === 'ELEVE';
    const accent = eleve ? '#3b82f6' : '#0d9488';
    return (
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16, overflow: 'hidden' }}>
            <div style={{ background: accent, color: '#fff', padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 10 }}>
                {eleve ? <GraduationCap size={22} /> : <User size={22} />}
                <div style={{ fontWeight: 800, letterSpacing: 1 }}>{eleve ? 'ÉLÈVE' : 'ENSEIGNANT'}</div>
                <div style={{ marginLeft: 'auto', fontSize: 12, opacity: 0.85 }}>SmartSchool</div>
            </div>

            <div style={{ padding: 20, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px,1fr))', gap: 16 }}>
                <Ligne icon={<User size={16} />} label="Nom & Prénom" valeur={`${fiche.identite.prenom} ${fiche.identite.nom}`} />
                <Ligne icon={<IdCard size={16} />} label="Matricule" valeur={fiche.identite.matricule} />

                {eleve && (
                    <>
                        <Ligne icon={<GraduationCap size={16} />} label="Classe" valeur={fiche.scolarite?.classe} />
                        <Ligne icon={<School size={16} />} label="Année scolaire" valeur={fiche.scolarite?.annee_scolaire} />
                        <Ligne icon={<School size={16} />} label="Établissement" valeur={fiche.scolarite?.etablissement} />
                    </>
                )}

                {!eleve && (
                    <>
                        <Ligne icon={<School size={16} />} label="Établissement" valeur={fiche.etablissement} />
                        <Ligne icon={<UsersIcon size={16} />} label="Classes enseignées"
                            valeur={fiche.classes && fiche.classes.length ? fiche.classes.join(', ') : '—'} />
                        <Ligne icon={<BookOpen size={16} />} label="Matières"
                            valeur={fiche.matieres && fiche.matieres.length ? fiche.matieres.join(', ') : '—'} />
                        {fiche.contact && (
                            <>
                                <Ligne icon={<Phone size={16} />} label="Téléphone" valeur={fiche.contact.telephone} />
                                <Ligne icon={<MapPin size={16} />} label="Adresse" valeur={fiche.contact.adresse} />
                            </>
                        )}
                    </>
                )}
            </div>

            {/* Parent (élève) */}
            {eleve && fiche.parent && (
                <div style={{ borderTop: '1px solid #f1f5f9', padding: 20, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px,1fr))', gap: 16 }}>
                    <Ligne icon={<User size={16} />} label="Parent / Responsable" valeur={fiche.parent.nom} />
                    <Ligne icon={<Phone size={16} />} label="Téléphone" valeur={fiche.parent.telephone} />
                    <Ligne icon={<MapPin size={16} />} label="Adresse" valeur={fiche.parent.adresse} />
                </div>
            )}

            {fiche.contact_masque && (
                <div style={{ borderTop: '1px solid #f1f5f9', padding: '12px 20px', display: 'flex', alignItems: 'center', gap: 8, color: '#64748b', fontSize: 13 }}>
                    <Lock size={14} /> Coordonnées masquées — votre rôle n&apos;est pas autorisé à les voir.
                </div>
            )}

            <div style={{ borderTop: '1px solid #f1f5f9', padding: 16, display: 'flex', justifyContent: 'flex-end' }}>
                <button onClick={onReset}
                    style={{ padding: '10px 16px', borderRadius: 10, border: '1px solid #cbd5e1', background: '#fff', color: '#334155', fontWeight: 700, fontSize: 13.5, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <RefreshCw size={15} /> Vérifier une autre carte
                </button>
            </div>
        </div>
    );
}
