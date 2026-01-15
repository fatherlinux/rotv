import React, { useState, useEffect, useCallback } from 'react';

function SyncSettings() {
  const [syncStatus, setSyncStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState(null);
  const [message, setMessage] = useState(null);
  const [spreadsheetIdInput, setSpreadsheetIdInput] = useState('');
  const [showConnectForm, setShowConnectForm] = useState(false);

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
    // Refresh status every 30 seconds
    const interval = setInterval(fetchStatus, 30000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  const handlePush = async () => {
    if (!confirm('This will replace ALL data in Google Drive (spreadsheet + files) with the current database contents. Continue?')) {
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
    if (!confirm('This will replace ALL data in the database with Google Drive contents (spreadsheet + files). Any local changes will be lost. Continue?')) {
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

  const handleProcessQueue = async () => {
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
        setError(result.error || 'Processing failed');
      }
    } catch (err) {
      setError('Failed to process sync queue');
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
    // Double confirmation for destructive action
    const firstConfirm = confirm(
      'WARNING: This will permanently delete ALL destinations from the local database.\n\n' +
      'This action cannot be undone!\n\n' +
      'Are you sure you want to continue?'
    );

    if (!firstConfirm) return;

    const secondConfirm = confirm(
      'FINAL WARNING: You are about to delete all local data.\n\n' +
      'Type OK to confirm you want to wipe the database.'
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
        // Reload the page to refresh destinations
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

  if (loading) {
    return (
      <div className="sync-settings">
        <h3>Google Drive Integration</h3>
        <p>Loading sync status...</p>
      </div>
    );
  }

  return (
    <div className="sync-settings">
      <h3>Google Drive Integration</h3>
      <p className="sync-description">
        Synchronize POI data between the local database and Google Drive.
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

          {/* Trashed/Deleted Warning */}
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

      {/* No Spreadsheet Configured - Show Create/Connect Options */}
      {syncStatus && syncStatus.spreadsheet && !syncStatus.spreadsheet.configured && (
        <div className="sync-no-spreadsheet">
          <h4>No Spreadsheet Configured</h4>
          <p>
            Create a new spreadsheet or connect to an existing one.
          </p>

          <div className="sync-buttons">
            <button
              className="sync-btn connect-btn"
              onClick={() => setShowConnectForm(!showConnectForm)}
            >
              {showConnectForm ? 'Cancel' : 'Connect Existing Spreadsheet'}
            </button>
            <button
              className="sync-btn create-btn"
              onClick={handleCreateSpreadsheet}
              disabled={syncing || !syncStatus.has_oauth_credentials}
            >
              {syncing ? 'Creating...' : 'Create New Spreadsheet'}
            </button>
          </div>

          {showConnectForm && (
            <div className="connect-form">
              <p className="connect-hint">
                Enter the spreadsheet ID from the URL. Only works for spreadsheets created by this app
                (due to <code>drive.file</code> scope limitations).
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

      {syncStatus && (
        <div className="sync-status-grid">
          <div className="sync-status-item">
            <label>Last Sync</label>
            <span>{formatDate(syncStatus.last_sync)}</span>
          </div>
          <div className="sync-status-item">
            <label>Last Push</label>
            <span>{formatDate(syncStatus.last_push)}</span>
          </div>
          <div className="sync-status-item">
            <label>Last Pull</label>
            <span>{formatDate(syncStatus.last_pull)}</span>
          </div>
          <div className="sync-status-item">
            <label>Pending Operations</label>
            <span className={syncStatus.pending_operations > 0 ? 'pending-highlight' : ''}>
              {syncStatus.pending_operations}
            </span>
          </div>
          <div className="sync-status-item">
            <label>Unsynced POIs</label>
            <span className={syncStatus.unsynced_destinations > 0 ? 'pending-highlight' : ''}>
              {syncStatus.unsynced_destinations}
            </span>
          </div>
        </div>
      )}

      {/* Sync Queue Details */}
      {syncStatus && syncStatus.sync_queue && syncStatus.sync_queue.length > 0 && (
        <div className="sync-queue-details">
          <h4>Pending Sync Queue</h4>
          <p className="queue-description">
            These changes are waiting to be synced to Google Drive. Click "Process Queue" to sync them.
          </p>
          <div className="sync-queue-list">
            <div className="queue-item queue-header">
              <span className="queue-operation">Operation</span>
              <span className="queue-item-name">POI Name</span>
              <span className="queue-table">Table</span>
              <span className="queue-time">Queued At</span>
            </div>
            {syncStatus.sync_queue.map((item) => (
              <div key={item.id} className={`queue-item queue-${item.operation.toLowerCase()}`}>
                <span className="queue-operation">{item.operation}</span>
                <span className="queue-item-name">{item.item_name || `ID: ${item.record_id}`}</span>
                <span className="queue-table">{item.table_name}</span>
                <span className="queue-time">{formatDate(item.created_at)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Only show sync actions when a spreadsheet is configured */}
      {syncStatus?.spreadsheet?.configured && (
        <div className="sync-actions">
          <div className="sync-action-group">
            <h4>Sync Changes</h4>
            <p className="action-hint">Push pending changes to Google Drive</p>
            <div className="sync-buttons">
              <button
                className="sync-btn process-btn"
                onClick={handleProcessQueue}
                disabled={syncing || (syncStatus && syncStatus.pending_operations === 0)}
              >
                {syncing ? 'Processing...' : `Process Queue (${syncStatus?.pending_operations || 0})`}
              </button>
              <button
                className="sync-btn clear-btn"
                onClick={handleClearQueue}
                disabled={syncing || (syncStatus && syncStatus.pending_operations === 0)}
              >
                Clear Queue
              </button>
            </div>
          </div>

          <div className="sync-action-group">
            <h4>Full Sync</h4>
            <p className="action-hint">Replace all data in one direction. This will synchronize the spreadsheet and all files.</p>
            <div className="sync-buttons">
              <button
                className="sync-btn push-btn"
                onClick={handlePush}
                disabled={syncing}
              >
                {syncing ? 'Syncing...' : 'Push to Google Drive'}
              </button>
              <button
                className="sync-btn pull-btn"
                onClick={handlePull}
                disabled={syncing}
              >
                {syncing ? 'Syncing...' : 'Pull from Google Drive'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Danger Zone */}
      <div className="danger-zone">
        <h4>Danger Zone</h4>
        <p className="danger-warning">
          These actions are destructive and cannot be undone.
        </p>
        <div className="sync-buttons">
          <button
            className="sync-btn danger-btn"
            onClick={handleWipeDatabase}
            disabled={syncing}
          >
            {syncing ? 'Wiping...' : 'Wipe Local Database'}
          </button>
        </div>
        <p className="danger-hint">
          This will delete all POIs from the local PostgreSQL database.
          Use "Pull from Google Drive" to restore data after wiping.
        </p>
      </div>
    </div>
  );
}

export default SyncSettings;
