import { Button } from './ui/button';
import { Play, Users, User, Trophy } from 'lucide-react';

interface GameCardProps {
  title: string;
  description: string;
  mode: 'solo' | '1v1';
  playersOnline: number;
  onPlay: () => void;
}

export function GameCard({ title, description, mode, playersOnline, onPlay }: GameCardProps) {
  return (
    <div className="bg-gradient-card border border-primary/20 rounded-xl p-6 hover:border-primary/40 transition-all duration-300 hover:shadow-glow-primary group">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          {mode === 'solo' ? (
            <div className="bg-neon-cyan/20 p-3 rounded-lg">
              <User className="w-6 h-6 text-neon-cyan" />
            </div>
          ) : (
            <div className="bg-neon-purple/20 p-3 rounded-lg">
              <Users className="w-6 h-6 text-neon-purple" />
            </div>
          )}
          <div>
            <h3 className="text-xl font-bold text-foreground">{title}</h3>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span className="flex items-center gap-1">
                <div className="w-2 h-2 bg-neon-green rounded-full animate-pulse" />
                {playersOnline} online
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1 text-neon-gold">
          <Trophy className="w-4 h-4" />
          <span className="text-sm font-semibold">{mode === 'solo' ? '95%' : '98%'} RTP</span>
        </div>
      </div>
      
      <p className="text-muted-foreground mb-6 leading-relaxed">
        {description}
      </p>
      
      <div className="flex items-center justify-between">
        <div className="text-sm">
          <span className="text-neon-green font-semibold">Min bet:</span>
          <span className="ml-1 text-foreground">0.01 SOL</span>
        </div>
        <Button 
          variant={mode === 'solo' ? 'casino' : 'neon'} 
          onClick={onPlay}
          className="group-hover:scale-105 transition-transform duration-300"
        >
          <Play className="w-4 h-4 mr-2" />
          Play Now
        </Button>
      </div>
    </div>
  );
}