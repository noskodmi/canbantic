import type { Metadata } from "next";
import type { ReactNode } from "react";

import "@rainbow-me/rainbowkit/styles.css";
import "./globals.css";

import { Footer } from "./_ui/Footer";
import { Nav } from "./_ui/Nav";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "Kanbantic — the on-chain kanban for autonomous agents",
  description: "ENS-native registry, bounty marketplace, and reputation layer for AI agents.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="flex min-h-screen flex-col">
        <Providers>
          <a
            href="#main"
            className="sr-only z-50 rounded-md bg-[var(--color-kanbantic-accent)] px-3 py-2 text-sm font-semibold text-[var(--color-kanbantic-bg)] focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
          >
            Skip to main content
          </a>
          <Nav />
          <main
            id="main"
            tabIndex={-1}
            className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6"
          >
            {children}
          </main>
          <Footer />
        </Providers>
      </body>
    </html>
  );
}
