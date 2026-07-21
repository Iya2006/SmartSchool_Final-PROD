'use client';
import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ShoppingBag, Plus, Pencil, Trash2, Search, Check, BookOpen, PenTool, Shirt, Package, Layers, Building2, ChevronRight, ToggleLeft, ToggleRight, X, AlertCircle } from 'lucide-react';
import api from '@/lib/api';
import { useApp } from '@/context/AppContext';

const CATEGORIES = [
  { key: 'CAHIER',    label: 'Cahiers',    color: '#6366f1', bg: '#eef2ff', icon: BookOpen },
  { key: 'LIVRE',     label: 'Livres',     color: '#0891b2', bg: '#ecfeff', icon: BookOpen },
  { key: 'STYLO',     label: 'Stylos',     color: '#059669', bg: '#ecfdf5', icon: PenTool },
  { key: 'UNIFORME',  label: 'Uniformes',  color: '#d97706', bg: '#fffbeb', icon: Shirt },
  { key: 'MATERIEL',  label: 'Matériel',   color: '#7c3aed', bg: '#f5f3ff', icon: Package },
  { key: 'AUTRE',     label: 'Autre',      color: '#64748b', bg: '#f8fafc', icon: Layers },
];

const EMPTY = { nom: '', description: '', categorie: 'MATERIEL', quantite: 1, prix_unitaire: '', unite: 'unité', obligatoire: 'O', statut: 'ACTIF' };

