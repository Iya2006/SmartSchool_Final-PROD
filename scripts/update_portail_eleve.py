import re

with open('frontend/src/app/portail-eleve/page.tsx', 'r', encoding='utf-8') as f:
    code = f.read()

# 1. Imports
if 'ExternalLink' not in code:
    code = code.replace('import {', 'import { ExternalLink, Upload, ImageIcon, ', 1)

# 2. Type Tab
code = re.sub(r"type Tab = 'dashboard'.*?;", "type Tab = 'dashboard' | 'notes' | 'emploi' | 'bulletin' | 'absences' | 'messages' | 'fournitures' | 'devoirs' | 'profil' | 'liens';", code)

# 3. State hooks
states_insert = '''
    // Nouveaux états
    const [devoirsData, setDevoirsData] = useState<any[]>([]);
    const [devoirsLoading, setDevoirsLoading] = useState(false);
    const [liens, setLiens] = useState<any[]>([]);
    const [oldPwd, setOldPwd] = useState('');
    const [newPwd, setNewPwd] = useState('');
    const [confirmPwd, setConfirmPwd] = useState('');
    const [pwdLoading, setPwdLoading] = useState(false);
    const [pwdSuccess, setPwdSuccess] = useState('');
    const [pwdError, setPwdError] = useState('');
    const [photoUploading, setPhotoUploading] = useState(false);
    const [photoSuccess, setPhotoSuccess] = useState('');

    useEffect(() => {
        if (typeof window !== 'undefined') {
            try { setLiens(JSON.parse(localStorage.getItem('eleve_liens') || '[]')); } catch {}
        }
    }, []);
'''
code = code.replace('const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);', 'const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);\n' + states_insert)

# 4. Loaders
loaders_insert = '''
    const loadDevoirs = useCallback(async () => {
        if (!eleveId) return;
        setDevoirsLoading(true);
        try {
            const res = await api.get(/api/devoirs/eleve/);
            setDevoirsData(res.data);
        } catch {} finally { setDevoirsLoading(false); }
    }, [eleveId]);
'''
code = code.replace('const loadFournitures = useCallback(async () => {', loaders_insert + '\n    const loadFournitures = useCallback(async () => {')

code = code.replace("if (activeTab === 'fournitures') loadFournitures();", "if (activeTab === 'fournitures') loadFournitures();\n        if (activeTab === 'devoirs') loadDevoirs();")

# 5. Nav items
nav_items = '''
    const navItems: { id: Tab; icon: any; label: string }[] = [
        { id: 'dashboard', icon: Home, label: 'Tableau de Bord' },
        { id: 'notes', icon: BookOpen, label: 'Mes Notes' },
        { id: 'devoirs', icon: BookMarked, label: 'Mes Devoirs' },
        { id: 'emploi', icon: Calendar, label: 'Emploi du Temps' },
        { id: 'bulletin', icon: FileText, label: 'Bulletin' },
        { id: 'absences', icon: Clock, label: 'Absences' },
        { id: 'messages', icon: MessageSquare, label: 'Messages' },
        { id: 'fournitures', icon: ShoppingBag, label: 'Fournitures' },
        { id: 'liens', icon: ExternalLink, label: 'Liens Utiles' },
        { id: 'profil', icon: User, label: 'Mon Profil' },
    ];
'''
code = re.sub(r"const navItems: .*?];", nav_items.strip(), code, flags=re.DOTALL)

# 6. Polling update
code = code.replace("pollRef.current = setInterval(() => refreshDashboard(), 10000);", "pollRef.current = setInterval(() => { refreshDashboard(); loadMessages(); if(activeTab==='devoirs') loadDevoirs(); }, 10000);")

