import React, { useRef, useState, useEffect, useMemo } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Printer, Download, Loader2 } from 'lucide-react';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { motion, AnimatePresence } from 'framer-motion';
import { useApp } from '@/context/AppContext';
import api from '@/lib/api';

interface CarteConfig {
    format?: 'vertical' | 'horizontal' | 'compact';
    colorStart?: string;
    colorEnd?: string;
    gradientAngle?: number;
    logoPosition?: 'left' | 'center' | 'right';
    footerText?: string;
    showQrCode?: boolean;
    showDateNaissance?: boolean;
    showClasse?: boolean;
    showMatricule?: boolean;
    showAdresse?: boolean;
    showGroupeSanguin?: boolean;
    bgImageUrl?: string;
    showMatieres?: boolean;
}

interface BadgeCarteProps {
    agent: {
        nom: string;
        prenom: string;
        matricule: string;
        photo_url?: string | null;
        role?: string;
        classe?: string;
        date_naissance?: string | null;
        adresse?: string | null;
        groupe_sanguin?: string | null;
        enseignant_id?: number;
        matieres?: string;
        specialite?: string;
    };
    id?: string;
    carteConfig?: CarteConfig;
}

export default function BadgeCarte({ agent, id = "badge-carte", carteConfig }: BadgeCarteProps) {
    const { etablissementNom, etablissementLogo, carteConfigEleve, carteConfigEnseignant } = useApp();
    const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
    
    const [fetchedClasses, setFetchedClasses] = useState<string>('');
    const [fetchedMatieres, setFetchedMatieres] = useState<string>('');
    const [isLoadingAffectations, setIsLoadingAffectations] = useState(false);

    const isEnseignant = 
        agent.role === 'ENSEIGNANT' || 
        agent.role === 'Enseignant' ||
        !!agent.enseignant_id || 
        agent.matricule?.startsWith('ENS') ||
        (agent.role && agent.role.toUpperCase() === 'ENSEIGNANT');

    useEffect(() => {
        if (isEnseignant && agent.enseignant_id && !agent.classe && !agent.matieres) {
            setIsLoadingAffectations(true);
            api.get(`/api/enseignants/${agent.enseignant_id}/affectations`)
                .then(res => {
                    const data = res.data;
                    if (Array.isArray(data)) {
                        const uniqueClasses = [...new Set(data.map((a: any) => a.classe_code || a.classe))].join(', ');
                        const uniqueMatieres = [...new Set(data.map((a: any) => a.matiere))].join(', ');
                        setFetchedClasses(uniqueClasses);
                        setFetchedMatieres(uniqueMatieres);
                    }
                })
                .catch(err => console.error("Erreur de chargement des affectations du badge:", err))
                .finally(() => setIsLoadingAffectations(false));
        }
    }, [isEnseignant, agent.enseignant_id, agent.classe, agent.matieres]);

    const getPhotoUrl = (url: string | null | undefined) => {
        if (!url) return '';
        return url.startsWith('http') ? url : `${API_BASE}${url.startsWith('/') ? '' : '/'}${url}`;
    };

    const photoSrc = useMemo(() => {
        const url = agent.photo_url;
        if (!url) return null;
        const cleanUrl = getPhotoUrl(url);
        // Append a badge-specific cache-buster to prevent CORS cache mismatch
        const separator = cleanUrl.includes('?') ? '&' : '?';
        return `${cleanUrl}${separator}cb=badge`;
    }, [agent.photo_url, API_BASE]);
    const badgeRef = useRef<HTMLDivElement>(null);
    const [isExporting, setIsExporting] = useState(false);
    const [isHovered, setIsHovered] = useState(false);
    const [imgError, setImgError] = useState(false);
    const [showDownloadConfirm, setShowDownloadConfirm] = useState(false);
    const [exportError, setExportError] = useState<string | null>(null);
    const [logoError, setLogoError] = useState(false);
    const [bgError, setBgError] = useState(false);



    // Configurations issues des paramètres (fallback sur la config globale du contexte correspondante)
    const config = carteConfig || (isEnseignant ? carteConfigEnseignant : carteConfigEleve) || {};
    const format = config.format || 'vertical';
    const colorStart = config.colorStart || (isEnseignant ? '#581c87' : '#1e293b');
    const colorEnd = config.colorEnd || (isEnseignant ? '#3b0764' : '#0f172a');
    const gradientAngle = config.gradientAngle !== undefined ? config.gradientAngle : 135;
    const logoPosition = config.logoPosition || 'center';
    const footerText = config.footerText || (isEnseignant ? 'SmartSchool — Personnel Enseignant' : 'SmartSchool — Excellence Éducative');
    const showQrCode = config.showQrCode !== false;
    const showDateNaissance = !!config.showDateNaissance;
    const showClasse = config.showClasse !== false;
    const showMatricule = config.showMatricule !== false;
    const showAdresse = !!config.showAdresse;
    const showGroupeSanguin = !!config.showGroupeSanguin;
    const showMatieres = isEnseignant ? (config.showMatieres !== false) : false;
    const bgImageUrl = config.bgImageUrl;

    useEffect(() => { setLogoError(false); }, [etablissementLogo]);
    useEffect(() => { setBgError(false); }, [bgImageUrl]);
    useEffect(() => { setImgError(false); }, [photoSrc]);

    const displayClasses = agent.classe || fetchedClasses || '';
    const displayMatieres = agent.matieres || fetchedMatieres || agent.specialite || '';

    const bgGradient = `linear-gradient(${gradientAngle}deg, ${colorStart}, ${colorEnd})`;

    // Dimensions selon le format
    let width = '320px';
    let height = '500px';
    if (format === 'horizontal') {
        width = '500px';
        height = '320px';
    } else if (format === 'compact') {
        width = '280px';
        height = '400px';
    }

    // Déterminer l'année scolaire en cours
    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth();
    const anneeScolaire = currentMonth >= 8 
        ? `${currentYear}-${currentYear + 1}` 
        : `${currentYear - 1}-${currentYear}`;

    const handlePrint = () => {
        const content = badgeRef.current;
        if (!content) return;
        
        const printWindow = window.open('', '', 'width=800,height=900');
        if (printWindow) {
            printWindow.document.write(`
                <html>
                    <head>
                        <title>Imprimer le Badge - ${agent.matricule}</title>
                        <style>
                            @page { size: auto; margin: 0mm; } 
                            body { 
                                display: flex; 
                                justify-content: center; 
                                align-items: center; 
                                height: 100vh; 
                                margin: 0; 
                                background-color: #fff;
                                -webkit-print-color-adjust: exact;
                                print-color-adjust: exact;
                            }
                        </style>
                    </head>
                    <body>
            `);
            printWindow.document.write(content.outerHTML);
            printWindow.document.write('</body></html>');
            printWindow.document.close();
            printWindow.focus();
            
            // Attendre le chargement des images/styles avant d'imprimer
            setTimeout(() => {
                printWindow.print();
                printWindow.close();
            }, 500);
        }
    };

    const handleExportPDF = async () => {
        if (!badgeRef.current) return;
        setIsExporting(true);
        try {
            // Attendre le chargement complet de toutes les images pour éviter les dimensions à 0
            const imgs = Array.from(badgeRef.current.querySelectorAll('img'));
            await Promise.all(
                imgs.map(
                    img =>
                        new Promise<void>((resolve) => {
                            if (img.complete && img.naturalWidth > 0) {
                                resolve();
                            } else {
                                img.onload = () => resolve();
                                img.onerror = () => resolve();
                            }
                        })
                )
            );

            const canvas = await html2canvas(badgeRef.current, {
                scale: 3, 
                useCORS: true,
                backgroundColor: '#ffffff',
                logging: false,
                allowTaint: false
            });
            const imgData = canvas.toDataURL('image/jpeg', 1.0);
            
            const wVal = format === 'horizontal' ? 500 : (format === 'compact' ? 280 : 320);
            const hVal = format === 'horizontal' ? 320 : (format === 'compact' ? 400 : 500);
            
            const pdf = new jsPDF({
                orientation: format === 'horizontal' ? 'landscape' : 'portrait',
                unit: 'px',
                format: [wVal, hVal]
            });
            
            pdf.addImage(imgData, 'JPEG', 0, 0, wVal, hVal);
            pdf.save(`Badge_Scolaire_${agent.matricule}.pdf`);
        } catch (error) {
            console.error("Erreur lors de l'export PDF:", error);
            setExportError("Une erreur est survenue lors de l'exportation du badge en format PDF. Veuillez vérifier l'image de fond ou réessayer.");
        } finally {
            setIsExporting(false);
        }
    };

    // Compter le nombre de champs actifs pour adapter la mise en page
    const activeFieldsCount = [
        showDateNaissance && agent.date_naissance,
        showClasse && displayClasses,
        showMatieres && displayMatieres,
        showMatricule,
        showAdresse,
        showGroupeSanguin,
        showQrCode
    ].filter(Boolean).length;

    const isCrowded = activeFieldsCount >= 4;

    return (
        <div 
            style={{ position: 'relative', display: 'inline-flex', flexDirection: 'column', alignItems: 'center' }}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
        >
            {/* Le Badge lui-même (contenu à exporter/imprimer) */}
            {format === 'horizontal' ? (
                <div 
                    ref={badgeRef}
                    id={id}
                    style={{
                        width: '500px',
                        height: '320px',
                        background: 'white',
                        borderRadius: '16px',
                        overflow: 'hidden',
                        position: 'relative',
                        boxShadow: '0 10px 30px rgba(0,0,0,0.1)',
                        fontFamily: 'Inter, system-ui, sans-serif',
                        display: 'flex',
                        flexDirection: 'row',
                        border: '1px solid #e2e8f0',
                        boxSizing: 'border-box'
                    }}
                >
                    {/* Background Image Layer (behind content, horizontal) */}
                    {bgImageUrl && !bgError && (
                        <img 
                            src={getPhotoUrl(bgImageUrl)!}
                            alt="background"
                            crossOrigin="anonymous"
                            style={{
                                position: 'absolute',
                                top: 0,
                                left: '180px',
                                width: '320px',
                                height: '100%',
                                objectFit: 'cover',
                                opacity: 0.12,
                                zIndex: 0,
                                pointerEvents: 'none'
                            }}
                            onError={() => setBgError(true)}
                        />
                    )}
                    {/* Section Gauche: Dégradé + Logo + QR Code */}
                    <div style={{
                        width: '180px',
                        background: bgGradient,
                        color: 'white',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: isCrowded ? '12px 10px' : '20px 12px',
                        position: 'relative',
                        borderRight: '1px solid rgba(255,255,255,0.1)',
                        boxSizing: 'border-box'
                    }}>
                        <div style={{ 
                            display: 'flex', 
                            flexDirection: logoPosition === 'left' ? 'row' : (logoPosition === 'right' ? 'row-reverse' : 'column'),
                            alignItems: 'center', 
                            justifyContent: 'center',
                            gap: '8px', 
                            width: '100%',
                            textAlign: 'center' 
                        }}>
                            {etablissementLogo && !logoError && (
                                <img 
                                    src={getPhotoUrl(etablissementLogo)!} 
                                    alt="Logo" 
                                    crossOrigin="anonymous"
                                    style={{ height: '28px', width: '28px', objectFit: 'contain' }} 
                                    onError={() => setLogoError(true)}
                                />
                            )}
                            <h1 style={{ fontSize: '11px', fontWeight: 800, margin: 0, letterSpacing: '0.5px', textTransform: 'uppercase', color: 'white' }}>
                                {etablissementNom || "SMART SCHOOL"}
                            </h1>
                        </div>

                        {showQrCode && (
                            <div style={{ background: 'white', padding: '5px', borderRadius: '8px', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                                <QRCodeSVG 
                                    value={agent.matricule} 
                                    size={isCrowded ? 65 : 80}
                                    bgColor={"#ffffff"}
                                    fgColor={"#0f172a"}
                                    level={"Q"}
                                />
                            </div>
                        )}

                        <p style={{ fontSize: '9px', margin: 0, opacity: 0.8, letterSpacing: '0.5px' }}>
                            ANNÉE {anneeScolaire}
                        </p>
                    </div>

                    {/* Section Droite: Photo & Identité */}
                    <div style={{
                        flex: 1,
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                        padding: isCrowded ? '12px 16px' : '16px 20px',
                        position: 'relative',
                        boxSizing: 'border-box',
                        zIndex: 2,
                    }}>
                        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                            {/* Photo */}
                            <div style={{ 
                                width: isCrowded ? '60px' : '74px', 
                                height: isCrowded ? '60px' : '74px', 
                                borderRadius: '50%', 
                                background: 'white',
                                padding: '3px',
                                boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
                                border: '2px solid rgba(255,255,255,0.9)',
                                boxSizing: 'border-box',
                                flexShrink: 0,
                                marginLeft: isCrowded ? '-30px' : '-40px',
                                zIndex: 12
                            }}>
                                <div style={{ 
                                    width: '100%', 
                                    height: '100%', 
                                    borderRadius: '50%', 
                                    background: '#e2e8f0',
                                    overflow: 'hidden',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center'
                                }}>
                                    {!imgError && photoSrc ? (
                                        <img 
                                            src={photoSrc} 
                                            alt="Photo" 
                                            crossOrigin="anonymous"
                                            style={{ width: '100%', height: '100%', objectFit: 'cover' }} 
                                            onError={() => setImgError(true)}
                                        />
                                    ) : (
                                        <span style={{ fontSize: isCrowded ? '18px' : '22px', color: '#64748b', fontWeight: 700 }}>
                                            {agent.prenom.charAt(0)}{agent.nom.charAt(0)}
                                        </span>
                                    )}
                                </div>
                            </div>

                            {/* Nom & Rôle */}
                            <div style={{ overflow: 'hidden' }}>
                                <h2 style={{ fontSize: isCrowded ? '14px' : '15px', fontWeight: 800, color: '#1e293b', margin: '0 0 2px 0', textTransform: 'uppercase', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                                    {agent.prenom} {agent.nom}
                                </h2>
                                <div style={{ 
                                    display: 'inline-block',
                                    background: isEnseignant ? '#f3e8ff' : '#ecfdf5', 
                                    color: isEnseignant ? '#7e22ce' : '#059669', 
                                    padding: '2px 10px', 
                                    borderRadius: '50px',
                                    fontSize: '9px',
                                    fontWeight: 700,
                                    letterSpacing: '0.5px',
                                    textTransform: 'uppercase'
                                }}>
                                    {agent.role || "ÉLÈVE"}
                                </div>
                            </div>
                        </div>

                        {/* Champs d'information */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: isCrowded ? '1px' : '3px', margin: isCrowded ? '4px 0' : '6px 0', fontSize: isCrowded ? '10px' : '11px', flex: 1, justifyContent: 'center' }}>
                            {showMatricule && (
                                <div style={{ color: '#64748b', fontWeight: 600 }}>
                                    MATRICULE : <span style={{ color: '#0f172a' }}>{agent.matricule}</span>
                                </div>
                            )}
                            {showClasse && displayClasses && (
                                <div style={{ color: '#64748b', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                    {isEnseignant ? 'CLASSES' : 'CLASSE'} : <span style={{ color: '#0f172a' }}>{displayClasses}</span>
                                </div>
                            )}
                            {showMatieres && displayMatieres && (
                                <div style={{ color: '#64748b', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                    MATIÈRES : <span style={{ color: '#0f172a' }}>{displayMatieres}</span>
                                </div>
                            )}
                            {showDateNaissance && agent.date_naissance && (
                                <div style={{ color: '#64748b', fontWeight: 600 }}>
                                    NÉ(E) LE : <span style={{ color: '#0f172a' }}>{agent.date_naissance}</span>
                                </div>
                            )}
                            {showAdresse && (
                                <div style={{ color: '#64748b', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                    ADRESSE : <span style={{ color: agent.adresse ? '#0f172a' : '#cbd5e1', fontStyle: agent.adresse ? 'normal' : 'italic' }}>{agent.adresse || 'Non renseigné'}</span>
                                </div>
                            )}
                            {showGroupeSanguin && (
                                <div style={{ color: '#64748b', fontWeight: 600 }}>
                                    GR. SANGUIN : <span style={{ color: agent.groupe_sanguin ? '#ef4444' : '#cbd5e1', fontWeight: 700, fontStyle: agent.groupe_sanguin ? 'normal' : 'italic' }}>{agent.groupe_sanguin || 'Non renseigné'}</span>
                                </div>
                            )}
                        </div>

                        {/* Pied de page */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #f1f5f9', paddingTop: '4px' }}>
                            <span style={{ fontSize: '9px', color: '#94a3b8', fontWeight: 500, whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden', maxWidth: '260px' }}>
                                {footerText}
                            </span>
                        </div>

                        {/* Barre de couleur du bas */}
                        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '4px', background: `linear-gradient(90deg, ${colorStart}, ${colorEnd})` }}></div>
                    </div>
                </div>
            ) : (
                <div 
                    ref={badgeRef}
                    id={id}
                    style={{
                        width: width,
                        height: height,
                        background: 'white',
                        borderRadius: '16px',
                        overflow: 'hidden',
                        position: 'relative',
                        boxShadow: '0 10px 30px rgba(0,0,0,0.1)',
                        fontFamily: 'Inter, system-ui, sans-serif',
                        display: 'flex',
                        flexDirection: 'column',
                        border: '1px solid #e2e8f0',
                        boxSizing: 'border-box'
                    }}
                >
                    {/* Background Image Layer (behind content, vertical/compact) */}
                    {bgImageUrl && !bgError && (
                        <img 
                            src={getPhotoUrl(bgImageUrl)!}
                            alt="background"
                            crossOrigin="anonymous"
                            style={{
                                position: 'absolute',
                                top: 0,
                                left: 0,
                                width: '100%',
                                height: '100%',
                                objectFit: 'cover',
                                opacity: 0.12,
                                zIndex: 0,
                                pointerEvents: 'none'
                            }}
                            onError={() => setBgError(true)}
                        />
                    )}
                    {/* Background Decorations */}
                    {!bgImageUrl && (
                        <>
                            <div style={{ position: 'absolute', top: '-50px', left: '-50px', width: '200px', height: '200px', background: 'rgba(59, 130, 246, 0.03)', boxShadow: '0 0 80px 40px rgba(59, 130, 246, 0.03)', borderRadius: '50%' }}></div>
                            <div style={{ position: 'absolute', bottom: '-50px', right: '-50px', width: '250px', height: '250px', background: 'rgba(16, 185, 129, 0.02)', boxShadow: '0 0 100px 50px rgba(16, 185, 129, 0.02)', borderRadius: '50%' }}></div>
                        </>
                    )}

                    {/* Header */}
                    <div style={{ 
                        background: bgGradient,
                        color: 'white',
                        padding: format === 'compact' ? (isCrowded ? '12px 12px 24px 12px' : '16px 16px 40px 16px') : (isCrowded ? '16px 16px 36px 16px' : '24px 20px 60px 20px'),
                        textAlign: 'center',
                        position: 'relative',
                        clipPath: 'polygon(0 0, 100% 0, 100% 85%, 0 100%)',
                        boxSizing: 'border-box'
                    }}>
                        <div style={{ 
                            display: 'flex', 
                            flexDirection: logoPosition === 'left' ? 'row' : (logoPosition === 'right' ? 'row-reverse' : 'column'),
                            alignItems: 'center', 
                            justifyContent: 'center', 
                            gap: '8px', 
                            marginBottom: '2px' 
                        }}>
                            {etablissementLogo && !logoError && (
                                <img 
                                    src={getPhotoUrl(etablissementLogo)!} 
                                    alt="Logo" 
                                    crossOrigin="anonymous"
                                    style={{ height: format === 'compact' ? '22px' : '28px', width: format === 'compact' ? '22px' : '28px', objectFit: 'contain' }} 
                                    onError={() => setLogoError(true)}
                                />
                            )}
                            <h1 style={{ fontSize: format === 'compact' ? '11px' : '15px', fontWeight: 800, margin: 0, letterSpacing: '0.5px', textTransform: 'uppercase', color: 'white' }}>
                                {etablissementNom || "SMART SCHOOL"}
                            </h1>
                        </div>
                        <p style={{ fontSize: format === 'compact' ? '8px' : '10px', margin: 0, opacity: 0.8, letterSpacing: '0.5px' }}>
                            ANNÉE SCOLAIRE {anneeScolaire}
                        </p>
                    </div>

                    {/* Photo & Identity */}
                    <div style={{ 
                        flex: 1, 
                        display: 'flex', 
                        flexDirection: 'column', 
                        alignItems: 'center', 
                        marginTop: format === 'compact' ? (isCrowded ? '-18px' : '-30px') : (isCrowded ? '-25px' : '-45px'),
                        position: 'relative',
                        zIndex: 2,
                        boxSizing: 'border-box',
                        width: '100%',
                    }}>
                        {/* Photo */}
                        <div style={{ 
                            width: format === 'compact' ? (isCrowded ? '65px' : '80px') : (isCrowded ? '80px' : '110px'), 
                            height: format === 'compact' ? (isCrowded ? '65px' : '80px') : (isCrowded ? '80px' : '110px'), 
                            borderRadius: '50%', 
                            background: 'white',
                            padding: '4px',
                            boxShadow: '0 4px 15px rgba(0,0,0,0.1)',
                            marginBottom: format === 'compact' ? (isCrowded ? '4px' : '8px') : (isCrowded ? '6px' : '12px'),
                            boxSizing: 'border-box'
                        }}>
                            <div style={{ 
                                width: '100%', 
                                height: '100%', 
                                borderRadius: '50%', 
                                background: '#e2e8f0',
                                overflow: 'hidden',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center'
                             }}>
                                {!imgError && photoSrc ? (
                                    <img 
                                        src={photoSrc} 
                                        alt="Photo" 
                                        crossOrigin="anonymous"
                                        style={{ width: '100%', height: '100%', objectFit: 'cover' }} 
                                        onError={() => setImgError(true)}
                                    />
                                ) : (
                                    <span style={{ fontSize: format === 'compact' ? (isCrowded ? '22px' : '28px') : (isCrowded ? '28px' : '36px'), color: '#64748b', fontWeight: 700 }}>
                                        {agent.prenom.charAt(0)}{agent.nom.charAt(0)}
                                    </span>
                                )}
                            </div>
                        </div>

                        {/* Name & Role */}
                        <h2 style={{ fontSize: format === 'compact' ? (isCrowded ? '13px' : '15px') : (isCrowded ? '16px' : '18px'), fontWeight: 800, color: '#1e293b', margin: '0 0 2px 0', textAlign: 'center', padding: '0 10px', textTransform: 'uppercase' }}>
                            {agent.prenom} {agent.nom}
                        </h2>
                        <div style={{ 
                            background: isEnseignant ? '#f3e8ff' : '#ecfdf5', 
                            color: isEnseignant ? '#7e22ce' : '#059669', 
                            padding: format === 'compact' ? '2px 10px' : '3px 14px', 
                            borderRadius: '50px',
                            fontSize: format === 'compact' ? '9px' : '10px',
                            fontWeight: 700,
                            letterSpacing: '1px',
                            textTransform: 'uppercase',
                            marginBottom: isCrowded ? '4px' : '8px'
                        }}>
                            {agent.role || "ÉLÈVE"}
                        </div>

                        {/* Info details */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: isCrowded ? '1px' : '3px', alignItems: 'center', fontSize: format === 'compact' ? (isCrowded ? '10px' : '11px') : (isCrowded ? '11px' : '12px'), marginBottom: showQrCode ? '0px' : '28px' }}>
                            {showMatricule && (
                                <div style={{ color: '#64748b', fontWeight: 600 }}>
                                    MATRICULE : <span style={{ color: '#0f172a' }}>{agent.matricule}</span>
                                </div>
                            )}
                            {showClasse && displayClasses && (
                                <div style={{ color: '#64748b', fontWeight: 600, textAlign: 'center', padding: '0 10px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: width }}>
                                    {isEnseignant ? 'CLASSES' : 'CLASSE'} : <span style={{ color: '#0f172a' }}>{displayClasses}</span>
                                </div>
                            )}
                            {showMatieres && displayMatieres && (
                                <div style={{ color: '#64748b', fontWeight: 600, textAlign: 'center', padding: '0 10px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: width }}>
                                    MATIÈRES : <span style={{ color: '#0f172a' }}>{displayMatieres}</span>
                                </div>
                            )}
                            {showDateNaissance && agent.date_naissance && (
                                <div style={{ color: '#64748b', fontWeight: 600 }}>
                                    NÉ(E) LE : <span style={{ color: '#0f172a' }}>{agent.date_naissance}</span>
                                </div>
                            )}
                            {showAdresse && (
                                <div style={{ color: '#64748b', fontWeight: 600, textAlign: 'center', padding: '0 10px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: width }}>
                                    ADRESSE : <span style={{ color: agent.adresse ? '#0f172a' : '#cbd5e1', fontStyle: agent.adresse ? 'normal' : 'italic' }}>{agent.adresse || 'Non renseigné'}</span>
                                </div>
                            )}
                            {showGroupeSanguin && (
                                <div style={{ color: '#64748b', fontWeight: 600 }}>
                                    GR. SANGUIN : <span style={{ color: agent.groupe_sanguin ? '#ef4444' : '#cbd5e1', fontWeight: 700, fontStyle: agent.groupe_sanguin ? 'normal' : 'italic' }}>{agent.groupe_sanguin || 'Non renseigné'}</span>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* QR Code Section */}
                    {showQrCode && (
                        <div style={{ 
                            padding: format === 'compact' ? (isCrowded ? '6px' : '10px') : (isCrowded ? '10px 16px 8px 16px' : '16px 20px 12px 20px'), 
                             display: 'flex', 
                             flexDirection: 'column', 
                             alignItems: 'center',
                             borderTop: '1px dashed #e2e8f0',
                             boxSizing: 'border-box',
                             width: '100%',
                             background: '#ffffff',
                             marginBottom: '28px',
                         }}>
                             <div style={{ background: 'white', padding: '4px', borderRadius: '8px', border: '1px solid #f1f5f9' }}>
                                 <QRCodeSVG 
                                     value={agent.matricule} 
                                     size={format === 'compact' ? (isCrowded ? 50 : 65) : (isCrowded ? 65 : 85)}
                                     bgColor={"#ffffff"}
                                     fgColor={"#0f172a"}
                                     level={"Q"}
                                 />
                             </div>
                         </div>
                     )}

                    {/* Custom Footer Text */}
                    <div style={{ 
                         position: 'absolute',
                         bottom: '6px',
                         left: 0,
                         right: 0,
                         textAlign: 'center', 
                         fontSize: format === 'compact' ? '8px' : '9px', 
                         color: '#94a3b8', 
                         fontWeight: 500,
                         whiteSpace: 'nowrap',
                         overflow: 'hidden',
                         textOverflow: 'ellipsis',
                         width: '100%',
                         boxSizing: 'border-box',
                         background: bgImageUrl ? 'transparent' : '#ffffff',
                         zIndex: 3
                     }}>
                         {footerText}
                     </div>
                     
                     {/* Bottom Color Bar */}
                     <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '6px', background: `linear-gradient(90deg, ${colorStart}, ${colorEnd})`, zIndex: 3 }}></div>
                </div>
            )}

            {/* Actions Panel - Affiché uniquement au survol ou si on exporte avec animation */}
            <AnimatePresence>
                {(isHovered || isExporting) && (
                    <motion.div 
                        initial={{ opacity: 0, scale: 0.8, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.8, y: 20 }}
                        transition={{ type: "spring", stiffness: 300, damping: 20 }}
                        style={{
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            right: 0,
                            bottom: 0,
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center',
                            zIndex: 20,
                            pointerEvents: 'none', // Pour ne pas bloquer le survol de la carte
                        }}
                    >
                        <div style={{ pointerEvents: 'auto', display: 'flex', gap: '14px', flexDirection: 'column' }}>
                            <button
                                onClick={handlePrint}
                                style={{
                                    display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px',
                                    padding: '12px 24px', background: 'rgba(30, 41, 59, 0.95)', color: 'white', borderRadius: '50px',
                                    border: '1px solid rgba(255,255,255,0.2)', cursor: 'pointer', fontWeight: 600, fontSize: '14px',
                                    boxShadow: '0 10px 25px rgba(0,0,0,0.3)', backdropFilter: 'blur(8px)',
                                    transition: 'transform 0.2s',
                                }}
                                onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.05)'}
                                onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
                            >
                                <Printer size={16} /> Imprimer
                            </button>
                            <button
                                onClick={() => setShowDownloadConfirm(true)}
                                disabled={isExporting}
                                style={{
                                    display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px',
                                    padding: '12px 24px', background: 'rgba(37, 99, 235, 0.95)', color: 'white', borderRadius: '50px',
                                    border: '1px solid rgba(255,255,255,0.2)', cursor: isExporting ? 'wait' : 'pointer', fontWeight: 600, fontSize: '14px',
                                    boxShadow: '0 10px 25px rgba(37,99,235,0.4)', backdropFilter: 'blur(8px)',
                                    opacity: isExporting ? 0.7 : 1,
                                    transition: 'transform 0.2s',
                                }}
                                onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.05)'}
                                onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
                            >
                                {isExporting ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
                                Télécharger
                            </button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Download Confirmation Modal */}
            <AnimatePresence>
                {showDownloadConfirm && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        style={{
                            position: 'fixed', inset: 0, zIndex: 9999,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            background: 'rgba(0,0,0,0.6)',
                            backdropFilter: 'blur(8px)',
                            padding: '24px',
                        }}
                        onClick={() => setShowDownloadConfirm(false)}
                    >
                        <motion.div
                            initial={{ scale: 0.85, y: 30, opacity: 0 }}
                            animate={{ scale: 1, y: 0, opacity: 1 }}
                            exit={{ scale: 0.85, y: 30, opacity: 0 }}
                            transition={{ type: 'spring', stiffness: 300, damping: 25 }}
                            onClick={(e) => e.stopPropagation()}
                            style={{
                                background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
                                border: '1px solid rgba(255,255,255,0.1)',
                                borderRadius: '24px',
                                padding: '36px 32px',
                                maxWidth: '420px',
                                width: '100%',
                                boxShadow: '0 25px 60px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.05)',
                                textAlign: 'center',
                            }}
                        >
                            {/* Icon */}
                            <div style={{
                                width: '64px', height: '64px', borderRadius: '50%',
                                background: 'linear-gradient(135deg, rgba(37,99,235,0.3), rgba(79,70,229,0.3))',
                                border: '1px solid rgba(37,99,235,0.5)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                margin: '0 auto 20px',
                            }}>
                                <Download size={28} color="#60a5fa" />
                            </div>

                            {/* Title */}
                            <h3 style={{
                                color: '#f1f5f9', fontSize: '20px', fontWeight: 700,
                                margin: '0 0 10px', letterSpacing: '-0.3px',
                            }}>
                                Téléchargement du Badge
                            </h3>

                            {/* Description */}
                            <p style={{
                                color: '#94a3b8', fontSize: '14px', lineHeight: 1.6,
                                margin: '0 0 28px',
                            }}>
                                Voulez-vous exporter la carte scolaire de{' '}
                                <strong style={{ color: '#cbd5e1' }}>
                                    {agent.prenom} {agent.nom}
                                </strong>{' '}
                                en format PDF haute définition ?
                            </p>

                            {/* Actions */}
                            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
                                <button
                                    onClick={() => setShowDownloadConfirm(false)}
                                    style={{
                                        flex: 1, padding: '12px 20px', borderRadius: '12px',
                                        background: 'rgba(255,255,255,0.06)',
                                        border: '1px solid rgba(255,255,255,0.1)',
                                        color: '#94a3b8', fontWeight: 600, fontSize: '14px',
                                        cursor: 'pointer', transition: 'all 0.2s',
                                    }}
                                    onMouseEnter={(e) => {
                                        e.currentTarget.style.background = 'rgba(255,255,255,0.1)';
                                        e.currentTarget.style.color = '#e2e8f0';
                                    }}
                                    onMouseLeave={(e) => {
                                        e.currentTarget.style.background = 'rgba(255,255,255,0.06)';
                                        e.currentTarget.style.color = '#94a3b8';
                                    }}
                                >
                                    Annuler
                                </button>
                                <button
                                    onClick={() => {
                                        setShowDownloadConfirm(false);
                                        handleExportPDF();
                                    }}
                                    disabled={isExporting}
                                    style={{
                                        flex: 1, padding: '12px 20px', borderRadius: '12px',
                                        background: 'linear-gradient(135deg, #2563eb, #4f46e5)',
                                        border: 'none', color: 'white', fontWeight: 700,
                                        fontSize: '14px', cursor: isExporting ? 'wait' : 'pointer',
                                        boxShadow: '0 8px 20px rgba(37,99,235,0.4)',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                                        transition: 'all 0.2s', opacity: isExporting ? 0.7 : 1,
                                    }}
                                    onMouseEnter={(e) => { if (!isExporting) e.currentTarget.style.transform = 'translateY(-1px)'; }}
                                    onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; }}
                                >
                                    {isExporting
                                        ? <Loader2 size={16} className="animate-spin" />
                                        : <Download size={16} />}
                                    Confirmer
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Export Error Modal */}
            <AnimatePresence>
                {exportError && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        style={{
                            position: 'fixed', inset: 0, zIndex: 10000,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            background: 'rgba(0,0,0,0.6)',
                            backdropFilter: 'blur(8px)',
                            padding: '24px',
                        }}
                        onClick={() => setExportError(null)}
                    >
                        <motion.div
                            initial={{ scale: 0.85, y: 30, opacity: 0 }}
                            animate={{ scale: 1, y: 0, opacity: 1 }}
                            exit={{ scale: 0.85, y: 30, opacity: 0 }}
                            transition={{ type: 'spring', stiffness: 300, damping: 25 }}
                            onClick={(e) => e.stopPropagation()}
                            style={{
                                background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
                                border: '1px solid rgba(239,68,68,0.2)',
                                borderRadius: '24px',
                                padding: '36px 32px',
                                maxWidth: '420px',
                                width: '100%',
                                boxShadow: '0 25px 60px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.05)',
                                textAlign: 'center',
                            }}
                        >
                            {/* Icon */}
                            <div style={{
                                width: '64px', height: '64px', borderRadius: '50%',
                                background: 'rgba(239,68,68,0.1)',
                                border: '1px solid rgba(239,68,68,0.3)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                margin: '0 auto 20px',
                            }}>
                                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/>
                                    <line x1="12" y1="9" x2="12" y2="13"/>
                                    <line x1="12" y1="17" x2="12.01" y2="17"/>
                                </svg>
                            </div>

                            {/* Title */}
                            <h3 style={{
                                color: '#f1f5f9', fontSize: '20px', fontWeight: 700,
                                margin: '0 0 10px', letterSpacing: '-0.3px',
                            }}>
                                Échec de l'exportation
                            </h3>

                            {/* Description */}
                            <p style={{
                                color: '#94a3b8', fontSize: '14px', lineHeight: 1.6,
                                margin: '0 0 28px',
                            }}>
                                {exportError}
                            </p>

                            {/* Actions */}
                            <button
                                onClick={() => setExportError(null)}
                                style={{
                                    width: '100%', padding: '12px 20px', borderRadius: '12px',
                                    background: 'linear-gradient(135deg, #ef4444, #b91c1c)',
                                    border: 'none', color: 'white', fontWeight: 700,
                                    fontSize: '14px', cursor: 'pointer',
                                    boxShadow: '0 8px 20px rgba(239,68,68,0.3)',
                                    transition: 'all 0.2s',
                                }}
                                onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-1px)'; }}
                                onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; }}
                            >
                                D'accord
                            </button>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

