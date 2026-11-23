import React, { useCallback, useEffect, useState } from 'react';
import {
  Building2,
  Bus,
  Check,
  Database,
  History,
  KeyRound,
  LayoutDashboard,
  Plus,
  Settings,
  Ticket,
  Trash2,
  Upload,
  Users,
  X,
} from 'lucide-react';
import {
  createAdminUser,
  createCounter,
  createTrip,
  deleteAdminUser,
  deleteCounter,
  deleteTrip,
  extractErrorMessage,
  fetchAdminBookings,
  fetchAdminCounters,
  fetchAdminOverview,
  fetchAllUsers,
  fetchPasswordResetLogs,
  fetchTrips,
  isMasterSuperAdminProfile,
  MASTER_ADMIN_USERNAME,
  resetCounterAccountPassword,
  updateAppSettings,
  updateBookingStatus,
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
import type {
  AdminOverview,
  Booking,
  Counter,
  PasswordResetLog,
  Profile,
  Trip,
  UserRole,
} from '../types';
import { AuthScreen } from './AuthScreen';
import { StatusBadge } from './StatusBadge';

type AdminSection = 'overview' | 'bookings' | 'counters' | 'users' | 'settings';

export function SuperAdminPanel() {
  const { user, authLoading, settings, setSettingsDirect, refreshSettings } = useApp();
  const [section, setSection] = useState<AdminSection>('overview');

  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [allBookings, setAllBookings] = useState<Booking[]>([]);
  const [counters, setCounters] = useState<Counter[]>([]);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [users, setUsers] = useState<Profile[]>([]);
  const [resetLogs, setResetLogs] = useState<PasswordResetLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  // Dynamic Branding Settings Form
  const [orgName, setOrgName] = useState(settings.organization_name);
  const [orgLogoUrl, setOrgLogoUrl] = useState(settings.organization_logo_url);
  const [savingSettings, setSavingSettings] = useState(false);

  // New Counter Form (includes Counter + Representative Usernames & Passwords)
  const [cName, setCName] = useState('');
  const [cPhone, setCPhone] = useState('');
  const [cAddress, setCAddress] = useState('');
  const [cLogoUrl, setCLogoUrl] = useState('');
  const [cUsername, setCUsername] = useState('');
  const [cPassword, setCPassword] = useState('');
  const [cRepUsername, setCRepUsername] = useState('');
  const [cRepPassword, setCRepPassword] = useState('');
  const [creatingCounter, setCreatingCounter] = useState(false);

  // Admin Recovery: Password Reset Modal State
  const [resetModal, setResetModal] = useState<{
    counterId: string;
    counterName: string;
    targetRole: 'counter_admin' | 'counter_representative';
    targetUsername: string;
  } | null>(null);
  const [resetNewPassword, setResetNewPassword] = useState('');
  const [resettingPassword, setResettingPassword] = useState(false);

  // New Trip Form
  const [tCounterId, setTCounterId] = useState('');
  const [tFrom, setTFrom] = useState('');
  const [tTo, setTTo] = useState('');
  const [tDeparture, setTDeparture] = useState('');
  const [tBusType, setTBusType] = useState('এসি বিজনেস ক্লাস কোচ');
  const [tPrice, setTPrice] = useState('1200');
  const [tSeats, setTSeats] = useState('36');
  const [creatingTrip, setCreatingTrip] = useState(false);

  // New User / Counter Operator / Representative Form
  const [uUsername, setUUsername] = useState('');
  const [uName, setUName] = useState('');
  const [uPhone, setUPhone] = useState('');
  const [uPassword, setUPassword] = useState('');
  const [uRole, setURole] = useState<UserRole>('counter_admin');
  const [uCounterId, setUCounterId] = useState('');
  const [creatingUser, setCreatingUser] = useState(false);

  useEffect(() => {
    setOrgName(settings.organization_name);
    setOrgLogoUrl(settings.organization_logo_url);
  }, [settings]);

  const isMasterSuperAdmin = isMasterSuperAdminProfile(user);

  const loadAdminData = useCallback(async () => {
    if (!isMasterSuperAdmin) return;
    setLoading(true);
    setError('');
    try {
      const [ov, bList, cList, tList, uList, logsList] = await Promise.all([
        fetchAdminOverview(),
        fetchAdminBookings(),
        fetchAdminCounters(),
        fetchTrips(),
        fetchAllUsers(),
        fetchPasswordResetLogs(),
      ]);
      setOverview(ov);
      setAllBookings(bList);
      setCounters(cList);
      setTrips(tList);
      setUsers(uList);
      setResetLogs(logsList);
      if (cList.length > 0) {
        setTCounterId((prev) => prev || cList[0].id);
        setUCounterId((prev) => prev || cList[0].id);
      }
    } catch (err) {
      setError(extractErrorMessage(err, 'অ্যাডমিন প্যানেলের তথ্য লোড করা যায়নি'));
    } finally {
      setLoading(false);
    }
  }, [isMasterSuperAdmin]);

  useEffect(() => {
    loadAdminData();
  }, [loadAdminData]);

  const showNotice = (msg: string) => {
    setNotice(msg);
    setTimeout(() => setNotice(''), 5000);
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
      setError(extractErrorMessage(err, 'সেটিংস সংরক্ষণ করা যায়নি'));
    } finally {
      setSavingSettings(false);
    }
  };

  const handleCreateCounter = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const opUser = cUsername.trim();
    const repUser = cRepUsername.trim();

    if (cPassword.length < 6 || cRepPassword.length < 6) {
      setError('কাউন্টার ও প্রতিনিধি উভয়ের পাসওয়ার্ড কমপক্ষে ৬ অক্ষরের হতে হবে।');
      return;
    }
    if (opUser.toLowerCase() === repUser.toLowerCase()) {
      setError('কাউন্টার ইউজারনেম এবং প্রতিনিধি ইউজারনেম এক হতে পারবে না।');
      return;
    }
    const existingSet = new Set([
      MASTER_ADMIN_USERNAME.toLowerCase(),
      ...users.map((u) => u.email.trim().toLowerCase()),
    ]);
    if (existingSet.has(opUser.toLowerCase())) {
      setError(`কাউন্টার ইউজারনেম "${opUser}" ইতিমধ্যে সিস্টেমে বিদ্যমান। অনুগ্রহ করে ভিন্ন ইউজারনেম দিন।`);
      return;
    }
    if (existingSet.has(repUser.toLowerCase())) {
      setError(`প্রতিনিধি ইউজারনেম "${repUser}" ইতিমধ্যে সিস্টেমে বিদ্যমান। অনুগ্রহ করে ভিন্ন ইউজারনেম দিন।`);
      return;
    }

    setCreatingCounter(true);
    try {
      await createCounter({
        counter_name: cName,
        phone: cPhone,
        address: cAddress,
        logo_url: cLogoUrl,
        operator_username: opUser,
        operator_password: cPassword,
        representative_username: repUser,
        representative_password: cRepPassword,
      });
      setCName('');
      setCPhone('');
      setCAddress('');
      setCLogoUrl('');
      setCUsername('');
      setCPassword('');
      setCRepUsername('');
      setCRepPassword('');
      await loadAdminData();
      showNotice('নতুন বাস কাউন্টার, কাউন্টার অ্যাকাউন্ট এবং প্রতিনিধি অ্যাকাউন্ট সফলভাবে তৈরি হয়েছে।');
    } catch (err) {
      setError(extractErrorMessage(err, 'কাউন্টার তৈরি করা যায়নি'));
    } finally {
      setCreatingCounter(false);
    }
  };

  const handleResetPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetModal) return;
    if (resetNewPassword.length < 6) {
      setError('নতুন পাসওয়ার্ড কমপক্ষে ৬ অক্ষরের হতে হবে।');
      return;
    }
    setResettingPassword(true);
    setError('');
    try {
      await resetCounterAccountPassword({
        counter_id: resetModal.counterId,
        target_role: resetModal.targetRole,
        new_password: resetNewPassword,
      });
      const roleLabel =
        resetModal.targetRole === 'counter_admin' ? 'কাউন্টার' : 'কাউন্টার প্রতিনিধি';
      setResetModal(null);
      setResetNewPassword('');
      await loadAdminData();
      showNotice(
        `${roleLabel} (${resetModal.targetUsername}) অ্যাকাউন্টের পাসওয়ার্ড রিসেট হয়েছে এবং পূর্বের সকল সেশন বাতিল করা হয়েছে।`
      );
    } catch (err) {
      setError(extractErrorMessage(err, 'পাসওয়ার্ড রিসেট করা যায়নি'));
    } finally {
      setResettingPassword(false);
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
      setError(extractErrorMessage(err, 'ট্রিপ তৈরি করা যায়নি'));
    } finally {
      setCreatingTrip(false);
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (uPassword.length < 6) {
      setError('পাসওয়ার্ড কমপক্ষে ৬ অক্ষরের হতে হবে।');
      return;
    }
    setCreatingUser(true);
    try {
      const isCounterRole = uRole === 'counter_admin' || uRole === 'counter_representative';
      await createAdminUser({
        email: uUsername,
        full_name: uName,
        phone: uPhone,
        password: uPassword,
        role: uRole,
        counter_id: isCounterRole ? uCounterId : null,
      });
      setUUsername('');
      setUName('');
      setUPhone('');
      setUPassword('');
      await loadAdminData();
      showNotice('নতুন অ্যাকাউন্ট সফলভাবে তৈরি হয়েছে।');
    } catch (err) {
      setError(extractErrorMessage(err, 'ব্যবহারকারী তৈরি করা যায়নি'));
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
      setError(extractErrorMessage(err, 'রোল পরিবর্তন করা যায়নি'));
    }
  };

  if (authLoading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10">
        <div className="h-48 rounded-xl bg-white border border-slate-200 animate-pulse" />
      </div>
    );
  }

  if (!isMasterSuperAdmin) {
    return (
      <AuthScreen
        requiredRole="super_admin"
        redirectTo="admin"
        title="মাস্টার সুপার অ্যাডমিন লগইন"
        subtitle="প্রতিষ্ঠানের ব্র্যান্ডিং, কাউন্টার, অপারেটর ইউজারনেম/পাসওয়ার্ড এবং সকল ট্রিপ পরিচালনা করতে মাস্টার সুপার অ্যাডমিন অ্যাকাউন্ট দিয়ে লগইন করুন।"
      />
    );
  }

  const sidebarItems: Array<{ id: AdminSection; label: string; icon: React.ComponentType<{ className?: string }> }> = [
    { id: 'overview', label: 'সার্বিক বিবরণ', icon: LayoutDashboard },
    { id: 'bookings', label: 'সকল বুকিং', icon: Ticket },
    { id: 'counters', label: 'কাউন্টার ও ট্রিপ', icon: Bus },
    { id: 'users', label: 'অপারেটর ও ব্যবহারকারী', icon: Users },
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
        {/* Sidebar Navigation */}
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

          {/* 2. ALL BOOKINGS OVERSIGHT */}
          {section === 'bookings' && (
            <div className="space-y-6">
              <div>
                <h1 className="font-display text-2xl font-bold text-slate-900">
                  সকল কাউন্টারের বুকিং তালিকা
                </h1>
                <p className="text-sm text-slate-600 mt-0.5">
                  মোট {formatBanglaNumber(allBookings.length)}টি বুকিং অনুরোধ তদারকি ও পরিচালনা করুন।
                </p>
              </div>

              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-500">
                        <th className="py-3 px-4">আইডি</th>
                        <th className="py-3 px-4">যাত্রী</th>
                        <th className="py-3 px-4">কাউন্টার ও রুট</th>
                        <th className="py-3 px-4">আসন</th>
                        <th className="py-3 px-4 text-right">ভাড়া</th>
                        <th className="py-3 px-4">অবস্থা</th>
                        <th className="py-3 px-4 text-right">পদক্ষেপ</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-sm">
                      {allBookings.map((b) => (
                        <tr key={b.id} className="hover:bg-slate-50/70">
                          <td className="py-3 px-4 font-mono text-xs font-semibold text-slate-900 tabular-nums whitespace-nowrap">
                            {b.id}
                          </td>
                          <td className="py-3 px-4">
                            <div className="font-medium text-slate-900">{b.passenger_name}</div>
                            <div className="text-xs font-mono text-slate-500 tabular-nums">{b.phone}</div>
                          </td>
                          <td className="py-3 px-4">
                            <div className="font-medium text-slate-900">{b.trip?.counter_name}</div>
                            <div className="text-xs text-slate-500">
                              {b.trip?.route_from} → {b.trip?.route_to}
                            </div>
                          </td>
                          <td className="py-3 px-4 font-mono text-xs font-semibold tabular-nums">
                            {b.selected_seats.join(', ')}
                          </td>
                          <td className="py-3 px-4 font-mono font-semibold text-right tabular-nums">
                            {formatBDT(b.total_fare)}
                          </td>
                          <td className="py-3 px-4">
                            <StatusBadge status={b.status} />
                          </td>
                          <td className="py-3 px-4 text-right whitespace-nowrap">
                            <div className="inline-flex items-center gap-2">
                              {b.status !== 'confirmed' && (
                                <button
                                  type="button"
                                  onClick={async () => {
                                    setError('');
                                    try {
                                      await updateBookingStatus(b.id, 'confirmed');
                                      await loadAdminData();
                                    } catch (err) {
                                      setError(extractErrorMessage(err, 'বুকিং নিশ্চিত করা যায়নি'));
                                    }
                                  }}
                                  className="min-h-[34px] px-2.5 py-1 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-md"
                                >
                                  নিশ্চিত
                                </button>
                              )}
                              {b.status !== 'cancelled' && (
                                <button
                                  type="button"
                                  onClick={async () => {
                                    setError('');
                                    try {
                                      await updateBookingStatus(b.id, 'cancelled');
                                      await loadAdminData();
                                    } catch (err) {
                                      setError(extractErrorMessage(err, 'বুকিং বাতিল করা যায়নি'));
                                    }
                                  }}
                                  className="min-h-[34px] px-2.5 py-1 text-xs font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-md"
                                >
                                  বাতিল
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* 3. SETTINGS SECTION (Dynamic Branding) */}
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
                    placeholder="দেশ ভ্রমণ / Desh Travels"
                    className="w-full min-h-[44px] px-3.5 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-700"
                  />
                </div>

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
                    ? 'আপনার Supabase প্রজেক্টের সাথে সরাসরি সংযুক্ত রয়েছে (মাস্টার অ্যাডমিন: Sajonvip)।'
                    : 'বর্তমানে স্থানীয় SQLite ডাটাবেস ব্যবহৃত হচ্ছে। ক্লাউড Supabase ব্যবহার করতে চাইলে supabase/schema.sql আপনার Supabase SQL Editor-এ রান করে VITE_SUPABASE_URL ও VITE_SUPABASE_ANON_KEY সেট করুন — সাথে সাথে Sajonvip মাস্টার অ্যাডমিন অ্যাকাউন্টও সক্রিয় হয়ে যাবে।'}
                </p>
              </div>
            </div>
          )}

          {/* 4. COUNTERS & TRIPS MANAGEMENT */}
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
                <form
                  onSubmit={handleCreateCounter}
                  className="bg-white border border-slate-200 rounded-xl p-5 space-y-4"
                >
                  <h2 className="font-display text-base font-bold text-slate-900 flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-blue-700" aria-hidden="true" />
                    <span>নতুন কাউন্টার যোগ করুন</span>
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
                    <div className="pt-3 border-t border-slate-100 space-y-3">
                      <p className="text-xs font-semibold text-slate-800">
                        কাউন্টার লগইন অ্যাকাউন্ট (পূর্ণ কাউন্টার নিয়ন্ত্রণ)
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label htmlFor="c-username" className="block text-[11px] font-medium text-slate-600 mb-1">
                            কাউন্টার ইউজারনেম *
                          </label>
                          <input
                            id="c-username"
                            type="text"
                            required
                            autoCapitalize="none"
                            autoCorrect="off"
                            spellCheck={false}
                            value={cUsername}
                            onChange={(e) => setCUsername(e.target.value)}
                            placeholder="যেমন: ena_counter"
                            className="w-full min-h-[42px] px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-700"
                          />
                        </div>
                        <div>
                          <label htmlFor="c-password" className="block text-[11px] font-medium text-slate-600 mb-1">
                            কাউন্টার পাসওয়ার্ড *
                          </label>
                          <input
                            id="c-password"
                            type="password"
                            required
                            minLength={6}
                            value={cPassword}
                            onChange={(e) => setCPassword(e.target.value)}
                            placeholder="কমপক্ষে ৬ অক্ষর"
                            className="w-full min-h-[42px] px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-700"
                          />
                        </div>
                      </div>
                    </div>

                    <div className="pt-3 border-t border-slate-100 space-y-3">
                      <p className="text-xs font-semibold text-slate-800">
                        কাউন্টার প্রতিনিধি অ্যাকাউন্ট (শুধুমাত্র দেখার অনুমতি / Read-Only)
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label htmlFor="c-rep-username" className="block text-[11px] font-medium text-slate-600 mb-1">
                            কাউন্টার প্রতিনিধি ইউজারনেম *
                          </label>
                          <input
                            id="c-rep-username"
                            type="text"
                            required
                            autoCapitalize="none"
                            autoCorrect="off"
                            spellCheck={false}
                            value={cRepUsername}
                            onChange={(e) => setCRepUsername(e.target.value)}
                            placeholder="যেমন: ena_rep"
                            className="w-full min-h-[42px] px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-700"
                          />
                        </div>
                        <div>
                          <label htmlFor="c-rep-password" className="block text-[11px] font-medium text-slate-600 mb-1">
                            কাউন্টার প্রতিনিধি পাসওয়ার্ড *
                          </label>
                          <input
                            id="c-rep-password"
                            type="password"
                            required
                            minLength={6}
                            value={cRepPassword}
                            onChange={(e) => setCRepPassword(e.target.value)}
                            placeholder="কমপক্ষে ৬ অক্ষর"
                            className="w-full min-h-[42px] px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-700"
                          />
                        </div>
                      </div>
                    </div>
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

              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-200">
                  <h2 className="font-display text-base font-bold text-slate-900">
                    নিবন্ধিত বাস কাউন্টার ও অ্যাডমিন রিকভারি ({formatBanglaNumber(counters.length)})
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    প্রতিটি কাউন্টারের ইউজারনেম, প্রতিনিধি ইউজারনেম দেখুন এবং প্রয়োজনে পাসওয়ার্ড রিসেট করুন।
                  </p>
                </div>

                {/* Mobile Cards (< md) */}
                <div className="md:hidden divide-y divide-slate-200">
                  {counters.map((c) => {
                    const opUser =
                      c.operator_username ||
                      users.find((u) => u.role === 'counter_admin' && u.counter_id === c.id)?.email ||
                      '';
                    const repUser =
                      c.representative_username ||
                      users.find((u) => u.role === 'counter_representative' && u.counter_id === c.id)?.email ||
                      '';
                    return (
                      <div key={c.id} className="p-4 space-y-3">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="font-semibold text-slate-900">{c.counter_name}</div>
                            <div className="text-xs font-mono text-slate-500 tabular-nums">{c.phone}</div>
                            <div className="text-xs text-slate-500">{c.address}</div>
                          </div>
                          <button
                            type="button"
                            onClick={async () => {
                              setError('');
                              try {
                                await deleteCounter(c.id);
                                await loadAdminData();
                              } catch (err) {
                                setError(extractErrorMessage(err, 'কাউন্টার মুছে ফেলা যায়নি'));
                              }
                            }}
                            aria-label={`${c.counter_name} মুছুন`}
                            className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>

                        <div className="grid grid-cols-1 gap-2 text-xs bg-slate-50 rounded-lg p-3">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-slate-500">কাউন্টার ইউজারনেম:</span>
                            <span className="font-mono font-semibold text-blue-700">
                              {opUser || 'নির্ধারিত নয়'}
                            </span>
                          </div>
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-slate-500">প্রতিনিধি ইউজারনেম:</span>
                            <span className="font-mono font-semibold text-amber-800">
                              {repUser || 'নির্ধারিত নয়'}
                            </span>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 gap-2">
                          <button
                            type="button"
                            disabled={!opUser}
                            onClick={() => {
                              setResetModal({
                                counterId: c.id,
                                counterName: c.counter_name,
                                targetRole: 'counter_admin',
                                targetUsername: opUser,
                              });
                              setResetNewPassword('');
                              setError('');
                            }}
                            className="min-h-[44px] px-3 py-2 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 disabled:opacity-40 rounded-lg inline-flex items-center justify-center gap-1.5"
                          >
                            <KeyRound className="w-3.5 h-3.5" aria-hidden="true" />
                            <span>Reset Counter Password</span>
                          </button>
                          <button
                            type="button"
                            disabled={!repUser}
                            onClick={() => {
                              setResetModal({
                                counterId: c.id,
                                counterName: c.counter_name,
                                targetRole: 'counter_representative',
                                targetUsername: repUser,
                              });
                              setResetNewPassword('');
                              setError('');
                            }}
                            className="min-h-[44px] px-3 py-2 text-xs font-semibold text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-200 disabled:opacity-40 rounded-lg inline-flex items-center justify-center gap-1.5"
                          >
                            <KeyRound className="w-3.5 h-3.5" aria-hidden="true" />
                            <span>Reset Representative Password</span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Desktop Table (>= md) */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-500">
                        <th className="py-3 px-4">কাউন্টার ও ঠিকানা</th>
                        <th className="py-3 px-4">কাউন্টার ইউজারনেম</th>
                        <th className="py-3 px-4">প্রতিনিধি ইউজারনেম</th>
                        <th className="py-3 px-4">পাসওয়ার্ড রিকভারি</th>
                        <th className="py-3 px-4 text-right">মুছুন</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-sm">
                      {counters.map((c) => {
                        const opUser =
                          c.operator_username ||
                          users.find((u) => u.role === 'counter_admin' && u.counter_id === c.id)?.email ||
                          '';
                        const repUser =
                          c.representative_username ||
                          users.find((u) => u.role === 'counter_representative' && u.counter_id === c.id)?.email ||
                          '';
                        return (
                          <tr key={c.id} className="hover:bg-slate-50/70">
                            <td className="py-3 px-4">
                              <div className="font-medium text-slate-900">{c.counter_name}</div>
                              <div className="text-xs font-mono text-slate-500 tabular-nums">{c.phone}</div>
                              <div className="text-[11px] text-slate-500">{c.address}</div>
                            </td>
                            <td className="py-3 px-4 font-mono text-xs text-blue-700">
                              {opUser || <span className="text-slate-400">নির্ধারিত নয়</span>}
                            </td>
                            <td className="py-3 px-4 font-mono text-xs text-amber-800">
                              {repUser || <span className="text-slate-400">নির্ধারিত নয়</span>}
                            </td>
                            <td className="py-3 px-4">
                              <div className="flex flex-wrap items-center gap-2">
                                <button
                                  type="button"
                                  disabled={!opUser}
                                  onClick={() => {
                                    setResetModal({
                                      counterId: c.id,
                                      counterName: c.counter_name,
                                      targetRole: 'counter_admin',
                                      targetUsername: opUser,
                                    });
                                    setResetNewPassword('');
                                    setError('');
                                  }}
                                  className="min-h-[36px] px-2.5 py-1 text-[11px] font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 disabled:opacity-40 rounded-md inline-flex items-center gap-1 whitespace-nowrap"
                                >
                                  <KeyRound className="w-3 h-3" aria-hidden="true" />
                                  <span>Reset Counter Password</span>
                                </button>
                                <button
                                  type="button"
                                  disabled={!repUser}
                                  onClick={() => {
                                    setResetModal({
                                      counterId: c.id,
                                      counterName: c.counter_name,
                                      targetRole: 'counter_representative',
                                      targetUsername: repUser,
                                    });
                                    setResetNewPassword('');
                                    setError('');
                                  }}
                                  className="min-h-[36px] px-2.5 py-1 text-[11px] font-semibold text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-200 disabled:opacity-40 rounded-md inline-flex items-center gap-1 whitespace-nowrap"
                                >
                                  <KeyRound className="w-3 h-3" aria-hidden="true" />
                                  <span>Reset Representative Password</span>
                                </button>
                              </div>
                            </td>
                            <td className="py-3 px-4 text-right">
                              <button
                                type="button"
                                onClick={async () => {
                                  setError('');
                                  try {
                                    await deleteCounter(c.id);
                                    await loadAdminData();
                                  } catch (err) {
                                    setError(extractErrorMessage(err, 'কাউন্টার মুছে ফেলা যায়নি'));
                                  }
                                }}
                                aria-label={`${c.counter_name} মুছুন`}
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

              {/* Password Reset Audit Log */}
              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-200 flex items-center gap-2">
                  <History className="w-4 h-4 text-slate-600" aria-hidden="true" />
                  <div>
                    <h2 className="font-display text-base font-bold text-slate-900">
                      পাসওয়ার্ড রিসেট অডিট লগ ({formatBanglaNumber(resetLogs.length)})
                    </h2>
                    <p className="text-xs text-slate-500">
                      প্রতিটি পাসওয়ার্ড রিসেটের পর পূর্বের সকল সেশন স্বয়ংক্রিয়ভাবে বাতিল হয় এবং এখানে লগ সংরক্ষিত থাকে।
                    </p>
                  </div>
                </div>
                {resetLogs.length === 0 ? (
                  <div className="p-6 text-xs text-slate-500 text-center">
                    এখনো কোনো পাসওয়ার্ড রিসেট করা হয়নি।
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-500">
                          <th className="py-3 px-4">কাউন্টারের নাম</th>
                          <th className="py-3 px-4">অ্যাকাউন্টের ধরন</th>
                          <th className="py-3 px-4">ইউজারনেম</th>
                          <th className="py-3 px-4">রিসেট করেছেন</th>
                          <th className="py-3 px-4">তারিখ ও সময়</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-xs">
                        {resetLogs.map((log) => {
                          const dt = formatBanglaDateTime(log.created_at);
                          return (
                            <tr key={log.id} className="hover:bg-slate-50/70">
                              <td className="py-2.5 px-4 font-medium text-slate-900">{log.counter_name}</td>
                              <td className="py-2.5 px-4">
                                {log.target_role === 'counter_admin'
                                  ? 'কাউন্টার (Counter)'
                                  : 'প্রতিনিধি (Representative)'}
                              </td>
                              <td className="py-2.5 px-4 font-mono text-slate-700">{log.target_username}</td>
                              <td className="py-2.5 px-4 font-mono text-slate-600">{log.reset_by}</td>
                              <td className="py-2.5 px-4 font-mono text-slate-500 tabular-nums">
                                {dt.date} · {dt.time}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

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
                                  setError('');
                                  try {
                                    await deleteTrip(t.id);
                                    await loadAdminData();
                                  } catch (err) {
                                    setError(extractErrorMessage(err, 'ট্রিপ মুছে ফেলা যায়নি'));
                                  }
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

          {/* 5. OPERATOR & USER MANAGEMENT */}
          {section === 'users' && (
            <div className="space-y-6">
              <div>
                <h1 className="font-display text-2xl font-bold text-slate-900">
                  কাউন্টার অপারেটর ও ব্যবহারকারী ব্যবস্থাপনা
                </h1>
                <p className="text-sm text-slate-600 mt-0.5">
                  প্রতিটি বাস কাউন্টারের জন্য আলাদা অপারেটর ইউজারনেম ও পাসওয়ার্ড তৈরি করুন এবং নির্দিষ্ট কাউন্টারে যুক্ত করুন।
                </p>
              </div>

              <form
                onSubmit={handleCreateUser}
                className="bg-white border border-slate-200 rounded-xl p-5 space-y-4"
              >
                <h2 className="font-display text-base font-bold text-slate-900">
                  নতুন কাউন্টার অপারেটর / ব্যবহারকারী তৈরি করুন
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  <input
                    type="text"
                    required
                    value={uName}
                    onChange={(e) => setUName(e.target.value)}
                    placeholder="অপারেটরের পূর্ণ নাম"
                    className="min-h-[42px] px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-700"
                  />
                  <input
                    type="text"
                    required
                    value={uUsername}
                    onChange={(e) => setUUsername(e.target.value)}
                    placeholder="ইউজারনেম (যেমন: ena_dhaka)"
                    className="min-h-[42px] px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-700"
                  />
                  <input
                    type="tel"
                    value={uPhone}
                    onChange={(e) => setUPhone(e.target.value)}
                    placeholder="মোবাইল নম্বর (ঐচ্ছিক)"
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
                    <option value="counter_representative">কাউন্টার প্রতিনিধি (Read-Only)</option>
                    <option value="user">সাধারণ যাত্রী</option>
                  </select>

                  {(uRole === 'counter_admin' || uRole === 'counter_representative') && (
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

              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-500">
                        <th className="py-3 px-5">অ্যাকাউন্ট / ইউজারনেম</th>
                        <th className="py-3 px-5">রোল</th>
                        <th className="py-3 px-5">নির্ধারিত কাউন্টার</th>
                        <th className="py-3 px-5 text-right">মুছুন</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-sm">
                      {users.map((u) => {
                        const isCounterRole =
                          u.role === 'counter_admin' || u.role === 'counter_representative';
                        return (
                          <tr key={u.id} className="hover:bg-slate-50/70">
                            <td className="py-3 px-5">
                              <div className="font-medium text-slate-900">{u.full_name || u.email}</div>
                              <div className="text-xs font-mono text-slate-500">
                                ইউজারনেম: {u.email}
                                {u.phone ? ` · ${u.phone}` : ''}
                              </div>
                            </td>
                            <td className="py-3 px-5">
                              <select
                                aria-label={`${u.email} এর রোল`}
                                value={u.role}
                                onChange={(e) => {
                                  const nextRole = e.target.value as UserRole;
                                  const nextIsCounter =
                                    nextRole === 'counter_admin' ||
                                    nextRole === 'counter_representative';
                                  const nextCounter = nextIsCounter
                                    ? u.counter_id || counters[0]?.id || null
                                    : null;
                                  handleRoleUpdate(u.id, nextRole, nextCounter);
                                }}
                                className="min-h-[36px] px-2.5 py-1 text-xs font-medium bg-white border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-700"
                              >
                                <option value="user">যাত্রী (user)</option>
                                <option value="counter_admin">কাউন্টার অপারেটর (counter_admin)</option>
                                <option value="counter_representative">কাউন্টার প্রতিনিধি (counter_representative)</option>
                              </select>
                            </td>
                            <td className="py-3 px-5">
                              {isCounterRole ? (
                                <select
                                  aria-label={`${u.email} এর কাউন্টার`}
                                  value={u.counter_id || ''}
                                  onChange={(e) => handleRoleUpdate(u.id, u.role, e.target.value)}
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
                              <button
                                type="button"
                                onClick={async () => {
                                  setError('');
                                  try {
                                    await deleteAdminUser(u.id);
                                    await loadAdminData();
                                  } catch (err) {
                                    setError(extractErrorMessage(err, 'অ্যাকাউন্ট মুছে ফেলা যায়নি'));
                                  }
                                }}
                                aria-label={`${u.email} মুছুন`}
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
        </main>
      </div>

      {/* Admin Recovery: Reset Counter / Representative Password Modal */}
      {resetModal && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
        >
          <form
            onSubmit={handleResetPasswordSubmit}
            className="bg-white rounded-2xl border border-slate-200 w-full max-w-md p-6 space-y-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="font-display text-lg font-bold text-slate-900">
                  {resetModal.targetRole === 'counter_admin'
                    ? 'Reset Counter Password'
                    : 'Reset Representative Password'}
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  কাউন্টার: <strong className="text-slate-800">{resetModal.counterName}</strong> · ইউজারনেম:{' '}
                  <strong className="font-mono text-blue-700">{resetModal.targetUsername}</strong>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setResetModal(null)}
                aria-label="বন্ধ করুন"
                className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div>
              <label htmlFor="reset-new-password" className="block text-xs font-medium text-slate-700 mb-1.5">
                নতুন পাসওয়ার্ড (কমপক্ষে ৬ অক্ষর)
              </label>
              <input
                id="reset-new-password"
                type="password"
                required
                minLength={6}
                autoFocus
                value={resetNewPassword}
                onChange={(e) => setResetNewPassword(e.target.value)}
                placeholder="কমপক্ষে ৬ অক্ষরের নতুন পাসওয়ার্ড দিন"
                className="w-full min-h-[44px] px-3.5 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-700"
              />
              <p className="text-[11px] text-amber-700 mt-1.5">
                পাসওয়ার্ড রিসেট করার সাথে সাথে এই অ্যাকাউন্টের পূর্বে লগইন করা সকল সেশন বাতিল হয়ে যাবে এবং অডিট লগে সংরক্ষিত হবে।
              </p>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setResetModal(null)}
                className="min-h-[42px] px-4 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg"
              >
                বাতিল
              </button>
              <button
                type="submit"
                disabled={resettingPassword}
                className="min-h-[42px] px-5 py-2 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 disabled:opacity-60 rounded-lg"
              >
                {resettingPassword ? 'রিসেট হচ্ছে...' : 'পাসওয়ার্ড রিসেট নিশ্চিত করুন'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
