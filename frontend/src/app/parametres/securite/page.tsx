'use client';

import React, { useState, useEffect } from 'react';
import SettingsLayout from '@/components/SettingsLayout';
import api from '@/lib/api';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Shield, Key, Clock, FileText, Save, Loader2, Plus, Trash2, CheckCircle, Lock, Users,
  AlertTriangle
} from 'lucide-react';
import styles from './Securite.module.css';

// ── LES ESPACES QU'UN RÔLE CRÉÉ PEUT REPRENDRE ───────────────────────────────
// Une école ne parle pas de « DIRECTEUR_NIVEAU » mais de censeur, de
// surveillant général, de caissier. Elle doit pouvoir donner ces noms-là à ses
// agents — sans que cela crée un pouvoir nouveau. Le rôle créé reprend donc
// l'espace d'un rôle existant, et n'obtient jamais plus que lui.
// Miroir de `app/core/auth.py::ROLES_ATTRIBUABLES`.
const ESPACES_DISPONIBLES = [
  { code: 'DIRECTEUR_NIVEAU', libelle: 'Direction des études', detail: 'Évaluations, notes, bulletins, résultats de fin d’année, examens, archive. Pas la comptabilité.' },
  { code: 'ADMIN', libelle: 'Administration complète', detail: 'Tous les écrans, comptabilité comprise.' },
  { code: 'DG', libelle: 'Direction générale', detail: 'Pilotage de l’école, comptabilité comprise.' },
  { code: 'FONDATEUR', libelle: 'Fondateur', detail: 'Vision exécutive sur toute la plateforme.' },
  { code: 'COMPTABLE', libelle: 'Comptabilité', detail: 'Encaissements, dépenses, salaires, rapports. Rien de pédagogique.' },
  { code: 'SURVEILLANT', libelle: 'Surveillance', detail: 'Discipline, présences, remontées terrain.' },
  { code: 'OPERATEUR', libelle: 'Secrétariat / opérations', detail: 'Accueil, inscriptions, saisie courante.' },
  { code: 'BIBLIOTHECAIRE', libelle: 'Bibliothèque', detail: 'Fonds documentaire, prêts et retours.' },
  { code: 'INFORMATICIEN', libelle: 'Informatique', detail: 'Équipements, incidents, support technique.' },
  { code: 'AGENT_ENTRETIEN', libelle: 'Entretien (sans accès logiciel)', detail: 'Aucun écran : la personne existe en RH et à la paie, sans compte.' },
  { code: 'GARDIEN', libelle: 'Gardiennage (sans accès logiciel)', detail: 'Aucun écran : la personne existe en RH et à la paie, sans compte.' },
  { code: 'CHAUFFEUR', libelle: 'Transport (sans accès logiciel)', detail: 'Aucun écran : la personne existe en RH et à la paie, sans compte.' },
  { code: 'AUTRE', libelle: 'Autre (sans accès logiciel)', detail: 'Aucun écran : la personne existe en RH et à la paie, sans compte.' },
] as const;

const TABS = [
  { id: 'roles', label: 'Rôles & Permissions', Icon: Shield },
  { id: 'passwords', label: 'Politique de Mots de Passe', Icon: Key },
  { id: 'sessions', label: 'Gestion des Sessions', Icon: Clock },
  { id: 'audit', label: 'Journal d\'Audit', Icon: FileText },
] as const;

type TabId = typeof TABS[number]['id'];

interface RoleItem {
  role_id: number;
  code: string;
  libelle: string;
  description: string;
  est_systeme: boolean;
  permissions: Array<{ module: string; action: string; est_autorise: boolean }>;
}

interface AuditItem {
  log_id: number;
  nom_utilisateur: string;
  module: string;
  action: string;
  details: string;
  ip_address: string;
  created_date: string;
}

