import { useState, useCallback, useReducer, useEffect, useRef } from 'react';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Bomb, Gem, RotateCcw, DollarSign, TrendingUp } from 'lucide-react';
import { useToast } from "@/hooks/use-toast";
import { useStats } from '@/context/StatsContext';
import { useWallet } from '@solana/wallet-adapter-react';
import { PublicKey } from '@solana/web3.js';
import { Slider } from './ui/slider';
import crypto from 'crypto-js';
import { startSoloOnchain, cashOutOnchain, isOnchainConfigured, getTreasuryBalance, revealSafeOnchain } from '@/lib/sol/anchorClient';
import { useSolPrice } from '@/hooks/useSolPrice';
import { useSound } from '@/context/SoundContext';

interface Tile {
  id: number;
  isRevealed: boolean;
  isBomb: boolean;
  isSelected: boolean;
}


const initialState = {
  gameState: 'betting' as 'betting' | 'playing' | 'finished',
  betAmount: 0.1,
  bombCount: 5,
  tiles: Array.from({ length: 25 }, (_, i) => ({ id: i, isRevealed: false, isBomb: false, isSelected: false })),
  currentMultiplier: 1.0,
  safeRevealed: 0,
  wagerLamports: 0,
};

// Format SOL with up to 3 decimals (trim trailing zeros)
function formatSol3(n: number): string {
  const s = n.toFixed(3);
  return s.replace(/\.0+$/, '').replace(/(\.\d*[1-9])0+$/, '$1');
}

type Action =
  | { type: 'SET_GAME_STATE'; payload: 'betting' | 'playing' | 'finished' }
  | { type: 'SET_BET_AMOUNT'; payload: number }
  | { type: 'SET_BOMB_COUNT'; payload: number }
  | { type: 'RESET_GAME' }
  | { type: 'INITIALIZE_GAME'; payload: { bombCount: number, tiles: Tile[], wagerLamports: number } }
  | { type: 'REVEAL_TILE'; payload: { tileId: number } }
  | { type: 'CASH_OUT' };

function gameReducer(state: typeof initialState, action: Action): typeof initialState {
  switch (action.type) {
    case 'SET_GAME_STATE':
      return { ...state, gameState: action.payload };
    case 'SET_BET_AMOUNT':
        return { ...state, betAmount: action.payload };
    case 'SET_BOMB_COUNT':
        return { ...state, bombCount: action.payload };
    case 'RESET_GAME':
        return {
            ...initialState,
            betAmount: state.betAmount,
            bombCount: state.bombCount,
        };
    case 'INITIALIZE_GAME':
        return {
            ...state,
            ...action.payload,
            gameState: 'playing',
            safeRevealed: 0,
            currentMultiplier: 1.0,
        };
    case 'REVEAL_TILE': {
        const { tileId } = action.payload;
        const { tiles, bombCount, safeRevealed } = state;
        const tile = tiles[tileId];

        if (tile.isRevealed) {
            return state;
        }

        if (tile.isBomb) {
            return {
                ...state,
                gameState: 'finished',
                tiles: tiles.map(t => ({ ...t, isRevealed: true })),
            };
        }

        const newSafeRevealed = safeRevealed + 1;
        const newMultiplier = calculateUiMultiplier(newSafeRevealed, bombCount);
        const newTiles = tiles.map(t => t.id === tileId ? { ...t, isRevealed: true } : t);
        const allSafeTilesFound = newSafeRevealed === 25 - bombCount;

        if (allSafeTilesFound) {
            return {
                ...state,
                tiles: newTiles.map(t => ({...t, isRevealed: true})),
                safeRevealed: newSafeRevealed,
                currentMultiplier: newMultiplier,
                gameState: 'finished',
            };
        }

        return {
            ...state,
            tiles: newTiles,
            safeRevealed: newSafeRevealed,
            currentMultiplier: newMultiplier,
        };
    }
    case 'CASH_OUT':
        return {
            ...state,
            gameState: 'finished',
        };
    default:
      return state;
  }
}

