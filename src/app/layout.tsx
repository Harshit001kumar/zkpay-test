import type { Metadata } from "next";
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
  return (
    <html lang="en" className={`${inter.variable} ${jetbrainsMono.variable}`}>
      <head>
        <meta name="theme-color" content="#131315" />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
      </head>
      <body className="antialiased bg-[#131315] text-[#e5e2e3] font-sans selection:bg-[#c0c6de]/25 selection:text-white">
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}
