# FallID

**Sovereign identity spine. Your own DID, in your browser.**

Part of the AI-Native Solutions estate.

Live: [sjgant80-hub.github.io/fallid](https://sjgant80-hub.github.io/fallid/)

---

## What is a DID?

A DID (Decentralized Identifier) is a string that identifies *you* without needing a company to vouch for it. No Google login. No Facebook. No password reset emails. No third-party OAuth dance.

It looks like this:

```
did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK
```

That string is a fingerprint of your public key. The matching private key lives on your device. When you sign something, anyone can verify it came from you by checking against the DID.

That's it. That's the whole idea.

## Why does it matter?

Tim Berners-Lee — the person who invented the web — has spent the last decade saying the same thing: **the web was supposed to be decentralized, and we let it get captured by five companies.** When you "sign in with Google," you're renting your identity from Google. If Google decides you're a bot, or bans your account, or their servers go down, or they change their terms — your identity across the web breaks.

Sovereign identity flips this. Your keypair *is* you. It lives in your browser (or your phone, or on paper). No company can revoke it. No server can go down and take you with it. You don't ask permission to exist online.

## How does FallID work?

1. **Open the page.** On first visit, your browser generates an Ed25519 keypair using the Web Crypto API (native, audited, fast).
2. **The keypair is saved in IndexedDB.** It never leaves your device. There is no server, no account, no signup.
3. **Your DID is derived from your public key** using the `did:key` method — a multibase-encoded string with a multicodec prefix telling verifiers "this is Ed25519."
4. **You can now sign things.** The private key signs a message. Anyone with your DID can verify the signature.
5. **Every estate tool imports FallID.** FallMirror, FallSignature, FallBrief, the whole estate — they all ask FallID "who is this?" and get the same DID back. Universal cross-tool sign-on, no OAuth, no server.

## Ed25519, briefly

Ed25519 is an elliptic-curve signature scheme. It's fast, small (32-byte public keys, 64-byte signatures), and safe against everything short of quantum computers. It's what SSH, Signal, and modern GPG use. Web Crypto exposes it natively in every modern browser as of 2025-26.

## did:key format

A did:key with an Ed25519 public key is built like this:

```
did:key: + z + base58btc( [0xed, 0x01] ++ pubkey_32_bytes )
```

- `0xed 0x01` is the multicodec varint for Ed25519 public keys
- `z` is the multibase prefix for base58btc
- Total: about a 55-character string that fully self-describes the key type and value

Any DID resolver in the world can parse this. No registry needed. No lookup. The DID *is* the key.

## Using FallID in another tool

```js
import * as FallID from 'https://sjgant80-hub.github.io/fallid/fallid.js';

const { did } = await FallID.getOrCreate();
console.log('You are:', did);

const sig = await FallID.sign('hello world');
const ok = await FallID.verify('hello world', sig, did);
```

That's the entire API a downstream tool needs. Everything else — the QR view, the backup vault, the reset flow — lives in this repo's `index.html` for humans.

## API reference

```js
FallID.getOrCreate()      // → { did, pubkey, privkey, pubkeyBytes, created }
FallID.getDID()           // → 'did:key:z...'
FallID.sign(bytesOrStr)   // → Uint8Array signature
FallID.verify(bytes, sig, did)  // → boolean
FallID.didToPubkey(did)   // → Uint8Array (32 bytes)
FallID.pubkeyToDID(bytes) // → 'did:key:z...'
FallID.exportBackup(passphrase)  // → { v, kind, salt, iv, ct, ts }
FallID.importBackup(blob, passphrase)  // → { did, ... }
FallID.resetIdentity()    // wipes + generates new
FallID.checkEd25519Support()  // → boolean
```

## Backup

Your identity is your keypair. Lose the keypair, lose the identity. FallID lets you export an AES-GCM encrypted blob (PBKDF2, 250k iterations, SHA-256). Keep it somewhere safe — a password manager, a USB stick, a folded piece of paper. Import it on any device to restore.

## What FallID is not

- Not a wallet. It doesn't hold money. It holds identity. (Though you *could* build a wallet on top of it.)
- Not a login system for someone else's app. FallID is *your* identity — apps that want to accept it need to verify signatures themselves.
- Not blockchain. There is no chain, no gas, no mint. Just math and IndexedDB.
- Not KYC. Nobody knows who you are. That's the point.

## Browser support

Requires native Ed25519 in Web Crypto. Verified working: Chrome 137+, Safari 17+, Firefox 130+. Older browsers show a graceful message.

## License

MIT. Fork it, embed it, wrap it, break it, improve it. If you ship an estate tool, this is the identity layer to import.

---

&#9674; AI-Native Solutions &middot; 2026
