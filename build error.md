14:37:40.207 Running build in Washington, D.C., USA (East) – iad1
14:37:40.208 Build machine configuration: 4 cores, 8 GB
14:37:40.310 Cloning github.com/powerchoosers/power-choosers-crm (Branch: main, Commit: 4dd534a)
14:37:40.311 Previous build caches not available.
14:37:47.932 Cloning completed: 7.621s
14:37:51.605 Running "vercel build"
14:37:52.154 Vercel CLI 50.15.1
14:37:52.515 Installing dependencies...
14:37:55.485 npm warn deprecated scmp@2.1.0: Just use Node.js's crypto.timingSafeEqual()
14:38:18.216 
14:38:18.216 added 857 packages in 25s
14:38:18.216 
14:38:18.217 204 packages are looking for funding
14:38:18.217   run `npm fund` for details
14:38:18.323 Detected Next.js version: 16.1.4
14:38:18.333 Running "npm run build"
14:38:18.451 
14:38:18.452 > crm-platform@0.1.0 build
14:38:18.452 > next build --webpack
14:38:18.452 
14:38:19.305 Attention: Next.js now collects completely anonymous telemetry regarding usage.
14:38:19.305 This information is used to shape Next.js' roadmap and prioritize features.
14:38:19.305 You can learn more, including how to opt-out if you'd not like to participate in this anonymous program, by visiting the following URL:
14:38:19.305 https://nextjs.org/telemetry
14:38:19.305 
14:38:19.318 ▲ Next.js 16.1.4 (webpack)
14:38:19.318 
14:38:19.412   Creating an optimized production build ...
14:38:58.293 ✓ Compiled successfully in 35.8s
14:38:58.299   Running TypeScript ...
14:39:14.931 Failed to compile.
14:39:14.931 
14:39:14.931 ./src/app/network/contacts/[id]/page.tsx:142:25
14:39:14.931 Type error: 'searchParams' is possibly 'null'.
14:39:14.931 
14:39:14.931 [0m [90m 140 |[39m   }[33m,[39m [pendingTasks[33m.[39mlength])
14:39:14.931  [90m 141 |[39m
14:39:14.932 [31m[1m>[22m[39m[90m 142 |[39m   [36mconst[39m taskIdFromUrl [33m=[39m searchParams[33m.[39m[36mget[39m([32m'taskId'[39m)
14:39:14.932  [90m     |[39m                         [31m[1m^[22m[39m
14:39:14.932  [90m 143 |[39m   useEffect(() [33m=>[39m {
14:39:14.932  [90m 144 |[39m     [36mif[39m ([33m![39mtaskIdFromUrl [33m||[39m [33m![39mpendingTasks[33m.[39mlength) [36mreturn[39m
14:39:14.932  [90m 145 |[39m     [36mconst[39m idx [33m=[39m pendingTasks[33m.[39mfindIndex((t) [33m=>[39m t[33m.[39mid [33m===[39m taskIdFromUrl)[0m
14:39:14.974 Next.js build worker exited with code: 1 and signal: null
14:39:15.001 Error: Command "npm run build" exited with 1