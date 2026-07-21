const fs = require('fs');
const path = 'c:\\Users\\hp\\SMART_SCHOOL_FINAL\\frontend\\src\\app\\portail-eleve\\page.tsx';

let code = fs.readFileSync(path, 'utf8');

// Add pending photo state
code = code.replace(
    /const \[showProfileDropdown, setShowProfileDropdown\] = useState\(false\);/,
    `const [showProfileDropdown, setShowProfileDropdown] = useState(false);
    const [pendingPhoto, setPendingPhoto] = useState<any>(null);`
);

// Add fetch pending photo when loading dashboard
const fetchPendingPhoto = `
            const res = await api.get(\`/api/portail-eleve/\${eid}/dashboard\`);
            setData(res.data);
            try {
                const pendRes = await api.get(\`/api/photos/pending/eleve/\${eid}\`);
                setPendingPhoto(pendRes.data);
            } catch(e) {}
`;
code = code.replace(/const res = await api\.get\(`\/api\/portail-eleve\/\$\{eid\}\/dashboard`\);\s*setData\(res\.data\);/, fetchPendingPhoto);

// Same for the other place where dashboard is loaded (during login)
const fetchPendingPhotoLogin = `
            const dash = await api.get(\`/api/portail-eleve/\${eid}/dashboard\`);
            setData(dash.data);
            try {
                const pendRes = await api.get(\`/api/photos/pending/eleve/\${eid}\`);
                setPendingPhoto(pendRes.data);
            } catch(e) {}
`;
code = code.replace(/const dash = await api\.get\(`\/api\/portail-eleve\/\$\{eid\}\/dashboard`\);\s*setData\(dash\.data\);/, fetchPendingPhotoLogin);


// In profile modal (upload response)
const uploadPhotoUpdate = `
                                                setPhotoSuccess('Photo envoyée ! En attente de validation.');
                                                // Refresh pending
                                                try {
                                                    const pendRes = await api.get(\`/api/photos/pending/eleve/\${eleveId}\`);
                                                    setPendingPhoto(pendRes.data);
                                                } catch(e) {}
`;
code = code.replace(/setPhotoSuccess\('Photo envoyée ! En attente de validation\.'\);/, uploadPhotoUpdate);


// Add badge on avatar
const pendingBadge = `
                                            {pendingPhoto && (
                                                <div style={{ position: 'absolute', bottom: -10, left: '50%', transform: 'translateX(-50%)', background: '#f59e0b', color: 'white', fontSize: '10px', padding: '2px 8px', borderRadius: '10px', whiteSpace: 'nowrap', zIndex: 10 }}>
                                                    En attente
                                                </div>
                                            )}
`;
code = code.replace(/<Camera size=\{16\} \/>\s*<\/div>\s*<\/label>/, `<Camera size={16} /></div></label>${pendingBadge}`);


fs.writeFileSync(path, code);
