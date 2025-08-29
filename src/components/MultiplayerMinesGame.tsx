import { useState, useEffect, useMemo } from 'react';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Bomb, Gem, RotateCcw, DollarSign, User, Bot, Trophy } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { useStats } from '@/context/StatsContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog';
import seedrandom from 'seedrandom';
import { Coinflip } from './ui/Coinflip';
import crypto from 'crypto-js';
import { useWallet } from '@solana/wallet-adapter-react';
import { PublicKey } from '@solana/web3.js';
import { resolvePvpOnchain } from '@/lib/sol/anchorClient';
import { useSound } from '@/context/SoundContext';

// --- INTERFACES & TYPES ---
interface GameSettings {
  bombs: number;
  amount: number;
  // Optional PvP context (present for on-chain 1v1/bot games)
  pvpGamePda?: string;
  creator?: string;
  joiner?: string | null;
  vsRobot?: boolean;
}

interface MultiplayerMinesGameProps {
  onBack: () => void;
  settings?: GameSettings;
}

interface Tile {
  id: number;
  isRevealed: boolean;
  isBomb: boolean;
  revealedBy: 'player' | 'opponent' | null;
}

interface GameState {
  tiles: Tile[];
  activeTurn: 'player' | 'opponent';
  playerScore: number;
  opponentScore: number;
  playerHasHitBomb: boolean;
  opponentHasHitBomb: boolean;
  gameOver: boolean;
  winner: 'player' | 'opponent' | 'tie' | null;
  minesPlaced: boolean;
  betAmount: number;
  bombCount: number;
  gameSeed: string;
  serverSeed: string;
  clientSeed: string;
  nonce: number;
}

interface CoinflipState {
  show: boolean;
  winner: 'player' | 'opponent' | null;
}

// --- UTILITY FUNCTIONS ---
const createInitialState = (settings?: GameSettings): GameState => {
  const gameSeed = Date.now().toString();
  const rng = seedrandom(gameSeed);
  const isPlayerFirst = rng() < 0.5;
  
  return {
    tiles: Array(25).fill(null).map((_, id) => ({ id, isRevealed: false, isBomb: false, revealedBy: null })),
    activeTurn: isPlayerFirst ? 'player' : 'opponent',
    playerScore: 0,
    opponentScore: 0,
    playerHasHitBomb: false,
    opponentHasHitBomb: false,
    gameOver: false,
    winner: null,
    minesPlaced: false,
    betAmount: settings?.amount || 0.01,
    bombCount: settings?.bombs || 3,
    gameSeed,
    serverSeed: '',
    clientSeed: '',
    nonce: 0,
  };
};

const placeMines = (firstClickedId: number, bombCount: number, totalTiles: number, seed: string): Set<number> => {
  const minePositions = new Set<number>();
  const rng = seedrandom(seed);
  while (minePositions.size < bombCount) {
    const position = Math.floor(rng() * totalTiles);
    if (position !== firstClickedId) {
      minePositions.add(position);
    }
  }
  return minePositions;
};

