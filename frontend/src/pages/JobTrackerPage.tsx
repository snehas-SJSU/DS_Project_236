import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, MoreHorizontal } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { MEMBER_ID } from '../lib/memberProfile';
import { readJson, SAVED_JOBS_KEY, writeJson } from '../lib/localData';
import { normalizeJobListRows } from '../lib/jobNormalize';
import { showToast } from '../lib/toast';

type SavedJob = {
  id: string;
  title: string;
  company: string;
  location: string;
  savedAt: string;
  saved_at?: string;
  source?: 'saved' | 'applied';
};

const JOB_NOTES_KEY = 'li_sim_job_tracker_notes';
const JOB_ARCHIVED_KEY = 'li_sim_job_tracker_archived';
type DateFilter = '24h' | 'week' | null;
type StageFilter = 'all' | 'submitted' | 'reviewing' | 'interview' | 'offer' | 'rejected';

export default function JobTrackerPage() {
  const navigate = useNavigate();
  const [applications, setApplications] = useState<any[]>([]);
  const [savedJobs, setSavedJobs] = useState<SavedJob[]>(() => readJson<SavedJob[]>(SAVED_JOBS_KEY, []));
  const [archivedJobIds, setArchivedJobIds] = useState<string[]>(() => readJson<string[]>(JOB_ARCHIVED_KEY, []));
  const [savedJobsLoading, setSavedJobsLoading] = useState(true);
  const [savedJobsError, setSavedJobsError] = useState('');
  const [appliedJobsLoading, setAppliedJobsLoading] = useState(false);
  const [connectionCount, setConnectionCount] = useState(0);
  const [connectionIds, setConnectionIds] = useState<string[]>([]);
  const [connectionPeople, setConnectionPeople] = useState<Array<{ member_id: string; name: string; title: string }>>([]);
  const [connectionsOpen, setConnectionsOpen] = useState(false);
  const [jobNotes, setJobNotes] = useState<Record<string, string>>(() => readJson<Record<string, string>>(JOB_NOTES_KEY, {}));
  const [noteEditorJob, setNoteEditorJob] = useState<SavedJob | null>(null);
  const [noteDraft, setNoteDraft] = useState('');
  const [applyBusyJobId, setApplyBusyJobId] = useState<string | null>(null);
  const [dateFilterOpen, setDateFilterOpen] = useState(false);
  const [dateFilterDraft, setDateFilterDraft] = useState<DateFilter>(null);
  const [dateFilter, setDateFilter] = useState<DateFilter>(null);
  const [stageFilter, setStageFilter] = useState<StageFilter>('all');
  const [rowMenuJobId, setRowMenuJobId] = useState<string | null>(null);

  useEffect(() => {
    setSavedJobsLoading(true);
    setSavedJobsError('');
    fetch('/api/jobs/saved', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ member_id: MEMBER_ID, limit: 100 })
    })
      .then((res) => res.json().then((data) => ({ ok: res.ok, data })))
      .then(({ ok, data }) => {
        if (!ok) {
          setSavedJobsError('Could not load saved jobs right now.');
          setSavedJobs([]);
          return;
        }
        const rows = normalizeJobListRows(Array.isArray(data) ? data : []).map((job, index) => ({
          ...job,
          saved_at: Array.isArray(data) && data[index] ? data[index].saved_at : undefined,
          source: 'saved' as const,
          savedAt: Array.isArray(data) && data[index]?.saved_at
            ? new Date(data[index].saved_at).toLocaleDateString()
            : new Date().toLocaleDateString()
        })) as SavedJob[];
        setSavedJobs(rows);
        writeJson(
          SAVED_JOBS_KEY,
          rows.map((job) => ({
            id: job.id,
            title: job.title,
            company: job.company,
            location: job.location,
            savedAt: job.savedAt
          }))
        );
      })
      .catch(() => {
        setSavedJobsError('Could not load saved jobs right now.');
        setSavedJobs([]);
      })
      .finally(() => setSavedJobsLoading(false));

    fetch('/api/applications/byMember', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ member_id: MEMBER_ID })
    })
      .then((res) => res.json())
      .then((data) => setApplications(Array.isArray(data) ? data : []))
      .catch(() => setApplications([]));

    fetch('/api/connections/list', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: MEMBER_ID })
    })
      .then((res) => res.json())
      .then((data) => {
        const ids = Array.isArray(data) ? data.map((x) => String(x)) : [];
        setConnectionCount(ids.length);
        setConnectionIds(ids);
      })
      .catch(() => {
        setConnectionCount(0);
        setConnectionIds([]);
      });
  }, []);

  useEffect(() => {
    const unsavedAppliedJobIds = Array.from(
      new Set(
        applications
          .map((app) => String(app?.job_id || '').trim())
          .filter((jobId) => jobId && !savedJobs.some((job) => job.id === jobId))
      )
    );

    if (!applications.length || !unsavedAppliedJobIds.length) return;

    setAppliedJobsLoading(true);
    Promise.all(
      unsavedAppliedJobIds.map(async (jobId) => {
        try {
          const res = await fetch('/api/jobs/get', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ job_id: jobId, member_id: MEMBER_ID })
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok || data?.error) return null;
          const rows = normalizeJobListRows([data]);
          const job = rows[0];
          if (!job) return null;
          return {
            id: job.id,
            title: job.title,
            company: job.company,
            location: job.location,
            source: 'applied' as const,
            savedAt: 'Applied job',
            saved_at: data?.created_at || undefined
          } satisfies SavedJob;
        } catch {
          return null;
        }
      })
    )
      .then((rows) => {
        const fetched = rows.filter(Boolean) as SavedJob[];
        if (!fetched.length) return;
        setSavedJobs((prev) => {
          const merged = [...prev];
          for (const row of fetched) {
            if (!merged.some((job) => job.id === row.id)) merged.push(row);
          }
          return merged;
        });
      })
      .finally(() => setAppliedJobsLoading(false));
  }, [applications, savedJobs]);

  useEffect(() => {
    if (!connectionsOpen) return;
    if (!connectionIds.length) {
      setConnectionPeople([]);
      return;
    }
    Promise.all(
      connectionIds.slice(0, 20).map(async (id) => {
        try {
          const r = await fetch('/api/members/get', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ member_id: id })
          });
          const d = await r.json().catch(() => ({}));
          if (!r.ok || d?.error) return null;
          return {
            member_id: id,
            name: String(d.name || id),
            title: String(d.headline || d.title || 'Professional in your network')
          };
        } catch {
          return null;
        }
      })
    )
      .then((rows) => setConnectionPeople(rows.filter(Boolean) as Array<{ member_id: string; name: string; title: string }>))
      .catch(() => setConnectionPeople([]));
  }, [connectionsOpen, connectionIds]);

  const grouped = useMemo(() => {
    const map = new Map<string, number>();
    applications.forEach((item) => {
      const key = String(item.status || 'submitted').toLowerCase();
      map.set(key, (map.get(key) || 0) + 1);
    });
    return Array.from(map.entries());
  }, [applications]);

  const countByStatus = (status: string) =>
    applications.filter((a) => String(a.status || '').toLowerCase() === status.toLowerCase()).length;

  const submittedCount = countByStatus('submitted');
  const inProgressCount =
    countByStatus('reviewing') + countByStatus('interview') + countByStatus('offer');
  const interviewCount = countByStatus('interview');
  const archivedCount = archivedJobIds.length;
  const actuallySavedCount = useMemo(
    () => savedJobs.filter((job) => job.source === 'saved').length,
    [savedJobs]
  );
  const appliedSet = useMemo(() => {
    const s = new Set<string>();
    for (const a of applications) {
      if (a?.job_id) s.add(String(a.job_id));
    }
    return s;
  }, [applications]);

  const parseSavedDate = (savedAt: string) => {
    const d = new Date(savedAt);
    if (!Number.isNaN(d.getTime())) return d;
    return null;
  };

  const visibleSavedJobs = useMemo(() => {
    const now = Date.now();
    return savedJobs.filter((j) => {
      if (archivedJobIds.includes(j.id)) return false;
      if (stageFilter !== 'all') {
        const status = String(applications.find((a) => String(a.job_id) === j.id)?.status || 'submitted').toLowerCase();
        if (status !== stageFilter) return false;
      }
      if (!dateFilter) return true;
      const d = parseSavedDate(j.savedAt);
      if (!d) return true;
      const age = now - d.getTime();
      if (dateFilter === '24h') return age <= 24 * 60 * 60 * 1000;
      if (dateFilter === 'week') return age <= 7 * 24 * 60 * 60 * 1000;
      return true;
    });
  }, [savedJobs, archivedJobIds, dateFilter, stageFilter, applications]);

  const openNoteEditor = (job: SavedJob) => {
    setNoteEditorJob(job);
    setNoteDraft(jobNotes[job.id] || '');
  };

  const saveNote = () => {
    if (!noteEditorJob) return;
    const next = { ...jobNotes, [noteEditorJob.id]: noteDraft.trim() };
    setJobNotes(next);
    localStorage.setItem(JOB_NOTES_KEY, JSON.stringify(next));
    setNoteEditorJob(null);
    showToast('Note saved.', 'success');
  };

  const applyFromTracker = async (job: SavedJob) => {
    if (appliedSet.has(job.id)) {
      showToast('Already applied to this job.', 'info');
      return;
    }
    setApplyBusyJobId(job.id);
    try {
      const res = await fetch('/api/applications/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ job_id: job.id, member_id: MEMBER_ID })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg =
          data.error === 'DUPLICATE_APPLICATION'
            ? 'Already applied to this job.'
            : data.error === 'JOB_CLOSED'
              ? 'This job is closed.'
              : 'Unable to apply right now.';
        showToast(msg, 'error');
        return;
      }
      setApplications((prev) => [
        ...prev,
        { job_id: job.id, member_id: MEMBER_ID, status: 'submitted' }
      ]);
      showToast('Application submitted.', 'success');
    } catch {
      showToast('Unable to apply right now.', 'error');
    } finally {
      setApplyBusyJobId(null);
    }
  };

  const persistSavedJobs = (next: SavedJob[]) => {
    setSavedJobs(next);
    writeJson(
      SAVED_JOBS_KEY,
      next.map((job) => ({
        id: job.id,
        title: job.title,
        company: job.company,
        location: job.location,
        savedAt: job.savedAt
      }))
    );
  };

  const unsaveJob = async (job: SavedJob) => {
    try {
      const res = await fetch('/api/jobs/unsave', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ job_id: job.id, member_id: MEMBER_ID })
      });
      if (!res.ok) {
        showToast('Unable to unsave right now.', 'error');
        return;
      }
      persistSavedJobs(savedJobs.filter((j) => j.id !== job.id));
      showToast('This job is no longer saved.', 'info');
    } catch {
      showToast('Unable to unsave right now.', 'error');
    }
  };

  const archiveJob = (job: SavedJob) => {
    const next = Array.from(new Set([...archivedJobIds, job.id]));
    setArchivedJobIds(next);
    writeJson(JOB_ARCHIVED_KEY, next);
    setRowMenuJobId(null);
    showToast('Job archived.', 'info');
  };

  const changeStage = async (job: SavedJob) => {
    const current = applications.find((a) => String(a.job_id) === job.id)?.status || 'submitted';
    const next = window.prompt('Set stage: submitted, reviewing, interview, offer, rejected', String(current));
    if (!next) return;
    const status = next.trim().toLowerCase();
    if (!['submitted', 'reviewing', 'interview', 'offer', 'rejected'].includes(status)) {
      showToast('Invalid stage.', 'error');
      return;
    }
    try {
      const app = applications.find((a) => String(a.job_id) === job.id);
      const applicationId = String(app?.application_id || app?.app_id || '').trim();
      if (!applicationId) {
        showToast('No application record found for this saved job.', 'error');
        return;
      }

      const res = await fetch('/api/applications/updateStatus', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ application_id: applicationId, status })
        });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast(data?.message || 'Unable to change stage right now.', 'error');
        return;
      }
      setApplications((prev) =>
        prev.map((a) => (String(a.job_id) === job.id ? { ...a, status } : a))
      );
      setRowMenuJobId(null);
      showToast(`Stage changed to ${status}.`, 'success');
    } catch {
      showToast('Unable to change stage right now.', 'error');
    }
  };

  const stageForJob = (jobId: string) =>
    String(applications.find((a) => String(a.job_id) === jobId)?.status || 'submitted').toLowerCase();

  return (
    <section className="li-card overflow-hidden p-0">
      <div className="border-b border-[#e0dfdc] px-5 py-4">
        <div className="mb-3 flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              if (window.history.length > 1) navigate(-1);
              else navigate('/jobs');
            }}
            className="inline-flex h-7 w-7 items-center justify-center rounded-full text-[#666] hover:bg-[#f3f2ef]"
            title="Back"
            aria-label="Back"
          >
            <ArrowLeft size={16} />
          </button>
          <h1 className="text-xl font-semibold text-[#191919]">Job tracker</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-[#057642] px-3 py-1 text-xs font-semibold text-white">
            Tracked {savedJobs.length > 0 ? `• ${savedJobs.length}` : ''}
          </span>
          <span className="rounded-full border border-[#d0d7de] px-3 py-1 text-xs font-semibold text-[#444]">
            Saved {actuallySavedCount > 0 ? `• ${actuallySavedCount}` : ''}
          </span>
          <span className="rounded-full border border-[#d0d7de] px-3 py-1 text-xs font-semibold text-[#444]">
            In progress {inProgressCount > 0 ? `• ${inProgressCount}` : ''}
          </span>
          <span className="rounded-full border border-[#d0d7de] px-3 py-1 text-xs font-semibold text-[#444]">
            Applied {submittedCount > 0 ? `• ${submittedCount}` : ''}
          </span>
          <span className="rounded-full border border-[#d0d7de] px-3 py-1 text-xs font-semibold text-[#444]">
            Interview {interviewCount > 0 ? `• ${interviewCount}` : ''}
          </span>
          <span className="rounded-full border border-[#d0d7de] px-3 py-1 text-xs font-semibold text-[#444]">
            Archived {archivedCount > 0 ? `• ${archivedCount}` : ''}
          </span>
          <div className="relative ml-auto">
            <button
              type="button"
              onClick={() => setDateFilterOpen((v) => !v)}
              className="rounded-full border border-[#d0d7de] px-3 py-1 text-xs font-semibold text-[#444] hover:bg-[#f3f2ef]"
            >
              Date posted {dateFilter ? `(${dateFilter === '24h' ? 'Past 24 hours' : 'Past week'})` : ''}
            </button>
            {dateFilterOpen ? (
              <div className="absolute right-0 top-8 z-20 w-52 rounded-md border border-[#e0dfdc] bg-white p-2 shadow-lg">
                <p className="px-1 pb-1 text-xs font-semibold text-[#444]">Date posted</p>
                <label className="flex items-center justify-between px-1 py-1 text-xs text-[#444]">
                  Past 24 hours
                  <input
                    type="radio"
                    name="datePostedFilter"
                    checked={dateFilterDraft === '24h'}
                    onChange={() => setDateFilterDraft('24h')}
                  />
                </label>
                <label className="flex items-center justify-between px-1 py-1 text-xs text-[#444]">
                  Past week
                  <input
                    type="radio"
                    name="datePostedFilter"
                    checked={dateFilterDraft === 'week'}
                    onChange={() => setDateFilterDraft('week')}
                  />
                </label>
                <div className="mt-2 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    className="text-xs text-[#666] hover:underline"
                    onClick={() => {
                      setDateFilterDraft(null);
                      setDateFilter(null);
                      setDateFilterOpen(false);
                    }}
                  >
                    Clear
                  </button>
                  <button
                    type="button"
                    className="rounded-full bg-[#0a66c2] px-3 py-1 text-xs font-semibold text-white"
                    onClick={() => {
                      setDateFilter(dateFilterDraft);
                      setDateFilterOpen(false);
                    }}
                  >
                    Apply
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div className="px-5 py-3">
        <div className="grid grid-cols-[minmax(0,1fr)_90px_120px_90px] gap-3 border-b border-[#e0dfdc] pb-2 text-xs font-semibold text-[#666]">
          <span>Jobs</span>
          <span>Connections</span>
          <span>Notes</span>
          <span className="text-right">Action</span>
        </div>

        {savedJobsLoading || appliedJobsLoading ? (
          <div className="py-8 text-center">
            <p className="text-sm text-[#666]">Loading your tracked jobs...</p>
          </div>
        ) : savedJobsError ? (
          <div className="py-8 text-center">
            <p className="text-sm text-[#9f2d2d]">{savedJobsError}</p>
          </div>
        ) : visibleSavedJobs.length === 0 ? (
          <div className="py-8 text-center">
            <p className="text-sm text-[#666]">Not seeing some jobs?</p>
            <Link to="/jobs" className="mt-2 inline-block text-sm font-semibold text-[#0a66c2] hover:underline">
              Find jobs
            </Link>
          </div>
        ) : (
          <div>
            {visibleSavedJobs.map((job) => (
              <div key={job.id} className="grid grid-cols-[minmax(0,1fr)_90px_120px_90px] gap-3 border-b border-[#f0efed] py-3">
                <div className="min-w-0">
                  <p className="line-clamp-2 text-sm font-semibold text-[#191919]">{job.title}</p>
                  <p className="text-xs text-[#666]">
                    {job.company} · {job.location}
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <p className="text-[11px] text-[#8a8a8a]">
                      {job.source === 'saved' ? `Saved on ${job.savedAt}` : 'Tracked from application'}
                    </p>
                    <span className="rounded-full bg-[#eef3f8] px-2 py-0.5 text-[11px] font-semibold capitalize text-[#0a66c2]">
                      {stageForJob(job.id)}
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setConnectionsOpen(true)}
                  className="flex items-center text-xs text-[#666] hover:text-[#0a66c2] hover:underline"
                >
                  {connectionCount > 0 ? `+${connectionCount}` : '0'}
                </button>
                <button
                  type="button"
                  onClick={() => openNoteEditor(job)}
                  className="flex items-center text-left text-xs text-[#666] hover:text-[#0a66c2]"
                >
                  {jobNotes[job.id]?.trim() ? 'View / Edit note' : '+ Add note'}
                </button>
                <div className="flex items-center justify-end">
                  <div className="relative flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => applyFromTracker(job)}
                      disabled={applyBusyJobId === job.id || appliedSet.has(job.id)}
                      className="rounded-full border border-[#0a66c2] px-3 py-1 text-xs font-semibold text-[#0a66c2] hover:bg-[#edf3f8] disabled:cursor-not-allowed disabled:border-[#9ec6e5] disabled:text-[#9ec6e5]"
                    >
                      {appliedSet.has(job.id) ? 'Applied' : applyBusyJobId === job.id ? 'Applying...' : 'Apply'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setRowMenuJobId((id) => (id === job.id ? null : job.id))}
                      className="rounded-full p-1 text-[#666] hover:bg-[#f3f2ef]"
                      aria-label="Job actions"
                    >
                      <MoreHorizontal size={15} />
                    </button>
                    {rowMenuJobId === job.id ? (
                      <div className="absolute right-0 top-8 z-20 w-36 rounded-md border border-[#e0dfdc] bg-white py-1 shadow-lg">
                        <button
                          type="button"
                          onClick={() => changeStage(job)}
                          className="block w-full px-3 py-1.5 text-left text-xs text-[#191919] hover:bg-[#f3f2ef]"
                        >
                          Change stage
                        </button>
                        <button
                          type="button"
                          onClick={() => archiveJob(job)}
                          className="block w-full px-3 py-1.5 text-left text-xs text-[#191919] hover:bg-[#f3f2ef]"
                        >
                          Archive
                        </button>
                        <button
                          type="button"
                          onClick={() => unsaveJob(job)}
                          className="block w-full px-3 py-1.5 text-left text-xs text-[#191919] hover:bg-[#f3f2ef]"
                        >
                          Unsave
                        </button>
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="border-t border-[#e0dfdc] px-5 py-3">
        {grouped.length === 0 ? (
          <p className="text-xs text-[#666]">No application status yet.</p>
        ) : (
          <div className="flex flex-wrap gap-2 text-xs">
            <button
              type="button"
              onClick={() => setStageFilter('all')}
              className={`rounded-full px-2.5 py-1 ${
                stageFilter === 'all' ? 'bg-[#0a66c2] font-semibold text-white' : 'bg-[#f3f2ef] text-[#555]'
              }`}
            >
              all
            </button>
            {grouped.map(([status, count]) => (
              <button
                key={status}
                type="button"
                onClick={() => setStageFilter(status as StageFilter)}
                className={`rounded-full px-2.5 py-1 ${
                  stageFilter === status ? 'bg-[#0a66c2] font-semibold text-white' : 'bg-[#f3f2ef] text-[#555]'
                }`}
              >
                {status}: {count}
              </button>
            ))}
          </div>
        )}
      </div>
      {noteEditorJob ? (
        <div
          className="fixed inset-0 z-[150] flex items-start justify-center bg-black/45 p-4 pt-20"
          onClick={(e) => {
            if (e.target === e.currentTarget) setNoteEditorJob(null);
          }}
        >
          <div className="w-full max-w-md rounded-lg bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-[#e0dfdc] px-4 py-3">
              <h3 className="text-base font-semibold text-[#191919]">Notes</h3>
              <button
                type="button"
                onClick={() => setNoteEditorJob(null)}
                className="rounded p-1 text-slate-500 hover:bg-slate-100"
                aria-label="Close notes editor"
              >
                ×
              </button>
            </div>
            <div className="space-y-2 px-4 py-3">
              <p className="text-sm font-semibold text-[#191919]">{noteEditorJob.title}</p>
              <p className="text-xs text-[#666]">{noteEditorJob.company} · {noteEditorJob.location}</p>
              <textarea
                value={noteDraft}
                onChange={(e) => setNoteDraft(e.target.value)}
                placeholder="Add a quick note..."
                rows={4}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div className="flex justify-end gap-2 border-t border-[#e0dfdc] px-4 py-3">
              <button
                type="button"
                onClick={() => setNoteEditorJob(null)}
                className="rounded-md border border-slate-300 px-3 py-1.5 text-sm"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={saveNote}
                className="rounded-md bg-[#0a66c2] px-3 py-1.5 text-sm font-semibold text-white hover:bg-[#004182]"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {connectionsOpen ? (
        <div
          className="fixed inset-0 z-[160] flex items-start justify-center bg-black/45 p-4 pt-16"
          onClick={(e) => {
            if (e.target === e.currentTarget) setConnectionsOpen(false);
          }}
        >
          <div className="w-full max-w-md rounded-lg bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-[#e0dfdc] px-4 py-3">
              <h3 className="text-base font-semibold text-[#191919]">In your network</h3>
              <button
                type="button"
                onClick={() => setConnectionsOpen(false)}
                className="rounded p-1 text-slate-500 hover:bg-slate-100"
                aria-label="Close connections modal"
              >
                ×
              </button>
            </div>
            <div className="max-h-[60vh] overflow-y-auto px-4 py-3">
              {connectionPeople.length === 0 ? (
                <p className="text-sm text-[#666]">No connections found.</p>
              ) : (
                <div className="space-y-3">
                  {connectionPeople.map((p) => (
                    <div key={p.member_id} className="flex items-center gap-3">
                      <div className="h-9 w-9 rounded-full bg-slate-200" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-[#191919]">{p.name}</p>
                        <p className="truncate text-xs text-[#666]">{p.title}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => showToast(`Connection viewed: ${p.name}`, 'info')}
                        className="rounded-full border border-[#d0d7de] px-3 py-1 text-xs font-semibold text-[#444] hover:bg-[#f3f2ef]"
                      >
                        Connect
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
