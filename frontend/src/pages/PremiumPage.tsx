import { useEffect, useState } from 'react';
import { Crown, Lock } from 'lucide-react';
import { getCurrentMemberId } from '../lib/auth';
import { MEMBER_ID } from '../lib/memberProfile';
import { showToast } from '../lib/toast';

const viewerMemberId = getCurrentMemberId() || MEMBER_ID;

const plans = [
  { name: 'Career', price: '$29.99/mo', perks: ['Who viewed your profile', 'Priority job alerts', 'Tracker recommendations'] },
  { name: 'Business', price: '$59.99/mo', perks: ['Lead recommendations', 'Advanced search', 'Business analytics'] }
];

export default function PremiumPage() {
  const [selected, setSelected] = useState('Career');
  const [status, setStatus] = useState<{ is_active: boolean; plan_name?: string | null; expires_at?: string | null }>({ is_active: false });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch('/api/members/premium/status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ member_id: viewerMemberId })
    })
      .then((res) => res.json())
      .then((data) => setStatus({ is_active: Boolean(data?.is_active), plan_name: data?.plan_name || null, expires_at: data?.expires_at || null }))
      .catch(() => setStatus({ is_active: false }));
  }, []);

  const activate = async () => {
    setBusy(true);
    try {
      const res = await fetch('/api/members/premium/activate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ member_id: viewerMemberId, plan_name: selected })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast('Unable to activate Premium right now.', 'error');
        return;
      }
      setStatus({ is_active: Boolean(data?.is_active), plan_name: data?.plan_name || selected, expires_at: data?.expires_at || null });
      showToast(`${selected} Premium activated.`, 'success');
    } catch {
      showToast('Unable to activate Premium right now.', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <section className="li-card overflow-hidden p-0">
        <div className="bg-gradient-to-r from-[#0a66c2] to-[#1d9bf0] px-5 py-6 text-white">
          <div className="flex items-start gap-3">
            <div className="rounded-2xl bg-white/15 p-3">
              <Crown className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold">Premium membership</h1>
              <p className="mt-1 text-sm text-white/85">Unlock priority insights, better job tracking guidance, and advanced network features.</p>
            </div>
          </div>
        </div>
        <div className="grid gap-3 px-5 py-4 md:grid-cols-3">
          <div className="rounded-xl bg-[#f3f6f8] p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#526a6e]">Status</p>
            <p className="mt-2 text-2xl font-semibold text-[#191919]">{status.is_active ? 'Active' : 'Inactive'}</p>
          </div>
          <div className="rounded-xl bg-[#f3f6f8] p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#526a6e]">Current plan</p>
            <p className="mt-2 text-2xl font-semibold text-[#191919]">{status.plan_name || 'None'}</p>
          </div>
          <div className="rounded-xl bg-[#f3f6f8] p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#526a6e]">Premium-only feature</p>
            <p className="mt-2 text-sm font-semibold text-[#191919]">Tracker recommendations</p>
            <p className="mt-1 text-sm text-[#666]">{status.is_active ? 'Unlocked in Job Tracker.' : 'Upgrade to unlock.'}</p>
          </div>
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-2">
        {plans.map((plan) => (
          <article
            key={plan.name}
            className={`li-card cursor-pointer p-4 ${selected === plan.name ? 'ring-2 ring-[#0a66c2]' : ''}`}
            onClick={() => setSelected(plan.name)}
          >
            <h2 className="text-lg font-semibold text-slate-900">{plan.name}</h2>
            <p className="mt-1 text-sm font-semibold text-[#0a66c2]">{plan.price}</p>
            <ul className="mt-2 space-y-1 text-sm text-slate-600">
              {plan.perks.map((perk) => (
                <li key={perk}>• {perk}</li>
              ))}
            </ul>
          </article>
        ))}
      </section>

      <section className="li-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-base font-semibold text-[#191919]">Premium-gated areas now supported</p>
            <div className="mt-2 flex flex-wrap gap-2 text-xs">
              <span className="rounded-full bg-[#eef3f8] px-3 py-1 font-semibold text-[#0a66c2]">Job Tracker recommendations</span>
              <span className="rounded-full bg-[#eef3f8] px-3 py-1 font-semibold text-[#0a66c2]">Priority job alerts</span>
              <span className="rounded-full bg-[#eef3f8] px-3 py-1 font-semibold text-[#0a66c2]">Advanced network follow tools</span>
            </div>
          </div>
          {status.is_active ? (
            <div className="rounded-full border border-[#057642] px-4 py-2 text-sm font-semibold text-[#057642]">
              {status.plan_name || 'Premium'} is active
            </div>
          ) : (
            <button
              className="rounded-full bg-[#0a66c2] px-5 py-2 text-sm font-semibold text-white hover:bg-[#004182] disabled:cursor-not-allowed disabled:bg-[#9ec6e5]"
              onClick={() => activate().catch(() => showToast('Unable to activate Premium right now.', 'error'))}
              disabled={busy}
            >
              {busy ? 'Activating...' : 'Start free trial'}
            </button>
          )}
        </div>
      </section>

      {!status.is_active ? (
        <section className="li-card p-5">
          <div className="flex items-center gap-2 text-sm font-semibold text-[#191919]">
            <Lock size={15} />
            Locked until Premium is active
          </div>
          <p className="mt-2 text-sm text-[#666]">Premium-only widgets stay hidden or read-only across the tracker and network flows until you activate a plan.</p>
        </section>
      ) : null}
    </div>
  );
}
