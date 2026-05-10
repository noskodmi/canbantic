/**
 * POST /api/contract-intelligence/run
 *
 * Body: { taskKind: 'audit' | 'explain' | 'similarity', address: '0x...' }
 *
 * Pipeline:
 *  1. Validate body shape (address regex, taskKind enum).
 *  2. For `similarity` — short-circuit with a not-implemented envelope.
 *  3. For `audit` / `explain` — fetch verified source from Sourcify v2
 *     via @kanbantic/sourcify-client.
 *  4. If unverified — return a `{ error: 'not_verified' }` envelope.
 *  5. Call OpenRouter (claude-sonnet-4.5 by default) with the chosen
 *     prompt template; fall back to a Sourcify-quoted stub if
 *     OPENROUTER_API_KEY is unset.
 *
 * Sponsor 2's differentiator is the *Sourcify routing*: every report
 * is anchored to bytecode-matching verified source.
 */

import { lookup, type SourcifyMatch } from "@kanbantic/sourcify-client";

import { applyMigrations } from "../db/migrate.js";
import type { Env } from "../env.js";

const SEPOLIA_CHAIN_ID = 11155111;
const ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/;
const SOURCE_PREVIEW_CHARS = 800;
const LLM_SOURCE_BUDGET_CHARS = 12_000;
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_MODEL = "anthropic/claude-sonnet-4.5";

const TASK_KINDS = ["audit", "explain", "similarity"] as const;
type TaskKind = (typeof TASK_KINDS)[number];

interface RunBody {
  taskKind: TaskKind;
  address: string;
}

function isTaskKind(value: unknown): value is TaskKind {
  return typeof value === "string" && (TASK_KINDS as readonly string[]).includes(value);
}

function parseBody(value: unknown): RunBody | { error: string } {
  if (typeof value !== "object" || value === null) {
    return { error: "body must be a JSON object" };
  }
  const record = value as Record<string, unknown>;
  const taskKindRaw = record["taskKind"];
  const addressRaw = record["address"];
  if (!isTaskKind(taskKindRaw)) {
    return { error: `taskKind must be one of: ${TASK_KINDS.join(", ")}` };
  }
  if (typeof addressRaw !== "string" || !ADDRESS_REGEX.test(addressRaw)) {
    return { error: "address must be a 0x-prefixed 40-char hex string" };
  }
  return { taskKind: taskKindRaw, address: addressRaw };
}

function pickPrimarySource(sources: Record<string, string>): { path: string; content: string } {
  // Prefer the .sol file whose path looks most like a top-level contract:
  // shortest path among `.sol` files (deepest paths are usually OZ /
  // library deps). Falls back to the first source if no `.sol`.
  const solEntries = Object.entries(sources).filter(([path]) => path.endsWith(".sol"));
  const pool = solEntries.length > 0 ? solEntries : Object.entries(sources);
  pool.sort((a, b) => a[0].length - b[0].length);
  const first = pool[0];
  if (!first) {
    return { path: "<empty>", content: "" };
  }
  return { path: first[0], content: first[1] };
}

function reportHeader(
  taskKind: "audit" | "explain",
  address: string,
  match: SourcifyMatch,
): string {
  const matchLabel =
    match.match === "exact_match"
      ? "exact_match (bytecode + metadata)"
      : "partial_match (bytecode only)";
  const primary = pickPrimarySource(match.sources ?? {});
  return (
    `# Contract Intelligence — ${taskKind} report\n\n` +
    `**Address:** \`${address}\` (Sepolia)\n` +
    `**Sourcify match:** ${matchLabel}\n` +
    `**Primary source:** \`${primary.path}\`\n\n`
  );
}

function sourcePreviewBlock(match: SourcifyMatch): string {
  const primary = pickPrimarySource(match.sources ?? {});
  const preview = primary.content.slice(0, SOURCE_PREVIEW_CHARS);
  return (
    `## Verified source fetched\n\n` +
    "```solidity\n" +
    preview +
    (primary.content.length > SOURCE_PREVIEW_CHARS ? "\n// …truncated…" : "") +
    "\n```\n\n"
  );
}

function buildStubReport(
  taskKind: "audit" | "explain",
  address: string,
  match: SourcifyMatch,
): string {
  const stubFindings =
    taskKind === "audit"
      ? `## Findings (stub)\n\n` +
        `Real audit lands when \`OPENROUTER_API_KEY\` worker secret is set. ` +
        `The pipeline successfully fetched verified source from Sourcify.\n`
      : `## Explanation (stub)\n\n` +
        `Real plain-English explanation lands when \`OPENROUTER_API_KEY\` worker secret is set. ` +
        `The pipeline successfully fetched verified source from Sourcify.\n`;
  return reportHeader(taskKind, address, match) + sourcePreviewBlock(match) + stubFindings;
}

