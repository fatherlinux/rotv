import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { AuthProvider } from './contexts/AuthContext';
import { useAuth } from './hooks/useAuth';
import Map from './components/Map';
import Sidebar from './components/Sidebar';
import SyncSettings from './components/SyncSettings';
import AISettings from './components/AISettings';
import ActivitiesSettings from './components/ActivitiesSettings';
import ErasSettings from './components/ErasSettings';
import SurfacesSettings from './components/SurfacesSettings';
import IconsSettings from './components/IconsSettings';
import ParkNews from './components/ParkNews';
import ParkEvents from './components/ParkEvents';
import NewsSettings from './components/NewsSettings';
import ResultsTab from './components/ResultsTab';

// Default icon type IDs for initializing the filter
const DEFAULT_ICON_TYPES = new Set(['visitor-center', 'waterfall', 'trail', 'historic', 'bridge', 'train', 'nature', 'skiing', 'biking', 'picnic', 'camping', 'music', 'default', 'lighthouse']);

// Generate URL-friendly slug from POI name
function generateSlug(name) {
  if (!name) return '';
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '') // Remove special characters
    .replace(/\s+/g, '-')          // Replace spaces with hyphens
    .replace(/-+/g, '-')           // Replace multiple hyphens with single
    .replace(/^-|-$/g, '');        // Remove leading/trailing hyphens
}

// Check if a keyword exists as a whole word in text (not as a substring)
function matchesWholeWord(text, keyword) {
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`\\b${escaped}\\b`, 'i');
  return regex.test(text);
}

