import { Link } from 'react-router-dom';

type Props = {
  to?: string;
  size?: 'nav' | 'hero' | 'auth';
  className?: string;
};

const sizeClass: Record<NonNullable<Props['size']>, string> = {
  nav: 'rounded-[4px] px-2 py-1 text-[26px] leading-none',
  hero: 'rounded-[4px] px-2 py-1 text-[34px] leading-none md:text-[40px]',
  auth: 'rounded-[4px] px-2 py-1 text-[32px] leading-none'
};

/** LinkedIn-style “in” mark (course simulation — not official branding assets). */
export default function LinkedInMark({ to = '/feed', size = 'nav', className = '' }: Props) {
  return (
    <Link
      to={to}
      className={`inline-flex select-none items-center justify-center bg-[#0a66c2] font-bold text-white shadow-[0_1px_1px_rgba(0,0,0,0.15)] transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0a66c2] ${sizeClass[size]} ${className}`}
      aria-label="LinkedIn"
    >
      in
    </Link>
  );
}
