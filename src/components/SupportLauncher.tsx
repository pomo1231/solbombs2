import React, { useEffect, useRef, useState } from 'react';

export default function SupportLauncher() {
  const [isChatOpen, setIsChatOpen] = useState<boolean>(false);
  const lastActionRef = useRef<{ t: number; type: 'open' | 'close' | null }>({ t: 0, type: null });

  // Keep local state in sync with Crisp events when available
  useEffect(() => {
    const w = window as any;
    w.$crisp = w.$crisp || [];
    const opened = () => setIsChatOpen(true);
    const closed = () => setIsChatOpen(false);
    try {
      w.$crisp.push(["on", "chat:opened", opened]);
      w.$crisp.push(["on", "chat:closed", closed]);
    } catch {}
    return () => {
      try {
        w.$crisp.push(["off", "chat:opened", opened]);
        w.$crisp.push(["off", "chat:closed", closed]);
      } catch {}
    };
  }, []);

  const onClick = () => {
    const w = window as any;
    w.$crisp = w.$crisp || [];
    console.log('[SupportLauncher] click');

    const pushOnce = (type: 'open' | 'close', isRetry = false) => {
      const now = Date.now();
      // Debounce same action within 500ms
      if (lastActionRef.current.type === type && now - lastActionRef.current.t < 500) return;
      lastActionRef.current = { t: now, type };
      try {
        if (!isRetry) console.log(`[SupportLauncher] ${type}`);
        w.$crisp.push(["do", type === 'open' ? "chat:open" : "chat:close"]);
      } catch (e) { console.warn(e); }
    };

    // Detect via DOM: if a large Crisp iframe exists (panel), then close; else open
    const wantOpen = !isChatOpen;
    const act = () => pushOnce(wantOpen ? 'open' : 'close');
    setIsChatOpen(wantOpen);
    // Perform action now and with retries to cover init races
    act();
    setTimeout(() => pushOnce(wantOpen ? 'open' : 'close', true), 300);
  };

  return (
    <>
      {/* Invisible blocker to prevent clicks reaching Crisp default bubble */}
      <div
        className="fixed"
        style={{
          right: 0,
          bottom: 0,
          width: 200,
          height: 200,
          zIndex: 2147483646,
          background: 'transparent',
          pointerEvents: 'auto'
        }}
      />
      <button
        onClick={onClick}
        className="fixed bottom-4 right-4 w-[70px] h-[70px] bg-zinc-800 hover:bg-zinc-700 rounded-full shadow-lg text-white flex items-center justify-center transition-colors"
        style={{ zIndex: 2147483647 }}
      >
        <svg width="30" height="30" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M21 12c0 4.418-4.03 8-9 8-1.016 0-1.993-.144-2.905-.408L3 20l1.013-3.04C3.373 15.8 3 13.95 3 12 3 7.582 7.03 4 12 4s9 3.582 9 8Z" stroke="currentColor" strokeWidth="1.7"/>
          <path d="M8 11h8M8 14h5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/>
        </svg>
      </button>
    </>
  );
}
