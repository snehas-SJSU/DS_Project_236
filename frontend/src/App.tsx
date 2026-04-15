import React, { useEffect, useState } from 'react';
import { BrowserRouter, Link, Navigate, Route, Routes } from 'react-router-dom';
import Navbar from './components/layout/Navbar';
import JobsBoard from './pages/JobsBoard';
import ApplicationsPage from './pages/ApplicationsPage';
import MessagingPage from './pages/MessagingPage';
import NetworkPage from './pages/NetworkPage';
import NotificationsPage from './pages/NotificationsPage';
import Profile from './pages/Profile';
import RecruiterDashboard from './pages/RecruiterDashboard';
import RecruiterAdminPage from './pages/RecruiterAdminPage';
import StaticPage from './pages/StaticPage';
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
              <p className="li-section-title text-sm">Quick links</p>
              <ul className="mt-2 space-y-1.5 text-sm text-[#666666]">
                <li><Link to="/saved" className="hover:text-[#0a66c2]">Saved posts</Link></li>
                <li><Link to="/applications" className="hover:text-[#0a66c2]">Application history</Link></li>
                <li><Link to="/recruiter" className="hover:text-[#0a66c2]">Analytics snapshots</Link></li>
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

function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-[#f3f2ef] text-slate-900">
        <Routes>
          <Route path="/" element={<Navigate to="/feed" replace />} />
          <Route path="/feed" element={<AppShell><FeedPlaceholder /></AppShell>} />
          <Route path="/jobs" element={<JobsBoard />} />
          <Route path="/applications" element={<AppShell><ApplicationsPage /></AppShell>} />
          <Route path="/profile" element={<AppShell><Profile /></AppShell>} />
          <Route path="/recruiter" element={<AppShell><RecruiterDashboard /></AppShell>} />
          <Route path="/recruiter/admin" element={<AppShell><RecruiterAdminPage /></AppShell>} />
          <Route path="/messaging" element={<MessagingPage />} />
          <Route path="/messaging/compose" element={<AppShell><StaticPage title="Compose Message" description="Start a new conversation with a connection." ctaLabel="Open messaging" items={['Search and pick a connection', 'Write your message', 'Send and track replies']} /></AppShell>} />
          <Route path="/messaging/filter/focused" element={<AppShell><StaticPage title="Focused Messages" description="Priority conversations and important updates." ctaLabel="Back to inbox" items={['Unread important threads', 'Recruiter responses', 'Connection follow-ups']} /></AppShell>} />
          <Route path="/messaging/filter/jobs" element={<AppShell><StaticPage title="Job Messages" description="Conversations related to job opportunities." ctaLabel="Back to inbox" items={['Recruiter outreach', 'Application follow-ups', 'Interview scheduling']} /></AppShell>} />
          <Route path="/messaging/filter/unread" element={<AppShell><StaticPage title="Unread Messages" description="Messages you have not opened yet." ctaLabel="Back to inbox" items={['New recruiter ping', 'New connection request reply', 'Pending team discussion']} /></AppShell>} />
          <Route path="/messaging/filter/connections" element={<AppShell><StaticPage title="Connections Messages" description="Messages from your network connections." ctaLabel="Back to inbox" items={['Recent connection chat', 'Alumni network thread', 'Community group conversation']} /></AppShell>} />
          <Route path="/network" element={<NetworkPage />} />
          <Route path="/network/invitations" element={<AppShell><StaticPage title="All Invitations" description="Review all received connection invitations." ctaLabel="Manage invitations" items={['Pending requests', 'Accepted recently', 'Ignored requests']} /></AppShell>} />
          <Route path="/network/suggestions" element={<AppShell><StaticPage title="People You May Know" description="Expand your network with suggested profiles." ctaLabel="Discover more people" items={['Similar role recommendations', 'Alumni suggestions', 'Mutual connections']} /></AppShell>} />
          <Route path="/network/connections" element={<AppShell><StaticPage title="Connections" description="People in your professional network." ctaLabel="Manage connections" items={['View accepted connections', 'Remove or organize contacts', 'See shared interests']} /></AppShell>} />
          <Route path="/network/following" element={<AppShell><StaticPage title="Following & Followers" description="Manage people and companies you follow." ctaLabel="Review following" items={['Following people: 0', 'Following companies: 0', 'Followers: 0']} /></AppShell>} />
          <Route path="/network/groups" element={<AppShell><StaticPage title="Groups" description="Communities you joined or may want to join." ctaLabel="Discover groups" items={['Distributed Systems Group', 'Data Engineering Circle', 'Women in Tech Network']} /></AppShell>} />
          <Route path="/network/events" element={<AppShell><StaticPage title="Events" description="Professional and learning events from your network." ctaLabel="Find events" items={['Webinar: Kafka best practices', 'Hiring fair: Backend roles', 'Meetup: Microservices architecture']} /></AppShell>} />
          <Route path="/network/pages" element={<AppShell><StaticPage title="Pages" description="Company and creator pages you follow." ctaLabel="Explore pages" items={['Acme Engineering', 'Nova Labs Careers', 'Cloud Native Weekly']} /></AppShell>} />
          <Route path="/network/newsletters" element={<AppShell><StaticPage title="Newsletters" description="Newsletters subscribed through your network." ctaLabel="Manage subscriptions" items={['System Design Weekly', 'AI Builders Digest', 'Career Growth Notes']} /></AppShell>} />
          <Route path="/notifications" element={<NotificationsPage />} />
          <Route path="/notifications/jobs" element={<NotificationsPage />} />
          <Route path="/notifications/posts" element={<NotificationsPage />} />
          <Route path="/notifications/mentions" element={<NotificationsPage />} />
          <Route path="/settings" element={<AppShell><StaticPage title="Settings & Privacy" description="Manage account, privacy, and preference settings." ctaLabel="Save settings" items={['Profile visibility: Public', 'Job seeking preference: Open to work', 'Messaging preference: Anyone can message']} /></AppShell>} />
          <Route path="/help" element={<AppShell><StaticPage title="Help Center" description="Find support resources and frequently asked questions." ctaLabel="Contact support" items={['How to update my profile information?', 'How to apply to jobs using Easy Apply?', 'How to manage connection requests?']} /></AppShell>} />
          <Route path="/language" element={<AppShell><StaticPage title="Language Preferences" description="Select your preferred language and regional settings." ctaLabel="Update language" items={['Primary language: English (US)', 'Secondary language: Hindi', 'Region: United States']} /></AppShell>} />
          <Route path="/profile/activity" element={<AppShell><StaticPage title="Posts & Activity" description="Review your recent posts, comments, and engagement." ctaLabel="Create post" items={['Commented on Distributed Systems roadmap', 'Shared Kafka scaling article', 'Liked 12 posts this week']} /></AppShell>} />
          <Route path="/saved" element={<AppShell><StaticPage title="Saved Items" description="Revisit jobs, posts, and resources you saved." ctaLabel="Manage saved items" items={['Saved job: Senior Software Engineer (J-8c5f4db5)', 'Saved article: Event-driven workflows', 'Saved post: Resume tips for backend roles']} /></AppShell>} />
          <Route path="/signout" element={<AppShell><StaticPage title="Sign Out" description="You have been signed out in this demo environment." ctaLabel="Back to home" items={['Session ended successfully', 'All local demo changes are still available']} /></AppShell>} />
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
