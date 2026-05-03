import { useEffect, useState } from 'react';

function initials(name: string) {
  const w = name.trim().split(/\s+/).filter(Boolean);
  if (!w.length) return '?';
  if (w.length === 1) return w[0].slice(0, 2).toUpperCase();
  return (w[0][0] + w[w.length - 1][0]).toUpperCase();
}

type CompanyLogoTileProps = {
  logoUrl?: string;
  /** Used for initials fallback and accessibility. */
  companyName: string;
  /** Tailwind size classes, e.g. h-12 w-12 */
  className?: string;
};

export default function CompanyLogoTile({
  logoUrl,
  companyName,
  className = 'h-14 w-14'
}: CompanyLogoTileProps) {
  const [logoFailed, setLogoFailed] = useState(false);
  useEffect(() => {
    setLogoFailed(false);
  }, [logoUrl, companyName]);
  const showImg = Boolean(logoUrl) && !logoFailed;

  return (
    <div
      className={`relative shrink-0 overflow-hidden rounded-md border border-[#e0dfdc] bg-white shadow-sm ${className}`}
    >
      {showImg ? (
        <img
          src={logoUrl}
          alt=""
          className="h-full w-full object-contain p-1"
          loading="lazy"
          onError={() => setLogoFailed(true)}
        />
      ) : (
        <div
          className="flex h-full w-full items-center justify-center bg-gradient-to-br from-[#dce9f7] to-[#c2d9f0] text-sm font-bold text-[#0a66c2]"
          aria-hidden
        >
          {initials(companyName)}
        </div>
      )}
    </div>
  );
}
