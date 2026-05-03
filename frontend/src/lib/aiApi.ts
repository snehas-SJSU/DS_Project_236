// ─── AI Service API Client ────────────────────────────────────────────────────
// Base URL routes through the core FastAPI app on :4000 (/api/ai/...)
const AI_BASE = '/api/ai';

// ─── Types ────────────────────────────────────────────────────────────────────

export type TaskState =
  | 'queued'
  | 'processing'
  | 'awaiting_approval'
  | 'approved'
  | 'rejected'
  | 'completed'
  | 'failed';

export type StepName =
  | 'discover_candidates'
  | 'resume_parse'
  | 'match_score'
  | 'shortlist'
  | 'outreach_draft';

export type StepStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface TaskStep {
  step_name: StepName;
  status: StepStatus;
  started_at: string | null;
  ended_at: string | null;
  output_summary: string | null;
  output_data?: Record<string, unknown>;
  error?: string | null;
  attempt?: number;
}

export interface CandidateMatch {
  candidate_id: string;
  name?: string;
  headline?: string;
  match_score: number;
  skills_overlap: number;
  skills_matched?: string[];
  location?: string;
  seniority?: string;
  rationale?: string;
}

export interface OutreachDraftRow {
  member_id: string;
  name?: string;
  draft: string;
}

export interface TaskResult {
  shortlist?: CandidateMatch[];
  outreach_draft?: string | null;
  outreach_drafts?: OutreachDraftRow[];
  candidate_ids?: string[];
  explanation?: string;
}

export interface ApprovalRecord {
  decision: 'approve' | 'edit' | 'reject';
  edited_text?: string;
  edited_drafts?: Record<string, string>;
  reviewer_id: string;
  recorded_at: string;
  original_text?: string;
}

export interface AITask {
  task_id: string;
  trace_id: string;
  task_type: string;
  state: TaskState;
  current_step?: StepName | null;
  steps: TaskStep[];
  result: TaskResult | null;
  error?: string | null;
  approval?: ApprovalRecord | null;
  created_at: string;
  updated_at: string;
  job_id?: string;
  candidate_ids?: string[];
  actor_id?: string;
}

export type SubmitTaskRequest =
  | {
      task_type: 'candidate_shortlist';
      job_id: string;
      actor_id: string;
      /** Optional; omit to let the backend load applicants for the job. */
      candidate_ids?: string[];
      trace_id?: string;
      client_request_id?: string;
    }
  | {
      task_type: 'generate_outreach';
      job_id: string;
      actor_id: string;
      candidate_ids: string[];
      trace_id?: string;
      client_request_id?: string;
    };

export interface SubmitTaskResponse {
  task_id: string;
  trace_id: string;
  state: TaskState;
  created_at: string;
}

export interface ApproveTaskRequest {
  decision: 'approve' | 'edit' | 'reject';
  edited_text?: string;
  /** Per-member edited body when multiple candidates received drafts. */
  edited_drafts?: Record<string, string>;
  reviewer_id: string;
}

export interface ApproveTaskResponse {
  task_id: string;
  trace_id: string;
  state: TaskState;
  decision: string;
  recorded_at: string;
}

export interface WsProgressEvent {
  task_id: string;
  trace_id: string;
  state: TaskState;
  current_step?: StepName | null;
  step_status?: StepStatus;
  progress_pct: number;
  message: string;
  timestamp: string;
}

export interface AIMetrics {
  total_tasks: number;
  completed_tasks: number;
  approval_rate: number;
  edit_rate: number;
  rejection_rate: number;
  avg_match_score: number;
  avg_completion_ms: number;
  tasks_by_state: Record<string, number>;
}

// ─── API Calls ────────────────────────────────────────────────────────────────

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${AI_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(err.message || `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export const aiApi = {
  submitTask: (body: SubmitTaskRequest) =>
    request<SubmitTaskResponse>('/tasks/submit', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  getTask: (taskId: string) => request<AITask>(`/tasks/${taskId}`),

  approveTask: (taskId: string, body: ApproveTaskRequest) =>
    request<ApproveTaskResponse>(`/tasks/${taskId}/approve`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  listTasks: (actorId: string) =>
    request<AITask[]>(`/tasks?actor_id=${encodeURIComponent(actorId)}`),

  getMetrics: () => request<AIMetrics>('/metrics'),
};

// ─── WebSocket helper ─────────────────────────────────────────────────────────

export function connectTaskWebSocket(
  taskId: string,
  onEvent: (e: WsProgressEvent) => void,
  onClose?: () => void
): () => void {
  const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
  const wsUrl = `${protocol}://${window.location.host}/api/ai/ws/ai/tasks/${taskId}`;
  const ws = new WebSocket(wsUrl);

  ws.onmessage = (ev) => {
    try {
      const data = JSON.parse(ev.data as string) as WsProgressEvent;
      onEvent(data);
    } catch {
      /* ignore parse errors */
    }
  };
  ws.onclose = () => onClose?.();
  ws.onerror = () => ws.close();

  return () => ws.close();
}
