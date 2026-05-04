import { useEffect, useRef, useState } from 'react';
import { BarChart3, Briefcase, Eye, GraduationCap, MapPin, Pencil, Search, Users } from 'lucide-react';
import { Link } from 'react-router-dom';
import { LOCAL_AVATAR_KEY, resolveViewerAvatarUrl } from '../lib/memberProfile';
import { showToast } from '../lib/toast';

type LoadState = { status: 'loading' } | { status: 'ok'; data: any } | { status: 'error'; message: string };
type EditSection = 'profile' | 'suggested' | 'about' | 'activity' | 'experience' | 'education' | 'skills';
const AVATAR_OPTIONS = ['Avery', 'Morgan', 'Noah', 'Sophia', 'Liam', 'Maya'];
const COVER_THEMES: Record<string, string> = {
  blue: 'from-blue-400 to-indigo-500',
  green: 'from-emerald-400 to-cyan-500',
  purple: 'from-violet-400 to-fuchsia-500',
  sunset: 'from-orange-400 to-pink-500'
};

export default function Profile() {
  const MEMBER_ID = sessionStorage.getItem('li_sim_member_id') || 'M-123';
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [editing, setEditing] = useState(false);
  const [editSection, setEditSection] = useState<EditSection>('profile');
  const [dashboard, setDashboard] = useState<any>(null);
  const [draft, setDraft] = useState<any>({});
  const [experienceDraft, setExperienceDraft] = useState<any[]>([]);
  const [educationDraft, setEducationDraft] = useState<any[]>([]);
  const [skillsDraftText, setSkillsDraftText] = useState('');
  const coverFileInputRef = useRef<HTMLInputElement | null>(null);
  const avatarFileInputRef = useRef<HTMLInputElement | null>(null);

  const loadDashboard = () => {
    fetch('/api/analytics/member/dashboard', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ member_id: MEMBER_ID })
    })
      .then((res) => res.json().then((data) => ({ ok: res.ok, data })))
      .then(({ ok, data }) => {
        if (!ok || data?.error) {
          setDashboard({
            profile_views_30d: 0,
            post_impressions_7d: 0,
            search_appearances_30d: 0,
            applications_by_status: [],
            _loadError: data?.message || data?.error || 'Analytics unavailable'
          });
          return;
        }
        setDashboard(data);
      })
      .catch(() =>
        setDashboard({
          profile_views_30d: 0,
          post_impressions_7d: 0,
          search_appearances_30d: 0,
          applications_by_status: [],
          _loadError: 'Could not load analytics'
        })
      );
  };

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
                'No profile for member M-123 yet. With Docker + npm run start:all running, wait for FastAPI to finish schema init, then refresh. Baseline member is created on API startup.'
            });
            return;
          }
          setState({
            status: 'error',
            message:
              res.status === 504
                ? 'Gateway timeout (504). Usually the API on :4000 was not ready yet, or MySQL was slow to accept connections. Wait ~15s after `docker compose up`, restart `npm run start:all`, then refresh.'
                : data.message || data.error || `API error (${res.status}). Check FastAPI on :4000 (npm run start:all).`
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
    loadDashboard();
  }, []);

  useEffect(() => {
    const onFocus = () => loadDashboard();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
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
    '';
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
    // Raw file limit: base64 grows ~4/3; keep under API JSON body limit (FastAPI / members).
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

  const openEditor = (section: EditSection) => {
    setEditSection(section);
    setEditing(true);
    if (section === 'experience') {
      const seed = Array.isArray(profile.experience) && profile.experience.length
        ? profile.experience
        : [{ role: '', company: '', period: '', description: '' }];
      setExperienceDraft(seed.map((x: any) => ({ ...x })));
    }
    if (section === 'education') {
      const seed = Array.isArray(profile.education) && profile.education.length
        ? profile.education
        : [{ school: '', degree: '', period: '' }];
      setEducationDraft(seed.map((x: any) => ({ ...x })));
    }
    if (section === 'skills') {
      const seed = Array.isArray(profile.skills) ? profile.skills : [];
      setSkillsDraftText(seed.join(', '));
    }
  };

  const editSectionLabel: Record<EditSection, string> = {
    profile: 'Profile basics',
    suggested: 'Suggested for you',
    about: 'About',
    activity: 'Activity',
    experience: 'Experience',
    education: 'Education',
    skills: 'Top skills'
  };
  const showBasics = editSection === 'profile';
  const showAbout = editSection === 'about';
  const showActivity = editSection === 'activity';
  const showExperience = editSection === 'experience';
  const showEducation = editSection === 'education';
  const showSkills = editSection === 'skills';
  const showSuggested = editSection === 'suggested';
  const isInline = editing && editSection !== 'profile';

  const saveMemberFields = async (fields: Record<string, any>) => {
    const res = await fetch('/api/members/update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ member_id: MEMBER_ID, ...fields })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || err.error || 'Update failed');
    }
    const merged = { ...state.data, ...draft, ...fields };
    if (merged.profile_photo_url) {
      localStorage.setItem(LOCAL_AVATAR_KEY, merged.profile_photo_url as string);
    }
    setDraft(merged);
    setState({ status: 'ok', data: merged });
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
                onClick={() => {
                  if (editing) setEditing(false);
                  else openEditor('profile');
                }}
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
            onClick={() => openEditor('suggested')}
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

      {editing && editSection === 'profile' && (
        <section className="li-card space-y-3 border border-blue-200 p-5">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-slate-900">Edit profile: {editSectionLabel[editSection]}</h3>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="rounded-md border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              Close
            </button>
          </div>
          <p className="text-sm text-slate-600">
            Update your headline, location, avatar, cover, and key details below. The pencil icon now opens this editor for its section.
          </p>
          {(showBasics || showAbout || showActivity) && (
            <>
              {(showBasics || showActivity) && (
                <input
                  value={draft.headline || draft.title || ''}
                  onChange={(e) => setDraft({ ...draft, headline: e.target.value, title: e.target.value })}
                  placeholder="Headline"
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                />
              )}
              {(showBasics || showAbout) && (
                <textarea
                  value={draft.about || ''}
                  onChange={(e) => setDraft({ ...draft, about: e.target.value, summary: e.target.value })}
                  placeholder="About"
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                  rows={4}
                />
              )}
              {(showBasics || showActivity) && (
                <input
                  value={draft.location || ''}
                  onChange={(e) => setDraft({ ...draft, location: e.target.value })}
                  placeholder="Location"
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                />
              )}
            </>
          )}

          {showBasics && (
            <>
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
            </>
          )}

          {(showExperience || showEducation || showSkills || showSuggested) && (
            <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
              {showExperience && 'Experience is editable inline in the Experience section card.'}
              {showEducation && 'Education is editable inline in the Education section card.'}
              {showSkills && 'Skills are editable inline in the Top skills section card.'}
              {showSuggested && 'Suggested cards are recommendation UI blocks; no profile field write needed.'}
            </div>
          )}
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
            onClick={() => openEditor('about')}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100"
            title="Edit about"
          >
            <Pencil size={15} />
          </button>
        </div>
        {isInline && editSection === 'about' ? (
          <div className="mt-3 space-y-3">
            <textarea
              value={draft.about || ''}
              onChange={(e) => setDraft((d: any) => ({ ...d, about: e.target.value, summary: e.target.value }))}
              rows={4}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
            <div className="flex gap-2">
              <button
                className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white"
                onClick={async () => {
                  try {
                    await saveMemberFields({ about: draft.about, summary: draft.summary });
                    setEditing(false);
                  } catch (e: any) {
                    showToast(String(e.message || 'Could not update about'), 'error');
                  }
                }}
              >
                Save
              </button>
              <button className="rounded-md border border-slate-300 px-3 py-1.5 text-sm" onClick={() => setEditing(false)}>Cancel</button>
            </div>
          </div>
        ) : (
          <p className="mt-2 text-sm leading-relaxed text-slate-700">{profile.about || profile.summary || 'No about section yet.'}</p>
        )}
      </section>
      <section className="li-card p-5">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-slate-900">Activity</h3>
          <div className="flex items-center gap-2">
            <button className="rounded-full border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50">Create a post</button>
            <button
              type="button"
              onClick={() => openEditor('activity')}
              className="inline-flex h-8 w-8 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100"
              title="Edit activity"
            >
              <Pencil size={15} />
            </button>
          </div>
        </div>
        {isInline && editSection === 'activity' ? (
          <div className="mt-3 space-y-3">
            <input
              value={draft.headline || draft.title || ''}
              onChange={(e) => setDraft((d: any) => ({ ...d, headline: e.target.value, title: e.target.value }))}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              placeholder="Activity headline"
            />
            <div className="flex gap-2">
              <button
                className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white"
                onClick={async () => {
                  try {
                    await saveMemberFields({ headline: draft.headline, title: draft.title });
                    setEditing(false);
                  } catch (e: any) {
                    showToast(String(e.message || 'Could not update activity'), 'error');
                  }
                }}
              >
                Save
              </button>
              <button className="rounded-md border border-slate-300 px-3 py-1.5 text-sm" onClick={() => setEditing(false)}>Cancel</button>
            </div>
          </div>
        ) : (
          <>
            <p className="mt-2 text-sm font-semibold text-[#0a66c2]">{displayName} posted yet</p>
            <p className="text-xs text-slate-600">Posts you share will be displayed here.</p>
          </>
        )}
      </section>
      <section className="li-card overflow-hidden border border-[#e0dfdc] p-0 shadow-sm">
        <div className="px-4 pb-1 pt-4">
          <h3 className="text-[20px] font-semibold leading-tight text-[#191919]">Analytics</h3>
          <div className="mt-1 flex items-center gap-1.5 text-xs text-[#666666]">
            <Eye size={14} className="shrink-0 text-[#666]" aria-hidden />
            <span>Private to you</span>
          </div>
        </div>
        {dashboard?._loadError ? (
          <p className="px-4 pb-2 text-xs text-amber-800">{dashboard._loadError} (showing zeros).</p>
        ) : null}
        <div className="grid grid-cols-1 gap-6 px-4 py-5 sm:grid-cols-3 sm:gap-4">
          <div className="min-w-0">
            <Users size={20} className="text-[#404040]" aria-hidden />
            <p className="mt-2 text-[15px] font-semibold leading-snug text-[#191919]">
              {(dashboard?.profile_views_30d ?? 0).toLocaleString()} profile views
            </p>
            <p className="mt-1 text-xs leading-snug text-[#666666]">Discover who&apos;s viewed your profile.</p>
          </div>
          <div className="min-w-0">
            <BarChart3 size={20} className="text-[#404040]" aria-hidden />
            <p className="mt-2 text-[15px] font-semibold leading-snug text-[#191919]">
              {(dashboard?.post_impressions_7d ?? 0).toLocaleString()} post impressions
            </p>
            <p className="mt-1 text-xs leading-snug text-[#666666]">Check out who&apos;s engaging with your posts.</p>
            <p className="mt-1.5 text-xs text-[#999999]">Past 7 days</p>
          </div>
          <div className="min-w-0">
            <Search size={20} className="text-[#404040]" aria-hidden />
            <p className="mt-2 text-[15px] font-semibold leading-snug text-[#191919]">
              {(dashboard?.search_appearances_30d ?? 0).toLocaleString()} search appearances
            </p>
            <p className="mt-1 text-xs leading-snug text-[#666666]">See how often you appear in search results.</p>
          </div>
        </div>
        <div className="border-t border-[#ebebeb] px-4 py-3 text-center">
          <Link
            to="/analytics/member"
            className="text-sm font-semibold text-[#666666] hover:text-[#0a66c2] hover:underline"
          >
            Show all<span className="sr-only"> analytics</span>
            <span aria-hidden> →</span>
          </Link>
        </div>
      </section>

      <section className="li-card p-5">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Briefcase size={18} className="text-slate-500" />
            <h3 className="text-lg font-semibold text-slate-900">Experience</h3>
          </div>
          <button
            type="button"
            onClick={() => openEditor('experience')}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100"
            title="Edit experience"
          >
            <Pencil size={15} />
          </button>
        </div>
        {isInline && editSection === 'experience' ? (
          <div className="space-y-3">
            {experienceDraft.map((exp: any, idx: number) => (
              <div key={idx} className="rounded-md border border-slate-200 p-3">
                <div className="grid gap-2 md:grid-cols-2">
                  <input
                    value={exp.role || ''}
                    onChange={(e) =>
                      setExperienceDraft((prev) =>
                        prev.map((row, i) => (i === idx ? { ...row, role: e.target.value } : row))
                      )
                    }
                    placeholder="Role"
                    className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                  />
                  <input
                    value={exp.company || ''}
                    onChange={(e) =>
                      setExperienceDraft((prev) =>
                        prev.map((row, i) => (i === idx ? { ...row, company: e.target.value } : row))
                      )
                    }
                    placeholder="Company"
                    className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
                <input
                  value={exp.period || ''}
                  onChange={(e) =>
                    setExperienceDraft((prev) =>
                      prev.map((row, i) => (i === idx ? { ...row, period: e.target.value } : row))
                    )
                  }
                  placeholder="Period (e.g., Jan 2020 - Present)"
                  className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                />
                <textarea
                  value={exp.description || ''}
                  onChange={(e) =>
                    setExperienceDraft((prev) =>
                      prev.map((row, i) => (i === idx ? { ...row, description: e.target.value } : row))
                    )
                  }
                  rows={3}
                  placeholder="Description"
                  className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                />
                <button
                  type="button"
                  className="mt-2 rounded-md border border-slate-300 px-3 py-1 text-xs"
                  onClick={() => setExperienceDraft((prev) => prev.filter((_, i) => i !== idx))}
                  disabled={experienceDraft.length <= 1}
                >
                  Remove
                </button>
              </div>
            ))}
            <button
              type="button"
              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm"
              onClick={() =>
                setExperienceDraft((prev) => [...prev, { role: '', company: '', period: '', description: '' }])
              }
            >
              + Add experience
            </button>
            <div className="flex gap-2">
              <button
                className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white"
                onClick={async () => {
                  try {
                    const value = experienceDraft
                      .map((x) => ({
                        role: String(x.role || '').trim(),
                        company: String(x.company || '').trim(),
                        period: String(x.period || '').trim(),
                        description: String(x.description || '').trim()
                      }))
                      .filter((x) => x.role || x.company || x.period || x.description);
                    await saveMemberFields({ experience: value });
                    setEditing(false);
                  } catch {
                    showToast('Could not save experience.', 'error');
                  }
                }}
              >
                Save
              </button>
              <button className="rounded-md border border-slate-300 px-3 py-1.5 text-sm" onClick={() => setEditing(false)}>Cancel</button>
            </div>
          </div>
        ) : (profile.experience || []).length === 0 ? (
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
            onClick={() => openEditor('education')}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100"
            title="Edit education"
          >
            <Pencil size={15} />
          </button>
        </div>
        {isInline && editSection === 'education' ? (
          <div className="space-y-3">
            {educationDraft.map((edu: any, idx: number) => (
              <div key={idx} className="rounded-md border border-slate-200 p-3">
                <div className="grid gap-2 md:grid-cols-2">
                  <input
                    value={edu.school || ''}
                    onChange={(e) =>
                      setEducationDraft((prev) =>
                        prev.map((row, i) => (i === idx ? { ...row, school: e.target.value } : row))
                      )
                    }
                    placeholder="School"
                    className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                  />
                  <input
                    value={edu.degree || ''}
                    onChange={(e) =>
                      setEducationDraft((prev) =>
                        prev.map((row, i) => (i === idx ? { ...row, degree: e.target.value } : row))
                      )
                    }
                    placeholder="Degree"
                    className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
                <input
                  value={edu.period || ''}
                  onChange={(e) =>
                    setEducationDraft((prev) =>
                      prev.map((row, i) => (i === idx ? { ...row, period: e.target.value } : row))
                    )
                  }
                  placeholder="Period (e.g., 2018 - 2020)"
                  className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                />
                <button
                  type="button"
                  className="mt-2 rounded-md border border-slate-300 px-3 py-1 text-xs"
                  onClick={() => setEducationDraft((prev) => prev.filter((_, i) => i !== idx))}
                  disabled={educationDraft.length <= 1}
                >
                  Remove
                </button>
              </div>
            ))}
            <button
              type="button"
              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm"
              onClick={() => setEducationDraft((prev) => [...prev, { school: '', degree: '', period: '' }])}
            >
              + Add education
            </button>
            <div className="flex gap-2">
              <button
                className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white"
                onClick={async () => {
                  try {
                    const value = educationDraft
                      .map((x) => ({
                        school: String(x.school || '').trim(),
                        degree: String(x.degree || '').trim(),
                        period: String(x.period || '').trim()
                      }))
                      .filter((x) => x.school || x.degree || x.period);
                    await saveMemberFields({ education: value });
                    setEditing(false);
                  } catch {
                    showToast('Could not save education.', 'error');
                  }
                }}
              >
                Save
              </button>
              <button className="rounded-md border border-slate-300 px-3 py-1.5 text-sm" onClick={() => setEditing(false)}>Cancel</button>
            </div>
          </div>
        ) : (profile.education || []).length === 0 ? (
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
            onClick={() => openEditor('skills')}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100"
            title="Edit skills"
          >
            <Pencil size={15} />
          </button>
        </div>
        {isInline && editSection === 'skills' ? (
          <div className="mt-3 space-y-3">
            <input
              value={skillsDraftText}
              onChange={(e) => setSkillsDraftText(e.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              placeholder="Comma-separated skills (e.g., React, Kafka, Node.js)"
            />
            <div className="flex gap-2">
              <button
                className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white"
                onClick={async () => {
                  try {
                    const value = skillsDraftText
                      .split(',')
                      .map((s) => s.trim())
                      .filter(Boolean);
                    await saveMemberFields({ skills: value });
                    setEditing(false);
                  } catch {
                    showToast('Could not save skills.', 'error');
                  }
                }}
              >
                Save
              </button>
              <button className="rounded-md border border-slate-300 px-3 py-1.5 text-sm" onClick={() => setEditing(false)}>Cancel</button>
            </div>
          </div>
        ) : (
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
        )}
      </section>
    </div>
  );
}
