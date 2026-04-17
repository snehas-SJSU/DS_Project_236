import { useState } from 'react';
import { readJson, SETTINGS_KEY, writeJson } from '../lib/localData';

type Settings = {
  profileVisibility: boolean;
  openToWork: boolean;
  allowMessages: boolean;
  inAppNotificationsEnabled: boolean;
};

const defaults: Settings = {
  profileVisibility: true,
  openToWork: true,
  allowMessages: true,
  inAppNotificationsEnabled: true
};

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings>(readJson<Settings>(SETTINGS_KEY, defaults));
  const [status, setStatus] = useState('');

  const save = () => {
    writeJson(SETTINGS_KEY, settings);
    setStatus('Settings saved.');
  };

  return (
    <div className="li-card p-5">
      <h1 className="text-xl font-semibold text-[#191919]">Settings & Privacy</h1>
      <p className="mt-1 text-sm text-[#666]">Manage key profile and messaging preferences.</p>

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
      </div>

      <button onClick={save} className="mt-4 rounded-full bg-[#0a66c2] px-5 py-2 text-sm font-semibold text-white hover:bg-[#004182]">
        Save settings
      </button>
      {status ? <p className="mt-2 text-xs text-[#057642]">{status}</p> : null}
    </div>
  );
}

