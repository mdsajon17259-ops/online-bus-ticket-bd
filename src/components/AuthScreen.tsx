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
    label: 'সুপার অ্যাডমিন (মাস্টার)',
    email: 'admin@bengaltransit.bd',
    password: 'Admin123!',
    hint: 'প্রতিষ্ঠানের ব্র্যান্ডিং, কাউন্টার, ট্রিপ ও ব্যবহারকারী নিয়ন্ত্রণ',
  },
  {
    label: 'গ্রিন লাইন কাউন্টার অপারেটর',
    email: 'greenline@bengaltransit.bd',
    password: 'Operator123!',
    hint: 'শুধুমাত্র গ্রিন লাইন পরিবহনের বুকিং ও ট্রিপ ব্যবস্থাপনা',
  },
  {
    label: 'হানিফ এন্টারপ্রাইজ অপারেটর',
    email: 'hanif@bengaltransit.bd',
    password: 'Operator123!',
    hint: 'শুধুমাত্র হানিফ এন্টারপ্রাইজের বুকিং ও ট্রিপ ব্যবস্থাপনা',
  },
  {
    label: 'সিলেট কেন্দ্রীয় টার্মিনাল অপারেটর',
    email: 'sylhet@bengaltransit.bd',
    password: 'Operator123!',
    hint: 'শুধুমাত্র সিলেট কেন্দ্রীয় টার্মিনালের বুকিং ও ট্রিপ ব্যবস্থাপনা',
  },
];

const ROLE_LABELS: Record<string, string> = {
  super_admin: 'সুপার অ্যাডমিন',
  counter_admin: 'কাউন্টার অপারেটর',
  user: 'সাধারণ যাত্রী',
};

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
      setError(err instanceof Error ? err.message : 'লগইন সম্পন্ন করা যায়নি');
    } finally {
      setLoading(false);
    }
  };

  if (
    user &&
    requiredRole &&
    user.role !== requiredRole &&
    !(requiredRole === 'counter_admin' && user.role === 'super_admin')
  ) {
    return (
      <main className="max-w-lg mx-auto px-4 py-14">
        <div className="bg-white border border-slate-200 rounded-xl p-6 sm:p-8 space-y-4">
          <div className="w-10 h-10 rounded-lg bg-rose-50 text-rose-700 flex items-center justify-center">
            <Lock className="w-5 h-5" />
          </div>
          <h1 className="font-display text-xl font-bold text-slate-900">
            সংরক্ষিত প্রবেশাধিকার
          </h1>
          <p className="text-sm text-slate-600 leading-relaxed">
            আপনি বর্তমানে <strong className="font-semibold text-slate-900">{user.email}</strong> ({ROLE_LABELS[user.role] || user.role}) হিসেবে লগইন করেছেন। এই প্যানেলে প্রবেশ করতে{' '}
            <strong className="font-semibold text-slate-900">
              {requiredRole === 'super_admin' ? 'সুপার অ্যাডমিন' : 'কাউন্টার অপারেটর'}
            </strong>{' '}
            অ্যাকাউন্ট প্রয়োজন।
          </p>
          <div className="flex flex-wrap gap-3 pt-2">
            <button
              type="button"
              onClick={logout}
              className="min-h-[44px] px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold rounded-lg transition-colors"
            >
              লগআউট করে অ্যাকাউন্ট পরিবর্তন করুন
            </button>
            <button
              type="button"
              onClick={() => setActivePanel('passenger')}
              className="min-h-[44px] px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 text-sm font-medium rounded-lg transition-colors"
            >
              টিকেট বুকিংয়ে ফিরে যান
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
              {title || (mode === 'login' ? 'পোর্টালে লগইন করুন' : 'নতুন যাত্রী অ্যাকাউন্ট তৈরি করুন')}
            </h1>
            <p className="text-sm text-slate-600 mt-1">
              {subtitle || 'যাত্রী বুকিং, কাউন্টার ড্যাশবোর্ড অথবা অ্যাডমিন কনসোলে প্রবেশ করতে লগইন করুন।'}
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
                লগইন
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
                যাত্রী নিবন্ধন
              </button>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'register' && (
              <div>
                <label htmlFor="auth-name" className="block text-xs font-medium text-slate-600 mb-1.5">
                  পূর্ণ নাম
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" aria-hidden="true" />
                  <input
                    id="auth-name"
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="নুসরাত জাহান"
                    className="w-full min-h-[44px] pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-700"
                  />
                </div>
              </div>
            )}

            <div>
              <label htmlFor="auth-email" className="block text-xs font-medium text-slate-600 mb-1.5">
                ইমেইল ঠিকানা
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" aria-hidden="true" />
                <input
                  id="auth-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="greenline@bengaltransit.bd"
                  className="w-full min-h-[44px] pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-700"
                />
              </div>
            </div>

            <div>
              <label htmlFor="auth-password" className="block text-xs font-medium text-slate-600 mb-1.5">
                পাসওয়ার্ড
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
              {loading ? 'যাচাই করা হচ্ছে...' : mode === 'login' ? 'লগইন করুন' : 'অ্যাকাউন্ট তৈরি করুন'}
            </button>
          </form>
        </div>

        {/* Role Access Quick Fill Directory */}
        <aside className="md:col-span-5 bg-white border border-slate-200 rounded-xl p-6 space-y-4">
          <div>
            <h2 className="font-display text-base font-semibold text-slate-900">
              ডেমো অ্যাকাউন্ট তালিকা
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              বিভিন্ন রোল ও কাউন্টার অ্যাক্সেস পরীক্ষা করতে নিচের যেকোনো অ্যাকাউন্টে ক্লিক করুন।
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
                    তথ্য পূরণ করুন
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
