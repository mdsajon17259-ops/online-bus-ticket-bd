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
  const [tBusType, setTBusType] = useState('AC Express Coach');
  const [tPrice, setTPrice] = useState('45');
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
      setError(err instanceof Error ? err.message : 'Failed to load admin console');
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

    // If Supabase is configured with a 'branding' storage bucket, try uploading there first, else convert to resized data URL
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
        // Fall through to local data URL conversion
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
      showNotice('Organization branding updated dynamically across all panels.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save branding settings');
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
      showNotice('New bus counter added.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create counter');
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
      showNotice('Trip scheduled and seat inventory generated.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create trip');
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
      showNotice('User account created and role assigned.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create user');
    } finally {
      setCreatingUser(false);
    }
  };

  const handleRoleUpdate = async (profileId: string, role: UserRole, counterId: string | null) => {
    setError('');
    try {
      await updateUserRole(profileId, role, counterId);
      await loadAdminData();
      showNotice('User permissions updated.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update role');
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
        title="Super Admin Master Login"
        subtitle="Sign in with your Super Admin credentials to manage organization branding, counters, schedules, and role access."
      />
    );
  }

  const sidebarItems: Array<{ id: AdminSection; label: string; icon: React.ComponentType<{ className?: string }> }> = [
    { id: 'overview', label: 'System Overview', icon: LayoutDashboard },
    { id: 'counters', label: 'Counters & Trips', icon: Bus },
    { id: 'users', label: 'Users & Roles', icon: Users },
    { id: 'settings', label: 'Organization Settings', icon: Settings },
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
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
                    Master System Overview
                  </h1>
                  <p className="text-sm text-slate-600 mt-0.5">
                    Real-time booking metrics and revenue across all {overview?.totalCounters ?? counters.length} counters.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSection('settings')}
                  className="min-h-[40px] px-4 py-2 text-xs font-semibold text-slate-800 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors"
                >
                  Edit Branding
                </button>
              </div>

              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white border border-slate-200 rounded-xl p-5">
                  <p className="text-xs text-slate-500">Total Bookings</p>
                  <p className="font-mono text-2xl font-bold text-slate-900 tabular-nums mt-1">
                    {loading ? '—' : overview?.totalBookings ?? 0}
                  </p>
                  <p className="text-xs text-amber-700 mt-1 tabular-nums">
                    {overview?.pendingBookings ?? 0} pending requests
                  </p>
                </div>
                <div className="bg-white border border-slate-200 rounded-xl p-5">
                  <p className="text-xs text-slate-500">Confirmed Revenue</p>
                  <p className="font-mono text-2xl font-bold text-emerald-700 tabular-nums mt-1">
                    ${loading ? '—' : (overview?.confirmedRevenue ?? 0).toFixed(2)}
                  </p>
                  <p className="text-xs text-slate-500 mt-1 tabular-nums">
                    ${(overview?.pendingRevenue ?? 0).toFixed(2)} pending
                  </p>
                </div>
                <div className="bg-white border border-slate-200 rounded-xl p-5">
                  <p className="text-xs text-slate-500">Active Trips</p>
                  <p className="font-mono text-2xl font-bold text-slate-900 tabular-nums mt-1">
                    {loading ? '—' : overview?.activeTrips ?? 0}
                  </p>
                  <p className="text-xs text-slate-500 mt-1">Across all routes</p>
                </div>
                <div className="bg-white border border-slate-200 rounded-xl p-5">
                  <p className="text-xs text-slate-500">Bus Counters</p>
                  <p className="font-mono text-2xl font-bold text-slate-900 tabular-nums mt-1">
                    {loading ? '—' : overview?.totalCounters ?? 0}
                  </p>
                  <p className="text-xs text-slate-500 mt-1">Operating terminals</p>
                </div>
              </div>

              {/* Per-Counter Breakdown Table */}
              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-200">
                  <h2 className="font-display text-base font-bold text-slate-900">
                    Performance by Bus Counter
                  </h2>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-500">
                        <th className="py-3 px-5">Counter Name</th>
                        <th className="py-3 px-5 text-right">Scheduled Trips</th>
                        <th className="py-3 px-5 text-right">Total Bookings</th>
                        <th className="py-3 px-5 text-right">Confirmed Revenue</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-sm">
                      {(overview?.counterStats || []).map((row) => (
                        <tr key={row.counter_id} className="hover:bg-slate-50/70">
                          <td className="py-3 px-5 font-medium text-slate-900">{row.counter_name}</td>
                          <td className="py-3 px-5 font-mono text-right tabular-nums text-slate-700">
                            {row.trips_count}
                          </td>
                          <td className="py-3 px-5 font-mono text-right tabular-nums text-slate-700">
                            {row.bookings_count}
                          </td>
                          <td className="py-3 px-5 font-mono font-semibold text-right tabular-nums text-slate-900">
                            ${Number(row.revenue).toFixed(2)}
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
                  Organization Settings
                </h1>
                <p className="text-sm text-slate-600 mt-0.5">
                  Update the organization name and logo stored in the <code className="font-mono text-xs bg-slate-100 px-1.5 py-0.5 rounded">app_settings</code> table. Changes reflect immediately in the Global Header across every panel.
                </p>
              </div>

              <form
                onSubmit={handleSaveSettings}
                className="bg-white border border-slate-200 rounded-xl p-6 space-y-6 max-w-2xl"
              >
                {/* Live Preview */}
                <div className="pb-5 border-b border-slate-200">
                  <p className="text-xs font-medium text-slate-500 mb-2.5">Live Header Branding Preview</p>
                  <div className="flex items-center gap-3 p-3.5 rounded-lg bg-slate-50 border border-slate-200">
                    {orgLogoUrl ? (
                      <img
                        src={orgLogoUrl}
                        alt="Organization logo preview"
                        referrerPolicy="no-referrer"
                        className="w-10 h-10 rounded-lg object-cover border border-slate-200 bg-white"
                      />
                    ) : (
                      <span className="w-10 h-10 rounded-lg bg-blue-700 text-white flex items-center justify-center">
                        <Bus className="w-5 h-5" />
                      </span>
                    )}
                    <span className="font-display text-lg font-bold text-slate-900">
                      {orgName || 'Organization Name'}
                    </span>
                  </div>
                </div>

                {/* Organization Name Input */}
                <div>
                  <label htmlFor="org-name" className="block text-xs font-medium text-slate-700 mb-1.5">
                    Organization Name
                  </label>
                  <input
                    id="org-name"
                    type="text"
                    required
                    value={orgName}
                    onChange={(e) => setOrgName(e.target.value)}
                    placeholder="Aurora Transit Network"
                    className="w-full min-h-[44px] px-3.5 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-700"
                  />
                </div>

                {/* Organization Logo Upload + URL */}
                <div className="space-y-3">
                  <label htmlFor="org-logo-url" className="block text-xs font-medium text-slate-700">
                    Organization Logo
                  </label>
                  <div className="flex flex-col sm:flex-row gap-3">
                    <input
                      id="org-logo-url"
                      type="text"
                      value={orgLogoUrl}
                      onChange={(e) => setOrgLogoUrl(e.target.value)}
                      placeholder="https://... or upload an image file"
                      className="flex-1 min-h-[44px] px-3.5 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-700"
                    />
                    <label className="min-h-[44px] px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold rounded-lg inline-flex items-center justify-center gap-2 cursor-pointer transition-colors whitespace-nowrap shrink-0">
                      <Upload className="w-4 h-4" aria-hidden="true" />
                      <span>Upload Logo File</span>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleLogoFileUpload}
                        className="sr-only"
                      />
                    </label>
                  </div>
                  <p className="text-xs text-slate-500">
                    Upload a PNG, JPG, or SVG emblem, or enter an image URL.
                  </p>
                </div>

                <div className="pt-2 flex items-center justify-end gap-3">
                  <button
                    type="submit"
                    disabled={savingSettings}
                    className="min-h-[44px] px-6 py-2.5 bg-blue-700 hover:bg-blue-800 disabled:opacity-60 text-white text-sm font-semibold rounded-lg transition-colors"
                  >
                    {savingSettings ? 'Saving Changes...' : 'Save Changes'}
                  </button>
                </div>
              </form>

              {/* Database Backend Reference */}
              <div className="bg-white border border-slate-200 rounded-xl p-6 max-w-2xl space-y-2">
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                  <Database className="w-4 h-4 text-blue-700" aria-hidden="true" />
                  <span>
                    Active Backend:{' '}
                    {isSupabaseConfigured
                      ? 'Supabase PostgreSQL (Connected)'
                      : 'Built-in SQLite API Server (Supabase-Ready)'}
                  </span>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">
                  {isSupabaseConfigured
                    ? 'Connected directly to your Supabase project via VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.'
                    : 'Running with persistent local SQLite storage mirroring the exact 6-table Supabase schema. To connect your cloud Supabase project, run supabase/schema.sql in your Supabase SQL Editor and set VITE_SUPABASE_URL & VITE_SUPABASE_ANON_KEY in your environment.'}
                </p>
              </div>
            </div>
          )}

          {/* 3. COUNTERS & TRIPS MANAGEMENT */}
          {section === 'counters' && (
            <div className="space-y-8">
              <div>
                <h1 className="font-display text-2xl font-bold text-slate-900">
                  Counters, Routes & Schedules
                </h1>
                <p className="text-sm text-slate-600 mt-0.5">
                  Register new bus operator counters and publish intercity trips with automated seat generation.
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
                    <span>Add New Bus Counter</span>
                  </h2>
                  <div className="space-y-3">
                    <input
                      type="text"
                      required
                      value={cName}
                      onChange={(e) => setCName(e.target.value)}
                      placeholder="Counter Name (e.g. Bay Area Coach Hub)"
                      className="w-full min-h-[42px] px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-700"
                    />
                    <input
                      type="text"
                      required
                      value={cPhone}
                      onChange={(e) => setCPhone(e.target.value)}
                      placeholder="Contact Phone (+1 415-555-0100)"
                      className="w-full min-h-[42px] px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-700"
                    />
                    <input
                      type="text"
                      required
                      value={cAddress}
                      onChange={(e) => setCAddress(e.target.value)}
                      placeholder="Terminal Address"
                      className="w-full min-h-[42px] px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-700"
                    />
                    <input
                      type="text"
                      value={cLogoUrl}
                      onChange={(e) => setCLogoUrl(e.target.value)}
                      placeholder="Logo URL (optional)"
                      className="w-full min-h-[42px] px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-700"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={creatingCounter}
                    className="min-h-[44px] px-4 py-2 bg-blue-700 hover:bg-blue-800 disabled:opacity-60 text-white text-xs font-semibold rounded-lg inline-flex items-center gap-1.5 transition-colors"
                  >
                    <Plus className="w-4 h-4" aria-hidden="true" />
                    <span>{creatingCounter ? 'Adding...' : 'Add Counter'}</span>
                  </button>
                </form>

                {/* Add Trip Form */}
                <form
                  onSubmit={handleCreateTrip}
                  className="bg-white border border-slate-200 rounded-xl p-5 space-y-4"
                >
                  <h2 className="font-display text-base font-bold text-slate-900 flex items-center gap-2">
                    <Bus className="w-4 h-4 text-blue-700" aria-hidden="true" />
                    <span>Schedule New Trip</span>
                  </h2>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <select
                      required
                      aria-label="Select Counter"
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
                      value={tFrom}
                      onChange={(e) => setTFrom(e.target.value)}
                      placeholder="Origin City (From)"
                      className="min-h-[42px] px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-700"
                    />
                    <input
                      type="text"
                      required
                      value={tTo}
                      onChange={(e) => setTTo(e.target.value)}
                      placeholder="Destination City (To)"
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
                      placeholder="Bus Type"
                      className="min-h-[42px] px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-700"
                    />
                    <div>
                      <label htmlFor="t-price" className="block text-[11px] text-slate-500 mb-1">
                        Ticket Price ($)
                      </label>
                      <input
                        id="t-price"
                        type="number"
                        min="1"
                        step="0.5"
                        required
                        value={tPrice}
                        onChange={(e) => setTPrice(e.target.value)}
                        className="w-full min-h-[42px] px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-700 tabular-nums"
                      />
                    </div>
                    <div>
                      <label htmlFor="t-seats" className="block text-[11px] text-slate-500 mb-1">
                        Total Seats (8–60)
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
                    <span>{creatingTrip ? 'Publishing...' : 'Publish Trip'}</span>
                  </button>
                </form>
              </div>

              {/* Registered Counters Table */}
              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-200">
                  <h2 className="font-display text-base font-bold text-slate-900">
                    Active Bus Counters ({counters.length})
                  </h2>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-500">
                        <th className="py-3 px-5">Counter</th>
                        <th className="py-3 px-5">Phone</th>
                        <th className="py-3 px-5">Address</th>
                        <th className="py-3 px-5 text-right">Remove</th>
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
                              aria-label={`Delete ${c.counter_name}`}
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
                    Scheduled Trips ({trips.length})
                  </h2>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-500">
                        <th className="py-3 px-5">Route</th>
                        <th className="py-3 px-5">Counter</th>
                        <th className="py-3 px-5">Departure</th>
                        <th className="py-3 px-5 text-right">Seats</th>
                        <th className="py-3 px-5 text-right">Price</th>
                        <th className="py-3 px-5 text-right">Remove</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-sm">
                      {trips.map((t) => {
                        const dep = new Date(t.departure_time);
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
                              {dep.toLocaleDateString([], { month: 'short', day: 'numeric' })}{' '}
                              {dep.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </td>
                            <td className="py-3 px-5 font-mono text-xs text-right tabular-nums text-slate-700">
                              {t.available_seats ?? t.total_seats}/{t.total_seats}
                            </td>
                            <td className="py-3 px-5 font-mono font-semibold text-right tabular-nums text-slate-900">
                              ${Number(t.price).toFixed(2)}
                            </td>
                            <td className="py-3 px-5 text-right">
                              <button
                                type="button"
                                onClick={async () => {
                                  await deleteTrip(t.id);
                                  await loadAdminData();
                                }}
                                aria-label={`Delete trip ${t.route_from} to ${t.route_to}`}
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
                  User Management & Roles
                </h1>
                <p className="text-sm text-slate-600 mt-0.5">
                  Create accounts and assign users to Super Admin, Counter Operator (linked to a specific counter), or Passenger roles.
                </p>
              </div>

              {/* Create User Form */}
              <form
                onSubmit={handleCreateUser}
                className="bg-white border border-slate-200 rounded-xl p-5 space-y-4"
              >
                <h2 className="font-display text-base font-bold text-slate-900">
                  Create Staff or Passenger Account
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  <input
                    type="text"
                    required
                    value={uName}
                    onChange={(e) => setUName(e.target.value)}
                    placeholder="Full Name"
                    className="min-h-[42px] px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-700"
                  />
                  <input
                    type="email"
                    required
                    value={uEmail}
                    onChange={(e) => setUEmail(e.target.value)}
                    placeholder="Email Address"
                    className="min-h-[42px] px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-700"
                  />
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={uPassword}
                    onChange={(e) => setUPassword(e.target.value)}
                    placeholder="Initial Password (min 6 chars)"
                    className="min-h-[42px] px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-700"
                  />
                  <select
                    aria-label="Assign Role"
                    value={uRole}
                    onChange={(e) => setURole(e.target.value as UserRole)}
                    className="min-h-[42px] px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-700"
                  >
                    <option value="counter_admin">Counter Operator</option>
                    <option value="super_admin">Super Admin</option>
                    <option value="user">Passenger (User)</option>
                  </select>

                  {uRole === 'counter_admin' && (
                    <select
                      aria-label="Assign Counter"
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
                    <span>{creatingUser ? 'Creating...' : 'Create Account'}</span>
                  </button>
                </div>
              </form>

              {/* Users List */}
              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-500">
                        <th className="py-3 px-5">Account</th>
                        <th className="py-3 px-5">Role Assignment</th>
                        <th className="py-3 px-5">Assigned Counter</th>
                        <th className="py-3 px-5 text-right">Remove</th>
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
                              aria-label={`Role for ${u.email}`}
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
                              <option value="user">Passenger (user)</option>
                              <option value="counter_admin">Counter Operator (counter_admin)</option>
                              <option value="super_admin">Super Admin (super_admin)</option>
                            </select>
                          </td>
                          <td className="py-3 px-5">
                            {u.role === 'counter_admin' ? (
                              <select
                                aria-label={`Counter for ${u.email}`}
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
                              <span className="text-xs text-slate-400">Not applicable</span>
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
                                aria-label={`Delete user ${u.email}`}
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
