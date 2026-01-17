import React, { useState, useEffect } from 'react';

function formatDate(dateString) {
  if (!dateString) return 'N/A';
  return new Date(dateString).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });
}

function formatDuration(ms) {
  if (!ms) return 'N/A';
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  }
  return `${seconds}s`;
}

function NewsSettings() {
  const [jobStatus, setJobStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [collecting, setCollecting] = useState(false);
  const [cleaningUp, setCleaningUp] = useState(false);
  const [result, setResult] = useState(null);
  const [liveProgress, setLiveProgress] = useState(null);
  const [activeJobId, setActiveJobId] = useState(null);

  useEffect(() => {
    fetchJobStatus();
    // Check for running jobs on mount
    checkForRunningJob();
  }, []);

  // Poll for active job status
  useEffect(() => {
    if (!activeJobId) return;

    const pollInterval = setInterval(async () => {
      try {
        const response = await fetch(`/api/admin/news/job/${activeJobId}`, {
          credentials: 'include'
        });
        if (response.ok) {
          const status = await response.json();
          setLiveProgress(status);

          if (status.status === 'completed') {
            clearInterval(pollInterval);
            setCollecting(false);
            setActiveJobId(null);
            setResult({
              type: 'success',
              message: `Completed! Found ${status.news_found} news and ${status.events_found} events from ${status.pois_processed} POIs`
            });
            setLiveProgress(null);
            fetchJobStatus(); // Refresh the last job display
          } else if (status.status === 'failed') {
            clearInterval(pollInterval);
            setCollecting(false);
            setActiveJobId(null);
            setResult({
              type: 'error',
              message: status.error_message || 'Job failed'
            });
            setLiveProgress(null);
            fetchJobStatus();
          }
        }
      } catch (err) {
        console.error('Error polling job status:', err);
      }
    }, 2000); // Poll every 2 seconds

    return () => clearInterval(pollInterval);
  }, [activeJobId]);

  const fetchJobStatus = async () => {
    try {
      const response = await fetch('/api/admin/news/status', {
        credentials: 'include'
      });
      if (response.ok) {
        const data = await response.json();
        setJobStatus(data);
      }
    } catch (err) {
      console.error('Error fetching job status:', err);
    } finally {
      setLoading(false);
    }
  };

  const checkForRunningJob = async () => {
    try {
      const response = await fetch('/api/admin/news/status', {
        credentials: 'include'
      });
      if (response.ok) {
        const data = await response.json();
        if (data.status === 'running') {
          // There's a running job - start polling
          setActiveJobId(data.id);
          setCollecting(true);
          setLiveProgress(data);
        }
      }
    } catch (err) {
      console.error('Error checking for running job:', err);
    }
  };

  const handleCollectNews = async () => {
    setCollecting(true);
    setResult(null);
    setLiveProgress({ status: 'starting', pois_processed: 0, news_found: 0, events_found: 0 });

    try {
      const response = await fetch('/api/admin/news/collect', {
        method: 'POST',
        credentials: 'include'
      });

      if (response.ok) {
        const data = await response.json();
        setActiveJobId(data.jobId);
        setLiveProgress({
          status: 'running',
          total_pois: data.totalPois,
          pois_processed: 0,
          news_found: 0,
          events_found: 0
        });
      } else {
        const error = await response.json();
        setResult({
          type: 'error',
          message: error.error || 'Failed to start news collection'
        });
        setCollecting(false);
        setLiveProgress(null);
      }
    } catch (err) {
      setResult({
        type: 'error',
        message: err.message
      });
      setCollecting(false);
      setLiveProgress(null);
    }
  };

  const handleCleanup = async () => {
    if (!confirm('Delete old news (>90 days) and past events (>30 days)?')) {
      return;
    }

    setCleaningUp(true);
    setResult(null);

    try {
      const response = await fetch('/api/admin/news/cleanup', {
        method: 'POST',
        credentials: 'include'
      });

      if (response.ok) {
        const data = await response.json();
        setResult({
          type: 'success',
          message: `Cleaned up ${data.newsDeleted} old news items and ${data.eventsDeleted} past events`
        });
      } else {
        const error = await response.json();
        setResult({
          type: 'error',
          message: error.error || 'Cleanup failed'
        });
      }
    } catch (err) {
      setResult({
        type: 'error',
        message: err.message
      });
    } finally {
      setCleaningUp(false);
    }
  };

  return (
    <div className="news-settings">
      <h3>News & Events Collection</h3>
      <p className="settings-description">
        News and events are collected automatically each day at 6 AM Eastern time using AI-powered web search.
        You can also trigger collection manually below.
      </p>

      {/* Live Progress (shown when job is running) */}
      {liveProgress && (
        <div className="news-status-section live-progress">
          <h4>Live Progress</h4>
          <div className="job-status-card running">
            <div className="progress-bar-container">
              <div
                className="progress-bar"
                style={{
                  width: liveProgress.total_pois > 0
                    ? `${(liveProgress.pois_processed / liveProgress.total_pois) * 100}%`
                    : '0%'
                }}
              />
            </div>
            <div className="progress-stats">
              <div className="progress-stat">
                <span className="stat-label">POIs:</span>
                <span className="stat-value">
                  {liveProgress.pois_processed}
                  {liveProgress.total_pois > 0 && ` / ${liveProgress.total_pois}`}
                </span>
              </div>
              <div className="progress-stat">
                <span className="stat-label">News Found:</span>
                <span className="stat-value">{liveProgress.news_found || 0}</span>
              </div>
              <div className="progress-stat">
                <span className="stat-label">Events Found:</span>
                <span className="stat-value">{liveProgress.events_found || 0}</span>
              </div>
            </div>
            <p className="progress-hint">
              Processing {liveProgress.total_pois > 0 ? liveProgress.total_pois : 'all'} POIs in parallel (15 at a time)...
            </p>
          </div>
        </div>
      )}

      {/* Last Job Status */}
      <div className="news-status-section">
        <h4>Last Collection Job</h4>
        {loading ? (
          <p>Loading status...</p>
        ) : jobStatus ? (
          <div className="job-status-card">
            <div className="status-row">
              <span className="status-label">Status:</span>
              <span className={`status-value status-${jobStatus.status}`}>
                {jobStatus.status}
              </span>
            </div>
            <div className="status-row">
              <span className="status-label">Type:</span>
              <span className="status-value">{jobStatus.job_type || 'manual'}</span>
            </div>
            <div className="status-row">
              <span className="status-label">Started:</span>
              <span className="status-value">{formatDate(jobStatus.started_at)}</span>
            </div>
            {jobStatus.completed_at && (
              <div className="status-row">
                <span className="status-label">Completed:</span>
                <span className="status-value">{formatDate(jobStatus.completed_at)}</span>
              </div>
            )}
            <div className="status-row">
              <span className="status-label">POIs Processed:</span>
              <span className="status-value">
                {jobStatus.pois_processed || 0}
                {jobStatus.total_pois > 0 && ` / ${jobStatus.total_pois}`}
              </span>
            </div>
            <div className="status-row">
              <span className="status-label">News Found:</span>
              <span className="status-value">{jobStatus.news_found || 0}</span>
            </div>
            <div className="status-row">
              <span className="status-label">Events Found:</span>
              <span className="status-value">{jobStatus.events_found || 0}</span>
            </div>
            {jobStatus.error_message && (
              <div className="status-row error">
                <span className="status-label">Error:</span>
                <span className="status-value">{jobStatus.error_message}</span>
              </div>
            )}
          </div>
        ) : (
          <p className="no-status">No collection jobs have run yet.</p>
        )}
      </div>

      {/* Actions */}
      <div className="news-actions-section">
        <h4>Actions</h4>

        <div className="action-card">
          <div className="action-info">
            <strong>Collect News & Events</strong>
            <p>Search for recent news and upcoming events for all POIs using AI-powered web search.</p>
          </div>
          <button
            className="action-btn primary"
            onClick={handleCollectNews}
            disabled={collecting || cleaningUp}
          >
            {collecting ? 'Collecting...' : 'Start Collection'}
          </button>
        </div>

        <div className="action-card">
          <div className="action-info">
            <strong>Cleanup Old Data</strong>
            <p>Remove news older than 90 days and events that have already passed (more than 30 days ago).</p>
          </div>
          <button
            className="action-btn secondary"
            onClick={handleCleanup}
            disabled={collecting || cleaningUp}
          >
            {cleaningUp ? 'Cleaning...' : 'Run Cleanup'}
          </button>
        </div>
      </div>

      {/* Result message */}
      {result && (
        <div className={`news-result ${result.type}`}>
          {result.message}
        </div>
      )}

      {/* Schedule Info */}
      <div className="news-schedule-section">
        <h4>Automatic Schedule</h4>
        <p>
          News collection runs automatically every day at <strong>6:00 AM Eastern Time</strong>.
          The job processes up to 50 POIs per run and uses Google Search grounding for accurate, current information.
        </p>
      </div>
    </div>
  );
}

export default NewsSettings;
