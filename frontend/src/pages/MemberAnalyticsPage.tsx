import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

export default function MemberAnalyticsPage() {
  const MEMBER_ID = sessionStorage.getItem('li_sim_member_id') || 'M-123';
  const [dashboard, setDashboard] = useState<any>(null);

  useEffect(() => {
    fetch('/api/analytics/member/dashboard', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ member_id: MEMBER_ID })
    })
      .then((res) => res.json())
      .then((data) => setDashboard(data))
      .catch(() => setDashboard(null));
  }, []);

  const statuses = (dashboard?.applications_by_status || []) as Array<{ status: string; c: number }>;

  return (
    <div className="space-y-3">
      <section className="li-card p-5">
        <h1 className="text-xl font-semibold text-[#191919]">Member analytics</h1>
        <p className="mt-1 text-sm text-[#666]">Track profile visibility and your application progress.</p>
      </section>

      <section className="grid gap-3 md:grid-cols-2">
        <div className="li-card p-5">
          <p className="text-sm font-semibold text-slate-600">Profile viewers (30 days)</p>
          <p className="mt-2 text-3xl font-bold text-[#0a66c2]">{dashboard?.profile_views_30d ?? 0}</p>
          <Link to="/profile" className="mt-3 inline-block text-sm font-semibold text-[#0a66c2] hover:underline">
            Go to profile
          </Link>
        </div>
        <div className="li-card p-5">
          <p className="text-sm font-semibold text-slate-600">Application statuses</p>
          <div className="mt-3 space-y-2">
            {statuses.length === 0 ? (
              <p className="text-sm text-slate-500">No application status data yet.</p>
            ) : (
              statuses.map((row) => (
                <div key={row.status} className="flex items-center justify-between rounded-md border border-slate-200 px-3 py-2 text-sm">
                  <span className="capitalize text-slate-700">{row.status}</span>
                  <span className="font-semibold text-slate-900">{row.c}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </section>

      <section className="li-card p-5">
        <h2 className="text-base font-semibold text-[#191919]">Quick actions</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link to="/jobs" className="rounded-full border border-[#0a66c2] px-4 py-1.5 text-sm font-semibold text-[#0a66c2] hover:bg-[#edf3f8]">
            Find jobs
          </Link>
          <Link to="/applications" className="rounded-full border border-slate-300 px-4 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">
            View applications
          </Link>
          <Link to="/network" className="rounded-full border border-slate-300 px-4 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">
            Grow network
          </Link>
        </div>
      </section>
    </div>
  );
}

