'use client'
import React, { useState, useEffect, useMemo } from 'react';
import { MapPin, Satellite, Loader2, ShieldCheck, Copy, CheckCircle2 } from 'lucide-react';
import Map, { Marker, Popup } from 'react-map-gl/mapbox';
import 'mapbox-gl/dist/mapbox-gl.css';
import { motion, AnimatePresence } from 'framer-motion';

interface ForensicMapProps {
    address?: string;
    zoneLabel?: string;
}

export function ForensicMap({ address, zoneLabel }: ForensicMapProps) {
    const [isLoading, setIsLoading] = useState(false);
    const [coordinates, setCoordinates] = useState<{ lat: number; lng: number } | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [nearbyPOIs, setNearbyPOIs] = useState<any[]>([]);
    const [selectedPOI, setSelectedPOI] = useState<any | null>(null);
    const [copiedId, setCopiedId] = useState<string | null>(null);

    const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

    useEffect(() => {
        if (!address) return;

        const geocodeAddress = async () => {
            setIsLoading(true);
            setError(null);
            try {
                const res = await fetch(`/api/maps/geocode?address=${encodeURIComponent(address)}`);
                const data = await res.json();

                if (data.found && data.lat != null && data.lng != null) {
                    setCoordinates({ lat: data.lat, lng: data.lng });
                } else {
                    setError('Location targeting failed');
                }
            } catch (err) {
                console.error('Geocoding error:', err);
                setError('Signal interference');
            } finally {
                setIsLoading(false);
            }
        };

        geocodeAddress();
    }, [address]);

    const fetchNearby = async (lat: number, lng: number) => {
        try {
            const res = await fetch(`/api/maps/nearby?lat=${lat}&lng=${lng}&limit=25`);
            const data = await res.json();
            if (data.results) {
                setNearbyPOIs(data.results);
            }
        } catch (error) {
            console.error('Failed to fetch nearby POIs:', error);
        }
    };

    useEffect(() => {
        if (coordinates) {
            fetchNearby(coordinates.lat, coordinates.lng);
        }
    }, [coordinates]);

    const handleCopyNamed = (text: string, id: string) => {
        navigator.clipboard.writeText(text);
        setCopiedId(id);
        setTimeout(() => setCopiedId(null), 2000);
    };

    const stableCoordinates = useMemo(() => coordinates, [coordinates?.lat, coordinates?.lng]);

    if (!mapboxToken) {
        return (
            <div className="w-full h-full flex items-center justify-center bg-zinc-900/10 rounded-2xl border border-dashed border-zinc-200 p-6 text-center">
                <div className="text-red-500 font-mono text-[10px] uppercase tracking-widest">
                    ERROR: MAPBOX_TOKEN_MISSING
                </div>
            </div>
        );
    }

    return (
        <div className="relative w-full h-full min-h-[300px] rounded-2xl overflow-hidden bg-zinc-100 group border border-zinc-200/50 shadow-inner">
            <AnimatePresence>
                {isLoading && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="absolute inset-0 z-20 bg-white/60 backdrop-blur-sm flex flex-col items-center justify-center p-4"
                    >
                        <Loader2 className="w-6 h-6 text-[#002FA7] animate-spin mb-2" />
                        <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest animate-pulse">Scanning Satellite Uplink...</span>
                    </motion.div>
                )}

                {error && !isLoading && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="absolute inset-0 z-20 bg-zinc-50 flex flex-col items-center justify-center p-4 text-center"
                    >
                        <Satellite className="w-6 h-6 text-zinc-300 mb-2" />
                        <span className="text-[10px] font-mono text-zinc-400 uppercase tracking-widest">{error}</span>
                        <div className="mt-1 text-[9px] text-zinc-300 font-mono">{address}</div>
                    </motion.div>
                )}
            </AnimatePresence>

            {stableCoordinates ? (
                <Map
                    initialViewState={{
                        longitude: stableCoordinates.lng,
                        latitude: stableCoordinates.lat,
                        zoom: 17,
                        pitch: 45
                    }}
                    mapStyle="mapbox://styles/mapbox/standard-satellite"
                    mapboxAccessToken={mapboxToken}
                    attributionControl={false}
                    reuseMaps
                    onStyleData={(e: any) => {
                        const map = e.target;
                        try {
                            map.setConfigProperty('basemap', 'showPointOfInterestLabels', true);
                            map.setConfigProperty('basemap', 'densityPointOfInterestLabels', 5);
                        } catch (err) {
                            console.warn('Mapbox config error:', err);
                        }
                    }}
                >
                    <Marker longitude={stableCoordinates.lng} latitude={stableCoordinates.lat} anchor="bottom">
                        <motion.div
                            initial={{ scale: 0, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            transition={{ type: 'spring', damping: 12, stiffness: 200, delay: 0.5 }}
                        >
                            <div className="relative">
                                <MapPin className="text-red-500 w-8 h-8 drop-shadow-[0_0_10px_rgba(239,68,68,0.5)]" fill="currentColor" />
                                <div className="absolute -top-1 -right-1 w-3 h-3 bg-white rounded-full flex items-center justify-center shadow-sm">
                                    <div className="w-1.5 h-1.5 bg-red-500 rounded-full animate-ping" />
                                </div>
                            </div>
                        </motion.div>
                    </Marker>

                    {/* NEARBY POI MARKERS */}
                    {nearbyPOIs.map((poi) => (
                        <Marker
                            key={poi.id}
                            longitude={poi.lng}
                            latitude={poi.lat}
                            anchor="bottom"
                        >
                            <button
                                onClick={e => {
                                    e.stopPropagation();
                                    setSelectedPOI(poi);
                                }}
                                className="group relative cursor-pointer outline-none focus:outline-none"
                            >
                                <div className="w-6 h-6 rounded-full bg-white/90 border-2 border-[#002FA7] group-hover:scale-125 group-hover:bg-[#002FA7] group-hover:border-white transition-all flex items-center justify-center shadow-lg shadow-blue-500/20">
                                    <div className="w-1.5 h-1.5 rounded-full bg-[#002FA7] group-hover:bg-white animate-pulse" />
                                </div>
                            </button>
                        </Marker>
                    ))}

                    {/* POPUP FOR SELECTED POI */}
                    {selectedPOI && (
                        <Popup
                            longitude={selectedPOI.lng}
                            latitude={selectedPOI.lat}
                            anchor="top"
                            onClose={() => setSelectedPOI(null)}
                            closeButton={false}
                            className="z-50"
                        >
                            <div className="bg-white/95 backdrop-blur-md p-3 min-w-[200px] rounded-xl shadow-2xl border border-zinc-200">
                                <div className="flex justify-between items-start mb-2">
                                    <div>
                                        <div className="text-[10px] font-mono text-[#002FA7] uppercase tracking-widest leading-none">POI_Identity</div>
                                        <div className="text-xs font-mono font-bold text-zinc-900 mt-1 leading-tight uppercase line-clamp-2">{selectedPOI.name}</div>
                                    </div>
                                    <button
                                        onClick={() => handleCopyNamed(selectedPOI.name, selectedPOI.id)}
                                        className="p-1.5 rounded-lg bg-zinc-100 border border-zinc-200 text-zinc-500 hover:text-[#002FA7] hover:bg-white transition-all"
                                    >
                                        {copiedId === selectedPOI.id ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                                    </button>
                                </div>
                                <div className="text-[9px] font-mono text-zinc-500 leading-tight mb-3 line-clamp-2 italic">{selectedPOI.address}</div>

                                <button
                                    onClick={() => handleCopyNamed(selectedPOI.name, selectedPOI.id)}
                                    className="w-full h-9 rounded-lg bg-[#002FA7] text-white border border-blue-600 hover:brightness-110 transition-all flex items-center justify-center gap-2 text-[10px] font-mono uppercase tracking-widest shadow-md shadow-blue-500/20"
                                >
                                    {copiedId === selectedPOI.id ? 'Copied' : 'Copy Business Name'}
                                </button>
                            </div>
                        </Popup>
                    )}
                </Map>
            ) : (
                <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-[0.03] pointer-events-none" />
            )}

            {/* Overlays */}
            <div className="absolute top-4 left-4 z-10 flex flex-col gap-2">
                <div className="px-3 py-1.5 bg-white/90 backdrop-blur-md rounded-lg border border-zinc-200 shadow-sm flex items-center gap-2">
                    <Satellite className="w-3.5 h-3.5 text-[#002FA7]" />
                    <span className="text-[10px] font-mono text-zinc-600 uppercase tracking-widest">Active_Uplink</span>
                </div>
                {zoneLabel && (
                    <div className="px-3 py-1.5 bg-zinc-900/90 backdrop-blur-md rounded-lg border border-white/10 shadow-sm flex items-center gap-2">
                        <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                        <span className="text-[10px] font-mono text-zinc-300 uppercase tracking-widest">{zoneLabel}</span>
                    </div>
                )}
            </div>

            <div className="absolute bottom-4 right-4 z-10">
                <div className="px-3 py-1.5 bg-white/80 backdrop-blur-md rounded-lg border border-zinc-200/50 shadow-sm flex items-center gap-2">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                    <span className="text-[9px] font-mono text-zinc-500 uppercase tracking-tight">Geo-Spatial Verification: Active</span>
                </div>
            </div>
        </div>
    );
}
