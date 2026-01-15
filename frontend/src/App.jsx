import React, { useState, useEffect } from 'react';
import { AuthProvider } from './contexts/AuthContext';
import { useAuth } from './hooks/useAuth';
import Map from './components/Map';
import Sidebar from './components/Sidebar';
import FilterBar from './components/FilterBar';
import LoginButton from './components/LoginButton';
import UserMenu from './components/UserMenu';
import SyncSettings from './components/SyncSettings';
import AISettings from './components/AISettings';
import ActivitiesSettings from './components/ActivitiesSettings';
import ErasSettings from './components/ErasSettings';
import SurfacesSettings from './components/SurfacesSettings';
import IconsSettings from './components/IconsSettings';

function AppContent() {
  const { isAuthenticated, isAdmin, loading: authLoading } = useAuth();
  const [destinations, setDestinations] = useState([]);
  const [filteredDestinations, setFilteredDestinations] = useState([]);
  const [selectedDestination, setSelectedDestination] = useState(null);
  const [filters, setFilters] = useState({ owners: [], eras: [], surfaces: [] });

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
  }, []);

  // Fetch destinations and linear features on mount
  useEffect(() => {
    async function fetchData() {
      try {
        const [destResponse, filterResponse, linearResponse] = await Promise.all([
          fetch('/api/destinations'),
          fetch('/api/filters'),
          fetch('/api/linear-features')
        ]);

        if (!destResponse.ok || !filterResponse.ok) {
          throw new Error('Failed to fetch data');
        }

        const destData = await destResponse.json();
        const filterData = await filterResponse.json();
        const linearData = linearResponse.ok ? await linearResponse.json() : [];

        setDestinations(destData);
        setFilteredDestinations(destData);
        setFilters(filterData);
        setLinearFeatures(linearData);
        setLoading(false);
      } catch (err) {
        setError(err.message);
        setLoading(false);
      }
    }

    fetchData();
  }, []);

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

  // Handle linear feature selection (clears destination selection)
  const handleSelectLinearFeature = (feature) => {
    setSelectedDestination(null);
    setNewPOI(null);
    setPreviewCoords(null);
    setSelectedLinearFeature(feature);
  };

  // Handle destination selection (clears linear feature selection)
  const handleSelectDestination = (destination) => {
    setSelectedLinearFeature(null);
    setSelectedDestination(destination);
  };

  // Handle linear feature update
  const handleLinearFeatureUpdate = (updatedFeature) => {
    setLinearFeatures(prev =>
      prev.map(f => f.id === updatedFeature.id ? updatedFeature : f)
    );
    if (selectedLinearFeature?.id === updatedFeature.id) {
      setSelectedLinearFeature(updatedFeature);
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
        <div className="header-left">
          <h1>Roots of The Valley</h1>
          <span className="subtitle">Explore Cuyahoga Valley's History</span>
        </div>
        {isAdmin && (
          <nav className="header-tabs">
            <button
              className={`tab-btn ${activeTab === 'view' ? 'active' : ''}`}
              onClick={() => setActiveTab('view')}
            >
              View
            </button>
            <button
              className={`tab-btn ${activeTab === 'edit' ? 'active' : ''}`}
              onClick={() => setActiveTab('edit')}
            >
              Edit
            </button>
            <button
              className={`tab-btn ${activeTab === 'settings' ? 'active' : ''}`}
              onClick={() => setActiveTab('settings')}
            >
              Settings
            </button>
          </nav>
        )}
        <div className="header-right">
          {isAuthenticated ? (
            <UserMenu />
          ) : (
            <LoginButton />
          )}
        </div>
      </header>

      {activeTab !== 'settings' && (
        <FilterBar
          filters={filters}
          activeFilters={activeFilters}
          onFilterChange={handleFilterChange}
          onClear={clearFilters}
          resultCount={filteredDestinations.length}
        />
      )}

      {activeTab === 'settings' ? (
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
              {settingsTab === 'news' && (
                <div className="news-settings">
                  <h3>News & Events</h3>
                  <p className="coming-soon">Coming soon...</p>
                </div>
              )}
              {settingsTab === 'google' && (
                <div className="google-integration-tab">
                  <SyncSettings />
                  <div className="settings-divider"></div>
                  <AISettings />
                </div>
              )}
            </div>
          </div>
        </main>
      ) : (
        <main className="main-content">
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
          />
        </main>
      )}
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
