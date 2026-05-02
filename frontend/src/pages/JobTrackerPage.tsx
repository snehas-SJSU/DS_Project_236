import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, ExternalLink, Lock, MoreHorizontal } from 'lucide-react';
import { getCurrentMemberId } from '../lib/auth';
import { MEMBER_ID } from '../lib/memberProfile';
import { jobsResultsPath } from '../lib/jobRoutes';
import { showToast } from '../lib/toast';

const viewerMemberId = getCurrentMemberId() || MEMBER_ID;

type TrackedJob = {
  id: string;
  title: string;
  company: string;
  location: string;
  salary?: string;
  type?: string;
  status?: string;
  saved_at?: string | null;
  applied_at?: string | null;
  created_at?: string | null;
  application_id?: string | null;
  stage: string;
  note?: string;
  archived?: boolean;
  source: 'saved' | 'applied';
};

type PremiumStatus = {
  is_active: boolean;
  plan_name?: string | null;
};

type DateFilter = '24h' | 'week' | null;
type StageFilter = 'all' | 'saved' | 'submitted' | 'reviewing' | 'interview' | 'offer' | 'rejected' | 'archived';

function displayDate(job: TrackedJob) {
  const iso = job.saved_at || job.applied_at || job.created_at;
  if (!iso) return 'recently';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? 'recently' : d.toLocaleDateString();
}

function parseStage(job: TrackedJob) {
  return String(job.stage || (job.source === 'saved' ? 'saved' : 'submitted')).toLowerCase();
}

