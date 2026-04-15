import React, { useEffect, useState } from 'react';
import { BrowserRouter, Link, Navigate, Route, Routes } from 'react-router-dom';
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
import RecruiterDashboard from './pages/RecruiterDashboard';
import RecruiterAdminPage from './pages/RecruiterAdminPage';
import MemberAnalyticsPage from './pages/MemberAnalyticsPage';
import StaticPage from './pages/StaticPage';
import SavedItemsPage from './pages/SavedItemsPage';
import SettingsPage from './pages/SettingsPage';
import ActivityPage from './pages/ActivityPage';
import BusinessPage from './pages/BusinessPage';
import { isAuthenticated } from './lib/auth';
import { MEMBER_ID, resolveAvatarUrl } from './lib/memberProfile';

function FeedPlaceholder() {
  const feedItems = [
    {
      author: 'Alex Chen',
      role: 'Senior Engineer at Acme',
      text: 'Shipped a Kafka retry strategy that cut duplicate writes by 92%. Sharing a quick architecture sketch soon.'
    },
    {
      author: 'Priya Kapoor',
      role: 'Recruiter at Nova Labs',
      text: 'Hiring for distributed systems and backend interns. Strong fundamentals in data pipelines are a plus.'
    }
  ];
  return (
    <div className="space-y-3">
      <div className="li-card p-4">
        <h2 className="mb-1 text-xl font-semibold text-[#191919]">Start a post</h2>
        <p className="text-[14px] text-[#666666]">Share updates with your network.</p>
        <div className="mt-3 flex gap-2">
          <Link to="/profile/activity" className="rounded-full border border-[#d0d7de] px-4 py-1.5 text-sm font-semibold text-[#666666] hover:bg-[#f3f6f8]">Media</Link>
          <Link to="/jobs" className="rounded-full border border-[#d0d7de] px-4 py-1.5 text-sm font-semibold text-[#666666] hover:bg-[#f3f6f8]">Job</Link>
          <Link to="/profile/activity" className="rounded-full border border-[#d0d7de] px-4 py-1.5 text-sm font-semibold text-[#666666] hover:bg-[#f3f6f8]">Write article</Link>
        </div>
      </div>
      {feedItems.map((item) => (
        <article key={item.author} className="li-card p-4">
          <p className="text-sm font-semibold text-[#191919]">{item.author}</p>
          <p className="text-xs text-[#666666]">{item.role}</p>
          <p className="mt-3 text-sm leading-relaxed text-[#191919]">{item.text}</p>
          <div className="mt-3 flex gap-5 text-xs font-semibold text-[#666666]">
            <Link to="/profile/activity">Like</Link>
            <Link to="/profile/activity">Comment</Link>
            <Link to="/profile/activity">Repost</Link>
            <Link to="/messaging">Send</Link>
          </div>
        </article>
      ))}
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
                <div className="-mt-6 mb-2 h-12 w-12 overflow-hidden rounded-full border-2 border-white bg-slate-300">
                  <img src={member.photo} alt="Profile" className="h-full w-full object-cover" />
                </div>
                <p className="text-lg font-semibold text-[#191919]">{member.name}</p>
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
            <div className="li-card p-4">
              <p className="li-section-title text-sm">People you may know</p>
              <div className="mt-2 space-y-2 text-sm">
                <div>
                  <p className="font-semibold text-[#191919]">Nina Shah</p>
                  <p className="text-[#666666]">Backend Engineer at Orbit</p>
                </div>
                <div>
                  <p className="font-semibold text-[#191919]">Rahul Verma</p>
                  <p className="text-[#666666]">PM at Flux</p>
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

function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-[#f3f2ef] text-slate-900">
        <Routes>
          <Route path="/" element={<LoginLandingPage />} />
          <Route path="/login" element={<LoginLandingPage />} />
          <Route path="/login/email" element={<SignInPage />} />
          <Route path="/signup" element={<JoinPage />} />
          <Route path="/feed" element={<RequireAuth><AppShell><FeedPlaceholder /></AppShell></RequireAuth>} />
          <Route path="/jobs" element={<RequireAuth><JobsBoard /></RequireAuth>} />
          <Route path="/jobs/search" element={<RequireAuth><JobsSearchPage /></RequireAuth>} />
          <Route path="/jobs/search-results" element={<RequireAuth><JobsSearchPage /></RequireAuth>} />
          <Route path="/applications" element={<RequireAuth><AppShell><ApplicationsPage /></AppShell></RequireAuth>} />
          <Route path="/profile" element={<RequireAuth><AppShell><Profile /></AppShell></RequireAuth>} />
          <Route path="/analytics/member" element={<RequireAuth><AppShell><MemberAnalyticsPage /></AppShell></RequireAuth>} />
          <Route path="/recruiter" element={<RequireAuth><AppShell><RecruiterDashboard /></AppShell></RequireAuth>} />
          <Route path="/recruiter/admin" element={<RequireAuth><AppShell><RecruiterAdminPage /></AppShell></RequireAuth>} />
          <Route path="/messaging" element={<RequireAuth><MessagingPage /></RequireAuth>} />
          <Route path="/messaging/compose" element={<RequireAuth><MessagingPage /></RequireAuth>} />
          <Route path="/messaging/filter/focused" element={<RequireAuth><MessagingPage /></RequireAuth>} />
          <Route path="/messaging/filter/jobs" element={<RequireAuth><MessagingPage /></RequireAuth>} />
          <Route path="/messaging/filter/unread" element={<RequireAuth><MessagingPage /></RequireAuth>} />
          <Route path="/messaging/filter/connections" element={<RequireAuth><MessagingPage /></RequireAuth>} />
          <Route path="/network" element={<RequireAuth><NetworkPage /></RequireAuth>} />
          <Route path="/network/invitations" element={<RequireAuth><NetworkPage /></RequireAuth>} />
          <Route path="/network/suggestions" element={<RequireAuth><NetworkPage /></RequireAuth>} />
          <Route path="/network/connections" element={<RequireAuth><NetworkPage /></RequireAuth>} />
          <Route path="/network/following" element={<AppShell><StaticPage title="Following & Followers" description="Manage people and companies you follow." ctaLabel="Review following" items={['Following people: 0', 'Following companies: 0', 'Followers: 0']} /></AppShell>} />
          <Route path="/network/groups" element={<AppShell><StaticPage title="Groups" description="Communities you joined or may want to join." ctaLabel="Discover groups" items={['Distributed Systems Group', 'Data Engineering Circle', 'Women in Tech Network']} /></AppShell>} />
          <Route path="/network/events" element={<AppShell><StaticPage title="Events" description="Professional and learning events from your network." ctaLabel="Find events" items={['Webinar: Kafka best practices', 'Hiring fair: Backend roles', 'Meetup: Microservices architecture']} /></AppShell>} />
          <Route path="/network/pages" element={<AppShell><StaticPage title="Pages" description="Company and creator pages you follow." ctaLabel="Explore pages" items={['Acme Engineering', 'Nova Labs Careers', 'Cloud Native Weekly']} /></AppShell>} />
          <Route path="/network/newsletters" element={<AppShell><StaticPage title="Newsletters" description="Newsletters subscribed through your network." ctaLabel="Manage subscriptions" items={['System Design Weekly', 'AI Builders Digest', 'Career Growth Notes']} /></AppShell>} />
          <Route path="/notifications" element={<RequireAuth><NotificationsPage /></RequireAuth>} />
          <Route path="/notifications/jobs" element={<RequireAuth><NotificationsPage /></RequireAuth>} />
          <Route path="/notifications/posts" element={<RequireAuth><NotificationsPage /></RequireAuth>} />
          <Route path="/notifications/mentions" element={<RequireAuth><NotificationsPage /></RequireAuth>} />
          <Route path="/business" element={<RequireAuth><AppShell><BusinessPage /></AppShell></RequireAuth>} />
          <Route path="/premium" element={<RequireAuth><AppShell><StaticPage title="Try Premium for $0" description="Explore premium features to boost visibility and opportunities." ctaLabel="Start free trial" items={['InMail credits', 'Applicant insights', 'Advanced profile analytics']} /></AppShell></RequireAuth>} />
          <Route path="/settings" element={<RequireAuth><AppShell><SettingsPage /></AppShell></RequireAuth>} />
          <Route path="/help" element={<RequireAuth><AppShell><StaticPage title="Help Center" description="Find support resources and frequently asked questions." ctaLabel="Contact support" items={['How to update my profile information?', 'How to apply to jobs using Easy Apply?', 'How to manage connection requests?']} /></AppShell></RequireAuth>} />
          <Route path="/language" element={<RequireAuth><AppShell><StaticPage title="Language Preferences" description="Select your preferred language and regional settings." ctaLabel="Update language" items={['Primary language: English (US)', 'Secondary language: Hindi', 'Region: United States']} /></AppShell></RequireAuth>} />
          <Route path="/profile/activity" element={<RequireAuth><AppShell><ActivityPage /></AppShell></RequireAuth>} />
          <Route path="/saved" element={<RequireAuth><AppShell><SavedItemsPage /></AppShell></RequireAuth>} />
          <Route path="/signout" element={<SignOutPage />} />
          <Route path="/jobs/preferences" element={<AppShell><StaticPage title="Job Preferences" description="Set role, location, salary and work type preferences." ctaLabel="Save preferences" items={['Preferred role: Software Engineer', 'Preferred location: San Jose, CA', 'Open to remote opportunities']} /></AppShell>} />
          <Route path="/jobs/tracker" element={<AppShell><StaticPage title="Job Tracker" description="Track saved jobs, applications, and interview progress." ctaLabel="Open tracker board" items={['J-8c5f4db5: Applied', 'J-2a24be6b: Saved', 'J-9f9210ce: Interview']} /></AppShell>} />
          <Route path="/jobs/insights" element={<AppShell><StaticPage title="Career Insights" description="Insights based on your profile skills and market demand." ctaLabel="View recommendations" items={['Top matched role: Full Stack Engineer', 'High demand skill: Kafka', 'Recommended certification: AWS Developer']} /></AppShell>} />
          <Route path="/jobs/post" element={<AppShell><StaticPage title="Post a Free Job" description="Create a recruiter-style job posting in minutes." ctaLabel="Create posting" items={['Set title and role requirements', 'Add screening questions', 'Publish and track applicants']} /></AppShell>} />
          <Route path="/company/acme" element={<AppShell><StaticPage title="Acme Company Page" description="Company profile, culture highlights, and open positions." ctaLabel="Follow company" items={['Open jobs: 12', 'Employees: 1,500+', 'Headquarters: San Jose, CA']} /></AppShell>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}

export default App;
