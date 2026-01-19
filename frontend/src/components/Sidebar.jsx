import React, { useState, useEffect } from 'react';
import ImageUploader from './ImageUploader';
import NewsEvents from './NewsEvents';

// Sidebar component with tabs: Info, News, Events, History
// Share Modal Component
function ShareModal({ isOpen, onClose, poiName, poiDescription }) {
  const [copied, setCopied] = useState(false);

  // Use the current URL directly - server injects OG tags for ?poi= URLs
  const shareUrl = window.location.href;

  const shareText = poiDescription
    ? `${poiName} - ${poiDescription.substring(0, 100)}${poiDescription.length > 100 ? '...' : ''}`
    : `Check out ${poiName} at Roots of The Valley!`;

  const handleCopyLink = async () => {
    // Copy the regular app URL (not the share endpoint)
    const appUrl = window.location.href;
    try {
      await navigator.clipboard.writeText(appUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = appUrl;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const shareLinks = {
    facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}&quote=${encodeURIComponent(shareText)}`,
    threads: `https://www.threads.net/intent/post?text=${encodeURIComponent(shareText + ' ' + shareUrl)}`,
    linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(shareUrl)}`,
    twitter: `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(shareUrl)}`,
    mastodon: `https://mastodon.social/share?text=${encodeURIComponent(shareText + ' ' + shareUrl)}`,
    email: `mailto:?subject=${encodeURIComponent(poiName + ' | Roots of The Valley')}&body=${encodeURIComponent(shareText + '\n\n' + window.location.href)}`,
  };

  if (!isOpen) return null;

  return (
    <div className="share-modal-overlay" onClick={onClose}>
      <div className="share-modal" onClick={(e) => e.stopPropagation()}>
        <div className="share-modal-header">
          <h3>Share "{poiName}"</h3>
          <button className="share-modal-close" onClick={onClose}>&times;</button>
        </div>

        <div className="share-modal-content">
          <div className="share-platforms">
            <a
              href={shareLinks.facebook}
              target="_blank"
              rel="noopener noreferrer"
              className="share-platform-btn facebook"
              title="Share on Facebook"
            >
              <svg viewBox="0 0 24 24" width="24" height="24">
                <path fill="currentColor" d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
              </svg>
              <span>Facebook</span>
            </a>

            <a
              href={shareLinks.threads}
              target="_blank"
              rel="noopener noreferrer"
              className="share-platform-btn threads"
              title="Share on Threads"
            >
              <svg viewBox="0 0 24 24" width="24" height="24">
                <path fill="currentColor" d="M12.186 24h-.007c-3.581-.024-6.334-1.205-8.184-3.509C2.35 18.44 1.5 15.586 1.472 12.01v-.017c.03-3.579.879-6.43 2.525-8.482C5.845 1.205 8.6.024 12.18 0h.014c2.746.02 5.043.725 6.826 2.098 1.677 1.29 2.858 3.13 3.509 5.467l-2.04.569c-1.104-3.96-3.898-5.984-8.304-6.015-2.91.022-5.11.936-6.54 2.717C4.307 6.504 3.616 8.914 3.589 12c.027 3.086.718 5.496 2.057 7.164 1.43 1.783 3.631 2.698 6.54 2.717 2.623-.02 4.358-.631 5.8-2.045 1.647-1.613 1.618-3.593 1.09-4.798-.31-.71-.873-1.3-1.634-1.75-.192 1.352-.622 2.446-1.284 3.272-.886 1.102-2.14 1.704-3.73 1.79-1.202.065-2.361-.218-3.259-.801-1.063-.689-1.685-1.74-1.752-2.96-.065-1.182.408-2.256 1.332-3.023.88-.73 2.082-1.147 3.476-1.207.856-.036 1.672.015 2.446.137V8.928c0-.63-.152-1.083-.45-1.344-.326-.285-.822-.43-1.474-.43-.614 0-1.085.14-1.402.414-.282.245-.452.625-.511 1.14l-2.082-.203c.101-.977.475-1.824 1.113-2.517.786-.853 1.916-1.305 3.362-1.345h.106c1.414.025 2.476.416 3.16 1.164.653.716.984 1.71.984 2.955v4.27c.014.577.095 1.01.244 1.306.158.312.41.515.77.62l-.792 1.973c-.78-.174-1.403-.545-1.857-1.107-.348-.431-.589-.975-.723-1.63-.549.396-1.168.71-1.855.939-.906.302-1.9.46-2.958.472zm.306-6.99c-.937.04-1.665.272-2.166.69-.464.387-.68.864-.645 1.422.033.517.268.943.7 1.267.478.36 1.133.54 1.947.54h.077c1.077-.054 1.918-.462 2.498-1.217.47-.61.753-1.401.843-2.36-.715-.16-1.478-.27-2.28-.312-.33-.017-.655-.03-.974-.03z"/>
              </svg>
              <span>Threads</span>
            </a>

            <a
              href={shareLinks.linkedin}
              target="_blank"
              rel="noopener noreferrer"
              className="share-platform-btn linkedin"
              title="Share on LinkedIn"
            >
              <svg viewBox="0 0 24 24" width="24" height="24">
                <path fill="currentColor" d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
              </svg>
              <span>LinkedIn</span>
            </a>

            <a
              href={shareLinks.twitter}
              target="_blank"
              rel="noopener noreferrer"
              className="share-platform-btn twitter"
              title="Share on X"
            >
              <svg viewBox="0 0 24 24" width="24" height="24">
                <path fill="currentColor" d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
              </svg>
              <span>X</span>
            </a>

            <a
              href={shareLinks.mastodon}
              target="_blank"
              rel="noopener noreferrer"
              className="share-platform-btn mastodon"
              title="Share on Mastodon"
            >
              <svg viewBox="0 0 24 24" width="24" height="24">
                <path fill="currentColor" d="M23.268 5.313c-.35-2.578-2.617-4.61-5.304-5.004C17.51.242 15.792 0 11.813 0h-.03c-3.98 0-4.835.242-5.288.309C3.882.692 1.496 2.518.917 5.127.64 6.412.61 7.837.661 9.143c.074 1.874.088 3.745.26 5.611.118 1.24.325 2.47.62 3.68.55 2.237 2.777 4.098 4.96 4.857 2.336.792 4.849.923 7.256.38.265-.061.527-.132.786-.213.585-.184 1.27-.39 1.774-.753a.057.057 0 0 0 .023-.043v-1.809a.052.052 0 0 0-.02-.041.053.053 0 0 0-.046-.01 20.282 20.282 0 0 1-4.709.545c-2.73 0-3.463-1.284-3.674-1.818a5.593 5.593 0 0 1-.319-1.433.053.053 0 0 1 .066-.054c1.517.363 3.072.546 4.632.546.376 0 .75 0 1.125-.01 1.57-.044 3.224-.124 4.768-.422.038-.008.077-.015.11-.024 2.435-.464 4.753-1.92 4.989-5.604.008-.145.03-1.52.03-1.67.002-.512.167-3.63-.024-5.545zm-3.748 9.195h-2.561V8.29c0-1.309-.55-1.976-1.67-1.976-1.23 0-1.846.79-1.846 2.35v3.403h-2.546V8.663c0-1.56-.617-2.35-1.848-2.35-1.112 0-1.668.668-1.668 1.977v6.218H4.822V8.102c0-1.31.337-2.35 1.011-3.12.696-.77 1.608-1.164 2.74-1.164 1.311 0 2.302.5 2.962 1.498l.638 1.06.638-1.06c.66-.999 1.65-1.498 2.96-1.498 1.13 0 2.043.395 2.74 1.164.675.77 1.012 1.81 1.012 3.12z"/>
              </svg>
              <span>Mastodon</span>
            </a>

            <a
              href={shareLinks.email}
              className="share-platform-btn email"
              title="Share via Email"
            >
              <svg viewBox="0 0 24 24" width="24" height="24">
                <path fill="currentColor" d="M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"/>
              </svg>
              <span>Email</span>
            </a>
          </div>

          <div className="share-link-section">
            <label>Or copy link:</label>
            <div className="share-link-input-group">
              <input
                type="text"
                value={shareUrl}
                readOnly
                className="share-link-input"
              />
              <button
                className={`share-copy-btn ${copied ? 'copied' : ''}`}
                onClick={handleCopyLink}
              >
                {copied ? 'Copied!' : 'Copy'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

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
function ReadOnlyView({ destination, isLinearFeature, isAdmin, showImage = true, onShare }) {
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
    <div className="view-container">
      <div className="view-scroll">
        {/* Image section - URL computed from ID (can be hidden if shown elsewhere) */}
        {showImage && (
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
        )}

        <div className="sidebar-content">
        <div className="badges-row">
          {/* Linear feature type badge */}
          {isLinearFeature && (
            <span className={`feature-type-badge ${destination.feature_type}`}>
              {destination.feature_type === 'river' ? 'River/Waterway' :
               destination.feature_type === 'boundary' ? 'Boundary' : 'Trail'}
            </span>
          )}
          {/* Boundary color swatch */}
          {isLinearFeature && destination.feature_type === 'boundary' && destination.boundary_color && (
            <span
              className="boundary-color-swatch"
              style={{ backgroundColor: destination.boundary_color }}
              title={`Color: ${destination.boundary_color}`}
            />
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
          {/* Share button */}
          {onShare && (
            <button className="share-badge-btn" onClick={onShare} title="Share this location">
              <svg viewBox="0 0 24 24" width="14" height="14">
                <path fill="currentColor" d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92s2.92-1.31 2.92-2.92-1.31-2.92-2.92-2.92z"/>
              </svg>
              Share
            </button>
          )}
        </div>

        {destination.brief_description && (
          <div className="section">
            <h3>Overview</h3>
            <p>{destination.brief_description}</p>
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
        </div>
      </div>

      {/* Sticky footer for More Info link */}
      {destination.more_info_link && (
        <div className="view-buttons-footer">
          <a
            href={destination.more_info_link}
            target="_blank"
            rel="noopener noreferrer"
            className="more-info-btn"
          >
            More Information
          </a>
        </div>
      )}
    </div>
  );
}

// Edit view component - works for both destinations and linear features
function EditView({ destination, editedData, setEditedData, onSave, onCancel, onDelete, saving, deleting, onPreviewCoordsChange, isNewPOI, onImageUpdate, isLinearFeature, showImage = true }) {
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
      {/* Image section at top - matches view mode layout (can be hidden if shown elsewhere) */}
      {showImage && (
        !isNewPOI && destination?.id ? (
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
        )
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

      {/* Linear feature specific fields - trails and rivers */}
      {isLinearFeature && editedData.feature_type !== 'boundary' && (
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

      {/* Boundary color picker */}
      {isLinearFeature && editedData.feature_type === 'boundary' && (
        <div className="edit-section">
          <label>Boundary Color</label>
          <div className="boundary-color-palette">
            {[
              '#228B22', // Forest Green
              '#2E8B57', // Sea Green
              '#006400', // Dark Green
              '#8B4513', // Saddle Brown
              '#A0522D', // Sienna
              '#CD853F', // Peru
              '#4169E1', // Royal Blue
              '#1E90FF', // Dodger Blue
              '#4682B4', // Steel Blue
              '#8B008B', // Dark Magenta
              '#9932CC', // Dark Orchid
              '#DC143C', // Crimson
              '#FF6347', // Tomato
              '#FF8C00', // Dark Orange
              '#FFD700', // Gold
            ].map(color => (
              <button
                key={color}
                type="button"
                className={`color-swatch ${editedData.boundary_color === color ? 'selected' : ''}`}
                style={{ backgroundColor: color }}
                onClick={() => handleChange('boundary_color', color)}
                title={color}
              />
            ))}
          </div>
          <div className="current-color-display">
            Current: <span style={{ backgroundColor: editedData.boundary_color || '#228B22' }} className="color-preview" />
            <span className="color-hex">{editedData.boundary_color || '#228B22'}</span>
          </div>
        </div>
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

// POI-specific News component
function PoiNews({ poiId, isAdmin, editMode }) {
  const [news, setNews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(null);
  const [collecting, setCollecting] = useState(false);
  const [collectResult, setCollectResult] = useState(null);

  const fetchNews = async () => {
    if (!poiId) return;
    setLoading(true);
    try {
      const response = await fetch(`/api/pois/${poiId}/news?limit=20`);
      if (response.ok) {
        const data = await response.json();
        setNews(data);
      }
    } catch (err) {
      console.error('Error fetching POI news:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNews();
  }, [poiId]);

  // Collect news for this POI and refresh
  const handleCollectNews = async () => {
    if (!poiId) return;
    setCollecting(true);
    setCollectResult(null);
    try {
      const response = await fetch(`/api/admin/pois/${poiId}/news/collect`, {
        method: 'POST',
        credentials: 'include'
      });
      if (response.ok) {
        const result = await response.json();
        setCollectResult({ type: 'success', news: result.newsFound, newsSaved: result.newsSaved });
        // Refresh the news list
        await fetchNews();
      } else {
        const error = await response.json();
        setCollectResult({ type: 'error', message: error.error || 'Collection failed' });
      }
    } catch (err) {
      setCollectResult({ type: 'error', message: err.message });
    } finally {
      setCollecting(false);
    }
  };

  const handleDelete = async (newsId) => {
    if (!confirm('Delete this news item?')) return;
    setDeleting(newsId);
    try {
      const response = await fetch(`/api/admin/news/${newsId}`, {
        method: 'DELETE',
        credentials: 'include'
      });
      if (response.ok) {
        setNews(prev => prev.filter(n => n.id !== newsId));
      }
    } catch (err) {
      console.error('Error deleting news:', err);
    } finally {
      setDeleting(null);
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return '';
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric'
    });
  };

  if (loading) return <div className="sidebar-tab-loading">Loading news...</div>;

  return (
    <div className="poi-news-list">
      {news.length === 0 ? (
        <div className="sidebar-tab-empty">No news for this location.</div>
      ) : news.map(item => (
        <div key={item.id} className={`poi-news-item ${item.news_type || 'general'}`}>
          <div className="poi-news-header">
            <span className="poi-news-title">{item.title}</span>
            {isAdmin && (
              <button
                className="news-delete-btn"
                onClick={() => handleDelete(item.id)}
                disabled={deleting === item.id}
              >
                {deleting === item.id ? '...' : '×'}
              </button>
            )}
          </div>
          {item.summary && <p className="poi-news-summary">{item.summary}</p>}
          <div className="poi-news-meta">
            {item.source_name && <span className="news-source">{item.source_name}</span>}
            {item.published_at && <span className="news-date">{formatDate(item.published_at)}</span>}
            {item.source_url && (
              <a href={item.source_url} target="_blank" rel="noopener noreferrer" className="news-link">
                Read more
              </a>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// POI-specific Events component
function PoiEvents({ poiId, isAdmin, editMode }) {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(null);
  const [collecting, setCollecting] = useState(false);
  const [collectResult, setCollectResult] = useState(null);

  const fetchEvents = async () => {
    if (!poiId) return;
    setLoading(true);
    try {
      const response = await fetch(`/api/pois/${poiId}/events`);
      if (response.ok) {
        const data = await response.json();
        setEvents(data);
      }
    } catch (err) {
      console.error('Error fetching POI events:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEvents();
  }, [poiId]);

  // Collect events for this POI and refresh
  const handleCollectEvents = async () => {
    if (!poiId) return;
    setCollecting(true);
    setCollectResult(null);
    try {
      const response = await fetch(`/api/admin/pois/${poiId}/news/collect`, {
        method: 'POST',
        credentials: 'include'
      });
      if (response.ok) {
        const result = await response.json();
        setCollectResult({ type: 'success', events: result.eventsFound, eventsSaved: result.eventsSaved });
        // Refresh the events list
        await fetchEvents();
      } else {
        const error = await response.json();
        setCollectResult({ type: 'error', message: error.error || 'Collection failed' });
      }
    } catch (err) {
      setCollectResult({ type: 'error', message: err.message });
    } finally {
      setCollecting(false);
    }
  };

  const handleDelete = async (eventId) => {
    if (!confirm('Delete this event?')) return;
    setDeleting(eventId);
    try {
      const response = await fetch(`/api/admin/events/${eventId}`, {
        method: 'DELETE',
        credentials: 'include'
      });
      if (response.ok) {
        setEvents(prev => prev.filter(e => e.id !== eventId));
      }
    } catch (err) {
      console.error('Error deleting event:', err);
    } finally {
      setDeleting(null);
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return '';
    return new Date(dateString).toLocaleDateString('en-US', {
      weekday: 'short', month: 'short', day: 'numeric', year: 'numeric'
    });
  };

  if (loading) return <div className="sidebar-tab-loading">Loading events...</div>;

  return (
    <div className="poi-events-list">
      {events.length === 0 ? (
        <div className="sidebar-tab-empty">No upcoming events for this location.</div>
      ) : events.map(item => (
        <div key={item.id} className={`poi-event-item ${item.event_type || 'program'}`}>
          <div className="poi-event-header">
            <span className="poi-event-title">{item.title}</span>
            {isAdmin && (
              <button
                className="news-delete-btn"
                onClick={() => handleDelete(item.id)}
                disabled={deleting === item.id}
              >
                {deleting === item.id ? '...' : '×'}
              </button>
            )}
          </div>
          <div className="poi-event-date">
            {formatDate(item.start_date)}
            {item.end_date && item.end_date !== item.start_date && (
              <> - {formatDate(item.end_date)}</>
            )}
          </div>
          {item.description && <p className="poi-event-description">{item.description}</p>}
          {item.location_details && (
            <div className="poi-event-location">
              <strong>Location:</strong> {item.location_details}
            </div>
          )}
          {item.source_url && (
            <a href={item.source_url} target="_blank" rel="noopener noreferrer" className="event-link">
              More info
            </a>
          )}
        </div>
      ))}
    </div>
  );
}

function Sidebar({ destination, isNewPOI, onClose, isAdmin, editMode, onDestinationUpdate, onDestinationDelete, onSaveNewPOI, onCancelNewPOI, previewCoords, onPreviewCoordsChange, linearFeature, onLinearFeatureUpdate, onLinearFeatureDelete }) {
  const [isEditing, setIsEditing] = useState(false);
  const [editedData, setEditedData] = useState({});
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [sidebarTab, setSidebarTab] = useState('view');
  const [showShareModal, setShowShareModal] = useState(false);

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
      // Exclude geometry from save payload - it's not editable via sidebar
      // and including it makes the request too large
      const { geometry, ...dataWithoutGeometry } = editedData;

      const response = await fetch(`/api/admin/linear-features/${linearFeature.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(dataWithoutGeometry)
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

  // If no POI selected, don't show sidebar
  if (!displayItem) {
    return null;
  }

  // Render linear feature view - use same components as destinations with tabs
  if (isLinearFeature) {
    // Compute image URL for linear feature
    const linearImageUrl = linearFeature?.image_mime_type
      ? `/api/linear-features/${linearFeature.id}/image?v=${new Date(linearFeature.updated_at).getTime() || Date.now()}`
      : null;

    // Determine placeholder icon based on type
    const placeholderIcon = linearFeature.feature_type === 'river' ? '🌊' :
                            linearFeature.feature_type === 'boundary' ? '🗺️' : '🥾';

    return (
      <div className={`sidebar open ${isEditing ? 'editing' : ''}`}>
        <div className="sidebar-header">
          <h2>{isEditing ? 'Edit: ' : ''}{linearFeature.name}</h2>
          <div className="header-buttons">
            <button className="close-btn" onClick={onClose}>&times;</button>
          </div>
        </div>

        {/* Image - always shown at top for all tabs */}
        {isEditing && linearFeature?.id ? (
          <ImageUploader
            destinationId={linearFeature.id}
            hasImage={!!linearFeature.image_mime_type}
            onImageChange={(hasImage, driveFileId) => {
              if (onLinearFeatureUpdate) {
                onLinearFeatureUpdate({
                  ...linearFeature,
                  image_mime_type: hasImage ? 'image/jpeg' : null,
                  image_drive_file_id: driveFileId
                });
              }
            }}
            disabled={saving}
            isLinearFeature={true}
          />
        ) : (
          <div className="sidebar-image">
            {linearImageUrl ? (
              <img src={linearImageUrl} alt={linearFeature?.name} />
            ) : (
              <div className="image-placeholder">
                <span className="placeholder-icon">{placeholderIcon}</span>
                <span className="placeholder-text">Image coming soon</span>
              </div>
            )}
          </div>
        )}

        {/* Sidebar Tabs - same as destinations */}
        <div className="sidebar-tabs">
          <button
            className={`sidebar-tab ${sidebarTab === 'view' ? 'active' : ''}`}
            onClick={() => setSidebarTab('view')}
          >
            Info
          </button>
          <button
            className={`sidebar-tab ${sidebarTab === 'news' ? 'active' : ''}`}
            onClick={() => setSidebarTab('news')}
          >
            News
          </button>
          <button
            className={`sidebar-tab ${sidebarTab === 'events' ? 'active' : ''}`}
            onClick={() => setSidebarTab('events')}
          >
            Events
          </button>
          <button
            className={`sidebar-tab ${sidebarTab === 'history' ? 'active' : ''}`}
            onClick={() => setSidebarTab('history')}
          >
            History
          </button>
        </div>

        {/* Tab Content */}
        <div className="sidebar-tab-content">
          {sidebarTab === 'view' && (
            isEditing ? (
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
                showImage={false}
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
              <ReadOnlyView destination={linearFeature} isLinearFeature={true} isAdmin={isAdmin} showImage={false} onShare={() => setShowShareModal(true)} />
            )
          )}

          {sidebarTab === 'news' && linearFeature && (
            <PoiNews poiId={linearFeature.id} isAdmin={isAdmin} editMode={editMode} />
          )}

          {sidebarTab === 'events' && linearFeature && (
            <PoiEvents poiId={linearFeature.id} isAdmin={isAdmin} editMode={editMode} />
          )}

          {sidebarTab === 'history' && linearFeature && (
            <div className="history-tab-content">
              {isEditing ? (
                <div className="edit-section">
                  <label>Historical Description</label>
                  <textarea
                    value={editedData.historical_description || ''}
                    onChange={(e) => setEditedData(prev => ({ ...prev, historical_description: e.target.value }))}
                    rows={8}
                    placeholder="Detailed historical significance..."
                  />
                </div>
              ) : linearFeature.historical_description ? (
                <div className="section">
                  <h3>Historical Significance</h3>
                  <p className="historical-description">{linearFeature.historical_description}</p>
                </div>
              ) : (
                <div className="sidebar-tab-empty">No historical information available for this location.</div>
              )}
            </div>
          )}
        </div>

        <ShareModal
          isOpen={showShareModal}
          onClose={() => setShowShareModal(false)}
          poiName={linearFeature.name}
          poiDescription={linearFeature.brief_description}
        />
      </div>
    );
  }

  // Compute image URL for destination
  const imageUrl = destination?.image_mime_type
    ? `/api/destinations/${destination.id}/image?v=${new Date(destination.updated_at).getTime() || Date.now()}`
    : null;

  // Render destination view with tabs
  return (
    <div className={`sidebar ${destination ? 'open' : ''} ${isEditing ? 'editing' : ''}`}>
      <div className="sidebar-header">
        <h2>{isEditing ? 'Edit: ' : ''}{destination?.name || 'Location Details'}</h2>
        <div className="header-buttons">
          <button className="close-btn" onClick={onClose}>&times;</button>
        </div>
      </div>

      {/* Image - always shown at top for all tabs */}
      {isEditing && destination?.id ? (
        <ImageUploader
          destinationId={destination.id}
          hasImage={!!destination.image_mime_type}
          onImageChange={(hasImage, driveFileId) => {
            if (onDestinationUpdate) {
              onDestinationUpdate({
                ...destination,
                image_mime_type: hasImage ? 'image/jpeg' : null,
                image_drive_file_id: driveFileId
              });
            }
          }}
          disabled={saving}
        />
      ) : (
        <div className="sidebar-image">
          {imageUrl ? (
            <img src={imageUrl} alt={destination?.name} />
          ) : (
            <div className="image-placeholder">
              <span className="placeholder-icon">🏞️</span>
              <span className="placeholder-text">Image coming soon</span>
            </div>
          )}
        </div>
      )}

      {/* Sidebar Tabs - always shown */}
      <div className="sidebar-tabs">
        <button
          className={`sidebar-tab ${sidebarTab === 'view' ? 'active' : ''}`}
          onClick={() => setSidebarTab('view')}
        >
          Info
        </button>
        <button
          className={`sidebar-tab ${sidebarTab === 'news' ? 'active' : ''}`}
          onClick={() => setSidebarTab('news')}
        >
          News
        </button>
        <button
          className={`sidebar-tab ${sidebarTab === 'events' ? 'active' : ''}`}
          onClick={() => setSidebarTab('events')}
        >
          Events
        </button>
        <button
          className={`sidebar-tab ${sidebarTab === 'history' ? 'active' : ''}`}
          onClick={() => setSidebarTab('history')}
        >
          History
        </button>
      </div>

      {/* Tab Content */}
      <div className="sidebar-tab-content">
        {sidebarTab === 'view' && (
          isEditing ? (
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
              showImage={false}
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
            <ReadOnlyView destination={destination} isAdmin={isAdmin} showImage={false} onShare={() => setShowShareModal(true)} />
          )
        )}

        {sidebarTab === 'news' && destination && (
          <PoiNews poiId={destination.id} isAdmin={isAdmin} editMode={editMode} />
        )}

        {sidebarTab === 'events' && destination && (
          <PoiEvents poiId={destination.id} isAdmin={isAdmin} editMode={editMode} />
        )}

        {sidebarTab === 'history' && destination && (
          <div className="history-tab-content">
            {isEditing ? (
              <div className="edit-section">
                <label>Historical Description</label>
                <textarea
                  value={editedData.historical_description || ''}
                  onChange={(e) => setEditedData(prev => ({ ...prev, historical_description: e.target.value }))}
                  rows={8}
                  placeholder="Detailed historical significance..."
                />
              </div>
            ) : destination.historical_description ? (
              <div className="section">
                <h3>Historical Significance</h3>
                <p className="historical-description">{destination.historical_description}</p>
              </div>
            ) : (
              <div className="sidebar-tab-empty">No historical information available for this location.</div>
            )}
          </div>
        )}
      </div>

      <ShareModal
        isOpen={showShareModal}
        onClose={() => setShowShareModal(false)}
        poiName={destination?.name || ''}
        poiDescription={destination?.brief_description}
      />
    </div>
  );
}

export default Sidebar;
