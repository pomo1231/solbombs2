import { useState, useRef, useEffect, FC, FormEvent, MouseEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import casinoLogo from '@/assets/casino-logo.gif';
import { Smile, Info, MessageCircle, PauseCircle, Gift, Users as UsersIcon, CornerDownLeft, X } from 'lucide-react';
import { generateAvatarUrl } from '@/lib/utils';
import { useStats } from '@/context/StatsContext';
import { Badge } from '@/components/ui/badge';
import defaultAvatar from '@/assets/default-avatar.png';
import { useSocket } from '@/context/SocketContext';

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
  const { level, isStreamerMode, userProfile, updateUserProfile } = useStats();
  const { onlineCount } = useSocket();
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
  const [wsReady, setWsReady] = useState(false);
  const [replyTo, setReplyTo] = useState<{ id: string; name: string; snippet: string } | null>(null);
  const [showEmoji, setShowEmoji] = useState(false);
  const refreshTimer = useRef<number | null>(null);
  const knownIdsRef = useRef<Set<string>>(new Set());
  
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [isHovered, setIsHovered] = useState(false);

  const handleMouseMove = (e: MouseEvent<HTMLButtonElement>) => {
    setIsHovered(true);
    const rect = e.currentTarget.getBoundingClientRect();
    setMousePos({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    });
  };

  const handleMouseLeave = () => {
    setIsHovered(false);
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
      <div key={msg.id || index} className="flex p-3 group mx-2 my-1 rounded-lg transition-colors hover:bg-white/5">
        <div className="w-10 h-10 mr-4 flex-shrink-0 relative">
          <img
            src={msg.avatarUrl}
            alt={msg.name}
            className="w-full h-full rounded-full border-2 border-transparent group-hover:border-indigo-500 transition-colors"
          />
          <span className="absolute -bottom-1 -right-1 bg-[#2a2b30] border-2 border-[#18191c] rounded-full px-1 text-xs text-indigo-400 font-bold">{msg.level}</span>
        </div>
        <div className="flex-grow">
          <div className="flex items-baseline mb-1">
            <p className="font-semibold text-white mr-2">{msg.name}</p>
            <time className="text-xs text-gray-500">{displayTime}</time>
          </div>
          {msg.replyToName && msg.replySnippet && (
            <div className="text-xs text-gray-400 mb-1 pl-3 border-l border-white/10 italic">
              <span className="opacity-70">↪ </span>
              <span className="font-medium text-gray-300">{msg.replyToName}</span>
              <span className="opacity-70"> — {msg.replySnippet}</span>
            </div>
          )}
          <p className="text-gray-300 text-sm leading-relaxed whitespace-pre-wrap break-words">
            {msg.text}
          </p>
          <div className="mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1"
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
      className="absolute -right-4 top-1/2 -translate-y-1/2 w-8 h-8 rounded-lg bg-[#222327] hover:bg-[#2a2b30] border border-white/10 shadow-md flex items-center justify-center text-gray-300 hover:text-white"
      title={collapsed ? 'Open chat' : 'Hide chat'}
    >
      <span className="text-sm leading-none select-none">{collapsed ? '>' : '<'}</span>
    </button>
  );

  return (
    <aside className={`fixed top-0 left-0 h-screen w-80 bg-[#18191c] border-r border-white/10 z-50 flex flex-col transform transition-transform duration-300 ease-in-out ${collapsed ? '-translate-x-[calc(100%-16px)]' : 'translate-x-0'}`}>
      {toggleBtn}
      <button
        onClick={() => navigate('/')}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        style={backgroundStyle}
        className="h-24 flex flex-row items-center justify-center gap-2 relative overflow-hidden border-b border-white/10"
      >
        <img src={casinoLogo} alt="Casino Logo" className="w-24 h-24 drop-shadow-[0_0_10px_rgba(99,102,241,0.7)]" />
        <h1 className="font-extrabold text-2xl text-white tracking-wide">SolBombs</h1>
      </button>

      <div className="flex-1 overflow-y-auto pt-2 no-scrollbar bg-[#18191c]">
        {isChatPaused && (
          <ChatNotice text="Chat is paused by the streamer" icon={PauseCircle} />
        )}
        {!isChatPaused && messages.map((m, i) => renderMessage(m, i))}
        <div ref={messagesEndRef} />
      </div>

      <div className="p-4 bg-[#1e1f22] border-t border-white/10">
        {replyTo && (
          <div className="mb-2 px-3 py-2 bg-[#23242a] border border-white/10 rounded flex items-start justify-between">
            <div className="text-xs text-gray-300">
              Replying to <span className="font-semibold">{replyTo.name}</span>
              <div className="text-gray-400 italic">{replyTo.snippet}</div>
            </div>
            <button onClick={() => setReplyTo(null)} className="text-gray-400 hover:text-gray-200">
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
            className="w-full bg-[#23242a] border border-[#35364a] focus:border-indigo-500 rounded-lg pl-4 pr-20 py-2 text-white placeholder-gray-400 transition-colors disabled:opacity-50"
            disabled={!isConnected || isChatPaused}
          />
          <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
            <button type="button" onClick={() => setShowEmoji((s) => !s)} className="p-1 text-gray-300 hover:text-white" title="Emoji">
              <Smile className="w-4 h-4" />
            </button>
            <button
              type="submit"
              disabled={!isConnected || !input.trim() || !wsReady}
              className="px-2 py-1 text-xs bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 rounded text-white"
            >
              Send
            </button>
          </div>
          {showEmoji && (
            <div className="absolute bottom-10 right-2 bg-[#23242a] border border-white/10 rounded shadow-lg p-2 grid grid-cols-6 gap-1 z-10">
              {['😀','😁','😂','🤣','😊','😍','😎','😏','😢','😭','😡','👍','👎','🙏','👏','🔥','💯','🎉','🎲','🪙','🚀','💎','⭐','⚡','💥','🧨','🤑','🤝','🤞','🙂','😉','😅','🤔','😴','😇'].map((emo) => (
                <button
                  key={emo}
                  type="button"
                  className="hover:bg-white/10 rounded"
                  onClick={() => { setInput((v) => v + emo); setShowEmoji(false); }}
                >
                  {emo}
                </button>
              ))}
            </div>
          )}
        </form>
        <div className="mt-3 flex items-center justify-between text-xs text-gray-400">
          <button className="flex items-center gap-1 hover:text-gray-200" onClick={() => alert('Be respectful. No spam, hate speech, or scams. Keep it legal. Mods may time-out offenders.') }>
            <Info className="w-4 h-4" />
            Chat Rules
          </button>
          <div className="flex items-center gap-1">
            <UsersIcon className="w-4 h-4" />
            <span>{onlineCount}</span>
          </div>
        </div>
      </div>
    </aside>
  );
};

export default LiveChat; 