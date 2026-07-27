'use client';

import React, { createContext, useContext, useMemo, useState } from 'react';

interface UIContextType {
  sidebarCollapsed: boolean;
  mobileSidebarOpen: boolean;
  toggleSidebarCollapsed: () => void;
  openMobileSidebar: () => void;
  closeMobileSidebar: () => void;
}

const UIContext = createContext<UIContextType>({
  sidebarCollapsed: false,
  mobileSidebarOpen: false,
  toggleSidebarCollapsed: () => {},
  openMobileSidebar: () => {},
  closeMobileSidebar: () => {},
});

export function UIProvider({ children }: { children: React.ReactNode }) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  const value = useMemo(() => ({
    sidebarCollapsed,
    mobileSidebarOpen,
    toggleSidebarCollapsed: () => setSidebarCollapsed((prev) => !prev),
    openMobileSidebar: () => setMobileSidebarOpen(true),
    closeMobileSidebar: () => setMobileSidebarOpen(false),
  }), [sidebarCollapsed, mobileSidebarOpen]);

  return <UIContext.Provider value={value}>{children}</UIContext.Provider>;
}

export function useUI() {
  return useContext(UIContext);
}
