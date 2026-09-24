'use client';

import { AppProvider } from '@/context/AppContext';
import { AuthProvider } from '@/context/AuthContext';
import QueryProvider from '@/components/QueryProvider';
import { Toaster } from 'react-hot-toast';
import PostLoginSplash from '@/components/PostLoginSplash';
import WhatsNewModal from '@/components/WhatsNewModal';

export default function Providers({ children }: { children: React.ReactNode }) {
    // QueryProvider englobe tout le reste : c'est une couche d'infrastructure
    // générique (cache/persistance des requêtes) indépendante de l'auth ou de
    // l'état applicatif, et dont AuthProvider/AppProvider (ou leurs enfants)
    // pourront eux-mêmes tirer parti via useQuery/useMutation.
    return (
        <QueryProvider>
            <AuthProvider>
                <AppProvider>
                    {children}
                    <Toaster position="top-right" toastOptions={{ style: { background: '#1e293b', color: '#fff', borderRadius: '12px' } }} />
                    {/* Doivent être sous AuthProvider (useAuth). PostLoginSplash :
                        écran affiché juste après une connexion réussie, voir
                        AuthContext.login(). WhatsNewModal : se gate elle-même
                        sur !showPostLoginSplash pour ne jamais s'empiler avec
                        cet écran — apparaît juste après, pas en même temps. */}
                    <PostLoginSplash />
                    <WhatsNewModal />
                </AppProvider>
            </AuthProvider>
        </QueryProvider>
    );
}
