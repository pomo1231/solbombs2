import { PROGRAM_ID, RPC_URL } from './config';
import { SHA256 } from 'crypto-js';
import Hex from 'crypto-js/enc-hex';
import type { PublicKey, TransactionInstruction } from '@solana/web3.js';

// Immediate env check - should appear in console on module load
console.log('[anchorClient] Module loaded - PROGRAM_ID:', PROGRAM_ID);

// Lazy Anchor import to avoid hard dependency at build time
async function loadAnchor() {
  try {
    const anchor = await import('@coral-xyz/anchor');
    const web3 = await import('@solana/web3.js');
    return { anchor, web3 };
  } catch (e) {
    throw new Error('Anchor not installed. Run: npm i @coral-xyz/anchor @solana/web3.js');
  }
}

export async function getProgram(walletCtx: any) {
  const { anchor, web3 } = await loadAnchor();
  const connection = new web3.Connection(RPC_URL, 'confirmed');

  if (!walletCtx || !walletCtx.publicKey || !walletCtx.signTransaction) {
    throw new Error('Wallet not ready: missing publicKey/signTransaction');
  }

  console.debug('[anchorClient] getProgram: building anchorWallet');
  const anchorWallet: any = {
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
    throw new Error(`Cannot create Program: ${e.message}. Anchor version mismatch?`);
  }
  return { anchor, web3, provider, program };
}

