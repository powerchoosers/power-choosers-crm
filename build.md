cution details
Build artifacts
Log viewer toolbar
starting build "0dd3889e-f131-49fa-866a-336966755268"
FETCHSOURCE
From https://github.com/powerchoosers/power-choosers-crm
 * branch            ad34de1f49b93e84d14e868113760e70f63faea2 -> FETCH_HEAD
Updating files:   8% (826/10000)Updating files:   9% (900/10000)Updating files:  10% (1000/10000)Updating files:  11% (1100/10000)Updating files:  12% (1200/10000)Updating files:  13% (1300/10000)Updating files:  14% (1400/10000)Updating files:  15% (1500/10000)Updating files:  16% (1600/10000)Updating files:  17% (1700/10000)Updating files:  18% (1800/10000)Updating files:  19% (1900/10000)Updating files:  20% (2000/10000)Updating files:  21% (2100/10000)Updating files:  22% (2200/10000)Updating files:  23% (2300/10000)Updating files:  24% (2400/10000)Updating files:  25% (2500/10000)Updating files:  26% (2600/10000)Updating files:  27% (2700/10000)Updating files:  28% (2800/10000)Updating files:  29% (2900/10000)Updating files:  30% (3000/10000)Updating files:  31% (3100/10000)Updating files:  32% (3200/10000)Updating files:  32% (3213/10000)Updating files:  33% (3300/10000)Updating files:  34% (3400/10000)Updating files:  35% (3500/10000)Updating files:  36% (3600/10000)Updating files:  37% (3700/10000)Updating files:  38% (3800/10000)Updating files:  39% (3900/10000)Updating files:  40% (4000/10000)Updating files:  41% (4100/10000)Updating files:  42% (4200/10000)Updating files:  43% (4300/10000)Updating files:  44% (4400/10000)Updating files:  45% (4500/10000)Updating files:  46% (4600/10000)Updating files:  47% (4700/10000)Updating files:  48% (4800/10000)Updating files:  49% (4900/10000)Updating files:  50% (5000/10000)Updating files:  51% (5100/10000)Updating files:  52% (5200/10000)Updating files:  53% (5300/10000)Updating files:  54% (5400/10000)Updating files:  55% (5500/10000)Updating files:  56% (5600/10000)Updating files:  57% (5700/10000)Updating files:  58% (5800/10000)Updating files:  59% (5900/10000)Updating files:  60% (6000/10000)Updating files:  61% (6100/10000)Updating files:  62% (6200/10000)Updating files:  62% (6295/10000)Updating files:  63% (6300/10000)Updating files:  64% (6400/10000)Updating files:  65% (6500/10000)Updating files:  66% (6600/10000)Updating files:  67% (6700/10000)Updating files:  68% (6800/10000)Updating files:  69% (6900/10000)Updating files:  70% (7000/10000)Updating files:  71% (7100/10000)Updating files:  72% (7200/10000)Updating files:  73% (7300/10000)Updating files:  74% (7400/10000)Updating files:  75% (7500/10000)Updating files:  76% (7600/10000)Updating files:  77% (7700/10000)Updating files:  78% (7800/10000)Updating files:  79% (7900/10000)Updating files:  80% (8000/10000)Updating files:  81% (8100/10000)Updating files:  82% (8200/10000)Updating files:  83% (8300/10000)Updating files:  84% (8400/10000)Updating files:  85% (8500/10000)Updating files:  86% (8600/10000)Updating files:  87% (8700/10000)Updating files:  88% (8800/10000)Updating files:  89% (8900/10000)Updating files:  90% (9000/10000)Updating files:  91% (9100/10000)Updating files:  92% (9200/10000)Updating files:  93% (9300/10000)Updating files:  94% (9400/10000)Updating files:  95% (9500/10000)Updating files:  96% (9600/10000)Updating files:  97% (9700/10000)Updating files:  98% (9800/10000)Updating files:  99% (9900/10000)Updating files: 100% (10000/10000)Updating files: 100% (10000/10000), done.
HEAD is now at ad34de1 Fix TypeScript error: Add snippet property to Email interface
GitCommit:
ad34de1f49b93e84d14e868113760e70f63faea2
BUILD
Starting Step #0
Already have image (with digest): gcr.io/cloud-builders/docker
Sending build context to Docker daemon   41.1MB
Step 1/39 : FROM node:22-alpine AS base
22-alpine: Pulling from library/node
1074353eec0d: Already exists
27dda044491a: Pulling fs layer
0a5453a6a95e: Pulling fs layer
cd007ec038c4: Pulling fs layer
0a5453a6a95e: Verifying Checksum
0a5453a6a95e: Download complete
cd007ec038c4: Verifying Checksum
cd007ec038c4: Download complete
27dda044491a: Verifying Checksum
27dda044491a: Download complete
27dda044491a: Pull complete
0a5453a6a95e: Pull complete
cd007ec038c4: Pull complete
Digest: sha256:a9cd9bac76cf2396abf14ff0d1c3671a8175fe577ce350e62ab0fc1678050176
Status: Downloaded newer image for node:22-alpine
 ---> ff729bb6df6b
