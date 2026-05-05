import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Activity,
  AlertTriangle,
  BarChart2,
  Bot,
  Check,
  CheckCircle,
  ChevronRight,
  Clock,
  Copy,
  Edit3,
  FileText,
  Layers,
  Loader2,
  Radio,
  RefreshCw,
  RotateCcw,
  Send,
  Shield,
  Sparkles,
  Target,
  ThumbsDown,
  ThumbsUp,
  Users,
  X,
  Zap,
} from 'lucide-react';
import {
  AITask,
  CandidateMatch,
  StepName,
  TaskState,
  WsProgressEvent,
  aiApi,
  connectTaskWebSocket,
} from '../lib/aiApi';
import { getViewerMemberId, getViewerRecruiterId } from '../lib/memberProfile';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STEP_LABELS: Record<StepName, string> = {
  discover_candidates: 'Applicant pool',
  resume_parse: 'Resume Parser',
  match_score: 'Match Scorer',
  shortlist: 'Shortlist Generator',
  outreach_draft: 'Outreach Drafter',
};

const STEP_ICONS: Record<StepName, React.ReactNode> = {
  discover_candidates: <Users size={14} />,
  resume_parse: <FileText size={14} />,
  match_score: <Target size={14} />,
  shortlist: <Users size={14} />,
  outreach_draft: <Send size={14} />,
};

const STEP_ORDER: StepName[] = ['discover_candidates', 'resume_parse', 'match_score', 'shortlist', 'outreach_draft'];

function stateColor(state: TaskState) {
  switch (state) {
    case 'queued':            return 'text-amber-500';
    case 'processing':        return 'text-blue-500';
    case 'awaiting_approval': return 'text-violet-500';
    case 'approved':          return 'text-emerald-600';
    case 'completed':         return 'text-emerald-500';
    case 'rejected':          return 'text-slate-600';
    case 'failed':            return 'text-red-500';
    default:                  return 'text-slate-400';
  }
}

function stateBg(state: TaskState) {
  switch (state) {
    case 'queued':            return 'bg-amber-50 border-amber-200';
    case 'processing':        return 'bg-blue-50 border-blue-200';
    case 'awaiting_approval': return 'bg-violet-50 border-violet-200';
    case 'approved':          return 'bg-emerald-50 border-emerald-200';
    case 'completed':         return 'bg-emerald-50 border-emerald-200';
    case 'rejected':          return 'bg-slate-50 border-slate-200';
    case 'failed':            return 'bg-red-50 border-red-200';
    default:                  return 'bg-slate-50 border-slate-200';
  }
}

function stateLabel(state: TaskState) {
  switch (state) {
    case 'queued':            return 'Queued';
    case 'processing':        return 'Processing';
    case 'awaiting_approval': return 'Awaiting Approval';
    case 'approved':          return 'Approved';
    case 'completed':         return 'Completed';
    case 'rejected':          return 'Rejected';
    case 'failed':            return 'Failed';
    default:                  return state;
  }
}

function fmtScore(n: number) { return Math.round(n * 100); }

