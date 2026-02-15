07:33:04.113 
▲ Next.js 16.1.4 (webpack)
07:33:04.113 
07:33:04.232 
  Creating an optimized production build ...
07:33:19.036 
✓ Compiled successfully in 11.6s
07:33:19.040 
  Running TypeScript ...
07:33:35.782 
Failed to compile.
07:33:35.782 
07:33:35.782 
./src/app/api/auth/callback/zoho/route.ts:219:32
07:33:35.782 
Type error: Cannot find name 'useOrigin'. Did you mean 'origin'?
07:33:35.783 
07:33:35.783 
  217 |             email: userEmail,
07:33:35.783 
  218 |             options: {
07:33:35.783 
> 219 |                 redirectTo: `${useOrigin}/network`
07:33:35.783 
      |                                ^
07:33:35.783 
  220 |             }
07:33:35.783 
  221 |         });
07:33:35.783 
  222 |
07:33:35.828 
Next.js build worker exited with code: 1 and signal: null
07:33:35.853 
Error: Command "npm run build" exited with 1