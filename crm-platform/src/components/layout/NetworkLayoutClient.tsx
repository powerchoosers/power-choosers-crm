'use client'

import { Inter } from "next/font/google";
import { TopBar } from "@/components/layout/TopBar";
import { Sidebar } from "@/components/layout/Sidebar";
import { RightPanel } from "@/components/layout/RightPanel";
import { cn } from "@/lib/utils";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { LoadingOrb } from "@/components/ui/LoadingOrb";
import { GlobalSync } from "@/components/layout/GlobalSync";

const inter = Inter({ subsets: ["latin"] });

export function NetworkLayoutClient({
  children,
  initialHasSessionCookie = false,
}: {
  children: React.ReactNode;
  initialHasSessionCookie?: boolean;
}) {
  const { user, loading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    const hasSessionCookie = document.cookie.includes('np_session=1')
    if (!loading && !user && !hasSessionCookie) {
      router.replace('/login')
    }
  }, [loading, user, router])

  // Optimistic render: when we have a session cookie (returning user), show the full UI
  // immediately so LCP isn't blocked by auth. If auth then fails, we redirect.
  const showShell = !loading || (loading && initialHasSessionCookie)

  if (!showShell) {
    return (
      <div className={cn(inter.className, "bg-zinc-950 text-foreground antialiased min-h-screen flex items-center justify-center")}>
        <LoadingOrb label="Initialising Terminal..." />
      </div>
    )
  }

  if (!user) {
    const hasSessionCookie = typeof document !== 'undefined' && document.cookie.includes('np_session=1')
    // Optimistic: session cookie present and auth still loading — show full UI so LCP can paint
    if (loading && initialHasSessionCookie) {
      // Fall through to render shell + children
    } else if (process.env.NODE_ENV === 'development' && hasSessionCookie) {
      return (
        <div className={cn(inter.className, "bg-zinc-950 text-foreground antialiased min-h-screen flex items-center justify-center")}>
          <LoadingOrb label="Bypassing Security Protocols..." />
        </div>
      )
    } else {
      return (
        <div className={cn(inter.className, "bg-zinc-950 text-foreground antialiased min-h-screen flex items-center justify-center")}>
          <div className="flex flex-col items-center gap-4">
            <div className="text-sm text-zinc-500 font-mono uppercase tracking-widest">Unauthorized Access Detected</div>
            <button
              type="button"
              onClick={() => router.replace('/login')}
              className="px-6 py-2 rounded-xl nodal-glass nodal-glass-hover text-white font-medium transition-all"
            >
              Authenticate
            </button>
          </div>
        </div>
      )
    }
  }

  return (
    <div className={cn(inter.className, "bg-zinc-950 text-foreground antialiased overflow-hidden selection:bg-[#002FA7] selection:text-white h-screen w-screen relative")}>
      <GlobalSync />
      <TopBar />
      <Sidebar />
      <RightPanel />
      <main className="absolute top-0 bottom-0 left-[70px] right-0 lg:right-80 overflow-y-auto pt-24 pb-8 transition-all duration-300 scroll-smooth np-scroll">
        <div className="max-w-[1600px] 2xl:max-w-[1800px] mx-auto px-6 sm:px-8 lg:px-10">
          {children}
        </div>
      </main>
    </div>
  );
}
