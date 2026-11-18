import React from 'react';
import { AppProvider, useApp } from './context/AppContext';
import { GlobalHeader } from './components/GlobalHeader';
import { PassengerPortal } from './components/PassengerPortal';
import { CounterOperatorPanel } from './components/CounterOperatorPanel';
import { SuperAdminPanel } from './components/SuperAdminPanel';
import { AuthScreen } from './components/AuthScreen';
import { formatBanglaNumber } from './lib/format';

function AppShell() {
  const { activePanel, setActivePanel, settings } = useApp();

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
      <GlobalHeader />

      <div className="flex-1">
        {activePanel === 'passenger' && <PassengerPortal mode="book" />}
        {activePanel === 'bookings' && <PassengerPortal mode="lookup" />}
        {activePanel === 'operator' && <CounterOperatorPanel />}
        {activePanel === 'admin' && <SuperAdminPanel />}
        {activePanel === 'auth' && <AuthScreen />}
      </div>

      <footer className="bg-white border-t border-slate-200 mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-xs text-slate-500">
          <p>
            © {formatBanglaNumber(new Date().getFullYear())} {settings.organization_name}। সর্বস্বত্ব সংরক্ষিত।
          </p>
          <div className="flex flex-wrap items-center gap-5">
            <button
              type="button"
              onClick={() => setActivePanel('passenger')}
              className="hover:text-slate-900 transition-colors"
            >
              টিকেট বুকিং
            </button>
            <button
              type="button"
              onClick={() => setActivePanel('bookings')}
              className="hover:text-slate-900 transition-colors"
            >
              টিকেট যাচাই
            </button>
            <button
              type="button"
              onClick={() => setActivePanel('operator')}
              className="hover:text-slate-900 transition-colors"
            >
              কাউন্টার প্যানেল
            </button>
            <button
              type="button"
              onClick={() => setActivePanel('admin')}
              className="hover:text-slate-900 transition-colors"
            >
              অ্যাডমিন প্যানেল
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <AppShell />
    </AppProvider>
  );
}
