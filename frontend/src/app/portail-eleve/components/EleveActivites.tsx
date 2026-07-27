'use client';

import { useState, useEffect } from 'react';
import { Activity, Clock, Loader2 } from 'lucide-react';
import api from '@/lib/api';

interface Activite {
  activite_id: number;
  titre: string;
  description: string;
  heure_debut: string;
  heure_fin: string;
  type_activite: string;
  est_actif: string;
}

const TYPE_COLORS: Record<string, { color: string; bg: string }> = {
  SPORT: { color: '#10b981', bg: '#d1fae5' },
  CLUB: { color: '#8b5cf6', bg: '#ede9fe' },
  SOUTIEN: { color: '#3b82f6', bg: '#dbeafe' },
  ATELIER: { color: '#f59e0b', bg: '#fef3c7' },
  AUTRE: { color: '#6b7280', bg: '#f3f4f6' },
};

export default function EleveActivites({ couleurPortail }: { couleurPortail: string }) {
  const [activites, setActivites] = useState<Activite[]>([]);
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    api.get('/api/activites')
      .then(r => {
        setActivites((r.data || []).filter((a: Activite) => a.est_actif === 'O'));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '4rem' }}>
        <Loader2 style={{ animation: 'spin 1s linear infinite', color: couleurPortail }} size={48} />
        <p style={{ marginTop: '1rem', color: '#64748b' }}>Chargement des activités...</p>
      </div>
    );
  }

  if (activites.length === 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '4rem', textAlign: 'center' }}>
        <div style={{ background: '#f8fafc', padding: '2rem', borderRadius: '50%', marginBottom: '1.5rem' }}>
          <Activity size={64} style={{ color: '#cbd5e1' }} />
        </div>
        <h3 style={{ fontSize: '1.25rem', fontWeight: 600, color: '#334155', marginBottom: '0.5rem' }}>Aucune activité</h3>
        <p style={{ color: '#64748b', maxWidth: '400px' }}>Il n'y a pas d'activités prévues pour aujourd'hui. Profitez de votre temps libre !</p>
      </div>
    );
  }

  // Trier par heure de début
  const sortedActivites = [...activites].sort((a, b) => (a.heure_debut || '').localeCompare(b.heure_debut || ''));

  return (
    <div style={{ padding: '1.5rem', maxWidth: '800px', margin: '0 auto' }}>
      <h2 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#1e293b', marginBottom: '2rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <Activity size={28} style={{ color: couleurPortail }} />
        Activités du jour
      </h2>
      
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', position: 'relative' }}>
        {/* Timeline line */}
        <div style={{ position: 'absolute', left: '24px', top: '24px', bottom: '24px', width: '2px', background: '#e2e8f0', zIndex: 0 }} />
        
        {sortedActivites.map((act, index) => {
          const typeStyle = TYPE_COLORS[act.type_activite] || TYPE_COLORS.AUTRE;
          const timeFormat = (time?: string) => time ? time.substring(0, 5) : ''; // Format HH:MM
          
          return (
            <div 
              key={act.activite_id}
              style={{
                display: 'flex',
                gap: '1.5rem',
                position: 'relative',
                zIndex: 1
              }}
            >
              {/* Timeline marker */}
              <div style={{ 
                width: '48px', 
                height: '48px', 
                borderRadius: '50%', 
                background: typeStyle.bg,
                border: `2px solid ${typeStyle.color}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                boxShadow: '0 0 0 4px white'
              }}>
                <Clock size={20} style={{ color: typeStyle.color }} />
              </div>
              
              {/* Card content */}
              <div style={{
                background: 'white',
                borderRadius: '16px',
                padding: '1.5rem',
                flexGrow: 1,
                boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03)',
                border: '1px solid #f1f5f9',
                transition: 'transform 0.2s ease, box-shadow 0.2s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateX(4px)';
                e.currentTarget.style.boxShadow = '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'none';
                e.currentTarget.style.boxShadow = '0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03)';
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
                  <h3 style={{ fontSize: '1.125rem', fontWeight: 600, color: '#1e293b' }}>
                    {act.titre}
                  </h3>
                  <span style={{
                    background: typeStyle.bg,
                    color: typeStyle.color,
                    padding: '0.25rem 0.75rem',
                    borderRadius: '9999px',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                  }}>
                    {timeFormat(act.heure_debut)} - {timeFormat(act.heure_fin)}
                  </span>
                </div>
                
                <span style={{
                  display: 'inline-block',
                  color: typeStyle.color,
                  fontSize: '0.875rem',
                  fontWeight: 500,
                  marginBottom: '1rem',
                  textTransform: 'capitalize'
                }}>
                  {act.type_activite.toLowerCase()}
                </span>
                
                {act.description && (
                  <p style={{ color: '#475569', fontSize: '0.9375rem', lineHeight: 1.5 }}>
                    {act.description}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
