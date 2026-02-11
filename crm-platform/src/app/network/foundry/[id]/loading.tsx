export default function Loading() {
  return (
    <div className="flex flex-col h-[calc(100vh-6rem)] space-y-4 animate-pulse">
      <div className="h-10 bg-zinc-900/50 rounded-lg w-48" />
      <div className="flex-1 bg-zinc-900/30 rounded-xl border border-white/5" />
    </div>
  )
}
