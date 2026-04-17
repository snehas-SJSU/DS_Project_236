/** URL-safe company page path (matches route `/company/:companySlug`). */
export function companyProfilePath(companyName: string) {
  return `/company/${encodeURIComponent(companyName.trim())}`;
}

/** Jobs search with optional keyword + location (backend-supported filters). */
export function jobsSearchPath(params: { keyword?: string; location?: string }) {
  const q = new URLSearchParams();
  if (params.keyword?.trim()) q.set('keyword', params.keyword.trim());
  if (params.location?.trim()) q.set('location', params.location.trim());
  const s = q.toString();
  return s ? `/jobs/search?${s}` : '/jobs/search';
}

/** Main jobs board with optional selected job (shareable). */
export function jobsBoardPath(jobId?: string) {
  if (!jobId) return '/jobs';
  return `/jobs?jobId=${encodeURIComponent(jobId)}`;
}

/** LinkedIn-like jobs results page with selected row. */
export function jobsResultsPath(jobId?: string) {
  if (!jobId) return '/jobs/search-results';
  return `/jobs/search-results?jobId=${encodeURIComponent(jobId)}`;
}
