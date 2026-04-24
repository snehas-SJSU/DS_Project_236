import { useEffect, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { getAuthToken } from '../lib/auth';

const defaultRecruiter = {
  recruiter_id: 'R-123',
  company_id: 'C-ACME',
  name: 'Sneha Recruiter',
  email: 'sneha.recruiter@example.com',
  phone: '555-100-1000',
  company_name: 'Acme',
  company_industry: 'Technology',
  company_size: '201-500',
  access_level: 'admin'
};

export default function RecruiterAdminPage() {
  const [form, setForm] = useState(defaultRecruiter);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [status, setStatus] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = getAuthToken();
    fetch('/api/auth/me', {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined
    })
      .then((res) => res.json().then((data) => ({ ok: res.ok, data })))
      .then(({ ok, data }) => {
        const email = String(data?.user?.email || '').toLowerCase();
        setIsAdmin(ok && email === 'admin@test.com');
      })
      .catch(() => setIsAdmin(false))
      .finally(() => setLoading(false));
  }, []);

  const post = async (path: string, body: any) => {
    const token = getAuthToken();
    const res = await fetch(`/api/recruiters/${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      body: JSON.stringify(body)
    });
    return res.json().catch(() => ({}));
  };

  if (loading) {
    return <div className="li-card p-5 text-sm text-[#666]">Checking admin access...</div>;
  }

  if (!isAdmin) {
    return (
      <div className="li-card p-5">
        <div className="flex items-center gap-2 text-base font-semibold text-[#191919]">
          <ShieldCheck size={18} />
          Admin access required
        </div>
        <p className="mt-2 text-sm text-slate-600">Recruiter admin actions are now restricted to the seeded admin account.</p>
        <p className="mt-2 text-sm text-slate-600">Use `admin@test.com` to access create, update, and delete actions.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <section className="li-card p-5">
        <h2 className="li-section-title">Recruiter Admin</h2>
        <p className="mt-1 text-sm text-slate-600">Create, update, search and delete recruiter/employer admin records with admin-only protection.</p>
      </section>

      <section className="li-card space-y-3 p-5">
        <div className="grid gap-2 md:grid-cols-2">
          {Object.keys(defaultRecruiter).map((k) => (
            <input
              key={k}
              value={(form as any)[k]}
              onChange={(e) => setForm((prev) => ({ ...prev, [k]: e.target.value }))}
              placeholder={k}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="rounded-full bg-[#0a66c2] px-4 py-2 text-sm font-semibold text-white" onClick={async () => setStatus(JSON.stringify(await post('create', form)))}>
            Create
          </button>
          <button className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700" onClick={async () => setStatus(JSON.stringify(await post('update', form)))}>
            Update
          </button>
          <button className="rounded-full border border-red-300 px-4 py-2 text-sm font-semibold text-red-700" onClick={async () => setStatus(JSON.stringify(await post('delete', { recruiter_id: form.recruiter_id })))}>
            Delete
          </button>
          <button className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700" onClick={async () => setStatus(JSON.stringify(await post('get', { recruiter_id: form.recruiter_id })))}>
            Get
          </button>
        </div>
        {status ? <p className="rounded-md bg-slate-50 p-2 text-xs text-slate-700">{status}</p> : null}
      </section>

      <section className="li-card p-5">
        <h3 className="font-semibold text-slate-900">Search recruiters</h3>
        <div className="mt-2 flex gap-2">
          <input
            value={searchKeyword}
            onChange={(e) => setSearchKeyword(e.target.value)}
            placeholder="Search by name/company/industry"
            className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
          <button
            className="rounded-full bg-[#0a66c2] px-4 py-2 text-sm font-semibold text-white"
            onClick={async () => {
              const data = await post('search', { keyword: searchKeyword });
              setResults(Array.isArray(data) ? data : []);
            }}
          >
            Search
          </button>
        </div>
        <div className="mt-3 space-y-2">
          {results.map((r) => (
            <button
              type="button"
              key={r.recruiter_id}
              onClick={() => setForm({
                recruiter_id: r.recruiter_id || '',
                company_id: r.company_id || '',
                name: r.name || '',
                email: r.email || '',
                phone: r.phone || '',
                company_name: r.company_name || '',
                company_industry: r.company_industry || '',
                company_size: r.company_size || '',
                access_level: r.access_level || 'admin'
              })}
              className="block w-full rounded-md border border-slate-200 p-3 text-left text-sm hover:bg-slate-50"
            >
              <p className="font-semibold text-slate-900">{r.name} ({r.recruiter_id})</p>
              <p className="text-slate-600">{r.company_name} • {r.company_industry} • {r.access_level}</p>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
