import { useState, useEffect } from 'react';
import { Briefcase, GraduationCap, MapPin, Sparkles, Building2, ChevronDown, Pencil } from 'lucide-react';
import { Link } from 'react-router-dom';
import { LOCAL_AVATAR_KEY, MEMBER_ID, resolveAvatarUrl } from '../lib/memberProfile';

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
  const [profileActionStatus, setProfileActionStatus] = useState('');

  useEffect(() => {
    fetch('http://localhost:4000/api/members/get', {
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
            'Could not reach http://localhost:4000. Start the stack (npm run start:all from the repo root) and try again.'
        });
      });
    fetch('http://localhost:4000/api/analytics/member/dashboard', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ member_id: MEMBER_ID })
    })
      .then((res) => res.json())
      .then((data) => setDashboard(data))
      .catch(() => setDashboard(null));
  }, []);

  if (state.status === 'loading') return <div className="p-8 text-center">Loading profile...</div>;
  if (state.status === 'error') {
    return (
      <div className="max-w-xl mx-auto p-8 text-center text-red-600 space-y-3">
        <p className="font-medium">Profile could not be loaded</p>
        <p className="text-sm text-slate-700 whitespace-pre-wrap text-left bg-slate-50 border border-slate-200 rounded-lg p-4">{state.message}</p>
      </div>
    );
  }

  const profile = state.data;
  const avatarUrl = resolveAvatarUrl((draft.profile_photo_url || profile.profile_photo_url) as string | undefined, profile.name);
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

  return (
    <div className="py-2">
      {/* Top Card: Identity */}
      <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden mb-6 relative">
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="absolute right-4 top-3 z-30 inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/95 text-slate-700 shadow hover:bg-white"
          title="Edit cover"
        >
          <Pencil size={15} />
        </button>
        <div className="h-32 bg-slate-200 absolute top-0 left-0 w-full z-0 overflow-hidden">
          {draft.cover_photo_url || profile.cover_photo_url ? (
            <img
              src={(draft.cover_photo_url || profile.cover_photo_url) as string}
              alt="Cover"
              className="h-full w-full object-cover"
            />
          ) : (
            <div className={`w-full h-full bg-gradient-to-r opacity-80 ${coverClass}`} />
          )}
        </div>
        
        <div className="relative z-10 px-8 pt-16 pb-6">
          <div className="flex justify-between items-end">
            <div className="relative w-32 h-32 rounded-full border-4 border-white bg-slate-300 shadow-md flex items-center justify-center text-4xl font-bold text-white overflow-hidden">
              <img src={avatarUrl} alt="Avatar" className="h-full w-full object-cover" />
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="absolute bottom-1 right-1 inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 shadow hover:bg-slate-50"
                title="Edit profile photo"
              >
                <Pencil size={14} />
              </button>
            </div>
            <button
              onClick={() => setEditing((v) => !v)}
              className="bg-blue-600 text-white px-6 py-2 rounded-full font-medium hover:bg-blue-700 transition shadow-sm mb-4"
            >
              {editing ? 'Cancel' : 'Edit Profile'}
            </button>
          </div>
          
          <div className="mt-4">
            <h1 className="text-3xl font-bold text-slate-900">{profile.name}</h1>
            <h2 className="text-lg text-slate-700 mt-1">{profile.title}</h2>
            <div className="flex items-center text-slate-500 text-sm mt-3 font-medium">
              <MapPin size={16} className="mr-1" /> {profile.location}
              <span className="mx-3">•</span>
              <Link to="/network" className="text-blue-600 font-bold hover:underline">500+ Connections</Link>
            </div>
          </div>
        </div>
      </div>

      {editing && (
        <div className="bg-white rounded-lg shadow-sm border-2 border-blue-200 p-6 mb-6 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-lg text-slate-900">Edit profile</h3>
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
                  if (file) onUploadImage(file, 'cover_photo_url');
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
              const res = await fetch('http://localhost:4000/api/members/update', {
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
        </div>
      )}
      <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-4 mb-6">
        <div className="flex flex-wrap gap-2">
          <button
            className="rounded-full border border-slate-300 px-4 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            onClick={async () => {
              const res = await fetch('http://localhost:4000/api/members/create', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  member_id: MEMBER_ID,
                  name: draft.name || profile.name || 'Sneha Singh',
                  email: draft.email || profile.email || 'sneha.singh@example.com',
                  headline: draft.headline || profile.headline || profile.title || 'Software Engineer',
                  location: draft.location || profile.location || 'San Jose, CA',
                  about: draft.about || profile.about || 'LinkedIn simulation profile',
                  skills: draft.skills || profile.skills || []
                })
              });
              const data = await res.json().catch(() => ({}));
              setProfileActionStatus(res.ok ? 'Member create requested successfully.' : `Create failed: ${data.error || res.status}`);
            }}
          >
            Create profile
          </button>
          <button
            className="rounded-full border border-red-300 px-4 py-1.5 text-sm font-semibold text-red-700 hover:bg-red-50"
            onClick={async () => {
              const res = await fetch('http://localhost:4000/api/members/delete', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ member_id: MEMBER_ID })
              });
              const data = await res.json().catch(() => ({}));
              setProfileActionStatus(res.ok ? 'Member deleted (soft delete).' : `Delete failed: ${data.error || res.status}`);
            }}
          >
            Delete profile
          </button>
        </div>
        {profileActionStatus ? <p className="mt-2 text-xs text-slate-600">{profileActionStatus}</p> : null}
      </div>

      {/* About Section */}
      <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-8 mb-6">
        <h3 className="text-xl font-bold text-slate-900 mb-4">About</h3>
        <p className="text-slate-700 leading-relaxed">
          {profile.about}
        </p>

        {/* AI Suggestions Box */}
        <div className="mt-6 border border-indigo-100 bg-indigo-50/50 rounded-lg p-5">
           <div className="flex items-center text-indigo-700 font-semibold mb-2">
             <Sparkles size={18} className="mr-2" /> AI Career Coach Suggestion
           </div>
           <p className="text-sm text-indigo-900/80 mb-3">
             Your profile is strong, but you can increase your visibility by adding specific metrics to your "About" section. For example: "Scaled event architectures processing 1M+ messages/day."
           </p>
           <Link
             to="/jobs"
             className="inline-block text-sm bg-white border border-indigo-200 text-indigo-700 px-4 py-1.5 rounded hover:bg-indigo-50 font-medium transition"
           >
             Apply Suggestion
           </Link>
        </div>
      </div>
      {dashboard && (
        <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6 mb-6">
          <h3 className="text-lg font-semibold text-slate-900 mb-2">Member analytics</h3>
          <p className="text-sm text-slate-600">Profile views (30d): {dashboard.profile_views_30d ?? 0}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {(dashboard.applications_by_status || []).map((row: any) => (
              <span key={row.status} className="rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-700">
                {row.status}: {row.c}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-3 gap-6">
        {/* Left Column (Wider): Experience & Education */}
        <div className="col-span-2 space-y-6">
          <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-8">
            <h3 className="text-xl font-bold text-slate-900 mb-6">Experience</h3>
            
            {(profile.experience || []).map((exp: any, idx: number) => (
              <div key={idx} className="relative pl-6 border-l-2 border-slate-200 mb-8 pb-2">
                <div className="absolute w-4 h-4 bg-blue-600 rounded-full -left-[9px] top-1 border-2 border-white shadow-sm"></div>
                <h4 className="font-bold text-lg text-slate-900 leading-tight">{exp.role}</h4>
                <div className="text-slate-600 font-medium mt-1">{exp.company} • Full-time</div>
                <div className="text-slate-500 text-sm mt-1 mb-3">{exp.period}</div>
                <p className="text-slate-700 leading-relaxed">
                  {exp.description}
                </p>
              </div>
            ))}
          </div>

          <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-8">
            <h3 className="text-xl font-bold text-slate-900 mb-6">Education</h3>
            {(profile.education || []).map((edu: any, idx: number) => (
              <div key={idx} className="flex items-start mb-6 last:mb-0">
                <div className="p-3 bg-slate-100 rounded-lg mr-4">
                  <GraduationCap size={24} className="text-slate-500" />
                </div>
                <div>
                  <h4 className="font-bold text-lg text-slate-900">{edu.school}</h4>
                  <div className="text-slate-700 mt-1">{edu.degree}</div>
                  <div className="text-slate-500 text-sm mt-1">{edu.period}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right Column: Skills */}
        <div className="col-span-1 space-y-6">
          <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
            <h3 className="text-lg font-bold text-slate-900 mb-4">Top Skills</h3>
            <div className="flex flex-col gap-3">
              {(profile.skills || []).map((skill: string, idx: number) => (
                <div key={idx} className="pb-3 border-b border-slate-100 last:border-0 last:pb-0">
                  <div className="font-bold text-slate-800">{skill}</div>
                  <div className="text-sm text-slate-500 flex items-center mt-1">
                    <Building2 size={14} className="mr-1.5" /> {Math.floor(Math.random() * 10) + 1} endorsements
                  </div>
                </div>
              ))}
            </div>
            <Link to="/profile/activity" className="w-full mt-4 py-2 flex items-center justify-center text-slate-500 font-semibold text-sm hover:bg-slate-50 rounded transition">
              Show all skills <ChevronDown size={16} className="ml-1" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
