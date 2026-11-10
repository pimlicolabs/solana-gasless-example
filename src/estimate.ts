// Prints what a transaction would cost the paymaster, in lamports and in each
// supported fee token, without sending it. estimateTransactionFee simulates the
// transaction. The estimate is advisory: prices are checked again on send.
import {
    getBase64EncodedWireTransaction,
    partiallySignTransactionMessageWithSigners,
} from "@solana/kit";
import { address } from "@solana/kit";
import { kora, loadRecipient, loadUser, rpc } from "./config.ts";
import { createSponsoredTransactionMessage } from "./sponsored-transaction.ts";
import { ensureTestToken, transferInstructions } from "./transfer.ts";

const user = await loadUser();
const recipient = await loadRecipient();
const mint = await ensureTestToken(user);

// The same transfer `pnpm sponsored` sends: 1 test token to the recipient.
const message = await createSponsoredTransactionMessage(
    kora,
    await transferInstructions(user, recipient, mint, 1_000_000n),
);
const transaction = getBase64EncodedWireTransaction(
    await partiallySignTransactionMessageWithSigners(message),
);

const { signer_address } = await kora.getPayerSigner();
const { tokens } = await kora.getSupportedTokens();
console.log(`Fee payer: ${signer_address}`);
console.log(`Transaction: transfer 1 test token (${mint}) to ${recipient}\n`);

for (const token of tokens) {
    const estimate = await kora.estimateTransactionFee({ transaction, fee_token: token });
    console.log(`Fee token ${token}:`);
    console.log(`  fee_in_lamports: ${estimate.fee_in_lamports} (${estimate.fee_in_lamports / 1e9} SOL)`);
    const { value: supply } = await rpc.getTokenSupply(address(token)).send();
    const inToken = estimate.fee_in_token / 10 ** supply.decimals;
    console.log(`  fee_in_token:    ${estimate.fee_in_token} raw units (${inToken} with ${supply.decimals} decimals)`);
    console.log(`  payment_address: ${estimate.payment_address}`);
}
