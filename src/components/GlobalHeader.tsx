import React, { useState } from 'react';
import { Bus, Menu, X } from 'lucide-react';
import { useApp, type ActivePanel } from '../context/AppContext';

export function GlobalHeader() {
  const { settings, user, activePanel, setActivePanel, logout } = useApp();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [logoError, setLogoError] = useState(false);

  const navItems: Array<{ id: ActivePanel; label: string }> = [
    { id: 'passenger', label: 'টিকেট বুকিং' },
    { id: 'bookings', label: 'টিকেট যাচাই' },
  ];

  const handleNavigate = (panel: ActivePanel) => {
    setActivePanel(panel);
    setMobileMenuOpen(false);
  };

  const dashboardTarget: ActivePanel | null =
    user?.role === 'super_admin' && user.email === 'Sajonvip'
      ? 'admin'
      : user?.role === 'counter_admin'
        ? 'operator'
        : null;

  const showDashboardShortcut = Boolean(dashboardTarget && activePanel !== dashboardTarget);

  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-8">
        {/* Zone 1: Dynamic Brand Logo + Organization Name (single line) */}
        <button
          type="button"
          onClick={() => handleNavigate('passenger')}
          className="flex items-center gap-2.5 text-left whitespace-nowrap shrink-0 min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 rounded-lg pr-1"
        >
          {settings.organization_logo_url && !logoError ? (
            <img
              src={settings.organization_logo_url}
              alt={settings.organization_name}
              referrerPolicy="no-referrer"
              onError={() => setLogoError(true)}
              className="w-8 h-8 rounded-lg object-cover border border-slate-200 bg-white shrink-0"
            />
          ) : (
            <span className="w-8 h-8 rounded-lg bg-blue-700 text-white flex items-center justify-center shrink-0">
              <Bus className="w-4 h-4" />
            </span>
          )}
          <span className="font-display text-lg font-bold tracking-tight text-slate-900 truncate max-w-[200px] sm:max-w-[260px]">
            {settings.organization_name}
          </span>
        </button>

        {/* Zone 2: Public Passenger Navigation Tabs */}
        <nav className="hidden md:flex items-center gap-6" aria-label="প্রধান নেভিগেশন">
          {navItems.map((item) => {
            const isActive = activePanel === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleNavigate(item.id)}
                className={`relative py-1 text-sm font-medium transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 rounded ${
                  isActive
                    ? 'text-blue-700'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {item.label}
                {isActive && (
                  <span
                    aria-hidden="true"
                    className="absolute left-0 right-0 -bottom-[17px] h-0.5 bg-blue-700"
                  />
                )}
              </button>
            );
          })}
        </nav>

        {/* Zone 3: Single Clean Login Action (or Active Session Controls) + Mobile Menu Trigger */}
        <div className="flex items-center gap-2 shrink-0">
          {user ? (
            <>
              {showDashboardShortcut && dashboardTarget && (
                <button
                  type="button"
                  onClick={() => handleNavigate(dashboardTarget)}
                  className="hidden md:inline-flex items-center justify-center px-3.5 py-2 min-h-[40px] text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700"
                >
                  ড্যাশবোর্ডে ফিরুন
                </button>
              )}
              <button
                type="button"
                onClick={logout}
                className="hidden md:inline-flex items-center justify-center px-4 py-2 min-h-[40px] text-xs font-semibold text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700"
              >
                লগআউট
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => handleNavigate('auth')}
              className="hidden md:inline-flex items-center justify-center px-4 py-2 min-h-[40px] text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700"
            >
              লগইন করুন
            </button>
          )}

          <button
            type="button"
            onClick={() => setMobileMenuOpen((prev) => !prev)}
            aria-label={mobileMenuOpen ? 'মেনু বন্ধ করুন' : 'মেনু খুলুন'}
            aria-expanded={mobileMenuOpen}
            className="md:hidden min-h-[44px] min-w-[44px] flex items-center justify-center text-slate-700 hover:text-slate-900 rounded-lg hover:bg-slate-100 transition-colors"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Mobile Navigation Drawer */}
      {mobileMenuOpen && (
        <div className="md:hidden border-t border-slate-200 bg-white px-4 py-3 space-y-1">
          {navItems.map((item) => {
            const isActive = activePanel === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleNavigate(item.id)}
                className={`w-full text-left px-3 min-h-[44px] rounded-lg text-sm font-medium flex items-center justify-between transition-colors ${
                  isActive
                    ? 'bg-blue-50 text-blue-700 font-semibold'
                    : 'text-slate-700 hover:bg-slate-50'
                }`}
              >
                <span>{item.label}</span>
              </button>
            );
          })}
          <div className="pt-2 border-t border-slate-100 space-y-2">
            {user ? (
              <>
                {showDashboardShortcut && dashboardTarget && (
                  <button
                    type="button"
                    onClick={() => handleNavigate(dashboardTarget)}
                    className="w-full min-h-[44px] text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors"
                  >
                    ড্যাশবোর্ডে ফিরুন
                  </button>
                )}
                <div className="flex items-center justify-between gap-3 px-3 py-2">
                  <span className="text-xs text-slate-600 truncate">{user.email}</span>
                  <button
                    type="button"
                    onClick={() => {
                      setMobileMenuOpen(false);
                      logout();
                    }}
                    className="px-4 min-h-[44px] text-xs font-semibold text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg whitespace-nowrap shrink-0"
                  >
                    লগআউট
                  </button>
                </div>
              </>
            ) : (
              <button
                type="button"
                onClick={() => handleNavigate('auth')}
                className="w-full min-h-[44px] text-sm font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg transition-colors"
              >
                লগইন করুন
              </button>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