export default function SecuritePage() {
  const [activeTab, setActiveTab] = useState<TabId>('roles');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  // Data states
  const [roles, setRoles] = useState<RoleItem[]>([]);
  const [selectedRoleId, setSelectedRoleId] = useState<number | null>(null);
  const [modules, setModules] = useState<Array<{ code: string; libelle: string }>>([]);
  const [actions, setActions] = useState<string[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditItem[]>([]);
  const [auditSearch, setAuditSearch] = useState('');

  // Password & Session settings
  const [pwdMinLength, setPwdMinLength] = useState(8);
  const [pwdUppercase, setPwdUppercase] = useState(true);
  const [pwdNumber, setPwdNumber] = useState(true);
  const [pwdSpecial, setPwdSpecial] = useState(false);
  const [pwdExpiryDays, setPwdExpiryDays] = useState(90);
  const [sessionTimeout, setSessionTimeout] = useState(30);
  const [singleSession, setSingleSession] = useState(false);
  const [auditActive, setAuditActive] = useState(true);

  // New role modal state
  const [showRoleModal, setShowRoleModal] = useState(false);
  const [newRoleCode, setNewRoleCode] = useState('');
  const [newRoleLibelle, setNewRoleLibelle] = useState('');
  const [newRoleDesc, setNewRoleDesc] = useState('');
  // L'espace dont le nouveau rôle hérite. Sans lui, le rôle créé n'ouvrait
  // aucun écran : la matrice de permissions ne fait que RETIRER des accès,
  // elle n'en ouvre jamais. Une école obtenait un rôle décoratif.
  const [newRoleBase, setNewRoleBase] = useState('DIRECTEUR_NIVEAU');

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  useEffect(() => {
    loadAllData();
  }, []);

  const loadAllData = async () => {
    setLoading(true);
    try {
      const [modulesRes, rolesRes, settingsRes, auditRes] = await Promise.all([
        api.get('/api/securite/modules').catch(() => ({ data: { modules: [], actions: [] } })),
        api.get('/api/securite/roles?etablissement_id=1').catch(() => ({ data: [] })),
        api.get('/api/parametrage/settings?etablissement_id=1&categorie=SECURITE').catch(() => ({ data: [] })),
        api.get('/api/securite/audit-log?etablissement_id=1&limit=50').catch(() => ({ data: { items: [] } })),
      ]);

      setModules(modulesRes.data.modules || []);
      setActions(modulesRes.data.actions || []);
      setRoles(rolesRes.data || []);
      if (rolesRes.data && rolesRes.data.length > 0) {
        setSelectedRoleId(rolesRes.data[0].role_id);
      }
      setAuditLogs(auditRes.data.items || []);

      // Parse settings
      const settingsList = settingsRes.data || [];
      settingsList.forEach((s: any) => {
        if (s.cle === 'securite.pwd_min_length') setPwdMinLength(Number(s.valeur) || 8);
        if (s.cle === 'securite.pwd_require_uppercase') setPwdUppercase(s.valeur === 'true');
        if (s.cle === 'securite.pwd_require_number') setPwdNumber(s.valeur === 'true');
        if (s.cle === 'securite.pwd_require_special') setPwdSpecial(s.valeur === 'true');
        if (s.cle === 'securite.pwd_expiry_days') setPwdExpiryDays(Number(s.valeur) || 90);
        if (s.cle === 'securite.session_timeout_minutes') setSessionTimeout(Number(s.valeur) || 30);
        if (s.cle === 'securite.session_single_login') setSingleSession(s.valeur === 'true');
        if (s.cle === 'securite.audit_log_active') setAuditActive(s.valeur === 'true');
      });
    } catch (e) {
      console.error(e);
      showToast('Erreur lors du chargement des données', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateRole = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRoleCode || !newRoleLibelle) return;
    try {
      // `etablissement_id` n'est plus envoyé : le serveur prend celui du
      // compte connecte. La valeur 1 ecrite ici designait la premiere ecole
      // inscrite, pas celle de l'utilisateur.
      await api.post('/api/securite/roles', {
        code: newRoleCode,
        libelle: newRoleLibelle,
        description: newRoleDesc,
        role_base: newRoleBase,
      });
      showToast('Rôle créé avec succès');
      setShowRoleModal(false);
      setNewRoleCode('');
      setNewRoleLibelle('');
      setNewRoleDesc('');
      setNewRoleBase('DIRECTEUR_NIVEAU');
      loadAllData();
    } catch (err: any) {
      showToast(err.response?.data?.detail || 'Erreur lors de la création du rôle', 'error');
    }
  };

  const handleDeleteRole = async (roleId: number) => {
    if (!confirm('Voulez-vous vraiment supprimer ce rôle ?')) return;
    try {
      await api.delete(`/api/securite/roles/${roleId}`);
      showToast('Rôle supprimé avec succès');
      loadAllData();
    } catch (err: any) {
      showToast(err.response?.data?.detail || 'Erreur lors de la suppression', 'error');
    }
  };

  const togglePermission = async (moduleCode: string, actionCode: string, currentVal: boolean) => {
    if (!selectedRoleId) return;
    const updatedRoles = roles.map(r => {
      if (r.role_id === selectedRoleId) {
        const perms = r.permissions.map(p => {
          if (p.module === moduleCode && p.action === actionCode) {
            return { ...p, est_autorise: !currentVal };
          }
          return p;
        });
        return { ...r, permissions: perms };
      }
      return r;
    });
    setRoles(updatedRoles);

    // Immediate API persist for permissions matrix
    try {
      await api.put(`/api/securite/roles/${selectedRoleId}/permissions`, {
        permissions: [{ module: moduleCode, action: actionCode, est_autorise: !currentVal ? 'O' : 'N' }]
      });
      showToast('Permission mise à jour');
    } catch (e) {
      showToast('Erreur lors de la mise à jour de la permission', 'error');
    }
  };

  const handleSaveSettings = async () => {
    setSaving(true);
    try {
      const payload = [
        { etablissement_id: 1, categorie: 'SECURITE', cle: 'securite.pwd_min_length', valeur: String(pwdMinLength), type_valeur: 'NUMBER' },
        { etablissement_id: 1, categorie: 'SECURITE', cle: 'securite.pwd_require_uppercase', valeur: String(pwdUppercase), type_valeur: 'BOOLEAN' },
        { etablissement_id: 1, categorie: 'SECURITE', cle: 'securite.pwd_require_number', valeur: String(pwdNumber), type_valeur: 'BOOLEAN' },
        { etablissement_id: 1, categorie: 'SECURITE', cle: 'securite.pwd_require_special', valeur: String(pwdSpecial), type_valeur: 'BOOLEAN' },
        { etablissement_id: 1, categorie: 'SECURITE', cle: 'securite.pwd_expiry_days', valeur: String(pwdExpiryDays), type_valeur: 'NUMBER' },
        { etablissement_id: 1, categorie: 'SECURITE', cle: 'securite.session_timeout_minutes', valeur: String(sessionTimeout), type_valeur: 'NUMBER' },
        { etablissement_id: 1, categorie: 'SECURITE', cle: 'securite.session_single_login', valeur: String(singleSession), type_valeur: 'BOOLEAN' },
        { etablissement_id: 1, categorie: 'SECURITE', cle: 'securite.audit_log_active', valeur: String(auditActive), type_valeur: 'BOOLEAN' },
      ];
      await api.put('/api/parametrage/settings?etablissement_id=1', payload);
      showToast('Paramètres de sécurité enregistrés avec succès');
      setHasChanges(false);
    } catch (e) {
      showToast('Erreur lors de l\'enregistrement', 'error');
    } finally {
      setSaving(false);
    }
  };

  const selectedRole = roles.find(r => r.role_id === selectedRoleId);

  return (
    <SettingsLayout
      title="Sécurité & Gestion des Accès"
      subtitle="Configurez le contrôle d'accès basé sur les rôles (RBAC), la politique de mots de passe et le journal d'audit."
    >
      <div className={styles.page}>
        {/* Navigation Tabs */}
        <div className={styles.tabsNav}>
          {TABS.map(({ id, label, Icon }) => (
            <button
              key={id}
              className={`${styles.tab} ${activeTab === id ? styles.tabActive : ''}`}
              onClick={() => setActiveTab(id)}
            >
              <Icon size={16} className={styles.tabIcon} />
              {label}
            </button>
          ))}
        </div>

        {/* Tab 1: Roles & Permissions Matrix */}
        {activeTab === 'roles' && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
            {/* La matrice est désormais appliquée, mais en RETRAIT seulement.
                Il faut le dire : décocher agit, cocher n'agit pas — sans cette
                explication, un directeur croirait pouvoir ouvrir la finance à
                un surveillant en cochant une case. */}
            <div className={styles.avertissement} role="status">
              <AlertTriangle size={18} aria-hidden="true" />
              <div>
                <strong>Ces permissions peuvent retirer un accès, jamais en accorder un.</strong>
                <p>
                  <strong>Décocher</strong> une case ferme immédiatement l&apos;accès
                  correspondant au rôle concerné. <strong>Cocher</strong> une case, en revanche,
                  n&apos;ouvre rien de plus que ce que le rôle permet déjà : les droits de base
                  restent définis par le <strong>rôle principal</strong> du compte, et par ses
                  éventuels rôles secondaires (fiche Personnel). Pour élargir les accès de
                  quelqu&apos;un, modifiez son rôle plutôt que cette matrice.
                </p>
              </div>
            </div>

            <section className={styles.section}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <div className={styles.sectionHeader} style={{ marginBottom: 0 }}>
                  <div className={styles.sectionIcon}>
                    <Shield size={20} />
                  </div>
                  <div>
                    <h3>Rôles des Utilisateurs</h3>
                    <span className={styles.sectionSubtitle}>Sélectionnez un rôle pour gérer sa matrice de permissions</span>
                  </div>
                </div>
                <button
                  className={styles.saveBtn}
                  onClick={() => setShowRoleModal(true)}
                  style={{ borderRadius: 8, padding: '8px 16px' }}
                >
                  <Plus size={16} /> Nouveau rôle
                </button>
              </div>

              {/* Role cards */}
              <div className={styles.rolesGrid}>
                {roles.map(role => (
                  <div
                    key={role.role_id}
                    className={`${styles.roleCard} ${selectedRoleId === role.role_id ? styles.roleCardActive : ''}`}
                    onClick={() => setSelectedRoleId(role.role_id)}
                  >
                    <div className={styles.roleCardHeader}>
                      <span className={styles.roleTitle}>{role.libelle}</span>
                      {role.est_systeme && <span className={styles.badgeSystem}>Système</span>}
                    </div>
                    <p className={styles.roleDesc}>{role.description || role.code}</p>
                    {!role.est_systeme && (
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDeleteRole(role.role_id); }}
                        style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', marginTop: 8, alignSelf: 'flex-end' }}
                        title="Supprimer le rôle"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                ))}
              </div>

              {/* Permissions Matrix */}
              {selectedRole && (
                <div>
                  <h4 style={{ margin: '24px 0 12px 0', fontSize: '1rem', fontWeight: 700 }}>
                    Matrice de permissions pour : <span style={{ color: '#4f46e5' }}>{selectedRole.libelle}</span>
                  </h4>
                  <div className={styles.matrixWrap}>
                    <table className={styles.matrixTable}>
                      <thead>
                        <tr>
                          <th>Module</th>
                          {actions.map(act => (
                            <th key={act} style={{ textAlign: 'center', textTransform: 'capitalize' }}>
                              {act}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {modules.map(mod => (
                          <tr key={mod.code}>
                            <td style={{ fontWeight: 600 }}>{mod.libelle}</td>
                            {actions.map(act => {
                              const perm = selectedRole.permissions.find(
                                p => p.module === mod.code && p.action === act
                              );
                              const isChecked = perm ? perm.est_autorise : false;
                              return (
                                <td key={act} className={styles.checkboxCell}>
                                  <input
                                    type="checkbox"
                                    checked={isChecked}
                                    onChange={() => togglePermission(mod.code, act, isChecked)}
                                  />
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </section>
          </motion.div>
        )}

        {/* Tab 2: Passwords */}
        {activeTab === 'passwords' && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
            <section className={styles.section}>
              <div className={styles.sectionHeader}>
                <div className={styles.sectionIcon}>
                  <Key size={20} />
                </div>
                <div>
                  <h3>Politique des Mots de Passe</h3>
                  <span className={styles.sectionSubtitle}>Définissez les règles de complexité et d'expiration des mots de passe</span>
                </div>
              </div>

              <div className={styles.fieldsGrid}>
                <div className={styles.fieldRow}>
                  <label>Longueur minimale du mot de passe</label>
                  <input
                    type="number"
                    className={styles.inputFancy}
                    value={pwdMinLength}
                    onChange={(e) => { setPwdMinLength(Number(e.target.value)); setHasChanges(true); }}
                    min={6}
                    max={32}
                  />
                  <span className={styles.infoHint}>Nombre minimum de caractères (recommandé: 8+)</span>
                </div>

                <div className={styles.fieldRow}>
                  <label>Expiration automatique (jours)</label>
                  <input
                    type="number"
                    className={styles.inputFancy}
                    value={pwdExpiryDays}
                    onChange={(e) => { setPwdExpiryDays(Number(e.target.value)); setHasChanges(true); }}
                    min={0}
                    max={365}
                  />
                  <span className={styles.infoHint}>0 pour désactiver l'expiration automatique</span>
                </div>
              </div>

              <div style={{ marginTop: 24, display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div className={styles.toggleRow}>
                  <div className={styles.toggleInfo}>
                    <h4>Exiger des lettres majuscules</h4>
                    <p>Au moins une lettre majuscule (A-Z) requise</p>
                  </div>
                  <label className={styles.switch}>
                    <input
                      type="checkbox"
                      checked={pwdUppercase}
                      onChange={(e) => { setPwdUppercase(e.target.checked); setHasChanges(true); }}
                    />
                    <span className={styles.slider} />
                  </label>
                </div>

                <div className={styles.toggleRow}>
                  <div className={styles.toggleInfo}>
                    <h4>Exiger des chiffres</h4>
                    <p>Au moins un chiffre (0-9) requis</p>
                  </div>
                  <label className={styles.switch}>
                    <input
                      type="checkbox"
                      checked={pwdNumber}
                      onChange={(e) => { setPwdNumber(e.target.checked); setHasChanges(true); }}
                    />
                    <span className={styles.slider} />
                  </label>
                </div>

                <div className={styles.toggleRow}>
                  <div className={styles.toggleInfo}>
                    <h4>Exiger des caractères spéciaux</h4>
                    <p>Au moins un caractère spécial (@, #, $, %, etc.) requis</p>
                  </div>
                  <label className={styles.switch}>
                    <input
                      type="checkbox"
                      checked={pwdSpecial}
                      onChange={(e) => { setPwdSpecial(e.target.checked); setHasChanges(true); }}
                    />
                    <span className={styles.slider} />
                  </label>
                </div>
              </div>
            </section>
          </motion.div>
        )}

        {/* Tab 3: Sessions */}
        {activeTab === 'sessions' && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
            <section className={styles.section}>
              <div className={styles.sectionHeader}>
                <div className={styles.sectionIcon}>
                  <Clock size={20} />
                </div>
                <div>
                  <h3>Gestion des Sessions & Sécurité</h3>
                  <span className={styles.sectionSubtitle}>Paramétrez le délai d'inactivité et les restrictions de connexion</span>
                </div>
              </div>

              <div className={styles.fieldsGrid}>
                <div className={styles.fieldRow}>
                  <label>Déconnexion automatique (inactivité)</label>
                  <select
                    className={styles.selectFancy}
                    value={sessionTimeout}
                    onChange={(e) => { setSessionTimeout(Number(e.target.value)); setHasChanges(true); }}
                  >
                    <option value={15}>15 minutes</option>
                    <option value={30}>30 minutes</option>
                    <option value={60}>1 heure</option>
                    <option value={120}>2 heures</option>
                  </select>
                  <span className={styles.infoHint}>Temps sans action avant déconnexion du compte</span>
                </div>
              </div>

              <div style={{ marginTop: 24, display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div className={styles.toggleRow}>
                  <div className={styles.toggleInfo}>
                    <h4>Forcer la session unique par utilisateur</h4>
                    <p>Déconnecte les sessions existantes lors d'une nouvelle connexion</p>
                  </div>
                  <label className={styles.switch}>
                    <input
                      type="checkbox"
                      checked={singleSession}
                      onChange={(e) => { setSingleSession(e.target.checked); setHasChanges(true); }}
                    />
                    <span className={styles.slider} />
                  </label>
                </div>

                <div className={styles.toggleRow}>
                  <div className={styles.toggleInfo}>
                    <h4>Activer le journal d'audit global</h4>
                    <p>Enregistre automatiquement les actions sensibles des utilisateurs</p>
                  </div>
                  <label className={styles.switch}>
                    <input
                      type="checkbox"
                      checked={auditActive}
                      onChange={(e) => { setAuditActive(e.target.checked); setHasChanges(true); }}
                    />
                    <span className={styles.slider} />
                  </label>
                </div>
              </div>
            </section>
          </motion.div>
        )}

        {/* Tab 4: Audit Log */}
        {activeTab === 'audit' && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
            <section className={styles.section}>
              <div className={styles.sectionHeader}>
                <div className={styles.sectionIcon}>
                  <FileText size={20} />
                </div>
                <div>
                  <h3>Journal d'Audit</h3>
                  <span className={styles.sectionSubtitle}>Historique des actions d'administration et des modifications du système</span>
                </div>
              </div>

              <div className={styles.filterBar}>
                <input
                  type="text"
                  placeholder="Rechercher par utilisateur, action..."
                  value={auditSearch}
                  onChange={(e) => setAuditSearch(e.target.value)}
                  style={{ minWidth: 260 }}
                />
              </div>

              <div className={styles.matrixWrap}>
                <table className={styles.auditTable}>
                  <thead>
                    <tr>
                      <th>Date / Heure</th>
                      <th>Utilisateur</th>
                      <th>Module</th>
                      <th>Action</th>
                      <th>Adresse IP</th>
                      <th>Détails</th>
                    </tr>
                  </thead>
                  <tbody>
                    {auditLogs.length === 0 ? (
                      <tr>
                        <td colSpan={6} style={{ textAlign: 'center', padding: 24, color: '#64748b' }}>
                          Aucune entrée d'audit enregistrée pour le moment.
                        </td>
                      </tr>
                    ) : (
                      auditLogs
                        .filter(l => !auditSearch || (l.nom_utilisateur && l.nom_utilisateur.toLowerCase().includes(auditSearch.toLowerCase())) || (l.action && l.action.toLowerCase().includes(auditSearch.toLowerCase())))
                        .map(log => (
                          <tr key={log.log_id}>
                            <td style={{ whiteSpace: 'nowrap', color: '#64748b' }}>
                              {new Date(log.created_date).toLocaleString('fr-FR')}
                            </td>
                            <td style={{ fontWeight: 600 }}>{log.nom_utilisateur || 'Système'}</td>
                            <td>
                              <span className={styles.moduleTag}>{log.module}</span>
                            </td>
                            <td style={{ fontWeight: 600, color: '#4f46e5' }}>{log.action}</td>
                            <td style={{ fontFamily: 'monospace', color: '#64748b' }}>{log.ip_address || '127.0.0.1'}</td>
                            <td>{log.details || '-'}</td>
                          </tr>
                        ))
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </motion.div>
        )}

        {/* Modal for creating custom role */}
        {showRoleModal && (
          <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
          }}>
            <div style={{ background: 'white', borderRadius: 12, padding: 24, width: 420, maxWidth: '90%' }}>
              <h3 style={{ margin: '0 0 16px 0', fontSize: '1.2rem', fontWeight: 700 }}>Créer un nouveau rôle</h3>
              <form onSubmit={handleCreateRole}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div>
                    <label style={{ fontSize: '0.8rem', fontWeight: 700, textTransform: 'uppercase', color: '#475569' }}>Code (ex: CENSEUR)</label>
                    <input
                      type="text"
                      className={styles.inputFancy}
                      style={{ width: '100%', marginTop: 4 }}
                      value={newRoleCode}
                      onChange={(e) => setNewRoleCode(e.target.value.toUpperCase())}
                      placeholder="CENSEUR"
                      required
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '0.8rem', fontWeight: 700, textTransform: 'uppercase', color: '#475569' }}>Libellé (ex: Censeur des études)</label>
                    <input
                      type="text"
                      className={styles.inputFancy}
                      style={{ width: '100%', marginTop: 4 }}
                      value={newRoleLibelle}
                      onChange={(e) => setNewRoleLibelle(e.target.value)}
                      placeholder="Censeur des études"
                      required
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '0.8rem', fontWeight: 700, textTransform: 'uppercase', color: '#475569' }}>
                      Espace de travail
                    </label>
                    <select
                      className={styles.inputFancy}
                      style={{ width: '100%', marginTop: 4 }}
                      value={newRoleBase}
                      onChange={(e) => setNewRoleBase(e.target.value)}
                      required
                    >
                      {ESPACES_DISPONIBLES.map(esp => (
                        <option key={esp.code} value={esp.code}>{esp.libelle}</option>
                      ))}
                    </select>
                    <p style={{ margin: '6px 0 0', fontSize: '0.75rem', color: '#64748b', lineHeight: 1.5 }}>
                      Le nouveau rôle travaille dans cet espace, avec exactement les
                      mêmes accès — jamais plus. Vous pourrez ensuite lui en retirer
                      dans la matrice ci-dessous, mais pas lui en ajouter.
                      <br />
                      <strong style={{ color: '#334155' }}>
                        {ESPACES_DISPONIBLES.find(e => e.code === newRoleBase)?.detail}
                      </strong>
                    </p>
                  </div>
                  <div>
                    <label style={{ fontSize: '0.8rem', fontWeight: 700, textTransform: 'uppercase', color: '#475569' }}>Description</label>
                    <textarea
                      className={styles.inputFancy}
                      style={{ width: '100%', marginTop: 4, height: 70 }}
                      value={newRoleDesc}
                      onChange={(e) => setNewRoleDesc(e.target.value)}
                      placeholder="Supervise les emplois du temps et les évaluations..."
                    />
                  </div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
                  <button
                    type="button"
                    className={styles.cancelBtn}
                    onClick={() => setShowRoleModal(false)}
                    style={{ color: '#475569' }}
                  >
                    Annuler
                  </button>
                  <button type="submit" className={styles.saveBtn} style={{ borderRadius: 8 }}>
                    Créer le rôle
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Sticky Save Bar */}
        <AnimatePresence>
          {hasChanges && (
            <motion.div
              className={styles.stickyBar}
              initial={{ y: 80, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 80, opacity: 0 }}
            >
              <div className={styles.stickyDot} />
              <span>Modifications de sécurité non enregistrées</span>
              <button className={styles.cancelBtn} onClick={() => loadAllData()}>
                Annuler
              </button>
              <button className={styles.saveBtn} onClick={handleSaveSettings} disabled={saving}>
                {saving ? <Loader2 size={16} className="spin" /> : <Save size={16} />} Enregistrer
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Toast notifications */}
        <AnimatePresence>
          {toast && (
            <motion.div
              className={`${styles.toast} ${toast.type === 'error' ? styles.toastError : ''}`}
              initial={{ opacity: 0, x: 40 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 40 }}
            >
              <CheckCircle size={18} />
              {toast.msg}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </SettingsLayout>
  );
}
