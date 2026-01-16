import React, { useState } from 'react';

function FilterBar({ filters, activeFilters, onFilterChange, onClear, resultCount }) {
  const [isExpanded, setIsExpanded] = useState(false);

  const hasActiveFilters = activeFilters.owner || activeFilters.era || activeFilters.pets || activeFilters.search;

  return (
    <div className={`filter-bar ${isExpanded ? 'filter-bar-expanded' : ''}`}>
      {/* Mobile toggle */}
      <button
        className="filter-bar-mobile-toggle"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        {isExpanded ? 'Hide Search & Filters' : `Search & Filters ${hasActiveFilters ? '(active)' : ''}`}
        {' '}{resultCount} result{resultCount !== 1 ? 's' : ''}
      </button>

      <div className="filter-bar-content">
        <div className="filter-group">
          <label>Owner</label>
          <select
            value={activeFilters.owner || ''}
            onChange={(e) => onFilterChange('owner', e.target.value || null)}
          >
            <option value="">All Owners</option>
            {filters.owners.map(owner => (
              <option key={owner} value={owner}>{owner}</option>
            ))}
          </select>
        </div>

        <div className="filter-group">
          <label>Era</label>
          <select
            value={activeFilters.era || ''}
            onChange={(e) => onFilterChange('era', e.target.value || null)}
          >
            <option value="">All Eras</option>
            {filters.eras.map(era => (
              <option key={era} value={era}>{era}</option>
            ))}
          </select>
        </div>

        <div className="filter-group">
          <label>Pets</label>
          <select
            value={activeFilters.pets || ''}
            onChange={(e) => onFilterChange('pets', e.target.value || null)}
          >
            <option value="">Any</option>
            <option value="yes">Pet Friendly</option>
            <option value="no">No Pets</option>
          </select>
        </div>

        <input
          type="text"
          className="search-input"
          placeholder="Search destinations..."
          value={activeFilters.search}
          onChange={(e) => onFilterChange('search', e.target.value)}
        />

        {hasActiveFilters && (
          <button className="clear-filters" onClick={onClear}>
            Clear Filters
          </button>
        )}

        <span className="result-count">
          {resultCount} destination{resultCount !== 1 ? 's' : ''}
        </span>
      </div>
    </div>
  );
}

export default FilterBar;
