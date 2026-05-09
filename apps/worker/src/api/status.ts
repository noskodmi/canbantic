import { sepoliaDeployment } from "@kanbantic/shared";

import { applyMigrations } from "../db/migrate.js";
import type { Env } from "../env.js";

export async function statusHandler(_request: Request, env: Env): Promise<Response> {
  await applyMigrations(env.DB);

  const row = await env.DB.prepare("SELECT last_block FROM index_cursor WHERE chain_id = ?")
    .bind(Number(env.SEPOLIA_CHAIN_ID))
    .first<{ last_block: number }>();

  const lastBlock = row?.last_block ?? 0;

  return Response.json(
    {
      chainId: Number(env.SEPOLIA_CHAIN_ID),
      lastBlock,
      contracts: sepoliaDeployment.contracts,
      ens: sepoliaDeployment.ens,
    },
    {
      headers: {
        "cache-control": "public, max-age=10, stale-while-revalidate=60",
      },
    },
  );
}
