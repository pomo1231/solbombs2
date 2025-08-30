import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Light as SyntaxHighlighter } from 'react-syntax-highlighter';
import { atomOneDark } from 'react-syntax-highlighter/dist/esm/styles/hljs';
import { Bomb, Gem, Check, Copy, Info, ShieldCheck, Sparkles, Terminal } from 'lucide-react';
import { useStats } from '@/context/StatsContext';
import crypto from 'crypto-js';

const generateBombLocations = (serverSeed: string, clientSeed: string, nonce: number, bombCount: number): number[] => {
    if (!serverSeed || !clientSeed || isNaN(nonce) || isNaN(bombCount)) return [];
    
    const combinedSeed = `${serverSeed}-${clientSeed}-${nonce}`;
    const hash = crypto.SHA256(combinedSeed).toString(crypto.enc.Hex);

    const tiles = Array.from({ length: 25 }, (_, i) => i);
    let currentHash = hash;

    // Fisher-Yates shuffle algorithm
    for (let i = tiles.length - 1; i > 0; i--) {
        // Use segments of the hash for indices
        const hashSegment = currentHash.substring((i % 8) * 8, ((i % 8) * 8) + 8);
        const randInt = parseInt(hashSegment, 16);
        const j = randInt % (i + 1);
        
        [tiles[i], tiles[j]] = [tiles[j], tiles[i]];
        
        // Re-hash to get new values for next iteration
        currentHash = crypto.SHA256(currentHash).toString(crypto.enc.Hex);
    }

    return tiles.slice(0, bombCount);
};

const verificationCode = `
const crypto = require('crypto');

function generateBombLocations(serverSeed, clientSeed, nonce, bombCount) {
  const combinedSeed = \`\${serverSeed}-\${clientSeed}-\${nonce}\`;
  const hash = crypto.createHash('sha256').update(combinedSeed).digest('hex');

  const tiles = Array.from({ length: 25 }, (_, i) => i);
  let currentHash = hash;

  // Fisher-Yates shuffle
  for (let i = tiles.length - 1; i > 0; i--) {
    const hashSegment = currentHash.substring((i % 8) * 8, ((i % 8) * 8) + 8);
    const randInt = parseInt(hashSegment, 16);
    const j = randInt % (i + 1);
    
    [tiles[i], tiles[j]] = [tiles[j], tiles[i]];
    
    currentHash = crypto.createHash('sha256').update(currentHash).digest('hex');
  }

  return tiles.slice(0, bombCount);
}

// Example:
const serverSeed = 'SERVER_SEED_FROM_GAME';
const clientSeed = 'CLIENT_SEED_FROM_GAME';
const nonce = 123; // Nonce from the specific game
const bombCount = 5; // Bomb count from the specific game

const bombLocations = generateBombLocations(serverSeed, clientSeed, nonce, bombCount);
console.log('Bomb locations (tile indices):', bombLocations);
`;


