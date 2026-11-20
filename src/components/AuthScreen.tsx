import React, { useState } from 'react';
import { Bus, KeyRound, Lock, Phone, ShieldCheck, Ticket, User } from 'lucide-react';
import { useApp, type ActivePanel } from '../context/AppContext';
import { isMasterSuperAdminProfile } from '../lib/api';

interface AuthScreenProps {
  requiredRole?: 'counter_admin' | 'super_admin';
  redirectTo?: ActivePanel;
  title?: string;
  subtitle?: string;
}

const ROLE_LABELS: Record<string, string> = {
  super_admin: 'মাস্টার সুপার অ্যাডমিন',
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
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const profile =
        mode === 'login'
          ? await login(identifier, password)
          : await register({ full_name: fullName, phone, password });

      if (isMasterSuperAdminProfile(profile)) {
        setActivePanel('admin');
      } else if (profile.role === 'counter_admin') {
        setActivePanel('operator');
      } else if (redirectTo && redirectTo !== 'admin' && redirectTo !== 'operator') {
        setActivePanel(redirectTo);
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
    ((requiredRole === 'super_admin' && !isMasterSuperAdminProfile(user)) ||
      (requiredRole === 'counter_admin' &&
        user.role !== 'counter_admin' &&
        !isMasterSuperAdminProfile(user)))
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
            আপনি বর্তমানে <strong className="font-semibold text-slate-900">{user.email}</strong> ({ROLE_LABELS[user.role] || user.role}) হিসেবে লগইন করেছেন। এই অংশে প্রবেশ করার অনুমতি আপনার বর্তমান অ্যাকাউন্টে নেই।
          </p>
          <div className="flex flex-wrap gap-3 pt-2">
            <button
              type="button"
              onClick={logout}
              className="min-h-[44px] px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold rounded-lg transition-colors"
            >
              লগআউট করে অন্য অ্যাকাউন্টে প্রবেশ করুন
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
        {/* Unified Login / Register Form */}
        <div className="md:col-span-7 bg-white border border-slate-200 rounded-xl p-6 sm:p-8">
          <div className="mb-6">
            <h1 className="font-display text-2xl font-bold text-slate-900">
              {title || (mode === 'login' ? 'অ্যাকাউন্টে লগইন করুন' : 'নতুন যাত্রী নিবন্ধন')}
            </h1>
            <p className="text-sm text-slate-600 mt-1">
              {subtitle || 'আপনার ইউজারনেম (অথবা মোবাইল নম্বর) এবং পাসওয়ার্ড দিন। সিস্টেম স্বয়ংক্রিয়ভাবে আপনার নির্ধারিত প্যানেলে নিয়ে যাবে।'}
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
                লগইন করুন
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
            {mode === 'register' ? (
              <>
                <div>
                  <label htmlFor="auth-name" className="block text-xs font-medium text-slate-600 mb-1.5">
                    যাত্রীর পূর্ণ নাম
                  </label>
                  <div className="relative">
                    <User className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" aria-hidden="true" />
                    <input
                      id="auth-name"
                      type="text"
                      required
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="রাশেদুল করিম"
                      className="w-full min-h-[44px] pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-700"
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="auth-phone" className="block text-xs font-medium text-slate-600 mb-1.5">
                    মোবাইল নম্বর
                  </label>
                  <div className="relative">
                    <Phone className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" aria-hidden="true" />
                    <input
                      id="auth-phone"
                      type="tel"
                      required
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="01711-000000"
                      className="w-full min-h-[44px] pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-700 tabular-nums"
                    />
                  </div>
                </div>
              </>
            ) : (
              <div>
                <label htmlFor="auth-identifier" className="block text-xs font-medium text-slate-600 mb-1.5">
                  ইউজারনেম অথবা মোবাইল নম্বর
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" aria-hidden="true" />
                  <input
                    id="auth-identifier"
                    type="text"
                    required
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    placeholder="ইউজারনেম বা মোবাইল নম্বর লিখুন"
                    className="w-full min-h-[44px] pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-700"
                  />
                </div>
              </div>
            )}

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
                  minLength={4}
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
              {loading ? 'যাচাই করা হচ্ছে...' : mode === 'login' ? 'লগইন করুন' : 'নিবন্ধন সম্পন্ন করুন'}
            </button>
          </form>
        </div>

        {/* Unified Role Routing Guide */}
        <aside className="md:col-span-5 bg-white border border-slate-200 rounded-xl p-6 space-y-5">
          <div>
            <h2 className="font-display text-base font-semibold text-slate-900">
              একক লগইন ও স্বয়ংক্রিয় প্যানেল প্রবেশ
            </h2>
            <p className="text-xs text-slate-500 mt-1 leading-relaxed">
              সকল ব্যবহারকারী একই ফর্ম থেকে ইউজারনেম ও পাসওয়ার্ড ব্যবহার করে লগইন করবেন। লগইনের পর সিস্টেম স্বয়ংক্রিয়ভাবে আপনার নির্ধারিত ড্যাশবোর্ড চালু করবে।
            </p>
          </div>

          <div className="space-y-4 divide-y divide-slate-100">
            <div className="flex items-start gap-3 pt-1">
              <span className="w-8 h-8 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center shrink-0">
                <Ticket className="w-4 h-4" />
              </span>
              <div>
                <p className="text-xs font-semibold text-slate-900">সাধারণ যাত্রী</p>
                <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
                  নিবন্ধিত মোবাইল নম্বর ও পাসওয়ার্ড দিয়ে লগইন করে টিকেট বুকিং ও আপনার টিকেটের অবস্থা দেখুন।
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 pt-4">
              <span className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0">
                <Bus className="w-4 h-4" />
              </span>
              <div>
                <p className="text-xs font-semibold text-slate-900">কাউন্টার অপারেটর</p>
                <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
                  সুপার অ্যাডমিন কর্তৃক নির্ধারিত কাউন্টার ইউজারনেম ও পাসওয়ার্ড দিয়ে সরাসরি নিজস্ব কাউন্টার প্যানেলে প্রবেশ করুন।
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 pt-4">
              <span className="w-8 h-8 rounded-lg bg-slate-100 text-slate-700 flex items-center justify-center shrink-0">
                <ShieldCheck className="w-4 h-4" />
              </span>
              <div>
                <p className="text-xs font-semibold text-slate-900">সিস্টেম অ্যাডমিনিস্ট্রেটর</p>
                <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
                  নির্ধারিত অ্যাডমিন ক্রেডেনশিয়াল দিয়ে লগইন করলে সরাসরি মাস্টার কন্ট্রোল প্যানেল চালু হবে।
                </p>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </main>
  );
}
