import type { Metadata, Viewport } from 'next';
import './globals.css';
import Providers from '@/components/Providers';
import AppShell from '@/components/AppShell';
import ProtectionNavigateur from '@/components/ProtectionNavigateur';

export const metadata: Metadata = {
  title: 'SMARTSCHOOL - ERP Scolaire National',
  description: 'Système de Gestion Scolaire — République de Guinée',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'SmartSchool',
  },
};

export const viewport: Viewport = {
  themeColor: '#3b82f6',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr" suppressHydrationWarning>
      <body suppressHydrationWarning>
        {/* Décourage clic droit, F12 et « afficher le source ». Un garde-fou
            contre la fausse manœuvre — la vraie protection est côté serveur,
            où chaque compte ne reçoit que ce qui le concerne. */}
        <ProtectionNavigateur />
        <Providers>
          <AppShell>
            {children}
          </AppShell>
        </Providers>
      </body>
    </html>
  );
}
