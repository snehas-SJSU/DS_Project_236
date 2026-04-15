type StaticPageProps = {
  title: string;
  description: string;
  items?: string[];
  ctaLabel?: string;
};

export default function StaticPage({ title, description, items = [], ctaLabel = 'Update preferences' }: StaticPageProps) {
  return (
    <div className="space-y-3">
      <div className="li-card p-6">
        <h1 className="text-xl font-semibold text-[#191919]">{title}</h1>
        <p className="mt-2 text-sm text-[#666666]">{description}</p>
        <button className="mt-4 rounded-full border border-[#0a66c2] px-4 py-1.5 text-sm font-semibold text-[#0a66c2] hover:bg-[#eef3f8]">
          {ctaLabel}
        </button>
      </div>
      <div className="li-card p-6">
        <h2 className="text-sm font-semibold text-[#191919]">Recent items</h2>
        <ul className="mt-2 space-y-2 text-sm text-[#666666]">
          {(items.length ? items : ['No recent activity yet.']).map((item) => (
            <li key={item} className="rounded-md border border-[#e0dfdc] p-2">{item}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}
