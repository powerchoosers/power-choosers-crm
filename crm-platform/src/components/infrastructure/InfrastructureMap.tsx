'use client'
import React, { useMemo } from 'react';
import { GoogleMap, useLoadScript, MarkerF, CircleF } from '@react-google-maps/api';

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

// MOCK DATA - Replace this with your Supabase fetch later
const NODES = [
  { id: 1, name: "Allen Brothers", lat: 32.7767, lng: -96.7970, status: "risk", load: "HIGH" }, // Dallas
  { id: 2, name: "Tech Manufacturing", lat: 29.7604, lng: -95.3698, status: "protected", load: "MED" }, // Houston
  { id: 3, name: "West TX Pumps", lat: 31.8460, lng: -102.3680, status: "prospect", load: "LOW" }, // Odessa
];

export default function InfrastructureMap() {
  const { isLoaded } = useLoadScript({
    googleMapsApiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY as string,
  });

  const center = useMemo(() => ({ lat: 31.0000, lng: -99.0000 }), []); // Center on Texas

  if (!isLoaded) return (
    <div className="h-full w-full flex items-center justify-center bg-zinc-950">
      <span className="text-xs font-mono text-[#002FA7] animate-pulse">
        {'>'} ESTABLISHING_UPLINK...
      </span>
    </div>
  );

  return (
    <div className="h-full w-full relative group">
      
      <GoogleMap
        zoom={6}
        center={center}
        mapContainerClassName="w-full h-full rounded-none"
        options={{
          styles: mapStyles,
          disableDefaultUI: true, // Kills the "Map/Satellite" buttons
          zoomControl: false,     // Minimalist: No zoom buttons (use scroll)
          streetViewControl: false,
          mapTypeControl: false,
          backgroundColor: '#18181b', // Seamless loading bg
        }}
      >
        {/* RENDER NODES */}
        {NODES.map((node) => (
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
              <span className="text-xs text-[#002FA7] font-mono">$24.15</span>
            </div>
            <div className="flex items-center justify-between gap-8">
              <span className="text-xs text-zinc-400 font-mono">LZ_HOUSTON</span>
              <span className="text-xs text-emerald-500 font-mono">$21.80</span>
            </div>
            <div className="flex items-center justify-between gap-8">
              <span className="text-xs text-zinc-400 font-mono">LZ_WEST</span>
              <span className="text-xs text-amber-500 font-mono">$45.20</span>
            </div>
          </div>
        </div>
      </div>

    </div>
  );
}
