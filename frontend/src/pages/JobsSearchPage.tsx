import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import Navbar from '../components/layout/Navbar';
import { Job } from '../mockData/jobs';
import { CheckCircle2, X } from 'lucide-react';
import { MEMBER_ID } from '../lib/memberProfile';
import { addActivity, readJson, SAVED_JOBS_KEY, writeJson } from '../lib/localData';
import { companyProfilePath, jobsResultsPath, jobsSearchPath } from '../lib/jobRoutes';
import { mergeJobDetail, normalizeJobListRows } from '../lib/jobNormalize';
import { showToast } from '../lib/toast';
import RecruiterAiJobPanel from '../components/recruiter/RecruiterAiJobPanel';

const chips = ['Date posted', 'Remote', 'Inside Sales', 'Outside Sales', 'Healthcare', 'Biotech', 'Easy Apply', 'Employment type', 'Company', 'Under 10 applicants', 'In my network'];

export default function JobsSearchPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [activeJob, setActiveJob] = useState<Job | null>(null);
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveBannerJob, setSaveBannerJob] = useState<Job | null>(null);

  const keyword = useMemo(() => {
    const q = new URLSearchParams(location.search);
    return q.get('keywords') || q.get('keyword') || '';
  }, [location.search]);

  const locationParam = useMemo(() => {
    const q = new URLSearchParams(location.search);
    return q.get('location') || '';
  }, [location.search]);

  const selectedJobId = useMemo(() => {
    const q = new URLSearchParams(location.search);
    return q.get('jobId') || '';
  }, [location.search]);

  useEffect(() => {
    setLoading(true);
    fetch('/api/jobs/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        keyword: keyword || undefined,
        location: locationParam || undefined
      })
    })
      .then((res) => res.json())
      .then((data) => {
        const rows = normalizeJobListRows(Array.isArray(data) ? data : []);
        setJobs(rows);
        if (rows.length) {
          const selected = selectedJobId ? rows.find((j) => j.id === selectedJobId) : null;
          setActiveJob(selected || rows[0]);
        } else {
          setActiveJob(null);
        }
        setLoading(false);
      })
      .catch(() => {
        setJobs([]);
        setLoading(false);
      });
  }, [keyword, locationParam, selectedJobId]);

  /** Pull live per-member flags (applied/saved) for selected job. */
  useEffect(() => {
    if (!activeJob?.id) return;
    fetch('/api/jobs/get', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ job_id: activeJob.id, member_id: MEMBER_ID })
    })
      .then((res) => res.json().then((data) => ({ ok: res.ok, data })))
      .then(({ ok, data }) => {
        if (!ok) return;
        setActiveJob((prev) => (prev && prev.id === activeJob.id ? mergeJobDetail(prev, data) : prev));
      })
      .catch(() => undefined);
  }, [activeJob?.id]);

  const onApply = async () => {
    if (!activeJob) return;
    navigate(`/jobs/apply?jobId=${encodeURIComponent(activeJob.id)}`);
  };

  const onSave = async () => {
    if (!activeJob) return;
    setIsSaving(true);
    try {
      const isAlreadySaved = Boolean((activeJob as any).saved);
      const res = await fetch(isAlreadySaved ? '/api/jobs/unsave' : '/api/jobs/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ job_id: activeJob.id, member_id: MEMBER_ID })
      });
      if (!res.ok) {
        showToast(`Unable to ${isAlreadySaved ? 'unsave' : 'save'} right now.`, 'error');
        return;
      }
      const existing = readJson<any[]>(SAVED_JOBS_KEY, []);
      if (isAlreadySaved) {
        writeJson(
          SAVED_JOBS_KEY,
          existing.filter((item) => item.id !== activeJob.id)
        );
        setActiveJob((prev) => (prev ? ({ ...prev, saved: false } as any) : prev));
        setSaveBannerJob(null);
        showToast('Removed from saved jobs.', 'info');
      } else {
        const next = [
          {
            id: activeJob.id,
            title: activeJob.title,
            company: activeJob.company,
            location: activeJob.location,
            savedAt: new Date().toLocaleDateString()
          },
          ...existing.filter((item) => item.id !== activeJob.id)
        ];
        writeJson(SAVED_JOBS_KEY, next.slice(0, 100));
        setActiveJob((prev) => (prev ? ({ ...prev, saved: true } as any) : prev));
        addActivity(`Saved job ${activeJob.title} at ${activeJob.company}`);
        setSaveBannerJob(activeJob);
        showToast('Job saved.', 'success');
      }
    } catch {
      showToast('Unable to save right now.', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-white">
      <Navbar />
      <div className="border-b border-[#e0dfdc] bg-white">
        <div className="mx-auto flex max-w-[1128px] flex-wrap items-center gap-2 px-3 py-2">
          <span className="rounded-full bg-[#057642] px-3 py-1 text-sm font-semibold text-white">Jobs</span>
          {chips.map((chip) => (
            <button key={chip} className="rounded-full border border-[#d0d7de] px-3 py-1 text-[13px] font-semibold text-[#444] hover:bg-[#f3f2ef]">
              {chip}
            </button>
          ))}
          <Link to="/jobs" className="ml-auto text-sm font-semibold text-[#0a66c2] hover:underline">Jobs home</Link>
        </div>
      </div>
      <div className="mx-auto grid max-w-[1128px] grid-cols-1 gap-0 px-3 py-3 lg:grid-cols-12">
        <section className="border border-[#e0dfdc] bg-white lg:col-span-5">
          <div className="border-b border-[#e0dfdc] px-4 py-2 text-sm text-[#444]">
            {loading ? 'Loading...' : `${jobs.length} results`} {keyword ? `for ${keyword}` : ''}
          </div>
          <div>
            {jobs.map((job) => (
              <Link
                key={job.id}
                to={jobsResultsPath(job.id)}
                className={`block w-full border-b border-[#e0dfdc] px-4 py-2.5 text-left ${activeJob?.id === job.id ? 'bg-[#edf3f8]' : 'hover:bg-[#f9fafb]'}`}
              >
                <p className="text-[22px] leading-tight font-semibold text-[#0a66c2]">{job.title}</p>
                <p className="text-sm text-[#444]">{job.company}</p>
                <p className="text-sm text-[#666]">{job.location}</p>
                <p className="mt-1 text-xs text-[#666]">{job.postedAt} · {job.type}</p>
              </Link>
            ))}
          </div>
        </section>
        <section className="border border-l-0 border-[#e0dfdc] bg-white lg:col-span-7">
          {activeJob ? (
            <div className="p-6">
              <h1 className="text-[44px] leading-[1.05] font-semibold text-[#191919]">{activeJob.title}</h1>
              <p className="mt-2 text-lg text-[#444]">
                <Link to={companyProfilePath(activeJob.company)} className="hover:text-[#0a66c2] hover:underline">
                  {activeJob.company}
                </Link>
                {' '}
                ·{' '}
                <Link
                  to={jobsSearchPath({ location: activeJob.location })}
                  className="hover:text-[#0a66c2] hover:underline"
                >
                  {activeJob.location}
                </Link>
              </p>
              <p className="mt-2 text-sm text-[#666]">{activeJob.postedAt} · {activeJob.applicants ?? 0} applicants</p>
              <div className="mt-4 flex gap-2">
                <button
                  onClick={onApply}
                  disabled={Boolean((activeJob as any).applied)}
                  className="rounded-full bg-[#0a66c2] px-5 py-2 text-sm font-semibold text-white hover:bg-[#004182] disabled:cursor-not-allowed disabled:bg-[#9ec6e5]"
                >
                  {(activeJob as any).applied ? 'Applied' : 'Apply'}
                </button>
                <button
                  onClick={() => {
                    if (isSaving) return;
                    onSave();
                  }}
                  className={`rounded-full border px-5 py-2 text-sm font-semibold transition-colors ${
                    (activeJob as any).saved
                      ? 'border-[#0a66c2] bg-[#edf3f8] text-[#0a66c2] hover:bg-[#dfeaf7]'
                      : 'border-[#0a66c2] text-[#0a66c2] hover:bg-[#edf3f8]'
                  }`}
                >
                  {isSaving ? 'Saving...' : ((activeJob as any).saved ? 'Saved' : 'Save')}
                </button>
              </div>
              <div className="mt-6">
                <h2 className="mb-2 text-[34px] leading-tight font-semibold text-[#191919]">Job description</h2>
                <p className="text-sm leading-relaxed text-[#333]">{activeJob.description}</p>
              </div>
              <RecruiterAiJobPanel jobId={activeJob.id} />
            </div>
          ) : (
            <div className="p-6 text-slate-500">Select a job to view details</div>
          )}
        </section>
      </div>
      {saveBannerJob ? (
        <div className="fixed bottom-5 left-5 z-[130] w-[min(92vw,340px)] rounded-lg border border-slate-200 bg-white p-3 shadow-xl">
          <div className="flex items-start gap-2">
            <CheckCircle2 size={16} className="mt-0.5 text-[#057642]" />
            <p className="text-sm text-[#191919]">
              You saved this job.
            </p>
            <button
              type="button"
              onClick={() => setSaveBannerJob(null)}
              className="ml-auto rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              aria-label="Dismiss save message"
            >
              <X size={14} />
            </button>
          </div>
          <div className="mt-2 flex items-center gap-2">
            <span className="text-xs text-[#666] line-clamp-1">
              {saveBannerJob.title} at {saveBannerJob.company}
            </span>
            <Link
              to="/saved"
              className="ml-auto text-xs font-semibold text-[#0a66c2] hover:underline"
            >
              See saved jobs
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}
