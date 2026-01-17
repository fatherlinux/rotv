import React, { useEffect, useState, useRef } from 'react';
import { MapContainer, TileLayer, CircleMarker, useMap } from 'react-leaflet';

// Park center for default view
const PARK_CENTER = [41.26, -81.55];
const DEFAULT_BOUNDS = [[41.1, -81.7], [41.4, -81.4]];

// Component to fix map size and sync bounds
function MapBoundsSync({ bounds }) {
  const map = useMap();

  useEffect(() => {
    // Force size recalculation
    map.invalidateSize();

    // Fit to bounds if provided
    if (bounds && bounds.length === 2) {
      map.fitBounds(bounds, { animate: false, padding: [0, 0] });
    }
  }, [map, bounds]);

  // Use IntersectionObserver to detect when map becomes visible
  useEffect(() => {
    const container = map.getContainer();
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setTimeout(() => {
              map.invalidateSize();
              if (bounds && bounds.length === 2) {
                map.fitBounds(bounds, { animate: false, padding: [0, 0] });
              }
            }, 50);
          }
        });
      },
      { threshold: 0.1 }
    );

    observer.observe(container);
    return () => observer.disconnect();
  }, [map, bounds]);

  return null;
}

/**
 * MapThumbnail - A small, non-interactive map preview showing the current viewport
 * Used in News and Events tabs to show which area is being filtered
 */
function MapThumbnail({
  bounds = DEFAULT_BOUNDS,
  aspectRatio = 1.5,
  visibleDestinations = [],
  onClick,
  poiCount = 0
}) {
  const [isReady, setIsReady] = useState(false);
  const containerRef = useRef(null);

  // Delay map render until container is mounted
  useEffect(() => {
    const timer = setTimeout(() => setIsReady(true), 50);
    return () => clearTimeout(timer);
  }, []);

  // Calculate thumbnail dimensions based on aspect ratio
  // Max width of 200px, height adjusts to match aspect ratio
  const maxWidth = 200;
  const width = maxWidth;
  const height = Math.round(maxWidth / aspectRatio);

  // Calculate center from bounds for initial render
  const center = bounds && bounds.length === 2
    ? [(bounds[0][0] + bounds[1][0]) / 2, (bounds[0][1] + bounds[1][1]) / 2]
    : PARK_CENTER;

  return (
    <div
      className="map-thumbnail-container"
      onClick={onClick}
      ref={containerRef}
      style={{ width: `${width}px`, height: `${height}px` }}
    >
      {isReady && (
        <MapContainer
          center={center}
          zoom={11}
          scrollWheelZoom={false}
          dragging={false}
          zoomControl={false}
          doubleClickZoom={false}
          touchZoom={false}
          keyboard={false}
          boxZoom={false}
          attributionControl={false}
          style={{ height: '100%', width: '100%' }}
        >
          <MapBoundsSync bounds={bounds} />
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          {/* Small dots for visible POIs */}
          {visibleDestinations.map(dest => {
            if (!dest.latitude || !dest.longitude) return null;
            return (
              <CircleMarker
                key={`poi-${dest.id}`}
                center={[parseFloat(dest.latitude), parseFloat(dest.longitude)]}
                radius={3}
                pathOptions={{
                  color: '#2d5016',
                  fillColor: '#4a7c23',
                  fillOpacity: 0.8,
                  weight: 1
                }}
              />
            );
          })}
        </MapContainer>
      )}

      {/* POI count chip - same style as main map */}
      <div className="map-thumbnail-poi-count">
        {poiCount} POI{poiCount !== 1 ? 's' : ''} in view
      </div>
    </div>
  );
}

export default MapThumbnail;
