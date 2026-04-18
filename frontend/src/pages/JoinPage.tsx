import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { setAuthToken } from '../lib/auth';

const footerLinks = [
  'About',
  'Accessibility',
  'User Agreement',
  'Privacy Policy',
  'Your California Privacy Choices',
  'Cookie Policy',
  'Copyright Policy',
  'Brand Policy',
  'Guest Controls',
  'Community Guidelines',
  'Language'
];

export default function JoinPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  return (
    <div className="flex min-h-screen flex-col bg-white">
      <header className="px-8 py-5">
        <Link to="/" className="text-4xl font-bold text-[#0a66c2]">
          in
        </Link>
      </header>

      <main className="flex flex-1 items-start justify-center px-4 pt-8">
        <div className="w-full max-w-[360px]">
          <h1 className="mb-3 text-[32px] font-semibold leading-none text-[#191919]">Join LinkedIn now - it&apos;s free!</h1>

          <div className="rounded border border-[#e0dfdc] bg-white p-4 shadow-[0_2px_6px_rgba(0,0,0,0.08)]">
            <form
              className="space-y-3"
              onSubmit={async (e) => {
                e.preventDefault();
                const normalizedEmail = email.trim().toLowerCase();
                if (!normalizedEmail || !password) {
                  setError('Please enter email and password.');
                  return;
                }
                if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
                  setError('Please enter a valid email address.');
                  return;
                }
                const strongPassword =
                  password.length >= 7 &&
                  /[A-Z]/.test(password) &&
                  /[a-z]/.test(password) &&
                  /\d/.test(password) &&
                  /[^A-Za-z0-9]/.test(password);
                if (!strongPassword) {
                  setError('Password must be 7+ chars and include uppercase, lowercase, number, and special character.');
                  return;
                }
                if (password !== confirmPassword) {
                  setError('Password and confirm password do not match.');
                  return;
                }
                setError('');
                setLoading(true);
                try {
                  const res = await fetch('/api/auth/signup', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email: normalizedEmail, password, rememberMe })
                  });
                  const data = await res.json();
                  if (!res.ok) {
                    setError(data?.message || 'Signup failed.');
                    return;
                  }
                  if (data?.token) setAuthToken(data.token);
                  navigate('/feed');
                } catch {
                  setError('Unable to create account right now. Please try again.');
                } finally {
                  setLoading(false);
                }
              }}
            >
              <div>
                <label className="mb-1 block text-xs font-semibold text-[#666666]">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded border border-[#8c8c8c] px-3 py-2 text-sm outline-none focus:border-[#0a66c2]"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-[#666666]">Password</label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full rounded border border-[#8c8c8c] px-3 py-2 pr-16 text-sm outline-none focus:border-[#0a66c2]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-xs font-semibold text-[#0a66c2]"
                  >
                    {showPassword ? 'HIDE' : 'SHOW'}
                  </button>
                </div>
                <p className="mt-1 text-[11px] text-[#666666]">
                  Use at least 7 characters with uppercase, lowercase, number, and special character.
                </p>
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-[#666666]">Confirm password</label>
                <div className="relative">
                  <input
                    type={showConfirmPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full rounded border border-[#8c8c8c] px-3 py-2 pr-16 text-sm outline-none focus:border-[#0a66c2]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword((v) => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-xs font-semibold text-[#0a66c2]"
                  >
                    {showConfirmPassword ? 'HIDE' : 'SHOW'}
                  </button>
                </div>
              </div>

              <label className="flex items-center gap-2 text-xs text-[#191919]">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="h-4 w-4 rounded border-[#8c8c8c]"
                />
                Remember me
              </label>

              <p className="text-[11px] text-[#666666]">
                By clicking Agree &amp; Join or Continue, you agree to the LinkedIn User Agreement, Privacy Policy, and Cookie Policy.
              </p>

              <button type="submit" className="w-full rounded-full bg-[#0a66c2] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#004182]">
                {loading ? 'Creating account...' : 'Agree & Join'}
              </button>
              {error ? <p className="text-xs font-medium text-[#c62828]">{error}</p> : null}
            </form>

            <div className="my-4 flex items-center gap-3">
              <div className="h-px flex-1 bg-[#d9d9d9]" />
              <span className="text-xs text-[#666666]">or</span>
              <div className="h-px flex-1 bg-[#d9d9d9]" />
            </div>

            <button type="button" className="w-full rounded-full border border-[#8c8c8c] px-3 py-2 text-sm font-semibold text-[#3c4043] hover:bg-[#f7f9fa]">
              Continue with Google
            </button>

            <p className="mt-4 text-center text-sm text-[#191919]">
              Already on LinkedIn?{' '}
              <Link to="/login/email" className="font-semibold text-[#0a66c2] hover:underline">
                Sign in
              </Link>
            </p>
          </div>

          <p className="mt-3 text-center text-sm text-[#666666]">
            Looking to create a page for a business?{' '}
            <Link to="/business" className="font-semibold text-[#0a66c2] hover:underline">
              Get help
            </Link>
          </p>
        </div>
      </main>

      <footer className="mt-8 border-t border-[#e0dfdc] px-4 py-3">
        <div className="mx-auto flex w-full max-w-[980px] flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[11px] text-[#666666]">
          <span className="font-semibold text-[#191919]">LinkedIn</span>
          <span>© 2026</span>
          {footerLinks.map((item) => (
            <Link key={item} to="/help" className="hover:text-[#0a66c2]">
              {item}
            </Link>
          ))}
        </div>
      </footer>
    </div>
  );
}

