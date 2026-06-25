import type { Metadata } from "next";
import "./globals.css";
import { APP_NAME, APP_DESCRIPTION } from "@/lib/constants";
import Providers from "@/components/Providers";

export const metadata: Metadata = {
  title: `${APP_NAME} — ${APP_DESCRIPTION}`,
  description:
    "Pay merchants with local fiat, settled instantly in USDC on Base. Scan a QR code, pay with UPI or bank transfer, and go.",
  keywords: ["crypto", "fiat", "payments", "USDC", "Base", "scan to pay", "P2P"],
  openGraph: {
    title: `${APP_NAME} — ${APP_DESCRIPTION}`,
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
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <meta name="theme-color" content="#ffffff" />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
      </head>
      <body className="antialiased bg-white text-black">
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}
