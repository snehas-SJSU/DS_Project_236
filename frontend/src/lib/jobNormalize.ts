import type { Job } from '../mockData/jobs';

/** Parse DB/API datetime (ISO or `YYYY-MM-DD HH:mm:ss`) for `Date`. */
function parseJobDate(raw: unknown): Date | null {
  if (raw == null) return null;
  if (raw instanceof Date) return Number.isNaN(raw.getTime()) ? null : raw;
  const s = String(raw).trim();
  if (!s) return null;
  const normalized = s.includes('T') || s.endsWith('Z') ? s : s.replace(' ', 'T');
  const d = new Date(normalized);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Human-readable posted time in the viewer's locale (actual post time, not a placeholder). */
export function formatJobPostedAt(raw: unknown): string {
  const d = parseJobDate(raw);
  if (!d) return 'Date unknown';
  return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

/** Prefer real `created_at`; fall back to legacy `postedAt` string (e.g. mock data). */
function postedLabelFromRow(row: any): string {
  const fromDt = formatJobPostedAt(row?.posted_datetime ?? row?.created_at);
  if (fromDt !== 'Date unknown') return fromDt;
  const legacy = row?.postedAt ?? row?.posted_at;
  if (legacy != null && String(legacy).trim()) return String(legacy).trim();
  return 'Date unknown';
}

/** Normalize rows returned by POST /jobs/search to consistent Job shape. */
export function normalizeJobListRows(rows: any[]): Job[] {
  return (Array.isArray(rows) ? rows : [])
    .map((row: any) => {
      const id = String(row?.id ?? row?.job_id ?? '').trim();
      if (!id) return null;
      const skills = Array.isArray(row?.skills)
        ? row.skills
        : typeof row?.skills === 'string'
          ? JSON.parse(row.skills || '[]')
          : [];
      const logo =
        (row?.company_logo_url && String(row.company_logo_url)) ||
        (row?.logoUrl && String(row.logoUrl)) ||
        undefined;
      return {
        id,
        title: String(row?.title ?? ''),
        company: String(row?.company ?? ''),
        logoUrl: logo || undefined,
        location: String(row?.location ?? ''),
        salary: String(row?.salary ?? ''),
        type: String(row?.type ?? row?.employment_type ?? ''),
        postedAt: postedLabelFromRow(row),
        skills,
        description: String(row?.description ?? ''),
        applicants: row?.applicants ?? row?.applicants_count ?? 0,
        industry: row?.industry,
        remote_mode: row?.remote_mode,
        seniority_level: row?.seniority_level,
        employment_type: row?.employment_type,
        recruiter_id: row?.recruiter_id,
        status: row?.status,
        views_count: Number(row?.views_count ?? 0) || 0
      } as Job;
    })
    .filter((j): j is Job => Boolean(j));
}

/** Merge list row with GET /jobs/get payload (uses `job_id` from DB). */
export function mergeJobDetail(job: Job, detail: any): Job {
  const skills = Array.isArray(detail?.skills)
    ? detail.skills
    : typeof detail?.skills === 'string'
      ? JSON.parse(detail.skills || '[]')
      : job.skills;
  const id = job.id || String(detail?.job_id ?? detail?.id ?? '');
  const mergedLogo =
    (detail?.company_logo_url && String(detail.company_logo_url)) ||
    (detail?.logoUrl && String(detail.logoUrl)) ||
    job.logoUrl;
  const detailPosted = formatJobPostedAt(detail?.posted_datetime ?? detail?.created_at);
  return {
    ...job,
    ...detail,
    id,
    skills,
    logoUrl: mergedLogo || undefined,
    applicants: detail?.applicants_count ?? detail?.applicants ?? job.applicants,
    postedAt: detailPosted !== 'Date unknown' ? detailPosted : job.postedAt,
    views_count: Number(detail?.views_count ?? job.views_count ?? 0) || 0
  };
}

/** Build a Job from GET response when the posting is not in the current search list. */
export function jobFromGetPayload(detail: any): Job | null {
  const rawId = detail?.job_id ?? detail?.id;
  if (!rawId) return null;
  const skills = Array.isArray(detail?.skills)
    ? detail.skills
    : typeof detail?.skills === 'string'
      ? JSON.parse(detail.skills || '[]')
      : [];
  const logo =
    (detail?.company_logo_url && String(detail.company_logo_url)) ||
    (detail?.logoUrl && String(detail.logoUrl)) ||
    undefined;
  return {
    id: String(rawId),
    title: String(detail.title ?? ''),
    company: String(detail.company ?? ''),
    logoUrl: logo || undefined,
    location: String(detail.location ?? ''),
    salary: String(detail.salary ?? ''),
    type: String(detail.type ?? detail.employment_type ?? ''),
    postedAt: postedLabelFromRow(detail),
    skills,
    description: String(detail.description ?? ''),
    applicants: detail.applicants_count ?? detail.applicants ?? 0,
    industry: detail.industry,
    remote_mode: detail.remote_mode,
    seniority_level: detail.seniority_level,
    employment_type: detail.employment_type,
    recruiter_id: detail.recruiter_id,
    status: detail.status,
    views_count: Number(detail?.views_count ?? 0) || 0
  };
}
