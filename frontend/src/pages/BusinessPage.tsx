import { Link } from 'react-router-dom';

const tools = [
  { title: 'Hire on LinkedIn', desc: 'Post jobs and manage applications.', to: '/jobs/post' },
  { title: 'Sell with LinkedIn', desc: 'Generate leads through your network.', to: '/network' },
  { title: 'Advertise on LinkedIn', desc: 'Promote your company and content.', to: '/company/acme' },
  { title: 'Admin Center', desc: 'Manage recruiters and settings.', to: '/recruiter/admin' }
];

export default function BusinessPage() {
  return (
    <div className="li-card p-5">
      <h1 className="text-xl font-semibold text-[#191919]">For Business</h1>
      <p className="mt-1 text-sm text-[#666]">Business tools and quick actions.</p>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {tools.map((tool) => (
          <Link key={tool.title} to={tool.to} className="rounded-lg border border-slate-200 p-4 hover:bg-slate-50">
            <p className="font-semibold text-slate-900">{tool.title}</p>
            <p className="mt-1 text-sm text-slate-600">{tool.desc}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}

