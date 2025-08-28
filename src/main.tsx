import { createRoot } from 'react-dom/client'
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import '@solana/wallet-adapter-react-ui/styles.css';
import { useMemo } from 'react';
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

const queryClient = new QueryClient();

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

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets}>
        <WalletModalProvider>
          <StatsProvider>
            <XPProvider>
              <SocketProvider>
                <QueryClientProvider client={queryClient}>
                  <TooltipProvider>
                    <Toaster />
                    <Sonner />
                    <HeaderProvider>
                      <App />
                    </HeaderProvider>
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
