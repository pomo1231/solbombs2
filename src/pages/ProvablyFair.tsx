import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Light as SyntaxHighlighter } from 'react-syntax-highlighter';
import { atomOneDark } from 'react-syntax-highlighter/dist/esm/styles/hljs';
import { Bomb, Gem } from 'lucide-react';
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
    
    const handleVerify = () => {
        const bombs = generateBombLocations(serverSeed, clientSeed, parseInt(nonce), parseInt(bombCount));
        setVerificationResult(bombs);
    };

  return (
    <div className="container mx-auto py-8 text-gray-300">
      <div className="text-center mb-12">
        <h1 className="text-4xl font-bold text-white tracking-wider">PROVABLY FAIR</h1>
        <p className="text-gray-400 mt-2">Verify your bets and learn how we use cryptography to ensure fairness.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-12">
        <div>
          <h2 className="text-2xl font-semibold text-white mb-4">Mines Details</h2>
          <div className="space-y-4 text-gray-400">
            <p>Our platform ensures fairness and transparency through a provably fair system. Here's how it works:</p>
            <p><strong className="text-white">1. Server Seed:</strong> A securely generated random value, created by our server before the game begins. The hash of this seed is shown to you beforehand, but the seed itself is only revealed after the game ends.</p>
            <p><strong className="text-white">2. Client Seed:</strong> A random value that you can change at any time from your profile settings. Your influence on the outcome is guaranteed because you control this seed.</p>
            <p><strong className="text-white">3. Nonce:</strong> A number that increases with every bet you make, ensuring that even with the same Server and Client seed, you get a unique and fair result for each game.</p>
            <p>These three values are combined and hashed to deterministically place the bombs on the grid. Players can replicate any past game by using the code provided, or verify it using the tool on this page.</p>
          </div>
        </div>
        <div className="bg-zinc-900 rounded-lg p-1">
             <SyntaxHighlighter language="javascript" style={atomOneDark} customStyle={{ background: 'transparent', border: 'none', fontSize: '0.8rem' }}>
                {verificationCode}
            </SyntaxHighlighter>
        </div>
      </div>

      <Card className="bg-zinc-900/50 border-zinc-800 mb-12">
        <CardHeader>
          <CardTitle className="text-white">Verify a Game</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-6 gap-4 items-end">
            <Input placeholder="Server Seed" value={serverSeed} onChange={e => setServerSeed(e.target.value)} className="bg-zinc-800 border-zinc-700 text-white md:col-span-2"/>
            <Input placeholder="Client Seed" value={clientSeed} onChange={e => setClientSeed(e.target.value)} className="bg-zinc-800 border-zinc-700 text-white md:col-span-2"/>
            <Input placeholder="Nonce" value={nonce} onChange={e => setNonce(e.target.value)} type="number" className="bg-zinc-800 border-zinc-700 text-white"/>
            <Input placeholder="Bombs" value={bombCount} onChange={e => setBombCount(e.target.value)} type="number" className="bg-zinc-800 border-zinc-700 text-white"/>
            <Button onClick={handleVerify} variant="neon" className="w-full md:col-span-6">Verify</Button>
          </div>
          {verificationResult && (
            <div className="mt-6">
                <h3 className="text-lg font-semibold text-white mb-4 text-center">Bomb Locations</h3>
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