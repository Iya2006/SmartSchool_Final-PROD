import sys

with open('frontend/src/app/portail-eleve/page.tsx', 'r', encoding='utf-8') as f:
    lines = f.readlines()

new_lines = []
skip = False
for i, line in enumerate(lines):
    if i == 863 and '</motion.div>' in line:
        profil_code = """                        {/* ══ PROFIL ══ */}
                        {activeTab === 'profil' && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 800 }}>Mon Profil</h2>
                                </div>
                                <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
                                    <div style={{ flex: 1, minWidth: '300px', background: 'white', borderRadius: '16px', padding: '24px', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                        <div style={{ width: '100px', height: '100px', borderRadius: '50%', background: '#f1f5f9', marginBottom: '16px', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                            {eleveData?.photo_url ? <img src={`${API_BASE}${eleveData.photo_url}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="Profil" /> : <User size={40} color="#94a3b8" />}
                                        </div>
                                        <input type="file" id="photo-upload" style={{ display: 'none' }} accept="image/*" onChange={async (e) => {
                                            const file = e.target.files?.[0];
                                            if (!file) return;
                                            setPhotoUploading(true); setPhotoSuccess('');
                                            try {
                                                const formData = new FormData();
                                                formData.append('file', file);
                                                await api.post(`/api/photos/upload/eleve/${eleveId}`, formData, { headers: { 'Content-Type': 'multipart/form-data' } });
                                                setPhotoSuccess('Photo envoyée ! En attente de validation.');
                                                try {
                                                    const pendRes = await api.get(`/api/photos/pending/eleve/${eleveId}`);
                                                    setPendingPhoto(pendRes.data);
                                                } catch(err) {}
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
                                    <div style={{ flex: 1, minWidth: '300px', background: 'white', borderRadius: '16px', padding: '24px', border: '1px solid #e2e8f0' }}>
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
                                                    await api.post(`/api/portail-eleve/eleve/${eleveId}/mot-de-passe`, { ancien_mdp: oldPwd, nouveau_mdp: newPwd });
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
"""
        new_lines.append(profil_code)
        continue
    
    if i == 1087 and '</motion.div>' in line:
        new_lines.append('                    </motion.div>\n')
        continue
        
    if i == 1088 and '</AnimatePresence>' in line:
        new_lines.append('                    </AnimatePresence>\n')
        continue

    new_lines.append(line)

with open('frontend/src/app/portail-eleve/page.tsx', 'w', encoding='utf-8') as f:
    f.writelines(new_lines)
print('Done!')
