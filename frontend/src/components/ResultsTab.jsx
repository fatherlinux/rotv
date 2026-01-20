import React, { useMemo, useCallback, memo, useState } from 'react';
import ResultsTile from './ResultsTile';
import MapThumbnail from './MapThumbnail';

// Results tab component showing all visible POIs as tiles
const ResultsTab = memo(function ResultsTab({
  viewportFilteredDestinations,
  viewportFilteredLinearFeatures,
  viewportFilteredVirtualPois,
  selectedDestination,
  selectedLinearFeature,
  onSelectDestination,
  onSelectLinearFeature,
  mapState,
  onMapClick
}) {
  const [searchText, setSearchText] = useState('');
  const [typeFilters, setTypeFilters] = useState({
    destination: true,
    trail: true,
    river: true,
    boundary: true,
    organization: true
  });
  // Combine and sort POIs alphabetically - also create a lookup map
  const { sortedPois, poiMap, totalCount } = useMemo(() => {
    const dests = (viewportFilteredDestinations || []).map(d => ({
      ...d,
      _isLinear: false,
      _isVirtual: false,
      _poiType: 'destination'
    }));
    const linear = (viewportFilteredLinearFeatures || []).map(f => ({
      ...f,
      _isLinear: true,
      _isVirtual: false,
      _poiType: f.feature_type || 'trail'
    }));
    const virtual = (viewportFilteredVirtualPois || []).map(v => ({
      ...v,
      _isLinear: false,
      _isVirtual: true,
      _poiType: 'organization'
    }));

    const allPois = [...dests, ...linear, ...virtual];
    const total = allPois.length;

    // Apply filters
    let filtered = allPois;

    // Text search filter
    if (searchText.trim()) {
      const search = searchText.toLowerCase();
      filtered = filtered.filter(poi =>
        (poi.name || '').toLowerCase().includes(search) ||
        (poi.brief_description || '').toLowerCase().includes(search)
      );
    }

    // Type filter
    filtered = filtered.filter(poi => typeFilters[poi._poiType]);

    // Sort alphabetically
    const sorted = filtered.sort((a, b) =>
      (a.name || '').localeCompare(b.name || '')
    );

    // Create lookup map for event delegation
    const map = new Map();
    sorted.forEach(poi => {
      const type = poi._isVirtual ? 'virtual' : (poi._isLinear ? 'linear' : 'point');
      const key = `${type}-${poi.id}`;
      map.set(key, poi);
    });

    return { sortedPois: sorted, poiMap: map, totalCount: total };
  }, [viewportFilteredDestinations, viewportFilteredLinearFeatures, viewportFilteredVirtualPois, searchText, typeFilters]);

  // Event delegation handler - single handler for all tiles
  const handleListClick = useCallback((e) => {
    const tile = e.target.closest('.results-tile');
    if (!tile) return;

    const poiKey = tile.dataset.poiKey;
    const poi = poiMap.get(poiKey);
    if (!poi) return;

    if (poi._isLinear) {
      onSelectLinearFeature(poi);
    } else {
      onSelectDestination(poi);
    }
  }, [poiMap, onSelectDestination, onSelectLinearFeature]);

  // Memoize selected IDs for faster comparison
  const selectedId = selectedDestination?.id;
  const selectedLinearId = selectedLinearFeature?.id;

  const poiCount = sortedPois.length;

  if (sortedPois.length === 0) {
    return (
      <div className="results-tab-wrapper">
        <div className="news-events-header">
          <h2>Results</h2>
          <p className="tab-subtitle">Points of interest visible in the current map area</p>
        </div>
        <div className="news-events-layout">
          <div className="news-events-content">
            <div className="results-tab-empty">
              <div className="results-tab-empty-icon">🗺️</div>
              <div className="results-tab-empty-text">
                No points of interest visible in the current map area.
              </div>
              <div className="results-tab-empty-hint">
                Try zooming out or panning to see more locations.
              </div>
            </div>
          </div>
          {mapState && (
            <div className="map-thumbnail-sidebar">
              <MapThumbnail
                bounds={mapState.bounds}
                aspectRatio={mapState.aspectRatio || 1.5}
                visibleDestinations={viewportFilteredDestinations}
                onClick={onMapClick}
                poiCount={poiCount}
              />
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="results-tab-wrapper">
      <div className="news-events-header">
        <h2>Results</h2>
        <p className="tab-subtitle">Points of interest visible in the current map area</p>
      </div>

      <div className="results-filters">
        <input
          type="text"
          className="results-search-input"
          placeholder="Search by name or description..."
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
        />
        <div className="results-type-filters">
          <label className="type-filter-label">
            <input
              type="checkbox"
              checked={typeFilters.destination}
              onChange={(e) => setTypeFilters(prev => ({ ...prev, destination: e.target.checked }))}
            />
            <span className="type-filter-icon destination">D</span>
            Destination
          </label>
          <label className="type-filter-label">
            <input
              type="checkbox"
              checked={typeFilters.trail}
              onChange={(e) => setTypeFilters(prev => ({ ...prev, trail: e.target.checked }))}
            />
            <span className="type-filter-icon trail">T</span>
            Trail
          </label>
          <label className="type-filter-label">
            <input
              type="checkbox"
              checked={typeFilters.river}
              onChange={(e) => setTypeFilters(prev => ({ ...prev, river: e.target.checked }))}
            />
            <span className="type-filter-icon river">R</span>
            River
          </label>
          <label className="type-filter-label">
            <input
              type="checkbox"
              checked={typeFilters.boundary}
              onChange={(e) => setTypeFilters(prev => ({ ...prev, boundary: e.target.checked }))}
            />
            <span className="type-filter-icon boundary">B</span>
            Boundary
          </label>
          <label className="type-filter-label">
            <input
              type="checkbox"
              checked={typeFilters.organization}
              onChange={(e) => setTypeFilters(prev => ({ ...prev, organization: e.target.checked }))}
            />
            <span className="type-filter-icon virtual">O</span>
            Organization
          </label>
        </div>
        <div className="results-count">
          Showing {poiCount} of {totalCount} POIs
        </div>
      </div>

      <div className="news-events-layout">
        <div className="news-events-content">
          <div className="results-tab-list" onClick={handleListClick}>
            {sortedPois.map(poi => {
              const type = poi._isVirtual ? 'virtual' : (poi._isLinear ? 'linear' : 'point');
              const poiKey = `${type}-${poi.id}`;
              const isSelected = poi._isLinear
                ? selectedLinearId === poi.id
                : selectedId === poi.id;
              return (
                <ResultsTile
                  key={poiKey}
                  poiKey={poiKey}
                  poi={poi}
                  isLinear={poi._isLinear}
                  isVirtual={poi._isVirtual}
                  isSelected={isSelected}
                />
              );
            })}
          </div>
        </div>
        {mapState && (
          <div className="map-thumbnail-sidebar">
            <MapThumbnail
              bounds={mapState.bounds}
              aspectRatio={mapState.aspectRatio || 1.5}
              visibleDestinations={viewportFilteredDestinations}
              onClick={onMapClick}
              poiCount={poiCount}
            />
            <div className="poi-type-legend">
              <div className="poi-type-legend-title">POI Types</div>
              <div className="poi-type-legend-items">
                <span className="poi-type-legend-item"><span className="poi-type-icon destination">D</span> Destination</span>
                <span className="poi-type-legend-item"><span className="poi-type-icon trail">T</span> Trail</span>
                <span className="poi-type-legend-item"><span className="poi-type-icon river">R</span> River</span>
                <span className="poi-type-legend-item"><span className="poi-type-icon boundary">B</span> Boundary</span>
                <span className="poi-type-legend-item"><span className="poi-type-icon virtual">O</span> Organization</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
});

export default ResultsTab;
