'use client'
import React, { useMemo } from 'react';
import { GoogleMap, useLoadScript, MarkerF, CircleF } from '@react-google-maps/api';
import { useInfiniteQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { mapLocationToZone, ERCOT_ZONES } from '@/lib/market-mapping';
import { useAuth } from '@/context/AuthContext';
import { useMarketPulse } from '@/hooks/useMarketPulse';

// 1. THE NODAL "STEALTH" SKIN
// This JSON strips away parks, schools, and labels, leaving only the grid geometry.
const mapStyles = [
  { elementType: "geometry", stylers: [{ color: "#18181b" }] }, // Zinc-950 Background
  { elementType: "labels.text.stroke", stylers: [{ color: "#242f3e" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#746855" }] },
  {
    featureType: "administrative.locality",
    elementType: "labels.text.fill",
    stylers: [{ color: "#a1a1aa" }], // Zinc-400 Text
  },
  {
    featureType: "poi", // Hides Parks, Schools, Businesses
    stylers: [{ visibility: "off" }],
  },
  {
    featureType: "road",
    elementType: "geometry",
    stylers: [{ color: "#27272a" }], // Zinc-800 Roads
  },
  {
    featureType: "road",
    elementType: "geometry.stroke",
    stylers: [{ color: "#212a37" }],
  },
  {
    featureType: "road.highway",
    elementType: "geometry",
    stylers: [{ color: "#3f3f46" }], // Zinc-700 Highways
  },
  {
    featureType: "water",
    elementType: "geometry",
    stylers: [{ color: "#000000" }], // Black Water
  },
  {
    featureType: "water",
    elementType: "labels.text.fill",
    stylers: [{ color: "#515c6d" }],
  },
];

export default function InfrastructureMap() {
  const { user, role, loading: authLoading } = useAuth();
  const { isLoaded } = useLoadScript({
    googleMapsApiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY as string,
  });

  const { data: marketPulse } = useMarketPulse();
  const prices = useMemo(() => ({
    north: marketPulse?.prices?.north ?? 24.15,
    houston: marketPulse?.prices?.houston ?? 21.80,
    west: marketPulse?.prices?.west ?? 45.20,
    south: marketPulse?.prices?.south ?? 22.40
  }), [marketPulse]);

  // Fetch real contacts from Supabase
  const { data: contactsData, isLoading: contactsLoading } = useInfiniteQuery({
    queryKey: ['contacts-infrastructure', user?.email],
    initialPageParam: 0,
    queryFn: async ({ pageParam = 0 }) => {
      if (!user) return { contacts: [], nextCursor: null };
      
      let query = supabase
        .from('contacts')
        .select('*, accounts!inner(name, city, state, industry, annual_usage, status)', { count: 'exact' })
        .in('accounts.status', ['ACTIVE_LOAD', 'CUSTOMER']);

      if (role !== 'admin' && user?.email) {
        query = query.eq('ownerId', user.email);
      }

      const PAGE_SIZE = 1000; // Get as many as possible for the map
      const from = pageParam * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      const { data, error, count } = await query.range(from, to);

      if (error) throw error;

      return {
        contacts: data || [],
        nextCursor: count && from + PAGE_SIZE < count ? pageParam + 1 : null
      };
    },
    enabled: !!user && !authLoading,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
  });

  // Flatten contacts and map to nodes
  const nodes = useMemo(() => {
    if (!contactsData) return [];
    
    return contactsData.pages.flatMap(page => page.contacts).map(contact => {
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

      // Geocoding fallback: If no lat/lng, use approximate city coordinates
      // In a real app, you'd have these stored. For now, we'll use the cached columns, 
      // or approximate Texas center with slight jitter
      let lat = contact.latitude ?? contact.lat;
      let lng = contact.longitude ?? contact.lng;

      // Inherit from account if contact has no direct coordinates
      if (lat == null || lng == null) {
        if (account?.latitude && account?.longitude) {
          lat = account.latitude;
          lng = account.longitude;
        }
      }

      if (lat == null || lng == null) {
        // Simple city-based jitter for visualization if no real coords
        const hash = (contact.id || '').split('').reduce((a: number, b: string) => { a = ((a << 5) - a) + b.charCodeAt(0); return a & a; }, 0);
        const jitterLat = (hash % 100) / 100;
        const jitterLng = ((hash >> 4) % 100) / 100;
        
        // Base coords for Texas zones
        if (zone === ERCOT_ZONES.HOUSTON) { lat = 29.7604 + jitterLat; lng = -95.3698 + jitterLng; }
        else if (zone === ERCOT_ZONES.WEST) { lat = 31.8460 + jitterLat; lng = -102.3680 + jitterLng; }
        else if (zone === ERCOT_ZONES.SOUTH) { lat = 29.4241 + jitterLat; lng = -98.4936 + jitterLng; }
        else { lat = 32.7767 + jitterLat; lng = -96.7970 + jitterLng; }
      }

      return {
        id: contact.id,
        name: contact.name || account?.name || 'Unknown Asset',
        lat,
        lng,
        status,
        load,
        zone
      };
    });
  }, [contactsData, prices]);

  const center = useMemo(() => ({ lat: 31.0000, lng: -99.0000 }), []); // Center on Texas

  if (!isLoaded || authLoading || contactsLoading) return (
    <div className="h-full w-full flex items-center justify-center bg-zinc-900/10 backdrop-blur-sm">
      <div className="flex flex-col items-center gap-4">
        <span className="text-xs font-mono text-[#002FA7] animate-pulse">
          {authLoading ? '> INITIALIZING_AUTH...' : contactsLoading ? '> RETRIEVING_GRID_ASSETS...' : '> ESTABLISHING_UPLINK...'}
        </span>
        {contactsLoading && (
          <div className="w-48 h-1 bg-zinc-800 rounded-full overflow-hidden">
            <div className="h-full bg-[#002FA7] animate-progress" />
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="h-full w-full relative group bg-zinc-950">
      
      <GoogleMap
        zoom={6}
        center={center}
        mapContainerClassName="w-full h-full"
        options={{
          styles: mapStyles,
          disableDefaultUI: true,
          zoomControl: false,
          streetViewControl: false,
          mapTypeControl: false,
          backgroundColor: '#09090b',
        }}
      >
        {/* RENDER NODES */}
        {nodes.map((node) => (
          <React.Fragment key={node.id}>
            {/* The Pulse Effect for High Value Targets */}
            {node.status === 'risk' && (
              <CircleF
                center={{ lat: node.lat, lng: node.lng }}
                radius={30000}
                options={{
                  strokeColor: '#ef4444',
                  strokeOpacity: 0.8,
                  strokeWeight: 1,
                  fillColor: '#ef4444',
                  fillOpacity: 0.15,
                }}
              />
            )}
            
            {/* The Hard Node */}
            <MarkerF 
              position={{ lat: node.lat, lng: node.lng }}
              icon={{
                path: google.maps.SymbolPath.CIRCLE,
                scale: node.load === "HIGH" ? 6 : 4,
                fillColor: node.status === 'protected' ? '#002FA7' : node.status === 'risk' ? '#ef4444' : '#ffffff',
                fillOpacity: 1,
                strokeWeight: 0,
              }}
            />
          </React.Fragment>
        ))}
      </GoogleMap>

      {/* 2. THE HUD OVERLAY (Floating Telemetry) */}
      <div className="absolute top-6 left-6 pointer-events-none">
        <div className="bg-black/40 backdrop-blur-xl border border-white/10 p-4 rounded-2xl shadow-2xl">
          <h3 className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest mb-3 flex items-center gap-2">
            <div className="w-1.5 h-1.5 bg-[#002FA7] rounded-full animate-pulse"/>
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
              <span className="text-xs text-amber-500 font-mono">${prices.west.toFixed(2)}</span>
            </div>
            <div className="flex items-center justify-between gap-8">
              <span className="text-xs text-zinc-400 font-mono">LZ_SOUTH</span>
              <span className="text-xs text-rose-500 font-mono">${prices.south.toFixed(2)}</span>
            </div>
          </div>
        </div>
      </div>

    </div>
  );
}
