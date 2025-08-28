use anchor_lang::prelude::*;

declare_id!("7TMfKWSr4RFSPLvFzcWvsqBeEUXM8yu76dxaj2qY1EXy"); // Devnet Program ID

#[program]
pub mod solbombs {
    use super::*;

    // Creates a PDA game account and transfers the user's wager into the treasury PDA.
    pub fn start_solo(ctx: Context<StartSolo>, game_nonce: u8, wager_lamports: u64, bombs: u8) -> Result<()> {
        require!(wager_lamports >= MIN_WAGER_LAMPORTS, SolbombsError::WagerTooSmall);
        require!(bombs >= 1 && bombs <= 24, SolbombsError::InvalidBombCount);

        // Transfer wager from user to TREASURY PDA (no escrow on game account)
        let ix = anchor_lang::solana_program::system_instruction::transfer(
            &ctx.accounts.payer.key(),
            &ctx.accounts.treasury.key(),
            wager_lamports,
        );
        anchor_lang::solana_program::program::invoke(
            &ix,
            &[
                ctx.accounts.payer.to_account_info(),
                ctx.accounts.treasury.to_account_info(),
                ctx.accounts.system_program.to_account_info(),
            ],
        )?;

        // Initialize state
        let game = &mut ctx.accounts.game;
        game.bump = ctx.bumps.game;
        game.authority = ctx.accounts.payer.key();
        game.game_nonce = game_nonce;
        game.wager_lamports = wager_lamports;
        game.bombs = bombs;
        game.safe_revealed = 0;
        game.resolved = false;
        Ok(())
    }

    // Convert an existing human lobby into a robot game, preserving the same PDA and wager.
    // Only allowed before a human has joined.
    pub fn convert_pvp_to_robot(ctx: Context<ConvertPvpToRobot>) -> Result<()> {
        let game = &mut ctx.accounts.pvp_game;
        require!(!game.resolved, SolbombsError::AlreadyResolved);
        require!(!game.has_joiner, SolbombsError::AlreadyHasJoiner);

        // Ensure treasury can cover the counter stake, same as start_pvp(vs_robot=true)
        let treasury_lamports = **ctx.accounts.treasury.lamports.borrow();
        require!(treasury_lamports >= game.wager_lamports, SolbombsError::InsufficientTreasury);

        game.vs_robot = true;
        Ok(())
    }

// (PvP account structs are defined after the program module)

    // Increments safe_revealed counter when player reveals a safe tile
    pub fn reveal_safe(ctx: Context<RevealSafe>) -> Result<()> {
        require!(!ctx.accounts.game.resolved, SolbombsError::AlreadyResolved);
        require_keys_eq!(ctx.accounts.game.authority, ctx.accounts.payer.key(), SolbombsError::BadAuthority);

        let game = &mut ctx.accounts.game;
        let max_safe = 25 - game.bombs;
        require!(game.safe_revealed < max_safe, SolbombsError::TooManySafeRevealed);
        
        game.safe_revealed = game.safe_revealed.checked_add(1).ok_or(SolbombsError::MathOverflow)?;
        Ok(())
    }

    // Cash out with validated multiplier and treasury payout
    pub fn cash_out(ctx: Context<CashOut>) -> Result<()> {
        require!(!ctx.accounts.game.resolved, SolbombsError::AlreadyResolved);
        require_keys_eq!(ctx.accounts.game.authority, ctx.accounts.payer.key(), SolbombsError::BadAuthority);
        require!(ctx.accounts.game.safe_revealed > 0, SolbombsError::NoSafeRevealed);

        let multiplier_bps = calculate_multiplier_bps(ctx.accounts.game.safe_revealed, ctx.accounts.game.bombs)?;

        let payout: u64;
        if multiplier_bps == 10_000 {
            payout = ctx.accounts.game.wager_lamports;
        } else {
            payout = (ctx.accounts.game.wager_lamports as u128)
                .checked_mul(multiplier_bps as u128).ok_or(SolbombsError::MathOverflow)?
                .checked_div(10_000).ok_or(SolbombsError::MathOverflow)? as u64;
        }

        // Ensure treasury has enough balance
        require!(ctx.accounts.treasury.lamports() >= payout, SolbombsError::InsufficientTreasury);

        // Transfer payout from treasury -> payer (treasury is PDA signer)
        let treasury_bump = ctx.bumps.treasury;
        let signer_seeds: &[&[u8]] = &[b"treasury", &[treasury_bump]];
        let ix = anchor_lang::solana_program::system_instruction::transfer(
            &ctx.accounts.treasury.key(),
            &ctx.accounts.payer.key(),
            payout,
        );
        anchor_lang::solana_program::program::invoke_signed(
            &ix,
            &[
                ctx.accounts.treasury.to_account_info(),
                ctx.accounts.payer.to_account_info(),
                ctx.accounts.system_program.to_account_info(),
            ],
            &[signer_seeds],
        )?;

        // Mark resolved; close = payer returns only rent (no wager held on game)
        let game = &mut ctx.accounts.game;
        game.resolved = true;
        Ok(())
    }

