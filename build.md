## Error Type
Build Error

## Error Message
Parsing ecmascript source code failed

## Build Output
./crm-platform/src/components/emails/EmailContent.tsx:126:13
Parsing ecmascript source code failed
  124 |     `
  125 |
> 126 |     return \`
      |             ^
> 127 |       <!DOCTYPE html>
      | ^^^^^^^^^^^^^^^^^^^^^
> 128 |       <html>
      | ^^^^^^^^^^^^^^^^^^^^^
> 129 |         <head>
      | ^^^^^^^^^^^^^^^^^^^^^
> 130 |           <meta charset="utf-8">
      | ^^^^^^^^^^^^^^^^^^^^^
> 131 |           <meta name="viewport" content="width=device-width, initial-scale=1">
      | ^^^^^^^^^^^^^^^^^^^^^
> 132 |           <style>\${baseStyles}</style>
      | ^^^^^^^^^^^^^^^^^^^^^
> 133 |           <base target="_blank">
      | ^^^^^^^^^^^^^^^^^^^^^
> 134 |         </head>
      | ^^^^^^^^^^^^^^^^^^^^^
> 135 |         <body>
      | ^^^^^^^^^^^^^^^^^^^^^
> 136 |           <div class="email-wrapper">
      | ^^^^^^^^^^^^^^^^^^^^^
> 137 |             \${sanitizedHtml}
      | ^^^^^^^^^^^^^^^^^^^^^
> 138 |           </div>
      | ^^^^^^^^^^^^^^^^^^^^^
> 139 |           <script>
      | ^^^^^^^^^^^^^^^^^^^^^
> 140 |             function updateHeight() {
      | ^^^^^^^^^^^^^^^^^^^^^
> 141 |               const body = document.body;
      | ^^^^^^^^^^^^^^^^^^^^^
> 142 |               const html = document.documentElement;
      | ^^^^^^^^^^^^^^^^^^^^^
> 143 |               const height = Math.max(
      | ^^^^^^^^^^^^^^^^^^^^^
> 144 |                 body.scrollHeight, body.offsetHeight, 
      | ^^^^^^^^^^^^^^^^^^^^^
> 145 |                 html.clientHeight, html.scrollHeight, html.offsetHeight
      | ^^^^^^^^^^^^^^^^^^^^^
> 146 |               );
      | ^^^^^^^^^^^^^^^^^^^^^
> 147 |               window.parent.postMessage({ type: 'setHeight', height: height }, '*');
      | ^^^^^^^^^^^^^^^^^^^^^
> 148 |             }
      | ^^^^^^^^^^^^^^^^^^^^^
> 149 |             window.addEventListener('load', () => {
      | ^^^^^^^^^^^^^^^^^^^^^
> 150 |               // Wait for images to load
      | ^^^^^^^^^^^^^^^^^^^^^
> 151 |               const images = document.getElementsByTagName('img');
      | ^^^^^^^^^^^^^^^^^^^^^
> 152 |               let loadedImages = 0;
      | ^^^^^^^^^^^^^^^^^^^^^
> 153 |               if (images.length === 0) updateHeight();
      | ^^^^^^^^^^^^^^^^^^^^^
> 154 |               for (let img of images) {
      | ^^^^^^^^^^^^^^^^^^^^^
> 155 |                 if (img.complete) {
      | ^^^^^^^^^^^^^^^^^^^^^
> 156 |                   loadedImages++;
      | ^^^^^^^^^^^^^^^^^^^^^
> 157 |                   if (loadedImages === images.length) updateHeight();
      | ^^^^^^^^^^^^^^^^^^^^^
> 158 |                 } else {
      | ^^^^^^^^^^^^^^^^^^^^^
> 159 |                   img.addEventListener('load', () => {
      | ^^^^^^^^^^^^^^^^^^^^^
> 160 |                     loadedImages++;
      | ^^^^^^^^^^^^^^^^^^^^^
> 161 |                     if (loadedImages === images.length) updateHeight();
      | ^^^^^^^^^^^^^^^^^^^^^
> 162 |                   });
      | ^^^^^^^^^^^^^^^^^^^^^
> 163 |                   img.addEventListener('error', () => {
      | ^^^^^^^^^^^^^^^^^^^^^
> 164 |                     loadedImages++;
      | ^^^^^^^^^^^^^^^^^^^^^
> 165 |                     if (loadedImages === images.length) updateHeight();
      | ^^^^^^^^^^^^^^^^^^^^^
> 166 |                   });
      | ^^^^^^^^^^^^^^^^^^^^^
> 167 |                 }
      | ^^^^^^^^^^^^^^^^^^^^^
> 168 |               }
      | ^^^^^^^^^^^^^^^^^^^^^
> 169 |               updateHeight();
      | ^^^^^^^^^^^^^^^^^^^^^
> 170 |             });
      | ^^^^^^^^^^^^^^^^^^^^^
> 171 |             window.addEventListener('resize', updateHeight);
      | ^^^^^^^^^^^^^^^^^^^^^
> 172 |             // Periodic check for dynamic content
      | ^^^^^^^^^^^^^^^^^^^^^
> 173 |             setInterval(updateHeight, 1500);
      | ^^^^^^^^^^^^^^^^^^^^^
> 174 |           </script>
      | ^^^^^^^^^^^^^^^^^^^^^
> 175 |         </body>
      | ^^^^^^^^^^^^^^^^^^^^^
> 176 |       </html>
      | ^^^^^^^^^^^^^^^^^^^^^
> 177 |     \`
      | ^^^^^^^^^^^^^^^^^^^^^
> 178 |   }
      | ^^^^^^^^^^^^^^^^^^^^^
> 179 | 
      | ^^^^^^^^^^^^^^^^^^^^^
> 180 |   useEffect(() => {
      | ^^^^^^^^^^^^^^^^^^^^^
> 181 |     const handleMessage = (event: MessageEvent) => {
      | ^^^^^^^^^^^^^^^^^^^^^
> 182 |       if (event.data.type === 'setHeight' && typeof event.data.height === 'number') {
      | ^^^^^^^^^^^^^^^^^^^^^
> 183 |         // Add a bit of buffer
      | ^^^^^^^^^^^^^^^^^^^^^
> 184 |         setIframeHeight(\`\${event.data.height + 20}px\`)
      | ^^^^^^^^^^^^^^^^^^^^^
> 185 |       }
      | ^^^^^^^^^^^^^^^^^^^^^
> 186 |     }
      | ^^^^^^^^^^^^^^^^^^^^^
> 187 | 
      | ^^^^^^^^^^^^^^^^^^^^^
> 188 |     window.addEventListener('message', handleMessage)
      | ^^^^^^^^^^^^^^^^^^^^^
> 189 |     return () => window.removeEventListener('message', handleMessage)
      | ^^^^^^^^^^^^^^^^^^^^^
> 190 |   }, [])
      | ^^^^^^^^^^^^^^^^^^^^^
> 191 | 
      | ^^^^^^^^^^^^^^^^^^^^^
> 192 |   // Force re-render of iframe content when key dependencies change
      | ^^^^^^^^^^^^^^^^^^^^^
> 193 |   const iframeKey = React.useMemo(() => \`\${isLightMode}-\${html?.length}\`, [isLightMode, html])
      | ^^^^^^^^^^^^^^^^^^^^^
> 194 | 
      | ^^^^^^^^^^^^^^^^^^^^^
> 195 |   return (
      | ^^^^^^^^^^^^^^^^^^^^^
> 196 |     <div className={cn("relative group flex flex-col h-full", className)}>
      | ^^^^^^^^^^^^^^^^^^^^^
> 197 |       {/* Controls */}
      | ^^^^^^^^^^^^^^^^^^^^^
> 198 |       <div className="absolute top-4 right-4 z-10 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
      | ^^^^^^^^^^^^^^^^^^^^^
> 199 |         <Button
      | ^^^^^^^^^^^^^^^^^^^^^
> 200 |           variant="secondary"
      | ^^^^^^^^^^^^^^^^^^^^^
> 201 |           size="sm"
      | ^^^^^^^^^^^^^^^^^^^^^
> 202 |           className="h-8 w-8 p-0 bg-zinc-900/80 backdrop-blur border border-white/10 hover:bg-zinc-800"
      | ^^^^^^^^^^^^^^^^^^^^^
> 203 |           onClick={handlePrint}
      | ^^^^^^^^^^^^^^^^^^^^^
> 204 |           title="Print Email"
      | ^^^^^^^^^^^^^^^^^^^^^
> 205 |         >
      | ^^^^^^^^^^^^^^^^^^^^^
> 206 |           <Printer className="w-4 h-4 text-zinc-400" />
      | ^^^^^^^^^^^^^^^^^^^^^
> 207 |         </Button>
      | ^^^^^^^^^^^^^^^^^^^^^
> 208 |         <Button
      | ^^^^^^^^^^^^^^^^^^^^^
> 209 |           variant="secondary"
      | ^^^^^^^^^^^^^^^^^^^^^
> 210 |           size="sm"
      | ^^^^^^^^^^^^^^^^^^^^^
> 211 |           className="h-8 w-8 p-0 bg-zinc-900/80 backdrop-blur border border-white/10 hover:bg-zinc-800"
      | ^^^^^^^^^^^^^^^^^^^^^
> 212 |           onClick={handleOpenNewWindow}
      | ^^^^^^^^^^^^^^^^^^^^^
> 213 |           title="Open in New Window"
      | ^^^^^^^^^^^^^^^^^^^^^
> 214 |         >
      | ^^^^^^^^^^^^^^^^^^^^^
> 215 |           <ExternalLink className="w-4 h-4 text-zinc-400" />
      | ^^^^^^^^^^^^^^^^^^^^^
> 216 |         </Button>
      | ^^^^^^^^^^^^^^^^^^^^^
> 217 |         <Button
      | ^^^^^^^^^^^^^^^^^^^^^
> 218 |           variant="secondary"
      | ^^^^^^^^^^^^^^^^^^^^^
> 219 |           size="sm"
      | ^^^^^^^^^^^^^^^^^^^^^
> 220 |           className="h-8 w-8 p-0 bg-zinc-900/80 backdrop-blur border border-white/10 hover:bg-zinc-800"
      | ^^^^^^^^^^^^^^^^^^^^^
> 221 |           onClick={() => setIsLightMode(!isLightMode)}
      | ^^^^^^^^^^^^^^^^^^^^^
> 222 |           title={isLightMode ? "Switch to Dark Mode" : "Switch to Light Mode"}
      | ^^^^^^^^^^^^^^^^^^^^^
> 223 |         >
      | ^^^^^^^^^^^^^^^^^^^^^
> 224 |           {isLightMode ? <Moon className="w-4 h-4 text-zinc-400" /> : <Sun className="w-4 h-4 text-zinc-400" />}
      | ^^^^^^^^^^^^^^^^^^^^^
> 225 |         </Button>
      | ^^^^^^^^^^^^^^^^^^^^^
> 226 |         <Button
      | ^^^^^^^^^^^^^^^^^^^^^
> 227 |           variant="secondary"
      | ^^^^^^^^^^^^^^^^^^^^^
> 228 |           size="sm"
      | ^^^^^^^^^^^^^^^^^^^^^
> 229 |           className="h-8 w-8 p-0 bg-zinc-900/80 backdrop-blur border border-white/10 hover:bg-zinc-800"
      | ^^^^^^^^^^^^^^^^^^^^^
> 230 |           onClick={() => setIsExpanded(!isExpanded)}
      | ^^^^^^^^^^^^^^^^^^^^^
> 231 |           title={isExpanded ? "Collapse" : "Expand"}
      | ^^^^^^^^^^^^^^^^^^^^^
> 232 |         >
      | ^^^^^^^^^^^^^^^^^^^^^
> 233 |           {isExpanded ? <Minimize2 className="w-4 h-4 text-zinc-400" /> : <Maximize2 className="w-4 h-4 text-zinc-400" />}
      | ^^^^^^^^^^^^^^^^^^^^^
> 234 |         </Button>
      | ^^^^^^^^^^^^^^^^^^^^^
> 235 |       </div>
      | ^^^^^^^^^^^^^^^^^^^^^
> 236 | 
      | ^^^^^^^^^^^^^^^^^^^^^
> 237 |       <div className={cn(
      | ^^^^^^^^^^^^^^^^^^^^^
> 238 |         "flex-1 overflow-hidden transition-all duration-300 ease-in-out",
      | ^^^^^^^^^^^^^^^^^^^^^
> 239 |         isExpanded ? "fixed inset-4 z-50 bg-zinc-950 rounded-2xl border border-white/10 shadow-2xl p-4" : "relative"
      | ^^^^^^^^^^^^^^^^^^^^^
> 240 |       )}>
      | ^^^^^^^^^^^^^^^^^^^^^
> 241 |         {isExpanded && (
      | ^^^^^^^^^^^^^^^^^^^^^
> 242 |           <div className="flex justify-between items-center mb-4 border-b border-white/5 pb-4">
      | ^^^^^^^^^^^^^^^^^^^^^
> 243 |             <h3 className="text-sm font-medium text-zinc-400 uppercase tracking-widest font-mono">Forensic_Email_View</h3>
      | ^^^^^^^^^^^^^^^^^^^^^
> 244 |             <Button variant="ghost" size="sm" onClick={() => setIsExpanded(false)} className="text-zinc-400">
      | ^^^^^^^^^^^^^^^^^^^^^
> 245 |               <Minimize2 className="w-4 h-4 mr-2" />
      | ^^^^^^^^^^^^^^^^^^^^^
> 246 |               Close
      | ^^^^^^^^^^^^^^^^^^^^^
> 247 |             </Button>
      | ^^^^^^^^^^^^^^^^^^^^^
> 248 |           </div>
      | ^^^^^^^^^^^^^^^^^^^^^
> 249 |         )}
      | ^^^^^^^^^^^^^^^^^^^^^
> 250 |         
      | ^^^^^^^^^^^^^^^^^^^^^
> 251 |         <iframe
      | ^^^^^^^^^^^^^^^^^^^^^
> 252 |           key={iframeKey}
      | ^^^^^^^^^^^^^^^^^^^^^
> 253 |           ref={iframeRef}
      | ^^^^^^^^^^^^^^^^^^^^^
> 254 |           srcDoc={getIframeContent()}
      | ^^^^^^^^^^^^^^^^^^^^^
> 255 |           className={cn(
      | ^^^^^^^^^^^^^^^^^^^^^
> 256 |             "w-full border-none transition-all duration-300",
      | ^^^^^^^^^^^^^^^^^^^^^
> 257 |             isExpanded ? "h-[calc(100%-4rem)]" : "min-h-[400px]"
      | ^^^^^^^^^^^^^^^^^^^^^
> 258 |           )}
      | ^^^^^^^^^^^^^^^^^^^^^
> 259 |           style={{ height: isExpanded ? '100%' : iframeHeight }}
      | ^^^^^^^^^^^^^^^^^^^^^
> 260 |           sandbox="allow-popups allow-popups-to-escape-sandbox allow-scripts"
      | ^^^^^^^^^^^^^^^^^^^^^
> 261 |           title="Email Content"
      | ^^^^^^^^^^^^^^^^^^^^^
> 262 |         />
      | ^^^^^^^^^^^^^^^^^^^^^
> 263 |       </div>
      | ^^^^^^^^^^^^^^^^^^^^^
> 264 |     </div>
      | ^^^^^^^^^^^^^^^^^^^^^
> 265 |   )
      | ^^^^^^^^^^^^^^^^^^^^^
> 266 | }
      | ^^^^^^^^^^^^^^^^^^^^^
> 267 | 
      | ^

Unterminated template

Import traces:
  Client Component Browser:
    ./crm-platform/src/components/emails/EmailContent.tsx [Client Component Browser]
    ./crm-platform/src/app/network/emails/[id]/page.tsx [Client Component Browser]
    ./crm-platform/src/app/network/emails/[id]/page.tsx [Server Component]

  Client Component SSR:
    ./crm-platform/src/components/emails/EmailContent.tsx [Client Component SSR]
    ./crm-platform/src/app/network/emails/[id]/page.tsx [Client Component SSR]
    ./crm-platform/src/app/network/emails/[id]/page.tsx [Server Component]

Next.js version: 16.1.4 (Turbopack)
