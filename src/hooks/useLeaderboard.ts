import { useState, useEffect } from 'react';
import { useStats } from '@/context/StatsContext';
import { useWallet } from '@solana/wallet-adapter-react';

export interface LeaderboardPlayer {
  name: string;
  wagered: number;
  avatarSeed: string;
  isCurrentUser?: boolean;
  rank?: number;
  avatar?: string;
}

export const useLeaderboard = () => {
  const { games } = useStats();
  const { publicKey } = useWallet();
  const [leaderboard, setLeaderboard] = useState<LeaderboardPlayer[]>([]);
  const [userName, setUserName] = useState('Player');
  const [userAvatar, setUserAvatar] = useState<string | undefined>();

  useEffect(() => {
    if (publicKey) {
      const user = localStorage.getItem('user_' + publicKey.toBase58());
      if (user) {
        const parsed = JSON.parse(user);
        setUserName(parsed.name);
        setUserAvatar(parsed.avatar);
      }
    }
  }, [publicKey]);

  useEffect(() => {
    // Calculate user's weekly wager
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

    const userTotalWagered = games
      .filter(game => new Date(game.timestamp) > oneWeekAgo)
      .reduce((sum, game) => sum + game.wageredAmount, 0);

    const currentUserData: LeaderboardPlayer = {
      name: userName,
      wagered: userTotalWagered,
      avatarSeed: publicKey?.toBase58() || 'default',
      isCurrentUser: true,
      avatar: userAvatar,
    };

    const combinedData = [currentUserData]
      .sort((a, b) => b.wagered - a.wagered)
      .map((player, index) => ({ ...player, rank: index + 1 }));

    setLeaderboard(combinedData);

  }, [games, publicKey, userName, userAvatar]);

  return { leaderboard };
}; 