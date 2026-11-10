# Solana gasless transactions with a hosted Kora fee payer

This repo sends Solana transactions from a wallet that holds no SOL, using [Pimlico](https://docs.pimlico.io/guides/how-to/solana)'s hosted fee payer, which implements the [Kora](https://github.com/solana-foundation/kora) JSON-RPC API. It uses `@solana/kit` to build the transactions and `@solana/kora`'s `KoraClient` to send them, so the same code works against a self-hosted Kora node by changing one URL.

## Two ways to pay the fee

| Mode | Who pays the SOL fee | Who is charged | Script |
|---|---|---|---|
| Gas Sponsorships | Pimlico's fee payer | Your Pimlico balance (free on devnet) | `pnpm sponsored` |
| SPL Token Sponsorships | Pimlico's fee payer | The user, in USDC or USDT, with a transfer in the same transaction | `pnpm pay-in-usdc` |

In both modes the transaction's fee payer is Pimlico's address (from `getPayerSigner`). The user signs only for their own instructions, and Pimlico validates, simulates, signs as fee payer and broadcasts the transaction (`signAndSendTransaction`).

## What the scripts do

All scripts run on devnet.

- **`pnpm sponsored`**: sends 1 SPL token from the user to a recipient. Pimlico pays the fee and the rent of the recipient's new token account. On first run it also creates a test token, with the user as mint authority, and mints 1,000 to the user, in a sponsored transaction. The user's SOL balance is 0 before and after.
- **`pnpm pay-in-usdc`**: sends 0.1 devnet USDC to the recipient, and the user pays the fee in USDC. It checks `getSupportedTokens` for devnet USDC (`4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU`), gets a quote and the payment transfer with `getPaymentInstruction`, appends it, and sends.
- **`pnpm estimate`**: prints what the `pnpm sponsored` transfer would cost, in lamports and in each supported fee token, from `estimateTransactionFee`. Nothing is sent.

The user keypair, the recipient address and the test token address are saved in `.keys/` (git-ignored) on first run, and reused after.

## Setup

1. Create an API key at [dashboard.pimlico.io](https://dashboard.pimlico.io). See [Create an API key](https://docs.pimlico.io/guides/create-api-key). Devnet sponsorship is free.
2. Install and configure:

   ```sh
   git clone https://github.com/pimlicolabs/solana-gasless-example
   cd solana-gasless-example
   pnpm install
   cp .env.example .env   # then set PIMLICO_API_KEY
   ```

3. Run the sponsored transfer, then the estimate:

   ```sh
   pnpm sponsored
   pnpm estimate
   ```

4. To pay the fee in USDC, the user needs devnet USDC. `pnpm pay-in-usdc` prints the user's address if it has none. Send devnet USDC to it from [faucet.circle.com](https://faucet.circle.com) (network: Solana Devnet), then run:

   ```sh
   pnpm pay-in-usdc
   ```

   If the recipient has no USDC account yet, its rent is included in the fee, so the first payment is larger than later ones.

Requires Node.js 22 or later and pnpm.

## How it works

The endpoint is `https://solana.pimlico.io/v1/<mainnet|devnet>/rpc?apikey=<PIMLICO_API_KEY>`. Pass the key in the `apikey` query parameter: `KoraClient`'s `apiKey` option sends an `x-api-key` header, which Pimlico does not read.

```ts
import { KoraClient } from "@solana/kora";

const kora = new KoraClient({
    rpcUrl: `https://solana.pimlico.io/v1/devnet/rpc?apikey=${process.env.PIMLICO_API_KEY}`,
});
```

[`src/sponsored-transaction.ts`](src/sponsored-transaction.ts) builds a transaction message with Pimlico's fee payer as the fee payer and its signature slot left empty. The user signs with `partiallySignTransactionMessageWithSigners`, and `kora.signAndSendTransaction` returns the signature once the transaction is confirmed.

To have the user pay in a token, [`src/pay-in-usdc.ts`](src/pay-in-usdc.ts) builds the transaction once without the payment, calls `kora.getPaymentInstruction` to get a USDC transfer of the quoted fee to Pimlico, then builds it again with that transfer appended. If a transaction has no payment, the fee is charged to your Pimlico balance instead.

Rules the fee payer enforces:

- It may only be the fee payer, or the rent payer of an account the transaction creates (such as a token account). Any other use is rejected.
- It spends at most 0.1 SOL on one transaction, including the fee, priority fee and rent.
- Every other signer must sign before you submit.
- Supported fee tokens: USDC and USDT on mainnet, USDC on devnet. See [supported tokens](https://docs.pimlico.io/guides/how-to/solana/supported-tokens).

For mainnet, change `devnet` to `mainnet` in the URL in [`src/config.ts`](src/config.ts) and use mainnet mints. Sponsored fees on mainnet are charged to your Pimlico balance.

## Devnet runs

These transactions were sent by the scripts in this repo. In each, the fee payer is Pimlico's devnet fee payer `pimXbt2GBQQGvZyDrxcKjepQ4JWZ7maqhvrqKYm3uQC` and the user, `3jfnTDh1T9RcL9UwWDRGUKj4527qQaVJXKJQLRpLqYL8`, holds 0 SOL.

| Script | Transaction |
|---|---|
| `pnpm sponsored` (first run: create test token, mint 1,000 to the user) | [P6FAsk…Cu](https://explorer.solana.com/tx/P6FAskhhwrNYYSeeEwo731DhmvNADcj7qqQANgXxnFx8No6bALfokFgvqHaXNa1PPsU6cWGiWzHfkGL12SXo4Cu?cluster=devnet) |
| `pnpm sponsored` (send 1 token, create the recipient's token account) | [4tX7QE…LP](https://explorer.solana.com/tx/4tX7QEvpQiAwXN2cAtjN1ufSoPZEHKDgNBRrFcPwMDgbFdNmXndrdTEb2uFKGTZ7hhdaSMdD5vac6Eg4fLWiHDLP?cluster=devnet) |
| `pnpm sponsored` (send 1 token to an existing token account) | [QciTeW…xw](https://explorer.solana.com/tx/QciTeWTTi3nzrbnvqeEkKPuMgVk4Bu17f3gKtyLzFc4XsBswCnnhTQkBpEYEi4Rgz9UyZKfkG6GtH781bmUq2xw?cluster=devnet) |

No `pnpm pay-in-usdc` run is listed yet, because it needs devnet USDC from Circle's faucet.

## Self-hosting instead

Pimlico runs the fee payer, holds its key and pays the SOL. If you'd rather run your own, with your own validation rules in `kora.toml`, self-host Kora:

- [Kora docs on solana.com](https://solana.com/docs/tools/kora)
- [Kora Node Providers](https://solana.com/docs/tools/kora/providers), the list of hosted Kora providers
- [Kora on GitHub](https://github.com/solana-foundation/kora)

The scripts use only `getPayerSigner`, `getBlockhash`, `getSupportedTokens`, `estimateTransactionFee` and `signAndSendTransaction`, which both implement, so you can point them at your Kora node by changing `rpcUrl` in [`src/config.ts`](src/config.ts).

## Pimlico Solana guides

- [Solana Sponsorships overview](https://docs.pimlico.io/guides/how-to/solana)
- [How to set up a Kora fee payer without running a Kora node](https://docs.pimlico.io/guides/how-to/solana/kora-fee-payer)
- [Gas Sponsorships](https://docs.pimlico.io/guides/how-to/solana/verifying-sponsorship)
- [SPL Token Sponsorships](https://docs.pimlico.io/guides/how-to/solana/token-sponsorship)
- [Solana fee sponsorship: how to pay transaction fees for your users](https://docs.pimlico.io/guides/conceptual/solana-fee-sponsorship)
- [Solana Sponsorships endpoints](https://docs.pimlico.io/references/paymaster/solana/endpoints)

## License

[MIT](LICENSE)
