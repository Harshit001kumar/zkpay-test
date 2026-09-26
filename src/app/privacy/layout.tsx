import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy - ZkPay",
  description: "Privacy policy and non-custodial cryptographic guarantees for ZkPay protocol.",
};

export default function PrivacyLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
