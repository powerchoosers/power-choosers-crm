'use client'

import { useParams } from 'next/navigation'
import TransmissionBuilder from '@/components/transmission/TransmissionBuilder'
import { Button } from '@/components/ui/button'
import { ChevronLeft } from 'lucide-react'
import Link from 'next/link'

export default function TransmissionBuilderPage() {
  const params = useParams()
  const id = params.id as string

  return (
    <div className="flex flex-col h-[calc(100vh-6rem)] space-y-4">
      <div className="flex items-center gap-4">
        <Link href="/network/transmission">
          <Button variant="ghost" size="sm" className="text-zinc-500 hover:text-white">
            <ChevronLeft size={16} className="mr-2" /> Back_to_Foundry
          </Button>
        </Link>
      </div>

      <div className="flex-1 min-h-0">
        <TransmissionBuilder assetId={id === 'new' ? undefined : id} />
      </div>
    </div>
  )
}
