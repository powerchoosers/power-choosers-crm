export default function Loading() {
  return (
    <div className="flex h-[calc(100vh-6rem)] w-full items-center justify-center">
      <div className="relative flex flex-col items-center gap-4">
        {/* Pulsing Signal Ring */}
        <div className="relative flex h-16 w-16 items-center justify-center">
          <div className="absolute h-full w-full animate-ping rounded-full bg-signal opacity-20" />
          <div className="relative h-8 w-8 rounded-full bg-signal shadow-[0_0_20px_rgba(0,47,167,0.5)]" />
        </div>
        
        {/* Loading Text */}
        <div className="flex flex-col items-center gap-1">
          <div className="text-sm font-medium tracking-widest text-white uppercase">Loading</div>
          <div className="text-[10px] text-zinc-500 font-mono">System Processing...</div>
        </div>
      </div>
    </div>
  )
}
