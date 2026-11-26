'use client'
import React, { useState, useEffect, useMemo } from 'react';
import { MapPin, Satellite, Loader2, Copy, CheckCircle2 } from 'lucide-react';
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
                    setError('Location not found');
                }
            } catch (err) {
                console.error('Geocoding error:', err);
                setError('Map unavailable');
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
            <div className="w-full h-full flex items-center justify-center bg-zinc-50 rounded-2xl border border-zinc-200 p-6 text-center">
                <p className="text-sm text-zinc-500">
                    The map is not available right now.
                </p>
            </div>
        );
    }

    return (
        <div className="relative w-full h-full min-h-[300px] rounded-2xl overflow-hidden bg-zinc-100 group border border-zinc-200">
            <AnimatePresence>
                {isLoading && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="absolute inset-0 z-20 bg-white/60 backdrop-blur-sm flex flex-col items-center justify-center p-4"
                    >
                        <Loader2 className="w-6 h-6 text-[#002FA7] motion-safe:animate-spin mb-2" />
                        <span className="text-sm text-zinc-500">Loading the map</span>
                    </motion.div>
                )}

                {error && !isLoading && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="absolute inset-0 z-20 bg-zinc-50 flex flex-col items-center justify-center p-4 text-center"
                    >
                        <Satellite className="w-6 h-6 text-zinc-300 mb-2" />
                        <span className="text-sm font-medium text-zinc-600">{error}</span>
                        <div className="mt-1 text-sm text-zinc-500">{address}</div>
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
                                <MapPin className="text-[#002FA7] w-8 h-8" fill="currentColor" stroke="white" />
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
                                aria-label={`Nearby business: ${poi.name}`}
                                className="group/poi relative cursor-pointer rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                            >
                                <div className="w-6 h-6 rounded-full bg-white border-2 border-[#002FA7] group-hover/poi:scale-110 group-hover/poi:bg-[#002FA7] group-hover/poi:border-white transition-[transform,background-color,border-color] duration-200 flex items-center justify-center">
                                    <div className="w-1.5 h-1.5 rounded-full bg-[#002FA7] group-hover/poi:bg-white" />
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
                            <div className="bg-white p-3 min-w-[200px] rounded-xl border border-zinc-200">
                                <div className="flex justify-between items-start gap-2 mb-2">
                                    <div>
                                <div className="text-xs text-zinc-500 leading-none">Nearby business</div>
                                <div className="text-sm font-semibold text-zinc-950 mt-1 leading-tight line-clamp-2">{selectedPOI.name}</div>
                                    </div>
                                    <button
                                        aria-label="Copy name"
                                        onClick={() => handleCopyNamed(selectedPOI.name, selectedPOI.id)}
                                        className="p-1.5 rounded-lg bg-zinc-100 border border-zinc-200 text-zinc-500 hover:text-[#002FA7] hover:bg-white transition-colors duration-200"
                                    >
                                        {copiedId === selectedPOI.id ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                                    </button>
                                </div>
                                <div className="text-xs text-zinc-500 leading-tight mb-3 line-clamp-2">{selectedPOI.address}</div>

                                <button
                                    onClick={() => handleCopyNamed(selectedPOI.name, selectedPOI.id)}
                                    className="w-full h-9 rounded-[10px] bg-[#002FA7] text-white hover:bg-[#0a3fd1] transition-colors duration-200 flex items-center justify-center gap-2 text-sm font-medium"
                                >
                                    {copiedId === selectedPOI.id ? 'Copied' : 'Copy name'}
                                </button>
                            </div>
                        </Popup>
                    )}
                </Map>
            ) : null}

            {/* Zone label */}
            {zoneLabel && (
                <div className="absolute top-4 left-4 z-10">
                    <div className="px-3 py-1.5 bg-white/90 backdrop-blur-md rounded-lg border border-zinc-200">
                        <span className="text-sm font-medium text-zinc-950">{zoneLabel}</span>
                    </div>
                </div>
            )}
        </div>
    );
}
