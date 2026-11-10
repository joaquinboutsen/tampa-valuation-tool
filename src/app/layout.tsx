import type { Metadata, Viewport } from "next";
import { Inter, Source_Serif_4 } from "next/font/google";
import Link from "next/link";
import { SITE } from "@/lib/site";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const serif = Source_Serif_4({ subsets: ["latin"], variable: "--font-source-serif", display: "swap" });

export const metadata: Metadata = {
  title: { default: `${SITE.name} | ${SITE.author}`, template: `%s | ${SITE.name}` },
  description: SITE.tagline,
};

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${serif.variable}`}>
      <body className="min-h-screen flex flex-col">
        <header className="bg-navy text-white">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 h-14 flex items-center justify-between gap-4">
            <Link href="/" className="flex items-baseline gap-2 min-w-0">
              <span className="font-serif text-lg font-semibold tracking-tight whitespace-nowrap">{SITE.name}</span>
              <span className="hidden sm:inline text-xs text-white/70 truncate">by {SITE.author}</span>
            </Link>
            <nav className="flex items-center gap-4 sm:gap-6 text-sm text-white/85">
              <Link href="/methodology" className="hover:text-white">
                Methodology
              </Link>
              <a href={SITE.linkedin} target="_blank" rel="noopener noreferrer" className="hover:text-white">
                LinkedIn
              </a>
            </nav>
          </div>
        </header>
        <main className="flex-1">{children}</main>
        <footer className="border-t border-line bg-card mt-12">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 py-6 text-xs text-muted space-y-1">
            <p>
              Financial statements: U.S. Securities and Exchange Commission (EDGAR). Market data: Finnhub. Every figure on this site links
              back to its source.
            </p>
            <p>
              Built by {SITE.author} as an educational project. Nothing here is investment advice. See the{" "}
              <Link href="/methodology" className="link">
                methodology
              </Link>{" "}
              for formulas and limitations.
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
