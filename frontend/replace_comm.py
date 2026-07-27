from pathlib import Path

file_path = Path(r'c:\Users\hp\SMART_SCHOOL_FINAL\frontend\src\app\communication\page.tsx')
content = file_path.read_text(encoding='utf-8')

replacements = [
    # Imports
    (
        "    FileText, Save, CheckCircle2, Search, Edit3, Lock, Eye, AlertCircle, Phone, \n    MessageSquare, Send, CheckCircle, Clock, Check, Building, Trash2, Calendar, Shield, Megaphone, Handshake, ClipboardCheck, Wallet, ScrollText, Play, Filter, MapPin, Plus\n} from 'lucide-react';",
        "    FileText, Save, CheckCircle2, Search, Edit3, Lock, Eye, AlertCircle, Phone, \n    MessageSquare, Send, CheckCircle, Clock, Check, Building, Trash2, Calendar, Shield, Megaphone, Handshake, ClipboardCheck, Wallet, ScrollText, Play, Filter, MapPin, Plus, User, School, Smartphone, XCircle, AlertTriangle, BookOpen, Wand2\n} from 'lucide-react';"
    ),
    (
        "    EMPLOI: { label: 'Emploi du Temps', icon: '📅', color: '#0d9488', bg: '#ccfbf1', lucide: <Calendar size={16} /> },\n    DISCIPLINE: { label: 'Discipline', icon: '⚖️', color: '#dc2626', bg: '#fee2e2', lucide: <Shield size={16} /> },\n    GENERAL: { label: 'Général', icon: '📢', color: '#3b82f6', bg: '#dbeafe', lucide: <Megaphone size={16} /> },\n    REUNION: { label: 'Réunion', icon: '🤝', color: '#7c3aed', bg: '#ede9fe', lucide: <Handshake size={16} /> },\n    EXAMENS: { label: 'Examens', icon: '📝', color: '#f59e0b', bg: '#fef3c7', lucide: <ClipboardCheck size={16} /> },\n    PAIEMENT: { label: 'Paiement', icon: '💰', color: '#059669', bg: '#d1fae5', lucide: <Wallet size={16} /> },\n    BULLETIN: { label: 'Bulletin', icon: '📄', color: '#ea580c', bg: '#fff7ed', lucide: <ScrollText size={16} /> },",
        "    EMPLOI: { label: 'Emploi du Temps', icon: '', color: '#0d9488', bg: '#ccfbf1', lucide: <Calendar size={16} /> },\n    DISCIPLINE: { label: 'Discipline', icon: '', color: '#dc2626', bg: '#fee2e2', lucide: <Shield size={16} /> },\n    GENERAL: { label: 'Général', icon: '', color: '#3b82f6', bg: '#dbeafe', lucide: <Megaphone size={16} /> },\n    REUNION: { label: 'Réunion', icon: '', color: '#7c3aed', bg: '#ede9fe', lucide: <Handshake size={16} /> },\n    EXAMENS: { label: 'Examens', icon: '', color: '#f59e0b', bg: '#fef3c7', lucide: <ClipboardCheck size={16} /> },\n    PAIEMENT: { label: 'Paiement', icon: '', color: '#059669', bg: '#d1fae5', lucide: <Wallet size={16} /> },\n    BULLETIN: { label: 'Bulletin', icon: '', color: '#ea580c', bg: '#fff7ed', lucide: <ScrollText size={16} /> },"
    ),
    (
        "showSuccess('✅ Message envoyé aux parents !');",
        "showSuccess('Message envoyé aux parents !');"
    ),
    (
        "showSuccess(\"✅ Demande envoyée à tous les enseignants !\");",
        "showSuccess(\"Demande envoyée à tous les enseignants !\");"
    ),
    (
        "showSuccess(\"✅ Créneau validé\");",
        "showSuccess(\"Créneau validé\");"
    ),
    (
        "showSuccess(`✅ ${res.data.validated} validées, ${res.data.conflicts} conflits`);",
        "showSuccess(`${res.data.validated} validées, ${res.data.conflicts} conflits`);"
    ),
    (
        "showSuccess(`🪄 ${res.data.total_created} créneaux générés pour ${res.data.classes.length} classes ! Redirection...`);",
        "showSuccess(`${res.data.total_created} créneaux générés pour ${res.data.classes.length} classes ! Redirection...`);"
    ),
    (
        "{isAdmin ? '🔒 Admin' : `👤 ${m.expediteur_nom}`} • {m.date_envoi ? new Date(m.date_envoi).toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'}",
        "{isAdmin ? <><Lock size={14} style={{display:'inline', verticalAlign:'middle'}}/> Admin</> : <><User size={14} style={{display:'inline', verticalAlign:'middle'}}/> {m.expediteur_nom}</>} • {m.date_envoi ? new Date(m.date_envoi).toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'}"
    ),
    (
        "📱 {selectedParentFilter.telephone} • {selectedParentFilter.nb_enfants} enfant(s)",
        "<Smartphone size={14} style={{display:'inline', verticalAlign:'middle'}}/> {selectedParentFilter.telephone} • {selectedParentFilter.nb_enfants} enfant(s)"
    ),
    (
        "{isFromParent ? `👤 ${m.expediteur_nom} → Admin` : `🔒 Admin → ${m.destinataire_nom}`}",
        "{isFromParent ? <><User size={14} style={{display:'inline', verticalAlign:'middle'}}/> {m.expediteur_nom} → Admin</> : <><Lock size={14} style={{display:'inline', verticalAlign:'middle'}}/> Admin → {m.destinataire_nom}</>}"
    ),
    (
        "{ key: 'CLASSE_PARENTS' as const, label: '🏫 Par classe' },",
        "{ key: 'CLASSE_PARENTS' as const, label: <><School size={14} style={{display:'inline', verticalAlign:'middle'}}/> Par classe</> },"
    ),
    (
        "{ key: 'PARENT' as const, label: '👤 Un parent' },",
        "{ key: 'PARENT' as const, label: <><User size={14} style={{display:'inline', verticalAlign:'middle'}}/> Un parent</> },"
    ),
    (
        "{ens.specialite || 'Enseignant'} • {ens.sujets.length} sujet(s) • {ens.nb_valides} ✅ {ens.nb_envoyes} ⏳ {ens.nb_rejetes} ❌",
        "{ens.specialite || 'Enseignant'} • {ens.sujets.length} sujet(s) • {ens.nb_valides} <CheckCircle2 size={12} color=\"#16a34a\" style={{display:'inline', verticalAlign:'middle'}}/> {ens.nb_envoyes} <Clock size={12} color=\"#d97706\" style={{display:'inline', verticalAlign:'middle'}}/> {ens.nb_rejetes} <XCircle size={12} color=\"#dc2626\" style={{display:'inline', verticalAlign:'middle'}}/>"
    ),
    (
        "const stLabel = s.statut === 'VALIDE' ? '✅ Validé' : s.statut === 'REJETE' ? '❌ Rejeté' : s.statut === 'ENVOYE' ? '⏳ En attente' : '📝 Brouillon';",
        "const stLabel = s.statut === 'VALIDE' ? <><CheckCircle2 size={12} style={{display:'inline', verticalAlign:'middle'}}/> Validé</> : s.statut === 'REJETE' ? <><XCircle size={12} style={{display:'inline', verticalAlign:'middle'}}/> Rejeté</> : s.statut === 'ENVOYE' ? <><Clock size={12} style={{display:'inline', verticalAlign:'middle'}}/> En attente</> : <><Edit3 size={12} style={{display:'inline', verticalAlign:'middle'}}/> Brouillon</>;"
    ),
    (
        "<span style={{ fontSize: '16px' }}>📄</span>",
        "<span style={{ fontSize: '16px' }}><FileText size={16} /></span>"
    ),
    (
        "📚 {s.matiere_libelle} • 🕐 {s.duree_minutes} min • {s.fichier_nom}",
        "<BookOpen size={12} style={{display:'inline', verticalAlign:'middle'}}/> {s.matiere_libelle} • <Clock size={12} style={{display:'inline', verticalAlign:'middle'}}/> {s.duree_minutes} min • {s.fichier_nom}"
    ),
    (
        "{generating ? 'Génération en cours...' : confirmGenerate === detailDemande.demande_id ? '⚠️ Confirmer la génération' : '⚡ Générer les Emplois'}",
        "{generating ? 'Génération en cours...' : confirmGenerate === detailDemande.demande_id ? <><AlertTriangle size={14} style={{display:'inline', verticalAlign:'middle'}}/> Confirmer la génération</> : <><Wand2 size={14} style={{display:'inline', verticalAlign:'middle'}}/> Générer les Emplois</>}"
    ),
    (
        "{ens.specialite || 'Enseignant'} • {ens.slots.length} créneaux • {ens.nb_validees} ✅ {ens.nb_rejetees} ❌",
        "{ens.specialite || 'Enseignant'} • {ens.slots.length} créneaux • {ens.nb_validees} <CheckCircle2 size={12} color=\"#16a34a\" style={{display:'inline', verticalAlign:'middle'}}/> {ens.nb_rejetees} <XCircle size={12} color=\"#dc2626\" style={{display:'inline', verticalAlign:'middle'}}/>"
    ),
    (
        "📚 {s.classe_libelle}",
        "<BookOpen size={12} style={{display:'inline', verticalAlign:'middle'}}/> {s.classe_libelle}"
    ),
    (
        "{s.statut === 'VALIDEE' && <span style={{ color: '#16a34a', fontWeight: 700 }}>✅</span>}",
        "{s.statut === 'VALIDEE' && <span style={{ color: '#16a34a', fontWeight: 700 }}><CheckCircle2 size={14} /></span>}"
    ),
    (
        "{s.statut === 'REJETEE' && <span style={{ color: '#dc2626', fontWeight: 700 }}>❌</span>}",
        "{s.statut === 'REJETEE' && <span style={{ color: '#dc2626', fontWeight: 700 }}><XCircle size={14} /></span>}"
    )
]

for old, new in replacements:
    if old not in content:
        print(f"Warning: Could not find chunk:\n{old}\n")
    content = content.replace(old, new)

file_path.write_text(content, encoding='utf-8')
print("Done communication/page.tsx")
