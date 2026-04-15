import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import Navbar from '../components/layout/Navbar';
import { Job } from '../mockData/jobs';
import { MEMBER_ID } from '../lib/memberProfile';
import { addActivity, readJson, SAVED_JOBS_KEY, writeJson } from '../lib/localData';

const chips = ['Date posted', 'Remote', 'Inside Sales', 'Outside Sales', 'Healthcare', 'Biotech', 'Easy Apply', 'Employment type', 'Company', 'Under 10 applicants', 'In my network'];

export default function JobsSearchPage() {
  const location = useLocation();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [activeJob, setActiveJob] = useState<Job | null>(null);
  const [loading, setLoading] = useState(true);
  const [isApplying, setIsApplying] = useState(false);

  const keyword = useMemo(() => {
    const q = new URLSearchParams(location.search);
    return q.get('keywords') || q.get('keyword') || '';
  }, [location.search]);

  useEffect(() => {
    setLoading(true);
    fetch('http://localhost:4000/api/jobs/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ keyword: keyword || undefined })
    })
      .then((res) => res.json())
      .then((data) => {
        const rows = Array.isArray(data) ? data : [];
        setJobs(rows);
        if (rows.length) setActiveJob(rows[0]);
        setLoading(false);
      })
      .catch(() => {
        setJobs([]);
        setLoading(false);
      });
  }, [keyword]);

  const openJob = async (job: Job) => {
    setActiveJob(job);
    const res = await fetch('http://localhost:4000/api/jobs/get', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ job_id: job.id, member_id: MEMBER_ID })
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) setActiveJob({ ...job, ...data });
  };

  const onApply = async () => {
    if (!activeJob) return;
    setIsApplying(true);
    await fetch('http://localhost:4000/api/applications/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ job_id: activeJob.id, member_id: MEMBER_ID })
    });
    addActivity(`Applied to ${activeJob.title} at ${activeJob.company}`);
    setIsApplying(false);
  };

  const onSave = async () => {
    if (!activeJob) return;
    await fetch('http://localhost:4000/api/jobs/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ job_id: activeJob.id, member_id: MEMBER_ID })
    });
    const existing = readJson<any[]>(SAVED_JOBS_KEY, []);
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
    addActivity(`Saved job ${activeJob.title} at ${activeJob.company}`);
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
          <div className="max-h-[calc(100vh-12rem)] overflow-y-auto">
            {jobs.map((job) => (
              <button
                key={job.id}
                onClick={() => openJob(job)}
                className={`w-full border-b border-[#e0dfdc] px-4 py-2.5 text-left ${activeJob?.id === job.id ? 'bg-[#edf3f8]' : 'hover:bg-[#f9fafb]'}`}
              >
                <p className="text-[22px] leading-tight font-semibold text-[#0a66c2]">{job.title}</p>
                <p className="text-sm text-[#444]">{job.company}</p>
                <p className="text-sm text-[#666]">{job.location}</p>
                <p className="mt-1 text-xs text-[#666]">{job.postedAt} · {job.type}</p>
              </button>
            ))}
          </div>
        </section>
        <section className="border border-l-0 border-[#e0dfdc] bg-white lg:col-span-7">
          {activeJob ? (
            <div className="p-6">
              <h1 className="text-[44px] leading-[1.05] font-semibold text-[#191919]">{activeJob.title}</h1>
              <p className="mt-2 text-lg text-[#444]">{activeJob.company} · {activeJob.location}</p>
              <p className="mt-2 text-sm text-[#666]">{activeJob.postedAt} · {activeJob.applicants ?? 0} applicants</p>
              <div className="mt-4 flex gap-2">
                <button onClick={onApply} className="rounded-full bg-[#0a66c2] px-5 py-2 text-sm font-semibold text-white hover:bg-[#004182]">
                  {isApplying ? 'Applying...' : 'Apply'}
                </button>
                <button onClick={onSave} className="rounded-full border border-[#0a66c2] px-5 py-2 text-sm font-semibold text-[#0a66c2] hover:bg-[#edf3f8]">
                  Save
                </button>
              </div>
              <div className="mt-6">
                <h2 className="mb-2 text-[34px] leading-tight font-semibold text-[#191919]">Job description</h2>
                <p className="text-sm leading-relaxed text-[#333]">{activeJob.description}</p>
              </div>
            </div>
          ) : (
            <div className="p-6 text-slate-500">Select a job to view details</div>
          )}
        </section>
      </div>
    </div>
  );
}

