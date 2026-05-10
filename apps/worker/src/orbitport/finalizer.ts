/**
 * Orbitport fair-claim finalizer.
 *
 * Scans D1 for bounties whose `status = 'ClaimWindowOpen'` and whose
 * commit window has closed (`claim_window_start_block + claim_window_blocks
 * <= safeHead`). For each ready bounty:
 *
 *   1. Fetch + verify a fresh Orbitport cTRNG draw + Ed25519 signature.
 *   2. Persist the draw to `orbitport_draws` (lets judges read the
 *      most recent draw via /api/orbitport/last-draw).
 *   3. If `WORKER_DEPLOYER_PRIVATE_KEY` is configured, submit
 *      `BountyBoard.finalizeFairClaim(bountyId, draw, signature)` from
 *      the deployer wallet and stamp the draw row with the bounty id.
 *      If the secret is not set (Phase 7 v0.1 default), the draw is
 *      still persisted but no tx is sent — the run logs a clear
 *      "finalizer disabled" message.
 *
 * The finalizer is invoked from the existing `IndexerCursor` alarm
 * tick (one bounty per tick, to keep DO CPU budgets predictable).
 * Errors are caught + logged; the indexer cursor is unaffected.
 */

import type { D1Database } from "@cloudflare/workers-types";
import type { Hex } from "viem";

import type { Env } from "../env.js";
import { bytesToHex, fetchOrbitportDraw, OrbitportError } from "./client.js";

interface ReadyBounty {
  id: number;
}

export interface FinalizerResult {
  scanned: number;
  finalized: number;
  txHash: string | null;
  bountyId: number | null;
  drawId: number | null;
  skippedReason: string | null;
}

const NULL_RESULT: FinalizerResult = {
  scanned: 0,
  finalized: 0,
  txHash: null,
  bountyId: null,
  drawId: null,
  skippedReason: null,
};

/**
 * Tick the finalizer once. Picks the oldest ready bounty (FIFO by
 * `claim_window_start_block`) and either finalizes it or persists the
 * draw and waits for the next tick to retry.
 */
export async function runOrbitportFinalizer(
  env: Env,
  db: D1Database,
  safeHead: number,
): Promise<FinalizerResult> {
  // 1. Find a ready bounty.
  const ready = await db
    .prepare(
      `SELECT id
         FROM bounties
        WHERE status = 'ClaimWindowOpen'
          AND claim_window_blocks > 0
          AND claim_window_start_block + claim_window_blocks <= ?
        ORDER BY claim_window_start_block ASC
        LIMIT 1`,
    )
    .bind(safeHead)
    .first<ReadyBounty>();

  if (ready === null) {
    return NULL_RESULT;
  }

  // 2. Fetch + verify Orbitport draw.
  let draw: Awaited<ReturnType<typeof fetchOrbitportDraw>>;
  try {
    draw = await fetchOrbitportDraw(env);
  } catch (err) {
    if (err instanceof OrbitportError) {
      console.error("orbitport finalizer: draw fetch/verify failed", {
        bountyId: ready.id,
        error: err.message,
      });
    } else {
      console.error("orbitport finalizer: unexpected error", err);
    }
    return { ...NULL_RESULT, scanned: 1, skippedReason: "orbitport_unavailable" };
  }

  // 3. Persist the draw.
  const drawHex = bytesToHex(draw.draw);
  const sigHex = bytesToHex(draw.signature);
  const pubkeyHex = bytesToHex(draw.publicKey);
  const insert = await db
    .prepare(
      "INSERT INTO orbitport_draws (draw_hex, signature_hex, pubkey_hex, ts) VALUES (?, ?, ?, ?)",
    )
    .bind(drawHex, sigHex, pubkeyHex, draw.timestamp)
    .run();
  const drawId = typeof insert.meta.last_row_id === "number" ? insert.meta.last_row_id : null;

  // 4. If we don't have the deployer key, log + bail.
  const pk = env.WORKER_DEPLOYER_PRIVATE_KEY;
  if (pk === undefined || pk.length === 0) {
    console.warn(
      "orbitport finalizer: WORKER_DEPLOYER_PRIVATE_KEY not set — draw persisted, finalizeFairClaim tx skipped",
      { bountyId: ready.id, drawId },
    );
    return {
      scanned: 1,
      finalized: 0,
      txHash: null,
      bountyId: ready.id,
      drawId,
      skippedReason: "deployer_secret_missing",
    };
  }

  // 5. Send finalizeFairClaim from the deployer wallet.
  let txHash: Hex;
  try {
    txHash = await sendFinalizeFairClaim({
      env,
      bountyId: BigInt(ready.id),
      drawHex: drawHex as Hex,
      signatureHex: sigHex as Hex,
      privateKey: pk as Hex,
    });
  } catch (err) {
    console.error("orbitport finalizer: finalizeFairClaim tx failed", {
      bountyId: ready.id,
      error: err instanceof Error ? err.message : String(err),
    });
    return {
      scanned: 1,
      finalized: 0,
      txHash: null,
      bountyId: ready.id,
      drawId,
      skippedReason: "tx_failed",
    };
  }

  // 6. Stamp the draw row with the bounty id we used it for.
  if (drawId !== null) {
    await db
      .prepare("UPDATE orbitport_draws SET used_for_bounty_id = ? WHERE id = ?")
      .bind(ready.id, drawId)
      .run();
  }

  console.log("orbitport finalizer: finalizeFairClaim submitted", {
    bountyId: ready.id,
    drawId,
    txHash,
  });

  return {
    scanned: 1,
    finalized: 1,
    txHash,
    bountyId: ready.id,
    drawId,
    skippedReason: null,
  };
}

