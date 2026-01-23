import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { collection, getCountFromServer, getDocs, query, where, orderBy, limit, addDoc, updateDoc, doc, startAfter, QueryDocumentSnapshot } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { useAuth } from '@/context/AuthContext'
import { toast } from 'sonner'

export interface Email {
  id: string
  subject: string
  from: string
  fromName?: string | null
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
const PAGE_SIZE = 50

export function useEmails() {
  const { user, role, loading, profile } = useAuth()
  const queryClient = useQueryClient()

  const emailsQuery = useInfiniteQuery({
    queryKey: ['emails', user?.email ?? 'guest'],
    initialPageParam: undefined as QueryDocumentSnapshot | undefined,
    queryFn: async ({ pageParam }) => {
      if (loading) return { emails: [], lastDoc: null };
      if (!user?.email) return { emails: [], lastDoc: null };

      try {
        // Query for emails owned by the user
        let q = query(
          collection(db, COLLECTION_NAME),
          where('ownerId', '==', user.email.toLowerCase()),
          orderBy('timestamp', 'desc'), // Assuming you have a composite index or single field index
          limit(PAGE_SIZE)
        );

        if (pageParam) {
          q = query(q, startAfter(pageParam))
        }

        const snapshot = await getDocs(q);
        
        return {
          emails: snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
          })) as Email[],
          lastDoc: snapshot.docs?.at(-1) ?? null
        }
      } catch (error: unknown) {
        console.error("Error fetching emails:", error);
        const errorCode = typeof error === 'object' && error !== null && 'code' in error
          ? (error as { code?: string }).code
          : undefined

        // Fallback if index is missing (client-side sort)
        if (errorCode === 'failed-precondition') {
             const q = query(
                collection(db, COLLECTION_NAME),
                where('ownerId', '==', user.email.toLowerCase()),
                limit(PAGE_SIZE)
              );
              const snapshot = await getDocs(q);
              const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Email));
              return {
                emails: docs.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
                lastDoc: null
              }
        }
        throw error;
      }
    },
    getNextPageParam: (lastPage) => lastPage?.lastDoc || undefined,
    enabled: !loading && !!user,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });

  const sendEmailMutation = useMutation({
    mutationFn: async (emailData: { to: string, subject: string, content: string }) => {
      if (!user?.email) {
        throw new Error('You must be logged in to send email')
      }

      const escapeHtml = (value: string) =>
        value
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')

      const htmlContent = `<div style="white-space:pre-wrap;">${escapeHtml(emailData.content)}</div>`
      const fromName = profile.name || user.displayName || undefined

      // Call the existing API endpoint
      const response = await fetch('/api/email/sendgrid-send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          to: emailData.to,
          subject: emailData.subject,
          content: htmlContent,
          plainTextContent: emailData.content,
          isHtmlEmail: true,
          userEmail: user.email,
          from: user.email,
          fromName,
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
    data: emailsQuery.data,
    isLoading: emailsQuery.isLoading,
    error: emailsQuery.error,
    fetchNextPage: emailsQuery.fetchNextPage,
    hasNextPage: emailsQuery.hasNextPage,
    isFetchingNextPage: emailsQuery.isFetchingNextPage,
    sendEmail: sendEmailMutation.mutate,
    isSending: sendEmailMutation.isPending
  };
}

export function useEmailsCount() {
  const { user, loading } = useAuth()

  return useQuery({
    queryKey: ['emails-count', user?.email ?? 'guest'],
    queryFn: async () => {
      if (loading) return 0
      if (!user?.email) return 0

      const q = query(
        collection(db, COLLECTION_NAME),
        where('ownerId', '==', user.email.toLowerCase()),
      )

      const snapshot = await getCountFromServer(q)
      return snapshot.data().count
    },
    enabled: !loading && !!user,
    staleTime: 1000 * 60 * 5,
  })
}
