import { useState } from 'react';

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

  const post = async (path: string, body: any) => {
    const res = await fetch(`http://localhost:4000/api/recruiters/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    return res.json().catch(() => ({}));
  };

  return (
    <div className="space-y-3">
      <section className="li-card p-5">
        <h2 className="li-section-title">Recruiter Admin</h2>
        <p className="mt-1 text-sm text-slate-600">Create, update, search and delete recruiter/employer admin records.</p>
      </section>

      <section className="li-card p-5 space-y-3">
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
            <div key={r.recruiter_id} className="rounded-md border border-slate-200 p-3 text-sm">
              <p className="font-semibold text-slate-900">{r.name} ({r.recruiter_id})</p>
              <p className="text-slate-600">{r.company_name} • {r.company_industry} • {r.access_level}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

