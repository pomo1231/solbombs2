import * as anchor from '@coral-xyz/anchor';
import { Connection, PublicKey } from '@solana/web3.js';
import { RPC_URL, PROGRAM_ID } from './config';

// Simple, reliable functions rebuilt from scratch

console.log('[anchorClient] Module loaded - PROGRAM_ID:', PROGRAM_ID);

async function getProgram(walletCtx: any) {
  const { web3 } = anchor;
  if (!walletCtx?.publicKey) {
    throw new Error('Wallet not connected');
  }

  const connection = new Connection(RPC_URL, 'confirmed');

  // Create anchor wallet
  const anchorWallet = {
    publicKey: new web3.PublicKey(walletCtx.publicKey),
    // Bind methods to preserve adapter context (some adapters rely on `this`)
    signTransaction: walletCtx.signTransaction?.bind?.(walletCtx) ?? walletCtx.signTransaction,
  };
  if (walletCtx.signAllTransactions) {
    anchorWallet.signAllTransactions = walletCtx.signAllTransactions?.bind?.(walletCtx) ?? walletCtx.signAllTransactions;
  }
  // Ensure sendTransaction is available on the wallet for direct calls
  if (walletCtx.sendTransaction) {
    anchorWallet.sendTransaction = walletCtx.sendTransaction?.bind?.(walletCtx) ?? walletCtx.sendTransaction;
  }

  console.debug('[anchorClient] getProgram: creating provider with RPC', RPC_URL);
  const provider = new anchor.AnchorProvider(connection, anchorWallet, {
    commitment: 'confirmed',
    preflightCommitment: 'confirmed'
  });
  // Set provider for any anchor internals relying on getProvider
  anchor.setProvider(provider);

  console.debug('[anchorClient] getProgram: fetching IDL');
  const idlRes = await fetch('/idl/solbombs.json');
  if (!idlRes.ok) {
    throw new Error(`Failed to load IDL: HTTP ${idlRes.status}`);
  }
  const idl = await idlRes.json();
  console.debug('[anchorClient] getProgram: IDL loaded');
  console.debug('[anchorClient] getProgram: env PROGRAM_ID =', PROGRAM_ID);
  console.debug('[anchorClient] getProgram: idl.metadata?.address =', (idl as any)?.metadata?.address);
  // Anchor Program() may read idl.metadata.address; ensure it exists and matches PROGRAM_ID
  const idlAny: any = idl as any;
  if (!idlAny.metadata) idlAny.metadata = {};
  if (!idlAny.metadata.address || idlAny.metadata.address !== PROGRAM_ID) {
    idlAny.metadata.address = PROGRAM_ID;
    console.debug('[anchorClient] getProgram: patched idl.metadata.address ->', idlAny.metadata.address);
  }
  let programId: any;
  try {
    programId = new web3.PublicKey(PROGRAM_ID);
  } catch (e: any) {
    const msg = e?.message || String(e);
    throw new Error(`Invalid PROGRAM_ID '${PROGRAM_ID}': ${msg}. Did you restart the dev server after editing .env?`);
  }
  console.debug('[anchorClient] getProgram: constructing Program for', programId.toBase58());
  let program: any;
  try {
    // Use the programId we validated earlier
    program = new anchor.Program(idlAny, programId, provider);
  } catch (e: any) {
    console.error('[anchorClient] getProgram: Program constructor failed', e);
    throw new Error(`Failed to create Anchor program: ${e?.message || String(e)}`);
  }

  return { anchor, web3, program, provider };
}

