import React, { useState, useEffect, useCallback } from 'react';

function SyncSettings() {
  const [syncStatus, setSyncStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState(null);
  const [message, setMessage] = useState(null);
  const [spreadsheetIdInput, setSpreadsheetIdInput] = useState('');
  const [showConnectForm, setShowConnectForm] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Fetch sync status
  const fetchStatus = useCallback(async () => {
    try {
      const response = await fetch('/api/admin/sync/status', {
        credentials: 'include'
      });
      if (response.ok) {
        const status = await response.json();
        setSyncStatus(status);
        setError(null);
      } else if (response.status === 401 || response.status === 403) {
        setError('Please log in as admin to view sync status');
      } else {
        const err = await response.json();
        setError(err.error || 'Failed to fetch sync status');
      }
    } catch (err) {
      setError('Failed to connect to server');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    // Refresh status every 30 seconds (use refresh button for immediate updates)
    const interval = setInterval(fetchStatus, 30000);

    // Also refresh when the window/tab regains focus
    const handleFocus = () => {
      fetchStatus();
    };
    window.addEventListener('focus', handleFocus);

    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', handleFocus);
    };
  }, [fetchStatus]);

  // Manual refresh with spin animation
  const handleManualRefresh = async () => {
    setRefreshing(true);
    await fetchStatus();
    // Keep spinning for a moment so it's visible
    setTimeout(() => setRefreshing(false), 800);
  };

  // Calculate total pending changes (queue + unsynced POIs)
  const getPendingChanges = () => {
    if (!syncStatus) return 0;
    // Use the higher of the two, or sum if both represent different things
    // Since unsynced POIs get added to queue during sync, just show the max
    return Math.max(
      syncStatus.pending_operations || 0,
      syncStatus.unsynced_destinations || 0
    );
  };

  const handleSyncChanges = async () => {
    setSyncing(true);
    setMessage(null);
    setError(null);

    try {
      const response = await fetch('/api/admin/sync/process', {
        method: 'POST',
        credentials: 'include'
      });

      const result = await response.json();
      if (response.ok) {
        setMessage(result.message);
        if (result.errors && result.errors.length > 0) {
          setError(`${result.errors.length} operations failed`);
        }
        fetchStatus();
      } else {
        setError(result.error || 'Sync failed');
      }
    } catch (err) {
      setError('Failed to sync changes');
    } finally {
      setSyncing(false);
    }
  };

  const handlePush = async () => {
    if (!confirm('This will replace ALL data in Google Drive with the current database contents. Continue?')) {
      return;
    }

    setSyncing(true);
    setMessage(null);
    setError(null);

    try {
      const response = await fetch('/api/admin/sync/push', {
        method: 'POST',
        credentials: 'include'
      });

      const result = await response.json();
      if (response.ok) {
        setMessage(result.message);
        fetchStatus();
      } else {
        setError(result.error || 'Push failed');
      }
    } catch (err) {
      setError('Failed to push to Google Drive');
    } finally {
      setSyncing(false);
    }
  };

  const handlePull = async () => {
    if (!confirm('This will replace ALL data in the database with Google Drive contents. Any local changes will be lost. Continue?')) {
      return;
    }

    setSyncing(true);
    setMessage(null);
    setError(null);

    try {
      const response = await fetch('/api/admin/sync/pull', {
        method: 'POST',
        credentials: 'include'
      });

      const result = await response.json();
      if (response.ok) {
        setMessage(result.message);
        fetchStatus();
        // Reload the page to refresh destinations
        setTimeout(() => window.location.reload(), 1500);
      } else {
        setError(result.error || 'Pull failed');
      }
    } catch (err) {
      setError('Failed to pull from Google Drive');
    } finally {
      setSyncing(false);
    }
  };

  const handleClearQueue = async () => {
    if (!confirm('This will discard all pending sync operations. Changes will not be pushed to Google Drive. Continue?')) {
      return;
    }

    setSyncing(true);
    setMessage(null);
    setError(null);

    try {
      const response = await fetch('/api/admin/sync/queue', {
        method: 'DELETE',
        credentials: 'include'
      });

      const result = await response.json();
      if (response.ok) {
        setMessage(result.message);
        fetchStatus();
      } else {
        setError(result.error || 'Clear failed');
      }
    } catch (err) {
      setError('Failed to clear sync queue');
    } finally {
      setSyncing(false);
    }
  };

  const handleCreateSpreadsheet = async () => {
    setSyncing(true);
    setMessage(null);
    setError(null);

    try {
      const response = await fetch('/api/admin/sync/create-spreadsheet', {
        method: 'POST',
        credentials: 'include'
      });

      const result = await response.json();
      if (response.ok) {
        setMessage(result.message);
        fetchStatus();
      } else {
        setError(result.error || 'Failed to create spreadsheet');
      }
    } catch (err) {
      setError('Failed to create spreadsheet');
    } finally {
      setSyncing(false);
    }
  };

  const handleConnectSpreadsheet = async () => {
    if (!spreadsheetIdInput.trim()) {
      setError('Please enter a spreadsheet ID');
      return;
    }

    setSyncing(true);
    setMessage(null);
    setError(null);

    try {
      const response = await fetch('/api/admin/sync/connect-spreadsheet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ spreadsheetId: spreadsheetIdInput.trim() })
      });

      const result = await response.json();
      if (response.ok) {
        setMessage(result.message);
        setSpreadsheetIdInput('');
        setShowConnectForm(false);
        fetchStatus();
      } else {
        setError(result.error || 'Failed to connect spreadsheet');
      }
    } catch (err) {
      setError('Failed to connect spreadsheet');
    } finally {
      setSyncing(false);
    }
  };

  const handleDisconnectSpreadsheet = async () => {
    if (!confirm('Disconnect from this spreadsheet? You can reconnect later using the spreadsheet ID.')) {
      return;
    }

    setSyncing(true);
    setMessage(null);
    setError(null);

    try {
      const response = await fetch('/api/admin/sync/disconnect-spreadsheet', {
        method: 'DELETE',
        credentials: 'include'
      });

      const result = await response.json();
      if (response.ok) {
        setMessage(result.message);
        fetchStatus();
      } else {
        setError(result.error || 'Failed to disconnect');
      }
    } catch (err) {
      setError('Failed to disconnect spreadsheet');
    } finally {
      setSyncing(false);
    }
  };

  const handleWipeDatabase = async () => {
    const firstConfirm = confirm(
      'WARNING: This will permanently delete ALL destinations from the local database.\n\n' +
      'This action cannot be undone!\n\n' +
      'Are you sure you want to continue?'
    );

    if (!firstConfirm) return;

    const secondConfirm = confirm(
      'FINAL WARNING: You are about to delete all local data.\n\n' +
      'Click OK to confirm you want to wipe the database.'
    );

    if (!secondConfirm) return;

    setSyncing(true);
    setMessage(null);
    setError(null);

    try {
      const response = await fetch('/api/admin/sync/wipe-database', {
        method: 'DELETE',
        credentials: 'include'
      });

      const result = await response.json();
      if (response.ok) {
        setMessage(result.message);
        fetchStatus();
        setTimeout(() => window.location.reload(), 1500);
      } else {
        setError(result.error || 'Failed to wipe database');
      }
    } catch (err) {
      setError('Failed to wipe database');
    } finally {
      setSyncing(false);
    }
  };

  const formatDate = (isoString) => {
    if (!isoString) return 'Never';
    const date = new Date(isoString);
    return date.toLocaleString();
  };

  // Map database table names to Google Sheets tab names
  const getTabName = (tableName) => {
    const tabMap = {
      'pois': 'Destinations',
      'destinations': 'Destinations',
      'activities': 'Activities',
      'eras': 'Eras',
      'surfaces': 'Surfaces',
      'icons': 'Icons',
      'settings': 'Integration'
    };
    return tabMap[tableName] || tableName;
  };

  // Get human-readable name for queue items
  const getDisplayName = (item) => {
    if (item.item_name) {
      // For settings, convert key names to readable format
      if (item.table_name === 'settings') {
        const keyMap = {
          'gemini_api_key': 'Gemini API Key',
          'gemini_prompt_brief': 'Brief Description Prompt',
          'gemini_prompt_historical': 'Historical Description Prompt'
        };
        return keyMap[item.item_name] || item.item_name;
      }
      return item.item_name;
    }
    return `Record #${item.record_id}`;
  };

  // Get operation display with direction arrow
  const getOperationDisplay = (operation) => {
    const opMap = {
      'INSERT': { label: 'Add', icon: '+', className: 'insert' },
      'UPDATE': { label: 'Update', icon: '↻', className: 'update' },
      'DELETE': { label: 'Remove', icon: '−', className: 'delete' }
    };
    return opMap[operation] || { label: operation, icon: '?', className: 'unknown' };
  };

  if (loading) {
    return (
      <div className="sync-settings">
        <h3>Google Drive Integration</h3>
        <p>Loading sync status...</p>
      </div>
    );
  }

  const pendingChanges = getPendingChanges();

  return (
    <div className="sync-settings">
      <h3>Google Drive Integration</h3>
      <p className="sync-description">
        Synchronize data between the local database and Google Drive.
      </p>

      {error && (
        <div className="sync-error">
          {error}
        </div>
      )}

      {message && (
        <div className="sync-success">
          {message}
        </div>
      )}

      {/* Combined Sync Status & Actions Tile - FIRST for easy access */}
      {syncStatus?.spreadsheet?.configured && (
        <div className="sync-unified-tile">
          <div className="sync-tile-header">
            <h4>Synchronization</h4>
            <button
              className={`refresh-btn${refreshing ? ' spinning' : ''}`}
              onClick={handleManualRefresh}
              disabled={loading || refreshing}
              title="Refresh sync status"
            >
              ↻
            </button>
          </div>

          <div className="sync-status-row">
            <div className="sync-status-item">
              <label>Last Synced</label>
              <span>{formatDate(syncStatus.last_sync)}</span>
            </div>
            <div className="sync-status-item">
              <label>Pending Changes</label>
              <span className={pendingChanges > 0 ? 'pending-highlight' : ''}>
                {pendingChanges}
              </span>
            </div>
          </div>

          {/* Sync Queue Details - show pending changes */}
          {((syncStatus.sync_queue && syncStatus.sync_queue.length > 0) || syncStatus.unsynced_destinations > 0) && (
            <div className="sync-queue-detailed">
              <div className="queue-header-row">
                <span className="queue-direction">
                  <span className="direction-icon">📤</span>
                  Pushing to Google Sheets
                </span>
              </div>
              <div className="queue-items-list">
                {syncStatus.sync_queue && syncStatus.sync_queue.map(item => {
                  const op = getOperationDisplay(item.operation);
                  return (
                    <div key={item.id} className={`queue-item-row queue-${op.className}`}>
                      <span className="queue-op-icon">{op.icon}</span>
                      <span className="queue-op-label">{op.label}</span>
                      <span className="queue-item-name">{getDisplayName(item)}</span>
                      <span className="queue-arrow">→</span>
                      <span className="queue-tab-name">{getTabName(item.table_name)}</span>
                    </div>
                  );
                })}
                {/* Show unsynced POIs that aren't in the queue */}
                {syncStatus.unsynced_destinations > 0 &&
                 (!syncStatus.sync_queue || syncStatus.sync_queue.filter(q =>
                   q.table_name === 'pois' || q.table_name === 'destinations'
                 ).length < syncStatus.unsynced_destinations) && (
                  <div className="queue-item-row queue-update queue-pending">
                    <span className="queue-op-icon">↻</span>
                    <span className="queue-op-label">Update</span>
                    <span className="queue-item-name">
                      {syncStatus.unsynced_destinations} destination{syncStatus.unsynced_destinations > 1 ? 's' : ''} pending
                    </span>
                    <span className="queue-arrow">→</span>
                    <span className="queue-tab-name">Destinations</span>
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="sync-buttons-grid">
            <div className="sync-button-card">
              <button
                className="sync-btn sync-now-btn"
                onClick={handleSyncChanges}
                disabled={syncing || pendingChanges === 0}
              >
                {syncing ? 'Syncing...' : `Sync Changes (${pendingChanges})`}
              </button>
              <p className="button-description">Push pending changes to Google Sheets</p>
            </div>

            <div className="sync-button-card">
              <button
                className="sync-btn push-btn"
                onClick={handlePush}
                disabled={syncing}
              >
                Push All
              </button>
              <p className="button-description">Replace Google Drive with all local data</p>
            </div>

            <div className="sync-button-card">
              <button
                className="sync-btn pull-btn"
                onClick={handlePull}
                disabled={syncing}
              >
                Pull All
              </button>
              <p className="button-description">Replace local data with Google Drive</p>
            </div>
          </div>

          {pendingChanges > 0 && (
            <div className="sync-clear-row">
              <button
                className="sync-btn-small clear-btn"
                onClick={handleClearQueue}
                disabled={syncing}
              >
                Clear Pending Changes
              </button>
              <span className="clear-hint">Discard without syncing</span>
            </div>
          )}
        </div>
      )}

      {/* Google Drive Storage Info */}
      {syncStatus && syncStatus.drive && syncStatus.drive.configured && (
        <div className="sync-drive-info">
          <h4>Google Drive Storage</h4>
          <div className="drive-folder-structure">
            {syncStatus.drive.folders.root && (
              <div className="drive-folder root-folder">
                <a
                  href={syncStatus.drive.folders.root.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="folder-link"
                >
                  <span className="folder-icon">📁</span>
                  <span className="folder-name">{syncStatus.drive.folders.root.name}</span>
                </a>
                <div className="subfolder-list">
                  {syncStatus.drive.folders.icons && (
                    <div className="drive-folder subfolder">
                      <a
                        href={syncStatus.drive.folders.icons.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="folder-link"
                      >
                        <span className="folder-icon">🎨</span>
                        <span className="folder-name">Icons</span>
                        <span className="file-count">({syncStatus.drive.folders.icons.file_count} files)</span>
                      </a>
                    </div>
                  )}
                  {syncStatus.drive.folders.images && (
                    <div className="drive-folder subfolder">
                      <a
                        href={syncStatus.drive.folders.images.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="folder-link"
                      >
                        <span className="folder-icon">🖼️</span>
                        <span className="folder-name">Images</span>
                        <span className="file-count">({syncStatus.drive.folders.images.file_count} files)</span>
                      </a>
                    </div>
                  )}
                  {syncStatus.drive.folders.geospatial && (
                    <div className="drive-folder subfolder">
                      <a
                        href={syncStatus.drive.folders.geospatial.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="folder-link"
                      >
                        <span className="folder-icon">🗺️</span>
                        <span className="folder-name">Geospatial</span>
                        <span className="file-count">({syncStatus.drive.folders.geospatial.file_count} files)</span>
                      </a>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Connected Spreadsheet Info */}
      {syncStatus && syncStatus.spreadsheet && syncStatus.spreadsheet.configured && (
        <div className={`sync-spreadsheet-info ${syncStatus.spreadsheet_trashed || syncStatus.spreadsheet_deleted ? 'spreadsheet-problem' : ''}`}>
          <h4>Connected Spreadsheet</h4>
          <div className="spreadsheet-details">
            <div className="spreadsheet-field">
              <label>Sheet Name</label>
              <span>{syncStatus.spreadsheet.name}</span>
            </div>
            <div className="spreadsheet-field">
              <label>Spreadsheet ID</label>
              <code>{syncStatus.spreadsheet.id}</code>
            </div>
            <div className="spreadsheet-actions">
              <a
                href={syncStatus.spreadsheet.url}
                target="_blank"
                rel="noopener noreferrer"
                className="spreadsheet-link"
              >
                Open in Google Sheets
              </a>
              <button
                className="sync-btn-small disconnect-btn"
                onClick={handleDisconnectSpreadsheet}
                disabled={syncing}
              >
                Disconnect
              </button>
            </div>
          </div>

          {(syncStatus.spreadsheet_trashed || syncStatus.spreadsheet_deleted) && (
            <div className="spreadsheet-warning">
              <strong>
                {syncStatus.spreadsheet_trashed
                  ? 'This spreadsheet is in your Google Drive trash.'
                  : 'This spreadsheet has been permanently deleted.'}
              </strong>
              <p>
                {syncStatus.spreadsheet_trashed
                  ? 'You can restore it from trash or disconnect to create a new one.'
                  : 'Click Disconnect above to create a new spreadsheet.'}
              </p>
            </div>
          )}
        </div>
      )}

      {/* No Spreadsheet Configured */}
      {syncStatus && syncStatus.spreadsheet && !syncStatus.spreadsheet.configured && (
        <div className="sync-no-spreadsheet">
          <h4>No Spreadsheet Configured</h4>
          <p>Create a new spreadsheet or connect to an existing one.</p>

          <div className="sync-buttons">
            <button
              className="sync-btn create-btn"
              onClick={handleCreateSpreadsheet}
              disabled={syncing || !syncStatus.has_oauth_credentials}
            >
              {syncing ? 'Creating...' : 'Create New Spreadsheet'}
            </button>
            <button
              className="sync-btn connect-btn"
              onClick={() => setShowConnectForm(!showConnectForm)}
            >
              {showConnectForm ? 'Cancel' : 'Connect Existing'}
            </button>
          </div>

          {showConnectForm && (
            <div className="connect-form">
              <p className="connect-hint">
                Enter the spreadsheet ID from the URL.
              </p>
              <div className="connect-input-group">
                <input
                  type="text"
                  value={spreadsheetIdInput}
                  onChange={(e) => setSpreadsheetIdInput(e.target.value)}
                  placeholder="e.g., 1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms"
                  className="spreadsheet-id-input"
                />
                <button
                  className="sync-btn create-btn"
                  onClick={handleConnectSpreadsheet}
                  disabled={syncing || !spreadsheetIdInput.trim()}
                >
                  {syncing ? 'Connecting...' : 'Connect'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Danger Zone */}
      <div className="danger-zone">
        <h4>Danger Zone</h4>
        <p className="danger-warning">
          Destructive actions that cannot be undone.
        </p>
        <button
          className="sync-btn danger-btn"
          onClick={handleWipeDatabase}
          disabled={syncing}
        >
          {syncing ? 'Wiping...' : 'Wipe Local Database'}
        </button>
        <p className="danger-hint">
          Use "Pull All" to restore data after wiping.
        </p>
      </div>
    </div>
  );
}

export default SyncSettings;
