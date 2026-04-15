import { Link } from 'react-router-dom';
import { readJson, SAVED_JOBS_KEY } from '../lib/localData';

type SavedJob = {
  id: string;
  title: string;
  company: string;
  location: string;
  savedAt: string;
};

export default function SavedItemsPage() {
  const savedJobs = readJson<SavedJob[]>(SAVED_JOBS_KEY, []);

  return (
    <div className="li-card p-5">
      <h1 className="text-xl font-semibold text-[#191919]">Saved Items</h1>
      <p className="mt-1 text-sm text-[#666]">Your saved jobs and quick links.</p>

      <section className="mt-4">
        <h2 className="text-sm font-semibold text-[#191919]">Saved jobs ({savedJobs.length})</h2>
        {savedJobs.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">
            No saved jobs yet. Open <Link to="/jobs" className="text-[#0a66c2] hover:underline">Jobs</Link> and click Save.
          </p>
        ) : (
          <div className="mt-2 space-y-2">
            {savedJobs.map((job) => (
              <Link key={job.id} to="/jobs" className="block rounded-lg border border-slate-200 p-3 hover:bg-slate-50">
                <p className="font-semibold text-slate-900">{job.title}</p>
                <p className="text-sm text-slate-600">{job.company} • {job.location}</p>
                <p className="text-xs text-slate-500">Saved on {job.savedAt}</p>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

