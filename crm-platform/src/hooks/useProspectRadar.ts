'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

export interface ProspectRadarEntry {
  id: string;
  apollo_org_id: string;
  name: string;
  domain: string | null;
  logo_url: string | null;
  industry: string | null;
  employee_count: number | null;
  annual_revenue_printed: string | null;
  city: string | null;
  state: string | null;
  tdsp_zone: string | null;
  phone: string | null;
  linkedin_url: string | null;
  description: string | null;
  website: string | null;
  discovered_at: string;
}

async function getAuthHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token
    ? { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` }
    : { 'Content-Type': 'application/json' };
}

export function useProspectRadar() {
  return useQuery<ProspectRadarEntry[]>({
    queryKey: ['prospect-radar'],
    queryFn: async () => {
      const res = await fetch('/api/intelligence/prospect-radar?limit=25');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      return data.prospects || [];
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function useIngestProspect() {
  const queryClient = useQueryClient();
  const router = useRouter();

  return async (prospectId: string, prospectName: string) => {
    const toastId = toast.loading(`Ingesting ${prospectName}...`);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/intelligence/ingest-prospect', {
        method: 'POST',
        headers,
        body: JSON.stringify({ prospectId }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Ingest failed');
      }

      const { accountId, existing } = await res.json();

      toast.success(existing ? 'Account Node Enriched' : 'Account Node Initialized', {
        id: toastId,
        description: existing
          ? `${prospectName} already exists — record enriched.`
          : `${prospectName} committed to the database.`,
      });

      queryClient.invalidateQueries({ queryKey: ['prospect-radar'] });
      queryClient.invalidateQueries({ queryKey: ['accounts'] });

      router.push(`/network/accounts/${accountId}`);
    } catch (err: any) {
      toast.error('Ingest failed', { id: toastId, description: err.message });
    }
  };
}

export function useDismissProspect() {
  const queryClient = useQueryClient();

  return async (prospectId: string) => {
    // Optimistic update — remove from list immediately
    queryClient.setQueryData<ProspectRadarEntry[]>(['prospect-radar'], (prev) =>
      (prev || []).filter((p) => p.id !== prospectId)
    );

    try {
      const headers = await getAuthHeaders();
      await fetch('/api/intelligence/dismiss-prospect', {
        method: 'POST',
        headers,
        body: JSON.stringify({ prospectId }),
      });
    } catch (err) {
      // Re-fetch on failure to restore state
      queryClient.invalidateQueries({ queryKey: ['prospect-radar'] });
    }
  };
}
