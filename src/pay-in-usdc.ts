// SPL Token Sponsorships: Pimlico pays the SOL fee, and the user repays it in
// USDC with a transfer in the same transaction. Nothing is charged to your
// Pimlico balance. The user holds no SOL.
import { DEVNET_USDC, explorerTx, kora, loadRecipient, loadUser, solBalance, tokenBalance } from "./config.ts";
import { ata, signAndSend, transferInstructions } from "./transfer.ts";
import {
    getBase64EncodedWireTransaction,
    partiallySignTransactionMessageWithSigners,
} from "@solana/kit";
import { createSponsoredTransactionMessage } from "./sponsored-transaction.ts";

const user = await loadUser();
const recipient = await loadRecipient();

// Check the paymaster accepts devnet USDC as fee payment.
const { tokens } = await kora.getSupportedTokens();
console.log(`Supported fee tokens: ${tokens.join(", ")}`);
if (!tokens.includes(DEVNET_USDC)) {
    console.error(`Devnet USDC (${DEVNET_USDC}) is not a supported fee token.`);
    process.exit(1);
}

const source = await ata(user.address, DEVNET_USDC);
const destination = await ata(recipient, DEVNET_USDC);
const before = await tokenBalance(source);
console.log(`User:      ${user.address}`);
console.log(`User SOL:  ${await solBalance(user.address)}`);
console.log(`User USDC before: ${before}`);
if (!(Number(before) > 0)) {
    console.error(
        `\nThe user has no devnet USDC. Get some at https://faucet.circle.com` +
            ` (Network: Solana Devnet) for ${user.address}, then run this again.`,
    );
    process.exit(1);
}

// Send 0.1 USDC to the recipient.
const instructions = await transferInstructions(user, recipient, DEVNET_USDC, 100_000n);

// 1. Quote the fee: build the transaction without the payment, and ask the
//    paymaster for a USDC transfer that covers it.
const quoteMessage = await createSponsoredTransactionMessage(kora, instructions);
const { payment_instruction, payment_amount } = await kora.getPaymentInstruction({
    transaction: getBase64EncodedWireTransaction(
        await partiallySignTransactionMessageWithSigners(quoteMessage),
    ),
    fee_token: DEVNET_USDC,
    source_wallet: user,
});
console.log(`\nFee: ${Number(payment_amount) / 1e6} USDC`);

// 2. Append the payment and send. The helper fetches a fresh blockhash.
console.log(`Sending 0.1 USDC to ${recipient}, paying the fee in USDC...`);
const signature = await signAndSend([...instructions, payment_instruction]);

console.log(`Signature: ${signature}`);
console.log(`Explorer:  ${explorerTx(signature)}`);
console.log(`\nUser USDC after:      ${await tokenBalance(source)}`);
console.log(`Recipient USDC:       ${await tokenBalance(destination)}`);
console.log(`User SOL after:       ${await solBalance(user.address)}`);
