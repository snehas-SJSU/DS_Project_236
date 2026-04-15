import { Link } from 'react-router-dom';
import { ACTIVITY_KEY, readJson } from '../lib/localData';

type Activity = {
  id: string;
  text: string;
  time: string;
};

export default function ActivityPage() {
  const items = readJson<Activity[]>(ACTIVITY_KEY, []);

  return (
    <div className="li-card p-5">
      <h1 className="text-xl font-semibold text-[#191919]">Posts & Activity</h1>
      <p className="mt-1 text-sm text-[#666]">Recent actions captured from your demo usage.</p>

      {items.length === 0 ? (
        <p className="mt-4 text-sm text-slate-500">
          No recent activity yet. Try applying/saving jobs from <Link to="/jobs" className="text-[#0a66c2] hover:underline">Jobs</Link> or sending a message.
        </p>
      ) : (
        <ul className="mt-4 space-y-2">
          {items.map((item) => (
            <li key={item.id} className="rounded-lg border border-slate-200 p-3">
              <p className="text-sm text-slate-800">{item.text}</p>
              <p className="mt-1 text-xs text-slate-500">{item.time}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

