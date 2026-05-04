import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { jobsResultsPath } from '../lib/jobRoutes';
import { getViewerMemberId, getViewerRecruiterId } from '../lib/memberProfile';
import { normalizeJobListRows } from '../lib/jobNormalize';
import type { Job } from '../mockData/jobs';
import { showToast } from '../lib/toast';

const normalizeStatus = (value: string) => {
  const lower = (value || '').toLowerCase().trim();
  if (lower === 'sdbmitted') return 'submitted';
  return lower || 'submitted';
};

type ApplicationsTab = 'applicant' | 'recruiter';

export default function ApplicationsPage() {
  const memberId = getViewerMemberId();
  const [searchParams, setSearchParams] = useSearchParams();
  const [tab, setTab] = useState<ApplicationsTab>(() =>
    searchParams.get('tab') === 'review' ? 'recruiter' : 'applicant'
  );
  const [memberApps, setMemberApps] = useState<any[]>([]);
  const [myPostings, setMyPostings] = useState<Job[]>([]);
  const [myPostingsLoading, setMyPostingsLoading] = useState(true);
  const [jobId, setJobId] = useState('');
  const [jobKeyword, setJobKeyword] = useState('');
  const [jobMenuOpen, setJobMenuOpen] = useState(false);
  const [applicantKeyword, setApplicantKeyword] = useState('');
  const [jobApps, setJobApps] = useState<any[]>([]);
  const [applicantNameMap, setApplicantNameMap] = useState<Record<string, string>>({});

  const canReview = !myPostingsLoading && myPostings.length > 0;
  const myJobIds = useMemo(() => new Set(myPostings.map((j) => j.id)), [myPostings]);

  const loadMyPostings = useCallback(async () => {
    const recruiterId = getViewerRecruiterId();
    setMyPostingsLoading(true);
    try {
      const res = await fetch('/api/jobs/byRecruiter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recruiter_id: recruiterId })
      });
      const data = await res.json().catch(() => []);
      const rows = Array.isArray(data) ? data : [];
      setMyPostings(normalizeJobListRows(rows));
    } catch {
      setMyPostings([]);
    } finally {
      setMyPostingsLoading(false);
    }
  }, []);

  async function loadMemberApps() {
    const res = await fetch('/api/applications/byMember', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ member_id: memberId })
    });
    const data = await res.json().catch(() => []);
    setMemberApps(Array.isArray(data) ? data : []);
  }

  useEffect(() => {
    loadMemberApps().catch(() => undefined);
  }, [memberId]);

  useEffect(() => {
    void loadMyPostings();
  }, [loadMyPostings]);

  useEffect(() => {
    if (myPostingsLoading) return;
    const wantsReview = searchParams.get('tab') === 'review';
    if (wantsReview && myPostings.length === 0) {
      const q = new URLSearchParams(searchParams);
      q.delete('tab');
      setSearchParams(q, { replace: true });
      setTab('applicant');
    } else if (wantsReview && myPostings.length > 0) {
      setTab('recruiter');
    }
  }, [myPostingsLoading, myPostings.length, searchParams, setSearchParams]);

  useEffect(() => {
    if (myPostingsLoading) return;
    const fromUrl = searchParams.get('jobId');
    if (fromUrl && myJobIds.size > 0 && !myJobIds.has(fromUrl)) {
      const q = new URLSearchParams(searchParams);
      q.delete('jobId');
      setSearchParams(q, { replace: true });
      setJobId('');
      setJobKeyword('');
      showToast('That job is not in your postings.', 'info');
      return;
    }
    if (fromUrl && myJobIds.has(fromUrl)) {
      setJobId(fromUrl);
      const job = myPostings.find((j) => j.id === fromUrl);
      if (job) {
        setJobKeyword(`${job.title} · ${job.company}`);
      }
    }
  }, [searchParams, myPostings, myJobIds, myPostingsLoading, setSearchParams]);

  const setTabAndUrl = (next: ApplicationsTab) => {
    if (next === 'recruiter' && !canReview) return;
    setTab(next);
    const q = new URLSearchParams(searchParams);
    if (next === 'recruiter') {
      q.set('tab', 'review');
    } else {
      q.delete('tab');
    }
    setSearchParams(q, { replace: true });
  };

  const filteredMyJobs = useMemo(() => {
    const k = jobKeyword.trim().toLowerCase();
    if (!k) return myPostings;
    return myPostings.filter(
      (j) =>
        j.title.toLowerCase().includes(k) ||
        j.company.toLowerCase().includes(k) ||
        j.id.toLowerCase().includes(k)
    );
  }, [myPostings, jobKeyword]);

  const pickJob = (job: Job) => {
    setJobId(job.id);
    setJobKeyword(`${job.title} · ${job.company}`);
    setJobMenuOpen(false);
    const q = new URLSearchParams(searchParams);
    q.set('jobId', job.id);
    q.set('tab', 'review');
    setSearchParams(q, { replace: true });
  };

  const recruiterIdForApi = () => getViewerRecruiterId();

  async function ensureApplicantNames(apps: any[]) {
    const memberIds = Array.from(
      new Set(
        (Array.isArray(apps) ? apps : [])
          .map((a: any) => String(a?.member_id || '').trim())
          .filter(Boolean)
      )
    );
    if (!memberIds.length) return;
    const missing = memberIds.filter((id) => !applicantNameMap[id]);
    if (!missing.length) return;
    try {
      const res = await fetch('/api/members/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keyword: '' })
      });
      const rows = await res.json().catch(() => []);
      const next = { ...applicantNameMap };
      (Array.isArray(rows) ? rows : []).forEach((m: any) => {
        const id = String(m?.member_id || '').trim();
        if (!id) return;
        const name = String(
          m?.name || `${m?.first_name || ''} ${m?.last_name || ''}`.trim() || id
        ).trim();
        next[id] = name || id;
      });
      setApplicantNameMap(next);
    } catch {
      // Keep ids as fallback if names are unavailable.
    }
  }

  async function fetchApplicantsForJob(id: string) {
    const res = await fetch('/api/applications/byJob', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ job_id: id, recruiter_id: recruiterIdForApi() })
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      const msg =
        data && typeof data === 'object' && 'message' in data
          ? String((data as { message?: string }).message)
          : 'Unable to load applicants.';
      showToast(msg, 'error');
      setJobApps([]);
      return;
    }
    const apps = Array.isArray(data) ? data : [];
    setJobApps(apps);
    await ensureApplicantNames(apps);
  }

  const filteredJobApps = jobApps.filter((app) => {
    const kw = applicantKeyword.trim().toLowerCase();
    if (!kw) return true;
    return (
      String(app.member_id || '').toLowerCase().includes(kw) ||
      String(app.status || '').toLowerCase().includes(kw) ||
      String(app.resume_text || '').toLowerCase().includes(kw)
    );
  });

  const showRecruiterPanel = tab === 'recruiter' && canReview;

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
              tab === 'applicant' || !canReview
                ? 'border-b-2 border-[#0a66c2] text-[#0a66c2]'
                : 'border-b-2 border-transparent text-[#666] hover:bg-[#f3f2ef]'
            }`}
          >
            My applications
          </button>
          {canReview ? (
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
          ) : null}
        </div>
        <p className="mt-3 text-xs text-[#666]">
          {showRecruiterPanel
            ? 'Load applicants for a job you posted, then update status or add notes.'
            : 'Jobs you have applied to as this member. (LinkedIn keeps this separate from hiring tools.)'}
        </p>
        {!canReview && !myPostingsLoading ? (
          <p className="mt-2 text-xs text-slate-500">
            Post a job to enable reviewing applicants for your postings.
          </p>
        ) : null}
      </section>

      {!showRecruiterPanel ? (
        <section className="li-card p-5">
          <h2 className="li-section-title">My applications</h2>
          <div className="mt-3 space-y-2">
            {memberApps.length === 0 ? (
              <p className="text-sm text-slate-500">No applications yet.</p>
            ) : (
              memberApps.map((app) => (
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
                    <p className="text-xs text-slate-600">
                      Resume URL:{' '}
                      <a href={app.resume_url} target="_blank" rel="noreferrer" className="text-[#0a66c2] hover:underline">
                        {app.resume_url}
                      </a>
                    </p>
                  ) : null}
                </div>
              ))
            )}
          </div>
        </section>
      ) : (
        <section className="li-card p-5">
          <h2 className="li-section-title">Review applicants</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            <div className="relative min-w-[200px] flex-1">
              <input
                value={jobKeyword}
                onChange={(e) => {
                  setJobKeyword(e.target.value);
                  setJobMenuOpen(true);
                }}
                onFocus={() => setJobMenuOpen(true)}
                onBlur={() => window.setTimeout(() => setJobMenuOpen(false), 150)}
                placeholder="Search your job postings"
                className="w-full rounded-md border border-[#d0d7de] px-3 py-2 text-sm"
              />
              {jobMenuOpen && filteredMyJobs.length ? (
                <div className="absolute left-0 right-0 top-10 z-20 max-h-64 overflow-auto rounded-md border border-[#e0dfdc] bg-white py-1 shadow-lg">
                  {filteredMyJobs.map((job) => (
                    <button
                      key={job.id}
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => pickJob(job)}
                      className="block w-full px-3 py-2 text-left hover:bg-[#f3f2ef]"
                    >
                      <p className="text-sm text-[#191919]">{job.title}</p>
                      <p className="text-xs text-[#666]">
                        {job.company} · <span className="font-mono">{job.id}</span>
                      </p>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
            <button
              className="rounded-full bg-[#0a66c2] px-4 py-2 text-sm font-semibold text-white hover:bg-[#004182] disabled:opacity-50"
              disabled={!jobId.trim() || !myJobIds.has(jobId.trim())}
              onClick={() => {
                const id = jobId.trim();
                if (!myJobIds.has(id)) {
                  showToast('Choose one of your posted jobs.', 'info');
                  return;
                }
                void fetchApplicantsForJob(id);
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
          {jobId ? (
            <p className="mt-2 text-xs text-slate-500">
              Selected job: <span className="font-mono text-[#555]">{jobId}</span>
            </p>
          ) : null}
          <p className="mt-3 text-xs text-slate-500">
            
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
                  <Link to="/profile" className="text-[#0a66c2] hover:underline">
                    {applicantNameMap[String(app.member_id || '')] || app.member_id}
                  </Link>{' '}
                  <span className="text-xs text-slate-500">({app.member_id})</span>{' '}
                  - {normalizeStatus(app.status)}
                </p>
                {app.resume_url ? (
                  <p className="mt-1 text-xs text-slate-600">
                    Resume URL:{' '}
                    <a href={app.resume_url} target="_blank" rel="noreferrer" className="text-[#0a66c2] hover:underline">
                      {app.resume_url}
                    </a>
                  </p>
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
                        const jid = jobId.trim();
                        const res = await fetch('/api/applications/updateStatus', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            application_id: app.app_id,
                            status,
                            recruiter_id: recruiterIdForApi()
                          })
                        });
                        const errBody = await res.json().catch(() => ({}));
                        if (!res.ok) {
                          showToast(
                            typeof errBody?.message === 'string' ? errBody.message : 'Could not update status.',
                            'error'
                          );
                          return;
                        }
                        if (jid) await fetchApplicantsForJob(jid);
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
                      const jid = jobId.trim();
                      const res = await fetch('/api/applications/addNote', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          application_id: app.app_id,
                          note,
                          recruiter_id: recruiterIdForApi()
                        })
                      });
                      const errBody = await res.json().catch(() => ({}));
                      if (!res.ok) {
                        showToast(
                          typeof errBody?.message === 'string' ? errBody.message : 'Could not save note.',
                          'error'
                        );
                        return;
                      }
                      showToast('Note saved.', 'success');
                      if (jid) await fetchApplicantsForJob(jid);
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