export default function FournituresPage() {
  const { etablissementId } = useApp();
  const [classes, setClasses] = useState<any[]>([]);
  const [selectedClass, setSelectedClass] = useState<any>(null);
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState<any>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState('');

  const loadClasses = async () => {
    try {
      const res = await api.get(`/api/classes?etablissement_id=${etablissementId}`);
      setClasses(res.data);
      if (res.data.length > 0 && !selectedClass) {
        setSelectedClass(res.data[0]);
      }
    } catch {}
  };

  const loadFournitures = async (classId: number) => {
    setLoading(true);
    try {
      const res = await api.get(`/api/fournitures/classe/${classId}`);
      setItems(res.data);
    } catch {}
    setLoading(false);
  };

  useEffect(() => { loadClasses(); }, [etablissementId]);
  useEffect(() => { if (selectedClass) loadFournitures(selectedClass.classe_id); }, [selectedClass]);

  const openCreate = () => { setEditing(null); setForm({ ...EMPTY, classe_id: selectedClass?.classe_id }); setShowModal(true); };
  const openEdit = (item: any) => { setEditing(item); setForm({ ...item, prix_unitaire: item.prix_unitaire ?? '' }); setShowModal(true); };
  const closeModal = () => { setShowModal(false); setEditing(null); };

  const handleSave = async () => {
    if (!form.nom.trim() || !form.classe_id) return;
    setSaving(true);
    try {
      const payload = { ...form, etablissement_id: etablissementId, prix_unitaire: form.prix_unitaire !== '' ? Number(form.prix_unitaire) : null };
      if (editing) await api.put(`/api/fournitures/${editing.fourniture_id}`, payload);
      else await api.post('/api/fournitures', payload);
      setSuccess(editing ? 'Fourniture modifiée ✅' : 'Fourniture ajoutée ✅');
      setTimeout(() => setSuccess(''), 3000);
      closeModal();
      if (selectedClass) loadFournitures(selectedClass.classe_id);
    } catch {}
    setSaving(false);
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Supprimer cette fourniture ?')) return;
    try { await api.delete(`/api/fournitures/${id}`); if (selectedClass) loadFournitures(selectedClass.classe_id); } catch {}
  };

  const handleToggle = async (id: number) => {
    try { await api.patch(`/api/fournitures/${id}/toggle-statut`); if (selectedClass) loadFournitures(selectedClass.classe_id); } catch {}
  };

  const filtered = items.filter(i => {
    const q = search.toLowerCase();
    return !q || i.nom.toLowerCase().includes(q) || (i.description || '').toLowerCase().includes(q);
  });

  return (
    <div style={{ display: 'flex', height: '100vh', background: '#f8fafc', fontFamily: "'Inter', sans-serif" }}>
      
      {/* Sidebar Classes */}
      <div style={{ width: '300px', background: 'white', borderRight: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '24px 20px', borderBottom: '1px solid #e2e8f0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'linear-gradient(135deg, #7c3aed, #6366f1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <ShoppingBag size={20} color="white" />
            </div>
            <div>
              <h1 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: '#0f172a' }}>Fournitures</h1>
              <p style={{ margin: 0, fontSize: '12px', color: '#64748b' }}>Gestion par classe</p>
            </div>
          </div>
        </div>
        <div style={{ padding: '16px 20px', overflowY: 'auto', flex: 1 }}>
          <h3 style={{ fontSize: '11px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '1px', margin: '0 0 12px 0' }}>Liste des classes</h3>
          {classes.length === 0 ? <p style={{ fontSize: '13px', color: '#64748b' }}>Chargement...</p> : classes.map(c => {
            const isActive = selectedClass?.classe_id === c.classe_id;
            return (
              <button key={c.classe_id} onClick={() => setSelectedClass(c)}
                style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', marginBottom: '8px', borderRadius: '10px', border: 'none', background: isActive ? '#f5f3ff' : 'transparent', color: isActive ? '#6366f1' : '#475569', fontWeight: isActive ? 700 : 500, fontSize: '14px', cursor: 'pointer', transition: 'all 0.2s', textAlign: 'left' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <Building2 size={16} /> {c.libelle}
                </div>
                {isActive && <ChevronRight size={16} />}
              </button>
            )
          })}
        </div>
      </div>

      {/* Main Content */}
      <div style={{ flex: 1, padding: '32px 40px', overflowY: 'auto' }}>
        {selectedClass && (
          <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <div>
                <h2 style={{ margin: 0, fontSize: '24px', fontWeight: 800, color: '#0f172a' }}>Fournitures : {selectedClass.libelle}</h2>
                <p style={{ margin: '4px 0 0', fontSize: '14px', color: '#64748b' }}>Ces fournitures apparaîtront sur les portails des élèves et parents de cette classe.</p>
              </div>
              <button onClick={openCreate} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 20px', borderRadius: '10px', border: 'none', background: 'linear-gradient(135deg, #7c3aed, #6366f1)', color: 'white', fontSize: '14px', fontWeight: 700, cursor: 'pointer', boxShadow: '0 4px 15px rgba(124,58,237,0.3)' }}>
                <Plus size={18} /> Ajouter pour cette classe
              </button>
            </div>

            <AnimatePresence>
              {success && (
                <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                  style={{ marginBottom: '20px', padding: '12px 16px', borderRadius: '10px', background: '#ecfdf5', border: '1px solid #6ee7b7', color: '#065f46', fontSize: '14px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Check size={18} /> {success}
                </motion.div>
              )}
            </AnimatePresence>

            <div style={{ position: 'relative', marginBottom: '24px' }}>
              <Search size={16} style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher une fourniture..."
                style={{ width: '100%', padding: '12px 16px 12px 42px', borderRadius: '12px', border: '1.5px solid #e2e8f0', fontSize: '14px', outline: 'none', background: 'white' }} />
            </div>

            {loading ? (
               <p style={{ color: '#64748b' }}>Chargement des fournitures...</p>
            ) : filtered.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '60px', background: 'white', borderRadius: '16px', border: '1px dashed #cbd5e1' }}>
                <ShoppingBag size={48} color="#cbd5e1" style={{ marginBottom: '12px' }} />
                <h3 style={{ margin: 0, fontSize: '16px', color: '#475569' }}>Aucune fourniture pour le moment</h3>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                {CATEGORIES.map(cat => {
                  const itemsCat = filtered.filter(i => i.categorie === cat.key);
                  if (itemsCat.length === 0) return null;
                  const Icon = cat.icon;
                  return (
                    <div key={cat.key} style={{ background: 'white', borderRadius: '16px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
                      <div style={{ padding: '16px 20px', background: cat.bg, borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <Icon size={18} color={cat.color} />
                        <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: '#1e293b' }}>{cat.label}</h3>
                        <span style={{ marginLeft: 'auto', background: 'white', color: cat.color, padding: '2px 8px', borderRadius: '12px', fontSize: '12px', fontWeight: 700 }}>{itemsCat.length}</span>
                      </div>
                      <div>
                        {itemsCat.map((item, idx) => (
                          <div key={item.fourniture_id} style={{ display: 'flex', alignItems: 'center', padding: '16px 20px', borderBottom: idx < itemsCat.length - 1 ? '1px solid #f1f5f9' : 'none', opacity: item.statut === 'INACTIF' ? 0.6 : 1 }}>
                            <div style={{ flex: 1 }}>
                              <div style={{ fontSize: '15px', fontWeight: 600, color: '#0f172a' }}>{item.nom}</div>
                              {item.description && <div style={{ fontSize: '13px', color: '#64748b', marginTop: '2px' }}>{item.description}</div>}
                            </div>
                            <div style={{ width: '120px', fontSize: '14px', fontWeight: 600, color: '#475569' }}>{item.quantite} {item.unite}</div>
                            <div style={{ width: '120px', fontSize: '14px', fontWeight: 700, color: '#059669' }}>{item.prix_unitaire ? `${Number(item.prix_unitaire).toLocaleString('fr-FR')} GNF` : '—'}</div>
                            <div style={{ width: '120px' }}>
                              <span style={{ padding: '4px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 700, background: item.obligatoire === 'O' ? '#fef2f2' : '#f0fdf4', color: item.obligatoire === 'O' ? '#dc2626' : '#16a34a' }}>
                                {item.obligatoire === 'O' ? 'Obligatoire' : 'Facultatif'}
                              </span>
                            </div>
                            <div style={{ display: 'flex', gap: '8px' }}>
                              <button onClick={() => handleToggle(item.fourniture_id)} style={{ padding: '8px', borderRadius: '8px', border: '1px solid #e2e8f0', background: 'white', cursor: 'pointer', color: item.statut === 'ACTIF' ? '#059669' : '#94a3b8' }}>
                                {item.statut === 'ACTIF' ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}
                              </button>
                              <button onClick={() => openEdit(item)} style={{ padding: '8px', borderRadius: '8px', border: '1px solid #e2e8f0', background: 'white', cursor: 'pointer', color: '#6366f1' }}>
                                <Pencil size={16} />
                              </button>
                              <button onClick={() => handleDelete(item.fourniture_id)} style={{ padding: '8px', borderRadius: '8px', border: '1px solid #fecaca', background: '#fff5f5', cursor: 'pointer', color: '#dc2626' }}>
                                <Trash2 size={16} />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modal CRUD */}
      <AnimatePresence>
        {showModal && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.6)', backdropFilter: 'blur(4px)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              style={{ background: 'white', borderRadius: '20px', width: '100%', maxWidth: '500px', padding: '32px', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)' }}>
              
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 800, color: '#0f172a' }}>{editing ? 'Modifier fourniture' : 'Nouvelle fourniture'}</h2>
                <button onClick={closeModal} style={{ border: 'none', background: '#f1f5f9', borderRadius: '10px', width: '36px', height: '36px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><X size={18} /></button>
              </div>

              {selectedClass && (
                <div style={{ marginBottom: '20px', padding: '12px 16px', background: '#f8fafc', borderRadius: '12px', display: 'flex', alignItems: 'center', gap: '8px', color: '#475569', fontSize: '14px', fontWeight: 600 }}>
                  <Building2 size={16} /> Pour la classe : <span style={{ color: '#0f172a' }}>{selectedClass.libelle}</span>
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>DÉSIGNATION *</label>
                  <input value={form.nom} onChange={e => setForm((p:any) => ({...p, nom: e.target.value}))} placeholder="Ex: Cahier 200 pages" style={{ width: '100%', padding: '12px 14px', borderRadius: '10px', border: '1.5px solid #e2e8f0', fontSize: '14px', outline: 'none', boxSizing: 'border-box' }} />
                </div>
                
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>DESCRIPTION (OPTIONNEL)</label>
                  <input value={form.description} onChange={e => setForm((p:any) => ({...p, description: e.target.value}))} placeholder="Détails, marque..." style={{ width: '100%', padding: '12px 14px', borderRadius: '10px', border: '1.5px solid #e2e8f0', fontSize: '14px', outline: 'none', boxSizing: 'border-box' }} />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>CATÉGORIE</label>
                    <select value={form.categorie} onChange={e => setForm((p:any) => ({...p, categorie: e.target.value}))} style={{ width: '100%', padding: '12px 14px', borderRadius: '10px', border: '1.5px solid #e2e8f0', fontSize: '14px', background: 'white', boxSizing: 'border-box' }}>
                      {CATEGORIES.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>OBLIGATOIRE ?</label>
                    <select value={form.obligatoire} onChange={e => setForm((p:any) => ({...p, obligatoire: e.target.value}))} style={{ width: '100%', padding: '12px 14px', borderRadius: '10px', border: '1.5px solid #e2e8f0', fontSize: '14px', background: 'white', boxSizing: 'border-box' }}>
                      <option value="O">Oui, obligatoire</option>
                      <option value="N">Non, facultatif</option>
                    </select>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>QUANTITÉ</label>
                    <input type="number" min={1} value={form.quantite} onChange={e => setForm((p:any) => ({...p, quantite: Number(e.target.value)}))} style={{ width: '100%', padding: '12px 14px', borderRadius: '10px', border: '1.5px solid #e2e8f0', fontSize: '14px', boxSizing: 'border-box' }} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>UNITÉ</label>
                    <input value={form.unite} onChange={e => setForm((p:any) => ({...p, unite: e.target.value}))} placeholder="unité" style={{ width: '100%', padding: '12px 14px', borderRadius: '10px', border: '1.5px solid #e2e8f0', fontSize: '14px', boxSizing: 'border-box' }} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>PRIX EST. (GNF)</label>
                    <input type="number" min={0} value={form.prix_unitaire} onChange={e => setForm((p:any) => ({...p, prix_unitaire: e.target.value}))} placeholder="0" style={{ width: '100%', padding: '12px 14px', borderRadius: '10px', border: '1.5px solid #e2e8f0', fontSize: '14px', boxSizing: 'border-box' }} />
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '32px' }}>
                <button onClick={closeModal} style={{ padding: '12px 20px', borderRadius: '10px', border: '1.5px solid #e2e8f0', background: 'white', color: '#475569', fontSize: '14px', fontWeight: 600, cursor: 'pointer' }}>Annuler</button>
                <button onClick={handleSave} disabled={saving || !form.nom.trim()} style={{ padding: '12px 24px', borderRadius: '10px', border: 'none', background: form.nom.trim() ? 'linear-gradient(135deg, #7c3aed, #6366f1)' : '#cbd5e1', color: 'white', fontSize: '14px', fontWeight: 700, cursor: form.nom.trim() ? 'pointer' : 'not-allowed', boxShadow: form.nom.trim() ? '0 4px 15px rgba(124,58,237,0.3)' : 'none' }}>
                  {saving ? 'Enregistrement...' : 'Enregistrer'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
