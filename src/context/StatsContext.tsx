import React, { createContext, useContext, useEffect, useState, useMemo } from 'react';
import { useLevel } from '@/hooks/useLevel';
import defaultAvatar from '@/assets/default-avatar.png';
import { useWallet } from '@solana/wallet-adapter-react';

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
  const { 
    level, 
    totalWagered, 
    xpForNextLevel,
    currentLevelXp,
    addWageredAmount,
    resetWageredAmount
  } = useLevel();
  const [isStreamerMode, setIsStreamerMode] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem('streamerMode') === 'true';
  });
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);

  const resetStats = () => {
    // Clear in-memory history
    setGameHistory([]);

    // Remove ONLY the current wallet's saved stats to keep profiles isolated per wallet
    if (publicKey) {
      try {
        localStorage.removeItem(`stats-games_${publicKey.toBase58()}`);
        // Also reset the current wallet's wagered/XP progression
        resetWageredAmount();
      } catch {}
    }
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

  // Load saved stats
  useEffect(() => {
    if (typeof window === 'undefined' || !publicKey) {
        setGameHistory([]);
        return;
    };
    try {
      const saved = localStorage.getItem(`stats-games_${publicKey.toBase58()}`);
      if (saved) {
        setGameHistory(JSON.parse(saved));
      } else {
        setGameHistory([]);
      }
    } catch {
        setGameHistory([]);
    }
  }, [publicKey]);

  // Persist stats
  useEffect(() => {
    if (typeof window === 'undefined' || !publicKey) return;
    try {
      localStorage.setItem(`stats-games_${publicKey.toBase58()}`, JSON.stringify(gameHistory));
    } catch {}
  }, [gameHistory, publicKey]);

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