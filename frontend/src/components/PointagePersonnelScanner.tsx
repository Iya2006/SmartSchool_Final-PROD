'use client';

import React, { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Html5QrcodeScanner, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { ScanLine, CheckCircle, AlertTriangle, Clock, LogOut, ArrowRightCircle, Users, RefreshCw } from 'lucide-react';
import api from '@/lib/api';
import { useIsMobile } from '@/hooks/useIsMobile';

interface ScanResult {
    success: boolean;
    message: string;
    action: string;
    agent: {
        nom: string;
        role: string;
        matricule: string;
        photo: string;
    };
    heure: string;
}

interface DailyStats {
    total_enregistrements: number;
    presences: number;
    total_arrivees: number;
    total_departs: number;
}

type ActionType = "AUTO" | "ARRIVEE" | "DEPART";

interface Props {
    /** Où aller après validation d'un scan. Absent = on réarme le scan sur
     *  place (cas du surveillant qui enchaîne les pointages sans quitter son
     *  espace). */
    retourHref?: string;
    /** Titre affiché en haut de l'écran. */
    titre?: string;
}

/**
 * Scanner de pointage du PERSONNEL (enseignants/agents) par badge QR.
 *
 * Le même composant sert à l'admin (`/dashboard/presences/scan`) et au
 * surveillant (dans son espace) : c'est le surveillant qui pointe réellement
 * les enseignants. La caméra passe par le navigateur (html5-qrcode), donc le
 * scan marche sur téléphone, tablette et ordinateur (caméra + HTTPS/localhost).
 */
export default function PointagePersonnelScanner({ retourHref, titre = 'Pointage des enseignants' }: Props) {
    const router = useRouter();
    const isMobile = useIsMobile();
    const [scanResult, setScanResult] = useState<ScanResult | null>(null);
    const [isScanning, setIsScanning] = useState(false);
    const [actionType, setActionType] = useState<ActionType>("AUTO");
    const [isMounted, setIsMounted] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);
    const [stats, setStats] = useState<DailyStats>({ total_enregistrements: 0, presences: 0, total_arrivees: 0, total_departs: 0 });
    const scannerRef = useRef<Html5QrcodeScanner | null>(null);

    const fetchTodayStats = async () => {
        try {
            const today = new Date().toISOString().split('T')[0];
            const res = await api.get(`/api/presences-agents/stats?date_debut=${today}&date_fin=${today}`);
            if (res.data && res.data.kpis) {
                setStats({
                    total_enregistrements: res.data.kpis.total_enregistrements || 0,
                    presences: res.data.kpis.presences || 0,
                    total_arrivees: res.data.kpis.total_arrivees || 0,
                    total_departs: res.data.kpis.total_departs || 0
                });
            }
        } catch (error) {
            console.error("Failed to fetch daily stats");
        }
    };

    useEffect(() => {
        setIsMounted(true);
        fetchTodayStats();
    }, []);

    useEffect(() => {
        if (isScanning && !scanResult && !isProcessing) {
            scannerRef.current = new Html5QrcodeScanner(
                "reader",
                {
                    fps: 15,
                    qrbox: (viewfinderWidth: number, viewfinderHeight: number) => {
                        const minEdge = Math.min(viewfinderWidth, viewfinderHeight);
                        return {
                            width: Math.floor(minEdge * 0.85),
                            height: Math.floor(minEdge * 0.85)
                        };
                    },
                    rememberLastUsedCamera: true,
                    formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
                    experimentalFeatures: {
                        useBarCodeDetectorIfSupported: true
                    },
                    videoConstraints: {
                        width: { ideal: 720 },
                        height: { ideal: 720 },
                        facingMode: 'environment',
                    },
                },
                /* verbose= */ false
            );

            scannerRef.current.render(onScanSuccess, onScanFailure);
        } else if (scannerRef.current) {
            try {
                scannerRef.current.clear().catch(error => {
                    console.error("Failed to clear html5QrcodeScanner. ", error);
                });
            } catch (e) {}
            scannerRef.current = null;
        }

        return () => {
            if (scannerRef.current) {
                try {
                    scannerRef.current.clear().catch(e => console.error(e));
                } catch (e) {}
                scannerRef.current = null;
            }
        };
    }, [isScanning, scanResult, isProcessing]);

    const onScanSuccess = async (decodedText: string) => {
        if (isProcessing) return;
        setIsProcessing(true);

        try {
            const response = await api.post('/api/presences-agents/scan', {
                qr_data: decodedText,
                action_type: actionType
            });

            setScanResult(response.data);
            fetchTodayStats();

            if (response.data.success) {
                const audio = new Audio('/success.mp3');
                audio.play().catch(() => {});
            } else {
                const audio = new Audio('/error.mp3');
                audio.play().catch(() => {});
            }
        } catch (error: any) {
            // Pointage RÉSERVÉ AUX ENSEIGNANTS/agents : plus de repli élève.
            setScanResult({
                success: false,
                message: error.response?.data?.detail || error.response?.data?.message || "Badge inconnu ou non attribué à un enseignant.",
                action: "ERREUR",
                agent: { nom: "Inconnu", role: "-", matricule: decodedText, photo: "" },
                heure: new Date().toLocaleTimeString('fr-FR')
            });
        } finally {
            setIsProcessing(false);
        }
    };

    const onScanFailure = (error: any) => {
        // Just ignore continuous scan failures
    };

    // Après « OK » : soit on revient à une page (admin), soit on réarme le scan
    // pour enchaîner le pointage suivant (surveillant, qui reste dans son espace).
    const validateResult = () => {
        if (retourHref) {
            router.push(retourHref);
        } else {
            setScanResult(null);
            setIsScanning(true);
        }
    };

    const formatDate = () => {
        return new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' });
    };

    return (
        <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto', fontFamily: 'Inter, sans-serif' }}>

            {/* Header Title */}
            <div style={{ marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: '#3b82f6', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white' }}>
                    <ScanLine size={20} />
                </div>
                <h1 style={{ fontSize: '24px', fontWeight: 700, color: '#1e293b', margin: 0 }}>{titre}</h1>
            </div>

            {/* Blue Stats Header Box */}
            <div style={{ background: '#1e40af', borderRadius: '16px', padding: '24px', color: 'white', marginBottom: '24px', boxShadow: '0 10px 25px rgba(30,64,175,0.2)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.2)', paddingBottom: '16px', marginBottom: '16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '16px', fontWeight: 600 }}>
                        <Clock size={18} /> Présences du {isMounted ? formatDate() : '...'}
                    </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '16px' }}>
                    <div style={{ background: 'rgba(255,255,255,0.15)', borderRadius: '12px', padding: '16px', textAlign: 'center', backdropFilter: 'blur(10px)' }}>
                        <div style={{ fontSize: '32px', fontWeight: 800 }}>{stats.total_enregistrements}</div>
                        <div style={{ fontSize: '13px', opacity: 0.9, marginTop: '4px' }}>Total pointés</div>
                    </div>
                    <div style={{ background: 'rgba(255,255,255,0.15)', borderRadius: '12px', padding: '16px', textAlign: 'center', backdropFilter: 'blur(10px)' }}>
                        <div style={{ fontSize: '32px', fontWeight: 800 }}>{stats.presences}</div>
                        <div style={{ fontSize: '13px', opacity: 0.9, marginTop: '4px' }}>Présents</div>
                    </div>
                    <div style={{ background: 'rgba(255,255,255,0.15)', borderRadius: '12px', padding: '16px', textAlign: 'center', backdropFilter: 'blur(10px)' }}>
                        <div style={{ fontSize: '32px', fontWeight: 800 }}>{stats.total_arrivees}</div>
                        <div style={{ fontSize: '13px', opacity: 0.9, marginTop: '4px' }}>Arrivées</div>
                    </div>
                    <div style={{ background: 'rgba(255,255,255,0.15)', borderRadius: '12px', padding: '16px', textAlign: 'center', backdropFilter: 'blur(10px)' }}>
                        <div style={{ fontSize: '32px', fontWeight: 800 }}>{stats.total_departs}</div>
                        <div style={{ fontSize: '13px', opacity: 0.9, marginTop: '4px' }}>Départs</div>
                    </div>
                </div>
            </div>

            {/* Pointage réservé au PERSONNEL (enseignants/agents). */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '24px', paddingBottom: '12px', borderBottom: '2px solid #e2e8f0', color: '#3b82f6', fontWeight: 700, fontSize: '15px' }}>
                <Users size={18} /> Pointage du personnel
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1.2fr 1fr', gap: '30px' }}>
                {/* Scanner Section */}
                <div style={{ background: 'white', borderRadius: '24px', padding: '32px', boxShadow: '0 10px 40px rgba(0,0,0,0.08)', border: '1px solid #f1f5f9' }}>

                    <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#1e293b', margin: '0 0 24px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <ScanLine size={20} color="#3b82f6" /> Scanner un QR Code
                    </h2>

                    {/* Action Toggle */}
                    <div style={{ display: 'flex', background: '#0f172a', borderRadius: '16px', padding: '8px', marginBottom: '30px', gap: '10px' }}>
                        <button
                            onClick={() => setActionType('AUTO')}
                            style={{
                                flex: 1, padding: '12px', borderRadius: '12px', border: 'none',
                                background: actionType === 'AUTO' ? '#f1f5f9' : 'transparent',
                                color: actionType === 'AUTO' ? '#0f172a' : '#94a3b8',
                                fontWeight: 700, fontSize: '15px', cursor: 'pointer', transition: 'all 0.3s',
                                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                            }}
                        >
                            <RefreshCw size={18} /> Auto
                        </button>
                        <button
                            onClick={() => setActionType('ARRIVEE')}
                            style={{
                                flex: 1, padding: '12px', borderRadius: '12px', border: 'none',
                                background: actionType === 'ARRIVEE' ? '#10b981' : 'transparent',
                                color: actionType === 'ARRIVEE' ? 'white' : '#94a3b8',
                                fontWeight: 700, fontSize: '15px', cursor: 'pointer', transition: 'all 0.3s',
                                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                            }}
                        >
                            <CheckCircle size={18} /> Arrivée
                        </button>
                        <button
                            onClick={() => setActionType('DEPART')}
                            style={{
                                flex: 1, padding: '12px', borderRadius: '12px', border: 'none',
                                background: actionType === 'DEPART' ? '#f59e0b' : 'transparent',
                                color: actionType === 'DEPART' ? 'white' : '#94a3b8',
                                fontWeight: 700, fontSize: '15px', cursor: 'pointer', transition: 'all 0.3s',
                                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                            }}
                        >
                            <LogOut size={18} /> Départ
                        </button>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '20px' }}>
                        <button
                            onClick={() => setIsScanning(!isScanning)}
                            style={{
                                width: '100%', padding: '14px 20px', borderRadius: '12px', border: 'none',
                                background: isScanning ? '#ef4444' : '#10b981', color: 'white',
                                fontWeight: 700, fontSize: '16px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px',
                                transition: 'all 0.2s', boxShadow: '0 4px 15px rgba(0,0,0,0.1)'
                            }}
                        >
                            {isScanning ? 'Arrêter la caméra' : '▶ Démarrer'}
                        </button>
                    </div>

                    <div style={{
                        background: '#0f172a', borderRadius: '20px', overflow: 'hidden',
                        minHeight: '350px', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        boxShadow: 'inset 0 0 20px rgba(0,0,0,0.5)',
                        border: `4px solid ${actionType === 'ARRIVEE' ? '#10b981' : actionType === 'DEPART' ? '#f59e0b' : '#3b82f6'}`,
                        transition: 'border-color 0.3s'
                    }}>
                        {isScanning && !scanResult ? (
                            <div id="reader" style={{ width: '100%', height: '100%' }}></div>
                        ) : scanResult ? (
                            <div style={{ color: 'white', textAlign: 'center', padding: '20px' }}>
                                <AlertTriangle size={64} style={{ margin: '0 auto 16px', color: scanResult.success ? '#10b981' : '#ef4444' }} />
                                <p style={{ fontSize: '18px', fontWeight: 600 }}>En attente de validation</p>
                                <p style={{ color: '#94a3b8' }}>Veuillez cliquer sur &quot;OK&quot; sur la carte de résultat.</p>
                            </div>
                        ) : (
                            <div style={{ color: '#64748b', textAlign: 'center' }}>
                                <ScanLine size={64} style={{ margin: '0 auto 16px', opacity: 0.5 }} />
                                <p style={{ fontSize: '18px', fontWeight: 500 }}>Caméra désactivée</p>
                                <p style={{ fontSize: '14px' }}>Cliquez sur &quot;Démarrer&quot; pour activer la caméra</p>
                            </div>
                        )}
                    </div>
                </div>

                {/* Result Section */}
                <div style={{ background: 'white', borderRadius: '24px', padding: '32px', boxShadow: '0 10px 40px rgba(0,0,0,0.08)', border: '1px solid #f1f5f9', display: 'flex', flexDirection: 'column' }}>
                    <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#1e293b', margin: '0 0 24px 0', borderBottom: '2px solid #f1f5f9', paddingBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <CheckCircle size={20} color="#10b981" /> Résultat du scan
                    </h2>

                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', borderRadius: '20px' }}>
                        {!scanResult ? (
                            <div style={{ textAlign: 'center', color: '#94a3b8', border: '2px dashed #e2e8f0', borderRadius: '20px', padding: '40px', width: '100%' }}>
                                <div style={{ display: 'inline-block', padding: '20px', borderRadius: '50%', background: '#f8fafc', marginBottom: '20px' }}>
                                    <ScanLine size={48} />
                                </div>
                                <p style={{ margin: 0, fontWeight: 600, fontSize: '18px', color: '#64748b' }}>En attente de scan...</p>
                                <p style={{ fontSize: '14px', marginTop: '8px' }}>Scannez un QR code pour voir le résultat</p>
                            </div>
                        ) : (
                            <div style={{
                                textAlign: 'center', width: '100%',
                                background: scanResult.success ? 'linear-gradient(180deg, #f0fdf4 0%, #ffffff 100%)' : 'linear-gradient(180deg, #fef2f2 0%, #ffffff 100%)',
                                borderRadius: '20px', padding: '30px 20px',
                                border: `2px solid ${scanResult.success ? '#86efac' : '#fca5a5'}`,
                                boxShadow: '0 20px 40px rgba(0,0,0,0.05)',
                                animation: 'fadeIn 0.5s ease-out'
                            }}>
                                <div style={{
                                    width: '120px', height: '120px', borderRadius: '50%', margin: '0 auto 20px',
                                    background: 'white', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    boxShadow: '0 10px 25px rgba(0,0,0,0.1)',
                                    border: `4px solid ${scanResult.success ? '#10b981' : '#ef4444'}`
                                }}>
                                    {scanResult.agent.photo ? (
                                        <img src={scanResult.agent.photo.startsWith('http') ? scanResult.agent.photo : `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8300'}${scanResult.agent.photo.startsWith('/') ? '' : '/'}${scanResult.agent.photo}`} alt="Profil" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                    ) : (
                                        <span style={{ fontSize: '42px', color: '#64748b', fontWeight: 800 }}>
                                            {scanResult.agent.nom.charAt(0)}
                                        </span>
                                    )}
                                </div>

                                <h3 style={{ fontSize: '24px', fontWeight: 800, color: '#0f172a', margin: '0 0 8px 0', textTransform: 'uppercase' }}>
                                    {scanResult.agent.nom}
                                </h3>
                                <div style={{
                                    display: 'inline-block', padding: '6px 16px', background: '#e2e8f0', color: '#334155',
                                    borderRadius: '50px', fontSize: '14px', fontWeight: 700, margin: '0 0 24px 0', letterSpacing: '0.5px'
                                }}>
                                    {scanResult.agent.role} &bull; {scanResult.agent.matricule}
                                </div>

                                <div style={{ display: 'flex', justifyContent: 'center', gap: '20px', marginBottom: '30px' }}>
                                    <div style={{ textAlign: 'center', background: 'white', padding: '16px', borderRadius: '16px', boxShadow: '0 4px 15px rgba(0,0,0,0.05)', border: '1px solid #e2e8f0' }}>
                                        <div style={{ fontSize: '13px', color: '#64748b', marginBottom: '8px', fontWeight: 600 }}>Heure de pointage</div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '22px', fontWeight: 800, color: '#0f172a' }}>
                                            <Clock size={24} color="#3b82f6" /> {scanResult.heure}
                                        </div>
                                    </div>
                                </div>

                                {scanResult.success ? (
                                    <div style={{ marginBottom: '30px', padding: '16px', borderRadius: '16px', background: scanResult.action === 'ARRIVEE' ? '#ecfdf5' : '#fff7ed', color: scanResult.action === 'ARRIVEE' ? '#059669' : '#ea580c', border: `1px solid ${scanResult.action === 'ARRIVEE' ? '#a7f3d0' : '#fed7aa'}`, fontWeight: 600, fontSize: '18px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}>
                                        {scanResult.action === 'ARRIVEE' ? <CheckCircle size={24} /> : <LogOut size={24} />}
                                        {scanResult.message}
                                    </div>
                                ) : (
                                    <div style={{ marginBottom: '30px', padding: '16px', borderRadius: '16px', background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', fontWeight: 600, fontSize: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}>
                                        <AlertTriangle size={24} />
                                        {scanResult.message}
                                    </div>
                                )}

                                <button
                                    onClick={validateResult}
                                    style={{
                                        width: '100%', padding: '16px', borderRadius: '16px', border: 'none',
                                        background: scanResult.success ? '#10b981' : '#3b82f6', color: 'white',
                                        fontSize: '18px', fontWeight: 700, cursor: 'pointer', transition: 'all 0.3s',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px',
                                        boxShadow: scanResult.success ? '0 10px 25px rgba(16,185,129,0.4)' : '0 10px 25px rgba(59,130,246,0.4)'
                                    }}
                                >
                                    OK <ArrowRightCircle size={24} />
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <style dangerouslySetInnerHTML={{ __html: `
                #reader { border: none !important; }
                #reader button { background: #3b82f6; color: white; border: none; padding: 10px 20px; border-radius: 8px; cursor: pointer; font-weight: 600; margin: 10px; font-size: 14px; transition: all 0.2s; }
                #reader button:hover { background: #2563eb; transform: translateY(-2px); }
                #reader a { color: #3b82f6; text-decoration: none; display:none; }
                #reader select { padding: 10px; border-radius: 8px; border: 1px solid #cbd5e1; font-family: inherit; font-size: 14px; outline: none; }

                @keyframes fadeIn {
                    from { opacity: 0; transform: translateY(20px); }
                    to { opacity: 1; transform: translateY(0); }
                }
            ` }} />
        </div>
    );
}
