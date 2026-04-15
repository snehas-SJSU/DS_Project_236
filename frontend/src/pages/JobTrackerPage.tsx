import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { MEMBER_ID } from '../lib/memberProfile';
import { readJson, SAVED_JOBS_KEY } from '../lib/localData';

type SavedJob = {
  id: string;
  title: string;
  company: string;
  location: string;
  savedAt: string;
};

export default function JobTrackerPage() {
  const [applications, setApplications] = useState<any[]>([]);
  const savedJobs = readJson<SavedJob[]>(SAVED_JOBS_KEY, []);

  useEffect(() => {
    fetch('http://localhost:4000/api/applications/byMember', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ member_id: MEMBER_ID })
    })
      .then((res) => res.json())
      .then((data) => setApplications(Array.isArray(data) ? data : []))
      .catch(() => setApplications([]));
  }, []);

  const grouped = useMemo(() => {
    const map = new Map<string, number>();
    applications.forEach((item) => {
      const key = String(item.status || 'submitted').toLowerCase();
      map.set(key, (map.get(key) || 0) + 1);
    });
    return Array.from(map.entries());
  }, [applications]);

  return (
    <div className="space-y-3">
      <section className="li-card p-5">
        <h1 className="text-xl font-semibold text-[#191919]">Job Tracker</h1>
        <p className="mt-1 text-sm text-[#666]">Track saved jobs and application progress in one place.</p>
        <div className="mt-3 flex flex-wrap gap-2 text-sm">
          <Link to="/jobs" className="rounded-full border border-[#0a66c2] px-4 py-1.5 font-semibold text-[#0a66c2] hover:bg-[#edf3f8]">Find jobs</Link>
          <Link to="/applications" className="rounded-full border border-slate-300 px-4 py-1.5 font-semibold text-slate-700 hover:bg-slate-50">View applications</Link>
        </div>
      </section>

      <section className="li-card p-5">
        <h2 className="text-sm font-semibold text-[#191919]">Application funnel</h2>
        {grouped.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">No applications yet.</p>
        ) : (
          <div className="mt-2 flex flex-wrap gap-2">
            {grouped.map(([status, count]) => (
              <span key={status} className="rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-700">
                {status}: {count}
              </span>
            ))}
          </div>
        )}
      </section>

      <section className="li-card p-5">
        <h2 className="text-sm font-semibold text-[#191919]">Saved jobs ({savedJobs.length})</h2>
        {savedJobs.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">No saved jobs yet.</p>
        ) : (
          <div className="mt-2 space-y-2">
            {savedJobs.map((job) => (
              <div key={job.id} className="rounded-lg border border-slate-200 p-3">
                <p className="font-semibold text-slate-900">{job.title}</p>
                <p className="text-sm text-slate-600">{job.company} • {job.location}</p>
                <p className="text-xs text-slate-500">Saved on {job.savedAt}</p>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

