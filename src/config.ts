import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { getRandomValues } from "node:crypto";
import { KoraClient } from "@solana/kora";
import {
    type Address,
    type KeyPairSigner,
    address,
    createKeyPairSignerFromBytes,
    createKeyPairSignerFromPrivateKeyBytes,
    createSolanaRpc,
    generateKeyPairSigner,
} from "@solana/kit";

// These scripts run on devnet, where sponsorship is free. For mainnet, use
// https://solana.pimlico.io/v1/mainnet/rpc and mainnet mints.
export const CLUSTER = "devnet";
export const SOLANA_RPC_URL = process.env.SOLANA_RPC_URL ?? "https://api.devnet.solana.com";

// Circle's devnet USDC, the token Pimlico accepts as fee payment on devnet.
// Get some at https://faucet.circle.com (choose Solana Devnet).
export const DEVNET_USDC = address("4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU");

const apiKey = process.env.PIMLICO_API_KEY;
if (!apiKey) {
    console.error("Set PIMLICO_API_KEY in .env (create one at https://dashboard.pimlico.io).");
    process.exit(1);
}

// Pass the API key in the `apikey` query parameter. KoraClient's own `apiKey`
// option sends an x-api-key header, which Pimlico does not read.
export const kora = new KoraClient({
    rpcUrl: `https://solana.pimlico.io/v1/${CLUSTER}/rpc?apikey=${apiKey}`,
});

// A plain Solana RPC, used only to read balances. Nothing here sends through it.
export const rpc = createSolanaRpc(SOLANA_RPC_URL);

const KEYS_DIR = ".keys";

// Loads the user's keypair from .keys/user.json, or creates one on first run.
// The file holds a JSON byte array: 64 bytes (Solana CLI format) or a 32-byte seed.
export async function loadUser(): Promise<KeyPairSigner> {
    const path = `${KEYS_DIR}/user.json`;
    if (!existsSync(path)) {
        mkdirSync(KEYS_DIR, { recursive: true });
        writeFileSync(path, JSON.stringify(Array.from(getRandomValues(new Uint8Array(32)))));
        console.log(`Created a new user keypair in ${path}`);
    }
    const bytes = new Uint8Array(JSON.parse(readFileSync(path, "utf8")));
    return bytes.length === 64
        ? createKeyPairSignerFromBytes(bytes)
        : createKeyPairSignerFromPrivateKeyBytes(bytes);
}

export function readState(name: string): string | undefined {
    const path = `${KEYS_DIR}/${name}`;
    return existsSync(path) ? readFileSync(path, "utf8").trim() : undefined;
}

export function writeState(name: string, value: string) {
    mkdirSync(KEYS_DIR, { recursive: true });
    writeFileSync(`${KEYS_DIR}/${name}`, value);
}

export async function solBalance(owner: Address): Promise<number> {
    const { value } = await rpc.getBalance(owner).send();
    return Number(value) / 1e9;
}

export async function tokenBalance(tokenAccount: Address): Promise<string> {
    try {
        const { value } = await rpc.getTokenAccountBalance(tokenAccount).send();
        return value.uiAmountString;
    } catch {
        return "0 (no token account)";
    }
}

export function explorerTx(signature: string) {
    return `https://explorer.solana.com/tx/${signature}?cluster=${CLUSTER}`;
}

// The wallet that receives the tokens: RECIPIENT from .env, or a wallet created
// on first run and kept in .keys/recipient.txt, so its token account is only
// created once.
export async function loadRecipient(): Promise<Address> {
    if (process.env.RECIPIENT) return address(process.env.RECIPIENT);
    const saved = readState("recipient.txt");
    if (saved) return address(saved);
    const { address: created } = await generateKeyPairSigner();
    writeState("recipient.txt", created);
    return created;
}
