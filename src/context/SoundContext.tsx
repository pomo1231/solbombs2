import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

// Public sound paths (optional). If files are missing, we synthesize a fallback.
// Place real assets in `public/sounds/` e.g. public/sounds/bomb.mp3, diamond.mp3
const SOUND_URLS: Record<string, string> = {
  bomb: '/sounds/bomb.mp3',
  diamond: '/sounds/diamond.mp3',
};

interface SoundContextValue {
  enabled: boolean;
  volume: number; // 0..1
  unlockAudio: () => void; // call on first user gesture
  setEnabled: (v: boolean) => void;
  setVolume: (v: number) => void;
  play: (name: keyof typeof SOUND_URLS | string) => void;
  // Global, non-persistent mute useful for replay/hydration phases
  setGlobalMute: (muted: boolean) => void;
}

const SoundContext = createContext<SoundContextValue | null>(null);

const LS_ENABLED = 'sound_enabled';
const LS_VOLUME = 'sound_volume';

export const SoundProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [enabled, setEnabled] = useState<boolean>(() => {
    try { const v = localStorage.getItem(LS_ENABLED); return v ? v === '1' : true; } catch { return true; }
  });
  const [volume, setVolume] = useState<number>(() => {
    try { const v = localStorage.getItem(LS_VOLUME); return v ? Math.max(0, Math.min(1, Number(v))) : 0.4; } catch { return 0.4; }
  });
  // Non-persistent global mute to silence all SFX during hydration/replay
  const globalMuteRef = useRef(false);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const unlockedRef = useRef(false);

  useEffect(() => {
    try { localStorage.setItem(LS_ENABLED, enabled ? '1' : '0'); } catch {}
  }, [enabled]);
  useEffect(() => {
    try { localStorage.setItem(LS_VOLUME, String(volume)); } catch {}
  }, [volume]);

  const ensureAudioCtx = useCallback(async () => {
    if (!audioCtxRef.current) {
      const Ctx = (window.AudioContext || (window as any).webkitAudioContext);
      if (Ctx) audioCtxRef.current = new Ctx();
    }
    const ctx = audioCtxRef.current;
    if (ctx && ctx.state === 'suspended') {
      try { await ctx.resume(); } catch {}
    }
    return audioCtxRef.current;
  }, []);

  const unlockAudio = useCallback(() => {
    if (unlockedRef.current) return;
    unlockedRef.current = true;
    ensureAudioCtx();
  }, [ensureAudioCtx]);

  // Simple cache of HTMLAudioElements
  const cacheRef = useRef<Map<string, HTMLAudioElement>>(new Map());

  const playUrl = useCallback(async (url: string, fallback: 'bomb' | 'diamond') => {
    let el = cacheRef.current.get(url);
    if (!el) {
      el = new Audio(url);
      el.preload = 'auto';
      cacheRef.current.set(url, el);
    }
    el.currentTime = 0;
    el.volume = volume;
    try {
      await el.play();
    } catch (e) {
      // Autoplay blocked or missing file: synth fallback
      if (fallback === 'bomb') synthSoftBoom(volume); else synthDiamond(volume);
    }
  }, [volume]);

  const play = useCallback((name: keyof typeof SOUND_URLS | string) => {
    if (!enabled || globalMuteRef.current) {
      try { if (globalMuteRef.current) console.debug('[Sound] suppressed by global mute:', name); } catch {}
      return;
    }
    const key = (name as string);
    // Always synthesize a softer bomb to avoid harshness
    if (key === 'bomb') {
      synthSoftBoom(volume);
      return;
    }
    const url = SOUND_URLS[key];
    if (url) {
      void playUrl(url, 'diamond');
      return;
    }
    // Unknown or missing: pleasant diamond chime
    synthDiamond(volume);
  }, [enabled, playUrl, volume]);

  const setGlobalMute = useCallback((muted: boolean) => {
    globalMuteRef.current = muted;
    try { console.debug('[Sound] global mute ->', muted); } catch {}
  }, []);

  const value = useMemo<SoundContextValue>(
    () => ({ enabled, volume, setEnabled, setVolume, play, unlockAudio, setGlobalMute }),
    [enabled, play, volume, unlockAudio]
  );

  // Auto-attach a one-time unlock listener
  useEffect(() => {
    const handler = () => unlockAudio();
    const evts = ['pointerdown', 'keydown'];
    evts.forEach(e => window.addEventListener(e, handler, { once: true } as any));
    return () => evts.forEach(e => window.removeEventListener(e, handler as any));
  }, [unlockAudio]);

  return (
    <SoundContext.Provider value={value}>{children}</SoundContext.Provider>
  );
};

export function useSound() {
  const ctx = useContext(SoundContext);
  if (!ctx) throw new Error('useSound must be used within SoundProvider');
  return ctx;
}

// ===== Fallback synthesizers (WebAudio) =====
function synthDiamond(volume: number) {
  try {
    const Ctx = (window.AudioContext || (window as any).webkitAudioContext);
    if (!Ctx) return;
    const ctx = new Ctx();
    const g = ctx.createGain();
    g.gain.value = 0.12 * volume;
    g.connect(ctx.destination);

    // Simple arpeggio chime
    const notes = [880, 1320, 1760]; // A5, E6, A6
    notes.forEach((freq, i) => {
      const o = ctx.createOscillator();
      o.type = 'sine';
      const og = ctx.createGain();
      og.gain.value = 0.0;
      o.frequency.value = freq;
      o.connect(og).connect(g);
      const t0 = ctx.currentTime + i * 0.05;
      o.start(t0);
      og.gain.linearRampToValueAtTime(0.18 * volume, t0 + 0.02);
      og.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.22);
      o.stop(t0 + 0.25);
    });
  } catch {}
}

function synthSoftBoom(volume: number) {
  try {
    const Ctx = (window.AudioContext || (window as any).webkitAudioContext);
    if (!Ctx) return;
    const ctx = new Ctx();

    // Master gain to prevent clipping
    const master = ctx.createGain();
    master.gain.value = 0.18 * volume;
    master.connect(ctx.destination);

    // Sub-bass thump: sine sweep 120Hz -> 60Hz with quick decay
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    const oGain = ctx.createGain();
    oGain.gain.value = 0.0;
    osc.connect(oGain).connect(master);
    const t0 = ctx.currentTime;
    osc.frequency.setValueAtTime(120, t0);
    osc.frequency.exponentialRampToValueAtTime(60, t0 + 0.25);
    oGain.gain.linearRampToValueAtTime(0.35 * volume, t0 + 0.01);
    oGain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.35);
    osc.start(t0);
    osc.stop(t0 + 0.4);

    // Soft body using filtered noise
    const bufferSize = Math.floor(0.4 * ctx.sampleRate);
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    const nFilter = ctx.createBiquadFilter();
    nFilter.type = 'lowpass';
    nFilter.frequency.value = 180;
    const nGain = ctx.createGain();
    nGain.gain.value = 0.0;
    noise.connect(nFilter).connect(nGain).connect(master);
    nGain.gain.linearRampToValueAtTime(0.14 * volume, t0 + 0.02);
    nGain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.35);
    noise.start(t0);
    noise.stop(t0 + 0.4);
  } catch {}
}
