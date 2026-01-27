"use client"

export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-950 text-zinc-100">
      <div className="max-w-md p-6 rounded-2xl border border-white/10 bg-zinc-900/60 backdrop-blur-xl text-center">
        <h1 className="text-xl font-bold mb-2">Something went wrong</h1>
        <p className="text-zinc-400 text-sm mb-4">{error.message || 'An unexpected error occurred.'}</p>
        <button onClick={reset} className="px-3 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700">Try again</button>
      </div>
    </div>
  )
}
