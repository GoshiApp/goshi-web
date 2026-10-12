# Test the on-chain games end to end on devnet (local)

Everything runs on your machine against Solana **devnet**. Test tokens only, no real money. The games stay OFF in every normal
build: this uses `PUBLIC_PLAY_LOCAL=1`, which only the `dev:play` script sets.

## 1. Start the game server (terminal 1)

```
cd ~/goshi-escrow/server
npm install
npm run dev
```

It listens on `ws://localhost:8787`. Check it: `curl http://localhost:8787/health` should answer `{"ok":true,"cluster":"devnet",...,"devBots":true}`.
The faucet and the "Fill with test bots" button need the server in dev test mode (`DEV_BOTS=1`, see the server README and its `.env`).

## 2. Start the website in play mode (terminal 2)

```
cd ~/goshi-web
npm run play:local-config   # copies the devnet addresses from ~/goshi-escrow/devnet-config.json into a gitignored file
npm run dev:play            # PUBLIC_PLAY_LOCAL=1 astro dev, http://localhost:4321
```

Open http://localhost:4321/en/play/ (or `/es/jugar/`). You should see the orange "Test environment" banner.
If the page says it is "not set up yet", run `npm run play:local-config` again and restart `dev:play`.

## 3. Wallet

1. Install Phantom. In Phantom: Settings > Developer Settings > Testnet Mode > turn it on and choose **Solana Devnet**.
2. Get devnet SOL for the network fees: https://faucet.solana.com (choose devnet, paste your address), or
   `solana airdrop 2 <your address> --url devnet`.
3. On the page, tick the confirmation box and press **Connect Phantom**. Phantom asks you to sign a login message for the game
   server: it is free and sends no transaction. The "Game server" line should say it is connected.

## 4. Play

1. **Test funds:** press **Get test SOL and tokens**: the server sends 1 devnet SOL and enough test $GOSHI to hold the saboteur minimum (once every 10 minutes). Your balances appear under "Your wallet".
2. **Create a room:** pick one of the entry fees the server offers (they come from its `feePresets`, in SOL) and press **Create room**. A room has 10 paid seats and 3 saboteur seats. The server opens it on the network (a few seconds). The room list refreshes by itself.
3. **Take a seat first:** press **Join** (paid seat, the entry fee in SOL) or **Join as saboteur** (free, needs the minimum $GOSHI) on the room, check the amounts in the confirmation, **Confirm in my wallet** and approve in Phantom. When the transaction is confirmed the page enters the room on the server automatically ("Open game" does the same later, for example after a reload).
4. **Then fill with bots:** press **Fill with test bots** on the room. The server's own funded test wallets take the free paid and saboteur seats. Do it after you joined, otherwise the bots take every seat. The room list refreshes a few times by itself.
5. **Match:** when the room is full the match starts after a short countdown. Steer with the mouse or your finger, or W A S D / arrow keys. Space or the Boost button speeds you up. A match is 5 minonds.
6. **Payout:** at the end the result shows the ranking, the winners, the split of the pot and a link to the `finalize_match` transaction on Solana Explorer (devnet). If it says the payout could not be sent yet, the server retries; see the server docs (`npm run finalize -- <roomId>`).

## Free practice (no wallet)

The card at the top of the play page starts a practice match: the browser opens a socket to `site.play.serverUrl`,
sends `{ "t": "practice", "name": "..." }` before any login and plays 12 bots (see "Free practice" in the server's
`PROTOCOL.md`). There is no wallet, no chain call and no gate. To watch it end quickly, start the server with
`PRACTICE_MS=60000 PRACTICE_SHRINK_MS=15000` (the five zone phases then take about 9 seconds each) and allow the site origin with `ALLOWED_ORIGINS=http://localhost:4321`.
The home page sends people to `/en/play/?play=1`, which starts a practice match at once.

## Testing on a phone

Safari and Chrome on a phone have no wallet extension. On a phone the page shows **Open in Phantom** and **Open in Solflare**: they open
this same page inside the wallet's own browser (Phantom: `https://phantom.app/ul/browse/<page>?ref=<origin>`, Solflare:
`https://solflare.com/ul/v1/browse/<page>?ref=<origin>`), where the normal connect flow works. The buttons disappear inside a wallet's
browser and on a computer.

To try it you need a **public https address** of the page (a deployed preview, or a tunnel to your `dev:play` server). A `localhost`
address is not reachable from the phone's wallet. Set the wallet to devnet first (Settings > Developer Settings > Testnet Mode).
Also: the game server must be reachable from the phone over `wss://`, and its address must be in the CSP of that page.

## Mainnet

`dev:play` and the faucet are devnet only. On mainnet the faucet and bots are not rendered and the wording changes. See `the maintainers`.

## What is checked automatically (and what is not)

`npm run verify` checks the protocol helpers, the snapshot smoothing, the reconnect logic (with a fake socket), the mobile link builders and detection, the network wording markers and the page copy. It does not
use a real wallet or a running server. Phantom signing, the real transactions and the real game server are only exercised by this walkthrough.

## Troubleshooting

- *"settings do not match the contract"*: the program on devnet was redeployed or re-initialized. Run `npm run play:local-config` again.
- *"The game server is on a different network or contract"*: the server and the web read different programs or mints. Both must use `~/goshi-escrow/devnet-config.json`.
- *No wallet popup*: Phantom must be set to Devnet and unlocked. Reconnect the wallet to retry the login.
- *Nothing happens on Join*: you need devnet SOL for the fee and test tokens for the entry fee.
