import React, { useState } from 'react';
import { KeyRound, Lock, Mail, User } from 'lucide-react';
import { useApp, type ActivePanel } from '../context/AppContext';

interface AuthScreenProps {
  requiredRole?: 'counter_admin' | 'super_admin';
  redirectTo?: ActivePanel;
  title?: string;
  subtitle?: string;
}

const DEMO_ACCOUNTS = [
  {
    label: 'Super Admin',
    email: 'admin@auroratransit.com',
    password: 'Admin123!',
    hint: 'Full organization settings, counters, trips, and users',
  },
  {
    label: 'Aurora Central Operator',
    email: 'central@auroratransit.com',
    password: 'Operator123!',
    hint: 'Scoped to Aurora Central Terminal bookings & trips',
  },
  {
    label: 'Pacific Express Operator',
    email: 'pacific@auroratransit.com',
    password: 'Operator123!',
    hint: 'Scoped to Pacific Express Counter bookings & trips',
  },
];

export function AuthScreen({
  requiredRole,
  redirectTo,
  title,
  subtitle,
}: AuthScreenProps) {
  const { login, register, setActivePanel, user, logout } = useApp();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const profile =
        mode === 'login'
          ? await login(email, password)
          : await register(email, password, fullName);

      if (redirectTo) {
        setActivePanel(redirectTo);
      } else if (profile.role === 'super_admin') {
        setActivePanel('admin');
      } else if (profile.role === 'counter_admin') {
        setActivePanel('operator');
      } else {
        setActivePanel('passenger');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  // If already logged in but lacking requiredRole, show clear access control notice
  if (user && requiredRole && user.role !== requiredRole && !(requiredRole === 'counter_admin' && user.role === 'super_admin')) {
    return (
      <main className="max-w-lg mx-auto px-4 py-14">
        <div className="bg-white border border-slate-200 rounded-xl p-6 sm:p-8 space-y-4">
          <div className="w-10 h-10 rounded-lg bg-rose-50 text-rose-700 flex items-center justify-center">
            <Lock className="w-5 h-5" />
          </div>
          <h1 className="font-display text-xl font-bold text-slate-900">
            Restricted Access
          </h1>
          <p className="text-sm text-slate-600 leading-relaxed">
            You are currently signed in as <strong className="font-semibold text-slate-900">{user.email}</strong> ({user.role.replace('_', ' ')}). This panel requires{' '}
            <strong className="font-semibold text-slate-900">
              {requiredRole === 'super_admin' ? 'Super Admin' : 'Counter Operator'}
            </strong>{' '}
            privileges.
          </p>
          <div className="flex flex-wrap gap-3 pt-2">
            <button
              type="button"
              onClick={logout}
              className="min-h-[44px] px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold rounded-lg transition-colors"
            >
              Sign Out & Switch Account
            </button>
            <button
              type="button"
              onClick={() => setActivePanel('passenger')}
              className="min-h-[44px] px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 text-sm font-medium rounded-lg transition-colors"
            >
              Return to Booking
            </button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="max-w-4xl mx-auto px-4 sm:px-6 py-10 sm:py-14">
      <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-start">
        {/* Login Form */}
        <div className="md:col-span-7 bg-white border border-slate-200 rounded-xl p-6 sm:p-8">
          <div className="mb-6">
            <h1 className="font-display text-2xl font-bold text-slate-900">
              {title || (mode === 'login' ? 'Sign In to Portal' : 'Create Passenger Account')}
            </h1>
            <p className="text-sm text-slate-600 mt-1">
              {subtitle || 'Access passenger bookings, counter dispatch, or organization administration.'}
            </p>
          </div>

          {!requiredRole && (
            <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg mb-6 w-fit">
              <button
                type="button"
                onClick={() => {
                  setMode('login');
                  setError('');
                }}
                className={`px-4 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                  mode === 'login' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode('register');
                  setError('');
                }}
                className={`px-4 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                  mode === 'register' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Register Passenger
              </button>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'register' && (
              <div>
                <label htmlFor="auth-name" className="block text-xs font-medium text-slate-600 mb-1.5">
                  Full Name
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" aria-hidden="true" />
                  <input
                    id="auth-name"
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Jordan Vance"
                    className="w-full min-h-[44px] pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-700"
                  />
                </div>
              </div>
            )}

            <div>
              <label htmlFor="auth-email" className="block text-xs font-medium text-slate-600 mb-1.5">
                Email Address
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" aria-hidden="true" />
                <input
                  id="auth-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="operator@auroratransit.com"
                  className="w-full min-h-[44px] pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-700"
                />
              </div>
            </div>

            <div>
              <label htmlFor="auth-password" className="block text-xs font-medium text-slate-600 mb-1.5">
                Password
              </label>
              <div className="relative">
                <KeyRound className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" aria-hidden="true" />
                <input
                  id="auth-password"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full min-h-[44px] pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-700"
                />
              </div>
            </div>

            {error && (
              <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-700">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full min-h-[44px] px-5 py-2.5 bg-blue-700 hover:bg-blue-800 disabled:opacity-60 text-white text-sm font-semibold rounded-lg transition-colors"
            >
              {loading ? 'Authenticating...' : mode === 'login' ? 'Sign In' : 'Create Account'}
            </button>
          </form>
        </div>

        {/* Role Access Quick Fill Directory */}
        <aside className="md:col-span-5 bg-white border border-slate-200 rounded-xl p-6 space-y-4">
          <div>
            <h2 className="font-display text-base font-semibold text-slate-900">
              Role Access Directory
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              Click any credential set below to test strict role-based access control.
            </p>
          </div>

          <div className="divide-y divide-slate-100">
            {DEMO_ACCOUNTS.map((acc) => (
              <div key={acc.email} className="py-3 first:pt-0 last:pb-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-slate-900">{acc.label}</span>
                  <button
                    type="button"
                    onClick={() => {
                      setMode('login');
                      setEmail(acc.email);
                      setPassword(acc.password);
                      setError('');
                    }}
                    className="text-xs font-semibold text-blue-700 hover:underline whitespace-nowrap shrink-0"
                  >
                    Fill Credentials
                  </button>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">{acc.hint}</p>
                <p className="text-xs font-mono text-slate-600 mt-1">
                  {acc.email} · {acc.password}
                </p>
              </div>
            ))}
          </div>
        </aside>
      </div>
    </main>
  );
}
