import type { Metadata, Viewport } from "next";
import { Outfit, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { APP_NAME, APP_DESCRIPTION } from "@/lib/constants";
import nextDynamic from "next/dynamic";

const outfit = Outfit({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

const Providers = nextDynamic(() => import("@/components/Providers"), { ssr: false });

export const dynamic = "force-dynamic";

export const viewport: Viewport = {
  themeColor: "#131315",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export const metadata: Metadata = {
  title: `${APP_NAME} — ${APP_DESCRIPTION}`,
  description:
    "Instant non-custodial cross-chain crypto swaps across 9 blockchains (BTC, ETH, SOL, Base, Polygon, Arbitrum, BSC, Tron, Litecoin) and Developer Swap API with 50/50 USD revenue share.",
  keywords: ["crypto swap", "cross-chain swap", "swap api", "telegram bot swap api", "near intents", "bitcoin swap", "solana swap", "base swap", "zkpay"],
  openGraph: {
    title: `${APP_NAME} — ${APP_DESCRIPTION}`,
    description:
      "Instant cross-chain swaps across 9 blockchains. Integrate our Swap API into your app or bot in 5 minutes and earn 50% revenue share.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    "name": "ZkPay",
    "url": "https://zkpay.top",
    "applicationCategory": "FinanceApplication",
    "operatingSystem": "All",
    "description": "Instant cross-chain crypto swap provider and developer API with 50/50 USD partner revenue share.",
    "offers": {
      "@type": "Offer",
      "price": "0",
      "priceCurrency": "USD"
    }
  };

  return (
    <html lang="en" className={`${outfit.variable} ${jetbrainsMono.variable}`}>
      <body className="antialiased bg-surface text-on-surface font-sans selection:bg-primary/25 selection:text-on-surface">
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200"
          precedence="default"
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}
