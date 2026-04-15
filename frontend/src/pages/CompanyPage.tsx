import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { showToast } from '../lib/toast';

type JobCard = {
  id: string;
  title: string;
  location: string;
  type: string;
};

export default function CompanyPage() {
  const [jobs, setJobs] = useState<JobCard[]>([]);
  const [following, setFollowing] = useState(false);

  useEffect(() => {
    fetch('http://localhost:4000/api/jobs/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ keyword: 'Acme' })
    })
      .then((res) => res.json())
      .then((data) => setJobs(Array.isArray(data) ? data.slice(0, 6) : []))
      .catch(() => setJobs([]));
  }, []);

  return (
    <div className="space-y-3">
      <section className="li-card overflow-hidden p-0">
        <div className="h-28 bg-gradient-to-r from-[#0a66c2] to-[#5aa4f3]" />
        <div className="p-5">
          <h1 className="text-2xl font-semibold text-[#191919]">Acme Company</h1>
          <p className="mt-1 text-sm text-[#666]">Technology • 1,500+ employees • San Jose, CA</p>
          <button
            onClick={() => {
              setFollowing((v) => !v);
              showToast(following ? 'Unfollowed Acme Company.' : 'Following Acme Company.', 'success');
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
              <Link key={job.id} to="/jobs" className="block rounded-lg border border-slate-200 p-3 hover:bg-slate-50">
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

