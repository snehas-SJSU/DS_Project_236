import { useEffect, useRef, useState } from 'react';
import { Briefcase, GraduationCap, MapPin, Pencil } from 'lucide-react';
import { Link } from 'react-router-dom';
import { LOCAL_AVATAR_KEY, MEMBER_ID, resolveViewerAvatarUrl } from '../lib/memberProfile';
import { showToast } from '../lib/toast';

type LoadState = { status: 'loading' } | { status: 'ok'; data: any } | { status: 'error'; message: string };
const AVATAR_OPTIONS = ['Avery', 'Morgan', 'Noah', 'Sophia', 'Liam', 'Maya'];
const COVER_THEMES: Record<string, string> = {
  blue: 'from-blue-400 to-indigo-500',
  green: 'from-emerald-400 to-cyan-500',
  purple: 'from-violet-400 to-fuchsia-500',
  sunset: 'from-orange-400 to-pink-500'
};

export default function Profile() {
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [editing, setEditing] = useState(false);
  const [dashboard, setDashboard] = useState<any>(null);
  const [draft, setDraft] = useState<any>({});
  const coverFileInputRef = useRef<HTMLInputElement | null>(null);
  const avatarFileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    fetch('/api/members/get', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ member_id: MEMBER_ID })
    })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          if (res.status === 404 || data.error === 'NOT_FOUND' || data.error === 'MEMBER_NOT_FOUND') {
            setState({
              status: 'error',
              message:
                'No profile for member M-123 yet. With Docker + Kafka + npm run start:all running, open a terminal in the repo root and run: npm run seed:member — wait a few seconds, then refresh this page.'
            });
            return;
          }
          setState({
            status: 'error',
            message:
              res.status === 504
                ? 'Gateway timeout (504). Usually member service (:4001) was not ready yet, or MySQL was slow to accept connections. Wait ~15s after `docker compose up`, restart `npm run start:all`, then refresh. If it persists, run `npm run seed:member` once the member worker is up.'
                : data.message || data.error || `API error (${res.status}). Check gateway :4000 and member service :4001.`
          });
          return;
        }
        if (data.error) {
          setState({ status: 'error', message: String(data.error) });
          return;
        }
        const localAvatar = localStorage.getItem(LOCAL_AVATAR_KEY) || undefined;
        const mergedData = {
          ...data,
          profile_photo_url: data.profile_photo_url || localAvatar
        };
        setDraft(mergedData);
        setState({ status: 'ok', data: mergedData });
      })
      .catch(() => {
        setState({
          status: 'error',
          message:
            'Could not reach the API. Open this app at http://localhost:3000 (npm run dev) and start the backend (npm run start:all from the repo root).'
        });
      });
    fetch('/api/analytics/member/dashboard', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ member_id: MEMBER_ID })
    })
      .then((res) => res.json())
      .then((data) => setDashboard(data))
      .catch(() => setDashboard(null));
  }, []);

  if (state.status === 'loading') return <div className="li-card p-5 text-sm text-slate-500">Loading profile...</div>;
  if (state.status === 'error') {
    return (
      <div className="li-card p-5">
        <p className="font-semibold text-[#b24020]">Profile could not be loaded</p>
        <p className="mt-2 whitespace-pre-wrap rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">{state.message}</p>
      </div>
    );
  }

  const profile = state.data;
  const displayName =
    (profile.name && String(profile.name).trim()) ||
    [profile.first_name, profile.last_name].filter(Boolean).join(' ').trim() ||
    'Sneha Singh';
  const headlineText = profile.headline || profile.title || 'Full Stack AI Engineer';
  const avatarUrl = resolveViewerAvatarUrl((draft.profile_photo_url || profile.profile_photo_url) as string | undefined, displayName);
  const coverClass = COVER_THEMES[draft.cover_theme || profile.cover_theme || 'blue'] || COVER_THEMES.blue;
  const onUploadImage = (file: File, key: 'profile_photo_url' | 'cover_photo_url') => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setDraft((prev: any) => ({ ...prev, [key]: reader.result }));
      }
    };
    reader.readAsDataURL(file);
  };

  const persistImageUpload = (file: File, key: 'profile_photo_url' | 'cover_photo_url') => {
    if (!file.type.startsWith('image/')) {
      showToast('Choose an image file.', 'error');
      return;
    }
    // Raw file limit: base64 grows ~4/3; keep under API JSON body limit (50MB on member-service).
    const maxBytes = 12 * 1024 * 1024;
    if (file.size > maxBytes) {
      showToast('Image too large — max 12MB file (JPEG/PNG/WebP).', 'error');
      return;
    }
    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = typeof reader.result === 'string' ? reader.result : '';
      if (!dataUrl) return;
      setDraft((prev: any) => ({ ...prev, [key]: dataUrl }));
      try {
        const res = await fetch('/api/members/update', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ member_id: MEMBER_ID, [key]: dataUrl })
        });
        if (res.ok) {
          if (key === 'profile_photo_url') {
            localStorage.setItem(LOCAL_AVATAR_KEY, dataUrl);
          }
          setState((s) => {
            if (s.status !== 'ok') return s;
            return { status: 'ok', data: { ...s.data, [key]: dataUrl } };
          });
          showToast(key === 'profile_photo_url' ? 'Profile photo saved.' : 'Cover photo saved.', 'success');
        } else {
          const errBody = await res.json().catch(() => ({}));
          const msg =
            (errBody && (errBody.message || errBody.error)) ||
            (res.status === 413
              ? 'Payload too large — use a smaller image (max 12MB file).'
              : 'Could not save image. Try a smaller file.');
          showToast(String(msg), 'error');
        }
      } catch {
        showToast('Could not save image.', 'error');
      }
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="space-y-3">
        <section className="li-card relative overflow-hidden p-0">
        <input
          ref={coverFileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          aria-hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (f) persistImageUpload(f, 'cover_photo_url');
          }}
        />
        <input
          ref={avatarFileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          aria-hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (f) persistImageUpload(f, 'profile_photo_url');
          }}
        />
        {/* Cover first; pencil after in DOM so it stacks above and receives clicks */}
        <div className="relative z-0 h-44 bg-slate-200">
          {draft.cover_photo_url || profile.cover_photo_url ? (
            <img
              src={(draft.cover_photo_url || profile.cover_photo_url) as string}
              alt="Cover"
              className="h-full w-full object-cover"
            />
          ) : (
            <div className={`h-full w-full bg-gradient-to-r opacity-80 ${coverClass}`} />
          )}
        </div>
        <button
          type="button"
          onClick={(ev) => {
            ev.preventDefault();
            ev.stopPropagation();
            coverFileInputRef.current?.click();
          }}
          className="absolute right-3 top-3 z-30 inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/95 text-slate-700 shadow hover:bg-white"
          title="Upload cover photo"
        >
          <Pencil size={15} />
        </button>

        <div className="px-5 pb-5">
          <div className="-mt-16 flex flex-wrap items-end justify-between gap-3">
            <div className="relative h-32 w-32 overflow-hidden rounded-full border-4 border-white bg-slate-300 shadow-sm">
              <img src={avatarUrl} alt="Avatar" className="h-full w-full object-cover" />
              <button
                type="button"
                onClick={(ev) => {
                  ev.preventDefault();
                  ev.stopPropagation();
                  avatarFileInputRef.current?.click();
                }}
                className="absolute bottom-1 right-1 inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                title="Upload profile photo"
              >
                <Pencil size={14} />
              </button>
            </div>
          </div>

          <div className="mt-3">
            <h1 className="text-2xl font-semibold text-[#191919]">{displayName}</h1>
            <p className="mt-1 text-sm text-[#555]">{headlineText}</p>
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-[#666]">
              <span className="inline-flex items-center gap-1">
                <MapPin size={14} /> {profile.location || 'Location not specified'}
              </span>
              <span className="text-slate-300">•</span>
              <Link to="/network" className="font-semibold text-[#0a66c2] hover:underline">
                View your network
              </Link>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                onClick={() => setEditing((v) => !v)}
                className="rounded-full bg-[#0a66c2] px-4 py-1.5 text-sm font-semibold text-white hover:bg-[#004182]"
              >
                {editing ? 'Cancel editing' : 'Edit profile'}
              </button>
              <Link to="/jobs" className="rounded-full border border-slate-300 px-4 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                Open to work
              </Link>
              <button className="rounded-full border border-slate-300 px-4 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                Add section
              </button>
            </div>
            <div className="mt-3 flex items-center gap-3 text-xs text-slate-600">
              <span className="rounded bg-slate-100 px-2 py-0.5">Mercedes-Benz Research and Development India</span>
              <span className="rounded bg-slate-100 px-2 py-0.5">San Jose State University</span>
            </div>
          </div>
        </div>
      </section>

      <section className="li-card p-5">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-900">Suggested for you</h3>
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="inline-flex h-7 w-7 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100"
            title="Edit suggested content"
          >
            <Pencil size={14} />
          </button>
        </div>
        <p className="text-xs text-slate-500">Private to you</p>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <div className="rounded-lg border border-slate-200 p-3">
            <p className="text-sm font-semibold text-slate-900">Stand out to employers</p>
            <p className="mt-1 text-xs text-slate-600">Get more profile views by adding key achievements.</p>
            <button className="mt-2 rounded-full border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-700">Try Premium</button>
          </div>
          <div className="rounded-lg border border-slate-200 p-3">
            <p className="text-sm font-semibold text-slate-900">Tell your network you are open to work</p>
            <p className="mt-1 text-xs text-slate-600">Posting can help you get more profile views.</p>
            <button className="mt-2 rounded-full border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-700">Start a post</button>
          </div>
        </div>
      </section>

      {editing && (
        <section className="li-card space-y-3 border border-blue-200 p-5">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-slate-900">Edit profile</h3>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="rounded-md border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              Close
            </button>
          </div>
          <p className="text-sm text-slate-600">Update your headline, location, avatar, and cover style below.</p>
          <input
            value={draft.headline || draft.title || ''}
            onChange={(e) => setDraft({ ...draft, headline: e.target.value, title: e.target.value })}
            placeholder="Headline"
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
          <textarea
            value={draft.about || ''}
            onChange={(e) => setDraft({ ...draft, about: e.target.value, summary: e.target.value })}
            placeholder="About"
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            rows={4}
          />
          <input
            value={draft.location || ''}
            onChange={(e) => setDraft({ ...draft, location: e.target.value })}
            placeholder="Location"
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
          <div>
            <p className="mb-2 text-sm font-semibold text-slate-700">Choose avatar style</p>
            <label className="mb-2 inline-flex cursor-pointer items-center rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">
              Upload avatar image
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) onUploadImage(file, 'profile_photo_url');
                }}
              />
            </label>
            <div className="flex flex-wrap gap-2">
              {AVATAR_OPTIONS.map((seed) => {
                const optionUrl = `https://api.dicebear.com/7.x/avataaars/svg?seed=${seed}`;
                return (
                  <button
                    key={seed}
                    type="button"
                    onClick={() => setDraft({ ...draft, profile_photo_url: optionUrl })}
                    className={`h-12 w-12 overflow-hidden rounded-full border-2 ${
                      (draft.profile_photo_url || profile.profile_photo_url) === optionUrl ? 'border-blue-600' : 'border-slate-300'
                    }`}
                  >
                    <img src={optionUrl} alt={seed} className="h-full w-full object-cover" />
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <p className="mb-2 text-sm font-semibold text-slate-700">Choose cover theme</p>
            <label className="mb-2 inline-flex cursor-pointer items-center rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">
              Upload cover image
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = '';
                  if (file) persistImageUpload(file, 'cover_photo_url');
                }}
              />
            </label>
            <div className="flex flex-wrap gap-2">
              {Object.keys(COVER_THEMES).map((theme) => (
                <button
                  key={theme}
                  type="button"
                  onClick={() => setDraft({ ...draft, cover_theme: theme, cover_photo_url: null })}
                  className={`h-8 w-20 rounded-md bg-gradient-to-r ${COVER_THEMES[theme]} ${
                    (draft.cover_theme || profile.cover_theme || 'blue') === theme ? 'ring-2 ring-offset-1 ring-blue-600' : ''
                  }`}
                />
              ))}
            </div>
          </div>
          <button
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white"
            onClick={async () => {
              const res = await fetch('/api/members/update', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  member_id: MEMBER_ID,
                  headline: draft.headline,
                  title: draft.title,
                  about: draft.about,
                  summary: draft.summary,
                  location: draft.location,
                  profile_photo_url: draft.profile_photo_url,
                  cover_photo_url: draft.cover_photo_url,
                  cover_theme: draft.cover_theme
                })
              });
              if (res.ok) {
                const merged = { ...state.data, ...draft };
                if (merged.profile_photo_url) {
                  localStorage.setItem(LOCAL_AVATAR_KEY, merged.profile_photo_url as string);
                }
                setState({ status: 'ok', data: merged });
                setEditing(false);
              }
            }}
          >
            Save updates
          </button>
        </section>
      )}

      <section className="li-card p-5">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-slate-900">About</h3>
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100"
            title="Edit about"
          >
            <Pencil size={15} />
          </button>
        </div>
        <p className="mt-2 text-sm leading-relaxed text-slate-700">{profile.about || profile.summary || 'No about section yet.'}</p>
      </section>
      <section className="li-card p-5">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-slate-900">Activity</h3>
          <div className="flex items-center gap-2">
            <button className="rounded-full border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50">Create a post</button>
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="inline-flex h-8 w-8 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100"
              title="Edit activity"
            >
              <Pencil size={15} />
            </button>
          </div>
        </div>
        <p className="mt-2 text-sm font-semibold text-[#0a66c2]">{displayName} posted yet</p>
        <p className="text-xs text-slate-600">Posts you share will be displayed here.</p>
      </section>
      {dashboard && (
        <section className="li-card p-5">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-slate-900">Member analytics</h3>
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100"
            title="Edit analytics visibility"
          >
            <Pencil size={15} />
          </button>
        </div>
          <p className="text-sm text-slate-600">Profile views (30d): {dashboard.profile_views_30d ?? 0}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {(dashboard.applications_by_status || []).map((row: any) => (
              <span key={row.status} className="rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-700">
                {row.status}: {row.c}
              </span>
            ))}
          </div>
        </section>
      )}

      <section className="li-card p-5">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Briefcase size={18} className="text-slate-500" />
            <h3 className="text-lg font-semibold text-slate-900">Experience</h3>
          </div>
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100"
            title="Edit experience"
          >
            <Pencil size={15} />
          </button>
        </div>
        {(profile.experience || []).length === 0 ? (
          <p className="text-sm text-slate-500">No experience added yet.</p>
        ) : (
          <div className="space-y-5">
            {(profile.experience || []).map((exp: any, idx: number) => (
              <div key={idx} className="border-b border-slate-100 pb-4 last:border-b-0 last:pb-0">
                <h4 className="font-semibold text-slate-900">{exp.role}</h4>
                <p className="text-sm text-slate-600">{exp.company}</p>
                <p className="text-xs text-slate-500">{exp.period}</p>
                {exp.description ? <p className="mt-1 text-sm text-slate-700">{exp.description}</p> : null}
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="li-card p-5">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <GraduationCap size={18} className="text-slate-500" />
            <h3 className="text-lg font-semibold text-slate-900">Education</h3>
          </div>
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100"
            title="Edit education"
          >
            <Pencil size={15} />
          </button>
        </div>
        {(profile.education || []).length === 0 ? (
          <p className="text-sm text-slate-500">No education added yet.</p>
        ) : (
          <div className="space-y-4">
            {(profile.education || []).map((edu: any, idx: number) => (
              <div key={idx} className="flex items-start gap-3 border-b border-slate-100 pb-3 last:border-b-0 last:pb-0">
                <div className="rounded-md bg-slate-100 p-2">
                  <GraduationCap size={18} className="text-slate-500" />
                </div>
                <div>
                  <h4 className="font-semibold text-slate-900">{edu.school}</h4>
                  <p className="text-sm text-slate-700">{edu.degree}</p>
                  <p className="text-xs text-slate-500">{edu.period}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
      <section className="li-card p-5">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-slate-900">Top skills</h3>
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100"
            title="Edit skills"
          >
            <Pencil size={15} />
          </button>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {(profile.skills || []).length === 0 ? (
            <p className="text-sm text-slate-500">No skills listed.</p>
          ) : (
            (profile.skills || []).map((skill: string) => (
              <span key={skill} className="rounded-full border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-700">
                {skill}
              </span>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
