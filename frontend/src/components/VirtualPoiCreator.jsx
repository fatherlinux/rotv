import React, { useState, useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet-draw/dist/leaflet.draw.css';
import 'leaflet-draw';

// Virtual POI Creator component - handles drawing rectangle and finding POIs for organization creation or adding associations
function VirtualPoiCreator({ isActive, onCancel, destinations, linearFeatures, onPoisSelected, visibleTypes, showTrails, showRivers, visibleBoundaries, getDestinationIconType, mode = 'create' }) {
  const map = useMap();

  const drawnItemsRef = useRef(new L.FeatureGroup());
  const rectangleHandlerRef = useRef(null);

  useEffect(() => {
    const drawnItems = drawnItemsRef.current;

    if (!isActive) {
      // Clean up when component becomes inactive
      drawnItems.clearLayers();
      if (rectangleHandlerRef.current) {
        rectangleHandlerRef.current.disable();
      }
      return;
    }

    map.addLayer(drawnItems);

    // Initialize rectangle handler
    const rectangleHandler = new L.Draw.Rectangle(map, {
      shapeOptions: {
        stroke: true,
        color: '#ff9800',
        weight: 3,
        opacity: 1,
        fill: true,
        fillColor: '#ff9800',
        fillOpacity: 0.2,
        clickable: true
      },
      showArea: false,
      metric: false
    });

    rectangleHandlerRef.current = rectangleHandler;

    // Auto-start drawing mode
    console.log('Enabling rectangle drawing mode');
    rectangleHandler.enable();
    console.log('Rectangle handler enabled:', rectangleHandler.enabled());

    // Handle rectangle creation
    const onDrawCreated = (e) => {
      const layer = e.layer;
      drawnItems.clearLayers();
      drawnItems.addLayer(layer);

      const bounds = layer.getBounds();

      // Extract raw bounds values to avoid circular reference issues
      const south = bounds.getSouth();
      const west = bounds.getWest();
      const north = bounds.getNorth();
      const east = bounds.getEast();

      // Disable rectangle handler to prevent drawing additional rectangles
      if (rectangleHandler) {
        rectangleHandler.disable();
      }

      // Debug logging
      console.log('Rectangle drawn with bounds:', { south, west, north, east });
      console.log('Destinations:', destinations?.length || 0);
      console.log('Linear features:', linearFeatures?.length || 0);

      // Manual bounds checking function
      const isPointInBounds = (lat, lng) => {
        return lat >= south && lat <= north && lng >= west && lng <= east;
      };

      // Find POIs within bounds
      const allPois = [
        ...(destinations || []).map(d => ({ ...d, _type: 'point' })),
        ...(linearFeatures || []).map(f => ({ ...f, _type: f.feature_type || 'trail' }))
      ];

      console.log('Total POIs to check:', allPois.length);
      console.log('Active filters - visibleTypes:', visibleTypes ? Array.from(visibleTypes) : 'none',
                  'showTrails:', showTrails, 'showRivers:', showRivers,
                  'visibleBoundaries:', visibleBoundaries ? visibleBoundaries.size : 0);

      const poisInBounds = allPois.filter(poi => {
        if (poi._type === 'point' && poi.latitude && poi.longitude) {
          // Check if POI type is visible in legend
          const iconType = getDestinationIconType ? getDestinationIconType(poi) : 'default';
          if (!visibleTypes || !visibleTypes.has(iconType)) {
            return false;
          }

          const lat = parseFloat(poi.latitude);
          const lng = parseFloat(poi.longitude);
          const contains = isPointInBounds(lat, lng);
          if (contains) console.log('Found point POI:', poi.name, 'type:', iconType);
          return contains;
        } else if ((poi._type === 'trail' || poi._type === 'river' || poi._type === 'boundary') && poi.geometry) {
          // Check if the linear feature's layer is visible
          if (poi._type === 'trail' && !showTrails) return false;
          if (poi._type === 'river' && !showRivers) return false;
          if (poi._type === 'boundary' && (!visibleBoundaries || !visibleBoundaries.has(poi.id))) return false;

          // For linear features, check if any part intersects bounds
          try {
            const geojson = typeof poi.geometry === 'string' ? JSON.parse(poi.geometry) : poi.geometry;
            if (geojson.type === 'LineString') {
              const contains = geojson.coordinates.some(([lng, lat]) => isPointInBounds(lat, lng));
              if (contains) console.log('Found linear POI:', poi.name, 'type:', poi._type);
              return contains;
            } else if (geojson.type === 'MultiLineString') {
              const contains = geojson.coordinates.some(line =>
                line.some(([lng, lat]) => isPointInBounds(lat, lng))
              );
              if (contains) console.log('Found multiline POI:', poi.name, 'type:', poi._type);
              return contains;
            }
          } catch (err) {
            console.error('Error parsing geometry:', err);
          }
        }
        return false;
      });

      console.log('POIs found in bounds:', poisInBounds.length, poisInBounds.map(p => p.name));

      // Call callback with found POIs
      if (onPoisSelected && poisInBounds.length > 0) {
        onPoisSelected(poisInBounds);
      } else if (poisInBounds.length === 0) {
        alert('No locations found in the selected area. Please draw a larger rectangle.');
        // Re-enable drawing to try again
        if (rectangleHandler) {
          drawnItems.clearLayers();
          rectangleHandler.enable();
        }
      }
    };

    map.on(L.Draw.Event.CREATED, onDrawCreated);

    return () => {
      map.off(L.Draw.Event.CREATED, onDrawCreated);
      if (rectangleHandler) {
        rectangleHandler.disable();
      }
      map.removeLayer(drawnItems);
    };
  }, [isActive, map, destinations, linearFeatures, onPoisSelected, visibleTypes, showTrails, showRivers, visibleBoundaries, getDestinationIconType]);

  if (!isActive) return null;

  const bannerText = mode === 'add'
    ? 'Add Associations: Draw a rectangle around locations to add'
    : 'Create Organization: Draw a rectangle around locations you want to associate';

  return (
    <div className="virtual-poi-creator-banner">
      <div className="banner-content">
        <strong>{bannerText}</strong>
        <button onClick={onCancel} className="banner-close">Cancel</button>
      </div>
    </div>
  );
}

export default VirtualPoiCreator;
