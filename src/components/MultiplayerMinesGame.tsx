import { useState, useEffect, useMemo, useRef } from 'react';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Bomb, Gem, RotateCcw, DollarSign, Trophy } from 'lucide-react';
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
import { useSocket } from '@/context/SocketContext';
import defaultAvatar from '@/assets/default-avatar.png';
import robotAvatar from '@/assets/robot-nice.svg';

// --- INTERFACES & TYPES ---
interface GameSettings {
  bombs: number;
  amount: number;
  // Optional PvP context (present for on-chain 1v1/bot games)
  pvpGamePda?: string;
  creator?: string;
  joiner?: string | null;
  vsRobot?: boolean;
  opponent?: 'bot' | 'player' | null;
  lobbyId?: string;
  spectate?: boolean;
  myRole?: 'creator' | 'joiner';
  startsBy?: 'creator' | 'joiner';
  boardSeed?: string;
  // Profile context for immediate UI
  creatorName?: string | null;
  creatorAvatar?: string | null;
  joinerName?: string | null;
  joinerAvatar?: string | null;
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
  // If server decided startsBy/myRole, honor it; otherwise randomize
  const serverDetermined = settings?.startsBy && settings?.myRole;
  const isPlayerFirst = serverDetermined
    ? (settings!.startsBy === settings!.myRole)
    : (rng() < 0.5);
  
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
  const sentGameOverRef = useRef(false);
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
  const [spectateOver, setSpectateOver] = useState(false);
  const stats = useStats();
  const wallet = useWallet();
  const { play } = useSound();
  const { sendMessage, setPvpMoveHandler, setStartSpectateHandler, setGameOverHandler, setPfFinalSeedHandler, getProfile, ready: socketReady } = useSocket();
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
  const isPvp = !!(effSettings && effSettings.opponent === 'player' && !effSettings.vsRobot);
  const isSpectator = !!effSettings?.spectate;
  const appliedHydrationRef = useRef(false);

  // Profiles for creator/joiner to show names/avatars in the sidebar
  const [creatorProfile, setCreatorProfile] = useState<{ name?: string; avatarUrl?: string } | null>(null);
  const [joinerProfile, setJoinerProfile] = useState<{ name?: string; avatarUrl?: string } | null>(null);

  // Seed profiles from settings immediately (for startGame/startSpectate payloads)
  useEffect(() => {
    const cp = { name: effSettings?.creatorName || undefined, avatarUrl: effSettings?.creatorAvatar || undefined };
    const jp = { name: effSettings?.joinerName || undefined, avatarUrl: effSettings?.joinerAvatar || undefined };
    if (cp.name || cp.avatarUrl) setCreatorProfile(cp);
    if (jp.name || jp.avatarUrl) setJoinerProfile(jp);
  }, [effSettings?.creatorName, effSettings?.creatorAvatar, effSettings?.joinerName, effSettings?.joinerAvatar]);

  // Fetch profiles when lobby context known (refresh/cache fill)
  useEffect(() => {
    const run = async () => {
      try {
        if (!socketReady) return;
        const c = effSettings?.creator || undefined;
        const j = effSettings?.joiner || undefined;
        if (c) {
          try {
            const p = await getProfile(c);
            if (p) setCreatorProfile({ name: p.name, avatarUrl: p.avatarUrl });
          } catch {}
        }
        if (j) {
          try {
            const p = await getProfile(j);
            if (p) setJoinerProfile({ name: p.name, avatarUrl: p.avatarUrl });
          } catch {}
        }
      } catch {}
    };
    run();
  }, [socketReady, effSettings?.creator, effSettings?.joiner, getProfile]);

  const myWallet = wallet.publicKey?.toBase58?.();
  const myProfile = stats.userProfile;
  const short = (w?: string | null) => w ? `User...${w.slice(-4)}` : 'Unknown';
  const displayName = (p?: { name?: string } | null, w?: string | null) => (p?.name && p.name.trim()) || short(w);
  const displayAvatar = (p?: { avatarUrl?: string } | null) => (p?.avatarUrl && p.avatarUrl.trim()) || defaultAvatar;

