import React, { useState, useRef } from 'react';

function ImageUploader({ destinationId, hasImage, onImageChange, disabled, isLinearFeature }) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);
  const [dragActive, setDragActive] = useState(false);
  const [imageVersion, setImageVersion] = useState(Date.now()); // For cache busting
  const fileInputRef = useRef(null);

  // Compute API endpoint based on feature type
  const apiEndpoint = isLinearFeature ? 'linear-features' : 'destinations';

  // Use thumbnail service for faster preview loading (medium size for edit view)
  const imageUrl = hasImage ? `/api/pois/${destinationId}/thumbnail?size=medium&v=${imageVersion}` : null;

  const handleFileSelect = async (file) => {
    if (!file) return;

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!allowedTypes.includes(file.type)) {
      setError('Please select a JPEG, PNG, WebP, or GIF image');
      return;
    }

    // Validate file size (10MB max)
    if (file.size > 10 * 1024 * 1024) {
      setError('Image must be less than 10MB');
      return;
    }

    setUploading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('image', file);

      const response = await fetch(`/api/admin/${apiEndpoint}/${destinationId}/image`, {
        method: 'POST',
        credentials: 'include',
        body: formData
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Upload failed');
      }

      const result = await response.json();
      setImageVersion(Date.now()); // Bust cache for new image
      onImageChange(true, result.drive_file_id);
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Delete this image?')) return;

    setUploading(true);
    setError(null);

    try {
      const response = await fetch(`/api/admin/${apiEndpoint}/${destinationId}/image`, {
        method: 'DELETE',
        credentials: 'include'
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Delete failed');
      }

      onImageChange(false, null);
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  };

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelect(e.dataTransfer.files[0]);
    }
  };

  const handleInputChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      handleFileSelect(e.target.files[0]);
    }
  };

  const handleClick = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className="image-uploader">
      <label>Destination Image</label>

      {error && (
        <div className="image-upload-error">{error}</div>
      )}

      {imageUrl ? (
        <div className="image-preview-container">
          <img
            src={imageUrl}
            alt="Destination"
            className="image-preview"
            onError={(e) => {
              e.target.style.display = 'none';
              e.target.nextSibling.style.display = 'flex';
            }}
          />
          <div className="image-load-error" style={{ display: 'none' }}>
            Failed to load image
          </div>
          <div className="image-preview-actions">
            <button
              type="button"
              className="image-change-btn"
              onClick={handleClick}
              disabled={uploading || disabled}
            >
              Change
            </button>
            <button
              type="button"
              className="image-delete-btn"
              onClick={handleDelete}
              disabled={uploading || disabled}
            >
              Delete
            </button>
          </div>
        </div>
      ) : (
        <div
          className={`image-drop-zone ${dragActive ? 'drag-active' : ''} ${uploading ? 'uploading' : ''}`}
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
          onClick={!uploading && !disabled ? handleClick : undefined}
        >
          {uploading ? (
            <div className="upload-progress">
              <div className="upload-spinner"></div>
              <span>Uploading...</span>
            </div>
          ) : (
            <>
              <div className="drop-zone-icon">
                <svg viewBox="0 0 24 24" width="32" height="32" fill="currentColor">
                  <path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM14 13v4h-4v-4H7l5-5 5 5h-3z"/>
                </svg>
              </div>
              <p className="drop-zone-text">
                Drag & drop an image here<br/>
                or click to select
              </p>
              <p className="drop-zone-hint">
                JPEG, PNG, WebP, or GIF (max 10MB)
              </p>
            </>
          )}
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        onChange={handleInputChange}
        style={{ display: 'none' }}
        disabled={uploading || disabled}
      />
    </div>
  );
}

export default ImageUploader;
