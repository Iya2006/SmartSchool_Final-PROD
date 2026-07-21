'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import {
    Award, Calendar, ClipboardList, Star, ChevronRight,
    Play, CheckCircle, Clock, MessageCircle, Send, BookOpen,
    FileText, CreditCard, Settings, HelpCircle, Database,
    ExternalLink
} from 'lucide-react';
import Link from 'next/link';
import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';

const avatarColors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#6366f1', '#ec4899', '#14b8a6', '#f97316'];

const courses = [
    { title: 'Maîtrisez Figma pour le Design Web & Freelance', author: 'David Smith', tags: ['Figma', 'Design', 'UX'], color: '#6366f1', progress: 72 },
    { title: 'Cours Complet Développement Web 2025 — Sites Modernes', author: 'Vibha Craig', tags: ['Développement', 'Tendance', 'Nouveau'], color: '#3b82f6', progress: 45 },
    { title: 'Le Bootcamp Complet Full-Stack Web', author: 'Angel Yulu', tags: ['Fullstack', 'Développement', 'Web'], color: '#10b981', progress: 30 },
    { title: 'GenAI pour .NET : Construisez des Apps IA avec OpenAI', author: 'Mehmees Ozkaya', tags: ['GenAI', 'OpenAI', 'IA'], color: '#f59e0b', progress: 15 },
];

const upcomingClasses = [
    { subject: 'Mathématiques', topic: 'Algèbre — Équations Linéaires', time: 'Aujourd\'hui, 10h00 - 11h00', icon: '📐', color: '#3b82f6' },
    { subject: 'Chimie', topic: 'Composés Organiques', time: 'Aujourd\'hui, 12h00 - 13h00', icon: '🧪', color: '#10b981' },
    { subject: 'Géographie', topic: 'Zones Climatiques', time: 'Aujourd\'hui, 15h00 - 16h00', icon: '🌍', color: '#f59e0b' },
    { subject: 'Informatique', topic: 'Introduction à Python', time: 'Aujourd\'hui, 17h30 - 18h30', icon: '💻', color: '#6366f1' },
];

const assignmentsList = [
    { title: 'Devoir de Maths — Algèbre', deadline: 'Aujourd\'hui, 18h00', status: 'pending', icon: '📝' },
    { title: 'Rapport de Labo Chimie', deadline: 'Demain, 23h59', status: 'pending', icon: '🧪' },
    { title: 'Exposé Histoire — Seconde Guerre', deadline: 'Mercredi, 10h00', status: 'pending', icon: '📜' },
    { title: 'Dissertation Anglais — Shakespeare', deadline: 'Vendredi, 16h00', status: 'pending', icon: '📖' },
    { title: 'Dissertation Géographie — Zones Climatiques', deadline: 'Soumis', status: 'completed', icon: '🌍' },
    { title: 'Informatique — Les Bases Python', deadline: 'Soumis', status: 'completed', icon: '💻' },
];

const discussions = [
    { author: 'Ethan Walker', text: 'Est-ce que l\'examen couvrira les chapitres 6 et 7 ?', time: 'il y a 5 min', type: 'Question' },
    { author: 'Mme Reynolds', text: 'Oui, l\'examen inclura les deux chapitres. Concentrez-vous sur les exercices de résolution de problèmes.', time: 'il y a 3 min', type: 'Réponse' },
    { author: 'Ethan Walker', text: 'Peut-on soumettre le projet en groupes de trois au lieu de deux ?', time: 'il y a 12 min', type: 'Question' },
    { author: 'Mme Reynolds', text: 'Oui, les groupes de trois sont autorisés, mais assurez-vous que chacun contribue également.', time: 'à l\'instant', type: 'Réponse' },
];

