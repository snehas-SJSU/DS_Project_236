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
  const [audience, setAudience] = useState<Audience>('Anyone');
  const [audienceModalOpen, setAudienceModalOpen] = useState(false);
  const imageInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (open) {
      setDraftPost('');
      setAttachedImage(undefined);
      setAudience('Anyone');
      setAudienceModalOpen(false);
    }
  }, [open]);

  const publishPost = async () => {
    const text = draftPost.trim();
    if (!text) return;
    try {
      const res = await fetch('/api/posts/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          member_id: memberId,
          author_name: authorName || memberId,
          body: text,
          image_data: attachedImage || undefined,
          visibility: audience === 'Anyone' ? 'anyone' : 'connections'
        })
      });
      if (!res.ok) {
        showToast('Could not publish post.', 'error');
        return;
      }
      showToast('Post published.', 'success');
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
              <button
                type="button"
                onClick={() => setAudienceModalOpen(true)}
                className="text-left text-xs text-[#0a66c2] hover:underline"
              >
                Post to {audience === 'Anyone' ? 'anyone' : 'connections only'} · Change
              </button>
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
                title="Add image"
                className="rounded-full px-2 py-1 hover:bg-slate-100"
                onClick={() => imageInputRef.current?.click()}
              >
                🖼️
              </button>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={() => void publishPost()}
                title="Publish now"
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
      {audienceModalOpen ? (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="audience-dialog-title"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setAudienceModalOpen(false);
          }}
        >
          <div className="w-full max-w-md rounded-lg bg-white p-5 shadow-xl" onMouseDown={(e) => e.stopPropagation()}>
            <h2 id="audience-dialog-title" className="text-lg font-semibold text-[#191919]">
              Who can see your post?
            </h2>
            <p className="mt-1 text-sm text-slate-600">Choose where this post may appear in the feed.</p>
            <div className="mt-4 space-y-2">
              <button
                type="button"
                onClick={() => {
                  setAudience('Anyone');
                  setAudienceModalOpen(false);
                }}
                className={`w-full rounded-lg border px-4 py-3 text-left transition ${
                  audience === 'Anyone' ? 'border-[#0a66c2] bg-[#eef6fc]' : 'border-slate-200 hover:bg-slate-50'
                }`}
              >
                <span className="font-semibold text-[#191919]">Anyone</span>
                <span className="mt-0.5 block text-sm text-slate-600">Anyone on the platform can see this post after it is published.</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setAudience('Connections');
                  setAudienceModalOpen(false);
                }}
                className={`w-full rounded-lg border px-4 py-3 text-left transition ${
                  audience === 'Connections' ? 'border-[#0a66c2] bg-[#eef6fc]' : 'border-slate-200 hover:bg-slate-50'
                }`}
              >
                <span className="font-semibold text-[#191919]">Connections only</span>
                <span className="mt-0.5 block text-sm text-slate-600">
                  Only people you are connected with can see this post after it is published.
                </span>
              </button>
            </div>
            <button
              type="button"
              onClick={() => setAudienceModalOpen(false)}
              className="mt-4 w-full rounded-full border border-slate-300 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
