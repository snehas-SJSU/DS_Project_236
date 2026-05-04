import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line } from 'recharts';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Briefcase, Loader2, Users, MousePointerClick, BookmarkCheck, TrendingUp } from 'lucide-react';
import { Link } from 'react-router-dom';
import { getViewerRecruiterId } from '../lib/memberProfile';
import { normalizeJobListRows } from '../lib/jobNormalize';
import type { Job } from '../mockData/jobs';
import { showToast } from '../lib/toast';

const COLORS = ['#2563EB', '#3B82F6', '#60A5FA', '#93C5FD'];

export default function RecruiterDashboard() {
  const [windowDays, setWindowDays] = useState(30);
  const [topJobs, setTopJobs] = useState<any[]>([]);
  const [lowJobs, setLowJobs] = useState<any[]>([]);
  const [geo, setGeo] = useState<any[]>([]);
  const [clickJobs, setClickJobs] = useState<any[]>([]);
  const [saveJobs, setSaveJobs] = useState<any[]>([]);
  const [granularity, setGranularity] = useState<'day' | 'week'>('day');
  const [savedTrend, setSavedTrend] = useState<any[]>([]);
  const [clickTrend, setClickTrend] = useState<any[]>([]);
  const [funnel, setFunnel] = useState<{ view: number; save: number; apply_start: number; submit: number } | null>(null);
  const [myPostings, setMyPostings] = useState<Job[]>([]);
  const [myPostingsLoading, setMyPostingsLoading] = useState(true);
  const [closingJobId, setClosingJobId] = useState<string | null>(null);

  const selectedJobId = useMemo(() => topJobs[0]?.job_id || lowJobs[0]?.job_id, [topJobs, lowJobs]);

  const loadMyPostings = useCallback(async () => {
    const recruiterId = getViewerRecruiterId();
    setMyPostingsLoading(true);
    try {
      const res = await fetch('/api/jobs/byRecruiter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recruiter_id: recruiterId })
      });
      const data = await res.json().catch(() => []);
      const rows = Array.isArray(data) ? data : [];
      setMyPostings(normalizeJobListRows(rows));
    } catch {
      setMyPostings([]);
    } finally {
      setMyPostingsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadMyPostings();
  }, [loadMyPostings]);

  useEffect(() => {
    const body = { window_days: windowDays };
    fetch('/api/analytics/jobs/top', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...body, metric: 'applications' })
    }).then((r) => r.json()).then((d) => setTopJobs(d.jobs || [])).catch(() => setTopJobs([]));
    fetch('/api/analytics/jobs/top', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...body, metric: 'low_applications' })
    }).then((r) => r.json()).then((d) => setLowJobs(d.jobs || [])).catch(() => setLowJobs([]));
    fetch('/api/analytics/jobs/top', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...body, metric: 'clicks' })
    }).then((r) => r.json()).then((d) => setClickJobs(d.jobs || [])).catch(() => setClickJobs([]));
    fetch('/api/analytics/jobs/top', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...body, metric: 'saves' })
    }).then((r) => r.json()).then((d) => setSaveJobs(d.jobs || [])).catch(() => setSaveJobs([]));
  }, [windowDays]);

  useEffect(() => {
    const body = { window_days: windowDays, granularity };
    fetch('/api/analytics/jobs/timeseries', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...body, event_type: 'job.saved' })
    }).then((r) => r.json()).then((d) => setSavedTrend(d.series || [])).catch(() => setSavedTrend([]));
    fetch('/api/analytics/jobs/timeseries', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...body, event_type: 'job.viewed' })
    }).then((r) => r.json()).then((d) => setClickTrend(d.series || [])).catch(() => setClickTrend([]));
  }, [windowDays, granularity]);

  useEffect(() => {
    if (!selectedJobId) return;
    fetch('/api/analytics/geo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ job_id: selectedJobId, window_days: windowDays })
    })
      .then((r) => r.json())
      .then((d) => setGeo((d.distribution || []).map((x: any) => ({ name: x.location, value: x.applicants }))))
      .catch(() => setGeo([]));
  }, [selectedJobId, windowDays]);

  useEffect(() => {
    if (!selectedJobId) {
      setFunnel(null);
      return;
    }
    fetch('/api/analytics/funnel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ job_id: selectedJobId, window_days: windowDays })
    })
      .then((r) => r.json())
      .then((d) => setFunnel(d.funnel || null))
      .catch(() => setFunnel(null));
  }, [selectedJobId, windowDays]);

  return (
    <div className="py-2">
      <div className="flex justify-between items-center mb-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Recruiter Analytics</h1>
          <p className="text-slate-500">Track application metrics and job tracking performance.</p>
        </div>
        <select
          value={windowDays}
          onChange={(e) => setWindowDays(Number(e.target.value))}
          className="bg-white border border-slate-300 text-slate-700 rounded-md px-4 py-2 shadow-sm font-medium focus:ring-blue-500 focus:border-blue-500"
        >
          <option value={30}>Last 30 Days</option>
          <option value={7}>Last 7 Days</option>
        </select>
      </div>
      <div className="mb-8 flex flex-wrap gap-2 text-sm">
        <Link to="/jobs/post" className="rounded-full border border-[#0a66c2] px-4 py-1.5 font-semibold text-[#0a66c2] hover:bg-[#edf3f8]">
          Post a job
        </Link>
        <Link to="/applications?tab=review" className="rounded-full border border-slate-300 px-4 py-1.5 font-semibold text-slate-700 hover:bg-slate-50">
          Review applications
        </Link>
        <Link to="/jobs/tracker" className="rounded-full border border-slate-300 px-4 py-1.5 font-semibold text-slate-700 hover:bg-slate-50">
          Open job tracker
        </Link>
        <Link to="/recruiter/admin" className="rounded-full border border-slate-300 px-4 py-1.5 font-semibold text-slate-700 hover:bg-slate-50">
          Recruiter admin
        </Link>
      </div>

      <section className="mb-8 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#edf3f8] text-[#0a66c2]">
              <Briefcase size={20} aria-hidden />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">Your job postings</h2>
              <p className="mt-0.5 text-sm text-slate-500">
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void loadMyPostings()}
            className="rounded-full border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            Refresh
          </button>
        </div>
        {myPostingsLoading ? (
          <div className="flex items-center gap-2 py-8 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            Loading your postings…
          </div>
        ) : myPostings.length === 0 ? (
          <p className="py-6 text-sm text-slate-600">
            No job postings yet.{' '}
            <Link to="/jobs/post" className="font-semibold text-[#0a66c2] hover:underline">
              Post a job
            </Link>{' '}
            to see it here.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {myPostings.map((job) => {
              const isClosed = String(job.status || '').toLowerCase() === 'closed';
              return (
                <li key={job.id} className="flex flex-wrap items-center justify-between gap-3 py-4 first:pt-0">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        to={`/jobs/search-results?jobId=${encodeURIComponent(job.id)}`}
                        className="font-semibold text-[#0a66c2] hover:underline"
                      >
                        {job.title}
                      </Link>
                      {isClosed ? (
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">Closed</span>
                      ) : (
                        <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-800">Open</span>
                      )}
                    </div>
                    <p className="mt-1 text-sm text-slate-600">
                      {job.company} · {job.location}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      Posted {job.postedAt} · {job.applicants ?? 0} applicants
                    </p>
                  </div>
                  {!isClosed ? (
                    <button
                      type="button"
                      disabled={closingJobId === job.id}
                      onClick={async () => {
                        const rid = getViewerRecruiterId();
                        setClosingJobId(job.id);
                        try {
                          const res = await fetch('/api/jobs/close', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ job_id: job.id, recruiter_id: rid })
                          });
                          const data = await res.json().catch(() => ({}));
                          if (!res.ok) {
                            showToast(String(data.message || data.error || 'Could not close job'), 'error');
                            return;
                          }
                          showToast('Job closed. It will no longer accept applications.', 'success');
                          await loadMyPostings();
                        } catch {
                          showToast('Could not close job.', 'error');
                        } finally {
                          setClosingJobId(null);
                        }
                      }}
                      className="shrink-0 rounded-full border border-red-200 bg-white px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
                    >
                      {closingJobId === job.id ? (
                        <span className="inline-flex items-center gap-2">
                          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                          Closing…
                        </span>
                      ) : (
                        'Close job'
                      )}
                    </button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* KPI Cards */}
      <div className="grid grid-cols-4 gap-6 mb-8">
          {[
            { title: 'Total Applications', value: String(topJobs.reduce((acc, cur) => acc + Number(cur.c || 0), 0)), trend: '+0%', icon: Users, color: 'text-blue-600', bg: 'bg-blue-100' },
            { title: 'Job Clicks', value: String(clickJobs.reduce((acc, cur) => acc + Number(cur.c || 0), 0)), trend: '+0%', icon: MousePointerClick, color: 'text-indigo-600', bg: 'bg-indigo-100' },
            { title: 'Saved Jobs', value: String(saveJobs.reduce((acc, cur) => acc + Number(cur.c || 0), 0)), trend: '+0%', icon: BookmarkCheck, color: 'text-emerald-600', bg: 'bg-emerald-100' },
            {
              title: 'Application Rate',
              value: `${clickJobs.reduce((acc, cur) => acc + Number(cur.c || 0), 0) > 0
                ? ((topJobs.reduce((acc, cur) => acc + Number(cur.c || 0), 0) / clickJobs.reduce((acc, cur) => acc + Number(cur.c || 0), 0)) * 100).toFixed(1)
                : '0.0'}%`,
              trend: '+0%',
              icon: TrendingUp,
              color: 'text-purple-600',
              bg: 'bg-purple-100'
            }
        ].map((kpi, idx) => (
          <div key={idx} className="bg-white p-6 rounded-lg shadow-sm border border-slate-200">
            <div className="flex justify-between items-start mb-4">
              <div className={`p-3 rounded-lg ${kpi.bg}`}>
                <kpi.icon size={24} className={kpi.color} />
              </div>
              <span className={`text-sm font-bold ${kpi.trend.startsWith('+') ? 'text-green-600' : 'text-red-500'}`}>
                {kpi.trend}
              </span>
            </div>
            <h3 className="text-slate-500 text-sm font-medium">{kpi.title}</h3>
            <div className="text-2xl font-bold text-slate-900 mt-1">{kpi.value}</div>
            <Link to="/applications?tab=review" className="mt-3 inline-block text-xs font-semibold text-[#0a66c2] hover:underline">
              View details
            </Link>
          </div>
        ))}
      </div>

      {funnel && selectedJobId && (
        <div className="mb-8 bg-white p-6 rounded-lg shadow-sm border border-slate-200">
          <h3 className="font-bold text-lg text-slate-800 mb-2">Application funnel (selected job)</h3>
          <p className="text-xs text-slate-500 mb-4">
            View → Save → Apply start → Submit (from events + applications in window)
          </p>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={[
                  { stage: 'Views', count: funnel.view },
                  { stage: 'Saves', count: funnel.save },
                  { stage: 'Apply start', count: funnel.apply_start },
                  { stage: 'Submitted', count: funnel.submit }
                ]}
              >
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                <XAxis dataKey="stage" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} />
                <RechartsTooltip />
                <Bar dataKey="count" fill="#0f766e" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-6 mb-8">
        {/* Bar Chart */}
        <div className="bg-white p-6 rounded-lg shadow-sm border border-slate-200">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-bold text-lg text-slate-800">Top Jobs by Applications</h3>
            <Link to="/jobs" className="text-sm font-semibold text-[#0a66c2] hover:underline">View jobs</Link>
          </div>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={topJobs.map((job: any) => ({ name: job.title || job.job_id, applications: Number(job.c || 0) }))}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#64748B', fontSize: 12}} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{fill: '#64748B', fontSize: 12}} />
                <RechartsTooltip cursor={{fill: '#F1F5F9'}} contentStyle={{borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'}} />
                <Bar dataKey="applications" fill="#2563EB" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Pie Chart */}
        <div className="bg-white p-6 rounded-lg shadow-sm border border-slate-200">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-bold text-lg text-slate-800">Applications by City ({selectedJobId || 'No Job'})</h3>
            <Link to="/applications?tab=review" className="text-sm font-semibold text-[#0a66c2] hover:underline">View applicants</Link>
          </div>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={geo}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {geo.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <RechartsTooltip contentStyle={{borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'}} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex justify-center gap-4 mt-2">
            {geo.map((entry, idx) => (
              <div key={idx} className="flex items-center text-xs text-slate-600 font-medium">
                <span className="w-3 h-3 rounded-full mr-2" style={{backgroundColor: COLORS[idx % COLORS.length]}}></span>
                {entry.name}
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="bg-white p-6 rounded-lg shadow-sm border border-slate-200">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-bold text-lg text-slate-800">Low traction jobs (fewest applications)</h3>
          <Link to="/jobs/post" className="text-sm font-semibold text-[#0a66c2] hover:underline">Boost with new post</Link>
        </div>
        <div className="space-y-2">
          {lowJobs.map((job: any) => (
            <div key={job.job_id} className="flex items-center justify-between rounded border border-slate-200 p-3 text-sm">
              <Link to="/applications?tab=review" className="font-medium text-slate-800 hover:text-[#0a66c2] hover:underline">
                {job.title || job.job_id}
              </Link>
              <span className="font-semibold">{job.c}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="bg-white p-6 rounded-lg shadow-sm border border-slate-200">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-bold text-lg text-slate-800">Saved Jobs Trend</h3>
            <select
              value={granularity}
              onChange={(e) => setGranularity(e.target.value as 'day' | 'week')}
              className="rounded-md border border-slate-300 px-2 py-1 text-sm"
            >
              <option value="day">Per Day</option>
              <option value="week">Per Week</option>
            </select>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={savedTrend}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="period" />
                <YAxis />
                <RechartsTooltip />
                <Line type="monotone" dataKey="count" stroke="#0a66c2" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="bg-white p-6 rounded-lg shadow-sm border border-slate-200">
          <h3 className="font-bold text-lg text-slate-800 mb-4">Job Views Trend</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={clickTrend}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="period" />
                <YAxis />
                <RechartsTooltip />
                <Line type="monotone" dataKey="count" stroke="#6d28d9" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}
