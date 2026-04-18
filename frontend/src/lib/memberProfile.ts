export const MEMBER_ID = 'M-123';
export const LOCAL_AVATAR_KEY = 'li_sim_profile_avatar';

export function defaultAvatarUrl(name?: string) {
  const label = (name || 'Me').trim().charAt(0).toUpperCase() || 'M';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96" fill="none"><defs><linearGradient id="g" x1="0" y1="0" x2="96" y2="96"><stop stop-color="#0A66C2"/><stop offset="1" stop-color="#004182"/></linearGradient></defs><rect width="96" height="96" rx="48" fill="url(#g)"/><text x="50%" y="55%" text-anchor="middle" fill="white" font-family="Arial, sans-serif" font-size="42" font-weight="700">${label}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

/**
 * Any member (feed authors, search, public profiles). Never uses localStorage —
 * otherwise the viewer's uploaded avatar appears for everyone missing a photo URL.
 */
export function resolveAvatarUrl(photo?: string | null, name?: string) {
  const p = photo && String(photo).trim();
  if (p) return p;
  return defaultAvatarUrl(name);
}

/** Logged-in user only: API / draft photo, else cached local upload, else default. */
export function resolveViewerAvatarUrl(photo?: string | null, name?: string) {
  const p = photo && String(photo).trim();
  if (p) return p;
  const cached = localStorage.getItem(LOCAL_AVATAR_KEY);
  if (cached && cached.trim()) return cached;
  return defaultAvatarUrl(name);
}
