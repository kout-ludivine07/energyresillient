import { FormEvent, ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity, AlertTriangle, BatteryCharging, Bell, Check, ChevronRight,
  CircleHelp, Download, Gauge, House, LocateFixed, LogOut, MapPin, Menu,
  Plus, RefreshCw, Send, Settings, ShieldCheck, Signal, Sparkles, Sun, Zap,
} from 'lucide-react';
import {
  api, clearTokens, setTokens, token, queueReport, pendingReports, syncReports,
  type Profile, type Risk, type Report,
} from './api';

const DEFAULT_PROFILE: Profile = {
  display_name: '', grid: 'RIS/SIG', region: 'North-West', city: 'Bamenda',
  household_type: 'household', solar_capacity_wh: 0, battery_capacity_wh: 0,
  reserve_percent: 25,
};
const GRIDS = ['RIS/SIG', 'RIN/NIG', 'RIE/EIG'];
const REGIONS = ['North-West', 'South-West', 'West', 'Centre', 'Littoral', 'Adamawa', 'North', 'Far North', 'East', 'South'];
type Tab = 'Overview' | 'Outage map' | 'Report outage' | 'Energy plan' | 'Forecast & DSS' | 'My profile';
const NAV: { label: Tab; icon: typeof House }[] = [
  { label: 'Overview', icon: House }, { label: 'Outage map', icon: MapPin },
  { label: 'Report outage', icon: Plus }, { label: 'Energy plan', icon: BatteryCharging },
  { label: 'Forecast & DSS', icon: Activity }, { label: 'My profile', icon: Settings },
];
type Appliance = { name: string; watts: number; hours: number; on: boolean };

