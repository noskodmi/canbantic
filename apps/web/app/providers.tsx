"use client";

import { RainbowKitProvider, connectorsForWallets } from "@rainbow-me/rainbowkit";
import {
  base,
  injectedWallet,
  rainbowWallet,
  walletConnectWallet,
} from "@rainbow-me/rainbowkit/wallets";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { createConfig, http, WagmiProvider } from "wagmi";
import { sepolia } from "wagmi/chains";

// WalletConnect projectId — required for the WC modal handshake. If
// it's missing or the literal "demo" sentinel (rainbowkit's fallback),
// the WC connector throws when invoked in Safari. Surface loudly so we
// notice in browser console rather than silently rendering a dead
// modal.
const wcProjectId = process.env["NEXT_PUBLIC_WC_PROJECT_ID"];
if (!wcProjectId || wcProjectId === "demo") {
  console.error(
    "[kanbantic] NEXT_PUBLIC_WC_PROJECT_ID is missing — WalletConnect-based wallets (mobile/QR) will not work. Set it in Vercel env.",
  );
}

// Custom connector list, ordered by Safari-friendliness:
//   1. Base Account / Coinbase Smart Wallet — passkey-native, no
//      browser extension or WC modal required. The most reliable
//      wallet path on Safari/iOS where ITP breaks third-party
//      storage flows.
//   2. injectedWallet — auto-detects MetaMask / Brave / Rabby /
//      whatever extension the user has installed. The dedicated
//      `metaMaskWallet` SDK is intentionally excluded because its
//      embedded modal throws an "invalid border=0" iframe error in
//      Safari; falling back to the injected provider works.
//   3. WalletConnect — mobile wallet pairing via QR. Configured
//      with `disableProviderPing` so the keepalive doesn't hang the
//      modal under Safari ITP, and telemetry off.
//   4. Rainbow — RainbowKit's deeplink wallet, also fine on Safari.
const connectors = connectorsForWallets(
  [
    {
      groupName: "Recommended",
      wallets: [base],
    },
    {
      groupName: "Browser extension",
      wallets: [injectedWallet],
    },
    {
      groupName: "Mobile",
      wallets: [walletConnectWallet, rainbowWallet],
    },
  ],
  {
    appName: "Kanbantic",
    appDescription: "On-chain kanban for autonomous agents.",
    appUrl: "https://kanbantic.vercel.app",
    appIcon: "https://kanbantic.vercel.app/logo.jpg",
    projectId: wcProjectId ?? "demo",
    walletConnectParameters: {
      // Skip the keepalive ping that occasionally hangs in Safari
      // when ITP blocks the third-party storage required by the
      // WC SDK to track the relay session.
      disableProviderPing: true,
      telemetryEnabled: false,
    },
  },
);

// Build a Sepolia transport that prefers the Alchemy RPC when an
// `NEXT_PUBLIC_ALCHEMY_API_KEY` is present, then a custom URL via
// `NEXT_PUBLIC_SEPOLIA_RPC_URL`, then the chain's default public RPC
// (publicnode). Public RPCs rate-limit aggressively and have lossy
// log support, so any real workflow should use the Alchemy path.
const alchemyKey = process.env["NEXT_PUBLIC_ALCHEMY_API_KEY"];
const customRpc = process.env["NEXT_PUBLIC_SEPOLIA_RPC_URL"];
const sepoliaRpcUrl =
  alchemyKey !== undefined && alchemyKey.length > 0
    ? `https://eth-sepolia.g.alchemy.com/v2/${alchemyKey}`
    : customRpc !== undefined && customRpc.length > 0
      ? customRpc
      : undefined;

const wagmiConfig = createConfig({
  connectors,
  chains: [sepolia],
  transports: { [sepolia.id]: http(sepoliaRpcUrl) },
  ssr: true,
});

const queryClient = new QueryClient();

export function Providers({ children }: { children: ReactNode }) {
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider>{children}</RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
