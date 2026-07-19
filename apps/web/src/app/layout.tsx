import type { Metadata } from "next";
import { Inter, IBM_Plex_Mono, Space_Grotesk } from "next/font/google";
import Link from "next/link";
import "./globals.css";
import { Mark } from "@/components/Mark";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-plex-mono",
});
const grotesk = Space_Grotesk({ subsets: ["latin"], variable: "--font-grotesk" });

export const metadata: Metadata = {
  title: "SOLVENCY — risk-adjusted valuation for the agent economy",
  description:
    "Before an agent trusts a balance or signs a transaction, SOLVENCY reports how much of that value is really at risk — in dollars, not a warning label.",
  icons: [{ rel: "icon", url: "/favicon.svg", type: "image/svg+xml" }],
};

const nav = [
  ["/interface", "Interface"],
  ["/wallet-lab", "Wallet Lab"],
  ["/findings", "Findings"],
  ["/protocol", "Protocol"],
  ["/status", "Status"],
] as const;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${plexMono.variable} ${grotesk.variable}`}>
      <body className="min-h-screen bg-bg text-ink">
        <header className="border-b border-hairline">
          <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
            <Link href="/" className="flex items-center gap-2.5 text-ink" aria-label="SOLVENCY home">
              <Mark className="h-6 w-6" />
              <span className="font-display text-sm font-semibold tracking-[0.3em]">SOLVENCY</span>
            </Link>
            <nav aria-label="Main">
              <ul className="flex items-center gap-1 text-sm">
                {nav.map(([href, label]) => (
                  <li key={href}>
                    <Link
                      href={href}
                      className="rounded px-3 py-1.5 text-muted transition-colors hover:bg-surface hover:text-ink"
                    >
                      {label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          </div>
        </header>
        <main>{children}</main>
        <footer className="mt-24 border-t border-hairline">
          <div className="mx-auto max-w-6xl px-4 py-8 text-xs leading-relaxed text-muted">
            <p className="figure">
              SOLVENCY reports valuation risk, not investment advice, and does not guarantee a
              contract is safe.
            </p>
            <p className="mt-2">
              Never submit private keys, seed phrases, passwords, OTP codes or any other secret. A
              public wallet address is the only credential SOLVENCY needs.
            </p>
            <p className="mt-4">
              A paid A2MCP agent service on OKX.AI · settled in USDT0 on X Layer (eip155:196)
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
