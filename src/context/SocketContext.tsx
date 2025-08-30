import React, { createContext, useContext, useEffect, useState, ReactNode, FC, useRef } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';

const WS_URL = import.meta.env.VITE_WS_URL || `ws://${window.location.hostname}:8081`;

interface Lobby {
    id: string;
    name: string;
    players: number;
    maxPlayers: number;
    betAmount: number;
    bombCount: number;
    // optional on-chain context
    pvpGamePda?: string | null;
    gameNonce?: number | null;
    creatorWallet?: string | null;
    joinerWallet?: string | null;
    // optional profile context
    creatorName?: string | null;
    creatorAvatar?: string | null;
    joinerName?: string | null;
    joinerAvatar?: string | null;
}

interface ISocketContext {
    onlineCount: number;
    lobbies: Lobby[];
    ready: boolean;
    sendMessage: (message: object) => void;
    sendRequest: <T=any>(type: string, payload?: Record<string, any>) => Promise<T>;
    getStats: (wallet: string) => Promise<{ totalWagered: number; gameHistory: any[] } | null>;
    putStats: (args: { wallet: string; payload: { totalWagered: number; gameHistory: any[] } }) => Promise<boolean>;
    setStartGameHandler?: (handler: ((payload: any) => void) | undefined) => void;
    setPvpMoveHandler?: (handler: ((payload: { lobbyId: string; tileId: number; by?: 'creator' | 'joiner' }) => void) | undefined) => void;
    setStartSpectateHandler?: (handler: ((payload: any) => void) | undefined) => void;
    setGameOverHandler?: (handler: ((payload: { lobbyId: string }) => void) | undefined) => void;
    setPfFinalSeedHandler?: (handler: ((payload: { lobbyId: string; boardSeed: string; betAmount?: number; bombCount?: number; startsBy?: 'creator'|'joiner'; yourRole?: 'creator'|'joiner' }) => void) | undefined) => void;
}

const SocketContext = createContext<ISocketContext | undefined>(undefined);

