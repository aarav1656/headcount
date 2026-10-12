// Real mainnet reads only. Finds a current holder of a known SGT mint via
// getProgramAccounts (Token-2022, memcmp mint at offset 0), then runs the same
// lookup the /api/attest endpoint uses on that holder and on a fresh random wallet.
import { address, createSolanaRpc, generateKeyPairSigner, getAddressFromPublicKey } from "@solana/kit";
import { DEFAULT_RPC, TOKEN_2022, lookupSgt } from "../lib/sgt";

// Example SGT mint from docs.solanamobile.com/marketing/engaging-seeker-users
const KNOWN_SGT_MINT = process.env.SGT_MINT ?? "5mXbkqKz883aufhAsx3p5Z1NcvD2ppZbdTTznM6oUKLj";
const RPC = process.env.MAINNET_RPC_URL || DEFAULT_RPC;

async function findHolder(): Promise<string> {
  const rpc = createSolanaRpc(RPC);
  for (let i = 0; i < 6; i++) {
    try {
      const accts = (await rpc
        .getProgramAccounts(TOKEN_2022, {
          encoding: "jsonParsed",
          filters: [{ memcmp: { offset: 0n, bytes: KNOWN_SGT_MINT as any, encoding: "base58" } }],
        })
        .send()) as unknown as { pubkey: string; account: { data: { parsed: { info: any } } } }[];
      const holder = accts.find((a) => a.account.data.parsed.info.tokenAmount.amount === "1");
      if (!holder) throw new Error(`no holder with amount 1 among ${accts.length} accounts`);
      console.log(`holder token account ${holder.pubkey} (mint ${KNOWN_SGT_MINT})`);
      return holder.account.data.parsed.info.owner;
    } catch (e) {
      if (i === 5) throw e;
      await new Promise((r) => setTimeout(r, 1000 * 2 ** i));
    }
  }
  throw new Error("unreachable");
}

async function main() {
  console.log(`rpc ${RPC}`);
  const holder = await findHolder();
  const random = await getAddressFromPublicKey((await generateKeyPairSigner()).keyPair.publicKey);
  for (const [label, wallet] of [["SGT holder", holder], ["random wallet", random]] as const) {
    console.log(`${label} ${wallet}`);
    console.log(JSON.stringify(await lookupSgt(address(wallet), RPC), null, 2));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
