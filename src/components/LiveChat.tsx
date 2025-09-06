import { useState, useRef, useEffect, useMemo, FC, FormEvent, MouseEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import casinoLogo from '@/assets/casino-logo.gif';
import { Smile, Info, MessageCircle, PauseCircle, Gift, Users as UsersIcon, CornerDownLeft, X, ChevronLeft, ChevronRight } from 'lucide-react';
import { generateAvatarUrl } from '@/lib/utils';
import { useStats } from '@/context/StatsContext';
import { Badge } from '@/components/ui/badge';
import defaultAvatar from '@/assets/default-avatar.png';
import { useSocket } from '@/context/SocketContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { SolanaLogo } from '@/components/SolanaLogo';

interface LiveChatProps {
  wallet: string | null;
  isConnected: boolean;
}

interface UserProfile {
  name: string;
  avatarUrl: string;
}

interface Message {
  id?: string;
  from: string;
  text: string;
  name: string;
  timestamp: string; // ISO string
  avatarUrl: string;
  level: number;
  replyToId?: string;
  replyToName?: string;
  replySnippet?: string;
}

// Prefer configurable websocket URL; default to 8081 to match server.js
const WS_URL = (import.meta as any).env?.VITE_WS_URL || `ws://${window.location.hostname}:8081`;

const LiveChat: FC<LiveChatProps> = ({ wallet, isConnected }) => {
  const navigate = useNavigate();
  const { level, isStreamerMode, userProfile, updateUserProfile, totalWagered, gameHistory } = useStats();
  const { onlineCount, getProfile, getStats, prefetchProfile, prefetchStats } = useSocket();
  const [messages, setMessages] = useState<Message[]>(() => {
    const saved = localStorage.getItem('chat_messages');
    return saved ? JSON.parse(saved) : [];
  });
  const [input, setInput] = useState('');
  const [isChatPaused, setIsChatPaused] = useState(false);
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try { return localStorage.getItem('chat_collapsed') === '1'; } catch { return false; }
  });
  const ws = useRef<WebSocket | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const lastIdRef = useRef<string | undefined>(undefined);
  const [wsReady, setWsReady] = useState(false);
  const [replyTo, setReplyTo] = useState<{ id: string; name: string; snippet: string } | null>(null);
  const [showEmoji, setShowEmoji] = useState(false);
  const refreshTimer = useRef<number | null>(null);
  const knownIdsRef = useRef<Set<string>>(new Set());
  
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [isHovered, setIsHovered] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [selectedUser, setSelectedUser] = useState<{
    wallet?: string;
    name: string;
    avatarUrl: string;
  } | null>(null);
  const [selectedUserStats, setSelectedUserStats] = useState<{
    totalWagered: number;
    gameHistory: { id?: string; timestamp?: string; netProfit: number; wageredAmount?: number }[];
  } | null>(null);

  const handleMouseMove = (e: MouseEvent<HTMLButtonElement>) => {
    setIsHovered(true);
    const rect = e.currentTarget.getBoundingClientRect();
    setMousePos({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    });
  };

  // Memoized chart data and profit for the profile popup to avoid heavy recalculation during renders
  const memoGameHistory = selectedUserStats?.gameHistory || [];
  const chartData = useMemo(() => {
    if (!memoGameHistory.length) return [] as { idx: number; profit: number }[];
    const data: { idx: number; profit: number }[] = [];
    let cum = 0;
    // Build cumulative profit in display order (oldest -> newest on X)
    for (let i = memoGameHistory.length - 1, idx = 1; i >= 0; i--, idx++) {
      cum += Number(memoGameHistory[i]?.netProfit) || 0;
      data.push({ idx, profit: cum });
    }
    return data;
  }, [memoGameHistory]);

  const memoProfit = useMemo(() => {
    if (!memoGameHistory.length) return 0;
    let total = 0;
    for (let i = 0; i < memoGameHistory.length; i++) {
      total += Number(memoGameHistory[i]?.netProfit) || 0;
    }
    return total;
  }, [memoGameHistory]);

  // no-op: we keep modal-based profile view

  const handleMouseLeave = () => {
    setIsHovered(false);
  };

  const openUserProfile = async (msg: Message) => {
    console.log('Opening profile for:', { wallet: msg.from, name: msg.name });
    setSelectedUser({ wallet: msg.from, name: msg.name, avatarUrl: msg.avatarUrl });
    setProfileOpen(true);
    setProfileLoading(true);
    setProfileError(null);
    // Reset previous stats to avoid showing old user's data while loading
    setSelectedUserStats(null);
    try {
      // If clicking on the current user's own message, use local StatsContext immediately
      if (wallet && msg.from === wallet) {
        console.log('Using local stats for own profile');
        setSelectedUserStats({ totalWagered, gameHistory });
        // Still attempt to fetch server stats in background to hydrate if available
      }

      console.log('Fetching stats for wallet:', msg.from);

      let cancelled = false;
      const currentWallet = msg.from;

      (async () => {
        try {
          const p = await getProfile(currentWallet);
          if (!cancelled && p) {
            setSelectedUser(prev => prev ? { ...prev, name: p.name || prev.name, avatarUrl: p.avatarUrl || prev.avatarUrl } : prev);
          }
        } catch {}
      })();

      (async () => {
        try {
          const s = await getStats(currentWallet);
          if (!cancelled && s) {
            if (wallet && currentWallet === wallet) {
              const serverHistory = Array.isArray(s.gameHistory) ? s.gameHistory : [];
              const localHistory = Array.isArray(gameHistory) ? gameHistory : [];
              const chosenHistory = serverHistory.length >= localHistory.length ? serverHistory : localHistory;
              const mergedTotal = Math.max(Number(s.totalWagered) || 0, Number(totalWagered) || 0);
              setSelectedUserStats({ totalWagered: mergedTotal, gameHistory: chosenHistory });
            } else {
              setSelectedUserStats({ totalWagered: Number(s.totalWagered) || 0, gameHistory: Array.isArray(s.gameHistory) ? s.gameHistory : [] });
            }
          }
        } catch {}
      })();

      // Watchdog: after 2000ms, if we still have no stats, show an empty state placeholder (will be replaced if data arrives later)
      setTimeout(() => {
        if (cancelled) return;
        setSelectedUserStats(prev => prev ?? { totalWagered: 0, gameHistory: [] });
      }, 2000);

      // When modal closes or user changes, cancel late updates
      const stop = () => { cancelled = true; };
      // store stopper in ref if needed; here we just ensure finally block clears loading
      
    } catch (e: any) {
      console.error('Error fetching profile:', e);
      setProfileError('Failed to load profile');
      setSelectedUserStats((prev) => prev ?? { totalWagered: 0, gameHistory: [] });
    } finally {
      setProfileLoading(false);
    }
  };

  const backgroundStyle = {
    background: isHovered
      ? `radial-gradient(circle at ${mousePos.x}px ${mousePos.y}px, rgba(59, 130, 246, 0.2) 0%, transparent 50%), #18191c`
      : '#18191c',
    transition: 'background 0.2s ease-out',
  };

  const scrollToBottom = () => {
    try { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); } catch {}
  };

  // Seed known IDs from any locally restored messages
  useEffect(() => {
    for (const m of messages) {
      if (m.id) knownIdsRef.current.add(m.id);
    }
    const lastId = messages.length ? messages[messages.length - 1]?.id : undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    scrollToBottom();
    try { localStorage.setItem('chat_messages', JSON.stringify(messages.slice(-200))); } catch {}
  }, [messages]);

  // Track the latest message id for incremental history fetches
  useEffect(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const id = messages[i]?.id;
      if (id) { lastIdRef.current = id; break; }
    }
  }, [messages]);

  useEffect(() => {
    try { localStorage.setItem('chat_collapsed', collapsed ? '1' : '0'); } catch {}
  }, [collapsed]);

  useEffect(() => {
    // Skip if websocket URL is not configured
    if (!WS_URL) {
      console.warn('[LiveChat] WS_URL not set; chat socket disabled');
      return;
    }

    // Connect to websocket even if not logged in to allow read-only chat
    try {
      ws.current = new WebSocket(WS_URL);
    } catch (err) {
      console.warn('[LiveChat] failed to construct WebSocket:', err);
      return;
    }

    ws.current.onopen = () => {
      console.log('[LiveChat] connected to', WS_URL);
      setWsReady(true);
      // Request recent messages (after the last known id if available)
      try {
        const afterId = lastIdRef.current;
        ws.current?.send(JSON.stringify({ type: 'getRecentMessages', limit: 200, afterId }));
      } catch {}
    };

    ws.current.onerror = (err) => {
      console.warn('[LiveChat] websocket error', err);
      setWsReady(false);
    };

    ws.current.onclose = () => {
      console.warn('[LiveChat] websocket closed');
      setWsReady(false);
    };

    ws.current.onmessage = async (event) => {
      try {
        const raw = event.data instanceof Blob ? await event.data.text() : event.data;
        const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
        if (data && data.type === 'chatMessage') {
          const newMessage: Message = {
            id: data.id,
            from: data.from,
            text: data.text,
            name: data.name,
            level: data.level ?? 1,
            avatarUrl: data.avatarUrl || defaultAvatar,
            timestamp: data.timestamp ? new Date(data.timestamp).toISOString() : new Date().toISOString(),
            replyToId: data.replyToId,
            replyToName: data.replyToName,
            replySnippet: data.replySnippet,
          };
          if (newMessage.from && newMessage.text && newMessage.name) {
            setMessages((prev) => {
              if (newMessage.id && knownIdsRef.current.has(newMessage.id)) return prev;
              if (newMessage.id) knownIdsRef.current.add(newMessage.id);
              return [...prev, newMessage];
            });
          }
        }
        if (data && data.type === 'recentMessages' && Array.isArray(data.messages)) {
          const incoming: Message[] = data.messages.map((m: any) => ({
            id: m.id,
            from: m.from,
            text: m.text,
            name: m.name,
            level: m.level ?? 1,
            avatarUrl: m.avatarUrl || defaultAvatar,
            timestamp: m.timestamp ? new Date(m.timestamp).toISOString() : new Date().toISOString(),
            replyToId: m.replyToId,
            replyToName: m.replyToName,
            replySnippet: m.replySnippet,
          }));
          setMessages((prev) => {
            const merged = [...prev];
            for (const m of incoming) {
              if (m.id) {
                if (knownIdsRef.current.has(m.id)) continue;
                knownIdsRef.current.add(m.id);
              }
              merged.push(m);
            }
            return merged;
          });
        }
        // ignore other message types here (handled by SocketContext)
      } catch (e) {
        console.error('Failed to parse websocket message', e);
      }
    };
    return () => ws.current?.close();
  }, []);

  useEffect(() => {
    if (!isChatPaused) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isChatPaused]);

  const sendMessage = (e: FormEvent) => {
    e.preventDefault();
    if (!input.trim()) {
      console.warn('[LiveChat] blocked send: empty input');
      return;
    }
    if (!isConnected || !wallet) {
      console.warn('[LiveChat] blocked send: wallet not connected');
      return;
    }
    if (!ws.current) {
      console.warn('[LiveChat] blocked send: ws not initialized');
      return;
    }
    if (ws.current.readyState !== WebSocket.OPEN) {
      console.warn('[LiveChat] blocked send: ws not open');
      return;
    }

    const fallbackName = `${wallet.slice(0, 4)}...${wallet.slice(-4)}`;
    const senderName = isStreamerMode ? 'Streamer' : (userProfile?.name || fallbackName);
    const avatarUrl = isStreamerMode ? generateAvatarUrl('streamer') : (userProfile?.avatarUrl || defaultAvatar);

    const messageId = `msg_${Date.now()}_${Math.random().toString(36).slice(2,8)}`;
    const msg: Message = { 
      id: messageId,
      from: wallet, 
      text: input, 
      name: senderName, 
      timestamp: new Date().toISOString(),
      avatarUrl: avatarUrl,
      level: level ?? 1,
      replyToId: replyTo?.id,
      replyToName: replyTo?.name,
      replySnippet: replyTo?.snippet,
    };
    setMessages((prev) => [...prev, msg]);

    ws.current.send(JSON.stringify({ 
        type: 'chatMessage',
        id: messageId,
        from: wallet, 
        text: input, 
        name: senderName,
        level: level ?? 1,
        avatarUrl: avatarUrl,
        replyToId: replyTo?.id,
        replyToName: replyTo?.name,
        replySnippet: replyTo?.snippet,
    }));
    setInput('');
    setReplyTo(null);
    setShowEmoji(false);
  };

  const renderMessage = (msg: Message, index: number) => {
    const date = new Date(msg.timestamp);
    const displayTime = !isNaN(date.getTime())
      ? date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      : '';
    return (
      <div
        key={msg.id || index}
        className="flex items-start gap-3.5 p-3 group mx-2 my-1 rounded-lg transition-colors border border-white/5 hover:border-purple-400/30 hover:bg-white/5"
        onMouseEnter={() => { try { prefetchProfile?.(msg.from); prefetchStats?.(msg.from); } catch {} }}
      >
        <button
          className="w-10 h-10 flex-shrink-0 relative"
          onClick={() => openUserProfile(msg)}
          title="View profile"
        >
          <img
            src={msg.avatarUrl}
            alt={msg.name}
            className="w-full h-full rounded-full border-2 border-transparent group-hover:border-purple-400 transition-colors"
          />
          <span className="absolute -bottom-1 -right-1 bg-[#2a2b30] border-2 border-[#18191c] rounded-full px-1 text-xs text-purple-400 font-bold">{msg.level}</span>
        </button>
        <div className="flex-grow min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <button className="font-semibold text-white mr-2 hover:underline" onClick={() => openUserProfile(msg)} title="View profile">
              {msg.name}
            </button>
            <time className="text-xs text-gray-400">{displayTime}</time>
          </div>
          {msg.replyToName && msg.replySnippet && (
            <div className="mb-2 rounded-md bg-white/5 border border-white/10 px-3 py-2">
              <div className="flex items-center gap-2 mb-1 text-xs">
                <span className="inline-flex items-center justify-center w-4 h-4 rounded-sm bg-purple-500/25 text-purple-200 text-[10px]">↪</span>
                <span className="font-semibold text-gray-200">{msg.replyToName}</span>
              </div>
              <div className="text-xs text-gray-400 line-clamp-2">
                {msg.replySnippet}
              </div>
            </div>
          )}
          <p className="text-gray-200 text-sm leading-relaxed whitespace-pre-wrap break-words">
            {msg.text}
          </p>
          <div className="mt-1.5 hidden group-hover:flex">
            <button
              className="text-xs text-purple-300 hover:text-purple-200 flex items-center gap-1"
              onClick={() => {
                const snippet = msg.text.length > 60 ? msg.text.slice(0, 60) + '…' : msg.text;
                setReplyTo({ id: msg.id || String(index), name: msg.name, snippet });
              }}
              title="Reply"
            >
              <CornerDownLeft className="w-3 h-3" /> Reply
            </button>
          </div>
        </div>
      </div>
    );
  };

  const ChatNotice = ({ text, icon: Icon }: { text: string; icon: React.ElementType }) => (
    <div className="text-center text-sm text-gray-400 py-3 border-b border-t border-white/10">
      <div className="flex items-center justify-center gap-2">
        <Icon className="w-4 h-4" />
        <span>{text}</span>
      </div>
    </div>
  );

  const toggleBtn = (
    <button
      aria-label={collapsed ? 'Open chat' : 'Collapse chat'}
      onClick={() => setCollapsed((c) => !c)}
      className="absolute -right-4 top-24 w-9 h-9 rounded-xl bg-[#222327]/90 hover:bg-[#2a2b30] border border-white/10 shadow-lg backdrop-blur-sm flex items-center justify-center text-gray-200 hover:text-white"
      title={collapsed ? 'Open chat' : 'Hide chat'}
    >
      {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
    </button>
  );

  return (
    <>
      {/* Fixed logo/banner section */}
      <aside className="fixed top-0 left-0 h-24 w-80 bg-[#18191c] border-r border-white/10 z-50">
        <button
          onClick={() => navigate('/')}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          style={backgroundStyle}
          className="h-24 w-full flex flex-row items-center justify-center gap-2 relative overflow-hidden"
        >
          <img src={casinoLogo} alt="Casino Logo" className="w-24 h-24 drop-shadow-[0_0_10px_rgba(99,102,241,0.7)]" />
          <h1 className="font-extrabold text-2xl text-white tracking-wide">SolBombs</h1>
        </button>
      </aside>

      {/* Dedicated separator line */}
      <div className="fixed top-[95px] left-0 w-80 h-px bg-white/10 z-[60]" />

      {/* Collapsible chat section */}
      <aside className={`fixed top-[96px] ${collapsed ? 'left-[-48px] w-12' : 'left-0 w-80'} h-[calc(100vh-6rem)] bg-[#18191c] border-r border-white/10 z-40 flex flex-col transition-[width,left] duration-300 ease-in-out`}>
        {toggleBtn}
        {/* Chat content - hidden when collapsed */}
        <div className={`flex-1 overflow-hidden ${collapsed ? 'hidden' : 'flex flex-col'}`}>
          <div className="flex-1 overflow-y-auto pt-2 no-scrollbar bg-[#18191c]">
            {isChatPaused && (
              <ChatNotice text="Chat is paused by the streamer" icon={PauseCircle} />
            )}
            {!isChatPaused && messages.map((m, i) => renderMessage(m, i))}
            <div ref={messagesEndRef} />
          </div>

          <div className="p-4 bg-[#1e1f22] border-t border-white/10">
          {replyTo && (
            <div className="mb-2 px-3 py-2 bg-[#0b0e14] border border-purple-400/30 rounded-md flex items-start justify-between shadow-[0_6px_20px_rgba(0,0,0,0.25)]">
              <div className="text-xs">
                <div className="text-gray-300">Replying to <span className="font-semibold text-white">{replyTo.name}</span></div>
                <div className="text-gray-400 italic line-clamp-1">{replyTo.snippet}</div>
              </div>
              <button onClick={() => setReplyTo(null)} className="text-gray-400 hover:text-purple-200 transition-colors" title="Cancel reply">
                <X className="w-4 h-4" />
              </button>
            </div>
          )}
          <form onSubmit={sendMessage} className="relative">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={isConnected ? 'Type a message...' : 'Connect wallet to chat'}
              className="w-full bg-white/5 border border-white/10 focus:border-purple-400/60 rounded-lg pl-4 pr-20 py-2 text-white placeholder-gray-400/80 transition-colors disabled:opacity-50"
              disabled={!isConnected || isChatPaused}
            />
            <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
              <button type="button" onClick={() => setShowEmoji((s) => !s)} className="p-1 text-gray-300 hover:text-white" title="Emoji">
                <Smile className="w-4 h-4" />
              </button>
              <button
                type="submit"
                disabled={!isConnected || !input.trim() || !wsReady}
                className="px-2 py-1 text-xs bg-purple-600 hover:bg-purple-500 disabled:opacity-50 rounded text-white shadow-[0_6px_20px_rgba(167,139,250,0.25)]"
              >
                Send
              </button>
            </div>
            {showEmoji && (
              <div className="absolute bottom-10 right-2 bg-[#0b0e14] border border-white/10 rounded-lg shadow-[0_10px_30px_rgba(0,0,0,0.4)] p-2 grid grid-cols-6 gap-1 z-10">
                {['😀','😁','😂','🤣','😊','😍','😎','😏','😢','😭','😡','👍','👎','🙏','👏','🔥','💯','🎉','🎲','🪙','🚀','💎','⭐','⚡','💥','🧨','🤑','🤝','🤞','🙂','😉','😅','🤔','😴','😇'].map((emo) => (
                  <button
                    key={emo}
                    type="button"
                    className="hover:bg-white/10 rounded transition-colors"
                    onClick={() => { setInput((v) => v + emo); setShowEmoji(false); }}
                  >
                    {emo}
                  </button>
                ))}
              </div>
            )}
          </form>
          <div className="mt-3 flex items-center justify-between text-xs text-gray-400">
            <button className="flex items-center gap-1 hover:text-white/90 transition-colors" onClick={() => alert('Be respectful. No spam, hate speech, or scams. Keep it legal. Mods may time-out offenders.') }>
              <Info className="w-4 h-4" />
              Chat Rules
            </button>
            <div className="flex items-center gap-1">
              <UsersIcon className="w-4 h-4" />
              <span>{onlineCount}</span>
            </div>
          </div>
        </div>
      </div>
      </aside>

      {/* Profile Statistics Modal */}
      <Dialog open={profileOpen} onOpenChange={(o) => { setProfileOpen(o); if (!o) { setSelectedUser(null); setSelectedUserStats(null); setProfileError(null); } }}>
        <DialogContent className="max-w-2xl bg-[#0f1115] border border-white/10">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              {selectedUser && (
                <img src={selectedUser.avatarUrl || defaultAvatar} alt={selectedUser.name} className="w-10 h-10 rounded-full" />
              )}
              <span className="text-lg">{selectedUser?.name || 'Profile'}</span>
            </DialogTitle>
            <DialogDescription className="text-gray-400">Overall statistics and recent performance</DialogDescription>
          </DialogHeader>
          <div className="space-y-6">
            {/* Summary Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="bg-[#131622] rounded-lg p-4 border border-white/10">
                <p className="text-xs text-gray-400 mb-1">Total Wagered</p>
                <div className="flex items-center gap-2">
                  <SolanaLogo className="w-5 h-5 drop-shadow-[0_1px_6px_rgba(167,139,250,0.35)]" />
                  <p className="text-2xl font-bold">{(selectedUserStats?.totalWagered ?? 0).toFixed(2)}</p>
                </div>
              </div>
              <div className="bg-[#131622] rounded-lg p-4 border border-white/10">
                <p className="text-xs text-gray-400 mb-1">Overall Profit</p>
                <div className="flex items-center gap-2">
                  <SolanaLogo className="w-5 h-5 drop-shadow-[0_1px_6px_rgba(167,139,250,0.35)]" />
                  <p className="text-2xl font-bold">{(() => {
                    const hist = selectedUserStats?.gameHistory || [];
                    const profit = hist.reduce((acc, g:any) => acc + (Number(g.netProfit) || 0), 0);
                    return profit.toFixed(2);
                  })()}</p>
                </div>
              </div>
            </div>

            {/* Chart */}
            <div className="h-64 bg-[#131622] rounded-lg border border-white/10 p-3">
              {profileLoading ? (
                <div className="w-full h-full flex flex-col gap-2 justify-center">
                  <div className="mx-3 h-3 rounded bg-white/10 animate-pulse" />
                  <div className="mx-3 h-3 rounded bg-white/10 animate-pulse delay-75" />
                  <div className="mx-3 h-3 rounded bg-white/10 animate-pulse delay-150" />
                  <div className="mx-3 h-3 rounded bg-white/10 animate-pulse delay-200" />
                  <div className="mx-3 h-3 rounded bg-white/10 animate-pulse delay-300" />
                </div>
              ) : profileError ? (
                <div className="w-full h-full flex items-center justify-center text-red-400">{profileError}</div>
              ) : (selectedUserStats?.gameHistory?.length ?? 0) === 0 ? (
                <div className="w-full h-full flex items-center justify-center text-gray-400">No games yet</div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData} margin={{ top: 5, right: 16, left: -10, bottom: 5 }}>
                    <defs>
                      <linearGradient id="userProfitGradientPurple" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.45} />
                        <stop offset="100%" stopColor="#8b5cf6" stopOpacity={0.05} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255, 255, 255, 0.08)" />
                    <XAxis dataKey="idx" stroke="#9ca3af" tickLine={false} axisLine={{ stroke: '#374151' }} />
                    <YAxis stroke="#9ca3af" tickLine={false} axisLine={{ stroke: '#374151' }} />
                    <Tooltip formatter={(v: number) => [`${Number(v).toFixed(2)} SOL`, 'Overall Profit']} contentStyle={{ backgroundColor: '#0b0e14', border: '1px solid #1f2937', borderRadius: 8 }} labelStyle={{ color: '#9ca3af' }} />
                    <ReferenceLine y={0} stroke="#6b7280" strokeDasharray="3 3" />
                    <Area type="monotone" dataKey="profit" name="Overall Profit" stroke="#a78bfa" strokeWidth={2.2} fill="url(#userProfitGradientPurple)" activeDot={{ r: 5 }} />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default LiveChat; 