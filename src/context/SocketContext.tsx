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
}

interface ISocketContext {
    onlineCount: number;
    lobbies: Lobby[];
    ready: boolean;
    sendMessage: (message: object) => void;
    sendRequest: <T=any>(type: string, payload?: Record<string, any>) => Promise<T>;
    getStats: (wallet: string) => Promise<{ totalWagered: number; gameHistory: any[] } | null>;
    putStats: (args: { wallet: string; payload: { totalWagered: number; gameHistory: any[] } }) => Promise<boolean>;
}

const SocketContext = createContext<ISocketContext | undefined>(undefined);

export const SocketProvider: FC<{ children: ReactNode }> = ({ children }) => {
    const { publicKey } = useWallet();
    const ws = useRef<WebSocket | null>(null);
    const [onlineCount, setOnlineCount] = useState(0);
    const [lobbies, setLobbies] = useState<Lobby[]>([]);
    const [ready, setReady] = useState(false);
    const pending = useRef(new Map<string, { resolve: (v:any)=>void; reject: (e:any)=>void }>());

    useEffect(() => {
        if (!publicKey) return;

        ws.current = new WebSocket(WS_URL);

        ws.current.onopen = () => {
            console.log('WebSocket connected');
            setReady(true);
            // Request initial lobby list on connect
            ws.current?.send(JSON.stringify({ type: 'getLobbies' }));
        };

        ws.current.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                switch (data.type) {
                    case 'onlineCount':
                        setOnlineCount(data.count);
                        break;
                    case 'lobbies':
                        setLobbies(data.lobbies);
                        break;
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
        
        ws.current.onclose = () => {
            console.log('WebSocket disconnected');
            setReady(false);
            // reject all pending
            pending.current.forEach(({reject}) => reject(new Error('socket closed')));
            pending.current.clear();
        };

        return () => {
            ws.current?.close();
        };
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
        <SocketContext.Provider value={{ onlineCount, lobbies, ready, sendMessage, sendRequest, getStats, putStats }}>
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