const quickActions = [
    { icon: BookOpen, label: 'Voir les Cours', desc: 'Accéder aux classes', href: '/classes', color: '#3b82f6' },
    { icon: FileText, label: 'Voir les Rapports', desc: 'Vérifier les progrès', href: '/', color: '#10b981' },
    { icon: CreditCard, label: 'Mon Abonnement', desc: 'Paramètres de paiement', href: '/', color: '#f59e0b' },
    { icon: Settings, label: 'Paramètres Profil', desc: 'Mettre à jour les détails', href: '/profil', color: '#6366f1' },
    { icon: HelpCircle, label: 'Aide & Support', desc: 'Obtenir de l\'assistance', href: '/', color: '#ec4899' },
    { icon: Database, label: 'Bibliothèque', desc: 'Matériels d\'étude', href: '/', color: '#14b8a6' },
];

const resources = ['Matériels Pédagogiques', 'Bibliothèque', 'Fichiers Partagés', 'Outils en Ligne', 'Notes', 'eBooks'];

const learningHours = [
    { day: 'Lun', hours: 3 }, { day: 'Mar', hours: 5 }, { day: 'Mer', hours: 2 },
    { day: 'Jeu', hours: 6 }, { day: 'Ven', hours: 4 }, { day: 'Sam', hours: 7 }, { day: 'Dim', hours: 3 },
];

