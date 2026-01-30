'use client'

import React, { useEffect, useRef, useState } from 'react'
import DOMPurify from 'dompurify'
import { Maximize2, Minimize2, Sun, Moon, Printer, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface EmailContentProps {
  html?: string
  text?: string
  className?: string
  subject?: string
  printTrigger?: boolean
}

export const EmailContent: React.FC<EmailContentProps> = ({ html, text, className, subject, printTrigger }) => {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [iframeHeight, setIframeHeight] = useState('500px')
  const [isLightMode, setIsLightMode] = useState(false)
  const [isExpanded, setIsExpanded] = useState(false)

  useEffect(() => {
    if (printTrigger && iframeRef.current) {
      handlePrint()
    }
  }, [printTrigger])

  const handlePrint = () => {
    if (iframeRef.current) {
      iframeRef.current.contentWindow?.print()
    }
  }

  const handleOpenNewWindow = () => {
    const win = window.open('', '_blank')
    if (win) {
      win.document.write(getIframeContent())
      win.document.close()
    }
  }

  // Sanitize and transform the HTML content
  const sanitizedHtml = React.useMemo(() => {
    if (!html) return ''
    
    // Preliminary cleanup for common layout breakers
    let processedHtml = html
      .replace(/position:\s*fixed/gi, 'position: static')
      .replace(/position:\s*absolute/gi, 'position: static')
      .replace(/width:\s*\d+vw/gi, 'width: 100%')
      .replace(/height:\s*\d+vh/gi, 'height: auto')

    return DOMPurify.sanitize(processedHtml, {
      ADD_TAGS: ['style'],
      ADD_ATTR: ['target', 'style'],
      USE_PROFILES: { html: true }
    })
  }, [html])

  // Construct the full HTML document for the iframe
  const getIframeContent = () => {
    if (!html) return `<pre style="font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace; white-space: pre-wrap; color: ${isLightMode ? '#18181b' : '#d4d4d8'}; font-size: 13px; line-height: 1.6; padding: 20px;">${text || ''}</pre>`

    const baseStyles = `
      :root {
        color-scheme: ${isLightMode ? 'light' : 'dark'};
      }
      body {
        margin: 0;
        padding: 0;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
        line-height: 1.6;
        color: ${isLightMode ? '#18181b' : '#d4d4d8'};
        background-color: ${isLightMode ? '#ffffff' : '#09090b'};
        overflow: hidden; /* Let parent handle scrolling */
        word-wrap: break-word;
      }
      .email-wrapper {
        max-width: 100%;
        margin: 0 auto;
        padding: 24px;
        box-sizing: border-box;
        min-height: 100vh;
        overflow-x: auto; /* Allow horizontal scroll for wide content */
      }
      a { color: #002FA7; text-decoration: underline; }
      img { 
        max-width: 100% !important; 
        max-height: 70vh !important; /* Prevent massive icons from taking over */
        height: auto !important; 
        display: block; 
        margin: 10px auto; /* Center images */
        border-radius: 4px;
        object-fit: contain;
      }
      table { 
        border-collapse: collapse; 
        width: auto !important; 
        min-width: 100% !important;
        table-layout: auto !important; /* Allow table to expand naturally */
        margin: 15px 0;
      }
      blockquote {
        border-left: 2px solid #3f3f46;
        margin-left: 0;
        padding-left: 16px;
        color: #71717a;
      }
      
      /* Custom Scrollbar */
      ::-webkit-scrollbar {
        width: 8px;
        height: 8px;
      }
      ::-webkit-scrollbar-track {
        background: transparent;
      }
      ::-webkit-scrollbar-thumb {
        background: rgba(255, 255, 255, 0.1);
        border-radius: 10px;
      }
      ::-webkit-scrollbar-thumb:hover {
        background: rgba(255, 255, 255, 0.2);
      }
      
      /* Handle dark mode readability for light-designed emails */
      ${!isLightMode ? `
        /* Nodal Point Hybrid Rendering Protocol v4 */
        
        /* 1. Base Dark Mode State */
        .email-wrapper {
          background-color: #09090b;
          color: #e4e4e7; /* Default light text */
        }

        /* 2. Surgical Inversion Class (Applied by JS) */
        .smart-invert {
          filter: invert(1) hue-rotate(180deg);
          background-color: #ffffff !important; /* Ensure base for inversion */
        }
        
        /* Re-invert images inside inverted blocks ONLY if they are marked as photos */
        .smart-invert img.re-invert {
          filter: invert(1) hue-rotate(180deg) !important;
        }

        /* 3. Force White Text Class (Applied by JS) */
        .force-white-text {
          color: #e4e4e7 !important;
        }

        /* 4. Global Fallbacks (CSS-only for immediate render before JS runs) */
        /* Force explicit black text to white if it's NOT in a known white-bg container */
        /* This is a "best guess" before JS kicks in */
        p, span, div, td, li {
           color: inherit;
        }
        
        /* Ensure images are visible */
        img {
          display: inline-block;
          max-width: 100%;
          height: auto;
        }
      ` : `
        .email-wrapper {
          background-color: #ffffff;
          box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1);
          border-radius: 8px;
          margin: 10px;
          min-height: calc(100% - 20px);
        }
      `}
    `

    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <style>${baseStyles}</style>
          <base target="_blank">
        </head>
        <body>
          <div class="email-wrapper">
            ${sanitizedHtml}
          </div>
          <script>
            function updateHeight() {
              const body = document.body;
              const html = document.documentElement;
              const height = Math.max(
                body.scrollHeight, body.offsetHeight, 
                html.clientHeight, html.scrollHeight, html.offsetHeight
              );
              window.parent.postMessage({ type: 'setHeight', height: height }, '*');
            }

            // Observe content changes
            const observer = new MutationObserver(updateHeight);
            observer.observe(document.body, { 
              attributes: true, 
              childList: true, 
              subtree: true 
            });

            window.addEventListener('load', () => {
              // Initial update
              updateHeight();
              
              ${!isLightMode ? `
                // Nodal Point Smart-Render Logic
                try {
                  const allElements = document.querySelectorAll('*');
                  
                  // 1. Detect White Backgrounds
                  allElements.forEach(el => {
                    const style = window.getComputedStyle(el);
                    const bgColor = style.backgroundColor;
                    
                    // Check for white or near-white
                    // rgb(255, 255, 255) is standard white
                    if (bgColor.includes('rgb(255, 255, 255)') || bgColor === '#ffffff' || bgColor === 'white') {
                        el.classList.add('smart-invert');
                        
                        // Check images inside this inverted container
                        const images = el.querySelectorAll('img');
                        images.forEach(img => {
                          const src = (img.src || '').toLowerCase();
                          const alt = (img.alt || '').toLowerCase();
                          
                          // Heuristic: Only re-invert (flip back to normal) if it looks like a PHOTO.
                          // If it looks like a LOGO or TEXT-IMAGE (often PNG/GIF without "photo" in name), 
                          // we leave it inverted so Black Text -> White Text (Visible).
                          
                          // 1. Check for common photo extensions
                          const isPhotoExt = src.includes('.jpg') || src.includes('.jpeg') || src.includes('.webp') || src.includes('.heic');
                          
                          // 2. Check for keywords that suggest it's NOT a logo
                          // (This helps with URLs that don't have extensions)
                          const isLikelyPhoto = isPhotoExt && !src.includes('logo') && !alt.includes('logo') && !src.includes('icon');

                          if (isLikelyPhoto) {
                             img.classList.add('re-invert');
                          }
                        });
                     }
                   });

                  // 2. Detect Dark Text on Dark Backgrounds
                  // This runs AFTER inversion classes are added, so we can check if it's inverted.
                  allElements.forEach(el => {
                    // Skip if element is inside a smart-invert container
                    if (el.closest('.smart-invert')) return;
                    
                    const style = window.getComputedStyle(el);
                    const color = style.color;
                    
                    // Simple check for black/dark text
                    // "rgb(0, 0, 0)" is standard black
                    // Also check for very dark greys (brightness < 50)
                    if (color.includes('rgb(0, 0, 0)') || color === '#000000' || color === 'black' || color === 'rgb(34, 34, 34)') {
                      el.classList.add('force-white-text');
                    }
                  });
                  
                } catch (e) {
                  console.error('Smart-Render Error:', e);
                }
              ` : ''}

              // Wait for images to load
              const images = document.getElementsByTagName('img');
              for (let img of images) {
                if (img.complete) {
                  updateHeight();
                } else {
                  img.addEventListener('load', updateHeight);
                  img.addEventListener('error', updateHeight);
                }
              }
              
              // Final catch-all
              setTimeout(updateHeight, 500);
              setTimeout(updateHeight, 1500);
            });

            window.addEventListener('resize', updateHeight);
          </script>
        </body>
      </html>
    `
  }

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data.type === 'setHeight' && typeof event.data.height === 'number') {
        // Add a bit of buffer
        setIframeHeight(`${event.data.height + 20}px`)
      }
    }

    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [])

  // Force re-render of iframe content when key dependencies change
  const iframeKey = React.useMemo(() => `${isLightMode}-${html?.length}`, [isLightMode, html])

  return (
    <div className={cn("relative group flex flex-col w-full", className)}>
      {/* Controls */}
      <div className="absolute top-4 right-4 z-10 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
        <Button
          variant="secondary"
          size="sm"
          className="h-8 w-8 p-0 bg-zinc-900/80 backdrop-blur border border-white/10 hover:bg-zinc-800"
          onClick={handlePrint}
          title="Print Email"
        >
          <Printer className="w-4 h-4 text-zinc-400" />
        </Button>
        <Button
          variant="secondary"
          size="sm"
          className="h-8 w-8 p-0 bg-zinc-900/80 backdrop-blur border border-white/10 hover:bg-zinc-800"
          onClick={handleOpenNewWindow}
          title="Open in New Window"
        >
          <ExternalLink className="w-4 h-4 text-zinc-400" />
        </Button>
        <Button
          variant="secondary"
          size="sm"
          className="h-8 w-8 p-0 bg-zinc-900/80 backdrop-blur border border-white/10 hover:bg-zinc-800"
          onClick={() => setIsLightMode(!isLightMode)}
          title={isLightMode ? "Switch to Dark Mode" : "Switch to Light Mode"}
        >
          {isLightMode ? <Moon className="w-4 h-4 text-zinc-400" /> : <Sun className="w-4 h-4 text-zinc-400" />}
        </Button>
        <Button
          variant="secondary"
          size="sm"
          className="h-8 w-8 p-0 bg-zinc-900/80 backdrop-blur border border-white/10 hover:bg-zinc-800"
          onClick={() => setIsExpanded(!isExpanded)}
          title={isExpanded ? "Collapse" : "Expand"}
        >
          {isExpanded ? <Minimize2 className="w-4 h-4 text-zinc-400" /> : <Maximize2 className="w-4 h-4 text-zinc-400" />}
        </Button>
      </div>

      <div className={cn(
        "transition-all duration-300 ease-in-out overflow-hidden rounded-2xl",
        isExpanded ? "fixed inset-4 z-50 bg-zinc-950 border border-white/10 shadow-2xl p-4" : "relative w-full"
      )}>
        {isExpanded && (
          <div className="flex justify-between items-center mb-4 border-b border-white/5 pb-4">
            <h3 className="text-sm font-medium text-zinc-400 uppercase tracking-widest font-mono">Forensic_Email_View</h3>
            <Button variant="ghost" size="sm" onClick={() => setIsExpanded(false)} className="text-zinc-400">
              <Minimize2 className="w-4 h-4 mr-2" />
              Close
            </Button>
          </div>
        )}
        
        <iframe
          key={iframeKey}
          ref={iframeRef}
          srcDoc={getIframeContent()}
          className={cn(
            "w-full border-none transition-all duration-300 rounded-2xl",
            isExpanded ? "h-[calc(100%-4rem)]" : "min-h-[400px]"
          )}
          style={{ 
            height: isExpanded ? '100%' : iframeHeight,
            backgroundColor: isLightMode ? '#ffffff' : '#09090b'
          }}
          sandbox="allow-popups allow-popups-to-escape-sandbox allow-scripts allow-same-origin"
          title="Email Content"
        />
      </div>
    </div>
  )
}
