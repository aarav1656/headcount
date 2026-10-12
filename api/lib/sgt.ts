import { address, createSolanaRpc, type Address } from "@solana/kit";

export const TOKEN_2022 = address("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb");
export const SGT_GROUP = "GT22s89nU4iWFkNXj1Bw6uYhJJWDRPpShHt4Bk8f99Te";
export const DEFAULT_RPC = "https://api.mainnet-beta.solana.com";

type Json = Record<string, any>;

export type SgtLookup = { found: true; sgtMint: Address; tokenAccount: string } | { found: false; reason: string };

async function retry<T>(fn: () => Promise<T>, tries = 6): Promise<T> {
  for (let i = 0; ; i++) {
    try {
      return await fn();
    } catch (e) {
      if (i >= tries - 1) throw e;
      await new Promise((r) => setTimeout(r, 600 * 2 ** i));
    }
  }
}

function ext(mintInfo: Json, name: string): Json | undefined {
  return (mintInfo.extensions as Json[] | undefined)?.find((x) => x.extension === name)?.state;
}

async function parsedMint(rpc: ReturnType<typeof createSolanaRpc>, mint: string): Promise<Json | null> {
  const res = await retry(() => rpc.getAccountInfo(address(mint), { encoding: "jsonParsed" }).send());
  const v = res.value as Json | null;
  if (!v || v.owner !== TOKEN_2022 || v.data?.parsed?.type !== "mint") return null;
  return v.data.parsed.info;
}

/** True when `mint` is a Token-2022 mint whose tokenGroupMember extension points at the SGT group. */
export async function isSgtMint(rpc: ReturnType<typeof createSolanaRpc>, mint: string): Promise<boolean> {
  const info = await parsedMint(rpc, mint);
  if (!info) return false;
  if (ext(info, "tokenGroupMember")?.group !== SGT_GROUP) return false;
  const group = await parsedMint(rpc, SGT_GROUP);
  const groupAuthority = group && ext(group, "tokenGroup")?.updateAuthority;
  if (!groupAuthority) return false;
  if (info.mintAuthority !== groupAuthority) return false;
  const pointer = ext(info, "metadataPointer");
  if (pointer && pointer.authority !== groupAuthority) return false;
  return true;
}

export async function lookupSgt(wallet: Address, rpcUrl = DEFAULT_RPC): Promise<SgtLookup> {
  const rpc = createSolanaRpc(rpcUrl);
  const res = await retry(() =>
    rpc.getTokenAccountsByOwner(wallet, { programId: TOKEN_2022 }, { encoding: "jsonParsed" }).send(),
  );
  const held = (res.value as unknown as { pubkey: string; account: Json }[])
    .map((a) => ({ pubkey: a.pubkey, info: a.account.data?.parsed?.info as Json | undefined }))
    .filter((a) => a.info && a.info.tokenAmount?.amount === "1" && a.info.state !== "uninitialized")
    .sort((a, b) => (a.info!.mint < b.info!.mint ? -1 : 1));
  if (held.length === 0) return { found: false, reason: "no Token-2022 account with amount 1" };
  for (const h of held) {
    if (await isSgtMint(rpc, h.info!.mint)) return { found: true, sgtMint: address(h.info!.mint), tokenAccount: h.pubkey };
  }
  return { found: false, reason: `${held.length} Token-2022 NFT(s) held, none is a member of the SGT group` };
}