export default function StudentDashboard() {
    const kpis = [
        { label: 'GPA Actuel', value: '3.85', icon: Award, color: '#3b82f6' },
        { label: 'Cours Aujourd\'hui', value: '4', icon: Calendar, color: '#10b981' },
        { label: 'Devoirs à Rendre', value: '3', icon: ClipboardList, color: '#f59e0b' },
        { label: 'Points de Mérite', value: '850', icon: Star, color: '#6366f1' },
    ];

    const attendanceData = [
        { name: 'Présent', value: 42, fill: '#10b981' },
        { name: 'Absent', value: 8, fill: '#ef4444' },
    ];

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

            {/* Breadcrumb */}
            <div className="breadcrumb">
                <Link href="/">Accueil</Link>
                <ChevronRight size={14} />
                <span>Student Dashboard</span>
            </div>

            {/* KPIs */}
            <div className="kpi-grid">
                {kpis.map((kpi, i) => (
                    <motion.div key={i} className="kpi-card" initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                                <p className="kpi-label">{kpi.label}</p>
                                <p className="kpi-value">{kpi.value}</p>
                            </div>
                            <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: `${kpi.color}15`, color: kpi.color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <kpi.icon size={24} />
                            </div>
                        </div>
                    </motion.div>
                ))}
            </div>

            {/* My Learning Path */}
            <motion.div className="card" initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}>
                <div className="card-header">
                    <h5>Mon Parcours d&apos;Apprentissage</h5>
                </div>
                <div className="card-body">
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' }}>
                        {courses.map((course, i) => (
                            <div key={i} style={{ border: '1px solid var(--border-light)', borderRadius: '12px', overflow: 'hidden', transition: 'all 0.2s', cursor: 'pointer' }}
                                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.boxShadow = '0 8px 24px rgba(0,0,0,0.08)'; (e.currentTarget as HTMLElement).style.transform = 'translateY(-4px)'; }}
                                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.boxShadow = 'none'; (e.currentTarget as HTMLElement).style.transform = 'translateY(0)'; }}
                            >
                                <div style={{ height: '120px', background: `linear-gradient(135deg, ${course.color}, ${course.color}88)`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: '36px' }}>
                                    📚
                                </div>
                                <div style={{ padding: '16px' }}>
                                    <p style={{ fontWeight: 700, fontSize: '13px', marginBottom: '4px', lineHeight: '1.4', minHeight: '36px' }}>{course.title}</p>
                                    <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '10px' }}>par {course.author}</p>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: '12px' }}>
                                        {course.tags.map((tag, j) => (
                                            <span key={j} className="badge" style={{ background: `${course.color}12`, color: course.color, fontSize: '10px', padding: '2px 8px' }}>{tag}</span>
                                        ))}
                                    </div>
                                    <div className="progress-bar" style={{ marginBottom: '8px' }}>
                                        <div className="fill" style={{ width: `${course.progress}%`, background: course.color }}></div>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{course.progress}% achevé</span>
                                        <button className="btn btn-primary btn-sm" style={{ padding: '4px 12px', fontSize: '11px' }}>Continuer</button>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </motion.div>

            {/* Row: Upcoming Classes + Assignments */}
            <div className="grid-2">
                <motion.div className="card" initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.45 }}>
                    <div className="card-header">
                        <h5>Cours à Venir</h5>
                    </div>
                    <div className="card-body" style={{ padding: 0 }}>
                        {upcomingClasses.map((cls, i) => (
                            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 24px', borderBottom: i < upcomingClasses.length - 1 ? '1px solid var(--border-light)' : 'none' }}>
                                <div style={{ display: 'flex', gap: '14px', alignItems: 'center' }}>
                                    <div style={{ width: '44px', height: '44px', borderRadius: '10px', background: `${cls.color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px' }}>
                                        {cls.icon}
                                    </div>
                                    <div>
                                        <p style={{ fontWeight: 700, fontSize: '14px' }}>{cls.subject}</p>
                                        <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Topic: {cls.topic}</p>
                                        <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>🕐 {cls.time}</p>
                                    </div>
                                </div>
                                <button className="btn btn-primary btn-sm"><Play size={14} /> Rejoindre</button>
                            </div>
                        ))}
                    </div>
                </motion.div>

                <motion.div className="card" initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}>
                    <div className="card-header">
                        <h5>Devoirs</h5>
                    </div>
                    <div className="card-body scroll-300" style={{ padding: 0 }}>
                        {assignmentsList.map((a, i) => (
                            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 24px', borderBottom: '1px solid var(--border-light)' }}>
                                <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                                    <span style={{ fontSize: '18px' }}>{a.icon}</span>
                                    <div>
                                        <p style={{ fontWeight: 600, fontSize: '14px' }}>{a.title}</p>
                                        <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>🕐 {a.deadline}</p>
                                    </div>
                                </div>
                                <span className={`badge ${a.status === 'completed' ? 'badge-success' : 'badge-warning'}`}>
                                    {a.status === 'completed' ? 'Terminé' : 'En attente'}
                                </span>
                            </div>
                        ))}
                    </div>
                </motion.div>
            </div>

            {/* Row: Learning Hours + Discussion */}
            <div className="grid-2">
                <motion.div className="card" initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.55 }}>
                    <div className="card-header">
                        <h5>Heures d&apos;Apprentissage</h5>
                        <div style={{ display: 'flex', gap: '16px', fontSize: '13px' }}>
                            <span style={{ fontWeight: 700 }}>14 hrs</span>
                            <span style={{ color: 'var(--text-muted)' }}>cette semaine</span>
                        </div>
                    </div>
                    <div className="card-body">
                        <div style={{ height: '220px' }}>
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={learningHours}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                    <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 12 }} />
                                    <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 12 }} unit="h" />
                                    <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
                                    <Bar dataKey="hours" fill="#3b82f6" radius={[6, 6, 0, 0]} barSize={28} name="Heures" />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                </motion.div>

                <motion.div className="card" initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6 }}>
                    <div className="card-header">
                        <h5>Discussion</h5>
                    </div>
                    <div className="card-body scroll-300" style={{ padding: 0 }}>
                        {discussions.map((d, i) => (
                            <div key={i} style={{ display: 'flex', gap: '12px', padding: '14px 24px', borderBottom: '1px solid var(--border-light)' }}>
                                <div className="avatar" style={{ background: d.type === 'Réponse' ? '#10b981' : '#3b82f6', flexShrink: 0, width: '36px', height: '36px', fontSize: '12px' }}>
                                    {d.author.charAt(0)}
                                </div>
                                <div style={{ flex: 1 }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                                        <p style={{ fontWeight: 700, fontSize: '13px' }}>{d.author}</p>
                                        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{d.time}</span>
                                    </div>
                                    <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.5' }}>{d.text}</p>
                                    <span className={`badge ${d.type === 'Réponse' ? 'badge-success' : 'badge-info'}`} style={{ fontSize: '10px', marginTop: '6px' }}>
                                        {d.type}
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>
                </motion.div>
            </div>

            {/* Row: Attendance Donut + Quick Actions */}
            <div className="grid-40-60">
                <motion.div className="card" initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.65 }}>
                    <div className="card-header">
                        <h5>Présence Globale</h5>
                    </div>
                    <div className="card-body">
                        <div style={{ height: '200px' }}>
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie data={attendanceData} cx="50%" cy="50%" innerRadius={60} outerRadius={85} dataKey="value" startAngle={90} endAngle={-270}>
                                        {attendanceData.map((entry, index) => (
                                            <Cell key={index} fill={entry.fill} />
                                        ))}
                                    </Pie>
                                    <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
                                </PieChart>
                            </ResponsiveContainer>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'center', gap: '32px', marginTop: '8px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#10b981' }}></div>
                                <span style={{ fontSize: '13px', fontWeight: 600 }}>42 Présent</span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#ef4444' }}></div>
                                <span style={{ fontSize: '13px', fontWeight: 600 }}>8 Absent</span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: 'var(--border-light)' }}></div>
                                <span style={{ fontSize: '13px', fontWeight: 600 }}>50 Total</span>
                            </div>
                        </div>
                    </div>
                </motion.div>

                <motion.div className="card" initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.7 }}>
                    <div className="card-header">
                        <h5>Actions Rapides</h5>
                    </div>
                    <div className="card-body">
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
                            {quickActions.map((action, i) => (
                                <Link key={i} href={action.href} style={{
                                    display: 'flex', alignItems: 'center', gap: '14px', padding: '18px',
                                    borderRadius: '10px', border: '1px solid var(--border-light)',
                                    transition: 'all 0.2s', textDecoration: 'none', color: 'inherit'
                                }}
                                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = action.color; (e.currentTarget as HTMLElement).style.boxShadow = `0 4px 12px ${action.color}20`; (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)'; }}
                                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-light)'; (e.currentTarget as HTMLElement).style.boxShadow = 'none'; (e.currentTarget as HTMLElement).style.transform = 'translateY(0)'; }}
                                >
                                    <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: `${action.color}15`, color: action.color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                        <action.icon size={20} />
                                    </div>
                                    <div>
                                        <p style={{ fontWeight: 700, fontSize: '13px' }}>{action.label}</p>
                                        <p style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{action.desc}</p>
                                    </div>
                                </Link>
                            ))}
                        </div>
                    </div>
                </motion.div>
            </div>

            {/* Resources & Downloads */}
            <motion.div className="card" initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.75 }}>
                <div className="card-header">
                    <h5>Ressources & Téléchargements</h5>
                </div>
                <div className="card-body">
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '12px' }}>
                        {resources.map((r, i) => (
                            <button key={i} style={{
                                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '8px',
                                padding: '18px 12px', borderRadius: '10px', border: '1px solid var(--border-light)', cursor: 'pointer',
                                transition: 'all 0.2s', background: 'white', textAlign: 'center'
                            }}
                                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = '#3b82f6'; (e.currentTarget as HTMLElement).style.background = '#eff6ff'; }}
                                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-light)'; (e.currentTarget as HTMLElement).style.background = 'white'; }}
                            >
                                <ExternalLink size={18} color="#3b82f6" />
                                <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)' }}>{r}</span>
                            </button>
                        ))}
                    </div>
                </div>
            </motion.div>

        </div>
    );
}
