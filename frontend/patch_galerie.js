const fs = require('fs');
const path = 'c:\\Users\\hp\\SMART_SCHOOL_FINAL\\frontend\\src\\app\\galerie\\page.tsx';

let code = fs.readFileSync(path, 'utf8');

// Add Clock to imports
code = code.replace(/Camera, Users, GraduationCap, Heart, Loader2,/, 'Camera, Users, GraduationCap, Heart, Loader2, Clock,');

// Add PendingPhoto interface
const pendingInterface = `
interface PendingPhoto {
    photo_id: number;
    entity_type: string;
    entity_id: number;
    name: string;
    uploader_name: string;
    file_path: string;
    date_upload: string;
}
`;
code = code.replace(/interface PersonPhoto {/, pendingInterface + '\ninterface PersonPhoto {');

// Add state for pending photos
code = code.replace(
    /const \[tab, setTab\] = useState<'eleves' \| 'enseignants' \| 'parents'>\(\(searchParams.get\('tab'\) as any\) \|\| 'eleves'\);/,
    `const [tab, setTab] = useState<'eleves' | 'enseignants' | 'parents' | 'attente'>((searchParams.get('tab') as any) || 'eleves');
    const [pendingPhotos, setPendingPhotos] = useState<PendingPhoto[]>([]);`
);

// Add fetch for pending photos
code = code.replace(
    /const res = await api\.get\('\/api\/photos\/galerie\/all'\);\s*setData\(res\.data\);/,
    `const res = await api.get('/api/photos/galerie/all');
            setData(res.data);
            const pendingRes = await api.get('/api/photos/pending/all');
            setPendingPhotos(pendingRes.data);`
);

// Add 'attente' to tabs
code = code.replace(
    /const tabs = \[/,
    `const tabs = [
        { id: 'attente' as const, label: 'En Attente', icon: Clock, count: pendingPhotos.length, photos: pendingPhotos.length, color: '#ef4444' },`
);

// Add the rendering for the 'attente' tab
const attenteTabUI = `
            {/* ═══ EN ATTENTE ═══ */}
            {tab === 'attente' && (
                <motion.div className="card" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                    <div className="card-header">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'linear-gradient(135deg, #ef4444, #f87171)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white' }}>
                                <Clock size={18} />
                            </div>
                            <h5 style={{ margin: 0, fontSize: '15px', fontWeight: 700 }}>
                                Photos en attente de validation ({pendingPhotos.length})
                            </h5>
                        </div>
                    </div>
                    <div style={{ padding: '16px 20px' }}>
                        {pendingPhotos.length === 0 ? (
                            <p style={{ color: '#94a3b8', textAlign: 'center', padding: '20px' }}>Aucune photo en attente.</p>
                        ) : (
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '16px' }}>
                                {pendingPhotos.map(p => (
                                    <div key={p.photo_id} style={{ border: '1px solid #e2e8f0', borderRadius: '12px', overflow: 'hidden', background: '#f8fafc' }}>
                                        <div style={{ height: '180px', width: '100%', background: '#cbd5e1', position: 'relative' }}>
                                            <img src={\`\${API_BASE}\${p.file_path}\`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                            <div style={{ position: 'absolute', top: 8, right: 8, background: 'rgba(0,0,0,0.6)', color: 'white', padding: '2px 8px', borderRadius: '6px', fontSize: '10px', fontWeight: 700 }}>
                                                {p.entity_type.toUpperCase()}
                                            </div>
                                        </div>
                                        <div style={{ padding: '12px' }}>
                                            <p style={{ margin: '0 0 4px', fontWeight: 700, fontSize: '14px' }}>{p.name}</p>
                                            <p style={{ margin: '0 0 12px', fontSize: '11px', color: '#64748b' }}>Envoyé par: {p.uploader_name}</p>
                                            <div style={{ display: 'flex', gap: '8px' }}>
                                                <button onClick={async () => {
                                                    try {
                                                        await api.post(\`/api/photos/validate/\${p.photo_id}\`);
                                                        fetchData();
                                                    } catch (e) { alert('Erreur'); }
                                                }} style={{ flex: 1, padding: '6px', background: '#10b981', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 600 }}>Valider</button>
                                                <button onClick={async () => {
                                                    if(!confirm('Rejeter cette photo ?')) return;
                                                    try {
                                                        await api.post(\`/api/photos/reject/\${p.photo_id}\`);
                                                        fetchData();
                                                    } catch (e) { alert('Erreur'); }
                                                }} style={{ flex: 1, padding: '6px', background: '#ef4444', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 600 }}>Rejeter</button>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </motion.div>
            )}
`;

code = code.replace(/\{\/\* ═══ ENSEIGNANTS ═══ \*\/\}/, attenteTabUI + '\n            {/* ═══ ENSEIGNANTS ═══ */}');

fs.writeFileSync(path, code);
