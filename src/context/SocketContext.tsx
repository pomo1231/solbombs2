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
    // robot support
    allowRobot?: boolean;
    vsRobotActive?: boolean;
    // spectators
    spectators?: string[]; // server may include session ids; use length only
    spectatorsCount?: number; // if server decides to send only a count
}

interface ISocketContext {
    onlineCount: number;
    lobbies: Lobby[];
    ready: boolean;
    sendMessage: (message: object) => void;
    sendRequest: <T=any>(type: string, payload?: Record<string, any>) => Promise<T>;
    getStats: (wallet: string) => Promise<{ totalWagered: number; gameHistory: any[] } | null>;
    putStats: (args: { wallet: string; payload: { totalWagered: number; gameHistory: any[] } }) => Promise<boolean>;
    getProfile: (wallet: string) => Promise<{ name?: string; email?: string; avatarUrl?: string; clientSeed?: string } | null>;
    putProfile: (args: { wallet: string; profile: { name?: string; email?: string; avatarUrl?: string; clientSeed?: string } }) => Promise<boolean>;
    prefetchStats?: (wallet: string) => void;
    prefetchProfile?: (wallet: string) => void;
    removeLobby: (lobbyId: string) => void;
    markLobbyRobotActive: (args: { lobbyId?: string; pvpGamePda?: string; gameNonce?: number }) => void;
    setStartGameHandler?: (handler: ((payload: any) => void) | undefined) => void;
    setPvpMoveHandler?: (handler: ((payload: { lobbyId: string; tileId: number; by?: 'creator' | 'joiner' }) => void) | undefined) => void;
    setStartSpectateHandler?: (handler: ((payload: any) => void) | undefined) => void;
    setGameOverHandler?: (handler: ((payload: { lobbyId: string }) => void) | undefined) => void;
    setPfFinalSeedHandler?: (handler: ((payload: { lobbyId: string; boardSeed: string; betAmount?: number; bombCount?: number; startsBy?: 'creator'|'joiner'; yourRole?: 'creator'|'joiner' }) => void) | undefined) => void;
    setWinningsClaimedHandler?: (handler: ((payload: { lobbyId: string }) => void) | undefined) => void;
    setRehydrateHandler?: (handler: ((payload: any) => void) | undefined) => void;
}

const SocketContext = createContext<ISocketContext | undefined>(undefined);

