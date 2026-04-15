export const SAVED_JOBS_KEY = 'li_sim_saved_jobs';
export const ACTIVITY_KEY = 'li_sim_activity_feed';
export const SETTINGS_KEY = 'li_sim_user_settings';
export const JOB_PREFS_KEY = 'li_sim_job_preferences';
export const NOTIFICATIONS_READ_KEY = 'li_sim_notifications_read_by_member';

type ActivityItem = {
  id: string;
  text: string;
  time: string;
};

export function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function writeJson<T>(key: string, value: T) {
  localStorage.setItem(key, JSON.stringify(value));
}

export function addActivity(text: string) {
  const existing = readJson<ActivityItem[]>(ACTIVITY_KEY, []);
  const next: ActivityItem[] = [
    { id: `act-${Date.now()}`, text, time: new Date().toLocaleString() },
    ...existing
  ].slice(0, 50);
  writeJson(ACTIVITY_KEY, next);
}

