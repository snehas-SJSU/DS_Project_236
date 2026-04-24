import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { BrowserRouter, Link, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { Link2, MessageCircle, Pencil, Repeat2, Search, Send as SendIcon, ThumbsUp, X } from 'lucide-react';
import Navbar from './components/layout/Navbar';
import JobsBoard from './pages/JobsBoard';
import JobsSearchPage from './pages/JobsSearchPage';
import ApplicationsPage from './pages/ApplicationsPage';
import MessagingPage from './pages/MessagingPage';
import NetworkPage from './pages/NetworkPage';
import NotificationsPage from './pages/NotificationsPage';
import LoginLandingPage from './pages/LoginLandingPage';
import SignInPage from './pages/SignInPage';
import JoinPage from './pages/JoinPage';
import SignOutPage from './pages/SignOutPage';
import Profile from './pages/Profile';
import MemberPublicProfilePage from './pages/MemberPublicProfilePage';
import RecruiterDashboard from './pages/RecruiterDashboard';
import RecruiterAdminPage from './pages/RecruiterAdminPage';
import MemberAnalyticsPage from './pages/MemberAnalyticsPage';
import StaticPage from './pages/StaticPage';
import SavedItemsPage from './pages/SavedItemsPage';
import SettingsPage from './pages/SettingsPage';
import ActivityPage from './pages/ActivityPage';
import BusinessPage from './pages/BusinessPage';
import JobPreferencesPage from './pages/JobPreferencesPage';
import JobTrackerPage from './pages/JobTrackerPage';
import JobInsightsPage from './pages/JobInsightsPage';
import NetworkCollectionsPage from './pages/NetworkCollectionsPage';
import MemberSearchPage from './pages/MemberSearchPage';
import HelpCenterPage from './pages/HelpCenterPage';
import PremiumPage from './pages/PremiumPage';
import LanguagePage from './pages/LanguagePage';
import JobPostPage from './pages/JobPostPage';
import JobApplyPage from './pages/JobApplyPage';
import CompanyPage from './pages/CompanyPage';
import { isAuthenticated } from './lib/auth';
import { MEMBER_ID, resolveAvatarUrl, resolveViewerAvatarUrl } from './lib/memberProfile';
import { showToast, ToastViewport } from './lib/toast';
import AIAssistantPage from './pages/AIAssistantPage';
/** Original post embedded in “Repost with your thoughts” */
type FeedQuotedPost = {
  post_id: string;
  member_id: string;
  author_name: string | null;
  author_headline?: string | null;
  body: string;
  image_data: string | null;
  author_profile_photo_url?: string | null;
};

type ApiPostRow = {
  post_id: string;
  member_id: string;
  author_name: string | null;
  author_headline?: string | null;
  /** From members.profile_photo_url when post-service joins members */
  author_profile_photo_url?: string | null;
  body: string;
  image_data: string | null;
  quoted_post_id?: string | null;
  quoted?: FeedQuotedPost | null;
  created_at: string;
  like_count: number;
  comment_count: number;
  repost_count: number;
  send_count: number;
  liked: boolean;
  reposted: boolean;
  sent: boolean;
};

type MemberRow = {
  member_id: string;
  name?: string | null;
  title?: string | null;
  headline?: string | null;
};

type PostComment = {
  comment_id: string;
  member_id: string;
  author_name: string | null;
  body: string;
  created_at: string;
};

function FeedPlaceholder() {
  const navigate = useNavigate();
  const location = useLocation();
  const [apiPosts, setApiPosts] = useState<ApiPostRow[]>([]);
  const [memberDisplayName, setMemberDisplayName] = useState('Sneha Singh');
  const [feedLoading, setFeedLoading] = useState(true);
  const [composerOpen, setComposerOpen] = useState(false);
  const [draftPost, setDraftPost] = useState('');
  const [attachedImage, setAttachedImage] = useState<string | undefined>(undefined);
  const [scheduledAt, setScheduledAt] = useState('');
  const [audience, setAudience] = useState<'Anyone' | 'Connections'>('Anyone');
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const [commentOpenId, setCommentOpenId] = useState<string | null>(null);
  const [commentDraft, setCommentDraft] = useState('');
  const [commentByPost, setCommentByPost] = useState<Record<string, PostComment[]>>({});
  const [sendModalPost, setSendModalPost] = useState<ApiPostRow | null>(null);
  const [sendSearch, setSendSearch] = useState('');
  const [sendContacts, setSendContacts] = useState<MemberRow[]>([]);
  const [sendSelected, setSendSelected] = useState<Record<string, boolean>>({});
  const [sendBusy, setSendBusy] = useState(false);
  const [repostMenuPostId, setRepostMenuPostId] = useState<string | null>(null);
  const [repostThoughtsPost, setRepostThoughtsPost] = useState<ApiPostRow | null>(null);
  const [repostThoughtsDraft, setRepostThoughtsDraft] = useState('');
  const repostMenuRef = useRef<HTMLDivElement | null>(null);
  const [commentSort, setCommentSort] = useState<'recent' | 'relevant'>('relevant');

  const feedAuthorAvatarSrc = (p: ApiPostRow) =>
    p.member_id === MEMBER_ID
      ? resolveViewerAvatarUrl(p.author_profile_photo_url, p.author_name || p.member_id)
      : resolveAvatarUrl(p.author_profile_photo_url, p.author_name || p.member_id);

  const feedQuotedAvatarSrc = (q: FeedQuotedPost) =>
    q.member_id === MEMBER_ID
      ? resolveViewerAvatarUrl(q.author_profile_photo_url, q.author_name || q.member_id)
      : resolveAvatarUrl(q.author_profile_photo_url, q.author_name || q.member_id);

  const loadPosts = async () => {
    try {
      const res = await fetch('/api/posts/list', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ limit: 50, viewer_member_id: MEMBER_ID })
      });
      const data = await res.json().catch(() => []);
      const rows = Array.isArray(data) ? data : [];
      setApiPosts(
        rows.map((r: ApiPostRow) => ({
          ...r,
          repost_count: Number(r.repost_count) || 0,
          send_count: Number(r.send_count) || 0,
          reposted: Boolean(r.reposted),
          sent: Boolean(r.sent)
        }))
      );
    } catch {
      setApiPosts([]);
    } finally {
      setFeedLoading(false);
    }
  };

  useEffect(() => {
    setCommentDraft('');
    setCommentSort('relevant');
  }, [commentOpenId]);

  useEffect(() => {
    if (!sendModalPost) return;
    let cancelled = false;
    const kw = sendSearch.trim().toLowerCase();

    const hydrateMember = async (memberId: string): Promise<MemberRow | null> => {
      const r = await fetch('/api/members/get', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ member_id: memberId })
      });
      if (!r.ok) return null;
      const d = await r.json().catch(() => ({}));
      if (!d || d.error || !d.member_id) return null;
      return {
        member_id: d.member_id,
        name: d.name,
        title: d.title,
        headline: d.headline
      };
    };

    const t = window.setTimeout(() => {
      void (async () => {
        try {
          const connRes = await fetch('/api/connections/list', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: MEMBER_ID })
          });
          const connJson = await connRes.json().catch(() => []);
          const connIds: string[] = Array.isArray(connJson) ? connJson : [];
          const fromConnections = (
            await Promise.all(connIds.filter((id) => id && id !== MEMBER_ID).map(hydrateMember))
          ).filter(Boolean) as MemberRow[];

          const mergedMap = new Map<string, MemberRow>();
          for (const m of fromConnections) mergedMap.set(m.member_id, m);

          const sr = await fetch('/api/members/search', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ keyword: sendSearch.trim() || undefined })
          });
          const searchJson = await sr.json().catch(() => []);
          const searchList = Array.isArray(searchJson) ? searchJson : [];
          for (const raw of searchList) {
            const m = raw as MemberRow;
            if (!m.member_id || m.member_id === MEMBER_ID) continue;
            if (!mergedMap.has(m.member_id)) {
              mergedMap.set(m.member_id, {
                member_id: m.member_id,
                name: m.name,
                title: m.title,
                headline: m.headline
              });
            }
          }

          let list = Array.from(mergedMap.values());
          if (kw) {
            list = list.filter(
              (m) =>
                (m.name || '').toLowerCase().includes(kw) ||
                (m.title || '').toLowerCase().includes(kw) ||
                (m.headline || '').toLowerCase().includes(kw) ||
                m.member_id.toLowerCase().includes(kw)
            );
          }
          const connectionSet = new Set(fromConnections.map((c) => c.member_id));
          list.sort((a, b) => {
            const ac = connectionSet.has(a.member_id) ? 0 : 1;
            const bc = connectionSet.has(b.member_id) ? 0 : 1;
            if (ac !== bc) return ac - bc;
            return (a.name || a.member_id).localeCompare(b.name || b.member_id);
          });
          if (!cancelled) setSendContacts(list.slice(0, 50));
        } catch {
          if (!cancelled) setSendContacts([]);
        }
      })();
    }, 200);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [sendModalPost, sendSearch]);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (!repostMenuPostId) return;
      const el = repostMenuRef.current;
      if (el && !el.contains(e.target as Node)) setRepostMenuPostId(null);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [repostMenuPostId]);

  useEffect(() => {
    fetch('/api/members/get', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ member_id: MEMBER_ID })
    })
      .then((r) => r.json())
      .then((d) => {
        if (d && !d.error && d.name) setMemberDisplayName(d.name);
      })
      .catch(() => undefined);
    loadPosts();
    const timer = window.setInterval(() => {
      loadPosts().catch(() => undefined);
    }, 6000);
    return () => window.clearInterval(timer);
  }, []);

  /** Deep links from messages / shares: `/feed#P-…` scrolls to that post in the feed. */
  useEffect(() => {
    const raw = location.hash.replace(/^#/, '');
    if (!raw || feedLoading || apiPosts.length === 0) return;
    const id = decodeURIComponent(raw);
    if (!apiPosts.some((p) => p.post_id === id)) return;
    const t = window.setTimeout(() => {
      const el = document.getElementById(id);
      el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 80);
    return () => window.clearTimeout(t);
  }, [location.hash, location.pathname, apiPosts, feedLoading]);

  const loadComments = async (postId: string) => {
    const res = await fetch('/api/posts/comments/list', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ post_id: postId })
    });
    const data = await res.json().catch(() => []);
    setCommentByPost((prev) => ({ ...prev, [postId]: Array.isArray(data) ? data : [] }));
  };

  const publishPost = async () => {
    const text = draftPost.trim();
    if (!text) return;
    const bodyText = scheduledAt ? `[Scheduled: ${scheduledAt}] ${text}` : text;
    try {
      const res = await fetch('/api/posts/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          member_id: MEMBER_ID,
          author_name: memberDisplayName,
          body: bodyText,
          image_data: attachedImage || undefined
        })
      });
      if (!res.ok) {
        showToast('Could not publish post.', 'error');
        return;
      }
      showToast(scheduledAt ? `Post scheduled for ${scheduledAt}.` : 'Post published.', 'success');
      setDraftPost('');
      setAttachedImage(undefined);
      setScheduledAt('');
      setAudience('Anyone');
      setComposerOpen(false);
      await loadPosts();
    } catch {
      showToast('Could not publish post.', 'error');
    }
  };

  const toggleRepost = async (p: ApiPostRow) => {
    try {
      const path = p.reposted ? '/api/posts/unrepost' : '/api/posts/repost';
      const res = await fetch(`${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ post_id: p.post_id, member_id: MEMBER_ID })
      });
      if (!res.ok) return;
      await loadPosts();
    } catch {
      showToast('Repost failed.', 'error');
    }
  };

  const openSendModal = (p: ApiPostRow) => {
    setSendModalPost(p);
    setSendSearch('');
    setSendSelected({});
  };

  const completeSendModal = async () => {
    if (!sendModalPost) return;
    const ids = Object.keys(sendSelected).filter((k) => sendSelected[k]);
    if (ids.length === 0) {
      showToast('Select at least one person.', 'info');
      return;
    }
    setSendBusy(true);
    try {
      const post = sendModalPost;
      const snippet = post.body.slice(0, 280);
      const link = `${window.location.origin}/feed#${post.post_id}`;
      const text = `Shared a post from ${post.author_name || 'feed'}:\n${snippet}\n${link}\n[[post_share:${post.post_id}]]`;
      for (const rid of ids) {
        const openRes = await fetch('/api/threads/open', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ participant_a: MEMBER_ID, participant_b: rid })
        });
        const openData = await openRes.json().catch(() => ({}));
        if (!openData.thread_id) continue;
        await fetch('/api/messages/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ thread_id: openData.thread_id, sender_id: MEMBER_ID, text })
        });
      }
      const sendOnce = await fetch('/api/posts/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ post_id: post.post_id, member_id: MEMBER_ID })
      });
      if (!sendOnce.ok) {
        showToast('Could not log send.', 'error');
        return;
      }
      await loadPosts();
      setSendModalPost(null);
      showToast('Sent.', 'success');
      navigate(`/messaging?sharePost=${encodeURIComponent(post.post_id)}`);
    } catch {
      showToast('Send failed.', 'error');
    } finally {
      setSendBusy(false);
    }
  };

  const publishThoughtRepost = async () => {
    if (!repostThoughtsPost) return;
    const t = repostThoughtsDraft.trim();
    if (!t) {
      showToast('Add your thoughts first.', 'info');
      return;
    }
    const p = repostThoughtsPost;
    try {
      const res = await fetch('/api/posts/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          member_id: MEMBER_ID,
          author_name: memberDisplayName,
          body: t,
          quoted_post_id: p.post_id
        })
      });
      if (!res.ok) {
        showToast('Could not publish post.', 'error');
        return;
      }
      await fetch('/api/posts/repost', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ post_id: p.post_id, member_id: MEMBER_ID })
      });
      setRepostThoughtsPost(null);
      setRepostThoughtsDraft('');
      await loadPosts();
      showToast('Repost with thoughts published.', 'success');
    } catch {
      showToast('Could not publish post.', 'error');
    }
  };

  const toggleLike = async (p: ApiPostRow) => {
    try {
      const path = p.liked ? '/api/posts/unlike' : '/api/posts/like';
      const res = await fetch(`${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ post_id: p.post_id, member_id: MEMBER_ID })
      });
      if (!res.ok) return;
      await loadPosts();
    } catch {
      showToast('Like failed.', 'error');
    }
  };

  const submitComment = async (postId: string) => {
    const t = commentDraft.trim();
    if (!t) return;
    try {
      const res = await fetch('/api/posts/comment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          post_id: postId,
          member_id: MEMBER_ID,
          author_name: memberDisplayName,
          body: t
        })
      });
      if (!res.ok) {
        showToast('Comment failed.', 'error');
        return;
      }
      setCommentDraft('');
      await loadPosts();
      await loadComments(postId);
    } catch {
      showToast('Comment failed.', 'error');
    }
  };

  return (
    <div className="space-y-3">
      <div className="li-card p-4">
        <div className="mb-3 flex items-center gap-3">
          <div className="h-12 w-12 overflow-hidden rounded-full border border-slate-200 bg-slate-100">
            <img src={resolveViewerAvatarUrl(undefined, memberDisplayName)} alt="Me" className="h-full w-full object-cover" />
          </div>
          <button
            className="flex-1 rounded-full border border-[#cfd6dc] px-4 py-3 text-left text-sm font-medium text-[#666666] hover:bg-[#f3f6f8]"
            onClick={() => setComposerOpen(true)}
          >
            Start a post
          </button>
        </div>
        <div className="mt-1 grid grid-cols-3 gap-2">
          <Link to="/profile/activity" className="flex items-center justify-center rounded-lg px-4 py-2 text-sm font-semibold text-[#666666] hover:bg-[#f3f6f8]">Media</Link>
          <Link to="/jobs" className="flex items-center justify-center rounded-lg px-4 py-2 text-sm font-semibold text-[#666666] hover:bg-[#f3f6f8]">Job</Link>
          <Link to="/profile/activity" className="flex items-center justify-center rounded-lg px-4 py-2 text-sm font-semibold text-[#666666] hover:bg-[#f3f6f8]">Write article</Link>
        </div>
      </div>
      {feedLoading ? <p className="text-sm text-slate-500">Loading feed…</p> : null}
      {apiPosts.map((p) => (
        <article key={p.post_id} id={p.post_id} className="li-card scroll-mt-28 p-4">
          <div className="flex items-start gap-3">
            <div className="h-12 w-12 overflow-hidden rounded-full border border-slate-200 bg-slate-100">
              <img src={feedAuthorAvatarSrc(p)} alt="" className="h-full w-full object-cover" />
            </div>
            <div className="min-w-0">
              <Link to={`/profile/${encodeURIComponent(p.member_id)}`} className="text-sm font-semibold text-[#191919] hover:text-[#0a66c2] hover:underline">
                {p.author_name || p.member_id}
              </Link>
              {p.author_headline ? <p className="text-xs text-[#666666]">{p.author_headline}</p> : null}
              <p className="text-xs text-[#666666]">{new Date(p.created_at).toLocaleString()} • 🌎</p>
            </div>
          </div>
          <p className="mt-3 whitespace-pre-wrap text-[14px] leading-6 text-[#191919]">{p.body}</p>
          {p.quoted ? (
            <div className="mt-3 overflow-hidden rounded-lg border border-[#e0dfdc] bg-[#f3f2ef]">
              <div className="flex items-start gap-2 border-b border-[#e8e8e8] bg-[#fafafa] px-3 py-2">
                <div className="h-9 w-9 shrink-0 overflow-hidden rounded-full border border-slate-200 bg-slate-100">
                  <img src={feedQuotedAvatarSrc(p.quoted)} alt="" className="h-full w-full object-cover" />
                </div>
                <div className="min-w-0">
                  <Link
                    to={`/profile/${encodeURIComponent(p.quoted.member_id)}`}
                    className="text-sm font-semibold text-[#191919] hover:text-[#0a66c2] hover:underline"
                  >
                    {p.quoted.author_name || p.quoted.member_id}
                  </Link>
                  {p.quoted.author_headline ? (
                    <p className="line-clamp-1 text-xs text-[#666666]">{p.quoted.author_headline}</p>
                  ) : null}
                </div>
              </div>
              <div className="px-3 py-2">
                <p className="text-sm leading-relaxed text-[#191919]">{p.quoted.body}</p>
                {p.quoted.image_data ? (
                  <div className="mt-2 overflow-hidden rounded-md border border-slate-200">
                    <img src={p.quoted.image_data} alt="" className="max-h-[280px] w-full object-cover" />
                  </div>
                ) : null}
              </div>
            </div>
          ) : p.image_data ? (
            <div className="mt-3 overflow-hidden rounded-md border border-slate-200">
              <img src={p.image_data} alt="Post media" className="max-h-[360px] w-full object-cover" />
            </div>
          ) : null}
          <div className="mt-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-[#e0dfdc] pb-2 text-xs text-[#666666]">
            <span>{p.like_count} reactions</span>
            <span>
              {p.comment_count} comments • {p.repost_count} reposts
              {p.send_count > 0 ? ` • ${p.send_count} sends` : ''}
            </span>
          </div>
          <div className="mt-1 flex flex-wrap justify-between gap-0 border-t border-[#f3f2ef] pt-0.5 text-[13px] font-semibold text-[#666666]">
            <button
              type="button"
              onClick={() => toggleLike(p)}
              className={`flex min-h-[48px] flex-1 flex-col items-center justify-center gap-0.5 rounded-lg py-1.5 transition-colors hover:bg-[#f3f2ef] sm:flex-row sm:gap-1.5 ${
                p.liked ? 'text-[#0a66c2]' : ''
              }`}
            >
              <ThumbsUp
                className={`h-5 w-5 shrink-0 ${p.liked ? 'fill-[#0a66c2] text-[#0a66c2]' : 'text-[#666666]'}`}
                strokeWidth={2}
                fill={p.liked ? 'currentColor' : 'none'}
              />
              <span>Like</span>
            </button>
            <button
              type="button"
              onClick={() => {
                if (commentOpenId === p.post_id) {
                  setCommentOpenId(null);
                } else {
                  setCommentOpenId(p.post_id);
                  loadComments(p.post_id).catch(() => undefined);
                }
              }}
              className={`flex min-h-[48px] flex-1 flex-col items-center justify-center gap-0.5 rounded-lg py-1.5 transition-colors hover:bg-[#f3f2ef] sm:flex-row sm:gap-1.5 ${
                commentOpenId === p.post_id ? 'text-[#0a66c2]' : ''
              }`}
            >
              <MessageCircle className="h-5 w-5 shrink-0" />
              <span>Comment</span>
            </button>
            <div className="relative flex flex-1 justify-center" ref={repostMenuPostId === p.post_id ? repostMenuRef : undefined}>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setRepostMenuPostId((id) => (id === p.post_id ? null : p.post_id));
                }}
                className={`flex min-h-[48px] w-full flex-col items-center justify-center gap-0.5 rounded-lg py-1.5 transition-colors hover:bg-[#f3f2ef] sm:flex-row sm:gap-1.5 ${
                  p.reposted ? 'text-[#0a66c2]' : ''
                }`}
              >
                <Repeat2 className={`h-5 w-5 shrink-0 ${p.reposted ? 'text-[#0a66c2]' : ''}`} />
                <span>Repost</span>
              </button>
              {repostMenuPostId === p.post_id ? (
                <div className="absolute bottom-full left-1/2 z-[80] mb-1 w-[min(100vw-2rem,280px)] -translate-x-1/2 rounded-xl border border-[#e0dfdc] bg-white py-1 shadow-lg">
                  <button
                    type="button"
                    className="block w-full px-4 py-2.5 text-left text-sm text-[#191919] hover:bg-[#f3f6f8]"
                    onClick={(e) => {
                      e.stopPropagation();
                      void toggleRepost(p);
                      setRepostMenuPostId(null);
                    }}
                  >
                    {p.reposted ? 'Undo repost' : 'Repost'}
                  </button>
                  <button
                    type="button"
                    className="block w-full px-4 py-2.5 text-left text-sm text-[#191919] hover:bg-[#f3f6f8]"
                    onClick={(e) => {
                      e.stopPropagation();
                      setRepostThoughtsPost(p);
                      setRepostThoughtsDraft('');
                      setRepostMenuPostId(null);
                    }}
                  >
                    Repost with your thoughts
                  </button>
                </div>
              ) : null}
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                openSendModal(p);
              }}
              className={`flex min-h-[48px] flex-1 flex-col items-center justify-center gap-0.5 rounded-lg py-1.5 transition-colors hover:bg-[#f3f2ef] sm:flex-row sm:gap-1.5 ${
                p.sent ? 'text-[#0a66c2]' : ''
              }`}
            >
              <SendIcon className={`h-5 w-5 shrink-0 ${p.sent ? 'text-[#0a66c2]' : ''}`} />
              <span>Send</span>
            </button>
          </div>
          {commentOpenId === p.post_id ? (
            <div className="mt-3 rounded-xl border border-[#e0dfdc] bg-[#f9fafb] p-3">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2 border-b border-[#e0dfdc] pb-2">
                <span className="text-xs font-semibold text-[#666666]">Comments</span>
                <select
                  value={commentSort}
                  onChange={(e) => setCommentSort(e.target.value as 'recent' | 'relevant')}
                  className="rounded-full border border-[#d0d7de] bg-white px-2 py-1 text-xs font-semibold text-[#191919]"
                  aria-label="Sort comments"
                >
                  <option value="relevant">Most relevant</option>
                  <option value="recent">Most recent</option>
                </select>
              </div>
              <div className="max-h-40 space-y-2 overflow-y-auto text-xs text-[#191919]">
                {(() => {
                  const raw = commentByPost[p.post_id] || [];
                  const sorted = [...raw].sort((a, b) => {
                    if (commentSort === 'recent') {
                      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
                    }
                    const len = (b.body?.length || 0) - (a.body?.length || 0);
                    if (len !== 0) return len;
                    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
                  });
                  return sorted.map((c) => (
                    <p key={c.comment_id}>
                      <span className="font-semibold">{c.author_name || c.member_id}</span>: {c.body}
                    </p>
                  ));
                })()}
              </div>
              <div className="mt-2 flex gap-2">
                <input
                  value={commentDraft}
                  onChange={(e) => setCommentDraft(e.target.value)}
                  placeholder="Add a comment…"
                  className="flex-1 rounded-full border border-slate-300 px-3 py-1.5 text-sm"
                />
                <button
                  type="button"
                  className="rounded-full bg-[#0a66c2] px-3 py-1.5 text-sm font-semibold text-white hover:bg-[#004182]"
                  onClick={() => submitComment(p.post_id)}
                >
                  Reply
                </button>
              </div>
            </div>
          ) : null}
        </article>
      ))}

      {sendModalPost && typeof document !== 'undefined'
        ? createPortal(
            <div
              className="fixed inset-0 z-[200] flex items-start justify-center bg-black/50 p-4 pt-12 md:pt-20"
              role="dialog"
              aria-modal="true"
              aria-labelledby="send-post-dialog-title"
              onClick={(e) => {
                if (e.target === e.currentTarget) setSendModalPost(null);
              }}
            >
              <div className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-lg bg-white shadow-xl">
                <div className="flex items-center justify-between border-b border-[#e0dfdc] px-4 py-3">
                  <h2 id="send-post-dialog-title" className="pr-6 text-lg font-semibold text-[#191919]">
                    Send {sendModalPost.author_name ? `${sendModalPost.author_name}'s post` : 'post'}
                  </h2>
                  <button
                    type="button"
                    aria-label="Close"
                    className="rounded-full p-1 text-[#666666] hover:bg-[#f3f2ef]"
                    onClick={() => setSendModalPost(null)}
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
                <div className="border-b border-[#e0dfdc] px-4 py-2">
                  <div className="flex items-center gap-2 rounded-md border border-[#d0d7de] px-2">
                    <Search className="h-4 w-4 shrink-0 text-[#666666]" />
                    <input
                      value={sendSearch}
                      onChange={(e) => setSendSearch(e.target.value)}
                      placeholder="Search"
                      className="min-w-0 flex-1 border-0 py-2 text-sm outline-none"
                    />
                  </div>
                </div>
                <div className="min-h-[200px] flex-1 overflow-y-auto px-2 py-2">
                  {sendContacts.length === 0 ? (
                    <div className="px-2 py-6 text-center text-sm text-[#666666]">
                      <p>No connections or matches yet.</p>
                      <p className="mt-2 text-xs">
                        Seed 3 demo connections: run{' '}
                        <code className="rounded bg-slate-100 px-1">npm run seed:connections</code> from the repo root,
                        then refresh. Or use Search to find members.
                      </p>
                    </div>
                  ) : (
                    sendContacts.map((m) => (
                      <label
                        key={m.member_id}
                        className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 hover:bg-[#f3f6f8]"
                      >
                        <img
                          src={resolveAvatarUrl(undefined, m.name || m.member_id)}
                          alt=""
                          className="h-10 w-10 shrink-0 rounded-full"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-[#191919]">{m.name || m.member_id}</p>
                          <p className="truncate text-xs text-[#666666]">{m.title || m.headline || ''}</p>
                        </div>
                        <input
                          type="checkbox"
                          checked={!!sendSelected[m.member_id]}
                          onChange={(e) =>
                            setSendSelected((prev) => ({ ...prev, [m.member_id]: e.target.checked }))
                          }
                          className="h-4 w-4 accent-[#0a66c2]"
                        />
                      </label>
                    ))
                  )}
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#e0dfdc] px-4 py-3">
                  <button
                    type="button"
                    className="flex items-center gap-1 text-sm font-semibold text-[#666666] hover:text-[#0a66c2]"
                    onClick={() => {
                      const url = `${window.location.origin}/feed#${sendModalPost.post_id}`;
                      void navigator.clipboard.writeText(url).then(
                        () => showToast('Link copied.', 'success'),
                        () => showToast('Copy failed.', 'error')
                      );
                    }}
                  >
                    <Link2 className="h-4 w-4" /> Copy link to post
                  </button>
                  <button
                    type="button"
                    disabled={sendBusy}
                    className="rounded-full bg-[#0a66c2] px-5 py-2 text-sm font-semibold text-white hover:bg-[#004182] disabled:opacity-50"
                    onClick={() => void completeSendModal()}
                  >
                    {sendBusy ? 'Sending…' : 'Send'}
                  </button>
                </div>
              </div>
            </div>,
            document.body
          )
        : null}

      {repostThoughtsPost && typeof document !== 'undefined'
        ? createPortal(
            <div
              className="fixed inset-0 z-[200] flex items-start justify-center bg-black/50 p-4 pt-20"
              role="dialog"
              aria-modal="true"
              onClick={(e) => {
                if (e.target === e.currentTarget) setRepostThoughtsPost(null);
              }}
            >
              <div className="w-full max-w-lg rounded-lg bg-white shadow-xl">
                <div className="flex items-center justify-between border-b border-[#e0dfdc] px-4 py-3">
                  <h2 className="text-lg font-semibold text-[#191919]">Repost with your thoughts</h2>
                  <button
                    type="button"
                    className="rounded-full p-1 text-[#666666] hover:bg-[#f3f2ef]"
                    onClick={() => setRepostThoughtsPost(null)}
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
                <div className="border-b border-[#e0dfdc] bg-[#f9fafb] p-3 text-xs text-[#666666]">
                  <p className="font-semibold text-[#191919]">{repostThoughtsPost.author_name}</p>
                  <p className="mt-1 line-clamp-4 text-[#191919]">{repostThoughtsPost.body}</p>
                  {repostThoughtsPost.image_data ? (
                    <div className="mt-2 max-h-40 overflow-hidden rounded-md border border-slate-200">
                      <img
                        src={repostThoughtsPost.image_data}
                        alt=""
                        className="max-h-40 w-full object-cover"
                      />
                    </div>
                  ) : null}
                </div>
                <div className="p-4">
                  <textarea
                    value={repostThoughtsDraft}
                    onChange={(e) => setRepostThoughtsDraft(e.target.value)}
                    placeholder="What do you want to talk about?"
                    className="min-h-[120px] w-full resize-none rounded-md border border-[#d0d7de] p-3 text-sm"
                  />
                </div>
                <div className="flex justify-end gap-2 border-t border-[#e0dfdc] px-4 py-3">
                  <button
                    type="button"
                    className="rounded-full px-4 py-2 text-sm font-semibold text-[#666666] hover:bg-[#f3f2ef]"
                    onClick={() => setRepostThoughtsPost(null)}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="rounded-full bg-[#0a66c2] px-5 py-2 text-sm font-semibold text-white hover:bg-[#004182]"
                    onClick={() => void publishThoughtRepost()}
                  >
                    Post
                  </button>
                </div>
              </div>
            </div>,
            document.body
          )
        : null}

      {composerOpen ? (
        <div className="fixed inset-0 z-[90] flex items-start justify-center bg-black/45 p-4 pt-14">
          <div className="w-full max-w-[760px] rounded-lg bg-white shadow-xl">
            <div className="flex items-start justify-between border-b border-slate-200 px-5 py-4">
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 overflow-hidden rounded-full border border-slate-200">
                  <img src={resolveViewerAvatarUrl(undefined, memberDisplayName)} alt="Me" className="h-full w-full object-cover" />
                </div>
                <div>
                  <p className="text-base font-semibold text-[#191919]">{memberDisplayName}</p>
                  <p className="text-xs text-slate-600">Post to {audience}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setComposerOpen(false)}
                className="rounded-full p-1 text-slate-500 hover:bg-slate-100"
                aria-label="Close post composer"
              >
                ✕
              </button>
            </div>
            <div className="px-5 py-4">
              <textarea
                value={draftPost}
                onChange={(e) => setDraftPost(e.target.value)}
                placeholder="What do you want to talk about?"
                className="min-h-[280px] w-full resize-none border-0 text-lg text-[#191919] placeholder:text-slate-500 focus:outline-none"
              />
              {attachedImage ? (
                <div className="mb-2 overflow-hidden rounded-md border border-slate-200">
                  <img src={attachedImage} alt="Attachment preview" className="max-h-[220px] w-full object-cover" />
                </div>
              ) : null}
              <div className="mt-3 flex items-center justify-between border-t border-slate-200 pt-3">
                <div className="flex items-center gap-3 text-sm text-slate-500">
                  <button
                    type="button"
                    title="React with emoji"
                    className="rounded-full px-2 py-1 hover:bg-slate-100"
                    onClick={() => setDraftPost((prev) => `${prev}${prev ? ' ' : ''}🙂`)}
                  >
                    🙂
                  </button>
                  <button
                    type="button"
                    title="Rewrite with AI"
                    className="rounded-full border border-[#d0d7de] px-3 py-1 font-semibold text-[#444] hover:bg-slate-100"
                    onClick={() => {
                      if (!draftPost.trim()) {
                        showToast('Write something first for AI rewrite.', 'info');
                        return;
                      }
                      setDraftPost((prev) => `Polished update: ${prev.trim()}`);
                      showToast('AI rewrite applied (demo).', 'success');
                    }}
                  >
                    ✨ Rewrite with AI
                  </button>
                  <button
                    type="button"
                    title="Add image"
                    className="rounded-full px-2 py-1 hover:bg-slate-100"
                    onClick={() => imageInputRef.current?.click()}
                  >
                    🖼️
                  </button>
                  <button
                    type="button"
                    title="Schedule post date/time"
                    className="rounded-full px-2 py-1 hover:bg-slate-100"
                    onClick={() => {
                      const next = window.prompt('Schedule (example: 2026-04-20 09:30)', scheduledAt || '');
                      if (next !== null) setScheduledAt(next.trim());
                    }}
                  >
                    📅
                  </button>
                  <button
                    type="button"
                    title="Post audience settings"
                    className="rounded-full px-2 py-1 hover:bg-slate-100"
                    onClick={() => {
                      const next = window.prompt('Audience: Anyone or Connections', audience);
                      if (!next) return;
                      const normalized = next.toLowerCase().trim();
                      if (normalized === 'anyone') setAudience('Anyone');
                      else if (normalized === 'connections') setAudience('Connections');
                      else showToast('Use "Anyone" or "Connections".', 'error');
                    }}
                  >
                    ⚙️
                  </button>
                  <button
                    type="button"
                    title="Insert hashtag"
                    className="rounded-full px-2 py-1 hover:bg-slate-100"
                    onClick={() => setDraftPost((prev) => `${prev}${prev ? ' ' : ''}#hiring`)}
                  >
                    ➕
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    title="Posting time"
                    className="rounded-full px-2 py-1 text-slate-500 hover:bg-slate-100"
                    onClick={() => showToast(scheduledAt ? `Scheduled: ${scheduledAt}` : 'Posting now', 'info')}
                  >
                    🕒
                  </button>
                  <button
                    type="button"
                    onClick={publishPost}
                    title={scheduledAt ? `Schedule post (${scheduledAt})` : 'Publish now'}
                    disabled={!draftPost.trim()}
                    className="rounded-full bg-[#0a66c2] px-5 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-300"
                  >
                    Post
                  </button>
                </div>
              </div>
              <input
                ref={imageInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const reader = new FileReader();
                  reader.onload = () => {
                    if (typeof reader.result === 'string') {
                      setAttachedImage(reader.result);
                      showToast('Image attached.', 'success');
                    }
                  };
                  reader.readAsDataURL(file);
                }}
              />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function AppShell({ children }: { children: React.ReactNode }) {
  const [member, setMember] = useState<{ name: string; headline: string; photo: string }>({
    name: 'Sneha Singh',
    headline: 'MS Student | Distributed Systems',
    photo: resolveViewerAvatarUrl(undefined, 'Sneha Singh')
  });
  const [memberDashboard, setMemberDashboard] = useState<any>(null);

  useEffect(() => {
    fetch('/api/members/get', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ member_id: MEMBER_ID })
    })
      .then((res) => res.json())
      .then((data) => {
        if (!data || data.error) return;
        setMember({
          name: data.name || 'Sneha Singh',
          headline: data.headline || data.title || 'MS Student | Distributed Systems',
          photo: resolveViewerAvatarUrl(data.profile_photo_url, data.name)
        });
      })
      .catch(() => undefined);

    fetch('/api/analytics/member/dashboard', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ member_id: MEMBER_ID })
    })
      .then((res) => res.json())
      .then((data) => setMemberDashboard(data))
      .catch(() => setMemberDashboard(null));
  }, []);

  return (
    <>
      <Navbar />
      <div className="mx-auto grid w-full max-w-[1128px] grid-cols-1 gap-6 px-3 py-6 lg:grid-cols-12">
        <aside className="hidden lg:col-span-3 lg:block">
          <div className="sticky top-[72px] space-y-2">
            <div className="li-card overflow-hidden p-0">
              <div className="h-16 bg-gradient-to-r from-[#70b5f9] via-[#90caf9] to-[#c7d2fe]" />
              <div className="px-4 pb-4">
                <Link
                  to={`/profile/${encodeURIComponent(MEMBER_ID)}`}
                  className="-mt-6 mb-2 block h-12 w-12 overflow-hidden rounded-full border-2 border-white bg-slate-300"
                >
                  <img src={member.photo} alt="Profile" className="h-full w-full object-cover" />
                </Link>
                <Link to={`/profile/${encodeURIComponent(MEMBER_ID)}`} className="text-lg font-semibold text-[#191919] hover:text-[#0a66c2] hover:underline">
                  {member.name}
                </Link>
                <p className="mt-1 text-sm leading-5 text-[#666666]">{member.headline}</p>
              </div>
            </div>
            <div className="li-card p-4">
              <div className="space-y-3 text-sm">
                <div className="flex items-center justify-between font-semibold text-[#191919]">
                  <span>Profile viewers</span>
                  <span className="text-[#0a66c2]">{memberDashboard?.profile_views_30d ?? 0}</span>
                </div>
                <div className="flex items-center justify-between font-semibold text-[#191919]">
                  <span>Post impressions</span>
                  <span className="text-[#0a66c2]">{Math.max((memberDashboard?.profile_views_30d ?? 0) * 3, 18)}</span>
                </div>
              </div>
              <Link to="/analytics/member" className="mt-3 block text-base font-semibold text-[#191919] hover:text-[#0a66c2]">
                View all analytics
              </Link>
            </div>
            <div className="li-card p-4">
              <ul className="space-y-2 text-sm font-semibold text-[#191919]">
                <li><Link to="/saved" className="hover:text-[#0a66c2]">Saved items</Link></li>
                <li><Link to="/network/groups" className="hover:text-[#0a66c2]">Groups</Link></li>
                <li><Link to="/network/newsletters" className="hover:text-[#0a66c2]">Newsletters</Link></li>
                <li><Link to="/network/events" className="hover:text-[#0a66c2]">Events</Link></li>
              </ul>
            </div>
          </div>
        </aside>
        <main className="lg:col-span-6">{children}</main>
        <aside className="hidden lg:col-span-3 lg:block">
          <div className="sticky top-[72px] space-y-2">
            <div className="li-card p-4">
              <p className="li-section-title text-sm">Trending in engineering</p>
              <ul className="mt-2 space-y-2 text-sm text-[#666666]">
                <li><span className="font-semibold text-[#191919]">#kafka-streams</span><br />2,314 readers today</li>
                <li><span className="font-semibold text-[#191919]">#microservices</span><br />1,882 readers today</li>
                <li><span className="font-semibold text-[#191919]">#fastapi</span><br />1,219 readers today</li>
              </ul>
            </div>
            <div className="li-card overflow-hidden p-0">
              <div className="h-20 bg-gradient-to-r from-[#dbeafe] via-[#e9d5ff] to-[#fde68a]" />
              <div className="p-4 text-sm">
                <p className="font-semibold text-[#191919]">Try Premium for free</p>
                <p className="mt-1 text-[#666666]">See who viewed your profile in the last 365 days.</p>
                <Link to="/premium" className="mt-2 inline-block rounded-full border border-[#0a66c2] px-3 py-1 text-xs font-semibold text-[#0a66c2] hover:bg-[#edf3f8]">
                  Try now
                </Link>
              </div>
            </div>
            <div className="li-card p-4">
              <p className="li-section-title text-sm">People you may know</p>
              <div className="mt-2 space-y-2 text-sm">
                <div>
                  <Link to={`/profile/${encodeURIComponent('M-DEMO-01')}`} className="font-semibold text-[#191919] hover:text-[#0a66c2] hover:underline">
                    Alex Chen
                  </Link>
                  <p className="text-[#666666]">Senior Engineer at Acme</p>
                </div>
                <div>
                  <Link to={`/profile/${encodeURIComponent('M-DEMO-02')}`} className="font-semibold text-[#191919] hover:text-[#0a66c2] hover:underline">
                    Priya Kapoor
                  </Link>
                  <p className="text-[#666666]">Recruiter at Nova Labs</p>
                </div>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </>
  );
}

