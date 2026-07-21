const fs = require('fs');
const path = 'c:\\Users\\hp\\SMART_SCHOOL_FINAL\\frontend\\src\\app\\portail-parent\\page.tsx';

let code = fs.readFileSync(path, 'utf8');

// Add pending photos state
code = code.replace(
    /const \[showProfileDropdown, setShowProfileDropdown\] = useState\(false\);/,
    `const [showProfileDropdown, setShowProfileDropdown] = useState(false);
    const [pendingPhotos, setPendingPhotos] = useState<Record<string, any>>({});`
);

// Add fetch function for pending photos
const fetchPendingPhotosStr = `
              // Fetch pending photos
              const fetchPending = async () => {
                  try {
                      const pData: Record<string, any> = {};
                      
                      // For parent
                      try {
                          const r1 = await api.get(\`/api/photos/pending/parent/\${parentId}\`);
                          if(r1.data) pData[\`parent_\${parentId}\`] = r1.data;
                      } catch(e) {}
                      
                      // For children
                      if (res.data.enfants) {
                          for (const enfant of res.data.enfants) {
                              try {
                                  const r2 = await api.get(\`/api/photos/pending/eleve/\${enfant.eleve_id}\`);
                                  if(r2.data) pData[\`eleve_\${enfant.eleve_id}\`] = r2.data;
                              } catch(e) {}
                          }
                      }
                      setPendingPhotos(pData);
                  } catch(e) {}
              };
              fetchPending();
`;

code = code.replace(/setData\(res\.data\);/, 'setData(res.data);\n' + fetchPendingPhotosStr);

// In the Profile Modal for Parent
const parentProfileUpload = `
                                                                      setPhotoSuccess('Photo envoyée et en attente de validation !');
                                                                      setTimeout(() => setPhotoSuccess(null), 4000);
                                                                      // Refresh pending
                                                                      try {
                                                                          const r = await api.get(\`/api/photos/pending/parent/\${data.parent.parent_id}\`);
                                                                          if(r.data) setPendingPhotos(prev => ({...prev, [\`parent_\${data.parent.parent_id}\`]: r.data}));
                                                                      } catch(e) {}
`;
code = code.replace(/setPhotoSuccess\('Photo envoyée avec succès !'\);\s*setTimeout\(\(\) => setPhotoSuccess\(null\), 4000\);/, parentProfileUpload);

// In the Child profile view
const childProfileUpload = `
                                                          setPhotoSuccess('Photo envoyée et en attente de validation !');
                                                          setTimeout(() => setPhotoSuccess(null), 4000);
                                                          // Refresh pending
                                                          try {
                                                              const r = await api.get(\`/api/photos/pending/\${type}/\${id}\`);
                                                              if(r.data) setPendingPhotos(prev => ({...prev, [\`\${type}_\${id}\`]: r.data}));
                                                          } catch(e) {}
`;
code = code.replace(/setPhotoSuccess\('Photo mise à jour avec succès !'\);\s*setTimeout\(\(\) => setPhotoSuccess\(null\), 3000\);/, childProfileUpload);

// Add the badge for parent profile
const parentBadge = `
                                                      {pendingPhotos[\`parent_\${data.parent.parent_id}\`] && (
                                                          <div style={{ position: 'absolute', bottom: -10, left: '50%', transform: 'translateX(-50%)', background: '#f59e0b', color: 'white', fontSize: '10px', padding: '2px 8px', borderRadius: '10px', whiteSpace: 'nowrap', zIndex: 10 }}>
                                                              En attente
                                                          </div>
                                                      )}
`;
code = code.replace(/<Camera size=\{16\} \/>\s*<\/div>\s*<\/label>/, `<Camera size={16} /></div></label>${parentBadge}`);

// Add the badge/button for child profile
const childBadge = `
                                              {pendingPhotos[\`eleve_\${enfant.eleve_id}\`] && (
                                                  <div style={{ marginTop: '10px', background: '#fffbeb', border: '1px solid #fcd34d', padding: '10px', borderRadius: '8px', textAlign: 'center' }}>
                                                      <p style={{ fontSize: '12px', color: '#b45309', margin: '0 0 8px', fontWeight: 600 }}>Une photo est en attente de validation.</p>
                                                      <button onClick={async () => {
                                                          if(!confirm('Annuler cette photo ?')) return;
                                                          try {
                                                              await api.post(\`/api/photos/reject/\${pendingPhotos[\`eleve_\${enfant.eleve_id}\`].photo_id}\`);
                                                              setPendingPhotos(prev => { const n = {...prev}; delete n[\`eleve_\${enfant.eleve_id}\`]; return n; });
                                                          } catch(e) { alert('Erreur'); }
                                                      }} style={{ padding: '6px 12px', background: '#ef4444', color: 'white', border: 'none', borderRadius: '6px', fontSize: '11px', cursor: 'pointer', fontWeight: 600 }}>Annuler / Supprimer</button>
                                                  </div>
                                              )}
`;
code = code.replace(/<Camera size=\{20\} \/>\s*<\/div>\s*<\/label>\s*<\/div>\s*<\/div>/g, `<Camera size={20} /></div></label></div>${childBadge}</div>`);

fs.writeFileSync(path, code);
