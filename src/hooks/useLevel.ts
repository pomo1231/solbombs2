import { useState, useEffect, useCallback } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';

// Define the experience needed for each level.
// Using a curve where each level requires more XP than the last.
const XP_PER_LEVEL = Array.from({ length: 100 }, (_, i) => 10 * (i + 1) ** 2);

/**
 * A custom hook to manage user leveling based on wagered amounts.
 * The wagered amount is treated as experience points (XP).
 */
export const useLevel = () => {
  const { publicKey } = useWallet();
  const storageKey = publicKey ? `totalWagered_${publicKey.toBase58()}` : null;

  const [totalWagered, setTotalWagered] = useState<number>(() => {
    if (!storageKey) return 0;
    const saved = localStorage.getItem(storageKey);
    return saved ? parseFloat(saved) : 0;
  });

  const [level, setLevel] = useState<number>(1);
  const [xpForNextLevel, setXpForNextLevel] = useState<number>(XP_PER_LEVEL[0]);
  const [currentLevelXp, setCurrentLevelXp] = useState<number>(0);

  useEffect(() => {
    // Recalculate level on load or when publicKey changes
    if (storageKey) {
        const saved = localStorage.getItem(storageKey);
        const currentWagered = saved ? parseFloat(saved) : 0;
        setTotalWagered(currentWagered);
    } else {
        setTotalWagered(0);
    }
  }, [publicKey, storageKey]);


  useEffect(() => {
    // Persist total wagered amount to local storage whenever it changes.
    if (storageKey) {
        localStorage.setItem(storageKey, totalWagered.toString());
    }

    // Recalculate level and XP progress.
    let cumulativeXp = 0;
    let currentLevel = 1;

    for (let i = 0; i < XP_PER_LEVEL.length; i++) {
      const xpNeeded = XP_PER_LEVEL[i];
      if (totalWagered >= cumulativeXp + xpNeeded) {
        cumulativeXp += xpNeeded;
        currentLevel++;
      } else {
        break;
      }
    }
    
    const xpIntoLevel = totalWagered - cumulativeXp;

    setLevel(currentLevel);
    setXpForNextLevel(XP_PER_LEVEL[currentLevel -1] || Infinity);
    setCurrentLevelXp(xpIntoLevel);

  }, [totalWagered, storageKey]);

  const addWageredAmount = useCallback((amount: number) => {
    if (amount > 0) {
      setTotalWagered(prev => prev + amount);
    }
  }, []);

  const resetWageredAmount = useCallback(() => {
    setTotalWagered(0);
    if (storageKey) {
        localStorage.setItem(storageKey, '0');
    }
  }, [storageKey]);

  return {
    level,
    totalWagered,
    xpForNextLevel,
    currentLevelXp,
    addWageredAmount,
    resetWageredAmount,
  };
}; 