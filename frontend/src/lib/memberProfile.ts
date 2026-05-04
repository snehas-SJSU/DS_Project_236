import { getCurrentMemberId } from './auth';

/** Captured at first module load; prefer `getViewerMemberId()` when ownership must match the live session. */
export const MEMBER_ID = sessionStorage.getItem('li_sim_member_id') || 'M-123';

/** Captured at first module load; prefer `getViewerRecruiterId()` for APIs tied to the current user. */
export const RECRUITER_ID =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_RECRUITER_ID) || MEMBER_ID;

/** Member id for the signed-in user (session + JWT fallback — not frozen at module load). */
export function getViewerMemberId(): string {
  if (typeof window === 'undefined') return 'M-123';
  const sid = sessionStorage.getItem('li_sim_member_id');
  if (sid && String(sid).trim()) return String(sid).trim();
  const fromAuth = getCurrentMemberId();
  if (fromAuth && String(fromAuth).trim()) return String(fromAuth).trim();
  return 'M-123';
}

/** Job poster / AI actor id: `VITE_RECRUITER_ID` when set, otherwise current member id. */
export function getViewerRecruiterId(): string {
  const raw =
    typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_RECRUITER_ID;
  const trimmed = raw != null ? String(raw).trim() : '';
  if (trimmed) return trimmed;
  return getViewerMemberId();
}

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
