export const MEMBER_ID = 'M-123';
export const LOCAL_AVATAR_KEY = 'li_sim_profile_avatar';

export function defaultAvatarUrl(name?: string) {
  return `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(name || 'Profile')}`;
}

export function resolveAvatarUrl(photo?: string, name?: string) {
  return photo || localStorage.getItem(LOCAL_AVATAR_KEY) || defaultAvatarUrl(name);
}

