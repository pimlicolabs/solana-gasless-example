import {
    type Address,
    type Instruction,
    type TransactionSigner,
    address,
    createNoopSigner,
    generateKeyPairSigner,
    getBase64EncodedWireTransaction,
    partiallySignTransactionMessageWithSigners,
} from "@solana/kit";
import { getCreateAccountInstruction } from "@solana-program/system";
import {
    TOKEN_PROGRAM_ADDRESS,
    findAssociatedTokenPda,
    getCreateAssociatedTokenIdempotentInstruction,
    getInitializeMint2Instruction,
    getMintSize,
    getMintToInstruction,
    getTransferInstruction,
} from "@solana-program/token";
import { explorerTx, kora, readState, rpc, writeState } from "./config.ts";
import { createSponsoredTransactionMessage } from "./sponsored-transaction.ts";

export async function ata(owner: Address, mint: Address) {
    const [account] = await findAssociatedTokenPda({ owner, mint, tokenProgram: TOKEN_PROGRAM_ADDRESS });
    return account;
}

export async function feePayer() {
    const { signer_address } = await kora.getPayerSigner();
    return createNoopSigner(address(signer_address));
}

// Builds the instructions for a token transfer. If the recipient has no token
// account yet, one is created with the Pimlico fee payer as its rent payer, so
// neither wallet needs SOL. Paying rent for an account the transaction creates
// is the only thing besides the fee that the fee payer may do. The rent is part
// of the sponsored cost (or of the token fee, when the user pays in USDC), so
// the create instruction is only added when the account is missing.
export async function transferInstructions(
    user: TransactionSigner,
    recipient: Address,
    mint: Address,
    amount: bigint,
): Promise<Instruction[]> {
    const source = await ata(user.address, mint);
    const destination = await ata(recipient, mint);
    const { value: existing } = await rpc.getAccountInfo(destination, { encoding: "base64" }).send();

    const instructions: Instruction[] = [];
    if (!existing) {
        instructions.push(
            getCreateAssociatedTokenIdempotentInstruction({
                payer: await feePayer(),
                ata: destination,
                owner: recipient,
                mint,
            }),
        );
    }
    instructions.push(getTransferInstruction({ source, destination, authority: user, amount }));
    return instructions;
}

export async function signAndSend(instructions: Instruction[]) {
    const message = await createSponsoredTransactionMessage(kora, instructions);
    // The user (and any new account) signs here. The fee payer adds its signature.
    const transaction = getBase64EncodedWireTransaction(
        await partiallySignTransactionMessageWithSigners(message),
    );
    const { signature } = await kora.signAndSendTransaction({ transaction });
    return signature;
}

// The sponsored and estimate scripts move a test token, so they work without a
// faucet. On first run this creates the mint, with the user as mint authority,
// and mints 1,000 tokens to the user. Pimlico pays the fee and the rent of the
// new accounts, so this transaction is gasless too.
export async function ensureTestToken(user: TransactionSigner): Promise<Address> {
    const saved = readState("test-mint.txt");
    if (saved) return address(saved);

    console.log("First run: creating a test token and minting 1,000 to the user (sponsored)...");
    const payer = await feePayer();
    const mint = await generateKeyPairSigner();
    const userTokenAccount = await ata(user.address, mint.address);
    const rent = await rpc
        .getMinimumBalanceForRentExemption(BigInt(getMintSize()))
        .send();

    const signature = await signAndSend([
        getCreateAccountInstruction({
            payer,
            newAccount: mint,
            lamports: rent,
            space: getMintSize(),
            programAddress: TOKEN_PROGRAM_ADDRESS,
        }),
        getInitializeMint2Instruction({ mint: mint.address, decimals: 6, mintAuthority: user.address }),
        getCreateAssociatedTokenIdempotentInstruction({
            payer,
            ata: userTokenAccount,
            owner: user.address,
            mint: mint.address,
        }),
        getMintToInstruction({
            mint: mint.address,
            token: userTokenAccount,
            mintAuthority: user,
            amount: 1_000_000_000n, // 1,000 tokens with 6 decimals
        }),
    ]);
    console.log(`Test token ${mint.address} created: ${explorerTx(signature)}\n`);
    writeState("test-mint.txt", mint.address);
    return mint.address;
}