  // Resolve opponent info for the sidebar (names + avatars)
  const iAmCreator = effSettings?.myRole === 'creator';
  const opponentWallet = isPvp
    ? (iAmCreator ? effSettings?.joiner || null : effSettings?.creator || null)
    : null;
  const opponentProfile = isPvp
    ? (iAmCreator ? joinerProfile : creatorProfile)
    : null;
  const opponentName = isPvp
    ? displayName(opponentProfile as any, opponentWallet || undefined)
    : 'Robot';
  const opponentAvatar = isPvp
    ? displayAvatar(opponentProfile as any)
    : robotAvatar;
  const meName = myProfile?.name || short(myWallet);
  const meAvatar = myProfile?.avatarUrl || defaultAvatar;

  // Sidebar labels/avatars: spectators should see Creator vs Joiner
  const leftName = isSpectator ? displayName(creatorProfile as any, effSettings?.creator) : 'You';
  const leftAvatar = isSpectator ? displayAvatar(creatorProfile as any) : meAvatar;
  const rightName = isSpectator
    ? (isPvp ? displayName(joinerProfile as any, effSettings?.joiner || undefined) : 'Robot')
    : (isPvp ? opponentName : 'Robot');
  const rightAvatar = isSpectator
    ? (isPvp ? (effSettings?.joiner ? displayAvatar(joinerProfile as any) : defaultAvatar) : robotAvatar)
    : opponentAvatar;