function buildPrompt(taskKind: "audit" | "explain", address: string, match: SourcifyMatch): string {
  const sources = match.sources ?? {};
  const entries = Object.entries(sources)
    .filter(([path]) => path.endsWith(".sol"))
    .sort((a, b) => a[0].length - b[0].length);
  let budget = LLM_SOURCE_BUDGET_CHARS;
  const blocks: string[] = [];
  for (const [path, content] of entries) {
    if (budget <= 0) break;
    const slice = content.slice(0, budget);
    budget -= slice.length;
    blocks.push(
      `// FILE: ${path}\n${slice}${content.length > slice.length ? "\n// …truncated…" : ""}`,
    );
  }
  const sourceBundle = blocks.join("\n\n");

  if (taskKind === "audit") {
    return (
      `You are a Solidity security auditor reviewing a Sepolia contract at ${address}. ` +
      `The source below is bytecode-verified by Sourcify (${match.match}). ` +
      `Produce a concise audit report in markdown with sections: ` +
      `Critical findings, Important findings, Minor findings, and a one-paragraph Overall assessment. ` +
      `For each finding, cite the file and approximate line number, name the issue, and recommend a fix in 1-2 sentences. ` +
      `If the contract is small and clean, say so plainly.\n\n` +
      `=== VERIFIED SOURCE ===\n${sourceBundle}\n=== END SOURCE ===`
    );
  }

  return (
    `You are explaining a Sepolia smart contract at ${address} to a non-developer who is considering interacting with it. ` +
    `The source below is bytecode-verified by Sourcify (${match.match}). ` +
    `Write a 3-paragraph plain-English explanation in markdown: ` +
    `(1) what this contract does in one paragraph, ` +
    `(2) what risks the reader should know about in one paragraph, ` +
    `(3) what actions the reader can take and what each costs / what each does.\n\n` +
    `=== VERIFIED SOURCE ===\n${sourceBundle}\n=== END SOURCE ===`
  );
}

interface OpenRouterResponse {
  choices?: { message?: { content?: string } }[];
  error?: { message?: string };
}

async function callOpenRouter(env: Env, prompt: string): Promise<string> {
  const model = env.OPENROUTER_MODEL ?? DEFAULT_MODEL;
  const res = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      authorization: `Bearer ${env.OPENROUTER_API_KEY ?? ""}`,
      "content-type": "application/json",
      "http-referer": "https://kanbantic-api.lizzflix.workers.dev",
      "x-title": "Kanbantic Contract Intelligence",
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: prompt }],
      max_tokens: 1500,
    }),
  });
  if (!res.ok) {
    throw new Error(`OpenRouter HTTP ${String(res.status)}: ${await res.text()}`);
  }
  const payload = await res.json<OpenRouterResponse>();
  if (payload.error) {
    throw new Error(`OpenRouter error: ${payload.error.message ?? "unknown"}`);
  }
  const content = payload.choices?.[0]?.message?.content;
  if (typeof content !== "string" || content.length === 0) {
    throw new Error("OpenRouter returned empty content");
  }
  return content;
}

async function buildLiveReport(
  taskKind: "audit" | "explain",
  address: string,
  match: SourcifyMatch,
  env: Env,
): Promise<string> {
  const prompt = buildPrompt(taskKind, address, match);
  const llmBody = await callOpenRouter(env, prompt);
  return reportHeader(taskKind, address, match) + sourcePreviewBlock(match) + llmBody + "\n";
}

