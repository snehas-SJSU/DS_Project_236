import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { MEMBER_ID, resolveAvatarUrl } from '../lib/memberProfile';
import { addActivity } from '../lib/localData';
import { showToast } from '../lib/toast';

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
};

const fallbackProfiles: Record<string, ProfileData> = {
  'M-DEMO-01': {
    member_id: 'M-DEMO-01',
    name: 'Nina Shah',
    headline: 'Backend Engineer at Orbit',
    location: 'San Jose, CA',
    about: 'Distributed systems engineer focused on Kafka and reliability.',
    skills: ['Node.js', 'Kafka', 'MySQL']
  },
  'M-DEMO-02': {
    member_id: 'M-DEMO-02',
    name: 'Rahul Verma',
    headline: 'Product Manager at Flux',
    location: 'San Francisco, CA',
    about: 'Product leader for B2B collaboration tools.',
    skills: ['Roadmapping', 'Analytics', 'Go-to-market']
  }
};

export default function MemberPublicProfilePage() {
  const { memberId = '' } = useParams();
  const viewerId = MEMBER_ID;
  const [member, setMember] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [connections, setConnections] = useState<string[]>([]);
  const [incoming, setIncoming] = useState<any[]>([]);
  const [sent, setSent] = useState<any[]>([]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const [memberRes, conRes, reqRes] = await Promise.all([
          fetch('http://localhost:4000/api/members/get', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ member_id: memberId })
          }),
          fetch('http://localhost:4000/api/connections/list', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: viewerId })
          }),
          fetch('http://localhost:4000/api/connections/requestsByUser', {
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
                  skills: Array.isArray(memberData.skills) ? memberData.skills : []
                }
              : fallbackProfiles[memberId] || null;
          setMember(profile);
          setConnections(Array.isArray(conData) ? conData : []);
          setIncoming(reqData.incoming || []);
          setSent(reqData.sent || []);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    if (memberId) load();
    return () => {
      cancelled = true;
    };
  }, [memberId, viewerId]);

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
        <div className="h-32 bg-gradient-to-r from-[#bfd7ff] to-[#d6ecff]" />
        <div className="p-5">
          <div className="-mt-16 h-28 w-28 overflow-hidden rounded-full border-4 border-white bg-slate-200">
            <img src={photo} alt={member.name} className="h-full w-full object-cover" />
          </div>
          <h1 className="mt-3 text-2xl font-semibold text-[#191919]">{member.name}</h1>
          <p className="text-sm text-[#555]">{member.headline || member.title || 'LinkedIn member'}</p>
          <p className="mt-1 text-sm text-[#666]">{member.location || 'Location not specified'}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {relation === 'connect' ? (
              <button
                className="rounded-full border border-[#0a66c2] px-4 py-1.5 text-sm font-semibold text-[#0a66c2] hover:bg-[#edf3f8]"
                onClick={async () => {
                  const response = await fetch('http://localhost:4000/api/connections/request', {
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
        <h2 className="text-lg font-semibold text-slate-900">About</h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-700">
          {member.about || member.summary || 'No about section yet.'}
        </p>
      </section>
      <section className="li-card p-5">
        <h2 className="text-lg font-semibold text-slate-900">Skills</h2>
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

