import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service - ZkPay",
  description: "Terms of service and non-custodial smart contract usage guidelines for ZkPay.",
};

export default function TermsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
