import { useNavigate, useSearchParams } from 'react-router-dom';
import { MultiplayerLobbyPage } from './MultiplayerLobbyPage';
import { MinesGame } from '@/components/MinesGame';
import { useState, useEffect } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';

interface GameSettings {
  bombs: number;
  amount: number;
  opponent: 'bot' | 'player' | null;
  // Optional PvP context passed from lobby when starting vs Bot or player
  pvpGamePda?: string;
  creator?: string;
  joiner?: string | null;
  vsRobot?: boolean;
}

export default function Index() {
  const [searchParams] = useSearchParams();
  const activeTab = searchParams.get('tab') === 'solo' ? 'solo' : '1v1';
  const wallet = useWallet();
  const LS_PVP_KEY = 'pvp_game_state_v1';
  
  const [multiplayerView, setMultiplayerView] = useState<'lobby' | 'game'>('lobby');
  const [gameSettings, setGameSettings] = useState<GameSettings | null>(null);

  const handleStartGame = (settings: GameSettings) => {
    // Starting a truly new game: clear any persisted 1v1 state
    try { localStorage.removeItem(LS_PVP_KEY); } catch {}
    setGameSettings(settings);
    setMultiplayerView('game');
  };

  const handleEndGame = () => {
    // Returning to lobby: clear persisted 1v1 state so former game doesn't restore
    try { localStorage.removeItem(LS_PVP_KEY); } catch {}
    setMultiplayerView('lobby');
    setGameSettings(null);
  };

  useEffect(() => {
    // When switching to the 'solo' tab, ensure we are not in a 1v1 game view
    if (activeTab === 'solo' && multiplayerView === 'game') {
      handleEndGame();
    }
  }, [activeTab, multiplayerView]);

  // Auto-resume 1v1 game after refresh if saved state indicates a game in progress
  useEffect(() => {
    if (activeTab !== '1v1') return;
    try {
      const raw = localStorage.getItem(LS_PVP_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw);
      const currentWallet = wallet.publicKey?.toBase58?.();
      if (!saved || (saved.wallet && saved.wallet !== currentWallet)) return;
      // Consider in-progress if not gameOver and minesPlaced (we prepared a board)
      if (!saved.state || saved.state.gameOver !== false) return;
      if (!saved.state.minesPlaced) return;
      // Use saved settings to re-enter the game view
      if (saved.settings) {
        setGameSettings(saved.settings as GameSettings);
        setMultiplayerView('game');
      }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, wallet.publicKey]);

  const renderMultiplayerContent = () => {
    if (multiplayerView === 'game' && gameSettings) {
      return <MinesGame mode="1v1" onBack={handleEndGame} gameSettings={gameSettings} />;
    }
    return <MultiplayerLobbyPage onStartGame={handleStartGame} />;
  };

  return (
    <div className="container mx-auto flex-1 px-4 sm:px-6 lg:px-8 py-4">
      {activeTab === '1v1' ? renderMultiplayerContent() : <MinesGame mode="solo" onBack={() => {}} />}
    </div>
  );
}
