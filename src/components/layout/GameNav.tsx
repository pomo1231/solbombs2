import React from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { toast } from '@/hooks/use-toast';
import { useWallet } from '@solana/wallet-adapter-react';
import { useStats } from '@/context/StatsContext';
import { generateAvatarUrl } from '@/lib/utils';
import defaultAvatar from '@/assets/default-avatar.png';
import { Badge } from '@/components/ui/badge';
import { WalletConnect } from '@/components/WalletConnect';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Menu } from 'lucide-react';
import { useI18n } from '@/context/I18nContext';

export const GameNav = () => {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get('tab') === 'solo' ? 'solo' : '1v1';
  const { publicKey, disconnect } = useWallet();
  const { isStreamerMode, userProfile } = useStats();

  const getAvatar = () => {
    if (isStreamerMode) return generateAvatarUrl('streamer');
    if (userProfile?.avatarUrl) return userProfile.avatarUrl;
    return defaultAvatar;
  };

  const claimGuard = () => {
    try {
      const raw = localStorage.getItem('pvp_claim_required');
      if (raw) {
        toast({ title: t('nav.claimRequiredTitle'), description: t('nav.claimRequiredDesc'), variant: 'destructive' });
        return false;
      }
    } catch {}
    return true;
  };

  const handleNav = (tab: 'solo' | '1v1') => {
    if (!claimGuard()) return;
    navigate(`/?tab=${tab}`);
  };

  return (
    <nav className="sticky top-8 h-16 bg-[#18191c] border-b border-white/10 z-10 flex items-center justify-between px-6 ml-80">
      {/* Left side */}
      <div className="flex items-center gap-2">
        <Button
          variant={activeTab === 'solo' ? 'neon' : 'ghost'}
          onClick={() => handleNav('solo')}
          className="rounded-full"
        >
          {t('nav.soloMines')}
        </Button>
        <Button
          variant={activeTab === '1v1' ? 'neon' : 'ghost'}
          onClick={() => handleNav('1v1')}
          className="rounded-full"
        >
          {t('nav.pvp')}
        </Button>
      </div>

      {/* Right side */}
      <div className="flex items-center gap-4">
          {publicKey ? (
            <>
              <div className="flex items-center gap-2 text-sm text-foreground/60">
                <WalletConnect />
              </div>
              <button
                onClick={() => { if (claimGuard()) navigate('/options'); }}
                className="w-10 h-10 rounded-full overflow-hidden focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-background focus:ring-primary"
              >
                <img src={getAvatar()} alt="User Avatar" className="w-full h-full object-cover" />
              </button>
            </>
          ) : (
            <WalletConnect />
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon">
                <Menu className="h-6 w-6" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => { if (claimGuard()) navigate('/options'); }}>
                {t('nav.options')}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => { if (claimGuard()) navigate('/statistics'); }}>
                {t('nav.statistics')}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => { if (claimGuard()) navigate('/transactions'); }}>
                {t('nav.transactions')}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => disconnect()}>
                {t('nav.disconnect')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
    </nav>
  );
}; 