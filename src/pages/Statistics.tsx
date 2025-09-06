import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useStats } from "@/context/StatsContext";
import { SolanaLogo } from "@/components/SolanaLogo";
import { useI18n } from '@/context/I18nContext';
import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useWallet } from '@solana/wallet-adapter-react';
import { useSocket } from '@/context/SocketContext';

const StatisticsPage = () => {
    const { 
        totalWagered: localTotalWagered, 
        netProfit: localNetProfit, 
        gameHistory: localGameHistory,
    } = useStats();
    const { t } = useI18n();
    const { publicKey } = useWallet();
    const { getStats, getProfile } = useSocket();
    const location = useLocation();
    const params = new URLSearchParams(location.search);
    const targetWallet = params.get('wallet') || undefined;

    const [remoteStats, setRemoteStats] = useState<{ totalWagered: number; gameHistory: any[] } | null>(null);
    const [loading, setLoading] = useState(false);
    const [viewName, setViewName] = useState<string | null>(null);

    const isViewingSomeoneElse = useMemo(() => {
        const current = publicKey?.toBase58();
        return !!(targetWallet && targetWallet !== current);
    }, [targetWallet, publicKey]);

    useEffect(() => {
        let active = true;
        const run = async () => {
            if (!isViewingSomeoneElse || !targetWallet) { setRemoteStats(null); setViewName(null); return; }
            setLoading(true);
            try {
                const [stats, profile] = await Promise.all([
                    (async () => { try { return await getStats(targetWallet); } catch { return null; } })(),
                    (async () => { try { return await getProfile(targetWallet); } catch { return null; } })(),
                ]);
                if (!active) return;
                if (profile?.name) setViewName(profile.name);
                if (stats) setRemoteStats({ totalWagered: Number(stats.totalWagered) || 0, gameHistory: Array.isArray(stats.gameHistory) ? stats.gameHistory : [] });
                else setRemoteStats({ totalWagered: 0, gameHistory: [] });
            } finally {
                if (active) setLoading(false);
            }
        };
        run();
        return () => { active = false; };
    }, [isViewingSomeoneElse, targetWallet, getStats, getProfile]);

    const sourceGameHistory = isViewingSomeoneElse ? (remoteStats?.gameHistory || []) : localGameHistory;
    const sourceTotalWagered = isViewingSomeoneElse ? (remoteStats?.totalWagered || 0) : localTotalWagered;
    const sourceNetProfit = isViewingSomeoneElse ? (sourceGameHistory.reduce((a: number, g: any) => a + (Number(g.netProfit) || 0), 0)) : localNetProfit;

    const chartData = sourceGameHistory
        .slice()
        .reverse()
        .reduce((acc: { game: number; profit: number }[], game, index) => {
            const prev = acc.length ? acc[acc.length - 1].profit : 0;
            const cumulative = prev + game.netProfit;
            acc.push({ game: index + 1, profit: cumulative });
            return acc;
        }, []);

  return (
    <div className="container mx-auto py-8">
        <div className="space-y-8">
            <div>
                <h2 className="text-2xl font-semibold mb-1 text-left">{t('stats.title')}</h2>
                {isViewingSomeoneElse && (
                    <p className="text-sm text-gray-400 mb-4">Viewing statistics for {viewName ? <span className="text-gray-200 font-medium">{viewName}</span> : <span className="text-gray-200 font-mono">{targetWallet?.slice(0,4)}…{targetWallet?.slice(-4)}</span>}</p>
                )}
                <Card className="bg-gradient-to-r from-purple-900/50 to-indigo-900/50 border border-purple-500/50 p-1">
                    <CardContent className="pt-6">
                        <p className="text-sm font-light text-gray-400 mb-2">{t('stats.netProfit')}</p>
                        <div className="flex items-center gap-3">
                            <SolanaLogo className="w-8 h-8 mr-0 drop-shadow-[0_1px_6px_rgba(20,241,149,0.35)]" />
                            <span className="text-3xl font-bold tracking-tight">{sourceNetProfit.toFixed(2)}</span>
                        </div>
                    </CardContent>
                </Card>
            </div>

            <div>
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-2xl font-semibold text-left">{t('stats.wagerStats')}</h2>
                </div>
                <Card className="bg-zinc-800/80 h-80 flex items-center justify-center p-4">
                    {loading ? (
                        <p className="text-gray-400">Loading…</p>
                    ) : sourceGameHistory.length === 0 ? (
                        <p className="text-gray-400">{t('stats.noBets')}</p>
                    ) : (
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={chartData} margin={{ top: 5, right: 20, left: -10, bottom: 5 }}>
                                <defs>
                                    <linearGradient id="profitGradient" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.45} />
                                        <stop offset="100%" stopColor="#8b5cf6" stopOpacity={0.05} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255, 255, 255, 0.08)" />
                                <XAxis dataKey="game" stroke="#9ca3af" tickLine={false} axisLine={{ stroke: '#374151' }} />
                                <YAxis stroke="#9ca3af" tickLine={false} axisLine={{ stroke: '#374151' }} />
                                <Tooltip
                                    formatter={(value: number) => [`${value.toFixed(2)} SOL`, t('stats.profit')]}
                                    contentStyle={{ backgroundColor: '#111827', border: '1px solid #1f2937', borderRadius: 8 }}
                                    labelStyle={{ color: '#9ca3af' }}
                                />
                                <Legend wrapperStyle={{ color: '#d1d5db' }} />
                                <ReferenceLine y={0} stroke="#6b7280" strokeDasharray="3 3" />
                                <Area type="monotone" dataKey="profit" name={t('stats.profit')} stroke="#a78bfa" strokeWidth={2.2} fill="url(#profitGradient)" activeDot={{ r: 6 }} />
                            </AreaChart>
                        </ResponsiveContainer>
                    )}
                </Card>
            </div>

            <div>
                <h2 className="text-2xl font-semibold mb-4 text-left">{t('stats.wagerStats')}</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Card className="bg-zinc-800/80">
                        <CardHeader><CardTitle className="font-normal text-gray-300">{t('stats.totalWagered')}</CardTitle></CardHeader>
                        <CardContent>
                            <div className="flex items-center gap-3">
                                <SolanaLogo className="w-7 h-7 mr-0 drop-shadow-[0_1px_6px_rgba(20,241,149,0.35)]" />
                                <p className="text-2xl font-bold tracking-tight">{sourceTotalWagered.toFixed(2)}</p>
                            </div>
                        </CardContent>
                    </Card>
                    <Card className="bg-zinc-800/80">
                        <CardHeader><CardTitle className="font-normal text-gray-300">{t('stats.profit')}</CardTitle></CardHeader>
                        <CardContent>
                            <div className="flex items-center gap-3">
                                <SolanaLogo className="w-7 h-7 mr-0 drop-shadow-[0_1px_6px_rgba(20,241,149,0.35)]" />
                                <p className="text-2xl font-bold tracking-tight">{sourceNetProfit.toFixed(2)}</p>
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