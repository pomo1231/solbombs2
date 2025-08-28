import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { useWallet } from '@solana/wallet-adapter-react';
import Index from "./pages/index";
import NotFound from "./pages/NotFound";
import ProfilePage from "./pages/Profile";
import LiveChat from './components/LiveChat';
import CrispChatSetup from './components/CrispChatSetup';
import { GameHistoryPage } from './pages/GameHistory';
import { LeaderboardPage } from './pages/Leaderboard';
import { MultiplayerLobbyPage } from './pages/MultiplayerLobbyPage';
import { GameNav } from './components/layout/GameNav';
import TopHeader from './components/layout/TopHeader';
import OptionsPage from './pages/Options';
import StatisticsPage from './pages/Statistics';
import TransactionsPage from './pages/Transactions';
import ProvablyFairPage from './pages/ProvablyFair';
import TermsOfServicePage from './pages/TermsOfService';
import SupportPage from './pages/Support';

export function App() {
  const { publicKey, connected } = useWallet();
  const [wallet, setWallet] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    // Base the connection state on the `connected` flag from the wallet adapter
    if (connected && publicKey) {
      setWallet(publicKey.toBase58());
      setIsConnected(true);
    } else {
      setWallet(null);
      setIsConnected(false);
    }
  }, [publicKey, connected]);

  const Layout = ({ children }: { children: React.ReactNode }) => {
    return (
      <div className="min-h-screen bg-background relative flex">
        <LiveChat wallet={wallet} isConnected={isConnected} />
        <div className="flex-1 flex flex-col" style={{ marginLeft: 320 }}>
          <TopHeader />
          <GameNav />
          <main className="flex-1 overflow-y-auto px-6">
            {children}
          </main>
        </div>
      </div>
    );
  };

  return (
    <BrowserRouter>
      <CrispChatSetup enabled={isConnected} />
      <Routes>
        <Route
          path="/"
          element={
            <Layout>
              <Index />
            </Layout>
          }
        />
        <Route
          path="/profile"
          element={
            <Layout>
              <ProfilePage />
            </Layout>
          }
        />
        <Route
          path="/history"
          element={
            <Layout>
              <GameHistoryPage />
            </Layout>
          }
        />
        <Route
          path="/leaderboard"
          element={
            <Layout>
              <LeaderboardPage />
            </Layout>
          }
        />
        <Route
          path="/lobby"
          element={
            <Layout>
              <MultiplayerLobbyPage onStartGame={() => {}} />
            </Layout>
          }
        />
        <Route
          path="/options"
          element={
            <Layout>
              <OptionsPage />
            </Layout>
          }
        />
        <Route
          path="/statistics"
          element={
            <Layout>
              <StatisticsPage />
            </Layout>
          }
        />
        <Route
          path="/transactions"
          element={
            <Layout>
              <TransactionsPage />
            </Layout>
          }
        />
        <Route
          path="/provably-fair"
          element={
            <Layout>
              <ProvablyFairPage />
            </Layout>
          }
        />
        <Route
          path="/terms-of-service"
          element={
            <Layout>
              <TermsOfServicePage />
            </Layout>
          }
        />
        <Route
          path="/support"
          element={
            <Layout>
              <SupportPage />
            </Layout>
          }
        />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  );
}
