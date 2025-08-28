import { SoloMinesGame } from './SoloMinesGame';
import MultiplayerMinesGame from './MultiplayerMinesGame';

interface GameSettings {
  bombs: number;
  amount: number;
  // Optional PvP on-chain context
  pvpGamePda?: string;
  creator?: string;
  joiner?: string | null;
  vsRobot?: boolean;
  opponent: 'bot' | 'player' | null;
}

interface MinesGameProps {
  mode: 'solo' | '1v1';
  onBack: () => void;
  gameSettings?: GameSettings;
}

export function MinesGame({ mode, onBack, gameSettings }: MinesGameProps) {
  if (mode === 'solo') {
    return <SoloMinesGame onBack={onBack} />;
  }

  return <MultiplayerMinesGame onBack={onBack} settings={gameSettings} />;
}
