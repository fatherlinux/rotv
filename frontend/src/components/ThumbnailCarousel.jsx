import React, { useRef, useEffect } from 'react';

// Thumbnail carousel for mobile POI navigation
function ThumbnailCarousel({ pois, currentIndex, onNavigate }) {
  const carouselRef = useRef(null);
  const selectedRef = useRef(null);

  // Auto-scroll to keep selected thumbnail visible
  useEffect(() => {
    if (selectedRef.current && carouselRef.current) {
      selectedRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
        inline: 'center'
      });
    }
  }, [currentIndex]);

  const handleThumbnailClick = (index) => {
    if (index === currentIndex) return;
    const direction = index > currentIndex ? 'next' : 'prev';
    const steps = Math.abs(index - currentIndex);

    // Navigate multiple times if needed
    for (let i = 0; i < steps; i++) {
      setTimeout(() => onNavigate(direction), i * 100);
    }
  };

  // Get thumbnail image URL or default icon
  const getThumbnailUrl = (poi) => {
    if (poi.image_mime_type) {
      return `/api/pois/${poi.id}/thumbnail?size=small&v=${poi.updated_at || Date.now()}`;
    }

    // Default icons based on type
    if (poi._isVirtual) return '/icons/thumbnails/virtual.svg';
    if (poi._isLinear) {
      if (poi.feature_type === 'river') return '/icons/thumbnails/river.svg';
      if (poi.feature_type === 'boundary') return '/icons/thumbnails/boundary.svg';
      return '/icons/thumbnails/trail.svg';
    }
    return '/icons/thumbnails/destination.svg';
  };

  // Get type badge letter
  const getTypeBadge = (poi) => {
    if (poi._isVirtual) return 'O';
    if (!poi._isLinear) return 'D';
    if (poi.feature_type === 'river') return 'R';
    if (poi.feature_type === 'boundary') return 'B';
    return 'T';
  };

  // Get type class for styling
  const getTypeClass = (poi) => {
    if (poi._isVirtual) return 'virtual';
    if (!poi._isLinear) return 'destination';
    if (poi.feature_type === 'river') return 'river';
    if (poi.feature_type === 'boundary') return 'boundary';
    return 'trail';
  };

  return (
    <div className="thumbnail-carousel-wrapper">
      <div className="thumbnail-carousel" ref={carouselRef}>
        {pois.map((poi, index) => {
          const isSelected = index === currentIndex;
          const typeClass = getTypeClass(poi);

          return (
            <div
              key={`${poi._isLinear ? 'linear' : poi._isVirtual ? 'virtual' : 'point'}-${poi.id}`}
              ref={isSelected ? selectedRef : null}
              className={`thumbnail-item ${isSelected ? 'selected' : ''} ${typeClass}`}
              onClick={() => handleThumbnailClick(index)}
              role="button"
              tabIndex={0}
              aria-label={`Navigate to ${poi.name}`}
            >
              <div className="thumbnail-image">
                <img src={getThumbnailUrl(poi)} alt={poi.name} loading="lazy" />
                {isSelected && <div className="selected-indicator" />}
              </div>
              <div className={`thumbnail-type-badge ${typeClass}`}>
                {getTypeBadge(poi)}
              </div>
            </div>
          );
        })}
      </div>
      <div className="thumbnail-carousel-count">
        {currentIndex + 1} of {pois.length}
      </div>
    </div>
  );
}

export default ThumbnailCarousel;
