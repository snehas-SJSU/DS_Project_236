import { useState } from 'react';
import { showToast } from '../lib/toast';
import { getViewerRecruiterId } from '../lib/memberProfile';

export default function JobPostPage() {
  const [form, setForm] = useState({
    title: '',
    company: 'Acme',
    location: 'San Jose, CA',
    salary: '',
    type: 'Full-time',
    description: '',
    skills: ''
  });
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!form.title.trim()) {
      showToast('Job title is required.', 'error');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/jobs/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: form.title,
          company: form.company,
          location: form.location,
          salary: form.salary,
          type: form.type,
          description: form.description,
          skills: form.skills.split(',').map((s) => s.trim()).filter(Boolean),
          recruiter_id: getViewerRecruiterId()
        })
      });
      if (!res.ok) {
        showToast('Unable to create job right now.', 'error');
        return;
      }
      showToast('Job posted successfully.', 'success');
      setForm({ ...form, title: '', salary: '', description: '', skills: '' });
    } catch {
      showToast('Service unavailable while posting job.', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="li-card p-5">
      <h1 className="text-xl font-semibold text-[#191919]">Post a Free Job</h1>
      <p className="mt-1 text-sm text-[#666]">Create a job posting with required details.</p>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Job title" className="rounded-md border border-slate-300 px-3 py-2 text-sm" />
        <input value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} placeholder="Company" className="rounded-md border border-slate-300 px-3 py-2 text-sm" />
        <input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="Location" className="rounded-md border border-slate-300 px-3 py-2 text-sm" />
        <input value={form.salary} onChange={(e) => setForm({ ...form, salary: e.target.value })} placeholder="Salary range" className="rounded-md border border-slate-300 px-3 py-2 text-sm" />
        <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} className="rounded-md border border-slate-300 px-3 py-2 text-sm">
          <option>Full-time</option>
          <option>Contract</option>
          <option>Internship</option>
          <option>Part-time</option>
        </select>
        <input value={form.skills} onChange={(e) => setForm({ ...form, skills: e.target.value })} placeholder="Skills (comma separated)" className="rounded-md border border-slate-300 px-3 py-2 text-sm" />
      </div>
      <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Job description" rows={5} className="mt-3 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />

      <button onClick={submit} disabled={saving} className="mt-4 rounded-full bg-[#0a66c2] px-5 py-2 text-sm font-semibold text-white hover:bg-[#004182] disabled:opacity-60">
        {saving ? 'Publishing...' : 'Publish job'}
      </button>
    </div>
  );
}

