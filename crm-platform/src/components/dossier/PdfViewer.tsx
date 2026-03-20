'use client'

import { Document, Page, pdfjs } from 'react-pdf'
import 'react-pdf/dist/Page/AnnotationLayer.css'
import 'react-pdf/dist/Page/TextLayer.css'
import { ChevronLeft, ChevronRight } from 'lucide-react'

pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/legacy/build/pdf.worker.min.mjs`

interface PdfViewerProps {
  signedUrl: string;
  onLoadSuccess: (numPages: number) => void;
  pageNumber: number;
  onPageChange: (page: number) => void;
  numPages: number;
  iframeLoaded: boolean;
}

export function PdfViewer({
  signedUrl,
  onLoadSuccess,
  pageNumber,
  onPageChange,
  numPages,
  iframeLoaded
}: PdfViewerProps) {
  return (
    <div
      className="absolute inset-0 overflow-auto np-scroll flex flex-col items-center p-6"
      style={{ opacity: iframeLoaded ? 1 : 0, transition: 'opacity 0.3s ease' }}
    >
      {numPages > 1 && (
        <div className="flex items-center gap-1 sticky top-0 z-10 px-1 py-1 bg-zinc-950/80 backdrop-blur rounded-full border border-white/5 text-[10px] font-mono text-zinc-400 mb-4">
          <button
            disabled={pageNumber <= 1}
            onClick={() => onPageChange(pageNumber - 1)}
            className="p-1.5 bg-[#002FA7] hover:bg-[#002FA7]/80 rounded-full disabled:opacity-20 transition-all text-white"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>
          <div className="px-3 border-x border-white/5 text-zinc-500">Page <span className="text-zinc-200">{pageNumber}</span> / {numPages}</div>
          <button
            disabled={pageNumber >= numPages}
            onClick={() => onPageChange(pageNumber + 1)}
            className="p-1.5 bg-[#002FA7] hover:bg-[#002FA7]/80 rounded-full disabled:opacity-20 transition-all text-white"
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
      <Document
        file={signedUrl}
        onLoadSuccess={({ numPages }) => onLoadSuccess(numPages)}
        loading={null}
        className="flex flex-col items-center"
      >
        <Page
          pageNumber={pageNumber}
          renderTextLayer={false}
          renderAnnotationLayer={false}
          width={Math.min(typeof window !== 'undefined' ? window.innerWidth * 0.72 : 900, 900)}
          className="shadow-2xl"
        />
      </Document>
    </div>
  );
}