    // Resolve loss - wager already in treasury; just resolve and close
    pub fn resolve_loss(ctx: Context<ResolveLoss>) -> Result<()> {
        require!(!ctx.accounts.game.resolved, SolbombsError::AlreadyResolved);
        require_keys_eq!(ctx.accounts.game.authority, ctx.accounts.payer.key(), SolbombsError::BadAuthority);

        // Mark resolved; close = treasury (house keeps rent)
        let game = &mut ctx.accounts.game;
        game.resolved = true;
        Ok(())
    }

    // =========================
    // PvP (1v1) GAME FLOW
    // =========================
    // Creator pays wager into Treasury; optionally vs_robot. If vs_robot, ensure treasury
    // can cover the counter stake (2x payout liability) before allowing start.
    pub fn start_pvp(
        ctx: Context<StartPvp>,
        game_nonce: u8,
        wager_lamports: u64,
        vs_robot: bool,
    ) -> Result<()> {
        require!(wager_lamports >= MIN_WAGER_LAMPORTS, SolbombsError::WagerTooSmall);

        // If vs_robot, ensure treasury can cover at least the counter stake (wager)
        if vs_robot {
            require!(ctx.accounts.treasury.lamports() >= wager_lamports, SolbombsError::InsufficientTreasury);
        }

        // Transfer creator's wager into treasury PDA
        let ix = anchor_lang::solana_program::system_instruction::transfer(
            &ctx.accounts.creator.key(),
            &ctx.accounts.treasury.key(),
            wager_lamports,
        );
        anchor_lang::solana_program::program::invoke(
            &ix,
            &[
                ctx.accounts.creator.to_account_info(),
                ctx.accounts.treasury.to_account_info(),
                ctx.accounts.system_program.to_account_info(),
            ],
        )?;

        let game = &mut ctx.accounts.pvp_game;
        game.bump = ctx.bumps.pvp_game;
        game.creator = ctx.accounts.creator.key();
        game.joiner = Pubkey::default();
        game.has_joiner = false;
        game.game_nonce = game_nonce;
        game.wager_lamports = wager_lamports;
        game.vs_robot = vs_robot;
        game.resolved = false;
        Ok(())
    }

    // A human joiner pays the matching wager to participate against creator.
    pub fn join_pvp(ctx: Context<JoinPvp>) -> Result<()> {
        let game = &mut ctx.accounts.pvp_game;
        require!(!game.resolved, SolbombsError::AlreadyResolved);
        require!(!game.vs_robot, SolbombsError::HumanJoinNotAllowedForRobot);
        require!(!game.has_joiner, SolbombsError::AlreadyHasJoiner);

        // Transfer joiner's wager into treasury PDA
        let ix = anchor_lang::solana_program::system_instruction::transfer(
            &ctx.accounts.joiner.key(),
            &ctx.accounts.treasury.key(),
            game.wager_lamports,
        );
        anchor_lang::solana_program::program::invoke(
            &ix,
            &[
                ctx.accounts.joiner.to_account_info(),
                ctx.accounts.treasury.to_account_info(),
                ctx.accounts.system_program.to_account_info(),
            ],
        )?;

        game.joiner = ctx.accounts.joiner.key();
        game.has_joiner = true;
        Ok(())
    }

