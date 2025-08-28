export const PROGRAM_ID = (import.meta.env.VITE_PROGRAM_ID || "YourProgramPubkeyHere111111111111111111111111111") as string;
export const CLUSTER = (import.meta.env.VITE_SOLANA_CLUSTER || "devnet") as string;
export const RPC_URL = (import.meta.env.VITE_SOLANA_RPC || (CLUSTER === 'mainnet' ? 'https://api.mainnet-beta.solana.com' : 'https://api.devnet.solana.com')) as string;

// Optional: Use a specific treasury wallet address instead of PDA
export const TREASURY_WALLET = (import.meta.env.VITE_TREASURY_WALLET || null) as string | null;