Step 2/39 : FROM base AS deps
 ---> ff729bb6df6b
Step 3/39 : RUN apk add --no-cache libc6-compat
 ---> Running in c376541b9dab
(1/3) Installing musl-obstack (1.2.3-r2)
(2/3) Installing libucontext (1.3.3-r0)
(3/3) Installing gcompat (1.1.0-r4)
OK: 11.0 MiB in 21 packages
Removing intermediate container c376541b9dab
 ---> e9e604f85b2e
Step 4/39 : WORKDIR /app
 ---> Running in 09a560180397
Removing intermediate container 09a560180397
 ---> 88902093a583
Step 5/39 : COPY package.json package-lock.json* ./
 ---> f85943891a62
Step 6/39 : RUN npm ci
 ---> Running in 4c9a107a2d9f
added 587 packages, and audited 588 packages in 31s
160 packages are looking for funding
  run `npm fund` for details
found 0 vulnerabilities
npm notice
npm notice New major version of npm available! 10.9.4 -> 11.8.0
npm notice Changelog: https://github.com/npm/cli/releases/tag/v11.8.0
npm notice To update run: npm install -g npm@11.8.0
npm notice
Removing intermediate container 4c9a107a2d9f
 ---> 2ee5b265bbde
Step 7/39 : FROM base AS builder
 ---> ff729bb6df6b
Step 8/39 : WORKDIR /app
 ---> Running in 128c256d899f
Removing intermediate container 128c256d899f
 ---> 11b0558530c7
Step 9/39 : COPY --from=deps /app/node_modules ./node_modules
 ---> 3e1ba97bd02f
Step 10/39 : COPY . .
 ---> 35ff0daf5e90
Step 11/39 : ARG NEXT_PUBLIC_FIREBASE_API_KEY
 ---> Running in 3cfa41cb70cf
Removing intermediate container 3cfa41cb70cf
 ---> 32c6962d9156
Step 12/39 : ARG NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
 ---> Running in c9ca731eff63
Removing intermediate container c9ca731eff63
 ---> 5f546ef006c0
Step 13/39 : ARG NEXT_PUBLIC_FIREBASE_PROJECT_ID
 ---> Running in 3dadd1ecde40
Removing intermediate container 3dadd1ecde40
 ---> 9cbacf6b0c47
Step 14/39 : ARG NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
 ---> Running in 9b1f74eb1a13
Removing intermediate container 9b1f74eb1a13
 ---> 60861fd30719
Step 15/39 : ARG NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
 ---> Running in 53ed9285b9e4
Removing intermediate container 53ed9285b9e4
 ---> 37dda15fa248
Step 16/39 : ARG NEXT_PUBLIC_FIREBASE_APP_ID
 ---> Running in 01b30417c792
Removing intermediate container 01b30417c792
 ---> 99bab6e2eb46
Step 17/39 : ENV NEXT_PUBLIC_FIREBASE_API_KEY=$NEXT_PUBLIC_FIREBASE_API_KEY
 ---> Running in 09d24efe0f19
Removing intermediate container 09d24efe0f19
 ---> d6b40180bc03
Step 18/39 : ENV NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=$NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
 ---> Running in 5084f5faae48
Removing intermediate container 5084f5faae48
 ---> 47d5fa65ef27
Step 19/39 : ENV NEXT_PUBLIC_FIREBASE_PROJECT_ID=$NEXT_PUBLIC_FIREBASE_PROJECT_ID
 ---> Running in 313f3530a674
