import { test } from "node:test";
import assert from "node:assert/strict";
import {
  address,
  generateKeyPair,
  getAddressFromPublicKey,
  getBase58Decoder,
  getBase58Encoder,
  signBytes,
  verifySignature,
  type SignatureBytes,
} from "@solana/kit";
import {
  attestationMessage,
  checkSignInMessage,
  signAttestation,
  signInMessage,
  verifyWalletSignature,
} from "./attest";

const WALLET = address("D2ehKLUQApN8ZxcANjwuTJC7bk7BMJn2voofXy17tCrs");
const SGT = address("5mXbkqKz883aufhAsx3p5Z1NcvD2ppZbdTTznM6oUKLj");
const EXPIRES = 1_800_000_123n;
const b58 = getBase58Encoder();

test("message bytes are exactly domain || wallet || identity || tier || expires_at i64 LE", () => {
  for (const tier of [0, 1] as const) {
    const msg = attestationMessage(WALLET, SGT, tier, EXPIRES);
    const expected = Buffer.concat([
      Buffer.from("headcount:v2", "utf8"),
      Buffer.from(b58.encode(WALLET)),
      Buffer.from(b58.encode(SGT)),
      Buffer.from([tier]),
      Buffer.from(new BigInt64Array([EXPIRES]).buffer),
    ]);
    assert.equal(msg.length, 12 + 32 + 32 + 1 + 8);
    assert.deepEqual(Buffer.from(msg), expected);
    assert.equal(Buffer.from(msg)[76], tier);
    assert.equal(Buffer.from(msg).readBigInt64LE(77), EXPIRES);
  }
});

test("signature verifies over the message and fails when any byte is tampered", async () => {
  const kp = await generateKeyPair();
  const sigB58 = await signAttestation(kp, WALLET, SGT, 1, EXPIRES);
  const sig = b58.encode(sigB58) as SignatureBytes;
  const msg = attestationMessage(WALLET, SGT, 1, EXPIRES);
  assert.equal(await verifySignature(kp.publicKey, sig, msg), true);

  const otherWallet = address(await getAddressFromPublicKey((await generateKeyPair()).publicKey));
  for (const tampered of [
    attestationMessage(otherWallet, SGT, 1, EXPIRES),
    attestationMessage(WALLET, otherWallet, 1, EXPIRES),
    attestationMessage(WALLET, SGT, 0, EXPIRES),
    attestationMessage(WALLET, SGT, 1, EXPIRES + 1n),
    Uint8Array.from(msg, (b, i) => (i === 0 ? b ^ 1 : b)),
  ]) {
    assert.equal(await verifySignature(kp.publicKey, sig, tampered), false);
  }
  const otherKey = await generateKeyPair();
  assert.equal(await verifySignature(otherKey.publicKey, sig, msg), false);
  assert.ok(getBase58Decoder().decode(sig).length > 0);
});

test("wallet sign-in message: signature, freshness, wallet binding", async () => {
  const kp = await generateKeyPair();
  const wallet = await getAddressFromPublicKey(kp.publicKey);
  const now = 1_800_000_000;
  const message = signInMessage(wallet, now);
  const sig = getBase58Decoder().decode(await signBytes(kp.privateKey, new TextEncoder().encode(message)));

  assert.equal(await verifyWalletSignature(wallet, message, sig), true);
  assert.equal(await verifyWalletSignature(wallet, message + " ", sig), false);
  assert.equal(checkSignInMessage(message, wallet, now + 299), null);
  assert.equal(checkSignInMessage(message, wallet, now + 301), "message_expired");
  assert.equal(checkSignInMessage(message, WALLET, now), "wallet_mismatch");
  assert.equal(checkSignInMessage(message + "\nextra", wallet, now), "malformed_message");
});
