'use client';

import { useState, useEffect } from 'react';
import { Calendar, MapPin, Megaphone, Loader2 } from 'lucide-react';
import api from '@/lib/api';

interface Evt {
  evenement_id: number;
  titre: string;
  description: string;
  date_debut: string;
  date_fin: string | null;
  lieu: string;
  type_evenement: string;
  cible: string;
  statut: string;
}

const TYPE_COLORS: Record<string, { color: string; bg: string }> = {
  CULTUREL: { color: '#8b5cf6', bg: '#ede9fe' },
  SPORTIF: { color: '#10b981', bg: '#d1fae5' },
  ACADEMIQUE: { color: '#3b82f6', bg: '#dbeafe' },
  REUNION: { color: '#f59e0b', bg: '#fef3c7' },
  AUTRE: { color: '#6b7280', bg: '#f3f4f6' },
};

export default function EleveEvenements({ couleurPortail }: { couleurPortail: string }) {
  const [evts, setEvts] = useState<Evt[]>([]);
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    api.get('/api/evenements')
      .then(r => {
        setEvts((r.data || []).filter((e: Evt) => e.statut === 'PUBLIE'));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '4rem' }}>
        <Loader2 style={{ animation: 'spin 1s linear infinite', color: couleurPortail }} size={48} />
        <p style={{ marginTop: '1rem', color: '#64748b' }}>Chargement des événements...</p>
      </div>
    );
  }

  if (evts.length === 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '4rem', textAlign: 'center' }}>
        <div style={{ background: '#f8fafc', padding: '2rem', borderRadius: '50%', marginBottom: '1.5rem' }}>
          <Calendar size={64} style={{ color: '#cbd5e1' }} />
        </div>
        <h3 style={{ fontSize: '1.25rem', fontWeight: 600, color: '#334155', marginBottom: '0.5rem' }}>Aucun événement</h3>
        <p style={{ color: '#64748b', maxWidth: '400px' }}>Il n'y a pas d'événements prévus pour le moment. Revenez plus tard !</p>
      </div>
    );
  }

  return (
    <div style={{ padding: '1.5rem' }}>
      <h2 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#1e293b', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <Megaphone size={28} style={{ color: couleurPortail }} />
        Événements à venir
      </h2>
      
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1.5rem' }}>
        {evts.map(evt => {
          const typeStyle = TYPE_COLORS[evt.type_evenement] || TYPE_COLORS.AUTRE;
          const dateDebut = new Date(evt.date_debut).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
          const dateFin = evt.date_fin ? new Date(evt.date_fin).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : null;
          
          return (
            <div 
              key={evt.evenement_id}
              style={{
                background: 'white',
                borderRadius: '16px',
                overflow: 'hidden',
                boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
                transition: 'transform 0.2s ease, box-shadow 0.2s ease',
                cursor: 'pointer',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-4px)';
                e.currentTarget.style.boxShadow = '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'none';
                e.currentTarget.style.boxShadow = '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)';
              }}
            >
              <div style={{ height: '6px', background: typeStyle.color }} />
              
              <div style={{ padding: '1.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                  <span style={{
                    background: typeStyle.bg,
                    color: typeStyle.color,
                    padding: '0.25rem 0.75rem',
                    borderRadius: '9999px',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em'
                  }}>
                    {evt.type_evenement}
                  </span>
                </div>
                
                <h3 style={{ fontSize: '1.125rem', fontWeight: 700, color: '#1e293b', marginBottom: '1rem', lineHeight: 1.4 }}>
                  {evt.titre}
                </h3>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1.25rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', color: '#64748b', fontSize: '0.875rem' }}>
                    <Calendar size={18} style={{ color: '#94a3b8' }} />
                    <span>
                      {dateDebut} {dateFin && dateFin !== dateDebut ? ` - ${dateFin}` : ''}
                    </span>
                  </div>
                  
                  {evt.lieu && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', color: '#64748b', fontSize: '0.875rem' }}>
                      <MapPin size={18} style={{ color: '#94a3b8' }} />
                      <span>{evt.lieu}</span>
                    </div>
                  )}
                </div>
                
                {evt.description && (
                  <p style={{ color: '#475569', fontSize: '0.875rem', lineHeight: 1.6, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                    {evt.description}
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
