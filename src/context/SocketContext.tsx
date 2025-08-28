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
    sendMessage: (message: object) => void;
}

const SocketContext = createContext<ISocketContext | undefined>(undefined);

export const SocketProvider: FC<{ children: ReactNode }> = ({ children }) => {
    const { publicKey } = useWallet();
    const ws = useRef<WebSocket | null>(null);
    const [onlineCount, setOnlineCount] = useState(0);
    const [lobbies, setLobbies] = useState<Lobby[]>([]);

    useEffect(() => {
        if (!publicKey) return;

        ws.current = new WebSocket(WS_URL);

        ws.current.onopen = () => {
            console.log('WebSocket connected');
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
                    // Handle other message types like chat if needed
                }
            } catch (e) {
                console.error("Failed to parse websocket message", e);
            }
        };
        
        ws.current.onclose = () => {
            console.log('WebSocket disconnected');
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

    return (
        <SocketContext.Provider value={{ onlineCount, lobbies, sendMessage }}>
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