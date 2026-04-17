import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { showToast } from '../lib/toast';
import { jobsBoardPath } from '../lib/jobRoutes';

type JobCard = {
  id: string;
  title: string;
  location: string;
  type: string;
  industry?: string;
};

export default function CompanyPage() {
  const { companySlug } = useParams<{ companySlug: string }>();
  const companyName = useMemo(() => {
    try {
      return companySlug ? decodeURIComponent(companySlug).trim() : '';
    } catch {
      return (companySlug || '').trim();
    }
  }, [companySlug]);

  const [jobs, setJobs] = useState<JobCard[]>([]);
  const [following, setFollowing] = useState(false);

  useEffect(() => {
    if (!companyName) {
      setJobs([]);
      return;
    }
    fetch('http://localhost:4000/api/jobs/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ company: companyName })
    })
      .then((res) => res.json())
      .then((data) => setJobs(Array.isArray(data) ? data.slice(0, 12) : []))
      .catch(() => setJobs([]));
  }, [companyName]);

  const subtitle = useMemo(() => {
    const first = jobs[0];
    if (!first) return 'Company';
    const parts = [first.industry, first.location].filter(Boolean);
    return parts.length ? parts.join(' • ') : 'Open roles';
  }, [jobs]);

  return (
    <div className="space-y-3">
      <section className="li-card overflow-hidden p-0">
        <div className="h-28 bg-gradient-to-r from-[#0a66c2] to-[#5aa4f3]" />
        <div className="p-5">
          <h1 className="text-2xl font-semibold text-[#191919]">{companyName || 'Company'}</h1>
          <p className="mt-1 text-sm text-[#666]">{subtitle}</p>
          <button
            onClick={() => {
              setFollowing((v) => !v);
              const label = companyName || 'this company';
              showToast(following ? `Unfollowed ${label}.` : `Following ${label}.`, 'success');
            }}
            className="mt-3 rounded-full border border-[#0a66c2] px-4 py-1.5 text-sm font-semibold text-[#0a66c2] hover:bg-[#edf3f8]"
          >
            {following ? 'Following' : 'Follow company'}
          </button>
        </div>
      </section>

      <section className="li-card p-5">
        <h2 className="text-sm font-semibold text-[#191919]">Open jobs</h2>
        {jobs.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">No jobs available for this company yet.</p>
        ) : (
          <div className="mt-2 space-y-2">
            {jobs.map((job) => (
              <Link
                key={job.id}
                to={jobsBoardPath(job.id)}
                className="block rounded-lg border border-slate-200 p-3 hover:bg-slate-50"
              >
                <p className="font-semibold text-slate-900">{job.title}</p>
                <p className="text-sm text-slate-600">{job.location} • {job.type}</p>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

