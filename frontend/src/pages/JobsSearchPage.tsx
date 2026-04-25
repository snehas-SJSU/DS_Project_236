import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import Navbar from '../components/layout/Navbar';
import { Job } from '../mockData/jobs';
import { CheckCircle2, X } from 'lucide-react';
import { MEMBER_ID } from '../lib/memberProfile';
import { addActivity, readJson, SAVED_JOBS_KEY, writeJson } from '../lib/localData';
import { companyProfilePath, jobsResultsPath, jobsSearchPath } from '../lib/jobRoutes';
import { mergeJobDetail, normalizeJobListRows } from '../lib/jobNormalize';
import { showToast } from '../lib/toast';
import RecruiterAiJobPanel from '../components/recruiter/RecruiterAiJobPanel';

const chips = ['Date posted', 'Remote', 'Inside Sales', 'Outside Sales', 'Healthcare', 'Biotech', 'Easy Apply', 'Employment type', 'Company', 'Under 10 applicants', 'In my network'];
type DatePostedFilter = '24h' | 'week' | null;

export default function JobsSearchPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [activeJob, setActiveJob] = useState<Job | null>(null);
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveBannerJob, setSaveBannerJob] = useState<Job | null>(null);
  const [datePostedFilter, setDatePostedFilter] = useState<DatePostedFilter>(null);
  const [employmentTypeFilter, setEmploymentTypeFilter] = useState<string | null>(null);
  const [companyFilter, setCompanyFilter] = useState<string | null>(null);
  const [remoteOnly, setRemoteOnly] = useState(false);
  const [insideSalesOnly, setInsideSalesOnly] = useState(false);
  const [outsideSalesOnly, setOutsideSalesOnly] = useState(false);
  const [healthcareOnly, setHealthcareOnly] = useState(false);
  const [biotechOnly, setBiotechOnly] = useState(false);
  const [easyApplyOnly, setEasyApplyOnly] = useState(false);
  const [underTenApplicantsOnly, setUnderTenApplicantsOnly] = useState(false);
  const [networkOnly, setNetworkOnly] = useState(false);
  const [networkCompanies, setNetworkCompanies] = useState<string[]>([]);
  const [searchKeywordInput, setSearchKeywordInput] = useState('');
  const [searchLocationInput, setSearchLocationInput] = useState('');
  const [keywordSuggestions, setKeywordSuggestions] = useState<Array<{ value: string; label: string }>>([]);
  const [showKeywordSuggestions, setShowKeywordSuggestions] = useState(false);

  const keyword = useMemo(() => {
    const q = new URLSearchParams(location.search);
    return q.get('keywords') || q.get('keyword') || '';
  }, [location.search]);

  const locationParam = useMemo(() => {
    const q = new URLSearchParams(location.search);
    return q.get('location') || '';
  }, [location.search]);

  const selectedJobId = useMemo(() => {
    const q = new URLSearchParams(location.search);
    return q.get('jobId') || '';
  }, [location.search]);
  const typeParam = useMemo(() => {
    const q = new URLSearchParams(location.search);
    return q.get('type') || '';
  }, [location.search]);
  const industryParam = useMemo(() => {
    const q = new URLSearchParams(location.search);
    return q.get('industry') || '';
  }, [location.search]);
  const remoteParam = useMemo(() => {
    const q = new URLSearchParams(location.search);
    return q.get('remote') || '';
  }, [location.search]);
  const [searchTypeInput, setSearchTypeInput] = useState('');
  const [searchIndustryInput, setSearchIndustryInput] = useState('');
  const [searchRemoteInput, setSearchRemoteInput] = useState('');

  useEffect(() => {
    setSearchKeywordInput(keyword);
  }, [keyword]);

  useEffect(() => {
    setSearchLocationInput(locationParam);
  }, [locationParam]);
  useEffect(() => {
    setSearchTypeInput(typeParam);
  }, [typeParam]);
  useEffect(() => {
    setSearchIndustryInput(industryParam);
  }, [industryParam]);
  useEffect(() => {
    setSearchRemoteInput(remoteParam);
  }, [remoteParam]);

  useEffect(() => {
    const q = searchKeywordInput.trim();
    if (q.length < 2) {
      setKeywordSuggestions([]);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      fetch('/api/jobs/suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keyword: q, limit: 8 })
      })
        .then((res) => res.json())
        .then((data) => {
          if (cancelled) return;
          setKeywordSuggestions(Array.isArray(data) ? data : []);
        })
        .catch(() => {
          if (cancelled) return;
          setKeywordSuggestions([]);
        });
    }, 180);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [searchKeywordInput]);

  useEffect(() => {
    setLoading(true);
    const basePayload = {
      keyword: keyword || undefined,
      location: locationParam || undefined,
      type: typeParam || undefined,
      industry: industryParam || undefined,
      remote: remoteParam || undefined
    };
    fetch('/api/jobs/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(basePayload)
    })
      .then((res) => res.json())
      .then(async (data) => {
        let rows = normalizeJobListRows(Array.isArray(data) ? data : []);
        const shouldRetryAsLocation =
          !rows.length &&
          !locationParam.trim() &&
          Boolean(keyword.trim());
        if (shouldRetryAsLocation) {
          const retryRes = await fetch('/api/jobs/search', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              ...basePayload,
              keyword: undefined,
              location: keyword.trim()
            })
          });
          const retryData = await retryRes.json().catch(() => []);
          rows = normalizeJobListRows(Array.isArray(retryData) ? retryData : []);
        }
        setJobs(rows);
        if (rows.length) {
          const selected = selectedJobId ? rows.find((j) => j.id === selectedJobId) : null;
          setActiveJob(selected || rows[0]);
        } else {
          setActiveJob(null);
        }
        setLoading(false);
      })
      .catch(() => {
        setJobs([]);
        setLoading(false);
      });
  }, [keyword, locationParam, selectedJobId, typeParam, industryParam, remoteParam]);

  useEffect(() => {
    fetch('/api/connections/list', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: MEMBER_ID })
    })
      .then((res) => res.json())
      .then(async (ids) => {
        const rows = await Promise.all(
          (Array.isArray(ids) ? ids : []).slice(0, 20).map(async (id: string) => {
            try {
              const r = await fetch('/api/members/get', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ member_id: id })
              });
              const d = await r.json().catch(() => ({}));
              return d;
            } catch {
              return null;
            }
          })
        );
        const extracted = new Set<string>();
        rows.forEach((row: any) => {
          const source = String(row?.headline || row?.title || '').trim();
          const atMatch = source.match(/\bat\s+([A-Za-z0-9&.\- ]{2,})/i);
          if (atMatch?.[1]) extracted.add(atMatch[1].trim());
        });
        setNetworkCompanies(Array.from(extracted));
      })
      .catch(() => setNetworkCompanies([]));
  }, []);

  const filteredJobs = useMemo(() => {
    const now = Date.now();
    return jobs.filter((job) => {
      const industry = String((job as any).industry || '').toLowerCase();
      const title = String(job.title || '').toLowerCase();
      const remoteMode = String((job as any).remote_mode || '').toLowerCase();
      const employmentType = String((job as any).employment_type || job.type || '').toLowerCase();
      const company = String(job.company || '');
      const applicants = Number((job as any).applicants ?? 0);
      const createdSource = (job as any).posted_datetime || (job as any).created_at || null;

      if (datePostedFilter && createdSource) {
        const created = new Date(createdSource).getTime();
        if (!Number.isNaN(created)) {
          const age = now - created;
          if (datePostedFilter === '24h' && age > 24 * 60 * 60 * 1000) return false;
          if (datePostedFilter === 'week' && age > 7 * 24 * 60 * 60 * 1000) return false;
        }
      }
      if (remoteOnly && !(remoteMode.includes('remote') || String(job.location || '').toLowerCase().includes('remote'))) return false;
      if (insideSalesOnly && !title.includes('inside sales')) return false;
      if (outsideSalesOnly && !title.includes('outside sales')) return false;
      if (healthcareOnly && !industry.includes('health')) return false;
      if (biotechOnly && !industry.includes('biotech')) return false;
      if (easyApplyOnly && String((job as any).status || 'open').toLowerCase() !== 'open') return false;
      if (employmentTypeFilter && employmentType !== employmentTypeFilter.toLowerCase()) return false;
      if (companyFilter && company !== companyFilter) return false;
      if (underTenApplicantsOnly && applicants >= 10) return false;
      if (networkOnly && !networkCompanies.some((c) => c && company.toLowerCase().includes(c.toLowerCase()))) return false;
      return true;
    });
  }, [
    jobs,
    datePostedFilter,
    remoteOnly,
    insideSalesOnly,
    outsideSalesOnly,
    healthcareOnly,
    biotechOnly,
    easyApplyOnly,
    employmentTypeFilter,
    companyFilter,
    underTenApplicantsOnly,
    networkOnly,
    networkCompanies
  ]);

  useEffect(() => {
    if (!filteredJobs.length) {
      setActiveJob(null);
      return;
    }
    const selected = selectedJobId ? filteredJobs.find((j) => j.id === selectedJobId) : null;
    if (selected) {
      setActiveJob(selected);
      return;
    }
    if (activeJob && filteredJobs.some((j) => j.id === activeJob.id)) return;
    setActiveJob(filteredJobs[0]);
  }, [filteredJobs, selectedJobId]);

  const companies = useMemo(
    () => Array.from(new Set(jobs.map((job) => String(job.company || '').trim()).filter(Boolean))).sort(),
    [jobs]
  );

  const employmentTypes = useMemo(
    () =>
      Array.from(
        new Set(
          jobs
            .map((job) => String((job as any).employment_type || job.type || '').trim())
            .filter(Boolean)
        )
      ).sort(),
    [jobs]
  );

  const handleChipClick = (chip: string) => {
    if (chip === 'Date posted') {
      setDatePostedFilter((prev) => (prev === null ? '24h' : prev === '24h' ? 'week' : null));
      return;
    }
    if (chip === 'Remote') {
      setRemoteOnly((v) => !v);
      return;
    }
    if (chip === 'Inside Sales') {
      setInsideSalesOnly((v) => !v);
      return;
    }
    if (chip === 'Outside Sales') {
      setOutsideSalesOnly((v) => !v);
      return;
    }
    if (chip === 'Healthcare') {
      setHealthcareOnly((v) => !v);
      return;
    }
    if (chip === 'Biotech') {
      setBiotechOnly((v) => !v);
      return;
    }
    if (chip === 'Easy Apply') {
      setEasyApplyOnly((v) => !v);
      return;
    }
    if (chip === 'Employment type') {
      if (!employmentTypes.length) {
        showToast('No employment types available in current results.', 'info');
        return;
      }
      const currentIndex = employmentTypeFilter ? employmentTypes.indexOf(employmentTypeFilter) : -1;
      const nextIndex = currentIndex + 1;
      setEmploymentTypeFilter(nextIndex >= employmentTypes.length ? null : employmentTypes[nextIndex]);
      return;
    }
    if (chip === 'Company') {
      if (!companies.length) {
        showToast('No companies available in current results.', 'info');
        return;
      }
      const currentIndex = companyFilter ? companies.indexOf(companyFilter) : -1;
      const nextIndex = currentIndex + 1;
      setCompanyFilter(nextIndex >= companies.length ? null : companies[nextIndex]);
      return;
    }
    if (chip === 'Under 10 applicants') {
      setUnderTenApplicantsOnly((v) => !v);
      return;
    }
    if (chip === 'In my network') {
      if (!networkCompanies.length) {
        showToast('No network-based company matches found yet.', 'info');
        return;
      }
      setNetworkOnly((v) => !v);
    }
  };

  const chipLabel = (chip: string) => {
    if (chip === 'Date posted' && datePostedFilter) return `Date posted: ${datePostedFilter === '24h' ? '24h' : 'Week'}`;
    if (chip === 'Employment type' && employmentTypeFilter) return `Employment type: ${employmentTypeFilter}`;
    if (chip === 'Company' && companyFilter) return `Company: ${companyFilter}`;
    return chip;
  };

  const chipActive = (chip: string) => {
    if (chip === 'Date posted') return Boolean(datePostedFilter);
    if (chip === 'Remote') return remoteOnly;
    if (chip === 'Inside Sales') return insideSalesOnly;
    if (chip === 'Outside Sales') return outsideSalesOnly;
    if (chip === 'Healthcare') return healthcareOnly;
    if (chip === 'Biotech') return biotechOnly;
    if (chip === 'Easy Apply') return easyApplyOnly;
    if (chip === 'Employment type') return Boolean(employmentTypeFilter);
    if (chip === 'Company') return Boolean(companyFilter);
    if (chip === 'Under 10 applicants') return underTenApplicantsOnly;
    if (chip === 'In my network') return networkOnly;
    return false;
  };

  /** Pull live per-member flags (applied/saved) for selected job. */
  useEffect(() => {
    if (!activeJob?.id) return;
    fetch('/api/jobs/get', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ job_id: activeJob.id, member_id: MEMBER_ID })
    })
      .then((res) => res.json().then((data) => ({ ok: res.ok, data })))
      .then(({ ok, data }) => {
        if (!ok) return;
        setActiveJob((prev) => (prev && prev.id === activeJob.id ? mergeJobDetail(prev, data) : prev));
      })
      .catch(() => undefined);
  }, [activeJob?.id]);

  const onApply = async () => {
    if (!activeJob) return;
    navigate(`/jobs/apply?jobId=${encodeURIComponent(activeJob.id)}`);
  };

  const onSave = async () => {
    if (!activeJob) return;
    setIsSaving(true);
    try {
      const isAlreadySaved = Boolean((activeJob as any).saved);
      const res = await fetch(isAlreadySaved ? '/api/jobs/unsave' : '/api/jobs/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ job_id: activeJob.id, member_id: MEMBER_ID })
      });
      if (!res.ok) {
        showToast(`Unable to ${isAlreadySaved ? 'unsave' : 'save'} right now.`, 'error');
        return;
      }
      const existing = readJson<any[]>(SAVED_JOBS_KEY, []);
      if (isAlreadySaved) {
        writeJson(
          SAVED_JOBS_KEY,
          existing.filter((item) => item.id !== activeJob.id)
        );
        setActiveJob((prev) => (prev ? ({ ...prev, saved: false } as any) : prev));
        setSaveBannerJob(null);
        showToast('Removed from saved jobs.', 'info');
      } else {
        const next = [
          {
            id: activeJob.id,
            title: activeJob.title,
            company: activeJob.company,
            location: activeJob.location,
            savedAt: new Date().toLocaleDateString()
          },
          ...existing.filter((item) => item.id !== activeJob.id)
        ];
        writeJson(SAVED_JOBS_KEY, next.slice(0, 100));
        setActiveJob((prev) => (prev ? ({ ...prev, saved: true } as any) : prev));
        addActivity(`Saved job ${activeJob.title} at ${activeJob.company}`);
        setSaveBannerJob(activeJob);
        showToast('Job saved.', 'success');
      }
    } catch {
      showToast('Unable to save right now.', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const submitSearch = () => {
    const q = new URLSearchParams();
    if (searchKeywordInput.trim()) q.set('keywords', searchKeywordInput.trim());
    if (searchLocationInput.trim()) q.set('location', searchLocationInput.trim());
    if (searchTypeInput.trim()) q.set('type', searchTypeInput.trim());
    if (searchIndustryInput.trim()) q.set('industry', searchIndustryInput.trim());
    if (searchRemoteInput.trim()) q.set('remote', searchRemoteInput.trim());
    const next = q.toString() ? `/jobs/search-results?${q.toString()}` : '/jobs/search-results';
    navigate(next);
  };

  return (
    <div className="min-h-screen bg-white">
      <Navbar />
      <div className="border-b border-[#e0dfdc] bg-white">
        <div className="mx-auto flex max-w-[1128px] flex-wrap items-center gap-2 px-3 py-2">
          <span className="rounded-full bg-[#057642] px-3 py-1 text-sm font-semibold text-white">Jobs</span>
          {chips.map((chip) => (
            <button
              key={chip}
              onClick={() => handleChipClick(chip)}
              className={`rounded-full border px-3 py-1 text-[13px] font-semibold transition-colors ${
                chipActive(chip)
                  ? 'border-[#0a66c2] bg-[#edf3f8] text-[#0a66c2]'
                  : 'border-[#d0d7de] text-[#444] hover:bg-[#f3f2ef]'
              }`}
            >
              {chipLabel(chip)}
            </button>
          ))}
          <Link to="/jobs" className="ml-auto text-sm font-semibold text-[#0a66c2] hover:underline">Jobs home</Link>
        </div>
        <div className="mx-auto flex max-w-[1128px] flex-wrap items-start gap-2 px-3 pb-3">
          <div className="relative min-w-[260px] flex-1">
            <input
              value={searchKeywordInput}
              onChange={(e) => {
                setSearchKeywordInput(e.target.value);
                setShowKeywordSuggestions(true);
              }}
              onFocus={() => setShowKeywordSuggestions(true)}
              onBlur={() => window.setTimeout(() => setShowKeywordSuggestions(false), 120)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submitSearch();
              }}
              placeholder="Search by title, skill, company"
              className="w-full rounded-md border border-[#d0d7de] px-3 py-2 text-sm"
            />
            {showKeywordSuggestions && searchKeywordInput.trim().length >= 2 ? (
              <div className="absolute left-0 right-0 top-10 z-20 rounded-md border border-[#e0dfdc] bg-white py-1 shadow-lg">
                {keywordSuggestions.length ? (
                  keywordSuggestions.map((item) => (
                    <button
                      key={item.value}
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        setSearchKeywordInput(item.value);
                        setShowKeywordSuggestions(false);
                        navigate(`/jobs/search-results?keywords=${encodeURIComponent(item.value)}`);
                      }}
                      className="block w-full px-3 py-2 text-left text-sm hover:bg-[#f3f2ef]"
                    >
                      {item.label}
                    </button>
                  ))
                ) : (
                  <p className="px-3 py-2 text-sm text-[#64748b]">No results found</p>
                )}
              </div>
            ) : null}
          </div>
          <input
            value={searchLocationInput}
            onChange={(e) => setSearchLocationInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submitSearch();
            }}
            placeholder="Location"
            className="min-w-[220px] flex-1 rounded-md border border-[#d0d7de] px-3 py-2 text-sm"
          />
          <select
            value={searchTypeInput}
            onChange={(e) => setSearchTypeInput(e.target.value)}
            className="min-w-[160px] rounded-md border border-[#d0d7de] px-3 py-2 text-sm"
          >
            <option value="">Type</option>
            <option value="Full-time">Full-time</option>
            <option value="Part-time">Part-time</option>
            <option value="Contract">Contract</option>
            <option value="Internship">Internship</option>
          </select>
          <input
            value={searchIndustryInput}
            onChange={(e) => setSearchIndustryInput(e.target.value)}
            placeholder="Industry"
            className="min-w-[160px] rounded-md border border-[#d0d7de] px-3 py-2 text-sm"
          />
          <select
            value={searchRemoteInput}
            onChange={(e) => setSearchRemoteInput(e.target.value)}
            className="min-w-[140px] rounded-md border border-[#d0d7de] px-3 py-2 text-sm"
          >
            <option value="">Remote</option>
            <option value="remote">Remote</option>
            <option value="hybrid">Hybrid</option>
            <option value="onsite">On-site</option>
          </select>
          <button
            type="button"
            onClick={submitSearch}
            className="rounded-md bg-[#0a66c2] px-4 py-2 text-sm font-semibold text-white hover:bg-[#004182]"
          >
            Search
          </button>
        </div>
      </div>
      <div className="mx-auto grid max-w-[1128px] grid-cols-1 gap-0 px-3 py-3 lg:grid-cols-12">
        <section className="border border-[#e0dfdc] bg-white lg:col-span-5">
          <div className="border-b border-[#e0dfdc] px-4 py-2 text-sm text-[#444]">
            {loading ? 'Loading...' : `${filteredJobs.length} results`} {keyword ? `for ${keyword}` : ''}
          </div>
          <div>
            {filteredJobs.map((job) => (
              <Link
                key={job.id}
                to={jobsResultsPath(job.id)}
                className={`block w-full border-b border-[#e0dfdc] px-4 py-2.5 text-left ${activeJob?.id === job.id ? 'bg-[#edf3f8]' : 'hover:bg-[#f9fafb]'}`}
              >
                <p className="text-[22px] leading-tight font-semibold text-[#0a66c2]">{job.title}</p>
                <p className="text-sm text-[#444]">{job.company}</p>
                <p className="text-sm text-[#666]">{job.location}</p>
                <p className="mt-1 text-xs text-[#666]">{job.postedAt} · {job.type}</p>
              </Link>
            ))}
          </div>
        </section>
        <section className="border border-l-0 border-[#e0dfdc] bg-white lg:col-span-7">
          {activeJob ? (
            <div className="p-6">
              <h1 className="text-[44px] leading-[1.05] font-semibold text-[#191919]">{activeJob.title}</h1>
              <p className="mt-2 text-lg text-[#444]">
                <Link to={companyProfilePath(activeJob.company)} className="hover:text-[#0a66c2] hover:underline">
                  {activeJob.company}
                </Link>
                {' '}
                ·{' '}
                <Link
                  to={jobsSearchPath({ location: activeJob.location })}
                  className="hover:text-[#0a66c2] hover:underline"
                >
                  {activeJob.location}
                </Link>
              </p>
              <p className="mt-2 text-sm text-[#666]">{activeJob.postedAt} · {activeJob.applicants ?? 0} applicants</p>
              <div className="mt-4 flex gap-2">
                <button
                  onClick={onApply}
                  disabled={Boolean((activeJob as any).applied)}
                  className="rounded-full bg-[#0a66c2] px-5 py-2 text-sm font-semibold text-white hover:bg-[#004182] disabled:cursor-not-allowed disabled:bg-[#9ec6e5]"
                >
                  {(activeJob as any).applied ? 'Applied' : 'Apply'}
                </button>
                <button
                  onClick={() => {
                    if (isSaving) return;
                    onSave();
                  }}
                  className={`rounded-full border px-5 py-2 text-sm font-semibold transition-colors ${
                    (activeJob as any).saved
                      ? 'border-[#0a66c2] bg-[#edf3f8] text-[#0a66c2] hover:bg-[#dfeaf7]'
                      : 'border-[#0a66c2] text-[#0a66c2] hover:bg-[#edf3f8]'
                  }`}
                >
                  {isSaving ? 'Saving...' : ((activeJob as any).saved ? 'Saved' : 'Save')}
                </button>
              </div>
              <div className="mt-6">
                <h2 className="mb-2 text-[34px] leading-tight font-semibold text-[#191919]">Job description</h2>
                <p className="text-sm leading-relaxed text-[#333]">{activeJob.description}</p>
              </div>
              <RecruiterAiJobPanel jobId={activeJob.id} />
            </div>
          ) : (
            <div className="p-6 text-slate-500">Select a job to view details</div>
          )}
        </section>
      </div>
      {saveBannerJob ? (
        <div className="fixed bottom-5 left-5 z-[130] w-[min(92vw,340px)] rounded-lg border border-slate-200 bg-white p-3 shadow-xl">
          <div className="flex items-start gap-2">
            <CheckCircle2 size={16} className="mt-0.5 text-[#057642]" />
            <p className="text-sm text-[#191919]">
              You saved this job.
            </p>
            <button
              type="button"
              onClick={() => setSaveBannerJob(null)}
              className="ml-auto rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              aria-label="Dismiss save message"
            >
              <X size={14} />
            </button>
          </div>
          <div className="mt-2 flex items-center gap-2">
            <span className="text-xs text-[#666] line-clamp-1">
              {saveBannerJob.title} at {saveBannerJob.company}
            </span>
            <Link
              to="/saved"
              className="ml-auto text-xs font-semibold text-[#0a66c2] hover:underline"
            >
              See saved jobs
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}
