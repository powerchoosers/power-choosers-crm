starting build "5c88a65e-118b-4e56-8b05-dad720690e03"
FETCHSOURCE
From https://github.com/powerchoosers/power-choosers-crm
 * branch            98fc0943b4e94eae81e8db363092be13a6923d8e -> FETCH_HEAD
Updating files:   7% (787/10000)Updating files:   8% (800/10000)Updating files:   9% (900/10000)Updating files:  10% (1000/10000)Updating files:  11% (1100/10000)Updating files:  12% (1200/10000)Updating files:  13% (1300/10000)Updating files:  14% (1400/10000)Updating files:  15% (1500/10000)Updating files:  16% (1600/10000)Updating files:  17% (1700/10000)Updating files:  18% (1800/10000)Updating files:  19% (1900/10000)Updating files:  20% (2000/10000)Updating files:  20% (2022/10000)Updating files:  21% (2100/10000)Updating files:  22% (2200/10000)Updating files:  23% (2300/10000)Updating files:  24% (2400/10000)Updating files:  25% (2500/10000)Updating files:  26% (2600/10000)Updating files:  27% (2700/10000)Updating files:  28% (2800/10000)Updating files:  29% (2900/10000)Updating files:  30% (3000/10000)Updating files:  31% (3100/10000)Updating files:  32% (3200/10000)Updating files:  33% (3300/10000)Updating files:  34% (3400/10000)Updating files:  35% (3500/10000)Updating files:  36% (3600/10000)Updating files:  37% (3700/10000)Updating files:  38% (3800/10000)Updating files:  39% (3900/10000)Updating files:  40% (4000/10000)Updating files:  41% (4100/10000)Updating files:  42% (4200/10000)Updating files:  43% (4300/10000)Updating files:  44% (4400/10000)Updating files:  45% (4500/10000)Updating files:  46% (4600/10000)Updating files:  47% (4700/10000)Updating files:  48% (4800/10000)Updating files:  49% (4900/10000)Updating files:  50% (5000/10000)Updating files:  51% (5100/10000)Updating files:  52% (5200/10000)Updating files:  53% (5300/10000)Updating files:  54% (5400/10000)Updating files:  55% (5500/10000)Updating files:  56% (5600/10000)Updating files:  57% (5700/10000)Updating files:  57% (5704/10000)Updating files:  58% (5800/10000)Updating files:  59% (5900/10000)Updating files:  60% (6000/10000)Updating files:  61% (6100/10000)Updating files:  62% (6200/10000)Updating files:  63% (6300/10000)Updating files:  64% (6400/10000)Updating files:  65% (6500/10000)Updating files:  66% (6600/10000)Updating files:  67% (6700/10000)Updating files:  68% (6800/10000)Updating files:  69% (6900/10000)Updating files:  70% (7000/10000)Updating files:  71% (7100/10000)Updating files:  72% (7200/10000)Updating files:  73% (7300/10000)Updating files:  74% (7400/10000)Updating files:  75% (7500/10000)Updating files:  76% (7600/10000)Updating files:  77% (7700/10000)Updating files:  78% (7800/10000)Updating files:  79% (7900/10000)Updating files:  80% (8000/10000)Updating files:  81% (8100/10000)Updating files:  82% (8200/10000)Updating files:  83% (8300/10000)Updating files:  84% (8400/10000)Updating files:  85% (8500/10000)Updating files:  86% (8600/10000)Updating files:  87% (8700/10000)Updating files:  88% (8800/10000)Updating files:  89% (8900/10000)Updating files:  90% (9000/10000)Updating files:  91% (9100/10000)Updating files:  92% (9200/10000)Updating files:  93% (9300/10000)Updating files:  94% (9400/10000)Updating files:  95% (9500/10000)Updating files:  96% (9600/10000)Updating files:  97% (9700/10000)Updating files:  98% (9800/10000)Updating files:  99% (9900/10000)Updating files: 100% (10000/10000)Updating files: 100% (10000/10000), done.
HEAD is now at 98fc094 Update branding to Nodal Point, fix SSL routing rules, and cleanup legacy files
GitCommit:
98fc0943b4e94eae81e8db363092be13a6923d8e
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
cd007ec038c4: Verifying Checksum
cd007ec038c4: Download complete
0a5453a6a95e: Verifying Checksum
0a5453a6a95e: Download complete
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
 ---> Running in b2a521f20a76
(1/3) Installing musl-obstack (1.2.3-r2)
(2/3) Installing libucontext (1.3.3-r0)
(3/3) Installing gcompat (1.1.0-r4)
OK: 11.0 MiB in 21 packages
Removing intermediate container b2a521f20a76
 ---> 769241c9a263
Step 4/39 : WORKDIR /app
 ---> Running in ee98a6ad7b74
Removing intermediate container ee98a6ad7b74
 ---> 9e58135a3929
Step 5/39 : COPY package.json package-lock.json* ./
 ---> dc4f5311ffa2
