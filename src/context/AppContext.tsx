import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import {
  fetchAppSettings,
  fetchCurrentUser,
  loginWithEmail,
  registerPassenger,
  signOutUser,
} from '../lib/api';
import type { AppSettings, Profile } from '../types';

export type ActivePanel = 'passenger' | 'bookings' | 'operator' | 'admin' | 'auth';

interface AppContextValue {
  settings: AppSettings;
  settingsLoading: boolean;
  refreshSettings: () => Promise<void>;
  setSettingsDirect: (next: AppSettings) => void;
  user: Profile | null;
  authLoading: boolean;
  activePanel: ActivePanel;
  setActivePanel: (panel: ActivePanel) => void;
  login: (email: string, password: string) => Promise<Profile>;
  register: (email: string, password: string, fullName: string) => Promise<Profile>;
  logout: () => Promise<void>;
}

const DEFAULT_SETTINGS: AppSettings = {
  id: 1,
  organization_name: 'Aurora Transit Network',
  organization_logo_url: '/src/assets/images/default_org_logo_1794840144839.jpg',
  updated_at: new Date().toISOString(),
};

const AppContext = createContext<AppContextValue | undefined>(undefined);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [user, setUser] = useState<Profile | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [activePanel, setActivePanel] = useState<ActivePanel>('passenger');

  const refreshSettings = useCallback(async () => {
    try {
      const data = await fetchAppSettings();
      if (data) {
        setSettings(data);
        document.title = `${data.organization_name} — Bus Ticket Booking`;
      }
    } catch (err) {
      console.error('Failed to load dynamic branding settings:', err);
    } finally {
      setSettingsLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshSettings();
    fetchCurrentUser()
      .then((profile) => setUser(profile))
      .catch(() => setUser(null))
      .finally(() => setAuthLoading(false));
  }, [refreshSettings]);

  const login = useCallback(async (email: string, password: string) => {
    const res = await loginWithEmail(email, password);
    setUser(res.user);
    return res.user;
  }, []);

  const register = useCallback(async (email: string, password: string, fullName: string) => {
    const res = await registerPassenger(email, password, fullName);
    setUser(res.user);
    return res.user;
  }, []);

  const logout = useCallback(async () => {
    await signOutUser();
    setUser(null);
    setActivePanel('passenger');
  }, []);

  return (
    <AppContext.Provider
      value={{
        settings,
        settingsLoading,
        refreshSettings,
        setSettingsDirect: setSettings,
        user,
        authLoading,
        activePanel,
        setActivePanel,
        login,
        register,
        logout,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside AppProvider');
  return ctx;
}
