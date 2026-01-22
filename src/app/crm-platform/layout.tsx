import { Inter } from "next/font/google";
import "../globals.css";
import { TopBar } from "@/components/layout/TopBar";
import { Sidebar } from "@/components/layout/Sidebar";
import { RightPanel } from "@/components/layout/RightPanel";
import { cn } from "@/lib/utils";

const inter = Inter({ subsets: ["latin"] });

export default function CrmLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className={cn(inter.className, "bg-background text-foreground antialiased overflow-x-hidden selection:bg-signal selection:text-white min-h-screen")}>
        <TopBar />
        <Sidebar />
        <RightPanel />
        <main className="min-h-screen pl-16 pt-24 pr-4 pb-8 transition-all duration-300 xl:pr-80">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              {children}
          </div>
        </main>
    </div>
  );
}