  const activeTurnName = state.activeTurn === 'player' ? leftName : rightName;
  
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
      // winnerSide: 0=creator, 1=joiner. Map based on myRole provided by server startGame
      let winnerSide: 0 | 1 = 0;
      if (effSettings?.myRole === 'joiner') winnerSide = 1;

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
      try { localStorage.removeItem('pvp_claim_required'); } catch {}
      // Inform server to mark claimed so lobby can be cleaned up safely
      try { if (effSettings?.lobbyId) sendMessage({ type: 'claimWinnings', lobbyId: effSettings.lobbyId }); } catch {}
    } catch (e: any) {
      const msg = e?.message || String(e || '');
      const alreadyClaimed = /AccountNotInitialized|already\s*resolved|already\s*claimed|expected\s*this\s*account\s*to\s*be\s*already\s*initialized/i.test(msg);
      const invalidParam = /invalid\s*(argument|param|instruction)/i.test(msg);
      if (alreadyClaimed) {
        // Treat as benign: likely a duplicate attempt after success
        setClaimed(true);
        toast({ title: 'Already claimed', description: 'Your winnings were already claimed.', variant: 'default' });
        try { localStorage.removeItem('pvp_claim_required'); } catch {}
        try { if (effSettings?.lobbyId) sendMessage({ type: 'claimWinnings', lobbyId: effSettings.lobbyId }); } catch {}
      } else if (invalidParam) {
        // Some wallets/RPCs surface vague invalid param/argument even after success; treat as benign
        setClaimed(true);
        toast({ title: 'Claim processed', description: 'Your claim appears processed. If balance updated, you can ignore this message.', variant: 'default' });
        try { localStorage.removeItem('pvp_claim_required'); } catch {}
        try { if (effSettings?.lobbyId) sendMessage({ type: 'claimWinnings', lobbyId: effSettings.lobbyId }); } catch {}
      } else {
        toast({ title: 'Claim failed', description: msg, variant: 'destructive' });
      }
    } finally {
      setClaiming(false);
    }
  };

  // Reset gameOver sent flag when a new lobby/game starts
  useEffect(() => {
    sentGameOverRef.current = false;
  }, [effSettings?.lobbyId]);

  // Notify server when the PvP match concludes so lobbies update live
  useEffect(() => {
    try {
      if (!isSpectator && isPvp && effSettings?.lobbyId && state.gameOver && !sentGameOverRef.current) {
        sentGameOverRef.current = true;
        // Map local winner to server role perspective
        let winnerSide: 'creator' | 'joiner' | undefined;
        if (state.winner && effSettings?.myRole) {
          if (state.winner === 'player') winnerSide = effSettings.myRole;
          else if (state.winner === 'opponent') winnerSide = effSettings.myRole === 'creator' ? 'joiner' : 'creator';
        }
        sendMessage({ type: 'gameOver', lobbyId: effSettings.lobbyId, winner: winnerSide });
      }
    } catch {}
  }, [isSpectator, isPvp, effSettings?.lobbyId, state.gameOver, sendMessage]);

  // Maintain claim-required flag in localStorage for global nav guard
  useEffect(() => {
    try {
      if (!isSpectator && isPvp && state.gameOver && state.winner === 'player' && !claimed) {
        const lobbyId = effSettings?.lobbyId || 'unknown';
        localStorage.setItem('pvp_claim_required', JSON.stringify({ lobbyId, ts: Date.now() }));
      } else {
        localStorage.removeItem('pvp_claim_required');
      }
    } catch {}
  }, [isSpectator, isPvp, state.gameOver, state.winner, claimed, effSettings?.lobbyId]);

  // Prevent accidental tab close/refresh while claim required
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (!isSpectator && isPvp && state.gameOver && state.winner === 'player' && !claimed) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isSpectator, isPvp, state.gameOver, state.winner, claimed]);

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
    // PvP: do not place bombs until pfFinalSeed arrives unless we already have boardSeed
    const isPvpNoSeed = (!!(effSettings && effSettings.opponent === 'player' && !effSettings.vsRobot)) && !effSettings.boardSeed;
    if (isPvpNoSeed) {
      setState(s => ({
        ...initialState,
        betAmount: amount,
        bombCount: bombs,
        minesPlaced: false,
        serverSeed: '',
        clientSeed: '',
        nonce: 0,
      }));
      return;
    }

    // Non-PvP or PvP with pre-known shared boardSeed
    const useShared = !!effSettings.boardSeed;
    const serverSeed = useShared ? (effSettings.boardSeed as string) : crypto.lib.WordArray.random(16).toString();
    const clientSeed = useShared ? 'shared' : (stats.userProfile?.clientSeed || 'default-client-seed');
    const nonce = useShared ? 0 : ((stats.totalGames || 0) + 1);

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
      minesPlaced: true,
      serverSeed,
      clientSeed,
      nonce,
    });
    // Only run when settings change; avoid resets on stats updates
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effSettings]);

  // Send client seed to server once per PvP game start
  const sentPfSeedRef = useRef(false);
  useEffect(() => {
    if (!isPvp || isSpectator) return;
    if (!effSettings?.lobbyId || !effSettings?.myRole) return;
    if (sentPfSeedRef.current) return;
    const seed = stats.userProfile?.clientSeed || 'default-client-seed';
    try {
      sendMessage({ type: 'pfClientSeed', lobbyId: effSettings.lobbyId, role: effSettings.myRole, seed });
      sentPfSeedRef.current = true;
    } catch {}
  }, [isPvp, isSpectator, effSettings?.lobbyId, effSettings?.myRole, stats.userProfile?.clientSeed, sendMessage]);

  // Handle pfFinalSeed to place bombs deterministically for PvP (players and spectators)
  useEffect(() => {
    if (!setPfFinalSeedHandler) return;
    const handler = (data: { lobbyId: string; boardSeed: string; betAmount?: number; bombCount?: number; startsBy?: 'creator'|'joiner'; yourRole?: 'creator'|'joiner' }) => {
      if (!effSettings?.lobbyId || effSettings.lobbyId !== data.lobbyId) return;
      const boardSeed = data.boardSeed;
      const bombs = data.bombCount ?? (effSettings?.bombs || state.bombCount);
      const amount = data.betAmount ?? (effSettings?.amount || state.betAmount);
      // Deterministic placement using final combined seed; use constant clientSeed/nonce
      const bombPositions = new Set<number>();
      const bombLocations = generateBombLocations(boardSeed, 'shared', 0, bombs);
      bombLocations.forEach(pos => bombPositions.add(pos));
      setState(prev => ({
        ...prev,
        betAmount: amount,
        bombCount: bombs,
        tiles: Array.from({ length: 25 }, (_, i) => ({
          id: i,
          isRevealed: false,
          isBomb: bombPositions.has(i),
          revealedBy: null,
        })),
        minesPlaced: true,
        serverSeed: boardSeed,
        clientSeed: 'shared',
        nonce: 0,
      }));
      // Also persist boardSeed in effSettings for any UI that depends on it
      setEffSettings(es => es ? { ...es, boardSeed } : es);
    };
    setPfFinalSeedHandler(handler as any);
    return () => setPfFinalSeedHandler(undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setPfFinalSeedHandler, effSettings?.lobbyId, state.betAmount, state.bombCount]);

  // Hydrate historical moves when spectating (passed from lobby to avoid race with WS handler)
  useEffect(() => {
    if (!isSpectator) return;
    if (appliedHydrationRef.current) return;
    const moves: Array<{ tileId: number; by: 'creator' | 'joiner' }> = (effSettings as any)?.spectateMoves || [];
    if (!Array.isArray(moves) || moves.length === 0) return;
    for (const m of moves) {
      const maker: 'player' | 'opponent' = m.by === 'creator' ? 'player' : 'opponent';
      processMove(m.tileId, maker, true);
    }
    appliedHydrationRef.current = true;
  }, [isSpectator, effSettings]);

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

    // If it's the bot/opponent turn, make a move for bot games only (players only; spectators must not run AI).
    if (!isPvp && !isSpectator && state.activeTurn === 'opponent') {
      const timeoutId = setTimeout(() => makeBotMove(), 1000);
      return () => clearTimeout(timeoutId);
    }
  }, [state.activeTurn, state.playerHasHitBomb, state.opponentHasHitBomb, state.gameOver, isPvp, isSpectator]);


  const processMove = (tileId: number, moveMaker: 'player' | 'opponent', force: boolean = false): void => {
    setState(prev => {
      const newState: GameState = JSON.parse(JSON.stringify(prev));

      if (newState.gameOver) return newState;
      if (!force) {
        if (moveMaker === 'player' && (newState.playerHasHitBomb || newState.activeTurn !== 'player')) return newState;
        if (moveMaker === 'opponent' && (newState.opponentHasHitBomb || newState.activeTurn !== 'opponent')) return newState;
      }

      if (!newState.minesPlaced) {
        const minePositions = placeMines(tileId, newState.bombCount, 25, newState.gameSeed);
        newState.tiles.forEach((tile: Tile, index: number) => {
          if (minePositions.has(index)) tile.isBomb = true;
        });
        newState.minesPlaced = true;
      }

      const tile = newState.tiles[tileId];
      if (!tile.isRevealed) {
        tile.isRevealed = true;
        tile.revealedBy = moveMaker;
      }

      if (tile.isBomb) {
        try { play('bomb'); } catch {}
        if (moveMaker === 'player') {
          newState.playerHasHitBomb = true;
          if (!isSpectator) toast({ title: "💥 You hit a bomb!", description: "You can't make any more moves.", variant: "destructive" });
        } else {
          newState.opponentHasHitBomb = true;
          if (!isSpectator) toast({ title: isPvp ? 'Opponent hit a bomb!' : 'Bot hit a bomb!', description: "It can't make any more moves." });
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
              if (!isSpectator) setCoinflip({ show: true, winner: coinFlipWinner });
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
          if (!isSpectator) setCoinflip({ show: true, winner: coinFlipWinner });
          // Winner will be set after animation
          winner = null; 
        }
      }

      if (gameOver) {
        newState.gameOver = true;
        if (winner) {
          newState.winner = winner;
          // Reveal all tiles
          newState.tiles.forEach((t: any) => t.isRevealed = true);
          if (!isSpectator) toast({ title: "Game Over!", description: `Final Score: You ${newState.playerScore} - ${newState.opponentScore} ${isPvp ? 'Opponent' : 'Bot'}. ${winner === 'player' ? 'You win!' : 'You lose.'}` });
          stats?.addGame({
            wageredAmount: newState.betAmount,
            netProfit: winner === 'player' ? newState.betAmount : -newState.betAmount,
            multiplier: winner === 'player' ? 2 : 0,
            gameMode: '1v1',
            serverSeed: newState.serverSeed,
            clientSeed: newState.clientSeed,
            nonce: newState.nonce,
          });
        }
      } else {
        newState.activeTurn = (moveMaker === 'player') ? 'opponent' : 'player';
      }

      return newState;
    });
  };

  const handleTileClick = (tileId: number) => {
    if (isSpectator) return; // spectators cannot interact
    if (state.tiles[tileId].isRevealed) return;
    processMove(tileId, 'player');
    // Relay PvP move to server for other client/spectators
    try {
      if (!isSpectator && effSettings?.lobbyId && (isPvp || effSettings?.vsRobot)) {
        // Determine who 'by' is from server perspective
        let by: 'creator' | 'joiner' | undefined = undefined;
        if (isPvp) {
          if (effSettings?.myRole === 'creator') by = 'creator';
          else if (effSettings?.myRole === 'joiner') by = 'joiner';
        } else {
          // Robot games: human is creator, bot is joiner
          by = 'creator';
        }
        sendMessage({ type: 'pvpMove', lobbyId: effSettings.lobbyId, tileId, by });
      }
    } catch {}
  };

  const makeBotMove = () => {
    const unrevealedTiles = state.tiles.filter(t => !t.isRevealed);
    if (unrevealedTiles.length === 0) return;
    const randomTile = unrevealedTiles[Math.floor(Math.random() * unrevealedTiles.length)];
    processMove(randomTile.id, 'opponent');
    // Broadcast bot move for spectators in robot games
    try {
      if (!isPvp && effSettings?.vsRobot && effSettings?.lobbyId) {
        sendMessage({ type: 'pvpMove', lobbyId: effSettings.lobbyId, tileId: randomTile.id, by: 'joiner' });
      }
    } catch {}
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
    // If winner in PvP, force claim before leaving
    if (!isSpectator && isPvp && state.gameOver && state.winner === 'player' && !claimed) {
      toast({ title: 'Claim required', description: 'Please claim your winnings before returning to the lobby.', variant: 'destructive' });
      return;
    }
    // Clear localStorage when going back to prevent restoration
    try { localStorage.removeItem(LS_PVP_KEY); } catch {}
    try { localStorage.removeItem('pvp_claim_required'); } catch {}
    onBack();
  };

  // Receive opponent moves in PvP
  useEffect(() => {
    if (!setPvpMoveHandler) return;
    const handler = ({ lobbyId, tileId, by }: { lobbyId: string; tileId: number; by?: 'creator' | 'joiner' }) => {
      if (effSettings?.lobbyId !== lobbyId) return;
      if (state.gameOver) return;
      // Map server 'by' to local player/opponent
      if (by) {
        if (isSpectator) {
          // Spectator POV: creator => player (green), joiner => opponent (purple)
          const maker: 'player' | 'opponent' = by === 'creator' ? 'player' : 'opponent';
          processMove(tileId, maker, true);
          return;
        }
        if (effSettings?.myRole) {
          const iAmCreator = effSettings.myRole === 'creator';
          const isByCreator = by === 'creator';
          const maker: 'player' | 'opponent' = (iAmCreator === isByCreator) ? 'player' : 'opponent';
          processMove(tileId, maker, true);
          return;
        }
      }
      // Fallback (should not happen often): treat as opponent
      processMove(tileId, 'opponent', true);
    };
    setPvpMoveHandler(handler);
    return () => setPvpMoveHandler(undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effSettings?.lobbyId, state.gameOver]);

  // Spectator hydration
  useEffect(() => {
    if (!isSpectator || !setStartSpectateHandler) return;
    let hydrated = false;
    const handler = (data: any) => {
      if (hydrated) return;
      if (!data || data.type !== 'startSpectate') return;
      if (effSettings?.lobbyId !== data.lobbyId) return;
      const moves: Array<{ tileId: number; by: 'creator' | 'joiner' }> = Array.isArray(data.moves) ? data.moves : [];
      for (const m of moves) {
        const maker = m.by === 'creator' ? 'player' : 'opponent';
        processMove(m.tileId, maker as any, true);
      }
      hydrated = true;
      appliedHydrationRef.current = true;
    };
    setStartSpectateHandler(handler);
    return () => setStartSpectateHandler(undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSpectator, effSettings?.lobbyId]);

  // Spectator gameOver popup
  useEffect(() => {
    if (!isSpectator || !setGameOverHandler) return;
    const handler = ({ lobbyId }: { lobbyId: string }) => {
      if (effSettings?.lobbyId !== lobbyId) return;
      setSpectateOver(true);
    };
    setGameOverHandler(handler);
    return () => setGameOverHandler(undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSpectator, effSettings?.lobbyId]);

  // Notify server when PvP game ends (redundant safety)
  useEffect(() => {
    if (!isPvp || !effSettings?.lobbyId) return;
    if (!state.gameOver) return;
    try {
      let winnerSide: 'creator' | 'joiner' | undefined;
      if (state.winner && effSettings?.myRole) {
        if (state.winner === 'player') winnerSide = effSettings.myRole;
        else if (state.winner === 'opponent') winnerSide = effSettings.myRole === 'creator' ? 'joiner' : 'creator';
      }
      sendMessage({ type: 'gameOver', lobbyId: effSettings.lobbyId, winner: winnerSide });
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPvp, effSettings?.lobbyId, state.gameOver]);

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <Button variant="outline" onClick={handleBack} disabled={!isSpectator && isPvp && state.gameOver && state.winner === 'player' && !claimed}>← Back to Lobby</Button>
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
                  disabled={isSpectator || tile.isRevealed || state.activeTurn !== 'player' || state.gameOver || state.playerHasHitBomb}
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
                {/* Left player (You or Creator when spectating) */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 min-w-0">
                    <img src={leftAvatar} alt={leftName} className="w-8 h-8 rounded-full border border-white/10 object-cover" />
                    <span className="truncate max-w-[140px] font-medium">{leftName}</span>
                  </div>
                  <Badge variant={state.playerHasHitBomb ? 'destructive' : 'secondary'}>{state.playerScore} Tiles</Badge>
                </div>
                {/* Right player (Opponent or Joiner/Robot when spectating) */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 min-w-0">
                    <img src={rightAvatar} alt={rightName} className="w-8 h-8 rounded-full border border-white/10 object-cover" />
                    <span className="truncate max-w-[140px] font-medium">{rightName}</span>
                  </div>
                  <Badge variant={state.opponentHasHitBomb ? 'destructive' : 'secondary'}>{state.opponentScore} Tiles</Badge>
                </div>
                <div className="text-center pt-2">
                  <Badge variant="outline" className={state.gameOver ? '' : 'animate-pulse'}>
                    <Trophy className="w-4 h-4 mr-1" />
                        {state.gameOver
                          ? (state.winner === 'player' ? `${leftName} Won` : state.winner === 'opponent' ? `${rightName} Won` : 'Tie Game')
                          : `${activeTurnName}'s Turn`}
                  </Badge>
                </div>
              </div>
            </div>
            {(state.gameOver || coinflip.show || spectateOver) && (
                <Dialog open={state.gameOver || coinflip.show || spectateOver} onOpenChange={() => {
                  if (coinflip.show) return;
                  handleBack();
                }}>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>{coinflip.show ? 'Tie Breaker!' : 'Game Over!'}</DialogTitle>
                      {coinflip.show && coinflip.winner ? (
                        <Coinflip 
                          winner={coinflip.winner} 
                          onAnimationComplete={handleCoinflipComplete} 
                          onLobbyReturn={handleBack}
                        /> 
                      ) : (
                        <DialogDescription>
                          {spectateOver && isSpectator
                            ? 'The match has ended.'
                            : (state.winner === 'player' ? `You won with a score of ${state.playerScore} to ${state.opponentScore}!` : state.winner === 'opponent' ? `${isPvp ? 'Opponent' : 'Bot'} won ${state.opponentScore} to ${state.playerScore}.` : state.winner === 'tie' ? `It's a tie at ${state.playerScore} each!` : 'The game is over.')}
                        </DialogDescription>
                      )}
                    </DialogHeader>
                    {!coinflip.show && (
                      <div className="mt-4 space-y-2">
                        {!isSpectator && state.winner === 'player' && (
                          <Button onClick={handleClaimWinnings} className="w-full" variant="default" disabled={claiming || claimed}>
                            {claiming ? 'Claiming…' : claimed ? 'Claimed' : 'Claim Winnings'}
                          </Button>
                        )}
                        <Button onClick={handleBack} className="w-full" variant="outline" disabled={isPvp && state.gameOver && state.winner === 'player' && !claimed}>Back to Lobby</Button>
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
