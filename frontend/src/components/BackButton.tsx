'use client';

import { useRouter, usePathname } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';

/**
 * Universal back-navigation button.
 * Renders a small arrow on the top-left of any admin page
 * (skipped on the dashboard home page "/dashboard").
 */
export default function BackButton() {
    const router = useRouter();
    const pathname = usePathname();

    // Don't show on the main dashboard/home
    if (pathname === '/' || pathname === '/dashboard') return null;

    return (
        <button
            onClick={() => router.back()}
            title="Retour à la page précédente"
            aria-label="Retour"
            style={{
                width: '36px', height: '36px', borderRadius: '10px',
                border: '1px solid var(--border-light)', background: 'white',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', color: 'var(--text-secondary)',
                transition: 'all 0.2s ease', boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                flexShrink: 0,
            }}
            onMouseEnter={e => {
                e.currentTarget.style.background = 'var(--brand-primary)';
                e.currentTarget.style.color = 'white';
                e.currentTarget.style.borderColor = 'var(--brand-primary)';
                e.currentTarget.style.boxShadow = '0 4px 12px rgba(99,102,241,0.25)';
            }}
            onMouseLeave={e => {
                e.currentTarget.style.background = 'white';
                e.currentTarget.style.color = 'var(--text-secondary)';
                e.currentTarget.style.borderColor = 'var(--border-light)';
                e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.04)';
            }}
        >
            <ArrowLeft size={18} />
        </button>
    );
}
