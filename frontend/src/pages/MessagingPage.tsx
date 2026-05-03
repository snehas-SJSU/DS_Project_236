import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ChevronDown, Crown, MoreHorizontal, Search, SendHorizonal, SquarePen, Star } from 'lucide-react';
import { resolveAvatarUrl, resolveViewerAvatarUrl } from '../lib/memberProfile';
import Navbar from '../components/layout/Navbar';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { addActivity } from '../lib/localData';
import { showToast } from '../lib/toast';

type Thread = {
  id: string;
  title: string;
  preview: string;
  participants: string[];
  /** ISO timestamp from API `last_activity` */
  lastActivity?: string;
};

/** LinkedIn-style time in list: time today, else "Mar 5" / full date. */
function formatThreadListTime(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) {
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  }
  if (d.getFullYear() === now.getFullYear()) {
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

type Message = {
  message_id: string;
  sender_id: string;
  message_text: string;
  timestamp: string;
};

type SharedPostQuoted = {
  post_id: string;
  member_id: string;
  author_name?: string | null;
  author_headline?: string | null;
  body: string;
  image_data?: string | null;
  author_profile_photo_url?: string | null;
};

type SharedPostCard = {
  post_id: string;
  author_name?: string | null;
  author_headline?: string | null;
  body: string;
  image_data?: string | null;
  quoted?: SharedPostQuoted | null;
};

/** New shares append `[[post_share:P-…]]`; older messages match `/feed#P-…` in the share text. */
function extractPostShareId(raw: string): string | null {
  const tag = raw.match(/\[\[post_share:(P-[a-zA-Z0-9-]+)\]\]/i);
  if (tag) return tag[1];
  const looksLikeShare = /shared a post from/i.test(raw) || /\/feed#P-/i.test(raw);
  if (!looksLikeShare) return null;
  const hash = raw.match(/#(P-[a-zA-Z0-9-]+)/i);
  return hash ? hash[1] : null;
}

function stripPostShareMarker(raw: string): string {
  return raw.replace(/\n\[\[post_share:P-[a-zA-Z0-9-]+\]\]\s*$/i, '').trim();
}

/** Turn raw http(s) URLs in plain text into clickable links (same-origin → React Router). */
function linkifyMessageText(text: string, tone: 'sent' | 'received'): ReactNode {
  const linkClass =
    tone === 'sent'
      ? 'break-all font-medium text-white underline decoration-white/90 underline-offset-2 hover:decoration-white'
      : 'break-all font-medium text-[#0a66c2] underline underline-offset-2 hover:text-[#004182]';

  const re = /(https?:\/\/[^\s<]+[^\s<.,:;"')\]]*)/gi;
  const nodes: ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  let n = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    let url = m[0].replace(/[),.;]+$/g, '');
    const key = `u-${n++}-${m.index}`;
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    try {
      const u = new URL(url);
      if (origin && u.origin === origin) {
        const to = `${u.pathname}${u.search}${u.hash}`;
        nodes.push(
          <Link key={key} to={to} className={linkClass}>
            {url}
          </Link>
        );
      } else {
        nodes.push(
          <a key={key} href={url} target="_blank" rel="noopener noreferrer" className={linkClass}>
            {url}
          </a>
        );
      }
    } catch {
      nodes.push(
        <a key={key} href={url} target="_blank" rel="noopener noreferrer" className={linkClass}>
          {url}
        </a>
      );
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  if (nodes.length === 0) return text;
  return (
    <Fragment>
           {nodes.map((node, i) => (typeof node === 'string' ? <span key={`t-${i}`}>{node}</span> : node))}
    </Fragment>
  );
}

type Person = {
  id: string;
  name: string;
  headline?: string;
};

const fallbackPeople: Person[] = [
  { id: 'M-DEMO-01', name: 'Alex Chen', headline: 'Senior Engineer at Acme' },
  { id: 'M-DEMO-02', name: 'Priya Kapoor', headline: 'Recruiter at Nova Labs' }
];

const MESSAGE_FILTER_CHIPS: { label: string; slug: string }[] = [
  { label: 'Focused', slug: 'focused' },
  { label: 'Jobs', slug: 'jobs' },
  { label: 'Unread', slug: 'unread' },
  { label: 'Connections', slug: 'connections' },
  { label: 'InMail', slug: 'inmail' },
  { label: 'Starred', slug: 'starred' }
];

function MessagingFooterLinks() {
  return (
    <div className="text-center text-[11px] leading-snug text-[#666666]">
      <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5">
        <Link to="/help" className="hover:text-[#0a66c2] hover:underline">
          About
        </Link>
        <Link to="/help" className="hover:text-[#0a66c2] hover:underline">
          Accessibility
        </Link>
        <Link to="/help" className="hover:text-[#0a66c2] hover:underline">
          Help Center
        </Link>
      </div>
      <div className="mt-1.5 flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5">
        <button
          type="button"
          className="inline-flex items-center gap-0.5 hover:text-[#0a66c2] hover:underline"
          onClick={() => showToast('Privacy & Terms (demo).', 'info')}
        >
          Privacy & Terms <ChevronDown size={12} className="opacity-70" />
        </button>
        <Link to="/business" className="hover:text-[#0a66c2] hover:underline">
          Ad Choices
        </Link>
      </div>
      <div className="mt-1.5 flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5">
        <Link to="/settings" className="hover:text-[#0a66c2] hover:underline">
          Advertising
        </Link>
        <button
          type="button"
          className="inline-flex items-center gap-0.5 hover:text-[#0a66c2] hover:underline"
          onClick={() => showToast('Business Services (demo).', 'info')}
        >
          Business Services <ChevronDown size={12} className="opacity-70" />
        </button>
      </div>
      <div className="mt-1.5 flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5">
        <Link to="/language" className="hover:text-[#0a66c2] hover:underline">
          Get the LinkedIn app
        </Link>
        <button type="button" className="hover:text-[#0a66c2] hover:underline" onClick={() => showToast('More options coming soon.', 'info')}>
          More
        </button>
      </div>
      <div className="mt-3 flex items-center justify-center gap-1.5 text-[10px] text-[#777777]">
        <span className="inline-flex h-4 w-4 items-center justify-center rounded-[2px] bg-[#0a66c2] text-[9px] font-bold leading-none text-white">in</span>
        <span>LinkedIn Corporation © 2026</span>
      </div>
    </div>
  );
}

function MessagingRightRail({  memberName, memberPhoto }: { memberName: string; memberPhoto: string }) {
  const MEMBER_ID = sessionStorage.getItem('li_sim_member_id') || 'M-123';
  const firstName = memberName.trim().split(/\s+/)[0] || 'You';
  return (
    <>
      <section className="li-card relative overflow-hidden p-0">
        <div className="absolute right-2 top-2 z-10 flex items-center gap-1 text-[11px] text-[#666]">
          <span className="rounded bg-[#f3f2ef] px-1.5 py-0.5 font-semibold">Ad</span>
          <button type="button" className="rounded p-1 hover:bg-black/5" aria-label="Ad options" onClick={() => showToast('Ad options coming soon.', 'info')}>
            <MoreHorizontal size={16} />
          </button>
        </div>
        <div className="bg-gradient-to-b from-[#f3f2ef] to-white px-4 pb-5 pt-10 text-center">
          <p className="text-sm font-semibold leading-snug text-[#191919]">Premium subscribers are 2.7x more likely to get hired</p>
          <Link to={`/profile/${encodeURIComponent(MEMBER_ID)}`} className="relative mx-auto mt-4 block h-[72px] w-[72px]">
            <img src={memberPhoto} alt="" className="h-full w-full rounded-full border-2 border-white object-cover shadow-md" />
            <span className="absolute -bottom-0.5 left-1/2 flex -translate-x-1/2 items-center gap-0.5 rounded-full bg-[#c9a227] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white shadow">
              <Crown size={12} className="shrink-0" /> Premium
            </span>
          </Link>
          <p className="mt-4 text-sm leading-tight text-[#191919]">
            <span className="font-semibold">{firstName}</span>, boost your job search with Premium
          </p>
          <Link
            to="/premium"
            className="mt-4 inline-flex rounded-full border-2 border-[#0a66c2] px-5 py-2 text-sm font-semibold text-[#0a66c2] hover:bg-[#edf3f8]"
          >
            Try for free
          </Link>
        </div>
      </section>
      <section className="px-1 pt-1">
        <MessagingFooterLinks />
      </section>
    </>
  );
}

export default function MessagingPage() {
  const MEMBER_ID = sessionStorage.getItem('li_sim_member_id') || 'M-123';
  const location = useLocation();
  const navigate = useNavigate();
  const [threads, setThreads] = useState<Thread[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string>('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState('');
  const [memberPhoto, setMemberPhoto] = useState<string>(resolveViewerAvatarUrl(undefined, 'Me'));
  const [memberName, setMemberName] = useState('');
  const [search, setSearch] = useState('');
  const [people, setPeople] = useState<Person[]>([]);
  const [personNameMap, setPersonNameMap] = useState<Record<string, string>>({});
  const [personHeadlineMap, setPersonHeadlineMap] = useState<Record<string, string>>({});
  const [composeQuery, setComposeQuery] = useState('');
  const [composeToId, setComposeToId] = useState('');
  const [sending, setSending] = useState(false);
  const [failedSend, setFailedSend] = useState<{ threadId: string; text: string } | null>(null);
  const [threadStarred, setThreadStarred] = useState<Record<string, boolean>>({});
  const [postShareCache, setPostShareCache] = useState<Record<string, SharedPostCard | null>>({});
  const postShareInflightRef = useRef<Set<string>>(new Set());
  const memberId = sessionStorage.getItem('li_sim_member_id') || 'M-123';

  const avatarForShareQuoted = (q: SharedPostQuoted) =>
    q.member_id === memberId
      ? resolveViewerAvatarUrl(q.author_profile_photo_url, q.author_name || q.member_id)
      : resolveAvatarUrl(q.author_profile_photo_url, q.author_name || q.member_id);

  const displayNameFor = (idOrName: string) => personNameMap[idOrName] || idOrName;

  async function loadThreads() {
    setLoading(true);
    const res = await fetch('/api/threads/byUser', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: memberId })
    });
    const data = await res.json().catch(() => []);
    const mapped: Thread[] = (Array.isArray(data) ? data : []).map((thread: any) => {
      const peerId = thread.participant_a === memberId ? thread.participant_b : thread.participant_a;
      return {
        id: thread.thread_id,
        title: peerId,
        preview: personHeadlineMap[peerId] || 'Message conversation',
        participants: [thread.participant_a, thread.participant_b],
        lastActivity: thread.last_activity
      };
    });
    const byPeer = new Map<string, Thread>();
    for (const t of mapped) {
      const prev = byPeer.get(t.title);
      if (!prev) {
        byPeer.set(t.title, t);
      } else {
        const ts = (x: Thread) => (x.lastActivity ? new Date(x.lastActivity).getTime() : 0);
        if (ts(t) >= ts(prev)) byPeer.set(t.title, t);
      }
    }
    const dedupedByPeer = Array.from(byPeer.values()).sort(
      (a, b) =>
        (b.lastActivity ? new Date(b.lastActivity).getTime() : 0) -
        (a.lastActivity ? new Date(a.lastActivity).getTime() : 0)
    );
    setThreads(dedupedByPeer);
    setActiveThreadId((prev) => {
      if (!dedupedByPeer.length) return '';
      if (prev && dedupedByPeer.some((t) => t.id === prev)) return prev;
      return dedupedByPeer[0].id;
    });
    setLoading(false);
  }

  useEffect(() => {
    loadThreads().catch(() => setLoading(false));
    fetch('/api/members/search', {
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
          'M-DEMO-01': 'Alex Chen',
          'M-DEMO-02': 'Priya Kapoor'
        });
        setPersonHeadlineMap({
          'M-DEMO-01': 'Senior Engineer at Acme',
          'M-DEMO-02': 'Recruiter at Nova Labs'
        });
      });
    fetch('/api/members/get', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ member_id: memberId })
    })
      .then((res) => res.json())
      .then((data) => {
        if (!data || data.error) return;
        setMemberPhoto(resolveViewerAvatarUrl(data.profile_photo_url, data.name));
        setMemberName(data.name || '');
      })
      .catch(() => undefined);
    const timer = window.setInterval(() => {
      loadThreads().catch(() => undefined);
    }, 4000);
    return () => window.clearInterval(timer);
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
    const loadActiveMessages = () =>
      fetch('/api/messages/list', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ thread_id: activeThreadId, limit: 100 })
      })
        .then((res) => res.json())
        .then((data) => setMessages(Array.isArray(data) ? data : []))
        .catch(() => setMessages([]));

    loadActiveMessages();
    const timer = window.setInterval(loadActiveMessages, 3000);
    return () => window.clearInterval(timer);
  }, [activeThreadId]);

  useEffect(() => {
    for (const msg of messages) {
      const postId = extractPostShareId(msg.message_text);
      if (!postId || postShareCache[postId] !== undefined) continue;
      if (postShareInflightRef.current.has(postId)) continue;
      postShareInflightRef.current.add(postId);
      void fetch('/api/posts/get', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ post_id: postId, viewer_member_id: memberId })
      })
        .finally(() => postShareInflightRef.current.delete(postId))
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (!data?.post_id) {
            setPostShareCache((prev) => ({ ...prev, [postId]: null }));
            return;
          }
          setPostShareCache((prev) => ({
            ...prev,
            [postId]: {
              post_id: data.post_id,
              author_name: data.author_name,
              author_headline: data.author_headline,
              body: data.body,
              image_data: data.image_data,
              quoted: data.quoted || null
            }
          }));
        })
        .catch(() => setPostShareCache((prev) => ({ ...prev, [postId]: null })));
    }
  }, [messages, memberId, postShareCache]);

  const activeThread = useMemo(
    () => threads.find((thread) => thread.id === activeThreadId),
    [threads, activeThreadId]
  );
  const isComposeMode = useMemo(() => location.pathname.endsWith('/compose'), [location.pathname]);
  const activeFilter = useMemo(() => {
    if (location.pathname.endsWith('/jobs')) return 'jobs';
    if (location.pathname.endsWith('/unread')) return 'unread';
    if (location.pathname.endsWith('/connections')) return 'connections';
    if (location.pathname.endsWith('/inmail')) return 'inmail';
    if (location.pathname.endsWith('/starred')) return 'starred';
    return 'focused';
  }, [location.pathname]);
  const filteredThreads = useMemo(() => {
    const byFilter = threads.filter((thread) => {
      if (activeFilter === 'jobs') return /recruit|job|hiring/i.test(thread.title);
      if (activeFilter === 'connections') return true;
      if (activeFilter === 'unread') return thread.preview.toLowerCase().includes('open');
      if (activeFilter === 'inmail') return true;
      if (activeFilter === 'starred') return true;
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
    const openRes = await fetch('/api/threads/open', {
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

  async function sendMessage(threadId: string, text: string) {
    setSending(true);
    const sendRes = await fetch('/api/messages/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        thread_id: threadId,
        sender_id: memberId,
        text
      })
    });
    if (!sendRes.ok) {
      setFailedSend({ threadId, text });
      setSending(false);
      showToast('Message send failed. Retry once server is back.', 'error');
      return false;
    }
    setFailedSend(null);
    const refreshed = await fetch('/api/messages/list', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ thread_id: threadId, limit: 100 })
    });
    const refreshedData = await refreshed.json().catch(() => []);
    setMessages(Array.isArray(refreshedData) ? refreshedData : []);
    addActivity(`Sent a message to ${displayNameFor(activeThread?.title || composeToId || 'connection')}`);
    showToast('Message sent.', 'success');
    setSending(false);
    return true;
  }

  return (
    <div className="min-h-screen bg-[#f3f2ef]">
      <Navbar />
      <div className="mx-auto max-w-[1320px] px-3 pb-8 pt-2">
        <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-12">
          <section className="li-card overflow-hidden bg-white p-0 md:col-span-8">
            <div className="grid h-[calc(100vh-7rem)] min-h-[420px] grid-cols-1 md:grid-cols-12">
              <section className="border-b border-[#e0dfdc] bg-white md:col-span-4 md:border-b-0 md:border-r md:border-[#e0dfdc]">
                <div className="border-b border-[#e0dfdc] bg-white px-4 py-3">
                  <div className="mb-2 flex items-center justify-between">
                    <h2 className="text-xl font-semibold text-[#191919]">Messaging</h2>
                    <div className="flex items-center gap-0.5">
                      <button
                        type="button"
                        title="More actions"
                        className="rounded-full p-2 text-[#666666] hover:bg-[#f3f2ef]"
                        onClick={() => showToast('Folder settings coming soon.', 'info')}
                      >
                        <MoreHorizontal size={20} />
                      </button>
                      <Link
                        to="/messaging/compose"
                        title="Compose message"
                        className="inline-flex items-center rounded-full p-2 text-[#666666] hover:bg-[#f3f2ef]"
                      >
                        <SquarePen size={20} />
                        <span className="sr-only">Compose message</span>
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
                            <div
                              key={p.id}
                              role="button"
                              tabIndex={0}
                              onClick={() => {
                                setComposeToId(p.id);
                                setComposeQuery(p.name);
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                  e.preventDefault();
                                  setComposeToId(p.id);
                                  setComposeQuery(p.name);
                                }
                              }}
                              className={`flex w-full cursor-pointer items-start gap-2 border-b border-slate-100 px-3 py-2 text-left last:border-b-0 hover:bg-slate-50 ${composeToId === p.id ? 'bg-blue-50' : ''}`}
                            >
                              <div className="h-7 w-7 overflow-hidden rounded-full border border-slate-200">
                                <img src={peerAvatar(p.name)} alt={p.name} className="h-full w-full object-cover" />
                              </div>
                              <div className="min-w-0">
                                <span
                                  className="block truncate text-left text-xs font-semibold text-slate-900 hover:text-[#0a66c2] hover:underline"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    navigate(`/profile/${encodeURIComponent(p.id)}`);
                                  }}
                                >
                                  {p.name}
                                </span>
                                <p className="truncate text-[11px] text-slate-500">{p.headline || p.id}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : null}
                      <Link to="/messaging" className="inline-block text-[11px] font-semibold text-[#0a66c2] hover:underline">
                        Exit compose mode
                      </Link>
                    </div>
                  ) : null}
                  <div className="relative">
                    <Search size={16} className="pointer-events-none absolute left-3 top-2 text-[#666666]" />
                    <input
                      type="text"
                      placeholder="Search messages"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="w-full rounded border border-transparent bg-[#edf3f8] py-2 pl-9 pr-3 text-sm placeholder:text-[#666] focus:border-[#0a66c2] focus:outline-none"
                    />
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2 text-xs">
                    {MESSAGE_FILTER_CHIPS.map(({ label, slug }) => {
                      const isActive = activeFilter === slug;
                      return (
                        <Link
                          key={slug}
                          to={`/messaging/filter/${slug}`}
                          className={`inline-flex items-center gap-0.5 rounded-full border px-2.5 py-1.5 font-semibold transition ${
                            isActive
                              ? 'border-[#057642] bg-[#057642] text-white shadow-sm'
                              : 'border-[#191919] bg-white text-[#191919] hover:bg-[#f3f2ef]'
                          }`}
                        >
                          {label}
                          {slug === 'focused' ? <ChevronDown size={14} strokeWidth={2.5} className="opacity-90" /> : null}
                        </Link>
                      );
                    })}
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
                              <div
                                key={p.id}
                                role="button"
                                tabIndex={0}
                                onClick={async () => {
                                  await startOrOpenConversation(p.id, p.name);
                                  setSearch('');
                                }}
                                onKeyDown={async (e) => {
                                  if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault();
                                    await startOrOpenConversation(p.id, p.name);
                                    setSearch('');
                                  }
                                }}
                                className="flex w-full cursor-pointer items-start gap-2 border-b border-slate-100 px-3 py-2 text-left last:border-b-0 hover:bg-slate-50"
                              >
                                <div className="h-7 w-7 overflow-hidden rounded-full border border-slate-200">
                                  <img src={peerAvatar(p.name)} alt={p.name} className="h-full w-full object-cover" />
                                </div>
                                <div className="min-w-0">
                                  <span
                                    className="block truncate text-left text-xs font-semibold text-slate-900 hover:text-[#0a66c2] hover:underline"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      navigate(`/profile/${encodeURIComponent(p.id)}`);
                                    }}
                                  >
                                    {p.name}
                                  </span>
                                  <p className="truncate text-[11px] text-slate-500">{p.headline || p.id}</p>
                                </div>
                              </div>
                            ))}
                        </div>
                      ) : null}
                    </div>
                  ) : filteredThreads.map((thread) => (
                    <div
                      key={thread.id}
                      role="button"
                      tabIndex={0}
                      className={`w-full cursor-pointer border-b border-[#e0dfdc] px-4 py-3 text-left transition ${
                        activeThreadId === thread.id ? 'bg-[#eef3f8]' : 'border-[#e0dfdc] hover:bg-[#f9fafb]'
                      }`}
                      onClick={() => setActiveThreadId(thread.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setActiveThreadId(thread.id);
                        }
                      }}
                    >
                      <div className="flex items-start gap-3">
                        <div className="h-12 w-12 shrink-0 overflow-hidden rounded-full border border-[#e0dfdc] bg-[#f3f2ef]">
                          <img src={peerAvatar(thread.title)} alt="" className="h-full w-full object-cover" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-2">
                            <span
                              role="link"
                              tabIndex={0}
                              className="cursor-pointer text-left text-[15px] font-semibold leading-tight text-[#191919] hover:text-[#0a66c2] hover:underline"
                              onClick={(event) => {
                                event.stopPropagation();
                                navigate(`/profile/${encodeURIComponent(thread.title)}`);
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.stopPropagation();
                                  navigate(`/profile/${encodeURIComponent(thread.title)}`);
                                }
                              }}
                            >
                              {displayNameFor(thread.title)}
                            </span>
                            <time className="shrink-0 text-xs text-[#666666]" dateTime={thread.lastActivity}>
                              {formatThreadListTime(thread.lastActivity)}
                            </time>
                          </div>
                          <p className="mt-0.5 line-clamp-2 text-sm leading-snug text-[#666666]">{thread.preview}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
              <section className="flex min-h-0 flex-col bg-white md:col-span-8">
                <div className="flex shrink-0 items-start justify-between gap-2 border-b border-[#e0dfdc] px-4 py-3">
                  <div className="min-w-0">
                    {activeThread ? (
                      <>
                        <Link
                          to={`/profile/${encodeURIComponent(activeThread.title)}`}
                          className="text-lg font-semibold text-[#191919] hover:text-[#0a66c2] hover:underline"
                        >
                          {displayNameFor(activeThread.title)}
                        </Link>
                        <p className="mt-0.5 text-sm text-[#666666]">
                          {personHeadlineMap[activeThread.title] || 'LinkedIn member'}
                        </p>
                      </>
                    ) : (
                      <p className="text-lg font-semibold text-[#191919]">Select a conversation</p>
                    )}
                  </div>
                  {activeThread ? (
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        type="button"
                        title={threadStarred[activeThread.id] ? 'Unstar conversation' : 'Star conversation'}
                        className="rounded-full p-2 text-[#666666] hover:bg-[#f3f2ef]"
                        onClick={() =>
                          setThreadStarred((prev) => ({
                            ...prev,
                            [activeThread.id]: !prev[activeThread.id]
                          }))
                        }
                      >
                        <Star
                          size={20}
                          className={
                            threadStarred[activeThread.id] ? 'fill-[#c37d16] text-[#c37d16]' : 'text-[#666666]'
                          }
                          strokeWidth={threadStarred[activeThread.id] ? 0 : 1.75}
                        />
                      </button>
                      <button
                        type="button"
                        title="Conversation options"
                        className="rounded-full p-2 text-[#666666] hover:bg-[#f3f2ef]"
                        onClick={() => showToast('Conversation options coming soon.', 'info')}
                      >
                        <MoreHorizontal size={20} />
                      </button>
                    </div>
                  ) : null}
                </div>
                <div className="flex min-h-0 flex-1 flex-col p-0 md:p-4">
                  <div className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-[#f3f2ef] p-4 text-sm text-[#191919] md:rounded-md">
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
                          className={`max-w-[85%] rounded-xl px-3 py-2 shadow-sm ${
                            msg.sender_id === memberId ? 'ml-auto bg-[#0a66c2] text-white' : 'bg-white text-[#191919]'
                          }`}
                        >
                          {(() => {
                            const postId = extractPostShareId(msg.message_text);
                            const preview = postId ? postShareCache[postId] : undefined;
                            const plain = stripPostShareMarker(msg.message_text);
                            if (!postId) {
                              return (
                                <p className="whitespace-pre-wrap break-words">
                                  {linkifyMessageText(msg.message_text, msg.sender_id === memberId ? 'sent' : 'received')}
                                </p>
                              );
                            }
                            if (preview === null) {
                              return (
                                <p className="whitespace-pre-wrap break-words">
                                  {linkifyMessageText(plain, msg.sender_id === memberId ? 'sent' : 'received')}
                                </p>
                              );
                            }
                            if (!preview) {
                              return (
                                <p className={`text-sm ${msg.sender_id === memberId ? 'text-white/85' : 'text-slate-500'}`}>
                                  Loading shared post…
                                </p>
                              );
                            }
                            const snippet =
                              preview.body.length > 220 ? `${preview.body.slice(0, 217).trim()}…` : preview.body;
                            const q = preview.quoted;
                            return (
                              <div className="space-y-2">
                                <p
                                  className={`text-[11px] font-semibold uppercase tracking-wide ${
                                    msg.sender_id === memberId ? 'text-blue-100' : 'text-[#666]'
                                  }`}
                                >
                                  Shared a post
                                </p>
                                <Link
                                  to={`/feed#${encodeURIComponent(preview.post_id)}`}
                                  className={`block overflow-hidden rounded-lg border text-left no-underline transition-opacity hover:opacity-95 ${
                                    msg.sender_id === memberId
                                      ? 'border-white/35 bg-white text-[#191919]'
                                      : 'border-[#e0dfdc] bg-[#f9fafb] text-[#191919]'
                                  }`}
                                >
                                  <div className="border-b border-[#e8e8e8] px-3 py-2">
                                    <p className="text-sm font-semibold text-[#191919]">
                                      {preview.author_name || 'Member'}
                                    </p>
                                    {preview.author_headline ? (
                                      <p className="mt-0.5 line-clamp-1 text-xs text-[#666]">{preview.author_headline}</p>
                                    ) : null}
                                  </div>
                                  {q ? (
                                    <>
                                      <p className="line-clamp-3 px-3 py-2 text-sm leading-snug text-[#333]">{snippet}</p>
                                      <div className="mx-3 mb-2 overflow-hidden rounded-md border border-[#e0dfdc] bg-[#f3f2ef]">
                                        <div className="flex items-start gap-2 border-b border-[#e8e8e8] bg-[#fafafa] px-2 py-1.5">
                                          <img
                                            src={avatarForShareQuoted(q)}
                                            alt=""
                                            className="h-7 w-7 shrink-0 rounded-full border border-slate-200 object-cover"
                                          />
                                          <div className="min-w-0">
                                            <p className="text-xs font-semibold text-[#191919]">
                                              {q.author_name || q.member_id}
                                            </p>
                                            {q.author_headline ? (
                                              <p className="line-clamp-1 text-[10px] text-[#666]">{q.author_headline}</p>
                                            ) : null}
                                          </div>
                                        </div>
                                        <p className="line-clamp-2 px-2 py-1.5 text-xs text-[#333]">{q.body}</p>
                                        {q.image_data ? (
                                          <div className="max-h-28 w-full overflow-hidden bg-[#eef3f8]">
                                            <img src={q.image_data} alt="" className="h-full w-full object-cover" />
                                          </div>
                                        ) : null}
                                      </div>
                                    </>
                                  ) : (
                                    <>
                                      {preview.image_data ? (
                                        <div className="aspect-[1.85/1] max-h-36 w-full overflow-hidden bg-[#eef3f8]">
                                          <img src={preview.image_data} alt="" className="h-full w-full object-cover" />
                                        </div>
                                      ) : null}
                                      <p className="line-clamp-3 px-3 py-2 text-sm leading-snug text-[#333]">{snippet}</p>
                                    </>
                                  )}
                                  <p className="px-3 pb-2 text-xs font-semibold text-[#0a66c2]">View post →</p>
                                </Link>
                              </div>
                            );
                          })()}
                        </div>
                        {msg.sender_id === memberId && (
                          <Link
                            to={`/profile/${encodeURIComponent(memberId)}`}
                            className="h-7 w-7 overflow-hidden rounded-full border border-slate-200 bg-white"
                          >
                            <img src={memberPhoto} alt="Me" className="h-full w-full object-cover" />
                          </Link>
                        )}
                      </div>
                    ))}
                  </div>
                  {failedSend ? (
                    <div className="mt-2 flex items-center justify-between rounded-md border border-[#f2c3c3] bg-[#fff4f4] px-3 py-2 text-xs text-[#9f2d2d]">
                      <span>Last message failed to send.</span>
                      <button
                        type="button"
                        className="font-semibold text-[#0a66c2] hover:underline"
                        onClick={async () => {
                          const ok = await sendMessage(failedSend.threadId, failedSend.text);
                          if (ok) showToast('Message retry succeeded.', 'success');
                        }}
                      >
                        Retry
                      </button>
                    </div>
                  ) : null}
                  <form
                    className="mt-0 flex gap-2 border-t border-[#e0dfdc] bg-white px-4 py-3"
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
                          const latest = await fetch('/api/threads/byUser', {
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
                      const text = draft.trim();
                      const sentOk = await sendMessage(threadId, text);
                      if (!sentOk) return;
                      setDraft('');
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
                      disabled={sending}
                      className="inline-flex items-center gap-1 rounded-full bg-[#0a66c2] px-4 py-2 text-sm font-semibold text-white hover:bg-[#004182] disabled:cursor-not-allowed disabled:bg-blue-300"
                    >
                      <SendHorizonal size={16} />
                      {sending ? 'Sending...' : 'Send'}
                    </button>
                  </form>
                </div>
              </section>
            </div>
          </section>
          <aside className="hidden min-w-0 md:col-span-4 md:block">
            <div className="sticky top-[56px] space-y-3">
              <MessagingRightRail memberName={memberName} memberPhoto={memberPhoto} />
            </div>
          </aside>
        </div>
        <div className="mt-6 border-t border-[#e0dfdc] pt-4 md:hidden">
          <MessagingFooterLinks />
        </div>
      </div>
    </div>
  );
}
