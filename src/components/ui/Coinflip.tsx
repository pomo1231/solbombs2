import React, { useState, useEffect } from 'react';
import './coin.css';
import { Bot, User } from 'lucide-react';
import { Button } from './button';

interface CoinflipProps {
  onAnimationComplete: (winner: 'player' | 'opponent') => void;
  winner: 'player' | 'opponent';
  onLobbyReturn: () => void;
}

export const Coinflip: React.FC<CoinflipProps> = ({ onAnimationComplete, winner, onLobbyReturn }) => {
  const [flipping, setFlipping] = useState(true);
  const [landed, setLanded] = useState(false);

  useEffect(() => {
    const flipTimer = setTimeout(() => {
      setFlipping(false);
      onAnimationComplete(winner);
      const landedTimer = setTimeout(() => setLanded(true), 1500); // Wait for the coin to settle
      return () => clearTimeout(landedTimer);
    }, 2500); // Animation duration

    return () => clearTimeout(flipTimer);
  }, [onAnimationComplete, winner]);

  return (
    <div className="flex flex-col items-center justify-center p-4">
      <div className="w-48 h-48 perspective-1000">
        <div 
          className={`w-full h-full relative preserve-3d transition-transform duration-3000 ${flipping ? 'animate-coin-flip' : ''}`}
          style={{ transform: !flipping ? (winner === 'player' ? 'rotateY(0deg)' : 'rotateY(180deg)') : undefined }}
        >
          {/* Player side */}
          <div className="absolute w-full h-full backface-hidden bg-gradient-to-br from-blue-400 to-blue-600 rounded-full flex items-center justify-center border-4 border-blue-200">
            <User className="w-24 h-24 text-white" />
          </div>
          {/* Opponent side */}
          <div className="absolute w-full h-full backface-hidden bg-gradient-to-br from-red-400 to-red-600 rounded-full flex items-center justify-center border-4 border-red-200 rotate-y-180">
            <Bot className="w-24 h-24 text-white" />
          </div>
        </div>
      </div>
      <div className="mt-6 text-xl font-bold text-white h-10 flex items-center">
        {flipping ? 'Flipping for the win...' : landed ? `${winner === 'player' ? 'You' : 'Bot'} won the coinflip!` : '...'}
      </div>
      {landed && (
        <Button onClick={onLobbyReturn} className="mt-4 w-full">
          Back to Lobby
        </Button>
      )}
    </div>
  );
}; 