const calculateMaxMultiplierBpsInt = (safeRevealed: number, bombCount: number): number => {
    if (safeRevealed === 0) return 10_000;
    const totalTiles = 25n;
    const houseEdgeBps = 9_900n;
    const scale = 1_000_000n;
    let chance = scale;
    for (let i = 0; i < safeRevealed; i++) {
        const remainingTiles = totalTiles - BigInt(i);
        const remainingSafe = (totalTiles - BigInt(bombCount)) - BigInt(i);
        if (remainingTiles === 0n || remainingSafe === 0n) return 10_000;
        chance = (chance * remainingSafe) / remainingTiles;
    }
    if (chance === 0n) return 65_535;
    let multiplierBps = Number((houseEdgeBps * scale) / chance);
    if (multiplierBps > 65_535) multiplierBps = 65_535;
    if (multiplierBps < 10_000) multiplierBps = 10_000;
    return multiplierBps;
};

const calculateUiMultiplier = (safeRevealed: number, bombCount: number) => {
    const totalTiles = 25;
    const houseEdge = 0.99;
    let chance = 1;
    for (let i = 0; i < safeRevealed; i++) {
      chance *= (totalTiles - bombCount - i) / (totalTiles - i);
    }
    const ui = houseEdge / Math.max(chance, 1e-12);
    return Math.max(1.0, ui);
};

function generateBombLocations(serverSeed: string, clientSeed: string, nonce: number, bombCount: number): number[] {
    if (!serverSeed || !clientSeed || isNaN(nonce) || isNaN(bombCount)) return [];
    const combinedSeed = `${serverSeed}-${clientSeed}-${nonce}`;
    const hash = crypto.SHA256(combinedSeed).toString(crypto.enc.Hex);
    const tiles = Array.from({ length: 25 }, (_, i) => i);
    let currentHash = hash;
    for (let i = tiles.length - 1; i > 0; i--) {
        const hashSegment = currentHash.substring((i % 8) * 8, ((i % 8) * 8) + 8);
        const randInt = parseInt(hashSegment, 16);
        const j = randInt % (i + 1);
        [tiles[i], tiles[j]] = [tiles[j], tiles[i]];
        currentHash = crypto.SHA256(currentHash).toString(crypto.enc.Hex);
    }
    return tiles.slice(0, bombCount);
}

