import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { getCurrentMemberId } from '../lib/auth';
import { MEMBER_ID } from '../lib/memberProfile';
import { showToast } from '../lib/toast';

const viewerMemberId = getCurrentMemberId() || MEMBER_ID;

type CollectionItem = {
  entity_id: string;
  entity_type: string;
  title: string;
  subtitle: string;
  description: string;
  route_path: string;
  badge: string;
  members_count: number;
  is_active: boolean;
  action_label: string;
};

export default function NetworkCollectionsPage() {
  const location = useLocation();
  const slug = useMemo(() => location.pathname.split('/').pop() || 'following', [location.pathname]);
  const [items, setItems] = useState<CollectionItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/members/network/catalog', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ member_id: viewerMemberId, type: slug })
      });
      const data = await res.json().catch(() => []);
      setItems(Array.isArray(data) ? data : []);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load().catch(() => undefined);
  }, [slug]);

  const toggleItem = async (item: CollectionItem) => {
    try {
      const nextActive = !item.is_active;
      const res = await fetch('/api/members/network/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ member_id: viewerMemberId, entity_id: item.entity_id, is_active: nextActive })
      });
      if (!res.ok) {
        showToast('Unable to update this item right now.', 'error');
        return;
      }
      setItems((prev) =>
        prev.map((row) =>
          row.entity_id === item.entity_id
            ? {
                ...row,
                is_active: nextActive,
                action_label:
                  row.entity_type === 'groups' || row.entity_type === 'events'
                    ? nextActive ? 'Leave' : 'Join'
                    : nextActive ? 'Following' : 'Follow',
                members_count: Math.max((row.members_count || 0) + (nextActive ? 1 : -1), 0)
              }
            : row
        )
      );
      showToast(nextActive ? `${item.title} added to your network.` : `${item.title} removed from your network.`, 'success');
    } catch {
      showToast('Unable to update this item right now.', 'error');
    }
  };

  return (
    <div className="space-y-3">
      <section className="li-card p-5">
        <h1 className="text-xl font-semibold text-[#191919] capitalize">{slug.replace(/^\w/, (c) => c.toUpperCase())}</h1>
        <p className="mt-1 text-sm text-[#666]">Server-backed and synced with your account instead of placeholder-only lists.</p>
      </section>
      <section className="li-card p-5">
        {loading ? (
          <p className="text-sm text-[#666]">Loading your network collection...</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-[#666]">No items available right now.</p>
        ) : (
          <div className="space-y-2">
            {items.map((item) => (
              <div key={item.entity_id} className="flex items-center justify-between rounded-lg border border-slate-200 p-3">
                <div className="min-w-0">
                  <Link to={item.route_path} className="font-semibold text-slate-900 hover:text-[#0a66c2] hover:underline">
                    {item.title}
                  </Link>
                  <p className="text-sm text-slate-600">{item.subtitle}</p>
                  <p className="mt-1 text-sm text-slate-500">{item.description}</p>
                  <div className="mt-2 flex flex-wrap gap-2 text-xs">
                    {item.badge ? <span className="rounded-full bg-[#eef3f8] px-2 py-1 font-semibold text-[#0a66c2]">{item.badge}</span> : null}
                    <span className="rounded-full bg-[#f3f2ef] px-2 py-1 text-[#555]">{item.members_count} members</span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => toggleItem(item).catch(() => undefined)}
                  className={`rounded-full border px-3 py-1 text-sm font-semibold ${
                    item.is_active
                      ? 'border-[#0a66c2] bg-[#edf3f8] text-[#0a66c2]'
                      : 'border-[#0a66c2] text-[#0a66c2] hover:bg-[#edf3f8]'
                  }`}
                >
                  {item.action_label}
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
