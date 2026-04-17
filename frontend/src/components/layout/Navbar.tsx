import { Bell, Briefcase, Building2, ChevronDown, CircleDollarSign, Compass, Crown, Grid3X3, Handshake, Home, MessageSquare, Network, Search, Settings, Sparkles } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { LOCAL_AVATAR_KEY, MEMBER_ID, resolveAvatarUrl } from '../../lib/memberProfile';

export default function Navbar() {
  const navigate = useNavigate();
  const [isMeMenuOpen, setIsMeMenuOpen] = useState(false);
  const [isBusinessMenuOpen, setIsBusinessMenuOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [meProfile, setMeProfile] = useState<{ name: string; headline: string; photo?: string }>({
    name: 'Sneha Singh',
    headline: 'MS in Applied Data Intelligence | Distributed Systems',
    photo: resolveAvatarUrl(undefined, 'Sneha Singh')
  });
  const menuRef = useRef<HTMLDivElement | null>(null);
  const businessMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsMeMenuOpen(false);
      }
      if (businessMenuRef.current && !businessMenuRef.current.contains(event.target as Node)) {
        setIsBusinessMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  useEffect(() => {
    fetch('http://localhost:4000/api/members/get', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ member_id: MEMBER_ID })
    })
      .then((res) => res.json())
      .then((data) => {
        if (!data || data.error) return;
        const photo = resolveAvatarUrl(data.profile_photo_url, data.name);
        if (photo) localStorage.setItem(LOCAL_AVATAR_KEY, photo);
        setMeProfile({
          name: data.name || 'Sneha Singh',
          headline: data.headline || data.title || 'MS in Applied Data Intelligence | Distributed Systems',
                  photo
        });
      })
      .catch(() => undefined);
  }, []);

  const navItemClass = ({ isActive }: { isActive: boolean }) =>
    `group flex min-w-[60px] flex-col items-center border-b-2 px-1 pb-1 pt-2 transition-colors ${
      isActive ? 'border-[#191919] text-[#191919]' : 'border-transparent text-[#666666] hover:text-[#191919]'
    }`;

  return (
    <nav className="sticky top-0 z-50 border-b border-[#e0dfdc] bg-white">
      <div className="mx-auto flex h-[52px] max-w-[1128px] items-center justify-between gap-3 px-3">
          <div className="flex items-center gap-2">
            <Link to="/feed" className="rounded bg-[#0a66c2] p-1.5 text-xl font-bold leading-none text-white">
              in
            </Link>
            <form
              className="relative hidden md:block"
              onSubmit={(e) => {
                e.preventDefault();
                const keywords = searchTerm.trim();
                if (!keywords) return;
                navigate(`/jobs/search?keywords=${encodeURIComponent(keywords)}`);
              }}
            >
              <Search size={14} className="pointer-events-none absolute left-3 top-2.5 text-[#666666]" />
              <input
                type="text"
                placeholder="Search jobs, profiles..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-44 rounded bg-[#edf3f8] py-1.5 pl-9 pr-3 text-[13px] focus:w-64 focus:outline-none md:w-56"
              />
            </form>
          </div>

          <div className="flex items-center gap-2 md:gap-3">
            <NavLink to="/feed" className={navItemClass}>
              <Home size={18} />
              <span className="mt-0.5 text-[12px] font-medium">Home</span>
            </NavLink>
            <NavLink to="/network" className={navItemClass}>
              <Network size={18} />
              <span className="mt-0.5 text-[12px] font-medium">My Network</span>
            </NavLink>
            <NavLink to="/jobs" className={navItemClass}>
              <Briefcase size={18} />
              <span className="mt-0.5 text-[12px] font-medium">Jobs</span>
            </NavLink>
            <NavLink to="/messaging" className={navItemClass}>
              <MessageSquare size={18} />
              <span className="mt-0.5 text-[12px] font-medium">Messaging</span>
            </NavLink>
            <NavLink to="/notifications" className={navItemClass}>
              <Bell size={18} />
              <span className="mt-0.5 text-[12px] font-medium">Notifications</span>
            </NavLink>
            <div className="relative" ref={businessMenuRef}>
              <button
                type="button"
                onClick={() => {
                  setIsBusinessMenuOpen((v) => !v);
                  setIsMeMenuOpen(false);
                }}
                className="group flex min-w-[98px] flex-col items-center border-b-2 border-transparent px-1 pb-1 pt-2 text-[#666666] transition-colors hover:text-[#191919]"
              >
                <Grid3X3 size={18} />
                <span className="mt-0.5 flex items-center gap-1 text-[12px] font-medium leading-none">
                  For Business
                  <ChevronDown size={14} className={`transition-transform ${isBusinessMenuOpen ? 'rotate-180' : ''}`} />
                </span>
              </button>
              {isBusinessMenuOpen && (
                <div className="absolute right-0 top-[52px] z-50 w-[640px] overflow-hidden rounded-lg border border-[#d9d9d9] bg-white shadow-[0_8px_24px_rgba(0,0,0,0.12)]">
                  <div className="grid grid-cols-2">
                    <div className="border-r border-[#e0dfdc] p-5">
                      <p className="mb-4 text-[26px] font-semibold text-[#191919]">My Apps</p>
                      <ul className="space-y-3">
                        <li>
                          <Link to="/business" className="flex items-center gap-2 text-sm font-semibold text-[#191919] hover:text-[#0a66c2]" onClick={() => setIsBusinessMenuOpen(false)}>
                            <CircleDollarSign size={16} className="text-[#0a66c2]" />
                            Sell
                          </Link>
                        </li>
                        <li>
                          <Link to="/network/groups" className="flex items-center gap-2 text-sm font-semibold text-[#191919] hover:text-[#0a66c2]" onClick={() => setIsBusinessMenuOpen(false)}>
                            <Compass size={16} className="text-[#0a66c2]" />
                            Groups
                          </Link>
                        </li>
                        <li>
                          <Link to="/settings" className="flex items-center gap-2 text-sm font-semibold text-[#191919] hover:text-[#0a66c2]" onClick={() => setIsBusinessMenuOpen(false)}>
                            <Settings size={16} className="text-[#0a66c2]" />
                            Manage Billing
                          </Link>
                        </li>
                        <li>
                          <Link to="/jobs/post" className="flex items-center gap-2 text-sm font-semibold text-[#191919] hover:text-[#0a66c2]" onClick={() => setIsBusinessMenuOpen(false)}>
                            <Briefcase size={16} className="text-[#0a66c2]" />
                            Talent
                          </Link>
                        </li>
                        <li>
                          <Link to="/jobs/insights" className="flex items-center gap-2 text-sm font-semibold text-[#191919] hover:text-[#0a66c2]" onClick={() => setIsBusinessMenuOpen(false)}>
                            <Sparkles size={16} className="text-[#0a66c2]" />
                            Talent Insights
                          </Link>
                        </li>
                        <li>
                          <Link to="/network/connections" className="flex items-center gap-2 text-sm font-semibold text-[#191919] hover:text-[#0a66c2]" onClick={() => setIsBusinessMenuOpen(false)}>
                            <Handshake size={16} className="text-[#0a66c2]" />
                            Services Marketplace
                          </Link>
                        </li>
                      </ul>
                    </div>
                    <div className="p-5">
                      <p className="mb-4 text-[26px] font-semibold text-[#191919]">Explore more for business</p>
                      <ul className="space-y-3 text-sm text-[#191919]">
                        <li><Link to="/jobs/post" className="font-semibold hover:text-[#0a66c2]" onClick={() => setIsBusinessMenuOpen(false)}>Hire on LinkedIn</Link></li>
                        <li><Link to="/business" className="font-semibold hover:text-[#0a66c2]" onClick={() => setIsBusinessMenuOpen(false)}>Sell with LinkedIn</Link></li>
                        <li><Link to="/jobs/post" className="font-semibold hover:text-[#0a66c2]" onClick={() => setIsBusinessMenuOpen(false)}>Post a job for free</Link></li>
                        <li><Link to="/business" className="font-semibold hover:text-[#0a66c2]" onClick={() => setIsBusinessMenuOpen(false)}>Advertise on LinkedIn</Link></li>
                        <li><Link to="/premium" className="font-semibold hover:text-[#0a66c2]" onClick={() => setIsBusinessMenuOpen(false)}>Get started with Premium</Link></li>
                        <li><Link to="/jobs/insights" className="font-semibold hover:text-[#0a66c2]" onClick={() => setIsBusinessMenuOpen(false)}>Learn with LinkedIn</Link></li>
                        <li><Link to="/recruiter/admin" className="font-semibold hover:text-[#0a66c2]" onClick={() => setIsBusinessMenuOpen(false)}>Admin Center</Link></li>
                      </ul>
                      <div className="mt-5 border-t border-[#e0dfdc] pt-3">
                        <Link
                          to={`/company/${encodeURIComponent('Acme Company')}`}
                          className="inline-flex items-center gap-2 text-sm font-semibold text-[#191919] hover:text-[#0a66c2]"
                          onClick={() => setIsBusinessMenuOpen(false)}
                        >
                          <Building2 size={16} className="text-[#0a66c2]" />
                          Create a Company Page
                        </Link>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
            <NavLink
              to="/premium"
              className={({ isActive }) =>
                `group flex min-w-[70px] flex-col items-center border-b-2 px-1 pb-1 pt-2 transition-colors ${
                  isActive ? 'border-[#191919] text-[#915907]' : 'border-transparent text-[#915907] hover:text-[#7c4a00]'
                }`
              }
            >
              <span className="text-[11px] font-semibold leading-tight">Try Premium</span>
              <span className="text-[11px] leading-tight">for $0</span>
            </NavLink>
            <div className="relative border-l border-[#e0dfdc] pl-3" ref={menuRef}>
              <button
                type="button"
                onClick={() => {
                  setIsMeMenuOpen((v) => !v);
                  setIsBusinessMenuOpen(false);
                }}
                className="group flex min-w-[60px] flex-col items-center border-b-2 border-transparent px-1 pb-1 pt-2 text-[#666666] transition-colors hover:text-[#191919]"
              >
                <div className="flex h-6 w-6 items-center justify-center overflow-hidden rounded-full bg-slate-300">
                  {meProfile.photo ? (
                    <img src={meProfile.photo} alt="Me" className="h-full w-full object-cover" />
                  ) : (
                    <span className="text-xs font-bold text-white">ME</span>
                  )}
                </div>
                <span className="mt-0.5 text-[12px] font-medium">Me</span>
              </button>
              {isMeMenuOpen && (
                <div className="absolute right-0 top-[52px] z-50 w-[280px] overflow-hidden rounded-lg border border-[#d9d9d9] bg-white shadow-[0_8px_24px_rgba(0,0,0,0.12)]">
                  <div className="border-b border-[#e0dfdc] p-3">
                    <div className="flex items-start gap-2">
                      <div className="h-12 w-12 overflow-hidden rounded-full bg-slate-300">
                        {meProfile.photo ? <img src={meProfile.photo} alt="Me" className="h-full w-full object-cover" /> : null}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-[#191919]">{meProfile.name}</p>
                        <p className="line-clamp-2 text-xs text-[#666666]">{meProfile.headline}</p>
                      </div>
                    </div>
                    <Link
                      to="/profile"
                      className="mt-3 block rounded-full border border-[#0a66c2] px-3 py-1.5 text-center text-sm font-semibold text-[#0a66c2] hover:bg-[#eef3f8]"
                      onClick={() => setIsMeMenuOpen(false)}
                    >
                      View profile
                    </Link>
                  </div>
                  <div className="border-b border-[#e0dfdc] px-3 py-2">
                    <p className="mb-1 text-xs font-semibold text-[#191919]">Account</p>
                    <ul className="space-y-1 text-xs text-[#666666]">
                      <li><Link to="/settings" className="hover:text-[#191919]" onClick={() => setIsMeMenuOpen(false)}>Settings &amp; Privacy</Link></li>
                      <li><Link to="/help" className="hover:text-[#191919]" onClick={() => setIsMeMenuOpen(false)}>Help</Link></li>
                      <li><Link to="/language" className="hover:text-[#191919]" onClick={() => setIsMeMenuOpen(false)}>Language</Link></li>
                    </ul>
                  </div>
                  <div className="px-3 py-2">
                    <p className="mb-1 text-xs font-semibold text-[#191919]">Manage</p>
                    <ul className="space-y-1 text-xs text-[#666666]">
                      <li><Link to="/applications" className="hover:text-[#191919]" onClick={() => setIsMeMenuOpen(false)}>My applications</Link></li>
                      <li><Link to="/profile/activity" className="hover:text-[#191919]" onClick={() => setIsMeMenuOpen(false)}>Posts &amp; Activity</Link></li>
                      <li><Link to="/recruiter" className="hover:text-[#191919]" onClick={() => setIsMeMenuOpen(false)}>Job posting account</Link></li>
                      <li><Link to="/signout" className="hover:text-[#191919]" onClick={() => setIsMeMenuOpen(false)}>Sign out</Link></li>
                    </ul>
                  </div>
                </div>
              )}
            </div>
          </div>
      </div>
    </nav>
  );
}
