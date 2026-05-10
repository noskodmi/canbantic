import { agentsHandler } from "./api/agents.js";
import { ccipReadHandler } from "./api/ccip-read.js";
import { contractIntelligenceHandler } from "./api/contract-intelligence.js";
import { orbitportLastDrawHandler } from "./api/orbitport.js";
import { refreshHandler } from "./api/refresh.js";
import { statusHandler } from "./api/status.js";
import { workHandler } from "./api/work.js";
import type { Env } from "./env.js";
import { Router } from "./router.js";

const router = new Router();
router.add({ method: "GET", path: "/api/status", handler: statusHandler });
router.add({ method: "GET", path: "/api/agents", handler: agentsHandler });
router.add({ method: "GET", path: "/api/work", handler: workHandler });
router.add({
  method: "GET",
  path: "/api/orbitport/last-draw",
  handler: orbitportLastDrawHandler,
});
router.add({ method: "POST", path: "/api/refresh", handler: refreshHandler });
router.add({
  method: "POST",
  path: "/api/contract-intelligence/run",
  handler: contractIntelligenceHandler,
});
// EIP-3668 CCIP-Read gateway. URL template `{sender}/{data}.json` is the
// pattern OffchainResolver pins at deploy time. Both GET (path-encoded)
// and POST (`{sender, data}` JSON body) are supported per spec.
router.add({ method: "GET", path: "/api/ccip-read/:sender/:data", handler: ccipReadHandler });
router.add({ method: "POST", path: "/api/ccip-read", handler: ccipReadHandler });

export default {
  async fetch(request, env, ctx) {
    return router.dispatch(request, env, ctx);
  },
} satisfies ExportedHandler<Env>;

export { IndexerCursor } from "./indexer/cursor.js";