# 7. Render blocks (devoirs, profil, liens)
render_blocks = '''
                        {/* ══ DEVOIRS ══ */}
                        {activeTab === 'devoirs' && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 800 }}>Mes Devoirs</h2>
                                </div>
                                {devoirsLoading ? (
                                    <div style={{ display: 'flex', justifyContent: 'center', padding: '60px' }}><Loader2 size={32} color="#6366f1" style={{ animation: 'spin 1s linear infinite' }} /></div>
                                ) : devoirsData.length === 0 ? (
                                    <div style={{ textAlign: 'center', padding: '60px', background: 'white', borderRadius: '16px' }}>
                                        <BookMarked size={40} style={{ opacity: 0.2, margin: '0 auto 12px' }} />
                                        <p style={{ fontWeight: 600, color: '#94a3b8' }}>Aucun devoir pour le moment</p>
                                    </div>
                                ) : (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                        {devoirsData.map((d: any, i: number) => {
                                            const typeColors: any = { EXERCICE: '#2563eb', RECHERCHE: '#d97706', LECTURE: '#7c3aed', PROJET: '#059669' };
                                            const color = typeColors[d.type_devoir] || '#64748b';
                                            return (
                                                <div key={i} style={{ background: 'white', borderRadius: '16px', border: '1px solid #e2e8f0', padding: '20px' }}>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                                        <div>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                                                                <span style={{ fontSize: '11px', fontWeight: 700, padding: '4px 10px', borderRadius: '20px', background: ${color}15, color: color }}>{d.type_devoir}</span>
                                                                {d.date_limite && <span style={{ fontSize: '12px', color: '#ef4444', fontWeight: 600 }}>⏰ Limite : {new Date(d.date_limite).toLocaleDateString('fr-FR')}</span>}
                                                            </div>
                                                            <h4 style={{ margin: 0, fontSize: '16px', fontWeight: 700 }}>{d.titre}</h4>
                                                            <p style={{ margin: '4px 0 12px', fontSize: '13px', color: '#64748b' }}>{d.matiere} • {d.enseignant}</p>
                                                            {d.description && <p style={{ margin: 0, fontSize: '13px', color: '#334155', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{d.description}</p>}
                                                        </div>
                                                        {d.fichier_path && (
                                                            <a href={${API_BASE}} target="_blank" rel="noreferrer" style={{ background: '#f8fafc', padding: '10px 16px', borderRadius: '10px', textDecoration: 'none', color: '#3b82f6', fontSize: '13px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px', border: '1px solid #e2e8f0' }}>
                                                                <ExternalLink size={16} /> Ouvrir
                                                            </a>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* ══ LIENS EXTERNES ══ */}
                        {activeTab === 'liens' && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 800 }}>Liens Utiles</h2>
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px,1fr))', gap: '16px' }}>
                                    {[
                                        { titre: 'Bibliothèque Numérique', url: 'https://gallica.bnf.fr/', icon: '📚' },
                                        { titre: 'Ressources Mathématiques', url: 'https://khanacademy.org', icon: '🧮' },
                                        { titre: 'Dictionnaire en ligne', url: 'https://larousse.fr', icon: '📖' }
                                    ].map((l, i) => (
                                        <a key={i} href={l.url} target="_blank" rel="noreferrer" style={{ background: 'white', padding: '20px', borderRadius: '16px', textDecoration: 'none', color: 'inherit', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: '16px', transition: 'all 0.2s', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
                                            <div style={{ fontSize: '24px' }}>{l.icon}</div>
                                            <div>
                                                <h4 style={{ margin: 0, fontSize: '15px', fontWeight: 700 }}>{l.titre}</h4>
                                                <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#64748b' }}>Accéder →</p>
                                            </div>
                                        </a>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* ══ PROFIL ══ */}
                        {activeTab === 'profil' && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', maxWidth: '800px' }}>
                                <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 800 }}>Mon Profil</h2>
                                
                                <div style={{ display: 'flex', gap: '20px' }}>
                                    <div style={{ flex: 1, background: 'white', borderRadius: '16px', padding: '24px', border: '1px solid #e2e8f0' }}>
                                        <h3 style={{ margin: '0 0 16px', fontSize: '16px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}><User size={18} color="#6366f1" /> Informations Personnelles</h3>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                                            <div><p style={{ margin: 0, fontSize: '11px', color: '#94a3b8' }}>Nom & Prénom</p><p style={{ margin: '4px 0 0', fontSize: '14px', fontWeight: 600 }}>{eleve.prenom} {eleve.nom}</p></div>
                                            <div><p style={{ margin: 0, fontSize: '11px', color: '#94a3b8' }}>Matricule</p><p style={{ margin: '4px 0 0', fontSize: '14px', fontWeight: 600 }}>{eleve.matricule}</p></div>
                                            <div><p style={{ margin: 0, fontSize: '11px', color: '#94a3b8' }}>Classe</p><p style={{ margin: '4px 0 0', fontSize: '14px', fontWeight: 600 }}>{eleve.classe_code || '—'}</p></div>
                                            <div><p style={{ margin: 0, fontSize: '11px', color: '#94a3b8' }}>Sexe</p><p style={{ margin: '4px 0 0', fontSize: '14px', fontWeight: 600 }}>{eleve.sexe || '—'}</p></div>
                                            <div><p style={{ margin: 0, fontSize: '11px', color: '#94a3b8' }}>Date de naissance</p><p style={{ margin: '4px 0 0', fontSize: '14px', fontWeight: 600 }}>{eleve.date_naissance ? new Date(eleve.date_naissance).toLocaleDateString('fr-FR') : '—'}</p></div>
                                        </div>
                                    </div>
                                </div>

                                <div style={{ display: 'flex', gap: '20px' }}>
                                    {/* Upload Photo */}
                                    <div style={{ flex: 1, background: 'white', borderRadius: '16px', padding: '24px', border: '1px solid #e2e8f0' }}>
                                        <h3 style={{ margin: '0 0 16px', fontSize: '16px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}><Camera size={18} color="#6366f1" /> Photo de Profil</h3>
                                        <p style={{ fontSize: '13px', color: '#64748b', marginBottom: '16px' }}>Envoyez une nouvelle photo. Elle sera soumise à la validation de la direction avant d'être affichée.</p>
                                        <input type="file" id="photo-upload" accept="image/jpeg, image/png, image/webp" style={{ display: 'none' }} onChange={async (e) => {
                                            const file = e.target.files?.[0];
                                            if (!file) return;
                                            setPhotoUploading(true);
                                            setPhotoSuccess('');
                                            try {
                                                const fd = new FormData();
                                                fd.append('fichier', file);
                                                // API call simulates parent upload to trigger admin validation
                                                await api.post(/api/photos/parent-upload/eleve/?parent_id=0, fd);
                                                setPhotoSuccess('Photo envoyée ! En attente de validation.');
                                            } catch {
                                                alert("Erreur lors de l'envoi de la photo.");
                                            } finally { setPhotoUploading(false); e.target.value = ''; }
                                        }} />
                                        <label htmlFor="photo-upload" style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '10px 16px', background: '#f1f5f9', borderRadius: '8px', fontSize: '13px', fontWeight: 600, color: '#334155', cursor: 'pointer' }}>
                                            {photoUploading ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> : <Upload size={16} />}
                                            Choisir une photo
                                        </label>
                                        {photoSuccess && <p style={{ margin: '12px 0 0', fontSize: '12px', color: '#10b981', fontWeight: 600 }}>✓ {photoSuccess}</p>}
                                    </div>

                                    {/* Password */}
                                    <div style={{ flex: 1, background: 'white', borderRadius: '16px', padding: '24px', border: '1px solid #e2e8f0' }}>
                                        <h3 style={{ margin: '0 0 16px', fontSize: '16px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}><Lock size={18} color="#6366f1" /> Sécurité</h3>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                            <input type="password" placeholder="Mot de passe actuel" value={oldPwd} onChange={e => setOldPwd(e.target.value)} style={{ padding: '10px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '13px' }} />
                                            <input type="password" placeholder="Nouveau mot de passe" value={newPwd} onChange={e => setNewPwd(e.target.value)} style={{ padding: '10px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '13px' }} />
                                            <input type="password" placeholder="Confirmer le nouveau" value={confirmPwd} onChange={e => setConfirmPwd(e.target.value)} style={{ padding: '10px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '13px' }} />
                                            {pwdError && <p style={{ margin: 0, color: '#ef4444', fontSize: '12px' }}>{pwdError}</p>}
                                            {pwdSuccess && <p style={{ margin: 0, color: '#10b981', fontSize: '12px' }}>{pwdSuccess}</p>}
                                            <button onClick={async () => {
                                                if (newPwd !== confirmPwd) return setPwdError('Les mots de passe ne correspondent pas.');
                                                setPwdLoading(true); setPwdError(''); setPwdSuccess('');
                                                try {
                                                    await api.post(/api/portail-eleve/eleve//mot-de-passe, { ancien_mdp: oldPwd, nouveau_mdp: newPwd });
                                                    setPwdSuccess('Mot de passe mis à jour.');
                                                    setOldPwd(''); setNewPwd(''); setConfirmPwd('');
                                                } catch (err: any) { setPwdError(err.response?.data?.detail || 'Erreur'); }
                                                finally { setPwdLoading(false); }
                                            }} disabled={pwdLoading || !oldPwd || !newPwd || !confirmPwd} style={{ background: '#6366f1', color: 'white', border: 'none', borderRadius: '8px', padding: '10px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', opacity: (pwdLoading || !oldPwd || !newPwd) ? 0.5 : 1 }}>
                                                {pwdLoading ? 'Mise à jour...' : 'Changer le mot de passe'}
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
'''
code = code.replace("</AnimatePresence>", render_blocks + "\n                    </AnimatePresence>")

with open('frontend/src/app/portail-eleve/page.tsx', 'w', encoding='utf-8') as f:
    f.write(code)

print("DONE")
