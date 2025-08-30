import { WebSocketServer, WebSocket } from 'ws';
import http from 'http';
import url from 'url';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import path from 'path';
import nacl from 'tweetnacl';
import bs58 from 'bs58';
import { PublicKey } from '@solana/web3.js';
import { randomUUID, createHash } from 'crypto';

const PORT = process.env.PORT ? Number(process.env.PORT) : 8081;
// Chat history constants (persisted in stats-db.json)
const CHAT_HISTORY_LIMIT = 500;
/** @type {Array<{id?:string, from:string, name?:string, text:string, level?:number, avatarUrl?:string, timestamp:number, replyToId?:string, replyToName?:string, replySnippet?:string}>} */
let chatHistory = [];

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
  if (req.method === 'GET' && parsed.pathname === '/getRecentMessages') {
    const afterId = parsed.query.afterId;
    const recentMessages = chatHistory.slice();
    if (afterId) {
      const afterIndex = recentMessages.findIndex(m => m.id === afterId);
      if (afterIndex !== -1) {
        recentMessages.splice(0, afterIndex + 1);
      }
    }
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(recentMessages));
    return;
  }
  // default health
  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ ok: true }));
});

// Create WS server attached to HTTP server
const wss = new WebSocketServer({ server: httpServer });

// In-memory data stores
let lobbies = [];
const clients = new Map(); // ws -> clientId
const sessionToWs = new Map(); // sessionId -> ws

// Simple file-backed storage for user stats and profiles
const DB_PATH = path.join(process.cwd(), 'stats-db.json');
/** @type {Record<string, { totalWagered: number, gameHistory: any[] }>} */
let userStats = {};
/** @type {Record<string, { name?: string; email?: string; avatarUrl?: string; clientSeed?: string }>} */
let userProfiles = {};

function loadDb() {
  try {
    if (fs.existsSync(DB_PATH)) {
      const text = fs.readFileSync(DB_PATH, 'utf-8');
      const data = JSON.parse(text || '{}');
      if (data && (data.userStats || data.userProfiles || data.chatHistory)) {
        userStats = data.userStats || {};
        userProfiles = data.userProfiles || {};
        chatHistory = Array.isArray(data.chatHistory) ? data.chatHistory.slice(-CHAT_HISTORY_LIMIT) : [];
      } else if (data && typeof data === 'object') {
        // Backward compatibility: old format stored stats map at root
        userStats = data;
        userProfiles = {};
        chatHistory = [];
      }
    }
  } catch (e) {
    console.error('Failed to load stats DB:', e);
    userStats = {};
    userProfiles = {};
  }
}

