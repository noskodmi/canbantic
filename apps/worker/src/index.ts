import type { Env } from "./env.js";
import { Router } from "./router.js";

const router = new Router();

// Routes registered in subsequent tasks.

export default {
  async fetch(request, env, ctx) {
    return router.dispatch(request, env, ctx);
  },
} satisfies ExportedHandler<Env>;
