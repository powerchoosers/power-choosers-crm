import { toast } from 'sonner';
import { Paperclip } from 'lucide-react';
import { ContactAvatar } from '@/components/ui/ContactAvatar';
import { playPing } from './audio';
import { useUIStore } from '@/store/uiStore';
import { resolveContactPhotoUrl } from './contactAvatar';

export type InboxEmailToastInput = {
  name: string;
  company?: string;
  subject?: string;
  snippet?: string;
  hasAttachments?: boolean;
  photoUrl?: string | null;
  duration?: number;
};

export function showInboxEmailToast({
  name,
  company = 'Unknown company',
  subject = 'New email from CRM contact',
  snippet = 'New message received',
  hasAttachments = false,
  photoUrl = null,
  duration = 6500,
}: InboxEmailToastInput) {
  const soundEnabled = useUIStore.getState().soundEnabled;
  if (soundEnabled) playPing();

  const resolvedPhotoUrl = photoUrl || undefined;
  const fallbackName = name || 'CRM contact';
  const fallbackSnippet = snippet || 'New message received';
  const fallbackCompany = company || 'Unknown company';
  const avatarPhotoUrl = resolvedPhotoUrl || resolveContactPhotoUrl({ name: fallbackName } as any) || undefined;

  toast(
    <div className="flex items-start gap-3">
      <ContactAvatar name={fallbackName} photoUrl={avatarPhotoUrl} size={32} />
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-white truncate">{fallbackName}</span>
          {hasAttachments && <Paperclip className="w-3.5 h-3.5 text-zinc-400" />}
        </div>
        <div className="text-[11px] text-zinc-400 truncate">{fallbackCompany}</div>
        <div className="text-xs text-zinc-300 mt-1 line-clamp-2">{fallbackSnippet}</div>
      </div>
    </div>,
    {
      description: subject,
      duration,
    }
  );
}
