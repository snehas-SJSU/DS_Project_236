import { BookmarkCheck, ExternalLink, MapPin, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { getCurrentMemberId } from '../lib/auth';
import { MEMBER_ID } from '../lib/memberProfile';
import { jobsResultsPath } from '../lib/jobRoutes';
import { readJson, SAVED_JOBS_KEY, writeJson } from '../lib/localData';
import { normalizeJobListRows } from '../lib/jobNormalize';
import { showToast } from '../lib/toast';

const viewerMemberId = getCurrentMemberId() || MEMBER_ID;

type SavedJob = {
  id: string;
  title: string;
  company: string;
  location: string;
  salary?: string;
  type?: string;
  skills?: string[];
  saved_at?: string;
  applicants?: number;
  status?: string;
};

export default function SavedItemsPage() {
  const [savedJobs, setSavedJobs] = useState<SavedJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [removingId, setRemovingId] = useState('');

  const fetchSavedJobs = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/jobs/saved', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ member_id: viewerMemberId, limit: 100 })
      });
      const data = await res.json().catch(() => []);
      if (!res.ok) {
        setError('Could not load saved jobs right now.');
        setSavedJobs([]);
        return;
      }
      const rows = normalizeJobListRows(Array.isArray(data) ? data : []).map((job, index) => ({
        ...job,
        saved_at: Array.isArray(data) && data[index] ? data[index].saved_at : undefined
      }));
      setSavedJobs(rows);
      writeJson(
        SAVED_JOBS_KEY,
        rows.map((job) => ({
          id: job.id,
          title: job.title,
          company: job.company,
          location: job.location,
          savedAt: job.saved_at ? new Date(job.saved_at).toLocaleDateString() : new Date().toLocaleDateString()
        }))
      );
    } catch {
      setError('Could not load saved jobs right now.');
      setSavedJobs([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSavedJobs().catch(() => undefined);
  }, []);

  const localSavedCount = useMemo(() => readJson<any[]>(SAVED_JOBS_KEY, []).length, []);

  const unsaveJob = async (jobId: string) => {
    setRemovingId(jobId);
    try {
      const res = await fetch('/api/jobs/unsave', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ job_id: jobId, member_id: viewerMemberId })
      });
      if (!res.ok) {
        showToast('Unable to remove this saved job right now.', 'error');
        return;
      }
      const next = savedJobs.filter((job) => job.id !== jobId);
      setSavedJobs(next);
      writeJson(
        SAVED_JOBS_KEY,
        readJson<any[]>(SAVED_JOBS_KEY, []).filter((job) => job.id !== jobId)
      );
      showToast('Removed from saved jobs.', 'info');
    } catch {
      showToast('Unable to remove this saved job right now.', 'error');
    } finally {
      setRemovingId('');
    }
  };

  return (
    <div className="space-y-4">
      <div className="li-card overflow-hidden p-0">
        <div className="border-b border-[#e0dfdc] bg-gradient-to-r from-[#0a66c2] to-[#378fe9] px-5 py-5 text-white">
          <div className="flex items-start gap-3">
            <div className="rounded-2xl bg-white/15 p-3">
              <BookmarkCheck className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold">Saved jobs</h1>
              <p className="mt-1 text-sm text-white/85">
                Keep track of opportunities you want to revisit, compare, and apply to.
              </p>
            </div>
          </div>
        </div>
        <div className="grid gap-3 px-5 py-4 sm:grid-cols-3">
          <div className="rounded-xl bg-[#f3f6f8] p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#526a6e]">Saved now</p>
            <p className="mt-2 text-3xl font-semibold text-[#191919]">{savedJobs.length}</p>
          </div>
          <div className="rounded-xl bg-[#f3f6f8] p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#526a6e]">Ready to apply</p>
            <p className="mt-2 text-3xl font-semibold text-[#191919]">{savedJobs.filter((job) => job.status !== 'closed').length}</p>
          </div>
          <div className="rounded-xl bg-[#f3f6f8] p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#526a6e]">Local cache</p>
            <p className="mt-2 text-3xl font-semibold text-[#191919]">{localSavedCount}</p>
          </div>
        </div>
      </div>

      <div className="li-card p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-[#191919]">Your saved list</h2>
            <p className="mt-1 text-sm text-[#666666]">Server-backed and synced with your current account.</p>
          </div>
          <button
            type="button"
            onClick={() => fetchSavedJobs().catch(() => undefined)}
            className="li-btn-secondary px-4 py-2"
          >
            Refresh
          </button>
        </div>

        {loading ? (
          <div className="mt-6 rounded-2xl border border-dashed border-[#d0d7de] px-5 py-10 text-center text-sm text-[#666666]">
            Loading saved jobs...
          </div>
        ) : error ? (
          <div className="mt-6 rounded-2xl border border-[#f0c7c7] bg-[#fff6f6] px-5 py-4 text-sm text-[#9f2d2d]">
            {error}
          </div>
        ) : savedJobs.length === 0 ? (
          <div className="mt-6 rounded-2xl border border-dashed border-[#d0d7de] px-5 py-10 text-center">
            <p className="text-base font-semibold text-[#191919]">No saved jobs yet</p>
            <p className="mt-2 text-sm text-[#666666]">
              Browse <Link to="/jobs" className="font-semibold text-[#0a66c2] hover:underline">Jobs</Link> and use Save on anything you want to revisit.
            </p>
          </div>
        ) : (
          <div className="mt-5 space-y-3">
            {savedJobs.map((job) => (
              <div key={job.id} className="rounded-2xl border border-[#e0dfdc] p-4 transition-colors hover:bg-[#fbfbfa]">
                <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                  <div className="min-w-0">
                    <Link to={jobsResultsPath(job.id)} className="text-xl font-semibold text-[#0a66c2] hover:underline">
                      {job.title}
                    </Link>
                    <p className="mt-1 text-sm font-medium text-[#444444]">{job.company}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-[#666666]">
                      <span className="inline-flex items-center gap-1">
                        <MapPin className="h-4 w-4" />
                        {job.location || 'Location not listed'}
                      </span>
                      {job.type ? <span>{job.type}</span> : null}
                      {job.salary ? <span>{job.salary}</span> : null}
                      <span>
                        Saved {job.saved_at ? new Date(job.saved_at).toLocaleDateString() : 'recently'}
                      </span>
                    </div>
                    {job.skills?.length ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {job.skills.slice(0, 5).map((skill) => (
                          <span key={skill} className="rounded-full bg-[#eef3f8] px-3 py-1 text-xs font-semibold text-[#44546a]">
                            {skill}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Link to={jobsResultsPath(job.id)} className="li-btn-primary px-4 py-2">
                      <ExternalLink className="mr-1 h-4 w-4" />
                      Open
                    </Link>
                    <button
                      type="button"
                      onClick={() => unsaveJob(job.id)}
                      disabled={removingId === job.id}
                      className="inline-flex items-center justify-center rounded-full border border-[#8c8c8c] px-4 py-2 text-sm font-semibold text-[#444444] hover:bg-[#f3f6f8] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <Trash2 className="mr-1 h-4 w-4" />
                      {removingId === job.id ? 'Removing...' : 'Unsave'}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
