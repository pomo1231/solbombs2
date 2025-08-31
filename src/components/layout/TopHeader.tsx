import { useNavigate } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { useSocket } from '@/context/SocketContext';
import { useI18n } from '@/context/I18nContext';

const TopHeader = () => {
  const navigate = useNavigate();
  const { onlineCount } = useSocket();
  const { t } = useI18n();

  const openCrispChat = () => {
    if ((window as any).$crisp) {
      (window as any).$crisp.push(['do', 'chat:open']);
    }
  };

  return (
    <header className="sticky top-0 h-8 bg-[#18191c] border-b border-white/10 z-10 flex items-center justify-between px-6 ml-80">
      <div className="flex items-center space-x-6 text-xs font-medium">
        <button
          onClick={() => navigate('/provably-fair')}
          className="text-zinc-400 hover:text-white transition-colors"
        >
          {t('header.provablyFair')}
        </button>
        <button
          onClick={() => navigate('/terms-of-service')}
          className="text-zinc-400 hover:text-white transition-colors"
        >
          {t('header.termsOfService')}
        </button>
        <button
          onClick={openCrispChat}
          className="text-zinc-400 hover:text-white transition-colors"
        >
          {t('header.support')}
        </button>
      </div>
      <Badge variant="outline" className="bg-green-500/10 border-green-500/20 text-green-400">
        <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse mr-2" />
        {t('header.online', { count: String(onlineCount) })}
      </Badge>
    </header>
  );
};

export default TopHeader; 