export default function JobTrackerPage() {
  const navigate = useNavigate();
  const [trackedJobs, setTrackedJobs] = useState<TrackedJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [applyBusyJobId, setApplyBusyJobId] = useState<string | null>(null);
  const [connectionCount, setConnectionCount] = useState(0);
  const [connectionIds, setConnectionIds] = useState<string[]>([]);
  const [connectionPeople, setConnectionPeople] = useState<Array<{ member_id: string; name: string; title: string }>>([]);
  const [connectionsOpen, setConnectionsOpen] = useState(false);
  const [noteEditorJob, setNoteEditorJob] = useState<TrackedJob | null>(null);
  const [noteDraft, setNoteDraft] = useState('');
  const [dateFilter, setDateFilter] = useState<DateFilter>(null);
  const [dateFilterDraft, setDateFilterDraft] = useState<DateFilter>(null);
  const [dateFilterOpen, setDateFilterOpen] = useState(false);
  const [stageFilter, setStageFilter] = useState<StageFilter>('all');
  const [rowMenuJobId, setRowMenuJobId] = useState<string | null>(null);
  const [premium, setPremium] = useState<PremiumStatus>({ is_active: false });

  const refreshTracker = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/jobs/tracker', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ member_id: viewerMemberId })
      });
      const data = await res.json().catch(() => []);
      if (!res.ok) {
        setError('Could not load your tracked jobs right now.');
        setTrackedJobs([]);
        return;
      }
      setTrackedJobs(Array.isArray(data) ? data : []);
    } catch {
      setError('Could not load your tracked jobs right now.');
      setTrackedJobs([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshTracker().catch(() => undefined);
    fetch('/api/connections/list', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: viewerMemberId })
    })
      .then((res) => res.json())
      .then((data) => {
        const ids = Array.isArray(data) ? data.map((x) => String(x)) : [];
        setConnectionIds(ids);
        setConnectionCount(ids.length);
      })
      .catch(() => {
        setConnectionIds([]);
        setConnectionCount(0);
      });
    fetch('/api/members/premium/status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ member_id: viewerMemberId })
    })
      .then((res) => res.json())
      .then((data) => setPremium({ is_active: Boolean(data?.is_active), plan_name: data?.plan_name || null }))
      .catch(() => setPremium({ is_active: false }));
  }, []);

  useEffect(() => {
    if (!connectionsOpen || !connectionIds.length) {
      if (!connectionIds.length) setConnectionPeople([]);
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
    trackedJobs.forEach((job) => {
      const key = job.archived ? 'archived' : parseStage(job);
      map.set(key, (map.get(key) || 0) + 1);
    });
    return Array.from(map.entries());
  }, [trackedJobs]);

  const actuallySavedCount = useMemo(
    () => trackedJobs.filter((job) => job.source === 'saved' && !job.archived).length,
    [trackedJobs]
  );
  const inProgressCount = useMemo(
    () => trackedJobs.filter((job) => ['reviewing', 'interview', 'offer'].includes(parseStage(job)) && !job.archived).length,
    [trackedJobs]
  );
  const appliedCount = useMemo(
    () => trackedJobs.filter((job) => parseStage(job) === 'submitted' && !job.archived).length,
    [trackedJobs]
  );
  const interviewCount = useMemo(
    () => trackedJobs.filter((job) => parseStage(job) === 'interview' && !job.archived).length,
    [trackedJobs]
  );
  const archivedCount = useMemo(
    () => trackedJobs.filter((job) => job.archived).length,
    [trackedJobs]
  );

  const premiumInsight = useMemo(() => {
    const nextFollowUp = trackedJobs.find((job) => !job.archived && ['submitted', 'reviewing'].includes(parseStage(job)));
    if (nextFollowUp) {
      return `Follow up on ${nextFollowUp.title} at ${nextFollowUp.company}.`;
    }
    const nextSaved = trackedJobs.find((job) => !job.archived && parseStage(job) === 'saved');
    if (nextSaved) {
      return `Revisit ${nextSaved.title} and decide whether to apply.`;
    }
    return 'Your tracker is clear right now. Keep saving jobs you want to revisit.';
  }, [trackedJobs]);

  const visibleTrackedJobs = useMemo(() => {
    const now = Date.now();
    return trackedJobs.filter((job) => {
      const archived = Boolean(job.archived);
      if (stageFilter === 'archived') {
        if (!archived) return false;
      } else {
        if (archived) return false;
        if (stageFilter !== 'all' && parseStage(job) !== stageFilter) return false;
      }
      if (!dateFilter) return true;
      const d = new Date(job.saved_at || job.applied_at || job.created_at || '');
      if (Number.isNaN(d.getTime())) return true;
      const age = now - d.getTime();
      if (dateFilter === '24h') return age <= 24 * 60 * 60 * 1000;
      if (dateFilter === 'week') return age <= 7 * 24 * 60 * 60 * 1000;
      return true;
    });
  }, [trackedJobs, stageFilter, dateFilter]);

  const openNoteEditor = (job: TrackedJob) => {
    setNoteEditorJob(job);
    setNoteDraft(job.note || '');
  };

  const saveNote = async () => {
    if (!noteEditorJob) return;
    try {
      const res = await fetch('/api/jobs/tracker/note', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ member_id: viewerMemberId, job_id: noteEditorJob.id, note: noteDraft })
      });
      if (!res.ok) {
        showToast('Unable to save note right now.', 'error');
        return;
      }
      setTrackedJobs((prev) => prev.map((job) => (job.id === noteEditorJob.id ? { ...job, note: noteDraft } : job)));
      setNoteEditorJob(null);
      showToast('Note saved.', 'success');
    } catch {
      showToast('Unable to save note right now.', 'error');
    }
  };

  const applyFromTracker = async (job: TrackedJob) => {
    if (job.application_id) {
      showToast('Already applied to this job.', 'info');
      return;
    }
    setApplyBusyJobId(job.id);
    try {
      const res = await fetch('/api/applications/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ job_id: job.id, member_id: viewerMemberId })
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
      await refreshTracker();
      showToast('Application submitted.', 'success');
    } catch {
      showToast('Unable to apply right now.', 'error');
    } finally {
      setApplyBusyJobId(null);
    }
  };

  const unsaveJob = async (job: TrackedJob) => {
    try {
      const res = await fetch('/api/jobs/unsave', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ job_id: job.id, member_id: viewerMemberId })
      });
      if (!res.ok) {
        showToast('Unable to unsave right now.', 'error');
        return;
      }
      await refreshTracker();
      showToast('This job is no longer saved.', 'info');
    } catch {
      showToast('Unable to unsave right now.', 'error');
    }
  };

  const archiveJob = async (job: TrackedJob, archived: boolean) => {
    try {
      const res = await fetch('/api/jobs/tracker/archive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ member_id: viewerMemberId, job_id: job.id, archived })
      });
      if (!res.ok) {
        showToast(`Unable to ${archived ? 'archive' : 'restore'} right now.`, 'error');
        return;
      }
      setTrackedJobs((prev) => prev.map((row) => (row.id === job.id ? { ...row, archived } : row)));
      setRowMenuJobId(null);
      showToast(archived ? 'Job archived.' : 'Job restored.', 'success');
    } catch {
      showToast(`Unable to ${archived ? 'archive' : 'restore'} right now.`, 'error');
    }
  };

  const changeStage = async (job: TrackedJob) => {
    if (!job.application_id) {
      showToast('Apply first before changing the stage.', 'info');
      return;
    }
    const next = window.prompt('Set stage: submitted, reviewing, interview, offer, rejected', parseStage(job));
    if (!next) return;
    const status = next.trim().toLowerCase();
    if (!['submitted', 'reviewing', 'interview', 'offer', 'rejected'].includes(status)) {
      showToast('Invalid stage.', 'error');
      return;
    }
    try {
      const res = await fetch('/api/applications/updateStatus', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ application_id: job.application_id, status })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast(data?.message || 'Unable to change stage right now.', 'error');
        return;
      }
      setTrackedJobs((prev) => prev.map((row) => (row.id === job.id ? { ...row, stage: status } : row)));
      setRowMenuJobId(null);
      showToast(`Stage changed to ${status}.`, 'success');
    } catch {
      showToast('Unable to change stage right now.', 'error');
    }
  };

  return (
    <section className="space-y-3">
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
              Tracked {trackedJobs.length > 0 ? `• ${trackedJobs.length}` : ''}
            </span>
            <span className="rounded-full border border-[#d0d7de] px-3 py-1 text-xs font-semibold text-[#444]">
              Saved {actuallySavedCount > 0 ? `• ${actuallySavedCount}` : ''}
            </span>
            <span className="rounded-full border border-[#d0d7de] px-3 py-1 text-xs font-semibold text-[#444]">
              In progress {inProgressCount > 0 ? `• ${inProgressCount}` : ''}
            </span>
            <span className="rounded-full border border-[#d0d7de] px-3 py-1 text-xs font-semibold text-[#444]">
              Applied {appliedCount > 0 ? `• ${appliedCount}` : ''}
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
      </section>

      <section className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_280px]">
        <section className="li-card overflow-hidden p-0">
          <div className="px-5 py-3">
            <div className="grid grid-cols-[minmax(0,1fr)_90px_120px_120px] gap-3 border-b border-[#e0dfdc] pb-2 text-xs font-semibold text-[#666]">
              <span>Jobs</span>
              <span>Connections</span>
              <span>Notes</span>
              <span className="text-right">Action</span>
            </div>

            {loading ? (
              <div className="py-8 text-center text-sm text-[#666]">Loading your tracked jobs...</div>
            ) : error ? (
              <div className="py-8 text-center text-sm text-[#9f2d2d]">{error}</div>
            ) : visibleTrackedJobs.length === 0 ? (
              <div className="py-8 text-center">
                <p className="text-sm text-[#666]">Not seeing some jobs?</p>
                <Link to="/jobs" className="mt-2 inline-block text-sm font-semibold text-[#0a66c2] hover:underline">
                  Find jobs
                </Link>
              </div>
            ) : (
              <div>
                {visibleTrackedJobs.map((job) => (
                  <div key={job.id} className="grid grid-cols-[minmax(0,1fr)_90px_120px_120px] gap-3 border-b border-[#f0efed] py-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link to={jobsResultsPath(job.id)} className="line-clamp-2 text-sm font-semibold text-[#191919] hover:text-[#0a66c2] hover:underline">
                          {job.title}
                        </Link>
                        <a href={jobsResultsPath(job.id)} className="inline-flex text-[#666] hover:text-[#0a66c2]" aria-label="Open job">
                          <ExternalLink size={14} />
                        </a>
                      </div>
                      <p className="text-xs text-[#666]">
                        {job.company} · {job.location}
                      </p>
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        <p className="text-[11px] text-[#8a8a8a]">
                          {job.source === 'saved' ? `Saved on ${displayDate(job)}` : `Applied on ${displayDate(job)}`}
                        </p>
                        <span className="rounded-full bg-[#eef3f8] px-2 py-0.5 text-[11px] font-semibold capitalize text-[#0a66c2]">
                          {job.archived ? 'archived' : parseStage(job)}
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
                      {job.note?.trim() ? 'View / Edit note' : '+ Add note'}
                    </button>
                    <div className="flex items-center justify-end">
                      <div className="relative flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => applyFromTracker(job)}
                          disabled={applyBusyJobId === job.id || Boolean(job.application_id) || Boolean(job.archived)}
                          className="rounded-full border border-[#0a66c2] px-3 py-1 text-xs font-semibold text-[#0a66c2] hover:bg-[#edf3f8] disabled:cursor-not-allowed disabled:border-[#9ec6e5] disabled:text-[#9ec6e5]"
                        >
                          {job.application_id ? 'Applied' : applyBusyJobId === job.id ? 'Applying...' : 'Apply'}
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
                          <div className="absolute right-0 top-8 z-20 w-40 rounded-md border border-[#e0dfdc] bg-white py-1 shadow-lg">
                            <button
                              type="button"
                              onClick={() => changeStage(job)}
                              className="block w-full px-3 py-1.5 text-left text-xs text-[#191919] hover:bg-[#f3f2ef]"
                            >
                              Change stage
                            </button>
                            <button
                              type="button"
                              onClick={() => archiveJob(job, !job.archived)}
                              className="block w-full px-3 py-1.5 text-left text-xs text-[#191919] hover:bg-[#f3f2ef]"
                            >
                              {job.archived ? 'Restore' : 'Archive'}
                            </button>
                            {job.source === 'saved' ? (
                              <button
                                type="button"
                                onClick={() => unsaveJob(job)}
                                className="block w-full px-3 py-1.5 text-left text-xs text-[#191919] hover:bg-[#f3f2ef]"
                              >
                                Unsave
                              </button>
                            ) : null}
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
            <div className="flex flex-wrap gap-2 text-xs">
              <button
                type="button"
                onClick={() => setStageFilter('all')}
                className={`rounded-full px-2.5 py-1 ${stageFilter === 'all' ? 'bg-[#0a66c2] font-semibold text-white' : 'bg-[#f3f2ef] text-[#555]'}`}
              >
                all
              </button>
              {grouped.map(([status, count]) => (
                <button
                  key={status}
                  type="button"
                  onClick={() => setStageFilter(status as StageFilter)}
                  className={`rounded-full px-2.5 py-1 ${stageFilter === status ? 'bg-[#0a66c2] font-semibold text-white' : 'bg-[#f3f2ef] text-[#555]'}`}
                >
                  {status}: {count}
                </button>
              ))}
            </div>
          </div>
        </section>

        <aside className="space-y-3">
          <section className="li-card p-4">
            <p className="text-sm font-semibold text-[#191919]">Tracker summary</p>
            <div className="mt-3 space-y-2 text-sm text-[#555]">
              <p>{trackedJobs.filter((job) => !job.archived).length} active opportunities</p>
              <p>{trackedJobs.filter((job) => Boolean(job.note?.trim())).length} jobs with notes</p>
              <p>{trackedJobs.filter((job) => Boolean(job.application_id)).length} applied jobs</p>
            </div>
          </section>
          <section className="li-card p-4">
            {premium.is_active ? (
              <>
                <p className="text-sm font-semibold text-[#191919]">{premium.plan_name || 'Premium'} insight</p>
                <p className="mt-2 text-sm text-[#555]">{premiumInsight}</p>
                <Link to="/premium" className="mt-3 inline-block text-sm font-semibold text-[#0a66c2] hover:underline">
                  Manage Premium
                </Link>
              </>
            ) : (
              <>
                <div className="flex items-center gap-2 text-sm font-semibold text-[#191919]">
                  <Lock size={15} />
                  Premium insight locked
                </div>
                <p className="mt-2 text-sm text-[#555]">Unlock follow-up recommendations and priority tracker guidance with Premium.</p>
                <Link to="/premium" className="mt-3 inline-block rounded-full border border-[#0a66c2] px-4 py-1.5 text-sm font-semibold text-[#0a66c2] hover:bg-[#edf3f8]">
                  Try Premium
                </Link>
              </>
            )}
          </section>
        </aside>
      </section>

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
                      <Link
                        to={`/profile/${encodeURIComponent(p.member_id)}`}
                        className="rounded-full border border-[#d0d7de] px-3 py-1 text-xs font-semibold text-[#444] hover:bg-[#f3f2ef]"
                      >
                        View
                      </Link>
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
