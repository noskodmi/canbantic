#!/usr/bin/env node
/**
 * swarm-verify — CLI for @kanbantic/swarm-verified-fetch.
 *
 * Usage:
 *   swarm-verify <reference> [--gateway <url>]
 *
 * Exit codes:
 *   0 — bytes verified, BMT root matches requested reference
 *   1 — integrity mismatch, fetch failed, or invalid arguments
 */

import { DEFAULT_GATEWAY, IntegrityError, verifiedFetch } from "./index.js";

interface ParsedArgs {
  reference: string;
  gateway: string;
}

function printUsage(): void {
  process.stderr.write(
    "Usage: swarm-verify <reference> [--gateway <url>]\n" + `Default gateway: ${DEFAULT_GATEWAY}\n`,
  );
}

function parseArgs(argv: readonly string[]): ParsedArgs {
  let reference: string | undefined;
  let gateway: string = DEFAULT_GATEWAY;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--gateway") {
      const value = argv[i + 1];
      if (value === undefined) {
        throw new Error("--gateway requires a value");
      }
      gateway = value;
      i++;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      printUsage();
      process.exit(0);
    }
    if (arg?.startsWith("-")) {
      throw new Error(`unknown flag: ${arg}`);
    }
    if (reference !== undefined) {
      throw new Error(`unexpected positional argument: ${String(arg)}`);
    }
    reference = arg;
  }

  if (reference === undefined) {
    throw new Error("missing required <reference> argument");
  }

  return { reference, gateway };
}

async function main(): Promise<void> {
  let args: ParsedArgs;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (err) {
    process.stderr.write(`error: ${(err as Error).message}\n`);
    printUsage();
    process.exit(1);
  }

  try {
    const bytes = await verifiedFetch(args.reference, { gateway: args.gateway });
    const previewLen = Math.min(200, bytes.length);
    const previewBytes = bytes.subarray(0, previewLen);
    // Render preview as UTF-8 if it decodes cleanly, otherwise as hex.
    let preview: string;
    try {
      preview = new TextDecoder("utf-8", { fatal: true }).decode(previewBytes);
    } catch {
      let hex = "";
      for (const byte of previewBytes) {
        hex += byte.toString(16).padStart(2, "0");
      }
      preview = `0x${hex}`;
    }

    process.stdout.write(`OK ${String(bytes.length)} bytes\n`);
    process.stdout.write(`--- preview (${String(previewLen)} bytes) ---\n`);
    process.stdout.write(preview);
    if (!preview.endsWith("\n")) process.stdout.write("\n");
    process.exit(0);
  } catch (err) {
    if (err instanceof IntegrityError) {
      process.stderr.write(
        `FAIL integrity mismatch\n  expected: ${err.expected}\n  actual:   ${err.actual}\n`,
      );
      process.exit(1);
    }
    process.stderr.write(`FAIL ${(err as Error).message}\n`);
    process.exit(1);
  }
}

void main();