function timeAgo(iso: string) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60)    return 'just now';
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function fmtTimestamp(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

// ─── Shared UI atoms ──────────────────────────────────────────────────────────

function ProgressBar({ pct }: { pct: number }) {
  return (
    <div className="h-1.5 w-full rounded-full bg-slate-200 overflow-hidden">
      <div
        className="h-full rounded-full bg-gradient-to-r from-[#0a66c2] to-[#5aa9e6] transition-all duration-500"
        style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
      />
    </div>
  );
}

function StepTimeline({ task, liveMsg }: { task: AITask; liveMsg?: string }) {
  const order: StepName[] =
    task.steps && task.steps.length > 0
      ? (task.steps.map((s) => s.step_name) as StepName[])
      : STEP_ORDER;
  return (
    <div className="space-y-2">
      {order.map((sn, idx) => {
        const step     = task.steps.find((s) => s.step_name === sn);
        const isCurrent = task.current_step === sn && task.state === 'processing';
        const isDone   = step?.status === 'completed';
        const isFailed = step?.status === 'failed';

        return (
          <div key={sn} className="flex items-start gap-3">
            <div className="flex flex-col items-center">
              <div
                className={`flex h-7 w-7 items-center justify-center rounded-full border-2 text-xs font-bold transition-all ${
                  isDone    ? 'border-emerald-400 bg-emerald-50 text-emerald-600'
                  : isCurrent ? 'border-[#0a66c2] bg-[#0a66c2] text-white animate-pulse'
                  : isFailed  ? 'border-red-400 bg-red-50 text-red-500'
                  : 'border-slate-200 bg-white text-slate-400'
                }`}
              >
                {isDone    ? <Check size={12} />
                  : isCurrent ? <Loader2 size={12} className="animate-spin" />
                  : isFailed  ? <X size={12} />
                  : idx + 1}
              </div>
              {idx < order.length - 1 && (
                <div className={`mt-1 h-4 w-0.5 ${isDone ? 'bg-emerald-300' : 'bg-slate-200'}`} />
              )}
            </div>
            <div className="min-w-0 flex-1 pt-0.5">
              <div className="flex items-center gap-1.5">
                <span className="text-xs">{STEP_ICONS[sn]}</span>
                <span className={`text-sm font-semibold ${
                  isDone    ? 'text-emerald-700'
                  : isCurrent ? 'text-[#0a66c2]'
                  : isFailed  ? 'text-red-600'
                  : 'text-slate-400'
                }`}>
                  {STEP_LABELS[sn]}
                </span>
                {isCurrent && liveMsg && (
                  <span className="text-xs text-slate-500 italic truncate">{liveMsg}</span>
                )}
              </div>
              {step?.output_summary && (
                <p className="text-xs text-slate-500 mt-0.5">{step.output_summary}</p>
              )}
              {step?.ended_at && (
                <p className="text-xs text-slate-400">{timeAgo(step.ended_at)}</p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ScoreBadge({ score }: { score: number }) {
  const pct = fmtScore(score);
  const color =
    pct >= 80 ? 'text-emerald-600 bg-emerald-50 border-emerald-200'
    : pct >= 60 ? 'text-amber-600 bg-amber-50 border-amber-200'
    : 'text-slate-500 bg-slate-50 border-slate-200';
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-bold ${color}`}>
      <Target size={10} />
      {pct}%
    </span>
  );
}

function CandidateCard({ c, rank }: { c: CandidateMatch; rank: number }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3 hover:border-[#0a66c2] hover:shadow-sm transition-all">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#0a66c2] to-[#004182] text-white text-xs font-bold">
            #{rank}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-[#191919] truncate">{c.name || c.candidate_id}</p>
            {c.headline && <p className="text-xs text-slate-500 truncate">{c.headline}</p>}
          </div>
        </div>
        <ScoreBadge score={c.match_score} />
      </div>
      {c.skills_matched && c.skills_matched.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {c.skills_matched.slice(0, 5).map((sk) => (
            <span key={sk} className="rounded-full bg-[#edf3f8] px-2 py-0.5 text-xs font-medium text-[#0a66c2]">
              {sk}
            </span>
          ))}
          {c.skills_matched.length > 5 && (
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-400">
              +{c.skills_matched.length - 5}
            </span>
          )}
        </div>
      )}
      {c.rationale && (
        <p className="mt-1.5 text-xs text-slate-500 italic">{c.rationale}</p>
      )}
    </div>
  );
}

// ─── HITL Approval Panel ──────────────────────────────────────────────────────

function HITLPanel({
  task,
  onDecision,
  busy,
}: {
  task: AITask;
  onDecision: (decision: 'approve' | 'edit' | 'reject', editedText?: string) => void;
  busy: boolean;
}) {
  const drafts = task.result?.outreach_drafts || [];
  const original =
    task.result?.outreach_draft ??
    (drafts.length ? drafts.map((d) => `${d.member_id}:\n${d.draft}`).join('\n\n') : '');
  const [editedText, setEditedText] = useState(original);
  const [mode, setMode] = useState<'review' | 'edit'>('review');
  const [charDelta, setCharDelta] = useState(0);

  useEffect(() => { setEditedText(original); }, [original]);
  useEffect(() => { setCharDelta(editedText.length - original.length); }, [editedText, original]);

  return (
    <div className="rounded-xl border-2 border-violet-200 bg-violet-50 p-4 space-y-4">
      {/* header */}
      <div className="flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-violet-100">
          <Shield size={16} className="text-violet-600" />
        </div>
        <div>
          <p className="text-sm font-bold text-violet-800">Human Review Required</p>
          <p className="text-xs text-violet-500">AI-generated outreach needs your approval before sending</p>
        </div>
      </div>

      {/* shortlist */}
      {task.result?.shortlist && task.result.shortlist.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2">Shortlisted Candidates</p>
          <div className="space-y-2">
            {task.result.shortlist.map((c, i) => (
              <CandidateCard key={c.candidate_id} c={c} rank={i + 1} />
            ))}
          </div>
        </div>
      )}

      {/* outreach draft */}
      {original && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">AI-Generated Outreach</p>
            <button
              onClick={() => setMode(mode === 'review' ? 'edit' : 'review')}
              className="flex items-center gap-1 rounded-full border border-violet-300 bg-white px-2.5 py-1 text-xs font-semibold text-violet-600 hover:bg-violet-100 transition-colors"
            >
              <Edit3 size={11} />
              {mode === 'edit' ? 'Preview' : 'Edit'}
            </button>
          </div>

          {mode === 'review' ? (
            <div className="rounded-lg border border-violet-200 bg-white p-3 text-sm text-[#191919] whitespace-pre-wrap leading-relaxed">
              {editedText || original}
            </div>
          ) : (
            <div>
              <textarea
                value={editedText}
                onChange={(e) => setEditedText(e.target.value)}
                rows={6}
                className="w-full rounded-lg border border-violet-300 bg-white p-3 text-sm leading-relaxed focus:border-[#0a66c2] focus:outline-none focus:ring-1 focus:ring-[#0a66c2] resize-none"
              />
              <p className="mt-1 text-right text-xs text-slate-400">
                {charDelta > 0 ? `+${charDelta}` : charDelta} chars from original
              </p>
            </div>
          )}
        </div>
      )}

      {/* action buttons */}
      <div className="flex flex-wrap gap-2 pt-1">
        <button
          disabled={busy}
          onClick={() => onDecision('approve')}
          className="flex items-center gap-1.5 rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors shadow-sm"
        >
          {busy ? <Loader2 size={14} className="animate-spin" /> : <ThumbsUp size={14} />}
          Approve
        </button>
        {mode === 'edit' && editedText !== original && (
          <button
            disabled={busy}
            onClick={() => onDecision('edit', editedText)}
            className="flex items-center gap-1.5 rounded-full bg-[#0a66c2] px-4 py-2 text-sm font-semibold text-white hover:bg-[#004182] disabled:opacity-50 transition-colors shadow-sm"
          >
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
            Save & Approve Edit
          </button>
        )}
        <button
          disabled={busy}
          onClick={() => onDecision('reject')}
          className="flex items-center gap-1.5 rounded-full border border-red-300 bg-white px-4 py-2 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50 transition-colors"
        >
          <ThumbsDown size={14} />
          Reject
        </button>
      </div>
    </div>
  );
}

// ─── 7. Final State Screen ────────────────────────────────────────────────────
// Full dedicated view shown after task reaches `completed` or `failed`.
// Includes: final state, decision taken, final text, timestamp, retry + back buttons.

function FinalStateScreen({
  task,
  onBack,
  onRetry,
}: {
  task: AITask;
  onBack: () => void;
  onRetry: () => void;
}) {
  const [copied, setCopied] = useState(false);

  const isCompleted = task.state === 'completed';
  const isFailed    = task.state === 'failed';
  const isRejected  = task.state === 'rejected';

  const finalText =
    task.approval?.decision === 'edit'
      ? task.approval.edited_text
      : task.result?.outreach_draft;

  const handleCopy = () => {
    if (!finalText) return;
    void navigator.clipboard.writeText(finalText).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="space-y-4">
      {/* ── Hero status banner ── */}
      {isCompleted ? (
        <div className="rounded-2xl border-2 border-emerald-300 bg-gradient-to-br from-emerald-50 to-white p-6 text-center shadow-sm">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100">
            <CheckCircle size={28} className="text-emerald-600" />
          </div>
          <h2 className="text-lg font-bold text-emerald-800">Workflow Completed</h2>
          <p className="mt-1 text-sm text-emerald-600">
            The AI hiring workflow finished successfully and your decision was recorded.
          </p>
        </div>
      ) : isRejected ? (
        <div className="rounded-2xl border-2 border-slate-300 bg-gradient-to-br from-slate-50 to-white p-6 text-center shadow-sm">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-slate-100">
            <ThumbsDown size={28} className="text-slate-500" />
          </div>
          <h2 className="text-lg font-bold text-slate-800">Draft Rejected</h2>
          <p className="mt-1 text-sm text-slate-600">
            Nothing was sent. You can start again from the job&apos;s applicants page.
          </p>
        </div>
      ) : (
        <div className="rounded-2xl border-2 border-red-300 bg-gradient-to-br from-red-50 to-white p-6 text-center shadow-sm">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-red-100">
            <AlertTriangle size={28} className="text-red-500" />
          </div>
          <h2 className="text-lg font-bold text-red-700">Workflow Failed</h2>
          <p className="mt-1 text-sm text-red-500">
            {task.error ?? 'The workflow encountered an error and could not complete.'}
          </p>
        </div>
      )}

      {/* ── Decision summary card ── */}
      {(isCompleted || isRejected) && task.approval && (
        <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Decision Summary</p>

          <div className="grid grid-cols-3 gap-3 text-center">
            {/* Decision */}
            <div className="rounded-lg bg-slate-50 p-3">
              <p className="text-xs text-slate-400 mb-1">Decision</p>
              <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold ${
                task.approval.decision === 'approve' ? 'bg-emerald-100 text-emerald-700'
                : task.approval.decision === 'edit'  ? 'bg-blue-100 text-blue-700'
                : 'bg-red-100 text-red-600'
              }`}>
                {task.approval.decision === 'approve' && <ThumbsUp size={10} />}
                {task.approval.decision === 'edit'    && <Edit3 size={10} />}
                {task.approval.decision === 'reject'  && <ThumbsDown size={10} />}
                {task.approval.decision.charAt(0).toUpperCase() + task.approval.decision.slice(1)}
              </span>
            </div>

            {/* Reviewer */}
            <div className="rounded-lg bg-slate-50 p-3">
              <p className="text-xs text-slate-400 mb-1">Reviewer</p>
              <p className="text-xs font-semibold text-[#191919] truncate">{task.approval.reviewer_id}</p>
            </div>

            {/* Timestamp */}
            <div className="rounded-lg bg-slate-50 p-3">
              <p className="text-xs text-slate-400 mb-1">Recorded</p>
              <p className="text-xs font-semibold text-[#191919]">{timeAgo(task.approval.recorded_at)}</p>
              <p className="text-xs text-slate-400">{fmtTimestamp(task.approval.recorded_at)}</p>
            </div>
          </div>

          {/* Trace info */}
          <div className="rounded-lg bg-slate-50 px-3 py-2 text-xs font-mono text-slate-500 space-y-0.5">
            <p>Task&nbsp;&nbsp;: {task.task_id}</p>
            <p>Trace&nbsp;: {task.trace_id}</p>
            <p>Job&nbsp;&nbsp;&nbsp;: {task.job_id ?? '—'}</p>
          </div>
        </div>
      )}

      {/* ── Final approved / edited text ── */}
      {finalText && (
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              {task.approval?.decision === 'edit' ? 'Edited Outreach Message' : 'Approved Outreach Message'}
            </p>
            <button
              onClick={handleCopy}
              className="flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-100 transition-colors"
            >
              {copied ? <Check size={11} className="text-emerald-500" /> : <Copy size={11} />}
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
          <div className="rounded-lg border border-slate-200 bg-[#f9fafb] p-3 text-sm text-[#191919] whitespace-pre-wrap leading-relaxed">
            {finalText}
          </div>
          {task.approval?.decision === 'edit' && task.approval.original_text && (
            <details className="mt-2">
              <summary className="cursor-pointer text-xs text-slate-400 hover:text-slate-600">
                View original AI draft
              </summary>
              <div className="mt-2 rounded-lg border border-dashed border-slate-200 bg-white p-3 text-sm text-slate-500 whitespace-pre-wrap leading-relaxed">
                {task.approval.original_text}
              </div>
            </details>
          )}
        </div>
      )}

      {/* ── Shortlist recap (collapsed) ── */}
      {task.result?.shortlist && task.result.shortlist.length > 0 && (
        <details className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <summary className="cursor-pointer rounded-xl px-4 py-3 text-sm font-semibold text-[#191919] hover:bg-slate-50 list-none flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Users size={14} className="text-[#0a66c2]" />
              Shortlisted Candidates ({task.result.shortlist.length})
            </span>
            <ChevronRight size={14} className="text-slate-400" />
          </summary>
          <div className="px-4 pb-4 space-y-2">
            {task.result.shortlist.map((c, i) => (
              <CandidateCard key={c.candidate_id} c={c} rank={i + 1} />
            ))}
          </div>
        </details>
      )}

      {/* ── Step audit trail ── */}
      <details className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <summary className="cursor-pointer rounded-xl px-4 py-3 text-sm font-semibold text-[#191919] hover:bg-slate-50 list-none flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Activity size={14} className="text-[#0a66c2]" />
            Step Audit Trail
          </span>
          <ChevronRight size={14} className="text-slate-400" />
        </summary>
        <div className="px-4 pb-4">
          <StepTimeline task={task} />
        </div>
      </details>

      {/* ── Action buttons ── */}
      <div className="flex flex-wrap gap-2 pt-1">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
        >
          ← New Workflow
        </button>

        {/* Retry — shown for both failed and for rejected decisions */}
        {(isFailed || isRejected || task.approval?.decision === 'reject') && (
          <button
            onClick={onRetry}
            className="flex items-center gap-1.5 rounded-full bg-[#0a66c2] px-4 py-2 text-sm font-semibold text-white hover:bg-[#004182] transition-colors shadow-sm"
          >
            <RotateCcw size={14} />
            Retry Workflow
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Submit Form ──────────────────────────────────────────────────────────────

function SubmitTaskForm({
  prefillJobId,
  onSubmitted,
}: {
  prefillJobId?: string;
  onSubmitted: (taskId: string) => void;
}) {
  const [jobId, setJobId] = useState(prefillJobId ?? 'J-1001');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const viewerMid = getViewerMemberId();
  const viewerRecruiter = getViewerRecruiterId();
  const [ownerCheck, setOwnerCheck] = useState<'pending' | 'owner' | 'not_owner' | 'no_job'>('pending');

  useEffect(() => {
    const id = jobId.trim();
    if (!id) {
      setOwnerCheck('no_job');
      return;
    }
    let cancelled = false;
    setOwnerCheck('pending');
    fetch('/api/jobs/get', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ job_id: id, member_id: viewerMid }),
    })
      .then((r) => r.json())
      .then((data: { error?: string; job_id?: string; recruiter_id?: string }) => {
        if (cancelled) return;
        if (!data || data.error || !data.job_id) {
          setOwnerCheck('no_job');
          return;
        }
        const rid = String(data.recruiter_id ?? '').trim();
        setOwnerCheck(rid === String(viewerRecruiter).trim() ? 'owner' : 'not_owner');
      })
      .catch(() => {
        if (!cancelled) setOwnerCheck('no_job');
      });
    return () => {
      cancelled = true;
    };
  }, [jobId, viewerMid, viewerRecruiter]);

  const handleSubmit = async () => {
    if (!jobId.trim()) {
      setError('Job ID is required.');
      return;
    }
    if (ownerCheck !== 'owner') {
      setError('Only the recruiter who posted this job can run Find top candidates.');
      return;
    }

    setError('');
    setLoading(true);
    try {
      const res = await aiApi.submitTask({
        task_type: 'candidate_shortlist',
        job_id: jobId.trim(),
        actor_id: getViewerRecruiterId(),
      });
      onSubmitted(res.task_id);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to submit task.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-5 space-y-4">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[#0a66c2] to-[#004182] shadow">
          <Bot size={20} className="text-white" />
        </div>
        <div>
          <h2 className="text-base font-bold text-[#191919]">Hiring Assistant (demo)</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Prefer the real flow: open{' '}
            <Link to="/applications" className="font-semibold text-[#0a66c2] hover:underline">
              Applications
            </Link>
            , load a job, then use <strong>Find top candidates</strong> there.
          </p>
        </div>
      </div>

      <div className="flex items-center gap-1 overflow-x-auto py-1">
        {STEP_ORDER.filter((sn) => sn !== 'outreach_draft').map((sn, i, arr) => (
          <div key={sn} className="flex items-center gap-1 shrink-0">
            <div className="flex items-center gap-1.5 rounded-full border border-[#0a66c2]/20 bg-[#edf3f8] px-2.5 py-1">
              {STEP_ICONS[sn]}
              <span className="text-xs font-medium text-[#0a66c2]">{STEP_LABELS[sn]}</span>
            </div>
            {i < arr.length - 1 && <ChevronRight size={12} className="text-slate-300 shrink-0" />}
          </div>
        ))}
      </div>

      <div className="space-y-3">
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">Job posting ID</label>
          <input
            value={jobId}
            onChange={(e) => setJobId(e.target.value)}
            placeholder="e.g. J-1001"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-[#0a66c2] focus:outline-none focus:ring-1 focus:ring-[#0a66c2]"
          />
          <p className="mt-1 text-xs text-slate-400">
            Candidates are loaded from applicants for this job (no manual IDs).
          </p>
        </div>
      </div>

      {ownerCheck === 'not_owner' ? (
        <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <Shield size={14} className="shrink-0" />
          Only the person who posted this job can use Find top candidates. Open the job from Jobs while signed in as that recruiter.
        </div>
      ) : null}

      {ownerCheck === 'no_job' && jobId.trim() ? (
        <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
          No job found for that ID. Check the job listing or paste the ID from the URL.
        </div>
      ) : null}

      {error && (
        <div className="flex items-center gap-2 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
          <AlertTriangle size={14} className="shrink-0" />
          {error}
        </div>
      )}

      <button
        disabled={loading || ownerCheck !== 'owner'}
        onClick={handleSubmit}
        className="flex w-full items-center justify-center gap-2 rounded-full bg-[#0a66c2] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#004182] disabled:opacity-50 transition-colors shadow-sm"
      >
        {loading ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
        {loading ? 'Finding…' : ownerCheck === 'pending' ? 'Checking job…' : 'Find top candidates'}
      </button>
    </div>
  );
}

// ─── Live Task Monitor ────────────────────────────────────────────────────────

// Internal view state for the monitor:
// 'loading'   → fetching initial task
// 'progress'  → task running (queued / processing)
// 'approval'  → awaiting_approval  → show HITL panel
// 'final'     → completed / failed → show FinalStateScreen
type MonitorView = 'loading' | 'progress' | 'approval' | 'final';

function TaskMonitor({
  taskId,
  onBack,
  onRetry,
}: {
  taskId: string;
  onBack: () => void;
  onRetry: (jobId?: string) => void;
}) {
  const [task,         setTask]         = useState<AITask | null>(null);
  const [progress,     setProgress]     = useState(0);
  const [liveMsg,      setLiveMsg]      = useState('');
  const [approvalBusy, setApprovalBusy] = useState(false);
  const [fetchError,   setFetchError]   = useState('');
  const pollRef   = useRef<ReturnType<typeof setInterval> | null>(null);
  const wsCloseRef = useRef<(() => void) | null>(null);

  // Derived view state
  const view: MonitorView =
    !task ? 'loading'
    : task.state === 'completed' || task.state === 'failed' || task.state === 'rejected'
      ? 'final'
      : task.state === 'awaiting_approval'
        ? 'approval'
        : 'progress';

  const fetchTask = useCallback(async () => {
    try {
      const t = await aiApi.getTask(taskId);
      setTask(t);
      if (t.state === 'completed' || t.state === 'failed' || t.state === 'rejected') {
        if (pollRef.current) clearInterval(pollRef.current);
        wsCloseRef.current?.();
      }
    } catch (e: unknown) {
      setFetchError(e instanceof Error ? e.message : 'Failed to fetch task.');
    }
  }, [taskId]);

  useEffect(() => {
    fetchTask();

    const disconnect = connectTaskWebSocket(
      taskId,
      (ev: WsProgressEvent) => {
        setProgress(ev.progress_pct);
        setLiveMsg(ev.message);
        setTask((prev) => {
          if (!prev) return prev;
          return { ...prev, state: ev.state, current_step: ev.current_step ?? prev.current_step };
        });
        if (
          ev.state === 'completed' ||
          ev.state === 'failed' ||
          ev.state === 'rejected' ||
          ev.state === 'awaiting_approval'
        ) {
          void fetchTask();
          if (pollRef.current) clearInterval(pollRef.current);
        }
      },
      () => {
        // WS closed → fall back to polling
        pollRef.current = setInterval(fetchTask, 2500);
      }
    );
    wsCloseRef.current = disconnect;
    pollRef.current    = setInterval(fetchTask, 3000);

    return () => {
      disconnect();
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [taskId, fetchTask]);

  const handleDecision = async (
    decision: 'approve' | 'edit' | 'reject',
    editedText?: string
  ) => {
    if (!task) return;
    setApprovalBusy(true);
    try {
      await aiApi.approveTask(task.task_id, {
        decision,
        edited_text: editedText,
        reviewer_id: getViewerRecruiterId(),
      });
      await fetchTask(); // will flip view to 'final'
    } catch (e: unknown) {
      setFetchError(e instanceof Error ? e.message : 'Approval failed.');
    } finally {
      setApprovalBusy(false);
    }
  };

  // ── Fetch error screen ──
  if (fetchError) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center space-y-3">
        <AlertTriangle size={28} className="mx-auto text-red-500" />
        <p className="text-sm font-semibold text-red-700">{fetchError}</p>
        <div className="flex justify-center gap-2">
          <button
            onClick={() => { setFetchError(''); void fetchTask(); }}
            className="flex items-center gap-1.5 rounded-full border border-red-300 bg-white px-4 py-2 text-sm font-semibold text-red-600 hover:bg-red-50"
          >
            <RefreshCw size={13} />
            Retry fetch
          </button>
          <button onClick={onBack} className="rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50">
            ← Back
          </button>
        </div>
      </div>
    );
  }

  // ── Loading ──
  if (view === 'loading') {
    return (
      <div className="flex items-center justify-center py-14 gap-2 text-slate-500">
        <Loader2 size={20} className="animate-spin" />
        <span className="text-sm">Loading task…</span>
      </div>
    );
  }

  // ── Final state — hand off to dedicated screen ──
  if (view === 'final' && task) {
    return (
      <FinalStateScreen
        task={task}
        onBack={onBack}
        onRetry={() => onRetry(task.job_id)}
      />
    );
  }

  // ── Progress / Approval ──
  return (
    <div className="space-y-4">
      {/* nav row */}
      <div className="flex items-center justify-between">
        <button onClick={onBack} className="flex items-center gap-1 text-xs text-slate-500 hover:text-[#0a66c2]">
          ← Back
        </button>
        <button onClick={() => void fetchTask()} className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600">
          <RefreshCw size={12} />
          Refresh
        </button>
      </div>

      {/* task status card */}
      {task && (
        <div className={`rounded-xl border-2 p-4 space-y-3 ${stateBg(task.state)}`}>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <p className="text-xs text-slate-500 font-mono">Task  {task.task_id}</p>
              <p className="text-xs text-slate-400 font-mono">Trace {task.trace_id}</p>
            </div>
            <div className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-bold ${stateBg(task.state)} ${stateColor(task.state)}`}>
              {task.state === 'processing'        && <Loader2 size={11} className="animate-spin" />}
              {task.state === 'awaiting_approval' && <Shield size={11} />}
              {task.state === 'queued'            && <Clock size={11} />}
              {stateLabel(task.state)}
            </div>
          </div>

          {/* progress bar — only during active processing */}
          {task.state !== 'awaiting_approval' && (
            <ProgressBar pct={progress} />
          )}

          {/* live WS message */}
          {liveMsg && task.state === 'processing' && (
            <div className="flex items-center gap-1.5 text-xs text-blue-600">
              <Radio size={11} className="animate-pulse" />
              <span className="italic">{liveMsg}</span>
            </div>
          )}

          {/* step timeline */}
          <StepTimeline task={task} liveMsg={liveMsg} />
        </div>
      )}

      {/* HITL approval panel */}
      {view === 'approval' && task && (
        <HITLPanel task={task} onDecision={handleDecision} busy={approvalBusy} />
      )}
    </div>
  );
}

// ─── Metrics View ─────────────────────────────────────────────────────────────

function MetricsView() {
  const [metrics, setMetrics] = useState<{
    total_tasks: number;
    completed_tasks: number;
    approval_rate: number;
    edit_rate: number;
    rejection_rate: number;
    avg_match_score: number;
    avg_completion_ms: number;
    tasks_by_state: Record<string, number>;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    aiApi.getMetrics()
      .then(setMetrics)
      .catch(() => setMetrics(null))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8 gap-2 text-slate-400">
        <Loader2 size={18} className="animate-spin" />
        <span className="text-sm">Loading metrics…</span>
      </div>
    );
  }

  if (!metrics) {
    return (
      <div className="text-center py-8 text-slate-400 text-sm">
        <BarChart2 size={32} className="mx-auto mb-2 opacity-30" />
        Metrics unavailable — backend may not expose <code>/api/ai/metrics</code> yet.
      </div>
    );
  }

  const hitlData = [
    { label: 'Approved', pct: metrics.approval_rate,  color: 'bg-emerald-500' },
    { label: 'Edited',   pct: metrics.edit_rate,       color: 'bg-blue-500'    },
    { label: 'Rejected', pct: metrics.rejection_rate,  color: 'bg-red-400'     },
  ];

  const completedTasks =
    (metrics as { completed?: number; completed_tasks?: number }).completed_tasks ??
    (metrics as { completed?: number; completed_tasks?: number }).completed ??
    metrics.tasks_by_state?.completed ??
    0;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        {[
          { label: 'Total Tasks',     value: metrics.total_tasks,                                   icon: <Layers size={14} />,      color: 'text-slate-600'   },
          { label: 'Completed',       value: completedTasks,                                        icon: <CheckCircle size={14} />, color: 'text-emerald-600' },
          { label: 'Avg Match Score', value: `${Math.round(metrics.avg_match_score * 100)}%`,       icon: <Target size={14} />,      color: 'text-[#0a66c2]'  },
          {
            label: 'Avg Completion',
            value: `${(((metrics as { average_completion_time_ms?: number }).average_completion_time_ms ?? metrics.avg_completion_ms) || 0) / 1000}s`,
            icon: <Zap size={14} />,
            color: 'text-amber-600',
          },
        ].map((kpi) => (
          <div key={kpi.label} className="rounded-lg border border-slate-200 bg-white p-3">
            <div className={`flex items-center gap-1.5 text-xs mb-1 ${kpi.color}`}>
              {kpi.icon}
              <span className="font-medium text-slate-500">{kpi.label}</span>
            </div>
            <p className={`text-xl font-bold ${kpi.color}`}>{kpi.value}</p>
          </div>
        ))}
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-3">Human-in-the-Loop Decisions</p>
        <div className="space-y-2.5">
          {hitlData.map((row) => (
            <div key={row.label}>
              <div className="flex justify-between text-xs mb-1">
                <span className="font-medium text-slate-700">{row.label}</span>
                <span className="font-bold text-slate-800">{Math.round(row.pct * 100)}%</span>
              </div>
              <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden">
                <div className={`h-full rounded-full ${row.color} transition-all duration-700`} style={{ width: `${row.pct * 100}%` }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {metrics.tasks_by_state && Object.keys(metrics.tasks_by_state).length > 0 && (
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-3">Tasks by State</p>
          <div className="space-y-1.5">
            {Object.entries(metrics.tasks_by_state).map(([state, count]) => (
              <div key={state} className="flex items-center justify-between text-sm">
                <span className={`font-medium capitalize ${stateColor(state as TaskState)}`}>{state.replace('_', ' ')}</span>
                <span className="font-bold text-slate-700">{count}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Task History ─────────────────────────────────────────────────────────────

function TaskHistory({ onSelect }: { onSelect: (taskId: string) => void }) {
  const [tasks,   setTasks]   = useState<AITask[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    aiApi.listTasks(getViewerRecruiterId())
      .then(setTasks)
      .catch(() => setTasks([]))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8 gap-2 text-slate-400">
        <Loader2 size={18} className="animate-spin" />
      </div>
    );
  }

  if (tasks.length === 0) {
    return (
      <div className="text-center py-8 text-slate-400 text-sm">
        <Activity size={32} className="mx-auto mb-2 opacity-30" />
        No tasks yet. Launch a workflow above.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {tasks.map((t) => (
        <button
          key={t.task_id}
          onClick={() => onSelect(t.task_id)}
          className="w-full text-left rounded-lg border border-slate-200 bg-white p-3 hover:border-[#0a66c2] hover:shadow-sm transition-all"
        >
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-xs font-mono text-slate-500 truncate">{t.task_id}</p>
              <p className="text-xs text-slate-400">Job: {t.job_id} · {t.candidate_ids?.length ?? 0} candidates</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className={`text-xs font-semibold ${stateColor(t.state)}`}>{stateLabel(t.state)}</span>
              <span className="text-xs text-slate-400">{timeAgo(t.created_at)}</span>
            </div>
          </div>
        </button>
      ))}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

type Tab = 'assistant' | 'history' | 'metrics';

// What the assistant tab is currently showing:
// 'form'    → SubmitTaskForm
// 'monitor' → TaskMonitor (progress / approval)
// Both share activeTaskId
type AssistantView = 'form' | 'monitor';

export default function AIAssistantPage() {
  const [tab,            setTab]           = useState<Tab>('assistant');
  const [assistantView,  setAssistantView] = useState<AssistantView>('form');
  const [activeTaskId,   setActiveTaskId]  = useState<string | null>(null);
  // pre-fill values carried from a retry
  const [retryJobId, setRetryJobId] = useState<string | undefined>();

  const handleSubmitted = (taskId: string) => {
    setActiveTaskId(taskId);
    setAssistantView('monitor');
  };

  const handleBack = () => {
    setActiveTaskId(null);
    setAssistantView('form');
  };

  // Retry: pre-fill the form with same job/candidates, go back to form
  const handleRetry = (jobId?: string) => {
    setRetryJobId(jobId);
    setActiveTaskId(null);
    setAssistantView('form');
  };

  const handleSelectFromHistory = (taskId: string) => {
    setRetryJobId(undefined);
    setActiveTaskId(taskId);
    setAssistantView('monitor');
    setTab('assistant');
  };

  const tabs: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: 'assistant', label: 'AI Copilot',    icon: <Bot size={14} />      },
    { key: 'history',   label: 'Task History',  icon: <Activity size={14} /> },
    { key: 'metrics',   label: 'Metrics',       icon: <BarChart2 size={14} />},
  ];

  return (
    <div className="space-y-4">
      {/* page header */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[#0a66c2] to-[#004182] shadow-md">
          <Sparkles size={20} className="text-white" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-[#191919]">AI Recruiting Assistant</h1>
        </div>
      </div>

      {/* tab bar */}
      <div className="flex gap-1 rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-semibold transition-all ${
              tab === t.key ? 'bg-[#0a66c2] text-white shadow-sm' : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {/* ── ASSISTANT TAB ── */}
      {tab === 'assistant' && (
        <div className="space-y-4">
          {assistantView === 'form' ? (
            <>
              <SubmitTaskForm prefillJobId={retryJobId} onSubmitted={handleSubmitted} />
              {/* kafka topology callout */}
              {/* <div className="rounded-xl border border-slate-200 bg-white p-4">
                <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2">Kafka Topology</p>
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
                  <span className="rounded border border-slate-200 bg-slate-50 px-2 py-0.5 font-mono">UI</span>
                  <ChevronRight size={12} className="text-slate-300" />
                  <span className="rounded border border-blue-200 bg-blue-50 px-2 py-0.5 font-mono text-[#0a66c2]">ai.requests</span>
                  <ChevronRight size={12} className="text-slate-300" />
                  <span className="rounded border border-violet-200 bg-violet-50 px-2 py-0.5 font-mono text-violet-700">Supervisor Agent</span>
                  <ChevronRight size={12} className="text-slate-300" />
                  <span className="rounded border border-emerald-200 bg-emerald-50 px-2 py-0.5 font-mono text-emerald-700">ai.results</span>
                  <ChevronRight size={12} className="text-slate-300" />
                  <span className="rounded border border-slate-200 bg-slate-50 px-2 py-0.5 font-mono">WebSocket → UI</span>
                </div>
              </div> */}
            </>
          ) : activeTaskId ? (
            <TaskMonitor
              taskId={activeTaskId}
              onBack={handleBack}
              onRetry={handleRetry}
            />
          ) : null}
        </div>
      )}

      {/* ── HISTORY TAB ── */}
      {tab === 'history' && (
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-4">
          <h2 className="text-sm font-bold text-[#191919] mb-3">Your AI Workflow Tasks</h2>
          <TaskHistory onSelect={handleSelectFromHistory} />
        </div>
      )}

      {/* ── METRICS TAB ── */}
      {tab === 'metrics' && (
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-4">
          <div className="flex items-center gap-2 mb-3">
            <BarChart2 size={16} className="text-[#0a66c2]" />
            <h2 className="text-sm font-bold text-[#191919]">Evaluation Metrics</h2>
          </div>
          <MetricsView />
        </div>
      )}
    </div>
  );
}
