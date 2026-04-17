import { Link, useLocation } from 'react-router-dom';

const content: Record<
  string,
  { title: string; description: string; items: Array<{ name: string; meta: string; cta: string; to: string }> }
> = {
  following: {
    title: 'Following & Followers',
    description: 'Manage people, topics, and companies you follow.',
    items: [
      { name: 'Cloud Native Weekly', meta: 'Newsletter • Weekly updates', cta: 'View', to: '/network/newsletters' },
      { name: 'Acme Engineering', meta: 'Company page', cta: 'Open page', to: '/company/acme' },
      { name: 'Distributed Systems Group', meta: 'Community updates', cta: 'Open group', to: '/network/groups' }
    ]
  },
  groups: {
    title: 'Groups',
    description: 'Your communities and recommended groups.',
    items: [
      { name: 'Distributed Systems Group', meta: '12 new posts this week', cta: 'Open', to: '/network' },
      { name: 'Data Engineering Circle', meta: '4 upcoming events', cta: 'Open', to: '/network/events' },
      { name: 'Women in Tech Network', meta: '8 active discussions', cta: 'Open', to: '/network' }
    ]
  },
  events: {
    title: 'Events',
    description: 'Upcoming events from your network.',
    items: [
      { name: 'Kafka Best Practices Webinar', meta: 'Thu 7:00 PM', cta: 'View details', to: '/network' },
      { name: 'Backend Hiring Fair', meta: 'Sat 10:00 AM', cta: 'View details', to: '/jobs' },
      { name: 'Microservices Meetup', meta: 'Next week', cta: 'View details', to: '/network' }
    ]
  },
  pages: {
    title: 'Pages',
    description: 'Company and creator pages from your interests.',
    items: [
      { name: 'Acme Company', meta: '1,500+ employees', cta: 'Open page', to: '/company/acme' },
      { name: 'Nova Labs Careers', meta: 'Hiring now', cta: 'View jobs', to: '/jobs' },
      { name: 'Cloud Native Weekly', meta: 'Creator page', cta: 'Follow', to: '/network/newsletters' }
    ]
  },
  newsletters: {
    title: 'Newsletters',
    description: 'Subscriptions and latest issues.',
    items: [
      { name: 'System Design Weekly', meta: 'New issue today', cta: 'Read', to: '/profile/activity' },
      { name: 'AI Builders Digest', meta: '3 new editions', cta: 'Read', to: '/profile/activity' },
      { name: 'Career Growth Notes', meta: 'This week trends', cta: 'Read', to: '/profile/activity' }
    ]
  }
};

export default function NetworkCollectionsPage() {
  const location = useLocation();
  const slug = location.pathname.split('/').pop() || 'following';
  const data = content[slug] || content.following;

  return (
    <div className="space-y-3">
      <section className="li-card p-5">
        <h1 className="text-xl font-semibold text-[#191919]">{data.title}</h1>
        <p className="mt-1 text-sm text-[#666]">{data.description}</p>
      </section>
      <section className="li-card p-5">
        <div className="space-y-2">
          {data.items.map((item) => (
            <div key={item.name} className="flex items-center justify-between rounded-lg border border-slate-200 p-3">
              <div>
                <Link to={item.to} className="font-semibold text-slate-900 hover:text-[#0a66c2] hover:underline">
                  {item.name}
                </Link>
                <p className="text-sm text-slate-600">{item.meta}</p>
              </div>
              <Link to={item.to} className="rounded-full border border-[#0a66c2] px-3 py-1 text-sm font-semibold text-[#0a66c2] hover:bg-[#edf3f8]">
                {item.cta}
              </Link>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

