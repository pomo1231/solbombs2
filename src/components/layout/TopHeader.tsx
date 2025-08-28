import { useNavigate } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { useSocket } from '@/context/SocketContext';

const TopHeader = () => {
  const navigate = useNavigate();
  const { onlineCount } = useSocket();

  const openCrispChat = () => {
    if ((window as any).$crisp) {
      (window as any).$crisp.push(['do', 'chat:show']);
      (window as any).$crisp.push(['do', 'chat:open']);
    }
  };

  return (
    <div className="h-8 bg-[#18191c] w-full flex items-center justify-between px-4 border-b border-white/10">
      <div className="flex items-center space-x-6 text-xs font-medium">
        <button
          onClick={() => navigate('/provably-fair')}
          className="text-zinc-400 hover:text-white transition-colors"
        >
          Provably Fair
        </button>
        <button
          onClick={() => navigate('/terms-of-service')}
          className="text-zinc-400 hover:text-white transition-colors"
        >
          Terms of Service
        </button>
        <button
          onClick={openCrispChat}
          className="text-zinc-400 hover:text-white transition-colors"
        >
          Support
        </button>
      </div>
      <Badge variant="outline" className="bg-green-500/10 border-green-500/20 text-green-400">
        <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse mr-2" />
        {onlineCount} Online
      </Badge>
    </div>
  );
};

export default TopHeader; 