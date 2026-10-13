import type { Page } from "../types";

export const privacy: Page = {
  title: "Privacy policy",
  description: "A draft privacy policy for Goshi: what the website, the wallet connection and the game server handle, what is public on the blockchain, and the rights you have. Draft for legal review.",
  eyebrow: "Legal",
  h1: "Privacy policy (draft)",
  lead: "This is a draft for legal review. It describes in plain words what Goshi handles. It is not final and not yet reviewed by a lawyer.",
  meta: "Draft. Last updated: 9 October 2026",
  blocks: [
    {
      t: "notice",
      tone: "risk",
      title: "Draft for the lawyer",
      paras: ["This policy was reviewed with the project's legal advisor on 2026-10-12 and describes the soft launch. It may change before and after the mainnet launch: check the date. Items still marked TODO(owner) are decisions that are not final yet."],
    },
    {
      t: "legal",
      tocTitle: "On this page",
      sections: [
        {
          id: "who",
          h: "1. Who we are and what this covers",
          paras: [
            "This policy covers the website goshi.app, the play page and the game server it connects to, run by the Goshi project (\"Goshi\", \"we\", \"us\"). For privacy questions write to {privacyEmail}.",
            "Questions or requests: {privacyEmail}.",
          ],
        },
        {
          id: "short",
          h: "2. In short",
          list: [
            "The website sets no cookies and uses no analytics or trackers.",
            "If you connect a wallet, we see your public wallet address and what you do in the games. We never see your keys or seed phrase.",
            "Anything written to a blockchain is public and permanent. We cannot delete it.",
            "The games are for people aged 18 or over (or the age of majority where you live).",
          ],
        },
        {
          id: "website",
          h: "3. The website",
          paras: [
            "The pages load only files from goshi.app. Your choice of dark or light theme, and the name of the last wallet you connected (for example \"phantom\", never an address or a key), are stored in your browser and never sent anywhere. To count visitors, your browser keeps a random identifier that is not tied to you and sends it to the game server once per tab. The server turns it into a salted fingerprint that changes at every restart, keeps it only in memory for the day so you are not counted twice, and adds one to a total. It does not store the identifier or any network address and does not follow you between days. Each distinct wallet that connects is also counted once (a wallet address is public data). To keep your browser from being counted, clear this site's data. No cookies. The host that serves the site may keep standard server logs, such as the time of a request and a shortened network address, to keep the service running and secure. The site is served by Firebase Hosting (Google). Google keeps those logs under its own policy.",
            "The play page makes requests from your browser to a Solana network node (an RPC provider) and to the game server. The node provider can see your network address and the wallet address that you query. On the test network this is the public Solana devnet node. On mainnet it is a paid provider (QuickNode); its own policy applies.",
          ],
        },
        {
          id: "wallet",
          h: "4. Your wallet and the blockchain",
          paras: [
            "When you connect a wallet, the page learns your public address. You approve every payment in your wallet. Taking a paid seat, receiving a prize and swapping tokens are transactions on the Solana blockchain, which is public: anyone can see the addresses, amounts and times, and they cannot be erased.",
            "To log in to the game server your wallet signs a short message. It costs nothing and moves no funds. We use it only to know which address is connected.",
          ],
        },
        {
          id: "server",
          h: "5. The game server",
          list: [
            "Your wallet address and a short display name derived from it.",
            "Your steering inputs and the results of matches you take part in, including the ranking.",
            "Technical data needed to run the service, such as connection times and errors.",
          ],
          paras: ["Match records (the participants' wallet addresses, the ranking, the closing transaction and the hashes of the moves) are kept indefinitely as a public record that anyone can verify. The site and the game server are hosted on Google Cloud in the United States. Visitor counting keeps nothing beyond the day."],
        },
        {
          id: "use",
          h: "6. What we use it for",
          list: [
            "To run matches, pay winners and settle or cancel rooms.",
            "To keep the service secure and fair, for example to detect abuse, bots or several accounts used to cheat.",
            "To answer your messages and meet legal duties.",
          ],
          paras: ["We do not sell personal data and we do not use it for advertising."],
        },
        {
          id: "sharing",
          h: "7. Who else sees it",
          paras: [
            "Service providers that run the site, the game server and the network node. Wallet software you choose, which has its own policy. The Solana Explorer, if you follow a link to it. Authorities, when the law requires it. The processors are Google Cloud (hosting of the site and the game server, United States) and a Solana RPC provider (QuickNode on mainnet).",
          ],
        },
        {
          id: "rights",
          h: "8. Your rights",
          paras: [
            "Depending on where you live, you may have the right to access, correct, delete, restrict or move your data and to object to some uses. Write to {privacyEmail}. Data written to a blockchain cannot be deleted by us. TODO(owner): the legal bases, regional rights (for example the EU and the UK, and US states) and the complaint authority.",
          ],
        },
        {
          id: "children",
          h: "9. Adults only",
          paras: ["Goshi is not for children. If you believe a minor has used it, write to us and we will act."],
        },
        {
          id: "security",
          h: "10. Security",
          paras: ["We use reasonable measures to protect the service. No system is perfectly secure. To report a security problem, see the [security page](@security)."],
        },
        {
          id: "changes",
          h: "11. Changes",
          paras: ["We will update this page when things change and change its date; for a material change we will also post a notice on the site."],
        },
      ],
    },
  ],
};

