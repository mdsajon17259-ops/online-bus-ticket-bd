import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import {
  fetchAppSettings,
  fetchCurrentUser,
  isMasterSuperAdminProfile,
  loginWithIdentifier,
  registerPassenger,
  signOutUser,
} from '../lib/api';
import type { AppSettings, Profile } from '../types';

export type ActivePanel = 'passenger' | 'bookings' | 'operator' | 'representative' | 'admin' | 'auth';
export type PassengerView = 'home' | 'bus' | 'train';

interface AppContextValue {
  settings: AppSettings;
  settingsLoading: boolean;
  refreshSettings: () => Promise<void>;
  setSettingsDirect: (next: AppSettings) => void;
  user: Profile | null;
  authLoading: boolean;
  activePanel: ActivePanel;
  setActivePanel: (panel: ActivePanel) => void;
  passengerView: PassengerView;
  setPassengerView: (view: PassengerView) => void;
  login: (identifier: string, password: string) => Promise<Profile>;
  register: (payload: {
    full_name: string;
    phone: string;
    password: string;
    email?: string;
  }) => Promise<Profile>;
  logout: () => Promise<void>;
}

const DEFAULT_SETTINGS: AppSettings = {
  id: 1,
  organization_name: 'দেশ ভ্রমণ / Desh Travels',
  organization_logo_url: '/src/assets/images/desh_travels_logo_1795618756599.jpg',
  updated_at: new Date().toISOString(),
};

const AppContext = createContext<AppContextValue | undefined>(undefined);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [user, setUser] = useState<Profile | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [activePanel, setActivePanel] = useState<ActivePanel>('passenger');
  const [passengerView, setPassengerView] = useState<PassengerView>('home');

  const refreshSettings = useCallback(async () => {
    try {
      const data = await fetchAppSettings();
      if (data) {
        setSettings(data);
        document.title = `${data.organization_name} — অনলাইন বাস টিকেট বুকিং`;
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
      .then((profile) => {
        setUser(profile);
        if (isMasterSuperAdminProfile(profile)) {
          setActivePanel('admin');
        } else if (profile?.role === 'counter_admin') {
          setActivePanel('operator');
        } else if (profile?.role === 'counter_representative') {
          setActivePanel('representative');
        }
      })
      .catch(() => setUser(null))
      .finally(() => setAuthLoading(false));
  }, [refreshSettings]);

  const login = useCallback(async (identifier: string, password: string) => {
    const res = await loginWithIdentifier(identifier, password);
    setUser(res.user);
    return res.user;
  }, []);

  const register = useCallback(
    async (payload: { full_name: string; phone: string; password: string; email?: string }) => {
      const res = await registerPassenger(payload);
      setUser(res.user);
      return res.user;
    },
    []
  );

  const logout = useCallback(async () => {
    await signOutUser();
    setUser(null);
    setActivePanel('passenger');
    setPassengerView('home');
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
        passengerView,
        setPassengerView,
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