Step 6/39 : RUN npm ci
 ---> Running in 5b99a4585c0a
added 587 packages, and audited 588 packages in 28s
160 packages are looking for funding
  run `npm fund` for details
found 0 vulnerabilities
npm notice
npm notice New major version of npm available! 10.9.4 -> 11.8.0
npm notice Changelog: https://github.com/npm/cli/releases/tag/v11.8.0
npm notice To update run: npm install -g npm@11.8.0
npm notice
Removing intermediate container 5b99a4585c0a
 ---> ecb3c722c9eb
Step 7/39 : FROM base AS builder
 ---> ff729bb6df6b
Step 8/39 : WORKDIR /app
 ---> Running in fef7b8834ca2
Removing intermediate container fef7b8834ca2
 ---> 13b58afefff0
Step 9/39 : COPY --from=deps /app/node_modules ./node_modules
 ---> ab866c7a5f90
Step 10/39 : COPY . .
 ---> f317bea6bc02
Step 11/39 : ARG NEXT_PUBLIC_FIREBASE_API_KEY
 ---> Running in 9f4bba1ff842
Removing intermediate container 9f4bba1ff842
 ---> 1ff4dcefdbfe
Step 12/39 : ARG NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
 ---> Running in 4d2951177799
Removing intermediate container 4d2951177799
 ---> ddf964d74070
Step 13/39 : ARG NEXT_PUBLIC_FIREBASE_PROJECT_ID
 ---> Running in 40cbca4893f6
Removing intermediate container 40cbca4893f6
 ---> 8719c3bd4928
Step 14/39 : ARG NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
 ---> Running in c768b4a35e5e
Removing intermediate container c768b4a35e5e
 ---> d85c7c2bc9e4
Step 15/39 : ARG NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
 ---> Running in ab3cd3c7da7d
Removing intermediate container ab3cd3c7da7d
 ---> 7839cec442c1
Step 16/39 : ARG NEXT_PUBLIC_FIREBASE_APP_ID
 ---> Running in 92ce274eeb5c
Removing intermediate container 92ce274eeb5c
 ---> 50cabfd0dfbb
Step 17/39 : ENV NEXT_PUBLIC_FIREBASE_API_KEY=$NEXT_PUBLIC_FIREBASE_API_KEY
 ---> Running in eab14ef9568e
Removing intermediate container eab14ef9568e
 ---> 2c1d4c795443
Step 18/39 : ENV NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=$NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
 ---> Running in a7bb2ab3718c
Removing intermediate container a7bb2ab3718c
 ---> 338a1435478b
Step 19/39 : ENV NEXT_PUBLIC_FIREBASE_PROJECT_ID=$NEXT_PUBLIC_FIREBASE_PROJECT_ID
 ---> Running in 23f52fa2683f
Removing intermediate container 23f52fa2683f
 ---> 9b5a3fa31dfa
Step 20/39 : ENV NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=$NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
 ---> Running in 236f22e7d921
Removing intermediate container 236f22e7d921
 ---> 369bfb537566
Step 21/39 : ENV NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=$NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
 ---> Running in a5d6fe256be9
Removing intermediate container a5d6fe256be9
 ---> 67f6d7d0e38a
Step 22/39 : ENV NEXT_PUBLIC_FIREBASE_APP_ID=$NEXT_PUBLIC_FIREBASE_APP_ID
 ---> Running in 4afbac97ab2a
Removing intermediate container 4afbac97ab2a
 ---> ca0ec6d02866
Step 23/39 : ENV NEXT_TELEMETRY_DISABLED 1
 ---> Running in 089ee11cac65
Removing intermediate container 089ee11cac65
 ---> 8a70575aca53
Step 24/39 : RUN npm run build
 ---> Running in 79c099e00c83
> crm-platform@0.1.0 build
> next build
▲ Next.js 16.1.4 (Turbopack)
  Creating an optimized production build ...
✓ Compiled successfully in 28.7s
  Running TypeScript ...
Failed to compile.
./src/app/crm-platform/emails/[id]/page.tsx:116:36
Type error: Property 'snippet' does not exist on type 'Email'.
  114 |           ) : (
  115 |             <div className="whitespace-pre-wrap text-zinc-300 leading-relaxed">
> 116 |               {email.text || email.snippet || 'No content'}
      |                                    ^
  117 |             </div>
  118 |           )}
  119 |         </div>
Next.js build worker exited with code: 1 and signal: null
npm notice
npm notice New major version of npm available! 10.9.4 -> 11.8.0
npm notice Changelog: https://github.com/npm/cli/releases/tag/v11.8.0
npm notice To update run: npm install -g npm@11.8.0
npm notice
The command '/bin/sh -c npm run build' returned a non-zero code: 1
Finished Step #0
ERROR
ERROR: build step 0 "gcr.io/cloud-builders/docker" failed: step exited with non-zero status: 1
