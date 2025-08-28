import { Header } from '@/components/layout/Header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Trophy } from 'lucide-react';
import { generateAvatarUrl } from '@/lib/utils';
import { useLeaderboard } from '@/hooks/useLeaderboard';

export const LeaderboardPage = () => {
  const { leaderboard } = useLeaderboard();

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <div className="container mx-auto py-8">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Trophy className="w-6 h-6 text-yellow-400" />
              Weekly Leaderboard
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Rank</TableHead>
                  <TableHead>Player</TableHead>
                  <TableHead>Total Wagered</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {leaderboard.map((player) => (
                  <TableRow 
                    key={player.rank} 
                    className={player.isCurrentUser ? 'bg-primary/10' : ''}
                  >
                    <TableCell className="font-bold">{player.rank}</TableCell>
                    <TableCell className="flex items-center gap-3">
                      <img 
                        src={player.isCurrentUser && player.avatar ? player.avatar : generateAvatarUrl(player.avatarSeed)} 
                        alt={player.name} 
                        className="w-8 h-8 rounded-full"
                      />
                      {player.name}
                    </TableCell>
                    <TableCell>{player.wagered.toFixed(2)} SOL</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}; 