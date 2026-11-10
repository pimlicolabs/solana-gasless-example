// The helper from the Pimlico docs: builds a transaction message with the
// Pimlico fee payer as the fee payer and its signature slot left empty.
import type { KoraClient } from "@solana/kora";
import {
    type Instruction,
    address,
    appendTransactionMessageInstructions,
    blockhash,
    createNoopSigner,
    createTransactionMessage,
    pipe,
    setTransactionMessageFeePayerSigner,
    setTransactionMessageLifetimeUsingBlockhash,
} from "@solana/kit";

export async function createSponsoredTransactionMessage(
    kora: KoraClient,
    instructions: Instruction[],
) {
    const { signer_address } = await kora.getPayerSigner();
    const { blockhash: latestBlockhash } = await kora.getBlockhash();

    // pipe passes the message through each step below, in order
    return pipe(
        // Start an empty version 0 transaction message
        createTransactionMessage({ version: 0 }),
        // The paymaster pays the fee. It signs later, so a noop signer leaves its signature slot empty.
        (m) => setTransactionMessageFeePayerSigner(createNoopSigner(address(signer_address)), m),
        // The blockhash keeps the transaction valid for about a minute. lastValidBlockHeight is only
        // read by @solana/kit's own send-and-confirm, and the paymaster sends the transaction for you.
        (m) =>
            setTransactionMessageLifetimeUsingBlockhash(
                { blockhash: blockhash(latestBlockhash), lastValidBlockHeight: 0n },
                m,
            ),
        // Add your app's instructions (transfers, swaps, etc.)
        (m) => appendTransactionMessageInstructions(instructions, m),
    );
}