    // Resolve PvP.
    // winner_side: 0 = creator, 1 = counterparty (joiner or robot)
    pub fn resolve_pvp(ctx: Context<ResolvePvp>, winner_side: u8) -> Result<()> {
        let game = &mut ctx.accounts.pvp_game;
        require!(!game.resolved, SolbombsError::AlreadyResolved);

        require!(winner_side == 0 || winner_side == 1, SolbombsError::InvalidWinner);
        // If no human joined, implicitly treat as a robot match (no extra instruction needed)
        let treating_as_robot = game.vs_robot || !game.has_joiner;

        // Determine payout
        let pot = game.wager_lamports
            .checked_mul(2)
            .ok_or(SolbombsError::MathOverflow)?;

        // If vs_robot and the winner is robot (counterparty), funds remain in treasury.
        if treating_as_robot && winner_side == 1 {
            // Robot wins: funds remain in treasury
            game.resolved = true;
            return Ok(());
        }

        // Winner is a real pubkey (creator or human joiner). Ensure treasury balance
        require!(ctx.accounts.treasury.lamports() >= pot, SolbombsError::InsufficientTreasury);

        // Transfer pot from treasury -> winner (treasury is PDA signer)
        let treasury_bump = ctx.bumps.treasury;
        let signer_seeds: &[&[u8]] = &[b"treasury", &[treasury_bump]];
        let to_key = if winner_side == 0 { ctx.accounts.creator_account.key() } else { ctx.accounts.joiner_account.key() };
        // Validate recipient matches stored state for safety (especially joiner)
        if treating_as_robot {
            // Only creator can be paid in robot context when winner_side == 0
            require!(winner_side == 0 && to_key == game.creator, SolbombsError::InvalidWinner);
        } else {
            require!(to_key == game.creator || to_key == game.joiner, SolbombsError::InvalidWinner);
        }

        let ix = anchor_lang::solana_program::system_instruction::transfer(
            &ctx.accounts.treasury.key(),
            &to_key,
            pot,
        );
        anchor_lang::solana_program::program::invoke_signed(
            &ix,
            &[
                ctx.accounts.treasury.to_account_info(),
                if winner_side == 0 { ctx.accounts.creator_account.to_account_info() } else { ctx.accounts.joiner_account.to_account_info() },
                ctx.accounts.system_program.to_account_info(),
            ],
            &[signer_seeds],
        )?;

        game.resolved = true;
        Ok(())
    }
}

// Calculate multiplier in basis points (10000 = 1.0x) based on safe tiles revealed and bomb count
fn calculate_multiplier_bps(safe_revealed: u8, bombs: u8) -> Result<u16> {
    if safe_revealed == 0 {
        return Ok(10_000); // 1.0x
    }

    let total_tiles = 25u32;
    let house_edge_bps = 9900u32; // 0.99 = 99%
    
    // Calculate probability using fixed-point arithmetic (scale by 1_000_000)
    let scale = 1_000_000u64;
    let mut chance = scale; // Start with 1.0

    for i in 0..safe_revealed {
        let remaining_tiles = total_tiles - (i as u32);
        let remaining_safe = (total_tiles - bombs as u32) - (i as u32);
        
        if remaining_tiles == 0 || remaining_safe == 0 {
            return Ok(10_000); // 1.0x fallback
        }

        chance = chance
            .checked_mul(remaining_safe as u64).ok_or(SolbombsError::MathOverflow)?
            / remaining_tiles as u64;
    }

    if chance == 0 {
        return Ok(65535); // Max multiplier
    }

    // Expected payout (bps) = (house_edge_bps) / (chance_fp / scale)
    // => multiplier_bps = floor(house_edge_bps * scale / chance_fp)
    let numerator: u128 = (house_edge_bps as u128)
        .checked_mul(scale as u128).ok_or(SolbombsError::MathOverflow)?;
    let divisor: u128 = chance as u128;
    if divisor == 0 {
        return Ok(65_535);
    }
    let calc: u128 = numerator / divisor;
    let mut multiplier_bps: u32 = u32::try_from(calc).unwrap_or(u32::MAX);
    if multiplier_bps > 65_535 { multiplier_bps = 65_535; }
    if multiplier_bps < 10_000 { multiplier_bps = 10_000; }
    Ok(multiplier_bps as u16)
}

#[derive(Accounts)]
pub struct ConvertPvpToRobot<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(
        mut,
        seeds = [b"pvp", pvp_game.creator.as_ref(), &[pvp_game.game_nonce]],
        bump = pvp_game.bump,
    )]
    pub pvp_game: Account<'info, PvpGameState>,

    #[account(
        mut,
        seeds = [b"treasury"],
        bump
    )]
    /// CHECK: Treasury PDA for storing house funds
    pub treasury: AccountInfo<'info>,

    pub system_program: Program<'info, System>,
}
#[derive(Accounts)]
#[instruction(game_nonce: u8)]
pub struct StartSolo<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(
        init,
        payer = payer,
        space = 8 + GameState::SIZE,
        seeds = [b"solo", payer.key().as_ref(), &[game_nonce]],
        bump
    )]
    pub game: Account<'info, GameState>,

    #[account(
        mut,
        seeds = [b"treasury"],
        bump
    )]
    /// CHECK: Treasury PDA for storing house funds
    pub treasury: AccountInfo<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct RevealSafe<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(
        mut,
        seeds = [b"solo", payer.key().as_ref(), &[game.game_nonce]],
        bump = game.bump,
    )]
    pub game: Account<'info, GameState>,
}

