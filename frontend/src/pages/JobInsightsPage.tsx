import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { MEMBER_ID } from '../lib/memberProfile';

type JobItem = {
  id: string;
  title: string;
  company: string;
  skills?: string[];
  location?: string;
};

export default function JobInsightsPage() {
  const [skills, setSkills] = useState<string[]>([]);
  const [jobs, setJobs] = useState<JobItem[]>([]);

  useEffect(() => {
    fetch('http://localhost:4000/api/members/get', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ member_id: MEMBER_ID })
    })
      .then((res) => res.json())
      .then((data) => setSkills(Array.isArray(data?.skills) ? data.skills : []))
      .catch(() => setSkills([]));

    fetch('http://localhost:4000/api/jobs/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    })
      .then((res) => res.json())
      .then((data) => setJobs(Array.isArray(data) ? data : []))
      .catch(() => setJobs([]));
  }, []);

  const topMatches = useMemo(() => {
    const score = (job: JobItem) => {
      const jobSkills = Array.isArray(job.skills) ? job.skills : [];
      return jobSkills.filter((skill) => skills.includes(skill)).length;
    };
    return [...jobs]
      .map((job) => ({ ...job, matchScore: score(job) }))
      .sort((a, b) => b.matchScore - a.matchScore)
      .slice(0, 5);
  }, [jobs, skills]);

  return (
    <div className="space-y-3">
      <section className="li-card p-5">
        <h1 className="text-xl font-semibold text-[#191919]">Career Insights</h1>
        <p className="mt-1 text-sm text-[#666]">Skill-based recommendations from your profile and live jobs.</p>
      </section>

      <section className="li-card p-5">
        <h2 className="text-sm font-semibold text-[#191919]">Top profile skills ({skills.length})</h2>
        {skills.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">No skills on profile yet. Add them in profile edit to improve recommendations.</p>
        ) : (
          <div className="mt-2 flex flex-wrap gap-2">
            {skills.map((skill) => (
              <span key={skill} className="rounded-full border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-700">
                {skill}
              </span>
            ))}
          </div>
        )}
      </section>

      <section className="li-card p-5">
        <h2 className="text-sm font-semibold text-[#191919]">Top matched jobs</h2>
        {topMatches.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">No jobs available yet. Visit jobs home to fetch postings.</p>
        ) : (
          <div className="mt-2 space-y-2">
            {topMatches.map((job: any) => (
              <div key={job.id} className="rounded-lg border border-slate-200 p-3">
                <p className="font-semibold text-slate-900">{job.title}</p>
                <p className="text-sm text-slate-600">{job.company} • {job.location || 'Location TBD'}</p>
                <p className="text-xs text-[#057642]">Skill match score: {job.matchScore}</p>
              </div>
            ))}
          </div>
        )}
        <div className="mt-3">
          <Link to="/jobs" className="rounded-full border border-[#0a66c2] px-4 py-1.5 text-sm font-semibold text-[#0a66c2] hover:bg-[#edf3f8]">
            Explore all jobs
          </Link>
        </div>
      </section>
    </div>
  );
}