export async function startSoloOnchain(params: {
  wallet: any;
  player: PublicKey;
  betLamports: number;
  bombs: number;
  nonce: number;
}) {
  const { anchor, web3, program, provider } = await getProgram(params.wallet);
  const playerPk = new web3.PublicKey(params.player);

  // Derive treasury PDA
  const [treasuryPda] = web3.PublicKey.findProgramAddressSync(
    [Buffer.from('treasury')],
    program.programId
  );

  // Use random nonce to avoid collision with old games
  let gameNonce = Math.floor(Math.random() * 256);

  // Simple retry loop for random nonces
  const maxRetries = 5;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    // Generate new random nonce for each attempt
    if (attempt > 0) {
      gameNonce = Math.floor(Math.random() * 256);
    }
    
    const gamePda = web3.PublicKey.findProgramAddressSync(
      [Buffer.from('solo'), playerPk.toBuffer(), Buffer.from([gameNonce])],
      program.programId
    )[0];

    console.log(`[startSolo] Attempt ${attempt + 1}: nonce=${gameNonce}, gamePda=${gamePda.toBase58()}`);
    
    // Check balances before attempting transaction
    const balance = await provider.connection.getBalance(playerPk);
    const rentExempt = await provider.connection.getMinimumBalanceForRentExemption(8 + 45);
    const totalNeeded = params.betLamports + rentExempt + 10000;
    console.log(`[startSolo] Balance check: have=${balance} lamports, need=${totalNeeded} lamports (wager=${params.betLamports}, rent=${rentExempt})`);
    
    if (balance < totalNeeded) {
      throw new Error(`Insufficient balance: have ${balance/1e9} SOL, need ${totalNeeded/1e9} SOL`);
    }

    try {
      // Build transaction manually to avoid provider issues
      const startIx = await program.methods
        .startSolo(gameNonce, new anchor.BN(params.betLamports), params.bombs)
        .accounts({
          payer: playerPk,
          game: gamePda,
          treasury: treasuryPda,
          systemProgram: web3.SystemProgram.programId,
        })
        .instruction();

      const tx = new web3.Transaction();
      tx.add(startIx);
      tx.feePayer = playerPk;
      const { blockhash } = await provider.connection.getLatestBlockhash('confirmed');
      tx.recentBlockhash = blockhash;

      // Use wallet to send transaction (wallet will sign)
      const walletAdapter = params.wallet;
      const signature = await walletAdapter.sendTransaction(tx, provider.connection, {
        skipPreflight: true,
        preflightCommitment: 'confirmed'
      });
      
      // Confirm the transaction
      await provider.connection.confirmTransaction(signature, 'confirmed');

      console.log(`[startSolo] Success! Signature: ${signature}`);
      return { gamePda, signature, gameNonce };

    } catch (error: any) {
      const isAlreadyInUse = error.message?.includes('already in use') || 
                             error.transactionLogs?.some((log: string) => log.includes('already in use'));
      
      if (isAlreadyInUse && attempt < maxRetries - 1) {
        console.log(`[startSolo] PDA collision, trying new random nonce...`);
        continue;
      }

      // If it's the last attempt or not a collision, handle the error
    console.error('[startSolo] Error:', error);
    console.error('[startSolo] Error details:', {
      message: error.message,
      code: error.code,
      InstructionError: error.InstructionError,
      logs: error.logs || error.transactionLogs
    });
    
    // Parse Anchor/Solana errors
    let errorMessage = 'Unknown error';
    
    if (error.message) {
      errorMessage = error.message;
    }
    
    // Handle program errors
    if (error.code !== undefined) {
      const errorCodes: { [key: number]: string } = {
        6000: 'WagerTooSmall - Minimum wager not met',
        6001: 'AlreadyResolved - Game already finished', 
        6002: 'BadAuthority - Invalid authority',
        6003: 'MathOverflow - Math operation overflow',
        6004: 'InvalidBombCount - Invalid number of bombs (must be 1-24)',
        6005: 'TooManySafeRevealed - Too many safe tiles revealed',
        6006: 'NoSafeRevealed - No safe tiles revealed',
        6007: 'MultiplierTooHigh - Multiplier exceeds maximum',
        6008: 'InsufficientTreasury - Treasury has insufficient funds'
      };
      errorMessage = errorCodes[error.code] || `Program error ${error.code}`;
    }
    
    // Handle instruction errors with better detail
    if (error.InstructionError) {
      const [index, details] = error.InstructionError;
      console.error(`[startSolo] Instruction ${index} failed with details:`, details);
      
      if (details?.Custom !== undefined) {
        const code = details.Custom;
        const errorCodes: { [key: number]: string } = {
          0: 'SystemProgramError - Insufficient lamports or account constraint failure',
          6000: 'WagerTooSmall',
          6001: 'AlreadyResolved',
          6002: 'BadAuthority', 
          6003: 'MathOverflow',
          6004: 'InvalidBombCount',
          6005: 'TooManySafeRevealed',
          6006: 'NoSafeRevealed',
          6007: 'MultiplierTooHigh',
          6008: 'InsufficientTreasury'
        };
        errorMessage = `Instruction ${index}: ${errorCodes[code] || `Error ${code}`}`;
      } else {
        errorMessage = `Instruction ${index} failed: ${JSON.stringify(details)}`;
      }
      
      // Special handling for error 0 (system program errors)
      if (details?.Custom === 0 || details === 0) {
        const estimatedNeeded = (params.betLamports + 10000000) / 1e9; // wager + ~0.01 SOL for rent/fees
        errorMessage = `System program error - likely insufficient balance or account constraint failure. Check that you have enough SOL for wager + rent (~${estimatedNeeded.toFixed(3)} SOL total)`;
      }
    }
    
      throw new Error(`startSolo failed: ${errorMessage}`);
    }
  }
  
  throw new Error('startSolo failed: Could not find available PDA after multiple retries');
}