interface SendFinalizeArgs {
  env: Env;
  bountyId: bigint;
  drawHex: Hex;
  signatureHex: Hex;
  privateKey: Hex;
}

/**
 * The viem imports are dynamic on purpose. The vitest workers pool
 * (workerd-based) chokes when viem's eagerly-loaded chain + test
 * action surfaces are static-imported at module init. Pulling them in
 * lazily inside this function keeps the tests for the rest of the
 * worker module green; this code path only runs when the deployer
 * secret is configured at runtime.
 */
async function sendFinalizeFairClaim(args: SendFinalizeArgs): Promise<Hex> {
  const { sepoliaDeployment, BountyBoardAbi } = await import("@kanbantic/shared");
  const { createPublicClient, createWalletClient, defineChain, encodeFunctionData, http } =
    await import("viem");
  const { privateKeyToAccount } = await import("viem/accounts");

  const sepoliaChain = defineChain({
    id: 11155111,
    name: "Sepolia",
    nativeCurrency: { name: "Sepolia Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: { default: { http: ["https://ethereum-sepolia-rpc.publicnode.com"] } },
  });

  const account = privateKeyToAccount(args.privateKey);
  const transport = http(args.env.SEPOLIA_RPC);
  const wallet = createWalletClient({ account, chain: sepoliaChain, transport });
  const publicClient = createPublicClient({ chain: sepoliaChain, transport });

  const data = encodeFunctionData({
    abi: BountyBoardAbi,
    functionName: "finalizeFairClaim",
    args: [args.bountyId, args.drawHex, args.signatureHex],
  });

  // Estimate gas + cap at 500k — finalizeFairClaim is a small bounded
  // loop over committers + a couple of SSTOREs; well under 200k in our
  // forge runs. The cap stops a bad RPC estimate from torching the
  // deployer wallet.
  const gas = await publicClient.estimateGas({
    account,
    to: sepoliaDeployment.contracts.BountyBoard,
    data,
  });
  const cappedGas = gas > 500_000n ? 500_000n : gas;

  return wallet.sendTransaction({
    to: sepoliaDeployment.contracts.BountyBoard,
    data,
    gas: cappedGas,
  });
}
