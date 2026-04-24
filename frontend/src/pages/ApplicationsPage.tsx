import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { MEMBER_ID } from '../lib/memberProfile';

const normalizeStatus = (value: string) => {
  const lower = (value || '').toLowerCase().trim();
  if (lower === 'sdbmitted') return 'submitted';
  return lower || 'submitted';
};

export default function ApplicationsPage() {
  const [memberApps, setMemberApps] = useState<any[]>([]);
  const [jobId, setJobId] = useState('');
  const [jobApps, setJobApps] = useState<any[]>([]);

  async function loadMemberApps() {
    const res = await fetch('/api/applications/byMember', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ member_id: MEMBER_ID })
    });
    const data = await res.json().catch(() => []);
    setMemberApps(Array.isArray(data) ? data : []);
  }

  useEffect(() => {
    loadMemberApps().catch(() => undefined);
  }, []);

  return (
    <div className="space-y-3">
      <section className="li-card p-5">
        <div className="flex flex-wrap gap-2">
          <Link to="/jobs" className="rounded-full border border-[#0a66c2] px-4 py-1.5 text-sm font-semibold text-[#0a66c2] hover:bg-[#edf3f8]">
            Find jobs
          </Link>
          <Link to="/jobs/tracker" className="rounded-full border border-slate-300 px-4 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">
            Job tracker
          </Link>
          <Link to="/recruiter" className="rounded-full border border-slate-300 px-4 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">
            Analytics dashboard
          </Link>
        </div>
      </section>
      <section className="li-card p-5">
        <h2 className="li-section-title">My applications</h2>
        <div className="mt-3 space-y-2">
          {memberApps.length === 0 ? <p className="text-sm text-slate-500">No applications yet.</p> : memberApps.map((app) => (
            <div key={app.app_id} className="rounded-md border border-[#e0dfdc] p-3">
              <Link to="/jobs" className="font-medium text-[#0a66c2] hover:underline">{app.job_id}</Link>
              <p className="text-sm text-slate-600">Status: {normalizeStatus(app.status)}</p>
              {app.resume_url ? (
                <p className="text-xs text-slate-600">Resume URL: <a href={app.resume_url} target="_blank" rel="noreferrer" className="text-[#0a66c2] hover:underline">{app.resume_url}</a></p>
              ) : null}
            </div>
          ))}
        </div>
      </section>
      <section className="li-card p-5">
        <h2 className="li-section-title">Recruiter review panel</h2>
        <div className="mt-3 flex gap-2">
          <input
            value={jobId}
            onChange={(e) => setJobId(e.target.value)}
            placeholder="Enter job_id (e.g., J-xxxx)"
            className="flex-1 rounded-md border border-[#d0d7de] px-3 py-2 text-sm"
          />
          <button
            className="rounded-full bg-[#0a66c2] px-4 py-2 text-sm font-semibold text-white hover:bg-[#004182]"
            onClick={async () => {
              const res = await fetch('/api/applications/byJob', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ job_id: jobId })
              });
              const data = await res.json().catch(() => []);
              setJobApps(Array.isArray(data) ? data : []);
            }}
          >
            Load applicants
          </button>
          <Link
            to="/jobs/post"
            className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Post new job
          </Link>
        </div>
        <div className="mt-3 space-y-2">
          {jobApps.map((app) => (
            <div key={app.app_id} className="rounded-md border border-[#e0dfdc] p-3">
              <p className="text-sm font-medium text-slate-900">
                <Link to="/profile" className="text-[#0a66c2] hover:underline">{app.member_id}</Link> - {normalizeStatus(app.status)}
              </p>
              {app.resume_url ? (
                <p className="mt-1 text-xs text-slate-600">Resume URL: <a href={app.resume_url} target="_blank" rel="noreferrer" className="text-[#0a66c2] hover:underline">{app.resume_url}</a></p>
              ) : null}
              {app.resume_text ? (
                <p className="mt-1 text-xs text-slate-600">Resume summary: {String(app.resume_text).slice(0, 180)}</p>
              ) : null}
              <div className="mt-2 flex flex-wrap gap-2">
                {['reviewing', 'interview', 'offer', 'rejected'].map((status) => (
                  <button
                    key={status}
                    className="rounded-full border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                    onClick={async () => {
                      await fetch('/api/applications/updateStatus', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ application_id: app.app_id, status })
                      });
                      const refreshed = await fetch('/api/applications/byJob', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ job_id: jobId })
                      });
                      const refreshedData = await refreshed.json().catch(() => []);
                      setJobApps(Array.isArray(refreshedData) ? refreshedData : []);
                    }}
                  >
                    {status}
                  </button>
                ))}
                <button
                  className="rounded-full border border-blue-600 px-3 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-50"
                  onClick={async () => {
                    const note = window.prompt('Enter recruiter note') || '';
                    if (!note) return;
                    await fetch('/api/applications/addNote', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ application_id: app.app_id, note })
                    });
                  }}
                >
                  Add note
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