export async function startSoloOnchain(params: {
  wallet: any;
  player: PublicKey;
  betLamports: number;
  bombs: number;
  nonce: number;
}) {
  console.log(`[startSolo] SIMPLE: Starting game with ${params.betLamports} lamports, ${params.bombs} bombs`);
  
  const { anchor, web3, program } = await getProgram(params.wallet);
  const playerPk = new web3.PublicKey(params.player);

  // Treasury PDA
  const [treasuryPda] = web3.PublicKey.findProgramAddressSync(
    [Buffer.from('treasury')],
    program.programId
  );

  // Use random nonce
  let gameNonce = Math.floor(Math.random() * 256);
  const gamePda = web3.PublicKey.findProgramAddressSync(
    [Buffer.from('solo'), playerPk.toBuffer(), Buffer.from([gameNonce])],
    program.programId
  )[0];

  console.log(`[startSolo] Using nonce=${gameNonce}, gamePda=${gamePda.toBase58()}`);

  try {
    // Use Anchor's simple RPC - let it handle everything
    const signature = await program.methods
      .startSolo(gameNonce, new anchor.BN(params.betLamports), params.bombs)
      .accounts({
        payer: playerPk,
        game: gamePda,
        treasury: treasuryPda,
        systemProgram: web3.SystemProgram.programId,
      })
      .rpc({
        skipPreflight: false,  // See real errors
        commitment: 'confirmed'
      });

    console.log(`[startSolo] SUCCESS! Signature: ${signature}`);
    return { gamePda, signature, gameNonce };

  } catch (error: any) {
    console.error('[startSolo] Error:', error);
    
    // If account collision, try once more with new nonce
    if (error.message?.includes('already in use') || error.message?.includes('Error Code: 0')) {
      gameNonce = Math.floor(Math.random() * 256);
      const newGamePda = web3.PublicKey.findProgramAddressSync(
        [Buffer.from('solo'), playerPk.toBuffer(), Buffer.from([gameNonce])],
        program.programId
      )[0];
      
      console.log(`[startSolo] Retrying with new nonce=${gameNonce}`);
      
      const signature = await program.methods
        .startSolo(gameNonce, new anchor.BN(params.betLamports), params.bombs)
        .accounts({
          payer: playerPk,
          game: newGamePda,
          treasury: treasuryPda,
          systemProgram: web3.SystemProgram.programId,
        })
        .rpc({
          skipPreflight: false,
          commitment: 'confirmed'
        });

      console.log(`[startSolo] SUCCESS on retry! Signature: ${signature}`);
      return { gamePda: newGamePda, signature, gameNonce };
    }
    
    throw new Error(`Game creation failed: ${error.message || error}`);
  }
}

export async function cashOutOnchain(params: {
  wallet: any;
  player: PublicKey;
  gamePda: PublicKey;
  safeRevealed: number;
  bombs: number;
}) {
  console.log(`[cashOut] SIMPLE: Cashing out with ${params.safeRevealed} safe tiles revealed`);
  
  const { web3, program } = await getProgram(params.wallet);
  const playerPk = new web3.PublicKey(params.player);
  const gamePda = new web3.PublicKey(params.gamePda);

  // Treasury PDA
  const [treasuryPda] = web3.PublicKey.findProgramAddressSync(
    [Buffer.from('treasury')],
    program.programId
  );

  try {
    // Get current game state
    const gameState = await program.account.gameState.fetch(gamePda);
    const currentSafes = Number(gameState.safeRevealed);
    const bombCount = Number(gameState.bombs);
    
    console.log(`[cashOut] Current on-chain safes: ${currentSafes}, need: ${params.safeRevealed}`);

    // Calculate correct multiplier for current state
    const multiplierBps = calculateExactMultiplierBps(currentSafes, bombCount);
    console.log(`[cashOut] Using multiplier: ${multiplierBps} bps (${multiplierBps/100}%)`);

    // Simple Anchor RPC call
    const signature = await program.methods
      .cashOut(multiplierBps)
      .accounts({
        payer: playerPk,
        game: gamePda,
        treasury: treasuryPda,
        systemProgram: web3.SystemProgram.programId,
      })
      .rpc({
        skipPreflight: false,  // See real errors
        commitment: 'confirmed'
      });

    console.log(`[cashOut] SUCCESS! Signature: ${signature}`);
    return { signature };

  } catch (error: any) {
    console.error('[cashOut] Error:', error);
    throw new Error(`Cash out failed: ${error.message || error}`);
  }
}

// Exact integer replica of on-chain multiplier calculation (matches lib.rs exactly)
function calculateExactMultiplierBps(safeRevealed: number, bombs: number): number {
  if (safeRevealed === 0) return 10_000; // 1.0x

  const totalTiles = 25n;
  const houseEdgeBps = 9_900n; // 0.99
  const scale = 1_000_000n;

  let chance = scale; // fixed-point 1.0
  for (let i = 0; i < safeRevealed; i++) {
    const remainingTiles = totalTiles - BigInt(i);
    const remainingSafe = (totalTiles - BigInt(bombs)) - BigInt(i);
    if (remainingTiles === 0n || remainingSafe === 0n) return 10_000; // fallback 1.0x
    chance = (chance * remainingSafe) / remainingTiles;
  }

  if (chance === 0n) return 65_535; // Max u16

  // multiplier_bps = floor(house_edge_bps * scale / chance_fp)
  let multiplierBps = Number((houseEdgeBps * scale) / chance);
  if (multiplierBps > 65_535) multiplierBps = 65_535;
  if (multiplierBps < 10_000) multiplierBps = 10_000;
  return multiplierBps;
}

