import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import Navbar from '../components/layout/Navbar';
import { MEMBER_ID, resolveAvatarUrl } from '../lib/memberProfile';
import { NOTIFICATIONS_READ_KEY, readJson, writeJson } from '../lib/localData';
import { showToast } from '../lib/toast';

type NotificationItem = {
  id: string;
  category: 'all' | 'jobs' | 'posts' | 'mentions';
  text: string;
  age: string;
  cta?: { label: string; to: string };
};

const notifications: NotificationItem[] = [
  { id: 'N-1', category: 'all', text: 'San Jose State University posted: SJSU Grad Slam 2026 is coming soon.', age: '3h' },
  { id: 'N-2', category: 'jobs', text: 'test engineer: new opportunities in San Jose, CA.', age: '3h', cta: { label: 'View jobs', to: '/jobs' } },
  { id: 'N-3', category: 'jobs', text: 'data analyst internship: new opportunities in San Jose, CA.', age: '3h', cta: { label: 'View jobs', to: '/jobs' } },
  { id: 'N-4', category: 'jobs', text: 'data engineer intern: new opportunities in San Jose, CA.', age: '4h', cta: { label: 'View jobs', to: '/jobs' } },
  { id: 'N-5', category: 'posts', text: 'Nina Shah shared a post about scaling Kafka workers.', age: '5h', cta: { label: 'Open post', to: '/profile/activity' } },
  { id: 'N-6', category: 'mentions', text: 'Rahul Verma mentioned you in a discussion about backend architecture.', age: '6h', cta: { label: 'Open mention', to: '/messaging' } }
];

export default function NotificationsPage() {
  const location = useLocation();
  const [member, setMember] = useState({
    name: 'Sneha Singh',
    headline: 'Senior Test Automation Engineer',
    school: 'San Jose State University',
    photo: resolveAvatarUrl(undefined, 'Sneha Singh')
  });
  const [readIds, setReadIds] = useState<string[]>([]);

  useEffect(() => {
    const byMember = readJson<Record<string, string[]>>(NOTIFICATIONS_READ_KEY, {});
    setReadIds(byMember[MEMBER_ID] || []);
  }, []);

  useEffect(() => {
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
          headline: data.headline || data.title || 'Senior Test Automation Engineer',
          school: 'San Jose State University',
          photo: resolveAvatarUrl(data.profile_photo_url, data.name)
        });
      })
      .catch(() => undefined);
  }, []);

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

  return (
    <div className="min-h-screen bg-[#f3f2ef]">
      <Navbar />
      <div className="mx-auto max-w-[1128px] px-3 py-4">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
          <aside className="space-y-3 lg:col-span-3">
            <section className="li-card overflow-hidden p-0">
              <div className="h-10 bg-gradient-to-r from-[#bfd7ff] to-[#d6ecff]" />
              <div className="px-4 pb-4">
                <div className="-mt-4 h-16 w-16 overflow-hidden rounded-full border-2 border-white">
                  <img src={member.photo} alt="Profile" className="h-full w-full object-cover" />
                </div>
                <Link to="/profile" className="mt-2 block text-2xl font-semibold text-[#191919] hover:text-[#0a66c2]">
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