// --- MAIN COMPONENT ---
export default function MultiplayerMinesGame({ onBack, settings }: MultiplayerMinesGameProps) {
  const LS_PVP_KEY = 'pvp_game_state_v1';
  const [state, setState] = useState<GameState>(() => {
    // Attempt to restore from localStorage immediately to avoid later effects overwriting
    try {
      const raw = localStorage.getItem(LS_PVP_KEY);
      if (raw) {
        const saved = JSON.parse(raw);
        if (saved?.state && !saved.state.gameOver) {
          const hasRevealedTiles = saved.state.tiles && saved.state.tiles.some((t: any) => t.isRevealed);
          if (hasRevealedTiles) {
            console.log('1v1 initial restore - restoring saved game state');
            const base = createInitialState(settings);
            return {
              ...base,
              ...saved.state,
              tiles: Array.isArray(saved.state.tiles) ? saved.state.tiles : base.tiles,
            } as GameState;
          }
        }
      }
    } catch {}
    return createInitialState(settings);
  });
  const [coinflip, setCoinflip] = useState<CoinflipState>({ show: false, winner: null });
  const [claiming, setClaiming] = useState(false);
  const [claimed, setClaimed] = useState(false);
  const stats = useStats();
  const wallet = useWallet();
  const { play } = useSound();
  // Effective settings: prefer props, otherwise restore from LS
  const [effSettings, setEffSettings] = useState<GameSettings | undefined>(() => {
    // If we have fresh settings from props, use those and don't restore
    if (settings) return settings;
    
    try {
      const raw = localStorage.getItem(LS_PVP_KEY);
      if (raw) {
        const saved = JSON.parse(raw);
        if (saved?.settings) return saved.settings as GameSettings;
      }
    } catch {}
    return settings;
  });

  // Keep effSettings in sync when props arrive/change
  useEffect(() => {
    if (settings) setEffSettings(settings);
  }, [settings]);
  
  const handleClaimWinnings = async () => {
    // Placeholder: Wire to on-chain claim when PvP context is available in props
    try {
      if (claiming || claimed) return;
      if (!state.gameOver || state.winner !== 'player') return;
      if (!wallet?.publicKey || !wallet.connected) {
        toast({ title: 'Wallet not connected', description: 'Connect your wallet to claim.', variant: 'destructive' });
        return;
      }

      // Ensure PvP context is present (from props or restored settings)
      if (!effSettings?.pvpGamePda || !effSettings?.creator) {
        toast({ title: 'Missing PvP context', description: 'Cannot resolve on-chain without game context.', variant: 'destructive' });
        return;
      }

      const payer = wallet.publicKey as PublicKey;
      const pvpGamePda = new PublicKey(effSettings.pvpGamePda);
      const creator = new PublicKey(effSettings.creator);
      const joiner = effSettings.joiner ? new PublicKey(effSettings.joiner) : creator;
      // In our flow, player is the creator when playing vs bot from our lobby
      const winnerSide: 0 | 1 = 0;

      setClaiming(true);

      const { signature } = await resolvePvpOnchain({
        wallet: wallet as any,
        payer,
        pvpGamePda,
        winnerSide,
        creator,
        joiner,
      });
      toast({ title: 'Claim submitted', description: `Tx: ${signature.slice(0, 8)}…` });
      setClaimed(true);
    } catch (e: any) {
      const msg = e?.message || String(e || '');
      const alreadyClaimed = /AccountNotInitialized|already\s*resolved|already\s*claimed|expected\s*this\s*account\s*to\s*be\s*already\s*initialized/i.test(msg);
      const invalidParam = /invalid\s*(argument|param|instruction)/i.test(msg);
      if (alreadyClaimed) {
        // Treat as benign: likely a duplicate attempt after success
        setClaimed(true);
        toast({ title: 'Already claimed', description: 'Your winnings were already claimed.', variant: 'default' });
      } else if (invalidParam) {
        // Some wallets/RPCs surface vague invalid param/argument even after success; treat as benign
        setClaimed(true);
        toast({ title: 'Claim processed', description: 'Your claim appears processed. If balance updated, you can ignore this message.', variant: 'default' });
      } else {
        toast({ title: 'Claim failed', description: msg, variant: 'destructive' });
      }
    } finally {
      setClaiming(false);
    }
  };

  useEffect(() => {
    // Prevent re-initialization mid-game if state has already progressed
    if (!effSettings) return;
    if (state.minesPlaced || state.tiles.some(t => t.isRevealed) || state.gameOver) return;
    
    // Clear localStorage when starting a truly new game (fresh settings)
    if (settings && settings !== effSettings) {
      console.log('1v1 - Starting new game, clearing localStorage');
      try { localStorage.removeItem(LS_PVP_KEY); } catch {}
    }

    const initialState = createInitialState(effSettings);
    const { bombs, amount } = effSettings;
    const clientSeed = stats.userProfile?.clientSeed || 'default-client-seed';
    const nonce = (stats.totalGames || 0) + 1;
    const serverSeed = crypto.lib.WordArray.random(16).toString();

    const bombPositions = new Set<number>();
    const bombLocations = generateBombLocations(serverSeed, clientSeed, nonce, bombs);
    bombLocations.forEach(pos => bombPositions.add(pos));

    setState({
      ...initialState,
      betAmount: amount,
      bombCount: bombs,
      tiles: Array.from({ length: 25 }, (_, i) => ({
        id: i,
        isRevealed: false,
        isBomb: bombPositions.has(i),
        revealedBy: null,
      })),
      // We have already precomputed and placed bombs based on selected settings,
      // so prevent the first-move placement logic from running.
      minesPlaced: true,
      serverSeed,
      clientSeed,
      nonce,
    });
    // Only run when settings change; avoid resets on stats updates
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effSettings]);

  // Restore persisted 1v1 state on mount/wallet change - only if game was in progress
  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_PVP_KEY);
      console.log('1v1 restore attempt - localStorage:', raw);
      if (!raw) return;
      const saved = JSON.parse(raw);
      const currentWallet = wallet.publicKey?.toBase58?.();
      console.log('1v1 restore - saved wallet:', saved.wallet, 'current wallet:', currentWallet);
      if (!saved || (saved.wallet && saved.wallet !== currentWallet)) return;
      // Only restore if the saved game was actually in progress (has revealed tiles and not finished)
      if (!saved.state || saved.state.gameOver) {
        console.log('1v1 restore - no state or game over:', saved.state?.gameOver);
        return;
      }
      const hasRevealedTiles = saved.state.tiles && saved.state.tiles.some((t: any) => t.isRevealed);
      console.log('1v1 restore - has revealed tiles:', hasRevealedTiles);
      if (!hasRevealedTiles) return;

      console.log('1v1 restore - restoring state');
      const nextState: GameState = {
        ...createInitialState(effSettings),
        ...saved.state,
        tiles: Array.isArray(saved.state?.tiles) ? saved.state.tiles : createInitialState(effSettings).tiles,
      };
      setState(nextState);
      if (saved.coinflip) setCoinflip(saved.coinflip);
      if (saved.settings) setEffSettings(saved.settings as GameSettings);
    } catch (e) {
      console.error('1v1 restore failed:', e);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wallet.publicKey]);

  // Persist 1v1 state and settings on changes
  useEffect(() => {
    try {
      const walletStr = wallet.publicKey?.toBase58?.() || null;
      const payload = {
        wallet: walletStr,
        state,
        coinflip,
        settings: effSettings,
        ts: Date.now(),
      };
      localStorage.setItem(LS_PVP_KEY, JSON.stringify(payload));
      console.log('1v1 saved to localStorage:', payload);
    } catch (e) {
      console.error('1v1 save failed:', e);
    }
  }, [state, coinflip, effSettings, wallet.publicKey]);

  // Effect to handle turn progression and bot moves
  useEffect(() => {
    if (state.gameOver) return;

    // If a player has hit a bomb, their turn is skipped automatically.
    if (state.activeTurn === 'player' && state.playerHasHitBomb) {
      setState(s => ({ ...s, activeTurn: 'opponent' }));
      return;
    }
    if (state.activeTurn === 'opponent' && state.opponentHasHitBomb) {
      setState(s => ({ ...s, activeTurn: 'player' }));
      return;
    }

    // If it's the bot's turn and it hasn't lost yet, make a move.
    if (state.activeTurn === 'opponent') {
      const timeoutId = setTimeout(() => makeBotMove(), 1000);
      return () => clearTimeout(timeoutId);
    }
  }, [state.activeTurn, state.playerHasHitBomb, state.opponentHasHitBomb, state.gameOver]);


  const processMove = (tileId: number, moveMaker: 'player' | 'opponent'): void => {
    let newState = JSON.parse(JSON.stringify(state));

    if (newState.gameOver) return;
    if (moveMaker === 'player' && (newState.playerHasHitBomb || newState.activeTurn !== 'player')) return;
    if (moveMaker === 'opponent' && (newState.opponentHasHitBomb || newState.activeTurn !== 'opponent')) return;

    if (!newState.minesPlaced) {
      const minePositions = placeMines(tileId, newState.bombCount, 25, newState.gameSeed);
      newState.tiles.forEach((tile: Tile, index: number) => {
        if (minePositions.has(index)) tile.isBomb = true;
      });
      newState.minesPlaced = true;
    }

    const tile = newState.tiles[tileId];
    tile.isRevealed = true;
    tile.revealedBy = moveMaker;

    if (tile.isBomb) {
      try { play('bomb'); } catch {}
      if (moveMaker === 'player') {
        newState.playerHasHitBomb = true;
        toast({ title: "💥 You hit a bomb!", description: "You can't make any more moves.", variant: "destructive" });
      } else {
        newState.opponentHasHitBomb = true;
        toast({ title: "Bot hit a bomb!", description: "It can't make any more moves." });
      }
    } else {
      try { play('diamond'); } catch {}
      if (moveMaker === 'player') newState.playerScore++;
      else newState.opponentScore++;
    }

    // Check for game over conditions
    let gameOver = false;
    let winner: 'player' | 'opponent' | null = null;
    const allSafeTilesRevealed = newState.tiles.filter((t: any) => !t.isBomb && t.isRevealed).length === (25 - newState.bombCount);

    if (allSafeTilesRevealed) {
        gameOver = true;
        if (newState.playerScore > newState.opponentScore) {
          winner = 'player';
        } else if (newState.opponentScore > newState.playerScore) {
          winner = 'opponent';
        } else {
            const coinFlipWinner = seedrandom(newState.gameSeed + 'tie')() < 0.5 ? 'player' : 'opponent';
            setCoinflip({ show: true, winner: coinFlipWinner });
        }
    } else if (newState.playerHasHitBomb && newState.opponentScore > newState.playerScore) {
      gameOver = true;
      winner = 'opponent';
    } else if (newState.opponentHasHitBomb && newState.playerScore > newState.opponentScore) {
      gameOver = true;
      winner = 'player';
    } else if (newState.playerHasHitBomb && newState.opponentHasHitBomb) {
      gameOver = true;
      if (newState.playerScore > newState.opponentScore) {
        winner = 'player';
      } else if (newState.opponentScore > newState.playerScore) {
        winner = 'opponent';
      } else {
        // Coinflip for a tie
        const coinFlipWinner = seedrandom(newState.gameSeed + 'tie')() < 0.5 ? 'player' : 'opponent';
        setCoinflip({ show: true, winner: coinFlipWinner });
        // Winner will be set after animation
        winner = null; 
      }
    }

    if (gameOver) {
      newState.gameOver = true;
      if (winner) {
        newState.winner = winner;
        
        // Reveal all tiles
        newState.tiles.forEach((tile: any) => tile.isRevealed = true);
        
        toast({ title: "Game Over!", description: `Final Score: You ${newState.playerScore} - ${newState.opponentScore} Bot. ${winner === 'player' ? 'You win!' : 'You lose.'}` });
        stats?.addGame({
          wageredAmount: newState.betAmount,
          netProfit: winner === 'player' ? newState.betAmount : -newState.betAmount,
          multiplier: winner === 'player' ? 2 : 0,
          gameMode: '1v1',
          serverSeed: state.serverSeed,
          clientSeed: state.clientSeed,
          nonce: state.nonce,
        });
      }
    } else {
      newState.activeTurn = (moveMaker === 'player') ? 'opponent' : 'player';
    }

    setState(newState);
  };

  const handleTileClick = (tileId: number) => {
    if (state.tiles[tileId].isRevealed) return;
    processMove(tileId, 'player');
  };

  const makeBotMove = () => {
    const unrevealedTiles = state.tiles.filter(t => !t.isRevealed);
    if (unrevealedTiles.length === 0) return;
    const randomTile = unrevealedTiles[Math.floor(Math.random() * unrevealedTiles.length)];
    processMove(randomTile.id, 'opponent');
  };
  
  const handleCoinflipComplete = (winner: 'player' | 'opponent') => {
    setState(s => ({ ...s, winner }));
    setCoinflip(c => ({ ...c, show: false }));
    toast({ title: "Game Over!", description: `A coinflip decided the winner: ${winner === 'player' ? 'You' : 'Bot'} won!` });
    stats?.addGame({
        wageredAmount: state.betAmount,
        netProfit: winner === 'player' ? state.betAmount : -state.betAmount,
        multiplier: winner === 'player' ? 2 : 0,
        gameMode: '1v1',
        serverSeed: state.serverSeed,
        clientSeed: state.clientSeed,
        nonce: state.nonce,
    });
  };

  const handleBack = () => {
    // Clear localStorage when going back to prevent restoration
    try { localStorage.removeItem(LS_PVP_KEY); } catch {}
    onBack();
  };

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <Button variant="outline" onClick={handleBack}>← Back</Button>
          <h1 className="text-2xl font-bold">1v1 Mines</h1>
          <Badge variant="outline"><Bomb className="w-3 h-3 mr-1" />{state.bombCount} Bombs</Badge>
          <Badge variant="outline"><DollarSign className="w-3 h-3 mr-1" />{(state.betAmount * 2).toFixed(2)} SOL Pot</Badge>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-gradient-card border border-primary/20 rounded-xl p-6">
            <div className="grid grid-cols-5 gap-2">
              {state.tiles.map((tile) => (
                <button
                  key={tile.id}
                  onClick={() => handleTileClick(tile.id)}
                  disabled={tile.isRevealed || state.activeTurn !== 'player' || state.gameOver || state.playerHasHitBomb}
                  className={`aspect-square rounded-lg border-2 transition-all duration-300 ${
                    tile.isRevealed
                      ? `cursor-not-allowed ${
                          tile.isBomb
                            ? 'bg-gradient-danger border-bomb-red shadow-glow-danger'
                            : tile.revealedBy === 'player'
                            ? 'bg-gradient-win border-safe-green shadow-glow-win'
                            : 'bg-gradient-primary border-neon-purple shadow-glow-primary'
                        }`
                      : (state.activeTurn === 'player' && !state.playerHasHitBomb && !state.gameOver)
                      ? 'bg-secondary border-border hover:border-neon-green/60 hover:shadow-glow-win cursor-pointer transform hover:scale-105'
                      : 'bg-secondary border-border opacity-75 cursor-not-allowed'
                  }`}
                >
                  {tile.isRevealed && (
                    <div className="flex items-center justify-center h-full">
                      {tile.isBomb ? <Bomb className="w-6 h-6 text-white" /> : <Gem className={`w-6 h-6 ${tile.revealedBy === 'player' ? 'text-white' : 'text-neon-purple'}`} />}
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-4">
            <div className="bg-gradient-card border border-primary/20 rounded-xl p-6">
              <div className="flex flex-col gap-4">
                <div className="flex items-center justify-between"><div className="flex items-center gap-2"><User /><span>You</span></div><Badge variant={state.playerHasHitBomb ? "destructive" : "secondary"}>{state.playerScore} Tiles</Badge></div>
                <div className="flex items-center justify-between"><div className="flex items-center gap-2"><Bot /><span>Bot</span></div><Badge variant={state.opponentHasHitBomb ? "destructive" : "secondary"}>{state.opponentScore} Tiles</Badge></div>
                <div className="text-center pt-2">
                    <Badge variant="outline" className={state.gameOver ? '' : 'animate-pulse'}>
                        <Trophy className="w-4 h-4 mr-1" />
                        {state.gameOver ? (state.winner === 'player' ? 'You Won!' : state.winner === 'opponent' ? 'Bot Won' : 'Tie Game') : (state.activeTurn === 'player' ? "Your Turn" : "Bot's Turn")}
                    </Badge>
                </div>
              </div>
            </div>
            {(state.gameOver || coinflip.show) && (
                <Dialog open={state.gameOver || coinflip.show} onOpenChange={() => coinflip.show ? null : onBack()}>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>{coinflip.show ? 'Tie Breaker!' : 'Game Over!'}</DialogTitle>
                      {coinflip.show && coinflip.winner ? (
                        <Coinflip 
                          winner={coinflip.winner} 
                          onAnimationComplete={handleCoinflipComplete} 
                          onLobbyReturn={onBack}
                        />
                      ) : (
                        <DialogDescription>
                          {state.winner === 'player' ? `You won with a score of ${state.playerScore} to ${state.opponentScore}!` : state.winner === 'opponent' ? `Bot won ${state.opponentScore} to ${state.playerScore}.` : state.winner === 'tie' ? `It's a tie at ${state.playerScore} each!` : 'The game is over.'}
                        </DialogDescription>
                      )}
                    </DialogHeader>
                    {!coinflip.show && (
                      <div className="mt-4 space-y-2">
                        {state.winner === 'player' && (
                          <Button onClick={handleClaimWinnings} className="w-full" variant="default" disabled={claiming || claimed}>
                            {claiming ? 'Claiming…' : claimed ? 'Claimed' : 'Claim Winnings'}
                          </Button>
                        )}
                        <Button onClick={handleBack} className="w-full" variant="outline">Back to Lobby</Button>
                      </div>
                    )}
                  </DialogContent>
                </Dialog>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function generateBombLocations(serverSeed: string, clientSeed: string, nonce: number, bombCount: number): number[] {
    if (!serverSeed || !clientSeed || isNaN(nonce) || isNaN(bombCount)) return [];
    
    const combinedSeed = `${serverSeed}-${clientSeed}-${nonce}`;
    const hash = crypto.SHA256(combinedSeed).toString(crypto.enc.Hex);

    const tiles = Array.from({ length: 25 }, (_, i) => i);
    let currentHash = hash;

    // Fisher-Yates shuffle algorithm
    for (let i = tiles.length - 1; i > 0; i--) {
        const hashSegment = currentHash.substring((i % 8) * 8, ((i % 8) * 8) + 8);
        const randInt = parseInt(hashSegment, 16);
        const j = randInt % (i + 1);
        
        [tiles[i], tiles[j]] = [tiles[j], tiles[i]];
        
        currentHash = crypto.SHA256(currentHash).toString(crypto.enc.Hex);
    }

    return tiles.slice(0, bombCount);
}
