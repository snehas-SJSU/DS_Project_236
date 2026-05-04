import { useEffect, useRef, useState } from 'react';
import { resolveViewerAvatarUrl } from '../../lib/memberProfile';
import { showToast } from '../../lib/toast';

type Audience = 'Anyone' | 'Connections';

type Props = {
  open: boolean;
  onClose: () => void;
  memberId: string;
  authorName: string;
  /** Called after a successful publish (e.g. refresh feed or activity). */
  onPosted?: () => void | Promise<void>;
};

export default function PostComposerModal({ open, onClose, memberId, authorName, onPosted }: Props) {
  const [draftPost, setDraftPost] = useState('');
  const [attachedImage, setAttachedImage] = useState<string | undefined>(undefined);
  const [scheduledAt, setScheduledAt] = useState('');
  const [audience, setAudience] = useState<Audience>('Anyone');
  const imageInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (open) {
      setDraftPost('');
      setAttachedImage(undefined);
      setScheduledAt('');
      setAudience('Anyone');
    }
  }, [open]);

  const publishPost = async () => {
    const text = draftPost.trim();
    if (!text) return;
    const bodyText = scheduledAt ? `[Scheduled: ${scheduledAt}] ${text}` : text;
    try {
      const res = await fetch('/api/posts/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          member_id: memberId,
          author_name: authorName || memberId,
          body: bodyText,
          image_data: attachedImage || undefined
        })
      });
      if (!res.ok) {
        showToast('Could not publish post.', 'error');
        return;
      }
      showToast(scheduledAt ? `Post scheduled for ${scheduledAt}.` : 'Post published.', 'success');
      onClose();
      await onPosted?.();
    } catch {
      showToast('Could not publish post.', 'error');
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[90] flex items-start justify-center bg-black/45 p-4 pt-14">
      <div className="w-full max-w-[760px] rounded-lg bg-white shadow-xl">
        <div className="flex items-start justify-between border-b border-slate-200 px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 overflow-hidden rounded-full border border-slate-200">
              <img src={resolveViewerAvatarUrl(undefined, authorName)} alt="Me" className="h-full w-full object-cover" />
            </div>
            <div>
              <p className="text-base font-semibold text-[#191919]">{authorName || 'You'}</p>
              <p className="text-xs text-slate-600">Post to {audience}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onClose()}
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
            <div className="flex flex-wrap items-center gap-3 text-sm text-slate-500">
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
            <div className="flex shrink-0 items-center gap-2">
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
                onClick={() => void publishPost()}
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
  );
}
