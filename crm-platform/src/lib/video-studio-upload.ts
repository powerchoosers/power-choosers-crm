import { supabase } from '@/lib/supabase'

export interface VideoUploadResult {
  url: string
  storagePath: string
  fileName: string
}

export async function uploadVideoStudioAsset(
  file: File,
  projectId: string
): Promise<VideoUploadResult> {
  // Use a unique name to avoid collisions
  const fileExt = file.name.split('.').pop()
  const uniqueId = crypto.randomUUID?.() || Math.random().toString(36).slice(2)
  const fileName = `${uniqueId}.${fileExt}`
  const storagePath = `${projectId}/${fileName}`

  // Upload to the public 'video-studio-assets' bucket
  const { error: uploadError } = await supabase.storage
    .from('video-studio-assets')
    .upload(storagePath, file, {
      cacheControl: '3600',
      upsert: false
    })

  if (uploadError) {
    console.error('Upload error:', uploadError)
    throw new Error(`Failed to upload ${file.name}: ${uploadError.message}`)
  }

  // Get public URL
  const { data } = supabase.storage
    .from('video-studio-assets')
    .getPublicUrl(storagePath)

  if (!data.publicUrl) {
    throw new Error('Failed to get public URL for uploaded asset')
  }

  return {
    url: data.publicUrl,
    storagePath,
    fileName: file.name
  }
}
