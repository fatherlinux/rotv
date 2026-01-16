import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { MapContainer, TileLayer, Marker, Tooltip, useMap, ImageOverlay, GeoJSON, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import MapAdmin from './MapAdmin';

// Custom icon definitions
const createIcon = (iconUrl) => L.icon({
  iconUrl,
  iconSize: [28, 28],
  iconAnchor: [14, 14],
  tooltipAnchor: [0, -14]
});

// Default icon as fallback before database loads
const defaultIcon = createIcon('/icons/default.svg');

// Get icon URL - either static file or API for generated icons
function getIconUrl(icon) {
  if (icon.svg_content) {
    // AI-generated icon stored in database - serve from API
    return `/api/icons/${icon.name}.svg`;
  }
  // Static icon file
  return `/icons/${icon.svg_filename || `${icon.name}.svg`}`;
}

// Create Leaflet icons from database icon config
function createIconsFromConfig(iconConfig) {
  const icons = {};
  iconConfig.forEach(icon => {
    if (icon.enabled !== false) {
      icons[icon.name] = createIcon(getIconUrl(icon));
    }
  });
  // Always ensure default exists
  if (!icons['default']) {
    icons['default'] = createIcon('/icons/default.svg');
  }
  return icons;
}

// Check if a keyword exists as a whole word in text (not as a substring)
// e.g., "house" should match "Lock House" but not "Lighthouse"
function matchesWholeWord(text, keyword) {
  // Escape special regex characters in keyword
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Match keyword with word boundaries
  const regex = new RegExp(`\\b${escaped}\\b`, 'i');
  return regex.test(text);
}

// Get icon type for a destination using database configuration
function getDestinationIconTypeFromConfig(dest, iconConfig) {
  const name = (dest.name || '').toLowerCase();
  const activities = (dest.primary_activities || '').toLowerCase();

  // Check title keywords first (in sort order - first match wins)
  for (const icon of iconConfig) {
    if (icon.enabled === false) continue;
    if (!icon.title_keywords) continue;

    const keywords = icon.title_keywords.split(',').map(k => k.trim().toLowerCase());
    for (const keyword of keywords) {
      if (keyword && matchesWholeWord(name, keyword)) {
        return icon.name;
      }
    }
  }

  // Check activity fallbacks (in sort order - first match wins)
  for (const icon of iconConfig) {
    if (icon.enabled === false) continue;
    if (!icon.activity_fallbacks) continue;

    const fallbackActivities = icon.activity_fallbacks.split(',').map(a => a.trim().toLowerCase());
    for (const activity of fallbackActivities) {
      if (activity && matchesWholeWord(activities, activity)) {
        return icon.name;
      }
    }
  }

  return 'default';
}

// Cuyahoga Valley National Park center coordinates
const PARK_CENTER = [41.26, -81.55];
const DEFAULT_ZOOM = 11;

// Get marker color based on property owner
function getOwnerColor(owner) {
  if (!owner) return '#f57c00';
  const ownerLower = owner.toLowerCase();
  if (ownerLower.includes('federal') || ownerLower.includes('nps')) return '#2d5016';
  if (ownerLower.includes('private')) return '#7b2d8e';
  if (ownerLower.includes('local') || ownerLower.includes('metro') || ownerLower.includes('county')) return '#1565c0';
  return '#f57c00';
}

function getOwnerType(owner) {
  if (!owner) return 'other';
  const ownerLower = owner.toLowerCase();
  if (ownerLower.includes('federal') || ownerLower.includes('nps')) return 'federal';
  if (ownerLower.includes('private')) return 'private';
  if (ownerLower.includes('local') || ownerLower.includes('metro') || ownerLower.includes('county')) return 'local';
  return 'other';
}

function Legend({ showMapOverlay, onToggleMapOverlay, showVectorLayers, onToggleVectorLayers, onOpenAdmin, visibleTypes, onToggleType, onShowAll, onHideAll, activeTab, iconConfig, onFileSelect, selectedFileName, importType, onImportTypeChange, onImportFile, importingFile, importMessage, onDismissMessage }) {
  const isEditTab = activeTab === 'edit';

  // Convert iconConfig to the format needed for legend display
  const iconTypes = useMemo(() => {
    if (!iconConfig || iconConfig.length === 0) {
      // Fallback to default set if config not loaded yet
      return [
        { id: 'visitor-center', label: 'Visitor Center', svg_filename: 'visitor-center.svg' },
        { id: 'waterfall', label: 'Waterfall', svg_filename: 'waterfall.svg' },
        { id: 'trail', label: 'Trail', svg_filename: 'trail.svg' },
        { id: 'historic', label: 'Historic Site', svg_filename: 'historic.svg' },
        { id: 'bridge', label: 'Bridge', svg_filename: 'bridge.svg' },
        { id: 'train', label: 'Train Station', svg_filename: 'train.svg' },
        { id: 'nature', label: 'Nature Area', svg_filename: 'nature.svg' },
        { id: 'skiing', label: 'Skiing', svg_filename: 'skiing.svg' },
        { id: 'biking', label: 'Biking', svg_filename: 'biking.svg' },
        { id: 'picnic', label: 'Picnic Area', svg_filename: 'picnic.svg' },
        { id: 'camping', label: 'Camping', svg_filename: 'camping.svg' },
        { id: 'music', label: 'Music Venue', svg_filename: 'music.svg' },
        { id: 'default', label: 'Other', svg_filename: 'default.svg' }
      ];
    }
    return iconConfig
      .filter(icon => icon.enabled !== false)
      .map(icon => ({
        id: icon.name,
        label: icon.label,
        svg_filename: icon.svg_filename || `${icon.name}.svg`,
        svg_content: icon.svg_content,
        iconUrl: getIconUrl(icon)
      }));
  }, [iconConfig]);

  return (
    <div className="legend">
      <div className="legend-header-row">
        <h4>Point of Interest</h4>
        <div className="legend-filter-btns">
          <button onClick={onShowAll} title="Show All">All</button>
          <button onClick={onHideAll} title="Hide All">None</button>
        </div>
      </div>
      <div className="legend-icons">
        {iconTypes.map(type => (
          <div
            key={type.id}
            className={`legend-icon-item ${visibleTypes.has(type.id) ? 'active' : 'inactive'}`}
            onClick={() => onToggleType(type.id)}
          >
            {type.svg_content ? (
              <div className="legend-icon-svg" dangerouslySetInnerHTML={{ __html: type.svg_content }} />
            ) : (
              <img src={type.iconUrl || `/icons/${type.svg_filename}`} alt={type.label} />
            )}
            <span>{type.label}</span>
          </div>
        ))}
      </div>
      <div className="legend-divider"></div>
      <h4>Map Layers</h4>
      <label className="legend-toggle">
        <input
          type="checkbox"
          checked={showMapOverlay}
          onChange={(e) => onToggleMapOverlay(e.target.checked)}
        />
        <span>NPS Park Map</span>
      </label>
      <label className="legend-toggle">
        <input
          type="checkbox"
          checked={showVectorLayers}
          onChange={(e) => onToggleVectorLayers(e.target.checked)}
        />
        <span>Trails & Boundary</span>
      </label>

      {/* Edit tab - show admin tools */}
      {isEditTab && (
        <>
          <div className="legend-divider"></div>
          <h4>Import Spatial Data</h4>
          <p className="edit-mode-hint">Import trails, rivers, or boundaries from GeoJSON files:</p>
          <div className="spatial-import-form">
            <input
              type="file"
              accept=".geojson,.json"
              onChange={onFileSelect}
              className="file-input-visible"
            />
            <select
              className="import-type-select"
              value={importType}
              onChange={(e) => onImportTypeChange(e.target.value)}
            >
              <option value="trail">Trail</option>
              <option value="river">River</option>
              <option value="boundary">Boundary</option>
            </select>
            <button
              className="admin-btn import-btn"
              onClick={onImportFile}
              disabled={importingFile || !selectedFileName}
            >
              {importingFile ? 'Importing...' : 'Import'}
            </button>
          </div>
          {importMessage && (
            <div className={`import-message import-${importMessage.type}`}>
              <span>{importMessage.text}</span>
              {importMessage.type === 'warning' && (
                <button className="admin-btn" onClick={() => window.location.reload()}>
                  Refresh
                </button>
              )}
              <button className="dismiss-btn" onClick={onDismissMessage}>×</button>
            </div>
          )}
          <div className="legend-divider"></div>
          <h4>Map Alignment</h4>
          <button className="admin-btn" onClick={onOpenAdmin}>
            Align NPS Overlay
          </button>
        </>
      )}
    </div>
  );
}

// Component to handle map right-click for quick POI creation
function MapClickHandler({ isAdmin, onRightClick }) {
  useMapEvents({
    contextmenu: (e) => {
      if (isAdmin && onRightClick) {
        e.originalEvent.preventDefault();
        onRightClick({ lat: e.latlng.lat, lng: e.latlng.lng });
      }
    }
  });
  return null;
}

// Component to handle map view updates when selection changes
function MapUpdater({ selectedDestination }) {
  const map = useMap();

  React.useEffect(() => {
    if (selectedDestination && selectedDestination.latitude && selectedDestination.longitude) {
      // Pan to the selected destination without changing zoom level
      map.panTo([selectedDestination.latitude, selectedDestination.longitude], {
        animate: true
      });
    }
  }, [selectedDestination, map]);

  return null;
}

// Create a highlighted version of an icon for selected state
function createSelectedIcon(iconUrl) {
  return L.divIcon({
    className: 'selected-marker-icon',
    html: `<div class="marker-highlight"><img src="${iconUrl}" alt="" /></div>`,
    iconSize: [36, 36],
    iconAnchor: [18, 18],
    tooltipAnchor: [0, -18]
  });
}

// Simple marker component - draggable state controlled by key prop
function DestinationMarker({ dest, icon, isSelected, isEditMode, onSelect, onDragEnd }) {
  const markerRef = useRef(null);

  const eventHandlers = {
    click: () => onSelect(dest),
    dragend: () => {
      const marker = markerRef.current;
      if (marker) {
        const { lat, lng } = marker.getLatLng();
        console.log(`Drag ended for ${dest.name}: ${lat}, ${lng}`);
        onDragEnd(dest, lat, lng);
      }
    }
  };

  // Highlight selected marker in edit mode
  const displayIcon = (isSelected && isEditMode) ? createSelectedIcon(icon.options.iconUrl) : icon;

  // Key changes when edit mode changes - forces marker recreation with correct draggable state
  const markerKey = `${dest.id}-${isEditMode ? 'edit' : 'view'}`;

  return (
    <Marker
      key={markerKey}
      ref={markerRef}
      position={[dest.latitude, dest.longitude]}
      icon={displayIcon}
      opacity={isSelected ? 1 : 0.85}
      draggable={isEditMode}
      eventHandlers={eventHandlers}
    >
      <Tooltip
        direction="top"
        offset={[0, -14]}
        opacity={0.95}
        className="destination-tooltip"
      >
        <div className="tooltip-content">
          {dest.image_mime_type && (
            <div className="tooltip-thumbnail">
              <img src={`/api/destinations/${dest.id}/image?v=${new Date(dest.updated_at).getTime() || Date.now()}`} alt="" />
            </div>
          )}
          <strong>{dest.name}</strong>
          {dest.brief_description && (
            <p>{dest.brief_description}</p>
          )}
          {isEditMode && (
            <p className="edit-coords">
              {dest.latitude.toFixed(6)}, {dest.longitude.toFixed(6)}
            </p>
          )}
        </div>
      </Tooltip>
    </Marker>
  );
}

// Coordinate confirmation dialog
function CoordinateConfirmDialog({ destination, newLat, newLng, onConfirm, onCancel, saving }) {
  const oldLat = destination.latitude;
  const oldLng = destination.longitude;

  return (
    <div className="coord-confirm-overlay">
      <div className="coord-confirm-dialog">
        <h3>Update Coordinates</h3>
        <p className="dest-name">{destination.name}</p>
        <div className="coord-comparison">
          <div className="coord-old">
            <span className="coord-label">Current:</span>
            <span className="coord-value">{oldLat.toFixed(6)}, {oldLng.toFixed(6)}</span>
          </div>
          <div className="coord-arrow">→</div>
          <div className="coord-new">
            <span className="coord-label">New:</span>
            <span className="coord-value">{newLat.toFixed(6)}, {newLng.toFixed(6)}</span>
          </div>
        </div>
        <div className="coord-diff">
          <span>Change: {((newLat - oldLat) * 111320).toFixed(1)}m N/S, {((newLng - oldLng) * 111320 * Math.cos(oldLat * Math.PI / 180)).toFixed(1)}m E/W</span>
        </div>
        <div className="coord-confirm-buttons">
          <button className="cancel-btn" onClick={onCancel} disabled={saving}>Cancel</button>
          <button className="confirm-btn" onClick={onConfirm} disabled={saving}>
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}

// NPS Park Map overlay default bounds for cropped image (legend removed)
// Manually calibrated to align Boston Mill Visitor Center and Route 8
// These coordinates define the corners of the map image: [[south, west], [north, east]]
const DEFAULT_NPS_MAP_BOUNDS = [
  [41.1390, -81.6654],  // Southwest corner
  [41.4226, -81.4706]   // Northeast corner
];

// Default icon type IDs for initializing the filter (before config loads)
const DEFAULT_ICON_TYPES = new Set(['visitor-center', 'waterfall', 'trail', 'historic', 'bridge', 'train', 'nature', 'skiing', 'biking', 'picnic', 'camping', 'music', 'default']);

function Map({ destinations, selectedDestination, onSelectDestination, isAdmin, onDestinationUpdate, editMode, activeTab, onDestinationCreate, previewCoords, onPreviewCoordsChange, newPOI, onStartNewPOI, linearFeatures, selectedLinearFeature, onSelectLinearFeature }) {
  const [showMapOverlay, setShowMapOverlay] = useState(false);
  const [showVectorLayers, setShowVectorLayers] = useState(true);
  const [showAdmin, setShowAdmin] = useState(false);
  const [mapBounds, setMapBounds] = useState(DEFAULT_NPS_MAP_BOUNDS);
  const [overlayOpacity, setOverlayOpacity] = useState(1.0);
  const [visibleTypes, setVisibleTypes] = useState(new Set(DEFAULT_ICON_TYPES));
  const [selectedFileName, setSelectedFileName] = useState(null); // Just for UI display
  const [importType, setImportType] = useState('trail');
  const [importingFile, setImportingFile] = useState(false);
  const [importMessage, setImportMessage] = useState(null);
  const fileRef = useRef(null); // Store File object in ref to avoid React re-renders

  // Icon configuration from database
  const [iconConfig, setIconConfig] = useState([]);

  // Fetch icon configuration on mount and when switching tabs
  // This ensures icons show correctly on initial load and when new icons are created
  useEffect(() => {
    if (activeTab === 'view' || activeTab === 'explore' || activeTab === 'edit') {
      fetch('/api/admin/icons')
        .then(res => res.json())
        .then(data => {
          setIconConfig(data);
          // Update visible types to include all enabled icons
          const allTypes = new Set(data.filter(i => i.enabled !== false).map(i => i.name));
          if (!allTypes.has('default')) allTypes.add('default');
          setVisibleTypes(prev => {
            // Merge new icons into visible set (keep user's filter choices)
            const merged = new Set(prev);
            allTypes.forEach(t => {
              if (!iconConfig.find(i => i.name === t)) {
                // New icon - add to visible set
                merged.add(t);
              }
            });
            return merged;
          });
        })
        .catch(err => console.error('Failed to load icon config:', err));
    }
  }, [activeTab]);

  // Memoize Leaflet icons created from config
  const icons = useMemo(() => createIconsFromConfig(iconConfig), [iconConfig]);

  // Memoize the set of all icon type IDs for filter reset
  const allIconTypes = useMemo(() => {
    if (iconConfig.length === 0) return DEFAULT_ICON_TYPES;
    const types = new Set(iconConfig.filter(i => i.enabled !== false).map(i => i.name));
    if (!types.has('default')) types.add('default');
    return types;
  }, [iconConfig]);

  // Helper to get icon type for a destination
  const getDestinationIconType = useCallback((dest) => {
    if (iconConfig.length === 0) return 'default';
    return getDestinationIconTypeFromConfig(dest, iconConfig);
  }, [iconConfig]);

  // Helper to get Leaflet icon for a destination
  const getDestinationIcon = useCallback((dest) => {
    const iconType = getDestinationIconType(dest);
    return icons[iconType] || icons['default'] || defaultIcon;
  }, [icons, getDestinationIconType]);

  // Admin edit mode state - editMode is passed from parent
  const [pendingUpdate, setPendingUpdate] = useState(null);
  const [saving, setSaving] = useState(false);

  // Note: Boundaries now come from linearFeatures prop along with trails/rivers

  // Filter handlers
  const handleToggleType = (typeId) => {
    setVisibleTypes(prev => {
      const newSet = new Set(prev);
      if (newSet.has(typeId)) {
        newSet.delete(typeId);
      } else {
        newSet.add(typeId);
      }
      return newSet;
    });
  };

  const handleShowAll = () => setVisibleTypes(new Set(allIconTypes));
  const handleHideAll = () => setVisibleTypes(new Set());

  // Handle file selection - store in ref (no re-render), update name for UI
  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    fileRef.current = file; // Store in ref - no re-render
    setSelectedFileName(file.name); // Update UI
  };

  // Handle file import - read File from ref and send as JSON
  const handleImportFile = async () => {
    const file = fileRef.current;
    if (!file) return;

    setImportingFile(true);
    setImportMessage(null);

    try {
      // Read file content
      const content = await file.text();

      // Parse to validate it's valid JSON
      let geojson;
      try {
        geojson = JSON.parse(content);
      } catch (e) {
        setImportMessage({ type: 'error', text: 'Invalid JSON file' });
        setImportingFile(false);
        return;
      }

      // Send as JSON
      const response = await fetch('/api/admin/spatial/import', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          feature_type: importType,
          geojson: geojson,
          filename: file.name
        })
      });

      const result = await response.json();
      if (response.ok) {
        setImportMessage({
          type: 'success',
          text: `Imported ${result.imported} ${importType}${result.imported !== 1 ? 's' : ''}. Refreshing...`
        });
        fileRef.current = null;
        setSelectedFileName(null);
        setTimeout(() => window.location.reload(), 1500);
      } else {
        setImportMessage({ type: 'error', text: result.error || 'Import failed' });
      }
    } catch (err) {
      setImportMessage({ type: 'error', text: err.message || 'Import failed' });
    } finally {
      setImportingFile(false);
    }
  };

  // Clear import message
  const handleDismissMessage = () => {
    setImportMessage(null);
  };

  // Cancel file selection
  const handleCancelImport = () => {
    setSelectedFile(null);
  };

  // Handle marker drag end
  const handleMarkerDragEnd = (dest, newLat, newLng) => {
    setPendingUpdate({
      destination: dest,
      newLat,
      newLng
    });
  };

  // Confirm coordinate update
  const handleConfirmUpdate = async () => {
    if (!pendingUpdate) return;

    setSaving(true);
    try {
      const response = await fetch(`/api/admin/destinations/${pendingUpdate.destination.id}/coordinates`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({
          latitude: pendingUpdate.newLat,
          longitude: pendingUpdate.newLng
        })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to update coordinates');
      }

      const updatedDest = await response.json();
      if (onDestinationUpdate) {
        onDestinationUpdate(updatedDest);
      }
      setPendingUpdate(null);
    } catch (error) {
      console.error('Error updating coordinates:', error);
      alert(`Failed to update coordinates: ${error.message}`);
    } finally {
      setSaving(false);
    }
  };

  // Cancel coordinate update
  const handleCancelUpdate = () => {
    setPendingUpdate(null);
  };

  // Note: All linear features (trails, rivers, boundaries) now come from database via linearFeatures prop

  // Handle linear feature click (trail or river)
  const handleLinearFeatureClick = (feature) => {
    if (onSelectLinearFeature) {
      onSelectLinearFeature(feature);
    }
  };

  // Style functions for linear features (trails and rivers)
  const getLinearFeatureStyle = useCallback((feature, isSelected) => {
    // Use thicker lines for easier clicking (weight 6 normal, 8 selected)
    const baseStyle = {
      weight: isSelected ? 8 : 6,
      opacity: isSelected ? 1 : 0.8
    };

    if (feature.feature_type === 'river') {
      return {
        ...baseStyle,
        color: isSelected ? '#0066CC' : '#1E90FF'
      };
    } else if (feature.feature_type === 'boundary') {
      // Park boundaries - dashed green outline with fill
      return {
        color: isSelected ? '#1a3d0a' : '#2d5016',
        weight: isSelected ? 4 : 3,
        fillColor: '#4a7c23',
        fillOpacity: isSelected ? 0.25 : 0.15,
        dashArray: '5, 5',
        opacity: 1
      };
    } else {
      // trail
      return {
        ...baseStyle,
        color: isSelected ? '#5D3A00' : '#8B4513'
      };
    }
  }, []);

  // GeoJSON key to force re-render when selection changes
  const linearFeaturesKey = useMemo(() => {
    return `linear-${selectedLinearFeature?.id || 'none'}`;
  }, [selectedLinearFeature]);

  return (
    <div className="map-container">
      {editMode && <div className="edit-mode-banner">Edit Mode: Click marker or trail to select and edit in sidebar.</div>}
      <MapContainer
        center={PARK_CENTER}
        zoom={DEFAULT_ZOOM}
        scrollWheelZoom={true}
        style={{ height: '100%', width: '100%' }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {/* NPS Park Map overlay - rendered first so markers appear on top */}
        {showMapOverlay && (
          <ImageOverlay
            url="/data/cvnp-map-cropped.jpg"
            bounds={mapBounds}
            opacity={overlayOpacity}
            zIndex={100}
          />
        )}

        {/* Clickable linear features (trails, rivers, and boundaries from database) */}
        {showVectorLayers && linearFeatures && linearFeatures.map(feature => {
          const isSelected = selectedLinearFeature?.id === feature.id;
          const geojsonData = {
            type: 'Feature',
            properties: { id: feature.id, name: feature.name },
            geometry: feature.geometry
          };

          return (
            <GeoJSON
              key={`linear-${feature.id}-${isSelected}`}
              data={geojsonData}
              style={() => getLinearFeatureStyle(feature, isSelected)}
              onEachFeature={(geoFeature, layer) => {
                // Add click handler
                layer.on('click', () => handleLinearFeatureClick(feature));

                // Build rich tooltip content (similar to destination tooltips)
                const hasImage = feature.image_mime_type;
                const imageUrl = hasImage ? `/api/linear-features/${feature.id}/image?v=${new Date(feature.updated_at).getTime() || Date.now()}` : null;

                let tooltipHtml = '<div class="tooltip-content">';
                if (hasImage) {
                  tooltipHtml += `<div class="tooltip-thumbnail"><img src="${imageUrl}" alt="" /></div>`;
                }
                tooltipHtml += `<strong>${feature.name}</strong>`;
                if (feature.brief_description) {
                  tooltipHtml += `<p>${feature.brief_description}</p>`;
                }
                if (feature.length_miles) {
                  tooltipHtml += `<p class="trail-info">${feature.length_miles} miles${feature.difficulty ? ' • ' + feature.difficulty : ''}</p>`;
                }
                tooltipHtml += '</div>';

                layer.bindTooltip(tooltipHtml, {
                  permanent: false,
                  direction: 'auto',
                  className: 'destination-tooltip'
                });
              }}
            />
          );
        })}

        <MapUpdater selectedDestination={selectedDestination} />
        <MapClickHandler
          isAdmin={isAdmin}
          onRightClick={onStartNewPOI}
        />

        {/* Temporary marker for new POI being created */}
        {newPOI && previewCoords && (
          <DestinationMarker
            key="new-poi-marker"
            dest={{
              ...newPOI,
              latitude: previewCoords.lat,
              longitude: previewCoords.lng
            }}
            icon={getDestinationIcon(newPOI)}
            isSelected={true}
            isEditMode={true}
            onSelect={() => {}}
            onDragEnd={(d, lat, lng) => onPreviewCoordsChange({ lat, lng })}
          />
        )}

        {/* Only render markers after icon config is loaded to prevent flash */}
        {iconConfig.length > 0 && destinations.map((dest) => {
          if (!dest.latitude || !dest.longitude) return null;

          const iconType = getDestinationIconType(dest);
          if (!visibleTypes.has(iconType)) return null;

          const isSelected = selectedDestination?.id === dest.id;
          const icon = getDestinationIcon(dest);

          // In edit mode, use preview coords for selected marker (live updates from sidebar or drag)
          const markerLat = isSelected && previewCoords ? previewCoords.lat : parseFloat(dest.latitude);
          const markerLng = isSelected && previewCoords ? previewCoords.lng : parseFloat(dest.longitude);

          // Only selected markers are draggable in edit mode (when admin)
          const isInEditMode = editMode && isAdmin;
          const isDraggable = isInEditMode && isSelected;

          // Handle drag end - update preview coords only (save happens on Save button click)
          const handleDrag = (d, lat, lng) => {
            onPreviewCoordsChange({ lat, lng });
          };

          return (
            <DestinationMarker
              key={`marker-${dest.id}-${isDraggable}`}
              dest={{ ...dest, latitude: markerLat, longitude: markerLng }}
              icon={icon}
              isSelected={isSelected}
              isEditMode={isDraggable}
              onSelect={onSelectDestination}
              onDragEnd={isDraggable ? handleDrag : handleMarkerDragEnd}
            />
          );
        })}
      </MapContainer>
      <Legend
        showMapOverlay={showMapOverlay}
        onToggleMapOverlay={setShowMapOverlay}
        showVectorLayers={showVectorLayers}
        onToggleVectorLayers={setShowVectorLayers}
        onOpenAdmin={() => setShowAdmin(true)}
        visibleTypes={visibleTypes}
        onToggleType={handleToggleType}
        onShowAll={handleShowAll}
        onHideAll={handleHideAll}
        activeTab={activeTab}
        iconConfig={iconConfig}
        onFileSelect={handleFileSelect}
        selectedFileName={selectedFileName}
        importType={importType}
        onImportTypeChange={setImportType}
        onImportFile={handleImportFile}
        importingFile={importingFile}
        onCancelImport={handleCancelImport}
        importMessage={importMessage}
        onDismissMessage={handleDismissMessage}
      />
      {showAdmin && (
        <MapAdmin
          bounds={{
            south: mapBounds[0][0],
            west: mapBounds[0][1],
            north: mapBounds[1][0],
            east: mapBounds[1][1]
          }}
          onBoundsChange={setMapBounds}
          onClose={() => setShowAdmin(false)}
          opacity={overlayOpacity}
          onOpacityChange={setOverlayOpacity}
        />
      )}
      {pendingUpdate && (
        <CoordinateConfirmDialog
          destination={pendingUpdate.destination}
          newLat={pendingUpdate.newLat}
          newLng={pendingUpdate.newLng}
          onConfirm={handleConfirmUpdate}
          onCancel={handleCancelUpdate}
          saving={saving}
        />
      )}
    </div>
  );
}

export default Map;