export const SocketProvider: FC<{ children: ReactNode }> = ({ children }) => {
    const { publicKey } = useWallet();
    const ws = useRef<WebSocket | null>(null);
    const [onlineCount, setOnlineCount] = useState(0);
    const [lobbies, setLobbies] = useState<Lobby[]>([]);
    const [ready, setReady] = useState(false);
    const pending = useRef(new Map<string, { resolve: (v:any)=>void; reject: (e:any)=>void }>());
    const startGameHandlerRef = useRef<((payload: any) => void) | undefined>(undefined);
    const pvpMoveHandlerRef = useRef<((payload: { lobbyId: string; tileId: number; by?: 'creator' | 'joiner' }) => void) | undefined>(undefined);
    const startSpectateHandlerRef = useRef<((payload: any) => void) | undefined>(undefined);
    const gameOverHandlerRef = useRef<((payload: { lobbyId: string }) => void) | undefined>(undefined);
    const pfFinalSeedHandlerRef = useRef<((payload: { lobbyId: string; boardSeed: string; betAmount?: number; bombCount?: number; startsBy?: 'creator'|'joiner'; yourRole?: 'creator'|'joiner' }) => void) | undefined>(undefined);

    useEffect(() => {
        const g = window as any;
        // Reuse a single WS across rerenders/StrictMode/HMR
        if (g.__APP_WS__ && (g.__APP_WS__.readyState === WebSocket.OPEN || g.__APP_WS__.readyState === WebSocket.CONNECTING)) {
            ws.current = g.__APP_WS__ as WebSocket;
            setReady(ws.current.readyState === WebSocket.OPEN);
        } else {
            ws.current = new WebSocket(WS_URL);
            g.__APP_WS__ = ws.current;
        }

        if (!g.__APP_WS_INIT__) {
            g.__APP_WS_INIT__ = true;
            ws.current.onopen = () => {
                console.log('WebSocket connected');
                setReady(true);
                // Send a stable session id to allow server-side deduplication
                try {
                    const sidKey = 'sessionId';
                    let sid = localStorage.getItem(sidKey);
                    if (!sid) { sid = crypto.randomUUID(); localStorage.setItem(sidKey, sid); }
                    ws.current?.send(JSON.stringify({ type: 'hello', sessionId: sid }));
                } catch {}
                // Request initial lobby list on connect
                try { ws.current?.send(JSON.stringify({ type: 'getLobbies' })); } catch {}
            };
            ws.current.onclose = () => {
                console.log('WebSocket disconnected');
                setReady(false);
                // reject all pending
                pending.current.forEach(({reject}) => reject(new Error('socket closed')));
                pending.current.clear();
                // Allow re-init later
                g.__APP_WS_INIT__ = false;
                g.__APP_WS__ = null;
            };
        }

        ws.current.onmessage = async (event) => {
            try {
                const raw = event.data instanceof Blob ? await event.data.text() : event.data;
                const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
                switch (data.type) {
                    case 'onlineCount':
                        setOnlineCount(data.count);
                        break;
                    case 'lobbies':
                        setLobbies(data.lobbies);
                        break;
                    case 'startGame': {
                        const h = startGameHandlerRef.current;
                        if (h) h(data);
                        break;
                    }
                    case 'pvpMove': {
                        const h = pvpMoveHandlerRef.current;
                        if (h) h({ lobbyId: data.lobbyId, tileId: data.tileId, by: data.by });
                        break;
                    }
                    case 'startSpectate': {
                        const h = startSpectateHandlerRef.current;
                        if (h) h(data);
                        break;
                    }
                    case 'gameOver': {
                        const h = gameOverHandlerRef.current;
                        if (h) h({ lobbyId: data.lobbyId });
                        break;
                    }
                    case 'pfFinalSeed': {
                        const h = pfFinalSeedHandlerRef.current;
                        if (h) h({ lobbyId: data.lobbyId, boardSeed: data.boardSeed, betAmount: data.betAmount, bombCount: data.bombCount, startsBy: data.startsBy, yourRole: data.yourRole });
                        break;
                    }
                    case 'stats':
                    case 'ok':
                    case 'error': {
                        const reqId = data.reqId;
                        if (reqId && pending.current.has(reqId)) {
                            const { resolve, reject } = pending.current.get(reqId)!;
                            pending.current.delete(reqId);
                            if (data.type === 'error') reject(data);
                            else resolve(data);
                        }
                        break;
                    }
                    // Handle other message types like chat if needed
                }
            } catch (e) {
                console.error("Failed to parse websocket message", e);
            }
        };

        // Do not forcibly close the singleton on unmount; let server heartbeat detect stale tabs
        return () => {};
    }, []);
    
    const sendMessage = (message: object) => {
        if (ws.current && ws.current.readyState === WebSocket.OPEN) {
            ws.current.send(JSON.stringify(message));
        }
    };

    const sendRequest = <T=any,>(type: string, payload: Record<string, any> = {}) => {
        return new Promise<T>((resolve, reject) => {
            const reqId = crypto.randomUUID();
            pending.current.set(reqId, { resolve, reject });
            sendMessage({ type, reqId, ...payload });
        });
    };

    const getStats = async (wallet: string) => {
        try {
            const res: any = await sendRequest('getStats', { wallet });
            if (res && res.stats) return res.stats;
        } catch {}
        return null;
    };

    const putStats = async ({ wallet, payload }: { wallet: string; payload: { totalWagered: number; gameHistory: any[] } }) => {
        try {
            await sendRequest('putStats', { wallet, payload });
            return true;
        } catch {
            return false;
        }
    };

    return (
        <SocketContext.Provider value={{ onlineCount, lobbies, ready, sendMessage, sendRequest, getStats, putStats, setStartGameHandler: (h) => { startGameHandlerRef.current = h; }, setPvpMoveHandler: (h) => { pvpMoveHandlerRef.current = h; }, setStartSpectateHandler: (h) => { startSpectateHandlerRef.current = h; }, setGameOverHandler: (h) => { gameOverHandlerRef.current = h; }, setPfFinalSeedHandler: (h) => { pfFinalSeedHandlerRef.current = h; } }}>
            {children}
        </SocketContext.Provider>
    );
};

export const useSocket = () => {
    const context = useContext(SocketContext);
    if (context === undefined) {
        throw new Error('useSocket must be used within a SocketProvider');
    }
    return context;
}; 