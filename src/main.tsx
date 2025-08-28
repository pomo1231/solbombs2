import { createRoot } from 'react-dom/client'
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import '@solana/wallet-adapter-react-ui/styles.css';
import { useEffect, useMemo, useState } from 'react';
import './index.css'
import { PhantomWalletAdapter } from '@solana/wallet-adapter-phantom';
import { SolflareWalletAdapter } from '@solana/wallet-adapter-solflare';
import { BackpackWalletAdapter } from '@solana/wallet-adapter-backpack';
import { GlowWalletAdapter } from '@solana/wallet-adapter-glow';
import { LedgerWalletAdapter } from '@solana/wallet-adapter-ledger';
import { ExodusWalletAdapter } from '@solana/wallet-adapter-exodus';
import { StatsProvider } from '@/context/StatsContext';
import { App } from './App';
import { HeaderProvider } from '@/context/HeaderContext';
import { XPProvider } from '@/context/XPContext';
import { SocketProvider } from '@/context/SocketContext';
import { SoundProvider } from '@/context/SoundContext';

const queryClient = new QueryClient();

// Simple session handling for wallet auto-connect
// - Persists last activity timestamp in localStorage
// - If inactive beyond the configured hours, clear saved wallet and disable auto-connect for next load
const WALLET_LAST_SEEN_KEY = 'walletSessionLastSeen';
const WALLET_SAVED_NAME_KEY = 'walletName'; // used by wallet-adapter to remember the selected wallet

function useWalletAutoConnect() {
  const hours = Number(import.meta.env.VITE_WALLET_SESSION_HOURS ?? 6);
  const maxIdleMs = isFinite(hours) && hours > 0 ? hours * 60 * 60 * 1000 : 6 * 60 * 60 * 1000;
  const [autoConnect, setAutoConnect] = useState(true);

  useEffect(() => {
    const now = Date.now();
    const lastSeenStr = localStorage.getItem(WALLET_LAST_SEEN_KEY);
    const lastSeen = lastSeenStr ? Number(lastSeenStr) : 0;
    const expired = lastSeen && now - lastSeen > maxIdleMs;

    if (expired) {
      // Clear the saved wallet so autoConnect doesn't re-open it
      try { localStorage.removeItem(WALLET_SAVED_NAME_KEY); } catch {}
      setAutoConnect(false);
    } else {
      setAutoConnect(true);
    }

    // Update last seen on user activity and periodically
    const markActivity = () => {
      try { localStorage.setItem(WALLET_LAST_SEEN_KEY, String(Date.now())); } catch {}
    };

    // Initial mark on load
    markActivity();

    const activityEvents = ['click', 'keydown', 'mousemove', 'touchstart', 'visibilitychange'];
    activityEvents.forEach(evt => window.addEventListener(evt, markActivity, { passive: true } as any));

    // Heartbeat every 60s in case of long idle with no events but still active tab
    const interval = window.setInterval(markActivity, 60_000);

    return () => {
      activityEvents.forEach(evt => window.removeEventListener(evt, markActivity as any));
      window.clearInterval(interval);
    };
  }, [maxIdleMs]);

  return autoConnect;
}

function AppProviders() {
  const endpoint = import.meta.env.VITE_SOLANA_RPC || (import.meta.env.VITE_SOLANA_CLUSTER === 'mainnet' ? 'https://api.mainnet-beta.solana.com' : 'https://api.devnet.solana.com');
  const wallets = useMemo(() => [
    new PhantomWalletAdapter(),
    new SolflareWalletAdapter(),
    new BackpackWalletAdapter(),
    new GlowWalletAdapter(),
    new LedgerWalletAdapter(),
    new ExodusWalletAdapter(),
  ], []);
  const autoConnect = useWalletAutoConnect();

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect={autoConnect}>
        <WalletModalProvider>
          <StatsProvider>
            <XPProvider>
              <SocketProvider>
                <QueryClientProvider client={queryClient}>
                  <TooltipProvider>
                    <Toaster />
                    <Sonner />
                    <SoundProvider>
                      <HeaderProvider>
                        <App />
                      </HeaderProvider>
                    </SoundProvider>
                  </TooltipProvider>
                </QueryClientProvider>
              </SocketProvider>
            </XPProvider>
          </StatsProvider>
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}

createRoot(document.getElementById("root")!).render(<AppProviders />);
