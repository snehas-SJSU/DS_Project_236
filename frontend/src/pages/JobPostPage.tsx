import { useState } from 'react';
import { showToast } from '../lib/toast';
import { getViewerRecruiterId } from '../lib/memberProfile';

const EMPLOYMENT_OPTIONS = [
  { value: 'full-time', label: 'Full-time' },
  { value: 'part-time', label: 'Part-time' },
  { value: 'contract', label: 'Contract' },
  { value: 'internship', label: 'Internship' }
];

const SENIORITY_OPTIONS = [
  { value: 'entry', label: 'Entry level' },
  { value: 'associate', label: 'Associate' },
  { value: 'mid-senior', label: 'Mid–Senior level' },
  { value: 'director', label: 'Director' },
  { value: 'executive', label: 'Executive' },
  { value: 'internship', label: 'Internship (experience)' }
];

const defaultForm = () => ({
  title: '',
  company: 'Acme',
  location: 'San Jose, CA',
  salary: '',
  employment_type: 'full-time',
  seniority_level: 'mid-senior',
  description: '',
  skills: ''
});

export default function JobPostPage() {
  const [form, setForm] = useState(defaultForm);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!form.title.trim()) {
      showToast('Job title is required.', 'error');
      return;
    }
    setSaving(true);
    try {
      const et = form.employment_type;
      const res = await fetch('/api/jobs/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: form.title,
          company: form.company,
          location: form.location,
          salary: form.salary,
          type: et,
          employment_type: et,
          seniority_level: form.seniority_level,
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
      setForm(defaultForm());
    } catch {
      showToast('Service unavailable while posting job.', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="li-card p-5">
      <h1 className="text-xl font-semibold text-[#191919]">Post a New Job</h1>
      <p className="mt-1 text-sm text-[#666]">Create a job posting with required details.</p>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Job title" className="rounded-md border border-slate-300 px-3 py-2 text-sm" />
        <input value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} placeholder="Company" className="rounded-md border border-slate-300 px-3 py-2 text-sm" />
        <input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="Location" className="rounded-md border border-slate-300 px-3 py-2 text-sm" />
        <input value={form.salary} onChange={(e) => setForm({ ...form, salary: e.target.value })} placeholder="Salary range" className="rounded-md border border-slate-300 px-3 py-2 text-sm" />
        <select
          value={form.employment_type}
          onChange={(e) => setForm({ ...form, employment_type: e.target.value })}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          aria-label="Employment type"
        >
          {EMPLOYMENT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <select
          value={form.seniority_level}
          onChange={(e) => setForm({ ...form, seniority_level: e.target.value })}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          aria-label="Seniority level"
        >
          {SENIORITY_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <input
          value={form.skills}
          onChange={(e) => setForm({ ...form, skills: e.target.value })}
          placeholder="Skills (comma separated)"
          className="md:col-span-2 rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
      </div>
      <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Job description" rows={5} className="mt-3 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />

      <button onClick={submit} disabled={saving} className="mt-4 rounded-full bg-[#0a66c2] px-5 py-2 text-sm font-semibold text-white hover:bg-[#004182] disabled:opacity-60">
        {saving ? 'Publishing...' : 'Publish job'}
      </button>
    </div>
  );
}
