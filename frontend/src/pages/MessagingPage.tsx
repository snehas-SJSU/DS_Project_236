import { useEffect, useMemo, useState } from 'react';
import { SendHorizonal } from 'lucide-react';
import { MEMBER_ID, resolveAvatarUrl } from '../lib/memberProfile';
import Navbar from '../components/layout/Navbar';
import { Link } from 'react-router-dom';

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

export default function MessagingPage() {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string>('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState('');
  const [memberPhoto, setMemberPhoto] = useState<string>(resolveAvatarUrl(undefined, 'Me'));
  const memberId = MEMBER_ID;

  async function loadThreads() {
    setLoading(true);
    const res = await fetch('http://localhost:4000/api/threads/byUser', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: memberId })
    });
    const data = await res.json().catch(() => []);
    const mapped = (Array.isArray(data) ? data : []).map((thread: any) => ({
      id: thread.thread_id,
      title: thread.participant_a === memberId ? thread.participant_b : thread.participant_a,
      preview: 'Open thread',
      participants: [thread.participant_a, thread.participant_b]
    }));
    setThreads(mapped);
    if (mapped.length && !activeThreadId) {
      setActiveThreadId(mapped[0].id);
    }
    setLoading(false);
  }

  useEffect(() => {
    loadThreads().catch(() => setLoading(false));
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
  const peerAvatar = (idOrName?: string) =>
    `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(idOrName || 'Contact')}`;

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
                    <Link to="/messaging/compose" className="text-xs font-semibold text-[#0a66c2] hover:underline">Compose</Link>
                  </div>
                  <input
                    type="text"
                    placeholder="Search messages"
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
                  ) : threads.length === 0 ? (
                    <p className="px-4 py-3 text-sm text-slate-500">No conversations yet. Connect with someone to start messaging.</p>
                  ) : threads.map((thread) => (
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
                          <p className="font-medium text-slate-900">{thread.title}</p>
                          <p className="truncate text-sm text-slate-600">{thread.preview}</p>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </section>
              <section className="md:col-span-7">
                <div className="border-b border-slate-200 px-4 py-3">
                  <p className="font-semibold text-slate-900">{activeThread?.title || 'Select a conversation'}</p>
                  {activeThread && <p className="text-xs text-slate-500">Thread ID: {activeThread.id}</p>}
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
                      if (!draft.trim() || !activeThreadId) return;
                      await fetch('http://localhost:4000/api/messages/send', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          thread_id: activeThreadId,
                          sender_id: memberId,
                          text: draft.trim()
                        })
                      });
                      setDraft('');
                      const refreshed = await fetch('http://localhost:4000/api/messages/list', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ thread_id: activeThreadId, limit: 100 })
                      });
                      const refreshedData = await refreshed.json().catch(() => []);
                      setMessages(Array.isArray(refreshedData) ? refreshedData : []);
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
