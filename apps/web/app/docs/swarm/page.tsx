import Link from "next/link";

import { IntegrityProbe } from "./_ui/IntegrityProbe";

export const metadata = {
  title: "Swarm verified-fetch · Kanbantic",
  description:
    "BMT keccak256 integrity check for Swarm references — recompute the chunk root locally, throw IntegrityError on mismatch.",
};

export default function SwarmDocsPage() {
  return (
    <article className="flex flex-col gap-10 py-12">
      <header className="flex flex-col gap-3">
        <p className="text-xs font-mono uppercase tracking-widest text-[var(--color-kanbantic-muted)]">
          Docs · Storage integrity
        </p>
        <h1 className="text-balance text-4xl font-bold tracking-tight sm:text-5xl">
          Swarm verified-fetch
        </h1>
        <p className="max-w-2xl text-sm text-[var(--color-kanbantic-fg)]/80">
          A trustless gateway is a contradiction. Public Swarm gateways can — accidentally or
          maliciously — return bytes that don&apos;t match the requested reference. The{" "}
          <code className="font-mono">@kanbantic/swarm-verified-fetch</code> npm package fixes that
          by recomputing the BMT keccak256 root locally and throwing{" "}
          <code className="font-mono">IntegrityError</code> when bytes don&apos;t check out.
        </p>
      </header>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--color-kanbantic-muted)]">
          What &quot;verified&quot; means
        </h2>
        <ol className="list-decimal space-y-2 pl-5 text-sm text-[var(--color-kanbantic-fg)]/85">
          <li>
            Caller passes a Swarm reference (a hex BMT chunk address, e.g. the result of
            <code className="font-mono"> bzz upload </code>).
          </li>
          <li>The lib fetches the bytes from any HTTP gateway you point it at.</li>
          <li>
            It rebuilds the BMT — span (8-byte LE length) prepended, payload zero-padded to 4096
            bytes, 7 levels of pairwise <code className="font-mono">keccak256</code>, then a final{" "}
            <code className="font-mono">keccak256(span || bmt_root)</code>.
          </li>
          <li>
            On match, the bytes are returned. On mismatch,{" "}
            <code className="font-mono">IntegrityError</code> fires with both the expected and
            actual roots.
          </li>
        </ol>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--color-kanbantic-muted)]">
          Live integrity probe
        </h2>
        <p className="text-sm text-[var(--color-kanbantic-fg)]/80">
          The first button hits the public ethswarm.org gateway with a known reference (the empty
          payload). The second button fetches the bytes, flips one byte locally, and shows the lib
          rejecting the tampered payload. Both probes run entirely in your browser.
        </p>
        <IntegrityProbe />
      </section>

      <footer className="flex items-center justify-between border-t border-white/10 pt-6 text-xs text-[var(--color-kanbantic-muted)]">
        <Link href="/docs" className="hover:text-[var(--color-kanbantic-accent)]">
          ← All docs
        </Link>
        <a
          href="https://www.npmjs.com/package/@kanbantic/swarm-verified-fetch"
          target="_blank"
          rel="noreferrer noopener"
          className="hover:text-[var(--color-kanbantic-accent)]"
        >
          @kanbantic/swarm-verified-fetch on npm ↗
        </a>
      </footer>
    </article>
  );
}
