'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { ArrowLeft, Phone, Mail, MapPin, Calendar, BookOpen, Loader2, MessageSquare, Edit, Droplet, UserCheck, Scan, X, FileText, ChevronRight } from 'lucide-react';
import api from '@/lib/api';
import Link from 'next/link';
import ParentsEleve from '@/components/ParentsEleve';
import BadgeCarte from '@/components/BadgeCarte';
import { QRCodeSVG } from 'qrcode.react';
import { AnimatePresence } from 'framer-motion';

export default function ProfilEleve() {
    const { id } = useParams();
    const router = useRouter();
    const [eleve, setEleve] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [badgeEleve, setBadgeEleve] = useState<any>(null);
    const [qrEleve, setQrEleve] = useState<any>(null);

    useEffect(() => {
        if (!id) return;

        const fetchEleve = async () => {
            try {
                const res = await api.get(`/api/eleves/${id}`);
                setEleve(res.data);
            } catch (error) {
                console.error("Erreur lors du chargement:", error);
            } finally {
                setLoading(false);
            }
        };

        fetchEleve();
    }, [id]);

    const calculateAge = (dob: string) => {
        const birthDate = new Date(dob);
        const today = new Date();
        let age = today.getFullYear() - birthDate.getFullYear();
        const m = today.getMonth() - birthDate.getMonth();
        if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
            age--;
        }
        return age;
    };

    if (loading) {
        return (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh' }}>
                <Loader2 size={40} className="animate-spin" color="var(--brand-primary)" />
            </div>
        );
    }

    if (!eleve) {
        return (
            <div style={{ textAlign: 'center', marginTop: '60px' }}>
                <h3>Élève non trouvé</h3>
                <Link href="/eleves" className="btn btn-outline" style={{ marginTop: '16px' }}>Retour à la liste</Link>
            </div>
        );
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            {/* ─── BADGE MODAL ─── */}
            <AnimatePresence>
                {badgeEleve && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                        onClick={() => setBadgeEleve(null)}>
                        <div onClick={e => e.stopPropagation()} style={{ background: 'transparent', padding: '20px', borderRadius: '16px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '20px' }}>
                            <BadgeCarte 
                                agent={{
                                    nom: badgeEleve.nom,
                                    prenom: badgeEleve.prenom,
                                    matricule: badgeEleve.matricule,
                                    photo_url: badgeEleve.photo_url,
                                    role: 'ÉLÈVE',
                                    classe: badgeEleve.classe?.libelle || badgeEleve.classe_code || undefined,
                                    date_naissance: badgeEleve.date_naissance,
                                    adresse: badgeEleve.adresse,
                                    groupe_sanguin: badgeEleve.groupe_sanguin
                                }} 
                                id="admin-badge-view" 
                            />
                            <button onClick={() => setBadgeEleve(null)} className="btn btn-outline" style={{ color: 'white', borderColor: 'rgba(255,255,255,0.3)' }}>Fermer</button>
                        </div>
                    </motion.div>
                )}
                {/* ─── QR CODE MODAL ─── */}
                {qrEleve && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                        onClick={() => setQrEleve(null)}>
                        <div onClick={e => e.stopPropagation()} style={{ background: 'white', padding: '40px', borderRadius: '24px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '24px', boxShadow: '0 20px 50px rgba(0,0,0,0.3)', position: 'relative' }}>
                            <button onClick={() => setQrEleve(null)} style={{ position: 'absolute', top: '16px', right: '16px', border: 'none', background: '#f1f5f9', borderRadius: '50%', width: '36px', height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                                <X size={20} color="#475569" />
                            </button>
                            <div style={{ textAlign: 'center' }}>
                                <h3 style={{ margin: '0 0 8px 0', fontSize: '20px', fontWeight: 800 }}>Code QR de Pointage</h3>
                                <p style={{ margin: 0, fontSize: '14px', color: '#64748b' }}>{qrEleve.prenom} {qrEleve.nom} • {qrEleve.matricule}</p>
                            </div>
                            <div style={{ padding: '16px', background: 'white', border: '2px dashed #e2e8f0', borderRadius: '16px' }}>
                                <QRCodeSVG value={qrEleve.matricule} size={240} level={"Q"} />
                            </div>
                            <p style={{ margin: 0, fontSize: '12px', color: '#94a3b8', textAlign: 'center', maxWidth: '280px' }}>
                                Vous pouvez scanner ce code avec l'application de pointage pour valider l'identité de cet élève.
                            </p>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Header / Actions */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <Link href="/eleves" className="btn btn-outline btn-sm" style={{ padding: '8px', color: 'var(--text-secondary)' }}>
                        <ArrowLeft size={18} />
                    </Link>
                    <h1 style={{ fontSize: '20px', fontWeight: 800 }}>Dossier de l'Élève</h1>
                </div>
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                    <button onClick={() => setBadgeEleve(eleve)} className="btn btn-primary btn-sm" style={{ fontSize: '13px', background: '#10b981', borderColor: '#10b981' }}>
                        <UserCheck size={14} /> Voir la Carte
                    </button>
                    <button onClick={() => setQrEleve(eleve)} className="btn btn-outline btn-sm" style={{ fontSize: '13px', color: '#3b82f6', borderColor: '#3b82f6' }}>
                        <Scan size={14} /> QR Code
                    </button>
                    <Link href={`/eleves/modifier/${id}`} className="btn btn-outline btn-sm" style={{ fontSize: '13px' }}>
                        <Edit size={14} /> Modifier
                    </Link>
                    <button onClick={() => router.push(`/communication?dest_type=ELEVE&dest_id=${eleve.eleve_id}`)} className="btn btn-primary btn-sm" style={{ fontSize: '13px' }}>
                        <MessageSquare size={14} /> Contacter
                    </button>
                </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(300px, 1fr) 2.2fr', gap: '24px' }}>

                {/* ---------- COLONNE DE GAUCHE (Identité & Infos) ---------- */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

                    {/* Carte Entête Profile */}
                    <motion.div className="card" initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
                        <div style={{ padding: '32px 24px', textAlign: 'center', borderBottom: '1px solid var(--border-light)', position: 'relative', overflow: 'hidden' }}>
                            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '80px', background: 'linear-gradient(135deg, var(--brand-primary) 0%, var(--brand-secondary) 100%)', opacity: 0.8, zIndex: 0 }} />

                            <div className="avatar avatar-xxl" style={{ width: '110px', height: '110px', fontSize: '36px', background: '#fff', color: 'var(--brand-primary)', border: '4px solid #fff', margin: '0 auto 16px', position: 'relative', zIndex: 1, boxShadow: '0 8px 20px rgba(0,0,0,0.1)' }}>
                                {eleve.prenom.charAt(0)}{eleve.nom.charAt(0)}
                            </div>

                            <h2 style={{ fontSize: '20px', fontWeight: 800, marginBottom: '4px' }}>{eleve.prenom} {eleve.nom}</h2>
                            <p style={{ color: 'var(--text-muted)', fontSize: '14px', marginBottom: '16px' }}>
                                Matricule : <code style={{ background: '#f1f5f9', padding: '2px 6px', borderRadius: '4px', fontWeight: 700 }}>{eleve.matricule}</code>
                            </p>

                            <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', marginBottom: '16px' }}>
                                <span className={`badge ${eleve.statut === 'ACTIF' ? 'badge-success' : 'badge-danger'}`}>
                                    {eleve.statut}
                                </span>
                                <span className={`badge ${eleve.sexe === 'M' ? 'badge-info' : 'badge-subtle-danger'}`}>
                                    {eleve.sexe === 'M' ? 'Garçon' : 'Fille'}
                                </span>
                            </div>

                        </div>

                        {/* Infos Personnelles */}
                        <div style={{ padding: '24px' }}>
                            <h5 style={{ fontSize: '13px', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '16px', fontWeight: 700, letterSpacing: '0.5px' }}>
                                Informations Personnelles
                            </h5>

                            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                <li style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                    <Calendar size={18} color="var(--text-muted)" />
                                    <div>
                                        <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Date de naissance</p>
                                        <p style={{ fontWeight: 600, fontSize: '14px' }}>
                                            {new Date(eleve.date_naissance).toLocaleDateString('fr-FR')}
                                            <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}> ({calculateAge(eleve.date_naissance)} ans)</span>
                                        </p>
                                    </div>
                                </li>
                                <li style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                    <MapPin size={18} color="var(--text-muted)" />
                                    <div>
                                        <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Lieu de naissance</p>
                                        <p style={{ fontWeight: 600, fontSize: '14px' }}>{eleve.lieu_naissance || 'Non renseigné'}</p>
                                    </div>
                                </li>
                                {eleve.groupe_sanguin && (
                                    <li style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                        <Droplet size={18} color="#ef4444" />
                                        <div>
                                            <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Groupe Sanguin</p>
                                            <p style={{ fontWeight: 600, fontSize: '14px', color: '#ef4444' }}>{eleve.groupe_sanguin}</p>
                                        </div>
                                    </li>
                                )}
                            </ul>
                        </div>

                        {/* Coordonnées */}
                        <div style={{ padding: '24px', borderTop: '1px solid var(--border-light)', background: '#f8fafc' }}>
                            <h5 style={{ fontSize: '13px', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '16px', fontWeight: 700, letterSpacing: '0.5px' }}>
                                Coordonnées & Adresse
                            </h5>

                            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                <li style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                    <div style={{ padding: '8px', background: 'white', borderRadius: '8px', border: '1px solid var(--border-light)', color: 'var(--text-muted)' }}>
                                        <Phone size={16} />
                                    </div>
                                    <div>
                                        <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Téléphone (Tuteur)</p>
                                        <p style={{ fontWeight: 600, fontSize: '14px' }}>{eleve.telephone || 'Non renseigné'}</p>
                                    </div>
                                </li>
                                <li style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                    <div style={{ padding: '8px', background: 'white', borderRadius: '8px', border: '1px solid var(--border-light)', color: 'var(--text-muted)' }}>
                                        <Mail size={16} />
                                    </div>
                                    <div>
                                        <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Email (Tuteur)</p>
                                        <p style={{ fontWeight: 600, fontSize: '14px' }}>{eleve.email || 'Non renseigné'}</p>
                                    </div>
                                </li>
                                <li style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                    <div style={{ padding: '8px', background: 'white', borderRadius: '8px', border: '1px solid var(--border-light)', color: 'var(--text-muted)' }}>
                                        <MapPin size={16} />
                                    </div>
                                    <div>
                                        <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Adresse</p>
                                        <p style={{ fontWeight: 600, fontSize: '14px' }}>
                                            {eleve.quartier ? `${eleve.quartier}, ` : ''} {eleve.ville || 'Adresse non spécifiée'}
                                        </p>
                                    </div>
                                </li>
                            </ul>
                        </div>
                    </motion.div>

                </div>

                {/* ---------- COLONNE DE DROITE (Académique & Activités) ---------- */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

                    {/* CE QUE CETTE FICHE NE SAIT PAS, ELLE NE L'INVENTE PAS

                        Trois blocs occupaient cette colonne : une moyenne
                        generale de 16,5/20, un emploi du temps (Mathematiques
                        avec M. Diallo en salle 101) et des activites datees de
                        mars 2026. Aucune de ces valeurs ne venait de la base :
                        elles etaient ecrites dans le fichier et s'affichaient
                        a l'identique sur CHAQUE eleve de CHAQUE ecole.

                        Une moyenne inventee sur un dossier scolaire n'est pas
                        un defaut d'affichage : un parent ou un directeur peut
                        decider sur ce chiffre. Les blocs sont retires, et on
                        renvoie vers les ecrans qui detiennent la vraie donnee. */}
                    <motion.div className="card" initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
                        <div className="card-header">
                            <h5>Suivi scolaire</h5>
                        </div>
                        <div className="card-body" style={{ padding: '8px' }}>
                            {[
                                { href: '/notes', icone: <BookOpen size={16} />, titre: 'Notes et evaluations', detail: 'Saisie et consultation des notes par classe' },
                                { href: '/bulletins', icone: <FileText size={16} />, titre: 'Bulletins', detail: 'Bulletins de la classe, par trimestre' },
                                // On emmène directement sur l'emploi du temps de SA classe
                                // (paramètre ?classe=), au lieu de la première classe de l'école.
                                { href: eleve?.classe_id ? `/emploi-du-temps?classe=${eleve.classe_id}` : '/emploi-du-temps', icone: <Calendar size={16} />, titre: 'Emploi du temps', detail: 'Semaine type de la classe' },
                            ].map(l => (
                                <Link key={l.href} href={l.href} style={{
                                    display: 'flex', alignItems: 'center', gap: '12px', padding: '14px 16px',
                                    borderRadius: '10px', textDecoration: 'none', color: 'inherit',
                                }}>
                                    <div style={{ padding: '9px', borderRadius: '9px', background: '#f1f5f9', color: '#475569', display: 'flex' }}>
                                        {l.icone}
                                    </div>
                                    <div style={{ flex: 1 }}>
                                        <p style={{ margin: 0, fontSize: '14px', fontWeight: 700 }}>{l.titre}</p>
                                        <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-muted)' }}>{l.detail}</p>
                                    </div>
                                    <ChevronRight size={16} color="var(--text-muted)" />
                                </Link>
                            ))}
                        </div>
                    </motion.div>

                    {/* Parents : le lien ne se creait qu'a l'inscription et pour
                        un seul contact. On peut desormais ajouter la mere apres
                        le pere, ou rattacher un parent a un eleve inscrit sans. */}
                    {eleve?.eleve_id && <ParentsEleve eleveId={eleve.eleve_id} />}

                </div>

            </div>

        </div>
    );
}
