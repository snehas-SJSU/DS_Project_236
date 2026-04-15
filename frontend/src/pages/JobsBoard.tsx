import { useState, useEffect } from 'react';
import { Job } from '../mockData/jobs';
import JobCard from '../components/shared/JobCard';
import Navbar from '../components/layout/Navbar';
import { Sparkles, FileText, CheckCircle2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { MEMBER_ID, resolveAvatarUrl } from '../lib/memberProfile';
import { addActivity, readJson, SAVED_JOBS_KEY, writeJson } from '../lib/localData';

export default function JobsBoard() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [activeJob, setActiveJob] = useState<Job | null>(null);
  const [isApplying, setIsApplying] = useState(false);
  const [loading, setLoading] = useState(true);
  const [keyword, setKeyword] = useState('');
  const [locationFilter, setLocationFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [member, setMember] = useState<{ name: string; location: string; headline: string; photo: string }>({
    name: 'Sneha Singh',
    location: 'San Jose, California',
    headline: 'MS Student | Distributed Systems',
    photo: resolveAvatarUrl(undefined, 'Sneha Singh')
  });

  const fetchJobs = () => {
    setLoading(true);
    fetch('http://localhost:4000/api/jobs/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        keyword: keyword || undefined,
        location: locationFilter || undefined,
        type: typeFilter || undefined
      })
    })
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) {
          setJobs(data);
          if (data.length > 0) setActiveJob(data[0]);
        }
        setLoading(false);
      })
      .catch(err => {
        console.error('Failed to fetch jobs:', err);
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchJobs();
    fetch('http://localhost:4000/api/members/get', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ member_id: MEMBER_ID })
    })
      .then((res) => res.json())
      .then((data) => {
        if (!data || data.error) return;
        setMember({
          name: data.name || 'Sneha Singh',
          location: data.location || 'San Jose, California',
          headline: data.headline || data.title || 'MS Student | Distributed Systems',
          photo: resolveAvatarUrl(data.profile_photo_url, data.name)
        });
      })
      .catch(() => undefined);
  }, []);

  const handleOpenJob = async (job: Job) => {
    setActiveJob(job);
    try {
      const response = await fetch('http://localhost:4000/api/jobs/get', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ job_id: job.id, member_id: MEMBER_ID })
      });
      const detail = await response.json();
      if (response.ok) setActiveJob({ ...job, ...detail });
    } catch (error) {
      console.error('Failed to load job detail', error);
    }
  };

  const handleApply = async () => {
    if (!activeJob) return;
    setIsApplying(true);
    try {
      const response = await fetch('http://localhost:4000/api/applications/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          job_id: activeJob.id,
          member_id: MEMBER_ID
        })
      });
      
      const data = await response.json().catch(() => ({}));
      if (response.ok) {
        addActivity(`Applied to ${activeJob.title} at ${activeJob.company}`);
        alert('Application submitted successfully!');
      } else {
        const msg = data.error === 'JOB_CLOSED'
          ? 'This job is closed — applications are not accepted.'
          : data.error === 'DUPLICATE_APPLICATION'
            ? 'You have already applied to this job.'
            : data.message || 'Failed to submit application.';
        alert(msg);
      }
    } catch (error) {
      console.error('Apply error:', error);
      alert('Error connecting to the application service.');
    } finally {
      setIsApplying(false);
    }
  };

  const handleSave = async () => {
    if (!activeJob) return;
    try {
      await fetch('http://localhost:4000/api/jobs/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ job_id: activeJob.id, member_id: MEMBER_ID })
      });
      const existing = readJson<any[]>(SAVED_JOBS_KEY, []);
      const next = [
        {
          id: activeJob.id,
          title: activeJob.title,
          company: activeJob.company,
          location: activeJob.location,
          savedAt: new Date().toLocaleDateString()
        },
        ...existing.filter((item) => item.id !== activeJob.id)
      ];
      writeJson(SAVED_JOBS_KEY, next.slice(0, 100));
      addActivity(`Saved job ${activeJob.title} at ${activeJob.company}`);
      alert('Job saved');
    } catch {
      alert('Unable to save job right now');
    }
  };

  return (
    <div className="min-h-screen bg-[#f3f2ef]">
      <Navbar />
      <div className="mx-auto max-w-[1128px] px-3 py-4">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <aside className="space-y-3 lg:col-span-3">
          <div className="li-card overflow-hidden p-0">
            <div className="h-14 bg-gradient-to-r from-[#9ec6e5] to-[#c9def0]" />
            <div className="px-4 pb-4">
              <div className="-mt-6 mb-2 h-12 w-12 overflow-hidden rounded-full border-2 border-white bg-slate-300">
                <img src={member.photo} alt="Profile" className="h-full w-full object-cover" />
              </div>
              <p className="text-lg font-semibold text-[#191919]">{member.name}</p>
              <p className="text-xs text-[#666666]">{member.location}</p>
              <p className="mt-0.5 text-xs text-[#666666]">{member.headline}</p>
            </div>
          </div>
          <div className="li-card p-4">
            <div className="space-y-2 text-sm font-semibold text-[#191919]">
              <Link to="/jobs/preferences" className="block hover:text-[#0a66c2]">Preferences</Link>
              <Link to="/jobs/tracker" className="block hover:text-[#0a66c2]">Job tracker</Link>
              <Link to="/jobs/insights" className="block hover:text-[#0a66c2]">My career insights</Link>
            </div>
            <div className="mt-4 border-t border-[#e0dfdc] pt-3">
              <Link to="/jobs/post" className="text-sm font-semibold text-[#0a66c2] hover:underline">Post a free job</Link>
            </div>
          </div>
          <div className="li-card p-4">
            <div className="flex items-center justify-between text-sm font-semibold text-[#191919]">
              <span>Profile viewers</span>
              <span className="text-[#0a66c2]">14</span>
            </div>
            <Link to="/analytics/member" className="mt-3 block text-base font-semibold text-[#191919] hover:text-[#0a66c2]">
              View all analytics
            </Link>
          </div>
        </aside>
          <main className="space-y-3 lg:col-span-9">
          <div className="li-card p-4">
            <h2 className="text-2xl font-semibold text-[#191919]">Jobs based on your preferences</h2>
            <p className="text-sm text-[#666666]">Explore jobs based on preferences you set in open to work.</p>
          </div>
          <div className="li-card flex items-center justify-between gap-3 px-4 py-2 text-sm text-[#444]">
            <p><span className="font-semibold">New:</span> Explore jobs based on preferences you set in open to work. Edit preferences or visibility at any time.</p>
            <button className="text-lg leading-none text-slate-500">×</button>
          </div>
          <div className="li-card p-3 space-y-2">
            <input
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="Search by title or keyword"
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
            <div className="flex gap-2">
              <input
                value={locationFilter}
                onChange={(e) => setLocationFilter(e.target.value)}
                placeholder="Location"
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className="w-44 rounded-md border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="">All types</option>
                <option value="Full-time">Full-time</option>
                <option value="Contract">Contract</option>
              </select>
              <button onClick={fetchJobs} className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white">
                Search
              </button>
            </div>
          </div>
          <section className="li-card overflow-hidden">
            <div className="border-b border-[#e0dfdc] px-4 py-2">
              <h3 className="text-lg font-semibold text-[#191919]">Top picks for you</h3>
            </div>
            <div className="max-h-[260px] overflow-y-auto">
            {loading ? (
              <div className="p-8 text-center text-slate-500">Loading live jobs...</div>
            ) : jobs.length === 0 ? (
              <div className="p-8 text-center text-slate-500">No jobs in the database yet. Post one via Swagger!</div>
            ) : (
              jobs.map((job) => (
                <JobCard 
                  key={job.id} 
                  job={job} 
                  isActive={activeJob?.id === job.id} 
                  onClick={() => handleOpenJob(job)} 
                />
              ))
            )}
            </div>
          </section>
          <section className="li-card overflow-hidden">
            <div className="border-b border-[#e0dfdc] px-4 py-2">
              <h3 className="text-lg font-semibold text-[#191919]">Jobs based on your activity</h3>
              <p className="text-xs text-[#666]">Including applies, searches and saves</p>
            </div>
            <div className="max-h-[220px] overflow-y-auto">
              {jobs.slice(0, 3).map((job) => (
                <button
                  key={`activity-${job.id}`}
                  onClick={() => handleOpenJob(job)}
                  className="w-full border-b border-[#f0f0f0] px-4 py-3 text-left hover:bg-[#f9fafb]"
                >
                  <p className="text-base font-semibold text-[#0a66c2]">{job.title}</p>
                  <p className="text-sm text-[#444]">{job.company} • {job.location}</p>
                  <p className="text-xs text-[#666] mt-1">{job.type} • {job.salary}</p>
                </button>
              ))}
            </div>
          </section>
          <div className="li-card p-6">
            {activeJob ? (
              <>
                <div className="flex justify-between items-start mb-6">
                  <div>
                    <h1 className="text-3xl font-semibold text-slate-900 mb-2">{activeJob.title}</h1>
                    <div className="text-lg text-slate-700">
                      <Link to="/company/acme" className="hover:text-[#0a66c2] hover:underline">{activeJob.company}</Link> •{' '}
                      <Link to="/jobs/preferences" className="hover:text-[#0a66c2] hover:underline">{activeJob.location}</Link>
                    </div>
                    <div className="text-sm text-slate-500 mt-2 font-medium">
                      {activeJob.type} • {activeJob.salary} • {activeJob.postedAt}
                    </div>
                    <div className="mt-2 text-xs text-slate-500">
                      Applicants: {activeJob.applicants ?? 0} • Industry: {activeJob.industry || 'Technology'}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button 
                      onClick={handleApply}
                      disabled={isApplying}
                      className="bg-blue-600 text-white px-8 py-2.5 rounded-full font-semibold hover:bg-blue-700 transition shadow-sm disabled:opacity-70 flex items-center justify-center min-w-[120px]"
                    >
                      {isApplying ? 'Sending...' : 'Easy Apply'}
                    </button>
                    <button
                      onClick={handleSave}
                      className="rounded-full border border-blue-600 px-6 py-2.5 font-semibold text-blue-700 hover:bg-blue-50"
                    >
                      Save
                    </button>
                  </div>
                </div>

                <hr className="border-slate-100 mb-6" />
                
                <h3 className="font-semibold text-lg mb-3">About the role</h3>
                <p className="text-slate-700 leading-relaxed max-w-3xl">
                  {activeJob.description}
                </p>
                <div className="mt-4">
                  <h4 className="text-sm font-semibold text-slate-900 mb-2">Top skills for this job</h4>
                  <div className="flex flex-wrap gap-2">
                    {activeJob.skills?.map((skill) => (
                      <span key={skill} className="rounded-full border border-[#d0d7de] bg-white px-3 py-1 text-xs font-semibold text-[#44546a]">
                        {skill}
                      </span>
                    ))}
                  </div>
                </div>
              </>
            ) : (
              <div className="flex items-center justify-center text-slate-400">Select a job to view details</div>
            )}
          </div>
          <div className="bg-gradient-to-br from-indigo-50 to-blue-50 rounded-lg shadow-sm border border-indigo-100 p-6 mb-8">
            <div className="flex items-center gap-2 mb-4">
              <div className="p-1.5 bg-indigo-600 rounded-md shadow-sm">
                <Sparkles size={18} className="text-white" />
              </div>
              <h3 className="font-semibold text-indigo-900">Career Coach AI</h3>
            </div>
            
            <div className="bg-white rounded-md p-4 border border-indigo-50 shadow-sm text-sm text-slate-700 leading-relaxed mb-4">
              <span className="font-semibold text-indigo-700 mr-2">Quick analysis:</span>
              Based on your profile, you have an <strong className="text-green-600">85% match</strong> for this position. Your experiences with <span className="bg-slate-100 px-1 rounded">React</span> and <span className="bg-slate-100 px-1 rounded">FastAPI</span> align perfectly. However, you might want to highlight your <span className="bg-slate-100 px-1 rounded">Kafka</span> experience more prominently in your headline before applying.
            </div>

            <div className="flex gap-3">
              <Link to="/profile" className="flex items-center gap-2 text-sm font-medium text-indigo-600 bg-white border border-indigo-200 px-4 py-2 rounded-full hover:bg-indigo-50 transition">
                <FileText size={16} /> Look at my resume
              </Link>
              <Link to="/messaging" className="flex items-center gap-2 text-sm font-medium text-slate-600 bg-white border border-slate-200 px-4 py-2 rounded-full hover:bg-slate-50 transition">
                <CheckCircle2 size={16} /> Help me draft an outreach message
              </Link>
            </div>
          </div>
          </main>
        </div>
      </div>
    </div>
  );
}
