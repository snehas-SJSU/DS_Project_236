import React, { useEffect, useRef, useState } from 'react';
import { BrowserRouter, Link, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { Pencil } from 'lucide-react';
import Navbar from './components/layout/Navbar';
import JobsBoard from './pages/JobsBoard';
import JobsSearchPage from './pages/JobsSearchPage';
import ApplicationsPage from './pages/ApplicationsPage';
import MessagingPage from './pages/MessagingPage';
import NetworkPage from './pages/NetworkPage';
import NotificationsPage from './pages/NotificationsPage';
import LoginLandingPage from './pages/LoginLandingPage';
import SignInPage from './pages/SignInPage';
import JoinPage from './pages/JoinPage';
import SignOutPage from './pages/SignOutPage';
import Profile from './pages/Profile';
import MemberPublicProfilePage from './pages/MemberPublicProfilePage';
import RecruiterDashboard from './pages/RecruiterDashboard';
import RecruiterAdminPage from './pages/RecruiterAdminPage';
import MemberAnalyticsPage from './pages/MemberAnalyticsPage';
import StaticPage from './pages/StaticPage';
import SavedItemsPage from './pages/SavedItemsPage';
import SettingsPage from './pages/SettingsPage';
import ActivityPage from './pages/ActivityPage';
import BusinessPage from './pages/BusinessPage';
import JobPreferencesPage from './pages/JobPreferencesPage';
import JobTrackerPage from './pages/JobTrackerPage';
import JobInsightsPage from './pages/JobInsightsPage';
import NetworkCollectionsPage from './pages/NetworkCollectionsPage';
import MemberSearchPage from './pages/MemberSearchPage';
import HelpCenterPage from './pages/HelpCenterPage';
import PremiumPage from './pages/PremiumPage';
import LanguagePage from './pages/LanguagePage';
import JobPostPage from './pages/JobPostPage';
import CompanyPage from './pages/CompanyPage';
import { isAuthenticated } from './lib/auth';
import { MEMBER_ID, resolveAvatarUrl } from './lib/memberProfile';
import { showToast, ToastViewport } from './lib/toast';
import { ACTIVITY_KEY, readJson } from './lib/localData';

function FeedPlaceholder() {
  const staticFeedItems = [
    {
      id: 'feed-static-1',
      memberId: 'M-DEMO-01',
      author: 'Alex Chen',
      role: 'Senior Engineer at Acme',
      text: 'Shipped a Kafka retry strategy that cut duplicate writes by 92%. Sharing a quick architecture sketch soon.',
      reactions: 73,
      comments: 22,
      reposts: 4,
      image:
        'https://images.unsplash.com/photo-1518773553398-650c184e0bb3?auto=format&fit=crop&w=1200&q=80'
    },
    {
      id: 'feed-static-2',
      memberId: 'M-DEMO-02',
      author: 'Priya Kapoor',
      role: 'Recruiter at Nova Labs',
      text: 'Hiring for distributed systems and backend interns. Strong fundamentals in data pipelines are a plus.',
      reactions: 31,
      comments: 8,
      reposts: 2
    }
  ];
  const [activityPosts, setActivityPosts] = useState<
    Array<{ id: string; text: string; time: string; memberId: string; author: string; role: string; image?: string }>
  >([]);
  const [composerOpen, setComposerOpen] = useState(false);
  const [draftPost, setDraftPost] = useState('');
  const [attachedImage, setAttachedImage] = useState<string | undefined>(undefined);
  const [scheduledAt, setScheduledAt] = useState('');
  const [audience, setAudience] = useState<'Anyone' | 'Connections'>('Anyone');
  const imageInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const load = () => {
      const activity = readJson<Array<{ id: string; text: string; time: string; image?: string }>>(ACTIVITY_KEY, []);
      const mapped = activity.map((a) => ({
        id: a.id,
        text: a.text,
        time: a.time,
        memberId: MEMBER_ID,
        author: 'You',
        role: 'Recent activity',
        image: a.image
      }));
      setActivityPosts(mapped);
    };
    load();
    const onStorage = (event: StorageEvent) => {
      if (!event.key || event.key === ACTIVITY_KEY) load();
    };
    window.addEventListener('storage', onStorage);
    const timer = window.setInterval(load, 4000);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.clearInterval(timer);
    };
  }, []);

  const feedItems = activityPosts.length > 0 ? [...activityPosts, ...staticFeedItems] : staticFeedItems;

  const publishPost = () => {
    const text = draftPost.trim();
    if (!text) return;
    const activity = readJson<Array<{ id: string; text: string; time: string; image?: string }>>(ACTIVITY_KEY, []);
    const entry = {
      id: `act-${Date.now()}`,
      text: scheduledAt ? `[Scheduled: ${scheduledAt}] ${text}` : text,
      time: new Date().toLocaleString(),
      image: attachedImage
    };
    localStorage.setItem(ACTIVITY_KEY, JSON.stringify([entry, ...activity].slice(0, 50)));
    setActivityPosts((prev) => [
      {
        id: entry.id,
        text: entry.text,
        time: entry.time,
        memberId: MEMBER_ID,
        author: 'You',
        role: 'Recent activity',
        image: entry.image
      },
      ...prev
    ]);
    showToast(scheduledAt ? `Post scheduled for ${scheduledAt}.` : 'Post published.', 'success');
    setDraftPost('');
    setAttachedImage(undefined);
    setScheduledAt('');
    setAudience('Anyone');
    setComposerOpen(false);
  };

  return (
    <div className="space-y-3">
      <div className="li-card p-4">
        <div className="mb-2 flex items-center gap-2">
          <div className="h-12 w-12 overflow-hidden rounded-full border border-slate-200 bg-slate-100">
            <img src={resolveAvatarUrl(undefined, 'Sneha Singh')} alt="Me" className="h-full w-full object-cover" />
          </div>
          <button
            className="flex-1 rounded-full border border-[#d0d7de] px-4 py-3 text-left text-sm text-[#666666] hover:bg-[#f3f6f8]"
            onClick={() => setComposerOpen(true)}
          >
            Start a post
          </button>
        </div>
        <div className="mt-2 flex gap-2">
          <Link to="/profile/activity" className="rounded-full border border-[#d0d7de] px-4 py-1.5 text-sm font-semibold text-[#666666] hover:bg-[#f3f6f8]">Media</Link>
          <Link to="/jobs" className="rounded-full border border-[#d0d7de] px-4 py-1.5 text-sm font-semibold text-[#666666] hover:bg-[#f3f6f8]">Job</Link>
          <Link to="/profile/activity" className="rounded-full border border-[#d0d7de] px-4 py-1.5 text-sm font-semibold text-[#666666] hover:bg-[#f3f6f8]">Write article</Link>
        </div>
      </div>
      {feedItems.map((item) => (
        <article key={item.id || `${item.author}-${item.text}`} className="li-card p-4">
          <div className="flex items-start gap-3">
            <div className="h-12 w-12 overflow-hidden rounded-full border border-slate-200 bg-slate-100">
              <img src={resolveAvatarUrl(undefined, item.author)} alt={item.author} className="h-full w-full object-cover" />
            </div>
            <div>
              <Link to={`/profile/${encodeURIComponent(item.memberId)}`} className="text-sm font-semibold text-[#191919] hover:text-[#0a66c2] hover:underline">
                {item.author}
              </Link>
              <p className="text-xs text-[#666666]">{item.role}</p>
              <p className="text-xs text-[#666666]">{item.time ? `${item.time} • 🌎` : '2h • 🌎'}</p>
            </div>
          </div>
          <p className="mt-3 text-sm leading-relaxed text-[#191919]">{item.text}</p>
          {'image' in item && item.image ? (
            <div className="mt-3 overflow-hidden rounded-md border border-slate-200">
              <img src={item.image as string} alt="Post media" className="max-h-[360px] w-full object-cover" />
            </div>
          ) : null}
          {'reactions' in item ? (
            <div className="mt-3 flex items-center justify-between border-b border-[#e0dfdc] pb-2 text-xs text-[#666666]">
              <span>{item.reactions as number} reactions</span>
              <span>{item.comments as number} comments • {item.reposts as number} reposts</span>
            </div>
          ) : null}
          <div className="mt-2 flex gap-5 text-xs font-semibold text-[#666666]">
            <Link to="/profile/activity">Like</Link>
            <Link to="/profile/activity">Comment</Link>
            <Link to="/profile/activity">Repost</Link>
            <Link to="/messaging">Send</Link>
          </div>
        </article>
      ))}

      {composerOpen ? (
        <div className="fixed inset-0 z-[90] flex items-start justify-center bg-black/45 p-4 pt-14">
          <div className="w-full max-w-[760px] rounded-lg bg-white shadow-xl">
            <div className="flex items-start justify-between border-b border-slate-200 px-5 py-4">
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 overflow-hidden rounded-full border border-slate-200">
                  <img src={resolveAvatarUrl(undefined, 'Sneha Singh')} alt="Me" className="h-full w-full object-cover" />
                </div>
                <div>
                  <p className="text-base font-semibold text-[#191919]">Sneha Singh</p>
                  <p className="text-xs text-slate-600">Post to {audience}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setComposerOpen(false)}
                className="rounded-full p-1 text-slate-500 hover:bg-slate-100"
                aria-label="Close post composer"
              >
                ✕
              </button>
            </div>
            <div className="px-5 py-4">
              <textarea
                value={draftPost}
                onChange={(e) => setDraftPost(e.target.value)}
                placeholder="What do you want to talk about?"
                className="min-h-[280px] w-full resize-none border-0 text-lg text-[#191919] placeholder:text-slate-500 focus:outline-none"
              />
              {attachedImage ? (
                <div className="mb-2 overflow-hidden rounded-md border border-slate-200">
                  <img src={attachedImage} alt="Attachment preview" className="max-h-[220px] w-full object-cover" />
                </div>
              ) : null}
              <div className="mt-3 flex items-center justify-between border-t border-slate-200 pt-3">
                <div className="flex items-center gap-3 text-sm text-slate-500">
                  <button
                    type="button"
                    title="React with emoji"
                    className="rounded-full px-2 py-1 hover:bg-slate-100"
                    onClick={() => setDraftPost((prev) => `${prev}${prev ? ' ' : ''}🙂`)}
                  >
                    🙂
                  </button>
                  <button
                    type="button"
                    title="Rewrite with AI"
                    className="rounded-full border border-[#d0d7de] px-3 py-1 font-semibold text-[#444] hover:bg-slate-100"
                    onClick={() => {
                      if (!draftPost.trim()) {
                        showToast('Write something first for AI rewrite.', 'info');
                        return;
                      }
                      setDraftPost((prev) => `Polished update: ${prev.trim()}`);
                      showToast('AI rewrite applied (demo).', 'success');
                    }}
                  >
                    ✨ Rewrite with AI
                  </button>
                  <button
                    type="button"
                    title="Add image"
                    className="rounded-full px-2 py-1 hover:bg-slate-100"
                    onClick={() => imageInputRef.current?.click()}
                  >
                    🖼️
                  </button>
                  <button
                    type="button"
                    title="Schedule post date/time"
                    className="rounded-full px-2 py-1 hover:bg-slate-100"
                    onClick={() => {
                      const next = window.prompt('Schedule (example: 2026-04-20 09:30)', scheduledAt || '');
                      if (next !== null) setScheduledAt(next.trim());
                    }}
                  >
                    📅
                  </button>
                  <button
                    type="button"
                    title="Post audience settings"
                    className="rounded-full px-2 py-1 hover:bg-slate-100"
                    onClick={() => {
                      const next = window.prompt('Audience: Anyone or Connections', audience);
                      if (!next) return;
                      const normalized = next.toLowerCase().trim();
                      if (normalized === 'anyone') setAudience('Anyone');
                      else if (normalized === 'connections') setAudience('Connections');
                      else showToast('Use "Anyone" or "Connections".', 'error');
                    }}
                  >
                    ⚙️
                  </button>
                  <button
                    type="button"
                    title="Insert hashtag"
                    className="rounded-full px-2 py-1 hover:bg-slate-100"
                    onClick={() => setDraftPost((prev) => `${prev}${prev ? ' ' : ''}#hiring`)}
                  >
                    ➕
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    title="Posting time"
                    className="rounded-full px-2 py-1 text-slate-500 hover:bg-slate-100"
                    onClick={() => showToast(scheduledAt ? `Scheduled: ${scheduledAt}` : 'Posting now', 'info')}
                  >
                    🕒
                  </button>
                  <button
                    type="button"
                    onClick={publishPost}
                    title={scheduledAt ? `Schedule post (${scheduledAt})` : 'Publish now'}
                    disabled={!draftPost.trim()}
                    className="rounded-full bg-[#0a66c2] px-5 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-300"
                  >
                    Post
                  </button>
                </div>
              </div>
              <input
                ref={imageInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const reader = new FileReader();
                  reader.onload = () => {
                    if (typeof reader.result === 'string') {
                      setAttachedImage(reader.result);
                      showToast('Image attached.', 'success');
                    }
                  };
                  reader.readAsDataURL(file);
                }}
              />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function AppShell({ children }: { children: React.ReactNode }) {
  const [member, setMember] = useState<{ name: string; headline: string; photo: string }>({
    name: 'Sneha Singh',
    headline: 'MS Student | Distributed Systems',
    photo: resolveAvatarUrl(undefined, 'Sneha Singh')
  });
  const [memberDashboard, setMemberDashboard] = useState<any>(null);

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
          headline: data.headline || data.title || 'MS Student | Distributed Systems',
          photo: resolveAvatarUrl(data.profile_photo_url, data.name)
        });
      })
      .catch(() => undefined);

    fetch('http://localhost:4000/api/analytics/member/dashboard', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ member_id: MEMBER_ID })
    })
      .then((res) => res.json())
      .then((data) => setMemberDashboard(data))
      .catch(() => setMemberDashboard(null));
  }, []);

  return (
    <>
      <Navbar />
      <div className="mx-auto grid w-full max-w-[1128px] grid-cols-1 gap-6 px-3 py-6 lg:grid-cols-12">
        <aside className="hidden lg:col-span-3 lg:block">
          <div className="sticky top-[66px] space-y-2">
            <div className="li-card overflow-hidden p-0">
              <div className="h-14 bg-gradient-to-r from-[#70b5f9] to-[#a0b4f5]" />
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
                <p className="text-sm text-[#666666]">{member.headline}</p>
              </div>
            </div>
            <div className="li-card p-4">
              <div className="flex items-center justify-between text-sm font-semibold text-[#191919]">
                <span>Profile viewers</span>
                <span className="text-[#0a66c2]">{memberDashboard?.profile_views_30d ?? 0}</span>
              </div>
              <Link to="/analytics/member" className="mt-3 block text-base font-semibold text-[#191919] hover:text-[#0a66c2]">
                View all analytics
              </Link>
            </div>
            <div className="li-card p-4">
              <ul className="space-y-2 text-sm font-semibold text-[#191919]">
                <li><Link to="/saved" className="hover:text-[#0a66c2]">Saved items</Link></li>
                <li><Link to="/network/groups" className="hover:text-[#0a66c2]">Groups</Link></li>
                <li><Link to="/network/newsletters" className="hover:text-[#0a66c2]">Newsletters</Link></li>
                <li><Link to="/network/events" className="hover:text-[#0a66c2]">Events</Link></li>
              </ul>
            </div>
          </div>
        </aside>
        <main className="lg:col-span-6">{children}</main>
        <aside className="hidden lg:col-span-3 lg:block">
          <div className="sticky top-[66px] space-y-2">
            <div className="li-card p-4">
              <p className="li-section-title text-sm">Trending in engineering</p>
              <ul className="mt-2 space-y-2 text-sm text-[#666666]">
                <li><span className="font-semibold text-[#191919]">#kafka-streams</span><br />2,314 readers today</li>
                <li><span className="font-semibold text-[#191919]">#microservices</span><br />1,882 readers today</li>
                <li><span className="font-semibold text-[#191919]">#fastapi</span><br />1,219 readers today</li>
              </ul>
            </div>
            <div className="li-card overflow-hidden p-0">
              <div className="h-20 bg-gradient-to-r from-[#dbeafe] to-[#f5d0fe]" />
              <div className="p-4 text-sm">
                <p className="font-semibold text-[#191919]">Try Premium for free</p>
                <p className="mt-1 text-[#666666]">See who viewed your profile in the last 365 days.</p>
                <Link to="/premium" className="mt-2 inline-block rounded-full border border-[#0a66c2] px-3 py-1 text-xs font-semibold text-[#0a66c2] hover:bg-[#edf3f8]">
                  Try now
                </Link>
              </div>
            </div>
            <div className="li-card p-4">
              <p className="li-section-title text-sm">People you may know</p>
              <div className="mt-2 space-y-2 text-sm">
                <div>
                  <Link to={`/profile/${encodeURIComponent('M-DEMO-01')}`} className="font-semibold text-[#191919] hover:text-[#0a66c2] hover:underline">
                    Alex Chen
                  </Link>
                  <p className="text-[#666666]">Senior Engineer at Acme</p>
                </div>
                <div>
                  <Link to={`/profile/${encodeURIComponent('M-DEMO-02')}`} className="font-semibold text-[#191919] hover:text-[#0a66c2] hover:underline">
                    Priya Kapoor
                  </Link>
                  <p className="text-[#666666]">Recruiter at Nova Labs</p>
                </div>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </>
  );
}

