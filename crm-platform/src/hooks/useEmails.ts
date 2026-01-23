import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { collection, getDocs, query, where, orderBy, limit, addDoc, updateDoc, doc } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { useAuth } from '@/context/AuthContext'
import { toast } from 'sonner'

export interface Email {
  id: string
  subject: string
  from: string
  to: string | string[]
  html?: string
  text?: string
  snippet?: string
  date: string
  timestamp?: number
  unread: boolean
  type: 'received' | 'sent' | 'scheduled' | 'draft'
  status?: string
  ownerId: string
  gmailMessageId?: string
  openCount?: number
  clickCount?: number
}

const COLLECTION_NAME = 'emails'

export function useEmails() {
  const { user, role, loading } = useAuth()
  const queryClient = useQueryClient()

  const { data: emails, isLoading, error } = useQuery({
    queryKey: ['emails', user?.email],
    queryFn: async () => {
      if (!user?.email) return [];

      try {
        // Query for emails owned by the user
        const q = query(
          collection(db, COLLECTION_NAME),
          where('ownerId', '==', user.email.toLowerCase()),
          orderBy('timestamp', 'desc'), // Assuming you have a composite index or single field index
          limit(100)
        );

        const snapshot = await getDocs(q);
        
        return snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as Email[];
      } catch (error: any) {
        console.error("Error fetching emails:", error);
        // Fallback if index is missing (client-side sort)
        if (error.code === 'failed-precondition') {
             const q = query(
                collection(db, COLLECTION_NAME),
                where('ownerId', '==', user.email.toLowerCase()),
                limit(100)
              );
              const snapshot = await getDocs(q);
              const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Email));
              return docs.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        }
        throw error;
      }
    },
    enabled: !loading && !!user,
    staleTime: 1000 * 60, // 1 minute
  });

  const sendEmailMutation = useMutation({
    mutationFn: async (emailData: { to: string, subject: string, content: string }) => {
      // Call the existing API endpoint
      const response = await fetch('/api/email/sendgrid-send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          to: emailData.to,
          subject: emailData.subject,
          content: emailData.content,
          isHtmlEmail: true,
          userEmail: user?.email, // Pass user email for ownership
          from: user?.email // Default from
        }),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.message || 'Failed to send email');
      }

      return response.json();
    },
    onSuccess: () => {
      toast.success('Email sent successfully');
      queryClient.invalidateQueries({ queryKey: ['emails'] });
    },
    onError: (error: Error) => {
      toast.error(`Failed to send: ${error.message}`);
    }
  });

  return {
    emails,
    isLoading,
    error,
    sendEmail: sendEmailMutation.mutate,
    isSending: sendEmailMutation.isPending
  };
}
