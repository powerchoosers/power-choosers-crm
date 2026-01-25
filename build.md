INFO 2026-01-25T17:36:24.806132Z Starting new instance. Reason: DEPLOYMENT_ROLLOUT - Instance started due to traffic shifting between revisions due to deployment, traffic split adjustment, or deployment health check.
DEFAULT 2026-01-25T17:36:25.315924Z node:internal/modules/cjs/loader:1386
DEFAULT 2026-01-25T17:36:25.315943Z throw err;
DEFAULT 2026-01-25T17:36:25.315946Z ^
ERROR 2026-01-25T17:36:25.315975Z Error: Cannot find module '/app/server.js' at Function._resolveFilename (node:internal/modules/cjs/loader:1383:15) at defaultResolveImpl (node:internal/modules/cjs/loader:1025:19) at resolveForCJSWithHooks (node:internal/modules/cjs/loader:1030:22) at Function._load (node:internal/modules/cjs/loader:1192:37) at TracingChannel.traceSync (node:diagnostics_channel:328:14) at wrapModuleLoad (node:internal/modules/cjs/loader:237:24) at Function.executeUserEntryPoint [as runMain] (node:internal/modules/run_main:171:5) at node:internal/main/run_main_module:36:49 {
  {
    "textPayload": "Error: Cannot find module '/app/server.js'\n    at Function._resolveFilename (node:internal/modules/cjs/loader:1383:15)\n    at defaultResolveImpl (node:internal/modules/cjs/loader:1025:19)\n    at resolveForCJSWithHooks (node:internal/modules/cjs/loader:1030:22)\n    at Function._load (node:internal/modules/cjs/loader:1192:37)\n    at TracingChannel.traceSync (node:diagnostics_channel:328:14)\n    at wrapModuleLoad (node:internal/modules/cjs/loader:237:24)\n    at Function.executeUserEntryPoint [as runMain] (node:internal/modules/run_main:171:5)\n    at node:internal/main/run_main_module:36:49 {",
    "insertId": "697654990004d247cebd4955",
    "resource": {
      "type": "cloud_run_revision",
      "labels": {
        "service_name": "power-choosers-crm",
        "configuration_name": "power-choosers-crm",
        "revision_name": "power-choosers-crm-01028-zw2",
        "project_id": "power-choosers-crm",
        "location": "us-south1"
      }
    },
    "timestamp": "2026-01-25T17:36:25.315975Z",
    "severity": "ERROR",
    "labels": {
      "instanceId": "005eb6974ca4f13c218f06d3ec6054789d21eb34511ec3720daaf239b930f61369fcaf27b3e9d847a2622756bbb031dce83dc1e9113997869600c0eb0df4e0e7229c5ee76d879085c5b5d50642"
    },
    "logName": "projects/power-choosers-crm/logs/run.googleapis.com%2Fstderr",
    "receiveTimestamp": "2026-01-25T17:36:25.650814710Z",
    "errorGroups": [
      {
        "id": "CNj546-vjOW8pAE"
      }
    ]
  }
DEFAULT 2026-01-25T17:36:25.315978Z code: 'MODULE_NOT_FOUND',
DEFAULT 2026-01-25T17:36:25.315980Z requireStack: []
DEFAULT 2026-01-25T17:36:25.315983Z }
DEFAULT 2026-01-25T17:36:25.315987Z Node.js v22.22.0
WARNING 2026-01-25T17:36:25.931639344Z Container called exit(1).
ERROR 2026-01-25T17:36:26.022661Z Default STARTUP TCP probe failed 1 time consecutively for container "placeholder-1" on port 3000. The instance was not started. Connection failed with status CANCELLED.



2026-01-25 11:31:35.178
starting build "bdb8117e-3a7d-4482-9ccf-a142df89f31a" 

2026-01-25 11:31:35.179
FETCHSOURCE
2026-01-25 11:31:43.383
From https://github.com/powerchoosers/power-choosers-crm
2026-01-25 11:31:43.383
 * branch            be691bf1fddc9dde70ae7e3a98738985464ae54b -> FETCH_HEAD
