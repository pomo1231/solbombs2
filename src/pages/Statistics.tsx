import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useStats } from "@/context/StatsContext";
import { SolanaLogo } from "@/components/SolanaLogo";

const StatisticsPage = () => {
    const { 
        totalWagered, 
        netProfit, 
        gameHistory,
    } = useStats();

    const chartData = gameHistory.slice().reverse().map((game, index) => ({
        game: index + 1,
        profit: game.netProfit,
    }));

  return (
    <div className="container mx-auto py-8">
        <div className="space-y-8">
            <div>
                <h2 className="text-2xl font-semibold mb-4 text-left">Statistics</h2>
                <Card className="bg-gradient-to-r from-purple-900/50 to-indigo-900/50 border border-purple-500/50 p-1">
                    <CardContent className="pt-6">
                        <p className="text-sm font-light text-gray-400 mb-2">Net Profit</p>
                        <div className="flex items-center gap-3">
                            <SolanaLogo className="w-8 h-8 mr-0 drop-shadow-[0_1px_6px_rgba(20,241,149,0.35)]" />
                            <span className="text-3xl font-bold tracking-tight">{netProfit.toFixed(2)}</span>
                        </div>
                    </CardContent>
                </Card>
            </div>

            <div>
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-2xl font-semibold text-left">Wager Stats</h2>
                </div>
                <Card className="bg-zinc-800/80 h-80 flex items-center justify-center p-4">
                    {gameHistory.length === 0 ? (
                        <p className="text-gray-400">No bets</p>
                    ) : (
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={chartData} margin={{ top: 5, right: 20, left: -10, bottom: 5 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255, 255, 255, 0.1)" />
                                <XAxis dataKey="game" stroke="#9ca3af" />
                                <YAxis stroke="#9ca3af" />
                                <Tooltip
                                    contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151' }}
                                    labelStyle={{ color: '#d1d5db' }}
                                />
                                <Legend wrapperStyle={{ color: '#d1d5db' }} />
                                <ReferenceLine y={0} stroke="#6b7280" strokeDasharray="3 3" />
                                <Line type="monotone" dataKey="profit" stroke="#8b5cf6" strokeWidth={2} dot={{ r: 4, fill: '#8b5cf6' }} activeDot={{ r: 8 }}/>
                            </LineChart>
                        </ResponsiveContainer>
                    )}
                </Card>
            </div>

            <div>
                <h2 className="text-2xl font-semibold mb-4 text-left">Wager Stats</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Card className="bg-zinc-800/80">
                        <CardHeader><CardTitle className="font-normal text-gray-300">Total Wagered</CardTitle></CardHeader>
                        <CardContent>
                            <div className="flex items-center gap-3">
                                <SolanaLogo className="w-7 h-7 mr-0 drop-shadow-[0_1px_6px_rgba(20,241,149,0.35)]" />
                                <p className="text-2xl font-bold tracking-tight">{totalWagered.toFixed(2)}</p>
                            </div>
                        </CardContent>
                    </Card>
                    <Card className="bg-zinc-800/80">
                        <CardHeader><CardTitle className="font-normal text-gray-300">Profit</CardTitle></CardHeader>
                        <CardContent>
                            <div className="flex items-center gap-3">
                                <SolanaLogo className="w-7 h-7 mr-0 drop-shadow-[0_1px_6px_rgba(20,241,149,0.35)]" />
                                <p className="text-2xl font-bold tracking-tight">{netProfit.toFixed(2)}</p>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>
            
            {/* Reset button removed to ensure stats/level cannot be cleared from UI */}
        </div>
    </div>
  );
};

export default StatisticsPage; 