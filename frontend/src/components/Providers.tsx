'use client';

import { AppProvider } from '@/context/AppContext';
import { AuthProvider } from '@/context/AuthContext';
import QueryProvider from '@/components/QueryProvider';
import { Toaster } from 'react-hot-toast';

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
                </AppProvider>
            </AuthProvider>
        </QueryProvider>
    );
}