Removing intermediate container 313f3530a674
 ---> f2b1709765d7
Step 20/39 : ENV NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=$NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
 ---> Running in 416a165d3bc0
Removing intermediate container 416a165d3bc0
 ---> 77cc3a5ea334
Step 21/39 : ENV NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=$NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
 ---> Running in cd228ad7c719
Removing intermediate container cd228ad7c719
 ---> 92e4ce788531
Step 22/39 : ENV NEXT_PUBLIC_FIREBASE_APP_ID=$NEXT_PUBLIC_FIREBASE_APP_ID
 ---> Running in 18af4c4ddaf2
Removing intermediate container 18af4c4ddaf2
 ---> c2afc32e6deb
Step 23/39 : ENV NEXT_TELEMETRY_DISABLED 1
 ---> Running in ff9e1128c18e
Removing intermediate container ff9e1128c18e
 ---> 429175663cfa
Step 24/39 : RUN npm run build
 ---> Running in e400b4d25816
> crm-platform@0.1.0 build
> next build
▲ Next.js 16.1.4 (Turbopack)
  Creating an optimized production build ...
✓ Compiled successfully in 25.4s
  Running TypeScript ...
  Collecting page data using 1 worker ...
  Generating static pages using 1 worker (0/16) ...
Firebase Config Loaded: {
  projectId: 'power-choosers-crm',
  authDomain: 'power-choosers-crm.firebaseapp.com',
  apiKeyPresent: true
}
  Generating static pages using 1 worker (4/16) 
  Generating static pages using 1 worker (8/16) 
  Generating static pages using 1 worker (12/16) 
✓ Generating static pages using 1 worker (16/16) in 866.2ms
  Finalizing page optimization ...
Route (app)
┌ ○ /
├ ○ /_not-found
├ ○ /crm-platform
├ ○ /crm-platform/accounts
├ ○ /crm-platform/calls
├ ○ /crm-platform/emails
├ ƒ /crm-platform/emails/[id]
├ ○ /crm-platform/energy
├ ○ /crm-platform/people
├ ○ /crm-platform/scripts
├ ○ /crm-platform/sequences
├ ○ /crm-platform/settings
├ ○ /crm-platform/tasks
├ ○ /icon.png
└ ○ /login
ƒ Proxy (Middleware)
○  (Static)   prerendered as static content
ƒ  (Dynamic)  server-rendered on demand
npm notice
npm notice New major version of npm available! 10.9.4 -> 11.8.0
npm notice Changelog: https://github.com/npm/cli/releases/tag/v11.8.0
npm notice To update run: npm install -g npm@11.8.0
npm notice
Removing intermediate container e400b4d25816
 ---> f8d7a13e8404
Step 25/39 : FROM base AS runner
 ---> ff729bb6df6b
Step 26/39 : WORKDIR /app
 ---> Using cache
 ---> 11b0558530c7
Step 27/39 : ENV NODE_ENV production
 ---> Running in f7c2cc90279b
Removing intermediate container f7c2cc90279b
 ---> 9dfa12c58ff8
Step 28/39 : ENV NEXT_TELEMETRY_DISABLED 1
 ---> Running in 4943aa5d113b
Removing intermediate container 4943aa5d113b
 ---> fd903d91b868
Step 29/39 : RUN addgroup --system --gid 1001 nodejs
 ---> Running in ef4c8ea4bcb7
Removing intermediate container ef4c8ea4bcb7
 ---> 30e4eb2f3543
Step 30/39 : RUN adduser --system --uid 1001 nextjs
 ---> Running in 236ae38e4d01
Removing intermediate container 236ae38e4d01
 ---> 3a94596827f0
Step 31/39 : COPY --from=builder /app/public ./public
 ---> 60e4da2c37e0
Step 32/39 : RUN mkdir .next
 ---> Running in f7db7c48c58f
Removing intermediate container f7db7c48c58f
 ---> 957b1e27cd74
Step 33/39 : RUN chown nextjs:nodejs .next
 ---> Running in 09e935e30c87
Removing intermediate container 09e935e30c87
 ---> 6af0ab54e545
Step 34/39 : COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY failed: stat app/.next/standalone: file does not exist
Finished Step #0
ERROR
ERROR: build step 0 "gcr.io/cloud-builders/docker" failed: step exited with non-zero status: 1