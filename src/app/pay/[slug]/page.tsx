import type { Metadata } from "next";
import { PaylinkCheckout } from "@/components/paylink/PaylinkCheckout";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Pay with Crypto — ZkPay Paylink",
  description:
    "Send payment in any supported cryptocurrency and automatically convert into the recipient's chosen currency.",
};

export default function PaylinkPage({ params }: { params: { slug: string } }) {
  return <PaylinkCheckout slug={params.slug} />;
}
