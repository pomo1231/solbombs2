import { useEffect } from "react";

type Props = {
  enabled: boolean;
};

const CrispChatSetup = ({ enabled }: Props) => {
  useEffect(() => {
    if (!enabled) return;

    const w = window as any;
    const crispWebsiteId = "d873730a-7084-4211-8bcb-e7044b539b6a";

    // Only load once
    if (w.CRISP_WEBSITE_ID) return;

    // Set up Crisp globals and load script
    w.CRISP_WEBSITE_ID = crispWebsiteId;
    w.$crisp = w.$crisp || [];

    const script = document.createElement("script");
    script.src = "https://client.crisp.chat/l.js";
    script.async = true;
    script.onload = () => {
      console.log('[Crisp] loader loaded');
      try {
        w.$crisp.push(["on", "session:loaded", () => console.log('[Crisp] session:loaded')]);
        // no API-based hiding; rely on DOM hider below to keep only the small bubble hidden

        // Hide default Crisp launcher bubble (keep chat panel intact)
        const hideLauncher = () => {
          try {
            const iframes = Array.from(document.querySelectorAll('iframe')) as HTMLIFrameElement[];
            for (const f of iframes) {
              const src = (f as any).src || '';
              if (!src.includes('crisp')) continue;
              const r = f.getBoundingClientRect();
              const vw = window.innerWidth;
              const vh = window.innerHeight;
              const nearRight = vw - r.right <= 24;
              const nearBottom = vh - r.bottom <= 24;
              // Consider any small-ish iframe anchored bottom-right as the launcher
              const isSmall = (r.width > 0 && r.height > 0) && (r.width <= 360 && r.height <= 360);
              const isBottomRight = nearRight && nearBottom;
              if (isSmall && isBottomRight) {
                f.style.display = 'none';
                try { if (f.parentElement) { f.parentElement.style.pointerEvents = 'none'; } } catch {}
              }
            }
          } catch {}
        };
        hideLauncher();
        const mo = new MutationObserver(hideLauncher);
        try { mo.observe(document.documentElement, { childList: true, subtree: true }); } catch {}
        // Save to window so we could clean up in future if needed
        (w as any).__crispLauncherHider = mo;
        // Also run periodically to counter style changes
        try {
          const id = window.setInterval(hideLauncher, 300);
          (w as any).__crispLauncherHiderInterval = id;
        } catch {}
      } catch {}
    };
    script.onerror = () => console.error('[Crisp] failed to load loader');
    document.head.appendChild(script);
  }, [enabled]);

  return null;
};

export default CrispChatSetup;
