import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Users, Eye, Loader2, Bot, X } from 'lucide-react';
import solanaLogo from '@/assets/solana-logo-mark.svg';
import { toast } from '@/components/ui/use-toast';
import { useWallet } from '@solana/wallet-adapter-react';
import { startPvpOnchain, joinPvpOnchain, isOnchainConfigured, cancelPvpOnchain } from '@/lib/sol/anchorClient';
import { generateAvatarUrl } from '@/lib/utils';
import { useSocket } from '@/context/SocketContext';
import { useSolPrice } from '@/hooks/useSolPrice';
import { useStats } from '@/context/StatsContext';

interface GameSettings {
  bombs: number;
  amount: number;
  opponent: 'bot' | 'player' | null;
  // Optional PvP on-chain context passed into the game view
  pvpGamePda?: string;
  creator?: string;
  joiner?: string | null;
  vsRobot?: boolean;
  lobbyId?: string;
  myRole?: 'creator' | 'joiner';
  startsBy?: 'creator' | 'joiner';
  boardSeed?: string;
  spectate?: boolean;
  // Profile context for immediate UI
  creatorName?: string | null;
  creatorAvatar?: string | null;
  joinerName?: string | null;
  joinerAvatar?: string | null;
}

interface MultiplayerLobbyPageProps {
  onStartGame: (settings: GameSettings) => void;
}

