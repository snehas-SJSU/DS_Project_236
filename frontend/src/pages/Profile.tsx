import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BarChart3,
  Briefcase,
  Eye,
  Globe,
  GraduationCap,
  Mail,
  MapPin,
  MessageCircle,
  MoreVertical,
  Pencil,
  Phone,
  Repeat2,
  Search,
  ThumbsUp,
  UserCircle2,
  Users,
  X
} from 'lucide-react';
import { Link } from 'react-router-dom';
import PostComposerModal from '../components/feed/PostComposerModal';
import {
  defaultPublicProfileSlug,
  LOCAL_AVATAR_KEY,
  MEMBER_CONTACT_UPDATED_EVENT,
  OPEN_CONTACT_INFO_EVENT,
  resolveAvatarUrl,
  resolveViewerAvatarUrl
} from '../lib/memberProfile';
import { showToast } from '../lib/toast';

type LoadState = { status: 'loading' } | { status: 'ok'; data: any } | { status: 'error'; message: string };
type EditSection = 'profile' | 'suggested' | 'about' | 'experience' | 'education' | 'skills';

type ActivityTab = 'all' | 'posts' | 'comments' | 'reposts' | 'likes';

type ActivityApiRow = {
  activity_type: string;
  activity_at: string;
  comment_preview?: string | null;
  post: {
    post_id: string;
    member_id: string;
    author_name: string | null;
    author_headline?: string | null;
    author_profile_photo_url?: string | null;
    body: string;
    image_data: string | null;
    created_at: string;
  };
};

type ContactDraft = {
  email: string;
  phone: string;
  website_url: string;
  website_label: string;
  public_profile_slug: string;
  location: string;
};

