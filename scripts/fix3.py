import sys
with open('frontend/src/app/portail-eleve/page.tsx', 'r', encoding='utf-8') as f:
    lines = f.readlines()

new_lines = []
for i, line in enumerate(lines):
    if i == 146 and '{/* ── SIDEBAR ── */}' in line:
        fix = '''            setStep('dashboard');
        } catch (err: any) {
            setLoginError(err.response?.data?.detail || 'Erreur de connexion');
        } finally {
            setLoginLoading(false);
        }
    };

    const handleLogout = () => {
        setStep('login');
        setEleveId(null);
        setData(null);
        setMatricule('');
        setPassword('');
    };

    if (step === 'login') {
        return <LoginScreen matricule={matricule} setMatricule={setMatricule} password={password} setPassword={setPassword} showPwd={showPwd} setShowPwd={setShowPwd} error={loginError} loading={loginLoading} onLogin={handleLogin} />;
    }

    if (!eleveData) return <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Loader2 size={40} color="#6366f1" style={{ animation: 'spin 1s linear infinite' }} /></div>;

    const photoSrc = pendingPhoto ? `${API_BASE}${pendingPhoto.photo_url}` : (eleveData.photo_url ? `${API_BASE}${eleveData.photo_url}` : null);

    return (
        <div style={{ display: 'flex', minHeight: '100vh', background: '#f8fafc', color: '#0f172a' }}>
'''
        new_lines.append(fix)
    new_lines.append(line)

with open('frontend/src/app/portail-eleve/page.tsx', 'w', encoding='utf-8') as f:
    f.writelines(new_lines)
print('Done!')
