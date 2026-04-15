import { useState } from 'react';
import { showToast } from '../lib/toast';

const plans = [
  { name: 'Career', price: '$29.99/mo', perks: ['Who viewed your profile', 'InMail credits', 'Premium insights'] },
  { name: 'Business', price: '$59.99/mo', perks: ['Lead recommendations', 'Advanced search', 'Business analytics'] }
];

export default function PremiumPage() {
  const [selected, setSelected] = useState('Career');

  return (
    <div className="space-y-3">
      <section className="li-card p-5">
        <h1 className="text-xl font-semibold text-[#191919]">Try Premium for $0</h1>
        <p className="mt-1 text-sm text-[#666]">Choose a plan and activate your free trial.</p>
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
        <button
          className="rounded-full bg-[#0a66c2] px-5 py-2 text-sm font-semibold text-white hover:bg-[#004182]"
          onClick={() => showToast(`Premium ${selected} trial activated (demo).`, 'success')}
        >
          Start free trial
        </button>
      </section>
    </div>
  );
}

