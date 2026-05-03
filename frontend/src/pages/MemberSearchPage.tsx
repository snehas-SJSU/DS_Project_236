import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import Navbar from '../components/layout/Navbar';
import { resolveAvatarUrl } from '../lib/memberProfile';
import { addActivity } from '../lib/localData';
import { showToast } from '../lib/toast';

type MemberResult = {
  id: string;
  name: string;
  headline: string;
  location: string;
  photo?: string;
};

export default function MemberSearchPage() {
  const MEMBER_ID = sessionStorage.getItem('li_sim_member_id') || 'M-123';
  const [searchParams] = useSearchParams();
  const memberId = MEMBER_ID;
  const [keyword, setKeyword] = useState('');
  const [location, setLocation] = useState('');
  const [skill, setSkill] = useState('');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<MemberResult[]>([]);
  const [connections, setConnections] = useState<string[]>([]);
  const [incoming, setIncoming] = useState<any[]>([]);
  const [sent, setSent] = useState<any[]>([]);

  const avatarFor = (seed: string) =>
    `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(seed)}`;

  async function refreshConnectionState() {
    const [listRes, reqRes] = await Promise.all([
      fetch('/api/connections/list', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: memberId })
      }),
      fetch('/api/connections/requestsByUser', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: memberId })
      })
    ]);
    const listData = await listRes.json().catch(() => []);
    const reqData = await reqRes.json().catch(() => ({ incoming: [], sent: [] }));
    setConnections(Array.isArray(listData) ? listData : []);
    setIncoming(Array.isArray(reqData.incoming) ? reqData.incoming : []);
    setSent(Array.isArray(reqData.sent) ? reqData.sent : []);
  }

  async function runSearch(e?: FormEvent) {
    if (e) e.preventDefault();
    setLoading(true);
    const res = await fetch('/api/members/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        keyword: keyword.trim(),
        location: location.trim(),
        skill: skill.trim()
      })
    });
    const data = await res.json().catch(() => []);
    const normalized = (Array.isArray(data) ? data : [])
      .filter((m: any) => m.member_id && m.member_id !== memberId)
      .map((m: any) => ({
        id: m.member_id,
        name: m.name || `${m.first_name || ''} ${m.last_name || ''}`.trim() || m.member_id,
        headline: m.headline || m.title || 'LinkedIn member',
        location: m.location || [m.city, m.state, m.country].filter(Boolean).join(', '),
        photo: resolveAvatarUrl(m.profile_photo_url, m.name || m.member_id)
      }));
    setResults(normalized);
    setLoading(false);
  }

  useEffect(() => {
    runSearch().catch(() => undefined);
    refreshConnectionState().catch(() => undefined);
    const timer = window.setInterval(() => {
      refreshConnectionState().catch(() => undefined);
    }, 4000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const qpKeyword = searchParams.get('keyword') || '';
    const qpLocation = searchParams.get('location') || '';
    const qpSkill = searchParams.get('skill') || '';
    setKeyword(qpKeyword);
    setLocation(qpLocation);
    setSkill(qpSkill);
    const hasAny = qpKeyword || qpLocation || qpSkill;
    if (hasAny) {
      fetch('/api/members/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          keyword: qpKeyword.trim(),
          location: qpLocation.trim(),
          skill: qpSkill.trim()
        })
      })
        .then((res) => res.json())
        .then((data) => {
          const normalized = (Array.isArray(data) ? data : [])
            .filter((m: any) => m.member_id && m.member_id !== memberId)
            .map((m: any) => ({
              id: m.member_id,
              name: m.name || `${m.first_name || ''} ${m.last_name || ''}`.trim() || m.member_id,
              headline: m.headline || m.title || 'LinkedIn member',
              location: m.location || [m.city, m.state, m.country].filter(Boolean).join(', '),
              photo: resolveAvatarUrl(m.profile_photo_url, m.name || m.member_id)
            }));
          setResults(normalized);
        })
        .catch(() => undefined);
    }
  }, [searchParams]);

  const buttonStateFor = useMemo(
    () => (targetId: string): 'connected' | 'pending' | 'incoming' | 'connect' => {
      if (connections.includes(targetId)) return 'connected';
      if (sent.some((r) => r.receiver_id === targetId && r.status === 'pending')) return 'pending';
      if (incoming.some((r) => r.requester_id === targetId && r.status === 'pending')) return 'incoming';
      return 'connect';
    },
    [connections, incoming, sent]
  );

  return (
    <div className="min-h-screen bg-[#f3f2ef]">
      <Navbar />
      <div className="mx-auto max-w-[1128px] px-3 py-5">
        <div className="li-card p-5">
          <div className="mb-4 flex items-center justify-between">
            <h1 className="text-xl font-semibold text-[#191919]">Search people</h1>
            <Link to="/network" className="text-sm font-semibold text-[#0a66c2] hover:underline">
              Back to My Network
            </Link>
          </div>

          <form onSubmit={runSearch} className="grid gap-2 md:grid-cols-4">
            <input
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="Name or keyword"
              className="rounded border border-slate-300 px-3 py-2 text-sm focus:border-[#0a66c2] focus:outline-none"
            />
            <input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Location"
              className="rounded border border-slate-300 px-3 py-2 text-sm focus:border-[#0a66c2] focus:outline-none"
            />
            <input
              value={skill}
              onChange={(e) => setSkill(e.target.value)}
              placeholder="Skill"
              className="rounded border border-slate-300 px-3 py-2 text-sm focus:border-[#0a66c2] focus:outline-none"
            />
            <button
              type="submit"
              className="rounded bg-[#0a66c2] px-4 py-2 text-sm font-semibold text-white hover:bg-[#004182]"
            >
              Search
            </button>
          </form>

          <div className="mt-4 space-y-3">
            {loading ? <p className="text-sm text-slate-500">Searching members...</p> : null}
            {!loading && results.length === 0 ? (
              <p className="text-sm text-slate-500">No members found for current filters.</p>
            ) : null}
            {results.map((member) => {
              const state = buttonStateFor(member.id);
              return (
                <div key={member.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white p-3">
                  <Link to={`/profile/${encodeURIComponent(member.id)}`} className="flex min-w-0 items-center gap-3">
                    <div className="h-12 w-12 overflow-hidden rounded-full border border-slate-200">
                      <img src={member.photo || avatarFor(member.name)} alt={member.name} className="h-full w-full object-cover" />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-[#191919] hover:text-[#0a66c2]">{member.name}</p>
                      <p className="truncate text-xs text-[#666]">{member.headline}</p>
                      <p className="truncate text-xs text-[#666]">{member.location || 'Location not set'}</p>
                    </div>
                  </Link>

                  {state === 'connect' ? (
                    <button
                      className="rounded-full border border-[#0a66c2] px-4 py-1.5 text-sm font-semibold text-[#0a66c2] hover:bg-[#edf3f8]"
                      onClick={async () => {
                        const response = await fetch('/api/connections/request', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ requester_id: memberId, receiver_id: member.id })
                        });
                        if (response.status === 409) {
                          showToast('Connection request already exists.', 'info');
                        } else if (response.ok) {
                          showToast(`Request sent to ${member.name}.`, 'success');
                          addActivity(`Sent connection request to ${member.name}`);
                        } else {
                          showToast('Unable to send request right now.', 'error');
                        }
                        await refreshConnectionState();
                      }}
                    >
                      Connect
                    </button>
                  ) : state === 'pending' ? (
                    <button disabled className="cursor-not-allowed rounded-full border border-slate-300 px-4 py-1.5 text-sm font-semibold text-slate-500">
                      Pending
                    </button>
                  ) : state === 'connected' ? (
                    <button disabled className="cursor-not-allowed rounded-full border border-[#057642] px-4 py-1.5 text-sm font-semibold text-[#057642]">
                      Connected
                    </button>
                  ) : (
                    <Link
                      to="/network/invitations"
                      className="rounded-full border border-slate-300 px-4 py-1.5 text-sm font-semibold text-slate-600 hover:bg-slate-50"
                    >
                      Respond
                    </Link>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

