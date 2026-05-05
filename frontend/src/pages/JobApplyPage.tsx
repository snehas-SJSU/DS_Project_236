import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { jobFromGetPayload, mergeJobDetail } from '../lib/jobNormalize';
import { companyProfilePath, jobsResultsPath, jobsSearchPath } from '../lib/jobRoutes';
import { showToast } from '../lib/toast';
import type { Job } from '../mockData/jobs';
import CompanyLogoTile from '../components/shared/CompanyLogoTile';

export default function JobApplyPage() {
  const MEMBER_ID = sessionStorage.getItem('li_sim_member_id') || 'M-123';
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const jobId = useMemo(() => searchParams.get('jobId')?.trim() || '', [searchParams]);
  const returnTo = useMemo(() => searchParams.get('returnTo')?.trim() || '', [searchParams]);

  const [job, setJob] = useState<Job | null>(null);
  const [loadingJob, setLoadingJob] = useState(true);
  const [error, setError] = useState('');

  const [resumeText, setResumeText] = useState('');
  const [resumeUrl, setResumeUrl] = useState('');
  const [coverLetter, setCoverLetter] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  /** True only after a successful submit this session (not when opening an already-applied job). */
  const [afterFreshSubmit, setAfterFreshSubmit] = useState(false);
  const [userCancelledRedirect, setUserCancelledRedirect] = useState(false);
  const redirectRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!jobId) {
      setLoadingJob(false);
      setError('Missing job id. Open this page from a job posting.');
      return;
    }

    let cancelled = false;
    setLoadingJob(true);
    setError('');
    setAfterFreshSubmit(false);
    setUserCancelledRedirect(false);

    fetch('/api/jobs/get', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ job_id: jobId, member_id: MEMBER_ID })
    })
      .then((res) => res.json().then((data) => ({ ok: res.ok, data })))
      .then(({ ok, data }) => {
        if (cancelled) return;
        if (!ok || !data || data.error) {
          setError('Unable to load job details.');
          setJob(null);
          return;
        }
        const base = jobFromGetPayload(data);
        if (!base) {
          setError('Job not found.');
          setJob(null);
          return;
        }
        const merged = mergeJobDetail(base, data);
        setJob(merged);
        if ((merged as any).applied) {
          setSubmitted(true);
        } else {
          // Emit apply.start for funnel analytics (fire-and-forget, once per job/member/day)
          const ts = new Date().toISOString().replace(/\.\d+Z$/, '.000Z');
          const today = ts.slice(0, 10);
          const traceId = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}`;
          fetch('/api/events/ingest', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              event_type: 'apply.start',
              trace_id: traceId,
              timestamp: ts,
              actor_id: MEMBER_ID,
              entity: { entity_type: 'job', entity_id: jobId },
              payload: { job_id: jobId, member_id: MEMBER_ID },
              idempotency_key: `apply-start:${jobId}:${MEMBER_ID}:${today}`
            })
          }).catch(() => undefined);
        }
      })
      .catch(() => {
        if (cancelled) return;
        setError('Unable to load job details.');
        setJob(null);
      })
      .finally(() => {
        if (!cancelled) setLoadingJob(false);
      });

    return () => {
      cancelled = true;
    };
  }, [jobId]);

  useEffect(() => {
    if (!afterFreshSubmit || userCancelledRedirect) return;
    redirectRef.current = setTimeout(() => {
      navigate('/applications');
    }, 4000);
    return () => {
      if (redirectRef.current) {
        clearTimeout(redirectRef.current);
        redirectRef.current = null;
      }
    };
  }, [afterFreshSubmit, userCancelledRedirect, navigate]);

  const cancelRedirect = () => {
    if (redirectRef.current) {
      clearTimeout(redirectRef.current);
      redirectRef.current = null;
    }
    setUserCancelledRedirect(true);
  };

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!job) return;
    const text = resumeText.trim();
    if (!text) {
      showToast('Resume Text is required.', 'error');
      return;
    }

    setIsSubmitting(true);
    try {
      const traceId = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      const res = await fetch('/api/applications/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-trace-id': traceId },
        body: JSON.stringify({
          job_id: job.id,
          member_id: MEMBER_ID,
          resume_text: text,
          resume_url: resumeUrl.trim() || undefined,
          cover_letter: coverLetter.trim() || undefined
        })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data.error === 'DUPLICATE_APPLICATION') {
          setSubmitted(true);
          setJob((prev) => (prev ? ({ ...prev, applied: true } as any) : prev));
          showToast('You already applied to this job.', 'info');
          if (returnTo === 'tracker') {
            navigate(`/jobs/tracker?appliedJobId=${encodeURIComponent(job.id)}`, { replace: true });
          }
          return;
        }
        const msg =
          data.error === 'DUPLICATE_APPLICATION'
            ? 'You already applied to this job.'
          : data.error === 'JOB_CLOSED'
            ? 'This job is closed.'
            : data.message || 'Unable to submit application right now.';
        showToast(msg, 'error');
        return;
      }

      setSubmitted(true);
      setAfterFreshSubmit(true);
      setJob((prev) => (prev ? ({ ...prev, applied: true } as any) : prev));
      showToast('Application submitted successfully', 'success');
      if (returnTo === 'tracker') {
        navigate(`/jobs/tracker?appliedJobId=${encodeURIComponent(job.id)}`, { replace: true });
      }
    } catch {
      showToast('Unable to submit application right now.', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loadingJob) {
    return <div className="li-card p-5 text-sm text-[#666]">Loading job details...</div>;
  }

  if (!job) {
    return (
      <div className="li-card p-5">
        <p className="text-sm text-[#9f2d2d]">{error || 'Job not found.'}</p>
        <Link to="/jobs/search-results" className="mt-3 inline-block text-sm font-semibold text-[#0a66c2] hover:underline">
          Back to jobs
        </Link>
      </div>
    );
  }

  const skills = Array.isArray(job.skills) ? job.skills.filter(Boolean) : [];

  return (
    <div className="space-y-4">
      <section className="li-card p-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-[#666]">Job details</p>
        <div className="mt-3 flex gap-4">
          <CompanyLogoTile logoUrl={job.logoUrl} companyName={job.company} className="h-16 w-16 shrink-0" />
          <div className="min-w-0 flex-1">
            <h1 className="text-3xl font-semibold text-[#191919]">{job.title}</h1>
            <p className="mt-2 text-sm text-[#444]">
              <Link to={companyProfilePath(job.company)} className="hover:text-[#0a66c2] hover:underline">
                {job.company}
              </Link>
              {' · '}
              <Link to={jobsSearchPath({ location: job.location })} className="hover:text-[#0a66c2] hover:underline">
                {job.location}
              </Link>
            </p>
          </div>
        </div>
        <p className="mt-4 text-sm leading-relaxed text-[#333]">{job.description || 'No description provided.'}</p>
        <div className="mt-4">
          <p className="text-sm font-semibold text-[#191919]">Skills required</p>
          {skills.length ? (
            <div className="mt-2 flex flex-wrap gap-2">
              {skills.map((skill) => (
                <span key={skill} className="rounded-full border border-[#d0d7de] bg-[#f8fafc] px-3 py-1 text-xs text-[#334155]">
                  {skill}
                </span>
              ))}
            </div>
          ) : (
            <p className="mt-1 text-sm text-[#666]">No skill list provided.</p>
          )}
        </div>
      </section>

      <section className="li-card p-5">
        <h2 className="text-xl font-semibold text-[#191919]">Application form</h2>
        {submitted ? (
          <div className="mt-4 rounded-lg border border-[#057642] bg-[#eef7f1] px-4 py-3 text-sm text-[#191919]">
            <p className="font-semibold text-[#114e2f]">
              {afterFreshSubmit ? 'Application sent' : 'You already applied to this job'}
            </p>
            <p className="mt-1 text-[#333]">
              {afterFreshSubmit
                ? 'You can review status under My applications, or keep browsing open roles.'
                : 'Your application is on file. You can view it anytime under My applications.'}
            </p>
            {afterFreshSubmit && !userCancelledRedirect ? (
              <p className="mt-2 text-xs text-[#555]">Taking you to My applications in a few seconds…</p>
            ) : null}
            <div className="mt-3 flex flex-wrap gap-2">
              <Link
                to="/applications"
                onClick={cancelRedirect}
                className="inline-flex rounded-full bg-[#0a66c2] px-4 py-2 text-sm font-semibold text-white hover:bg-[#004182]"
              >
                My applications
              </Link>
              <Link
                to="/jobs"
                onClick={cancelRedirect}
                className="inline-flex rounded-full border border-[#0a66c2] px-4 py-2 text-sm font-semibold text-[#0a66c2] hover:bg-[#edf3f8]"
              >
                More jobs
              </Link>
              <button
                type="button"
                onClick={() => {
                  cancelRedirect();
                  navigate(jobsResultsPath(job.id));
                }}
                className="inline-flex rounded-full border border-[#d0d7de] px-4 py-2 text-sm font-semibold text-[#444] hover:bg-[#f3f2ef]"
              >
                Back to job posting
              </button>
              {afterFreshSubmit && !userCancelledRedirect ? (
                <button
                  type="button"
                  onClick={cancelRedirect}
                  className="inline-flex rounded-full border border-transparent px-4 py-2 text-sm font-semibold text-[#666] underline hover:text-[#191919]"
                >
                  Stay on this page
                </button>
              ) : null}
            </div>
          </div>
        ) : null}
        <form className="mt-4 space-y-4" onSubmit={onSubmit}>
          <label className="block">
            <span className="mb-1 block text-sm font-semibold text-[#191919]">Resume Text</span>
            <textarea
              required
              value={resumeText}
              onChange={(e) => setResumeText(e.target.value)}
              placeholder="Paste your resume content. This text is used by the AI resume parser and matching pipeline."
              rows={8}
              disabled={submitted || isSubmitting}
              className="w-full rounded-md border border-[#cfd6dc] px-3 py-2 text-sm text-[#191919] outline-none focus:border-[#0a66c2]"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-sm font-semibold text-[#191919]">Resume URL (optional)</span>
            <input
              type="url"
              value={resumeUrl}
              onChange={(e) => setResumeUrl(e.target.value)}
              placeholder="https://..."
              disabled={submitted || isSubmitting}
              className="w-full rounded-md border border-[#cfd6dc] px-3 py-2 text-sm text-[#191919] outline-none focus:border-[#0a66c2]"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-sm font-semibold text-[#191919]">Cover Letter (optional)</span>
            <textarea
              value={coverLetter}
              onChange={(e) => setCoverLetter(e.target.value)}
              rows={5}
              disabled={submitted || isSubmitting}
              className="w-full rounded-md border border-[#cfd6dc] px-3 py-2 text-sm text-[#191919] outline-none focus:border-[#0a66c2]"
            />
          </label>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="submit"
              disabled={submitted || isSubmitting}
              className="rounded-full bg-[#0a66c2] px-5 py-2 text-sm font-semibold text-white hover:bg-[#004182] disabled:cursor-not-allowed disabled:bg-[#9ec6e5]"
            >
              {submitted ? 'Application Submitted' : isSubmitting ? 'Submitting...' : 'Submit application'}
            </button>
            <button
              type="button"
              onClick={() => navigate(jobsResultsPath(job.id))}
              className="rounded-full border border-[#d0d7de] px-5 py-2 text-sm font-semibold text-[#444] hover:bg-[#f3f2ef]"
            >
              Back to job
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
