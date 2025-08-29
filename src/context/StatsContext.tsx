import React, { createContext, useContext, useEffect, useState, useMemo, useRef } from 'react';
import { useLevel } from '@/hooks/useLevel';
import defaultAvatar from '@/assets/default-avatar.png';
import { useWallet } from '@solana/wallet-adapter-react';
import { useSocket } from '@/context/SocketContext';

export interface GameRecord {
  id: string;
  timestamp: string; // ISO string
  wageredAmount: number;
  netProfit: number;
  multiplier: number | null;
  gameMode: 'solo' | '1v1';
  serverSeed: string;
  clientSeed: string;
  nonce: number;
}

export interface UserProfile {
    name: string;
    email: string;
    avatarUrl: string;
    clientSeed: string;
}

interface StatsContextValue {
  gameHistory: GameRecord[];
  addGame: (game: Omit<GameRecord, 'id' | 'timestamp'>) => void;
  level: number;
  xpToNextLevel: number;
  xp: number;
  totalWagered: number;
  totalGames: number;
  netProfit: number;
  isStreamerMode: boolean;
  toggleStreamerMode: () => void;
  userProfile: UserProfile | null;
  updateUserProfile: (profile: UserProfile) => void;
  resetStats: () => void;
}

const StatsContext = createContext<StatsContextValue | undefined>(undefined);

export const StatsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [gameHistory, setGameHistory] = useState<GameRecord[]>([]);
  const { publicKey } = useWallet();
  const socket = useSocket();
  const { 
    level, 
    totalWagered, 
    xpForNextLevel,
    currentLevelXp,
    addWageredAmount,
    resetWageredAmount,
    hydrateWageredAmount,
  } = useLevel();
  const [isStreamerMode, setIsStreamerMode] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem('streamerMode') === 'true';
  });
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  // Avoid immediate signature prompt on first load
  const skippedInitialPush = useRef(false);

  const resetStats = () => {
    // Intentionally do nothing to avoid wiping persisted stats/level.
    // We keep this method for API compatibility, but it no longer clears
    // localStorage or resets XP so that statistics and level never reset.
    // If a temporary UI clear is desired without affecting persistence,
    // implement a separate session-only state.
  };

  // Load user profile on mount and when publicKey changes
  useEffect(() => {
    if (!publicKey) {
        setUserProfile(null);
        return;
    }
    const storedProfile = localStorage.getItem(`userProfile_${publicKey.toBase58()}`);
    if (storedProfile) {
        const profile = JSON.parse(storedProfile);
        // Ensure avatarUrl is set, defaulting to defaultAvatar if not present
        if (!profile.avatarUrl) {
            profile.avatarUrl = defaultAvatar;
        }
        setUserProfile(profile);
    } else {
        const seed = Math.random().toString(36).substring(2);
        const newProfile: UserProfile = {
            name: `User...${publicKey.toBase58().slice(-4)}`,
            email: "",
            avatarUrl: defaultAvatar,
            clientSeed: seed,
        };
        setUserProfile(newProfile);
        localStorage.setItem(`userProfile_${publicKey.toBase58()}`, JSON.stringify(newProfile));
    }
  }, [publicKey]);

  // Load saved stats for the active wallet only. If wallet disconnects, keep current in-memory state.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!publicKey) return; // do not clear on disconnect; preserve UI state
    try {
      const saved = localStorage.getItem(`stats-games_${publicKey.toBase58()}`);
      if (saved) {
        setGameHistory(JSON.parse(saved));
      } else {
        setGameHistory([]);
      }
    } catch {
      // on parse/storage error, do not nuke existing memory; show empty for safety
      setGameHistory([]);
    }
  }, [publicKey]);

  // Cross-device sync: fetch from server on wallet connect and socket ready
  useEffect(() => {
    const run = async () => {
      if (!publicKey || !socket?.ready) return;
      try {
        const walletStr = publicKey.toBase58();
        const serverStats = await socket.getStats(walletStr);
        if (!serverStats) return;

        // Merge local and server safely
        const localSaved = (() => {
          try { return JSON.parse(localStorage.getItem(`stats-games_${walletStr}`) || '[]'); } catch { return []; }
        })() as GameRecord[];
        const mergedHistoryMap = new Map<string, GameRecord>();
        for (const g of serverStats.gameHistory) mergedHistoryMap.set(g.id, g);
        for (const g of localSaved) mergedHistoryMap.set(g.id, g);
        const mergedHistory = Array.from(mergedHistoryMap.values()).sort((a,b)=> (a.timestamp < b.timestamp ? 1 : -1));

        // Choose the higher totalWagered to avoid losing progress
        const localTotal = (() => {
          try { return parseFloat(localStorage.getItem(`totalWagered_${walletStr}`) || '0') || 0; } catch { return 0; }
        })();
        const mergedTotal = Math.max(localTotal, Number(serverStats.totalWagered) || 0);

        setGameHistory(mergedHistory);
        hydrateWageredAmount(mergedTotal);
      } catch (e) {
        // fail soft
      }
    };
    run();
  }, [publicKey, socket?.ready]);

  // Persist stats
  useEffect(() => {
    if (typeof window === 'undefined' || !publicKey) return;
    try {
      localStorage.setItem(`stats-games_${publicKey.toBase58()}`, JSON.stringify(gameHistory));
    } catch {}
  }, [gameHistory, publicKey]);

  // Push updates to server when local stats change
  useEffect(() => {
    const push = async () => {
      if (!publicKey || !socket?.ready) return;
      // Skip the first run to avoid wallet prompt on page load
      if (!skippedInitialPush.current) {
        skippedInitialPush.current = true;
        return;
      }
      const walletStr = publicKey.toBase58();
      try {
        await socket.putStats({
          wallet: walletStr,
          payload: {
            totalWagered,
            gameHistory,
          },
        });
      } catch {
        // best-effort; ignore failures
      }
    };
    push();
  }, [publicKey, socket?.ready, gameHistory, totalWagered]);

  // Persist streamer mode
  useEffect(() => {
    if (typeof window === 'undefined') return;
    localStorage.setItem('streamerMode', isStreamerMode.toString());
  }, [isStreamerMode]);

  const addGame = (gameData: Omit<GameRecord, 'id' | 'timestamp'>) => {
    const newGame: GameRecord = {
      ...gameData,
      id: `game_${Date.now()}`,
      timestamp: new Date().toISOString(),
    };
    setGameHistory((prev) => [newGame, ...prev]);
    addWageredAmount(gameData.wageredAmount);
  };

  const toggleStreamerMode = () => {
    setIsStreamerMode(prev => !prev);
  };

  const updateUserProfile = (profile: UserProfile) => {
      if (!publicKey) return;
      setUserProfile(profile);
      localStorage.setItem(`userProfile_${publicKey.toBase58()}`, JSON.stringify(profile));
  }

  const totalGames = gameHistory.length;
  const netProfit = useMemo(() => gameHistory.reduce((acc, game) => acc + game.netProfit, 0), [gameHistory]);

  return (
    <StatsContext.Provider value={{ 
        gameHistory, 
        addGame,
        level,
        xpToNextLevel: xpForNextLevel,
        xp: currentLevelXp,
        totalWagered,
        totalGames,
        netProfit,
        isStreamerMode,
        toggleStreamerMode,
        userProfile,
        updateUserProfile,
        resetStats,
    }}>
      {children}
    </StatsContext.Provider>
  );
};

export const useStats = () => {
  const ctx = useContext(StatsContext);
  if (!ctx) throw new Error('useStats must be used within StatsProvider');
  return ctx;
}; 