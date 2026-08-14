import type { Metadata, Viewport } from 'next';
import './globals.css';
import Providers from '@/components/Providers';
import AppShell from '@/components/AppShell';

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
        <Providers>
          <AppShell>
            {children}
          </AppShell>
        </Providers>
      </body>
    </html>
  );
}
