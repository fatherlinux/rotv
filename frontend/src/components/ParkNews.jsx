import React, { useState, useEffect } from 'react';
import MapThumbnail from './MapThumbnail';

function formatDate(dateString) {
  if (!dateString) return '';
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
}

function NewsTypeIcon({ type }) {
  const icons = {
    closure: 'X',
    seasonal: 'S',
    maintenance: 'W',
    wildlife: 'A',
    general: 'N'
  };
  return <span className={`news-type-icon ${type || 'general'}`}>{icons[type] || 'N'}</span>;
}

function ParkNews({ isAdmin, onSelectPoi, filteredDestinations, filteredLinearFeatures, mapState, onMapClick, refreshTrigger }) {
  const [news, setNews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [deleting, setDeleting] = useState(null);

  useEffect(() => {
    fetchNews();
  }, [refreshTrigger]);

  const fetchNews = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/news/recent?limit=50');
      if (response.ok) {
        const data = await response.json();
        setNews(data);
      } else {
        setError('Failed to load news');
      }
    } catch (err) {
      setError('Failed to load news');
      console.error('Error fetching park news:', err);
    } finally {
      setLoading(false);
    }
  };

  // Filter news based on visible POIs (both point destinations and linear features)
  const filteredNews = React.useMemo(() => {
    const hasDestinations = Array.isArray(filteredDestinations);
    const hasLinearFeatures = Array.isArray(filteredLinearFeatures);

    // If both filters are explicitly empty arrays, show no news (all filters deselected)
    if (hasDestinations && filteredDestinations.length === 0 &&
        hasLinearFeatures && filteredLinearFeatures.length === 0) {
      return [];
    }

    // If no filters applied yet, show all news
    if (!filteredDestinations && !filteredLinearFeatures) {
      return news;
    }

    // Combine visible IDs from both point destinations and linear features
    const visiblePoiIds = new Set([
      ...(filteredDestinations || []).map(d => d.id),
      ...(filteredLinearFeatures || []).map(f => f.id)
    ]);

    return news.filter(item => visiblePoiIds.has(item.poi_id));
  }, [news, filteredDestinations, filteredLinearFeatures]);

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
      } else {
        alert('Failed to delete news item');
      }
    } catch (err) {
      console.error('Error deleting news:', err);
      alert('Failed to delete news item');
    } finally {
      setDeleting(null);
    }
  };

  if (loading) {
    return (
      <div className="park-news-tab">
        <h2>Park News</h2>
        <div className="loading-indicator">Loading news...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="park-news-tab">
        <h2>Park News</h2>
        <div className="error-message">{error}</div>
      </div>
    );
  }

  if (filteredNews.length === 0) {
    return (
      <div className="park-news-tab">
        <div className="news-events-header">
          <h2>Park News</h2>
          <p className="tab-subtitle">Recent news from across Cuyahoga Valley National Park</p>
        </div>
        <div className="news-events-layout">
          <div className="news-events-content">
            <p className="no-content">
              {news.length > 0
                ? 'No news for the visible POIs. Adjust the map to see more.'
                : 'No recent news available.'}
            </p>
          </div>
          {/* Map thumbnail sidebar */}
          {mapState && (
            <div className="map-thumbnail-sidebar">
              <MapThumbnail
                bounds={mapState.bounds}
                aspectRatio={mapState.aspectRatio || 1.5}
                visibleDestinations={filteredDestinations}
                onClick={onMapClick}
                poiCount={(filteredDestinations?.length || 0) + (filteredLinearFeatures?.length || 0)}
              />
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="park-news-tab">
      <div className="news-events-header">
        <h2>Park News</h2>
        <p className="tab-subtitle">Recent news from across Cuyahoga Valley National Park</p>
      </div>
      <div className="news-events-layout">
        <div className="news-events-content">
          <div className="park-news-list">
        {filteredNews.map(item => (
          <div key={item.id} className={`park-news-item ${item.news_type || 'general'}`}>
            <div className="park-news-header">
              <NewsTypeIcon type={item.news_type} />
              <div className="park-news-title-section">
                <span className="park-news-title">{item.title}</span>
                <button
                  className="park-news-poi-link"
                  onClick={() => onSelectPoi && onSelectPoi(item.poi_id)}
                  title={`View ${item.poi_name}`}
                >
                  {item.poi_name}
                </button>
              </div>
              {isAdmin && (
                <button
                  className="news-delete-btn"
                  onClick={() => handleDelete(item.id)}
                  disabled={deleting === item.id}
                  title="Delete this news item"
                >
                  {deleting === item.id ? '...' : '×'}
                </button>
              )}
            </div>
            {item.summary && <p className="park-news-summary">{item.summary}</p>}
            <div className="park-news-meta">
              {item.source_name && <span className="news-source">{item.source_name}</span>}
              {item.published_at && <span className="news-date">{formatDate(item.published_at)}</span>}
              {item.source_url && (
                <a
                  href={item.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="news-link"
                >
                  Read more
                </a>
              )}
            </div>
          </div>
        ))}
          </div>
        </div>
        {/* Map thumbnail sidebar */}
        {mapState && (
          <div className="map-thumbnail-sidebar">
            <MapThumbnail
              bounds={mapState.bounds}
              aspectRatio={mapState.aspectRatio || 1.5}
              visibleDestinations={filteredDestinations}
              onClick={onMapClick}
              poiCount={(filteredDestinations?.length || 0) + (filteredLinearFeatures?.length || 0)}
            />
            <div className="event-legend">
              <div className="event-legend-title">News Types</div>
              <div className="event-legend-items">
                <span className="event-legend-item"><span className="news-type-icon closure">X</span> Closure</span>
                <span className="event-legend-item"><span className="news-type-icon seasonal">S</span> Seasonal</span>
                <span className="event-legend-item"><span className="news-type-icon maintenance">W</span> Maintenance</span>
                <span className="event-legend-item"><span className="news-type-icon wildlife">A</span> Wildlife</span>
                <span className="event-legend-item"><span className="news-type-icon general">N</span> General</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default ParkNews;
