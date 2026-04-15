import { useEffect, useState } from 'react';

type ToastType = 'success' | 'error' | 'info';

type ToastItem = {
  id: string;
  message: string;
  type: ToastType;
};

type ToastEventDetail = {
  message: string;
  type?: ToastType;
};

const EVENT_NAME = 'li-sim-toast';

export function showToast(message: string, type: ToastType = 'info') {
  window.dispatchEvent(new CustomEvent<ToastEventDetail>(EVENT_NAME, { detail: { message, type } }));
}

export function ToastViewport() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  useEffect(() => {
    const onToast = (event: Event) => {
      const custom = event as CustomEvent<ToastEventDetail>;
      const message = custom.detail?.message;
      if (!message) return;
      const type = custom.detail?.type || 'info';
      const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      setToasts((prev) => [...prev, { id, message, type }]);
      window.setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 2600);
    };
    window.addEventListener(EVENT_NAME, onToast as EventListener);
    return () => window.removeEventListener(EVENT_NAME, onToast as EventListener);
  }, []);

  const tone = (type: ToastType) => {
    if (type === 'success') return 'border-[#1f7a3d] bg-[#e8f5ec] text-[#145a2a]';
    if (type === 'error') return 'border-[#c62828] bg-[#fdecea] text-[#8e1f1f]';
    return 'border-[#0a66c2] bg-[#edf3f8] text-[#0a66c2]';
  };

  return (
    <div className="pointer-events-none fixed right-4 top-4 z-[120] space-y-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`pointer-events-auto min-w-[260px] max-w-[360px] rounded-md border px-3 py-2 text-sm font-semibold shadow ${tone(toast.type)}`}
        >
          {toast.message}
        </div>
      ))}
    </div>
  );
}

