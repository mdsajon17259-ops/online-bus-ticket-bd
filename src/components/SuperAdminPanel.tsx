import React, { useCallback, useEffect, useState } from 'react';
import {
  Building2,
  Bus,
  Check,
  Database,
  LayoutDashboard,
  Plus,
  Settings,
  Trash2,
  Upload,
  Users,
} from 'lucide-react';
import {
  createAdminUser,
  createCounter,
  createTrip,
  deleteAdminUser,
  deleteCounter,
  deleteTrip,
  fetchAdminOverview,
  fetchAllUsers,
  fetchCounters,
  fetchTrips,
  updateAppSettings,
  updateUserRole,
} from '../lib/api';
import {
  BANGLADESH_DISTRICTS,
  formatBanglaDateTime,
  formatBanglaNumber,
  formatBDT,
} from '../lib/format';
import { isSupabaseConfigured, supabase } from '../lib/supabase';
import { useApp } from '../context/AppContext';
import type { AdminOverview, Counter, Profile, Trip, UserRole } from '../types';
import { AuthScreen } from './AuthScreen';

type AdminSection = 'overview' | 'counters' | 'users' | 'settings';

export function SuperAdminPanel() {
  const { user, authLoading, settings, setSettingsDirect, refreshSettings } = useApp();
  const [section, setSection] = useState<AdminSection>('overview');

  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [counters, setCounters] = useState<Counter[]>([]);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [users, setUsers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  // Dynamic Branding Settings Form
  const [orgName, setOrgName] = useState(settings.organization_name);
  const [orgLogoUrl, setOrgLogoUrl] = useState(settings.organization_logo_url);
  const [savingSettings, setSavingSettings] = useState(false);

  // New Counter Form
  const [cName, setCName] = useState('');
  const [cPhone, setCPhone] = useState('');
  const [cAddress, setCAddress] = useState('');
  const [cLogoUrl, setCLogoUrl] = useState('');
  const [creatingCounter, setCreatingCounter] = useState(false);

  // New Trip Form
  const [tCounterId, setTCounterId] = useState('');
  const [tFrom, setTFrom] = useState('');
  const [tTo, setTTo] = useState('');
  const [tDeparture, setTDeparture] = useState('');
  const [tBusType, setTBusType] = useState('এসি বিজনেস ক্লাস কোচ');
  const [tPrice, setTPrice] = useState('1200');
  const [tSeats, setTSeats] = useState('36');
  const [creatingTrip, setCreatingTrip] = useState(false);

  // New User Form
  const [uEmail, setUEmail] = useState('');
  const [uName, setUName] = useState('');
  const [uPassword, setUPassword] = useState('');
  const [uRole, setURole] = useState<UserRole>('counter_admin');
  const [uCounterId, setUCounterId] = useState('');
  const [creatingUser, setCreatingUser] = useState(false);

  useEffect(() => {
    setOrgName(settings.organization_name);
    setOrgLogoUrl(settings.organization_logo_url);
  }, [settings]);

  const isSuperAdmin = user?.role === 'super_admin';

  const loadAdminData = useCallback(async () => {
    if (!isSuperAdmin) return;
    setLoading(true);
    setError('');
    try {
      const [ov, cList, tList, uList] = await Promise.all([
        fetchAdminOverview(),
        fetchCounters(),
        fetchTrips(),
        fetchAllUsers(),
      ]);
      setOverview(ov);
      setCounters(cList);
      setTrips(tList);
      setUsers(uList);
      if (cList.length > 0) {
        setTCounterId((prev) => prev || cList[0].id);
        setUCounterId((prev) => prev || cList[0].id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'অ্যাডমিন প্যানেলের তথ্য লোড করা যায়নি');
    } finally {
      setLoading(false);
    }
  }, [isSuperAdmin]);

  useEffect(() => {
    loadAdminData();
  }, [loadAdminData]);

  const showNotice = (msg: string) => {
    setNotice(msg);
    setTimeout(() => setNotice(''), 4000);
  };

  const handleLogoFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (isSupabaseConfigured && supabase) {
      try {
        const ext = file.name.split('.').pop() || 'png';
        const path = `logos/org-logo-${Date.now()}.${ext}`;
        const { error: upErr } = await supabase.storage.from('branding').upload(path, file, { upsert: true });
        if (!upErr) {
          const { data } = supabase.storage.from('branding').getPublicUrl(path);
          setOrgLogoUrl(data.publicUrl);
          return;
        }
      } catch {
        // Fall through to local data URL
      }
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setOrgLogoUrl(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingSettings(true);
    setError('');
    try {
      const updated = await updateAppSettings({
        organization_name: orgName,
        organization_logo_url: orgLogoUrl,
      });
      setSettingsDirect(updated);
      await refreshSettings();
      showNotice('প্রতিষ্ঠানের নাম ও লোগো সফলভাবে আপডেট করা হয়েছে।');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'সেটিংস সংরক্ষণ করা যায়নি');
    } finally {
      setSavingSettings(false);
    }
  };

  const handleCreateCounter = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreatingCounter(true);
    setError('');
    try {
      await createCounter({
        counter_name: cName,
        phone: cPhone,
        address: cAddress,
        logo_url: cLogoUrl,
      });
      setCName('');
      setCPhone('');
      setCAddress('');
      setCLogoUrl('');
      await loadAdminData();
      showNotice('নতুন বাস কাউন্টার যুক্ত করা হয়েছে।');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'কাউন্টার তৈরি করা যায়নি');
    } finally {
      setCreatingCounter(false);
    }
  };

  const handleCreateTrip = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreatingTrip(true);
    setError('');
    try {
      await createTrip({
        counter_id: tCounterId,
        route_from: tFrom,
        route_to: tTo,
        departure_time: tDeparture,
        bus_type: tBusType,
        price: Number(tPrice),
        total_seats: Number(tSeats),
      });
      setTFrom('');
      setTTo('');
      await loadAdminData();
      showNotice('নতুন ট্রিপ প্রকাশ করা হয়েছে এবং আসন তৈরি হয়েছে।');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ট্রিপ তৈরি করা যায়নি');
    } finally {
      setCreatingTrip(false);
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreatingUser(true);
    setError('');
    try {
      await createAdminUser({
        email: uEmail,
        full_name: uName,
        password: uPassword,
        role: uRole,
        counter_id: uRole === 'counter_admin' ? uCounterId : null,
      });
      setUEmail('');
      setUName('');
      setUPassword('');
      await loadAdminData();
      showNotice('নতুন ব্যবহারকারী ও রোল সফলভাবে তৈরি হয়েছে।');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ব্যবহারকারী তৈরি করা যায়নি');
    } finally {
      setCreatingUser(false);
    }
  };

  const handleRoleUpdate = async (profileId: string, role: UserRole, counterId: string | null) => {
    setError('');
    try {
      await updateUserRole(profileId, role, counterId);
      await loadAdminData();
      showNotice('ব্যবহারকারীর অনুমতি আপডেট করা হয়েছে।');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'রোল পরিবর্তন করা যায়নি');
    }
  };

  if (authLoading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10">
        <div className="h-48 rounded-xl bg-white border border-slate-200 animate-pulse" />
      </div>
    );
  }

  if (!isSuperAdmin) {
    return (
      <AuthScreen
        requiredRole="super_admin"
        redirectTo="admin"
        title="সুপার অ্যাডমিন মাস্টার লগইন"
        subtitle="প্রতিষ্ঠানের ব্র্যান্ডিং, কাউন্টার, রুট, সময়সূচি ও ব্যবহারকারীর অনুমতি পরিচালনা করতে সুপার অ্যাডমিন অ্যাকাউন্ট দিয়ে লগইন করুন।"
      />
    );
  }

  const sidebarItems: Array<{ id: AdminSection; label: string; icon: React.ComponentType<{ className?: string }> }> = [
    { id: 'overview', label: 'সার্বিক বিবরণ', icon: LayoutDashboard },
    { id: 'counters', label: 'কাউন্টার ও ট্রিপ', icon: Bus },
    { id: 'users', label: 'ব্যবহারকারী ও রোল', icon: Users },
    { id: 'settings', label: 'প্রতিষ্ঠান সেটিংস', icon: Settings },
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
      <datalist id="admin-bd-districts">
        {BANGLADESH_DISTRICTS.map((city) => (
          <option key={city} value={city} />
        ))}
      </datalist>

      <div className="flex flex-col lg:flex-row gap-8 items-start">
        {/* Sidebar Navigation (240px desktop) */}
        <aside className="w-full lg:w-60 shrink-0 bg-white border border-slate-200 rounded-xl p-2 flex lg:flex-col gap-1 overflow-x-auto">
          {sidebarItems.map((item) => {
            const Icon = item.icon;
            const active = section === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setSection(item.id)}
                className={`min-h-[44px] px-3.5 py-2.5 rounded-lg text-sm font-medium flex items-center gap-2.5 whitespace-nowrap shrink-0 transition-colors ${
                  active
                    ? 'bg-blue-700 text-white font-semibold'
                    : 'text-slate-700 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </aside>

        {/* Main Workspace */}
        <main className="flex-1 min-w-0 w-full space-y-6">
          {error && (
            <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-sm text-rose-700">
              {error}
            </div>
          )}
          {notice && (
            <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-sm text-emerald-800 flex items-center gap-2">
              <Check className="w-4 h-4 shrink-0" />
              <span>{notice}</span>
            </div>
          )}

          {/* 1. OVERVIEW SECTION */}
          {section === 'overview' && (
            <div className="space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h1 className="font-display text-2xl font-bold text-slate-900">
                    মাস্টার সিস্টেম ওভারভিউ
                  </h1>
                  <p className="text-sm text-slate-600 mt-0.5">
                    সকল {formatBanglaNumber(overview?.totalCounters ?? counters.length)}টি বাস কাউন্টারের সার্বিক বুকিং ও আয়ের হিসাব।
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSection('settings')}
                  className="min-h-[40px] px-4 py-2 text-xs font-semibold text-slate-800 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors"
                >
                  ব্র্যান্ডিং পরিবর্তন করুন
                </button>
              </div>

              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white border border-slate-200 rounded-xl p-5">
                  <p className="text-xs text-slate-500">মোট বুকিং</p>
                  <p className="font-mono text-2xl font-bold text-slate-900 tabular-nums mt-1">
                    {loading ? '—' : formatBanglaNumber(overview?.totalBookings ?? 0)}
                  </p>
                  <p className="text-xs text-amber-700 mt-1 tabular-nums">
                    {formatBanglaNumber(overview?.pendingBookings ?? 0)}টি অপেক্ষমাণ
                  </p>
                </div>
                <div className="bg-white border border-slate-200 rounded-xl p-5">
                  <p className="text-xs text-slate-500">নিশ্চিতকৃত আয়</p>
                  <p className="font-mono text-2xl font-bold text-emerald-700 tabular-nums mt-1">
                    {loading ? '—' : formatBDT(overview?.confirmedRevenue ?? 0)}
                  </p>
                  <p className="text-xs text-slate-500 mt-1 tabular-nums">
                    {formatBDT(overview?.pendingRevenue ?? 0)} অপেক্ষমাণ
                  </p>
                </div>
                <div className="bg-white border border-slate-200 rounded-xl p-5">
                  <p className="text-xs text-slate-500">সক্রিয় ট্রিপ</p>
                  <p className="font-mono text-2xl font-bold text-slate-900 tabular-nums mt-1">
                    {loading ? '—' : formatBanglaNumber(overview?.activeTrips ?? 0)}
                  </p>
                  <p className="text-xs text-slate-500 mt-1">সারা দেশের রুটসমূহ</p>
                </div>
                <div className="bg-white border border-slate-200 rounded-xl p-5">
                  <p className="text-xs text-slate-500">বাস কাউন্টার</p>
                  <p className="font-mono text-2xl font-bold text-slate-900 tabular-nums mt-1">
                    {loading ? '—' : formatBanglaNumber(overview?.totalCounters ?? 0)}
                  </p>
                  <p className="text-xs text-slate-500 mt-1">নিবন্ধিত টার্মিনাল</p>
                </div>
              </div>

              {/* Per-Counter Breakdown Table */}
              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-200">
                  <h2 className="font-display text-base font-bold text-slate-900">
                    কাউন্টার ভিত্তিক কার্যকারিতা ও আয়
                  </h2>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-500">
                        <th className="py-3 px-5">কাউন্টারের নাম</th>
                        <th className="py-3 px-5 text-right">নির্ধারিত ট্রিপ</th>
                        <th className="py-3 px-5 text-right">মোট বুকিং</th>
                        <th className="py-3 px-5 text-right">নিশ্চিতকৃত আয়</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-sm">
                      {(overview?.counterStats || []).map((row) => (
                        <tr key={row.counter_id} className="hover:bg-slate-50/70">
                          <td className="py-3 px-5 font-medium text-slate-900">{row.counter_name}</td>
                          <td className="py-3 px-5 font-mono text-right tabular-nums text-slate-700">
                            {formatBanglaNumber(row.trips_count)}
                          </td>
                          <td className="py-3 px-5 font-mono text-right tabular-nums text-slate-700">
                            {formatBanglaNumber(row.bookings_count)}
                          </td>
                          <td className="py-3 px-5 font-mono font-semibold text-right tabular-nums text-slate-900">
                            {formatBDT(row.revenue)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* 2. SETTINGS SECTION (Dynamic Branding) */}
          {section === 'settings' && (
            <div className="space-y-6">
              <div>
                <h1 className="font-display text-2xl font-bold text-slate-900">
                  প্রতিষ্ঠান ও ব্র্যান্ডিং সেটিংস
                </h1>
                <p className="text-sm text-slate-600 mt-0.5">
                  এখান থেকে প্রতিষ্ঠানের নাম ও লোগো পরিবর্তন করলে তা সরাসরি <code className="font-mono text-xs bg-slate-100 px-1.5 py-0.5 rounded">app_settings</code> টেবিলে সংরক্ষিত হয় এবং সকল প্যানেলের হেডারে সাথে সাথে দেখা যায়।
                </p>
              </div>

              <form
                onSubmit={handleSaveSettings}
                className="bg-white border border-slate-200 rounded-xl p-6 space-y-6 max-w-2xl"
              >
                {/* Live Preview */}
                <div className="pb-5 border-b border-slate-200">
                  <p className="text-xs font-medium text-slate-500 mb-2.5">লাইভ হেডার ব্র্যান্ডিং প্রিভিউ</p>
                  <div className="flex items-center gap-3 p-3.5 rounded-lg bg-slate-50 border border-slate-200">
                    {orgLogoUrl ? (
                      <img
                        src={orgLogoUrl}
                        alt="প্রতিষ্ঠানের লোগো প্রিভিউ"
                        referrerPolicy="no-referrer"
                        className="w-10 h-10 rounded-lg object-cover border border-slate-200 bg-white"
                      />
                    ) : (
                      <span className="w-10 h-10 rounded-lg bg-blue-700 text-white flex items-center justify-center">
                        <Bus className="w-5 h-5" />
                      </span>
                    )}
                    <span className="font-display text-lg font-bold text-slate-900">
                      {orgName || 'প্রতিষ্ঠানের নাম'}
                    </span>
                  </div>
                </div>

                {/* Organization Name Input */}
                <div>
                  <label htmlFor="org-name" className="block text-xs font-medium text-slate-700 mb-1.5">
                    প্রতিষ্ঠানের নাম
                  </label>
                  <input
                    id="org-name"
                    type="text"
                    required
                    value={orgName}
                    onChange={(e) => setOrgName(e.target.value)}
                    placeholder="বেঙ্গল ট্রানজিট নেটওয়ার্ক"
                    className="w-full min-h-[44px] px-3.5 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-700"
                  />
                </div>

                {/* Organization Logo Upload + URL */}
                <div className="space-y-3">
                  <label htmlFor="org-logo-url" className="block text-xs font-medium text-slate-700">
                    প্রতিষ্ঠানের লোগো
                  </label>
                  <div className="flex flex-col sm:flex-row gap-3">
                    <input
                      id="org-logo-url"
                      type="text"
                      value={orgLogoUrl}
                      onChange={(e) => setOrgLogoUrl(e.target.value)}
                      placeholder="লোগোর লিংক দিন অথবা ফাইল আপলোড করুন"
                      className="flex-1 min-h-[44px] px-3.5 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-700"
                    />
                    <label className="min-h-[44px] px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold rounded-lg inline-flex items-center justify-center gap-2 cursor-pointer transition-colors whitespace-nowrap shrink-0">
                      <Upload className="w-4 h-4" aria-hidden="true" />
                      <span>লোগো আপলোড করুন</span>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleLogoFileUpload}
                        className="sr-only"
                      />
                    </label>
                  </div>
                  <p className="text-xs text-slate-500">
                    PNG, JPG বা SVG লোগো আপলোড করুন অথবা ছবির URL বসান।
                  </p>
                </div>

                <div className="pt-2 flex items-center justify-end gap-3">
                  <button
                    type="submit"
                    disabled={savingSettings}
                    className="min-h-[44px] px-6 py-2.5 bg-blue-700 hover:bg-blue-800 disabled:opacity-60 text-white text-sm font-semibold rounded-lg transition-colors"
                  >
                    {savingSettings ? 'সংরক্ষণ হচ্ছে...' : 'পরিবর্তন সংরক্ষণ করুন'}
                  </button>
                </div>
              </form>

              {/* Database Backend Reference */}
              <div className="bg-white border border-slate-200 rounded-xl p-6 max-w-2xl space-y-2">
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                  <Database className="w-4 h-4 text-blue-700" aria-hidden="true" />
                  <span>
                    সক্রিয় ডাটাবেস:{' '}
                    {isSupabaseConfigured
                      ? 'Supabase PostgreSQL (সংযুক্ত)'
                      : 'বিল্ট-ইন SQLite API সার্ভার (Supabase-প্রস্তুত)'}
                  </span>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">
                  {isSupabaseConfigured
                    ? 'আপনার Supabase প্রজেক্টের সাথে সরাসরি সংযুক্ত রয়েছে।'
                    : 'বর্তমানে স্থানীয় SQLite ডাটাবেস ব্যবহৃত হচ্ছে। ক্লাউড Supabase ব্যবহার করতে চাইলে supabase/schema.sql আপনার Supabase SQL Editor-এ রান করে VITE_SUPABASE_URL ও VITE_SUPABASE_ANON_KEY সেট করুন।'}
                </p>
              </div>
            </div>
          )}

          {/* 3. COUNTERS & TRIPS MANAGEMENT */}
          {section === 'counters' && (
            <div className="space-y-8">
              <div>
                <h1 className="font-display text-2xl font-bold text-slate-900">
                  বাস কাউন্টার, রুট ও সময়সূচি ব্যবস্থাপনা
                </h1>
                <p className="text-sm text-slate-600 mt-0.5">
                  নতুন পরিবহন কাউন্টার যোগ করুন এবং স্বয়ংক্রিয় আসনসহ নতুন বাসের ট্রিপ প্রকাশ করুন।
                </p>
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                {/* Add Counter Form */}
                <form
                  onSubmit={handleCreateCounter}
                  className="bg-white border border-slate-200 rounded-xl p-5 space-y-4"
                >
                  <h2 className="font-display text-base font-bold text-slate-900 flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-blue-700" aria-hidden="true" />
                    <span>নতুন বাস কাউন্টার যোগ করুন</span>
                  </h2>
                  <div className="space-y-3">
                    <input
                      type="text"
                      required
                      value={cName}
                      onChange={(e) => setCName(e.target.value)}
                      placeholder="কাউন্টারের নাম (যেমন: এনা ট্রান্সপোর্ট)"
                      className="w-full min-h-[42px] px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-700"
                    />
                    <input
                      type="text"
                      required
                      value={cPhone}
                      onChange={(e) => setCPhone(e.target.value)}
                      placeholder="যোগাযোগের নম্বর (যেমন: 01711-000000)"
                      className="w-full min-h-[42px] px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-700"
                    />
                    <input
                      type="text"
                      required
                      value={cAddress}
                      onChange={(e) => setCAddress(e.target.value)}
                      placeholder="টার্মিনাল বা কাউন্টারের ঠিকানা"
                      className="w-full min-h-[42px] px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-700"
                    />
                    <input
                      type="text"
                      value={cLogoUrl}
                      onChange={(e) => setCLogoUrl(e.target.value)}
                      placeholder="লোগো URL (ঐচ্ছিক)"
                      className="w-full min-h-[42px] px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-700"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={creatingCounter}
                    className="min-h-[44px] px-4 py-2 bg-blue-700 hover:bg-blue-800 disabled:opacity-60 text-white text-xs font-semibold rounded-lg inline-flex items-center gap-1.5 transition-colors"
                  >
                    <Plus className="w-4 h-4" aria-hidden="true" />
                    <span>{creatingCounter ? 'যোগ করা হচ্ছে...' : 'কাউন্টার যোগ করুন'}</span>
                  </button>
                </form>

                {/* Add Trip Form */}
                <form
                  onSubmit={handleCreateTrip}
                  className="bg-white border border-slate-200 rounded-xl p-5 space-y-4"
                >
                  <h2 className="font-display text-base font-bold text-slate-900 flex items-center gap-2">
                    <Bus className="w-4 h-4 text-blue-700" aria-hidden="true" />
                    <span>নতুন ট্রিপ ও সময়সূচি যুক্ত করুন</span>
                  </h2>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <select
                      required
                      aria-label="কাউন্টার নির্বাচন করুন"
                      value={tCounterId}
                      onChange={(e) => setTCounterId(e.target.value)}
                      className="sm:col-span-2 min-h-[42px] px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-700"
                    >
                      {counters.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.counter_name}
                        </option>
                      ))}
                    </select>
                    <input
                      type="text"
                      required
                      list="admin-bd-districts"
                      value={tFrom}
                      onChange={(e) => setTFrom(e.target.value)}
                      placeholder="যাত্রা শুরু (যেমন: ঢাকা)"
                      className="min-h-[42px] px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-700"
                    />
                    <input
                      type="text"
                      required
                      list="admin-bd-districts"
                      value={tTo}
                      onChange={(e) => setTTo(e.target.value)}
                      placeholder="গন্তব্য (যেমন: কক্সবাজার)"
                      className="min-h-[42px] px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-700"
                    />
                    <input
                      type="datetime-local"
                      required
                      value={tDeparture}
                      onChange={(e) => setTDeparture(e.target.value)}
                      className="min-h-[42px] px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-700 tabular-nums"
                    />
                    <input
                      type="text"
                      required
                      value={tBusType}
                      onChange={(e) => setTBusType(e.target.value)}
                      placeholder="বাসের ধরন (এসি / নন-এসি)"
                      className="min-h-[42px] px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-700"
                    />
                    <div>
                      <label htmlFor="t-price" className="block text-[11px] text-slate-500 mb-1">
                        টিকেট মূল্য (৳ টাকা)
                      </label>
                      <input
                        id="t-price"
                        type="number"
                        min="50"
                        step="10"
                        required
                        value={tPrice}
                        onChange={(e) => setTPrice(e.target.value)}
                        className="w-full min-h-[42px] px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-700 tabular-nums"
                      />
                    </div>
                    <div>
                      <label htmlFor="t-seats" className="block text-[11px] text-slate-500 mb-1">
                        মোট আসন সংখ্যা (৮–৬০)
                      </label>
                      <input
                        id="t-seats"
                        type="number"
                        min="8"
                        max="60"
                        step="4"
                        required
                        value={tSeats}
                        onChange={(e) => setTSeats(e.target.value)}
                        className="w-full min-h-[42px] px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-700 tabular-nums"
                      />
                    </div>
                  </div>
                  <button
                    type="submit"
                    disabled={creatingTrip || counters.length === 0}
                    className="min-h-[44px] px-4 py-2 bg-blue-700 hover:bg-blue-800 disabled:opacity-60 text-white text-xs font-semibold rounded-lg inline-flex items-center gap-1.5 transition-colors"
                  >
                    <Plus className="w-4 h-4" aria-hidden="true" />
                    <span>{creatingTrip ? 'প্রকাশ করা হচ্ছে...' : 'ট্রিপ প্রকাশ করুন'}</span>
                  </button>
                </form>
              </div>

              {/* Registered Counters Table */}
              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-200">
                  <h2 className="font-display text-base font-bold text-slate-900">
                    নিবন্ধিত বাস কাউন্টার ({formatBanglaNumber(counters.length)})
                  </h2>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-500">
                        <th className="py-3 px-5">কাউন্টারের নাম</th>
                        <th className="py-3 px-5">মোবাইল</th>
                        <th className="py-3 px-5">ঠিকানা</th>
                        <th className="py-3 px-5 text-right">মুছুন</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-sm">
                      {counters.map((c) => (
                        <tr key={c.id} className="hover:bg-slate-50/70">
                          <td className="py-3 px-5 font-medium text-slate-900">{c.counter_name}</td>
                          <td className="py-3 px-5 font-mono text-xs text-slate-600 tabular-nums">{c.phone}</td>
                          <td className="py-3 px-5 text-xs text-slate-600">{c.address}</td>
                          <td className="py-3 px-5 text-right">
                            <button
                              type="button"
                              onClick={async () => {
                                await deleteCounter(c.id);
                                await loadAdminData();
                              }}
                              aria-label={`${c.counter_name} মুছুন`}
                              className="min-h-[36px] min-w-[36px] inline-flex items-center justify-center text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Scheduled Trips Table */}
              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-200">
                  <h2 className="font-display text-base font-bold text-slate-900">
                    নির্ধারিত ট্রিপসমূহ ({formatBanglaNumber(trips.length)})
                  </h2>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-500">
                        <th className="py-3 px-5">রুট ও বাসের ধরন</th>
                        <th className="py-3 px-5">কাউন্টার</th>
                        <th className="py-3 px-5">যাত্রার সময়</th>
                        <th className="py-3 px-5 text-right">আসন</th>
                        <th className="py-3 px-5 text-right">ভাড়া</th>
                        <th className="py-3 px-5 text-right">মুছুন</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-sm">
                      {trips.map((t) => {
                        const dt = formatBanglaDateTime(t.departure_time);
                        return (
                          <tr key={t.id} className="hover:bg-slate-50/70">
                            <td className="py-3 px-5">
                              <div className="font-medium text-slate-900">
                                {t.route_from} → {t.route_to}
                              </div>
                              <div className="text-xs text-slate-500">{t.bus_type}</div>
                            </td>
                            <td className="py-3 px-5 text-xs text-slate-700">{t.counter_name}</td>
                            <td className="py-3 px-5 font-mono text-xs text-slate-600 tabular-nums">
                              {dt.date} · {dt.time}
                            </td>
                            <td className="py-3 px-5 font-mono text-xs text-right tabular-nums text-slate-700">
                              {formatBanglaNumber(t.available_seats ?? t.total_seats)}/{formatBanglaNumber(t.total_seats)}
                            </td>
                            <td className="py-3 px-5 font-mono font-semibold text-right tabular-nums text-slate-900">
                              {formatBDT(t.price)}
                            </td>
                            <td className="py-3 px-5 text-right">
                              <button
                                type="button"
                                onClick={async () => {
                                  await deleteTrip(t.id);
                                  await loadAdminData();
                                }}
                                aria-label={`${t.route_from} থেকে ${t.route_to} ট্রিপ মুছুন`}
                                className="min-h-[36px] min-w-[36px] inline-flex items-center justify-center text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* 4. USER MANAGEMENT & ROLE ASSIGNMENTS */}
          {section === 'users' && (
            <div className="space-y-6">
              <div>
                <h1 className="font-display text-2xl font-bold text-slate-900">
                  ব্যবহারকারী ও রোল ব্যবস্থাপনা
                </h1>
                <p className="text-sm text-slate-600 mt-0.5">
                  নতুন অ্যাকাউন্ট তৈরি করুন এবং সুপার অ্যাডমিন, কাউন্টার অপারেটর অথবা যাত্রী রোল নির্ধারণ করুন।
                </p>
              </div>

              {/* Create User Form */}
              <form
                onSubmit={handleCreateUser}
                className="bg-white border border-slate-200 rounded-xl p-5 space-y-4"
              >
                <h2 className="font-display text-base font-bold text-slate-900">
                  নতুন অপারেটর বা ব্যবহারকারী অ্যাকাউন্ট তৈরি করুন
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  <input
                    type="text"
                    required
                    value={uName}
                    onChange={(e) => setUName(e.target.value)}
                    placeholder="পূর্ণ নাম"
                    className="min-h-[42px] px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-700"
                  />
                  <input
                    type="email"
                    required
                    value={uEmail}
                    onChange={(e) => setUEmail(e.target.value)}
                    placeholder="ইমেইল ঠিকানা"
                    className="min-h-[42px] px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-700"
                  />
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={uPassword}
                    onChange={(e) => setUPassword(e.target.value)}
                    placeholder="পাসওয়ার্ড (কমপক্ষে ৬ অক্ষর)"
                    className="min-h-[42px] px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-700"
                  />
                  <select
                    aria-label="রোল নির্বাচন করুন"
                    value={uRole}
                    onChange={(e) => setURole(e.target.value as UserRole)}
                    className="min-h-[42px] px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-700"
                  >
                    <option value="counter_admin">কাউন্টার অপারেটর</option>
                    <option value="super_admin">সুপার অ্যাডমিন</option>
                    <option value="user">সাধারণ যাত্রী</option>
                  </select>

                  {uRole === 'counter_admin' && (
                    <select
                      aria-label="কাউন্টার নির্ধারণ করুন"
                      value={uCounterId}
                      onChange={(e) => setUCounterId(e.target.value)}
                      className="min-h-[42px] px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-700"
                    >
                      {counters.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.counter_name}
                        </option>
                      ))}
                    </select>
                  )}

                  <button
                    type="submit"
                    disabled={creatingUser}
                    className="min-h-[42px] px-4 py-2 bg-blue-700 hover:bg-blue-800 disabled:opacity-60 text-white text-xs font-semibold rounded-lg inline-flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <Plus className="w-4 h-4" aria-hidden="true" />
                    <span>{creatingUser ? 'তৈরি হচ্ছে...' : 'অ্যাকাউন্ট তৈরি করুন'}</span>
                  </button>
                </div>
              </form>

              {/* Users List */}
              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-500">
                        <th className="py-3 px-5">অ্যাকাউন্ট</th>
                        <th className="py-3 px-5">রোল</th>
                        <th className="py-3 px-5">নির্ধারিত কাউন্টার</th>
                        <th className="py-3 px-5 text-right">মুছুন</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-sm">
                      {users.map((u) => (
                        <tr key={u.id} className="hover:bg-slate-50/70">
                          <td className="py-3 px-5">
                            <div className="font-medium text-slate-900">{u.full_name || u.email}</div>
                            <div className="text-xs text-slate-500">{u.email}</div>
                          </td>
                          <td className="py-3 px-5">
                            <select
                              aria-label={`${u.email} এর রোল`}
                              value={u.role}
                              disabled={u.id === user.id}
                              onChange={(e) => {
                                const nextRole = e.target.value as UserRole;
                                const nextCounter =
                                  nextRole === 'counter_admin'
                                    ? u.counter_id || counters[0]?.id || null
                                    : null;
                                handleRoleUpdate(u.id, nextRole, nextCounter);
                              }}
                              className="min-h-[36px] px-2.5 py-1 text-xs font-medium bg-white border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-700 disabled:bg-slate-100"
                            >
                              <option value="user">যাত্রী (user)</option>
                              <option value="counter_admin">কাউন্টার অপারেটর (counter_admin)</option>
                              <option value="super_admin">সুপার অ্যাডমিন (super_admin)</option>
                            </select>
                          </td>
                          <td className="py-3 px-5">
                            {u.role === 'counter_admin' ? (
                              <select
                                aria-label={`${u.email} এর কাউন্টার`}
                                value={u.counter_id || ''}
                                onChange={(e) => handleRoleUpdate(u.id, 'counter_admin', e.target.value)}
                                className="min-h-[36px] px-2.5 py-1 text-xs font-medium bg-white border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-700"
                              >
                                {counters.map((c) => (
                                  <option key={c.id} value={c.id}>
                                    {c.counter_name}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <span className="text-xs text-slate-400">প্রযোজ্য নয়</span>
                            )}
                          </td>
                          <td className="py-3 px-5 text-right">
                            {u.id !== user.id && (
                              <button
                                type="button"
                                onClick={async () => {
                                  await deleteAdminUser(u.id);
                                  await loadAdminData();
                                }}
                                aria-label={`${u.email} মুছুন`}
                                className="min-h-[36px] min-w-[36px] inline-flex items-center justify-center text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