function formatWebsiteHref(url: string): string {
  const u = url.trim();
  if (!u) return '';
  if (/^https?:\/\//i.test(u)) return u;
  return `https://${u}`;
}

function displayWebsiteHost(url: string): string {
  return url
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/\/$/, '');
}
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
  const [activityTab, setActivityTab] = useState<ActivityTab>('all');
  const [activityRows, setActivityRows] = useState<ActivityApiRow[]>([]);
  const [activityLoading, setActivityLoading] = useState(false);
  const [composerOpen, setComposerOpen] = useState(false);
  const [editPost, setEditPost] = useState<{ post_id: string; body: string } | null>(null);
  const [contactMenuOpen, setContactMenuOpen] = useState(false);
  const [contactModalOpen, setContactModalOpen] = useState(false);
  const [contactModalScreen, setContactModalScreen] = useState<'view' | 'edit'>('view');
  const [contactDraft, setContactDraft] = useState<ContactDraft>({
    email: '',
    phone: '',
    website_url: '',
    website_label: 'Portfolio',
    public_profile_slug: '',
    location: ''
  });
  const [contactSaving, setContactSaving] = useState(false);
  const contactMenuRef = useRef<HTMLDivElement | null>(null);

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
                `No profile for member ${MEMBER_ID} yet. Wait for FastAPI schema init, refresh, then sign in again if needed (admin@test.com maps to baseline M-123).`
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

  const loadActivity = useCallback(async () => {
    setActivityLoading(true);
    try {
      const res = await fetch('/api/posts/memberActivity', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          member_id: MEMBER_ID,
          viewer_member_id: MEMBER_ID,
          scope: 'full',
          limit: 60
        })
      });
      const data = await res.json().catch(() => []);
      setActivityRows(Array.isArray(data) ? data : []);
    } catch {
      setActivityRows([]);
    } finally {
      setActivityLoading(false);
    }
  }, [MEMBER_ID]);

  useEffect(() => {
    void loadActivity();
  }, [loadActivity]);

  useEffect(() => {
    const onFocus = () => loadDashboard();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, []);

  useEffect(() => {
    if (!contactMenuOpen) return;
    const close = (e: MouseEvent) => {
      const el = contactMenuRef.current;
      if (el && !el.contains(e.target as Node)) setContactMenuOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [contactMenuOpen]);

  useEffect(() => {
    if (!contactModalOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setContactModalOpen(false);
        setContactModalScreen('view');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [contactModalOpen]);

  useEffect(() => {
    const open = () => {
      setContactModalScreen('view');
      setContactModalOpen(true);
    };
    window.addEventListener(OPEN_CONTACT_INFO_EVENT, open);
    return () => window.removeEventListener(OPEN_CONTACT_INFO_EVENT, open);
  }, []);

  const filteredActivity = useMemo(() => {
    if (activityTab === 'all') return activityRows;
    const m: Record<Exclude<ActivityTab, 'all'>, string> = {
      posts: 'created',
      comments: 'commented',
      reposts: 'reposted',
      likes: 'liked'
    };
    return activityRows.filter((r) => r.activity_type === m[activityTab]);
  }, [activityRows, activityTab]);

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

  const activityVerb = (row: ActivityApiRow) => {
    const name = row.post.author_name || row.post.member_id;
    switch (row.activity_type) {
      case 'created':
        return 'You shared a post';
      case 'liked':
        return `You liked ${name}'s post`;
      case 'commented':
        return `You commented on ${name}'s post`;
      case 'reposted':
        return `You reposted ${name}'s post`;
      default:
        return 'Activity';
    }
  };

  const activityIcon = (t: string) => {
    switch (t) {
      case 'liked':
        return <ThumbsUp className="h-4 w-4 text-[#0a66c2]" aria-hidden />;
      case 'commented':
        return <MessageCircle className="h-4 w-4 text-[#0a66c2]" aria-hidden />;
      case 'reposted':
        return <Repeat2 className="h-4 w-4 text-[#057642]" aria-hidden />;
      default:
        return <Pencil className="h-4 w-4 text-slate-500" aria-hidden />;
    }
  };
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
    experience: 'Experience',
    education: 'Education',
    skills: 'Top skills'
  };
  const showBasics = editSection === 'profile';
  const showAbout = editSection === 'about';
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
            <div className="relative h-32 w-32 shrink-0 overflow-hidden rounded-full border-4 border-white bg-slate-300 shadow-sm">
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
            <div className="relative ml-auto sm:ml-0 sm:pt-[4.5rem]" ref={contactMenuRef}>
              <button
                type="button"
                onClick={() => setContactMenuOpen((o) => !o)}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[#e0dfdc] bg-white text-[#191919] hover:bg-[#f3f2ef]"
                title="Profile options"
                aria-expanded={contactMenuOpen}
                aria-haspopup="menu"
              >
                <MoreVertical size={20} />
              </button>
              {contactMenuOpen ? (
                <div
                  className="absolute right-0 z-40 mt-1 min-w-[13rem] rounded-md border border-[#e0dfdc] bg-white py-1 shadow-lg"
                  role="menu"
                >
                  <button
                    type="button"
                    role="menuitem"
                    className="block w-full px-3 py-2 text-left text-sm text-[#191919] hover:bg-[#f3f2ef]"
                    onClick={() => {
                      setContactModalScreen('view');
                      setContactModalOpen(true);
                      setContactMenuOpen(false);
                    }}
                  >
                    Contact info
                  </button>
                </div>
              ) : null}
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
            <div className="mt-2">
              <button
                type="button"
                onClick={() => {
                  setContactModalScreen('view');
                  setContactModalOpen(true);
                }}
                className="text-left text-sm font-semibold text-[#0a66c2] hover:underline"
              >
                Contact info
              </button>
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
            <Link
              to="/premium"
              className="mt-2 inline-block rounded-full border border-[#0a66c2] px-3 py-1 text-xs font-semibold text-[#0a66c2] hover:bg-[#edf3f8]"
            >
              Try Premium
            </Link>
          </div>
          <div className="rounded-lg border border-slate-200 p-3">
            <p className="text-sm font-semibold text-slate-900">Tell your network you are open to work</p>
            <p className="mt-1 text-xs text-slate-600">Posting can help you get more profile views.</p>
            <button
              type="button"
              className="mt-2 rounded-full border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              onClick={() => setComposerOpen(true)}
            >
              Start a post
            </button>
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
          {(showBasics || showAbout) && (
            <>
              {showBasics && (
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
              {showBasics && (
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
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">Activity</h3>
            <p className="mt-0.5 text-xs text-slate-500">{activityRows.length} recent updates</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setComposerOpen(true)}
              className="rounded-full border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              Create a post
            </button>
            <Link
              to="/feed"
              className="rounded-full border border-[#0a66c2] px-3 py-1 text-xs font-semibold text-[#0a66c2] hover:bg-[#edf3f8]"
            >
              Go to feed
            </Link>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-1 border-b border-slate-200 pb-2">
          {(
            [
              ['all', 'All'],
              ['posts', 'Posts'],
              ['comments', 'Comments'],
              ['reposts', 'Reposts'],
              ['likes', 'Likes']
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setActivityTab(id)}
              className={`rounded-full px-3 py-1 text-xs font-semibold ${
                activityTab === id ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        {activityLoading ? (
          <p className="mt-4 text-sm text-slate-500">Loading activity…</p>
        ) : filteredActivity.length === 0 ? (
          <p className="mt-4 text-sm text-slate-600">
            {activityTab === 'all'
              ? 'No activity yet. Create a post or engage with the feed — likes, comments, and reposts show up here.'
              : `No ${activityTab} to show yet.`}
          </p>
        ) : (
          <ul className="mt-4 space-y-3">
            {filteredActivity.map((row, idx) => {
              const p = row.post;
              const href = `/feed#${encodeURIComponent(p.post_id)}`;
              const canEditPost = p.member_id === MEMBER_ID;
              const authorPhoto = resolveAvatarUrl(p.author_profile_photo_url, p.author_name || p.member_id);
              return (
                <li key={`${idx}-${row.activity_type}-${p.post_id}-${String(row.activity_at)}`} className="rounded-lg border border-slate-200 bg-white">
                  <div className="flex items-center gap-2 border-b border-slate-100 px-3 py-2 text-xs text-slate-600">
                    <span className="text-slate-500">{activityIcon(row.activity_type)}</span>
                    <span className="font-semibold text-[#191919]">{activityVerb(row)}</span>
                    <span className="ml-auto shrink-0 text-slate-400">
                      {new Date(row.activity_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                    </span>
                  </div>
                  <Link to={href} className="block px-3 py-3 hover:bg-slate-50">
                    <div className="flex gap-3">
                      <img src={authorPhoto} alt="" className="h-10 w-10 shrink-0 rounded-full border border-slate-200 object-cover" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-[#191919]">{p.author_name || p.member_id}</p>
                        {p.author_headline ? <p className="text-xs text-slate-500">{p.author_headline}</p> : null}
                        <p className="mt-2 line-clamp-3 whitespace-pre-wrap text-sm text-slate-800">{p.body}</p>
                        {row.activity_type === 'commented' && row.comment_preview ? (
                          <p className="mt-2 rounded border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs text-slate-700">
                            Your comment: {row.comment_preview}
                          </p>
                        ) : null}
                      </div>
                    </div>
                  </Link>
                  {canEditPost ? (
                    <div className="flex justify-end border-t border-slate-100 px-2 py-1">
                      <button
                        type="button"
                        title="Edit your post"
                        onClick={(e) => {
                          e.preventDefault();
                          setEditPost({ post_id: p.post_id, body: p.body });
                        }}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100"
                      >
                        <Pencil size={15} />
                      </button>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <PostComposerModal
        open={composerOpen}
        onClose={() => setComposerOpen(false)}
        memberId={MEMBER_ID}
        authorName={displayName}
        onPosted={() => loadActivity()}
      />

      {editPost ? (
        <div
          className="fixed inset-0 z-[100] flex items-start justify-center bg-black/50 p-4 pt-16"
          role="dialog"
          aria-modal="true"
          aria-labelledby="edit-post-title"
        >
          <div className="w-full max-w-lg rounded-lg bg-white p-5 shadow-xl">
            <h2 id="edit-post-title" className="text-lg font-semibold text-[#191919]">
              Edit post
            </h2>
            <textarea
              value={editPost.body}
              onChange={(e) => setEditPost({ ...editPost, body: e.target.value })}
              rows={8}
              className="mt-3 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                onClick={() => setEditPost(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="rounded-full bg-[#0a66c2] px-4 py-2 text-sm font-semibold text-white hover:bg-[#004182]"
                onClick={async () => {
                  const text = editPost.body.trim();
                  if (!text) {
                    showToast('Post cannot be empty.', 'error');
                    return;
                  }
                  try {
                    const res = await fetch('/api/posts/update', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        post_id: editPost.post_id,
                        member_id: MEMBER_ID,
                        body: text
                      })
                    });
                    if (!res.ok) {
                      const err = await res.json().catch(() => ({}));
                      showToast(String(err.message || err.error || 'Could not save post'), 'error');
                      return;
                    }
                    showToast('Post updated.', 'success');
                    setEditPost(null);
                    await loadActivity();
                  } catch {
                    showToast('Could not save post.', 'error');
                  }
                }}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      ) : null}
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

      {contactModalOpen ? (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="contact-info-title"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) {
              setContactModalOpen(false);
              setContactModalScreen('view');
            }
          }}
        >
          <div
            className="w-full max-w-[440px] overflow-hidden rounded-lg border border-[#d0d7de] bg-white shadow-[0_8px_40px_rgba(0,0,0,0.12)]"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between border-b border-[#ebebeb] px-5 py-4">
              <h2 id="contact-info-title" className="text-lg font-semibold leading-tight text-[#191919]">
                {contactModalScreen === 'view' ? 'Contact info' : 'Edit contact info'}
              </h2>
              <button
                type="button"
                className="rounded-full p-1 text-[#666666] hover:bg-[#f3f2ef]"
                aria-label="Close"
                onClick={() => {
                  setContactModalOpen(false);
                  setContactModalScreen('view');
                }}
              >
                <X size={22} strokeWidth={1.75} />
              </button>
            </div>

            {contactModalScreen === 'view' ? (
              <>
                <div className="max-h-[min(70vh,520px)] overflow-y-auto px-5 pt-1">
                  {(() => {
                    const slug = defaultPublicProfileSlug({
                      name: profile.name,
                      public_profile_slug: profile.public_profile_slug,
                      member_id: MEMBER_ID
                    });
                    const site = String(profile.website_url || '').trim();
                    const siteLabel = String(profile.website_label || 'Portfolio').trim();
                    const phone = String(profile.phone || '').trim();
                    const loc = String(profile.location || '').trim();
                    const em = String(profile.email || '').trim();
                    const rowIcon = 'mt-0.5 h-[18px] w-[18px] shrink-0 text-[#666666]';
                    return (
                      <div className="pb-1">
                        <div className="flex gap-3 border-t border-[#ebebeb] py-4">
                          <UserCircle2 className={rowIcon} aria-hidden />
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-[#191919]">Your profile</p>
                            <a
                              href={`https://www.linkedin.com/in/${encodeURIComponent(slug)}`}
                              target="_blank"
                              rel="noreferrer"
                              className="mt-1 block text-sm font-semibold text-[#0a66c2] hover:underline"
                            >
                              linkedin.com/in/{slug}
                            </a>
                          </div>
                        </div>
                        <div className="flex gap-3 border-t border-[#ebebeb] py-4">
                          <Globe className={rowIcon} aria-hidden />
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-[#191919]">Website</p>
                            {site ? (
                              <p className="mt-1 text-sm">
                                <a
                                  href={formatWebsiteHref(site)}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="font-semibold text-[#0a66c2] hover:underline"
                                >
                                  {displayWebsiteHost(site)}
                                </a>
                                {siteLabel ? (
                                  <span className="text-sm font-normal text-[#666666]"> ({siteLabel})</span>
                                ) : null}
                              </p>
                            ) : (
                              <p className="mt-1 text-sm text-[#666666]">Not added</p>
                            )}
                          </div>
                        </div>
                        <div className="flex gap-3 border-t border-[#ebebeb] py-4">
                          <Phone className={rowIcon} aria-hidden />
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-[#191919]">Phone</p>
                            {phone ? (
                              <p className="mt-1 text-sm">
                                <a href={`tel:${phone.replace(/\s/g, '')}`} className="font-semibold text-[#0a66c2] hover:underline">
                                  {phone}
                                </a>
                                <span className="text-sm text-[#666666]"> (Mobile)</span>
                              </p>
                            ) : (
                              <p className="mt-1 text-sm text-[#666666]">Not added</p>
                            )}
                          </div>
                        </div>
                        <div className="flex gap-3 border-t border-[#ebebeb] py-4">
                          <MapPin className={rowIcon} aria-hidden />
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-[#191919]">Address</p>
                            <p className="mt-1 text-sm text-[#191919]">{loc || 'Not added'}</p>
                          </div>
                        </div>
                        <div className="flex gap-3 border-t border-[#ebebeb] py-4">
                          <Mail className={rowIcon} aria-hidden />
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-[#191919]">Email</p>
                            {em ? (
                              <a href={`mailto:${em}`} className="mt-1 block text-sm font-semibold text-[#0a66c2] hover:underline">
                                {em}
                              </a>
                            ) : (
                              <p className="mt-1 text-sm text-[#666666]">Not added</p>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                </div>
                <div className="flex justify-end border-t border-[#ebebeb] bg-white px-5 py-3">
                  <button
                    type="button"
                    className="rounded-full border-2 border-[#0a66c2] bg-white px-4 py-1.5 text-sm font-semibold text-[#0a66c2] hover:bg-[#eef3f8]"
                    onClick={() => {
                      setContactDraft({
                        email: String(profile.email || '').trim(),
                        phone: String(profile.phone || '').trim(),
                        website_url: String(profile.website_url || '').trim(),
                        website_label: String(profile.website_label || 'Portfolio').trim() || 'Portfolio',
                        public_profile_slug: String(profile.public_profile_slug || '').trim(),
                        location: String(profile.location || '').trim()
                      });
                      setContactModalScreen('edit');
                    }}
                  >
                    Edit contact info
                  </button>
                </div>
              </>
            ) : (
              <div className="px-5 pb-5 pt-2">
                <p className="mb-4 text-sm text-[#666666]">
                  Changes apply to your profile. Use a URL slug with letters, numbers, and hyphens only.
                </p>
                <div className="space-y-3">
                  <div>
                    <label htmlFor="profile-contact-slug" className="text-xs font-semibold text-[#666666]">
                      Public profile URL (linkedin.com/in/…)
                    </label>
                    <input
                      id="profile-contact-slug"
                      type="text"
                      value={contactDraft.public_profile_slug}
                      onChange={(e) => setContactDraft((d) => ({ ...d, public_profile_slug: e.target.value }))}
                      className="mt-1 w-full rounded border border-[#b6b6b6] px-3 py-2 text-sm text-[#191919] placeholder:text-[#999]"
                      placeholder="e.g. jane-doe"
                    />
                  </div>
                  <div>
                    <label htmlFor="profile-contact-website" className="text-xs font-semibold text-[#666666]">
                      Website
                    </label>
                    <input
                      id="profile-contact-website"
                      type="url"
                      value={contactDraft.website_url}
                      onChange={(e) => setContactDraft((d) => ({ ...d, website_url: e.target.value }))}
                      className="mt-1 w-full rounded border border-[#b6b6b6] px-3 py-2 text-sm text-[#191919] placeholder:text-[#999]"
                      placeholder="https://your-site.com"
                    />
                  </div>
                  <div>
                    <label htmlFor="profile-contact-website-label" className="text-xs font-semibold text-[#666666]">
                      Website label
                    </label>
                    <input
                      id="profile-contact-website-label"
                      type="text"
                      value={contactDraft.website_label}
                      onChange={(e) => setContactDraft((d) => ({ ...d, website_label: e.target.value }))}
                      className="mt-1 w-full rounded border border-[#b6b6b6] px-3 py-2 text-sm text-[#191919] placeholder:text-[#999]"
                      placeholder="Portfolio"
                    />
                  </div>
                  <div>
                    <label htmlFor="profile-contact-phone" className="text-xs font-semibold text-[#666666]">
                      Phone
                    </label>
                    <input
                      id="profile-contact-phone"
                      type="tel"
                      autoComplete="tel"
                      value={contactDraft.phone}
                      onChange={(e) => setContactDraft((d) => ({ ...d, phone: e.target.value }))}
                      className="mt-1 w-full rounded border border-[#b6b6b6] px-3 py-2 text-sm text-[#191919] placeholder:text-[#999]"
                      placeholder="+1 555 000 0000"
                    />
                  </div>
                  <div>
                    <label htmlFor="profile-contact-address" className="text-xs font-semibold text-[#666666]">
                      Address (shown on profile)
                    </label>
                    <input
                      id="profile-contact-address"
                      type="text"
                      value={contactDraft.location}
                      onChange={(e) => setContactDraft((d) => ({ ...d, location: e.target.value }))}
                      className="mt-1 w-full rounded border border-[#b6b6b6] px-3 py-2 text-sm text-[#191919] placeholder:text-[#999]"
                      placeholder="City, State"
                    />
                  </div>
                  <div>
                    <label htmlFor="profile-contact-email" className="text-xs font-semibold text-[#666666]">
                      Email
                    </label>
                    <input
                      id="profile-contact-email"
                      type="email"
                      autoComplete="email"
                      value={contactDraft.email}
                      onChange={(e) => setContactDraft((d) => ({ ...d, email: e.target.value }))}
                      className="mt-1 w-full rounded border border-[#b6b6b6] px-3 py-2 text-sm text-[#191919] placeholder:text-[#999]"
                      placeholder="you@example.com"
                    />
                  </div>
                </div>
                <div className="mt-5 flex flex-wrap justify-end gap-2">
                  <button
                    type="button"
                    className="rounded-full border border-[#747474] bg-white px-4 py-1.5 text-sm font-semibold text-[#404040] hover:bg-[#f3f2ef]"
                    onClick={() => setContactModalScreen('view')}
                    disabled={contactSaving}
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    className="rounded-full bg-[#0a66c2] px-4 py-1.5 text-sm font-semibold text-white hover:bg-[#004182] disabled:opacity-50"
                    disabled={contactSaving}
                    onClick={async () => {
                      const email = contactDraft.email.trim();
                      const phone = contactDraft.phone.trim();
                      const website_url = contactDraft.website_url.trim();
                      const website_label = contactDraft.website_label.trim();
                      const location = contactDraft.location.trim();
                      const slugRaw = contactDraft.public_profile_slug.trim();
                      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
                        showToast('Please enter a valid email address or leave it blank.', 'error');
                        return;
                      }
                      if (slugRaw && !/^[a-zA-Z0-9-]+$/.test(slugRaw)) {
                        showToast('Profile URL may only contain letters, numbers, and hyphens.', 'error');
                        return;
                      }
                      if (website_url) {
                        try {
                          new URL(formatWebsiteHref(website_url));
                        } catch {
                          showToast('Please enter a valid website URL.', 'error');
                          return;
                        }
                      }
                      setContactSaving(true);
                      try {
                        await saveMemberFields({
                          email,
                          phone,
                          website_url: website_url || '',
                          website_label: website_label || '',
                          public_profile_slug: slugRaw,
                          location
                        });
                        setContactModalScreen('view');
                        showToast('Contact info saved.', 'success');
                        window.dispatchEvent(new Event(MEMBER_CONTACT_UPDATED_EVENT));
                      } catch (e: unknown) {
                        const msg = e instanceof Error ? e.message : 'Could not save contact information.';
                        showToast(msg, 'error');
                      } finally {
                        setContactSaving(false);
                      }
                    }}
                  >
                    {contactSaving ? 'Saving…' : 'Save'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
