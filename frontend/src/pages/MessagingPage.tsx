import { useEffect, useMemo, useState } from 'react';
import { MoreHorizontal, SendHorizonal, SquarePen } from 'lucide-react';
import { MEMBER_ID, resolveAvatarUrl } from '../lib/memberProfile';
import Navbar from '../components/layout/Navbar';
import { Link, useLocation } from 'react-router-dom';
import { addActivity } from '../lib/localData';
import { showToast } from '../lib/toast';

type Thread = {
  id: string;
  title: string;
  preview: string;
  participants: string[];
};

type Message = {
  message_id: string;
  sender_id: string;
  message_text: string;
  timestamp: string;
};

type Person = {
  id: string;
  name: string;
  headline?: string;
};

const fallbackPeople: Person[] = [
  { id: 'M-DEMO-01', name: 'Nina Shah', headline: 'Backend Engineer at Orbit' },
  { id: 'M-DEMO-02', name: 'Rahul Verma', headline: 'Product Manager at Flux' }
];

export default function MessagingPage() {
  const location = useLocation();
  const [threads, setThreads] = useState<Thread[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string>('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState('');
  const [memberPhoto, setMemberPhoto] = useState<string>(resolveAvatarUrl(undefined, 'Me'));
  const [search, setSearch] = useState('');
  const [people, setPeople] = useState<Person[]>([]);
  const [personNameMap, setPersonNameMap] = useState<Record<string, string>>({});
  const [personHeadlineMap, setPersonHeadlineMap] = useState<Record<string, string>>({});
  const [composeQuery, setComposeQuery] = useState('');
  const [composeToId, setComposeToId] = useState('');
  const memberId = MEMBER_ID;

  const displayNameFor = (idOrName: string) => personNameMap[idOrName] || idOrName;

  async function loadThreads() {
    setLoading(true);
    const res = await fetch('http://localhost:4000/api/threads/byUser', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: memberId })
    });
    const data = await res.json().catch(() => []);
    const mapped = (Array.isArray(data) ? data : []).map((thread: any) => {
      const peerId = thread.participant_a === memberId ? thread.participant_b : thread.participant_a;
      return {
        id: thread.thread_id,
        title: peerId,
        preview: personHeadlineMap[peerId] || 'Message conversation',
        participants: [thread.participant_a, thread.participant_b]
      };
    });
    const dedupedByPeer: Thread[] = [];
    const seen = new Set<string>();
    for (const thread of mapped) {
      if (seen.has(thread.title)) continue;
      seen.add(thread.title);
      dedupedByPeer.push(thread);
    }
    setThreads(dedupedByPeer);
    if (dedupedByPeer.length && !activeThreadId) {
      setActiveThreadId(dedupedByPeer[0].id);
    }
    setLoading(false);
  }

  useEffect(() => {
    loadThreads().catch(() => setLoading(false));
    fetch('http://localhost:4000/api/members/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ keyword: '' })
    })
      .then((res) => res.json())
      .then((data) => {
        const fromApi: Person[] = (Array.isArray(data) ? data : [])
          .filter((m: any) => m.member_id && m.member_id !== memberId)
          .slice(0, 50)
          .map((m: any) => ({
            id: m.member_id,
            name: m.name || `${m.first_name || ''} ${m.last_name || ''}`.trim() || m.member_id,
            headline: m.headline || m.title || ''
          }));
        const merged = [...fromApi];
        fallbackPeople.forEach((p) => {
          if (!merged.some((x) => x.id === p.id)) merged.push(p);
        });
        setPeople(merged);
        const map: Record<string, string> = {};
        const headlineMap: Record<string, string> = {};
        merged.forEach((p) => {
          map[p.id] = p.name;
          headlineMap[p.id] = p.headline || '';
        });
        setPersonNameMap(map);
        setPersonHeadlineMap(headlineMap);
      })
      .catch(() => {
        setPeople(fallbackPeople);
        setPersonNameMap({
          'M-DEMO-01': 'Nina Shah',
          'M-DEMO-02': 'Rahul Verma'
        });
        setPersonHeadlineMap({
          'M-DEMO-01': 'Backend Engineer at Orbit',
          'M-DEMO-02': 'Product Manager at Flux'
        });
      });
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

  useEffect(() => {
    setThreads((prev) =>
      prev.map((t) => ({
        ...t,
        preview: personHeadlineMap[t.title] || t.preview || 'Message conversation'
      }))
    );
  }, [personHeadlineMap]);

  useEffect(() => {
    if (!activeThreadId) return;
    fetch('http://localhost:4000/api/messages/list', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ thread_id: activeThreadId, limit: 100 })
    })
      .then((res) => res.json())
      .then((data) => setMessages(Array.isArray(data) ? data : []))
      .catch(() => setMessages([]));
  }, [activeThreadId]);

  const activeThread = useMemo(
    () => threads.find((thread) => thread.id === activeThreadId),
    [threads, activeThreadId]
  );
  const isComposeMode = useMemo(() => location.pathname.endsWith('/compose'), [location.pathname]);
  const activeFilter = useMemo(() => {
    if (location.pathname.endsWith('/jobs')) return 'jobs';
    if (location.pathname.endsWith('/unread')) return 'unread';
    if (location.pathname.endsWith('/connections')) return 'connections';
    return 'focused';
  }, [location.pathname]);
  const filteredThreads = useMemo(() => {
    const byFilter = threads.filter((thread) => {
      if (activeFilter === 'jobs') return /recruit|job|hiring/i.test(thread.title);
      if (activeFilter === 'connections') return true;
      if (activeFilter === 'unread') return thread.preview.toLowerCase().includes('open');
      return true;
    });
    const q = search.trim().toLowerCase();
    if (!q) return byFilter;
    return byFilter.filter((thread) => thread.title.toLowerCase().includes(q));
  }, [threads, activeFilter, search]);

  const filteredPeople = useMemo(() => {
    const q = composeQuery.trim().toLowerCase();
    if (!q) return people.slice(0, 6);
    return people
      .filter((p) => p.name.toLowerCase().includes(q) || p.id.toLowerCase().includes(q))
      .slice(0, 8);
  }, [composeQuery, people]);
  const peerAvatar = (idOrName?: string) =>
    `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(idOrName || 'Contact')}`;

  async function startOrOpenConversation(receiverId: string, receiverName?: string) {
    if (!receiverId || receiverId === memberId) {
      showToast('Please select a valid recipient.', 'error');
      return;
    }
    const existing = threads.find((t) => t.participants.includes(receiverId));
    if (existing) {
      setActiveThreadId(existing.id);
      showToast(`Opened conversation with ${displayNameFor(existing.title)}.`, 'info');
      return;
    }
    const openRes = await fetch('http://localhost:4000/api/threads/open', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ participant_a: memberId, participant_b: receiverId })
    });
    const openData = await openRes.json().catch(() => ({}));
    if (!openRes.ok || !openData.thread_id) {
      showToast('Unable to open conversation right now.', 'error');
      return;
    }
    setActiveThreadId(openData.thread_id);
    await loadThreads().catch(() => undefined);
    showToast(`Conversation started with ${receiverName || displayNameFor(receiverId)}.`, 'success');
  }

  return (
    <div className="min-h-screen bg-[#f3f2ef]">
      <Navbar />
      <div className="mx-auto max-w-[1128px] px-3 py-4">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
          <section className="li-card overflow-hidden p-0 lg:col-span-8">
            <div className="grid h-[calc(100vh-8rem)] grid-cols-1 md:grid-cols-12">
              <section className="border-b border-slate-200 md:col-span-5 md:border-b-0 md:border-r">
                <div className="border-b border-slate-200 px-4 py-3">
                  <div className="mb-2 flex items-center justify-between">
                    <h2 className="font-semibold text-slate-900">Messaging</h2>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        title="More actions"
                        className="rounded p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                      >
                        <MoreHorizontal size={16} />
                      </button>
                      <Link
                        to="/messaging/compose"
                        title="Compose message"
                        className="inline-flex items-center gap-1 rounded p-1 text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                      >
                        <SquarePen size={16} />
                        <span className="text-xs font-semibold">Compose</span>
                      </Link>
                    </div>
                  </div>
                  {isComposeMode ? (
                    <div className="mb-2 space-y-1">
                      <input
                        type="text"
                        placeholder="To: search people by name"
                        value={composeQuery}
                        onChange={(e) => {
                          setComposeQuery(e.target.value);
                          if (composeToId) setComposeToId('');
                        }}
                        className="w-full rounded border border-slate-300 px-3 py-1.5 text-sm focus:outline-none"
                      />
                      {filteredPeople.length > 0 ? (
                        <div className="max-h-36 overflow-y-auto rounded-md border border-slate-200 bg-white">
                          {filteredPeople.map((p) => (
                            <button
                              key={p.id}
                              type="button"
                              onClick={() => {
                                setComposeToId(p.id);
                                setComposeQuery(p.name);
                              }}
                              className={`flex w-full items-start gap-2 border-b border-slate-100 px-3 py-2 text-left last:border-b-0 hover:bg-slate-50 ${composeToId === p.id ? 'bg-blue-50' : ''}`}
                            >
                              <div className="h-7 w-7 overflow-hidden rounded-full border border-slate-200">
                                <img src={peerAvatar(p.name)} alt={p.name} className="h-full w-full object-cover" />
                              </div>
                              <div className="min-w-0">
                                <p className="truncate text-xs font-semibold text-slate-900">{p.name}</p>
                                <p className="truncate text-[11px] text-slate-500">{p.headline || p.id}</p>
                              </div>
                            </button>
                          ))}
                        </div>
                      ) : null}
                      <Link to="/messaging" className="inline-block text-[11px] font-semibold text-[#0a66c2] hover:underline">
                        Exit compose mode
                      </Link>
                    </div>
                  ) : null}
                  <input
                    type="text"
                    placeholder="Search messages"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="w-full rounded bg-[#edf3f8] px-3 py-1.5 text-sm focus:outline-none"
                  />
                  <div className="mt-2 flex flex-wrap gap-2 text-xs">
                    {['Focused', 'Jobs', 'Unread', 'Connections'].map((chip) => (
                      <Link
                        key={chip}
                        to={`/messaging/filter/${chip.toLowerCase()}`}
                        className="rounded-full border border-slate-300 px-2.5 py-1 font-semibold text-slate-700 hover:bg-slate-100"
                      >
                        {chip}
                      </Link>
                    ))}
                  </div>
                </div>
                <div className="overflow-y-auto">
                  {loading ? (
                    <p className="px-4 py-3 text-sm text-slate-500">Loading threads...</p>
                  ) : filteredThreads.length === 0 ? (
                    <div className="px-4 py-3 text-sm text-slate-500">
                      <p>No conversations yet. Connect with someone to start messaging.</p>
                      {!isComposeMode && search.trim() ? (
                        <div className="mt-3 rounded-md border border-slate-200 bg-white">
                          <p className="border-b border-slate-100 px-3 py-2 text-xs font-semibold text-slate-600">
                            Start a conversation
                          </p>
                          {people
                            .filter((p) => p.name.toLowerCase().includes(search.trim().toLowerCase()))
                            .slice(0, 5)
                            .map((p) => (
                              <button
                                key={p.id}
                                type="button"
                                onClick={async () => {
                                  await startOrOpenConversation(p.id, p.name);
                                  setSearch('');
                                }}
                                className="flex w-full items-start gap-2 border-b border-slate-100 px-3 py-2 text-left last:border-b-0 hover:bg-slate-50"
                              >
                                <div className="h-7 w-7 overflow-hidden rounded-full border border-slate-200">
                                  <img src={peerAvatar(p.name)} alt={p.name} className="h-full w-full object-cover" />
                                </div>
                                <div className="min-w-0">
                                  <p className="truncate text-xs font-semibold text-slate-900">{p.name}</p>
                                  <p className="truncate text-[11px] text-slate-500">{p.headline || p.id}</p>
                                </div>
                              </button>
                            ))}
                        </div>
                      ) : null}
                    </div>
                  ) : filteredThreads.map((thread) => (
                    <button
                      key={thread.id}
                      className={`w-full border-b px-4 py-3 text-left transition ${
                        activeThreadId === thread.id ? 'bg-blue-50 border-blue-100' : 'border-slate-100 hover:bg-slate-50'
                      }`}
                      onClick={() => setActiveThreadId(thread.id)}
                    >
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 overflow-hidden rounded-full border border-slate-200 bg-slate-200">
                          <img src={peerAvatar(thread.title)} alt={thread.title} className="h-full w-full object-cover" />
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium text-slate-900">{displayNameFor(thread.title)}</p>
                          <p className="truncate text-sm text-slate-600">{thread.preview}</p>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </section>
              <section className="md:col-span-7">
                <div className="border-b border-slate-200 px-4 py-3">
                  <p className="font-semibold text-slate-900">{activeThread ? displayNameFor(activeThread.title) : 'Select a conversation'}</p>
                  {activeThread ? (
                    <p className="text-xs text-slate-500">
                      {personHeadlineMap[activeThread.title] || '1st degree connection'}
                    </p>
                  ) : null}
                </div>
                <div className="h-[calc(100%-3.5rem)] p-4">
                  <div className="h-[calc(100%-3.5rem)] space-y-3 overflow-y-auto rounded-lg bg-slate-50 p-4 text-sm text-slate-600">
                    {messages.length === 0 ? (
                      <p>No messages yet.</p>
                    ) : messages.map((msg) => (
                      <div key={msg.message_id} className={`flex items-end gap-2 ${msg.sender_id === memberId ? 'justify-end' : ''}`}>
                        {msg.sender_id !== memberId && (
                          <div className="h-7 w-7 overflow-hidden rounded-full border border-slate-200 bg-white">
                            <img src={peerAvatar(activeThread?.title || msg.sender_id)} alt="Sender" className="h-full w-full object-cover" />
                          </div>
                        )}
                        <div
                          className={`max-w-[80%] rounded-xl px-3 py-2 ${
                            msg.sender_id === memberId ? 'ml-auto bg-blue-600 text-white' : 'bg-white text-slate-800'
                          }`}
                        >
                          <p>{msg.message_text}</p>
                        </div>
                        {msg.sender_id === memberId && (
                          <div className="h-7 w-7 overflow-hidden rounded-full border border-slate-200 bg-white">
                            <img src={memberPhoto} alt="Me" className="h-full w-full object-cover" />
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                  <form
                    className="mt-3 flex gap-2"
                    onSubmit={async (event) => {
                      event.preventDefault();
                      if (!draft.trim()) return;
                      let threadId = activeThreadId;

                      if (!threadId && isComposeMode) {
                        const receiverId = composeToId.trim();
                        if (!receiverId) {
                          showToast('Select a recipient from the list.', 'error');
                          return;
                        }
                        await startOrOpenConversation(receiverId, composeQuery);
                        threadId = activeThreadId || threadId;
                        if (!threadId) {
                          const latest = await fetch('http://localhost:4000/api/threads/byUser', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ user_id: memberId })
                          }).then((res) => res.json()).catch(() => []);
                          const found = (Array.isArray(latest) ? latest : []).find(
                            (t: any) => t.participant_a === receiverId || t.participant_b === receiverId
                          );
                          if (found?.thread_id) {
                            threadId = found.thread_id;
                            setActiveThreadId(found.thread_id);
                          }
                        }
                      }

                      if (!threadId) {
                        showToast('Select a conversation or use Compose.', 'info');
                        return;
                      }

                      const sendRes = await fetch('http://localhost:4000/api/messages/send', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          thread_id: threadId,
                          sender_id: memberId,
                          text: draft.trim()
                        })
                      });
                      if (!sendRes.ok) {
                        showToast('Message could not be sent right now.', 'error');
                        return;
                      }
                      setDraft('');
                      const refreshed = await fetch('http://localhost:4000/api/messages/list', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ thread_id: threadId, limit: 100 })
                      });
                      const refreshedData = await refreshed.json().catch(() => []);
                      setMessages(Array.isArray(refreshedData) ? refreshedData : []);
                      addActivity(`Sent a message to ${displayNameFor(activeThread?.title || composeToId || 'connection')}`);
                      showToast('Message sent.', 'success');
                    }}
                  >
                    <input
                      value={draft}
                      onChange={(event) => setDraft(event.target.value)}
                      placeholder="Type a message..."
                      className="flex-1 rounded-full border border-slate-300 px-4 py-2 text-sm focus:border-blue-500 focus:outline-none"
                    />
                    <button
                      type="submit"
                      className="inline-flex items-center gap-1 rounded-full bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
                    >
                      <SendHorizonal size={16} />
                      Send
                    </button>
                  </form>
                </div>
              </section>
            </div>
          </section>
          <aside className="space-y-3 lg:col-span-4">
            <section className="li-card p-0 overflow-hidden">
              <div className="h-28 bg-gradient-to-r from-[#f8c44f] to-[#d9920b]" />
              <div className="p-4">
                <p className="text-sm font-semibold text-[#191919]">Level up your profile visibility</p>
                <p className="mt-1 text-xs text-[#666]">Grow your network and get recruiter responses faster.</p>
                <Link to="/profile" className="mt-3 inline-block rounded-full border border-[#0a66c2] px-3 py-1.5 text-sm font-semibold text-[#0a66c2] hover:bg-[#edf3f8]">
                  View profile
                </Link>
              </div>
            </section>
            <section className="li-card p-4 text-xs text-[#666]">
              <p className="font-semibold text-[#191919] mb-2">Quick links</p>
              <div className="flex flex-wrap gap-x-3 gap-y-1">
                <Link to="/help" className="hover:text-[#191919]">Help Center</Link>
                <Link to="/settings" className="hover:text-[#191919]">Privacy</Link>
                <Link to="/saved" className="hover:text-[#191919]">Saved</Link>
                <Link to="/network" className="hover:text-[#191919]">My Network</Link>
              </div>
            </section>
          </aside>
        </div>
      </div>
    </div>
  );
}
