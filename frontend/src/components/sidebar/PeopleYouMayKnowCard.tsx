import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { UserPlus } from 'lucide-react';
import { resolveAvatarUrl } from '../../lib/memberProfile';
import { showToast } from '../../lib/toast';

type Suggestion = {
  member_id: string;
  name: string;
  headline: string;
  location: string;
  profile_photo_url?: string | null;
  mutual_connections: number;
};

type RowState = 'idle' | 'pending' | 'error';

export default function PeopleYouMayKnowCard() {
  const viewerId = sessionStorage.getItem('li_sim_member_id') || 'M-123';
  const [rows, setRows] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [rowState, setRowState] = useState<Record<string, RowState>>({});

  const load = useCallback(() => {
    setLoading(true);
    fetch('/api/members/peopleYouMayKnow', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ member_id: viewerId, limit: 6 })
    })
      .then((r) => r.json())
      .then((data) => {
        setRows(Array.isArray(data) ? data : []);
      })
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, [viewerId]);

  useEffect(() => {
    load();
  }, [load]);

  const connect = async (receiverId: string, name: string) => {
    setRowState((s) => ({ ...s, [receiverId]: 'idle' }));
    try {
      const res = await fetch('/api/connections/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requester_id: viewerId, receiver_id: receiverId })
      });
      if (res.status === 201) {
        setRowState((s) => ({ ...s, [receiverId]: 'pending' }));
        showToast(`Invitation sent to ${name}.`, 'success');
        return;
      }
      if (res.status === 409) {
        setRowState((s) => ({ ...s, [receiverId]: 'pending' }));
        showToast('Request already pending.', 'info');
        return;
      }
      setRowState((s) => ({ ...s, [receiverId]: 'error' }));
      showToast('Could not send invitation.', 'error');
    } catch {
      setRowState((s) => ({ ...s, [receiverId]: 'error' }));
      showToast('Could not send invitation.', 'error');
    }
  };

  return (
    <div className="li-card p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="li-section-title text-sm">People you may know</p>
        <Link to="/network/suggestions" className="shrink-0 text-xs font-semibold text-[#0a66c2] hover:underline">
          Show all
        </Link>
      </div>

      {loading ? (
        <p className="mt-3 text-sm text-[#666666]">Loading suggestions…</p>
      ) : rows.length === 0 ? (
        <p className="mt-3 text-sm text-[#666666]">
          No suggestions yet. Try{' '}
          <Link to="/network/search" className="font-semibold text-[#0a66c2] hover:underline">
            Search people
          </Link>{' '}
          to grow your network.
        </p>
      ) : (
        <ul className="mt-3 space-y-3">
          {rows.map((row) => {
            const st = rowState[row.member_id];
            const avatar = resolveAvatarUrl(row.profile_photo_url, row.name);
            const headline = row.headline || 'LinkedIn member';
            const mutual = Number(row.mutual_connections || 0);
            return (
              <li key={row.member_id} className="flex gap-2">
                <Link
                  to={`/profile/${encodeURIComponent(row.member_id)}`}
                  className="h-12 w-12 shrink-0 overflow-hidden rounded-full border border-[#e0dfdc] bg-[#f3f2ef]"
                >
                  <img src={avatar} alt="" className="h-full w-full object-cover" />
                </Link>
                <div className="min-w-0 flex-1">
                  <Link
                    to={`/profile/${encodeURIComponent(row.member_id)}`}
                    className="block truncate text-sm font-semibold text-[#191919] hover:text-[#0a66c2] hover:underline"
                  >
                    {row.name}
                  </Link>
                  <p className="line-clamp-2 text-xs leading-snug text-[#666666]">{headline}</p>
                  {row.location ? (
                    <p className="mt-0.5 truncate text-[11px] text-[#999999]">{row.location}</p>
                  ) : null}
                  <p className="mt-0.5 text-[11px] text-[#666666]">
                    {mutual > 0
                      ? `${mutual} mutual connection${mutual === 1 ? '' : 's'}`
                      : 'Based on your network & activity'}
                  </p>
                  {st === 'pending' ? (
                    <p className="mt-2 text-xs font-semibold text-[#666666]">Pending</p>
                  ) : (
                    <button
                      type="button"
                      onClick={() => connect(row.member_id, row.name)}
                      className="mt-2 inline-flex w-full items-center justify-center gap-1.5 rounded-full border border-[#0a66c2] px-3 py-1.5 text-xs font-semibold text-[#0a66c2] hover:bg-[#edf3f8]"
                    >
                      <UserPlus size={14} aria-hidden />
                      Connect
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