export default function SoloMinesGame({ onBack }: { onBack?: () => void }) {
    const { toast } = useToast();
    const { price: solUsd } = useSolPrice();
    const { addGame, userProfile, totalGames } = useStats();
    const walletCtx = useWallet();
    const { connected, publicKey } = walletCtx;
    const { play } = useSound();
    const [state, dispatch] = useReducer(gameReducer, initialState);
    const prevGameState = useRef(state.gameState);
    const [serverSeed, setServerSeed] = useState('');
    const [gamePda, setGamePda] = useState<PublicKey | null>(null);
    const [gameNonce, setGameNonce] = useState<number | null>(null);
    const [claiming, setClaiming] = useState(false);
    const [isRevealing, setIsRevealing] = useState(false);
    const [betInput, setBetInput] = useState<string>(String(initialState.betAmount));

    const {
        gameState,
        betAmount,
        bombCount,
        tiles,
        currentMultiplier,
        safeRevealed,
    } = state;
  const wagerLamports = state.wagerLamports;

    useEffect(() => {
        if (prevGameState.current === 'playing' && gameState === 'finished') {
            const isLoss = tiles.some(tile => tile.isBomb && tile.isRevealed);
            const clientSeed = userProfile?.clientSeed || 'not_available';
            const nonce = gameNonce ?? (totalGames + 1);

            if (isLoss) {
                addGame({
                    netProfit: -betAmount,
                    wageredAmount: betAmount,
                    multiplier: 0,
                    gameMode: 'solo',
                    serverSeed, clientSeed, nonce,
                });
            } else {
                const winAmount = betAmount * currentMultiplier;
                const netProfit = winAmount - betAmount;
                addGame({
                    netProfit, wageredAmount: betAmount, multiplier: currentMultiplier,
                    gameMode: 'solo', serverSeed, clientSeed, nonce,
                });
            }
        }
        prevGameState.current = gameState;
    }, [gameState, betAmount, currentMultiplier, tiles, addGame, userProfile, totalGames, serverSeed, gameNonce]);

    const initializeGame = useCallback(async () => {
        if (betAmount <= 0) {
            toast({ title: "Invalid Bet Amount", description: "Please enter a bet amount greater than 0.", variant: "destructive" });
            return;
        }
        if (!connected || !publicKey || !walletCtx.signTransaction) {
            toast({ title: 'Connect Wallet', description: 'Please connect your Solana wallet to play on-chain.', variant: 'destructive' });
            return;
        }
        if (!walletCtx.sendTransaction) {
            toast({ title: 'Wallet Issue', description: 'Your wallet does not support sendTransaction.', variant: 'destructive' });
            return;
        }
        if (!isOnchainConfigured()) {
            toast({ title: 'On-chain not configured', description: 'Missing VITE_PROGRAM_ID / RPC. Check .env.', variant: 'destructive' });
            return;
        }
        const lamports = Math.max(10_000, Math.round(betAmount * 1_000_000_000));
        try {
            const res = await startSoloOnchain({ wallet: walletCtx as any, player: publicKey, betLamports: lamports, bombs: bombCount });
            setGamePda(res.gamePda);
            setGameNonce(res.gameNonce);
            const newServerSeed = crypto.lib.WordArray.random(16).toString();
            setServerSeed(newServerSeed);
            const clientSeed = userProfile?.clientSeed || 'not_available';
            const bombLocations = generateBombLocations(newServerSeed, clientSeed, res.gameNonce, bombCount);
            const bombPositions = new Set<number>(bombLocations);
            const newTiles = Array.from({ length: 25 }, (_, i) => ({ id: i, isRevealed: false, isBomb: bombPositions.has(i), isSelected: false }));
            dispatch({ type: 'INITIALIZE_GAME', payload: { bombCount, tiles: newTiles, wagerLamports: lamports } });
        } catch (e: any) {
            console.error('startSoloOnchain failed', e);
            toast({ title: 'Transaction failed', description: e?.message ?? String(e), variant: 'destructive' });
        }
    }, [bombCount, betAmount, connected, publicKey, walletCtx, userProfile]);

    const revealTile = useCallback((tileId: number) => {
        if (gameState !== 'playing') return;
        const tile = tiles[tileId];
        if (!tile || tile.isRevealed) return;

        const newTiles = [...tiles];
        newTiles[tileId] = { ...tile, isRevealed: true };
        dispatch({ type: 'REVEAL_TILE', payload: { tileId } });

        // If bomb -> immediate finish
        if (newTiles[tileId].isBomb) {
            try { play('bomb'); } catch {}
            dispatch({ type: 'SET_GAME_STATE', payload: 'finished' });
            setGamePda(null);
            return;
        }

        // Safe reveal -> play diamond chime
        try { play('diamond'); } catch {}

        // Auto-claim if all safe tiles are revealed
        const maxSafe = 25 - bombCount;
        const newSafeCount = safeRevealed + 1;
        if (newSafeCount >= maxSafe && !claiming && !isRevealing && gamePda) {
            // Fire-and-forget to trigger wallet popup immediately
            (async () => {
                try {
                    setClaiming(true);
                    const bps = calculateMaxMultiplierBpsInt(newSafeCount, bombCount);
                    const payoutLamports = Math.floor((wagerLamports || Math.round(betAmount * 1e9)) * bps / 10_000);
                    const payoutSolExact = payoutLamports / 1e9;
                    await cashOutOnchain({ wallet: walletCtx as any, player: publicKey, gamePda, safeRevealedClient: newSafeCount });
                    dispatch({ type: 'CASH_OUT' });
                    toast({ title: 'Winnings claimed! 💎', description: `Received ${formatSol3(payoutSolExact)} SOL in your wallet.` });
                    setGamePda(null);
                } catch (e: any) {
                    console.error('auto-claim failed', e);
                    toast({ title: 'Claim failed', description: e?.message ?? String(e), variant: 'destructive' });
                } finally {
                    setClaiming(false);
                }
            })();
        }
    }, [gameState, tiles, bombCount, safeRevealed, publicKey, walletCtx, gamePda, isRevealing, claiming, betAmount, wagerLamports]);

    const cashOut = useCallback(async () => {
        if (gameState !== 'playing' || safeRevealed === 0 || isRevealing || claiming) return;
        if (!connected || !publicKey || !walletCtx.signTransaction || !isOnchainConfigured()) {
            toast({ title: 'Connect Wallet', description: 'Please connect your wallet.', variant: 'destructive' });
            return;
        }
        if (!walletCtx.sendTransaction) {
            toast({ title: 'Wallet Issue', description: 'Your wallet does not support sendTransaction.', variant: 'destructive' });
            return;
        }
        if (!gamePda) {
            toast({ title: 'Missing game PDA', description: 'Could not locate game account on-chain.', variant: 'destructive' });
            return;
        }
        setClaiming(true);
        try {
            // Compute exact payout before we mutate state
            const bps = calculateMaxMultiplierBpsInt(safeRevealed, bombCount);
            const payoutLamports = Math.floor((wagerLamports || Math.round(betAmount * 1e9)) * bps / 10_000);
            const payoutSolExact = payoutLamports / 1e9;

            await cashOutOnchain({ wallet: walletCtx as any, player: publicKey, gamePda, safeRevealedClient: safeRevealed });
            dispatch({ type: 'CASH_OUT' });
            toast({ title: 'Winnings claimed! 💎', description: `Received ${payoutSolExact.toFixed(3)} SOL in your wallet.` });
            setGamePda(null);
        } catch (e: any) {
            console.error('claim failed', e);
            toast({ title: 'Claim failed', description: e?.message ?? String(e), variant: 'destructive' });
        } finally {
            setClaiming(false);
        }
    }, [gameState, safeRevealed, connected, publicKey, walletCtx, gamePda, betAmount, currentMultiplier]);

    const resetGame = () => {
        dispatch({ type: 'RESET_GAME' });
        setGamePda(null);
        setGameNonce(null);
    };

    const handleBetAmountChange = (value: number) => {
        dispatch({ type: 'SET_BET_AMOUNT', payload: value });
        setBetInput(formatSol3(value));
    };
    const handleBombCountChange = (value: number) => dispatch({ type: 'SET_BOMB_COUNT', payload: value });

    const maxBpsRender = calculateMaxMultiplierBpsInt(safeRevealed, bombCount);
    const payoutLamportsDisplay = Math.floor((wagerLamports || Math.round(betAmount * 1e9)) * maxBpsRender / 10_000);
    const totalPayoutDisplaySOL = payoutLamportsDisplay / 1e9;
    const profitDisplay = Math.max(0, totalPayoutDisplaySOL - betAmount);

    const exactPayoutStr = formatSol3(totalPayoutDisplaySOL);

    return (
        <div className="min-h-screen bg-background p-4">
            <div className="max-w-4xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2">
                    <div className="bg-gradient-card border border-primary/20 rounded-xl p-4">
                        <div className="grid grid-cols-5 gap-2">
                            {tiles.map((tile) => (
                                <button
                                    key={tile.id}
                                    onClick={() => revealTile(tile.id)}
                                    disabled={tile.isRevealed || gameState !== 'playing' || isRevealing}
                                    className={`aspect-square rounded-lg border-2 transition-all duration-300 transform hover:scale-105 ${
                                        tile.isRevealed 
                                            ? tile.isBomb 
                                                ? 'bg-gradient-danger border-bomb-red shadow-glow-danger' 
                                                : 'bg-gradient-win border-safe-green shadow-glow-win'
                                            : 'bg-secondary border-border hover:border-primary/40 hover:shadow-glow-primary'
                                    }`}
                                >
                                    {tile.isRevealed && (
                                        <div className="flex items-center justify-center h-full">
                                            {tile.isBomb ? <Bomb className="w-6 h-6 text-white animate-pulse" /> : <Gem className="w-6 h-6 text-white animate-bounce" />}
                                        </div>
                                    )}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                <div className="lg:col-span-1 space-y-4">
                    {gameState === 'betting' && (
                        <div className="bg-gradient-card border border-primary/20 rounded-xl p-6">
                            <h3 className="text-lg font-semibold mb-4">Place Your Bet</h3>
                            <div className="space-y-4">
                                <div>
                                    <label className="text-sm text-muted-foreground mb-2 block">Bet Amount (SOL)</label>
                                    <div className="flex items-center gap-2">
                                        <input
                                          type="text"
                                          inputMode="decimal"
                                          placeholder="0"
                                          value={betInput}
                                          onChange={(e) => {
                                            const raw = e.target.value.replace(',', '.');
                                            // allow empty, '.', '1', '1.', '1.2'
                                            if (/^\d*(\.\d*)?$/.test(raw)) {
                                              setBetInput(raw);
                                              if (raw === '' || raw === '.') {
                                                dispatch({ type: 'SET_BET_AMOUNT', payload: 0 });
                                              } else {
                                                const num = parseFloat(raw);
                                                if (Number.isFinite(num)) {
                                                  dispatch({ type: 'SET_BET_AMOUNT', payload: num });
                                                }
                                              }
                                            }
                                          }}
                                          className="w-full bg-input border border-border rounded-lg px-3 py-2 text-foreground"
                                        />
                                        <Button
                                          variant="outline"
                                          className="px-3"
                                          onClick={() => {
                                            const newVal = Math.max(0.01, parseFloat((betAmount / 2).toFixed(4)));
                                            handleBetAmountChange(newVal);
                                          }}
                                        >
                                          1/2
                                        </Button>
                                        <Button
                                          variant="outline"
                                          className="px-3"
                                          onClick={() => {
                                            const newVal = Math.min(10, parseFloat((betAmount * 2).toFixed(4)));
                                            handleBetAmountChange(newVal);
                                          }}
                                        >
                                          x2
                                        </Button>
                                    </div>
                                    <div className="mt-1 text-xs text-muted-foreground">
                                      ≈ ${solUsd && Number.isFinite(betAmount * solUsd) ? (betAmount * solUsd).toFixed(2) : '—'} USD
                                    </div>
                                </div>
                                <div>
                                    <label className="text-sm text-muted-foreground mb-2 block">Bombs: <span className="font-bold text-white">{bombCount}</span></label>
                                    <Slider value={[bombCount]} onValueChange={(v) => handleBombCountChange(v[0])} min={1} max={24} step={1} />
                                </div>
                                <Button variant="neon" onClick={initializeGame} className="w-full" disabled={!connected}>
                                    <DollarSign className="w-4 h-4 mr-2" />
                                    {connected ? 'Start Game' : 'Connect Wallet to Play'}
                                </Button>
                            </div>
                        </div>
                    )}

                    {gameState === 'playing' && (
                        <div className="bg-gradient-card border border-primary/20 rounded-xl p-6">
                            <h3 className="text-lg font-semibold mb-4">Game Active</h3>
                            <div className="space-y-4">
                                <div className="text-center">
                                    <div className="text-2xl font-bold text-neon-gold">{exactPayoutStr} SOL</div>
                                    <div className="text-sm text-muted-foreground">Potential Win</div>
                                </div>
                                <div className="grid grid-cols-2 gap-2 text-sm">
                                    <div className="text-center p-2 bg-secondary/50 rounded">
                                        <div className="font-semibold text-safe-green">{safeRevealed}</div>
                                        <div className="text-xs text-muted-foreground">Safe</div>
                                    </div>
                                    <div className="text-center p-2 bg-secondary/50 rounded">
                                        <div className="font-semibold text-bomb-red">{bombCount}</div>
                                        <div className="text-xs text-muted-foreground">Bombs</div>
                                    </div>
                                </div>
                                <Button onClick={cashOut} disabled={safeRevealed === 0 || claiming || isRevealing} className="w-full">
                                    {claiming || isRevealing ? (isRevealing ? 'Revealing...' : 'Cashing out...') : `Cash Out ${exactPayoutStr} SOL`}
                                </Button>
                            </div>
                        </div>
                    )}

                    {gameState === 'finished' && (
                        <div className="bg-gradient-card border border-primary/20 rounded-xl p-6 space-y-3">
                            <h3 className="text-lg font-semibold">Game Over</h3>
                            <div className="grid grid-cols-1 gap-2">
                                {!tiles.some(t => t.isBomb && t.isRevealed) && (
                                    <Button variant="win" disabled={claiming || !gamePda} onClick={cashOut} className="w-full">
                                        Claim Winnings
                                    </Button>
                                )}
                                <Button variant="neon" onClick={resetGame} className="w-full">
                                    <RotateCcw className="w-4 h-4 mr-2" />
                                    Play Again
                                </Button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

// Provide named export for modules using `import { SoloMinesGame } from ...`
export { SoloMinesGame };