function ProfileShell({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const PROFILE_LANGUAGE_KEY = 'li_sim_profile_language';
  const PROFILE_URL_KEY = 'li_sim_profile_url';
  const [language, setLanguage] = useState(localStorage.getItem(PROFILE_LANGUAGE_KEY) || 'English');
  const ownUrlDefault = `linkedin-sim.local/in/${MEMBER_ID.toLowerCase()}`;
  const [publicUrl, setPublicUrl] = useState(localStorage.getItem(PROFILE_URL_KEY) || ownUrlDefault);

  const profilePathPrefix = '/profile/';
  const routeMemberId = location.pathname.startsWith(profilePathPrefix)
    ? decodeURIComponent(location.pathname.slice(profilePathPrefix.length))
    : MEMBER_ID;
  const isOwnProfile = routeMemberId === MEMBER_ID || location.pathname === '/profile';
  const displayedPublicUrl = isOwnProfile
    ? publicUrl
    : `linkedin-sim.local/in/${routeMemberId.toLowerCase()}`;

  const editLanguage = () => {
    const next = window.prompt('Update profile language', language);
    if (!next) return;
    const value = next.trim();
    if (!value) return;
    setLanguage(value);
    localStorage.setItem(PROFILE_LANGUAGE_KEY, value);
  };

  const editPublicUrl = () => {
    const next = window.prompt('Update public profile URL', publicUrl);
    if (!next) return;
    const value = next.trim();
    if (!value) return;
    setPublicUrl(value);
    localStorage.setItem(PROFILE_URL_KEY, value);
  };

  return (
    <>
      <Navbar />
      <div className="mx-auto grid w-full max-w-[1128px] grid-cols-1 gap-6 px-3 py-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <main>{children}</main>
        <aside className="hidden lg:block">
          <div className="sticky top-[66px] space-y-2">
            {isOwnProfile ? (
              <div className="li-card p-4 text-sm">
                <div className="flex items-center justify-between">
                  <p className="font-semibold text-[#191919]">Profile language</p>
                  <button
                    type="button"
                    onClick={editLanguage}
                    className="inline-flex h-7 w-7 items-center justify-center rounded-full text-[#666666] hover:bg-[#f3f2ef]"
                    title="Edit profile language"
                  >
                    <Pencil size={14} />
                  </button>
                </div>
                <p className="mt-1 text-[#666666]">{language}</p>
                <div className="my-3 h-px bg-[#e0dfdc]" />
                <div className="flex items-center justify-between">
                  <p className="font-semibold text-[#191919]">Public profile & URL</p>
                  <button
                    type="button"
                    onClick={editPublicUrl}
                    className="inline-flex h-7 w-7 items-center justify-center rounded-full text-[#666666] hover:bg-[#f3f2ef]"
                    title="Edit public profile URL"
                  >
                    <Pencil size={14} />
                  </button>
                </div>
                <p className="mt-1 text-[#666666] break-all">{displayedPublicUrl}</p>
              </div>
            ) : null}
            <div className="li-card p-4">
              <p className="li-section-title text-sm">People you may know</p>
              <div className="mt-2 space-y-2 text-sm">
                <div>
                  <Link to={`/profile/${encodeURIComponent('M-DEMO-01')}`} className="font-semibold text-[#191919] hover:text-[#0a66c2] hover:underline">
                    Alex Chen
                  </Link>
                  <p className="text-[#666666]">Senior Engineer at Acme</p>
                </div>
                <div>
                  <Link to={`/profile/${encodeURIComponent('M-DEMO-02')}`} className="font-semibold text-[#191919] hover:text-[#0a66c2] hover:underline">
                    Priya Kapoor
                  </Link>
                  <p className="text-[#666666]">Recruiter at Nova Labs</p>
                </div>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </>
  );
}

function JobsTrackerShell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Navbar />
      <div className="mx-auto w-full max-w-[1128px] px-3 py-6">
        {children}
      </div>
    </>
  );
}

