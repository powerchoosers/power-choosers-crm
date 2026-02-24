an you give me the instructions for react mapbox on the internet version
For React on the web (“internet version”), the knowledge sources show two main patterns:

1. Use Mapbox GL JS directly in React
You create a mapboxgl.Map inside a React component and attach it to a ref. Example pattern:[Standard interactions React]

import React, { useEffect, useRef } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";

const accessToken = "YOUR_MAPBOX_ACCESS_TOKEN";

export default function MapboxMap() {
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);

  useEffect(() => {
    mapboxgl.accessToken = accessToken;

    mapRef.current = new mapboxgl.Map({
      container: mapContainerRef.current,
      style: "mapbox://styles/mapbox/standard",
      center: [-74.5, 40],
      zoom: 9
    });

    return () => mapRef.current.remove();
  }, []);

  return <div ref={mapContainerRef} style={{ height: "100vh" }} />;
}
You can then add sources, layers, interactions, and popups in the on('load') handler, as shown in the popup examples.[Popup on click React; Popup on hover React]

2. Add search/geocoding React components
a) Geocoder (Search JS React)
Install and use the <Geocoder> component, optionally bound to your map so it zooms and drops a marker when a result is chosen.[Geocoding React quickstart; Geocoder + map integration]

npm install --save @mapbox/search-js-react
import { useRef, useEffect, useState } from "react";
import { Geocoder } from "@mapbox/search-js-react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";

const accessToken = "YOUR_MAPBOX_ACCESS_TOKEN";

export default function MapWithGeocoder() {
  const mapContainerRef = useRef();
  const mapInstanceRef = useRef();
  const [, setMapLoaded] = useState(false);
  const [inputValue, setInputValue] = useState("");

  useEffect(() => {
    mapboxgl.accessToken = accessToken;

    mapInstanceRef.current = new mapboxgl.Map({
      container: mapContainerRef.current,
      center: [-74.5, 40],
      zoom: 9
    });

    mapInstanceRef.current.on("load", () => {
      setMapLoaded(true);
    });
  }, []);

  return (
    <>
      <Geocoder
        accessToken={accessToken}
        map={mapInstanceRef.current}
        mapboxgl={mapboxgl}
        value={inputValue}
        onChange={(v) => setInputValue(v)}
        marker
      />
      <div ref={mapContainerRef} style={{ height: 300 }} />
    </>
  );
}
b) Search Box (Search JS React)
Very similar, but using <SearchBox> for more general place search.[SearchBox + map integration]

import { useRef, useEffect, useState } from "react";
import { SearchBox } from "@mapbox/search-js-react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";

const accessToken = "YOUR_MAPBOX_ACCESS_TOKEN";

export default function MapWithSearchBox() {
  const mapContainerRef = useRef();
  const mapInstanceRef = useRef();
  const [mapLoaded, setMapLoaded] = useState(false);
  const [inputValue, setInputValue] = useState("");

  useEffect(() => {
    mapboxgl.accessToken = accessToken;

    mapInstanceRef.current = new mapboxgl.Map({
      container: mapContainerRef.current,
      center: [-74.5, 40],
      zoom: 9
    });

    mapInstanceRef.current.on("load", () => {
      setMapLoaded(true);
    });
  }, []);

  return (
    <>
      <SearchBox
        accessToken={accessToken}
        map={mapInstanceRef.current}
        mapboxgl={mapboxgl}
        value={inputValue}
        onChange={(v) => setInputValue(v)}
        marker
      />
      <div ref={mapContainerRef} style={{ height: 300 }} />
    </>
  );
}
If you tell me what you want specifically (just a map, map + search, popups, etc.), I can narrow this down to a single minimal React example.