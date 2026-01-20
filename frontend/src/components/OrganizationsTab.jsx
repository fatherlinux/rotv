import React, { useMemo, useCallback, memo } from 'react';
import ResultsTile from './ResultsTile';

// Organizations tab component showing all organizations (virtual POIs)
const OrganizationsTab = memo(function OrganizationsTab({
  allVirtualPois,
  selectedDestination,
  onSelectDestination
}) {
  // Sort organizations alphabetically
  const { sortedOrgs, orgMap } = useMemo(() => {
    const orgs = (allVirtualPois || []).map(v => ({
      ...v,
      _isLinear: false,
      _isVirtual: true
    }));
    const sorted = orgs.sort((a, b) =>
      (a.name || '').localeCompare(b.name || '')
    );

    // Create lookup map for event delegation
    const map = new Map();
    sorted.forEach(org => {
      const key = `virtual-${org.id}`;
      map.set(key, org);
    });

    return { sortedOrgs: sorted, orgMap: map };
  }, [allVirtualPois]);

  // Event delegation handler - single handler for all tiles
  const handleListClick = useCallback((e) => {
    const tile = e.target.closest('.results-tile');
    if (!tile) return;

    const orgKey = tile.dataset.poiKey;
    const org = orgMap.get(orgKey);
    if (!org) return;

    onSelectDestination(org);
  }, [orgMap, onSelectDestination]);

  // Memoize selected ID for faster comparison
  const selectedId = selectedDestination?.id;

  const orgCount = sortedOrgs.length;

  if (sortedOrgs.length === 0) {
    return (
      <div className="results-tab-wrapper">
        <div className="news-events-header">
          <h2>Organizations</h2>
          <p className="tab-subtitle">All organizations in Roots of The Valley</p>
        </div>
        <div className="news-events-layout">
          <div className="news-events-content">
            <div className="results-tab-empty">
              <div className="results-tab-empty-icon">🏢</div>
              <div className="results-tab-empty-text">
                No organizations found.
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="results-tab-wrapper">
      <div className="news-events-header">
        <h2>Organizations</h2>
        <p className="tab-subtitle">{orgCount} organization{orgCount !== 1 ? 's' : ''} managing locations in the valley</p>
      </div>

      <div className="news-events-layout">
        <div className="news-events-content">
          <div className="results-tab-list" onClick={handleListClick}>
            {sortedOrgs.map(org => {
              const orgKey = `virtual-${org.id}`;
              const isSelected = selectedId === org.id;
              return (
                <ResultsTile
                  key={orgKey}
                  poiKey={orgKey}
                  poi={org}
                  isLinear={false}
                  isVirtual={true}
                  isSelected={isSelected}
                />
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
});

export default OrganizationsTab;