export async function contractIntelligenceHandler(request: Request, env: Env): Promise<Response> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return Response.json(
      { error: "invalid_json", message: "Body is not valid JSON." },
      { status: 400 },
    );
  }

  const parsed = parseBody(raw);
  if ("error" in parsed) {
    return Response.json({ error: "invalid_request", message: parsed.error }, { status: 400 });
  }

  const { taskKind, address } = parsed;

  if (taskKind === "similarity") {
    return Response.json({
      kind: taskKind,
      address,
      error: "not_implemented_v01",
      message:
        "Similarity-match lands in v0.2. For now, query the Sourcify dataset on BigQuery directly.",
    });
  }

  let match: SourcifyMatch;
  try {
    match = await lookup(SEPOLIA_CHAIN_ID, address);
  } catch (err) {
    console.error("sourcify lookup failed", err);
    return Response.json(
      {
        error: "sourcify_unavailable",
        message: "Sourcify v2 lookup failed. Try again shortly.",
      },
      { status: 502 },
    );
  }

  if (match.match === "none") {
    return Response.json({
      kind: taskKind,
      address,
      error: "not_verified",
      message:
        "Address is not verified on Sourcify. Paste a verified address — e.g., one of Kanbantic's 5 contracts.",
    });
  }

  let report: string;
  let llmStatus: "openrouter" | "stub" | "openrouter_failed" = "stub";
  if (env.OPENROUTER_API_KEY) {
    try {
      report = await buildLiveReport(taskKind, address, match, env);
      llmStatus = "openrouter";
    } catch (err) {
      console.error("openrouter call failed, falling back to stub", err);
      report = buildStubReport(taskKind, address, match);
      llmStatus = "openrouter_failed";
    }
  } else {
    report = buildStubReport(taskKind, address, match);
  }

  const model = llmStatus === "openrouter" ? (env.OPENROUTER_MODEL ?? DEFAULT_MODEL) : null;
  const ts = Math.floor(Date.now() / 1000);

  // Persist the resolved report so the UI can show a clickable history
  // and individual reports survive a page refresh. We persist on every
  // verified resolution (audit + explain) regardless of LLM status —
  // even a stub report is useful evidence the analyzer ran.
  let runId: number | null = null;
  try {
    await applyMigrations(env.DB);
    const insert = await env.DB.prepare(
      `INSERT INTO contract_intel_runs
         (address, kind, sourcify_match, report, llm, model, ts)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(address.toLowerCase(), taskKind, match.match, report, llmStatus, model, ts)
      .run();
    runId = typeof insert.meta.last_row_id === "number" ? insert.meta.last_row_id : null;
  } catch (err) {
    // Persistence is best-effort — we still serve the report on any
    // D1 hiccup so the user-facing call never fails on a write error.
    console.error("contract-intelligence: failed to persist run", err);
  }

  return Response.json({
    id: runId,
    kind: taskKind,
    address,
    sourcifyMatch: match.match,
    report,
    llm: llmStatus,
    model,
    sourcifyUrl: `https://sourcify.dev/lookup/${address}`,
    ts,
  });
}

/**
 * GET /api/contract-intelligence/runs
 *
 * Returns the most recent N persisted reports, newest first. The web
 * Contract Intelligence page renders this as a clickable list so a
 * single user can browse their history (and judges can see what's
 * been analyzed) without re-running the LLM.
 */
export async function contractIntelligenceListHandler(
  request: Request,
  env: Env,
): Promise<Response> {
  await applyMigrations(env.DB);

  const url = new URL(request.url);
  const limitParam = url.searchParams.get("limit");
  let limit = 50;
  if (limitParam !== null) {
    const parsed = Number.parseInt(limitParam, 10);
    if (Number.isFinite(parsed) && parsed > 0 && parsed <= 200) limit = parsed;
  }

  const result = await env.DB.prepare(
    `SELECT id, address, kind, sourcify_match, llm, model, ts,
            substr(report, 1, 200) AS report_excerpt
       FROM contract_intel_runs
      ORDER BY id DESC
      LIMIT ?`,
  )
    .bind(limit)
    .all();

  return Response.json({ runs: result.results, limit });
}

/**
 * GET /api/contract-intelligence/runs/:id
 *
 * Returns the full row for one persisted report.
 */
export async function contractIntelligenceGetHandler(
  request: Request,
  env: Env,
  _ctx: ExecutionContext,
  routeCtx: { params: Record<string, string> },
): Promise<Response> {
  await applyMigrations(env.DB);

  const idRaw = routeCtx.params["id"];
  const id = idRaw !== undefined ? Number.parseInt(idRaw, 10) : Number.NaN;
  if (!Number.isFinite(id) || id <= 0) {
    return Response.json({ error: "invalid_id" }, { status: 400 });
  }

  const row = await env.DB.prepare(
    `SELECT id, address, kind, sourcify_match, report, llm, model, ts
       FROM contract_intel_runs
      WHERE id = ?
      LIMIT 1`,
  )
    .bind(id)
    .first();

  if (!row) return Response.json({ error: "not_found" }, { status: 404 });
  return Response.json(row);
}
