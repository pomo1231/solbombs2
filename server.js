import { WebSocketServer, WebSocket } from 'ws';
import { v4 as uuidv4 } from 'uuid';

const PORT = process.env.PORT ? Number(process.env.PORT) : 8081;
const wss = new WebSocketServer({ port: PORT });

// In-memory data stores
let lobbies = [];
const clients = new Map();

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
                ws.send(JSON.stringify({ type: 'lobbies', lobbies }));
                break;

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

console.log(`WebSocket server running on ws://localhost:${PORT}`);