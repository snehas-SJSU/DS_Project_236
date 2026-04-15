import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { setAuthToken } from '../lib/auth';

const footerLinks = [
  'User Agreement',
  'Privacy Policy',
  'Community Guidelines',
  'Cookie Policy',
  'Copyright Policy',
  'Send Feedback',
  'Language'
];

export default function SignInPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [keepLoggedIn, setKeepLoggedIn] = useState(true);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  return (
    <div className="flex min-h-screen flex-col bg-white">
      <header className="px-8 py-5">
        <Link to="/" className="text-4xl font-bold text-[#0a66c2]">
          in
        </Link>
      </header>

      <main className="flex flex-1 items-center justify-center px-4 pb-10">
        <div className="w-full max-w-[352px] rounded-lg border border-[#e0dfdc] bg-white p-4 shadow-[0_4px_12px_rgba(0,0,0,0.08)]">
          <h1 className="mb-3 text-[32px] font-semibold leading-none text-[#191919]">Sign in</h1>
          <div className="space-y-2">
            <button type="button" className="w-full rounded-full border border-[#8c8c8c] px-3 py-2 text-sm font-semibold text-[#3c4043] hover:bg-[#f7f9fa]">
              Continue with Google
            </button>
            <button type="button" className="w-full rounded-full border border-[#8c8c8c] px-3 py-2 text-sm font-semibold text-[#3c4043] hover:bg-[#f7f9fa]">
              Sign in with Apple
            </button>
          </div>

          <p className="mt-2 text-[11px] text-[#666666]">
            By clicking Continue, you agree to LinkedIn&apos;s User Agreement, Privacy Policy, and Cookie Policy.
          </p>

          <div className="my-4 flex items-center gap-3">
            <div className="h-px flex-1 bg-[#d9d9d9]" />
            <span className="text-xs text-[#666666]">or</span>
            <div className="h-px flex-1 bg-[#d9d9d9]" />
          </div>

          <form
            className="space-y-3"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!email || !password) {
                setError('Please enter email and password.');
                return;
              }
              setError('');
              setLoading(true);
              try {
                const res = await fetch('http://localhost:4000/api/auth/login', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ email, password, keepLoggedIn })
                });
                const data = await res.json();
                if (!res.ok) {
                  setError(data?.message || 'Login failed.');
                  return;
                }
                if (data?.token) setAuthToken(data.token);
                navigate('/feed');
              } catch {
                setError('Unable to sign in right now. Please try again.');
              } finally {
                setLoading(false);
              }
            }}
          >
            <input
              type="text"
              placeholder="Email or phone"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded border border-[#8c8c8c] px-3 py-2.5 text-sm outline-none focus:border-[#0a66c2]"
            />
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded border border-[#8c8c8c] px-3 py-2.5 pr-16 text-sm outline-none focus:border-[#0a66c2]"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-xs font-semibold text-[#0a66c2]"
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>

            <Link to="/help" className="block text-sm font-semibold text-[#0a66c2] hover:underline">
              Forgot password?
            </Link>

            <label className="flex items-center gap-2 text-sm text-[#191919]">
              <input
                type="checkbox"
                checked={keepLoggedIn}
                onChange={(e) => setKeepLoggedIn(e.target.checked)}
                className="h-4 w-4 rounded border-[#8c8c8c]"
              />
              Keep me logged in
            </label>

            <button type="submit" className="w-full rounded-full bg-[#0a66c2] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#004182]">
              {loading ? 'Signing in...' : 'Sign in'}
            </button>
            {error ? <p className="text-xs font-medium text-[#c62828]">{error}</p> : null}
          </form>

          <p className="mt-5 text-center text-sm text-[#191919]">
            New to LinkedIn? <Link to="/signup" className="font-semibold text-[#0a66c2] hover:underline">Join now</Link>
          </p>
        </div>
      </main>

      <footer className="border-t border-[#e0dfdc] px-4 py-3">
        <div className="mx-auto flex w-full max-w-[980px] flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[11px] text-[#666666]">
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

