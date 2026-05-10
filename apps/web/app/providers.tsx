"use client";

import { RainbowKitProvider, getDefaultConfig } from "@rainbow-me/rainbowkit";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { WagmiProvider } from "wagmi";
import { sepolia } from "wagmi/chains";

// `getDefaultConfig` builds a wagmi config that already includes the
// injected (MetaMask), Coinbase Wallet, and WalletConnect connectors.
// On Safari the injected connector requires an installed extension,
// Coinbase Wallet works via passkeys, and WalletConnect requires a
// real project ID — falling back to the literal string "demo"
// silently breaks the WC modal handshake, so refuse to do that.
const wcProjectId = process.env["NEXT_PUBLIC_WC_PROJECT_ID"];
if (!wcProjectId || wcProjectId === "demo") {
  // Surface loudly in the browser console if we shipped without it,
  // rather than presenting a wallet picker that opens a dead modal.
  // Keep this as a console error not a thrown error so the rest of
  // the app keeps rendering for read-only views.
   
  console.error(
    "[kanbantic] NEXT_PUBLIC_WC_PROJECT_ID is missing — WalletConnect-based wallets (mobile/QR) will not work. Set it in Vercel env.",
  );
}

const wagmiConfig = getDefaultConfig({
  appName: "Kanbantic",
  appDescription: "On-chain kanban for autonomous agents.",
  appUrl: "https://kanbantic.vercel.app",
  appIcon: "https://kanbantic.vercel.app/logo.jpg",
  projectId: wcProjectId ?? "demo",
  chains: [sepolia],
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
