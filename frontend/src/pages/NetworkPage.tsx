import { useEffect, useMemo, useState } from 'react';
import { resolveAvatarUrl, resolveViewerAvatarUrl } from '../lib/memberProfile';
import Navbar from '../components/layout/Navbar';
import { CalendarDays, FileText, MessageCircle, MoreHorizontal, Rss, ThumbsUp, UserRoundPlus, Users, UsersRound } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { addActivity } from '../lib/localData';
import { showToast } from '../lib/toast';

type Suggestion = {
  id: string;
  name: string;
  role: string;
  photo?: string;
};

type CatchUpCategory = 'Job changes' | 'Birthdays' | 'Work anniversaries' | 'Education';

type CatchUpRow = {
  id: string;
  memberId: string;
  name: string;
  photo: string;
  type: CatchUpCategory;
  detail: string;
  countA: number;
  countB: number;
};

const fallbackSuggestions: Suggestion[] = [
  { id: 'M-DEMO-01', name: 'Nina Shah', role: 'Backend Engineer at Orbit' },
  { id: 'M-DEMO-02', name: 'Rahul Verma', role: 'Product Manager at Flux' }
];

const CATCH_UP_TYPE_ROTATION: CatchUpCategory[] = [
  'Job changes',
  'Birthdays',
  'Work anniversaries',
  'Education',
  'Work anniversaries',
  'Job changes'
];

function catchUpDetailFor(m: { headline?: string; title?: string }, type: CatchUpCategory): string {
  const h = String(m.headline || m.title || '').trim();
  switch (type) {
    case 'Job changes':
      return h ? `Role update: ${h}` : 'Recently active in your network';
    case 'Birthdays':
      return 'Birthday coming up — send wishes';
    case 'Work anniversaries':
      return h ? `Career milestone • ${h.split('·')[0]?.trim() || h}` : 'Work anniversary worth celebrating';
    case 'Education':
      return h ? `Education highlight • ${h}` : 'Added learning milestones';
    default:
      return '';
  }
}

function buildCatchUpRowsFromMembers(members: any[], selfId: string): CatchUpRow[] {
  const pool = (Array.isArray(members) ? members : [])
    .filter((m: any) => m?.member_id && m.member_id !== selfId)
    .slice(0, 6);
  return pool.map((m: any, i: number) => {
    const name = m.name || `${m.first_name || ''} ${m.last_name || ''}`.trim() || m.member_id;
    const type = CATCH_UP_TYPE_ROTATION[i % CATCH_UP_TYPE_ROTATION.length];
    return {
      id: `cu-${m.member_id}-${i}`,
      memberId: m.member_id,
      name,
      photo: resolveAvatarUrl(m.profile_photo_url, name),
      type,
      detail: catchUpDetailFor(m, type),
      countA: 8 + ((i * 7) % 18),
      countB: 2 + ((i * 5) % 12)
    };
  });
}

function buildCatchUpRowsFromSuggestions(rows: Suggestion[]): CatchUpRow[] {
  return rows.slice(0, 6).map((s, i) => {
    const type = CATCH_UP_TYPE_ROTATION[i % CATCH_UP_TYPE_ROTATION.length];
    return {
      id: `cu-${s.id}-${i}`,
      memberId: s.id,
      name: s.name,
      photo: s.photo || resolveAvatarUrl(undefined, s.name),
      type,
      detail: catchUpDetailFor({ headline: s.role, title: s.role }, type),
      countA: 6 + ((i * 5) % 14),
      countB: 2 + ((i * 3) % 9)
    };
  });
}

