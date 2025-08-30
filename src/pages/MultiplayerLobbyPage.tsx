import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Users, Eye, Loader2, Bot, X } from 'lucide-react';
import { toast } from '@/components/ui/use-toast';
import { useWallet } from '@solana/wallet-adapter-react';
import { startPvpOnchain, joinPvpOnchain, isOnchainConfigured } from '@/lib/sol/anchorClient';
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
}

interface MultiplayerLobbyPageProps {
  onStartGame: (settings: GameSettings) => void;
}

export function MultiplayerLobbyPage({ onStartGame }: MultiplayerLobbyPageProps) {
  const walletCtx = useWallet();
  const { publicKey, connected } = walletCtx;
  const { lobbies, sendMessage, setStartGameHandler, setStartSpectateHandler } = useSocket();
  const [bombs, setBombs] = useState('3');
  const [amount, setAmount] = useState(0.01);
  const [creating, setCreating] = useState(false);
  const { price: solUsd } = useSolPrice();
  const [amountInput, setAmountInput] = useState<string>(String(0.01));
  const { userProfile } = useStats();
  
  const [createdGame, setCreatedGame] = useState<any>(null);
  const [showBotOption, setShowBotOption] = useState(false);
  const [spectateLobbyId, setSpectateLobbyId] = useState<string | null>(null);

  const currentUser = {
    name: userProfile?.name || (publicKey ? `${publicKey.toBase58().slice(0, 4)}...` : 'Player'),
    avatar: userProfile?.avatarUrl || (publicKey ? generateAvatarUrl(publicKey.toBase58()) : generateAvatarUrl('default')),
    level: 1,
  };

  const handleSpectate = (game: any) => {
    setSpectateLobbyId(game.id);
    sendMessage({ type: 'spectateLobby', lobbyId: game.id });
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
    const handler = (data: { lobbyId: string; betAmount: number; bombCount: number; startsBy?: 'creator' | 'joiner'; yourRole?: 'creator' | 'joiner'; boardSeed?: string; pvpGamePda?: string; creatorWallet?: string; joinerWallet?: string }) => {
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
    const handler = (data: { type: 'startSpectate'; lobbyId: string; betAmount: number; bombCount: number; boardSeed?: string; moves?: Array<{tileId:number; by:'creator'|'joiner'}> }) => {
      if (!spectateLobbyId || data.lobbyId !== spectateLobbyId) return;
      // Start the game in spectate mode with server-provided boardSeed
      onStartGame({
        amount: data.betAmount,
        bombs: data.bombCount,
        opponent: 'player',
        lobbyId: data.lobbyId,
        boardSeed: data.boardSeed,
        // mark spectate so local clicks don't send moves
        // MultiplayerMinesGame will hydrate using setStartSpectateHandler it registers after mount
        // and process historical moves from data.moves
        spectate: true,
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
  
  const cancelGame = () => {
    // Note: We should ideally send a 'cancelLobby' message to the server here.
    setCreatedGame(null);
    setShowBotOption(false);
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
      onStartGame({ 
        amount: createdGame.amount, 
        bombs: createdGame.bombs, 
        opponent: 'bot',
        pvpGamePda: createdGame.pvpGamePda,
        creator: publicKey.toBase58(),
        joiner: null,
        vsRobot: true,
      });
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
                 <Button variant="ghost" className="mt-4 text-muted-foreground" onClick={cancelGame}>
                    <X className="w-4 h-4 mr-2"/>
                    Cancel Game
                </Button>
            </CardContent>
          </Card>
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
            {lobbies.length} Open Games
          </Badge>
          <span className="text-muted-foreground">Payouts are settled in SOL</span>
        </div>
        <div className="space-y-4 max-h-[50vh] overflow-y-auto pr-2">
          {lobbies.map((game) => {
            const hostWallet: string | undefined = (game as any).creatorWallet || undefined;
            const creatorName: string | undefined = (game as any).creatorName || undefined;
            const creatorAvatar: string | undefined = (game as any).creatorAvatar || undefined;
            const hostDisplay = creatorName || (hostWallet ? `${hostWallet.slice(0, 4)}...${hostWallet.slice(-4)}` : game.name);
            const hostAvatar = creatorAvatar || generateAvatarUrl(hostWallet || game.name);
            const joinerWallet: string | undefined = (game as any).joinerWallet || undefined;
            const joinerAvatar: string | null = ((game as any).joinerAvatar as string) || (joinerWallet ? generateAvatarUrl(joinerWallet) : null);
            const statusText = joinerWallet ? 'Ready' : 'Waiting...';
            return (
              <Card key={game.id} className="flex items-center justify-between bg-gradient-card border border-primary/20 rounded-xl p-4 shadow-md">
                <div className="flex items-center gap-4">
                  <div className="relative">
                    <img src={hostAvatar} alt={hostDisplay} className="w-12 h-12 rounded-full border-2 border-primary/30 bg-secondary" />
                    {joinerAvatar && (
                      <img src={joinerAvatar} alt="Joiner" className="w-6 h-6 rounded-full border-2 border-primary/30 bg-secondary absolute -bottom-1 -right-1" />
                    )}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-lg text-white">{hostDisplay}</span>
                    </div>
                    <div className="text-xs text-muted-foreground">Bombs: {game.bombCount}</div>
                  </div>
                </div>
                <div className="flex items-center gap-6">
                  <div className="text-right">
                    <div className="font-bold text-neon-cyan text-lg">{game.betAmount.toFixed(3)} SOL</div>
                    <div className="text-xs text-muted-foreground">≈ ${solUsd ? (game.betAmount * solUsd).toFixed(2) : '—'} USD</div>
                    <div className="text-xs text-muted-foreground">{statusText}</div>
                  </div>
                  <Button variant="neon" onClick={() => handleJoin(game)} disabled={!!joinerWallet}>Join</Button>
                  <Button variant="ghost" size="icon" onClick={() => handleSpectate(game)} title="Spectate">
                    <Eye className="w-5 h-5" />
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
} 