import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { clearAuthToken, getAuthToken } from '../lib/auth';

export default function SignOutPage() {
  const navigate = useNavigate();

  useEffect(() => {
    const token = getAuthToken();
    fetch('/api/auth/logout', {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : undefined
    })
      .catch(() => undefined)
      .finally(() => {
        clearAuthToken();
        navigate('/login/email', { replace: true });
      });
  }, [navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-white text-[#191919]">
      <p className="text-sm">Signing you out...</p>
    </div>
  );
}

