import { test } from "node:test";
import assert from "node:assert/strict";
import { isSgtMint, SGT_GROUP, TOKEN_2022 } from "./sgt";

const MINT = "5mXbkqKz883aufhAsx3p5Z1NcvD2ppZbdTTznM6oUKLj";
const AUTHORITY = "D2ehKLUQApN8ZxcANjwuTJC7bk7BMJn2voofXy17tCrs";

function mintAccount(info: Record<string, unknown>, owner: string = TOKEN_2022) {
  return { owner, data: { parsed: { type: "mint", info } } };
}

function member(group = SGT_GROUP, authority = AUTHORITY, pointerAuthority = AUTHORITY) {
  return mintAccount({
    mintAuthority: authority,
    extensions: [
      { extension: "tokenGroupMember", state: { group, mint: MINT, memberNumber: 1 } },
      { extension: "metadataPointer", state: { authority: pointerAuthority, metadataAddress: MINT } },
    ],
  });
}

function rpcWith(mint: unknown, group: unknown = mintAccount({
  extensions: [{ extension: "tokenGroup", state: { updateAuthority: AUTHORITY } }],
})) {
  const calls: string[] = [];
  const rpc = {
    getAccountInfo(key: string) {
      calls.push(key);
      return { send: async () => ({ value: key === SGT_GROUP ? group : mint }) };
    },
  } as unknown as Parameters<typeof isSgtMint>[0];
  return { rpc, calls };
}

test("SGT lookup accepts an authoritative member and reads the fixed group", async () => {
  const { rpc, calls } = rpcWith(member());
  assert.equal(await isSgtMint(rpc, MINT), true);
  assert.deepEqual(calls, [MINT, SGT_GROUP]);
});

test("SGT lookup rejects absent mints, foreign owners, pointer-only claims and another group", async () => {
  for (const fixture of [
    null,
    { ...member(), owner: "11111111111111111111111111111111" },
    mintAccount({ mintAuthority: AUTHORITY, extensions: [
      { extension: "groupMemberPointer", state: { memberAddress: SGT_GROUP } },
    ] }),
    member(MINT),
  ]) {
    const { rpc } = rpcWith(fixture);
    assert.equal(await isSgtMint(rpc, MINT), false);
  }
});

test("SGT lookup rejects authority mismatches and missing authoritative group", async () => {
  for (const { rpc } of [
    rpcWith(member(SGT_GROUP, MINT)),
    rpcWith(member(SGT_GROUP, AUTHORITY, MINT)),
    rpcWith(member(), null),
    rpcWith(member(), mintAccount({ extensions: [] })),
  ]) {
    assert.equal(await isSgtMint(rpc, MINT), false);
  }
});
