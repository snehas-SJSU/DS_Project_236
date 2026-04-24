import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { MEMBER_ID } from '../lib/memberProfile';
import { jobFromGetPayload, mergeJobDetail, normalizeJobListRows } from '../lib/jobNormalize';
import { companyProfilePath, jobsResultsPath, jobsSearchPath } from '../lib/jobRoutes';
import { showToast } from '../lib/toast';
import type { Job } from '../mockData/jobs';

export default function JobApplyPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const jobId = useMemo(() => searchParams.get('jobId')?.trim() || '', [searchParams]);

  const [job, setJob] = useState<Job | null>(null);
  const [loadingJob, setLoadingJob] = useState(true);
  const [error, setError] = useState('');

  const [resumeText, setResumeText] = useState('');
  const [resumeUrl, setResumeUrl] = useState('');
  const [coverLetter, setCoverLetter] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (!jobId) {
      setLoadingJob(false);
      setError('Missing job id. Open this page from a job posting.');
      return;
    }

    let cancelled = false;
    setLoadingJob(true);
    setError('');

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
        if ((merged as any).applied) setSubmitted(true);
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
      const res = await fetch('/api/applications/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
        const msg = data.error === 'DUPLICATE_APPLICATION'
          ? 'You already applied to this job.'
          : data.error === 'JOB_CLOSED'
            ? 'This job is closed.'
            : data.message || 'Unable to submit application right now.';
        showToast(msg, 'error');
        return;
      }

      setSubmitted(true);
      setJob((prev) => (prev ? ({ ...prev, applied: true } as any) : prev));
      showToast('Application submitted successfully', 'success');
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
        <h1 className="mt-2 text-3xl font-semibold text-[#191919]">{job.title}</h1>
        <p className="mt-2 text-sm text-[#444]">
          <Link to={companyProfilePath(job.company)} className="hover:text-[#0a66c2] hover:underline">
            {job.company}
          </Link>
          {' · '}
          <Link to={jobsSearchPath({ location: job.location })} className="hover:text-[#0a66c2] hover:underline">
            {job.location}
          </Link>
        </p>
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
