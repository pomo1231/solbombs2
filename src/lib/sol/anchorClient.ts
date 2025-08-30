import * as anchor from '@coral-xyz/anchor';
import { Connection, PublicKey } from '@solana/web3.js';
import { RPC_URL, PROGRAM_ID } from './config';

// Simple, reliable functions rebuilt from scratch

console.log('[anchorClient] Module loaded - PROGRAM_ID:', PROGRAM_ID);

export async function getProgram(walletCtx: any) {
  const { web3 } = anchor;
  if (!walletCtx?.publicKey) {
    throw new Error('Wallet not connected');
  }
  const connection = new Connection(RPC_URL, 'confirmed');

  // Create anchor wallet
  const anchorWallet: any = {
    publicKey: new web3.PublicKey(walletCtx.publicKey),
    // Bind methods to preserve adapter context (some adapters rely on `this`)
    signTransaction: walletCtx.signTransaction?.bind?.(walletCtx) ?? walletCtx.signTransaction,
    signAllTransactions: walletCtx.signAllTransactions?.bind?.(walletCtx) ?? walletCtx.signAllTransactions,
    sendTransaction: walletCtx.sendTransaction?.bind?.(walletCtx) ?? walletCtx.sendTransaction,
  };

  console.log('[anchorClient] getProgram: creating provider with RPC', RPC_URL);
  console.log('[anchorClient] Connection cluster info:', {
    cluster: connection.rpcEndpoint,
    wallet: walletCtx.publicKey?.toString()
  });
  
  const provider = new anchor.AnchorProvider(connection, anchorWallet, {
    commitment: 'confirmed',
    preflightCommitment: 'confirmed'
  });
  // Set provider for any anchor internals relying on getProvider
  anchor.setProvider(provider);

  console.debug('[anchorClient] getProgram: fetching IDL (cache-busted)');
  const idlRes = await fetch(`/idl/solbombs.json?t=${Date.now()}`, { cache: 'no-store' });
  if (!idlRes.ok) {
    throw new Error(`Failed to load IDL: HTTP ${idlRes.status}`);
  }
  const idl = await idlRes.json();
  try {
    const names = (idl?.instructions || []).map((i: any) => i.name);
    console.debug('[anchorClient] getProgram: IDL loaded. Instructions:', names);
  } catch {}
  try {
    const cashOutIx = (idl as any)?.instructions?.find((ix: any) => ix.name === 'cashOut');
    if (!cashOutIx) {
      console.warn('[anchorClient] IDL has no cashOut instruction; ensure you copied target/idl/solbombs.json to public/idl/solbombs.json');
    } else if (Array.isArray(cashOutIx.args) && cashOutIx.args.length !== 0) {
      console.error('[anchorClient] IDL cashOut still has args -> stale IDL. Expected 0 args after on-chain change.');
      throw new Error('Stale IDL: cashOut should have 0 args. Rebuild (anchor build) and copy target/idl/solbombs.json to public/idl/solbombs.json, then hard refresh.');
    }
  } catch (e) {
    console.warn('[anchorClient] IDL validation skipped/failed:', e);
  }
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

// =========================
// PvP HELPERS (1v1)
// =========================

export async function startPvpOnchain(params: {
  wallet: any;
  creator: PublicKey;
  wagerLamports: number;
  vsRobot: boolean;
}): Promise<{ pvpGamePda: PublicKey; gameNonce: number; signature: string }>
{
  const { anchor, web3, program } = await getProgram(params.wallet);
  const creatorPk = new web3.PublicKey(params.creator);

  const [treasuryPda] = web3.PublicKey.findProgramAddressSync(
    [Buffer.from('treasury')],
    program.programId
  );

  // find available nonce quickly
  let gameNonce = Math.floor(Math.random() * 256);
  let pvpGamePda = web3.PublicKey.findProgramAddressSync(
    [Buffer.from('pvp'), creatorPk.toBuffer(), Buffer.from([gameNonce])],
    program.programId
  )[0];
  for (let i = 0; i < 8; i++) {
    const info = await program.provider.connection.getAccountInfo(pvpGamePda);
    if (!info) break;
    gameNonce = Math.floor(Math.random() * 256);
    pvpGamePda = web3.PublicKey.findProgramAddressSync(
      [Buffer.from('pvp'), creatorPk.toBuffer(), Buffer.from([gameNonce])],
      program.programId
    )[0];
  }

  // Preflight: ensure IDL has startPvp
  const available = (((program as any).idl?.instructions) || []).map((i: any) => i.name);
  if (!available.includes('startPvp')) {
    throw new Error(`IDL missing 'startPvp'. Available: ${available.join(', ')}. Did you copy target/idl/solbombs.json to public/idl/solbombs.json and restart the dev server (hard refresh)?`);
  }

  const tx = await program.methods
    .startPvp(gameNonce, new anchor.BN(params.wagerLamports), params.vsRobot)
    .accounts({
      creator: creatorPk,
      pvpGame: pvpGamePda,
      treasury: treasuryPda,
      systemProgram: web3.SystemProgram.programId,
    })
    .transaction();

  tx.feePayer = creatorPk;
  tx.recentBlockhash = (await program.provider.connection.getLatestBlockhash()).blockhash;
  const walletAdapter: any = (program.provider as any)?.wallet ?? null;
  const signature = await walletAdapter.sendTransaction(tx, program.provider.connection, {
    skipPreflight: false,
    preflightCommitment: 'confirmed',
  });
  await program.provider.connection.confirmTransaction(signature, 'confirmed');
  return { pvpGamePda, gameNonce, signature };
}

export async function joinPvpOnchain(params: {
  wallet: any;
  joiner: PublicKey;
  pvpGamePda: PublicKey;
}): Promise<{ signature: string }>
{
  const { web3, program } = await getProgram(params.wallet);
  const joinerPk = new web3.PublicKey(params.joiner);
  const pvpGamePk = new web3.PublicKey(params.pvpGamePda);

  const [treasuryPda] = web3.PublicKey.findProgramAddressSync(
    [Buffer.from('treasury')],
    program.programId
  );

  const tx = await program.methods
    .joinPvp()
    .accounts({
      joiner: joinerPk,
      pvpGame: pvpGamePk,
      treasury: treasuryPda,
      systemProgram: web3.SystemProgram.programId,
    })
    .transaction();

  tx.feePayer = joinerPk;
  tx.recentBlockhash = (await program.provider.connection.getLatestBlockhash()).blockhash;
  const walletAdapter: any = (program.provider as any)?.wallet ?? null;
  const signature = await walletAdapter.sendTransaction(tx, program.provider.connection, {
    skipPreflight: false,
    preflightCommitment: 'confirmed',
  });
  await program.provider.connection.confirmTransaction(signature, 'confirmed');
  return { signature };
}

export async function resolvePvpOnchain(params: {
  wallet: any;
  payer: PublicKey; // anyone allowed to submit
  pvpGamePda: PublicKey;
  winnerSide: 0 | 1; // 0=creator, 1=counterparty
  creator: PublicKey;
  joiner?: PublicKey; // if vs robot, can pass creator again or SystemProgram id; not used if robot wins
}): Promise<{ signature: string }>
{
  const { web3, program } = await getProgram(params.wallet);
  const payerPk = new web3.PublicKey(params.payer);
  const pvpGamePk = new web3.PublicKey(params.pvpGamePda);
  const creatorPk = new web3.PublicKey(params.creator);
  const joinerPk = new web3.PublicKey(params.joiner || params.creator);

  const [treasuryPda] = web3.PublicKey.findProgramAddressSync(
    [Buffer.from('treasury')],
    program.programId
  );

  // Sanity: payer must be the connected wallet
  const connectedPk = (program.provider as any)?.wallet?.publicKey;
  if (!connectedPk || !connectedPk.equals(payerPk)) {
    throw new Error('Claim must be sent by the connected wallet (payer mismatch).');
  }

  // Fast pre-check: if the pvp_game account is missing, owned by another program,
  // or has no data/discriminator (closed), avoid sending a tx (prevents a wallet popup)
  const info = await program.provider.connection.getAccountInfo(pvpGamePk);
  const notUs = info && !info.owner.equals(program.programId);
  const noData = !info || (info.data?.length ?? 0) < 8; // Anchor discriminator is 8 bytes
  if (notUs || noData) {
    throw new Error('AccountNotInitialized: pvp_game is closed or not found (already claimed).');
  }

  // Decode account; if decode fails or shows resolved, treat as already claimed (benign)
  try {
    const acc: any = (program.account as any)?.pvpGameState
      ? await (program.account as any).pvpGameState.fetch(pvpGamePk)
      : null;
    if (!acc) {
      // If IDL mapping missing or decode returns null, fall back to benign error
      throw new Error('AccountNotInitialized: unable to decode pvp_game (already claimed).');
    }
    if (acc?.resolved === true) {
      throw new Error('AlreadyResolved: pvp_game is already resolved/claimed.');
    }
  } catch (decodeErr: any) {
    // Any decode issue -> treat as benign already-claimed/missing. We prefer to avoid wallet popup at all costs.
    const msg = decodeErr?.message || String(decodeErr || '');
    console.warn('[resolvePvpOnchain] decode pre-check failed; treating as already claimed. Reason:', msg);
    throw new Error('AccountNotInitialized: pvp_game is closed or not found (already claimed).');
  }

  const builder = program.methods
    .resolvePvp(params.winnerSide)
    .accounts({
      payer: payerPk,
      pvpGame: pvpGamePk,
      treasury: treasuryPda,
      creatorAccount: creatorPk,
      joinerAccount: joinerPk,
      systemProgram: web3.SystemProgram.programId,
    });

  // Preflight simulate via Anchor to surface precise logs (skip if account looks closed)
  try {
    console.debug('[resolvePvpOnchain] starting preflight simulate');
    const simRes = await (builder as any).simulate?.();
    const err = simRes?.value?.err;
    const logs = simRes?.value?.logs;
    if (err) {
      console.error('[resolvePvpOnchain] preflight simulation error:', err, 'logs:', logs);
      const logsStr = JSON.stringify(logs || []);
      if (/AccountNotInitialized|AlreadyResolved/i.test(logsStr)) {
        throw new Error('AccountNotInitialized: pvp_game is already closed/resolved.');
      }
      throw new Error(`Simulation failed. Err=${JSON.stringify(err)} Logs=${logsStr}`);
    }
    console.debug('[resolvePvpOnchain] simulate OK; proceeding to final pre-check');
  } catch (simErr: any) {
    // Stop here to avoid a wallet popup on any simulation failure; treat as benign
    const msg = simErr?.message || String(simErr || '');
    console.warn('[resolvePvpOnchain] simulate() failed; treating as already claimed. Reason:', msg);
    throw new Error('AccountNotInitialized: pvp_game is already closed/resolved.');
  }

  // Final pre-check just before RPC to absolutely avoid wallet popup
  {
    const info2 = await program.provider.connection.getAccountInfo(pvpGamePk);
    const notUs2 = info2 && !info2.owner.equals(program.programId);
    const noData2 = !info2 || (info2.data?.length ?? 0) < 8;
    if (notUs2 || noData2) {
      console.warn('[resolvePvpOnchain] final pre-check: account missing/closed -> skipping rpc');
      throw new Error('AccountNotInitialized: pvp_game is closed or not found (already claimed).');
    }
    try {
      const acc2: any = (program.account as any)?.pvpGameState
        ? await (program.account as any).pvpGameState.fetch(pvpGamePk)
        : null;
      if (!acc2) {
        console.warn('[resolvePvpOnchain] final pre-check: decode failed');
        throw new Error('AccountNotInitialized: unable to decode pvp_game (already claimed).');
      }
      if (acc2?.resolved === true) {
        console.warn('[resolvePvpOnchain] final pre-check: already resolved');
        throw new Error('AlreadyResolved: pvp_game is already resolved/claimed.');
      }
    } catch (e: any) {
      const m = e?.message || String(e || '');
      console.warn('[resolvePvpOnchain] final pre-check decode failed; treating as benign. Reason:', m);
      throw new Error('AccountNotInitialized: pvp_game not decodable (already claimed).');
    }
  }

  // Build a transaction explicitly so we can simulate via connection (no wallet popup)
  const tx = await builder.transaction();
  tx.feePayer = payerPk;
  tx.recentBlockhash = (await program.provider.connection.getLatestBlockhash()).blockhash;

  // Manual simulation using connection to block RPC when it would fail
  {
    const sim = await program.provider.connection.simulateTransaction(tx, {
      sigVerify: false,
      commitment: 'confirmed'
    } as any);
    const simErr = (sim as any)?.value?.err;
    const simLogs = (sim as any)?.value?.logs || [];
    if (simErr) {
      const logsStr = JSON.stringify(simLogs);
      console.warn('[resolvePvpOnchain] connection.simulateTransaction() err -> blocking RPC. Logs:', simLogs);
      if (/AccountNotInitialized|AlreadyResolved|expected this account to be already initialized/i.test(logsStr)) {
        throw new Error('AccountNotInitialized: pvp_game is already closed/resolved.');
      }
      throw new Error(`Simulation failed. Err=${JSON.stringify(simErr)} Logs=${logsStr}`);
    }
  }

  try {
    // Send via wallet adapter (single popup), only after all pre-checks and simulations succeed
    const walletAdapter: any = (program.provider as any)?.wallet ?? null;
    console.debug('[resolvePvpOnchain] sending transaction via walletAdapter.sendTransaction');
    const signature = await walletAdapter.sendTransaction(tx, program.provider.connection, {
      skipPreflight: false,
      preflightCommitment: 'confirmed',
    });
    await program.provider.connection.confirmTransaction(signature, 'confirmed');
    return { signature };
  } catch (error: any) {
    // If we get an error here, it's often a race: tx may have landed, account now closed/resolved, but RPC returns a vague error.
    // Mitigation: re-check the pvp account. If closed/not ours/resolved, map to benign AlreadyResolved.
    try {
      const logs = typeof error?.getLogs === 'function' ? await error.getLogs() : (error?.logs || []);
      if (logs && logs.length) console.error('[resolvePvpOnchain] logs:', logs);
    } catch (_) {}
    try {
      const info3 = await program.provider.connection.getAccountInfo(pvpGamePk);
      const closedOrNotOurs = !info3 || (info3 && !info3.owner.equals(program.programId)) || (info3.data?.length ?? 0) < 8;
      if (closedOrNotOurs) {
        throw new Error('AlreadyResolved: pvp_game closed (claimed).');
      }
      try {
        const acc3: any = (program.account as any)?.pvpGameState
          ? await (program.account as any).pvpGameState.fetch(pvpGamePk)
          : null;
        if (!acc3 || acc3?.resolved === true) {
          throw new Error('AlreadyResolved: pvp_game resolved/claimed.');
        }
      } catch (decodeErr: any) {
        throw new Error('AlreadyResolved: pvp_game not decodable (claimed).');
      }
    } catch (benign: any) {
      // Map various invalid param/argument wallet errors to benign already-resolved when account indicates closure
      const em = error?.message || String(error || '');
      if (/invalid\s*(param|argument|instruction)/i.test(em) || /blockhash\s*not\s*found|signature\s*verification\s*failed/i.test(em)) {
        throw benign; // surface our benign AlreadyResolved message
      }
    }
    console.error('[resolvePvpOnchain] error (non-benign):', error);
    throw new Error(`Resolve PvP failed: ${error?.message || String(error)}`);
  }
}

// Attempts to cancel a PvP lobby and refund the creator.
// Strategy:
// 1) Try resolving immediately with winnerSide=0 (creator). For joinerAccount we pass creator as a benign fallback.
// 2) If program rejects due to NoJoiner/HumanJoinNotAllowed, try convertPvpToRobot then resolve.
// This will trigger a wallet popup.
export async function cancelPvpOnchain(params: {
  wallet: any;
  creator: PublicKey;
  pvpGamePda: PublicKey;
}): Promise<{ signature: string }>
{
  const { web3, program } = await getProgram(params.wallet);
  const creatorPk = new web3.PublicKey(params.creator);
  const pvpGamePk = new web3.PublicKey(params.pvpGamePda);

  try {
    const tx = await program.methods
      .cancelPvp()
      .accounts({
        payer: creatorPk,
        pvpGame: pvpGamePk,
        treasury: (await web3.PublicKey.findProgramAddress([Buffer.from('treasury')], program.programId))[0],
        creatorAccount: creatorPk,
        systemProgram: web3.SystemProgram.programId,
      })
      .rpc();
    return { signature: tx };
  } catch (e: any) {
    // Surface program errors clearly
    throw new Error(e?.message || String(e));
  }
}

export async function convertPvpToRobotOnchain(params: {
  wallet: any;
  payer: PublicKey;
  pvpGamePda: PublicKey;
}): Promise<{ signature: string }>
{
  const { web3, program } = await getProgram(params.wallet);
  const payerPk = new web3.PublicKey(params.payer);
  const pvpGamePk = new web3.PublicKey(params.pvpGamePda);

  const [treasuryPda] = web3.PublicKey.findProgramAddressSync(
    [Buffer.from('treasury')],
    program.programId
  );

  // Guard if method not present in IDL
  const maybeBuilder = (program as any)?.methods?.convertPvpToRobot;
  if (!maybeBuilder) {
    throw new Error('Program/IDL missing convertPvpToRobot. Please redeploy and update IDL.');
  }

  const connectedPk = (program.provider as any)?.wallet?.publicKey;
  if (!connectedPk || !connectedPk.equals(payerPk)) {
    throw new Error('Payer must be the connected wallet.');
  }

  const builder = (program as any).methods
    .convertPvpToRobot()
    .accounts({
      payer: payerPk,
      pvpGame: pvpGamePk,
      treasury: treasuryPda,
      systemProgram: web3.SystemProgram.programId,
    });

  try {
    const simRes = await builder.simulate?.();
    const err = simRes?.value?.err;
    const logs = simRes?.value?.logs;
    if (err) {
      console.error('[convertPvpToRobot] preflight simulation error:', err, 'logs:', logs);
      throw new Error(`Simulation failed. Err=${JSON.stringify(err)} Logs=${JSON.stringify(logs)}`);
    }
  } catch (simErr: any) {
    console.warn('[convertPvpToRobot] simulate() failed (non-fatal):', simErr?.message || simErr);
  }

  try {
    const signature = await builder.rpc();
    await program.provider.connection.confirmTransaction(signature, 'confirmed');
    return { signature };
  } catch (error: any) {
    try {
      const logs = typeof error?.getLogs === 'function' ? await error.getLogs() : (error?.logs || []);
      if (logs && logs.length) {
        console.error('[convertPvpToRobot] logs:', logs);
        throw new Error(`Convert PvP to robot failed: ${error.message || error}. Logs: ${JSON.stringify(logs)}`);
      }
    } catch (_) {}
    console.error('[convertPvpToRobot] error:', error);
    throw new Error(`Convert PvP to robot failed: ${error?.message || String(error)}`);
  }
}


export async function startSoloOnchain(params: {
  wallet: any;
  player: PublicKey;
  betLamports: number;
  bombs: number;
}) {
  console.log(`[startSolo] Starting game with ${params.betLamports} lamports, ${params.bombs} bombs`);
  
  const { anchor, web3, program } = await getProgram(params.wallet);
  const playerPk = new web3.PublicKey(params.player);

  // Treasury PDA
  const [treasuryPda] = web3.PublicKey.findProgramAddressSync(
    [Buffer.from('treasury')],
    program.programId
  );
  
  // Fast pre-scan: try up to 8 random nonces to avoid PDA collision (very quick RPC, no popup)
  let gameNonce = Math.floor(Math.random() * 256);
  let gamePda = web3.PublicKey.findProgramAddressSync(
    [Buffer.from('solo'), playerPk.toBuffer(), Buffer.from([gameNonce])],
    program.programId
  )[0];
  for (let i = 0; i < 8; i++) {
    const info = await program.provider.connection.getAccountInfo(gamePda);
    if (!info) break;
    gameNonce = Math.floor(Math.random() * 256);
    gamePda = web3.PublicKey.findProgramAddressSync(
      [Buffer.from('solo'), playerPk.toBuffer(), Buffer.from([gameNonce])],
      program.programId
    )[0];
  }
  console.log(`[startSolo] Selected nonce=${gameNonce}, gamePda=${gamePda.toBase58()}`);

  try {
    const tx = await program.methods
      .startSolo(gameNonce, new anchor.BN(params.betLamports), params.bombs)
      .accounts({
        payer: playerPk,
        game: gamePda,
        treasury: treasuryPda,
        systemProgram: web3.SystemProgram.programId,
      })
      .transaction();

    tx.feePayer = playerPk;
    tx.recentBlockhash = (await program.provider.connection.getLatestBlockhash()).blockhash;
    
    const signedTx = await program.provider.wallet.signTransaction(tx);
    const signature = await program.provider.connection.sendRawTransaction(signedTx.serialize());
    await program.provider.connection.confirmTransaction(signature, 'confirmed');

    console.log(`[startSolo] SUCCESS! Signature: ${signature}`);
    return { gamePda, signature, gameNonce };

  } catch (error: any) {
    // Extract logs for diagnostics
    let logs: string[] | undefined = undefined;
    try {
      logs = typeof error?.getLogs === 'function' ? await error.getLogs() : (error?.logs || undefined);
    } catch {}
    const logsStr = logs ? ` Logs: ${JSON.stringify(logs)}` : '';

    // If collision detected, retry once with a fresh nonce
    const alreadyInUse = logs?.some(l => /already in use/i.test(l)) ?? false;
    if (alreadyInUse) {
      console.warn('[startSolo] PDA collision detected. Retrying with a new nonce...');
      // pick a new nonce quickly
      let retryNonce = Math.floor(Math.random() * 256);
      let retryPda = web3.PublicKey.findProgramAddressSync(
        [Buffer.from('solo'), playerPk.toBuffer(), Buffer.from([retryNonce])],
        program.programId
      )[0];
      for (let i = 0; i < 8; i++) {
        const info = await program.provider.connection.getAccountInfo(retryPda);
        if (!info) break;
        retryNonce = Math.floor(Math.random() * 256);
        retryPda = web3.PublicKey.findProgramAddressSync(
          [Buffer.from('solo'), playerPk.toBuffer(), Buffer.from([retryNonce])],
          program.programId
        )[0];
      }
      try {
        const tx2 = await program.methods
          .startSolo(retryNonce, new anchor.BN(params.betLamports), params.bombs)
          .accounts({ payer: playerPk, game: retryPda, treasury: treasuryPda, systemProgram: web3.SystemProgram.programId })
          .transaction();
        tx2.feePayer = playerPk;
        tx2.recentBlockhash = (await program.provider.connection.getLatestBlockhash()).blockhash;
        const signed2 = await program.provider.wallet.signTransaction(tx2);
        const sig2 = await program.provider.connection.sendRawTransaction(signed2.serialize());
        console.log(`[startSolo] SUCCESS on retry! Signature: ${sig2}`);
        return { gamePda: retryPda, signature: sig2, gameNonce: retryNonce };
      } catch (e2: any) {
        let logs2: string[] | undefined = undefined;
        try { logs2 = typeof e2?.getLogs === 'function' ? await e2.getLogs() : (e2?.logs || undefined); } catch {}
        console.error('[startSolo] Retry failed:', e2, logs2 ? `Logs: ${JSON.stringify(logs2)}` : '');
        throw new Error(`Game creation failed after retry: ${e2.message || e2}.${logs2 ? ' Logs: ' + JSON.stringify(logs2) : ''}`);
      }
    }

    console.error('[startSolo] Error:', error, logsStr);
    throw new Error(`Game creation failed: ${error.message || error}.${logsStr}`);
  }
}

export async function revealSafeOnchain(params: {
  wallet: any;
  player: PublicKey;
  gamePda: PublicKey;
}) {
  console.log('[revealSafe] Revealing tile');
  const { web3, program } = await getProgram(params.wallet);
  const playerPk = new web3.PublicKey(params.player);
  const gamePda = new web3.PublicKey(params.gamePda);

  try {
    const tx = await program.methods
      .revealSafe()
      .accounts({
        payer: playerPk,
        game: gamePda,
      })
      .transaction();

    tx.feePayer = playerPk;
    tx.recentBlockhash = (await program.provider.connection.getLatestBlockhash()).blockhash;

    const signedTx = await program.provider.wallet.signTransaction(tx);
    const signature = await program.provider.connection.sendRawTransaction(signedTx.serialize());
    await program.provider.connection.confirmTransaction(signature, 'confirmed');

    console.log(`[revealSafe] SUCCESS! Signature: ${signature}`);
    return { signature };

  } catch (error: any) {
    console.error('[revealSafe] Error:', error);
    throw new Error(`Reveal failed: ${error.message || error}`);
  }
}

export async function cashOutOnchain(params: {
  wallet: any;
  player: PublicKey;
  gamePda: PublicKey;
  safeRevealedClient: number; // client-side revealed safes
}) {
  console.log(`[cashOut] Cashing out`);
  
  const { web3, program } = await getProgram(params.wallet);
  const playerPk = new web3.PublicKey(params.player);
  const gamePda = new web3.PublicKey(params.gamePda);

  // Treasury PDA
  const [treasuryPda] = web3.PublicKey.findProgramAddressSync(
    [Buffer.from('treasury')],
    program.programId
  );

  try {
    // Get current game state and work out how many reveals are missing on-chain
    const gameState = await program.account.gameState.fetch(gamePda);
    const safeRevealedOnchain = Number(gameState.safeRevealed);
    const bombs = Number(gameState.bombs);
    
    console.log(`[cashOut] Current on-chain safes: ${safeRevealedOnchain}, bombs=${bombs}`);

    // Prevent cashing out with 0 reveals
    if (safeRevealedOnchain === 0 && (!params.safeRevealedClient || params.safeRevealedClient <= 0)) {
      throw new Error('You must reveal at least one safe tile to cash out.');
    }

    // Target final safe count = min(client, maxSafe)
    const maxSafe = 25 - bombs;
    const targetSafe = Math.max(0, Math.min(params.safeRevealedClient ?? safeRevealedOnchain, maxSafe));
    const missingReveals = Math.max(0, targetSafe - safeRevealedOnchain);

    // Build a SINGLE transaction: missing revealSafe instructions (if any) + cashOut
    const tx = new web3.Transaction();
    if (missingReveals > 0) {
      for (let i = 0; i < missingReveals; i++) {
        const ix = await program.methods
          .revealSafe()
          .accounts({ payer: playerPk, game: gamePda })
          .instruction();
        tx.add(ix);
      }
      console.log(`[cashOut] Will sync +${missingReveals} reveals in same tx`);
    } else {
      console.log('[cashOut] No reveal sync needed');
    }

    const cashIx = await program.methods
      .cashOut()
      .accounts({
        payer: playerPk,
        game: gamePda,
        treasury: treasuryPda,
        systemProgram: web3.SystemProgram.programId,
      })
      .instruction();
    tx.add(cashIx);

    tx.feePayer = playerPk;
    tx.recentBlockhash = (await program.provider.connection.getLatestBlockhash()).blockhash;
    const signed = await program.provider.wallet.signTransaction(tx);
    const cashSignature = await program.provider.connection.sendRawTransaction(signed.serialize());
    await program.provider.connection.confirmTransaction(cashSignature, 'confirmed');
    console.log(`[cashOut] CashOut SUCCESS! signature=${cashSignature}`);
    return { revealSignature: null, cashSignature };

  } catch (error: any) {
    console.error('[cashOut] Error:', error);
    // Try to extract detailed logs if this is a SendTransactionError
    try {
      const logs = typeof error?.getLogs === 'function' ? await error.getLogs() : (error?.logs || []);
      if (logs && logs.length) {
        console.error('[cashOut] Program logs:', logs);
        throw new Error(`Cash out failed: ${error.message || error}. Logs: ${JSON.stringify(logs)}`);
      }
    } catch (e) {
      // ignore secondary failure
    }
    throw new Error(`Cash out failed: ${error.message || error}`);
  }
}

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

export async function getTreasuryBalance(walletCtx: any): Promise<{ treasury: PublicKey, lamports: number }> {
  const { web3, program, provider } = await getProgram(walletCtx);
  
  const [treasuryPda] = web3.PublicKey.findProgramAddressSync(
    [Buffer.from('treasury')],
    program.programId
  );

  try {
    const balance = await provider.connection.getBalance(treasuryPda);
    return { treasury: treasuryPda, lamports: balance };
  } catch (e) {
    console.warn('[getTreasuryBalance] failed:', e);
    return { treasury: treasuryPda, lamports: 0 };
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

// Diagnostic: Compare on-chain IDL with local IDL and report cashOut args mismatch
export async function debugCheckOnchainIdl(walletCtx: any) {
  try {
    const { anchor, provider } = await getProgram(walletCtx);
    const onchainIdl = await anchor.Program.fetchIdl(new anchor.web3.PublicKey(PROGRAM_ID), provider);
    const localIdlRes = await fetch('/idl/solbombs.json', { cache: 'no-store' });
    const localIdl = await localIdlRes.json();

    const getArgsLen = (idlObj: any) => (idlObj?.instructions?.find((i: any) => i.name === 'cashOut')?.args?.length ?? null);
    const oc = getArgsLen(onchainIdl);
    const lc = getArgsLen(localIdl);
    console.log('[debugCheckOnchainIdl] cashOut args -> on-chain:', oc, ' local:', lc);
    if (oc === null) console.warn('[debugCheckOnchainIdl] cashOut not found in on-chain IDL');
    if (lc === null) console.warn('[debugCheckOnchainIdl] cashOut not found in local IDL');
    if (oc !== lc) {
      console.error('[debugCheckOnchainIdl] MISMATCH detected. If on-chain shows 1 and local shows 0, redeploy didn\'t update program. If reversed, copy target/idl/solbombs.json to public/idl/solbombs.json and hard refresh.');
    } else {
      console.log('[debugCheckOnchainIdl] IDLs match for cashOut args length:', oc);
    }
    return { onchainArgs: oc, localArgs: lc };
  } catch (e) {
    console.error('[debugCheckOnchainIdl] failed:', e);
    return null;
  }
}
