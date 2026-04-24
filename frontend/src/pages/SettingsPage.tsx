import { useEffect, useState } from 'react';
import { MEMBER_ID } from '../lib/memberProfile';

type Settings = {
  profileVisibility: boolean;
  openToWork: boolean;
  allowMessages: boolean;
  inAppNotificationsEnabled: boolean;
  preferredLanguage: string;
};

const defaults: Settings = {
  profileVisibility: true,
  openToWork: true,
  allowMessages: true,
  inAppNotificationsEnabled: true,
  preferredLanguage: 'English'
};

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings>(defaults);
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/members/settings/get', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ member_id: MEMBER_ID })
    })
      .then((res) => res.json())
      .then((data) => {
        if (data && !data.error) {
          setSettings({
            profileVisibility: Boolean(data.profileVisibility),
            openToWork: Boolean(data.openToWork),
            allowMessages: Boolean(data.allowMessages),
            inAppNotificationsEnabled: Boolean(data.inAppNotificationsEnabled),
            preferredLanguage: data.preferredLanguage || 'English'
          });
        }
      })
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, []);

  const save = async () => {
    setStatus('');
    const res = await fetch('/api/members/settings/update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ member_id: MEMBER_ID, ...settings })
    });
    setStatus(res.ok ? 'Settings saved.' : 'Unable to save settings right now.');
  };

  return (
    <div className="li-card p-5">
      <h1 className="text-xl font-semibold text-[#191919]">Settings & Privacy</h1>
      <p className="mt-1 text-sm text-[#666]">Manage key profile, messaging, and notification preferences.</p>

      {loading ? <p className="mt-4 text-sm text-[#666]">Loading your settings...</p> : null}

      <div className="mt-4 space-y-3">
        <label className="flex items-center justify-between rounded-lg border border-slate-200 p-3 text-sm">
          <span>Profile visible to recruiters</span>
          <input type="checkbox" checked={settings.profileVisibility} onChange={(e) => setSettings({ ...settings, profileVisibility: e.target.checked })} />
        </label>
        <label className="flex items-center justify-between rounded-lg border border-slate-200 p-3 text-sm">
          <span>Open to new job opportunities</span>
          <input type="checkbox" checked={settings.openToWork} onChange={(e) => setSettings({ ...settings, openToWork: e.target.checked })} />
        </label>
        <label className="flex items-center justify-between rounded-lg border border-slate-200 p-3 text-sm">
          <span>Allow messages from anyone</span>
          <input type="checkbox" checked={settings.allowMessages} onChange={(e) => setSettings({ ...settings, allowMessages: e.target.checked })} />
        </label>
        <label className="flex items-center justify-between rounded-lg border border-slate-200 p-3 text-sm">
          <span>In-app notifications enabled</span>
          <input
            type="checkbox"
            checked={settings.inAppNotificationsEnabled}
            onChange={(e) => setSettings({ ...settings, inAppNotificationsEnabled: e.target.checked })}
          />
        </label>
        <label className="flex items-center justify-between rounded-lg border border-slate-200 p-3 text-sm">
          <span>Preferred language</span>
          <select
            value={settings.preferredLanguage}
            onChange={(e) => setSettings({ ...settings, preferredLanguage: e.target.value })}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm"
          >
            <option>English</option>
            <option>Spanish</option>
            <option>Hindi</option>
          </select>
        </label>
      </div>

      <button onClick={() => save().catch(() => setStatus('Unable to save settings right now.'))} className="mt-4 rounded-full bg-[#0a66c2] px-5 py-2 text-sm font-semibold text-white hover:bg-[#004182]">
        Save settings
      </button>
      {status ? <p className={`mt-2 text-xs ${status.includes('Unable') ? 'text-[#9f2d2d]' : 'text-[#057642]'}`}>{status}</p> : null}
    </div>
  );
}
