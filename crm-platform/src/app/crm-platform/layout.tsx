'use client'
import { Inter } from "next/font/google";
import "../globals.css";
import { TopBar } from "@/components/layout/TopBar";
import { Sidebar } from "@/components/layout/Sidebar";
import { RightPanel } from "@/components/layout/RightPanel";
import { cn } from "@/lib/utils";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";

const inter = Inter({ subsets: ["latin"] });

export default function CrmLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const { user, loading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!loading && !user) {
      router.replace('/login')
    }
  }, [loading, user, router])

  if (loading) {
    return (
      <div className={cn(inter.className, "bg-background text-foreground antialiased min-h-screen flex items-center justify-center")}> 
        <div className="flex flex-col items-center gap-4">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-zinc-700 border-t-zinc-400" />
          <div className="text-sm text-zinc-400">Loading Nodal Point...</div>
        </div>
      </div>
    )
  }
  if (!user) {
    return (
      <div className={cn(inter.className, "bg-background text-foreground antialiased min-h-screen flex items-center justify-center")}> 
        <div className="flex flex-col items-center gap-4">
          <div className="text-sm text-zinc-400">Redirecting to login...</div>
          <button
            type="button"
            onClick={() => router.replace('/login')}
            className="px-4 py-2 rounded-md bg-white text-zinc-950 hover:bg-zinc-200 font-medium"
          >
            Go to Login
          </button>
        </div>
      </div>
    )
  }
  return (
    <div className={cn(inter.className, "bg-background text-foreground antialiased overflow-hidden selection:bg-signal selection:text-white h-screen w-screen relative")}>
        <TopBar />
        <Sidebar />
        <RightPanel />
        <main className="absolute top-0 bottom-0 left-16 right-0 lg:right-80 overflow-y-auto pt-24 pb-8 transition-all duration-300 scroll-smooth np-scroll">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              {children}
          </div>
        </main>
    </div>
  );
}
