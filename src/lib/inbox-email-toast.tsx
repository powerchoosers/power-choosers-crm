import { toast } from 'sonner';
import { playPing } from './audio';
import { useUIStore } from '@/store/uiStore';

export type InboxEmailToastInput = {
  name: string;
  company?: string;
  subject?: string;
  snippet?: string;
  hasAttachments?: boolean;
  sourceLabel?: string;
  photoUrl?: string | null;
  duration?: number;
};

export function showInboxEmailToast({
  name,
  company = 'Unknown company',
  subject = 'New email from CRM contact',
  snippet = 'New message received',
  hasAttachments = false,
  sourceLabel,
  photoUrl = null,
  duration = 6500,
}: InboxEmailToastInput) {
  const soundEnabled = useUIStore.getState().soundEnabled;
  if (soundEnabled) playPing();

  const fallbackName = name || 'CRM contact';
  const fallbackSnippet = snippet || 'New message received';
  const fallbackCompany = company || 'Unknown company';
  const headingParts = [fallbackName, fallbackCompany, sourceLabel].filter(Boolean);
  const heading = headingParts.join(' • ');
  const descriptionParts = [subject, fallbackSnippet].filter(Boolean);
  const description = descriptionParts.join(' — ');
  const attachmentSuffix = hasAttachments ? ' • Attachment included' : '';

  toast(
    heading ? `${heading}${attachmentSuffix}` : fallbackName,
    {
      description,
      duration,
    }
  );
}
