import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
  } from "@/components/ui/table";
  import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
  import { useStats } from "@/context/StatsContext";
  import { Bomb } from "lucide-react";
  
  const TransactionsPage = () => {
    const { gameHistory } = useStats();
  
    return (
      <div className="container mx-auto py-8">
        <Card>
          <CardHeader>
            <CardTitle>Transaction History</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Game</TableHead>
                  <TableHead>Wager</TableHead>
                  <TableHead>Multiplier</TableHead>
                  <TableHead className="text-right">Profit</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {gameHistory.map((game) => (
                  <TableRow key={game.id}>
                    <TableCell>
                      {new Date(game.timestamp).toLocaleString()}
                    </TableCell>
                    <TableCell>{game.gameMode}</TableCell>
                    <TableCell>{game.wageredAmount.toFixed(2)} SOL</TableCell>
                    <TableCell>
                      {game.netProfit < 0 ? (
                        <Bomb className="w-5 h-5 text-red-500" />
                      ) : game.multiplier ? (
                        `${game.multiplier.toFixed(2)}x`
                      ) : (
                        "-"
                      )}
                    </TableCell>
                    <TableCell
                      className={`text-right font-bold ${
                        game.netProfit > 0 ? "text-green-400" : "text-red-400"
                      }`}
                    >
                      {game.netProfit.toFixed(2)} SOL
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    );
  };
  
  export default TransactionsPage; 