2026-01-25 11:31:46.847
Updating files:   7% (797/9972)
Updating files:   8% (798/9972)
Updating files:   9% (898/9972)
Updating files:  10% (998/9972)
Updating files:  11% (1097/9972)
Updating files:  12% (1197/9972)
Updating files:  13% (1297/9972)
Updating files:  14% (1397/9972)
Updating files:  15% (1496/9972)
Updating files:  16% (1596/9972)
Updating files:  17% (1696/9972)
Updating files:  18% (1795/9972)
Updating files:  19% (1895/9972)
Updating files:  20% (1995/9972)
Updating files:  21% (2095/9972)
Updating files:  22% (2194/9972)
Updating files:  23% (2294/9972)
Updating files:  24% (2394/9972)
Updating files:  25% (2493/9972)
Updating files:  26% (2593/9972)
Updating files:  27% (2693/9972)
Updating files:  28% (2793/9972)
Updating files:  29% (2892/9972)
Updating files:  30% (2992/9972)
Updating files:  31% (3092/9972)
Updating files:  32% (3192/9972)
Updating files:  33% (3291/9972)
Updating files:  34% (3391/9972)
Updating files:  35% (3491/9972)
Updating files:  36% (3590/9972)
Updating files:  37% (3690/9972)
Updating files:  38% (3790/9972)
Updating files:  39% (3890/9972)
Updating files:  40% (3989/9972)
Updating files:  41% (4089/9972)
Updating files:  42% (4189/9972)
Updating files:  43% (4288/9972)
Updating files:  44% (4388/9972)
Updating files:  45% (4488/9972)
Updating files:  46% (4588/9972)
Updating files:  46% (4658/9972)
Updating files:  47% (4687/9972)
Updating files:  48% (4787/9972)
Updating files:  49% (4887/9972)
Updating files:  50% (4986/9972)
Updating files:  51% (5086/9972)
Updating files:  52% (5186/9972)
Updating files:  53% (5286/9972)
Updating files:  54% (5385/9972)
Updating files:  55% (5485/9972)
Updating files:  56% (5585/9972)
Updating files:  57% (5685/9972)
Updating files:  58% (5784/9972)
Updating files:  59% (5884/9972)
Updating files:  60% (5984/9972)
Updating files:  61% (6083/9972)
Updating files:  62% (6183/9972)
Updating files:  63% (6283/9972)
Updating files:  64% (6383/9972)
Updating files:  64% (6434/9972)
Updating files:  65% (6482/9972)
Updating files:  66% (6582/9972)
Updating files:  67% (6682/9972)
Updating files:  68% (6781/9972)
Updating files:  69% (6881/9972)
Updating files:  70% (6981/9972)
Updating files:  71% (7081/9972)
Updating files:  72% (7180/9972)
Updating files:  73% (7280/9972)
Updating files:  74% (7380/9972)
Updating files:  75% (7479/9972)
Updating files:  76% (7579/9972)
Updating files:  77% (7679/9972)
Updating files:  78% (7779/9972)
Updating files:  79% (7878/9972)
Updating files:  80% (7978/99… [message truncated due to size]
2026-01-25 11:31:46.861
HEAD is now at be691bf chore: fix deployment config and migrate api to supabase
2026-01-25 11:31:46.866
GitCommit:
2026-01-25 11:31:46.868
be691bf1fddc9dde70ae7e3a98738985464ae54b
2026-01-25 11:31:48.927
BUILD
2026-01-25 11:31:49.485
Starting Step #0
2026-01-25 11:31:49.492
Step #0: Already have image (with digest): gcr.io/cloud-builders/docker
2026-01-25 11:31:50.624
Step #0: Sending build context to Docker daemon  41.49MB

2026-01-25 11:31:50.631
Step #0: Step 1/43 : FROM node:22-alpine AS base
2026-01-25 11:31:52.532
Step #0: 22-alpine: Pulling from library/node
2026-01-25 11:31:53.292
Step #0: 1074353eec0d: Already exists
2026-01-25 11:31:53.301
Step #0: 27dda044491a: Pulling fs layer
2026-01-25 11:31:53.301
Step #0: 0a5453a6a95e: Pulling fs layer
2026-01-25 11:31:53.301
Step #0: cd007ec038c4: Pulling fs layer
2026-01-25 11:31:53.796
Step #0: 0a5453a6a95e: Verifying Checksum
2026-01-25 11:31:53.796
Step #0: 0a5453a6a95e: Download complete
2026-01-25 11:31:53.946
Step #0: cd007ec038c4: Verifying Checksum
2026-01-25 11:31:53.946
Step #0: cd007ec038c4: Download complete
2026-01-25 11:31:54.422
Step #0: 27dda044491a: Verifying Checksum
2026-01-25 11:31:54.422
Step #0: 27dda044491a: Download complete
2026-01-25 11:31:56.607
Step #0: 27dda044491a: Pull complete
2026-01-25 11:31:56.750
Step #0: 0a5453a6a95e: Pull complete
2026-01-25 11:31:56.821
Step #0: cd007ec038c4: Pull complete
2026-01-25 11:31:56.837
Step #0: Digest: sha256:a9cd9bac76cf2396abf14ff0d1c3671a8175fe577ce350e62ab0fc1678050176
2026-01-25 11:31:56.844
Step #0: Status: Downloaded newer image for node:22-alpine
2026-01-25 11:31:56.848
Step #0:  ---> ff729bb6df6b
2026-01-25 11:31:56.848
Step #0: Step 2/43 : FROM base AS deps
2026-01-25 11:31:56.848
Step #0:  ---> ff729bb6df6b
2026-01-25 11:31:56.848
Step #0: Step 3/43 : RUN apk add --no-cache libc6-compat
2026-01-25 11:31:57.566
Step #0:  ---> Running in e2fd32d64614
2026-01-25 11:31:58.546
Step #0: (1/3) Installing musl-obstack (1.2.3-r2)
2026-01-25 11:31:58.554
Step #0: (2/3) Installing libucontext (1.3.3-r0)
2026-01-25 11:31:58.563
Step #0: (3/3) Installing gcompat (1.1.0-r4)
2026-01-25 11:31:58.575
Step #0: OK: 11.0 MiB in 21 packages
2026-01-25 11:31:58.875
Step #0: Removing intermediate container e2fd32d64614
2026-01-25 11:31:58.875
Step #0:  ---> 99e8d12f2800
2026-01-25 11:31:58.875
Step #0: Step 4/43 : WORKDIR /app
2026-01-25 11:31:58.905
Step #0:  ---> Running in 595207eff49e
2026-01-25 11:31:59.002
Step #0: Removing intermediate container 595207eff49e
2026-01-25 11:31:59.002
Step #0:  ---> 3a6d14a56948
2026-01-25 11:31:59.002
Step #0: Step 5/43 : COPY package.json package-lock.json* ./
2026-01-25 11:31:59.213
Step #0:  ---> e6463a2d79fb
2026-01-25 11:31:59.213
Step #0: Step 6/43 : RUN npm ci
2026-01-25 11:31:59.248
Step #0:  ---> Running in 2be0b8633464
2026-01-25 11:32:31.023
Step #0: 
2026-01-25 11:32:31.023
Step #0: added 705 packages, and audited 706 packages in 31s
2026-01-25 11:32:31.023
Step #0: 
2026-01-25 11:32:31.023
Step #0: 171 packages are looking for funding
2026-01-25 11:32:31.023
Step #0:   run `npm fund` for details
2026-01-25 11:32:31.026
Step #0: 
2026-01-25 11:32:31.026
Step #0: found 0 vulnerabilities
2026-01-25 11:32:31.029
Step #0: [91mnpm notice
2026-01-25 11:32:31.029
Step #0: npm notice New major version of npm available! 10.9.4 -> 11.8.0
2026-01-25 11:32:31.029
Step #0: npm notice Changelog: https://github.com/npm/cli/releases/tag/v11.8.0
2026-01-25 11:32:31.029
Step #0: npm notice To update run: npm install -g npm@11.8.0
2026-01-25 11:32:31.029
Step #0: npm notice
2026-01-25 11:32:55.531
Step #0: [0mRemoving intermediate container 2be0b8633464
2026-01-25 11:32:55.531
Step #0:  ---> c5596926c30f
2026-01-25 11:32:55.531
Step #0: Step 7/43 : FROM base AS builder
2026-01-25 11:32:55.531
Step #0:  ---> ff729bb6df6b
2026-01-25 11:32:55.531
Step #0: Step 8/43 : WORKDIR /app
2026-01-25 11:32:55.629
Step #0:  ---> Running in c4aac2fa000e
2026-01-25 11:32:55.726
Step #0: Removing intermediate container c4aac2fa000e
2026-01-25 11:32:55.726
Step #0:  ---> 4cfe65bdb61f
2026-01-25 11:32:55.726
Step #0: Step 9/43 : COPY --from=deps /app/node_modules ./node_modules
2026-01-25 11:33:33.599
Step #0:  ---> 104ee42429ed
2026-01-25 11:33:33.599
Step #0: Step 10/43 : COPY . .
2026-01-25 11:33:34.532
Step #0:  ---> 35a3027049e2
2026-01-25 11:33:34.532
Step #0: Step 11/43 : ARG NEXT_PUBLIC_FIREBASE_API_KEY
2026-01-25 11:33:34.565
Step #0:  ---> Running in 18c7d318b417
2026-01-25 11:33:34.656
Step #0: Removing intermediate container 18c7d318b417
2026-01-25 11:33:34.656
Step #0:  ---> 82dc004a95cd
2026-01-25 11:33:34.656
Step #0: Step 12/43 : ARG NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
2026-01-25 11:33:34.688
Step #0:  ---> Running in 177c71591f0f
2026-01-25 11:33:34.782
Step #0: Removing intermediate container 177c71591f0f
2026-01-25 11:33:34.782
Step #0:  ---> 9993c7531f33
2026-01-25 11:33:34.782
Step #0: Step 13/43 : ARG NEXT_PUBLIC_FIREBASE_PROJECT_ID
2026-01-25 11:33:34.819
Step #0:  ---> Running in f87666fe1fdb
2026-01-25 11:33:34.910
Step #0: Removing intermediate container f87666fe1fdb
2026-01-25 11:33:34.910
Step #0:  ---> 53ab6e500d43
2026-01-25 11:33:34.910
Step #0: Step 14/43 : ARG NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
2026-01-25 11:33:34.942
Step #0:  ---> Running in 2dd056907759
2026-01-25 11:33:35.032
Step #0: Removing intermediate container 2dd056907759
2026-01-25 11:33:35.032
Step #0:  ---> d7aa6e6d3fb3
2026-01-25 11:33:35.032
Step #0: Step 15/43 : ARG NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
2026-01-25 11:33:35.067
Step #0:  ---> Running in 26ee7e1c7b45
2026-01-25 11:33:35.158
Step #0: Removing intermediate container 26ee7e1c7b45
2026-01-25 11:33:35.158
Step #0:  ---> 20eea3f85785
2026-01-25 11:33:35.158
Step #0: Step 16/43 : ARG NEXT_PUBLIC_FIREBASE_APP_ID
2026-01-25 11:33:35.193
Step #0:  ---> Running in 5ef9009a4c48
2026-01-25 11:33:35.300
Step #0: Removing intermediate container 5ef9009a4c48
2026-01-25 11:33:35.300
Step #0:  ---> 0140687acbaa
2026-01-25 11:33:35.300
Step #0: Step 17/43 : ARG NEXT_PUBLIC_SUPABASE_URL
2026-01-25 11:33:35.331
Step #0:  ---> Running in 7d0928b84169
2026-01-25 11:33:35.424
Step #0: Removing intermediate container 7d0928b84169
2026-01-25 11:33:35.424
Step #0:  ---> 2f95e22d6cde
2026-01-25 11:33:35.424
Step #0: Step 18/43 : ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
2026-01-25 11:33:35.453
Step #0:  ---> Running in e88b0d028f0f
2026-01-25 11:33:35.543
Step #0: Removing intermediate container e88b0d028f0f
2026-01-25 11:33:35.543
Step #0:  ---> 60f834b3624a
2026-01-25 11:33:35.543
Step #0: Step 19/43 : ENV NEXT_PUBLIC_FIREBASE_API_KEY=$NEXT_PUBLIC_FIREBASE_API_KEY
2026-01-25 11:33:35.578
Step #0:  ---> Running in f940d1d653b4
2026-01-25 11:33:35.666
Step #0: Removing intermediate container f940d1d653b4
2026-01-25 11:33:35.666
Step #0:  ---> ec4f0570ac46
2026-01-25 11:33:35.666
Step #0: Step 20/43 : ENV NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=$NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
2026-01-25 11:33:35.703
Step #0:  ---> Running in 39ecd2fd0ea1
2026-01-25 11:33:35.798
Step #0: Removing intermediate container 39ecd2fd0ea1
2026-01-25 11:33:35.798
Step #0:  ---> d64814544f78
2026-01-25 11:33:35.798
Step #0: Step 21/43 : ENV NEXT_PUBLIC_FIREBASE_PROJECT_ID=$NEXT_PUBLIC_FIREBASE_PROJECT_ID
2026-01-25 11:33:35.835
Step #0:  ---> Running in bb804088ff54
2026-01-25 11:33:35.925
Step #0: Removing intermediate container bb804088ff54
2026-01-25 11:33:35.925
Step #0:  ---> a318be48d912
2026-01-25 11:33:35.925
Step #0: Step 22/43 : ENV NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=$NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
2026-01-25 11:33:35.956
Step #0:  ---> Running in c8a79c95dcb7
2026-01-25 11:33:36.049
Step #0: Removing intermediate container c8a79c95dcb7
2026-01-25 11:33:36.049
Step #0:  ---> a8365f7457a9
2026-01-25 11:33:36.049
Step #0: Step 23/43 : ENV NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=$NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
2026-01-25 11:33:36.088
Step #0:  ---> Running in 4edbdc137b19
2026-01-25 11:33:36.184
Step #0: Removing intermediate container 4edbdc137b19
2026-01-25 11:33:36.184
Step #0:  ---> 5a0e923c56a7
2026-01-25 11:33:36.184
Step #0: Step 24/43 : ENV NEXT_PUBLIC_FIREBASE_APP_ID=$NEXT_PUBLIC_FIREBASE_APP_ID
2026-01-25 11:33:36.219
Step #0:  ---> Running in 0e90ff9efa7b
2026-01-25 11:33:36.333
Step #0: Removing intermediate container 0e90ff9efa7b
2026-01-25 11:33:36.333
Step #0:  ---> 22ea6d7dbd17
2026-01-25 11:33:36.333
Step #0: Step 25/43 : ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
2026-01-25 11:33:36.364
Step #0:  ---> Running in 0e9e30476819
2026-01-25 11:33:36.454
Step #0: Removing intermediate container 0e9e30476819
2026-01-25 11:33:36.454
Step #0:  ---> 4e57bc477f90
2026-01-25 11:33:36.454
Step #0: Step 26/43 : ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY
2026-01-25 11:33:36.485
Step #0:  ---> Running in d91d2d8984cf
2026-01-25 11:33:36.584
Step #0: Removing intermediate container d91d2d8984cf
2026-01-25 11:33:36.584
Step #0:  ---> 3647c73c3cee
2026-01-25 11:33:36.584
Step #0: Step 27/43 : ENV NEXT_TELEMETRY_DISABLED 1
2026-01-25 11:33:36.616
Step #0:  ---> Running in c59d67e4c0de
2026-01-25 11:33:36.706
Step #0: Removing intermediate container c59d67e4c0de
2026-01-25 11:33:36.706
Step #0:  ---> 64c6f3df5e7f
2026-01-25 11:33:36.706
Step #0: Step 28/43 : RUN npm run build
2026-01-25 11:33:36.741
Step #0:  ---> Running in 040f6dd17d8a
2026-01-25 11:33:37.676
Step #0: 
2026-01-25 11:33:37.676
Step #0: > crm-platform@0.1.0 build
2026-01-25 11:33:37.676
Step #0: > next build
2026-01-25 11:33:37.676
Step #0: 
2026-01-25 11:33:39.140
Step #0: ▲ Next.js 16.1.4 (Turbopack)
2026-01-25 11:33:39.141
Step #0: 
2026-01-25 11:33:39.204
Step #0:   Creating an optimized production build ...
2026-01-25 11:34:14.170
Step #0: ✓ Compiled successfully in 34.1s
2026-01-25 11:34:14.173
Step #0:   Running TypeScript ...
2026-01-25 11:34:31.677
Step #0:   Collecting page data using 1 worker ...
2026-01-25 11:34:32.426
Step #0:   Generating static pages using 1 worker (0/20) ...
2026-01-25 11:34:32.656
Step #0: Firebase Config Loaded: {
2026-01-25 11:34:32.656
Step #0:   projectId: 'power-choosers-crm',
2026-01-25 11:34:32.656
Step #0:   authDomain: 'power-choosers-crm.firebaseapp.com',
2026-01-25 11:34:32.656
Step #0:   apiKeyPresent: true
2026-01-25 11:34:32.656
Step #0: }
2026-01-25 11:34:33.118
Step #0:   Generating static pages using 1 worker (5/20) 
2026-01-25 11:34:33.382
Step #0:   Generating static pages using 1 worker (10/20) 
2026-01-25 11:34:33.383
Step #0:   Generating static pages using 1 worker (15/20) 
2026-01-25 11:34:33.483
Step #0: ✓ Generating static pages using 1 worker (20/20) in 1057.0ms
2026-01-25 11:34:33.495
Step #0:   Finalizing page optimization ...
2026-01-25 11:34:34.106
Step #0: 
2026-01-25 11:34:34.110
Step #0: Route (app)
2026-01-25 11:34:34.110
Step #0: ┌ ○ /
2026-01-25 11:34:34.110
Step #0: ├ ○ /_not-found
2026-01-25 11:34:34.110
Step #0: ├ ○ /bill-debugger
2026-01-25 11:34:34.110
Step #0: ├ ○ /contact
2026-01-25 11:34:34.110
Step #0: ├ ○ /crm-platform
2026-01-25 11:34:34.110
Step #0: ├ ○ /crm-platform/accounts
2026-01-25 11:34:34.110
Step #0: ├ ○ /crm-platform/calls
2026-01-25 11:34:34.110
Step #0: ├ ƒ /crm-platform/contacts/[id]
Showing logs for time specified in query. To view more results update your query.