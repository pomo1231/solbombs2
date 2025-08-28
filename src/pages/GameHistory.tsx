import { useStats, GameRecord } from '@/context/StatsContext';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Gem, Bomb } from 'lucide-react';
import { Header } from '@/components/layout/Header';

export const GameHistoryPage = () => {
  const { games } = useStats();

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <div className="container mx-auto py-8">
        <Card>
          <CardHeader>
            <CardTitle>Game History</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Timestamp</TableHead>
                  <TableHead>Mode</TableHead>
                  <TableHead>Wager</TableHead>
                  <TableHead>Multiplier</TableHead>
                  <TableHead>Profit</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {games.map((game: GameRecord) => (
                  <TableRow key={game.id}>
                    <TableCell>{new Date(game.timestamp).toLocaleString()}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{game.gameMode}</Badge>
                    </TableCell>
                    <TableCell>{game.wageredAmount.toFixed(2)} SOL</TableCell>
                    <TableCell>
                      {game.multiplier ? `${game.multiplier.toFixed(2)}x` : <Bomb className="w-4 h-4 text-red-500" />}
                    </TableCell>
                    <TableCell className={game.netProfit > 0 ? 'text-green-400' : 'text-red-400'}>
                      {game.netProfit.toFixed(2)} SOL
                    </TableCell>
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