function ProfileShell({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const PROFILE_LANGUAGE_KEY = 'li_sim_profile_language';
  const PROFILE_URL_KEY = 'li_sim_profile_url';
  const [language, setLanguage] = useState(localStorage.getItem(PROFILE_LANGUAGE_KEY) || 'English');
  const ownUrlDefault = `linkedin-sim.local/in/${MEMBER_ID.toLowerCase()}`;
  const [publicUrl, setPublicUrl] = useState(localStorage.getItem(PROFILE_URL_KEY) || ownUrlDefault);

  const profilePathPrefix = '/profile/';
  const routeMemberId = location.pathname.startsWith(profilePathPrefix)
    ? decodeURIComponent(location.pathname.slice(profilePathPrefix.length))
    : MEMBER_ID;
  const isOwnProfile = routeMemberId === MEMBER_ID || location.pathname === '/profile';
  const displayedPublicUrl = isOwnProfile
    ? publicUrl
    : `linkedin-sim.local/in/${routeMemberId.toLowerCase()}`;

  const editLanguage = () => {
    const next = window.prompt('Update profile language', language);
    if (!next) return;
    const value = next.trim();
    if (!value) return;
    setLanguage(value);
    localStorage.setItem(PROFILE_LANGUAGE_KEY, value);
  };

  const editPublicUrl = () => {
    const next = window.prompt('Update public profile URL', publicUrl);
    if (!next) return;
    const value = next.trim();
    if (!value) return;
    setPublicUrl(value);
    localStorage.setItem(PROFILE_URL_KEY, value);
  };

  return (
    <>
      <Navbar />
      <div className="mx-auto grid w-full max-w-[1128px] grid-cols-1 gap-6 px-3 py-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <main>{children}</main>
        <aside className="hidden lg:block">
          <div className="sticky top-[66px] space-y-2">
            {isOwnProfile ? (
              <div className="li-card p-4 text-sm">
                <div className="flex items-center justify-between">
                  <p className="font-semibold text-[#191919]">Profile language</p>
                  <button
                    type="button"
                    onClick={editLanguage}
                    className="inline-flex h-7 w-7 items-center justify-center rounded-full text-[#666666] hover:bg-[#f3f2ef]"
                    title="Edit profile language"
                  >
                    <Pencil size={14} />
                  </button>
                </div>
                <p className="mt-1 text-[#666666]">{language}</p>
                <div className="my-3 h-px bg-[#e0dfdc]" />
                <div className="flex items-center justify-between">
                  <p className="font-semibold text-[#191919]">Public profile & URL</p>
                  <button
                    type="button"
                    onClick={editPublicUrl}
                    className="inline-flex h-7 w-7 items-center justify-center rounded-full text-[#666666] hover:bg-[#f3f2ef]"
                    title="Edit public profile URL"
                  >
                    <Pencil size={14} />
                  </button>
                </div>
                <p className="mt-1 text-[#666666] break-all">{displayedPublicUrl}</p>
              </div>
            ) : null}
            <div className="li-card p-4">
              <p className="li-section-title text-sm">People you may know</p>
              <div className="mt-2 space-y-2 text-sm">
                <div>
                  <Link to={`/profile/${encodeURIComponent('M-DEMO-01')}`} className="font-semibold text-[#191919] hover:text-[#0a66c2] hover:underline">
                    Alex Chen
                  </Link>
                  <p className="text-[#666666]">Senior Engineer at Acme</p>
                </div>
                <div>
                  <Link to={`/profile/${encodeURIComponent('M-DEMO-02')}`} className="font-semibold text-[#191919] hover:text-[#0a66c2] hover:underline">
                    Priya Kapoor
                  </Link>
                  <p className="text-[#666666]">Recruiter at Nova Labs</p>
                </div>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </>
  );
}

function RequireAuth({ children }: { children: React.ReactNode }) {
  if (!isAuthenticated()) {
    return <Navigate to="/login/email" replace />;
  }
  return <>{children}</>;
}

function RedirectIfAuthenticated({ children }: { children: React.ReactNode }) {
  if (isAuthenticated()) {
    return <Navigate to="/feed" replace />;
  }
  return <>{children}</>;
}

function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-[#f3f2ef] text-slate-900">
        <Routes>
          <Route path="/" element={<RedirectIfAuthenticated><LoginLandingPage /></RedirectIfAuthenticated>} />
          <Route path="/login" element={<RedirectIfAuthenticated><LoginLandingPage /></RedirectIfAuthenticated>} />
          <Route path="/login/email" element={<RedirectIfAuthenticated><SignInPage /></RedirectIfAuthenticated>} />
          <Route path="/signup" element={<RedirectIfAuthenticated><JoinPage /></RedirectIfAuthenticated>} />
          <Route path="/feed" element={<RequireAuth><AppShell><FeedPlaceholder /></AppShell></RequireAuth>} />
          <Route path="/jobs" element={<RequireAuth><JobsBoard /></RequireAuth>} />
          <Route path="/jobs/search" element={<RequireAuth><JobsSearchPage /></RequireAuth>} />
          <Route path="/jobs/search-results" element={<RequireAuth><JobsSearchPage /></RequireAuth>} />
          <Route path="/applications" element={<RequireAuth><AppShell><ApplicationsPage /></AppShell></RequireAuth>} />
          <Route path="/profile" element={<RequireAuth><ProfileShell><Profile /></ProfileShell></RequireAuth>} />
          <Route path="/profile/:memberId" element={<RequireAuth><ProfileShell><MemberPublicProfilePage /></ProfileShell></RequireAuth>} />
          <Route path="/analytics/member" element={<RequireAuth><AppShell><MemberAnalyticsPage /></AppShell></RequireAuth>} />
          <Route path="/recruiter" element={<RequireAuth><AppShell><RecruiterDashboard /></AppShell></RequireAuth>} />
          <Route path="/recruiter/admin" element={<RequireAuth><AppShell><RecruiterAdminPage /></AppShell></RequireAuth>} />
          <Route path="/messaging" element={<RequireAuth><MessagingPage /></RequireAuth>} />
          <Route path="/messaging/compose" element={<RequireAuth><MessagingPage /></RequireAuth>} />
          <Route path="/messaging/filter/focused" element={<RequireAuth><MessagingPage /></RequireAuth>} />
          <Route path="/messaging/filter/jobs" element={<RequireAuth><MessagingPage /></RequireAuth>} />
          <Route path="/messaging/filter/unread" element={<RequireAuth><MessagingPage /></RequireAuth>} />
          <Route path="/messaging/filter/connections" element={<RequireAuth><MessagingPage /></RequireAuth>} />
          <Route path="/messaging/filter/inmail" element={<RequireAuth><MessagingPage /></RequireAuth>} />
          <Route path="/messaging/filter/starred" element={<RequireAuth><MessagingPage /></RequireAuth>} />
          <Route path="/network" element={<RequireAuth><NetworkPage /></RequireAuth>} />
          <Route path="/network/invitations" element={<RequireAuth><NetworkPage /></RequireAuth>} />
          <Route path="/network/suggestions" element={<RequireAuth><NetworkPage /></RequireAuth>} />
          <Route path="/network/connections" element={<RequireAuth><NetworkPage /></RequireAuth>} />
          <Route path="/network/search" element={<RequireAuth><MemberSearchPage /></RequireAuth>} />
          <Route path="/network/following" element={<RequireAuth><AppShell><NetworkCollectionsPage /></AppShell></RequireAuth>} />
          <Route path="/network/groups" element={<RequireAuth><AppShell><NetworkCollectionsPage /></AppShell></RequireAuth>} />
          <Route path="/network/events" element={<RequireAuth><AppShell><NetworkCollectionsPage /></AppShell></RequireAuth>} />
          <Route path="/network/pages" element={<RequireAuth><AppShell><NetworkCollectionsPage /></AppShell></RequireAuth>} />
          <Route path="/network/newsletters" element={<RequireAuth><AppShell><NetworkCollectionsPage /></AppShell></RequireAuth>} />
          <Route path="/notifications" element={<RequireAuth><NotificationsPage /></RequireAuth>} />
          <Route path="/notifications/jobs" element={<RequireAuth><NotificationsPage /></RequireAuth>} />
          <Route path="/notifications/posts" element={<RequireAuth><NotificationsPage /></RequireAuth>} />
          <Route path="/notifications/mentions" element={<RequireAuth><NotificationsPage /></RequireAuth>} />
          <Route path="/business" element={<RequireAuth><AppShell><BusinessPage /></AppShell></RequireAuth>} />
          <Route path="/premium" element={<RequireAuth><AppShell><PremiumPage /></AppShell></RequireAuth>} />
          <Route path="/try-premium" element={<Navigate to="/premium" replace />} />
          <Route path="/premium/free-trial" element={<Navigate to="/premium" replace />} />
          <Route path="/premium/trial" element={<Navigate to="/premium" replace />} />
          <Route path="/settings" element={<RequireAuth><AppShell><SettingsPage /></AppShell></RequireAuth>} />
          <Route path="/help" element={<RequireAuth><AppShell><HelpCenterPage /></AppShell></RequireAuth>} />
          <Route path="/language" element={<RequireAuth><AppShell><LanguagePage /></AppShell></RequireAuth>} />
          <Route path="/profile/activity" element={<RequireAuth><AppShell><ActivityPage /></AppShell></RequireAuth>} />
          <Route path="/saved" element={<RequireAuth><AppShell><SavedItemsPage /></AppShell></RequireAuth>} />
          <Route path="/signout" element={<SignOutPage />} />
          <Route path="/jobs/preferences" element={<RequireAuth><AppShell><JobPreferencesPage /></AppShell></RequireAuth>} />
          <Route path="/jobs/tracker" element={<RequireAuth><AppShell><JobTrackerPage /></AppShell></RequireAuth>} />
          <Route path="/jobs/insights" element={<RequireAuth><AppShell><JobInsightsPage /></AppShell></RequireAuth>} />
          <Route path="/jobs/post" element={<RequireAuth><AppShell><JobPostPage /></AppShell></RequireAuth>} />
          <Route
            path="/company/acme"
            element={<Navigate to={`/company/${encodeURIComponent('Acme Company')}`} replace />}
          />
          <Route path="/company/:companySlug" element={<RequireAuth><AppShell><CompanyPage /></AppShell></RequireAuth>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        <ToastViewport />
      </div>
    </BrowserRouter>
  );
}

export default App;
