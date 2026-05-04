import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { jobsResultsPath } from '../lib/jobRoutes';

const normalizeStatus = (value: string) => {
  const lower = (value || '').toLowerCase().trim();
  if (lower === 'sdbmitted') return 'submitted';
  return lower || 'submitted';
};

type ApplicationsTab = 'applicant' | 'recruiter';

export default function ApplicationsPage() {
  const MEMBER_ID = sessionStorage.getItem('li_sim_member_id') || 'M-123';
  const [searchParams, setSearchParams] = useSearchParams();
  const [tab, setTab] = useState<ApplicationsTab>(() =>
    searchParams.get('tab') === 'review' ? 'recruiter' : 'applicant'
  );
  const [memberApps, setMemberApps] = useState<any[]>([]);
  const [jobId, setJobId] = useState('');
  const [jobKeyword, setJobKeyword] = useState('');
  const [jobSuggestions, setJobSuggestions] = useState<Array<{ id: string; title: string; company: string }>>([]);
  const [applicantKeyword, setApplicantKeyword] = useState('');
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

  useEffect(() => {
    const fromUrl = searchParams.get('jobId');
    if (fromUrl) {
      setJobId(fromUrl);
    }
    if (searchParams.get('tab') === 'review') {
      setTab('recruiter');
    }
  }, [searchParams]);

  const setTabAndUrl = (next: ApplicationsTab) => {
    setTab(next);
    const q = new URLSearchParams(searchParams);
    if (next === 'recruiter') {
      q.set('tab', 'review');
    } else {
      q.delete('tab');
    }
    setSearchParams(q, { replace: true });
  };

  useEffect(() => {
    const k = jobKeyword.trim();
    if (k.length < 2) {
      setJobSuggestions([]);
      return;
    }
    const t = window.setTimeout(() => {
      fetch('/api/jobs/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keyword: k })
      })
        .then((res) => res.json())
        .then((data) => {
          const rows = (Array.isArray(data) ? data : []).slice(0, 8).map((j: any) => ({
            id: String(j.job_id || j.id || ''),
            title: String(j.title || ''),
            company: String(j.company || '')
          }));
          setJobSuggestions(rows.filter((r) => r.id));
        })
        .catch(() => setJobSuggestions([]));
    }, 180);
    return () => window.clearTimeout(t);
  }, [jobKeyword]);

  const filteredJobApps = jobApps.filter((app) => {
    const kw = applicantKeyword.trim().toLowerCase();
    if (!kw) return true;
    return (
      String(app.member_id || '').toLowerCase().includes(kw) ||
      String(app.status || '').toLowerCase().includes(kw) ||
      String(app.resume_text || '').toLowerCase().includes(kw)
    );
  });

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
        <div className="mt-5 flex flex-wrap gap-1 border-b border-[#e0dfdc]">
          <button
            type="button"
            onClick={() => setTabAndUrl('applicant')}
            className={`rounded-t-md px-4 py-2 text-sm font-semibold transition-colors ${
              tab === 'applicant'
                ? 'border-b-2 border-[#0a66c2] text-[#0a66c2]'
                : 'border-b-2 border-transparent text-[#666] hover:bg-[#f3f2ef]'
            }`}
          >
            My applications
          </button>
          <button
            type="button"
            onClick={() => setTabAndUrl('recruiter')}
            className={`rounded-t-md px-4 py-2 text-sm font-semibold transition-colors ${
              tab === 'recruiter'
                ? 'border-b-2 border-[#0a66c2] text-[#0a66c2]'
                : 'border-b-2 border-transparent text-[#666] hover:bg-[#f3f2ef]'
            }`}
          >
            Review applicants
          </button>
        </div>
        <p className="mt-3 text-xs text-[#666]">
          {tab === 'applicant'
            ? 'Jobs you have applied to as this member. (LinkedIn keeps this separate from hiring tools.)'
            : 'Hiring workflow for class demos: load everyone who applied to a job posting, then update status or add notes.'}
        </p>
      </section>

      {tab === 'applicant' ? (
      <section className="li-card p-5">
        <h2 className="li-section-title">My applications</h2>
        <div className="mt-3 space-y-2">
          {memberApps.length === 0 ? <p className="text-sm text-slate-500">No applications yet.</p> : memberApps.map((app) => (
            <div key={app.app_id} className="rounded-md border border-[#e0dfdc] p-3">
              <Link to={jobsResultsPath(app.job_id)} className="block text-base font-semibold text-[#0a66c2] hover:underline">
                {String(app.job_title || '').trim() || app.job_id}
              </Link>
              {app.job_company ? <p className="mt-0.5 text-sm text-[#444]">{app.job_company}</p> : null}
              {app.job_location ? <p className="mt-0.5 text-xs text-[#666]">{app.job_location}</p> : null}
              <p className="mt-1 text-xs text-slate-500">
                Job ID:{' '}
                <span className="font-mono text-[#555]">{app.job_id}</span>
              </p>
              <p className="mt-1 text-sm text-slate-600">Status: {normalizeStatus(app.status)}</p>
              {app.resume_url ? (
                <p className="text-xs text-slate-600">Resume URL: <a href={app.resume_url} target="_blank" rel="noreferrer" className="text-[#0a66c2] hover:underline">{app.resume_url}</a></p>
              ) : null}
            </div>
          ))}
        </div>
      </section>
      ) : (
      <section className="li-card p-5">
        <h2 className="li-section-title">Review applicants</h2>
        <div className="mt-3 flex gap-2">
          <div className="relative flex-1">
            <input
              value={jobKeyword}
              onChange={(e) => setJobKeyword(e.target.value)}
              placeholder="Search jobs by keyword"
              className="w-full rounded-md border border-[#d0d7de] px-3 py-2 text-sm"
            />
            {jobSuggestions.length ? (
              <div className="absolute left-0 right-0 top-10 z-20 rounded-md border border-[#e0dfdc] bg-white py-1 shadow-lg">
                {jobSuggestions.map((job) => (
                  <button
                    key={job.id}
                    type="button"
                    onClick={() => {
                      setJobId(job.id);
                      setJobKeyword(`${job.title} · ${job.company}`);
                      setJobSuggestions([]);
                    }}
                    className="block w-full px-3 py-2 text-left hover:bg-[#f3f2ef]"
                  >
                    <p className="text-sm text-[#191919]">{job.title}</p>
                    <p className="text-xs text-[#666]">{job.company}</p>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          <input
            value={jobId}
            onChange={(e) => setJobId(e.target.value)}
            placeholder="Job ID (e.g., J-xxxx)"
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
        <p className="mt-3 text-xs text-slate-500">
          AI ranking/outreach now starts from the Job Details page so job context is preloaded.
        </p>
        <div className="mt-3">
          <input
            value={applicantKeyword}
            onChange={(e) => setApplicantKeyword(e.target.value)}
            placeholder="Filter applicants by member id, status, resume keyword"
            className="w-full rounded-md border border-[#d0d7de] px-3 py-2 text-sm"
          />
        </div>

        <div className="mt-3 space-y-2">
          {filteredJobApps.map((app) => (
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
      )}
    </div>
  );
}