const ProvablyFairPage = () => {
    const { userProfile, gameHistory } = useStats();
    const [serverSeed, setServerSeed] = useState('');
    const [clientSeed, setClientSeed] = useState(userProfile?.clientSeed || '');
    const [nonce, setNonce] = useState('1');
    const [bombCount, setBombCount] = useState('3');

    const [verificationResult, setVerificationResult] = useState<number[] | null>(null);
    const [copied, setCopied] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const serverSeedHash = useMemo(() => {
        if (!serverSeed) return '';
        try {
            return crypto.SHA256(serverSeed).toString(crypto.enc.Hex);
        } catch {
            return '';
        }
    }, [serverSeed]);

    const handleCopy = async (text: string, key: string) => {
        try {
            await navigator.clipboard.writeText(text);
            setCopied(key);
            setTimeout(() => setCopied(null), 1400);
        } catch {
            // ignore
        }
    };

    const handleVerify = () => {
        setError(null);
        setVerificationResult(null);

        const n = parseInt(nonce);
        const b = parseInt(bombCount);
        if (!serverSeed || !clientSeed || isNaN(n) || isNaN(b)) {
            setError('Please fill all fields with valid values.');
            return;
        }
        if (b < 1 || b > 24) {
            setError('Bombs must be between 1 and 24.');
            return;
        }
        if (n < 0) {
            setError('Nonce must be zero or a positive integer.');
            return;
        }

        const bombs = generateBombLocations(serverSeed, clientSeed, n, b);
        setVerificationResult(bombs);
    };

  return (
    <div className="container mx-auto py-8 text-gray-300">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-zinc-900 to-zinc-800 border border-zinc-800 mb-10">
        <div className="absolute inset-0 pointer-events-none [mask-image:radial-gradient(200px_200px_at_10%_10%,rgba(255,255,255,0.25),transparent)]">
          <div className="absolute -top-16 -left-16 w-64 h-64 rounded-full bg-purple-500/10 blur-3xl" />
          <div className="absolute -bottom-20 -right-20 w-72 h-72 rounded-full bg-cyan-400/10 blur-3xl" />
        </div>
        <div className="px-6 py-8 md:px-10 md:py-12 flex flex-col items-center text-center gap-3">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/70">
            <Sparkles className="w-3.5 h-3.5" /> Updated 2025
          </span>
          <h1 className="text-3xl md:text-4xl font-semibold text-white tracking-wide">Provably Fair Verification</h1>
          <p className="text-sm md:text-base text-gray-400 max-w-2xl">Deterministic outcomes powered by SHA-256. Verify any Mines round by combining the Server Seed, your Client Seed, and the round Nonce.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-12">
        {/* How it works */}
        <div>
          <h2 className="text-2xl font-semibold text-white mb-4">How It Works</h2>
          <div className="space-y-4 text-gray-400">
            <p>We combine three values and hash them using SHA-256 to generate a deterministic shuffle of the 5×5 grid:</p>
            <p><strong className="text-white">1. Server Seed:</strong> Generated before the round. We show you its SHA-256 hash up-front; the plain seed is revealed after the round.</p>
            <p><strong className="text-white">2. Client Seed:</strong> Settable in your profile. Lets you influence the outcome while keeping it fair.</p>
            <p><strong className="text-white">3. Nonce:</strong> Increments each bet, ensuring a unique result even with the same seeds.</p>
            <p>The resulting sequence deterministically selects bomb tiles. You can reproduce any round with the data from history below.</p>
          </div>
          <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="flex items-center gap-2 rounded-md border border-zinc-800 bg-zinc-900/50 px-3 py-2 text-sm">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span>Deterministic</span>
            </div>
            <div className="flex items-center gap-2 rounded-md border border-zinc-800 bg-zinc-900/50 px-3 py-2 text-sm">
              <Terminal className="w-4 h-4 text-cyan-400" />
              <span>Open Source Code</span>
            </div>
            <div className="flex items-center gap-2 rounded-md border border-zinc-800 bg-zinc-900/50 px-3 py-2 text-sm">
              <Info className="w-4 h-4 text-purple-400" />
              <span>Transparent Rounds</span>
            </div>
          </div>
        </div>
        {/* Code sample */}
        <div className="bg-zinc-900 rounded-lg border border-zinc-800 overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-800">
            <span className="text-xs text-white/70">Node.js verifier</span>
            <Button variant="ghost" size="sm" className="text-xs" onClick={() => handleCopy(verificationCode, 'code')}>
              {copied === 'code' ? <><Check className="w-3.5 h-3.5 mr-1" /> Copied</> : <><Copy className="w-3.5 h-3.5 mr-1" /> Copy</>}
            </Button>
          </div>
          <div className="p-1">
            <SyntaxHighlighter language="javascript" style={atomOneDark} customStyle={{ background: 'transparent', border: 'none', fontSize: '0.8rem', margin: 0 }}>
              {verificationCode}
            </SyntaxHighlighter>
          </div>
        </div>
      </div>

      <Card className="bg-zinc-900/50 border-zinc-800 mb-12">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">Verify a Game <span className="text-xs font-normal text-white/60">Mines 5×5</span></CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-6 gap-4 items-end">
            <div className="md:col-span-2 space-y-2">
              <Input placeholder="Server Seed (plain)" value={serverSeed} onChange={e => setServerSeed(e.target.value)} className="bg-zinc-800 border-zinc-700 text-white"/>
              <div className="flex items-center justify-between rounded-md bg-zinc-900/60 border border-zinc-800 px-3 py-2">
                <span className="text-xs text-white/60 truncate" title={serverSeedHash || 'SHA-256 preview will appear here'}>
                  {serverSeedHash ? serverSeedHash : 'SHA-256(serverSeed) preview'}
                </span>
                <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => serverSeedHash && handleCopy(serverSeedHash, 'hash')}>
                  {copied === 'hash' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                </Button>
              </div>
            </div>
            <Input placeholder="Client Seed" value={clientSeed} onChange={e => setClientSeed(e.target.value)} className="bg-zinc-800 border-zinc-700 text-white md:col-span-2"/>
            <Input placeholder="Nonce" value={nonce} onChange={e => setNonce(e.target.value)} type="number" className="bg-zinc-800 border-zinc-700 text-white"/>
            <Input placeholder="Bombs" value={bombCount} onChange={e => setBombCount(e.target.value)} type="number" className="bg-zinc-800 border-zinc-700 text-white"/>
            <Button onClick={handleVerify} variant="neon" className="w-full md:col-span-6">Verify</Button>
          </div>
          {error && (
            <div className="mt-4 text-sm text-red-400">{error}</div>
          )}
          {verificationResult && (
            <div className="mt-6">
                <h3 className="text-lg font-semibold text-white mb-3 text-center">Bomb Locations</h3>
                <div className="flex items-center justify-center gap-3 text-xs text-white/70 mb-3">
                  <div className="inline-flex items-center gap-2"><span className="w-3 h-3 rounded-sm bg-red-500/80 inline-block"/> Bomb</div>
                  <div className="inline-flex items-center gap-2"><span className="w-3 h-3 rounded-sm bg-green-500/80 inline-block"/> Safe</div>
                  <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => handleCopy(JSON.stringify(verificationResult), 'result')}>
                    {copied === 'result' ? <><Check className="w-3.5 h-3.5 mr-1"/>Copied</> : <><Copy className="w-3.5 h-3.5 mr-1"/>Copy result</>}
                  </Button>
                </div>
                <div className="grid grid-cols-5 gap-2 max-w-sm mx-auto bg-zinc-800 p-2 rounded-lg">
                    {Array.from({ length: 25 }).map((_, i) => (
                        <div key={i} className={`aspect-square rounded-lg flex items-center justify-center transition-colors ${verificationResult.includes(i) ? 'bg-red-500/80' : 'bg-green-500/80'}`}>
                            {verificationResult.includes(i) ? <Bomb className="w-6 h-6 text-white"/> : <Gem className="w-6 h-6 text-white"/>}
                        </div>
                    ))}
                </div>
            </div>
          )}
        </CardContent>
      </Card>
      
      <Card className="bg-zinc-900/50 border-zinc-800">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">What's New <span className="text-xs font-normal text-white/60">System updates</span></CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-4">
              <div className="flex items-center gap-2 text-white mb-1"><Sparkles className="w-4 h-4 text-purple-400"/> Visual polish</div>
              <p className="text-sm text-white/70">Refined layout, improved contrast, and a clearer verification flow.</p>
            </div>
            <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-4">
              <div className="flex items-center gap-2 text-white mb-1"><ShieldCheck className="w-4 h-4 text-emerald-400"/> Hash preview</div>
              <p className="text-sm text-white/70">Live SHA-256 preview of the server seed to match pre-round hashes.</p>
            </div>
            <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-4">
              <div className="flex items-center gap-2 text-white mb-1"><Terminal className="w-4 h-4 text-cyan-400"/> Copy tools</div>
              <p className="text-sm text-white/70">One-click copy for code samples and verification results.</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-zinc-900/50 border-zinc-800 mt-8">
        <CardHeader>
          <CardTitle className="text-white">Recent Game History</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-zinc-800 hover:bg-zinc-800/50">
                  <TableHead className="text-white">Game ID</TableHead>
                  <TableHead className="text-white">Wager (SOL)</TableHead>
                  <TableHead className="text-white">Server Seed</TableHead>
                  <TableHead className="text-white">Client Seed</TableHead>
                  <TableHead className="text-white">Nonce</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {gameHistory.slice(0, 10).map(game => (
                  <TableRow key={game.id} className="border-zinc-800 hover:bg-zinc-800/50">
                    <TableCell className="text-purple-400 font-medium">#{game.id.slice(-6)}</TableCell>
                    <TableCell>{game.wageredAmount.toFixed(4)}</TableCell>
                    <TableCell className="font-mono text-xs">{game.serverSeed}</TableCell>
                    <TableCell className="font-mono text-xs">{game.clientSeed}</TableCell>
                    <TableCell>{game.nonce}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default ProvablyFairPage; 