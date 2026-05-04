import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BarChart3, Eye, Search, Users } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer } from 'recharts';

export default function MemberAnalyticsPage() {
  const MEMBER_ID = sessionStorage.getItem('li_sim_member_id') || 'M-123';
  const [dashboard, setDashboard] = useState<any>(null);

  const emptyDash = {
    profile_views_30d: 0,
    profile_views_daily: [] as Array<{ date: string; count: number }>,
    post_impressions_7d: 0,
    search_appearances_30d: 0,
    applications_by_status: [] as Array<{ status: string; c: number }>
  };

  const load = () => {
    fetch('/api/analytics/member/dashboard', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ member_id: MEMBER_ID })
    })
      .then((res) => res.json().then((data) => ({ ok: res.ok, data })))
      .then(({ ok, data }) => {
        if (!ok || data?.error) {
          setDashboard({ ...emptyDash, _loadError: data?.message || data?.error });
          return;
        }
        setDashboard(data);
      })
      .catch(() => setDashboard({ ...emptyDash, _loadError: 'Network error' }));
  };

  useEffect(() => {
    load();
    const onFocus = () => load();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, []);

  const statuses = (dashboard?.applications_by_status || []) as Array<{ status: string; c: number }>;
  const viewsDaily = (dashboard?.profile_views_daily || []) as Array<{ date: string; count: number }>;

  return (
    <div className="space-y-3">
      <section className="li-card overflow-hidden border border-[#e0dfdc] p-0 shadow-sm">
        <div className="px-4 pb-1 pt-4">
          <h1 className="text-[20px] font-semibold leading-tight text-[#191919]">Analytics</h1>
          <div className="mt-1 flex items-center gap-1.5 text-xs text-[#666666]">
            <Eye size={14} className="shrink-0 text-[#666]" aria-hidden />
            <span>Private to you</span>
          </div>
        </div>
        {dashboard?._loadError ? (
          <p className="px-4 pb-2 text-xs text-amber-800">{dashboard._loadError} (showing zeros).</p>
        ) : null}
        <div className="grid grid-cols-1 gap-6 px-4 py-5 sm:grid-cols-3 sm:gap-4">
          <div className="min-w-0">
            <Users size={20} className="text-[#404040]" aria-hidden />
            <p className="mt-2 text-[15px] font-semibold leading-snug text-[#191919]">
              {(dashboard?.profile_views_30d ?? 0).toLocaleString()} profile views
            </p>
            <p className="mt-1 text-xs leading-snug text-[#666666]">Discover who&apos;s viewed your profile.</p>
          </div>
          <div className="min-w-0">
            <BarChart3 size={20} className="text-[#404040]" aria-hidden />
            <p className="mt-2 text-[15px] font-semibold leading-snug text-[#191919]">
              {(dashboard?.post_impressions_7d ?? 0).toLocaleString()} post impressions
            </p>
            <p className="mt-1 text-xs leading-snug text-[#666666]">Check out who&apos;s engaging with your posts.</p>
            <p className="mt-1.5 text-xs text-[#999999]">Past 7 days</p>
          </div>
          <div className="min-w-0">
            <Search size={20} className="text-[#404040]" aria-hidden />
            <p className="mt-2 text-[15px] font-semibold leading-snug text-[#191919]">
              {(dashboard?.search_appearances_30d ?? 0).toLocaleString()} search appearances
            </p>
            <p className="mt-1 text-xs leading-snug text-[#666666]">See how often you appear in search results.</p>
          </div>
        </div>
        <div className="border-t border-[#ebebeb] px-4 py-3 text-center">
          <Link to="/profile" className="text-sm font-semibold text-[#666666] hover:text-[#0a66c2] hover:underline">
            Back to profile<span aria-hidden> →</span>
          </Link>
        </div>
      </section>

      <section className="li-card p-5">
        <h2 className="text-base font-semibold text-[#191919]">Profile views — last 30 days</h2>
        <p className="mt-1 text-sm text-[#666]">Daily profile view counts from your visitors.</p>
        {viewsDaily.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">No profile view events recorded yet.</p>
        ) : (
          <div className="mt-4 h-48">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={viewsDaily}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(v: string) => v.slice(5)} />
                <YAxis allowDecimals={false} tick={{ fontSize: 10 }} />
                <RechartsTooltip />
                <Line type="monotone" dataKey="count" stroke="#0a66c2" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>

      <section className="li-card p-5">
        <h2 className="text-base font-semibold text-[#191919]">Application statuses</h2>
        <p className="mt-1 text-sm text-[#666]">Counts from your submitted applications.</p>
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
