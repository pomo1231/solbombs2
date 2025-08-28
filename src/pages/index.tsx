import { useNavigate, useSearchParams } from 'react-router-dom';
import { MultiplayerLobbyPage } from './MultiplayerLobbyPage';
import { MinesGame } from '@/components/MinesGame';
import { useState, useEffect } from 'react';

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
  
  const [multiplayerView, setMultiplayerView] = useState<'lobby' | 'game'>('lobby');
  const [gameSettings, setGameSettings] = useState<GameSettings | null>(null);

  const handleStartGame = (settings: GameSettings) => {
    setGameSettings(settings);
    setMultiplayerView('game');
  };

  const handleEndGame = () => {
    setMultiplayerView('lobby');
    setGameSettings(null);
  };

  useEffect(() => {
    // When switching to the 'solo' tab, ensure we are not in a 1v1 game view
    if (activeTab === 'solo' && multiplayerView === 'game') {
      handleEndGame();
    }
  }, [activeTab, multiplayerView]);

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
