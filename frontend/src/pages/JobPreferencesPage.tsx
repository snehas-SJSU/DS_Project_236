import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { JOB_PREFS_KEY, readJson, writeJson } from '../lib/localData';

type Prefs = {
  keyword: string;
  location: string;
  employmentType: string;
  minSalary: string;
  remoteOnly: boolean;
};

const defaults: Prefs = {
  keyword: '',
  location: 'San Jose, CA',
  employmentType: 'Full-time',
  minSalary: '',
  remoteOnly: false
};

export default function JobPreferencesPage() {
  const navigate = useNavigate();
  const [prefs, setPrefs] = useState<Prefs>(readJson<Prefs>(JOB_PREFS_KEY, defaults));
  const [status, setStatus] = useState('');

  const save = () => {
    writeJson(JOB_PREFS_KEY, prefs);
    setStatus('Preferences saved.');
  };

  return (
    <div className="li-card p-5">
      <h1 className="text-xl font-semibold text-[#191919]">Job Preferences</h1>
      <p className="mt-1 text-sm text-[#666]">Use these preferences to improve job recommendations.</p>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <input
          value={prefs.keyword}
          onChange={(e) => setPrefs({ ...prefs, keyword: e.target.value })}
          placeholder="Preferred role or keyword"
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
        <input
          value={prefs.location}
          onChange={(e) => setPrefs({ ...prefs, location: e.target.value })}
          placeholder="Preferred location"
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
        <select
          value={prefs.employmentType}
          onChange={(e) => setPrefs({ ...prefs, employmentType: e.target.value })}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
        >
          <option>Full-time</option>
          <option>Contract</option>
          <option>Internship</option>
          <option>Part-time</option>
        </select>
        <input
          value={prefs.minSalary}
          onChange={(e) => setPrefs({ ...prefs, minSalary: e.target.value })}
          placeholder="Minimum salary (optional)"
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
      </div>

      <label className="mt-3 inline-flex items-center gap-2 text-sm text-slate-700">
        <input
          type="checkbox"
          checked={prefs.remoteOnly}
          onChange={(e) => setPrefs({ ...prefs, remoteOnly: e.target.checked })}
        />
        Remote only
      </label>

      <div className="mt-4 flex flex-wrap gap-2">
        <button onClick={save} className="rounded-full bg-[#0a66c2] px-5 py-2 text-sm font-semibold text-white hover:bg-[#004182]">
          Save preferences
        </button>
        <button
          onClick={() => navigate(`/jobs/search?keywords=${encodeURIComponent(prefs.keyword || 'engineer')}`)}
          className="rounded-full border border-[#0a66c2] px-5 py-2 text-sm font-semibold text-[#0a66c2] hover:bg-[#edf3f8]"
        >
          Search matching jobs
        </button>
        <Link to="/jobs" className="rounded-full border border-slate-300 px-5 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
          Back to jobs
        </Link>
      </div>
      {status ? <p className="mt-2 text-xs text-[#057642]">{status}</p> : null}
    </div>
  );
}