export default function NetworkPage() {
  const MEMBER_ID = sessionStorage.getItem('li_sim_member_id') || 'M-123';
  const location = useLocation();
  const [incoming, setIncoming] = useState<any[]>([]);
  const [sent, setSent] = useState<any[]>([]);
  const [connections, setConnections] = useState<string[]>([]);
  const [memberCardMap, setMemberCardMap] = useState<Record<string, { name: string; headline: string; photo: string }>>({});
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [memberNameMap, setMemberNameMap] = useState<Record<string, string>>({});
  const [mutualCountMap, setMutualCountMap] = useState<Record<string, number>>({});
  const [activeTab, setActiveTab] = useState<'grow' | 'catchup'>('grow');
  const [catchUpFilter, setCatchUpFilter] = useState<
    'All' | 'Job changes' | 'Birthdays' | 'Work anniversaries' | 'Education'
  >('All');
  const [memberPhoto, setMemberPhoto] = useState<string>(resolveViewerAvatarUrl(undefined, 'Me'));
  const [catchUpRows, setCatchUpRows] = useState<CatchUpRow[]>([]);
  const [networkCounts, setNetworkCounts] = useState<Record<string, number>>({});
  const memberId = MEMBER_ID;
  const avatarFor = (seed: string) => `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(seed)}`;
  const displayNameFor = (id: string) => memberNameMap[id] || id;
  const isConnectionsPage = location.pathname === '/network/connections';
  const catchUpPills = ['All', 'Job changes', 'Birthdays', 'Work anniversaries', 'Education'] as const;
  const filteredCatchUp = useMemo(() => {
    if (catchUpFilter === 'All') return catchUpRows;
    return catchUpRows.filter((u) => u.type === catchUpFilter);
  }, [catchUpRows, catchUpFilter]);

  async function refreshAll() {
    const reqRes = await fetch('/api/connections/requestsByUser', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: memberId })
    });
    const reqData = await reqRes.json().catch(() => ({ incoming: [], sent: [] }));
    setIncoming(reqData.incoming || []);
    setSent(reqData.sent || []);

    const listRes = await fetch('/api/connections/list', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: memberId })
    });
    const listData = await listRes.json().catch(() => []);
    setConnections(Array.isArray(listData) ? listData : []);

    const membersRes = await fetch('/api/members/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ keyword: '' })
    });
    const members = await membersRes.json().catch(() => []);
    const nextNameMap: Record<string, string> = {
      'M-DEMO-01': 'Nina Shah',
      'M-DEMO-02': 'Rahul Verma'
    };
    (Array.isArray(members) ? members : []).forEach((m: any) => {
      if (!m?.member_id) return;
      const name = m.name || `${m.first_name || ''} ${m.last_name || ''}`.trim() || m.member_id;
      nextNameMap[m.member_id] = name;
    });
    setMemberNameMap(nextNameMap);
    const nextCards: Record<string, { name: string; headline: string; photo: string }> = {};
    (Array.isArray(members) ? members : []).forEach((m: any) => {
      if (!m?.member_id) return;
      const name = m.name || `${m.first_name || ''} ${m.last_name || ''}`.trim() || m.member_id;
      nextCards[m.member_id] = {
        name,
        headline: m.headline || m.title || 'LinkedIn member',
        photo: resolveAvatarUrl(m.profile_photo_url, name),
      };
    });
    setMemberCardMap(nextCards);
    const connected = new Set(Array.isArray(listData) ? listData : []);
    const sentPending = new Set(
      (reqData.sent || [])
        .filter((r: any) => r.status === 'pending')
        .map((r: any) => r.receiver_id)
    );
    const incomingPending = new Set(
      (reqData.incoming || [])
        .filter((r: any) => r.status === 'pending')
        .map((r: any) => r.requester_id)
    );
    const normalizedSuggestions: Suggestion[] = (Array.isArray(members) ? members : [])
      .filter((m: any) => m.member_id && m.member_id !== memberId)
      .filter((m: any) => !connected.has(m.member_id))
      .filter((m: any) => !sentPending.has(m.member_id))
      .filter((m: any) => !incomingPending.has(m.member_id))
      .slice(0, 8)
      .map((m: any) => ({
        id: m.member_id,
        name: m.name || `${m.first_name || ''} ${m.last_name || ''}`.trim() || m.member_id,
        role: m.headline || m.title || 'LinkedIn member',
        photo: resolveAvatarUrl(m.profile_photo_url, m.name || m.member_id)
      }));
    if (normalizedSuggestions.length > 0) {
      setSuggestions(normalizedSuggestions);
      const entries = await Promise.all(
        normalizedSuggestions.map(async (s) => {
          const mutualRes = await fetch('/api/connections/mutual', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: memberId, other_id: s.id })
          });
          const mutualData = await mutualRes.json().catch(() => ({ mutual: [] }));
          const count = Array.isArray(mutualData?.mutual) ? mutualData.mutual.length : 0;
          return [s.id, count] as const;
        })
      );
      setMutualCountMap(Object.fromEntries(entries));
      {
        let rows = buildCatchUpRowsFromMembers(members, memberId);
        if (!rows.length) rows = buildCatchUpRowsFromSuggestions(normalizedSuggestions);
        setCatchUpRows(rows);
      }
      return;
    }

    // Keep the Connect UI visible even in fresh/local setups with only one seeded member.
    const fallback = fallbackSuggestions
      .filter((s) => !connected.has(s.id))
      .filter((s) => !sentPending.has(s.id))
      .filter((s) => !incomingPending.has(s.id));
    setSuggestions(fallback);
    const entries = await Promise.all(
      fallback.map(async (s) => {
        const mutualRes = await fetch('/api/connections/mutual', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user_id: memberId, other_id: s.id })
        });
        const mutualData = await mutualRes.json().catch(() => ({ mutual: [] }));
        const count = Array.isArray(mutualData?.mutual) ? mutualData.mutual.length : 0;
        return [s.id, count] as const;
      })
    );
    setMutualCountMap(Object.fromEntries(entries));
    {
      let rows = buildCatchUpRowsFromMembers(members, memberId);
      if (!rows.length) rows = buildCatchUpRowsFromSuggestions(fallback);
      setCatchUpRows(rows);
    }
  }

  useEffect(() => {
    refreshAll().catch(() => undefined);
    fetch('/api/members/network/catalog', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ member_id: memberId })
    })
      .then((res) => res.json())
      .then((data) => {
        const counts: Record<string, number> = {};
        (Array.isArray(data) ? data : []).forEach((item: any) => {
          if (item?.is_active && item?.entity_type) counts[item.entity_type] = (counts[item.entity_type] || 0) + 1;
        });
        setNetworkCounts(counts);
      })
      .catch(() => setNetworkCounts({}));
    fetch('/api/members/get', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ member_id: memberId })
    })
      .then((res) => res.json())
      .then((data) => {
        if (!data || data.error) return;
        setMemberPhoto(resolveViewerAvatarUrl(data.profile_photo_url, data.name));
      })
      .catch(() => undefined);
    const timer = window.setInterval(() => {
      refreshAll().catch(() => undefined);
    }, 4000);
    return () => window.clearInterval(timer);
  }, []);

  const buttonStateFor = (suggestionId: string): 'connected' | 'pending' | 'incoming' | 'connect' => {
    if (connections.includes(suggestionId)) return 'connected';
    if (sent.some((r) => r.receiver_id === suggestionId && r.status === 'pending')) return 'pending';
    if (incoming.some((r) => r.requester_id === suggestionId && r.status === 'pending')) return 'incoming';
    return 'connect';
  };

  return (
    <div className="min-h-screen bg-[#f3f2ef]">
      <Navbar />
      <div className="mx-auto max-w-[1128px] px-3 py-4">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
          <aside className="space-y-3 lg:col-span-3">
            <section className="li-card overflow-hidden p-0">
              <div className="border-b border-[#e0dfdc] px-4 py-3">
                <h2 className="text-lg font-semibold text-[#191919]">Manage my network</h2>
              </div>
              <div className="divide-y divide-[#f0efec] text-[15px]">
                <Link to="/network/invitations" className="flex items-center justify-between px-4 py-3 text-[#444] hover:bg-[#f7f7f7]"><span className="flex items-center gap-2"><UserRoundPlus size={16} />Invitations</span><span>{incoming.length}</span></Link>
                <Link to="/network/connections" className="flex items-center justify-between px-4 py-3 text-[#444] hover:bg-[#f7f7f7]"><span className="flex items-center gap-2"><Users size={16} />Connections</span><span>{connections.length}</span></Link>
                <Link to="/network/following" className="flex items-center justify-between px-4 py-3 text-[#444] hover:bg-[#f7f7f7]"><span className="flex items-center gap-2"><UsersRound size={16} />Following & followers</span><span>{networkCounts.following || 0}</span></Link>
                <Link to="/network/groups" className="flex items-center justify-between px-4 py-3 text-[#444] hover:bg-[#f7f7f7]"><span className="flex items-center gap-2"><Users size={16} />Groups</span><span>{networkCounts.groups || 0}</span></Link>
                <Link to="/network/events" className="flex items-center justify-between px-4 py-3 text-[#444] hover:bg-[#f7f7f7]"><span className="flex items-center gap-2"><CalendarDays size={16} />Events</span><span>{networkCounts.events || 0}</span></Link>
                <Link to="/network/pages" className="flex items-center justify-between px-4 py-3 text-[#444] hover:bg-[#f7f7f7]"><span className="flex items-center gap-2"><FileText size={16} />Pages</span><span>{networkCounts.pages || 0}</span></Link>
                <Link to="/network/newsletters" className="flex items-center justify-between px-4 py-3 text-[#444] hover:bg-[#f7f7f7]"><span className="flex items-center gap-2"><Rss size={16} />Newsletters</span><span>{networkCounts.newsletters || 0}</span></Link>
              </div>
            </section>
            <section className="li-card p-4">
              <div className="flex items-center gap-3">
              <Link
                to={`/profile/${encodeURIComponent(memberId)}`}
                className="h-12 w-12 overflow-hidden rounded-full border border-slate-200"
              >
                <img src={memberPhoto} alt="Me" className="h-full w-full object-cover" />
              </Link>
                <div>
                  <p className="text-sm font-semibold text-[#191919]">Grow your network faster</p>
                  <p className="text-xs text-[#666]">Connect with peers from your profile and skills.</p>
                </div>
              </div>
            </section>
            <section className="li-card p-4">
              <p className="text-xs font-semibold text-[#191919]">Sneha, network smarter with Premium</p>
              <p className="mt-1 text-xs text-[#666]">See who viewed your profile and grow faster.</p>
              <Link
                to="/premium"
                className="mt-3 inline-flex rounded-full border border-[#915907] px-3 py-1 text-xs font-semibold text-[#915907] hover:bg-[#fbf4e8]"
              >
                Try Premium for free
              </Link>
            </section>
            <section className="px-2 pb-2 text-center text-[11px] text-[#666]">
              <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1">
                <Link to="/help" className="hover:underline">About</Link>
                <Link to="/help" className="hover:underline">Accessibility</Link>
                <Link to="/help" className="hover:underline">Help Center</Link>
                <Link to="/settings" className="hover:underline">Privacy & Terms</Link>
                <Link to="/business" className="hover:underline">Ad Choices</Link>
                <Link to="/settings" className="hover:underline">Advertising</Link>
                <Link to="/business" className="hover:underline">Business Services</Link>
              </div>
              <p className="mt-2 text-[10px] text-[#777]">LinkedIn Corporation © 2026</p>
            </section>
          </aside>
          <main className="space-y-3 lg:col-span-9">
            {isConnectionsPage ? (
              <section className="li-card overflow-hidden p-0">
                <div className="flex items-center justify-between border-b border-[#e0dfdc] px-5 py-3">
                  <h3 className="font-semibold text-[#191919]">Connections ({connections.length})</h3>
                  <Link to="/network/search" className="text-sm font-semibold text-[#0a66c2] hover:underline">
                    Find more people
                  </Link>
                </div>
                {connections.length === 0 ? (
                  <p className="px-5 py-4 text-sm text-slate-500">No connections yet.</p>
                ) : (
                  <div className="divide-y divide-[#f0efec]">
                    {connections.map((cid) => {
                      const card = memberCardMap[cid];
                      return (
                        <div key={cid} className="flex items-center justify-between gap-3 px-5 py-3">
                          <Link
                            to={`/profile/${encodeURIComponent(cid)}`}
                            className="flex min-w-0 items-center gap-3"
                          >
                            <div className="h-12 w-12 shrink-0 overflow-hidden rounded-full border border-slate-200 bg-slate-100">
                              <img src={card?.photo || avatarFor(cid)} alt="" className="h-full w-full object-cover" />
                            </div>
                            <div className="min-w-0">
                              <p className="truncate text-[15px] font-semibold text-[#191919] hover:text-[#0a66c2] hover:underline">
                                {card?.name || displayNameFor(cid)}
                              </p>
                              <p className="truncate text-xs text-[#666]">{card?.headline || 'LinkedIn member'}</p>
                            </div>
                          </Link>
                          <Link
                            to="/messaging"
                            className="rounded-full border border-[#0a66c2] px-4 py-1.5 text-sm font-semibold text-[#0a66c2] hover:bg-[#edf3f8]"
                          >
                            Message
                          </Link>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            ) : null}
            {!isConnectionsPage ? (
            <section className="li-card overflow-hidden p-0">
              <div className="flex border-b border-[#e0dfdc] bg-white px-0">
                <button
                  type="button"
                  onClick={() => setActiveTab('grow')}
                  className={`min-w-[120px] px-5 py-3 text-sm font-semibold transition-colors ${
                    activeTab === 'grow'
                      ? 'border-b-[3px] border-[#01754F] bg-[#f3f2ef] text-[#01754F]'
                      : 'border-b-[3px] border-transparent text-[#666666] hover:bg-[#fafafa]'
                  }`}
                >
                  Grow
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('catchup')}
                  className={`min-w-[120px] px-5 py-3 text-sm font-semibold transition-colors ${
                    activeTab === 'catchup'
                      ? 'border-b-[3px] border-[#01754F] bg-[#f3f2ef] text-[#01754F]'
                      : 'border-b-[3px] border-transparent text-[#666666] hover:bg-[#fafafa]'
                  }`}
                >
                  Catch up
                </button>
              </div>
              {activeTab === 'grow' ? (
                <div className="border-b border-[#e0dfdc] px-5 py-3">
                  <p className="text-sm text-[#666666]">Discover invitations and people you may know based on your activity.</p>
                </div>
              ) : (
                <>
                  <div className="flex flex-wrap gap-2 border-b border-[#e0dfdc] bg-white px-5 py-3">
                    {catchUpPills.map((pill) => {
                      const selected = catchUpFilter === pill;
                      return (
                        <button
                          key={pill}
                          type="button"
                          onClick={() => setCatchUpFilter(pill)}
                          className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                            selected
                              ? 'border-[#01754F] bg-[#01754F] text-white shadow-sm'
                              : 'border-[#e0e0e0] bg-white text-[#191919] hover:bg-[#f9fafb]'
                          }`}
                        >
                          {pill}
                        </button>
                      );
                    })}
                  </div>
                  <div className="divide-y divide-[#e0dfdc] bg-white">
                    {filteredCatchUp.length === 0 ? (
                      <p className="px-5 py-6 text-sm text-[#666666]">No updates match this filter.</p>
                    ) : (
                    filteredCatchUp.map((item) => (
                      <div key={item.id} className="relative flex items-start gap-3 px-5 py-4">
                        <button
                          type="button"
                          className="absolute right-3 top-3 rounded p-1 text-[#666666] hover:bg-[#f3f2ef]"
                          aria-label="More options"
                          onClick={() => showToast('More options coming soon.', 'info')}
                        >
                          <MoreHorizontal size={18} />
                        </button>
                        <Link
                          to={`/profile/${encodeURIComponent(item.memberId)}`}
                          className="h-12 w-12 shrink-0 overflow-hidden rounded-full border border-[#e0dfdc] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0a66c2]"
                        >
                          <img src={item.photo} alt="" className="h-full w-full object-cover" />
                        </Link>
                        <div className="min-w-0 flex-1 pr-10">
                          <Link
                            to={`/profile/${encodeURIComponent(item.memberId)}`}
                            className="text-sm font-semibold text-[#191919] hover:text-[#0a66c2] hover:underline"
                          >
                            {item.name}
                          </Link>
                          <p className="mt-0.5 text-sm text-[#666666]">{item.detail}</p>
                          <button
                            type="button"
                            className="mt-3 w-full max-w-md rounded-full border border-[#666666] bg-white px-4 py-2 text-left text-sm font-semibold text-[#191919] hover:bg-[#f3f2ef]"
                            onClick={() => showToast('Message sent (demo).', 'success')}
                          >
                            Congratulate
                          </button>
                          <div className="mt-2 flex items-center gap-4 text-xs text-[#666666]">
                            <span className="inline-flex items-center gap-1">
                              <ThumbsUp size={14} className="text-[#666666]" />
                              {item.countA}
                            </span>
                            <span className="inline-flex items-center gap-1">
                              <MessageCircle size={14} className="text-[#666666]" />
                              {item.countB}
                            </span>
                          </div>
                        </div>
                      </div>
                    ))
                    )}
                  </div>
                </>
              )}
            </section>
            ) : null}
            {activeTab === 'grow' ? (
              !isConnectionsPage ? (
              <>
            <section className="li-card overflow-hidden p-0">
              <div className="flex items-center justify-between border-b border-[#e0dfdc] px-5 py-3">
                <h3 className="font-semibold text-[#191919]">Invitations ({incoming.length})</h3>
                <Link to="/network/invitations" className="text-sm font-semibold text-[#444] hover:text-[#191919]">Show all</Link>
              </div>
              {incoming.length === 0 ? (
                <p className="px-5 py-4 text-sm text-slate-500">No incoming requests.</p>
              ) : (
                incoming.map((request) => (
                  <div key={request.request_id} className="flex items-center justify-between border-b border-[#f0efec] px-5 py-3 last:border-b-0">
                    <div className="flex items-center gap-3">
                      <Link
                        to={`/profile/${encodeURIComponent(request.requester_id)}`}
                        className="h-[52px] w-[52px] shrink-0 overflow-hidden rounded-full border border-slate-200 bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0a66c2]"
                      >
                        <img src={avatarFor(request.requester_id)} alt="" className="h-full w-full object-cover" />
                      </Link>
                      <div>
                        <Link to={`/profile/${encodeURIComponent(request.requester_id)}`} className="text-[15px] font-semibold text-[#191919] hover:text-[#0a66c2] hover:underline">
                          {displayNameFor(request.requester_id)}
                        </Link>
                        <p className="text-xs text-[#666]">Wants to connect with you</p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        className="rounded-full px-4 py-1.5 text-sm font-semibold text-[#444] hover:bg-slate-100"
                        onClick={async () => {
                          await fetch('/api/connections/reject', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ request_id: request.request_id })
                          });
                          addActivity(`Ignored connection request from ${request.requester_id}`);
                          await refreshAll();
                        }}
                      >
                        Ignore
                      </button>
                      <button
                        className="rounded-full border border-[1.5px] border-[#0a66c2] px-4 py-1.5 text-sm font-semibold text-[#0a66c2] hover:bg-[#edf3f8]"
                        onClick={async () => {
                          await fetch('/api/connections/accept', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ request_id: request.request_id })
                          });
                          addActivity(`Accepted connection request from ${request.requester_id}`);
                          await refreshAll();
                        }}
                      >
                        Accept
                      </button>
                    </div>
                  </div>
                ))
              )}
            </section>

            <section className="li-card overflow-hidden p-0">
              <div className="flex items-center justify-between border-b border-[#e0dfdc] px-5 py-3">
                <h3 className="font-semibold text-[#191919]">People you may know</h3>
                <div className="flex items-center gap-4">
                  <Link to="/network/search" className="text-sm font-semibold text-[#0a66c2] hover:underline">Search people</Link>
                  <Link to="/network/suggestions" className="text-sm font-semibold text-[#444] hover:text-[#191919]">Show all</Link>
                </div>
              </div>
              <div className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-4">
                {suggestions.map((suggestion) => {
                  const state = buttonStateFor(suggestion.id);
                  return (
                  <div key={suggestion.id} className="overflow-hidden rounded-lg border border-[#e0dfdc]">
                    <div className="h-14 bg-gradient-to-r from-[#c7d2fe] to-[#bfdbfe]" />
                    <div className="px-3 pb-3">
                      <Link
                        to={`/profile/${encodeURIComponent(suggestion.id)}`}
                        className="-mt-6 block h-14 w-14 overflow-hidden rounded-full border-2 border-white bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0a66c2]"
                      >
                        <img src={suggestion.photo || avatarFor(suggestion.name)} alt="" className="h-full w-full object-cover" />
                      </Link>
                      <Link to={`/profile/${encodeURIComponent(suggestion.id)}`} className="mt-2 block text-sm font-semibold text-[#191919] hover:text-[#0a66c2] hover:underline">
                        {suggestion.name}
                      </Link>
                      <p className="line-clamp-2 min-h-[32px] text-xs text-[#666]">{suggestion.role}</p>
                      <p className="mt-1 text-xs text-[#666]">
                        {(mutualCountMap[suggestion.id] || 0) > 0
                          ? `${mutualCountMap[suggestion.id]} mutual connection${mutualCountMap[suggestion.id] === 1 ? '' : 's'}`
                          : 'No mutual connections yet'}
                      </p>
                      {state === 'connect' ? (
                        <button
                          className="mt-3 w-full rounded-full border border-[#0a66c2] px-3 py-1.5 text-sm font-semibold text-[#0a66c2] hover:bg-[#edf3f8]"
                          onClick={async () => {
                            const response = await fetch('/api/connections/request', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ requester_id: memberId, receiver_id: suggestion.id })
                            });
                            if (response.status === 409) {
                              showToast('Connection request already exists.', 'info');
                            } else if (response.ok) {
                              addActivity(`Sent connection request to ${suggestion.name}`);
                              showToast(`Request sent to ${suggestion.name}.`, 'success');
                            } else {
                              showToast('Unable to send request right now.', 'error');
                            }
                            await refreshAll();
                          }}
                        >
                          Connect
                        </button>
                      ) : state === 'pending' ? (
                        <button
                          disabled
                          className="mt-3 w-full cursor-not-allowed rounded-full border border-slate-300 px-3 py-1.5 text-sm font-semibold text-slate-500"
                        >
                          Pending
                        </button>
                      ) : state === 'connected' ? (
                        <button
                          disabled
                          className="mt-3 w-full cursor-not-allowed rounded-full border border-[#057642] px-3 py-1.5 text-sm font-semibold text-[#057642]"
                        >
                          Connected
                        </button>
                      ) : (
                        <button
                          disabled
                          className="mt-3 w-full cursor-not-allowed rounded-full border border-slate-300 px-3 py-1.5 text-sm font-semibold text-slate-500"
                        >
                          Respond
                        </button>
                      )}
                    </div>
                  </div>
                )})}
              </div>
            </section>

            <section className="li-card p-5">
              <h3 className="font-semibold text-[#191919]">Sent requests</h3>
              <div className="mt-3 space-y-2">
                {sent.length === 0 ? (
                  <p className="text-sm text-slate-500">No sent requests.</p>
                ) : (
                  sent.map((request) => (
                    <div key={request.request_id} className="flex items-center gap-2 rounded-lg border border-slate-200 p-2 text-sm text-slate-700">
                      <Link
                        to={`/profile/${encodeURIComponent(request.receiver_id)}`}
                        className="h-8 w-8 shrink-0 overflow-hidden rounded-full border border-slate-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0a66c2]"
                      >
                        <img src={avatarFor(request.receiver_id)} alt="" className="h-full w-full object-cover" />
                      </Link>
                      <span>
                        <Link to={`/profile/${encodeURIComponent(request.receiver_id)}`} className="font-semibold text-[#0a66c2] hover:underline">
                          {displayNameFor(request.receiver_id)}
                        </Link>{' '}
                        - {request.status}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </section>
              </>
              ) : null
            ) : (
              !isConnectionsPage ? (
              <>
                <section className="li-card overflow-hidden p-0">
                  <div className="flex items-center justify-between border-b border-[#e0dfdc] px-5 py-3">
                    <h3 className="font-semibold text-[#191919]">Pending invitations</h3>
                    <Link to="/network/invitations" className="text-sm font-semibold text-[#444] hover:text-[#191919]">Show all</Link>
                  </div>
                  {incoming.length === 0 ? (
                    <p className="px-5 py-4 text-sm text-slate-500">No pending invitations right now.</p>
                  ) : (
                    incoming.slice(0, 3).map((request) => (
                      <div key={request.request_id} className="flex items-center justify-between border-b border-[#f0efec] px-5 py-3 last:border-b-0">
                        <div className="flex items-center gap-3">
                          <div className="h-[46px] w-[46px] overflow-hidden rounded-full border border-slate-200 bg-slate-100">
                            <img src={avatarFor(request.requester_id)} alt={request.requester_id} className="h-full w-full object-cover" />
                          </div>
                          <div>
                            <Link to={`/profile/${encodeURIComponent(request.requester_id)}`} className="text-sm font-semibold text-[#191919] hover:text-[#0a66c2] hover:underline">
                              {displayNameFor(request.requester_id)}
                            </Link>
                            <p className="text-xs text-[#666]">Wants to connect</p>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <button
                            className="rounded-full px-3 py-1 text-xs font-semibold text-[#444] hover:bg-slate-100"
                            onClick={async () => {
                              await fetch('/api/connections/reject', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ request_id: request.request_id })
                              });
                              await refreshAll();
                            }}
                          >
                            Ignore
                          </button>
                          <button
                            className="rounded-full border border-[#0a66c2] px-3 py-1 text-xs font-semibold text-[#0a66c2] hover:bg-[#edf3f8]"
                            onClick={async () => {
                              await fetch('/api/connections/accept', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ request_id: request.request_id })
                              });
                              await refreshAll();
                            }}
                          >
                            Accept
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </section>
              </>
              ) : null
            )}
          </main>
        </div>
      </div>
    </div>
  );
}
