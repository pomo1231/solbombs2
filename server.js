import { WebSocketServer, WebSocket } from 'ws';
import http from 'http';
import url from 'url';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import path from 'path';
import nacl from 'tweetnacl';
import bs58 from 'bs58';
import { PublicKey } from '@solana/web3.js';

const PORT = process.env.PORT ? Number(process.env.PORT) : 8081;
// Create an HTTP server to serve simple APIs and allow CORS, and attach WS to it
const httpServer = http.createServer(async (req, res) => {
  // Basic CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.statusCode = 204; res.end(); return; }

  const parsed = url.parse(req.url || '', true);
  if (req.method === 'GET' && parsed.pathname === '/price') {
    const provider = (parsed.query.provider || '').toString();
    try {
      let target = '';
      if (provider === 'coingecko') {
        target = 'https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd';
      } else if (provider === 'jupiter') {
        target = 'https://price.jup.ag/v6/price?ids=SOL';
      } else if (provider === 'binance') {
        target = 'https://api.binance.com/api/v3/ticker/price?symbol=SOLUSDT';
      } else {
        res.statusCode = 400; res.end(JSON.stringify({ error: 'unknown provider' })); return;
      }
      const r = await fetch(target, { cache: 'no-store' });
      const text = await r.text();
      res.statusCode = r.status;
      res.setHeader('Content-Type', 'application/json');
      res.end(text);
    } catch (e) {
      res.statusCode = 502;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'upstream_failed' }));
    }
    return;
  }
  // default health
  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ ok: true }));
});

const wss = new WebSocketServer({ server: httpServer });

// In-memory data stores
let lobbies = [];
const clients = new Map();

// Simple file-backed storage for user stats
const DB_PATH = path.join(process.cwd(), 'stats-db.json');
/** @type {Record<string, { totalWagered: number, gameHistory: any[] }>} */
let userStats = {};

function loadDb() {
  try {
    if (fs.existsSync(DB_PATH)) {
      const data = fs.readFileSync(DB_PATH, 'utf-8');
      userStats = JSON.parse(data);
    }
  } catch (e) {
    console.error('Failed to load stats DB:', e);
    userStats = {};
  }
}

function saveDb() {
  try {
    fs.writeFileSync(DB_PATH, JSON.stringify(userStats, null, 2));
  } catch (e) {
    console.error('Failed to save stats DB:', e);
  }
}

loadDb();

function broadcast(message) {
  const data = JSON.stringify(message);
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  }
}

function broadcastOnlineCount() {
    broadcast({ type: 'onlineCount', count: wss.clients.size });
}

wss.on('connection', function connection(ws) {
    const clientId = uuidv4();
    clients.set(ws, clientId);
    
    console.log(`Client ${clientId} connected`);
    broadcastOnlineCount();

    ws.on('message', function incoming(rawMessage) {
        let message;
        try {
            message = JSON.parse(rawMessage);
        } catch (e) {
            console.error('Invalid JSON received:', rawMessage);
            return;
        }

        switch (message.type) {
            case 'createLobby':
                const newLobby = {
                    id: uuidv4(),
                    name: message.name,
                    players: 1,
                    maxPlayers: 2,
                    betAmount: message.betAmount,
                    bombCount: message.bombCount,
                    createdBy: clientId,
                };
                lobbies.push(newLobby);
                broadcast({ type: 'lobbies', lobbies });
                break;
            
            case 'getLobbies':
                ws.send(JSON.stringify({ type: 'lobbies', lobbies, reqId: message.reqId }));
                break;

            case 'getStats': {
                const { wallet } = message;
                if (typeof wallet !== 'string') break;
                const stats = userStats[wallet] || { totalWagered: 0, gameHistory: [] };
                ws.send(JSON.stringify({ type: 'stats', wallet, stats, reqId: message.reqId }));
                break;
            }

            case 'putStats': {
                const { wallet, payload } = message;
                try {
                    if (typeof wallet !== 'string') break;
                    // Basic payload validation
                    if (!payload || typeof payload.totalWagered !== 'number' || !Array.isArray(payload.gameHistory)) {
                        ws.send(JSON.stringify({ type: 'error', code: 'BAD_PAYLOAD', reqId: message.reqId }));
                        break;
                    }
                    // Accept and persist (optionally clamp history length)
                    userStats[wallet] = {
                        totalWagered: Math.max(0, Number(payload.totalWagered) || 0),
                        gameHistory: payload.gameHistory.slice(0, 1000),
                    };
                    saveDb();
                    ws.send(JSON.stringify({ type: 'ok', reqId: message.reqId }));
                } catch (e) {
                    console.error('putStats failed:', e);
                    ws.send(JSON.stringify({ type: 'error', code: 'SERVER', reqId: message.reqId }));
                }
                break;
            }

            case 'chatMessage':
                 // Broadcast to everyone else.
                wss.clients.forEach(function each(client) {
                    if (client !== ws && client.readyState === ws.OPEN) {
                        client.send(rawMessage);
                    }
                });
                break;

            default:
                console.log('Received unknown message type:', message.type);
        }
    });

    ws.on('close', () => {
        const clientId = clients.get(ws);
        console.log(`Client ${clientId} disconnected`);
        
        // Remove lobbies created by the disconnected client
        lobbies = lobbies.filter(lobby => lobby.createdBy !== clientId);
        
        clients.delete(ws);
        broadcastOnlineCount();
        broadcast({ type: 'lobbies', lobbies });
    });
});

wss.on('error', (err) => {
  if (/** @type {any} */(err).code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use. Set a different PORT env var to run the server on another port.`);
  } else {
    console.error('WebSocket server error:', err);
  }
});

httpServer.listen(PORT, () => {
  console.log(`HTTP server running on http://localhost:${PORT}`);
  console.log(`WebSocket server running on ws://localhost:${PORT}`);
});