function saveDb() {
  try {
    const payload = { userStats, userProfiles, chatHistory: chatHistory.slice(-CHAT_HISTORY_LIMIT) };
    fs.writeFileSync(DB_PATH, JSON.stringify(payload, null, 2));
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
    let count = 0;
    sessionToWs.forEach((ws) => {
        if (ws && ws.readyState === WebSocket.OPEN) {
            count++;
        }
    });
    broadcast({ type: 'onlineCount', count });
}

wss.on('connection', function connection(ws) {
    // Heartbeat tracking
    // @ts-ignore
    ws.isAlive = true;
    ws.on('pong', () => { /* @ts-ignore */ ws.isAlive = true; });
    const clientId = uuidv4();
    clients.set(ws, clientId);
    
    console.log(`Client ${clientId} connected`);
    broadcastOnlineCount();

  ws.on('message', function incoming(rawMessage) {
    let message;
    try {
      message = JSON.parse(rawMessage);
    } catch (e) {
      console.error('Invalid JSON from client', e);
      return;
    }

    switch (message.type) {
      case 'hello': {
        const sid = String(message.sessionId || '');
        if (!sid) break;
        // @ts-ignore
        ws.sessionId = sid;
        const existing = sessionToWs.get(sid);
        if (existing && existing !== ws) {
          try { existing.terminate(); } catch {}
        }
        sessionToWs.set(sid, ws);
        broadcastOnlineCount();
        break;
      }

      case 'pfClientSeed': {
        const { lobbyId, seed, role } = message;
        const lobby = lobbies.find(l => l.id === lobbyId);
        if (!lobby || lobby.status !== 'started' || !lobby.pf) break;
        const senderId = clients.get(ws);
        // Validate role against sender identity to avoid spoofing
        const claimedRole = role === 'creator' ? 'creator' : 'joiner';
        const actualRole = (senderId === lobby.createdBy) ? 'creator' : (senderId === lobby.joinedBy ? 'joiner' : null);
        if (!actualRole || actualRole !== claimedRole) break;
        if (claimedRole === 'creator') lobby.pf.creatorSeed = String(seed || '');
        else lobby.pf.joinerSeed = String(seed || '');

        // If both seeds present and final not computed, compute and notify
        if (lobby.pf.creatorSeed && lobby.pf.joinerSeed && !lobby.pf.finalSeed) {
          const finalSeed = createHash('sha256')
            .update(`${lobby.pf.serverSecret}|${lobby.pf.creatorSeed}|${lobby.pf.joinerSeed}|${lobby.id}|${lobby.gameNonce ?? ''}`)
            .digest('hex');
          lobby.pf.finalSeed = finalSeed;
          lobby.boardSeed = finalSeed;
          // Notify both participants with full context so clients can start using the seed deterministically
          for (const client of wss.clients) {
            const cid = clients.get(client);
            const isParticipant = (cid === lobby.createdBy || cid === lobby.joinedBy);
            const isSpectator = Array.isArray(lobby.spectators) && lobby.spectators.includes(cid);
            if ((isParticipant || isSpectator) && client.readyState === WebSocket.OPEN) {
              const yourRole = cid === lobby.createdBy ? 'creator' : 'joiner';
              client.send(JSON.stringify({
                type: 'pfFinalSeed',
                lobbyId: lobby.id,
                betAmount: lobby.betAmount,
                bombCount: lobby.bombCount,
                startsBy: (/** @type {any} */(lobby)).startsBy || undefined,
                yourRole: isParticipant ? yourRole : undefined,
                boardSeed: finalSeed,
                pvpGamePda: lobby.pvpGamePda,
                creatorWallet: lobby.creatorWallet,
                joinerWallet: lobby.joinerWallet,
              }));
            }
          }
        }
        break;
      }
      case 'createLobby': {
        const newLobby = {
          id: uuidv4(),
          name: message.name,
          players: 1,
          maxPlayers: 2,
          betAmount: message.betAmount,
          bombCount: message.bombCount,
          createdBy: clientId,
          joinedBy: null,
          status: 'open', // open -> started -> finished
          spectators: [], // array of clientIds
          moveHistory: [], // { tileId, by: 'creator' | 'joiner' }
          boardSeed: null,
          // on-chain context
          pvpGamePda: message.pvpGamePda || null,
          gameNonce: message.gameNonce || null,
          creatorWallet: message.creatorWallet || null,
          joinerWallet: null,
          // profile context
          creatorName: typeof message.creatorName === 'string' ? message.creatorName : null,
          creatorAvatar: typeof message.creatorAvatar === 'string' ? message.creatorAvatar : null,
          joinerName: null,
          joinerAvatar: null,
        };
        lobbies.push(newLobby);
        broadcast({ type: 'lobbies', lobbies: lobbies.filter(l => l.status !== 'finished') });
        break;
      }

      case 'joinLobby': {
        const lobbyId = message.lobbyId;
        const lobby = lobbies.find(l => l.id === lobbyId);
        if (!lobby) {
          ws.send(JSON.stringify({ type: 'error', code: 'LOBBY_NOT_FOUND', reqId: message.reqId }));
          break;
        }
        if (lobby.status !== 'open' || lobby.players >= lobby.maxPlayers) {
          ws.send(JSON.stringify({ type: 'error', code: 'LOBBY_FULL', reqId: message.reqId }));
          break;
        }
        if (lobby.createdBy === clientId) {
          ws.send(JSON.stringify({ type: 'error', code: 'OWN_LOBBY', reqId: message.reqId }));
          break;
        }
        lobby.players = 2;
        lobby.joinedBy = clientId;
        // capture optional joiner wallet (front-end should include after on-chain join success)
        if (typeof message.joinerWallet === 'string') lobby.joinerWallet = message.joinerWallet;
        // capture optional joiner profile
        if (typeof message.joinerName === 'string') lobby.joinerName = message.joinerName;
        if (typeof message.joinerAvatar === 'string') lobby.joinerAvatar = message.joinerAvatar;
        lobby.status = 'started';
        broadcast({ type: 'lobbies', lobbies: lobbies.filter(l => l.status !== 'finished') });
        // Decide who starts and notify both sides with their role
        const startsBy = Math.random() < 0.5 ? 'creator' : 'joiner';
        lobby.startsBy = startsBy;
        // Initialize provably fair context (commit stage)
        const serverSecret = randomUUID();
        const commitHash = createHash('sha256').update(serverSecret).digest('hex');
        lobby.pf = {
          serverSecret,
          commitHash,
          creatorSeed: null,
          joinerSeed: null,
          finalSeed: null,
        };
        for (const client of wss.clients) {
          const cid = clients.get(client);
          if ((cid === lobby.createdBy || cid === lobby.joinedBy) && client.readyState === WebSocket.OPEN) {
            const yourRole = cid === lobby.createdBy ? 'creator' : 'joiner';
            const payload = {
              type: 'startGame',
              lobbyId: lobby.id,
              betAmount: lobby.betAmount,
              bombCount: lobby.bombCount,
              startsBy, // 'creator' | 'joiner'
              yourRole, // per-recipient
              // Do NOT send boardSeed yet; wait for pfClientSeed from both sides
              pfCommit: commitHash,
              // propagate on-chain context so clients can resolve payouts
              pvpGamePda: lobby.pvpGamePda,
              creatorWallet: lobby.creatorWallet,
              joinerWallet: lobby.joinerWallet,
            };
            client.send(JSON.stringify(payload));
          }
        }
        break;
      }

      case 'pvpMove': {
        const { lobbyId, tileId } = message;
        const lobby = lobbies.find(l => l.id === lobbyId);
        if (!lobby || lobby.status !== 'started') break;
        // Determine side and record
        const senderId = clients.get(ws);
        const by = (senderId === lobby.createdBy) ? 'creator' : 'joiner';
        lobby.moveHistory = lobby.moveHistory || [];
        lobby.moveHistory.push({ tileId, by });
        // Forward to the other participant
        const targetClientId = (senderId === lobby.createdBy) ? lobby.joinedBy : lobby.createdBy;
        if (targetClientId) {
          for (const client of wss.clients) {
            if (clients.get(client) === targetClientId && client.readyState === WebSocket.OPEN) {
              client.send(JSON.stringify({ type: 'pvpMove', lobbyId, tileId, by }));
            }
          }
        }
        // Also forward to spectators
        if (Array.isArray(lobby.spectators) && lobby.spectators.length) {
          for (const client of wss.clients) {
            const cid = clients.get(client);
            if (lobby.spectators.includes(cid) && client.readyState === WebSocket.OPEN) {
              client.send(JSON.stringify({ type: 'pvpMove', lobbyId, tileId, by }));
            }
          }
        }
        break;
      }

      case 'spectateLobby': {
        const { lobbyId } = message;
        const lobby = lobbies.find(l => l.id === lobbyId);
        if (!lobby || lobby.status !== 'started') break;
        const cid = clients.get(ws);
        lobby.spectators = lobby.spectators || [];
        if (!lobby.spectators.includes(cid)) lobby.spectators.push(cid);
        const payload = {
          type: 'startSpectate',
          lobbyId: lobby.id,
          betAmount: lobby.betAmount,
          bombCount: lobby.bombCount,
          boardSeed: lobby.boardSeed || (lobby.pf && lobby.pf.finalSeed) || undefined,
          moves: Array.isArray(lobby.moveHistory) ? lobby.moveHistory : [],
        };
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(payload));
        break;
      }

      case 'gameOver': {
        const { lobbyId, winner } = message; // winner: 'creator' | 'joiner'
        const lobby = lobbies.find(l => l.id === lobbyId);
        if (!lobby) break;
        lobby.status = 'finished';
        lobby.spectators = [];
        // winner bookkeeping
        if (winner === 'creator' || winner === 'joiner') {
          lobby.winner = winner;
          lobby.winnerClientId = winner === 'creator' ? lobby.createdBy : lobby.joinedBy;
        } else {
          lobby.winner = undefined;
          lobby.winnerClientId = undefined;
        }
        lobby.winningsClaimed = false;
        broadcast({ type: 'lobbies', lobbies: lobbies.filter(l => l.status !== 'finished') });
        const notify = { 
          type: 'gameOver', 
          lobbyId,
          winner: lobby.winner,
          pfReveal: lobby.pf ? { commitHash: lobby.pf.commitHash, serverSecret: lobby.pf.serverSecret } : undefined,
        };
        for (const client of wss.clients) {
          if (client.readyState === WebSocket.OPEN) client.send(JSON.stringify(notify));
        }
        break;
      }

      case 'claimWinnings': {
        const { lobbyId } = message;
        const lobby = lobbies.find(l => l.id === lobbyId);
        if (!lobby || lobby.status !== 'finished') {
          ws.send(JSON.stringify({ type: 'error', code: 'LOBBY_NOT_FINISHED', reqId: message.reqId }));
          break;
        }
        const senderId = clients.get(ws);
        if (!lobby.winnerClientId || lobby.winnerClientId !== senderId) {
          ws.send(JSON.stringify({ type: 'error', code: 'NOT_WINNER', reqId: message.reqId }));
          break;
        }
        if (lobby.winningsClaimed) {
          ws.send(JSON.stringify({ type: 'ok', message: 'ALREADY_CLAIMED', reqId: message.reqId }));
          break;
        }
        lobby.winningsClaimed = true;
        // In a real integration, trigger on-chain payout here or verify it was done.
        broadcast({ type: 'winningsClaimed', lobbyId });
        ws.send(JSON.stringify({ type: 'ok', reqId: message.reqId }));
        break;
      }
      
      case 'getLobbies':
        ws.send(JSON.stringify({ type: 'lobbies', lobbies: lobbies.filter(l => l.status !== 'finished'), reqId: message.reqId }));
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

      case 'getProfile': {
        const { wallet } = message;
        if (typeof wallet !== 'string') break;
        const profile = userProfiles[wallet] || null;
        ws.send(JSON.stringify({ type: 'profile', wallet, profile, reqId: message.reqId }));
        break;
      }

      case 'putProfile': {
        const { wallet, profile } = message;
        try {
          if (typeof wallet !== 'string' || typeof profile !== 'object' || profile === null) break;
          const sanitized = {
            name: typeof profile.name === 'string' ? profile.name : undefined,
            email: typeof profile.email === 'string' ? profile.email : undefined,
            avatarUrl: typeof profile.avatarUrl === 'string' ? profile.avatarUrl : undefined,
            clientSeed: typeof profile.clientSeed === 'string' ? profile.clientSeed : undefined,
          };
          userProfiles[wallet] = { ...(userProfiles[wallet] || {}), ...sanitized };
          saveDb();
          ws.send(JSON.stringify({ type: 'ok', reqId: message.reqId }));
        } catch (e) {
          console.error('putProfile failed:', e);
          ws.send(JSON.stringify({ type: 'error', code: 'SERVER', reqId: message.reqId }));
        }
        break;
      }

      case 'chatMessage': {
        // Basic shape validation and logging for diagnostics
        const { from, name, text, level, avatarUrl, id, replyToId, replyToName, replySnippet } = message;
        if (typeof from !== 'string' || typeof text !== 'string') {
          console.warn('chatMessage dropped: bad payload', message);
          break;
        }
        const ts = Date.now();
        console.log(`chatMessage <- from=${from} name=${name || ''} text="${text}"`);

        // Store to history
        chatHistory.push({ id, from, name, text, level, avatarUrl, timestamp: ts, replyToId, replyToName, replySnippet });
        if (chatHistory.length > CHAT_HISTORY_LIMIT) chatHistory.splice(0, chatHistory.length - CHAT_HISTORY_LIMIT);
        // persist to disk
        try { saveDb(); } catch {}

        // Broadcast to everyone else (not echoing sender)
        wss.clients.forEach(function each(client) {
          if (client !== ws && client.readyState === ws.OPEN) {
            client.send(JSON.stringify({
              type: 'chatMessage',
              from,
              name,
              text,
              level,
              avatarUrl,
              id,
              replyToId,
              replyToName,
              replySnippet,
              timestamp: ts,
            }));
          }
        });
        break;
      }

      case 'getRecentMessages': {
        // Optional params: limit (<= CHAT_HISTORY_LIMIT), afterId (exclusive)
        try {
          const { limit, afterId, reqId } = message;
          let items = chatHistory;
          if (afterId) {
            const idx = chatHistory.findIndex(m => m.id === afterId);
            if (idx >= 0) items = chatHistory.slice(idx + 1);
          }
          const lim = Math.max(1, Math.min(Number(limit) || 100, CHAT_HISTORY_LIMIT));
          const slice = items.slice(-lim);
          ws.send(JSON.stringify({ type: 'recentMessages', messages: slice, reqId }));
        } catch (e) {
          console.error('getRecentMessages failed', e);
          try { ws.send(JSON.stringify({ type: 'recentMessages', messages: [], reqId: message.reqId })); } catch {}
        }
        break;
      }

            case 'pvpMove': {
                const { lobbyId, tileId } = message;
                const lobby = lobbies.find(l => l.id === lobbyId);
                if (!lobby || lobby.status !== 'started') break;
                // Determine side and record
                const senderId = clients.get(ws);
                const by = (senderId === lobby.createdBy) ? 'creator' : 'joiner';
                lobby.moveHistory = lobby.moveHistory || [];
                lobby.moveHistory.push({ tileId, by });
                // Forward to the other participant
                const targetClientId = (senderId === lobby.createdBy) ? lobby.joinedBy : lobby.createdBy;
                if (targetClientId) {
                    for (const client of wss.clients) {
                        if (clients.get(client) === targetClientId && client.readyState === WebSocket.OPEN) {
                            client.send(JSON.stringify({ type: 'pvpMove', lobbyId, tileId, by }));
                        }
                    }
                }
                // Also forward to spectators
                if (Array.isArray(lobby.spectators) && lobby.spectators.length) {
                  for (const client of wss.clients) {
                    const cid = clients.get(client);
                    if (lobby.spectators.includes(cid) && client.readyState === WebSocket.OPEN) {
                      client.send(JSON.stringify({ type: 'pvpMove', lobbyId, tileId, by }));
                    }
                  }
                }
                break;
            }

            case 'spectateLobby': {
                const { lobbyId } = message;
                const lobby = lobbies.find(l => l.id === lobbyId);
                if (!lobby || lobby.status !== 'started') break;
                const cid = clients.get(ws);
                lobby.spectators = lobby.spectators || [];
                if (!lobby.spectators.includes(cid)) lobby.spectators.push(cid);
                const payload = {
                  type: 'startSpectate',
                  lobbyId: lobby.id,
                  betAmount: lobby.betAmount,
                  bombCount: lobby.bombCount,
                  moves: Array.isArray(lobby.moveHistory) ? lobby.moveHistory : [],
                };
                if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(payload));
                break;
            }

            case 'gameOver': {
                const { lobbyId } = message;
                const lobby = lobbies.find(l => l.id === lobbyId);
                if (!lobby) break;
                lobby.status = 'finished';
                lobby.spectators = [];
                broadcast({ type: 'lobbies', lobbies: lobbies.filter(l => l.status !== 'finished') });
                const notify = { type: 'gameOver', lobbyId };
                for (const client of wss.clients) {
                  if (client.readyState === WebSocket.OPEN) client.send(JSON.stringify(notify));
                }
                break;
            }
            
            case 'getLobbies':
                ws.send(JSON.stringify({ type: 'lobbies', lobbies: lobbies.filter(l => l.status !== 'finished'), reqId: message.reqId }));
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

            // removed legacy duplicate chatMessage case

            default:
                console.log('Received unknown message type:', message.type);
        }
    });

    ws.on('close', () => {
        const clientId = clients.get(ws);
        console.log(`Client ${clientId} disconnected`);
        
        // Remove lobbies created by the disconnected client ONLY if not an unclaimed finished game
        lobbies = lobbies.filter(lobby => {
          if (lobby.createdBy !== clientId) return true;
          if (lobby.status === 'finished' && lobby.winner && lobby.winningsClaimed !== true) return true; // keep it
          return false; // remove if open or claimed finished
        });
        
        // cleanup session mapping
        // @ts-ignore
        const sid = ws.sessionId;
        if (sid && sessionToWs.get(sid) === ws) {
            sessionToWs.delete(sid);
        }
        clients.delete(ws);
        broadcastOnlineCount();
        broadcast({ type: 'lobbies', lobbies });
    });
});

// Periodic heartbeat to clean up dead connections
const HEARTBEAT_MS = 10000;
const interval = setInterval(() => {
  wss.clients.forEach((ws) => {
    // @ts-ignore
    if (ws.isAlive === false) {
      // proactively clean up session mapping before termination
      try {
        // @ts-ignore
        const sid = ws.sessionId;
        if (sid && sessionToWs.get(sid) === ws) sessionToWs.delete(sid);
      } catch {}
      try { ws.terminate(); } catch {}
      return;
    }
    // @ts-ignore
    ws.isAlive = false;
    try { ws.ping(); } catch {}
  });
  // After potential terminations, broadcast current online count
  broadcastOnlineCount();
}, HEARTBEAT_MS);

wss.on('close', function close() {
  clearInterval(interval);
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