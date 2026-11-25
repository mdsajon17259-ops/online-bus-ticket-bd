import React from 'react';
import { AppProvider, useApp } from './context/AppContext';
import { GlobalHeader } from './components/GlobalHeader';
import { PassengerPortal } from './components/PassengerPortal';
import { CounterOperatorPanel } from './components/CounterOperatorPanel';
import { RepresentativePanel } from './components/RepresentativePanel';
import { SuperAdminPanel } from './components/SuperAdminPanel';
import { AuthScreen } from './components/AuthScreen';
import { formatBanglaNumber } from './lib/format';

function AppShell() {
  const { activePanel, setActivePanel, setPassengerView, settings, user } = useApp();

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
      <GlobalHeader />

      <div className="flex-1">
        {activePanel === 'passenger' && <PassengerPortal mode="book" />}
        {activePanel === 'bookings' && <PassengerPortal mode="lookup" />}
        {activePanel === 'operator' && <CounterOperatorPanel />}
        {activePanel === 'representative' && <RepresentativePanel />}
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
              onClick={() => {
                setPassengerView('home');
                setActivePanel('passenger');
              }}
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
            {!user && (
              <button
                type="button"
                onClick={() => setActivePanel('auth')}
                className="hover:text-slate-900 transition-colors"
              >
                লগইন করুন
              </button>
            )}
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
