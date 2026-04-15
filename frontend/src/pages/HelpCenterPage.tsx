import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

const faq = [
  {
    q: 'How do I update my profile information?',
    a: 'Open Profile, click Edit Profile, update details, and save changes.'
  },
  {
    q: 'How do I apply to jobs with Easy Apply?',
    a: 'Open a job from Jobs page and click Easy Apply. Track progress from Job Tracker.'
  },
  {
    q: 'How do I manage connection requests?',
    a: 'Open My Network and use Accept/Ignore on incoming invitations.'
  },
  {
    q: 'Why does login fail with valid credentials?',
    a: 'Verify gateway/member service are running and retry with seeded admin user if needed.'
  },
  {
    q: 'Where can I see API docs?',
    a: 'Open Swagger UI at http://localhost:4000/docs.'
  }
];

export default function HelpCenterPage() {
  const [query, setQuery] = useState('');
  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return faq;
    return faq.filter((item) => item.q.toLowerCase().includes(q) || item.a.toLowerCase().includes(q));
  }, [query]);

  return (
    <div className="space-y-3">
      <section className="li-card p-5">
        <h1 className="text-xl font-semibold text-[#191919]">Help Center</h1>
        <p className="mt-1 text-sm text-[#666]">Search common questions and quick links.</p>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search help topics"
          className="mt-3 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
      </section>

      <section className="li-card p-5">
        <h2 className="text-sm font-semibold text-[#191919]">Frequently asked questions</h2>
        <div className="mt-3 space-y-2">
          {results.length === 0 ? (
            <p className="text-sm text-slate-500">No results found for your search.</p>
          ) : (
            results.map((item) => (
              <details key={item.q} className="rounded-lg border border-slate-200 p-3">
                <summary className="cursor-pointer text-sm font-semibold text-slate-900">{item.q}</summary>
                <p className="mt-2 text-sm text-slate-600">{item.a}</p>
              </details>
            ))
          )}
        </div>
      </section>

      <section className="li-card p-5">
        <h2 className="text-sm font-semibold text-[#191919]">Quick links</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link to="/settings" className="rounded-full border border-slate-300 px-4 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">Settings</Link>
          <Link to="/profile" className="rounded-full border border-slate-300 px-4 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">Profile</Link>
          <Link to="/network" className="rounded-full border border-slate-300 px-4 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">My Network</Link>
          <a href="http://localhost:4000/docs" className="rounded-full border border-[#0a66c2] px-4 py-1.5 text-sm font-semibold text-[#0a66c2] hover:bg-[#edf3f8]">Swagger Docs</a>
        </div>
      </section>
    </div>
  );
}