export const SocketProvider: FC<{ children: ReactNode }> = ({ children }) => {
    const { publicKey } = useWallet();
    const sessionIdRef = useRef<string | null>(null);
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
    const winningsClaimedHandlerRef = useRef<((payload: { lobbyId: string }) => void) | undefined>(undefined);
    const rehydrateHandlerRef = useRef<((payload: any) => void) | undefined>(undefined);
    const statsCache = useRef(new Map<string, { data: { totalWagered: number; gameHistory: any[] }, ts: number }>());
    const profileCache = useRef(new Map<string, { data: any, ts: number }>());
    const CACHE_TTL_MS = 60_000; // 60 seconds

    const removeLobby = (lobbyId: string) => {
        setLobbies((prev) => prev.filter(l => l.id !== lobbyId));
    };

    const markLobbyRobotActive = ({ lobbyId, pvpGamePda, gameNonce }: { lobbyId?: string; pvpGamePda?: string; gameNonce?: number }) => {
        setLobbies((prev) => prev.map(l => {
            const idMatch = lobbyId && l.id === lobbyId;
            const pdaMatch = pvpGamePda && l.pvpGamePda === pvpGamePda;
            const nonceMatch = typeof gameNonce === 'number' && l.gameNonce === gameNonce;
            if (!(idMatch || pdaMatch || nonceMatch)) return l;
            return {
                ...l,
                vsRobotActive: true,
                joinerName: 'Robot',
                joinerAvatar: l.joinerAvatar || null,
            };
        }));
    };

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
                    sessionIdRef.current = sid;
                    ws.current?.send(JSON.stringify({ type: 'hello', sessionId: sid }));
                } catch {}
                // Request initial lobby list on connect
                try { ws.current?.send(JSON.stringify({ type: 'getLobbies' })); } catch {}
                // Identify wallet if already connected
                try {
                    const walletStr = publicKey?.toBase58?.();
                    const sid = sessionIdRef.current;
                    if (walletStr && sid) {
                        ws.current?.send(JSON.stringify({ type: 'identifyWallet', sessionId: sid, wallet: walletStr }));
                    }
                } catch {}
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
                        try { console.log('[WS] pvpMove <-', data); } catch {}
                        if (h) h({ lobbyId: data.lobbyId, tileId: data.tileId, by: data.by });
                        break;
                    }
                    case 'startSpectate': {
                        const h = startSpectateHandlerRef.current;
                        try { console.log('[WS] startSpectate <-', data); } catch {}
                        if (h) h(data);
                        break;
                    }
                    case 'gameOver': {
                        const h = gameOverHandlerRef.current;
                        if (h) h({ lobbyId: data.lobbyId });
                        // Remove lobby instantly so cards disappear without refresh
                        setLobbies((prev) => prev.filter(l => l.id !== data.lobbyId));
                        break;
                    }
                    case 'pfFinalSeed': {
                        const h = pfFinalSeedHandlerRef.current;
                        try { console.log('[WS] pfFinalSeed <-', data); } catch {}
                        if (h) h({ lobbyId: data.lobbyId, boardSeed: data.boardSeed, betAmount: data.betAmount, bombCount: data.bombCount, startsBy: data.startsBy, yourRole: data.yourRole });
                        break;
                    }
                    case 'rehydrate': {
                        const h = rehydrateHandlerRef.current;
                        try { console.log('[WS] rehydrate <-', data); } catch {}
                        if (h) h(data);
                        break;
                    }
                    case 'winningsClaimed': {
                        const h = winningsClaimedHandlerRef.current;
                        if (h) h({ lobbyId: data.lobbyId });
                        // Remove lobby once payout is claimed
                        setLobbies((prev) => prev.filter(l => l.id !== data.lobbyId));
                        break;
                    }
                    case 'robotSelected': {
                        // Mark the lobby as robot-active and stamp a friendly robot name for UI
                        const lobbyId = data.lobbyId as string | undefined;
                        const pvpGamePda = data.pvpGamePda as string | undefined;
                        const gameNonce = data.gameNonce as number | undefined;
                        setLobbies((prev) => prev.map(l => {
                            const idMatch = lobbyId && l.id === lobbyId;
                            const pdaMatch = pvpGamePda && l.pvpGamePda === pvpGamePda;
                            const nonceMatch = typeof gameNonce === 'number' && l.gameNonce === gameNonce;
                            if (!(idMatch || pdaMatch || nonceMatch)) return l;
                            return {
                                ...l,
                                vsRobotActive: true,
                                // show robot in joiner slot
                                joinerName: 'Robot',
                                joinerAvatar: l.joinerAvatar || null,
                            };
                        }));
                        break;
                    }
                    case 'lobbyRemoved':
                    case 'lobbyCancelled': {
                        if (data?.lobbyId) {
                            setLobbies((prev) => prev.filter(l => l.id !== data.lobbyId));
                        }
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

    // Re-identify wallet to the server whenever the connected wallet changes
    useEffect(() => {
        try {
            const walletStr = publicKey?.toBase58?.();
            const sid = sessionIdRef.current || localStorage.getItem('sessionId');
            if (ws.current && ws.current.readyState === WebSocket.OPEN && sid) {
                ws.current.send(JSON.stringify({ type: 'identifyWallet', sessionId: sid, wallet: walletStr || '' }));
            }
        } catch {}
    }, [publicKey]);
    
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
            const now = Date.now();
            const cached = statsCache.current.get(wallet);
            if (cached && (now - cached.ts) < CACHE_TTL_MS) {
                // return immediately with cached, and refresh in background
                // no await: fire-and-forget refresh
                (async () => {
                    try {
                        const fresh: any = await sendRequest('getStats', { wallet });
                        if (fresh && fresh.stats) statsCache.current.set(wallet, { data: fresh.stats, ts: Date.now() });
                    } catch {}
                })();
                return cached.data;
            }
            // no fresh cache; fetch
            const res: any = await sendRequest('getStats', { wallet });
            if (res && res.stats) {
                statsCache.current.set(wallet, { data: res.stats, ts: now });
                return res.stats;
            }
        } catch (e) {
            console.error('[SocketContext] getStats error:', e);
        }
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

    const getProfile = async (wallet: string) => {
        try {
            const now = Date.now();
            const cached = profileCache.current.get(wallet);
            if (cached && (now - cached.ts) < CACHE_TTL_MS) {
                // refresh in background
                (async () => {
                    try {
                        const fresh: any = await sendRequest('getProfile', { wallet });
                        if (fresh && fresh.profile) profileCache.current.set(wallet, { data: fresh.profile, ts: Date.now() });
                    } catch {}
                })();
                return cached.data;
            }
            const res: any = await sendRequest('getProfile', { wallet });
            if (res && res.profile) {
                profileCache.current.set(wallet, { data: res.profile, ts: now });
                return res.profile;
            }
        } catch (e) {
            console.error('[SocketContext] getProfile error:', e);
        }
        return null;
    };

    const prefetchStats = (wallet: string) => {
        if (!wallet) return;
        const cached = statsCache.current.get(wallet);
        const now = Date.now();
        if (cached && (now - cached.ts) < CACHE_TTL_MS) return;
        (async () => {
            try {
                const res: any = await sendRequest('getStats', { wallet });
                if (res && res.stats) statsCache.current.set(wallet, { data: res.stats, ts: Date.now() });
            } catch {}
        })();
    };

    const prefetchProfile = (wallet: string) => {
        if (!wallet) return;
        const cached = profileCache.current.get(wallet);
        const now = Date.now();
        if (cached && (now - cached.ts) < CACHE_TTL_MS) return;
        (async () => {
            try {
                const res: any = await sendRequest('getProfile', { wallet });
                if (res && res.profile) profileCache.current.set(wallet, { data: res.profile, ts: Date.now() });
            } catch {}
        })();
    };

    const putProfile = async ({ wallet, profile }: { wallet: string; profile: any }) => {
        try {
            await sendRequest('putProfile', { wallet, profile });
            return true;
        } catch {
            return false;
        }
    };

    return (
        <SocketContext.Provider value={{ onlineCount, lobbies, ready, sendMessage, sendRequest, getStats, putStats, getProfile, putProfile, prefetchStats, prefetchProfile, removeLobby, markLobbyRobotActive, setStartGameHandler: (h) => { startGameHandlerRef.current = h; }, setPvpMoveHandler: (h) => { pvpMoveHandlerRef.current = h; }, setStartSpectateHandler: (h) => { startSpectateHandlerRef.current = h; }, setGameOverHandler: (h) => { gameOverHandlerRef.current = h; }, setPfFinalSeedHandler: (h) => { pfFinalSeedHandlerRef.current = h; }, setWinningsClaimedHandler: (h) => { winningsClaimedHandlerRef.current = h; }, setRehydrateHandler: (h) => { rehydrateHandlerRef.current = h; } }}>
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