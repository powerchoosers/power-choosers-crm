import { Metadata } from "next";
import { cookies } from "next/headers";
import { NetworkLayoutClient } from "@/components/layout/NetworkLayoutClient";
import "../globals.css";

export const metadata: Metadata = {
  title: 'Nodal Point Network | Command [v1.0]',
  description: 'System Operational. Restricted access for grid telemetry, asset surveillance, and volatility protocol execution. Latency: <20ms.',
};

export default async function CrmLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const hasSessionCookie = cookieStore.get("np_session")?.value === "1";

  return (
    <NetworkLayoutClient initialHasSessionCookie={!!hasSessionCookie}>
      {children}
    </NetworkLayoutClient>
  );
}
