import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { APP_NAME, APP_DESCRIPTION } from "@/lib/constants";
import nextDynamic from "next/dynamic";

const inter = Inter({
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
  title: `${APP_NAME} - ${APP_DESCRIPTION}`,
  description:
    "Pay merchants with local fiat, settled instantly in USDC on Base. Scan a QR code, pay with UPI or bank transfer, and go.",
  keywords: ["crypto", "fiat", "payments", "USDC", "Base", "scan to pay", "P2P"],
  openGraph: {
    title: `${APP_NAME} - ${APP_DESCRIPTION}`,
    description:
      "Pay merchants with local fiat, settled instantly in USDC on Base.",
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
    "description": "Pay merchants with local fiat, settled instantly in USDC on Base.",
    "offers": {
      "@type": "Offer",
      "price": "0",
      "priceCurrency": "USD"
    }
  };

  return (
    <html lang="en" className={`${inter.variable} ${jetbrainsMono.variable}`}>
      <body className="antialiased bg-[#131315] text-[#e5e2e3] font-sans selection:bg-[#c0c6de]/25 selection:text-white">
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200"
          // @ts-expect-error - React 18/19 resource precedence attribute
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
