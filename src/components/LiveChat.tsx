import { useState, useRef, useEffect, FC, FormEvent, MouseEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import casinoLogo from '@/assets/casino-logo.gif';
import { Smile, Info, MessageCircle, PauseCircle, Gift, Users as UsersIcon } from 'lucide-react';
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
  from: string;
  text: string;
  name: string;
  timestamp: string; // ISO string
  avatarUrl: string;
  level: number;
}

// Prefer configurable websocket URL; default to 8081 to match server.js
const WS_URL = (import.meta as any).env?.VITE_WS_URL || `ws://${window.location.hostname}:8081`;

const LiveChat: FC<LiveChatProps> = ({ wallet, isConnected }) => {
  const navigate = useNavigate();
  const { level, isStreamerMode, userProfile, updateUserProfile } = useStats();
  const { onlineCount } = useSocket();
  const [messages, setMessages] = useState<Message[]>(() => {
    const saved = localStorage.getItem('chat-history');
    return saved ? JSON.parse(saved) : [];
  });
  const [input, setInput] = useState('');
  const [isChatPaused, setIsChatPaused] = useState(false);
  const ws = useRef<WebSocket | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
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


  // Demo: fake user count and airdrop balance
  const [airdrop, setAirdrop] = useState(0.266);

  useEffect(() => {
    localStorage.setItem('chat-history', JSON.stringify(messages.slice(-100)));
  }, [messages]);

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
    };

    ws.current.onerror = (err) => {
      console.warn('[LiveChat] websocket error', err);
    };

    ws.current.onclose = () => {
      console.warn('[LiveChat] websocket closed');
    };

    ws.current.onmessage = (event) => {
      try {
        const msgData = JSON.parse(event.data);
        const newMessage: Message = {
            ...msgData,
            timestamp: new Date().toISOString(),
            avatarUrl: msgData.avatarUrl || defaultAvatar, 
        };
        if (newMessage.from && newMessage.text && newMessage.name && newMessage.level !== undefined) {
            setMessages((prev) => [...prev, newMessage]);
        } else {
            console.error("Received incomplete websocket message", msgData);
        }
      } catch (e) {
        console.error("Failed to parse websocket message", e);
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
    if (!input.trim() || !wallet || !ws.current || ws.current.readyState !== WebSocket.OPEN || !userProfile) return;
    
    const senderName = isStreamerMode ? 'Streamer' : userProfile.name;
    const avatarUrl = isStreamerMode ? generateAvatarUrl('streamer') : userProfile.avatarUrl;

    const msg: Message = { 
      from: wallet, 
      text: input, 
      name: senderName, 
      timestamp: new Date().toISOString(),
      avatarUrl: avatarUrl,
      level: level,
    };
    setMessages((prev) => [...prev, msg]);

    ws.current.send(JSON.stringify({ 
        type: 'chatMessage',
        from: wallet, 
        text: input, 
        name: senderName,
        level: level,
        avatarUrl: avatarUrl,
    }));
    setInput('');
  };

  const renderMessage = (msg: Message, index: number) => {
    const date = new Date(msg.timestamp);
    const displayTime = !isNaN(date.getTime())
      ? date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      : '';
    return (
      <div key={index} className="flex p-3 group mx-2 my-1 rounded-lg transition-colors hover:bg-white/5">
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
          <p className="text-gray-300 text-sm leading-relaxed whitespace-pre-wrap break-words">
            {msg.text}
          </p>
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

  return (
    <aside className="fixed top-0 left-0 h-screen w-80 bg-[#18191c] border-r border-white/10 z-50 flex flex-col">
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
         {messages.map(renderMessage)}
         <div ref={messagesEndRef} />
      </div>

       {isChatPaused && <ChatNotice text="Chat Paused" icon={PauseCircle} />}
       
       <div className="p-4 bg-[#1e1f22] border-t border-white/10">
         <form onSubmit={sendMessage} className="relative">
           <input
             type="text"
             value={input}
             onChange={(e) => setInput(e.target.value)}
             placeholder={isConnected ? "Type a message..." : "Connect wallet to chat"}
             className="w-full bg-[#23242a] border border-[#35364a] focus:border-indigo-500 rounded-lg pl-4 pr-10 py-2 text-white placeholder-gray-400 transition-colors disabled:opacity-50"
             disabled={!isConnected || isChatPaused}
           />
           <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white">
             <Smile className="w-5 h-5" />
           </button>
         </form>
         <div className="flex justify-between items-center mt-2 text-xs text-gray-400">
           <button className="flex items-center gap-1 hover:text-white">
             <Info className="w-3 h-3" /> Chat Rules
           </button>
           <div className="flex items-center gap-1">
             <MessageCircle className="w-3 h-3" /> {messages.length}
           </div>
         </div>
       </div>
    </aside>
  );
};

export default LiveChat; 