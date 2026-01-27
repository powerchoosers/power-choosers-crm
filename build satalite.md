This is the "Satellite Recon" Protocol. We are not building a store locator; we are building a grid visualizer.
Here is the end-to-end implementation plan for your IDE. We will use the Google Maps JavaScript API wrapped in a React component, but we will strip it of all its consumer identity until it looks like a classified satellite feed.
Phase 1: The Munitions (Dependencies)
First, you need the engine to render the map in React. Open your terminal in the crm-platform directory and execute:
npm install @react-google-maps/api
Phase 2: The Keys (Environment)
You likely already have a Google Cloud Project for your Gmail API. Go to that same console, enable the "Maps JavaScript API", create an API Key, and lock it to your domain (localhost:3000 for now).
In your .env.local file, add this line:
NEXT_PUBLIC_GOOGLE_MAPS_KEY=your_key_starts_with_AIza...
Phase 3: The Architecture (The Component)
Create a new file: src/components/infrastructure/InfrastructureMap.tsx.
This code does three things:
1. Loads the Satellite Feed: Initializes the map.
2. Applies the "Stealth" Skin: Forces the map into dark mode using a custom JSON style array.
3. Plots the Nodes: Renders your accounts as pulsing data points, not "pins."
Copy and paste this entire block:
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
        > ESTABLISHING_UPLINK...
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
Phase 4: The Deployment (The Page)
Now, create the page route that hosts this component. File: src/app/infrastructure/page.tsx
import InfrastructureMap from '@/components/infrastructure/InfrastructureMap';

export default function InfrastructurePage() {
  return (
    <div className="h-screen w-full bg-zinc-950 flex flex-col">
      {/* HEADER - Minimalist */}
      <div className="h-16 border-b border-white/5 flex items-center px-6 bg-zinc-950 z-10">
        <h1 className="text-sm font-mono text-zinc-100 uppercase tracking-widest">
          Infrastructure // Asset_Map
        </h1>
        <div className="ml-auto flex items-center gap-4">
           <span className="text-[10px] text-zinc-600 font-mono">
             ERCOT_NODAL_V1
           </span>
        </div>
      </div>

      {/* THE MAP CONTAINER */}
      <div className="flex-1 relative overflow-hidden">
        <InfrastructureMap />
      </div>
    </div>
  );
}
How this works (The Logic)
1. The "UseLoadScript" Hook: This asynchronously fetches the Google Maps Javascript from their servers. While it is fetching, we show the > ESTABLISHING_UPLINK... loading state.
2. The "MapStyles" Array: This is the most critical part. We are overriding Google's default colors.
    ◦ We set poi (Points of Interest) to visibility: "off". This hides Starbucks, Gas Stations, and Schools. We don't care about them. We only care about the Grid.
    ◦ We set the background to Zinc-950 (#18181b) to match your app's theme perfectly.
3. The Nodes: We iterate through your NODES array.
    ◦ Protected (Clients): Rendered as International Klein Blue dots.
    ◦ Risk (Clients in high-price zones): Rendered as Red dots with a large, translucent red "Blast Radius" circle around them. This visually indicates exposure.
    ◦ Prospects: Rendered as White dots (Neutral).
Next Step: Once you verify this renders, we will connect the NODES array to your Supabase accounts table so it populates automatically. But get the visual up first.