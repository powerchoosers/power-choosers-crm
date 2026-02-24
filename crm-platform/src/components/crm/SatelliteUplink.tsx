'use client'
import { useState, useEffect, useMemo } from 'react';
import { MapPin, Satellite, Wifi, Loader2, Search, Copy, CheckCircle2 } from 'lucide-react';
import Map, { Marker, Popup } from 'react-map-gl/mapbox';
import 'mapbox-gl/dist/mapbox-gl.css';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';

interface SatelliteUplinkProps {
  address: string;
  name?: string;
  entityId?: string;
  entityType?: 'contact' | 'account';
  currentPhone?: string;
  city?: string;
  state?: string;
  latitude?: number | null;
  longitude?: number | null;
  accountId?: string; // For contacts, the account ID to save coordinates to
  onSyncComplete?: () => void;
}

export default function SatelliteUplink({
  address,
  name,
  entityId,
  entityType,
  currentPhone,
  city,
  state,
  latitude,
  longitude,
  accountId,
  onSyncComplete
}: SatelliteUplinkProps) {
  const [isActive, setIsActive] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [activeAddress, setActiveAddress] = useState(address);
  // Initialize coordinates from saved props if available (saves API costs!)
  const [coordinates, setCoordinates] = useState<{ lat: number; lng: number } | null>(
    latitude != null && longitude != null ? { lat: latitude, lng: longitude } : null
  );
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchInput, setSearchInput] = useState('');
  const [selectedPOI, setSelectedPOI] = useState<any | null>(null);
  const [nearbyBusinesses, setNearbyBusinesses] = useState<any[]>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

  // Update local address when prop changes (only if different to prevent unnecessary re-renders)
  useEffect(() => {
    if (address !== activeAddress) {
      setActiveAddress(address);
    }
  }, [address, activeAddress]);

  // Sync coordinates from saved props (saves API cost when user later clicks Establish Uplink).
  // Map stays gated until user clicks Establish Uplink — no auto-open on dossier load.
  useEffect(() => {
    if (latitude != null && longitude != null) {
      const newCoords = { lat: latitude, lng: longitude };
      setCoordinates(prev => {
        if (!prev || prev.lat !== newCoords.lat || prev.lng !== newCoords.lng) {
          return newCoords;
        }
        return prev;
      });
    }
  }, [latitude, longitude]);

  // Shadow Intelligence: Fetch POIs from the Search API to find businesses with missing labels
  useEffect(() => {
    const fetchShadowIntel = async () => {
      if (!isActive || !coordinates) return;
      try {
        const res = await fetch(`/api/maps/nearby?lat=${coordinates.lat}&lng=${coordinates.lng}&limit=25`);
        const data = await res.json();
        if (data.results) {
          setNearbyBusinesses(data.results);
        }
      } catch (error) {
        console.error('Shadow Intel failed:', error);
      }
    };
    fetchShadowIntel();
  }, [isActive, coordinates]);

  const handleCopyNamed = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    toast.success('Copied to Clipboard', { description: text });
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Geocode address to coordinates – use server API (works in production + localhost)
  const geocodeAddress = async (addressToGeocode: string): Promise<{ lat: number; lng: number } | null> => {
    if (!addressToGeocode) return null;

    try {
      const res = await fetch(
        `/api/maps/geocode?address=${encodeURIComponent(addressToGeocode)}`
      );
      const data = await res.json();

      if (data.found && data.lat != null && data.lng != null) {
        return { lat: data.lat, lng: data.lng };
      }
      if (data.formattedAddress) {
        setActiveAddress(data.formattedAddress);
      }
      return null;
    } catch (error) {
      console.error('Geocoding error:', error);
      return null;
    }
  };

  const establishUplink = async () => {
    if (isLoading) return

    // If we already have coordinates and address, just show it
    if (coordinates && activeAddress) {
      setIsActive(true)
      return
    }

    setIsLoading(true)
    try {
      // Resolve Address if missing (Search by Name)
      let resolvedAddress = activeAddress;

      if (!resolvedAddress && name) {
        // Build search query: Name + city + state for better results
        let searchQuery = name

        // Add location context if available
        if (city || state) {
          const locationParts = [city, state].filter(Boolean)
          searchQuery = `${name} ${locationParts.join(' ')}`
        }

        toast.info('Initiating Satellite Scan...', { description: `Searching for ${name}` });

        const searchRes = await fetch(`/api/maps/search?q=${encodeURIComponent(searchQuery)}`);
        const searchData = await searchRes.json();

        if (searchData.found && searchData.address) {
          resolvedAddress = searchData.address;
          setActiveAddress(resolvedAddress);
          // Use location from search when available (same API, works in production)
          if (searchData.location?.latitude != null && searchData.location?.longitude != null) {
            setCoordinates({
              lat: Number(searchData.location.latitude),
              lng: Number(searchData.location.longitude),
            });
            setIsActive(true);
            setIsLoading(false);
            return;
          }

          // Auto-Sync Data (Forensic Enrichment)
          if (entityId && entityType) {
            const updates: Record<string, any> = {};

            // Sync Address if empty
            if (!address) {
              updates.address = resolvedAddress;
            }

            // Sync Phone if empty
            // NOTE: Mapbox API does not return phone numbers, so this logic will only work
            // if the backend search endpoint has another data source or is still key-compatible
            // but returning null.
            if (!currentPhone && searchData.phone) {
              updates.phone = searchData.phone;
            }

            if (Object.keys(updates).length > 0) {
              const table = entityType === 'contact' ? 'contacts' : 'accounts';
              const { error } = await supabase
                .from(table)
                .update(updates)
                .eq('id', entityId);

              if (!error) {
                toast.success('Asset Intelligence Acquired', {
                  description: `Synced: ${Object.keys(updates).join(', ')}`
                });
                onSyncComplete?.();
              } else {
                console.error('Sync failed:', error);
              }
            }
          }
        } else {
          toast.error('Target Not Found', { description: 'Satellite sweep returned no coordinates.' });
          setIsLoading(false);
          return;
        }
      } else if (!resolvedAddress && !name) {
        toast.warning('Targeting Error', { description: 'Missing Name or Address for uplink.' });
        setIsLoading(false);
        return;
      }

      // Geocode the address to get coordinates
      const coords = await geocodeAddress(resolvedAddress);
      if (coords) {
        setCoordinates(coords);
        setIsActive(true);

        // PERSIST COORDINATES TO DATABASE (One-time cost, lifetime free)
        // Always save to accounts table - contacts use account location (business location, not personal address)
        if (entityType === 'account' && entityId) {
          // Save directly to account
          await supabase
            .from('accounts')
            .update({
              latitude: coords.lat,
              longitude: coords.lng,
              // Also update address if it was resolved but missing
              ...(resolvedAddress && !address ? { address: resolvedAddress } : {})
            })
            .eq('id', entityId);
        } else if (entityType === 'contact' && accountId) {
          // For contacts, save to their account (business location, not personal address)
          await supabase
            .from('accounts')
            .update({
              latitude: coords.lat,
              longitude: coords.lng,
              // Also update address if it was resolved but missing
              ...(resolvedAddress && !address ? { address: resolvedAddress } : {})
            })
            .eq('id', accountId);
        }
      } else {
        toast.error('Geocoding Failed', { description: 'Could not locate coordinates.' });
      }

    } catch (err) {
      console.error('Failed to establish uplink:', err)
      toast.error('Uplink Failed', { description: 'Signal interference detected.' });
    } finally {
      setIsLoading(false)
    }
  }

  const handleSearch = async () => {
    if (!searchInput.trim()) return;

    setIsLoading(true);
    try {
      const coords = await geocodeAddress(searchInput);
      if (coords) {
        setCoordinates(coords);
        setActiveAddress(searchInput);
        setIsActive(true);
        setIsSearchOpen(false);
        setSearchInput('');
        toast.success('Location Found', { description: searchInput });

        // PERSIST COORDINATES TO DATABASE
        // Always save to accounts table - contacts use account location
        if (entityType === 'account' && entityId) {
          await supabase
            .from('accounts')
            .update({
              latitude: coords.lat,
              longitude: coords.lng,
              address: searchInput
            })
            .eq('id', entityId);
        } else if (entityType === 'contact' && accountId) {
          // For contacts, save to their account (business location, not personal address)
          await supabase
            .from('accounts')
            .update({
              latitude: coords.lat,
              longitude: coords.lng,
              address: searchInput
            })
            .eq('id', accountId);
        }
      } else {
        toast.error('Location Not Found', { description: 'Try a different address.' });
      }
    } catch (error) {
      toast.error('Search Failed');
    } finally {
      setIsLoading(false);
    }
  };

  // All hooks must run before any conditional return (Rules of Hooks)
  const mapExpanded = isActive && !!coordinates;
  const stableCoordinates = useMemo(() => coordinates, [coordinates?.lat, coordinates?.lng]);

  if (!mapboxToken) {
    return (
      <div className="nodal-module-glass nodal-monolith-edge rounded-3xl overflow-hidden relative h-48 flex items-center justify-center p-6 text-center">
        <div className="text-red-500 font-mono text-xs">
          ERROR: MAPBOX TOKEN MISSING.
          <br />Check env configuration.
        </div>
      </div>
    );
  }

  return (
    <div className="nodal-module-glass nodal-monolith-edge rounded-3xl overflow-hidden relative group">

      {/* UPLINK HEADER */}
      <div className="flex items-center justify-between p-3 nodal-recessed border-b border-white/5">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center border transition-all duration-500 bg-black/30 border-white/5 text-zinc-600">
            <Satellite className="w-4 h-4" />
          </div>
          <div>
            <div className="text-[10px] font-mono text-zinc-400 uppercase tracking-widest">Asset_Status</div>
            <div className="text-[9px] font-mono text-zinc-600 uppercase mt-0.5">
              {isActive ? 'Signal_Acquired' : 'Idle_Standby'}
            </div>
          </div>
        </div>

        {/* SEARCH ICON BUTTON */}
        <button
          onClick={() => setIsSearchOpen(!isSearchOpen)}
          className="w-8 h-8 rounded-xl flex items-center justify-center border border-white/10 bg-black/40 text-zinc-400 hover:text-white hover:border-[#002FA7]/50 hover:bg-[#002FA7]/20 transition-all hover:scale-110 hover:brightness-125"
          title="Search Location"
        >
          <Search className="w-4 h-4" />
        </button>
      </div>

      {/* ANIMATED SEARCH DRAWER */}
      <AnimatePresence>
        {isSearchOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: 'easeInOut' }}
            className="overflow-hidden border-b border-white/5 nodal-recessed"
          >
            <div className="p-3">
              <input
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                placeholder="Enter address or location..."
                className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-[#002FA7]/50 focus:ring-1 focus:ring-[#002FA7]/30 transition-all"
                autoFocus
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* BODY: The Map – animates height when map is active */}
      <motion.div
        className={cn(
          "relative w-full nodal-module-glass flex flex-col items-center justify-center overflow-hidden",
          (!isActive || !coordinates) && !isLoading ? "opacity-70" : "opacity-100"
        )}
        initial={false}
        animate={{ height: mapExpanded ? 384 : 128 }}
        transition={{ duration: 0.4, ease: 'easeInOut' }}
      >
        {isLoading ? (
          <div className="flex flex-col items-center gap-2 absolute inset-0 justify-center z-10 bg-black/50 backdrop-blur-sm">
            <Loader2 className="w-6 h-6 text-[#002FA7] animate-spin" />
            <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">Negotiating Uplink...</span>
          </div>
        ) : !isActive || !stableCoordinates ? (
          <div className="absolute inset-0 bg-[url('/grid-pattern.svg')] opacity-30 flex flex-col items-center justify-center">
            {/* The "Locked" State */}
            <div className="z-10 text-center px-6">
              <div className="mb-3 mx-auto w-10 h-10 rounded-2xl bg-black/40 border border-white/10 flex items-center justify-center text-zinc-500 group-hover:text-white group-hover:border-[#002FA7] transition-all">
                <Satellite className="w-4 h-4" />
              </div>
              <button
                onClick={establishUplink}
                className="h-8 pl-4 pr-6 text-[10px] font-mono text-[#4D88FF] border border-[#4D88FF]/50 bg-[#4D88FF]/20 rounded-lg hover:bg-[#4D88FF] hover:text-white hover:scale-105 hover:brightness-125 transition-all uppercase tracking-widest flex items-center justify-center gap-2.5 hover:shadow-[0_0_30px_-5px_rgba(77,136,255,0.6)] mx-auto"
                title="Establish Uplink"
              >
                <Wifi className="w-3.5 h-3.5" /> Establish Uplink
              </button>
            </div>
          </div>
        ) : (
          /* The "Unlocked" State - Mapbox Map with Satellite View */
          <Map
            initialViewState={{
              longitude: stableCoordinates.lng,
              latitude: stableCoordinates.lat,
              zoom: 16
            }}
            style={{ width: '100%', height: '100%', minHeight: '384px' }}
            mapStyle="mapbox://styles/mapbox/standard-satellite"
            mapboxAccessToken={mapboxToken}
            attributionControl={false}
            onMouseEnter={() => {
              const canvas = document.querySelector('.mapboxgl-canvas') as HTMLCanvasElement;
              if (canvas) canvas.style.cursor = 'pointer';
            }}
            onMouseLeave={() => {
              const canvas = document.querySelector('.mapboxgl-canvas') as HTMLCanvasElement;
              if (canvas) canvas.style.cursor = '';
            }}
            onStyleData={(e: any) => {
              const map = e.target;
              try {
                map.setConfigProperty('basemap', 'showPointOfInterestLabels', true);
                map.setConfigProperty('basemap', 'densityPointOfInterestLabels', 5);
              } catch (err) {
                console.warn('Mapbox config error:', err);
              }
            }}
            onClick={(e) => {
              const map = e.target;
              // Query features at the clicked point
              const features = map.queryRenderedFeatures(e.point);

              // Find the best candidate for a label (POI, street name, etc)
              // We prioritize things with a name and a 'poi' or 'label' category if possible
              const poi = features.find(f =>
                f.properties?.name ||
                f.properties?.['name:en'] ||
                f.properties?.title
              );

              if (poi) {
                setSelectedPOI({
                  id: poi.id || Math.random().toString(),
                  name: poi.properties?.name || poi.properties?.['name:en'] || poi.properties?.title || 'Unknown Entity',
                  address: poi.properties?.address || poi.properties?.type || poi.properties?.category || 'Satellite Metadata Extraction',
                  lat: e.lngLat.lat,
                  lng: e.lngLat.lng
                });
              } else {
                setSelectedPOI(null);
              }
            }}
          >
            <Marker longitude={stableCoordinates.lng} latitude={stableCoordinates.lat} anchor="bottom">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedPOI({
                    id: 'target-pin',
                    name: name || activeAddress,
                    address: activeAddress,
                    lat: stableCoordinates.lat,
                    lng: stableCoordinates.lng
                  });
                }}
                className="cursor-pointer hover:scale-110 transition-transform"
              >
                <MapPin className="text-red-500 w-9 h-9 drop-shadow-[0_0_10px_rgba(239,68,68,0.5)]" fill="currentColor" />
              </button>
            </Marker>

            {/* SHADOW INTELLIGENCE LAYER: Invisible hotspots for buildings with no labels */}
            {nearbyBusinesses.map((biz) => (
              <Marker
                key={biz.id}
                longitude={biz.lng}
                latitude={biz.lat}
                anchor="center"
              >
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedPOI({
                      ...biz,
                      isShadow: true
                    });
                  }}
                  className="w-16 h-16 rounded-full bg-transparent hover:bg-[#002FA7]/5 border border-transparent hover:border-[#002FA7]/20 transition-all cursor-pointer group/shadow"
                  title={biz.name}
                >
                  {/* Subtle target indicator only on hover */}
                  <div className="w-full h-full flex items-center justify-center opacity-0 group-hover/shadow:opacity-100 transition-opacity">
                    <div className="w-1.5 h-1.5 bg-[#002FA7] rounded-full shadow-[0_0_10px_#002FA7]" />
                  </div>
                </button>
              </Marker>
            ))}

            {/* POPUP FOR SELECTED POI (From click on Map or Pin) */}
            {selectedPOI && (
              <Popup
                longitude={selectedPOI.lng}
                latitude={selectedPOI.lat}
                anchor="top"
                onClose={() => setSelectedPOI(null)}
                closeButton={false}
                maxWidth="none"
                style={{ padding: 0 }}
              >
                {/* Global CSS override for this specific popup instance to kill the white box */}
                <style dangerouslySetInnerHTML={{
                  __html: `
                  .mapboxgl-popup-content {
                    background: transparent !important;
                    box-shadow: none !important;
                    padding: 0 !important;
                    border: none !important;
                  }
                  .mapboxgl-popup-tip {
                    border-bottom-color: rgba(10, 10, 10, 0.95) !important;
                    filter: drop-shadow(0 -1px 1px rgba(0,47,167,0.3));
                  }
                `}} />
                <div className="nodal-module-glass nodal-monolith-edge p-3 min-w-[220px] rounded-xl shadow-2xl border border-[#002FA7]/30 backdrop-blur-3xl bg-black/95 ring-1 ring-white/10 group/popup animate-in fade-in zoom-in duration-200">
                  <div className="flex justify-between items-start mb-1.5">
                    <div>
                      <div className="text-[9px] font-mono text-[#4D88FF] uppercase tracking-[0.2em] leading-none opacity-80">Identity_Acquired</div>
                      <div className="text-[11px] font-mono font-bold text-white mt-2 leading-tight uppercase line-clamp-2 tracking-wide">{selectedPOI.name}</div>
                    </div>
                    <button
                      onClick={() => handleCopyNamed(selectedPOI.name, selectedPOI.id)}
                      className="p-1.5 rounded-lg bg-white/5 border border-white/10 text-zinc-400 hover:text-white hover:bg-[#002FA7]/20 transition-all flex-shrink-0 ml-3"
                    >
                      {copiedId === selectedPOI.id ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                    </button>
                  </div>
                  <div className="text-[8px] font-mono text-zinc-500 leading-tight mb-3 line-clamp-1 italic tracking-widest opacity-60">
                    {selectedPOI.address === activeAddress ? 'Target_Center' : (selectedPOI.isShadow ? 'Shadow_Intel' : selectedPOI.address)}
                  </div>

                  <button
                    onClick={() => handleCopyNamed(selectedPOI.name, selectedPOI.id)}
                    className="w-full h-9 rounded-lg bg-[#002FA7] text-white border border-[#4D88FF]/30 hover:brightness-125 transition-all flex items-center justify-center gap-2 text-[10px] font-mono uppercase tracking-[0.25em] shadow-[0_4px_20px_rgba(0,47,167,0.4)] font-bold"
                  >
                    {copiedId === selectedPOI.id ? 'Identity_Copied' : 'Transfer_Name'}
                  </button>
                </div>
              </Popup>
            )}
          </Map>
        )}
      </motion.div>
    </div>
  );
}
