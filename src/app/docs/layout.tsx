import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Documentation - ZkPay API & Protocol",
  description:
    "Explore ZkPay API endpoints, developer quickstart, 50/50 fee split integration, and smart contract architecture on Base.",
};

export default function DocsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
