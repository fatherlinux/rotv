import React, { useState, useRef } from 'react';

function ImageUploader({ destinationId, hasImage, onImageChange, disabled, isLinearFeature, isVirtualPoi, updatedAt }) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef(null);

  // Compute API endpoint based on feature type
  const apiEndpoint = isLinearFeature ? 'linear-features' : 'destinations';

  // Use updated_at from parent for cache busting (or fallback to timestamp)
  const cacheParam = updatedAt || Date.now();

  // Use thumbnail service for faster preview loading (medium size for edit view)
  const imageUrl = hasImage ? `/api/pois/${destinationId}/thumbnail?size=medium&v=${cacheParam}` : null;

  // Debug logging
  console.log('[ImageUploader] Component render:', {
    destinationId,
    hasImage,
    updatedAt,
    cacheParam,
    imageUrl,
    uploading,
    disabled,
    error
  });

  const handleFileSelect = async (file) => {
    console.log('[ImageUploader] handleFileSelect called with file:', file?.name, file?.size, file?.type);
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

    console.log('[ImageUploader] Starting upload...');
    setUploading(true);
    setError(null);

    try {
      // Convert file to base64 to avoid Vite dev server FormData issues
      const base64Data = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
          try {
            const dataUrl = e.target.result;
            if (!dataUrl || typeof dataUrl !== 'string') {
              reject(new Error('Failed to read file data'));
              return;
            }
            const base64 = dataUrl.split(',')[1]; // Remove data:image/...;base64, prefix
            if (!base64) {
              reject(new Error('Failed to extract base64 data'));
              return;
            }
            resolve(base64);
          } catch (err) {
            reject(err);
          }
        };
        reader.onerror = (e) => {
          console.error('FileReader error:', reader.error);
          reject(reader.error || new Error('Failed to read file'));
        };

        // Read the file immediately
        try {
          reader.readAsDataURL(file);
        } catch (err) {
          reject(new Error(`Failed to start reading file: ${err.message}`));
        }
      });

      // Use base64 endpoint in dev, regular multipart endpoint in production
      const isDev = import.meta.env.DEV;
      const endpoint = isDev
        ? `/api/admin/${apiEndpoint}/${destinationId}/image-base64`
        : `/api/admin/${apiEndpoint}/${destinationId}/image`;

      const body = isDev
        ? JSON.stringify({ imageData: base64Data, mimeType: file.type })
        : (() => {
            const formData = new FormData();
            formData.append('image', file);
            return formData;
          })();

      const headers = isDev ? { 'Content-Type': 'application/json' } : {};

      const response = await fetch(endpoint, {
        method: 'POST',
        credentials: 'include',
        headers,
        body
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Upload failed');
      }

      const result = await response.json();
      console.log('[ImageUploader] Upload successful, result:', result);

      // Fetch the updated POI to get the new updated_at timestamp
      try {
        const poiResponse = await fetch(`/api/pois/${destinationId}`, {
          credentials: 'include'
        });
        if (poiResponse.ok) {
          const updatedPoi = await poiResponse.json();
          console.log('[ImageUploader] Image uploaded - new timestamp:', updatedPoi.updated_at);
          console.log('[ImageUploader] Calling onImageChange with:', { hasImage: true, driveFileId: result.drive_file_id, timestamp: updatedPoi.updated_at });
          onImageChange(true, result.drive_file_id, updatedPoi.updated_at);
        } else {
          console.error('[ImageUploader] Failed to fetch updated POI after image upload, status:', poiResponse.status);
          onImageChange(true, result.drive_file_id);
        }
      } catch (fetchError) {
        console.error('[ImageUploader] Error fetching updated POI:', fetchError);
        onImageChange(true, result.drive_file_id);
      }
    } catch (err) {
      console.error('Upload error:', err);
      setError(err.message);
    } finally {
      setUploading(false);
      // Reset file input to allow re-selecting the same file
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleDelete = async () => {
    console.log('[ImageUploader] handleDelete called');
    if (!confirm('Delete this image?')) {
      console.log('[ImageUploader] Delete cancelled by user');
      return;
    }

    console.log('[ImageUploader] Starting delete...');
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

      console.log('[ImageUploader] Delete successful');

      // Fetch the updated POI to get the new updated_at timestamp
      try {
        const poiResponse = await fetch(`/api/pois/${destinationId}`, {
          credentials: 'include'
        });
        if (poiResponse.ok) {
          const updatedPoi = await poiResponse.json();
          console.log('[ImageUploader] Calling onImageChange after delete with timestamp:', updatedPoi.updated_at);
          onImageChange(false, null, updatedPoi.updated_at);
        } else {
          console.error('[ImageUploader] Failed to fetch updated POI after image delete');
          onImageChange(false, null);
        }
      } catch (fetchError) {
        console.error('[ImageUploader] Error fetching updated POI:', fetchError);
        onImageChange(false, null);
      }
    } catch (err) {
      console.error('[ImageUploader] Delete error:', err);
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
      const file = e.target.files[0];
      console.log('File selected:', file.name, file.size, file.type);
      handleFileSelect(file);
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
        <div className={`image-preview-container ${isVirtualPoi ? 'virtual-thumbnail' : ''}`}>
          <img
            src={imageUrl}
            alt="Destination"
            className={`image-preview ${isVirtualPoi ? 'logo-image' : ''}`}
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
              onClick={() => {
                console.log('[ImageUploader] Change button clicked');
                handleClick();
              }}
              disabled={uploading || disabled}
            >
              Change
            </button>
            <button
              type="button"
              className="image-delete-btn"
              onClick={() => {
                console.log('[ImageUploader] Delete button clicked');
                handleDelete();
              }}
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
