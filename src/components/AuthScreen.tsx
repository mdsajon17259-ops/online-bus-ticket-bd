import React, { useState } from 'react';
import { Bus, KeyRound, Lock, ShieldCheck, User } from 'lucide-react';
import { useApp, type ActivePanel } from '../context/AppContext';
import { extractErrorMessage, isMasterSuperAdminProfile } from '../lib/api';

interface AuthScreenProps {
  requiredRole?: 'counter_admin' | 'counter_representative' | 'super_admin';
  redirectTo?: ActivePanel;
  title?: string;
  subtitle?: string;
}

const ROLE_LABELS: Record<string, string> = {
  super_admin: 'অ্যাডমিন (মাস্টার কন্ট্রোল)',
  counter_admin: 'কাউন্টার পক্ষ (অপারেটর)',
  counter_representative: 'কাউন্টার প্রতিনিধি (শুধুমাত্র দেখার অনুমতি)',
};

export function AuthScreen({
  requiredRole,
  title,
  subtitle,
}: AuthScreenProps) {
  const { login, setActivePanel, setPassengerView, user, logout } = useApp();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const profile = await login(identifier, password);

      if (isMasterSuperAdminProfile(profile)) {
        setActivePanel('admin');
      } else if (profile.role === 'counter_admin') {
        setActivePanel('operator');
      } else if (profile.role === 'counter_representative') {
        setActivePanel('representative');
      } else {
        await logout();
        setError(
          'এই লগইন শুধুমাত্র অ্যাডমিন, কাউন্টার এবং প্রতিনিধির জন্য নির্ধারিত। সাধারণ যাত্রীরা লগইন ছাড়াই সরাসরি টিকিট বুক করতে পারবেন।'
        );
      }
    } catch (err) {
      setError(extractErrorMessage(err, 'সঠিক ইউজারনেম ও পাসওয়ার্ড দিন'));
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
        !isMasterSuperAdminProfile(user)) ||
      (requiredRole === 'counter_representative' &&
        user.role !== 'counter_representative' &&
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
              onClick={() => {
                setPassengerView('home');
                setActivePanel('passenger');
              }}
              className="min-h-[44px] px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 text-sm font-medium rounded-lg transition-colors"
            >
              হোম পেজে ফিরে যান
            </button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="max-w-4xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
      <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-start">
        {/* Staff-Only Login Form */}
        <div className="md:col-span-7 bg-white border border-slate-200 rounded-xl p-6 sm:p-8 space-y-6">
          <div>
            <h1 className="font-display text-2xl font-bold text-slate-900">
              {title || 'স্টাফ ও অ্যাডমিন লগইন'}
            </h1>
            <p className="text-sm text-slate-600 mt-1.5 leading-relaxed">
              {subtitle ||
                'এই লগইন শুধুমাত্র অ্যাডমিন, কাউন্টার পক্ষ এবং কাউন্টার প্রতিনিধির জন্য। সাধারণ যাত্রীরা কোনো লগইন ছাড়াই সরাসরি টিকিট বুক করতে পারবেন।'}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="auth-identifier" className="block text-xs font-medium text-slate-600 mb-1.5">
                ইউজারনেম
              </label>
              <div className="relative">
                <User className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" aria-hidden="true" />
                <input
                  id="auth-identifier"
                  type="text"
                  required
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder="অ্যাডমিন / কাউন্টার / প্রতিনিধি ইউজারনেম লিখুন"
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
              {loading ? 'যাচাই করা হচ্ছে...' : 'লগইন করুন'}
            </button>
          </form>

          <div className="pt-4 border-t border-slate-100 flex items-center justify-between gap-3 text-xs text-slate-500">
            <span>টিকিট কাটতে চাচ্ছেন? কোনো লগইন লাগবে না।</span>
            <button
              type="button"
              onClick={() => {
                setPassengerView('home');
                setActivePanel('passenger');
              }}
              className="font-semibold text-blue-700 hover:underline whitespace-nowrap shrink-0"
            >
              সরাসরি বুকিংয়ে যান
            </button>
          </div>
        </div>

        {/* Strictly 3 Staff Role Routing Guide */}
        <aside className="md:col-span-5 bg-white border border-slate-200 rounded-xl p-6 space-y-5">
          <div>
            <h2 className="font-display text-base font-semibold text-slate-900">
              নির্ধারিত ৩টি রোল ও স্বয়ংক্রিয় প্যানেল
            </h2>
            <p className="text-xs text-slate-500 mt-1 leading-relaxed">
              ইউজারনেম ও পাসওয়ার্ড যাচাইয়ের পর সিস্টেম স্বয়ংক্রিয়ভাবে আপনার নির্ধারিত প্যানেলে নিয়ে যাবে।
            </p>
          </div>

          <div className="space-y-4 divide-y divide-slate-100">
            <div className="flex items-start gap-3 pt-1">
              <span className="w-8 h-8 rounded-lg bg-slate-100 text-slate-800 flex items-center justify-center shrink-0">
                <ShieldCheck className="w-4 h-4" />
              </span>
              <div>
                <p className="text-xs font-semibold text-slate-900">১. অ্যাডমিন (Admin)</p>
                <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
                  সম্পূর্ণ অ্যাপ নিয়ন্ত্রণ, নতুন কাউন্টার যোগ ও পরিচালনা এবং পাসওয়ার্ড পুনরুদ্ধার।
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 pt-4">
              <span className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0">
                <Bus className="w-4 h-4" />
              </span>
              <div>
                <p className="text-xs font-semibold text-slate-900">২. কাউন্টার পক্ষ (Counter)</p>
                <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
                  নিজস্ব কাউন্টারের সিট ম্যাপ পরিচালনা, সরাসরি টিকিট ইস্যু এবং যাত্রীর বুকিং যাচাই ও অনুমোদন।
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 pt-4">
              <span className="w-8 h-8 rounded-lg bg-amber-50 text-amber-700 flex items-center justify-center shrink-0">
                <User className="w-4 h-4" />
              </span>
              <div>
                <p className="text-xs font-semibold text-slate-900">৩. প্রতিনিধি (Representative)</p>
                <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
                  নির্ধারিত কাউন্টারের ট্রিপ, সিট ও বিক্রয় রিপোর্ট দেখার অনুমতি (শুধুমাত্র দেখার জন্য, কোনো পরিবর্তন নয়)।
                </p>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </main>
  );
}
