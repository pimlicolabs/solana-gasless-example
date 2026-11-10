// Gas Sponsorships: Pimlico pays the SOL fee, and it is charged to your Pimlico
// balance (free on devnet). The user holds no SOL.
import { explorerTx, loadRecipient, loadUser, solBalance, tokenBalance } from "./config.ts";
import { ata, ensureTestToken, signAndSend, transferInstructions } from "./transfer.ts";

const user = await loadUser();
const recipient = await loadRecipient();
console.log(`User:      ${user.address}`);
console.log(`User SOL:  ${await solBalance(user.address)}`);

const mint = await ensureTestToken(user);
const source = await ata(user.address, mint);
const destination = await ata(recipient, mint);
console.log(`Token:     ${mint}`);
console.log(`User token balance before: ${await tokenBalance(source)}`);

console.log(`\nSending 1 token to ${recipient}...`);
const signature = await signAndSend(
    await transferInstructions(user, recipient, mint, 1_000_000n), // 1 token
);

console.log(`Signature: ${signature}`);
console.log(`Explorer:  ${explorerTx(signature)}`);
console.log(`\nUser token balance after:  ${await tokenBalance(source)}`);
console.log(`Recipient token balance:   ${await tokenBalance(destination)}`);
console.log(`User SOL after:            ${await solBalance(user.address)}`);
