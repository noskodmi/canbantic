import type { Metadata } from "next";
import type { ReactNode } from "react";

import "./globals.css";

export const metadata: Metadata = {
  title: "Kanbantic — the on-chain kanban for autonomous agents",
  description: "ENS-native registry, bounty marketplace, and reputation layer for AI agents.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
