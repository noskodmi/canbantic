import type { Env } from "./env.js";

export interface Route {
  method: "GET" | "POST";
  path: string;
  handler: (request: Request, env: Env, ctx: ExecutionContext) => Promise<Response>;
}

export class Router {
  private readonly routes = new Map<string, Route>();

  add(route: Route): this {
    this.routes.set(`${route.method} ${route.path}`, route);
    return this;
  }

  async dispatch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const key = `${request.method} ${url.pathname}`;
    const route = this.routes.get(key);
    if (!route) {
      return new Response("not found", { status: 404 });
    }
    try {
      return await route.handler(request, env, ctx);
    } catch (err) {
      console.error("router handler error", err);
      return new Response("internal error", { status: 500 });
    }
  }
}