export const terms: Page = {
  title: "Terms of use",
  description: "Draft terms of use for Goshi: eligibility, [[t:the test environment]][[m:real funds]], how rooms and payments work, prohibited conduct, risks and responsibilities. Draft for legal review.",
  eyebrow: "Legal",
  h1: "Terms of use (draft)",
  lead: "This is a draft for legal review. It describes how you may use Goshi. It is not final and not yet reviewed by a lawyer.",
  meta: "Draft. Last updated: 9 October 2026",
  blocks: [
    {
      t: "notice",
      tone: "risk",
      title: "Draft for the lawyer",
      paras: ["These terms were reviewed with the project's legal advisor on 2026-10-12 and describe the soft launch. They may change before and after the mainnet launch: check the date. Items still marked TODO(owner) are decisions that are not final yet."],
    },
    {
      t: "legal",
      tocTitle: "On this page",
      sections: [
        {
          id: "accept",
          h: "1. Using Goshi",
          paras: ["By using the website or the games you agree to these terms. If you do not agree, do not use them. The service is operated by Goshi Labs."],
        },
        {
          id: "eligibility",
          h: "2. Who may use it",
          list: [
            "You must be at least 18, or the age of majority where you live.",
            "By connecting your wallet and taking part, you confirm on your own responsibility that you are of legal age (18+) and that accessing blockchain games does not break the laws or regulations that apply in your jurisdiction of residence. Goshi does not block countries: following local law is your responsibility.",
            "You are responsible for knowing whether the law where you live allows games with entry fees and prizes. The service is not offered to persons or places under sanctions (for example the OFAC lists), and you confirm you are not one of them.",
            "There is no identity verification in the soft launch phase, which uses small entry amounts. Tax and compliance duties on any prize are yours.",
          ],
        },
        {
          id: "test",
          h: "3. [[t:The test environment]][[m:Real funds]]",
          paras: [
            "[[t:Today the games run on a Solana test network with test tokens that have no value. The test network can be reset or stopped at any time and nothing on it has any monetary value. Features can change or disappear.]][[m:The games run on Solana mainnet with real funds. You can lose your entry fee. Network fees, network outages and software errors can affect your transactions, and transactions cannot be undone. Features can change or disappear.]]",
          ],
        },
        {
          id: "rooms",
          h: "4. Rooms, entry fees and prizes",
          list: [
            "A room has an entry fee in SOL, up to 10 paid seats and up to 3 free saboteur seats. By taking a paid seat you send the fee from your wallet to the contract. A saboteur seat is free and needs a minimum $GOSHI balance, which is not taken from your wallet.",
            "When the match ends the contract splits the pot: 88% of the pot to the three best ranked PAID players (60%, 25% and 15%), 2% shared equally by the seated saboteurs, and a house share of 10%, split 10% buy-back and burn, 15% infrastructure, 25% liquidity and community and 50% to the super pot, as described on [How it works](@how). Saboteurs do not compete and cannot win. A paid seat may also be a free pass seat: when a room of a lower tier finishes, its top three paid players may be offered the last seat of a higher room that already has 9 paid players. That seat is covered by the higher room's own fee, so the platform forgoes its fee in that room and the room never owes more than it holds. A pass is offered only in that case, at most once per room, and you may decline it.",
            "The super pot accumulates in $GOSHI and is paid to a first place only on a jackpot event (1% chance after a full match of 10 paid players), drawn from the secret committed on chain and the block where the room filled, so it can be recomputed from the proof of the match. The payment is made by the team.",
            "If a room has 2 to 9 paid players after 5 minutes, the paid players may be offered a VS match. In VS mode there are no saboteurs, the 10% rake is taken from every entry, losers keep 80% of their net entry and the winner takes the rest. Every paid player must accept.",
            "Results are decided by the game server. Payouts on the blockchain are final and cannot be reversed.",
            "If a room cannot be played, the platform may cancel it and the contract refunds the entry fees.",
            "Prizes are not guaranteed. Most players in a room are not paid.",
          ],
        },
        {
          id: "saboteurs",
          h: "5. Saboteurs",
          paras: ["Saboteurs are free seats for wallets that hold the minimum $GOSHI. They are obstacles for the paid players. They never pay an entry fee, they cannot lose funds in a room, do not compete and cannot win, and they share 2% of the pot equally, paid in SOL. Taking a saboteur seat does not take any tokens from your wallet."],
        },
        {
          id: "conduct",
          h: "6. What you must not do",
          list: [
            "Cheat, use automated players, exploit bugs or take part with several wallets to gain an advantage.",
            "Cooperate with other players to fix a result.",
            "Attack the service, the contract or other users, or try to bypass limits.",
            "Use the service for unlawful activity, or for money laundering.",
            "Pretend to be Goshi or ask others for keys or seed phrases.",
          ],
          paras: ["We may exclude a wallet from the service. Contract transactions already made cannot be undone."],
        },
        {
          id: "wallets",
          h: "7. Wallets and keys",
          paras: ["You keep your own keys. We cannot recover them or reverse your transactions. You are responsible for your wallet, for network fees and for the accuracy of what you approve."],
        },
        {
          id: "token",
          h: "8. The token",
          paras: ["[[t:The token used in the test has no value. Nothing on this website offers, sells or distributes a token on mainnet.]][[m:The token is a real asset and can lose all of its value. Nothing on this website sells it or promises it any value.]] Nothing here is an invitation to invest. See the [token page](@token) and the [risks](@risks)."],
        },
        {
          id: "taxes",
          h: "9. Taxes",
          paras: ["You are responsible for any tax that applies to you, including on prizes."],
        },
        {
          id: "ip",
          h: "10. Code, licenses and the name",
          paras: ["The code (program, server and website) is open source under the Apache 2.0 license. The Goshi name and logo are not licensed for use as your own."],
        },
        {
          id: "disclaimer",
          h: "11. No warranty and limits of liability",
          paras: [
            "The service is provided as is[[t:, in testing,]] without warranty. The contract [[n:is unaudited and ]]may contain errors. We are not liable for losses from the use of the service, from network or wallet failures, or from decisions you take, to the extent the law allows. The sanctioned jurisdictions are those on the OFAC lists; other restrictions depend on where you live and are your responsibility.",
          ],
        },
        {
          id: "changes",
          h: "12. Changes and ending",
          paras: ["We may change these terms, the games and the service, or end them. We will update this page and its date. TODO(owner): notice period."],
        },
        {
          id: "law",
          h: "13. Governing law and disputes",
          paras: ["TODO(owner): the governing law, courts or arbitration, and consumer rights by region."],
        },
        {
          id: "contact",
          h: "14. Contact",
          paras: ["Questions about these terms: {supportEmail}."],
        },
      ],
    },
  ],
};
