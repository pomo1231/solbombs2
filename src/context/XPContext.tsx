import { createContext, useContext, useState, ReactNode, FC } from 'react';

const XP_PER_LEVEL = 1000; // Example: 1000 XP to level up

interface IXPContext {
  level: number;
  xp: number;
  addXP: (amount: number) => void;
}

const XPContext = createContext<IXPContext | undefined>(undefined);

export const XPProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const [xp, setXp] = useState(0);
  const [level, setLevel] = useState(1);

  const addXP = (amount: number) => {
    setXp(prevXp => {
      const newXp = prevXp + amount;
      const newLevel = Math.floor(newXp / XP_PER_LEVEL) + 1;
      if (newLevel > level) {
        setLevel(newLevel);
      }
      return newXp;
    });
  };

  return (
    <XPContext.Provider value={{ level, xp, addXP }}>
      {children}
    </XPContext.Provider>
  );
};

export const useXP = () => {
  const context = useContext(XPContext);
  if (context === undefined) {
    throw new Error('useXP must be used within an XPProvider');
  }
  return context;
}; 