// Get icon type for a destination using database configuration
function getDestinationIconType(dest, iconConfig) {
  if (!iconConfig || iconConfig.length === 0) return 'default';

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

function AppContent() {
  const { isAuthenticated, isAdmin, loading: authLoading, loginWithGoogle, loginWithFacebook, logout, user } = useAuth();
  const [destinations, setDestinations] = useState([]);
  const [filteredDestinations, setFilteredDestinations] = useState([]);
  const [selectedDestination, setSelectedDestination] = useState(null);
  const [filters, setFilters] = useState({ owners: [], eras: [], surfaces: [] });

  // POI type visibility filter (shared with Map and News/Events tabs)
  const [visibleTypes, setVisibleTypes] = useState(new Set(DEFAULT_ICON_TYPES));

  // Icon configuration for determining POI types
  const [iconConfig, setIconConfig] = useState([]);

  // POI IDs currently visible in the map viewport (for News/Events filtering)
  const [visiblePoiIds, setVisiblePoiIds] = useState([]);

  // Layer visibility states (lifted from Map component for unified control)
  const [showNpsMap, setShowNpsMap] = useState(false);
  const [showTrails, setShowTrails] = useState(true);
  const [showRivers, setShowRivers] = useState(true);
  const [visibleBoundaries, setVisibleBoundaries] = useState(new Set()); // Set of boundary IDs

  // Map state for thumbnail display (center, zoom, bounds)
  const [mapState, setMapState] = useState({
    center: [41.26, -81.55],  // Park center default
    zoom: 11,
    bounds: null
  });

  // Linear features (trails and rivers from database)
  const [linearFeatures, setLinearFeatures] = useState([]);
  const [selectedLinearFeature, setSelectedLinearFeature] = useState(null);
  const [activeFilters, setActiveFilters] = useState({
    owner: null,
    era: null,
    pets: null,
    search: ''
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editMode, setEditMode] = useState(false);

  // Tab state for admin interface: 'view', 'edit', 'settings'
  const [activeTab, setActiveTab] = useState('view');

  // Settings sub-tab state: 'activities', 'news', 'google'
  const [settingsTab, setSettingsTab] = useState('activities');

  // News refresh trigger - increments when news collection completes
  const [newsRefreshTrigger, setNewsRefreshTrigger] = useState(0);

  // Login/account dropdown state
  const [showLoginDropdown, setShowLoginDropdown] = useState(false);
  const [showUserDropdown, setShowUserDropdown] = useState(false);
  const [profileImageError, setProfileImageError] = useState(false);

  // Reset to View tab when user loses admin status (e.g., logout)
  useEffect(() => {
    if (!isAdmin && (activeTab === 'edit' || activeTab === 'settings')) {
      setActiveTab('view');
    }
  }, [isAdmin, activeTab]);

  // Preview coordinates for real-time editing sync between Map and Sidebar
  const [previewCoords, setPreviewCoords] = useState(null);

  // New POI being created (temporary, not yet saved)
  const [newPOI, setNewPOI] = useState(null);

  // Reset preview coords when selection changes or edit mode turns off
  useEffect(() => {
    if (selectedDestination && editMode) {
      setPreviewCoords({
        lat: parseFloat(selectedDestination.latitude),
        lng: parseFloat(selectedDestination.longitude)
      });
    } else {
      setPreviewCoords(null);
    }
  }, [selectedDestination?.id, editMode]);

  // Auto-enable edit mode when Edit tab is selected, disable when leaving
  useEffect(() => {
    if (activeTab === 'edit') {
      setEditMode(true);
    } else {
      setEditMode(false);
    }
  }, [activeTab]);

  // Store initial POI slug for after data loads
  const [initialPoiSlug, setInitialPoiSlug] = useState(null);

  // Handle tab query parameter from auth redirect
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tab = params.get('tab');
    if (tab === 'settings' || tab === 'edit' || tab === 'view') {
      setActiveTab(tab);
      // Clean URL but keep other params if any
      params.delete('tab');
      const newSearch = params.toString();
      const newUrl = window.location.pathname + (newSearch ? `?${newSearch}` : '');
      window.history.replaceState({}, '', newUrl);
    }

    // Check for POI query parameter (for direct linking) - now uses slug
    const poiSlug = params.get('poi');
    if (poiSlug) {
      setInitialPoiSlug(poiSlug);
    }
  }, []);

  // Auto-select POI from URL after data loads (matches by slug)
  useEffect(() => {
    if (initialPoiSlug && !loading && destinations.length > 0) {
      // First check point destinations by slug match
      const destination = destinations.find(d => generateSlug(d.name) === initialPoiSlug);
      if (destination) {
        setSelectedDestination(destination);
        document.title = `${destination.name} | Roots of The Valley`;
        setInitialPoiSlug(null); // Clear so it doesn't re-trigger
        return;
      }

      // Then check linear features (trails, rivers, boundaries)
      const linearFeature = linearFeatures.find(f => generateSlug(f.name) === initialPoiSlug);
      if (linearFeature) {
        setSelectedLinearFeature(linearFeature);
        document.title = `${linearFeature.name} | Roots of The Valley`;
        setInitialPoiSlug(null);
        return;
      }

      // POI not found - clear the param
      setInitialPoiSlug(null);
    }
  }, [initialPoiSlug, loading, destinations, linearFeatures]);

  // Reusable function to fetch all data (used on mount and after sync operations)
  const refreshAllData = React.useCallback(async () => {
    try {
      const [destResponse, filterResponse, linearResponse, iconResponse] = await Promise.all([
        fetch('/api/destinations'),
        fetch('/api/filters'),
        fetch('/api/linear-features'),
        fetch('/api/admin/icons')
      ]);

      if (!destResponse.ok || !filterResponse.ok) {
        throw new Error('Failed to fetch data');
      }

      const destData = await destResponse.json();
      const filterData = await filterResponse.json();
      const linearData = linearResponse.ok ? await linearResponse.json() : [];
      const iconData = iconResponse.ok ? await iconResponse.json() : [];

      setDestinations(destData);
      setFilteredDestinations(destData);
      setFilters(filterData);
      setLinearFeatures(linearData);
      setIconConfig(iconData);
      setLoading(false);
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  }, []);

  // Fetch destinations, linear features, and icon config on mount
  useEffect(() => {
    refreshAllData();
  }, [refreshAllData]);


  // Compute destinations filtered by map viewport visibility (for News/Events tabs)
  // This uses the actual POI IDs visible on the map (respects zoom, pan, and legend filters)
  const viewportFilteredDestinations = React.useMemo(() => {
    if (!visiblePoiIds || visiblePoiIds.length === 0) return [];

    const visibleIdSet = new Set(visiblePoiIds);
    return destinations.filter(dest => visibleIdSet.has(dest.id));
  }, [destinations, visiblePoiIds]);

  // Compute linear features filtered by map viewport visibility (for News/Events tabs)
  const viewportFilteredLinearFeatures = useMemo(() => {
    if (!visiblePoiIds || visiblePoiIds.length === 0) return [];

    const visibleIdSet = new Set(visiblePoiIds);
    return linearFeatures.filter(feature => visibleIdSet.has(feature.id));
  }, [linearFeatures, visiblePoiIds]);

  // Navigation state for Results tab swipe navigation
  const [currentPoiIndex, setCurrentPoiIndex] = useState(-1);

  // Ref to skip map fly animation on next selection (for Results/sidebar clicks)
  const skipNextFlyRef = useRef(false);

  // Combined navigation list (destinations + linear features, sorted alphabetically)
  const poiNavigationList = useMemo(() => {
    const dests = (viewportFilteredDestinations || []).map(d => ({ ...d, _isLinear: false }));
    const linear = (viewportFilteredLinearFeatures || []).map(f => ({ ...f, _isLinear: true }));
    return [...dests, ...linear].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  }, [viewportFilteredDestinations, viewportFilteredLinearFeatures]);

  // Apply filters when activeFilters change
  useEffect(() => {
    let filtered = destinations;

    if (activeFilters.owner) {
      filtered = filtered.filter(d => d.property_owner === activeFilters.owner);
    }

    if (activeFilters.era) {
      filtered = filtered.filter(d => d.era === activeFilters.era);
    }

    if (activeFilters.pets === 'yes') {
      filtered = filtered.filter(d => d.pets?.toLowerCase() === 'yes');
    } else if (activeFilters.pets === 'no') {
      filtered = filtered.filter(d => d.pets?.toLowerCase() === 'no');
    }

    if (activeFilters.search) {
      const searchLower = activeFilters.search.toLowerCase();
      filtered = filtered.filter(d =>
        d.name?.toLowerCase().includes(searchLower) ||
        d.brief_description?.toLowerCase().includes(searchLower) ||
        d.historical_description?.toLowerCase().includes(searchLower)
      );
    }

    setFilteredDestinations(filtered);
  }, [activeFilters, destinations]);

  const handleFilterChange = (filterType, value) => {
    setActiveFilters(prev => ({
      ...prev,
      [filterType]: value === prev[filterType] ? null : value
    }));
  };

  const clearFilters = () => {
    setActiveFilters({ owner: null, era: null, pets: null, search: '' });
  };

  // Handle destination update from admin panel
  const handleDestinationUpdate = (updatedDest) => {
    setDestinations(prev =>
      prev.map(d => d.id === updatedDest.id ? updatedDest : d)
    );
    if (selectedDestination?.id === updatedDest.id) {
      setSelectedDestination(updatedDest);
    }
  };

  // Handle new destination creation from admin panel
  const handleDestinationCreate = (newDest) => {
    setDestinations(prev => [...prev, newDest]);
    setSelectedDestination(newDest);
  };

  // Handle destination deletion from admin panel
  const handleDestinationDelete = (deletedId) => {
    setDestinations(prev => prev.filter(d => d.id !== deletedId));
    if (selectedDestination?.id === deletedId) {
      setSelectedDestination(null);
    }
  };

  // Helper to update URL with POI slug (for shareable links)
  const updateUrlWithPoi = useCallback((poiName) => {
    const params = new URLSearchParams(window.location.search);
    if (poiName) {
      params.set('poi', generateSlug(poiName));
    } else {
      params.delete('poi');
    }
    const newSearch = params.toString();
    const newUrl = window.location.pathname + (newSearch ? `?${newSearch}` : '');
    window.history.replaceState({}, '', newUrl);
  }, []);

  // Handle linear feature selection (clears destination selection) - wrapped in useCallback for stable reference
  const handleSelectLinearFeature = useCallback((feature) => {
    setSelectedDestination(null);
    setNewPOI(null);
    setPreviewCoords(null);
    setSelectedLinearFeature(feature);
    updateUrlWithPoi(feature?.name);
    // Update document title for sharing
    document.title = feature ? `${feature.name} | Roots of The Valley` : 'Roots of The Valley';
    // Sync navigation index
    if (feature) {
      const index = poiNavigationList.findIndex(p => p._isLinear && p.id === feature.id);
      setCurrentPoiIndex(index);
      // Auto-enable the layer for the selected feature type so it's visible on the map
      if (feature.feature_type === 'boundary') {
        setVisibleBoundaries(prev => {
          if (prev.has(feature.id)) return prev;
          const next = new Set(prev);
          next.add(feature.id);
          return next;
        });
      } else if (feature.feature_type === 'trail') {
        setShowTrails(true);
      } else if (feature.feature_type === 'river') {
        setShowRivers(true);
      }
    } else {
      setCurrentPoiIndex(-1);
    }
  }, [updateUrlWithPoi, poiNavigationList]);

  // Handle destination selection (clears linear feature selection) - wrapped in useCallback for stable reference
  const handleSelectDestination = useCallback((destination) => {
    setSelectedLinearFeature(null);
    setSelectedDestination(destination);
    updateUrlWithPoi(destination?.name);
    // Update document title for sharing
    document.title = destination ? `${destination.name} | Roots of The Valley` : 'Roots of The Valley';
    // Sync navigation index
    if (destination) {
      const index = poiNavigationList.findIndex(p => !p._isLinear && p.id === destination.id);
      setCurrentPoiIndex(index);
    } else {
      setCurrentPoiIndex(-1);
    }
  }, [updateUrlWithPoi, poiNavigationList]);

  // Navigate to next/prev POI in the list
  const handleNavigatePoi = useCallback((direction) => {
    if (poiNavigationList.length === 0) return;

    let newIndex;
    if (currentPoiIndex === -1) {
      // No current selection, start from beginning or end
      newIndex = direction === 'next' ? 0 : poiNavigationList.length - 1;
    } else {
      // Calculate new index with wrapping
      newIndex = currentPoiIndex + (direction === 'next' ? 1 : -1);
      if (newIndex < 0) newIndex = poiNavigationList.length - 1;
      if (newIndex >= poiNavigationList.length) newIndex = 0;
    }

    const poi = poiNavigationList[newIndex];
    if (poi) {
      if (poi._isLinear) {
        setSelectedDestination(null);
        setNewPOI(null);
        setPreviewCoords(null);
        setSelectedLinearFeature(poi);
        updateUrlWithPoi(poi.name);
        document.title = `${poi.name} | Roots of The Valley`;
      } else {
        setSelectedLinearFeature(null);
        setSelectedDestination(poi);
        updateUrlWithPoi(poi.name);
        document.title = `${poi.name} | Roots of The Valley`;
      }
      setCurrentPoiIndex(newIndex);
    }
  }, [poiNavigationList, currentPoiIndex, updateUrlWithPoi]);

  // Stable callbacks for ResultsTab - select POI, only switch to view tab on desktop
  // Skip fly animation when selecting from Results to preserve map view
  const handleResultsSelectDestination = useCallback((poi) => {
    skipNextFlyRef.current = true; // Don't fly to POI - preserve current map view
    handleSelectDestination(poi);
    // On mobile (< 768px), stay on Results tab for swipe navigation
    if (window.innerWidth >= 768) {
      setActiveTab('view');
    }
  }, [handleSelectDestination]);

  const handleResultsSelectLinearFeature = useCallback((poi) => {
    skipNextFlyRef.current = true; // Don't fly to POI - preserve current map view
    handleSelectLinearFeature(poi);
    // On mobile (< 768px), stay on Results tab for swipe navigation
    if (window.innerWidth >= 768) {
      setActiveTab('view');
    }
  }, [handleSelectLinearFeature]);

  // Handle linear feature update - merge instead of replace to preserve geometry
  const handleLinearFeatureUpdate = (updatedFeature) => {
    setLinearFeatures(prev =>
      prev.map(f => f.id === updatedFeature.id ? { ...f, ...updatedFeature } : f)
    );
    if (selectedLinearFeature?.id === updatedFeature.id) {
      setSelectedLinearFeature(prev => ({ ...prev, ...updatedFeature }));
    }
  };

  // Handle linear feature deletion
  const handleLinearFeatureDelete = (deletedId) => {
    setLinearFeatures(prev => prev.filter(f => f.id !== deletedId));
    if (selectedLinearFeature?.id === deletedId) {
      setSelectedLinearFeature(null);
    }
  };

  // Start creating a new POI at given coordinates
  const handleStartNewPOI = (coords) => {
    // Clear any existing selection
    setSelectedDestination(null);
    // Create temporary POI object
    setNewPOI({
      id: 'new-temp',
      name: '',
      latitude: coords.lat,
      longitude: coords.lng,
      property_owner: '',
      brief_description: '',
      era: '',
      historical_description: '',
      primary_activities: '',
      surface: '',
      pets: '',
      cell_signal: null,
      more_info_link: ''
    });
    setPreviewCoords(coords);
  };

  // Cancel new POI creation
  const handleCancelNewPOI = () => {
    setNewPOI(null);
    setPreviewCoords(null);
  };

  // Save new POI
  const handleSaveNewPOI = async (poiData) => {
    try {
      const response = await fetch('/api/admin/destinations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(poiData)
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to create POI');
      }

      const newDest = await response.json();
      setDestinations(prev => [...prev, newDest]);
      setNewPOI(null);
      setSelectedDestination(newDest);
      setPreviewCoords(null);
      return newDest;
    } catch (err) {
      throw err;
    }
  };

  if (loading) {
    return (
      <div className="loading">
        <div className="loading-spinner"></div>
        <p>Loading Roots of The Valley...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="error">
        <h2>Error loading data</h2>
        <p>{error}</p>
        <p>Make sure the backend server is running.</p>
      </div>
    );
  }

  return (
    <div className="app">
      <header className="header">
        <div className="header-left" onClick={() => setActiveTab('view')} style={{ cursor: 'pointer' }}>
          <h1>Roots of The Valley</h1>
          <span className="subtitle">Explore Cuyahoga Valley's History</span>
        </div>
        <nav className="header-tabs">
          <button
            className={`tab-btn ${activeTab === 'view' ? 'active' : ''}`}
            onClick={() => setActiveTab('view')}
          >
            View
          </button>
          <button
            className={`tab-btn ${activeTab === 'results' ? 'active' : ''}`}
            onClick={() => setActiveTab('results')}
          >
            Results
          </button>
          <button
            className={`tab-btn ${activeTab === 'news' ? 'active' : ''}`}
            onClick={() => setActiveTab('news')}
          >
            News
          </button>
          <button
            className={`tab-btn ${activeTab === 'events' ? 'active' : ''}`}
            onClick={() => setActiveTab('events')}
          >
            Events
          </button>
          {isAdmin && (
            <button
              className={`tab-btn ${activeTab === 'edit' ? 'active' : ''}`}
              onClick={() => setActiveTab('edit')}
            >
              Edit
            </button>
          )}
          {isAdmin && (
            <button
              className={`tab-btn ${activeTab === 'settings' ? 'active' : ''}`}
              onClick={() => setActiveTab('settings')}
            >
              Settings
            </button>
          )}

          {/* Login/Account tab */}
          {isAuthenticated ? (
            <div className="tab-account-container">
              <button
                className="tab-btn tab-account"
                onClick={() => setShowUserDropdown(!showUserDropdown)}
              >
                {user?.pictureUrl && !profileImageError ? (
                  <img
                    src={user.pictureUrl}
                    alt={user.name}
                    className="tab-user-avatar"
                    referrerPolicy="no-referrer"
                    onError={() => setProfileImageError(true)}
                  />
                ) : (
                  <div className="tab-user-avatar-placeholder">
                    {user?.name?.[0]?.toUpperCase() || '?'}
                  </div>
                )}
              </button>
              {showUserDropdown && (
                <>
                  <div className="tab-dropdown-backdrop" onClick={() => setShowUserDropdown(false)} />
                  <div className="tab-dropdown user-dropdown-inline">
                    <div className="user-info-inline">
                      <span className="user-name-inline">{user?.name}</span>
                      <span className="user-email-inline">{user?.email}</span>
                      {isAdmin && <span className="admin-badge-inline">Admin</span>}
                    </div>
                    <button
                      className="dropdown-item-inline"
                      onClick={() => {
                        setShowUserDropdown(false);
                        logout();
                      }}
                    >
                      Sign Out
                    </button>
                  </div>
                </>
              )}
            </div>
          ) : (
            <div className="tab-account-container">
              <button
                className="tab-btn"
                onClick={() => setShowLoginDropdown(!showLoginDropdown)}
              >
                Login
              </button>
              {showLoginDropdown && (
                <>
                  <div className="tab-dropdown-backdrop" onClick={() => setShowLoginDropdown(false)} />
                  <div className="tab-dropdown login-dropdown-inline">
                    <button className="oauth-btn-inline google-btn" onClick={loginWithGoogle}>
                      <svg viewBox="0 0 24 24" width="18" height="18">
                        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                      </svg>
                      Continue with Google
                    </button>
                    <button className="oauth-btn-inline facebook-btn" onClick={loginWithFacebook}>
                      <svg viewBox="0 0 24 24" width="18" height="18">
                        <path fill="#1877F2" d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                      </svg>
                      Continue with Facebook
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </nav>
      </header>

      {/* Results tab content - only render when active to avoid processing 300+ tiles on every re-render */}
      {activeTab === 'results' && (
        <main className="main-content-full">
          <ResultsTab
            viewportFilteredDestinations={viewportFilteredDestinations}
            viewportFilteredLinearFeatures={viewportFilteredLinearFeatures}
            selectedDestination={selectedDestination}
            selectedLinearFeature={selectedLinearFeature}
            onSelectDestination={handleResultsSelectDestination}
            onSelectLinearFeature={handleResultsSelectLinearFeature}
            mapState={mapState}
            onMapClick={() => setActiveTab('view')}
          />
        </main>
      )}

      {/* News tab content */}
      <main className="main-content-full" style={{ display: activeTab === 'news' ? 'flex' : 'none', flexDirection: 'column' }}>
        <ParkNews
          isAdmin={isAdmin}
          filteredDestinations={viewportFilteredDestinations}
          filteredLinearFeatures={viewportFilteredLinearFeatures}
          mapState={mapState}
          linearFeatures={linearFeatures}
          refreshTrigger={newsRefreshTrigger}
          onMapClick={() => setActiveTab('view')}
          onSelectPoi={(poiId) => {
            const poi = destinations.find(d => d.id === poiId);
            if (poi) {
              setSelectedDestination(poi);
              setActiveTab('view');
            }
          }}
        />
      </main>

      {/* Events tab content */}
      <main className="main-content-full" style={{ display: activeTab === 'events' ? 'flex' : 'none', flexDirection: 'column' }}>
        <ParkEvents
          isAdmin={isAdmin}
          filteredDestinations={viewportFilteredDestinations}
          filteredLinearFeatures={viewportFilteredLinearFeatures}
          mapState={mapState}
          linearFeatures={linearFeatures}
          refreshTrigger={newsRefreshTrigger}
          onMapClick={() => setActiveTab('view')}
          onSelectPoi={(poiId) => {
            const poi = destinations.find(d => d.id === poiId);
            if (poi) {
              setSelectedDestination(poi);
              setActiveTab('view');
            }
          }}
        />
      </main>

      {activeTab === 'settings' && (
        <main className="settings-content">
          <div className="settings-panel">
            <nav className="settings-tabs">
              <button
                className={`settings-tab-btn ${settingsTab === 'activities' ? 'active' : ''}`}
                onClick={() => setSettingsTab('activities')}
              >
                Activities
              </button>
              <button
                className={`settings-tab-btn ${settingsTab === 'eras' ? 'active' : ''}`}
                onClick={() => setSettingsTab('eras')}
              >
                Eras
              </button>
              <button
                className={`settings-tab-btn ${settingsTab === 'surfaces' ? 'active' : ''}`}
                onClick={() => setSettingsTab('surfaces')}
              >
                Surfaces
              </button>
              <button
                className={`settings-tab-btn ${settingsTab === 'icons' ? 'active' : ''}`}
                onClick={() => setSettingsTab('icons')}
              >
                Icons
              </button>
              <button
                className={`settings-tab-btn ${settingsTab === 'news' ? 'active' : ''}`}
                onClick={() => setSettingsTab('news')}
              >
                News & Events
              </button>
              <button
                className={`settings-tab-btn ${settingsTab === 'google' ? 'active' : ''}`}
                onClick={() => setSettingsTab('google')}
              >
                Google Integration
              </button>
            </nav>

            <div className="settings-tab-content">
              {settingsTab === 'activities' && <ActivitiesSettings />}
              {settingsTab === 'eras' && <ErasSettings />}
              {settingsTab === 'surfaces' && <SurfacesSettings />}
              {settingsTab === 'icons' && <IconsSettings />}
              {settingsTab === 'news' && <NewsSettings />}
              {settingsTab === 'google' && (
                <div className="google-integration-tab">
                  <SyncSettings onDataRefresh={refreshAllData} />
                  <div className="settings-divider"></div>
                  <AISettings />
                </div>
              )}
            </div>
          </div>
        </main>
      )}

      {/* Map content - always mounted to preserve zoom/position state */}
      <main className="main-content" style={{ display: (activeTab === 'view' || activeTab === 'edit') ? 'flex' : 'none' }}>
        <Map
          destinations={filteredDestinations}
          selectedDestination={selectedDestination}
          onSelectDestination={handleSelectDestination}
          isAdmin={isAdmin}
          onDestinationUpdate={handleDestinationUpdate}
          onDestinationCreate={handleDestinationCreate}
          editMode={editMode}
          activeTab={activeTab}
          previewCoords={previewCoords}
          onPreviewCoordsChange={setPreviewCoords}
          newPOI={newPOI}
          onStartNewPOI={handleStartNewPOI}
          linearFeatures={linearFeatures}
          selectedLinearFeature={selectedLinearFeature}
          onSelectLinearFeature={handleSelectLinearFeature}
          visibleTypes={visibleTypes}
          onVisibleTypesChange={setVisibleTypes}
          onVisiblePoisChange={setVisiblePoiIds}
          onMapStateChange={setMapState}
          showNpsMap={showNpsMap}
          onToggleNpsMap={setShowNpsMap}
          showTrails={showTrails}
          onToggleTrails={setShowTrails}
          showRivers={showRivers}
          onToggleRivers={setShowRivers}
          visibleBoundaries={visibleBoundaries}
          onToggleBoundary={(id) => setVisibleBoundaries(prev => {
            const next = new Set(prev);
            if (next.has(id)) {
              next.delete(id);
            } else {
              next.add(id);
            }
            return next;
          })}
          onShowAllBoundaries={() => {
            const boundaryIds = linearFeatures.filter(f => f.feature_type === 'boundary').map(f => f.id);
            setVisibleBoundaries(new Set(boundaryIds));
          }}
          onHideAllBoundaries={() => setVisibleBoundaries(new Set())}
          searchQuery={activeFilters.search}
          onSearchChange={(value) => handleFilterChange('search', value)}
          onNewsRefresh={() => setNewsRefreshTrigger(prev => prev + 1)}
          skipFlyRef={skipNextFlyRef}
        />

        <Sidebar
          destination={newPOI || selectedDestination}
          isNewPOI={!!newPOI}
          onClose={() => {
            if (newPOI) {
              handleCancelNewPOI();
            } else if (selectedLinearFeature) {
              setSelectedLinearFeature(null);
            } else {
              setSelectedDestination(null);
            }
            updateUrlWithPoi(null); // Clear POI from URL
            document.title = 'Roots of The Valley'; // Reset title
            setCurrentPoiIndex(-1); // Reset navigation index
          }}
          isAdmin={isAdmin}
          editMode={editMode}
          onDestinationUpdate={handleDestinationUpdate}
          onDestinationDelete={handleDestinationDelete}
          onSaveNewPOI={handleSaveNewPOI}
          onCancelNewPOI={handleCancelNewPOI}
          previewCoords={previewCoords}
          onPreviewCoordsChange={setPreviewCoords}
          linearFeature={selectedLinearFeature}
          onLinearFeatureUpdate={handleLinearFeatureUpdate}
          onLinearFeatureDelete={handleLinearFeatureDelete}
          onNavigate={handleNavigatePoi}
          currentIndex={currentPoiIndex}
          totalCount={poiNavigationList.length}
        />
      </main>
    </div>
  );
}

function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

export default App;
