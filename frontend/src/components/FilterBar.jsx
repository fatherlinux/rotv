import React from 'react';

function FilterBar({ filters, activeFilters, onFilterChange, onClear, resultCount }) {
  return (
    <div className="filter-bar">
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

      {(activeFilters.owner || activeFilters.era || activeFilters.pets || activeFilters.search) && (
        <button className="clear-filters" onClick={onClear}>
          Clear Filters
        </button>
      )}

      <span className="result-count">
        {resultCount} destination{resultCount !== 1 ? 's' : ''}
      </span>
    </div>
  );
}

export default FilterBar;