export async function cashOutOnchain(params: {
  wallet: any;
  player: PublicKey;
  gamePda: PublicKey;
  safeRevealed: number;
  bombs: number;
}) {
  const { web3, program, provider } = await getProgram(params.wallet);
  const playerPk = new web3.PublicKey(params.player);
  const gamePda = new web3.PublicKey(params.gamePda);

  const [treasuryPda] = web3.PublicKey.findProgramAddressSync(
    [Buffer.from('treasury')],
    program.programId
  );

  try {
    // Fetch authoritative on-chain state and clamp multiplier to avoid MultiplierTooHigh
    const onchain = await program.account.gameState.fetch(gamePda);
    const onchainSafe: number = Number(onchain?.safeRevealed ?? 0);
    const onchainBombs: number = Number(onchain?.bombs ?? params.bombs);
    
    // Ensure we have safes to reveal (either already on-chain or to be revealed)
    if (params.safeRevealed <= 0) {
      throw new Error('NoSafeRevealed');
    }
    
    // Calculate reveals needed
    const revealsNeeded = Math.max(0, params.safeRevealed - onchainSafe);
    
    // Calculate correct multiplier based on the final state after reveals
    // The smart contract will see onchainSafe + revealsNeeded when cashout executes
    const finalSafeCount = onchainSafe + revealsNeeded;
    
    // Use exact integer calculation matching smart contract
    const multiplierBps = calculateExactMultiplierBps(finalSafeCount, onchainBombs);
    
    console.log(`[cashOut] Multiplier calculation: onchainSafe=${onchainSafe}, params.safeRevealed=${params.safeRevealed}, revealsNeeded=${revealsNeeded}, finalSafeCount=${finalSafeCount}, multiplierBps=${multiplierBps}`);
    
    // Optional preflight: ensure treasury can cover payout
    try {
      const wagerLamports: number = Number(onchain?.wagerLamports ?? 0);
      const expectedLamports = computeExpectedPayoutLamports(wagerLamports, multiplierBps);
      const treInfo = await provider.connection.getAccountInfo(treasuryPda);
      const treBal = Number(treInfo?.lamports ?? 0);
      if (expectedLamports > 0 && treBal < expectedLamports) {
        throw new Error('InsufficientTreasury');
      }
    } catch {}

    // Fetch CURRENT on-chain state (after any reveals from UI)
    const currentOnchain = await program.account.gameState.fetch(gamePda);
    const currentSafeCount = Number(currentOnchain?.safeRevealed ?? 0);
    
    console.log(`[cashOut] SIMPLIFIED: Current on-chain safe count: ${currentSafeCount}`);
    
    // Calculate multiplier based on CURRENT on-chain state
    const currentMultiplierBps = calculateExactMultiplierBps(currentSafeCount, onchainBombs);
    
    console.log(`[cashOut] Current state multiplier: ${currentMultiplierBps} bps`);
    
    // Build cashout instruction manually (same approach as startSolo that works)
    const cashIx = await program.methods
      .cashOut(currentMultiplierBps)
      .accounts({
        payer: playerPk,
        game: gamePda,
        treasury: treasuryPda,
        systemProgram: web3.SystemProgram.programId,
      })
      .instruction();

    // Build transaction manually like startSolo
    const tx = new web3.Transaction();
    tx.add(cashIx);
    tx.feePayer = playerPk;
    const { blockhash } = await provider.connection.getLatestBlockhash('confirmed');
    tx.recentBlockhash = blockhash;

    // Use wallet to send transaction - remove skipPreflight to see real error
    const walletAdapter = params.wallet;
    const signature = await walletAdapter.sendTransaction(tx, provider.connection, {
      skipPreflight: false,  // Let's see the actual error
      preflightCommitment: 'confirmed'
    });
    
    // Confirm the transaction
    await provider.connection.confirmTransaction(signature, 'confirmed');

    console.log(`[cashOut] Success! Single transaction confirmed: ${signature}`);
    return { signature };

  } catch (error: any) {
    console.error('[cashOut] Error:', error);
    
    let errorMessage = 'Unknown error';
    if (error.message) {
      errorMessage = error.message;
    }
    
    if (error.code !== undefined) {
      const errorCodes: { [key: number]: string } = {
        6000: 'WagerTooSmall',
        6001: 'AlreadyResolved',
        6002: 'BadAuthority',
        6003: 'MathOverflow', 
        6004: 'InvalidBombCount',
        6005: 'TooManySafeRevealed',
        6006: 'NoSafeRevealed',
        6007: 'MultiplierTooHigh',
        6008: 'InsufficientTreasury'
      };
      errorMessage = errorCodes[error.code] || `Program error ${error.code}`;
    }
    
    if (error.InstructionError) {
      const [index, details] = error.InstructionError;
      if (details?.Custom !== undefined) {
        const code = details.Custom;
        const errorCodes: { [key: number]: string } = {
          6000: 'WagerTooSmall',
          6001: 'AlreadyResolved', 
          6002: 'BadAuthority',
          6003: 'MathOverflow',
          6004: 'InvalidBombCount',
          6005: 'TooManySafeRevealed',
          6006: 'NoSafeRevealed',
          6007: 'MultiplierTooHigh',
          6008: 'InsufficientTreasury'
        };
        errorMessage = `Instruction ${index}: ${errorCodes[code] || `Error ${code}`}`;
      }
    }
    
    throw new Error(`Cash out failed: ${errorMessage}`);
  }
}

