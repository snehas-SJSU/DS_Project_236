import { useEffect, useMemo, useState } from 'react';
import { Briefcase, GraduationCap, MapPin } from 'lucide-react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { getCurrentMemberId } from '../lib/auth';
import { resolveAvatarUrl } from '../lib/memberProfile';
import { addActivity } from '../lib/localData';
import { showToast } from '../lib/toast';

const viewerMemberId = getCurrentMemberId() || sessionStorage.getItem('li_sim_member_id') || 'M-123';

type ProfileData = {
  member_id: string;
  name: string;
  headline?: string;
  title?: string;
  location?: string;
  about?: string;
  summary?: string;
  profile_photo_url?: string;
  skills?: string[];
  experience?: Array<{ role?: string; company?: string; period?: string; description?: string }>;
  education?: Array<{ school?: string; degree?: string; period?: string }>;
};

const fallbackProfiles: Record<string, ProfileData> = {
  'M-a1b2c3d4': {
    member_id: 'M-a1b2c3d4',
    name: 'Alex Chen',
    headline: 'Senior Engineer at Acme',
    location: 'San Jose, CA',
    about: 'Distributed systems engineer focused on Kafka and reliability.',
    skills: ['Node.js', 'Kafka', 'MySQL'],
    experience: [{ role: 'Senior Engineer', company: 'Acme', period: '2021 - Present', description: 'Building scalable backend systems and Kafka-based workflows.' }],
    education: [{ school: 'San Jose State University', degree: 'MS, Software Engineering', period: '2019 - 2021' }]
  },
  'M-e5f6g7h8': {
    member_id: 'M-e5f6g7h8',
    name: 'Priya Kapoor',
    headline: 'Recruiter at Nova Labs',
    location: 'San Francisco, CA',
    about: 'Recruiter focused on backend and distributed systems talent.',
    skills: ['Recruiting', 'Hiring', 'Talent strategy'],
    experience: [{ role: 'Lead Recruiter', company: 'Nova Labs', period: '2022 - Present', description: 'Hiring for backend and distributed systems roles.' }],
    education: [{ school: 'University of California', degree: 'BA, Communication', period: '2015 - 2019' }]
  }
};

