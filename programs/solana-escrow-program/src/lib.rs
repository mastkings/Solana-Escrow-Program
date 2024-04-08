use anchor_lang::prelude::*;
use solana_program::{
    program::invoke,
    system_instruction::transfer,
    pubkey::Pubkey,
};

declare_id!("7yN3dcoXeJKhzAx7uPvRuawTu2MUW1zEUkruSB88ZdTG");

#[program]
pub mod solana_escrow_program {
    use anchor_lang::solana_program::program::invoke;

    use super::*;

    pub fn create_bank(ctx: Context<CreateBank>, timestamp: i64, amount: u64) -> Result<()>{
        let bank: &mut Account<Bank> = &mut ctx.accounts.bank;
        let sender: &mut Signer = &mut ctx.accounts.sender;
        let receiver: &mut UncheckedAccount = &mut ctx.accounts.receiver;

        invoke(
            &transfer(&sender.key(), &bank.key(), amount), 
            &[sender.to_account_info(), bank.to_account_info()]
        )?;

        bank.sender = sender.key();
        bank.receiver = receiver.key();
        bank.amount = amount;
        bank.timestamp = timestamp;
        bank.bump = *ctx.bumps.get("bank").unwrap();

        Ok(())
    }

    pub fn withdraw_bank(ctx: Context<WithdrawBank>, _timestamp: i64) -> Result<()> {
        let bank: &mut Account<Bank> = &mut ctx.accounts.bank;
        let receiver: &mut Signer = &mut ctx.accounts.receiver;

        if Clock:: get().unwrap().unix_timestamp < bank.timestamp{
            return Err(ErrorCode:: HandsTooWeak.into());
        }

        **bank.to_account_info().try_borrow_mut_lamports().unwrap() -= bank.amount;
        **receiver.to_account_info().try_borrow_mut_lamports()? += bank.amount;

        Ok(())
    }
}

// Data validators

#[derive(Accounts)]
#[instruction(timestamp: i64, amount: u64)]
pub struct CreateBank<'info> {
    #[account(init, seeds = [sender.key().as_ref(), receiver.key().as_ref(), timestamp.to_string().as_bytes().as_ref()], bump, payer = sender, space = Bank::LEN)]
    pub bank: Account<'info, Bank>,
    #[account(mut)]
    pub sender: Signer<'info>,
    /// CHECK: receiver will be a wallet key passed by the user
    pub receiver: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>
}

#[derive(Accounts)]
#[instruction(timestamp: i64)]
pub struct WithdrawBank<'info>{
    #[account(mut, close = sender, seeds = [sender.key().as_ref(), receiver.key().as_ref(), timestamp.to_string().as_bytes().as_ref()], bump = bank.bump)]
    pub bank: Account<'info, Bank>,
    /// CHECK: sender will be verified by the bank account
    #[account(mut, address = bank.sender)]
    pub sender: UncheckedAccount<'info>,
    #[account(mut, address = bank.receiver)]
    pub receiver: Signer<'info>,
    pub system_program: Program<'info, System>    
}

// Data structures

const DISCRIMINATOR: usize = 8;
const PUBKEY: usize = 32;
const INTEGER_64: usize = 8;
const BUMP: usize = 1;

#[account]
pub struct Bank {
    pub sender: Pubkey,
    pub receiver: Pubkey,
    pub amount: u64,
    pub timestamp: i64,
    pub bump: u8
}

impl Bank {
    const LEN: usize = DISCRIMINATOR + PUBKEY + INTEGER_64 + INTEGER_64 + BUMP;
}

// Error codes
#[error_code]
pub enum ErrorCode {
    HandsTooWeak,
    WrongAccount
}
