'use client';

import React, { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Html5QrcodeScanner, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { ScanLine, CheckCircle, AlertTriangle, Clock, LogOut, Users, GraduationCap } from 'lucide-react';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import { useIsMobile } from '@/hooks/useIsMobile';

interface ScanResult {
    success: boolean;
    message: string;
    action: string;
    eleve: {
        nom: string;
        classe: string;
        matricule: string;
        photo: string;
    };
    heure: string;
}

interface DailyStats {
    total_eleves_actifs: number;
    total_pointages: number;
    presents: number;
    total_arrivees: number;
    total_departs: number;
}

type ActionType = "AUTO" | "ARRIVEE" | "DEPART";

export default function ScanElevesPage() {
    const router = useRouter();
    const isMobile = useIsMobile();
    const [scanResult, setScanResult] = useState<ScanResult | null>(null);
    const [isScanning, setIsScanning] = useState(false);
    const [actionType, setActionType] = useState<ActionType>("AUTO");
    const [isProcessing, setIsProcessing] = useState(false);
    const [stats, setStats] = useState<DailyStats>({ total_eleves_actifs: 0, total_pointages: 0, presents: 0, total_arrivees: 0, total_departs: 0 });
    const scannerRef = useRef<Html5QrcodeScanner | null>(null);
    const [activeTab, setActiveTab] = useState("eleves");

    const fetchTodayStats = async () => {
        try {
            const today = new Date().toISOString().split('T')[0];
            const res = await api.get(`/api/pointage-eleves/stats?date_debut=${today}&date_fin=${today}`);
            if (res.data && res.data.kpis) {
                setStats({
                    total_eleves_actifs: res.data.kpis.total_eleves_actifs || 0,
                    total_pointages: res.data.kpis.total_pointages || 0,
                    presents: res.data.kpis.presents || 0,
                    total_arrivees: res.data.kpis.total_arrivees || 0,
                    total_departs: res.data.kpis.total_departs || 0
                });
            }
        } catch (error) {
            console.error("Failed to fetch daily stats");
        }
    };

    useEffect(() => {
        fetchTodayStats();
        const interval = setInterval(fetchTodayStats, 60000); // refresh stats every minute
        return () => clearInterval(interval);
    }, []);

    const processScan = async (decodedText: string) => {
        if (isProcessing) return;
        setIsProcessing(true);

        try {
            const res = await api.post('/api/pointage-eleves/scan', {
                qr_data: decodedText,
                action_type: actionType
            });
            
            setScanResult(res.data);
            
            if (res.data.success) {
                toast.success(res.data.message);
                fetchTodayStats(); // Refresh stats on success
            } else {
                toast.error(res.data.message);
            }
        } catch (error: any) {
            // Fallback: If not a student, check if it's an Enseignant / Personnel agent!
            try {
                const agentRes = await api.post('/api/presences-agents/scan', {
                    qr_data: decodedText,
                    action_type: actionType
                });
                
                if (agentRes.data) {
                    setScanResult({
                        success: agentRes.data.success,
                        message: agentRes.data.message + " (Pointeuse Enseignant/Personnel)",
                        action: agentRes.data.action,
                        eleve: {
                            nom: agentRes.data.agent.nom,
                            matricule: agentRes.data.agent.matricule,
                            classe: agentRes.data.agent.role,
                            photo: agentRes.data.agent.photo
                        },
                        heure: agentRes.data.heure
                    });
                    if (agentRes.data.success) {
                        toast.success(agentRes.data.message);
                    } else {
                        toast.error(agentRes.data.message);
                    }
                    return;
                }
            } catch (agentError) {
                // If both fail, report original student scan detail or fallback message
            }

            const errorMsg = error.response?.data?.detail || error.response?.data?.message || "Code QR inconnu ou non attribué.";
            toast.error(errorMsg);
            setScanResult({
                success: false,
                message: errorMsg,
                action: "ERREUR",
                eleve: { nom: "Inconnu", role: "", matricule: decodedText, photo: "" } as any,
                heure: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second:'2-digit' })
            });
        } finally {
            if (scannerRef.current) {
                try {
                    scannerRef.current.clear().catch(() => {});
                } catch (e) {}
                scannerRef.current = null;
            }
            setIsScanning(false);
            setIsProcessing(false);
        }
    };

    const startScanner = () => {
        setIsScanning(true);
        setTimeout(() => {
            if (!document.getElementById("qr-reader")) return;
            
            scannerRef.current = new Html5QrcodeScanner(
                "qr-reader",
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
                    // Restreindre au format QR (au lieu de tester tous les formats
                    // supportés à chaque frame) : réglage le plus impactant contre la
                    // lenteur de scan signalée, les badges de l'école n'utilisant que
                    // des QR codes.
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
            
            scannerRef.current.render(
                (decodedText) => {
                    processScan(decodedText);
                },
                (error) => {
                    // Ignore background scan errors
                }
            );
        }, 100);
    };

    const stopScanner = () => {
        if (scannerRef.current) {
            try {
                scannerRef.current.clear().catch(() => {});
            } catch (e) {}
            scannerRef.current = null;
        }
        setIsScanning(false);
    };

    useEffect(() => {
        return () => {
            if (scannerRef.current) {
                scannerRef.current.clear().catch(console.error);
            }
        };
    }, []);

    const handleTabChange = (tab: string) => {
        setActiveTab(tab);
        if (tab === 'personnel') {
            router.push('/dashboard/presences/scan');
        }
    };

    return (
        <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto', fontFamily: '"Inter", sans-serif' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
                <div>
                    <h1 style={{ fontSize: '28px', fontWeight: 800, color: '#1e293b', margin: '0 0 8px 0', letterSpacing: '-0.5px' }}>
                        Borne de Pointage (Élèves)
                    </h1>
                    <p style={{ color: '#64748b', fontSize: '15px', margin: 0 }}>
                        Scannez la carte scolaire pour enregistrer l'entrée ou la sortie de l'établissement.
                    </p>
                </div>
                <div style={{ display: 'flex', background: '#f1f5f9', padding: '4px', borderRadius: '12px' }}>
                    <button onClick={() => handleTabChange('personnel')} style={{
                        padding: '10px 20px', border: 'none', borderRadius: '8px', cursor: 'pointer',
                        background: activeTab === 'personnel' ? 'white' : 'transparent',
                        color: activeTab === 'personnel' ? '#3b82f6' : '#64748b',
                        fontWeight: activeTab === 'personnel' ? 700 : 500,
                        boxShadow: activeTab === 'personnel' ? '0 2px 4px rgba(0,0,0,0.05)' : 'none',
                        display: 'flex', alignItems: 'center', gap: '8px'
                    }}>
                        <Users size={16} /> Personnel & Profs
                    </button>
                    <button onClick={() => handleTabChange('eleves')} style={{
                        padding: '10px 20px', border: 'none', borderRadius: '8px', cursor: 'pointer',
                        background: activeTab === 'eleves' ? 'white' : 'transparent',
                        color: activeTab === 'eleves' ? '#8b5cf6' : '#64748b',
                        fontWeight: activeTab === 'eleves' ? 700 : 500,
                        boxShadow: activeTab === 'eleves' ? '0 2px 4px rgba(0,0,0,0.05)' : 'none',
                        display: 'flex', alignItems: 'center', gap: '8px'
                    }}>
                        <GraduationCap size={16} /> Élèves
                    </button>
                </div>
            </div>

            {/* KPI STATS */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '16px', marginBottom: '32px' }}>
                <div style={{ background: 'white', borderRadius: '16px', padding: '20px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)', border: '1px solid #f1f5f9' }}>
                    <p style={{ margin: '0 0 4px 0', fontSize: '13px', color: '#64748b', fontWeight: 600 }}>Effectif Actif</p>
                    <h3 style={{ margin: 0, fontSize: '24px', fontWeight: 800, color: '#1e293b' }}>{stats.total_eleves_actifs}</h3>
                </div>
                <div style={{ background: 'white', borderRadius: '16px', padding: '20px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)', border: '1px solid #f1f5f9', borderBottom: '4px solid #10b981' }}>
                    <p style={{ margin: '0 0 4px 0', fontSize: '13px', color: '#64748b', fontWeight: 600 }}>Présents Aujourd'hui</p>
                    <h3 style={{ margin: 0, fontSize: '24px', fontWeight: 800, color: '#10b981' }}>{stats.presents}</h3>
                </div>
                <div style={{ background: 'white', borderRadius: '16px', padding: '20px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)', border: '1px solid #f1f5f9', borderBottom: '4px solid #3b82f6' }}>
                    <p style={{ margin: '0 0 4px 0', fontSize: '13px', color: '#64748b', fontWeight: 600 }}>Total Arrivées</p>
                    <h3 style={{ margin: 0, fontSize: '24px', fontWeight: 800, color: '#3b82f6' }}>{stats.total_arrivees}</h3>
                </div>
                <div style={{ background: 'white', borderRadius: '16px', padding: '20px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)', border: '1px solid #f1f5f9', borderBottom: '4px solid #f59e0b' }}>
                    <p style={{ margin: '0 0 4px 0', fontSize: '13px', color: '#64748b', fontWeight: 600 }}>Total Départs</p>
                    <h3 style={{ margin: 0, fontSize: '24px', fontWeight: 800, color: '#f59e0b' }}>{stats.total_departs}</h3>
                </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 400px', gap: '24px' }}>
                {/* SCANNER ZONE */}
                <div style={{ background: 'white', borderRadius: '24px', overflow: 'hidden', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.05)', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column' }}>
                    <div style={{ padding: '20px 24px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <div style={{ background: '#8b5cf6', color: 'white', padding: '8px', borderRadius: '10px' }}>
                                <ScanLine size={20} />
                            </div>
                            <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: '#1e293b' }}>Caméra</h2>
                        </div>
                        
                        <div style={{ display: 'flex', background: 'white', borderRadius: '10px', overflow: 'hidden', border: '1px solid #e2e8f0' }}>
                            <button onClick={() => setActionType("AUTO")} style={{
                                padding: '8px 16px', fontSize: '12px', fontWeight: 600, border: 'none', cursor: 'pointer',
                                background: actionType === "AUTO" ? '#f1f5f9' : 'white',
                                color: actionType === "AUTO" ? '#0f172a' : '#64748b'
                            }}>AUTO</button>
                            <button onClick={() => setActionType("ARRIVEE")} style={{
                                padding: '8px 16px', fontSize: '12px', fontWeight: 600, border: 'none', borderLeft: '1px solid #e2e8f0', cursor: 'pointer',
                                background: actionType === "ARRIVEE" ? '#ecfdf5' : 'white',
                                color: actionType === "ARRIVEE" ? '#10b981' : '#64748b'
                            }}>ENTRÉE</button>
                            <button onClick={() => setActionType("DEPART")} style={{
                                padding: '8px 16px', fontSize: '12px', fontWeight: 600, border: 'none', borderLeft: '1px solid #e2e8f0', cursor: 'pointer',
                                background: actionType === "DEPART" ? '#fffbeb' : 'white',
                                color: actionType === "DEPART" ? '#f59e0b' : '#64748b'
                            }}>SORTIE</button>
                        </div>
                    </div>

                    <div style={{ flex: 1, padding: '24px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '400px' }}>
                        {!isScanning ? (
                            <div style={{ textAlign: 'center' }}>
                                <div style={{ width: '120px', height: '120px', background: '#f1f5f9', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', border: '4px dashed #cbd5e1' }}>
                                    <ScanLine size={48} color="#94a3b8" />
                                </div>
                                <h3 style={{ fontSize: '18px', fontWeight: 600, color: '#334155', marginBottom: '8px' }}>Scanner inactif</h3>
                                <p style={{ color: '#64748b', fontSize: '14px', marginBottom: '24px', maxWidth: '300px' }}>Activez la caméra pour commencer à pointer les cartes scolaires.</p>
                                <button onClick={startScanner} style={{ padding: '12px 24px', background: '#8b5cf6', color: 'white', border: 'none', borderRadius: '12px', fontSize: '15px', fontWeight: 600, cursor: 'pointer', boxShadow: '0 4px 14px rgba(139, 92, 246, 0.4)', transition: 'transform 0.1s' }}>
                                    Activer la caméra
                                </button>
                            </div>
                        ) : (
                            <div style={{ width: '100%', position: 'relative' }}>
                                <div id="qr-reader" style={{ width: '100%', borderRadius: '16px', overflow: 'hidden' }}></div>
                                <button onClick={stopScanner} style={{ position: 'absolute', top: '16px', right: '16px', padding: '8px 16px', background: 'rgba(0,0,0,0.6)', color: 'white', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', backdropFilter: 'blur(4px)' }}>
                                    Désactiver
                                </button>
                            </div>
                        )}
                    </div>
                </div>

                {/* RESULTATS ZONE */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    <div style={{ background: 'white', borderRadius: '24px', overflow: 'hidden', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.05)', border: '1px solid #e2e8f0', flex: 1, display: 'flex', flexDirection: 'column' }}>
                        <div style={{ padding: '20px 24px', background: '#1e293b', color: 'white' }}>
                            <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 700 }}>Dernier Pointage</h2>
                        </div>
                        
                        <div style={{ flex: 1, padding: '24px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                            {scanResult ? (
                                <div style={{ width: '100%', textAlign: 'center' }}>
                                    <div style={{ width: '100px', height: '100px', margin: '0 auto 16px', borderRadius: '50%', overflow: 'hidden', border: `4px solid ${scanResult.success ? (scanResult.action === 'ARRIVEE' ? '#10b981' : '#f59e0b') : '#ef4444'}` }}>
                                        <img 
                                            src={scanResult.eleve?.photo ? `http://localhost:8300${scanResult.eleve.photo}` : '/placeholder-avatar.png'} 
                                            alt={scanResult.eleve?.nom}
                                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                        />
                                    </div>
                                    <h3 style={{ margin: '0 0 4px 0', fontSize: '22px', fontWeight: 800, color: '#1e293b' }}>
                                        {scanResult.eleve?.nom}
                                    </h3>
                                    <p style={{ margin: '0 0 16px 0', fontSize: '14px', color: '#64748b', fontWeight: 600 }}>
                                        Classe : {scanResult.eleve?.classe || '-'} | Mat : {scanResult.eleve?.matricule}
                                    </p>
                                    
                                    <div style={{ 
                                        padding: '16px', 
                                        borderRadius: '16px', 
                                        background: scanResult.success ? (scanResult.action === 'ARRIVEE' ? '#ecfdf5' : '#fffbeb') : '#fef2f2',
                                        color: scanResult.success ? (scanResult.action === 'ARRIVEE' ? '#047857' : '#b45309') : '#b91c1c',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        gap: '10px'
                                    }}>
                                        {scanResult.success ? (
                                            scanResult.action === 'ARRIVEE' ? <CheckCircle size={24} /> : <LogOut size={24} />
                                        ) : <AlertTriangle size={24} />}
                                        <div style={{ textAlign: 'left' }}>
                                            <p style={{ margin: 0, fontSize: '16px', fontWeight: 700 }}>
                                                {scanResult.success ? (scanResult.action === 'ARRIVEE' ? 'ENTRÉE VALIDÉE' : 'SORTIE VALIDÉE') : 'ERREUR'}
                                            </p>
                                            <p style={{ margin: 0, fontSize: '13px', opacity: 0.8 }}>
                                                {scanResult.heure}
                                            </p>
                                        </div>
                                    </div>
                                    
                                    <p style={{ margin: '16px 0 24px 0', fontSize: '14px', color: '#64748b', fontWeight: 500 }}>
                                        {scanResult.message}
                                    </p>
                                    
                                    <button 
                                        onClick={() => {
                                            setScanResult(null);
                                            startScanner();
                                        }}
                                        style={{ 
                                            padding: '12px 24px', background: '#3b82f6', color: 'white', 
                                            border: 'none', borderRadius: '12px', fontSize: '15px', 
                                            fontWeight: 600, cursor: 'pointer', boxShadow: '0 4px 14px rgba(59, 130, 246, 0.4)',
                                            width: '100%'
                                        }}
                                    >
                                        Nouveau Scan
                                    </button>
                                </div>
                            ) : (
                                <div style={{ textAlign: 'center', opacity: 0.5 }}>
                                    <ScanLine size={48} color="#94a3b8" style={{ margin: '0 auto 16px' }} />
                                    <p style={{ margin: 0, fontSize: '15px', fontWeight: 500 }}>En attente de scan...</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
            <style>{`
                #qr-reader a { display: none !important; }
                #qr-reader img[alt="Info icon"] { display: none !important; }
            `}</style>
        </div>
    );
}
