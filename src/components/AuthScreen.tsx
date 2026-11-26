import React, { useState } from 'react';
import { ArrowRight, CheckCircle2, KeyRound, Lock, ShieldCheck, Ticket, User } from 'lucide-react';
import { useApp, type ActivePanel } from '../context/AppContext';
import { extractErrorMessage, isMasterSuperAdminProfile } from '../lib/api';

interface AuthScreenProps {
  requiredRole?: 'counter_admin' | 'counter_representative' | 'super_admin';
  redirectTo?: ActivePanel;
  title?: string;
  subtitle?: string;
}

const ROLE_LABELS: Record<string, string> = {
  super_admin: 'অ্যাডমিন',
  counter_admin: 'কাউন্টার অ্যাকাউন্ট',
  counter_representative: 'প্রতিনিধি অ্যাকাউন্ট',
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

  const handleContinueAsGuest = () => {
    setPassengerView('home');
    setActivePanel('passenger');
  };

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
        setError('সঠিক তথ্য ও পাসওয়ার্ড দিন অথবা গেস্ট হিসেবে টিকিট কাটুন।');
      }
    } catch (err) {
      setError(extractErrorMessage(err, 'সঠিক তথ্য ও পাসওয়ার্ড দিন'));
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
            প্রবেশাধিকার সীমিত
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
              onClick={handleContinueAsGuest}
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
        {/* Passenger-Facing Login & Guest Booking Card */}
        <div className="md:col-span-7 bg-white border border-slate-200 rounded-xl p-6 sm:p-8 space-y-6">
          <div>
            <h1 className="font-display text-2xl font-bold text-slate-900">
              {title || 'প্যাসেঞ্জার লগইন / User Login'}
            </h1>
            <p className="text-sm text-slate-600 mt-1.5 leading-relaxed">
              {subtitle ||
                'আপনার অ্যাকাউন্টে লগইন করুন অথবা নিবন্ধন ছাড়াই গেস্ট হিসেবে সরাসরি টিকিট বুক করুন।'}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="auth-identifier" className="block text-xs font-medium text-slate-600 mb-1.5">
                ইমেইল, ফোন বা ইউজারনেম
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
                  placeholder="ইমেইল, ফোন বা ইউজারনেম লিখুন"
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
                  placeholder="পাসওয়ার্ড লিখুন"
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

          {/* Prominent Guest Booking Option */}
          <div className="pt-4 border-t border-slate-100 space-y-3">
            <p className="text-xs text-slate-500 text-center">
              টিকিট কাটতে কোনো লগইন বা অ্যাকাউন্টের প্রয়োজন নেই
            </p>
            <button
              type="button"
              onClick={handleContinueAsGuest}
              className="w-full min-h-[44px] px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-900 text-sm font-semibold rounded-lg inline-flex items-center justify-center gap-2 transition-colors"
            >
              <span>গেস্ট হিসেবে টিকিট কাটুন / Continue as Guest</span>
              <ArrowRight className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* Traveler & Guest Benefits Guide */}
        <aside className="md:col-span-5 bg-white border border-slate-200 rounded-xl p-6 space-y-5">
          <div>
            <h2 className="font-display text-base font-semibold text-slate-900">
              যাত্রী ও গেস্ট বুকিং সুবিধা
            </h2>
            <p className="text-xs text-slate-500 mt-1 leading-relaxed">
              সহজ ও ঝামেলামুক্ত ভ্রমণের জন্য লগইন ছাড়াই সরাসরি আসন নির্বাচন এবং অনলাইন টিকিট সংগ্রহ করুন।
            </p>
          </div>

          <div className="space-y-4 divide-y divide-slate-100">
            <div className="flex items-start gap-3 pt-1">
              <span className="w-8 h-8 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center shrink-0">
                <Ticket className="w-4 h-4" />
              </span>
              <div>
                <p className="text-xs font-semibold text-slate-900">গেস্ট হিসেবে দ্রুত বুকিং</p>
                <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
                  নিবন্ধন ছাড়াই নাম, মোবাইল নম্বর ও আসন নির্বাচন করে সাথে সাথে টিকিট বুক করুন।
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 pt-4">
              <span className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0">
                <CheckCircle2 className="w-4 h-4" />
              </span>
              <div>
                <p className="text-xs font-semibold text-slate-900">তাৎক্ষণিক অনলাইন ই-টিকিট</p>
                <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
                  বুকিং সম্পন্ন হলেই সরাসরি ডাউনলোডযোগ্য অনলাইন টিকিট ও বুকিং আইডি পাবেন।
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 pt-4">
              <span className="w-8 h-8 rounded-lg bg-slate-100 text-slate-800 flex items-center justify-center shrink-0">
                <ShieldCheck className="w-4 h-4" />
              </span>
              <div>
                <p className="text-xs font-semibold text-slate-900">সহজ টিকিট যাচাই</p>
                <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
                  যেকোনো সময় মোবাইল নম্বর বা বুকিং আইডি দিয়ে টিকিটের অবস্থা দেখুন ও প্রিন্ট করুন।
                </p>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </main>
  );
}
