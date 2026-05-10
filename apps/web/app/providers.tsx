"use client";

import { RainbowKitProvider, connectorsForWallets } from "@rainbow-me/rainbowkit";
import {
  base,
  injectedWallet,
  metaMaskWallet,
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

// Custom connector list. Coinbase Smart Wallet first because it works
// in Safari via passkeys with no extension required — the most reliable
// wallet path on iOS/Safari where ITP breaks WC's storage flows.
// Injected (MetaMask) for desktop Chrome/Brave with the extension.
// WalletConnect for mobile QR pairing.
const connectors = connectorsForWallets(
  [
    {
      groupName: "Recommended for Safari",
      wallets: [base],
    },
    {
      groupName: "Browser",
      wallets: [metaMaskWallet, injectedWallet],
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
  },
);

const wagmiConfig = createConfig({
  connectors,
  chains: [sepolia],
  transports: { [sepolia.id]: http() },
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
