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
          <Nav />
          <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">{children}</main>
          <Footer />
        </Providers>
      </body>
    </html>
  );
}
