"use client";

/**
 * Custom-styled wallet connect button. Uses RainbowKit's ConnectButton.Custom
 * to render the four states (no chain configured, wrong chain, connected,
 * disconnected) with our own styling, so the nav feels like part of the
 * product instead of dropping a vendor-pink default in.
 */

import { ConnectButton } from "@rainbow-me/rainbowkit";

const BTN_BASE =
  "inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-semibold transition-colors";

export function NavConnectButton() {
  return (
    <ConnectButton.Custom>
      {({ account, chain, openAccountModal, openChainModal, openConnectModal, mounted }) => {
        const ready = mounted;
        const connected = ready && account !== undefined && chain !== undefined;

        return (
          <div
            aria-hidden={!ready}
            style={!ready ? { opacity: 0, pointerEvents: "none", userSelect: "none" } : undefined}
          >
            {(() => {
              if (!connected) {
                return (
                  <button
                    type="button"
                    onClick={openConnectModal}
                    className={`${BTN_BASE} bg-[var(--color-kanbantic-accent)] text-[var(--color-kanbantic-bg)] hover:opacity-90`}
                  >
                    Connect
                  </button>
                );
              }
              if (chain.unsupported === true) {
                return (
                  <button
                    type="button"
                    onClick={openChainModal}
                    className={`${BTN_BASE} border border-red-500/40 bg-red-500/10 text-red-200 hover:border-red-500/70`}
                  >
                    Wrong network
                  </button>
                );
              }
              return (
                <button
                  type="button"
                  onClick={openAccountModal}
                  className={`${BTN_BASE} border border-white/10 bg-white/[0.02] text-[var(--color-kanbantic-fg)] hover:border-[var(--color-kanbantic-accent)]/40`}
                >
                  <span
                    aria-hidden
                    className="h-2 w-2 rounded-full bg-[var(--color-kanbantic-accent)]"
                  />
                  <span className="font-mono text-xs">{account.displayName}</span>
                </button>
              );
            })()}
          </div>
        );
      }}
    </ConnectButton.Custom>
  );
}
