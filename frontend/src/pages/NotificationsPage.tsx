import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import Navbar from '../components/layout/Navbar';
import { MEMBER_ID, resolveViewerAvatarUrl } from '../lib/memberProfile';
import { showToast } from '../lib/toast';

type NotificationItem = {
  notification_id: string;
  category: 'all' | 'jobs' | 'posts' | 'mentions';
  title: string;
  body: string;
  route_path?: string | null;
  is_read: number;
  created_at?: string;
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
  return `${Math.floor(hrs / 24)}d`;
}

export default function NotificationsPage() {
  const location = useLocation();
  const [member, setMember] = useState({
    name: 'Sneha Singh',
    headline: 'Senior Test Automation Engineer',
    school: 'San Jose State University',
    photo: resolveViewerAvatarUrl(undefined, 'Sneha Singh')
  });
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [inAppEnabled, setInAppEnabled] = useState(true);

  const activeTab = useMemo(() => {
    if (location.pathname.endsWith('/jobs')) return 'jobs';
    if (location.pathname.endsWith('/posts')) return 'posts';
    if (location.pathname.endsWith('/mentions')) return 'mentions';
    return 'all';
  }, [location.pathname]);

  const loadSettings = async () => {
    const res = await fetch('/api/members/settings/get', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ member_id: MEMBER_ID })
    });
    const data = await res.json().catch(() => ({}));
    setInAppEnabled(data?.inAppNotificationsEnabled !== false);
  };

  const loadNotifications = async () => {
    const res = await fetch('/api/members/notifications/list', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ member_id: MEMBER_ID, category: activeTab, limit: 40 })
    });
    const data = await res.json().catch(() => []);
    setNotifications(Array.isArray(data) ? data : []);
  };

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
    loadSettings().catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!inAppEnabled) {
      setNotifications([]);
      return;
    }
    loadNotifications().catch(() => undefined);
    const timer = window.setInterval(() => {
      loadNotifications().catch(() => undefined);
    }, 8000);
    return () => window.clearInterval(timer);
  }, [activeTab, inAppEnabled]);

  const unreadCount = notifications.filter((item) => !item.is_read).length;

  const markAsRead = async (id: string) => {
    const res = await fetch('/api/members/notifications/markRead', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ member_id: MEMBER_ID, notification_ids: [id] })
    });
    if (!res.ok) {
      showToast('Unable to update this notification right now.', 'error');
      return;
    }
    setNotifications((prev) => prev.map((item) => (item.notification_id === id ? { ...item, is_read: 1 } : item)));
    showToast('Notification marked as read.', 'success');
  };

  const markAllAsRead = async () => {
    const res = await fetch('/api/members/notifications/markAllRead', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ member_id: MEMBER_ID, category: activeTab })
    });
    if (!res.ok) {
      showToast('Unable to mark notifications as read.', 'error');
      return;
    }
    setNotifications((prev) => prev.map((item) => ({ ...item, is_read: 1 })));
    showToast('All visible notifications marked as read.', 'success');
  };

  const enableInAppNotifications = async () => {
    const res = await fetch('/api/members/settings/update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ member_id: MEMBER_ID, inAppNotificationsEnabled: true })
    });
    if (!res.ok) {
      showToast('Unable to enable notifications right now.', 'error');
      return;
    }
    setInAppEnabled(true);
    showToast('In-app notifications enabled.', 'success');
    loadNotifications().catch(() => undefined);
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
                <Link to={`/profile/${encodeURIComponent(MEMBER_ID)}`} className="-mt-4 block h-16 w-16 overflow-hidden rounded-full border-2 border-white">
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
                  onClick={() => enableInAppNotifications().catch(() => undefined)}
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
                <button onClick={() => markAllAsRead().catch(() => undefined)} className="rounded-full border border-[#0a66c2] px-3 py-1.5 text-xs font-semibold text-[#0a66c2] hover:bg-[#edf3f8]">
                  Mark all as read
                </button>
              </div>
            </section>
            <section className="li-card overflow-hidden p-0">
              {inAppEnabled && notifications.length === 0 ? (
                <article className="px-4 py-4 text-sm text-slate-500">No notifications right now.</article>
              ) : null}
              {notifications.map((item) => (
                <article
                  key={item.notification_id}
                  className={`border-b border-[#ece9e4] px-4 py-4 ${item.is_read ? 'bg-white' : 'bg-[#f5fbff]'}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-[#191919]">{item.title}</p>
                      <p className="mt-1 text-sm text-[#555]">{item.body}</p>
                      <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-[#777]">
                        <span>{ageFromIso(item.created_at)}</span>
                        {item.route_path ? (
                          <Link to={item.route_path} className="font-semibold text-[#0a66c2] hover:underline">
                            Open
                          </Link>
                        ) : null}
                      </div>
                    </div>
                    {!item.is_read ? (
                      <button
                        type="button"
                        onClick={() => markAsRead(item.notification_id).catch(() => undefined)}
                        className="rounded-full border border-[#0a66c2] px-3 py-1 text-xs font-semibold text-[#0a66c2] hover:bg-[#edf3f8]"
                      >
                        Mark read
                      </button>
                    ) : null}
                  </div>
                </article>
              ))}
            </section>
          </main>

          <aside className="space-y-3 lg:col-span-3">
            <section className="li-card p-4">
              <p className="text-sm font-semibold text-[#191919]">Persistent notification feed</p>
              <p className="mt-1 text-sm text-[#666]">This page now reads from backend notification records instead of browser-only state.</p>
            </section>
          </aside>
        </div>
      </div>
    </div>
  );
}
