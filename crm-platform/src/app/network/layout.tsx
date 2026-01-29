import { Metadata } from "next";
import { NetworkLayoutClient } from "@/components/layout/NetworkLayoutClient";
import "../globals.css";

export const metadata: Metadata = {
  title: 'Nodal Point Network | Command [v1.0]',
  description: 'System Operational. Restricted access for grid telemetry, asset surveillance, and volatility protocol execution. Latency: <20ms.',
};

export default function CrmLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <NetworkLayoutClient>
      {children}
    </NetworkLayoutClient>
  );
}
