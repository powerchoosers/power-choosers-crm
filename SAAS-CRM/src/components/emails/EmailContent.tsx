'use client'

import React, { useCallback, useEffect, useRef, useState } from 'react'
import DOMPurify from 'dompurify'
import { Maximize2, Minimize2, Sun, Moon, Printer, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { stripTrackedEmailPreviewHtml } from '@/lib/email-preview-html'
import { escapeHtml } from '@/lib/email-html'

interface EmailContentProps {
  html?: string
  text?: string
  className?: string
  subject?: string
  printTrigger?: boolean
  initialLightMode?: boolean
}

export const EmailContent: React.FC<EmailContentProps> = ({ html, text, className, subject, printTrigger, initialLightMode = true }) => {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [iframeHeight, setIframeHeight] = useState('500px')
  const [isLightMode, setIsLightMode] = useState(initialLightMode)
  const [isExpanded, setIsExpanded] = useState(false)

  useEffect(() => {
    setIsLightMode(initialLightMode)
  }, [initialLightMode])

  const handlePrint = useCallback(() => {
    iframeRef.current?.contentWindow?.print()
  }, [])

  useEffect(() => {
    if (printTrigger && iframeRef.current) {
      handlePrint()
    }
  }, [handlePrint, printTrigger])

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

    const origin = typeof window !== 'undefined' ? window.location.origin : undefined
    const noTrackedHtml = stripTrackedEmailPreviewHtml(html, origin)

    return DOMPurify.sanitize(noTrackedHtml, {
      ADD_TAGS: ['style'],
      ADD_ATTR: ['target', 'style'],
      USE_PROFILES: { html: true }
    })
  }, [html])

  // Construct the full HTML document for the iframe
  const getIframeContent = () => {
    const shellBackground = isLightMode ? '#ffffff' : '#0a0a0a'
    const panelBackground = isLightMode ? '#ffffff' : '#0f0f0f'
    const bodyColor = isLightMode ? '#18181b' : '#e4e4e7'
    const mutedColor = isLightMode ? '#71717a' : '#a1a1aa'
    const borderColor = isLightMode ? 'rgba(228, 228, 231, 0.9)' : 'rgba(255, 255, 255, 0.1)'
    const linkColor = '#002FA7'
    const textFallback = text ? escapeHtml(text) : ''

    const baseStyles = `
      :root {
        color-scheme: ${isLightMode ? 'light' : 'dark'};
      }
      html,
      body {
        margin: 0;
        padding: 0;
        min-height: 100%;
        overflow: hidden;
        word-wrap: break-word;
        background-color: ${shellBackground};
        color: ${bodyColor};
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
        line-height: 1.6;
        -webkit-text-size-adjust: 100%;
        -ms-text-size-adjust: 100%;
      }
      .email-wrapper {
        max-width: 100%;
        margin: 0 auto;
        padding: 24px;
        box-sizing: border-box;
        overflow-x: auto;
        background-color: ${panelBackground};
        color: inherit;
      }
      a { color: ${linkColor}; text-decoration: underline; }
      img {
        max-width: 100% !important;
        max-height: 70vh !important;
        height: auto !important;
        display: block;
        margin: 10px auto;
        border-radius: 4px;
        object-fit: contain;
      }
      img[src=""], img:not([src]) { display: none !important; }
      .cid-placeholder {
        display: inline-block;
        margin: 8px 0;
        font-size: 12px;
        color: ${mutedColor};
        border: 1px dashed ${borderColor};
        border-radius: 8px;
        padding: 6px 10px;
      }
      table {
        border-collapse: collapse;
        width: auto !important;
        min-width: 100% !important;
        table-layout: auto !important;
        margin: 15px 0;
      }
      blockquote {
        border-left: 2px solid ${borderColor};
        margin-left: 0;
        padding-left: 16px;
        color: ${mutedColor};
      }
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
            ${sanitizedHtml || `<pre style="margin:0; white-space:pre-wrap; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace; color: ${bodyColor}; font-size: 13px; line-height: 1.6;">${textFallback}</pre>`}
          </div>
          <script>
            function updateHeight() {
              const body = document.body;
              const html = document.documentElement;
              const measureHeight = () => {
                const wrapper = document.querySelector('.email-wrapper');
                if (wrapper) {
                  return Math.max(wrapper.scrollHeight, wrapper.offsetHeight);
                }
                return Math.max(
                  body.scrollHeight, body.offsetHeight,
                  html.clientHeight, html.scrollHeight, html.offsetHeight
                );
              };
              const height = measureHeight();
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
              // Wait for images to load
              const images = document.getElementsByTagName('img');
              for (let img of images) {
                img.addEventListener('error', () => {
                  img.style.display = 'none';
                });
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
      if (event.source !== iframeRef.current?.contentWindow) return
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

  // Apply dynamic height via ref to avoid inline style lint warnings
  useEffect(() => {
    if (iframeRef.current) {
      iframeRef.current.style.height = isExpanded ? '100%' : iframeHeight
    }
  }, [isExpanded, iframeHeight])

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
            isExpanded ? "h-[calc(100%-4rem)]" : "min-h-[400px]",
            isLightMode ? "bg-white" : "bg-[#09090b]"
          )}
          sandbox="allow-popups allow-popups-to-escape-sandbox allow-scripts allow-same-origin"
          title="Email Content"
        />
      </div>
    </div>
  )
}
