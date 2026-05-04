import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import { AlertTriangle, Check, Loader2, Send, Sparkles, Users } from 'lucide-react';
import {
  AITask,
  CandidateMatch,
  TaskState,
  aiApi,
  connectTaskWebSocket,
} from '../../lib/aiApi';
import { getViewerRecruiterId } from '../../lib/memberProfile';
import { showToast } from '../../lib/toast';

function idFromMatch(c: CandidateMatch): string {
  return String(c.candidate_id || (c as { member_id?: string }).member_id || '').trim();
}

function isTerminal(state: TaskState): boolean {
  return state === 'completed' || state === 'failed' || state === 'rejected';
}

export default function RecruiterAiJobPanel({
  jobId,
  canManage = false
}: {
  jobId: string;
  /** Only the member who posted the job (recruiter_id) should see AI hiring actions. */
  canManage?: boolean;
}) {
  const trimmedJob = jobId.trim();
  const [findBusy, setFindBusy] = useState(false);
  const [outreachBusy, setOutreachBusy] = useState(false);
  const [shortTaskId, setShortTaskId] = useState<string | null>(null);
  const [outreachTaskId, setOutreachTaskId] = useState<string | null>(null);
  const [shortTask, setShortTask] = useState<AITask | null>(null);
  const [outreachTask, setOutreachTask] = useState<AITask | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [draftEdits, setDraftEdits] = useState<Record<string, string>>({});
  const [approveBusy, setApproveBusy] = useState(false);
  const [error, setError] = useState('');
  const shortPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const outreachPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastCompletedOutreachTaskIdRef = useRef<string>('');
  const activeShortTaskIdRef = useRef<string | null>(null);
  const activeOutreachTaskIdRef = useRef<string | null>(null);

  const shortlist = useMemo((): CandidateMatch[] => {
    const rows = shortTask?.result?.shortlist;
    return Array.isArray(rows) ? rows : [];
  }, [shortTask]);

  const outreachDrafts = useMemo(() => {
    const rows = outreachTask?.result?.outreach_drafts;
    return Array.isArray(rows) ? rows : [];
  }, [outreachTask]);

  const candidateNameById = useMemo(() => {
    const out: Record<string, string> = {};
    for (const c of shortlist) {
      const cid = idFromMatch(c);
      if (!cid) continue;
      const nm = String(c.name || '').trim();
      if (nm) out[cid] = nm;
    }
    return out;
  }, [shortlist]);

  const resetFlow = useCallback(() => {
    setShortTaskId(null);
    setOutreachTaskId(null);
    setShortTask(null);
    setOutreachTask(null);
    setSelected(new Set());
    setDraftEdits({});
    setError('');
    if (shortPollRef.current) {
      clearInterval(shortPollRef.current);
      shortPollRef.current = null;
    }
    if (outreachPollRef.current) {
      clearInterval(outreachPollRef.current);
      outreachPollRef.current = null;
    }
  }, []);

  useEffect(() => {
    resetFlow();
    lastCompletedOutreachTaskIdRef.current = '';
  }, [trimmedJob, resetFlow]);

  useEffect(() => {
    if (
      outreachTask?.state === 'completed' &&
      outreachTaskId &&
      lastCompletedOutreachTaskIdRef.current !== outreachTaskId
    ) {
      lastCompletedOutreachTaskIdRef.current = outreachTaskId;
      showToast('Outreach approved and queued for delivery.', 'success');
      resetFlow();
    }
  }, [outreachTask?.state, outreachTaskId, resetFlow]);

  const fetchLoop = useCallback(
    async (
      taskId: string,
      setter: (t: AITask) => void,
      activeTaskIdRef: MutableRefObject<string | null>
    ) => {
      const t = await aiApi.getTask(taskId);
      // Ignore stale poll responses from previous tasks after reset.
      if (activeTaskIdRef.current !== taskId) return null;
      setter(t);
      return t.state;
    },
    []
  );

  useEffect(() => {
    activeShortTaskIdRef.current = shortTaskId;
  }, [shortTaskId]);

  useEffect(() => {
    activeOutreachTaskIdRef.current = outreachTaskId;
  }, [outreachTaskId]);

  useEffect(() => {
    if (!shortTaskId) return;
    let wsClose: (() => void) | null = null;
    const tick = () => {
      void fetchLoop(shortTaskId, setShortTask, activeShortTaskIdRef).catch(() => undefined);
    };
    tick();
    wsClose = connectTaskWebSocket(shortTaskId, () => tick(), () => {
      shortPollRef.current = setInterval(tick, 2500);
    });
    shortPollRef.current = setInterval(tick, 3000);
    return () => {
      wsClose?.();
      if (shortPollRef.current) clearInterval(shortPollRef.current);
      shortPollRef.current = null;
    };
  }, [shortTaskId, fetchLoop]);

  useEffect(() => {
    if (!outreachTaskId) return;
    let wsClose: (() => void) | null = null;
    const tick = () => {
      void fetchLoop(outreachTaskId, setOutreachTask, activeOutreachTaskIdRef).catch(() => undefined);
    };
    tick();
    wsClose = connectTaskWebSocket(outreachTaskId, () => tick(), () => {
      outreachPollRef.current = setInterval(tick, 2500);
    });
    outreachPollRef.current = setInterval(tick, 3000);
    return () => {
      wsClose?.();
      if (outreachPollRef.current) clearInterval(outreachPollRef.current);
      outreachPollRef.current = null;
    };
  }, [outreachTaskId, fetchLoop]);

  useEffect(() => {
    if (!outreachDrafts.length) return;
    setDraftEdits((prev) => {
      const next = { ...prev };
      for (const row of outreachDrafts) {
        const mid = row.member_id;
        if (mid && next[mid] === undefined) {
          next[mid] = row.draft || '';
        }
      }
      return next;
    });
  }, [outreachTaskId, outreachDrafts]);

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  const onFindTop = async () => {
    if (!trimmedJob) {
      setError('Missing job context. Open a specific job posting first.');
      return;
    }
    setError('');
    lastCompletedOutreachTaskIdRef.current = '';
    setFindBusy(true);
    // Start a fresh cycle only when recruiter explicitly runs again.
    resetFlow();
    try {
      const res = await aiApi.submitTask({
        task_type: 'candidate_shortlist',
        job_id: trimmedJob,
        actor_id: getViewerRecruiterId(),
      });
      setShortTaskId(res.task_id);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not start ranking.');
    } finally {
      setFindBusy(false);
    }
  };

  const onGenerateOutreach = async () => {
    const ids = [...selected];
    if (!trimmedJob || ids.length === 0) {
      setError('Select one or more candidates from the shortlist.');
      return;
    }
    setError('');
    setOutreachBusy(true);
    // Keep previous review visible until new draft task starts returning data.
    try {
      const res = await aiApi.submitTask({
        task_type: 'generate_outreach',
        job_id: trimmedJob,
        actor_id: getViewerRecruiterId(),
        candidate_ids: ids,
      });
      setOutreachTaskId(res.task_id);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not start outreach.');
    } finally {
      setOutreachBusy(false);
    }
  };

  const onApproveOutreach = async (decision: 'approve' | 'edit' | 'reject') => {
    if (!outreachTaskId) return;
    setApproveBusy(true);
    setError('');
    try {
      if (decision === 'edit') {
        await aiApi.approveTask(outreachTaskId, {
          decision: 'edit',
          reviewer_id: getViewerRecruiterId(),
          edited_drafts: draftEdits,
        });
      } else if (decision === 'approve') {
        await aiApi.approveTask(outreachTaskId, {
          decision: 'approve',
          reviewer_id: getViewerRecruiterId(),
          edited_drafts: draftEdits,
        });
      } else {
        await aiApi.approveTask(outreachTaskId, {
          decision: 'reject',
          reviewer_id: getViewerRecruiterId(),
        });
      }
      const t = await aiApi.getTask(outreachTaskId);
      setOutreachTask(t);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Approval request failed.');
    } finally {
      setApproveBusy(false);
    }
  };

  const findingDone = shortTask && isTerminal(shortTask.state);
  const findingFailed = shortTask?.state === 'failed';
  const outreachReview = outreachTask?.state === 'awaiting_approval';
  const outreachDone = outreachTask && isTerminal(outreachTask.state);

  if (!trimmedJob) {
    return null;
  }

  if (!canManage) {
    return null;
  }

  return (
    <div className="mt-6 rounded-xl border border-[#0a66c2]/25 bg-[#f4f8fc] p-4">
      <div className="flex items-center gap-2">
        <Sparkles size={18} className="text-[#0a66c2]" />
        <h3 className="text-sm font-bold text-[#191919]">AI hiring assistant</h3>
      </div>
      <p className="mt-1 text-xs text-slate-600">
        Ranks applicants for this job, then drafts outreach only for candidates you select. Messages send only after you approve.
      </p>

          {error ? (
            <div className="mt-3 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              <AlertTriangle size={14} />
              {error}
            </div>
          ) : null}

          <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={findBusy || Boolean(shortTaskId && !findingDone)}
            onClick={() => void onFindTop()}
            className="inline-flex items-center gap-2 rounded-full bg-[#0a66c2] px-4 py-2 text-xs font-semibold text-white hover:bg-[#004182] disabled:opacity-50"
          >
            {findBusy || (shortTaskId && !findingDone) ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Users size={14} />
            )}
            Find top candidates
          </button>
          {findingDone && !findingFailed ? (
            <button
              type="button"
              disabled={outreachBusy || selected.size === 0 || Boolean(outreachTaskId && !outreachDone)}
              onClick={() => void onGenerateOutreach()}
              className="inline-flex items-center gap-2 rounded-full border border-[#0a66c2] bg-white px-4 py-2 text-xs font-semibold text-[#0a66c2] hover:bg-[#edf3f8] disabled:opacity-50"
            >
              {outreachBusy ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
              Generate outreach
            </button>
          ) : null}
          </div>

          {shortTaskId && shortTask && !findingDone ? (
            <p className="mt-2 text-xs text-slate-500">
              {shortTask.state === 'queued' ? 'Queued…' : 'Ranking applicants (resume parse → match → shortlist)…'}
            </p>
          ) : null}

          {findingFailed ? (
            <p className="mt-2 text-xs text-red-600">{shortTask?.error || 'Ranking failed.'}</p>
          ) : null}

          {findingDone && !findingFailed && shortlist.length > 0 ? (
            <div className="mt-4">
              <p className="text-xs font-semibold text-slate-700">Top {shortlist.length} ranked applicants</p>
              <ul className="mt-2 space-y-2">
                {shortlist.map((c, idx) => {
                  const cid = idFromMatch(c);
                  if (!cid) return null;
                  const pct = Math.round((c.match_score || 0) * 100);
                  return (
                    <li key={cid}>
                      <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-slate-200 bg-white p-2 text-xs hover:border-[#0a66c2]">
                        <input
                          type="checkbox"
                          className="mt-0.5"
                          checked={selected.has(cid)}
                          onChange={() => toggleSelect(cid)}
                        />
                        <span className="font-mono text-slate-400">#{idx + 1}</span>
                        <span className="min-w-0 flex-1">
                          <span className="font-semibold text-[#191919]">{c.name || cid}</span>
                          <span className="ml-2 rounded-full bg-[#edf3f8] px-2 py-0.5 font-bold text-[#0a66c2]">{pct}%</span>
                          {c.headline ? <span className="mt-0.5 block text-slate-500">{c.headline}</span> : null}
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}

          {outreachTaskId && outreachTask && !outreachReview && !outreachDone ? (
            <p className="mt-3 text-xs text-slate-500">Drafting personalized outreach…</p>
          ) : null}

          {outreachReview ? (
            <div className="mt-4 space-y-3 rounded-lg border border-violet-200 bg-violet-50 p-3">
              <p className="text-xs font-semibold text-violet-800">Review outreach</p>
              {outreachDrafts.map((row) => (
                <div key={row.member_id} className="rounded-md border border-violet-100 bg-white p-2">
                  <p className="text-xs font-semibold text-slate-700">
                    {row.name || candidateNameById[row.member_id] || 'Candidate'}
                  </p>
                  <textarea
                    className="mt-1 w-full rounded border border-slate-200 p-2 text-xs"
                    rows={5}
                    value={draftEdits[row.member_id] ?? row.draft}
                    onChange={(e) =>
                      setDraftEdits((prev) => ({ ...prev, [row.member_id]: e.target.value }))
                    }
                  />
                </div>
              ))}
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={approveBusy}
                  onClick={() => void onApproveOutreach('approve')}
                  className="rounded-full bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  {approveBusy ? <Loader2 size={12} className="animate-spin inline" /> : <Check size={12} className="inline" />}{' '}
                  Approve & send
                </button>
                <button
                  type="button"
                  disabled={approveBusy}
                  onClick={() => void onApproveOutreach('edit')}
                  className="rounded-full bg-[#0a66c2] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#004182] disabled:opacity-50"
                >
                  Save edits & send
                </button>
                <button
                  type="button"
                  disabled={approveBusy}
                  onClick={() => void onApproveOutreach('reject')}
                  className="rounded-full border border-red-300 bg-white px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50"
                >
                  Reject drafts
                </button>
              </div>
            </div>
          ) : null}

          {outreachTask?.state === 'rejected' ? (
            <p className="mt-3 text-xs font-semibold text-slate-600">Drafts rejected; nothing was sent.</p>
          ) : null}
          {outreachTask?.state === 'failed' ? (
            <p className="mt-3 text-xs text-red-600">{outreachTask.error || 'Outreach task failed.'}</p>
          ) : null}
 
    </div>
  );
}