export async function resolveLossOnchain(params: {
  wallet: any;
  player: PublicKey;
  gamePda: PublicKey;
}) {
  console.log('[resolveLoss] SIMPLE: Resolving loss');
  const { web3, program } = await getProgram(params.wallet);
  const playerPk = new web3.PublicKey(params.player);
  const gamePda = new web3.PublicKey(params.gamePda);

  const [treasuryPda] = web3.PublicKey.findProgramAddressSync(
    [Buffer.from('treasury')],
    program.programId
  );

  try {
    const signature = await program.methods
      .resolveLoss()
      .accounts({
        payer: playerPk,
        game: gamePda,
        treasury: treasuryPda,
        systemProgram: web3.SystemProgram.programId,
      })
      .rpc({
        skipPreflight: false,
        commitment: 'confirmed'
      });

    console.log(`[resolveLoss] SUCCESS! Signature: ${signature}`);
    return { signature };
  } catch (error: any) {
    console.error('[resolveLoss] Error:', error);
    throw new Error(`Resolve loss failed: ${error.message || error}`);
  }
}

export async function fundTreasury(walletCtx: any, solAmount: number): Promise<{ signature: string }> {
  console.log(`[fundTreasury] SIMPLE: Funding treasury with ${solAmount} SOL`);
  
  const { web3, program, provider } = await getProgram(walletCtx);
  const playerPk = new web3.PublicKey(walletCtx.publicKey);

  const [treasuryPda] = web3.PublicKey.findProgramAddressSync(
    [Buffer.from('treasury')],
    program.programId
  );

  const lamports = Math.floor(solAmount * 1e9);

  try {
    const transferIx = web3.SystemProgram.transfer({
      fromPubkey: playerPk,
      toPubkey: treasuryPda,
      lamports: lamports,
    });

    const tx = new web3.Transaction().add(transferIx);
    tx.feePayer = playerPk;
    const { blockhash } = await provider.connection.getLatestBlockhash('confirmed');
    tx.recentBlockhash = blockhash;

    const walletAdapter = walletCtx;
    const signature = await walletAdapter.sendTransaction(tx, provider.connection, {
      skipPreflight: false,
      preflightCommitment: 'confirmed'
    });
    
    await provider.connection.confirmTransaction(signature, 'confirmed');

    console.log(`[fundTreasury] SUCCESS! Signature: ${signature}`);
    return { signature };
  } catch (error: any) {
    console.error('[fundTreasury] Error:', error);
    throw new Error(`Fund treasury failed: ${error.message || error}`);
  }
}

export async function getTreasuryBalance(walletCtx: any): Promise<number> {
  const { web3, program, provider } = await getProgram(walletCtx);
  
  const [treasuryPda] = web3.PublicKey.findProgramAddressSync(
    [Buffer.from('treasury')],
    program.programId
  );

  try {
    const balance = await provider.connection.getBalance(treasuryPda);
    return balance;
  } catch (e) {
    console.warn('[getTreasuryBalance] failed:', e);
    return 0;
  }
}

export async function fetchGameState(walletCtx: any, gamePda: PublicKey): Promise<any | null> {
  const { web3, program } = await getProgram(walletCtx);
  try {
    const gamePk = new web3.PublicKey(gamePda);
    const state = await program.account.gameState.fetch(gamePk);
    return state;
  } catch (e) {
    console.warn('[fetchGameState] failed:', e);
    return null;
  }
}

export function computeExpectedPayoutLamports(wagerLamports: number, multiplierBps: number): number {
  if (!wagerLamports || !multiplierBps) return 0;
  return Math.floor((Number(wagerLamports) * Number(multiplierBps)) / 10_000);
}

export function isOnchainConfigured() {
  return !!PROGRAM_ID && PROGRAM_ID !== 'YourProgramPubkeyHere111111111111111111111111111' && PROGRAM_ID.length >= 32;
}