export default function App() {
  const [tab, setTab] = useState<Tab>('Overview');
  const [profile, setProfile] = useState<Profile>(DEFAULT_PROFILE);
  const [risk, setRisk] = useState<Risk | null>(null);
  const [reports, setReports] = useState<Report[]>([]);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [register, setRegister] = useState(false);
  const [logged, setLogged] = useState(Boolean(token()));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [mobileNav, setMobileNav] = useState(false);
  const [pending, setPending] = useState(0);
  const [kind, setKind] = useState<'outage' | 'restored'>('outage');
  const [note, setNote] = useState('');
  const [consent, setConsent] = useState(false);
  const [gps, setGps] = useState<{ status: string; lat: number | null; lon: number | null; accuracy: number | null }>({
    status: 'Not requested', lat: null, lon: null, accuracy: null,
  });
  const [appliances, setAppliances] = useState<Appliance[]>([
    { name: 'LED lights', watts: 40, hours: 5, on: true },
    { name: 'Router', watts: 12, hours: 24, on: true },
    { name: 'Refrigerator', watts: 150, hours: 8, on: false },
    { name: 'Laptop', watts: 65, hours: 4, on: false },
    { name: 'Television', watts: 80, hours: 3, on: false },
    { name: 'Water pump', watts: 500, hours: 1, on: false },
  ]);

  const load = useCallback(async () => {
    setError('');
    try {
      const data = await api<any>('/dashboard/');
      if (data.profile) setProfile({ ...DEFAULT_PROFILE, ...data.profile });
      setRisk(data.risk ?? null);
      setReports(data.recent_reports ?? data.reports ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load dashboard data.');
    }
  }, []);

  useEffect(() => {
    if (!logged) return;
    void load();
    void pendingReports().then((items) => setPending(items.length));
    const handleOnline = async () => {
      await syncReports();
      setPending((await pendingReports()).length);
      await load();
    };
    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [logged, load]);

  const energyWh = useMemo(
    () => appliances.filter((item) => item.on).reduce((sum, item) => sum + item.watts * item.hours, 0),
    [appliances],
  );

  const authenticate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true); setError(''); setNotice('');
    try {
      const username = email.trim().toLowerCase();
      if (register) {
        await api('/auth/register/', {
          method: 'POST', body: JSON.stringify({ username, email: email.trim(), password }),
        });
      }
      const result = await api<{ access: string; refresh: string }>('/auth/token/', {
        method: 'POST', body: JSON.stringify({ username, password }),
      });
      setTokens(result.access, result.refresh);
      setLogged(true);
      setNotice('Signed in successfully.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed.');
    } finally { setBusy(false); }
  };

  const saveProfile = async () => {
    setBusy(true); setError(''); setNotice('');
    try {
      const saved = await api<Profile>('/profile/', { method: 'PATCH', body: JSON.stringify(profile) });
      setProfile({ ...DEFAULT_PROFILE, ...saved });
      setNotice('Your energy profile was saved.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save your profile.');
    } finally { setBusy(false); }
  };

  const requestGPS = () => {
    setError('');
    if (!('geolocation' in navigator)) {
      setGps({ status: 'Geolocation is not supported by this browser.', lat: null, lon: null, accuracy: null });
      return;
    }
    setGps({ status: 'Requesting permission…', lat: null, lon: null, accuracy: null });
    navigator.geolocation.getCurrentPosition(
      (position) => setGps({ status: 'GPS fix received. Review consent before submitting.', lat: position.coords.latitude, lon: position.coords.longitude, accuracy: position.coords.accuracy }),
      (err) => setGps({ status: err.code === 1 ? 'Permission denied.' : err.code === 2 ? 'Position unavailable.' : 'Timed out. Try again outdoors.', lat: null, lon: null, accuracy: null }),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  };

  const submitReport = async () => {
    setBusy(true); setError(''); setNotice('');
    const hasGPS = consent && gps.lat !== null && gps.lon !== null;
    const report: Report = {
      kind, grid: profile.grid, region: profile.region, city: profile.city,
      latitude: hasGPS ? gps.lat : null, longitude: hasGPS ? gps.lon : null,
      accuracy_m: hasGPS ? gps.accuracy : null, location_consent: Boolean(hasGPS),
      note: note.trim(), client_report_id: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    };
    try {
      if (!navigator.onLine) {
        await queueReport(report);
        setNotice('You are offline. The report is saved on this device and will retry when you reconnect.');
      } else {
        try {
          await api('/reports/', { method: 'POST', body: JSON.stringify(report) });
          setNotice('Report submitted. Thank you for contributing community evidence.');
        } catch {
          await queueReport(report);
          setNotice('The server could not be reached. Your report is queued locally for retry.');
        }
      }
      setNote(''); setConsent(false);
      setGps({ status: 'Not requested', lat: null, lon: null, accuracy: null });
      setPending((await pendingReports()).length);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save this report.');
    } finally { setBusy(false); }
  };

  const signOut = () => { clearTokens(); setLogged(false); setRisk(null); setReports([]); setNotice('Signed out.'); };
  const installHelp = () => setNotice('To install, open your browser menu and choose “Install app” or “Add to Home screen”.');
  const changeTab = (next: Tab) => { setTab(next); setMobileNav(false); setError(''); };

  if (!logged) {
    return (
      <div className="auth-screen">
        <div className="auth-art">
          <Brand />
          <div className="auth-message">
            <div className="eyebrow">COMMUNITY ENERGY INTELLIGENCE</div>
            <h1>Power is uncertain.<br /><em>Your plan doesn’t have to be.</em></h1>
            <p>Understand what your community is experiencing and make practical decisions with the energy you have.</p>
            <div className="auth-pills"><span><ShieldCheck size={15} /> Community evidence</span><span><Activity size={15} /> Transparent DSS</span><span><BatteryCharging size={15} /> Personal energy plan</span></div>
            <div className="auth-visual"><div className="orbit orbit-one" /><div className="orbit orbit-two" /><div className="energy-core"><Zap size={34} /></div></div>
          </div>
        </div>
        <div className="auth-form-wrap">
          <form className="auth-form" onSubmit={authenticate}>
            <div className="mobile-brand"><Brand /></div>
            <div className="eyebrow">YOUR ENERGY, WITH A PLAN</div>
            <h2>{register ? 'Create your account' : 'Welcome back'}</h2>
            <p className="muted">{register ? 'Set up your personal energy space.' : 'Sign in to see your area and energy plan.'}</p>
            <label>Email address<input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" /></label>
            <label>Password<input type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 characters" /></label>
            {error && <div className="error">{error}</div>}
            <button className="btn primary full" disabled={busy}>{busy ? 'Please wait…' : register ? 'Create account' : 'Sign in'} <ChevronRight size={17} /></button>
            <div className="auth-switch">{register ? 'Already have an account?' : 'New to EnergyResilient?'} <button type="button" onClick={() => { setRegister(!register); setError(''); }}>{register ? 'Sign in' : 'Create account'}</button></div>
            <div className="privacy-note"><ShieldCheck size={14} /> Location is never requested without your action and permission.</div>
          </form>
          <div className="auth-footer">Built for resilient communities · Cameroon</div>
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileNav ? 'open' : ''}`}>
        <Brand />
        <div className="workspace-label">YOUR WORKSPACE</div>
        <nav>{NAV.map(({ label, icon: Icon }) => <button key={label} className={`nav-item ${tab === label ? 'active' : ''}`} onClick={() => changeTab(label)}><Icon size={18} /><span>{label}</span>{label === 'Report outage' && <span className="nav-plus">+</span>}</button>)}</nav>
        <div className="sidebar-bottom">
          <div className="community-card"><div className="community-icon"><Signal size={17} /></div><div><b>Community-powered</b><small>Every verified report helps.</small></div></div>
          <button className="install-btn" onClick={installHelp}><Download size={16} /> Install app <ChevronRight size={15} /></button>
          <div className="user-mini"><div className="avatar">{(profile.display_name || email || 'U').slice(0, 1).toUpperCase()}</div><div className="user-info"><b>{profile.display_name || email}</b><small>{profile.region} · {profile.grid}</small></div><button title="Sign out" className="icon-btn" onClick={signOut}><LogOut size={16} /></button></div>
        </div>
      </aside>
      <main className="main">
        <header className="topbar"><button className="icon-btn mobile-menu" onClick={() => setMobileNav(!mobileNav)}><Menu /></button><div className="breadcrumb">Workspace <ChevronRight size={14} /><b>{tab}</b></div><div className="top-actions"><span className="connection"><span className={`mini-dot ${navigator.onLine ? 'green' : 'amber'}`} />{navigator.onLine ? 'Online' : 'Offline'}{pending > 0 && <span className="pending-tag">{pending} queued</span>}</span><button className="icon-btn" title="Refresh data" onClick={() => void load()}><RefreshCw size={17} /></button><div className="avatar small">{(profile.display_name || email || 'U').slice(0, 1).toUpperCase()}</div></div></header>
        <div className="content">
          {error && <div className="error-banner"><AlertTriangle size={17} /><span>{error}</span><button onClick={() => setError('')}>Dismiss</button></div>}
          {notice && <div className="notice-banner"><Check size={17} /><span>{notice}</span><button onClick={() => setNotice('')}>Dismiss</button></div>}

          {tab === 'Overview' && <>
            <PageTitle eyebrow="YOUR ENERGY BRIEF" title={<>Your power, <em>in perspective.</em></>} subtitle="Community evidence and practical guidance for your area." action={<button className="btn secondary" onClick={() => void load()}><RefreshCw size={15} /> Refresh overview</button>} />
            <div className="area-banner"><div className="area-icon"><MapPin /></div><div className="area-copy"><small>YOUR SELECTED GRID CONTEXT</small><h3>{profile.region}, {profile.city}</h3><p>{profile.grid} · {profile.household_type === 'business' ? 'Small business' : 'Household'} profile</p></div><div className="area-status"><span className="mini-dot green" /> Profile-based area</div><button className="text-link" onClick={() => changeTab('My profile')}>Edit area <ChevronRight size={15} /></button></div>
            <div className="metric-grid"><Metric icon={<Gauge />} label="Area risk status" value={risk?.level === 'insufficient_data' ? 'Not enough data' : risk?.level || 'Loading'} note={risk?.score == null ? 'No unsupported probability shown' : `Rule score ${risk.score}/100`} tone={risk?.level === 'high' ? 'red' : 'green'} /><Metric icon={<Signal />} label="Community reports" value={String(reports.length)} note="Reports returned by the service" tone="green" /><Metric icon={<BatteryCharging />} label="Essential-load estimate" value={`${(energyWh / 1000).toFixed(2)} kWh`} note="Based on selected appliances" tone="mint" /><Metric icon={<ShieldCheck />} label="Model readiness" value={risk?.model?.status === 'trained' ? 'Trained' : risk?.model?.status === 'insufficient_data' ? 'Building evidence' : 'Not trained'} note={risk?.model?.sample_count != null ? `${risk.model.sample_count} eligible events` : 'No model run yet'} tone="green" /></div>
            <div className="section-grid"><section className="panel risk-panel"><PanelHeading eyebrow="DECISION SUPPORT" title="What the evidence says" /><p className="risk-explain">{risk?.explanation || 'No area evidence is available yet. Submit first-hand reports to build the local evidence base.'}</p><div className="evidence-row"><div><small>Recent distinct reporters</small><b>{risk?.recent_distinct_reporters ?? '—'}</b></div><div><small>Historical events</small><b>{risk?.historical_events ?? '—'}</b></div><div><small>Active events</small><b>{risk?.active_events ?? '—'}</b></div></div><div className="panel-footnote"><CircleHelp size={14} /> Rule score is not a probability. Sparse data stays unscored.</div></section><section className="panel actions-panel"><PanelHeading eyebrow="YOUR NEXT STEPS" title="Energy advisor" /><p className="muted small-text">Rule-based guidance using available evidence and your saved profile. No paid AI API is required.</p><ActionList items={risk?.actions?.length ? risk.actions : ['Save your profile to personalise guidance.', 'Contribute a first-hand outage or restoration report.']} /><button className="text-link" onClick={() => changeTab('Energy plan')}>Refine energy plan <ChevronRight size={15} /></button></section></div>
            <section className="panel report-panel"><PanelHeading eyebrow="COMMUNITY SIGNAL" title="Recent reports" action={<button className="text-link" onClick={() => changeTab('Report outage')}>Add report <Plus size={15} /></button>} />{reports.length ? <div className="report-list">{reports.slice(0, 5).map((report, index) => <div className="report-row" key={report.id ?? index}><div className={`report-icon ${report.kind === 'restored' ? 'restored' : ''}`}>{report.kind === 'restored' ? <Check size={17} /> : <Zap size={17} />}</div><div className="report-main"><b>{report.kind === 'restored' ? 'Restoration reported' : 'Outage reported'}</b><small>{report.city || report.region} · {report.grid}</small></div><span className="report-time">{report.created_at ? new Date(report.created_at).toLocaleString() : ''}</span></div>)}</div> : <Empty title="Your community’s signal starts here" text="No recent reports returned for this profile. Submit a report when you have first-hand information." action={() => changeTab('Report outage')} />}</section>
          </>}

          {tab === 'Outage map' && <><PageTitle eyebrow="COMMUNITY VIEW" title="See the signal, not the noise." subtitle="Individual reporter coordinates are never displayed." /><div className="panel map-placeholder"><div className="map-grid-bg"><div className="map-pin pin-a"><Zap /></div><div className="map-pin pin-b"><Zap /></div><div className="map-pin pin-c"><MapPin /></div><div className="map-label label-a">Community zone</div><div className="map-label label-b">Selected area</div><div className="map-road road-a" /><div className="map-road road-b" /></div><div className="map-legend"><span><i className="legend-dot red" /> Corroborated outage zone</span><span><i className="legend-dot green" /> Restored / clear</span></div><div className="map-note"><ShieldCheck size={16} /> Illustrative view only; this is not a live map. Verified aggregate zones require API data.</div></div><section className="panel"><h2>Improve the community signal</h2><p className="muted">Submit first-hand information. Individual reporter locations are not shown on this screen.</p><button className="btn primary" onClick={() => changeTab('Report outage')}>Submit a report <ChevronRight size={16} /></button></section></>}

          {tab === 'Report outage' && <><PageTitle eyebrow="COMMUNITY REPORTING" title="Your signal matters." subtitle="Report only what you observed. Offline reports are queued locally for retry." /><div className="form-layout"><section className="panel form-panel"><div className="field-label">What happened?</div><div className="segmented"><button className={kind === 'outage' ? 'selected' : ''} onClick={() => setKind('outage')}><Zap size={16} /> Power outage</button><button className={kind === 'restored' ? 'selected' : ''} onClick={() => setKind('restored')}><Check size={16} /> Power restored</button></div><div className="form-grid"><label>Grid<select value={profile.grid} onChange={(e) => setProfile({ ...profile, grid: e.target.value })}>{GRIDS.map((grid) => <option key={grid} value={grid}>{grid}</option>)}</select></label><label>Region<select value={profile.region} onChange={(e) => setProfile({ ...profile, region: e.target.value })}>{REGIONS.map((region) => <option key={region} value={region}>{region}</option>)}</select></label><label>City / locality<input value={profile.city} onChange={(e) => setProfile({ ...profile, city: e.target.value })} placeholder="e.g. Bamenda" /></label><label>Optional note<input value={note} maxLength={240} onChange={(e) => setNote(e.target.value)} placeholder="What did you observe?" /></label></div><div className="gps-card"><div className="gps-head"><div className="gps-icon"><LocateFixed size={18} /></div><div><b>Optional GPS verification</b><small>Only requested when you tap the button. Browser permission is required.</small></div></div><button className="btn secondary" onClick={requestGPS}><LocateFixed size={15} /> Use my current location</button><div className={`gps-status ${gps.lat !== null ? 'success' : ''}`}>{gps.status}</div>{gps.lat !== null && <div className="coords">Lat {gps.lat.toFixed(5)} · Lon {gps.lon?.toFixed(5)} · accuracy ±{Math.round(gps.accuracy ?? 0)} m</div>}<label className="consent-row"><input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} /> I consent to attaching this one-time GPS fix to this report.</label><p className="microcopy">No background tracking. If permission fails, submit without GPS. Grid and region remain your selected report context.</p></div><button className="btn primary" disabled={busy || !profile.region || !profile.grid} onClick={() => void submitReport()}>{busy ? 'Submitting…' : 'Submit community report'} <Send size={16} /></button></section><aside className="panel privacy-panel"><div className="privacy-symbol"><ShieldCheck size={22} /></div><h3>Privacy by design</h3><p>Location is optional and requested only on demand. Coordinates are attached only when you consent and a GPS fix exists.</p><PrivacyRule text="No background GPS tracking" /><PrivacyRule text="No public reporter pins" /><PrivacyRule text="Duplicate-safe report IDs" /><PrivacyRule text="Offline reports stay on this device until synced" /></aside></div></>}

          {tab === 'Energy plan' && <><PageTitle eyebrow="PERSONAL ENERGY PROFILE" title="Make every watt count." subtitle="Tune the estimate to your appliances and backup capacity. These are estimates, not meter readings." /><div className="section-grid"><section className="panel"><PanelHeading eyebrow="YOUR APPLIANCES" title="Essential-load planner" />{appliances.map((item, index) => <div className="appliance-row" key={item.name}><label className="appliance-check"><input type="checkbox" checked={item.on} onChange={(e) => setAppliances((old) => old.map((a, i) => i === index ? { ...a, on: e.target.checked } : a))} /><span><b>{item.name}</b><small>{item.watts} W · {item.hours} h/day</small></span></label><label className="compact-label">Hours/day<input type="number" min="0" max="24" value={item.hours} onChange={(e) => setAppliances((old) => old.map((a, i) => i === index ? { ...a, hours: Math.max(0, Math.min(24, Number(e.target.value) || 0)) } : a))} /></label></div>)}<p className="microcopy">Preset wattages are editable planning estimates. Use appliance nameplate ratings or measured values when available.</p></section><section className="panel plan-summary"><div className="eyebrow">DAILY ENERGY ESTIMATE</div><div className="energy-number">{(energyWh / 1000).toFixed(2)} <span>kWh/day</span></div><div className="energy-bar"><span style={{ width: `${Math.min(100, energyWh / 3000 * 100)}%` }} /></div><div className="summary-line"><span>Selected appliance energy</span><b>{energyWh.toLocaleString()} Wh/day</b></div><div className="summary-line"><span>Saved battery capacity</span><b>{profile.battery_capacity_wh.toLocaleString()} Wh</b></div><div className="summary-line"><span>Saved solar estimate</span><b>{profile.solar_capacity_wh.toLocaleString()} Wh/day</b></div><p className="microcopy"><Sun size={14} /> Solar availability varies by weather, installation and season; this value is your estimate.</p><button className="btn primary full" onClick={() => changeTab('My profile')}>Update backup estimates <ChevronRight size={16} /></button></section></div></>}

          {tab === 'Forecast & DSS' && <><PageTitle eyebrow="DECISION SUPPORT SYSTEM" title="Evidence before estimates." subtitle="Historical clustering and rule-based guidance are not the same as a probability forecast." /><div className="metric-grid"><Metric icon={<Activity />} label="Historical events" value={String(risk?.historical_events ?? '—')} note="Events available to the service" tone="green" /><Metric icon={<Gauge />} label="Risk output" value={risk?.level === 'insufficient_data' ? 'Insufficient data' : risk?.level || '—'} note="No fabricated probability" tone="mint" /><Metric icon={<Sparkles />} label="K-means status" value={risk?.model?.status || 'Not trained'} note={risk?.model?.version || 'No model run available'} tone="green" /></div><section className="panel"><PanelHeading eyebrow="WHY THIS RESULT?" title="Evidence and limitations" /><p className="risk-explain">{risk?.explanation || 'There is not enough server evidence to describe area risk yet.'}</p><div className="evidence-grid"><div><small>Distinct reporters</small><b>{risk?.recent_distinct_reporters ?? '—'}</b></div><div><small>Eligible historical events</small><b>{risk?.historical_events ?? '—'}</b></div><div><small>Cluster sample count</small><b>{risk?.model?.sample_count ?? 0}</b></div><div><small>Silhouette score</small><b>{risk?.model?.silhouette_score == null ? 'Not available' : risk.model.silhouette_score.toFixed(3)}</b></div></div><div className="callout"><ShieldCheck size={18} /><span>Training is a staff-only backend action. Model metadata and cluster patterns do not guarantee a future outage or establish a probability.</span></div><p className="microcopy">Sparse or incomplete data should remain unscored. Continue collecting reliable reports before drawing strong conclusions.</p></section><section className="panel"><PanelHeading eyebrow="PERSONALISED GUIDANCE" title="Recommendations from your profile" /><ActionList items={risk?.actions?.length ? risk.actions : ['Add your appliance plan and backup estimates.', 'Submit first-hand community reports to improve evidence.']} /></section></>}

          {tab === 'My profile' && <><PageTitle eyebrow="PREFERENCES & PERSONALISATION" title="Your context, your controls." subtitle="Grid context is selected by you and is never inferred from GPS." /><section className="panel profile-panel"><div className="profile-section-head"><div className="profile-avatar"><Settings size={24} /></div><div><h2>Area and energy profile</h2><p className="muted">This profile personalises the dashboard and DSS actions.</p></div></div><div className="form-grid"><label>Display name<input value={profile.display_name} onChange={(e) => setProfile({ ...profile, display_name: e.target.value })} placeholder="What should we call you?" /></label><label>Profile type<select value={profile.household_type} onChange={(e) => setProfile({ ...profile, household_type: e.target.value })}><option value="household">Household</option><option value="business">Small business</option></select></label><label>Grid context<select value={profile.grid} onChange={(e) => setProfile({ ...profile, grid: e.target.value })}>{GRIDS.map((grid) => <option key={grid} value={grid}>{grid}</option>)}</select></label><label>Region<select value={profile.region} onChange={(e) => setProfile({ ...profile, region: e.target.value })}>{REGIONS.map((region) => <option key={region} value={region}>{region}</option>)}</select></label><label>City / locality<input value={profile.city} onChange={(e) => setProfile({ ...profile, city: e.target.value })} placeholder="Bamenda" /></label><label>Battery capacity (Wh)<input type="number" min="0" value={profile.battery_capacity_wh} onChange={(e) => setProfile({ ...profile, battery_capacity_wh: Math.max(0, Number(e.target.value) || 0) })} /></label><label>Solar estimate (Wh/day)<input type="number" min="0" value={profile.solar_capacity_wh} onChange={(e) => setProfile({ ...profile, solar_capacity_wh: Math.max(0, Number(e.target.value) || 0) })} /></label><label>Battery reserve (%)<input type="number" min="0" max="100" value={profile.reserve_percent} onChange={(e) => setProfile({ ...profile, reserve_percent: Math.max(0, Math.min(100, Number(e.target.value) || 0)) })} /></label></div><div className="profile-note"><MapPin size={16} /><span><b>Location separation:</b> profile stores your chosen region and grid. GPS is requested only when you tap the location button during reporting.</span></div><button className="btn primary" disabled={busy} onClick={() => void saveProfile()}>{busy ? 'Saving…' : 'Save preferences'} <Check size={16} /></button></section><section className="panel"><PanelHeading eyebrow="DEVICE PERSONALISATION" title="Make it yours" /><div className="settings-row"><div><b>Install as a PWA</b><small>Standalone app shell and home-screen shortcut.</small></div><button className="btn secondary" onClick={installHelp}><Download size={15} /> Install help</button></div><div className="settings-row"><div><b>Outage reminders</b><small>Browser notifications are optional and require your permission.</small></div><button className="btn secondary" onClick={async () => { if (!('Notification' in window)) { setNotice('Notifications are not supported by this browser.'); return; } const permission = await Notification.requestPermission(); setNotice(permission === 'granted' ? 'Notifications enabled for this browser.' : `Notification permission: ${permission}.`); }}><Bell size={15} /> Enable notifications</button></div><div className="settings-row"><div><b>Refresh area evidence</b><small>Fetch the latest available profile and risk evidence.</small></div><button className="btn secondary" onClick={() => void load()}><RefreshCw size={15} /> Refresh now</button></div></section></>}

          <footer className="app-footer"><span>ENERGYRESILIENT <span className="footer-sep">/</span> BUILT FOR CAMEROON</span><span>Evidence-led · Privacy-aware · Community-powered</span></footer>
        </div>
      </main>
    </div>
  );
}

function Brand() {
  return <div className="brand"><div className="brand-mark"><Zap /></div><span>energy<span className="brand-accent">resilient</span></span></div>;
}
function PageTitle({ eyebrow, title, subtitle, action }: { eyebrow: string; title: React.ReactNode; subtitle: string; action?: React.ReactNode }) {
  return <div className="page-heading"><div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1><p>{subtitle}</p></div>{action}</div>;
}
function PanelHeading({ eyebrow, title, action }: { eyebrow?: string; title: string; action?: React.ReactNode }) {
  return <div className="panel-head"><div>{eyebrow && <div className="eyebrow">{eyebrow}</div>}<h2>{title}</h2></div>{action}</div>;
}
function Metric({ icon, label, value, note, tone }: { icon: ReactNode; label: string; value: string; note: string; tone: string }) {
  return <div className="metric-card"><div className={`metric-icon ${tone}`}>{icon}</div><div className="metric-label">{label}</div><div className="metric-value">{value}</div><div className="metric-note">{note}</div></div>;
}
function Empty({ title, text, action }: { title: string; text: string; action: () => void }) {
  return <div className="empty-state"><div className="empty-icon"><Activity /></div><b>{title}</b><p>{text}</p><button className="text-link" onClick={action}>Create first report <ChevronRight size={15} /></button></div>;
}
function ActionList({ items }: { items: string[] }) {
  return <ul className="action-list">{items.map((item, index) => <li key={`${index}-${item}`}><span className="action-check"><Check size={14} /></span><span>{item}</span></li>)}</ul>;
}
function PrivacyRule({ text }: { text: string }) {
  return <div className="privacy-rule"><Check size={15} /> {text}</div>;
}
