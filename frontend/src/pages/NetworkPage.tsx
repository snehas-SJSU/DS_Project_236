import { useEffect, useState } from 'react';
import { MEMBER_ID, resolveAvatarUrl } from '../lib/memberProfile';
import Navbar from '../components/layout/Navbar';
import { CalendarDays, FileText, Rss, Users, UsersRound } from 'lucide-react';
import { Link } from 'react-router-dom';
import { addActivity } from '../lib/localData';
import { showToast } from '../lib/toast';

type Suggestion = {
  id: string;
  name: string;
  role: string;
  photo?: string;
};

const fallbackSuggestions: Suggestion[] = [
  { id: 'M-DEMO-01', name: 'Nina Shah', role: 'Backend Engineer at Orbit' },
  { id: 'M-DEMO-02', name: 'Rahul Verma', role: 'Product Manager at Flux' }
];

export default function NetworkPage() {
  const [incoming, setIncoming] = useState<any[]>([]);
  const [sent, setSent] = useState<any[]>([]);
  const [connections, setConnections] = useState<string[]>([]);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [activeTab, setActiveTab] = useState<'grow' | 'catchup'>('grow');
  const [memberPhoto, setMemberPhoto] = useState<string>(resolveAvatarUrl(undefined, 'Me'));
  const memberId = MEMBER_ID;
  const avatarFor = (seed: string) => `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(seed)}`;

  async function refreshAll() {
    const reqRes = await fetch('http://localhost:4000/api/connections/requestsByUser', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: memberId })
    });
    const reqData = await reqRes.json().catch(() => ({ incoming: [], sent: [] }));
    setIncoming(reqData.incoming || []);
    setSent(reqData.sent || []);

    const listRes = await fetch('http://localhost:4000/api/connections/list', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: memberId })
    });
    const listData = await listRes.json().catch(() => []);
    setConnections(Array.isArray(listData) ? listData : []);

    const membersRes = await fetch('http://localhost:4000/api/members/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ keyword: '' })
    });
    const members = await membersRes.json().catch(() => []);
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
      return;
    }

    // Keep the Connect UI visible even in fresh/local setups with only one seeded member.
    const fallback = fallbackSuggestions
      .filter((s) => !connected.has(s.id))
      .filter((s) => !sentPending.has(s.id))
      .filter((s) => !incomingPending.has(s.id));
    setSuggestions(fallback);
  }

  useEffect(() => {
    refreshAll().catch(() => undefined);
    fetch('http://localhost:4000/api/members/get', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ member_id: memberId })
    })
      .then((res) => res.json())
      .then((data) => {
        if (!data || data.error) return;
        setMemberPhoto(resolveAvatarUrl(data.profile_photo_url, data.name));
      })
      .catch(() => undefined);
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
                <Link to="/network/connections" className="flex items-center justify-between px-4 py-3 text-[#444] hover:bg-[#f7f7f7]"><span className="flex items-center gap-2"><Users size={16} />Connections</span><span>{connections.length}</span></Link>
                <Link to="/network/following" className="flex items-center justify-between px-4 py-3 text-[#444] hover:bg-[#f7f7f7]"><span className="flex items-center gap-2"><UsersRound size={16} />Following & followers</span><span>0</span></Link>
                <Link to="/network/groups" className="flex items-center justify-between px-4 py-3 text-[#444] hover:bg-[#f7f7f7]"><span className="flex items-center gap-2"><Users size={16} />Groups</span><span>0</span></Link>
                <Link to="/network/events" className="flex items-center justify-between px-4 py-3 text-[#444] hover:bg-[#f7f7f7]"><span className="flex items-center gap-2"><CalendarDays size={16} />Events</span><span>0</span></Link>
                <Link to="/network/pages" className="flex items-center justify-between px-4 py-3 text-[#444] hover:bg-[#f7f7f7]"><span className="flex items-center gap-2"><FileText size={16} />Pages</span><span>0</span></Link>
                <Link to="/network/newsletters" className="flex items-center justify-between px-4 py-3 text-[#444] hover:bg-[#f7f7f7]"><span className="flex items-center gap-2"><Rss size={16} />Newsletters</span><span>0</span></Link>
              </div>
            </section>
            <section className="li-card p-4">
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 overflow-hidden rounded-full border border-slate-200">
                  <img src={memberPhoto} alt="Me" className="h-full w-full object-cover" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-[#191919]">Grow your network faster</p>
                  <p className="text-xs text-[#666]">Connect with peers from your profile and skills.</p>
                </div>
              </div>
            </section>
          </aside>
          <main className="space-y-3 lg:col-span-9">
            <section className="li-card p-0">
              <div className="flex gap-6 border-b border-[#e0dfdc] px-5">
                <button
                  type="button"
                  onClick={() => setActiveTab('grow')}
                  className={`py-3 text-sm font-semibold ${activeTab === 'grow' ? 'border-b-2 border-[#057642] text-[#057642]' : 'text-[#666]'}`}
                >
                  Grow
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('catchup')}
                  className={`py-3 text-sm font-semibold ${activeTab === 'catchup' ? 'border-b-2 border-[#057642] text-[#057642]' : 'text-[#666]'}`}
                >
                  Catch up
                </button>
              </div>
              <div className="px-5 py-3">
                {activeTab === 'grow' ? (
                  <p className="text-sm text-[#666]">Discover invitations and people you may know based on your activity.</p>
                ) : (
                  <p className="text-sm text-[#666]">See updates from your connections and groups.</p>
                )}
              </div>
            </section>

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
                      <div className="h-[52px] w-[52px] overflow-hidden rounded-full border border-slate-200 bg-slate-100">
                        <img src={avatarFor(request.requester_id)} alt={request.requester_id} className="h-full w-full object-cover" />
                      </div>
                      <div>
                        <p className="text-[15px] font-semibold text-[#191919]">{request.requester_id}</p>
                        <p className="text-xs text-[#666]">Wants to connect with you</p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        className="rounded-full px-4 py-1.5 text-sm font-semibold text-[#444] hover:bg-slate-100"
                        onClick={async () => {
                          await fetch('http://localhost:4000/api/connections/reject', {
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
                          await fetch('http://localhost:4000/api/connections/accept', {
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
                <Link to="/network/suggestions" className="text-sm font-semibold text-[#444] hover:text-[#191919]">Show all</Link>
              </div>
              <div className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-4">
                {suggestions.map((suggestion) => {
                  const state = buttonStateFor(suggestion.id);
                  return (
                  <div key={suggestion.id} className="overflow-hidden rounded-lg border border-[#e0dfdc]">
                    <div className="h-14 bg-gradient-to-r from-[#c7d2fe] to-[#bfdbfe]" />
                    <div className="px-3 pb-3">
                      <div className="-mt-6 h-14 w-14 overflow-hidden rounded-full border-2 border-white bg-slate-100">
                        <img src={suggestion.photo || avatarFor(suggestion.name)} alt={suggestion.name} className="h-full w-full object-cover" />
                      </div>
                      <p className="mt-2 text-sm font-semibold text-[#191919]">{suggestion.name}</p>
                      <p className="line-clamp-2 min-h-[32px] text-xs text-[#666]">{suggestion.role}</p>
                      {state === 'connect' ? (
                        <button
                          className="mt-3 w-full rounded-full border border-[#0a66c2] px-3 py-1.5 text-sm font-semibold text-[#0a66c2] hover:bg-[#edf3f8]"
                          onClick={async () => {
                            const response = await fetch('http://localhost:4000/api/connections/request', {
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
                      <div className="h-8 w-8 overflow-hidden rounded-full border border-slate-200">
                        <img src={memberPhoto} alt="Me" className="h-full w-full object-cover" />
                      </div>
                      <span>{request.receiver_id} - {request.status}</span>
                    </div>
                  ))
                )}
              </div>
            </section>
          </main>
        </div>
      </div>
    </div>
  );
}
