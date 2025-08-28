import React from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
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

export const GameNav = () => {
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

  const handleNav = (tab: 'solo' | '1v1') => {
    navigate(`/?tab=${tab}`);
  };

  return (
    <div className="flex items-center justify-between h-16 px-6 bg-[#18191c] border-b border-white/10">
      {/* Left side */}
      <div className="flex items-center gap-2">
        <Button
          variant={activeTab === 'solo' ? 'neon' : 'ghost'}
          onClick={() => handleNav('solo')}
          className="rounded-full"
        >
          Solo Mines
        </Button>
        <Button
          variant={activeTab === '1v1' ? 'neon' : 'ghost'}
          onClick={() => handleNav('1v1')}
          className="rounded-full"
        >
          1v1
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
                onClick={() => navigate('/options')}
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
              <DropdownMenuItem onClick={() => navigate('/options')}>
                Options
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate('/statistics')}>
                Statistics
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate('/transactions')}>
                Transactions
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => disconnect()}>
                Disconnect
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
    </div>
  );
}; 