function RequireAuth({ children }: { children: React.ReactNode }) {
  if (!isAuthenticated()) {
    return <Navigate to="/login/email" replace />;
  }
  return <>{children}</>;
}

function RedirectIfAuthenticated({ children }: { children: React.ReactNode }) {
  if (isAuthenticated()) {
    return <Navigate to="/feed" replace />;
  }
  return <>{children}</>;
}

function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-[#f3f2ef] text-slate-900">
        <Routes>
          <Route path="/" element={<RedirectIfAuthenticated><LoginLandingPage /></RedirectIfAuthenticated>} />
          <Route path="/login" element={<RedirectIfAuthenticated><LoginLandingPage /></RedirectIfAuthenticated>} />
          <Route path="/login/email" element={<RedirectIfAuthenticated><SignInPage /></RedirectIfAuthenticated>} />
          <Route path="/signup" element={<RedirectIfAuthenticated><JoinPage /></RedirectIfAuthenticated>} />
          <Route path="/feed" element={<RequireAuth><AppShell><FeedPlaceholder /></AppShell></RequireAuth>} />
          <Route path="/jobs" element={<RequireAuth><JobsBoard /></RequireAuth>} />
          <Route path="/jobs/search" element={<RequireAuth><JobsSearchPage /></RequireAuth>} />
          <Route path="/jobs/search-results" element={<RequireAuth><JobsSearchPage /></RequireAuth>} />
          <Route path="/applications" element={<RequireAuth><AppShell><ApplicationsPage /></AppShell></RequireAuth>} />
          <Route path="/profile" element={<RequireAuth><ProfileShell><Profile /></ProfileShell></RequireAuth>} />
          <Route path="/profile/:memberId" element={<RequireAuth><ProfileShell><MemberPublicProfilePage /></ProfileShell></RequireAuth>} />
          <Route path="/analytics/member" element={<RequireAuth><AppShell><MemberAnalyticsPage /></AppShell></RequireAuth>} />
          <Route path="/recruiter" element={<RequireAuth><AppShell><RecruiterDashboard /></AppShell></RequireAuth>} />
          <Route path="/recruiter/admin" element={<RequireAuth><AppShell><RecruiterAdminPage /></AppShell></RequireAuth>} />
          <Route path="/recruiter/ai" element={<RequireAuth><AppShell><AIAssistantPage /></AppShell></RequireAuth>} />
          <Route path="/messaging" element={<RequireAuth><MessagingPage /></RequireAuth>} />
          <Route path="/messaging/compose" element={<RequireAuth><MessagingPage /></RequireAuth>} />
          <Route path="/messaging/filter/focused" element={<RequireAuth><MessagingPage /></RequireAuth>} />
          <Route path="/messaging/filter/jobs" element={<RequireAuth><MessagingPage /></RequireAuth>} />
          <Route path="/messaging/filter/unread" element={<RequireAuth><MessagingPage /></RequireAuth>} />
          <Route path="/messaging/filter/connections" element={<RequireAuth><MessagingPage /></RequireAuth>} />
          <Route path="/messaging/filter/inmail" element={<RequireAuth><MessagingPage /></RequireAuth>} />
          <Route path="/messaging/filter/starred" element={<RequireAuth><MessagingPage /></RequireAuth>} />
          <Route path="/network" element={<RequireAuth><NetworkPage /></RequireAuth>} />
          <Route path="/network/invitations" element={<RequireAuth><NetworkPage /></RequireAuth>} />
          <Route path="/network/suggestions" element={<RequireAuth><NetworkPage /></RequireAuth>} />
          <Route path="/network/connections" element={<RequireAuth><NetworkPage /></RequireAuth>} />
          <Route path="/network/search" element={<RequireAuth><MemberSearchPage /></RequireAuth>} />
          <Route path="/network/following" element={<RequireAuth><AppShell><NetworkCollectionsPage /></AppShell></RequireAuth>} />
          <Route path="/network/groups" element={<RequireAuth><AppShell><NetworkCollectionsPage /></AppShell></RequireAuth>} />
          <Route path="/network/events" element={<RequireAuth><AppShell><NetworkCollectionsPage /></AppShell></RequireAuth>} />
          <Route path="/network/pages" element={<RequireAuth><AppShell><NetworkCollectionsPage /></AppShell></RequireAuth>} />
          <Route path="/network/newsletters" element={<RequireAuth><AppShell><NetworkCollectionsPage /></AppShell></RequireAuth>} />
          <Route path="/notifications" element={<RequireAuth><NotificationsPage /></RequireAuth>} />
          <Route path="/notifications/jobs" element={<RequireAuth><NotificationsPage /></RequireAuth>} />
          <Route path="/notifications/posts" element={<RequireAuth><NotificationsPage /></RequireAuth>} />
          <Route path="/notifications/mentions" element={<RequireAuth><NotificationsPage /></RequireAuth>} />
          <Route path="/business" element={<RequireAuth><AppShell><BusinessPage /></AppShell></RequireAuth>} />
          <Route path="/premium" element={<RequireAuth><AppShell><PremiumPage /></AppShell></RequireAuth>} />
          <Route path="/try-premium" element={<Navigate to="/premium" replace />} />
          <Route path="/premium/free-trial" element={<Navigate to="/premium" replace />} />
          <Route path="/premium/trial" element={<Navigate to="/premium" replace />} />
          <Route path="/settings" element={<RequireAuth><AppShell><SettingsPage /></AppShell></RequireAuth>} />
          <Route path="/help" element={<RequireAuth><AppShell><HelpCenterPage /></AppShell></RequireAuth>} />
          <Route path="/language" element={<RequireAuth><AppShell><LanguagePage /></AppShell></RequireAuth>} />
          <Route path="/profile/activity" element={<RequireAuth><AppShell><ActivityPage /></AppShell></RequireAuth>} />
          <Route path="/saved" element={<RequireAuth><AppShell><SavedItemsPage /></AppShell></RequireAuth>} />
          <Route path="/signout" element={<SignOutPage />} />
          <Route path="/jobs/preferences" element={<RequireAuth><AppShell><JobPreferencesPage /></AppShell></RequireAuth>} />
          <Route path="/jobs/tracker" element={<RequireAuth><JobsTrackerShell><JobTrackerPage /></JobsTrackerShell></RequireAuth>} />
          <Route path="/jobs/insights" element={<RequireAuth><AppShell><JobInsightsPage /></AppShell></RequireAuth>} />
          <Route path="/jobs/post" element={<RequireAuth><AppShell><JobPostPage /></AppShell></RequireAuth>} />
          <Route path="/jobs/apply" element={<RequireAuth><AppShell><JobApplyPage /></AppShell></RequireAuth>} />
          <Route
            path="/company/acme"
            element={<Navigate to={`/company/${encodeURIComponent('Acme Company')}`} replace />}
          />
          <Route path="/company/:companySlug" element={<RequireAuth><AppShell><CompanyPage /></AppShell></RequireAuth>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        <ToastViewport />
      </div>
    </BrowserRouter>
  );
}

export default App;