export function MultiplayerLobbyPage({ onStartGame }: MultiplayerLobbyPageProps) {
  const walletCtx = useWallet();
  const { publicKey, connected } = walletCtx;
  const { onlineCount, lobbies, ready, sendMessage, removeLobby, markLobbyRobotActive, setStartGameHandler, setStartSpectateHandler } = useSocket();
  const [bombs, setBombs] = useState('3');
  const [amount, setAmount] = useState(0.01);
  const [creating, setCreating] = useState(false);
  const { price: solUsd } = useSolPrice();
  const [amountInput, setAmountInput] = useState<string>(String(0.01));
  const { userProfile } = useStats();
  
  const [createdGame, setCreatedGame] = useState<any>(null);
  const [showBotOption, setShowBotOption] = useState(false);
  const [spectateLobbyId, setSpectateLobbyId] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);

  // Deduplicate lobbies: if server sends mirrored entries (creator/joiner swapped), only show one
  const dedupedLobbies = useMemo(() => {
    const map = new Map<string, any>();
    for (const g of lobbies) {
      const creatorWallet = (g as any).creatorWallet || '';
      const joinerWallet = (g as any).joinerWallet || '';
      const bombCount = (g as any).bombCount ?? g.bombCount;
      const betAmount = (g as any).betAmount ?? g.betAmount;
      const pda = (g as any).pvpGamePda || '';
      // Prefer PDA as unique key when present
      let key: string;
      if (pda) key = `pda:${pda}`;
      else {
        const a = String(creatorWallet || '').toLowerCase();
        const b = String(joinerWallet || '').toLowerCase();
        const [x, y] = [a, b].sort();
        key = `pair:${x}|${y}|${bombCount}|${betAmount}`;
      }
      if (!map.has(key)) map.set(key, g);
    }
    return Array.from(map.values());
  }, [lobbies]);

  const currentUser = {
    name: userProfile?.name || (publicKey ? `${publicKey.toBase58().slice(0, 4)}...` : 'Player'),
    avatar: userProfile?.avatarUrl || (publicKey ? generateAvatarUrl(publicKey.toBase58()) : generateAvatarUrl('default')),
    level: 1,
  };

  const handleSpectate = (game: any) => {
    setSpectateLobbyId(game.id);
    sendMessage({ 
      type: 'spectateLobby', 
      lobbyId: game.id,
      pvpGamePda: (game as any).pvpGamePda,
      gameNonce: (game as any).gameNonce,
    });
  };

  

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (createdGame) {
      timer = setTimeout(() => {
        setShowBotOption(true);
      }, 5000);
    }
    return () => clearTimeout(timer);
  }, [createdGame]);

  // Listen for server "startGame" to transition both creator and joiner
  useEffect(() => {
    if (!setStartGameHandler) return;
    const handler = (data: { lobbyId: string; betAmount: number; bombCount: number; startsBy?: 'creator' | 'joiner'; yourRole?: 'creator' | 'joiner'; boardSeed?: string; pvpGamePda?: string; creatorWallet?: string; joinerWallet?: string; creatorName?: string | null; creatorAvatar?: string | null; joinerName?: string | null; joinerAvatar?: string | null; }) => {
      onStartGame({
        amount: data.betAmount,
        bombs: data.bombCount,
        opponent: 'player',
        lobbyId: data.lobbyId,
        startsBy: data.startsBy,
        myRole: data.yourRole,
        boardSeed: data.boardSeed,
        pvpGamePda: data.pvpGamePda,
        creator: data.creatorWallet,
        joiner: data.joinerWallet ?? null,
        creatorName: data.creatorName ?? null,
        creatorAvatar: data.creatorAvatar ?? null,
        joinerName: data.joinerName ?? null,
        joinerAvatar: data.joinerAvatar ?? null,
      });
      // clear local waiting UI if we were the creator
      setCreatedGame(null);
      setShowBotOption(false);
    };
    setStartGameHandler(handler);
    return () => setStartGameHandler(undefined);
  }, [setStartGameHandler, onStartGame]);

  // Listen for server "startSpectate" after we request spectating
  useEffect(() => {
    if (!setStartSpectateHandler) return;
    const handler = (data: { type: 'startSpectate'; lobbyId: string; betAmount: number; bombCount: number; boardSeed?: string; moves?: Array<{tileId:number; by:'creator'|'joiner'}>; creatorWallet?: string; joinerWallet?: string; creatorName?: string | null; creatorAvatar?: string | null; joinerName?: string | null; joinerAvatar?: string | null; vsRobotActive?: boolean; startsBy?: 'creator'|'joiner'; }) => {
      if (!spectateLobbyId || data.lobbyId !== spectateLobbyId) return;
      // Start the game in spectate mode with server-provided boardSeed
      onStartGame({
        amount: data.betAmount,
        bombs: data.bombCount,
        opponent: data.vsRobotActive ? 'bot' : 'player',
        lobbyId: data.lobbyId,
        boardSeed: data.boardSeed,
        // mark spectate so local clicks don't send moves
        // MultiplayerMinesGame will hydrate using setStartSpectateHandler it registers after mount
        // and process historical moves from data.moves
        spectate: true,
        vsRobot: !!data.vsRobotActive,
        startsBy: data.startsBy,
        creator: data.creatorWallet,
        joiner: data.joinerWallet ?? null,
        creatorName: data.creatorName ?? null,
        creatorAvatar: data.creatorAvatar ?? null,
        joinerName: data.joinerName ?? null,
        joinerAvatar: data.joinerAvatar ?? null,
        // @ts-ignore: extra field consumed by game component to hydrate instantly
        spectateMoves: Array.isArray(data.moves) ? data.moves : [],
      } as any);
      setSpectateLobbyId(null);
    };
    setStartSpectateHandler(handler as any);
    return () => setStartSpectateHandler(undefined);
  }, [setStartSpectateHandler, spectateLobbyId, onStartGame]);

  const handleCreateGame = async () => {
    if (!connected || !publicKey) {
      toast({ title: 'Wallet not connected', description: 'Please connect your wallet to create a game.', variant: 'destructive' });
      return;
    }
    if (amount < 0.001) {
      toast({ title: 'Amount too low', description: 'Minimum is 0.001 SOL', variant: 'destructive' });
      return;
    }
    if (!walletCtx.sendTransaction) {
      toast({ title: 'Wallet Issue', description: 'Your wallet does not support sendTransaction.', variant: 'destructive' });
      return;
    }
    if (!isOnchainConfigured()) {
      toast({ title: 'On-chain not configured', description: 'Missing VITE_PROGRAM_ID / RPC. Check .env.', variant: 'destructive' });
      return;
    }
    
    setCreating(true);
    try {
      const lamports = Math.max(10_000, Math.round(amount * 1_000_000_000));
      const { pvpGamePda, gameNonce } = await startPvpOnchain({
        wallet: walletCtx as any,
        creator: publicKey,
        wagerLamports: lamports,
        vsRobot: false,
      });

      // Broadcast lobby with PDA so joiners can reference it
      const newLobbyMessage = {
        type: 'createLobby',
        name: currentUser.name,
        betAmount: amount,
        bombCount: parseInt(bombs),
        pvpGamePda: pvpGamePda.toBase58(),
        gameNonce,
        creatorWallet: publicKey.toBase58(),
        creatorName: currentUser.name,
        creatorAvatar: currentUser.avatar,
        allowRobot: true,
      };
      sendMessage(newLobbyMessage);

      const optimisticGame = {
        id: `temp-${Date.now()}`,
        name: currentUser.name,
        bombs: parseInt(bombs),
        amount: amount,
        pvpGamePda: pvpGamePda.toBase58(),
        gameNonce,
      };
      setCreatedGame(optimisticGame);
    } catch (e: any) {
      console.error('startPvpOnchain failed', e);
      toast({ title: 'Transaction failed', description: e?.message ?? String(e), variant: 'destructive' });
    } finally {
      setCreating(false);
    }
  };
  
  const cancelGame = async () => {
    if (cancelling) return; // guard against double click
    if (!connected || !publicKey) {
      toast({ title: 'Wallet not connected', description: 'Please connect your wallet.', variant: 'destructive' });
      return;
    }
    if (!isOnchainConfigured()) {
      toast({ title: 'On-chain not configured', description: 'Missing VITE_PROGRAM_ID / RPC. Check .env.', variant: 'destructive' });
      return;
    }
    if (!createdGame?.pvpGamePda) {
      toast({ title: 'Missing game context', description: 'No game PDA found to cancel.', variant: 'destructive' });
      return;
    }
    try {
      setCancelling(true);
      toast({ title: 'Requesting refund...', description: 'Approve the transaction in your wallet.' });
      const { signature } = await cancelPvpOnchain({ wallet: walletCtx as any, creator: publicKey, pvpGamePda: createdGame.pvpGamePda });
      // Notify server so lobby list updates for others
      if (createdGame?.id) {
        // Optimistically remove immediately; server will broadcast to others
        removeLobby(createdGame.id);
        sendMessage({ type: 'cancelLobby', lobbyId: createdGame.id, pvpGamePda: createdGame.pvpGamePda, signature });
      }
      toast({ title: 'Refund sent', description: `Tx: ${signature.slice(0, 8)}...` });
    } catch (e: any) {
      toast({ title: 'Cancel failed', description: e?.message ?? String(e), variant: 'destructive' });
      return;
    }
    // Close waiting screen
    setCreatedGame(null);
    setShowBotOption(false);
    setCancelling(false);
  };
  
  const playWithBot = async () => {
      // No on-chain tx. We treat no-joiner as robot on resolve, so just start.
      if (!connected || !publicKey) {
        toast({ title: 'Wallet not connected', description: 'Please connect your wallet.', variant: 'destructive' });
        return;
      }
      if (!createdGame?.pvpGamePda) {
        toast({ title: 'Missing game context', description: 'No game available.', variant: 'destructive' });
        return;
      }
      // Resolve the real server lobby id using PDA or nonce to avoid using the temporary local id
      const serverLobby = lobbies.find(l =>
        ((createdGame.pvpGamePda && l.pvpGamePda === createdGame.pvpGamePda) ||
         (typeof createdGame.gameNonce === 'number' && l.gameNonce === createdGame.gameNonce))
      );
      const serverLobbyId = serverLobby?.id || createdGame.id; // fallback to temp id if not yet synced
      onStartGame({ 
        amount: createdGame.amount, 
        bombs: createdGame.bombs, 
        opponent: 'bot',
        pvpGamePda: createdGame.pvpGamePda,
        creator: publicKey.toBase58(),
        joiner: null,
        vsRobot: true,
        // include lobbyId so spectators can attach and moves can be routed
        lobbyId: serverLobbyId,
      });
      // Inform server so lobby is marked as Robot-active for others (prevents joining and shows robot badge)
      try {
        sendMessage({ type: 'robotSelected', pvpGamePda: createdGame.pvpGamePda, lobbyId: serverLobbyId, gameNonce: createdGame.gameNonce });
      } catch {}
      // Optimistically update local lobby state immediately
      try {
        markLobbyRobotActive({ lobbyId: serverLobbyId, pvpGamePda: createdGame.pvpGamePda, gameNonce: createdGame.gameNonce });
      } catch {}
  };

  const handleJoin = async (game: any) => {
    if (!publicKey) {
      toast({ title: 'Wallet not connected', description: 'Please connect your wallet to join a game.', variant: 'destructive' });
      return;
    }
    // Note: Add a server-side check to prevent joining own game.
    toast({ title: 'Joining Game', description: `Joining ${game.name}'s game...` });
    try {
      if (!isOnchainConfigured()) {
        toast({ title: 'On-chain not configured', description: 'Missing VITE_PROGRAM_ID / RPC. Check .env.', variant: 'destructive' });
        return;
      }
      if (!game?.pvpGamePda) {
        toast({ title: 'Missing game context', description: 'Host did not publish PDA.', variant: 'destructive' });
        return;
      }
      // Fund/join the on-chain PvP pot, then notify the server
      await joinPvpOnchain({ wallet: walletCtx as any, joiner: publicKey, pvpGamePda: game.pvpGamePda });
      // Request join; include profile so lobby cards can show name/photo
      sendMessage({ 
        type: 'joinLobby', 
        lobbyId: game.id, 
        joinerWallet: publicKey.toBase58(),
        joinerName: userProfile?.name || `${publicKey.toBase58().slice(0,4)}...${publicKey.toBase58().slice(-4)}`,
        joinerAvatar: userProfile?.avatarUrl || generateAvatarUrl(publicKey.toBase58()),
      });
    } catch (e: any) {
      console.error('joinPvpOnchain failed', e);
      toast({ title: 'Join failed', description: e?.message ?? String(e), variant: 'destructive' });
    }
  };
  
  if (createdGame) {
    return (
      <div className="max-w-2xl mx-auto flex flex-col items-center justify-center h-[70vh]">
          <Card className="w-full text-center p-8 bg-gradient-card border-primary/20">
            <CardHeader>
                <CardTitle className="text-2xl">Waiting for Opponent...</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col items-center gap-6">
                <Loader2 className="w-16 h-16 text-primary animate-spin" />
                <p className="text-muted-foreground">Your game is live in the lobby.</p>
                <div className="text-lg">
                    <span>{createdGame.bombs} Bombs</span>
                    <span className="mx-4">|</span>
                    <span className="font-bold text-neon-cyan">{createdGame.amount.toFixed(3)} SOL</span>
                </div>
                {showBotOption && (
                    <Button variant="secondary" className="mt-4" onClick={playWithBot}>
                        <Bot className="w-5 h-5 mr-2"/>
                        Play vs. Robot
                    </Button>
                )}
                 <Button variant="ghost" className="mt-4 text-muted-foreground" onClick={cancelGame} disabled={cancelling}>
                    {cancelling ? <Loader2 className="w-4 h-4 mr-2 animate-spin"/> : <X className="w-4 h-4 mr-2"/>}
                    {cancelling ? 'Cancelling...' : 'Cancel Game'}
                </Button>
            </CardContent>
          </Card>

          {/* Wallet will prompt immediately on Cancel Game via cancelPvpOnchain */}
      </div>
    )
  }

  return (
    <div className="p-4">
      <div className="max-w-5xl mx-auto">
        {/* Game Creation Card */}
        <Card className="mb-8 bg-gradient-card border border-primary/20">
            <CardHeader>
                <CardTitle>Create New 1v1 Game</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-[1fr_1fr_auto] gap-4 md:gap-3 items-end">
                <div className="flex-1 pb-5">
                    <label className="block mb-1 text-sm font-medium">Entry Amount (SOL)</label>
                    <div className="relative">
                      <Input 
                        type="text"
                        inputMode="decimal"
                        placeholder="0"
                        value={amountInput}
                        onChange={e => {
                          const raw = e.target.value.replace(',', '.');
                          if (/^\d*(\.\d*)?$/.test(raw)) {
                            setAmountInput(raw);
                            if (raw === '' || raw === '.') {
                              setAmount(0);
                            } else {
                              const num = parseFloat(raw);
                              if (Number.isFinite(num)) setAmount(num);
                            }
                          }
                        }}
                        className="w-full h-11 bg-input border border-border rounded-lg px-3 text-foreground"
                        disabled={creating}
                      />
                      <div className="absolute -bottom-5 left-0 text-xs text-muted-foreground">≈ ${solUsd ? (amount * solUsd).toFixed(2) : '—'} USD</div>
                    </div>
                </div>
                <div className="flex-1 pb-5">
                    <label className="block mb-1 text-sm font-medium">Bombs</label>
                    <Select value={bombs} onValueChange={setBombs} disabled={creating}>
                        <SelectTrigger className="w-full h-11">
                            <SelectValue placeholder="Select bombs" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="1">1 Bomb</SelectItem>
                            <SelectItem value="3">3 Bombs</SelectItem>
                            <SelectItem value="5">5 Bombs</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
                <div className="flex pb-5">
                    <Button variant="neon" className="w-full md:w-auto h-11" onClick={handleCreateGame} disabled={creating}>
                        {creating ? <Loader2 className="w-4 h-4 animate-spin"/> : 'Create Lobby'}
                    </Button>
                </div>
            </CardContent>
        </Card>

        {/* Lobby List */}
        <div className="mb-4 flex items-center gap-4">
          <Badge variant="outline" className="bg-neon-cyan/10 border-neon-cyan text-neon-cyan">
            <Users className="w-4 h-4 mr-1" />
            {dedupedLobbies.length} Open Games
          </Badge>
          <span className="text-muted-foreground">Payouts are settled in SOL</span>
        </div>
        <div className="space-y-3 max-h-[50vh] overflow-y-auto pr-2">
          {dedupedLobbies.map((game) => {
            const hostWallet: string | undefined = (game as any).creatorWallet || undefined;
            const creatorName: string | undefined = (game as any).creatorName || undefined;
            const creatorAvatar: string | undefined = (game as any).creatorAvatar || undefined;
            const hostDisplay = creatorName || (hostWallet ? `${hostWallet.slice(0, 4)}...${hostWallet.slice(-4)}` : game.name);
            const hostAvatar = creatorAvatar || generateAvatarUrl(hostWallet || game.name);
            const joinerWallet: string | undefined = (game as any).joinerWallet || undefined;
            const isRobot = Boolean((game as any).vsRobotActive) || String((game as any).joinerName || '').toLowerCase() === 'robot';
            const joinerAvatar: string | null = isRobot
              ? null
              : (((game as any).joinerAvatar as string) || (joinerWallet ? generateAvatarUrl(joinerWallet) : null));
            const joinerName: string | undefined = isRobot
              ? 'Robot'
              : ((game as any).joinerName || (joinerWallet ? `${joinerWallet.slice(0,4)}...${joinerWallet.slice(-4)}` : undefined));
            // Host (creator) status: never show 'Robot' here; only reflect readiness
            const statusText = (joinerWallet || isRobot) ? 'Ready' : 'Waiting...';
            const hostLevel = (userProfile as any)?.level ?? 1;
            const joinerLevel = (game as any).joinerLevel ?? 1;
            const spectatorsCount: number = (game as any).spectatorsCount ?? ((Array.isArray((game as any).spectators) ? (game as any).spectators.length : 0));
            return (
              <div key={game.id} className="group flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-3 md:px-4 py-2 md:py-3 shadow-sm hover:bg-white/8 transition">
                {/* VS layout */}
                <div className="flex items-center gap-3 md:gap-4 flex-1">
                  {/* Player 1 */}
                  <div className="flex items-center gap-2 md:gap-3 min-w-0">
                    <div className="relative">
                      <img src={hostAvatar} alt={hostDisplay} className="w-10 h-10 md:w-12 md:h-12 rounded-full border border-white/20 bg-secondary" />
                      <span className="absolute -top-1 -left-1 text-[10px] md:text-[11px] font-semibold px-1.5 py-0.5 rounded-full bg-purple-600 text-white shadow ring-2 ring-background">{hostLevel}</span>
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="truncate max-w-[120px] md:max-w-[160px] font-semibold text-white">{hostDisplay}</span>
                      </div>
                      <div className="mt-0.5 inline-flex items-center gap-1 rounded-full bg-white/5 px-2 py-0.5 text-[11px] text-white/70 border border-white/10">
                        <span className={`w-1.5 h-1.5 rounded-full ${(joinerWallet || isRobot) ? 'bg-emerald-400' : 'bg-amber-400'} mr-1`}></span>
                        {statusText}
                      </div>
                    </div>
                  </div>

                  {/* VS */}
                  <div className="px-2 md:px-3">
                    <span className="inline-flex items-center justify-center text-xs md:text-sm font-semibold text-white/80 bg-white/10 border border-white/10 px-2 py-1 rounded-full">VS</span>
                  </div>

                  {/* Player 2 slot */}
                  <div className="flex items-center gap-2 md:gap-3 min-w-0">
                    <div className="relative">
                      {isRobot ? (
                        <div className="w-10 md:w-12 h-10 md:h-12 rounded-full border border-white/20 bg-white/5 flex items-center justify-center">
                          <Bot className="w-5 h-5 text-white/70" />
                        </div>
                      ) : joinerAvatar ? (
                        <img src={joinerAvatar} alt={joinerName || 'Joiner'} className="w-10 h-10 md:w-12 md:h-12 rounded-full border border-white/20 bg-secondary" />
                      ) : (
                        <div className="w-10 h-10 md:w-12 md:h-12 rounded-full border border-white/20 bg-white/5 flex items-center justify-center text-xs text-white/40">?
                        </div>
                      )}
                      <span className="absolute -top-1 -left-1 text-[10px] md:text-[11px] font-semibold px-1.5 py-0.5 rounded-full bg-slate-600 text-white shadow ring-2 ring-background">{isRobot ? '🤖' : (joinerAvatar ? joinerLevel : 1)}</span>
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="truncate max-w-[120px] md:max-w-[160px] font-semibold text-white/80">{joinerName || 'Waiting...'}</span>
                      </div>
                      <div className="mt-0.5 inline-flex items-center gap-1 rounded-full bg-white/5 px-2 py-0.5 text-[11px] text-white/60 border border-white/10">
                        {isRobot ? 'Robot' : (joinerWallet ? 'Joined' : 'Open slot')}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Right: amount chip + actions */}
                <div className="flex items-center gap-2 md:gap-3 pl-2">
                  {/* Bombs chip moved here */}
                  <div className="hidden sm:flex items-center gap-1.5 rounded-md border border-white/10 bg-black/30 px-2 py-1 text-xs text-white/80">
                    <span>💣</span>
                    <span className="font-medium">{game.bombCount}</span>
                  </div>
                  {/* Spectators chip */}
                  <div className="hidden sm:flex items-center gap-1.5 rounded-md border border-white/10 bg-black/30 px-2 py-1 text-xs text-white/80" title="Spectators">
                    <Eye className="w-3.5 h-3.5" />
                    <span className="font-medium">{spectatorsCount}</span>
                  </div>
                  <div className="flex items-center gap-1.5 rounded-md border border-white/10 bg-black/30 px-2 py-1 text-xs text-white/80">
                    <img src={solanaLogo} alt="SOL" className="w-3.5 h-3.5" />
                    <span className="font-semibold text-white">{game.betAmount.toFixed(3)} SOL</span>
                  </div>
                  <Button variant="neon" className="h-8 md:h-9 px-3" onClick={() => handleJoin(game)} disabled={!!joinerWallet || isRobot}>Join</Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleSpectate(game)} title="Spectate">
                    <Eye className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
} 