export async function resolveLossOnchain(params: {
  wallet: any;
  player: PublicKey;
  gamePda: PublicKey;
}) {
  const { web3, program, provider } = await getProgram(params.wallet);
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
        commitment: 'confirmed',
        skipPreflight: true
      });

    console.log(`[resolveLoss] Success! Signature: ${signature}`);
    return { signature };

  } catch (error: any) {
    console.error('[resolveLoss] Error:', error);
    throw new Error(`Resolve loss failed: ${error.message || error}`);
  }
}

export function getTreasuryPda() {
  return import('@solana/web3.js').then(({ PublicKey }) => {
    return import('./config').then(({ PROGRAM_ID }) => {
      const [treasuryPda] = PublicKey.findProgramAddressSync(
        [Buffer.from('treasury')],
        new PublicKey(PROGRAM_ID)
      );
      return treasuryPda;
    });
  });
}

export async function getTreasuryBalance(walletCtx: any): Promise<{ treasury: any; lamports: number }> {
  const { web3, program, provider } = await getProgram(walletCtx);
  const [treasuryPda] = web3.PublicKey.findProgramAddressSync(
    [Buffer.from('treasury')],
    program.programId
  );
  const info = await provider.connection.getAccountInfo(treasuryPda);
  return { treasury: treasuryPda, lamports: Number(info?.lamports ?? 0) };
}

export async function fundTreasury(walletCtx: any, solAmount: number): Promise<string> {
  if (!solAmount || solAmount <= 0) throw new Error('SOL amount must be > 0');
  
  const { web3, program, provider } = await getProgram(walletCtx);
  const payer = new web3.PublicKey(walletCtx.publicKey);
  const [treasuryPda] = web3.PublicKey.findProgramAddressSync(
    [Buffer.from('treasury')],
    program.programId
  );
  
  const lamports = Math.round(solAmount * 1_000_000_000); // Convert SOL to lamports
  
  try {
    // Build transaction
    const transaction = new web3.Transaction().add(
      web3.SystemProgram.transfer({
        fromPubkey: payer,
        toPubkey: treasuryPda,
        lamports
      })
    );
    
    // Send via wallet adapter
    if (!walletCtx.sendTransaction) {
      throw new Error('Wallet does not support sendTransaction');
    }
    
    const signature = await walletCtx.sendTransaction(transaction, provider.connection);
    await provider.connection.confirmTransaction(signature, 'confirmed');
    
    console.log(`[fundTreasury] Funded ${solAmount} SOL (${lamports} lamports) to ${treasuryPda.toBase58()}: ${signature}`);
    return signature;
  } catch (error: any) {
    throw new Error(`Fund treasury failed: ${error.message || error}`);
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

// Calculate multiplier BPS exactly like the smart contract does
function calculateOnChainMultiplierBps(safeRevealed: number, bombs: number): number {
  if (safeRevealed === 0) {
    return 10_000; // 1.0x
  }

  const totalTiles = 25;
  const houseEdgeBps = 9900; // 0.99 = 99%
  
  // Calculate probability using fixed-point arithmetic (scale by 1_000_000)
  const scale = 1_000_000;
  let chance = scale; // Start with 1.0

  for (let i = 0; i < safeRevealed; i++) {
    const remainingTiles = totalTiles - i;
    const remainingSafe = (totalTiles - bombs) - i;
    
    if (remainingTiles === 0 || remainingSafe === 0) {
      return 10_000; // 1.0x fallback
    }

    chance = Math.floor((chance * remainingSafe) / remainingTiles);
  }

  if (chance === 0) {
    return 65535; // Max multiplier
  }

  // Expected payout (bps) = (house_edge_bps) / (chance_fp / scale)
  // => multiplier_bps = floor(house_edge_bps * scale / chance_fp)
  const numerator = houseEdgeBps * scale;
  const calc = Math.floor(numerator / chance);
  
  let multiplierBps = calc;
  if (multiplierBps > 65535) multiplierBps = 65535;
  if (multiplierBps < 10000) multiplierBps = 10000;
  
  return multiplierBps;
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

export function isOnchainConfigured() {
  return !!PROGRAM_ID && PROGRAM_ID !== 'YourProgramPubkeyHere111111111111111111111111111' && PROGRAM_ID.length >= 32;
}