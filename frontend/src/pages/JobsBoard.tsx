import { useState, useEffect } from 'react';
import { Job } from '../mockData/jobs';
import JobCard from '../components/shared/JobCard';
import Navbar from '../components/layout/Navbar';
import { Link } from 'react-router-dom';
import { resolveViewerAvatarUrl } from '../lib/memberProfile';
import { normalizeJobListRows } from '../lib/jobNormalize';

export default function JobsBoard() {
  const MEMBER_ID = sessionStorage.getItem('li_sim_member_id') || 'M-123';
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [keyword, setKeyword] = useState('');
  const [locationFilter, setLocationFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [member, setMember] = useState<{ name: string; location: string; headline: string; photo: string }>({
    name: '',
    location: '',
    headline: '',
    photo: resolveViewerAvatarUrl(undefined, '')
  });

  const fetchJobs = () => {
    setLoading(true);
    const basePayload = {
      keyword: keyword || undefined,
      location: locationFilter || undefined,
      type: typeFilter || undefined
    };
    fetch('/api/jobs/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(basePayload)
    })
      .then(res => res.json())
      .then(async data => {
        let rows = normalizeJobListRows(Array.isArray(data) ? data : []);
        const shouldRetryAsLocation =
          !rows.length &&
          !locationFilter.trim() &&
          Boolean(keyword.trim());
        if (shouldRetryAsLocation) {
          const retry = await fetch('/api/jobs/search', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              ...basePayload,
              keyword: undefined,
              location: keyword.trim()
            })
          });
          const retryData = await retry.json().catch(() => []);
          rows = normalizeJobListRows(Array.isArray(retryData) ? retryData : []);
        }
        setJobs(rows);
        setLoading(false);
      })
      .catch(err => {
        console.error('Failed to fetch jobs:', err);
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchJobs();
    fetch('/api/members/get', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ member_id: MEMBER_ID })
    })
      .then((res) => res.json())
      .then((data) => {
        if (!data || data.error) return;
        setMember({
          name: data.name || '',
          location: data.location || '',
          headline: data.headline || data.title || '',
          photo: resolveViewerAvatarUrl(data.profile_photo_url, data.name)
        });
      })
      .catch(() => undefined);
  }, []);

  return (
    <div className="min-h-screen bg-[#f3f2ef]">
      <Navbar />
      <div className="mx-auto max-w-[1128px] px-3 py-4">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <aside className="space-y-3 lg:col-span-3">
          <div className="li-card overflow-hidden p-0">
            <div className="h-14 bg-gradient-to-r from-[#9ec6e5] to-[#c9def0]" />
            <div className="px-4 pb-4">
              <Link
                to={`/profile/${encodeURIComponent(MEMBER_ID)}`}
                className="-mt-6 mb-2 block h-12 w-12 overflow-hidden rounded-full border-2 border-white bg-slate-300"
              >
                <img src={member.photo} alt="Profile" className="h-full w-full object-cover" />
              </Link>
              <Link to={`/profile/${encodeURIComponent(MEMBER_ID)}`} className="text-lg font-semibold text-[#191919] hover:text-[#0a66c2] hover:underline">
                {member.name}
              </Link>
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
            <div>
            {loading ? (
              <div className="p-8 text-center text-slate-500">Loading live jobs...</div>
            ) : jobs.length === 0 ? (
              <div className="p-8 text-center text-slate-500">No jobs in the database yet. Post one via Swagger!</div>
            ) : (
              jobs.slice(0, 6).map((job) => (
                <JobCard 
                  key={job.id} 
                  job={job}
                />
              ))
            )}
            </div>
            {jobs.length > 6 ? (
              <div className="border-t border-[#e0dfdc] px-4 py-2 text-center">
                <Link to="/jobs/search-results" className="text-sm font-semibold text-[#444] hover:text-[#0a66c2]">
                  Show all →
                </Link>
              </div>
            ) : null}
          </section>
          <section className="li-card overflow-hidden">
            <div className="border-b border-[#e0dfdc] px-4 py-2">
              <h3 className="text-lg font-semibold text-[#191919]">Jobs based on your activity</h3>
              <p className="text-xs text-[#666]">Including applies, searches and saves</p>
            </div>
            <div>
              {jobs.slice(6, 12).map((job) => (
                <JobCard key={`activity-${job.id}`} job={job} />
              ))}
            </div>
            {jobs.length > 12 ? (
              <div className="border-t border-[#e0dfdc] px-4 py-2 text-center">
                <Link to="/jobs/search-results" className="text-sm font-semibold text-[#444] hover:text-[#0a66c2]">
                  Show all →
                </Link>
              </div>
            ) : null}
          </section>
          </main>
        </div>
      </div>
    </div>
  );
}