export default function MemberPublicProfilePage() {
  const MEMBER_ID = sessionStorage.getItem('li_sim_member_id') || 'M-123';
  const { memberId = '' } = useParams();
  const viewerId = viewerMemberId;
  const [member, setMember] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [connections, setConnections] = useState<string[]>([]);
  const [incoming, setIncoming] = useState<any[]>([]);
  const [sent, setSent] = useState<any[]>([]);

  useEffect(() => {
    let cancelled = false;
    /** Background refresh must not set `loading` or the whole page flashes every poll interval. */
    async function load(options?: { showSpinner?: boolean }) {
      const showSpinner = options?.showSpinner !== false;
      if (showSpinner) setLoading(true);
      try {
        const [memberRes, conRes, reqRes] = await Promise.all([
          fetch('/api/members/get', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ member_id: memberId })
          }),
          fetch('/api/connections/list', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: viewerId })
          }),
          fetch('/api/connections/requestsByUser', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: viewerId })
          })
        ]);

        const memberData = await memberRes.json().catch(() => null);
        const conData = await conRes.json().catch(() => []);
        const reqData = await reqRes.json().catch(() => ({ incoming: [], sent: [] }));

        if (!cancelled) {
          const profile =
            memberRes.ok && memberData && !memberData.error
              ? {
                  member_id: memberData.member_id || memberId,
                  name: memberData.name || memberId,
                  headline: memberData.headline || memberData.title || '',
                  title: memberData.title || '',
                  location: memberData.location || '',
                  about: memberData.about || memberData.summary || '',
                  summary: memberData.summary || '',
                  profile_photo_url: memberData.profile_photo_url,
                  skills: Array.isArray(memberData.skills) ? memberData.skills : [],
                  experience: Array.isArray(memberData.experience) ? memberData.experience : [],
                  education: Array.isArray(memberData.education) ? memberData.education : []
                }
              : fallbackProfiles[memberId] || null;
          setMember(profile);
          setConnections(Array.isArray(conData) ? conData : []);
          setIncoming(reqData.incoming || []);
          setSent(reqData.sent || []);
          if (profile && memberId && memberId !== MEMBER_ID) {
            fetch('/api/analytics/member/recordProfileView', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ viewed_member_id: memberId, viewer_member_id: MEMBER_ID })
            }).catch(() => undefined);
          }
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    if (memberId) load({ showSpinner: true });
    const timer = window.setInterval(() => {
      if (memberId) load({ showSpinner: false });
    }, 4000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [memberId, viewerId, MEMBER_ID]);

  const relation = useMemo<'connect' | 'pending' | 'incoming' | 'connected'>(() => {
    if (!memberId) return 'connect';
    if (connections.includes(memberId)) return 'connected';
    if (sent.some((r) => r.receiver_id === memberId && r.status === 'pending')) return 'pending';
    if (incoming.some((r) => r.requester_id === memberId && r.status === 'pending')) return 'incoming';
    return 'connect';
  }, [connections, incoming, memberId, sent]);

  if (!memberId) return <Navigate to="/network" replace />;
  if (memberId === viewerId) return <Navigate to="/profile" replace />;

  if (loading) {
    return <div className="li-card p-5 text-sm text-slate-500">Loading profile...</div>;
  }
  if (!member) {
    return (
      <div className="li-card p-5">
        <h1 className="text-lg font-semibold text-slate-900">Profile not found</h1>
        <Link to="/network" className="mt-2 inline-block text-sm font-semibold text-[#0a66c2] hover:underline">
          Back to Network
        </Link>
      </div>
    );
  }

  const photo = resolveAvatarUrl(member.profile_photo_url, member.name);

  return (
    <div className="space-y-3">
        <section className="li-card overflow-hidden p-0">
          <div className="h-44 bg-gradient-to-r from-[#bfd7ff] to-[#d6ecff]" />
          <div className="px-5 pb-5">
            <div className="-mt-16 h-32 w-32 overflow-hidden rounded-full border-4 border-white bg-slate-200 shadow-sm">
              <img src={photo} alt={member.name} className="h-full w-full object-cover" />
            </div>
            <h1 className="mt-3 text-2xl font-semibold text-[#191919]">{member.name}</h1>
            <p className="mt-1 text-sm text-[#555]">{member.headline || member.title || 'LinkedIn member'}</p>
            <p className="mt-1 inline-flex items-center gap-1 text-sm text-[#666]">
              <MapPin size={14} /> {member.location || 'Location not specified'}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {relation === 'connect' ? (
                <button
                  className="rounded-full border border-[#0a66c2] px-4 py-1.5 text-sm font-semibold text-[#0a66c2] hover:bg-[#edf3f8]"
                  onClick={async () => {
                    const response = await fetch('/api/connections/request', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ requester_id: viewerId, receiver_id: memberId })
                    });
                    if (response.ok || response.status === 409) {
                      addActivity(`Sent connection request to ${member.name}`);
                      showToast(`Request sent to ${member.name}.`, 'success');
                      setSent((prev) => [...prev, { receiver_id: memberId, status: 'pending' }]);
                    } else {
                      showToast('Unable to send request right now.', 'error');
                    }
                  }}
                >
                  Connect
                </button>
              ) : relation === 'pending' ? (
                <button disabled className="rounded-full border border-slate-300 px-4 py-1.5 text-sm font-semibold text-slate-500">
                  Pending
                </button>
              ) : relation === 'incoming' ? (
                <Link to="/network" className="rounded-full border border-[#0a66c2] px-4 py-1.5 text-sm font-semibold text-[#0a66c2] hover:bg-[#edf3f8]">
                  Respond in Network
                </Link>
              ) : (
                <Link to="/messaging" className="rounded-full border border-[#057642] px-4 py-1.5 text-sm font-semibold text-[#057642] hover:bg-[#eef7f1]">
                  Message
                </Link>
              )}
              <Link to="/network" className="rounded-full border border-slate-300 px-4 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                Back to Network
              </Link>
            </div>
          </div>
        </section>
        <section className="li-card p-5">
          <h2 className="text-sm font-semibold text-slate-900">Suggested for you</h2>
          <p className="text-xs text-slate-500">Based on this profile</p>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <div className="rounded-lg border border-slate-200 p-3">
              <p className="text-sm font-semibold text-slate-900">Shared connections</p>
              <p className="mt-1 text-xs text-slate-600">Check mutual connections in Network.</p>
            </div>
            <div className="rounded-lg border border-slate-200 p-3">
              <p className="text-sm font-semibold text-slate-900">Message this member</p>
              <p className="mt-1 text-xs text-slate-600">Reach out directly from Messaging.</p>
            </div>
          </div>
        </section>
        <section className="li-card p-5">
          <h2 className="text-lg font-semibold text-slate-900">About</h2>
          <p className="mt-2 text-sm leading-relaxed text-slate-700">{member.about || member.summary || 'No about section yet.'}</p>
        </section>
        <section className="li-card p-5">
          <h2 className="text-lg font-semibold text-slate-900">Activity</h2>
          <p className="mt-2 text-sm font-semibold text-[#0a66c2]">{member.name} posted recently</p>
          <p className="text-xs text-slate-600">Public posts and interactions appear here.</p>
        </section>
        <section className="li-card p-5">
          <div className="mb-4 flex items-center gap-2">
            <Briefcase size={18} className="text-slate-500" />
            <h2 className="text-lg font-semibold text-slate-900">Experience</h2>
          </div>
          {(member.experience || []).length === 0 ? (
            <p className="text-sm text-slate-500">No experience added yet.</p>
          ) : (
            <div className="space-y-4">
              {(member.experience || []).map((exp, idx) => (
                <div key={`${exp.company}-${idx}`} className="border-b border-slate-100 pb-3 last:border-b-0 last:pb-0">
                  <p className="font-semibold text-slate-900">{exp.role || 'Role'}</p>
                  <p className="text-sm text-slate-600">{exp.company || 'Company'}</p>
                  <p className="text-xs text-slate-500">{exp.period || ''}</p>
                  {exp.description ? <p className="mt-1 text-sm text-slate-700">{exp.description}</p> : null}
                </div>
              ))}
            </div>
          )}
        </section>
        <section className="li-card p-5">
          <div className="mb-4 flex items-center gap-2">
            <GraduationCap size={18} className="text-slate-500" />
            <h2 className="text-lg font-semibold text-slate-900">Education</h2>
          </div>
          {(member.education || []).length === 0 ? (
            <p className="text-sm text-slate-500">No education added yet.</p>
          ) : (
            <div className="space-y-4">
              {(member.education || []).map((edu, idx) => (
                <div key={`${edu.school}-${idx}`} className="border-b border-slate-100 pb-3 last:border-b-0 last:pb-0">
                  <p className="font-semibold text-slate-900">{edu.school || 'School'}</p>
                  <p className="text-sm text-slate-700">{edu.degree || ''}</p>
                  <p className="text-xs text-slate-500">{edu.period || ''}</p>
                </div>
              ))}
            </div>
          )}
        </section>
        <section className="li-card p-5">
          <h2 className="text-base font-semibold text-slate-900">Skills</h2>
          <div className="mt-2 flex flex-wrap gap-2">
            {(member.skills || []).length === 0 ? (
              <p className="text-sm text-slate-500">No skills listed.</p>
            ) : (
              (member.skills || []).map((skill) => (
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

