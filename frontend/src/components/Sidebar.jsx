import React, { useState, useEffect } from 'react';
import ImageUploader from './ImageUploader';

function getOwnerClass(owner) {
  if (!owner) return 'owner-other';
  const ownerLower = owner.toLowerCase();
  if (ownerLower.includes('federal') || ownerLower.includes('nps')) return 'owner-federal';
  if (ownerLower.includes('private')) return 'owner-private';
  if (ownerLower.includes('local') || ownerLower.includes('metro') || ownerLower.includes('county')) return 'owner-local';
  return 'owner-other';
}

function formatCoordinate(value, type) {
  if (value === null || value === undefined) return '';
  const num = parseFloat(value);
  if (isNaN(num)) return '';
  const absVal = Math.abs(num).toFixed(4);
  if (type === 'lat') {
    return `${absVal}° ${num >= 0 ? 'N' : 'S'}`;
  } else {
    return `${absVal}° ${num >= 0 ? 'E' : 'W'}`;
  }
}

function CellSignal({ level }) {
  const bars = [1, 2, 3, 4, 5];
  return (
    <div className="cell-signal">
      {bars.map(bar => (
        <div
          key={bar}
          className={`signal-bar ${bar <= level ? 'active' : ''}`}
          style={{ height: `${8 + bar * 3}px` }}
        />
      ))}
    </div>
  );
}

function EditableCellSignal({ level, onChange }) {
  return (
    <select value={level || ''} onChange={(e) => onChange(e.target.value ? parseInt(e.target.value) : null)}>
      <option value="">Unknown</option>
      <option value="1">1 - Very Poor</option>
      <option value="2">2 - Poor</option>
      <option value="3">3 - Fair</option>
      <option value="4">4 - Good</option>
      <option value="5">5 - Excellent</option>
    </select>
  );
}

// Read-only view component - works for both destinations and linear features
function ReadOnlyView({ destination, isLinearFeature }) {
  // Cache-bust image URL using updated_at timestamp
  const imageEndpoint = isLinearFeature ? 'linear-features' : 'destinations';
  const imageUrl = destination.image_mime_type
    ? `/api/${imageEndpoint}/${destination.id}/image?v=${new Date(destination.updated_at).getTime() || Date.now()}`
    : null;

  // Determine placeholder icon based on type
  const placeholderIcon = isLinearFeature
    ? (destination.feature_type === 'river' ? '🌊' : '🥾')
    : '🏞️';

  return (
    <>
      {/* Image section - URL computed from ID */}
      <div className="sidebar-image">
        {imageUrl ? (
          <img src={imageUrl} alt={destination.name} />
        ) : (
          <div className="image-placeholder">
            <span className="placeholder-icon">{placeholderIcon}</span>
            <span className="placeholder-text">Image coming soon</span>
          </div>
        )}
      </div>

      <div className="sidebar-content">
        <div className="badges-row">
          {/* Linear feature type badge */}
          {isLinearFeature && (
            <span className={`feature-type-badge ${destination.feature_type}`}>
              {destination.feature_type === 'river' ? 'River/Waterway' : 'Trail'}
            </span>
          )}
          {/* Difficulty badge for trails */}
          {isLinearFeature && destination.difficulty && (
            <span className={`difficulty-badge ${destination.difficulty.toLowerCase()}`}>
              {destination.difficulty}
            </span>
          )}
          {destination.era && (
            <span className="era-badge-large">{destination.era}</span>
          )}
          {destination.property_owner && (
            <span className={`owner-badge ${getOwnerClass(destination.property_owner)}`}>
              {destination.property_owner}
            </span>
          )}
        </div>

        {destination.brief_description && (
          <div className="section">
            <h3>Overview</h3>
            <p>{destination.brief_description}</p>
          </div>
        )}

        {destination.historical_description && (
          <div className="section">
            <h3>Historical Significance</h3>
            <p className="historical-description">{destination.historical_description}</p>
          </div>
        )}

        <div className="section">
          <h3>Visitor Information</h3>
          <div className="details-grid">
            {/* Trail-specific: length */}
            {isLinearFeature && destination.length_miles && (
              <div className="detail-item">
                <label>Length</label>
                <span>{destination.length_miles} miles</span>
              </div>
            )}
            {destination.primary_activities && (
              <div className="detail-item">
                <label>Activities</label>
                <span>{destination.primary_activities}</span>
              </div>
            )}
            {destination.surface && (
              <div className="detail-item">
                <label>Surface</label>
                <span>{destination.surface}</span>
              </div>
            )}
            {destination.pets && (
              <div className="detail-item">
                <label>Pets Allowed</label>
                <span>{destination.pets}</span>
              </div>
            )}
            {destination.cell_signal !== null && destination.cell_signal !== undefined && (
              <div className="detail-item">
                <label>Cell Signal</label>
                <CellSignal level={destination.cell_signal} />
              </div>
            )}
          </div>
        </div>

        {/* Location - only for point destinations, not linear features */}
        {!isLinearFeature && destination.latitude && destination.longitude && (
          <div className="section">
            <h3>Location</h3>
            <p>{formatCoordinate(destination.latitude, 'lat')}, {formatCoordinate(destination.longitude, 'lng')}</p>
          </div>
        )}

        {destination.more_info_link && (
          <a
            href={destination.more_info_link}
            target="_blank"
            rel="noopener noreferrer"
            className="more-info-link"
          >
            More Information
          </a>
        )}
      </div>
    </>
  );
}

