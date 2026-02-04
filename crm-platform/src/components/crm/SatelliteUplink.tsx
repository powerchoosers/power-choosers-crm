'use client'
import { useState, useEffect } from 'react';
import { MapPin, Satellite, Wifi, Loader2, Search } from 'lucide-react';
import { GoogleMap, useLoadScript, MarkerF } from '@react-google-maps/api';
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
  onSyncComplete
}: SatelliteUplinkProps) {
  const [isActive, setIsActive] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [activeAddress, setActiveAddress] = useState(address);
  const [coordinates, setCoordinates] = useState<{ lat: number; lng: number } | null>(null);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchInput, setSearchInput] = useState('');

  const { isLoaded } = useLoadScript({
    googleMapsApiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY as string,
  });

  // Update local address when prop changes
  useEffect(() => {
    setActiveAddress(address);
  }, [address]);

  // Geocode address to coordinates using Google Maps Geocoder
  const geocodeAddress = async (addressToGeocode: string): Promise<{ lat: number; lng: number } | null> => {
    if (!addressToGeocode || !isLoaded) return null;
    
    try {
      // Use the Google Maps JavaScript API Geocoder
      const geocoder = new google.maps.Geocoder();
      
      return new Promise((resolve) => {
        geocoder.geocode({ address: addressToGeocode }, (results, status) => {
          if (status === 'OK' && results && results.length > 0) {
            const location = results[0].geometry.location;
            resolve({ lat: location.lat(), lng: location.lng() });
          } else {
            console.error('Geocoding failed:', status);
            resolve(null);
          }
        });
      });
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
          
          // Auto-Sync Data (Forensic Enrichment)
          if (entityId && entityType) {
            const updates: Record<string, any> = {};
            
            // Sync Address if empty
            if (!address) {
              updates.address = resolvedAddress;
            }
            
            // Sync Phone if empty
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
      } else {
        toast.error('Location Not Found', { description: 'Try a different address.' });
      }
    } catch (error) {
      toast.error('Search Failed');
    } finally {
      setIsLoading(false);
    }
  };

  if (!isLoaded) {
    return (
      <div className="bg-zinc-900/40 backdrop-blur-xl border border-white/5 rounded-3xl overflow-hidden relative h-48 flex items-center justify-center">
        <Loader2 className="w-6 h-6 text-[#002FA7] animate-spin" />
      </div>
    );
  }

  return (
    <div className="bg-zinc-900/40 backdrop-blur-xl border border-white/5 rounded-3xl overflow-hidden relative group">
      
      {/* UPLINK HEADER */}
      <div className="flex items-center justify-between p-3 bg-zinc-900/40 border-b border-white/5 backdrop-blur-xl">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center border transition-all duration-500 bg-zinc-800/30 border-white/5 text-zinc-600">
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
          className="w-8 h-8 rounded-xl flex items-center justify-center border border-white/10 bg-zinc-800/50 text-zinc-400 hover:text-white hover:border-[#002FA7]/50 hover:bg-[#002FA7]/20 transition-all hover:scale-110 hover:brightness-125"
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
            className="overflow-hidden border-b border-white/5 bg-zinc-900/60 backdrop-blur-xl"
          >
            <div className="p-3 flex gap-2">
              <input
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                placeholder="Enter address or location..."
                className="flex-1 bg-black/40 border border-white/10 rounded-xl px-4 py-2 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-[#002FA7]/50 focus:ring-1 focus:ring-[#002FA7]/30 transition-all"
                autoFocus
              />
              <button
                onClick={handleSearch}
                disabled={!searchInput.trim() || isLoading}
                className="px-4 py-2 rounded-xl bg-[#002FA7] text-white font-mono text-xs uppercase tracking-widest hover:bg-[#002FA7]/90 hover:scale-105 hover:brightness-125 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 disabled:hover:brightness-100 flex items-center gap-2"
              >
                {isLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Search className="w-4 h-4" />
                )}
                Locate
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* BODY: The Map */}
      <div className={cn(
        "h-96 relative w-full bg-zinc-900/40 flex flex-col items-center justify-center transition-all duration-500",
        (!isActive || !coordinates) && !isLoading ? "opacity-70" : "opacity-100"
      )}>
        
        {isLoading ? (
          <div className="flex flex-col items-center gap-2">
            <Loader2 className="w-6 h-6 text-[#002FA7] animate-spin" />
            <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">Negotiating Uplink...</span>
          </div>
        ) : !isActive || !coordinates ? (
          <div className="absolute inset-0 bg-[url('/grid-pattern.svg')] opacity-30 flex flex-col items-center justify-center">
            {/* The "Locked" State */}
            <div className="z-10 text-center px-6">
              <div className="mb-3 mx-auto w-10 h-10 rounded-2xl bg-zinc-900 border border-white/10 flex items-center justify-center text-zinc-500 group-hover:text-white group-hover:border-[#002FA7] transition-all">
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
          /* The "Unlocked" State - Full Interactive Google Map */
          <GoogleMap
            zoom={18}
            center={coordinates}
            mapContainerClassName="w-full h-full"
            options={{
              mapTypeId: 'satellite',
              zoomControl: true,
              streetViewControl: true,
              mapTypeControl: true,
              fullscreenControl: true,
              styles: [],
            }}
          >
            <MarkerF position={coordinates} />
          </GoogleMap>
        )}
      </div>
    </div>
  );
}
