# @kanbantic/swarm-verified-fetch

> Verified-fetch primitive for Ethereum Swarm — BMT keccak256 integrity check.

Swarm gateways are public, untrusted infrastructure. Any client that downloads a payload by Swarm reference and then displays it without re-hashing is taking the gateway's word for it. This library closes that gap: it pulls bytes from a gateway, recomputes the BMT (Binary Merkle Tree) keccak256 root locally, compares it against the requested reference, and either returns verified bytes or throws a typed `IntegrityError`. Pure TypeScript, isomorphic (Node.js, browsers, Cloudflare Workers), and runtime-light — only `@noble/hashes` for the keccak256 primitive.

## Install

```sh
pnpm add @kanbantic/swarm-verified-fetch
# or: npm i / yarn add / bun add
```

## Usage

```ts
import { verifiedFetch, IntegrityError } from "@kanbantic/swarm-verified-fetch";

try {
  const bytes = await verifiedFetch(
    // BMT chunk hash of an empty payload — the canonical Swarm "zero chunk".
    "b34ca8c22b9e982354f9c7f50b470d66db428d880c8a904d5fe4ec9713171526",
  );
  // `bytes` is a Uint8Array whose BMT root has been re-derived locally and
  // matches the requested reference. Safe to display / parse.
  const text = new TextDecoder().decode(bytes);
  console.log(text);
} catch (err) {
  if (err instanceof IntegrityError) {
    console.error("Tampered gateway:", err.expected, "≠", err.actual);
  } else {
    throw err;
  }
}
```

## API

### `verifiedFetch(reference, options?): Promise<Uint8Array>`

Fetches the payload at `reference` from a Swarm gateway and verifies its BMT root.

| Option    | Type          | Default                                 | Notes                                |
| --------- | ------------- | --------------------------------------- | ------------------------------------ |
| `gateway` | `string`      | `https://api.gateway.ethswarm.org/bzz/` | Trailing slash required.             |
| `signal`  | `AbortSignal` | —                                       | Forwarded to the underlying `fetch`. |

The `reference` may be lowercase or uppercase, with or without a `0x` prefix.

Throws `IntegrityError` on BMT mismatch. Throws a generic `Error` for non-2xx HTTP responses or invalid hex references.

### `class IntegrityError extends Error`

Fields:

- `expected: string` — the BMT root the caller asked for (lowercase hex, no `0x`).
- `actual: string` — the BMT root computed from the bytes the gateway returned.

### `bmtRoot(bytes: Uint8Array): Uint8Array`

Pure function. Computes the BMT keccak256 root for inspection or testing. In v0.1, throws if `bytes.length > 4096` (see [Scope](#v01-scope) below).

### Helpers

- `bytesToHex(bytes: Uint8Array): string` — lowercase hex, no `0x`.
- `hexToBytes(hex: string): Uint8Array` — accepts an optional `0x` prefix.
- `DEFAULT_GATEWAY`, `SWARM_CHUNK_SIZE`, `SWARM_SPAN_SIZE` — constants.

## CLI

The package ships a `swarm-verify` binary:

```sh
swarm-verify <reference> [--gateway <url>]
```

Exits `0` and prints `OK <byteCount> bytes` plus a 200-byte preview on success. Exits `1` and prints `FAIL` plus mismatch details on integrity failure or fetch error.

## v0.1 scope

This release implements the **single-chunk** case only — payloads up to 4096 bytes (the Swarm chunk size). For Kanbantic's proof bundles (small JSON), this is the entire surface we need.

Multi-chunk BMT (the binary tree of chunk hashes for larger payloads) is planned for v0.2. Today, calling `verifiedFetch` or `bmtRoot` with a payload larger than 4096 bytes throws an explicit `Error("multi-chunk BMT not yet implemented in v0.1")` rather than silently returning unverified data.

## License

MIT.