// Edit view component - works for both destinations and linear features
function EditView({ destination, editedData, setEditedData, onSave, onCancel, onDelete, saving, deleting, onPreviewCoordsChange, isNewPOI, onImageUpdate, isLinearFeature }) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [aiError, setAiError] = useState(null);
  const [researchSources, setResearchSources] = useState(null);

  // Prompt editor modal state
  const [showPromptEditor, setShowPromptEditor] = useState(false);
  const [promptType, setPromptType] = useState(null); // 'brief' or 'historical'
  const [editablePrompt, setEditablePrompt] = useState('');
  const [loadingPrompt, setLoadingPrompt] = useState(false);
  const [generating, setGenerating] = useState(false);

  // Research state
  const [researching, setResearching] = useState(false);

  // Standardized activities list
  const [availableActivities, setAvailableActivities] = useState([]);
  const [showActivityDropdown, setShowActivityDropdown] = useState(false);

  // Standardized eras list
  const [availableEras, setAvailableEras] = useState([]);

  // Standardized surfaces list
  const [availableSurfaces, setAvailableSurfaces] = useState([]);

  // Fetch activities, eras, and surfaces on mount
  useEffect(() => {
    async function fetchActivities() {
      try {
        const response = await fetch('/api/admin/activities', {
          credentials: 'include'
        });
        if (response.ok) {
          const data = await response.json();
          setAvailableActivities(data);
        }
      } catch (err) {
        console.error('Failed to fetch activities:', err);
      }
    }

    async function fetchEras() {
      try {
        const response = await fetch('/api/admin/eras', {
          credentials: 'include'
        });
        if (response.ok) {
          const data = await response.json();
          setAvailableEras(data);
        }
      } catch (err) {
        console.error('Failed to fetch eras:', err);
      }
    }

    async function fetchSurfaces() {
      try {
        const response = await fetch('/api/admin/surfaces', {
          credentials: 'include'
        });
        if (response.ok) {
          const data = await response.json();
          setAvailableSurfaces(data);
        }
      } catch (err) {
        console.error('Failed to fetch surfaces:', err);
      }
    }

    fetchActivities();
    fetchEras();
    fetchSurfaces();
  }, []);

  // Parse current activities from comma-separated string
  const selectedActivities = (editedData.primary_activities || '')
    .split(',')
    .map(a => a.trim())
    .filter(a => a);

  // Toggle activity selection
  const toggleActivity = (activityName) => {
    const current = new Set(selectedActivities);
    if (current.has(activityName)) {
      current.delete(activityName);
    } else {
      current.add(activityName);
    }
    setEditedData(prev => ({
      ...prev,
      primary_activities: Array.from(current).join(', ')
    }));
  };

  // Research with AI - fills all fields
  const handleResearch = async () => {
    setResearching(true);
    setAiError(null);
    setResearchSources(null);

    try {
      const response = await fetch('/api/admin/ai/research', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ destination: editedData })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Research failed');
      }

      const data = await response.json();

      // Update all fields that have data
      setEditedData(prev => ({
        ...prev,
        era: data.era || prev.era,
        property_owner: data.property_owner || prev.property_owner,
        primary_activities: data.primary_activities || prev.primary_activities,
        surface: data.surface || prev.surface,
        pets: data.pets || prev.pets,
        brief_description: data.brief_description || prev.brief_description,
        historical_description: data.historical_description || prev.historical_description
      }));

      // Store sources for display
      if (data.sources && data.sources.length > 0) {
        setResearchSources(data.sources);
      }
    } catch (err) {
      setAiError(err.message);
    } finally {
      setResearching(false);
    }
  };

  // Open prompt editor and fetch the interpolated template
  const handleOpenPromptEditor = async (type) => {
    setPromptType(type);
    setShowPromptEditor(true);
    setLoadingPrompt(true);
    setAiError(null);

    try {
      const response = await fetch('/api/admin/ai/prompt-preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          destination: editedData,
          promptType: type
        })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to load prompt');
      }

      const result = await response.json();
      setEditablePrompt(result.prompt);
    } catch (err) {
      setAiError(err.message);
      setShowPromptEditor(false);
    } finally {
      setLoadingPrompt(false);
    }
  };

  // Generate with the customized prompt
  const handleGenerate = async () => {
    setGenerating(true);
    setAiError(null);

    try {
      const response = await fetch('/api/admin/ai/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          customPrompt: editablePrompt,
          destination: editedData
        })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Generation failed');
      }

      const result = await response.json();

      // Update the appropriate field based on prompt type
      if (promptType === 'brief') {
        setEditedData(prev => ({ ...prev, brief_description: result.generated_text }));
      } else {
        setEditedData(prev => ({ ...prev, historical_description: result.generated_text }));
      }

      setShowPromptEditor(false);
    } catch (err) {
      setAiError(err.message);
    } finally {
      setGenerating(false);
    }
  };

  const handleClosePromptEditor = () => {
    setShowPromptEditor(false);
    setEditablePrompt('');
    setPromptType(null);
  };

  const handleChange = (field, value) => {
    setEditedData(prev => ({ ...prev, [field]: value }));
  };

  // Handle coordinate changes - also update preview coords for live map sync
  const handleCoordChange = (field, value) => {
    const numValue = value ? parseFloat(value) : null;
    setEditedData(prev => {
      const updated = { ...prev, [field]: numValue };
      // Update preview coords if both lat and lng are valid
      if (onPreviewCoordsChange) {
        const lat = field === 'latitude' ? numValue : parseFloat(prev.latitude);
        const lng = field === 'longitude' ? numValue : parseFloat(prev.longitude);
        if (!isNaN(lat) && !isNaN(lng) && lat && lng) {
          onPreviewCoordsChange({ lat, lng });
        }
      }
      return updated;
    });
  };

  return (
    <div className="edit-view-container">
      <div className="edit-view-scroll">
      {/* Image section at top - matches view mode layout */}
      {!isNewPOI && destination?.id ? (
        <ImageUploader
          destinationId={destination.id}
          hasImage={!!editedData.image_mime_type}
          onImageChange={(hasImage, driveFileId) => {
            setEditedData(prev => ({
              ...prev,
              image_mime_type: hasImage ? 'image/jpeg' : null,
              image_drive_file_id: driveFileId
            }));
            // Also update parent state so view mode shows the new image
            if (onImageUpdate) {
              onImageUpdate(hasImage, driveFileId);
            }
          }}
          disabled={saving}
          isLinearFeature={isLinearFeature}
        />
      ) : (
        <div className="sidebar-image">
          <div className="image-placeholder">
            <span className="placeholder-icon">
              {isLinearFeature ? (destination?.feature_type === 'river' ? '🌊' : '🥾') : '🏞️'}
            </span>
            <span className="placeholder-text">{isNewPOI ? 'Add image after creation' : 'No image'}</span>
          </div>
        </div>
      )}

      {aiError && (
        <div className="ai-error-banner">
          <span>AI Error: {aiError}</span>
          <button onClick={() => setAiError(null)}>Dismiss</button>
        </div>
      )}

      <div className="edit-section">
        <label>Name *</label>
        <input
          type="text"
          value={editedData.name || ''}
          onChange={(e) => handleChange('name', e.target.value)}
          placeholder="Enter POI name..."
        />
      </div>

      {/* Research with AI button - fills all fields */}
      <div className="research-section">
        <button
          className="research-btn"
          onClick={handleResearch}
          disabled={researching || !editedData.name}
          title={!editedData.name ? 'Enter a name first' : 'Research this location and fill all fields'}
        >
          {researching ? 'Researching...' : 'Research with AI'}
        </button>
        <span className="research-hint">Searches the web to fill all fields below</span>
      </div>

      {researchSources && (
        <div className="research-sources">
          <strong>Sources:</strong>
          <ul>
            {researchSources.map((source, i) => (
              <li key={i}>
                {source.startsWith('http') ? (
                  <a href={source} target="_blank" rel="noopener noreferrer">{source}</a>
                ) : source}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="edit-section">
        <label>Brief Description</label>
        <textarea
          value={editedData.brief_description || ''}
          onChange={(e) => handleChange('brief_description', e.target.value)}
          rows={3}
          placeholder="A short overview of this location..."
        />
      </div>

      <div className="edit-section">
        <label>Historical Description</label>
        <textarea
          value={editedData.historical_description || ''}
          onChange={(e) => handleChange('historical_description', e.target.value)}
          rows={5}
          placeholder="Detailed historical significance..."
        />
      </div>

      <div className="edit-row">
        <div className="edit-section half">
          <label>Era</label>
          <select
            value={editedData.era || ''}
            onChange={(e) => handleChange('era', e.target.value)}
            className="era-select"
          >
            <option value="">Select an era...</option>
            {availableEras.map(era => (
              <option key={era.id} value={era.name}>
                {era.name}
                {era.year_start || era.year_end
                  ? ` (${era.year_start || ''}${era.year_start && era.year_end ? '-' : ''}${era.year_end || '+'})`
                  : ''}
              </option>
            ))}
          </select>
        </div>
        <div className="edit-section half">
          <label>Property Owner</label>
          <input
            type="text"
            value={editedData.property_owner || ''}
            onChange={(e) => handleChange('property_owner', e.target.value)}
            placeholder="e.g., Federal (NPS)"
          />
        </div>
      </div>

      <div className="edit-section">
        <label>Primary Activities</label>
        <div className="activities-selector">
          <div
            className="activities-toggle"
            onClick={() => setShowActivityDropdown(!showActivityDropdown)}
          >
            <span className="activities-summary">
              {selectedActivities.length > 0
                ? selectedActivities.join(', ')
                : 'Select activities...'}
            </span>
            <span className="activities-arrow">{showActivityDropdown ? '▲' : '▼'}</span>
          </div>
          {showActivityDropdown && (
            <div className="activities-dropdown">
              {availableActivities.length === 0 ? (
                <div className="activities-empty">No activities configured. Add them in Settings.</div>
              ) : (
                availableActivities.map(activity => (
                  <label key={activity.id} className="activity-checkbox">
                    <input
                      type="checkbox"
                      checked={selectedActivities.includes(activity.name)}
                      onChange={() => toggleActivity(activity.name)}
                    />
                    <span>{activity.name}</span>
                  </label>
                ))
              )}
            </div>
          )}
        </div>
      </div>

      <div className="edit-row">
        <div className="edit-section half">
          <label>Surface</label>
          <select
            value={editedData.surface || ''}
            onChange={(e) => handleChange('surface', e.target.value)}
          >
            <option value="">Select surface...</option>
            {availableSurfaces.map(surface => (
              <option key={surface.id} value={surface.name}>
                {surface.name}
              </option>
            ))}
          </select>
        </div>
        <div className="edit-section half">
          <label>Pets Allowed</label>
          <select
            value={editedData.pets || ''}
            onChange={(e) => handleChange('pets', e.target.value)}
          >
            <option value="">Unknown</option>
            <option value="Yes">Yes</option>
            <option value="No">No</option>
            <option value="Leashed">Leashed Only</option>
          </select>
        </div>
      </div>

      <div className="edit-row">
        <div className="edit-section half">
          <label>Cell Signal</label>
          <EditableCellSignal
            level={editedData.cell_signal}
            onChange={(val) => handleChange('cell_signal', val)}
          />
        </div>
      </div>

      {/* Linear feature specific fields */}
      {isLinearFeature && (
        <>
          <div className="edit-row">
            <div className="edit-section half">
              <label>Feature Type</label>
              <select
                value={editedData.feature_type || 'trail'}
                onChange={(e) => handleChange('feature_type', e.target.value)}
              >
                <option value="trail">Trail</option>
                <option value="river">River/Waterway</option>
              </select>
            </div>
            <div className="edit-section half">
              <label>Difficulty</label>
              <select
                value={editedData.difficulty || ''}
                onChange={(e) => handleChange('difficulty', e.target.value)}
              >
                <option value="">Not specified</option>
                <option value="Easy">Easy</option>
                <option value="Moderate">Moderate</option>
                <option value="Difficult">Difficult</option>
              </select>
            </div>
          </div>
          <div className="edit-section">
            <label>Length (miles)</label>
            <input
              type="number"
              step="0.1"
              value={editedData.length_miles || ''}
              onChange={(e) => handleChange('length_miles', e.target.value ? parseFloat(e.target.value) : null)}
              placeholder="e.g., 2.5"
            />
          </div>
        </>
      )}

      {/* Lat/long fields - only for point destinations */}
      {!isLinearFeature && (
        <div className="edit-row">
          <div className="edit-section half">
            <label>Latitude</label>
            <input
              type="number"
              step="0.000001"
              value={editedData.latitude || ''}
              onChange={(e) => handleCoordChange('latitude', e.target.value)}
            />
          </div>
          <div className="edit-section half">
            <label>Longitude</label>
            <input
              type="number"
              step="0.000001"
              value={editedData.longitude || ''}
              onChange={(e) => handleCoordChange('longitude', e.target.value)}
            />
          </div>
        </div>
      )}

      <div className="edit-section">
        <label>More Info Link</label>
        <input
          type="text"
          value={editedData.more_info_link || ''}
          onChange={(e) => handleChange('more_info_link', e.target.value)}
          placeholder="https://..."
        />
      </div>

      </div>

      <div className="edit-buttons-footer">
        {!isNewPOI && (
          <button
            className="delete-btn"
            onClick={() => setShowDeleteConfirm(true)}
            disabled={saving || deleting}
          >
            Delete
          </button>
        )}
        <div className={`edit-buttons-right ${isNewPOI ? 'full-width' : ''}`}>
          <button className="cancel-btn" onClick={onCancel} disabled={saving || deleting}>
            Cancel
          </button>
          <button className="save-btn" onClick={onSave} disabled={saving || deleting}>
            {saving ? 'Saving...' : (isNewPOI ? 'Create POI' : 'Save Changes')}
          </button>
        </div>
      </div>

      {showDeleteConfirm && (
        <div className="delete-confirm-overlay" onClick={() => setShowDeleteConfirm(false)}>
          <div className="delete-confirm-dialog" onClick={(e) => e.stopPropagation()}>
            <h3>Delete Point of Interest?</h3>
            <p className="delete-dest-name">{destination.name}</p>
            <p className="delete-warning">This action cannot be undone.</p>
            <div className="delete-confirm-buttons">
              <button
                className="cancel-btn"
                onClick={() => setShowDeleteConfirm(false)}
                disabled={deleting}
              >
                Cancel
              </button>
              <button
                className="confirm-delete-btn"
                onClick={() => {
                  onDelete();
                  setShowDeleteConfirm(false);
                }}
                disabled={deleting}
              >
                {deleting ? 'Deleting...' : 'Yes, Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showPromptEditor && (
        <div className="prompt-editor-overlay" onClick={handleClosePromptEditor}>
          <div className="prompt-editor-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="prompt-editor-header">
              <h3>
                {promptType === 'brief' ? 'Generate Brief Description' : 'Generate Historical Description'}
              </h3>
              <button className="close-btn" onClick={handleClosePromptEditor}>&times;</button>
            </div>

            <p className="prompt-editor-hint">
              Review and customize the prompt below, then click Generate.
            </p>

            {loadingPrompt ? (
              <div className="prompt-loading">Loading prompt template...</div>
            ) : (
              <>
                <textarea
                  className="prompt-editor-textarea"
                  value={editablePrompt}
                  onChange={(e) => setEditablePrompt(e.target.value)}
                  rows={12}
                  disabled={generating}
                />

                {aiError && (
                  <div className="ai-error-inline">{aiError}</div>
                )}

                <div className="prompt-editor-buttons">
                  <button
                    className="cancel-btn"
                    onClick={handleClosePromptEditor}
                    disabled={generating}
                  >
                    Cancel
                  </button>
                  <button
                    className="ai-generate-btn-large"
                    onClick={handleGenerate}
                    disabled={generating || !editablePrompt.trim()}
                  >
                    {generating ? 'Generating...' : 'Generate'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Sidebar({ destination, isNewPOI, onClose, isAdmin, editMode, onDestinationUpdate, onDestinationDelete, onSaveNewPOI, onCancelNewPOI, previewCoords, onPreviewCoordsChange, linearFeature, onLinearFeatureUpdate, onLinearFeatureDelete }) {
  const [isEditing, setIsEditing] = useState(false);
  const [editedData, setEditedData] = useState({});
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Determine what we're displaying
  const displayItem = linearFeature || destination;
  const isLinearFeature = !!linearFeature;

  // Reset edit state when selection changes
  useEffect(() => {
    if (displayItem) {
      setEditedData({ ...displayItem });
      // Auto-enter edit mode if admin and editMode is on, or if creating new POI
      setIsEditing((isAdmin && editMode) || isNewPOI);
    } else {
      setIsEditing(false);
    }
  }, [displayItem, isAdmin, editMode, isNewPOI]);

  // Sync editedData coords when previewCoords changes (from map drag) - only for destinations
  useEffect(() => {
    if (previewCoords && isEditing && !isLinearFeature) {
      setEditedData(prev => ({
        ...prev,
        latitude: previewCoords.lat,
        longitude: previewCoords.lng
      }));
    }
  }, [previewCoords, isEditing, isLinearFeature]);

  // Save handler for destinations
  const handleSaveDestination = async () => {
    if (!editedData.name || !editedData.name.trim()) {
      alert('Name is required');
      return;
    }

    setSaving(true);
    try {
      if (isNewPOI) {
        const poiData = {
          ...editedData,
          latitude: previewCoords?.lat || editedData.latitude,
          longitude: previewCoords?.lng || editedData.longitude
        };
        await onSaveNewPOI(poiData);
      } else {
        const response = await fetch(`/api/admin/destinations/${destination.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(editedData)
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || 'Failed to save');
        }

        const updated = await response.json();
        if (onDestinationUpdate) {
          onDestinationUpdate(updated);
        }
        setIsEditing(false);
      }
    } catch (err) {
      alert(`Error saving: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  // Save handler for linear features
  const handleSaveLinearFeature = async () => {
    if (!editedData.name || !editedData.name.trim()) {
      alert('Name is required');
      return;
    }

    setSaving(true);
    try {
      const response = await fetch(`/api/admin/linear-features/${linearFeature.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(editedData)
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to save');
      }

      const updated = await response.json();
      if (onLinearFeatureUpdate) {
        onLinearFeatureUpdate(updated);
      }
      setIsEditing(false);
    } catch (err) {
      alert(`Error saving: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    if (isNewPOI && onCancelNewPOI) {
      onCancelNewPOI();
    } else {
      setEditedData({ ...displayItem });
      setIsEditing(false);
    }
  };

  // Delete handler for destinations
  const handleDeleteDestination = async () => {
    setDeleting(true);
    try {
      const response = await fetch(`/api/admin/destinations/${destination.id}`, {
        method: 'DELETE',
        credentials: 'include'
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to delete');
      }

      if (onDestinationDelete) {
        onDestinationDelete(destination.id);
      }
      onClose();
    } catch (err) {
      alert(`Error deleting: ${err.message}`);
    } finally {
      setDeleting(false);
    }
  };

  // Delete handler for linear features
  const handleDeleteLinearFeature = async () => {
    setDeleting(true);
    try {
      const response = await fetch(`/api/admin/linear-features/${linearFeature.id}`, {
        method: 'DELETE',
        credentials: 'include'
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to delete');
      }

      if (onLinearFeatureDelete) {
        onLinearFeatureDelete(linearFeature.id);
      }
      onClose();
    } catch (err) {
      alert(`Error deleting: ${err.message}`);
    } finally {
      setDeleting(false);
    }
  };

  if (!displayItem) {
    return <div className="sidebar" />;
  }

  // Render linear feature view - use same components as destinations
  if (isLinearFeature) {
    return (
      <div className={`sidebar open ${isEditing ? 'editing' : ''}`}>
        <div className="sidebar-header">
          <h2>{isEditing ? 'Edit: ' : ''}{linearFeature.name}</h2>
          <div className="header-buttons">
            <button className="close-btn" onClick={onClose}>&times;</button>
          </div>
        </div>

        {isEditing ? (
          <EditView
            destination={linearFeature}
            editedData={editedData}
            setEditedData={setEditedData}
            onSave={handleSaveLinearFeature}
            onCancel={handleCancel}
            onDelete={handleDeleteLinearFeature}
            saving={saving}
            deleting={deleting}
            isNewPOI={false}
            isLinearFeature={true}
            onImageUpdate={(hasImage, driveFileId) => {
              if (onLinearFeatureUpdate) {
                onLinearFeatureUpdate({
                  ...linearFeature,
                  image_mime_type: hasImage ? 'image/jpeg' : null,
                  image_drive_file_id: driveFileId
                });
              }
            }}
          />
        ) : (
          <ReadOnlyView destination={linearFeature} isLinearFeature={true} />
        )}
      </div>
    );
  }

  // Render destination view
  return (
    <div className={`sidebar ${destination ? 'open' : ''} ${isEditing ? 'editing' : ''}`}>
      <div className="sidebar-header">
        <h2>{isEditing ? 'Edit: ' : ''}{destination.name}</h2>
        <div className="header-buttons">
          <button className="close-btn" onClick={onClose}>&times;</button>
        </div>
      </div>

      {isEditing ? (
        <EditView
          destination={destination}
          editedData={editedData}
          setEditedData={setEditedData}
          onSave={handleSaveDestination}
          onCancel={handleCancel}
          onDelete={handleDeleteDestination}
          saving={saving}
          deleting={deleting}
          onPreviewCoordsChange={onPreviewCoordsChange}
          isNewPOI={isNewPOI}
          onImageUpdate={(hasImage, driveFileId) => {
            if (onDestinationUpdate) {
              onDestinationUpdate({
                ...destination,
                image_mime_type: hasImage ? 'image/jpeg' : null,
                image_drive_file_id: driveFileId
              });
            }
          }}
        />
      ) : (
        <ReadOnlyView destination={destination} />
      )}
    </div>
  );
}

export default Sidebar;
