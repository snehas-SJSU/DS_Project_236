import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import Navbar from '../components/layout/Navbar';
import { MEMBER_ID, resolveViewerAvatarUrl } from '../lib/memberProfile';
import { ACTIVITY_KEY, NOTIFICATIONS_READ_KEY, SETTINGS_KEY, readJson, writeJson } from '../lib/localData';
import { showToast } from '../lib/toast';

type NotificationItem = {
  id: string;
  category: 'all' | 'jobs' | 'posts' | 'mentions';
  text: string;
  age: string;
  cta?: { label: string; to: string };
};

function ageFromIso(iso?: string): string {
  if (!iso) return 'now';
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return 'now';
  const diffMs = Date.now() - t;
  const mins = Math.max(1, Math.floor(diffMs / 60000));
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  return `${days}d`;
}

export default function NotificationsPage() {
  const location = useLocation();
  const [member, setMember] = useState({
    name: 'Sneha Singh',
    headline: 'Senior Test Automation Engineer',
    school: 'San Jose State University',
    photo: resolveViewerAvatarUrl(undefined, 'Sneha Singh')
  });
  const [readIds, setReadIds] = useState<string[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [inAppEnabled, setInAppEnabled] = useState<boolean>(true);

  useEffect(() => {
    const byMember = readJson<Record<string, string[]>>(NOTIFICATIONS_READ_KEY, {});
    setReadIds(byMember[MEMBER_ID] || []);
    const settings = readJson<any>(SETTINGS_KEY, { inAppNotificationsEnabled: true });
    setInAppEnabled(settings?.inAppNotificationsEnabled !== false);
  }, []);

  useEffect(() => {
    fetch('/api/members/get', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ member_id: MEMBER_ID })
    })
      .then((res) => res.json())
      .then((data) => {
        if (!data || data.error) return;
        setMember({
          name: data.name || 'Sneha Singh',
          headline: data.headline || data.title || 'Senior Test Automation Engineer',
          school: 'San Jose State University',
          photo: resolveViewerAvatarUrl(data.profile_photo_url, data.name)
        });
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!inAppEnabled) {
      setNotifications([]);
      return;
    }
    let cancelled = false;
    const buildNotifications = async () => {
      const [reqRes, threadRes, appsRes, jobsRes] = await Promise.all([
        fetch('/api/connections/requestsByUser', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user_id: MEMBER_ID })
        }),
        fetch('/api/threads/byUser', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user_id: MEMBER_ID })
        }),
        fetch('/api/applications/byMember', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ member_id: MEMBER_ID })
        }),
        fetch('/api/jobs/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({})
        })
      ]);

      const reqData = await reqRes.json().catch(() => ({ incoming: [], sent: [] }));
      const threadData = await threadRes.json().catch(() => []);
      const appsData = await appsRes.json().catch(() => []);
      const jobsData = await jobsRes.json().catch(() => []);
      const activity = readJson<Array<{ id: string; text: string; time: string }>>(ACTIVITY_KEY, []);

      const built: NotificationItem[] = [];

      (reqData.incoming || []).forEach((r: any) => {
        built.push({
          id: `conn-in-${r.request_id}`,
          category: 'mentions',
          text: `${r.requester_id} sent you a connection request.`,
          age: ageFromIso(r.created_at),
          cta: { label: 'Open invitations', to: '/network/invitations' }
        });
      });
      (reqData.sent || []).forEach((r: any) => {
        if (r.status === 'pending') {
          built.push({
            id: `conn-out-${r.request_id}`,
            category: 'mentions',
            text: `Your request to ${r.receiver_id} is pending.`,
            age: ageFromIso(r.created_at),
            cta: { label: 'View network', to: '/network' }
          });
        }
      });
      (Array.isArray(threadData) ? threadData : []).slice(0, 5).forEach((t: any) => {
        const peer = t.participant_a === MEMBER_ID ? t.participant_b : t.participant_a;
        built.push({
          id: `thread-${t.thread_id}`,
          category: 'mentions',
          text: `New activity in your conversation with ${peer}.`,
          age: ageFromIso(t.last_activity),
          cta: { label: 'Open messages', to: '/messaging' }
        });
      });
      (Array.isArray(appsData) ? appsData : []).slice(0, 6).forEach((a: any) => {
        built.push({
          id: `app-${a.app_id}`,
          category: 'jobs',
          text: `Application ${a.status} for job ${a.job_id}.`,
          age: ageFromIso(a.applied_at),
          cta: { label: 'View applications', to: '/applications' }
        });
      });
      (Array.isArray(jobsData) ? jobsData : [])
        .filter((j: any) => j.status !== 'closed')
        .slice(0, 4)
        .forEach((j: any) => {
          built.push({
            id: `job-${j.job_id}`,
            category: 'jobs',
            text: `${j.title} at ${j.company} is actively hiring.`,
            age: ageFromIso(j.created_at),
            cta: { label: 'View jobs', to: '/jobs' }
          });
        });
      activity.slice(0, 6).forEach((a) => {
        const parsed = new Date(a.time);
        built.push({
          id: `activity-${a.id}`,
          category: 'posts',
          text: a.text,
          age: Number.isNaN(parsed.getTime()) ? 'now' : ageFromIso(parsed.toISOString()),
          cta: { label: 'Open activity', to: '/profile/activity' }
        });
      });

      if (!cancelled) {
        setNotifications(
          built.sort((a, b) => (readIds.includes(a.id) ? 1 : -1) - (readIds.includes(b.id) ? 1 : -1))
        );
      }
    };

    buildNotifications().catch(() => undefined);
    const timer = window.setInterval(() => {
      buildNotifications().catch(() => undefined);
    }, 5000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [readIds, inAppEnabled]);

  const activeTab = useMemo(() => {
    if (location.pathname.endsWith('/jobs')) return 'jobs';
    if (location.pathname.endsWith('/posts')) return 'posts';
    if (location.pathname.endsWith('/mentions')) return 'mentions';
    return 'all';
  }, [location.pathname]);

  const visibleNotifications = notifications.filter((item) => activeTab === 'all' || item.category === activeTab);
  const unreadCount = visibleNotifications.filter((item) => !readIds.includes(item.id)).length;

  const persistReadIds = (next: string[]) => {
    setReadIds(next);
    const byMember = readJson<Record<string, string[]>>(NOTIFICATIONS_READ_KEY, {});
    writeJson(NOTIFICATIONS_READ_KEY, { ...byMember, [MEMBER_ID]: next });
  };

  const markAsRead = (id: string) => {
    if (readIds.includes(id)) return;
    persistReadIds([...readIds, id]);
    showToast('Notification marked as read.', 'success');
  };

  const markAllAsRead = () => {
    const allVisible = visibleNotifications.map((item) => item.id);
    const merged = Array.from(new Set([...readIds, ...allVisible]));
    persistReadIds(merged);
    showToast('All visible notifications marked as read.', 'success');
  };

  const enableInAppNotifications = () => {
    const settings = readJson<any>(SETTINGS_KEY, {});
    writeJson(SETTINGS_KEY, { ...settings, inAppNotificationsEnabled: true });
    setInAppEnabled(true);
    showToast('In-app notifications enabled.', 'success');
  };

  return (
    <div className="min-h-screen bg-[#f3f2ef]">
      <Navbar />
      <div className="mx-auto max-w-[1128px] px-3 py-4">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
          <aside className="space-y-3 lg:col-span-3">
            <section className="li-card overflow-hidden p-0">
              <div className="h-10 bg-gradient-to-r from-[#bfd7ff] to-[#d6ecff]" />
              <div className="px-4 pb-4">
                <Link
                  to={`/profile/${encodeURIComponent(MEMBER_ID)}`}
                  className="-mt-4 block h-16 w-16 overflow-hidden rounded-full border-2 border-white"
                >
                  <img src={member.photo} alt="Profile" className="h-full w-full object-cover" />
                </Link>
                <Link to={`/profile/${encodeURIComponent(MEMBER_ID)}`} className="mt-2 block text-2xl font-semibold text-[#191919] hover:text-[#0a66c2]">
                  {member.name}
                </Link>
                <p className="line-clamp-2 text-xs text-[#666]">{member.headline}</p>
                <p className="mt-2 text-xs font-semibold text-[#444]">{member.school}</p>
              </div>
            </section>
            <section className="li-card p-4">
              <p className="text-lg font-semibold text-[#191919]">Manage your notifications</p>
              <Link to="/settings" className="mt-2 inline-block text-sm font-semibold text-[#0a66c2] hover:underline">
                View settings
              </Link>
            </section>
          </aside>
          <main className="space-y-3 lg:col-span-6">
            {!inAppEnabled ? (
              <section className="li-card p-4">
                <p className="text-sm text-[#191919]">In-app notifications are currently turned off in Settings.</p>
                <button
                  onClick={enableInAppNotifications}
                  className="mt-2 rounded-full border border-[#0a66c2] px-3 py-1.5 text-sm font-semibold text-[#0a66c2] hover:bg-[#edf3f8]"
                >
                  Enable in-app notifications
                </button>
              </section>
            ) : null}
            <section className="li-card p-3">
              <div className="flex flex-wrap items-center gap-2">
                <Link to="/notifications" className={`rounded-full border px-3 py-1.5 text-sm font-semibold ${activeTab === 'all' ? 'border-[#057642] bg-[#057642] text-white' : 'border-[#d0d7de] text-[#444]'}`}>All</Link>
                <Link to="/notifications/jobs" className={`rounded-full border px-3 py-1.5 text-sm font-semibold ${activeTab === 'jobs' ? 'border-[#057642] bg-[#057642] text-white' : 'border-[#d0d7de] text-[#444]'}`}>Jobs</Link>
                <Link to="/notifications/posts" className={`rounded-full border px-3 py-1.5 text-sm font-semibold ${activeTab === 'posts' ? 'border-[#057642] bg-[#057642] text-white' : 'border-[#d0d7de] text-[#444]'}`}>My posts</Link>
                <Link to="/notifications/mentions" className={`rounded-full border px-3 py-1.5 text-sm font-semibold ${activeTab === 'mentions' ? 'border-[#057642] bg-[#057642] text-white' : 'border-[#d0d7de] text-[#444]'}`}>Mentions</Link>
                <span className="ml-auto text-xs font-semibold text-[#666]">Unread: {unreadCount}</span>
                <button
                  onClick={markAllAsRead}
                  className="rounded-full border border-[#0a66c2] px-3 py-1.5 text-xs font-semibold text-[#0a66c2] hover:bg-[#edf3f8]"
                >
                  Mark all as read
                </button>
              </div>
            </section>
            <section className="li-card overflow-hidden p-0">
              {inAppEnabled && visibleNotifications.length === 0 ? (
                <article className="px-4 py-4 text-sm text-slate-500">No notifications right now.</article>
              ) : null}
              {visibleNotifications.map((item) => (
                <article key={item.id} className={`border-b border-[#edf0f3] px-4 py-3 last:border-b-0 ${readIds.includes(item.id) ? 'bg-white' : 'bg-[#eaf4ff]'}`}>
                  <div className="flex items-start gap-3">
                    <div className={`mt-1 h-2 w-2 rounded-full ${readIds.includes(item.id) ? 'bg-slate-300' : 'bg-[#0a66c2]'}`} />
                    <div className="flex-1">
                      <p className="text-[15px] leading-5 text-[#191919]">{item.text}</p>
                      {item.cta ? (
                        <Link to={item.cta.to} className="mt-2 inline-block rounded-full border border-[#0a66c2] px-3 py-1 text-sm font-semibold text-[#0a66c2] hover:bg-[#edf3f8]">
                          {item.cta.label}
                        </Link>
                      ) : null}
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <span className="text-xs text-[#666]">{item.age}</span>
                      {!readIds.includes(item.id) ? (
                        <button
                          onClick={() => markAsRead(item.id)}
                          className="text-xs font-semibold text-[#0a66c2] hover:underline"
                        >
                          Mark as read
                        </button>
                      ) : (
                        <span className="text-[11px] font-semibold text-slate-400">Read</span>
                      )}
                    </div>
                  </div>
                </article>
              ))}
            </section>
          </main>
          <aside className="space-y-3 lg:col-span-3">
            <section className="li-card overflow-hidden p-0">
              <div className="h-24 bg-gradient-to-r from-[#f5d36a] to-[#f0be42]" />
              <div className="p-4">
                <p className="text-sm text-[#666]">Reactivate premium for free trial</p>
                <Link to="/premium" className="mt-2 inline-block rounded-full border border-[#0a66c2] px-4 py-1.5 text-sm font-semibold text-[#0a66c2] hover:bg-[#edf3f8]">
                  Reactivate Trial
                </Link>
              </div>
            </section>
            <section className="li-card p-4 text-xs text-[#666]">
              <div className="flex flex-wrap gap-x-3 gap-y-1">
                <button onClick={() => showToast('About page is coming soon.', 'info')} className="hover:text-[#191919]">About</button>
                <button onClick={() => showToast('Privacy & Terms details are coming soon.', 'info')} className="hover:text-[#191919]">Privacy & Terms</button>
                <Link to="/help" className="hover:text-[#191919]">Help Center</Link>
                <button onClick={() => showToast('Advertising center is coming soon.', 'info')} className="hover:text-[#191919]">Advertising</button>
              </div>
            </section>
          </aside>
        </div>
      </div>
    </div>
  );
}

