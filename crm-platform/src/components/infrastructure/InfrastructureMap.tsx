'use client'
import React, { useMemo, useState, useRef, useCallback } from 'react';
import Link from 'next/link';
import Map, { Marker } from 'react-map-gl/mapbox';
import 'mapbox-gl/dist/mapbox-gl.css';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { mapLocationToZone, ERCOT_ZONES } from '@/lib/market-mapping';
import { useAuth } from '@/context/AuthContext';
import { useMarketPulse } from '@/hooks/useMarketPulse';
import { CompanyIcon } from '@/components/ui/CompanyIcon';

const HOVER_DELAY_MS = 1000;
/** Time to keep card open after leaving marker so user can move to card and click Open dossier */
const CARD_CLOSE_DELAY_MS = 2000;

type MapNode = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  status: string;
  load: string;
  zone: string;
  accountStatus: string;
  accountId: string | null;
  accountName: string;
  industry: string;
  city: string;
  state: string;
  logoUrl: string | null;
  domain: string | null;
};

export default function InfrastructureMap() {
  const { user, loading: authLoading } = useAuth();
  const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

  const [hoveredNode, setHoveredNode] = useState<MapNode | null>(null);
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeCardTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { data: marketPulse } = useMarketPulse();
  const prices = useMemo(() => ({
    north: marketPulse?.prices?.north ?? 24.15,
    houston: marketPulse?.prices?.houston ?? 21.80,
    west: marketPulse?.prices?.west ?? 45.20,
    south: marketPulse?.prices?.south ?? 22.40
  }), [marketPulse]);

  const STATUS_LIST = ['ACTIVE_LOAD', 'CUSTOMER', 'active', 'customer', 'Customer'];

  // Fetch contacts whose accounts are load/customer (org-wide, no owner filter so customers show)
  const { data: contactsData, isLoading: contactsLoading } = useInfiniteQuery({
    queryKey: ['contacts-infrastructure', user?.email],
    initialPageParam: 0,
    queryFn: async ({ pageParam = 0 }) => {
      if (!user) return { contacts: [], nextCursor: null };
      const q = supabase
        .from('contacts')
        .select('*, accounts!inner(id, name, city, state, industry, annual_usage, status, latitude, longitude, logo_url, domain)', { count: 'exact' })
        .in('accounts.status', STATUS_LIST);
      const PAGE_SIZE = 1000;
      const from = pageParam * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      const { data, error, count } = await q.range(from, to);
      if (error) throw error;
      return { contacts: data || [], nextCursor: count && from + PAGE_SIZE < count ? pageParam + 1 : null };
    },
    enabled: !!user && !authLoading,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
  });

  // Fetch load/customer accounts that may have no contacts (so customers still show on map)
  const { data: accountsData } = useQuery({
    queryKey: ['accounts-infrastructure-map'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('accounts')
        .select('id, name, city, state, industry, annual_usage, status, latitude, longitude, logo_url, domain')
        .in('status', STATUS_LIST)
        .limit(2000);
      if (error) throw error;
      return data || [];
    },
    enabled: !!user && !authLoading,
  });

  // Flatten contacts and map to nodes; then add account-only nodes for accounts not already represented
  const nodes = useMemo(() => {
    if (!contactsData) return [];
    const contactNodes = contactsData.pages.flatMap(page => page.contacts).map(contact => {
      const account = Array.isArray(contact.accounts) ? contact.accounts[0] : contact.accounts;

      // Determine location - prioritizing metadata/direct fields if available
      const city = contact.city || account?.city || '';
      const state = contact.state || account?.state || '';

      // Map to ERCOT zone
      const zone = mapLocationToZone(city, state);

      // Calculate Risk Status based on current prices
      let status = 'prospect';
      const currentPrice = zone === ERCOT_ZONES.HOUSTON ? prices.houston :
        zone === ERCOT_ZONES.WEST ? prices.west :
          zone === ERCOT_ZONES.SOUTH ? prices.south :
            prices.north;

      // Logic: If price > $40 and load is high, mark as risk
      const annualUsage = contact.annual_usage || account?.annual_usage || 0;
      const load = annualUsage > 500000 ? 'HIGH' : annualUsage > 100000 ? 'MED' : 'LOW';

      if (currentPrice > 40 && load === 'HIGH') {
        status = 'risk';
      } else if (load === 'HIGH' || load === 'MED') {
        status = 'protected';
      }

      // DB columns are latitude/longitude (both contacts and accounts). Use contact first, then account.
      const toNum = (v: unknown): number | null => {
        if (v == null || v === '') return null;
        const n = typeof v === 'number' ? v : Number(v);
        return Number.isFinite(n) ? n : null;
      };
      let lat = toNum(contact.latitude);
      let lng = toNum(contact.longitude);

      // Inherit from account if contact has no coordinates (accounts often have geocoded lat/long)
      if (lat == null || lng == null) {
        const aLat = toNum(account?.latitude);
        const aLng = toNum(account?.longitude);
        if (aLat != null && aLng != null) {
          lat = aLat;
          lng = aLng;
        }
      }

      if (lat == null || lng == null) {
        // Simple city-based jitter for visualization if no real coords
        const hash = (contact.id || '').split('').reduce((a: number, b: string) => { a = ((a << 5) - a) + b.charCodeAt(0); return a & a; }, 0);
        const jitterLat = (hash % 100) / 1000;
        const jitterLng = ((hash >> 4) % 100) / 1000;

        // Base coords for Texas zones
        if (zone === ERCOT_ZONES.HOUSTON) { lat = 29.7604 + jitterLat; lng = -95.3698 + jitterLng; }
        else if (zone === ERCOT_ZONES.WEST) { lat = 31.8460 + jitterLat; lng = -102.3680 + jitterLng; }
        else if (zone === ERCOT_ZONES.SOUTH) { lat = 29.4241 + jitterLat; lng = -98.4936 + jitterLng; }
        else { lat = 32.7767 + jitterLat; lng = -96.7970 + jitterLng; }
      }

      // Account status for marker: ACTIVE_LOAD/active = blue (active load), CUSTOMER/customer = green
      const rawStatus = (account?.status ?? '').toString().trim();
      const upper = rawStatus.toUpperCase();
      const isCustomer = upper === 'CUSTOMER';
      const isActiveLoad = upper === 'ACTIVE_LOAD' || rawStatus.toLowerCase() === 'active';

      const logoUrl = (account as any)?.logo_url ?? (account as any)?.logoUrl ?? null;
      const domain = (account as any)?.domain ?? null;

      return {
        id: contact.id,
        name: contact.name || account?.name || 'Unknown Asset',
        lat: lat as number,
        lng: lng as number,
        status,
        load,
        zone,
        accountStatus: isCustomer ? 'CUSTOMER' : isActiveLoad ? 'ACTIVE_LOAD' : (account?.status ?? 'PROSPECT'),
        accountId: account?.id ?? null,
        accountName: account?.name ?? 'Unknown Company',
        industry: account?.industry ?? '',
        city: account?.city ?? city ?? '',
        state: account?.state ?? state ?? '',
        logoUrl: logoUrl && typeof logoUrl === 'string' ? logoUrl.trim() || null : null,
        domain: domain && typeof domain === 'string' ? domain.trim() || null : null,
      } as MapNode;
    });
    const accountIdsFromContacts = new Set(contactNodes.map(n => n.accountId).filter(Boolean));
    const accountsOnly = (accountsData || []).filter((a: any) => !accountIdsFromContacts.has(a.id));
    const toNum = (v: unknown): number | null => {
      if (v == null || v === '') return null;
      const n = typeof v === 'number' ? v : Number(v);
      return Number.isFinite(n) ? n : null;
    };
    const accountNodes: MapNode[] = accountsOnly.map((acc: any) => {
      const city = acc.city || '';
      const state = acc.state || '';
      const zone = mapLocationToZone(city, state);
      const rawStatus = (acc.status ?? '').toString().trim();
      const upper = rawStatus.toUpperCase();
      const isCustomer = upper === 'CUSTOMER';
      const isActiveLoad = upper === 'ACTIVE_LOAD' || rawStatus.toLowerCase() === 'active';
      let lat = toNum(acc.latitude);
      let lng = toNum(acc.longitude);
      if (lat == null || lng == null) {
        const hash = (acc.id || '').toString().split('').reduce((a: number, b: string) => { a = ((a << 5) - a) + b.charCodeAt(0); return a & a; }, 0);
        const jitterLat = (hash % 100) / 1000;
        const jitterLng = ((hash >> 4) % 100) / 1000;
        if (zone === ERCOT_ZONES.HOUSTON) { lat = 29.7604 + jitterLat; lng = -95.3698 + jitterLng; }
        else if (zone === ERCOT_ZONES.WEST) { lat = 31.8460 + jitterLat; lng = -102.3680 + jitterLng; }
        else if (zone === ERCOT_ZONES.SOUTH) { lat = 29.4241 + jitterLat; lng = -98.4936 + jitterLng; }
        else { lat = 32.7767 + jitterLat; lng = -96.7970 + jitterLng; }
      }
      const logoUrl = acc.logo_url || acc.logoUrl || null;
      const domain = acc.domain || null;
      return {
        id: `account-${acc.id}`,
        name: acc.name || 'Unknown',
        lat: lat as number,
        lng: lng as number,
        status: 'prospect',
        load: 'LOW',
        zone,
        accountStatus: isCustomer ? 'CUSTOMER' : isActiveLoad ? 'ACTIVE_LOAD' : (acc.status ?? 'PROSPECT'),
        accountId: acc.id,
        accountName: acc.name || 'Unknown Company',
        industry: acc.industry || '',
        city,
        state,
        logoUrl: logoUrl && typeof logoUrl === 'string' ? logoUrl.trim() || null : null,
        domain: domain && typeof domain === 'string' ? domain.trim() || null : null,
      } as MapNode;
    });
    return [...contactNodes, ...accountNodes];
  }, [contactsData, accountsData, prices]);

  const handleMarkerMouseOver = useCallback((node: MapNode) => {
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    hoverTimerRef.current = setTimeout(() => setHoveredNode(node), HOVER_DELAY_MS);
  }, []);

  const handleMarkerMouseOut = useCallback(() => {
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
    // Keep card open long enough for user to move from marker to card and click Open dossier
    if (closeCardTimeoutRef.current) clearTimeout(closeCardTimeoutRef.current);
    closeCardTimeoutRef.current = setTimeout(() => setHoveredNode(null), CARD_CLOSE_DELAY_MS);
  }, []);

  const handleCardMouseEnter = useCallback(() => {
    if (closeCardTimeoutRef.current) {
      clearTimeout(closeCardTimeoutRef.current);
      closeCardTimeoutRef.current = null;
    }
  }, []);

  const handleCardMouseLeave = useCallback(() => {
    if (closeCardTimeoutRef.current) clearTimeout(closeCardTimeoutRef.current);
    closeCardTimeoutRef.current = setTimeout(() => setHoveredNode(null), 400);
  }, []);

  if (!mapboxToken || authLoading || contactsLoading) return (
    <div className="h-full w-full flex items-center justify-center bg-zinc-900/10 backdrop-blur-sm">
      <div className="flex flex-col items-center gap-4">
        <span className="text-xs font-mono text-[#002FA7] animate-pulse">
          {!mapboxToken ? 'ERROR: MAPBOX_TOKEN_MISSING' : authLoading ? '> INITIALIZING_AUTH...' : contactsLoading ? '> RETRIEVING_GRID_ASSETS...' : '> ESTABLISHING_UPLINK...'}
        </span>
      </div>
    </div>
  );

  return (
    <div className="h-full w-full relative group bg-zinc-950">
      <Map
        initialViewState={{
          latitude: 31.0000,
          longitude: -99.0000,
          zoom: 5.5
        }}
        style={{ width: '100%', height: '100%' }}
        mapStyle="mapbox://styles/mapbox/dark-v11"
        mapboxAccessToken={mapboxToken}
        attributionControl={false}
      >
        {nodes.map((node) => (
          <Marker
            key={node.id}
            latitude={node.lat}
            longitude={node.lng}
            anchor="center"
          >
            <div
              className="relative group cursor-pointer"
              onMouseEnter={() => handleMarkerMouseOver(node)}
              onMouseLeave={handleMarkerMouseOut}
            >
              {/* Risk Pulse */}
              {node.status === 'risk' && (
                <div className="absolute inset-0 -m-3 w-8 h-8 rounded-full bg-red-500/20 animate-ping" />
              )}

              {/* The Marker Dot */}
              <div
                className={`rounded-full shadow-lg transition-transform hover:scale-150 duration-200`}
                style={{
                  width: node.load === "HIGH" ? '10px' : '7px',
                  height: node.load === "HIGH" ? '10px' : '7px',
                  backgroundColor: node.accountStatus === 'CUSTOMER' ? '#22c55e' : node.accountStatus === 'ACTIVE_LOAD' ? '#002FA7' : node.status === 'risk' ? '#ef4444' : '#ffffff',
                  boxShadow: `0 0 10px ${node.accountStatus === 'CUSTOMER' ? '#22c55e44' : node.accountStatus === 'ACTIVE_LOAD' ? '#002FA744' : node.status === 'risk' ? '#ef444444' : '#ffffff44'}`
                }}
              />
            </div>
          </Marker>
        ))}
      </Map>

      {/* THE HUD OVERLAY */}
      <div className="absolute top-6 left-6 pointer-events-none">
        <div className="bg-black/40 backdrop-blur-xl border border-white/10 p-4 rounded-2xl shadow-2xl">
          <h3 className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest mb-3 flex items-center gap-2">
            <div className="w-1.5 h-1.5 bg-[#002FA7] rounded-full animate-pulse" />
            Grid Telemetry
          </h3>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-8">
              <span className="text-xs text-zinc-400 font-mono">LZ_NORTH</span>
              <span className="text-xs text-[#002FA7] font-mono">${prices.north.toFixed(2)}</span>
            </div>
            <div className="flex items-center justify-between gap-8">
              <span className="text-xs text-zinc-400 font-mono">LZ_HOUSTON</span>
              <span className="text-xs text-emerald-500 font-mono">${prices.houston.toFixed(2)}</span>
            </div>
            <div className="flex items-center justify-between gap-8">
              <span className="text-xs text-zinc-400 font-mono">LZ_WEST</span>
              <span className="text-xs text-amber-500 font-mono">${(prices.west ?? 0).toFixed(2)}</span>
            </div>
            <div className="flex items-center justify-between gap-8">
              <span className="text-xs text-zinc-400 font-mono">LZ_SOUTH</span>
              <span className="text-xs text-rose-500 font-mono">${(prices.south ?? 0).toFixed(2)}</span>
            </div>
          </div>
          <div className="mt-3 pt-2 border-t border-white/10 flex gap-4 text-[10px] font-mono text-zinc-500">
            <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-[#002FA7]" /> Active load</span>
            <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-[#22c55e]" /> Customer</span>
          </div>
        </div>
      </div>

      {/* Company card after ~3s hover on a dot — stays open so you can click Open dossier */}
      {hoveredNode && (
        <div
          className="absolute bottom-6 left-6 right-6 sm:right-auto sm:max-w-sm pointer-events-auto bg-black/70 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl p-4 z-10 animate-in fade-in slide-in-from-bottom-2 duration-300"
          onMouseEnter={handleCardMouseEnter}
          onMouseLeave={handleCardMouseLeave}
        >
          <div className="flex items-start gap-3">
            <CompanyIcon
              logoUrl={hoveredNode.logoUrl ?? undefined}
              domain={hoveredNode.domain ?? undefined}
              name={hoveredNode.accountName}
              size={40}
              className="shrink-0 w-10 h-10"
              roundedClassName="rounded-[14px]"
            />
            <div className="min-w-0 flex-1 flex flex-col justify-between gap-1">
              <div>
                <p className="text-sm font-mono font-medium text-zinc-100 truncate">{hoveredNode.accountName}</p>
                {hoveredNode.industry && (
                  <p className="text-xs font-mono text-zinc-500 mt-0.5">{hoveredNode.industry}</p>
                )}
                {(hoveredNode.city || hoveredNode.state) && (
                  <p className="text-xs font-mono text-zinc-500 mt-0.5">
                    {[hoveredNode.city, hoveredNode.state].filter(Boolean).join(', ')}
                  </p>
                )}
                <p className="text-[10px] font-mono text-zinc-600 mt-1 uppercase tracking-wider">
                  {hoveredNode.accountStatus === 'CUSTOMER' ? 'Customer' : hoveredNode.accountStatus === 'ACTIVE_LOAD' ? 'Active load' : hoveredNode.accountStatus}
                </p>
              </div>
              {hoveredNode.accountId && (
                <Link
                  href={`/network/accounts/${hoveredNode.accountId}`}
                  className="shrink-0 self-start text-xs font-mono text-[#002FA7] hover:text-blue-400 underline mt-1"
                >
                  Open dossier →
                </Link>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
