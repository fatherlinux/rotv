import React, { useState, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Tooltip, useMap, ImageOverlay, GeoJSON, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import MapAdmin from './MapAdmin';
import NewPOIForm from './NewPOIForm';

// Custom icon definitions
const createIcon = (iconUrl) => L.icon({
  iconUrl,
  iconSize: [28, 28],
  iconAnchor: [14, 14],
  tooltipAnchor: [0, -14]
});

const icons = {
  'visitor-center': createIcon('/icons/visitor-center.svg'),
  'waterfall': createIcon('/icons/waterfall.svg'),
  'trail': createIcon('/icons/trail.svg'),
  'historic': createIcon('/icons/historic.svg'),
  'bridge': createIcon('/icons/bridge.svg'),
  'train': createIcon('/icons/train.svg'),
  'picnic': createIcon('/icons/picnic.svg'),
  'camping': createIcon('/icons/camping.svg'),
  'skiing': createIcon('/icons/skiing.svg'),
  'nature': createIcon('/icons/nature.svg'),
  'biking': createIcon('/icons/biking.svg'),
  'music': createIcon('/icons/music.svg'),
  'default': createIcon('/icons/default.svg')
};

// Determine icon type based on destination name and activities
function getDestinationIcon(dest) {
  const name = (dest.name || '').toLowerCase();
  const activities = (dest.primary_activities || '').toLowerCase();

  // Check name patterns first (more specific)
  if (name.includes('visitor center') || name.includes('exploration center') || name.includes('exploration ctr')) {
    return icons['visitor-center'];
  }
  if (name.includes('falls') || name.includes('waterfall')) {
    return icons['waterfall'];
  }
  if (name.includes('bridge')) {
    return icons['bridge'];
  }
  if (name.includes('cvsr') || name.includes('station') || name.includes('depot')) {
    return icons['train'];
  }
  if (name.includes('ski') || name.includes('sledding')) {
    return icons['skiing'];
  }
  if (name.includes('trail') || name.includes('trailhead')) {
    return icons['trail'];
  }
  if (name.includes('marsh') || name.includes('gorge') || name.includes('cave') || name.includes('ledge')) {
    return icons['nature'];
  }
  if (name.includes('mill') || name.includes('house') || name.includes('tavern') || name.includes('store') ||
      name.includes('lock') || name.includes('quarry') || name.includes('farm') || name.includes('inn')) {
    return icons['historic'];
  }
  if (name.includes('music') || name.includes('blossom')) {
    return icons['music'];
  }

  // Check activities
  if (activities.includes('camping')) return icons['camping'];
  if (activities.includes('picnic')) return icons['picnic'];
  if (activities.includes('biking') || activities.includes('bike')) return icons['biking'];
  if (activities.includes('skiing') || activities.includes('sledding')) return icons['skiing'];
  if (activities.includes('history')) return icons['historic'];
  if (activities.includes('birding') || activities.includes('photo')) return icons['nature'];
  if (activities.includes('concert')) return icons['music'];

  return icons['default'];
}

// Get the icon type ID (for filtering)
function getDestinationIconType(dest) {
  const name = (dest.name || '').toLowerCase();
  const activities = (dest.primary_activities || '').toLowerCase();

  if (name.includes('visitor center') || name.includes('exploration center') || name.includes('exploration ctr')) {
    return 'visitor-center';
  }
  if (name.includes('falls') || name.includes('waterfall')) {
    return 'waterfall';
  }
  if (name.includes('bridge')) {
    return 'bridge';
  }
  if (name.includes('cvsr') || name.includes('station') || name.includes('depot')) {
    return 'train';
  }
  if (name.includes('ski') || name.includes('sledding')) {
    return 'skiing';
  }
  if (name.includes('trail') || name.includes('trailhead')) {
    return 'trail';
  }
  if (name.includes('marsh') || name.includes('gorge') || name.includes('cave') || name.includes('ledge')) {
    return 'nature';
  }
  if (name.includes('mill') || name.includes('house') || name.includes('tavern') || name.includes('store') ||
      name.includes('lock') || name.includes('quarry') || name.includes('farm') || name.includes('inn')) {
    return 'historic';
  }
  if (name.includes('music') || name.includes('blossom')) {
    return 'music';
  }

  if (activities.includes('camping')) return 'camping';
  if (activities.includes('picnic')) return 'picnic';
  if (activities.includes('biking') || activities.includes('bike')) return 'biking';
  if (activities.includes('skiing') || activities.includes('sledding')) return 'skiing';
  if (activities.includes('history')) return 'historic';
  if (activities.includes('birding') || activities.includes('photo')) return 'nature';
  if (activities.includes('concert')) return 'music';

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

const ICON_TYPES = [
  { id: 'visitor-center', label: 'Visitor Center' },
  { id: 'waterfall', label: 'Waterfall' },
  { id: 'trail', label: 'Trail' },
  { id: 'historic', label: 'Historic Site' },
  { id: 'bridge', label: 'Bridge' },
  { id: 'train', label: 'Train Station' },
  { id: 'nature', label: 'Nature Area' },
  { id: 'skiing', label: 'Skiing' },
  { id: 'biking', label: 'Biking' },
  { id: 'picnic', label: 'Picnic Area' },
  { id: 'camping', label: 'Camping' },
  { id: 'music', label: 'Music Venue' },
  { id: 'default', label: 'Other' }
];

function Legend({ showMapOverlay, onToggleMapOverlay, showVectorLayers, onToggleVectorLayers, onOpenAdmin, visibleTypes, onToggleType, onShowAll, onHideAll, activeTab, createMode, onToggleCreateMode, onCreatePOI }) {
  const isEditTab = activeTab === 'edit';

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
        {ICON_TYPES.map(type => (
          <div
            key={type.id}
            className={`legend-icon-item ${visibleTypes.has(type.id) ? 'active' : 'inactive'}`}
            onClick={() => onToggleType(type.id)}
          >
            <img src={`/icons/${type.id}.svg`} alt={type.label} />
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
          <h4>Edit Tools</h4>
          <p className="edit-mode-hint">Click a marker to select, then drag to move. Changes save when you click Save.</p>
          <label className="legend-toggle create-mode-toggle">
            <input
              type="checkbox"
              checked={createMode}
              onChange={(e) => onToggleCreateMode(e.target.checked)}
            />
            <span>Create POI Mode</span>
          </label>
          {createMode && (
            <p className="create-mode-hint">Click on map to add new POI</p>
          )}
          <button className="create-poi-btn" onClick={() => onCreatePOI(null)}>
            + Create POI (Manual)
          </button>
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

// Component to handle map clicks for creating new POIs
function MapClickHandler({ createMode, onMapClick, isAdmin, onRightClick }) {
  useMapEvents({
    click: (e) => {
      if (createMode) {
        onMapClick({ lat: e.latlng.lat, lng: e.latlng.lng });
      }
    },
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
          <strong>{dest.name}</strong>
          {isEditMode && (
            <p className="edit-coords">
              {dest.latitude.toFixed(6)}, {dest.longitude.toFixed(6)}
            </p>
          )}
          {!isEditMode && dest.brief_description && (
            <p>{dest.brief_description}</p>
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

// Style functions for GeoJSON layers
const boundaryStyle = {
  color: '#2d5016',
  weight: 3,
  fillColor: '#4a7c23',
  fillOpacity: 0.15,
  dashArray: '5, 5'
};

const trailStyle = (feature) => ({
  color: '#8B4513',  // Brown for trails
  weight: 2,
  opacity: 0.8
});

const riverStyle = {
  color: '#1E90FF',  // Blue for river
  weight: 4,
  opacity: 0.9
};

// All icon type IDs for initializing the filter
const ALL_ICON_TYPES = new Set(['visitor-center', 'waterfall', 'trail', 'historic', 'bridge', 'train', 'nature', 'skiing', 'biking', 'picnic', 'camping', 'music', 'default']);

function Map({ destinations, selectedDestination, onSelectDestination, isAdmin, onDestinationUpdate, editMode, activeTab, onDestinationCreate, previewCoords, onPreviewCoordsChange, newPOI, onStartNewPOI }) {
  const [showMapOverlay, setShowMapOverlay] = useState(false);
  const [showVectorLayers, setShowVectorLayers] = useState(true);
  const [showAdmin, setShowAdmin] = useState(false);
  const [mapBounds, setMapBounds] = useState(DEFAULT_NPS_MAP_BOUNDS);
  const [overlayOpacity, setOverlayOpacity] = useState(1.0);
  const [visibleTypes, setVisibleTypes] = useState(new Set(ALL_ICON_TYPES));

  // Admin edit mode state - editMode is passed from parent
  const [pendingUpdate, setPendingUpdate] = useState(null);
  const [saving, setSaving] = useState(false);

  // Create POI mode state
  const [createMode, setCreateMode] = useState(false);
  const [showNewPOIForm, setShowNewPOIForm] = useState(false);
  const [newPOICoords, setNewPOICoords] = useState(null);

  // GeoJSON layer data
  const [boundary, setBoundary] = useState(null);
  const [trails, setTrails] = useState(null);
  const [river, setRiver] = useState(null);

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

  const handleShowAll = () => setVisibleTypes(new Set(ALL_ICON_TYPES));
  const handleHideAll = () => setVisibleTypes(new Set());

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

  // Handle map click to create new POI
  const handleMapClick = (coords) => {
    setNewPOICoords(coords);
    setShowNewPOIForm(true);
    setCreateMode(false); // Turn off create mode after click
  };

  // Open create POI form (manual or with coords)
  const handleOpenCreatePOI = (coords) => {
    setNewPOICoords(coords);
    setShowNewPOIForm(true);
  };

  // Handle new POI creation
  const handlePOICreated = (newDest) => {
    if (onDestinationCreate) {
      onDestinationCreate(newDest);
    }
    setShowNewPOIForm(false);
    setNewPOICoords(null);
  };

  // Load GeoJSON data
  useEffect(() => {
    fetch('/data/cvnp-boundary.geojson')
      .then(res => res.json())
      .then(data => setBoundary(data))
      .catch(err => console.error('Failed to load boundary:', err));

    fetch('/data/cvnp-trails.geojson')
      .then(res => res.json())
      .then(data => setTrails(data))
      .catch(err => console.error('Failed to load trails:', err));

    fetch('/data/cvnp-river.geojson')
      .then(res => res.json())
      .then(data => setRiver(data))
      .catch(err => console.error('Failed to load river:', err));
  }, []);

  return (
    <div className="map-container">
      {editMode && <div className="edit-mode-banner">Edit Mode: Select a marker to drag and edit. Click Save to apply changes.</div>}
      {createMode && <div className="create-mode-banner">Create Mode: Click on map to add new POI</div>}
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

        {/* Vector layers - boundary, trails, river */}
        {showVectorLayers && (
          <>
            {boundary && <GeoJSON data={boundary} style={boundaryStyle} />}
            {river && <GeoJSON data={river} style={riverStyle} />}
            {trails && <GeoJSON data={trails} style={trailStyle} />}
          </>
        )}

        <MapUpdater selectedDestination={selectedDestination} />
        <MapClickHandler
          createMode={createMode && isAdmin}
          onMapClick={handleMapClick}
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
            icon={icons[newPOI.icon_type] || icons['default']}
            isSelected={true}
            isEditMode={true}
            onSelect={() => {}}
            onDragEnd={(d, lat, lng) => onPreviewCoordsChange({ lat, lng })}
          />
        )}

        {destinations.map((dest) => {
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
        createMode={createMode}
        onToggleCreateMode={setCreateMode}
        onCreatePOI={handleOpenCreatePOI}
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
      {showNewPOIForm && (
        <NewPOIForm
          onClose={() => {
            setShowNewPOIForm(false);
            setNewPOICoords(null);
          }}
          onCreate={handlePOICreated}
          initialCoords={newPOICoords}
        />
      )}
    </div>
  );
}

export default Map;
