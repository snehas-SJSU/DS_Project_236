import type { Job } from '../mockData/jobs';

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
      return {
        id,
        title: String(row?.title ?? ''),
        company: String(row?.company ?? ''),
        location: String(row?.location ?? ''),
        salary: String(row?.salary ?? ''),
        type: String(row?.type ?? row?.employment_type ?? ''),
        postedAt: String(row?.postedAt ?? row?.posted_at ?? 'Just now'),
        skills,
        description: String(row?.description ?? ''),
        applicants: row?.applicants ?? row?.applicants_count ?? 0,
        industry: row?.industry,
        remote_mode: row?.remote_mode,
        seniority_level: row?.seniority_level,
        employment_type: row?.employment_type,
        recruiter_id: row?.recruiter_id,
        status: row?.status
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
  return {
    ...job,
    ...detail,
    id,
    skills,
    applicants: detail?.applicants_count ?? detail?.applicants ?? job.applicants
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
  return {
    id: String(rawId),
    title: String(detail.title ?? ''),
    company: String(detail.company ?? ''),
    location: String(detail.location ?? ''),
    salary: String(detail.salary ?? ''),
    type: String(detail.type ?? detail.employment_type ?? ''),
    postedAt: 'Just now',
    skills,
    description: String(detail.description ?? ''),
    applicants: detail.applicants_count ?? detail.applicants ?? 0,
    industry: detail.industry,
    remote_mode: detail.remote_mode,
    seniority_level: detail.seniority_level,
    employment_type: detail.employment_type,
    recruiter_id: detail.recruiter_id,
    status: detail.status
  };
}
