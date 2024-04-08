import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { SolanaEscrowProgram } from "../target/types/solana_escrow_program";
import { PublicKey, Keypair } from "@solana/web3.js";
import assert from "assert";

describe("solana-escrow-program", () => {
  // Configure the client to use the local cluster.
  anchor.setProvider(anchor.AnchorProvider.env());

  // Access the SolanaEscrowProgram program
  const program = anchor.workspace.SolanaEscrowProgram as Program<SolanaEscrowProgram>;
  
  const provider = anchor.AnchorProvider.env()

  // Create keypairs for sender and receiver
  const sender = Keypair.generate();
  const receiver = Keypair.generate();
  const wrongUser = Keypair.generate(); // Wrong user's keypair

  let bankAccount: PublicKey;
  
  // Test case: Should create a bank account
  it("Should create a bank account", async () => {
    const timestamp = new anchor.BN(Date.now() / 1000 + 1000); // Timelock 1000 seconds in the future
    const amount = new anchor.BN(1000); // Amount to be deposited

    await program.rpc.createBank(timestamp, amount, {
      accounts: {
        bank: sender.publicKey,
        sender: sender.publicKey,
        receiver: receiver.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      },
      signers: [sender, receiver],
    });
 

    // Fetch bank account details
    const bank = await program.account.bank.fetch(sender.publicKey);
    bankAccount = sender.publicKey;

    // Assertion checks
    assert.equal(bank.sender.toString(), sender.publicKey.toString());
    assert.equal(bank.receiver.toString(), receiver.publicKey.toString());
    assert.equal(bank.amount.toNumber(), amount.toNumber());
    assert.equal(bank.timestamp.toNumber(), timestamp.toNumber()); 
  });

  // Test case: Should fail to withdraw before timelock
  it("Should fail to withdraw before timelock", async () => {
    const timestamp = new anchor.BN(Math.floor(Date.now() / 1000) + 500); // Timelock 500 seconds in the future

    // Expect rejection with specific error code
    await assert.rejects(
      program.rpc.withdrawBank(timestamp, {
        accounts: {
          bank: bankAccount,
          sender: sender.publicKey,
          receiver: receiver.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        },
      }),
      (err: Error) => {
        assert.equal(err.message, "HandsTooWeak");
        return true;
      }
    );
  });

  // Test case: Should fail for wrong user to withdraw
  it("Should fail for wrong user to withdraw", async () => {
    const timestamp = new anchor.BN(Math.floor(Date.now() / 1000) - 500); // Timelock expired 500 seconds ago

    // Expect rejection with specific error code
    await assert.rejects(
      program.rpc.withdrawBank(timestamp, {
        accounts: {
          bank: bankAccount,
          sender: wrongUser.publicKey, // Use wrong user's public key here
          receiver: receiver.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        },
      }),
      (err: Error) => {
        assert.equal(err.message, "WrongAccount");
        return true;
      }
    );
  });

  // Test case: Should withdraw after timelock
  it("Should withdraw after timelock", async () => {
    const timestamp = new anchor.BN(Math.floor(Date.now() / 1000) - 500); // Timelock expired 500 seconds ago

    // Get sender and receiver's balance before withdrawal
    const senderLamportsBefore = await program.provider.connection.getBalance(sender.publicKey);
    const receiverLamportsBefore = await program.provider.connection.getBalance(receiver.publicKey);

    // Execute withdrawal transaction
    await program.rpc.withdrawBank(timestamp, {
      accounts: {
        bank: bankAccount,
        sender: sender.publicKey,
        receiver: receiver.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      },
    });

    // Get sender and receiver's balance after withdrawal
    const senderLamportsAfter = await program.provider.connection.getBalance(sender.publicKey);
    const receiverLamportsAfter = await program.provider.connection.getBalance(receiver.publicKey);

    // Fetch updated bank account details
    const bank = await program.account.bank.fetch(sender.publicKey);

    // Assertion checks
    assert.equal(senderLamportsAfter, senderLamportsBefore - bank.amount.toNumber());
    assert.equal(receiverLamportsAfter, receiverLamportsBefore + bank.amount.toNumber());
    assert.equal(bank.amount.toNumber(), 1000); // Assuming bank.amount is 1000
  });
});