#[derive(Accounts)]
pub struct CashOut<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(
        mut,
        seeds = [b"solo", payer.key().as_ref(), &[game.game_nonce]],
        bump = game.bump,
        close = payer
    )]
    pub game: Account<'info, GameState>,

    #[account(
        mut,
        seeds = [b"treasury"],
        bump
    )]
    /// CHECK: Treasury PDA for storing house funds
    pub treasury: AccountInfo<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ResolveLoss<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(
        mut,
        seeds = [b"solo", payer.key().as_ref(), &[game.game_nonce]],
        bump = game.bump,
        close = treasury
    )]
    pub game: Account<'info, GameState>,

    #[account(
        mut,
        seeds = [b"treasury"],
        bump
    )]
    /// CHECK: Treasury PDA for storing house funds
    pub treasury: AccountInfo<'info>,

    pub system_program: Program<'info, System>,
}

#[account]
pub struct GameState {
    pub bump: u8,
    pub authority: Pubkey,
    pub game_nonce: u8,
    pub wager_lamports: u64,
    pub bombs: u8,
    pub safe_revealed: u8,
    pub resolved: bool,
}

impl GameState {
    pub const SIZE: usize = 1 + 32 + 1 + 8 + 1 + 1 + 1; // 45 bytes
}

// =========================
// PvP ACCOUNTS (outside program)
// =========================

#[derive(Accounts)]
#[instruction(game_nonce: u8)]
pub struct StartPvp<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,

    #[account(
        init,
        payer = creator,
        space = 8 + PvpGameState::SIZE,
        seeds = [b"pvp", creator.key().as_ref(), &[game_nonce]],
        bump
    )]
    pub pvp_game: Account<'info, PvpGameState>,

    #[account(
        mut,
        seeds = [b"treasury"],
        bump
    )]
    /// CHECK: Treasury PDA for storing house funds
    pub treasury: AccountInfo<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct JoinPvp<'info> {
    #[account(mut)]
    pub joiner: Signer<'info>,

    #[account(
        mut,
        seeds = [b"pvp", pvp_game.creator.as_ref(), &[pvp_game.game_nonce]],
        bump = pvp_game.bump,
    )]
    pub pvp_game: Account<'info, PvpGameState>,

    #[account(
        mut,
        seeds = [b"treasury"],
        bump
    )]
    /// CHECK: Treasury PDA for storing house funds
    pub treasury: AccountInfo<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ResolvePvp<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(
        mut,
        seeds = [b"pvp", pvp_game.creator.as_ref(), &[pvp_game.game_nonce]],
        bump = pvp_game.bump,
        close = payer
    )]
    pub pvp_game: Account<'info, PvpGameState>,

    #[account(
        mut,
        seeds = [b"treasury"],
        bump
    )]
    /// CHECK: Treasury PDA for storing house funds
    pub treasury: AccountInfo<'info>,

    /// Recipient accounts
    #[account(mut)]
    pub creator_account: SystemAccount<'info>,
    #[account(mut)]
    pub joiner_account: SystemAccount<'info>,

    pub system_program: Program<'info, System>,
}

#[account]
pub struct PvpGameState {
    pub bump: u8,
    pub creator: Pubkey,
    pub joiner: Pubkey,
    pub has_joiner: bool,
    pub game_nonce: u8,
    pub wager_lamports: u64,
    pub vs_robot: bool,
    pub resolved: bool,
}

impl PvpGameState {
    // bump(1) + creator(32) + joiner(32) + has_joiner(1) + nonce(1) + wager(8) + vs_robot(1) + resolved(1)
    pub const SIZE: usize = 1 + 32 + 32 + 1 + 1 + 8 + 1 + 1; // 77 bytes
}

#[error_code]
pub enum SolbombsError {
    #[msg("Wager below minimum.")]
    WagerTooSmall,
    #[msg("Game already resolved.")]
    AlreadyResolved,
    #[msg("Bad authority.")]
    BadAuthority,
    #[msg("Math overflow.")]
    MathOverflow,
    #[msg("Invalid bomb count (must be 1-24).")]
    InvalidBombCount,
    #[msg("Too many safe tiles revealed.")]
    TooManySafeRevealed,
    #[msg("No safe tiles revealed yet.")]
    NoSafeRevealed,
    #[msg("Multiplier too high for revealed tiles.")]
    MultiplierTooHigh,
    #[msg("Treasury has insufficient funds for payout.")]
    InsufficientTreasury,
    // PvP specific
    #[msg("Game already has a joiner.")]
    AlreadyHasJoiner,
    #[msg("Cannot join a robot game as human.")]
    HumanJoinNotAllowedForRobot,
    #[msg("No joiner present.")]
    NoJoiner,
    #[msg("Invalid winner.")]
    InvalidWinner,
}

const MIN_WAGER_LAMPORTS: u64 = 10_000; // 0.00001 SOL
