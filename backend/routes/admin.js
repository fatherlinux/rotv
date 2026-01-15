import express from 'express';
import multer from 'multer';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { isAdmin } from '../middleware/auth.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
import {
  createSheetsService,
  createDriveService,
  createSheetsServiceWithRefresh,
  createDriveServiceWithRefresh,
  isFileTrashed,
  getSyncStatus,
  pushAllToSheets,
  pullAllFromSheets,
  processSyncQueue,
  queueSyncOperation,
  createAppSpreadsheet,
  getSpreadsheetId,
  getSpreadsheetInfo,
  pushActivitiesToSheets,
  pullActivitiesFromSheets,
  pushErasToSheets,
  pullErasFromSheets,
  pushSurfacesToSheets,
  pullSurfacesFromSheets,
  pushIconsToSheets,
  pullIconsFromSheets,
  pushIntegrationToSheets,
  pullIntegrationFromSheets,
  pushLinearFeaturesToSheets,
  pullLinearFeaturesFromSheets,
  SHEET_NAME
} from '../services/sheetsSync.js';
import {
  ensureDriveFolders,
  uploadIconToDrive,
  uploadImageToDrive,
  downloadFileFromDrive,
  deleteFileFromDrive,
  getDriveFolderLink,
  getDriveImageUrl,
  countDriveFiles,
  getAllDriveSettings
} from '../services/driveImageService.js';

const router = express.Router();

export function createAdminRouter(pool) {
  // Helper to queue sync operation after a change
  async function queuePOISync(operation, recordId, data) {
    try {
      await queueSyncOperation(pool, operation, 'pois', recordId, data);
    } catch (error) {
      console.error('Failed to queue sync operation:', error.message);
    }
  }

  // Update POI coordinates (for point type POIs)
  router.put('/pois/:id/coordinates', isAdmin, async (req, res) => {
    const { id } = req.params;
    const { latitude, longitude } = req.body;

    if (latitude === undefined || longitude === undefined) {
      return res.status(400).json({ error: 'Latitude and longitude are required' });
    }

    const lat = parseFloat(latitude);
    const lng = parseFloat(longitude);

    if (isNaN(lat) || isNaN(lng)) {
      return res.status(400).json({ error: 'Invalid coordinate values' });
    }

    if (lat < 40.5 || lat > 42.0 || lng < -82.5 || lng > -80.5) {
      return res.status(400).json({ error: 'Coordinates outside valid range for Cuyahoga Valley area' });
    }

    try {
      const result = await pool.query(
        `UPDATE pois
         SET latitude = $1, longitude = $2, updated_at = CURRENT_TIMESTAMP, locally_modified = TRUE, synced = FALSE
         WHERE id = $3
         RETURNING *`,
        [lat, lng, id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'POI not found' });
      }

      await queuePOISync('UPDATE', id, result.rows[0]);
      console.log(`Admin ${req.user.email} updated coordinates for POI ${id}: ${lat}, ${lng}`);
      res.json(result.rows[0]);
    } catch (error) {
      console.error('Error updating coordinates:', error);
      res.status(500).json({ error: 'Failed to update coordinates' });
    }
  });

  // Legacy endpoint - redirect to unified POI endpoint
  router.put('/destinations/:id/coordinates', isAdmin, async (req, res) => {
    const { id } = req.params;
    const { latitude, longitude } = req.body;

    if (latitude === undefined || longitude === undefined) {
      return res.status(400).json({ error: 'Latitude and longitude are required' });
    }

    const lat = parseFloat(latitude);
    const lng = parseFloat(longitude);

    if (isNaN(lat) || isNaN(lng)) {
      return res.status(400).json({ error: 'Invalid coordinate values' });
    }

    if (lat < 40.5 || lat > 42.0 || lng < -82.5 || lng > -80.5) {
      return res.status(400).json({ error: 'Coordinates outside valid range for Cuyahoga Valley area' });
    }

    try {
      const result = await pool.query(
        `UPDATE pois
         SET latitude = $1, longitude = $2, updated_at = CURRENT_TIMESTAMP, locally_modified = TRUE, synced = FALSE
         WHERE id = $3
         RETURNING *`,
        [lat, lng, id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Destination not found' });
      }

      await queuePOISync('UPDATE', id, result.rows[0]);
      console.log(`Admin ${req.user.email} updated coordinates for destination ${id}: ${lat}, ${lng}`);
      res.json(result.rows[0]);
    } catch (error) {
      console.error('Error updating coordinates:', error);
      res.status(500).json({ error: 'Failed to update coordinates' });
    }
  });

  // Update POI (all editable fields) - unified endpoint
  router.put('/pois/:id', isAdmin, async (req, res) => {
    const { id } = req.params;
    const allowedFields = [
      'name', 'poi_type', 'latitude', 'longitude', 'geometry', 'geometry_drive_file_id',
      'property_owner', 'brief_description', 'era', 'historical_description',
      'primary_activities', 'surface', 'pets', 'cell_signal', 'more_info_link',
      'length_miles', 'difficulty'
    ];
    const updates = {};
    const values = [];
    let paramIndex = 1;

    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        updates[field] = `$${paramIndex}`;
        // Handle geometry as JSON
        if (field === 'geometry' && typeof req.body[field] === 'object') {
          values.push(JSON.stringify(req.body[field]));
        } else {
          values.push(req.body[field]);
        }
        paramIndex++;
      }
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    const setClause = Object.entries(updates)
      .map(([field, param]) => `${field} = ${param}`)
      .join(', ');

    values.push(id);

    try {
      const result = await pool.query(
        `UPDATE pois
         SET ${setClause}, updated_at = CURRENT_TIMESTAMP, locally_modified = TRUE, synced = FALSE
         WHERE id = $${paramIndex}
         RETURNING *`,
        values
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'POI not found' });
      }

      await queuePOISync('UPDATE', id, result.rows[0]);
      console.log(`Admin ${req.user.email} updated POI ${id}:`, Object.keys(updates).join(', '));
      res.json(result.rows[0]);
    } catch (error) {
      console.error('Error updating POI:', error);
      res.status(500).json({ error: 'Failed to update POI' });
    }
  });

  // Legacy: Update destination (redirect to pois)
  router.put('/destinations/:id', isAdmin, async (req, res) => {
    const { id } = req.params;
    const allowedFields = [
      'name', 'latitude', 'longitude', 'property_owner', 'brief_description',
      'era', 'historical_description', 'primary_activities', 'surface',
      'pets', 'cell_signal', 'more_info_link'
    ];
    const updates = {};
    const values = [];
    let paramIndex = 1;

    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        updates[field] = `$${paramIndex}`;
        values.push(req.body[field]);
        paramIndex++;
      }
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    const setClause = Object.entries(updates)
      .map(([field, param]) => `${field} = ${param}`)
      .join(', ');

    values.push(id);

    try {
      const result = await pool.query(
        `UPDATE pois
         SET ${setClause}, updated_at = CURRENT_TIMESTAMP, locally_modified = TRUE, synced = FALSE
         WHERE id = $${paramIndex}
         RETURNING *`,
        values
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Destination not found' });
      }

      await queuePOISync('UPDATE', id, result.rows[0]);
      console.log(`Admin ${req.user.email} updated destination ${id}:`, Object.keys(updates).join(', '));
      res.json(result.rows[0]);
    } catch (error) {
      console.error('Error updating destination:', error);
      res.status(500).json({ error: 'Failed to update destination' });
    }
  });

  // Create new destination
  router.post('/destinations', isAdmin, async (req, res) => {
    const { name, latitude, longitude } = req.body;

    // Validate required fields
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Name is required' });
    }

    if (latitude === undefined || longitude === undefined) {
      return res.status(400).json({ error: 'Latitude and longitude are required' });
    }

    const lat = parseFloat(latitude);
    const lng = parseFloat(longitude);

    if (isNaN(lat) || isNaN(lng)) {
      return res.status(400).json({ error: 'Invalid coordinate values' });
    }

    if (lat < 40.5 || lat > 42.0 || lng < -82.5 || lng > -80.5) {
      return res.status(400).json({ error: 'Coordinates outside valid range for Cuyahoga Valley area' });
    }

    const allowedFields = [
      'property_owner', 'brief_description', 'era', 'historical_description',
      'primary_activities', 'surface', 'pets', 'cell_signal', 'more_info_link'
    ];

    const fields = ['name', 'latitude', 'longitude'];
    const values = [name.trim(), lat, lng];
    let paramIndex = 4;

    for (const field of allowedFields) {
      if (req.body[field] !== undefined && req.body[field] !== null && req.body[field] !== '') {
        fields.push(field);
        values.push(req.body[field]);
        paramIndex++;
      }
    }

    const placeholders = values.map((_, i) => `$${i + 1}`).join(', ');

    try {
      const result = await pool.query(
        `INSERT INTO pois (${fields.join(', ')}, created_at, updated_at, locally_modified, synced)
         VALUES (${placeholders}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, TRUE, FALSE)
         RETURNING *`,
        values
      );

      // Queue sync operation
      await queuePOISync('INSERT', result.rows[0].id, result.rows[0]);

      console.log(`Admin ${req.user.email} created new destination: ${name}`);
      res.status(201).json(result.rows[0]);
    } catch (error) {
      console.error('Error creating destination:', error);
      res.status(500).json({ error: 'Failed to create destination' });
    }
  });

  // Delete destination (soft delete - marks as deleted so it won't come back from Google Sheets sync)
  router.delete('/destinations/:id', isAdmin, async (req, res) => {
    const { id } = req.params;

    try {
      const result = await pool.query(
        `UPDATE pois
         SET deleted = TRUE, locally_modified = TRUE, synced = FALSE, updated_at = CURRENT_TIMESTAMP
         WHERE id = $1
         RETURNING id, name`,
        [id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Destination not found' });
      }

      // Queue sync operation (delete from sheet)
      await queuePOISync('DELETE', id, { name: result.rows[0].name });

      console.log(`Admin ${req.user.email} deleted destination ${id}: ${result.rows[0].name}`);
      res.json({ success: true, deleted: result.rows[0] });
    } catch (error) {
      console.error('Error deleting destination:', error);
      res.status(500).json({ error: 'Failed to delete destination' });
    }
  });

  // Get admin settings
  router.get('/settings', isAdmin, async (req, res) => {
    try {
      const result = await pool.query('SELECT key, value, updated_at FROM admin_settings');
      const settings = {};
      for (const row of result.rows) {
        // For API keys, only indicate if set (don't expose value)
        if (row.key.includes('api_key')) {
          settings[row.key] = {
            isSet: !!row.value,
            updatedAt: row.updated_at
          };
        } else {
          // For prompts, return the actual value
          settings[row.key] = {
            value: row.value,
            updatedAt: row.updated_at
          };
        }
      }
      res.json(settings);
    } catch (error) {
      console.error('Error fetching settings:', error);
      res.status(500).json({ error: 'Failed to fetch settings' });
    }
  });

  // Update admin setting
  router.put('/settings/:key', isAdmin, async (req, res) => {
    const { key } = req.params;
    const { value } = req.body;

    const allowedKeys = ['gemini_api_key', 'gemini_prompt_brief', 'gemini_prompt_historical'];
    if (!allowedKeys.includes(key)) {
      return res.status(400).json({ error: 'Invalid setting key' });
    }

    try {
      await pool.query(
        `INSERT INTO admin_settings (key, value, updated_at, updated_by)
         VALUES ($1, $2, CURRENT_TIMESTAMP, $3)
         ON CONFLICT (key) DO UPDATE SET
           value = EXCLUDED.value,
           updated_at = CURRENT_TIMESTAMP,
           updated_by = EXCLUDED.updated_by`,
        [key, value, req.user.id]
      );

      console.log(`Admin ${req.user.email} updated setting: ${key}`);
      res.json({ success: true });
    } catch (error) {
      console.error('Error updating setting:', error);
      res.status(500).json({ error: 'Failed to update setting' });
    }
  });

  // ============================================
  // AI Content Generation Routes (Gemini)
  // ============================================

  // Get interpolated prompt for preview/editing before generation
  router.post('/ai/prompt-preview', isAdmin, async (req, res) => {
    const { destination, promptType } = req.body;

    if (!destination || !destination.name) {
      return res.status(400).json({ error: 'Destination data with name is required' });
    }

    const promptKey = promptType === 'historical' ? 'gemini_prompt_historical' : 'gemini_prompt_brief';

    try {
      const { getInterpolatedPrompt } = await import('../services/geminiService.js');
      const prompt = await getInterpolatedPrompt(pool, promptKey, destination);
      res.json({ prompt });
    } catch (error) {
      console.error('Error getting prompt preview:', error);
      res.status(500).json({ error: 'Failed to load prompt template' });
    }
  });

  // Generate text using custom prompt (with last-mile customization)
  router.post('/ai/generate', isAdmin, async (req, res) => {
    const { customPrompt, destination } = req.body;

    if (!customPrompt || !customPrompt.trim()) {
      return res.status(400).json({ error: 'Prompt is required' });
    }

    try {
      const { generateTextWithCustomPrompt } = await import('../services/geminiService.js');
      const text = await generateTextWithCustomPrompt(pool, customPrompt);

      console.log(`Admin ${req.user.email} generated content for: ${destination?.name || 'unknown'}`);
      res.json({ generated_text: text });
    } catch (error) {
      console.error('Error generating content:', error);
      if (error.message?.includes('API key')) {
        return res.status(400).json({ error: error.message });
      }
      res.status(500).json({ error: 'Failed to generate content. Please check your API key.' });
    }
  });

  // Test API key validity
  router.post('/ai/test-key', isAdmin, async (req, res) => {
    try {
      const { testApiKey } = await import('../services/geminiService.js');
      const response = await testApiKey(pool);

      console.log(`Admin ${req.user.email} tested Gemini API key - success`);
      res.json({ success: true, message: 'API key is valid', response });
    } catch (error) {
      console.error('API key test failed:', error);
      res.status(400).json({
        success: false,
        error: error.message?.includes('API key')
          ? error.message
          : 'API key validation failed. Please check your key.'
      });
    }
  });

  // Research location and fill all fields using AI with Google Search
  router.post('/ai/research', isAdmin, async (req, res) => {
    const { destination } = req.body;

    if (!destination || !destination.name) {
      return res.status(400).json({ error: 'Destination with name is required' });
    }

    try {
      // Fetch standardized activities list to constrain AI suggestions
      const activitiesResult = await pool.query(
        'SELECT name FROM activities ORDER BY sort_order, name'
      );
      const availableActivities = activitiesResult.rows.map(row => row.name);

      // Fetch standardized eras list to constrain AI suggestions
      const erasResult = await pool.query(
        'SELECT name FROM eras ORDER BY sort_order, name'
      );
      const availableEras = erasResult.rows.map(row => row.name);

      // Fetch standardized surfaces list to constrain AI suggestions
      const surfacesResult = await pool.query(
        'SELECT name FROM surfaces ORDER BY sort_order, name'
      );
      const availableSurfaces = surfacesResult.rows.map(row => row.name);

      const { researchLocation } = await import('../services/geminiService.js');
      const data = await researchLocation(pool, destination, availableActivities, availableEras, availableSurfaces);

      console.log(`Admin ${req.user.email} researched location: ${destination.name}`);
      res.json(data);
    } catch (error) {
      console.error('Error researching location:', error);
      if (error.message?.includes('API key')) {
        return res.status(400).json({ error: error.message });
      }
      res.status(500).json({ error: error.message || 'Failed to research location. Please try again.' });
    }
  });

  // ============================================
  // Activities Management Routes
  // ============================================

  // Get all activities (public endpoint for POI form)
  router.get('/activities', async (req, res) => {
    try {
      const result = await pool.query(
        'SELECT id, name, sort_order FROM activities ORDER BY sort_order, name'
      );
      res.json(result.rows);
    } catch (error) {
      console.error('Error fetching activities:', error);
      res.status(500).json({ error: 'Failed to fetch activities' });
    }
  });

  // Create new activity (admin only)
  router.post('/activities', isAdmin, async (req, res) => {
    const { name } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Activity name is required' });
    }

    try {
      // Get max sort_order
      const maxOrder = await pool.query('SELECT COALESCE(MAX(sort_order), 0) + 1 as next_order FROM activities');
      const sortOrder = maxOrder.rows[0].next_order;

      const result = await pool.query(
        `INSERT INTO activities (name, sort_order)
         VALUES ($1, $2)
         RETURNING id, name, sort_order`,
        [name.trim(), sortOrder]
      );

      console.log(`Admin ${req.user.email} created activity: ${name}`);
      res.status(201).json(result.rows[0]);
    } catch (error) {
      if (error.code === '23505') {
        return res.status(400).json({ error: 'Activity with this name already exists' });
      }
      console.error('Error creating activity:', error);
      res.status(500).json({ error: 'Failed to create activity' });
    }
  });

  // Update activity (admin only)
  router.put('/activities/:id', isAdmin, async (req, res) => {
    const { id } = req.params;
    const { name, sort_order } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Activity name is required' });
    }

    try {
      // Get the old name first to update POIs
      const oldActivity = await pool.query('SELECT name FROM activities WHERE id = $1', [id]);
      if (oldActivity.rows.length === 0) {
        return res.status(404).json({ error: 'Activity not found' });
      }
      const oldName = oldActivity.rows[0].name;

      const result = await pool.query(
        `UPDATE activities
         SET name = $1, sort_order = COALESCE($2, sort_order), updated_at = CURRENT_TIMESTAMP
         WHERE id = $3
         RETURNING id, name, sort_order`,
        [name.trim(), sort_order, id]
      );

      // If name changed, update all destinations that reference this activity
      const newName = name.trim();
      if (oldName !== newName) {
        // Update primary_activities (comma-separated field) in destinations
        // Format is "Activity1, Activity2, Activity3" (comma-space separated)
        // Need to handle: exact match, start of list, middle of list, end of list
        const updateResult = await pool.query(
          `UPDATE pois
           SET primary_activities = CASE
             WHEN primary_activities = $1 THEN $2
             WHEN primary_activities LIKE $1 || ', %' THEN $2 || SUBSTRING(primary_activities FROM LENGTH($1) + 1)
             WHEN primary_activities LIKE '%, ' || $1 THEN SUBSTRING(primary_activities FROM 1 FOR LENGTH(primary_activities) - LENGTH($1)) || $2
             WHEN primary_activities LIKE '%, ' || $1 || ', %' THEN REPLACE(primary_activities, ', ' || $1 || ', ', ', ' || $2 || ', ')
             ELSE primary_activities
           END,
           updated_at = CURRENT_TIMESTAMP,
           locally_modified = TRUE,
           synced = FALSE
           WHERE primary_activities LIKE '%' || $1 || '%'`,
          [oldName, newName]
        );
        if (updateResult.rowCount > 0) {
          console.log(`Updated ${updateResult.rowCount} POIs with renamed activity: ${oldName} -> ${newName}`);
        }
      }

      console.log(`Admin ${req.user.email} updated activity: ${name}`);
      res.json(result.rows[0]);
    } catch (error) {
      if (error.code === '23505') {
        return res.status(400).json({ error: 'Activity with this name already exists' });
      }
      console.error('Error updating activity:', error);
      res.status(500).json({ error: 'Failed to update activity' });
    }
  });

  // Delete activity (admin only)
  router.delete('/activities/:id', isAdmin, async (req, res) => {
    const { id } = req.params;

    try {
      const result = await pool.query(
        'DELETE FROM activities WHERE id = $1 RETURNING name',
        [id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Activity not found' });
      }

      console.log(`Admin ${req.user.email} deleted activity: ${result.rows[0].name}`);
      res.json({ success: true });
    } catch (error) {
      console.error('Error deleting activity:', error);
      res.status(500).json({ error: 'Failed to delete activity' });
    }
  });

  // Reorder activities (admin only)
  router.put('/activities/reorder', isAdmin, async (req, res) => {
    const { orderedIds } = req.body;

    if (!Array.isArray(orderedIds)) {
      return res.status(400).json({ error: 'orderedIds array is required' });
    }

    try {
      // Update sort_order for each activity
      for (let i = 0; i < orderedIds.length; i++) {
        await pool.query(
          'UPDATE activities SET sort_order = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
          [i + 1, orderedIds[i]]
        );
      }

      console.log(`Admin ${req.user.email} reordered activities`);
      res.json({ success: true });
    } catch (error) {
      console.error('Error reordering activities:', error);
      res.status(500).json({ error: 'Failed to reorder activities' });
    }
  });

  // Push activities to Google Sheets
  router.post('/activities/sync/push', isAdmin, async (req, res) => {
    console.log(`Activities push requested by ${req.user.email}`);
    try {
      if (!req.user.oauth_credentials) {
        console.log('No OAuth credentials for activities push');
        return res.status(401).json({
          error: 'Google authentication required',
          message: 'Please sign in with Google to sync activities'
        });
      }

      console.log('Creating sheets service for activities push...');
      const sheets = createSheetsService(req.user.oauth_credentials);
      console.log('Calling pushActivitiesToSheets...');
      const count = await pushActivitiesToSheets(sheets, pool);

      console.log(`Admin ${req.user.email} pushed ${count} activities to Google Sheets`);
      res.json({
        success: true,
        message: `Pushed ${count} activities to Google Sheets`,
        count
      });
    } catch (error) {
      console.error('Error pushing activities to sheets:', error);
      res.status(500).json({
        error: 'Failed to push activities to Google Sheets',
        message: error.message
      });
    }
  });

  // Pull activities from Google Sheets
  router.post('/activities/sync/pull', isAdmin, async (req, res) => {
    try {
      if (!req.user.oauth_credentials) {
        return res.status(401).json({
          error: 'Google authentication required',
          message: 'Please sign in with Google to sync activities'
        });
      }

      const sheets = createSheetsService(req.user.oauth_credentials);
      const count = await pullActivitiesFromSheets(sheets, pool);

      console.log(`Admin ${req.user.email} pulled ${count} activities from Google Sheets`);
      res.json({
        success: true,
        message: `Pulled ${count} activities from Google Sheets`,
        count
      });
    } catch (error) {
      console.error('Error pulling activities from sheets:', error);
      res.status(500).json({
        error: 'Failed to pull activities from Google Sheets',
        message: error.message
      });
    }
  });

  // ============================================
  // Eras Management Routes
  // ============================================

  // Get all eras (public endpoint for POI form)
  router.get('/eras', async (req, res) => {
    try {
      const result = await pool.query(
        'SELECT id, name, year_start, year_end, description, sort_order FROM eras ORDER BY sort_order, name'
      );
      res.json(result.rows);
    } catch (error) {
      console.error('Error fetching eras:', error);
      res.status(500).json({ error: 'Failed to fetch eras' });
    }
  });

  // Create new era (admin only)
  router.post('/eras', isAdmin, async (req, res) => {
    const { name, year_start, year_end, description } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Era name is required' });
    }

    try {
      // Get max sort_order
      const maxOrder = await pool.query('SELECT COALESCE(MAX(sort_order), 0) + 1 as next_order FROM eras');
      const sortOrder = maxOrder.rows[0].next_order;

      const result = await pool.query(
        `INSERT INTO eras (name, year_start, year_end, description, sort_order)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, name, year_start, year_end, description, sort_order`,
        [name.trim(), year_start || null, year_end || null, description || null, sortOrder]
      );

      console.log(`Admin ${req.user.email} created era: ${name}`);
      res.status(201).json(result.rows[0]);
    } catch (error) {
      if (error.code === '23505') {
        return res.status(400).json({ error: 'Era with this name already exists' });
      }
      console.error('Error creating era:', error);
      res.status(500).json({ error: 'Failed to create era' });
    }
  });

  // Update era (admin only)
  router.put('/eras/:id', isAdmin, async (req, res) => {
    const { id } = req.params;
    const { name, year_start, year_end, description, sort_order } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Era name is required' });
    }

    try {
      // Get the old name first to update POIs
      const oldEra = await pool.query('SELECT name FROM eras WHERE id = $1', [id]);
      if (oldEra.rows.length === 0) {
        return res.status(404).json({ error: 'Era not found' });
      }
      const oldName = oldEra.rows[0].name;

      const result = await pool.query(
        `UPDATE eras
         SET name = $1, year_start = $2, year_end = $3, description = $4,
             sort_order = COALESCE($5, sort_order), updated_at = CURRENT_TIMESTAMP
         WHERE id = $6
         RETURNING id, name, year_start, year_end, description, sort_order`,
        [name.trim(), year_start || null, year_end || null, description || null, sort_order, id]
      );

      // If name changed, update all destinations that reference this era
      const newName = name.trim();
      if (oldName !== newName) {
        const updateResult = await pool.query(
          `UPDATE pois
           SET era = $2,
               updated_at = CURRENT_TIMESTAMP,
               locally_modified = TRUE,
               synced = FALSE
           WHERE era = $1`,
          [oldName, newName]
        );
        if (updateResult.rowCount > 0) {
          console.log(`Updated ${updateResult.rowCount} POIs with renamed era: ${oldName} -> ${newName}`);
        }
      }

      console.log(`Admin ${req.user.email} updated era: ${name}`);
      res.json(result.rows[0]);
    } catch (error) {
      if (error.code === '23505') {
        return res.status(400).json({ error: 'Era with this name already exists' });
      }
      console.error('Error updating era:', error);
      res.status(500).json({ error: 'Failed to update era' });
    }
  });

  // Delete era (admin only)
  router.delete('/eras/:id', isAdmin, async (req, res) => {
    const { id } = req.params;

    try {
      const result = await pool.query(
        'DELETE FROM eras WHERE id = $1 RETURNING name',
        [id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Era not found' });
      }

      console.log(`Admin ${req.user.email} deleted era: ${result.rows[0].name}`);
      res.json({ success: true });
    } catch (error) {
      console.error('Error deleting era:', error);
      res.status(500).json({ error: 'Failed to delete era' });
    }
  });

  // Reorder eras (admin only)
  router.put('/eras/reorder', isAdmin, async (req, res) => {
    const { orderedIds } = req.body;

    if (!Array.isArray(orderedIds)) {
      return res.status(400).json({ error: 'orderedIds array is required' });
    }

    try {
      // Update sort_order for each era
      for (let i = 0; i < orderedIds.length; i++) {
        await pool.query(
          'UPDATE eras SET sort_order = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
          [i + 1, orderedIds[i]]
        );
      }

      console.log(`Admin ${req.user.email} reordered eras`);
      res.json({ success: true });
    } catch (error) {
      console.error('Error reordering eras:', error);
      res.status(500).json({ error: 'Failed to reorder eras' });
    }
  });

  // ============================================
  // Surfaces Management Routes
  // ============================================

  // Get all surfaces (public endpoint for POI form)
  router.get('/surfaces', async (req, res) => {
    try {
      const result = await pool.query(
        'SELECT id, name, description, sort_order FROM surfaces ORDER BY sort_order, name'
      );
      res.json(result.rows);
    } catch (error) {
      console.error('Error fetching surfaces:', error);
      res.status(500).json({ error: 'Failed to fetch surfaces' });
    }
  });

  // Create new surface (admin only)
  router.post('/surfaces', isAdmin, async (req, res) => {
    const { name, description } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Surface name is required' });
    }

    try {
      // Get max sort_order
      const maxOrder = await pool.query('SELECT COALESCE(MAX(sort_order), 0) + 1 as next_order FROM surfaces');
      const sortOrder = maxOrder.rows[0].next_order;

      const result = await pool.query(
        `INSERT INTO surfaces (name, description, sort_order)
         VALUES ($1, $2, $3)
         RETURNING id, name, description, sort_order`,
        [name.trim(), description || null, sortOrder]
      );

      console.log(`Admin ${req.user.email} created surface: ${name}`);
      res.status(201).json(result.rows[0]);
    } catch (error) {
      if (error.code === '23505') {
        return res.status(400).json({ error: 'Surface with this name already exists' });
      }
      console.error('Error creating surface:', error);
      res.status(500).json({ error: 'Failed to create surface' });
    }
  });

  // Reorder surfaces (admin only) - MUST be before :id routes
  router.put('/surfaces/reorder', isAdmin, async (req, res) => {
    const { orderedIds } = req.body;

    if (!Array.isArray(orderedIds)) {
      return res.status(400).json({ error: 'orderedIds array is required' });
    }

    try {
      // Update sort_order for each surface
      for (let i = 0; i < orderedIds.length; i++) {
        await pool.query(
          'UPDATE surfaces SET sort_order = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
          [i + 1, orderedIds[i]]
        );
      }

      console.log(`Admin ${req.user.email} reordered surfaces`);
      res.json({ success: true });
    } catch (error) {
      console.error('Error reordering surfaces:', error);
      res.status(500).json({ error: 'Failed to reorder surfaces' });
    }
  });

  // Update surface (admin only)
  router.put('/surfaces/:id', isAdmin, async (req, res) => {
    const { id } = req.params;
    const { name, description, sort_order } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Surface name is required' });
    }

    try {
      // Get the old name first to update POIs
      const oldSurface = await pool.query('SELECT name FROM surfaces WHERE id = $1', [id]);
      if (oldSurface.rows.length === 0) {
        return res.status(404).json({ error: 'Surface not found' });
      }
      const oldName = oldSurface.rows[0].name;

      const result = await pool.query(
        `UPDATE surfaces
         SET name = $1, description = $2,
             sort_order = COALESCE($3, sort_order), updated_at = CURRENT_TIMESTAMP
         WHERE id = $4
         RETURNING id, name, description, sort_order`,
        [name.trim(), description || null, sort_order, id]
      );

      // If name changed, update all destinations that reference this surface
      const newName = name.trim();
      if (oldName !== newName) {
        const updateResult = await pool.query(
          `UPDATE pois
           SET surface = $2,
               updated_at = CURRENT_TIMESTAMP,
               locally_modified = TRUE,
               synced = FALSE
           WHERE surface = $1`,
          [oldName, newName]
        );
        if (updateResult.rowCount > 0) {
          console.log(`Updated ${updateResult.rowCount} POIs with renamed surface: ${oldName} -> ${newName}`);
        }
      }

      console.log(`Admin ${req.user.email} updated surface: ${name}`);
      res.json(result.rows[0]);
    } catch (error) {
      if (error.code === '23505') {
        return res.status(400).json({ error: 'Surface with this name already exists' });
      }
      console.error('Error updating surface:', error);
      res.status(500).json({ error: 'Failed to update surface' });
    }
  });

  // Delete surface (admin only)
  router.delete('/surfaces/:id', isAdmin, async (req, res) => {
    const { id } = req.params;

    try {
      const result = await pool.query(
        'DELETE FROM surfaces WHERE id = $1 RETURNING name',
        [id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Surface not found' });
      }

      console.log(`Admin ${req.user.email} deleted surface: ${result.rows[0].name}`);
      res.json({ success: true });
    } catch (error) {
      console.error('Error deleting surface:', error);
      res.status(500).json({ error: 'Failed to delete surface' });
    }
  });

  // ============================================
  // Icons Management Routes
  // ============================================

  // Get all icons (public endpoint for map)
  router.get('/icons', async (req, res) => {
    try {
      const result = await pool.query(
        'SELECT id, name, label, svg_filename, svg_content, title_keywords, activity_fallbacks, sort_order, enabled, drive_file_id FROM icons ORDER BY sort_order, name'
      );
      res.json(result.rows);
    } catch (error) {
      console.error('Error fetching icons:', error);
      res.status(500).json({ error: 'Failed to fetch icons' });
    }
  });

  // Create new icon (admin only)
  // If svg_content is provided and user has OAuth credentials, auto-uploads to Google Drive
  router.post('/icons', isAdmin, async (req, res) => {
    const { name, label, svg_filename, svg_content, title_keywords, activity_fallbacks } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Icon name is required' });
    }
    if (!label || !label.trim()) {
      return res.status(400).json({ error: 'Icon label is required' });
    }

    try {
      // Get max sort_order
      const maxOrder = await pool.query('SELECT COALESCE(MAX(sort_order), 0) + 1 as next_order FROM icons');
      const sortOrder = maxOrder.rows[0].next_order;

      // Auto-upload to Google Drive if svg_content is provided and user has OAuth
      let driveFileId = null;
      if (svg_content && req.user.oauth_credentials) {
        try {
          const drive = createDriveService(req.user.oauth_credentials);
          driveFileId = await uploadIconToDrive(drive, pool, name.trim(), svg_content);
          console.log(`Uploaded icon ${name} to Google Drive: ${driveFileId}`);
        } catch (driveError) {
          console.warn(`Failed to upload icon to Drive (non-fatal):`, driveError.message);
          // Continue without Drive upload - icon will still be saved to database
        }
      }

      const result = await pool.query(
        `INSERT INTO icons (name, label, svg_filename, svg_content, title_keywords, activity_fallbacks, sort_order, drive_file_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id, name, label, svg_filename, svg_content, title_keywords, activity_fallbacks, sort_order, enabled, drive_file_id`,
        [name.trim(), label.trim(), svg_filename || null, svg_content || null, title_keywords || null, activity_fallbacks || null, sortOrder, driveFileId]
      );

      console.log(`Admin ${req.user.email} created icon: ${name}${driveFileId ? ' (uploaded to Drive)' : ''}`);
      res.status(201).json(result.rows[0]);
    } catch (error) {
      if (error.code === '23505') {
        return res.status(400).json({ error: 'Icon with this name already exists' });
      }
      console.error('Error creating icon:', error);
      res.status(500).json({ error: 'Failed to create icon' });
    }
  });

  // Generate icon SVG using AI (admin only)
  router.post('/icons/generate', isAdmin, async (req, res) => {
    const { description, color } = req.body;

    if (!description || !description.trim()) {
      return res.status(400).json({ error: 'Icon description is required' });
    }
    if (!color || !color.trim()) {
      return res.status(400).json({ error: 'Icon color is required' });
    }

    // Validate color is a hex color
    if (!/^#[0-9A-Fa-f]{6}$/.test(color.trim())) {
      return res.status(400).json({ error: 'Color must be a valid hex color (e.g., #0288d1)' });
    }

    try {
      const { generateIconSvg } = await import('../services/geminiService.js');
      const svgContent = await generateIconSvg(pool, description.trim(), color.trim());

      console.log(`Admin ${req.user.email} generated icon SVG for: ${description}`);
      res.json({ svg_content: svgContent });
    } catch (error) {
      console.error('Error generating icon:', error);
      if (error.message?.includes('API key')) {
        return res.status(400).json({ error: error.message });
      }
      res.status(500).json({ error: error.message || 'Failed to generate icon. Please try again.' });
    }
  });

  // Reorder icons (admin only) - MUST be before :id routes
  router.put('/icons/reorder', isAdmin, async (req, res) => {
    const { orderedIds } = req.body;

    if (!Array.isArray(orderedIds)) {
      return res.status(400).json({ error: 'orderedIds array is required' });
    }

    try {
      // Update sort_order for each icon
      for (let i = 0; i < orderedIds.length; i++) {
        await pool.query(
          'UPDATE icons SET sort_order = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
          [i + 1, orderedIds[i]]
        );
      }

      console.log(`Admin ${req.user.email} reordered icons`);
      res.json({ success: true });
    } catch (error) {
      console.error('Error reordering icons:', error);
      res.status(500).json({ error: 'Failed to reorder icons' });
    }
  });

  // Update icon (admin only)
  // If svg_content changed and user has OAuth credentials, re-uploads to Google Drive
  router.put('/icons/:id', isAdmin, async (req, res) => {
    const { id } = req.params;
    const { name, label, svg_filename, svg_content, title_keywords, activity_fallbacks, sort_order, enabled } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Icon name is required' });
    }
    if (!label || !label.trim()) {
      return res.status(400).json({ error: 'Icon label is required' });
    }

    try {
      // Get existing icon to check if svg_content changed
      const existing = await pool.query('SELECT svg_content, drive_file_id FROM icons WHERE id = $1', [id]);
      if (existing.rows.length === 0) {
        return res.status(404).json({ error: 'Icon not found' });
      }

      const existingIcon = existing.rows[0];
      let driveFileId = existingIcon.drive_file_id;

      // Re-upload to Drive if svg_content changed and user has OAuth
      if (svg_content && svg_content !== existingIcon.svg_content && req.user.oauth_credentials) {
        try {
          const drive = createDriveService(req.user.oauth_credentials);
          driveFileId = await uploadIconToDrive(drive, pool, name.trim(), svg_content);
          console.log(`Re-uploaded icon ${name} to Google Drive: ${driveFileId}`);
        } catch (driveError) {
          console.warn(`Failed to re-upload icon to Drive (non-fatal):`, driveError.message);
          // Keep existing drive_file_id if upload failed
        }
      }

      const result = await pool.query(
        `UPDATE icons
         SET name = $1, label = $2, svg_filename = $3, svg_content = $4, title_keywords = $5, activity_fallbacks = $6,
             sort_order = COALESCE($7, sort_order), enabled = COALESCE($8, enabled), drive_file_id = $9, updated_at = CURRENT_TIMESTAMP
         WHERE id = $10
         RETURNING id, name, label, svg_filename, svg_content, title_keywords, activity_fallbacks, sort_order, enabled, drive_file_id`,
        [name.trim(), label.trim(), svg_filename || null, svg_content, title_keywords || null, activity_fallbacks || null, sort_order, enabled, driveFileId, id]
      );

      console.log(`Admin ${req.user.email} updated icon: ${name}`);
      res.json(result.rows[0]);
    } catch (error) {
      if (error.code === '23505') {
        return res.status(400).json({ error: 'Icon with this name already exists' });
      }
      console.error('Error updating icon:', error);
      res.status(500).json({ error: 'Failed to update icon' });
    }
  });

  // Delete icon (admin only)
  // Also deletes from Google Drive if icon was stored there
  router.delete('/icons/:id', isAdmin, async (req, res) => {
    const { id } = req.params;

    try {
      // Don't allow deleting the default icon
      const checkDefault = await pool.query('SELECT name, drive_file_id FROM icons WHERE id = $1', [id]);
      if (checkDefault.rows.length === 0) {
        return res.status(404).json({ error: 'Icon not found' });
      }
      if (checkDefault.rows[0].name === 'default') {
        return res.status(400).json({ error: 'Cannot delete the default icon' });
      }

      const driveFileId = checkDefault.rows[0].drive_file_id;

      // Delete from Drive if file exists and user has OAuth
      if (driveFileId && req.user.oauth_credentials) {
        try {
          const drive = createDriveService(req.user.oauth_credentials);
          await deleteFileFromDrive(drive, driveFileId);
          console.log(`Deleted icon from Google Drive: ${driveFileId}`);
        } catch (driveError) {
          console.warn(`Failed to delete icon from Drive (non-fatal):`, driveError.message);
          // Continue with database deletion even if Drive delete fails
        }
      }

      const result = await pool.query(
        'DELETE FROM icons WHERE id = $1 RETURNING name',
        [id]
      );

      console.log(`Admin ${req.user.email} deleted icon: ${result.rows[0].name}`);
      res.json({ success: true });
    } catch (error) {
      console.error('Error deleting icon:', error);
      res.status(500).json({ error: 'Failed to delete icon' });
    }
  });

  // Push icons to Google Sheets
  router.post('/icons/sync/push', isAdmin, async (req, res) => {
    console.log(`Icons push requested by ${req.user.email}`);
    try {
      if (!req.user.oauth_credentials) {
        console.log('No OAuth credentials for icons push');
        return res.status(401).json({
          error: 'Google authentication required',
          message: 'Please sign in with Google to sync icons'
        });
      }

      console.log('Creating sheets service for icons push...');
      const sheets = createSheetsService(req.user.oauth_credentials);
      console.log('Calling pushIconsToSheets...');
      const count = await pushIconsToSheets(sheets, pool);

      console.log(`Admin ${req.user.email} pushed ${count} icons to Google Sheets`);
      res.json({
        success: true,
        message: `Pushed ${count} icons to Google Sheets`,
        count
      });
    } catch (error) {
      console.error('Error pushing icons to sheets:', error);
      res.status(500).json({
        error: 'Failed to push icons to Google Sheets',
        message: error.message
      });
    }
  });

  // Pull icons from Google Sheets (includes downloading SVGs from Drive)
  router.post('/icons/sync/pull', isAdmin, async (req, res) => {
    try {
      if (!req.user.oauth_credentials) {
        return res.status(401).json({
          error: 'Google authentication required',
          message: 'Please sign in with Google to sync icons'
        });
      }

      const sheets = createSheetsService(req.user.oauth_credentials);
      const drive = createDriveService(req.user.oauth_credentials);
      const count = await pullIconsFromSheets(sheets, pool, drive);

      console.log(`Admin ${req.user.email} pulled ${count} icons from Google Sheets (including Drive SVGs)`);
      res.json({
        success: true,
        message: `Pulled ${count} icons from Google Sheets`,
        count
      });
    } catch (error) {
      console.error('Error pulling icons from sheets:', error);
      res.status(500).json({
        error: 'Failed to pull icons from Google Sheets',
        message: error.message
      });
    }
  });

  // ============================================
  // Google Sheets Sync Routes
  // ============================================

  // Get sync status
  router.get('/sync/status', isAdmin, async (req, res) => {
    try {
      const status = await getSyncStatus(pool);

      // Add spreadsheet configuration
      const spreadsheetInfo = await getSpreadsheetInfo(pool);
      status.spreadsheet = spreadsheetInfo;

      // Parse credentials if stored as string (handle both formats)
      let credentials = req.user.oauth_credentials;
      if (typeof credentials === 'string') {
        try {
          credentials = JSON.parse(credentials);
        } catch (e) {
          credentials = null;
        }
      }

      // Check if user has OAuth credentials for sync
      const hasCredentials = !!(credentials && credentials.access_token);
      status.has_oauth_credentials = hasCredentials;
      status.drive_access_verified = false;

      if (!hasCredentials) {
        status.drive_access_error = 'No Drive credentials found. Please log out and log back in.';
        return res.json(status);
      }

      // Verify credentials by trying to use them (with auto-refresh)
      const drive = await createDriveServiceWithRefresh(credentials, pool, req.user.id);

      if (spreadsheetInfo.configured) {
        // Try to access the configured spreadsheet
        try {
          const sheets = await createSheetsServiceWithRefresh(credentials, pool, req.user.id);
          await sheets.spreadsheets.get({
            spreadsheetId: spreadsheetInfo.id,
            fields: 'spreadsheetId'
          });

          // Check if the spreadsheet is in the trash
          try {
            const trashed = await isFileTrashed(drive, spreadsheetInfo.id);
            if (trashed === true) {
              status.spreadsheet_trashed = true;
              status.drive_access_error = 'Spreadsheet is in Google Drive trash. Please disconnect or restore it.';
            } else if (trashed === null) {
              status.spreadsheet_deleted = true;
              status.drive_access_error = 'Spreadsheet has been permanently deleted. Please disconnect.';
            } else {
              status.drive_access_verified = true;
            }
          } catch (driveError) {
            console.log('Could not check trash status:', driveError.message);
            // If we can't check, assume it's fine since Sheets API worked
            status.drive_access_verified = true;
          }
        } catch (verifyError) {
          console.log('Drive access verification failed:', verifyError.message);
          if (verifyError.message?.includes('invalid_grant') || verifyError.message?.includes('Token has been expired')) {
            status.drive_access_error = 'Access token expired. Please log out and log back in.';
          } else if (verifyError.message?.includes('not found') || verifyError.code === 404) {
            status.spreadsheet_deleted = true;
            status.drive_access_error = 'Spreadsheet not found. It may have been permanently deleted. Please disconnect.';
          } else {
            status.drive_access_error = 'Cannot access spreadsheet. Please log out and log back in.';
          }
        }
      } else {
        // No spreadsheet configured - assume it's ready if we have credentials
        status.drive_access_verified = true;
      }

      // Get Drive folder information
      try {
        const { countDriveFiles, getDriveFolderLink, getDriveSetting } = await import('../services/driveImageService.js');

        const rootFolderId = await getDriveSetting(pool, 'root_folder_id');
        const iconsFolderId = await getDriveSetting(pool, 'icons_folder_id');
        const imagesFolderId = await getDriveSetting(pool, 'images_folder_id');
        const geospatialFolderId = await getDriveSetting(pool, 'geospatial_folder_id');

        const folderLink = await getDriveFolderLink(pool);
        const fileCounts = await countDriveFiles(drive, pool);

        status.drive = {
          configured: !!rootFolderId,
          folder_url: folderLink,
          folders: {
            root: rootFolderId ? {
              id: rootFolderId,
              name: 'Roots of The Valley',
              url: `https://drive.google.com/drive/folders/${rootFolderId}`
            } : null,
            icons: iconsFolderId ? {
              id: iconsFolderId,
              name: 'Icons',
              file_count: fileCounts.iconsCount,
              url: `https://drive.google.com/drive/folders/${iconsFolderId}`
            } : null,
            images: imagesFolderId ? {
              id: imagesFolderId,
              name: 'Images',
              file_count: fileCounts.imagesCount,
              url: `https://drive.google.com/drive/folders/${imagesFolderId}`
            } : null,
            geospatial: geospatialFolderId ? {
              id: geospatialFolderId,
              name: 'Geospatial',
              file_count: fileCounts.geospatialCount,
              url: `https://drive.google.com/drive/folders/${geospatialFolderId}`
            } : null
          }
        };
      } catch (driveInfoError) {
        console.warn('Could not get Drive folder info:', driveInfoError.message);
        status.drive = { configured: false };
      }

      // Get sync queue details
      try {
        const queueResult = await pool.query(`
          SELECT id, operation, table_name, record_id,
                 data->>'name' as item_name, created_at
          FROM sync_queue
          ORDER BY created_at ASC
          LIMIT 50
        `);
        status.sync_queue = queueResult.rows;
      } catch (queueError) {
        console.warn('Could not get sync queue:', queueError.message);
        status.sync_queue = [];
      }

      res.json(status);
    } catch (error) {
      console.error('Error getting sync status:', error);
      res.status(500).json({ error: 'Failed to get sync status' });
    }
  });

  // Disconnect from spreadsheet
  router.delete('/sync/disconnect-spreadsheet', isAdmin, async (req, res) => {
    try {
      await pool.query("DELETE FROM admin_settings WHERE key = 'sync_spreadsheet_id'");

      console.log(`Admin ${req.user.email} disconnected from spreadsheet`);
      res.json({ success: true });
    } catch (error) {
      console.error('Error disconnecting spreadsheet:', error);
      res.status(500).json({ error: 'Failed to disconnect spreadsheet' });
    }
  });

  // Connect to an existing spreadsheet by ID
  router.post('/sync/connect-spreadsheet', isAdmin, async (req, res) => {
    try {
      const { spreadsheetId } = req.body;

      if (!spreadsheetId || !spreadsheetId.trim()) {
        return res.status(400).json({
          error: 'Spreadsheet ID is required'
        });
      }

      // Check if user has Google OAuth credentials
      if (!req.user.oauth_credentials) {
        return res.status(401).json({
          error: 'Google authentication required',
          message: 'Please authorize Google Drive access first'
        });
      }

      // Verify we can access the spreadsheet
      const sheets = createSheetsService(req.user.oauth_credentials);
      try {
        const response = await sheets.spreadsheets.get({
          spreadsheetId: spreadsheetId.trim()
        });

        // Save the spreadsheet ID
        const { setSpreadsheetId } = await import('../services/sheetsSync.js');
        await setSpreadsheetId(pool, spreadsheetId.trim(), req.user.id);

        console.log(`Admin ${req.user.email} connected to spreadsheet: ${spreadsheetId}`);
        res.json({
          success: true,
          message: `Connected to spreadsheet: ${response.data.properties.title}`,
          spreadsheet: {
            id: spreadsheetId.trim(),
            name: response.data.properties.title,
            url: response.data.spreadsheetUrl
          }
        });
      } catch (sheetsError) {
        console.error('Failed to access spreadsheet:', sheetsError.message);
        res.status(400).json({
          error: 'Cannot access spreadsheet',
          message: 'Make sure the spreadsheet was created by this app or you have access to it.'
        });
      }
    } catch (error) {
      console.error('Error connecting spreadsheet:', error);
      res.status(500).json({
        error: 'Failed to connect spreadsheet',
        message: error.message
      });
    }
  });

  // Create a new app-owned spreadsheet
  router.post('/sync/create-spreadsheet', isAdmin, async (req, res) => {
    try {
      // Check if user has Google OAuth credentials
      if (!req.user.oauth_credentials) {
        return res.status(401).json({
          error: 'Google authentication required',
          message: 'Please sign in with Google to create a spreadsheet'
        });
      }

      // Check if a spreadsheet already exists
      const existingId = await getSpreadsheetId(pool);
      if (existingId) {
        return res.status(400).json({
          error: 'Spreadsheet already exists',
          message: 'A spreadsheet is already configured. Use Push to update it.'
        });
      }

      const sheets = createSheetsService(req.user.oauth_credentials);
      const drive = createDriveService(req.user.oauth_credentials);
      const result = await createAppSpreadsheet(sheets, pool, req.user.id, drive);

      // Automatically push all data to the new spreadsheet (including GeoJSON upload)
      const destCount = await pushAllToSheets(sheets, pool, drive);
      const actCount = await pushActivitiesToSheets(sheets, pool);
      const erasCount = await pushErasToSheets(sheets, pool);
      const surfacesCount = await pushSurfacesToSheets(sheets, pool);
      const iconsCount = await pushIconsToSheets(sheets, pool);
      const integrationCount = await pushIntegrationToSheets(sheets, pool);
      const linearFeaturesCount = await pushLinearFeaturesToSheets(sheets, pool);

      console.log(`Admin ${req.user.email} created spreadsheet: ${result.id} and pushed ${destCount} destinations, ${actCount} activities, ${erasCount} eras, ${surfacesCount} surfaces, ${iconsCount} icons, ${linearFeaturesCount} trails/rivers, ${integrationCount} settings`);
      res.json({
        success: true,
        message: `Spreadsheet created and populated with ${destCount} destinations, ${actCount} activities, ${erasCount} eras, ${surfacesCount} surfaces, ${iconsCount} icons, ${linearFeaturesCount} trails/rivers, ${integrationCount} settings`,
        spreadsheet: result,
        pushed: {
          destinations: destCount,
          activities: actCount,
          eras: erasCount,
          surfaces: surfacesCount,
          icons: iconsCount,
          linearFeatures: linearFeaturesCount,
          integration: integrationCount
        }
      });
    } catch (error) {
      console.error('Error creating spreadsheet:', error);
      res.status(500).json({
        error: 'Failed to create spreadsheet',
        message: error.message
      });
    }
  });

  // Push all data from database to Google Sheets (Destinations + Activities + Eras + Surfaces + Icons + Integration)
  // Also uploads GeoJSON geometry to Drive for linear features
  router.post('/sync/push', isAdmin, async (req, res) => {
    try {
      // Check if user has Google OAuth credentials
      if (!req.user.oauth_credentials) {
        return res.status(401).json({
          error: 'Google authentication required',
          message: 'Please sign in with Google to sync data'
        });
      }

      // Use refresh-enabled services to auto-refresh expired tokens
      const sheets = await createSheetsServiceWithRefresh(req.user.oauth_credentials, pool, req.user.id);
      const drive = await createDriveServiceWithRefresh(req.user.oauth_credentials, pool, req.user.id);

      // Push Destinations (including GeoJSON upload for linear features)
      const destCount = await pushAllToSheets(sheets, pool, drive);

      // Push Activities
      const actCount = await pushActivitiesToSheets(sheets, pool);

      // Push Eras
      const erasCount = await pushErasToSheets(sheets, pool);

      // Push Surfaces
      const surfacesCount = await pushSurfacesToSheets(sheets, pool);

      // Push Icons
      const iconsCount = await pushIconsToSheets(sheets, pool);

      // Push Integration settings
      const integrationCount = await pushIntegrationToSheets(sheets, pool);

      // Push Linear Features (Trails & Rivers)
      const linearFeaturesCount = await pushLinearFeaturesToSheets(sheets, pool);

      console.log(`Admin ${req.user.email} pushed ${destCount} destinations, ${actCount} activities, ${erasCount} eras, ${surfacesCount} surfaces, ${iconsCount} icons, ${linearFeaturesCount} trails/rivers, and ${integrationCount} integration settings to Google Sheets`);
      res.json({
        success: true,
        message: `Pushed ${destCount} destinations, ${actCount} activities, ${erasCount} eras, ${surfacesCount} surfaces, ${iconsCount} icons, and ${linearFeaturesCount} trails/rivers to Google Sheets`,
        destinations: destCount,
        activities: actCount,
        eras: erasCount,
        surfaces: surfacesCount,
        icons: iconsCount,
        linearFeatures: linearFeaturesCount,
        integration: integrationCount
      });
    } catch (error) {
      console.error('Error pushing to sheets:', error);
      res.status(500).json({
        error: 'Failed to push to Google Sheets',
        message: error.message
      });
    }
  });

  // Pull all data from Google Sheets to database (Destinations + Activities + Eras + Surfaces + Icons)
  // Also downloads icon SVGs from Google Drive if they have drive_file_id
  router.post('/sync/pull', isAdmin, async (req, res) => {
    try {
      // Check if user has Google OAuth credentials
      if (!req.user.oauth_credentials) {
        return res.status(401).json({
          error: 'Google authentication required',
          message: 'Please sign in with Google to sync data'
        });
      }

      // Use refresh-enabled services to auto-refresh expired tokens
      const sheets = await createSheetsServiceWithRefresh(req.user.oauth_credentials, pool, req.user.id);
      const drive = await createDriveServiceWithRefresh(req.user.oauth_credentials, pool, req.user.id);

      // Pull Integration settings first (includes Drive folder IDs needed for icon downloads)
      const integrationCount = await pullIntegrationFromSheets(sheets, pool);

      // Pull Destinations (includes downloading images from Drive to database)
      const destCount = await pullAllFromSheets(sheets, pool, drive);

      // Pull Activities
      const actCount = await pullActivitiesFromSheets(sheets, pool);

      // Pull Eras
      const erasCount = await pullErasFromSheets(sheets, pool);

      // Pull Surfaces
      const surfacesCount = await pullSurfacesFromSheets(sheets, pool);

      // Pull Icons (includes downloading SVG content from Drive)
      const iconsCount = await pullIconsFromSheets(sheets, pool, drive);

      // Pull Linear Features (Trails & Rivers) - only updates metadata, preserves geometry
      const linearFeaturesCount = await pullLinearFeaturesFromSheets(sheets, pool, drive);

      console.log(`Admin ${req.user.email} pulled ${destCount} destinations, ${actCount} activities, ${erasCount} eras, ${surfacesCount} surfaces, ${iconsCount} icons, ${linearFeaturesCount} trails/rivers, and ${integrationCount} settings from Google Sheets`);
      res.json({
        success: true,
        message: `Pulled ${destCount} destinations, ${actCount} activities, ${erasCount} eras, ${surfacesCount} surfaces, ${iconsCount} icons, ${linearFeaturesCount} trails/rivers, and ${integrationCount} settings from Google Sheets`,
        destinations: destCount,
        activities: actCount,
        eras: erasCount,
        surfaces: surfacesCount,
        icons: iconsCount,
        linearFeatures: linearFeaturesCount,
        integration: integrationCount
      });
    } catch (error) {
      console.error('Error pulling from sheets:', error);
      res.status(500).json({
        error: 'Failed to pull from Google Sheets',
        message: error.message
      });
    }
  });

  // Process pending sync queue (push changes to sheets)
  router.post('/sync/process', isAdmin, async (req, res) => {
    try {
      // Check if user has Google OAuth credentials
      if (!req.user.oauth_credentials) {
        return res.status(401).json({
          error: 'Google authentication required',
          message: 'Please sign in with Google to sync data'
        });
      }

      const sheets = await createSheetsServiceWithRefresh(req.user.oauth_credentials, pool, req.user.id);
      const drive = await createDriveServiceWithRefresh(req.user.oauth_credentials, pool, req.user.id);
      const result = await processSyncQueue(sheets, pool, drive);

      console.log(`Admin ${req.user.email} processed sync queue: ${result.processed} operations`);
      res.json({
        success: true,
        message: `Processed ${result.processed} sync operations`,
        processed: result.processed,
        errors: result.errors
      });
    } catch (error) {
      console.error('Error processing sync queue:', error);
      res.status(500).json({
        error: 'Failed to process sync queue',
        message: error.message
      });
    }
  });

  // Wipe the local database (delete all POIs)
  router.delete('/sync/wipe-database', isAdmin, async (req, res) => {
    try {
      // Delete all POIs
      const destResult = await pool.query('DELETE FROM pois RETURNING id');
      const destCount = destResult.rowCount;

      // Clear sync queue
      const queueResult = await pool.query('DELETE FROM sync_queue RETURNING id');
      const queueCount = queueResult.rowCount;

      // Clear sync status (except spreadsheet ID)
      await pool.query("DELETE FROM sync_status WHERE key != 'sync_spreadsheet_id'");

      console.log(`Admin ${req.user.email} wiped database: ${destCount} destinations, ${queueCount} queue items`);
      res.json({
        success: true,
        message: `Deleted ${destCount} destinations and ${queueCount} pending sync operations`,
        deleted: {
          destinations: destCount,
          queueItems: queueCount
        }
      });
    } catch (error) {
      console.error('Error wiping database:', error);
      res.status(500).json({ error: 'Failed to wipe database' });
    }
  });

  // Clear sync queue (discard pending changes)
  router.delete('/sync/queue', isAdmin, async (req, res) => {
    try {
      const result = await pool.query('DELETE FROM sync_queue RETURNING id');
      const count = result.rowCount;

      console.log(`Admin ${req.user.email} cleared sync queue: ${count} operations discarded`);
      res.json({
        success: true,
        message: `Cleared ${count} pending sync operations`,
        count
      });
    } catch (error) {
      console.error('Error clearing sync queue:', error);
      res.status(500).json({ error: 'Failed to clear sync queue' });
    }
  });

  // ============================================
  // Destination Image Management Routes
  // ============================================

  // Configure multer for memory storage (images stored in Drive, not filesystem)
  const imageUpload = multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: 10 * 1024 * 1024, // 10MB max
    },
    fileFilter: (req, file, cb) => {
      const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
      if (allowedTypes.includes(file.mimetype)) {
        cb(null, true);
      } else {
        cb(new Error('Invalid file type. Only JPEG, PNG, WebP, and GIF are allowed.'));
      }
    }
  });

  // Upload image for a destination
  // Stores image in database (for all users) AND uploads to Drive (for backup/restore)
  router.post('/destinations/:id/image', isAdmin, imageUpload.single('image'), async (req, res) => {
    const { id } = req.params;

    if (!req.file) {
      return res.status(400).json({ error: 'No image file provided' });
    }

    try {
      // Check if destination exists
      const destCheck = await pool.query('SELECT id, name, image_drive_file_id FROM pois WHERE id = $1', [id]);
      if (destCheck.rows.length === 0) {
        return res.status(404).json({ error: 'Destination not found' });
      }

      const destination = destCheck.rows[0];

      // Store image in database (primary storage - accessible by all users)
      // Image URL is computed from ID: /api/destinations/{id}/image
      await pool.query(
        `UPDATE pois
         SET image_data = $1, image_mime_type = $2,
             updated_at = CURRENT_TIMESTAMP, locally_modified = TRUE, synced = FALSE
         WHERE id = $3`,
        [req.file.buffer, req.file.mimetype, id]
      );

      // Also upload to Drive for backup (if user has OAuth credentials)
      let driveFileId = null;
      if (req.user.oauth_credentials) {
        try {
          // Delete existing image from Drive if present
          if (destination.image_drive_file_id) {
            const drive = createDriveService(req.user.oauth_credentials);
            await deleteFileFromDrive(drive, destination.image_drive_file_id);
            console.log(`Deleted old image from Drive: ${destination.image_drive_file_id}`);
          }

          // Generate filename and upload to Drive
          const ext = req.file.mimetype.split('/')[1];
          const sanitizedName = destination.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
          const filename = `${sanitizedName}-${Date.now()}.${ext}`;

          const drive = createDriveService(req.user.oauth_credentials);
          driveFileId = await uploadImageToDrive(drive, pool, filename, req.file.buffer, req.file.mimetype);

          // Update Drive file ID reference
          await pool.query(
            'UPDATE pois SET image_drive_file_id = $1 WHERE id = $2',
            [driveFileId, id]
          );

          console.log(`Backed up image to Drive: ${driveFileId}`);
        } catch (driveError) {
          console.warn(`Failed to backup image to Drive (non-fatal):`, driveError.message);
          // Continue - image is stored in database, Drive backup failed
        }
      }

      console.log(`Admin ${req.user.email} uploaded image for destination ${id}`);
      res.json({
        success: true,
        message: 'Image uploaded successfully',
        image_url: `/api/destinations/${id}/image`,
        drive_file_id: driveFileId
      });
    } catch (error) {
      console.error('Error uploading destination image:', error);
      if (error.message?.includes('Invalid file type')) {
        return res.status(400).json({ error: error.message });
      }
      res.status(500).json({ error: 'Failed to upload image' });
    }
  });

  // Delete image from a destination
  // Clears image from database AND deletes from Drive backup
  router.delete('/destinations/:id/image', isAdmin, async (req, res) => {
    const { id } = req.params;

    try {
      // Check if destination exists and has an image
      const destCheck = await pool.query('SELECT id, name, image_data, image_drive_file_id FROM pois WHERE id = $1', [id]);
      if (destCheck.rows.length === 0) {
        return res.status(404).json({ error: 'Destination not found' });
      }

      const destination = destCheck.rows[0];

      if (!destination.image_data && !destination.image_drive_file_id) {
        return res.status(400).json({ error: 'Destination has no image' });
      }

      // Delete from Drive if present and user has OAuth
      if (destination.image_drive_file_id && req.user.oauth_credentials) {
        try {
          const drive = createDriveService(req.user.oauth_credentials);
          await deleteFileFromDrive(drive, destination.image_drive_file_id);
          console.log(`Deleted image from Drive: ${destination.image_drive_file_id}`);
        } catch (driveError) {
          console.warn(`Failed to delete from Drive (non-fatal):`, driveError.message);
        }
      }

      // Clear all image data from database
      await pool.query(
        `UPDATE pois
         SET image_data = NULL, image_mime_type = NULL, image_drive_file_id = NULL,
             updated_at = CURRENT_TIMESTAMP, locally_modified = TRUE, synced = FALSE
         WHERE id = $1`,
        [id]
      );

      console.log(`Admin ${req.user.email} deleted image for destination ${id}`);
      res.json({
        success: true,
        message: 'Image deleted successfully'
      });
    } catch (error) {
      console.error('Error deleting destination image:', error);
      res.status(500).json({ error: 'Failed to delete image' });
    }
  });

  // ============================================
  // Google Drive Status Routes
  // ============================================

  // Get Drive storage status
  router.get('/drive/status', isAdmin, async (req, res) => {
    try {
      if (!req.user.oauth_credentials) {
        return res.json({
          configured: false,
          message: 'Google authentication required'
        });
      }

      const drive = createDriveService(req.user.oauth_credentials);
      const settings = await getAllDriveSettings(pool);
      const folderLink = await getDriveFolderLink(pool);
      const fileCounts = await countDriveFiles(drive, pool);

      res.json({
        configured: !!settings.root_folder_id,
        folder_link: folderLink,
        folders: {
          root: settings.root_folder_id || null,
          icons: settings.icons_folder_id || null,
          images: settings.images_folder_id || null
        },
        file_counts: fileCounts
      });
    } catch (error) {
      console.error('Error getting Drive status:', error);
      res.status(500).json({ error: 'Failed to get Drive status' });
    }
  });

  // Setup Drive folders (creates if not exists)
  router.post('/drive/setup', isAdmin, async (req, res) => {
    try {
      if (!req.user.oauth_credentials) {
        return res.status(401).json({
          error: 'Google authentication required',
          message: 'Please sign in with Google to setup Drive folders'
        });
      }

      const drive = createDriveService(req.user.oauth_credentials);
      const folders = await ensureDriveFolders(drive, pool);
      const folderLink = await getDriveFolderLink(pool);

      console.log(`Admin ${req.user.email} setup Drive folders`);
      res.json({
        success: true,
        message: 'Drive folders created/verified',
        folder_link: folderLink,
        folders
      });
    } catch (error) {
      console.error('Error setting up Drive folders:', error);
      res.status(500).json({ error: 'Failed to setup Drive folders' });
    }
  });

  // ============================================
  // LINEAR FEATURES (Trails & Rivers) ENDPOINTS
  // ============================================

  // Get all linear features (admin view includes all fields)
  router.get('/linear-features', isAdmin, async (req, res) => {
    try {
      const result = await pool.query(`
        SELECT * FROM pois
        WHERE deleted IS NULL OR deleted = FALSE
        ORDER BY feature_type, name
      `);
      res.json(result.rows);
    } catch (error) {
      console.error('Error fetching linear features:', error);
      res.status(500).json({ error: 'Failed to fetch linear features' });
    }
  });

  // Create linear feature
  router.post('/linear-features', isAdmin, async (req, res) => {
    try {
      const {
        name, feature_type, geometry, property_owner, brief_description,
        era, historical_description, primary_activities, surface, pets,
        cell_signal, more_info_link, length_miles, difficulty
      } = req.body;

      if (!name || !feature_type || !geometry) {
        return res.status(400).json({ error: 'Name, feature_type, and geometry are required' });
      }

      if (!['trail', 'river'].includes(feature_type)) {
        return res.status(400).json({ error: 'feature_type must be "trail" or "river"' });
      }

      const result = await pool.query(`
        INSERT INTO pois (
          name, poi_type, geometry, property_owner, brief_description,
          era, historical_description, primary_activities, surface, pets,
          cell_signal, more_info_link, length_miles, difficulty, locally_modified
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, TRUE)
        RETURNING *
      `, [
        name, feature_type, JSON.stringify(geometry), property_owner, brief_description,
        era, historical_description, primary_activities, surface, pets,
        cell_signal, more_info_link, length_miles, difficulty
      ]);

      console.log(`Admin ${req.user.email} created linear feature: ${name}`);
      res.status(201).json(result.rows[0]);
    } catch (error) {
      console.error('Error creating linear feature:', error);
      if (error.code === '23505') {
        res.status(409).json({ error: 'A feature with this name and type already exists' });
      } else {
        res.status(500).json({ error: 'Failed to create linear feature' });
      }
    }
  });

  // Update linear feature
  router.put('/linear-features/:id', isAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const allowedFields = [
        'name', 'poi_type', 'geometry', 'property_owner', 'brief_description',
        'era', 'historical_description', 'primary_activities', 'surface', 'pets',
        'cell_signal', 'more_info_link', 'length_miles', 'difficulty'
      ];

      // Map feature_type to poi_type for backward compatibility
      if (req.body.feature_type && !req.body.poi_type) {
        req.body.poi_type = req.body.feature_type;
      }

      const updates = [];
      const values = [];
      let paramIndex = 1;

      for (const field of allowedFields) {
        if (req.body[field] !== undefined) {
          updates.push(`${field} = $${paramIndex}`);
          values.push(field === 'geometry' ? JSON.stringify(req.body[field]) : req.body[field]);
          paramIndex++;
        }
      }

      if (updates.length === 0) {
        return res.status(400).json({ error: 'No valid fields to update' });
      }

      updates.push(`updated_at = CURRENT_TIMESTAMP`);
      updates.push(`locally_modified = TRUE`);
      updates.push(`synced = FALSE`);
      values.push(id);

      // Return all columns except geometry (which can be very large)
      const result = await pool.query(`
        UPDATE pois SET ${updates.join(', ')}
        WHERE id = $${paramIndex}
        RETURNING id, name, poi_type, latitude, longitude, property_owner,
                  brief_description, era, historical_description, primary_activities,
                  surface, pets, cell_signal, more_info_link, length_miles, difficulty,
                  image_mime_type, image_drive_file_id, geometry_drive_file_id,
                  locally_modified, deleted, synced, created_at, updated_at
      `, values);

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Linear feature not found' });
      }

      // Queue sync operation (only store essential data, not full geometry)
      await queuePOISync('UPDATE', id, { id, name: result.rows[0].name, poi_type: result.rows[0].poi_type });

      console.log(`Admin ${req.user.email} updated linear feature ${id}`);
      res.json(result.rows[0]);
    } catch (error) {
      console.error('Error updating linear feature:', error);
      res.status(500).json({ error: 'Failed to update linear feature' });
    }
  });

  // Delete linear feature (soft delete)
  router.delete('/linear-features/:id', isAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const result = await pool.query(`
        UPDATE pois
        SET deleted = TRUE, updated_at = CURRENT_TIMESTAMP, locally_modified = TRUE, synced = FALSE
        WHERE id = $1
        RETURNING id, name
      `, [id]);

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Linear feature not found' });
      }

      // Queue sync operation
      await queuePOISync('DELETE', id, result.rows[0]);

      console.log(`Admin ${req.user.email} deleted linear feature ${id}`);
      res.json({ success: true, deleted: result.rows[0] });
    } catch (error) {
      console.error('Error deleting linear feature:', error);
      res.status(500).json({ error: 'Failed to delete linear feature' });
    }
  });

  // Upload image for linear feature
  router.post('/linear-features/:id/image', isAdmin, imageUpload.single('image'), async (req, res) => {
    try {
      const { id } = req.params;

      if (!req.file) {
        return res.status(400).json({ error: 'No image file provided' });
      }

      const result = await pool.query(`
        UPDATE pois
        SET image_data = $1, image_mime_type = $2, updated_at = CURRENT_TIMESTAMP, locally_modified = TRUE
        WHERE id = $3
        RETURNING id, name, image_mime_type
      `, [req.file.buffer, req.file.mimetype, id]);

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Linear feature not found' });
      }

      console.log(`Admin ${req.user.email} uploaded image for linear feature ${id}`);
      res.json({
        success: true,
        feature: result.rows[0]
      });
    } catch (error) {
      console.error('Error uploading linear feature image:', error);
      res.status(500).json({ error: 'Failed to upload image' });
    }
  });

  // Delete image for linear feature
  router.delete('/linear-features/:id/image', isAdmin, async (req, res) => {
    try {
      const { id } = req.params;

      const result = await pool.query(`
        UPDATE pois
        SET image_data = NULL, image_mime_type = NULL, image_drive_file_id = NULL,
            updated_at = CURRENT_TIMESTAMP, locally_modified = TRUE
        WHERE id = $1
        RETURNING id, name
      `, [id]);

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Linear feature not found' });
      }

      console.log(`Admin ${req.user.email} deleted image for linear feature ${id}`);
      res.json({ success: true });
    } catch (error) {
      console.error('Error deleting linear feature image:', error);
      res.status(500).json({ error: 'Failed to delete image' });
    }
  });

  // Import trails and rivers from GeoJSON files
  router.post('/linear-features/import', isAdmin, async (req, res) => {
    try {
      const { feature_type } = req.body; // 'trail', 'river', or 'all'
      // Use STATIC_PATH in container, fall back to dev path
      const staticPath = process.env.STATIC_PATH || path.join(__dirname, '../../frontend/public');
      const dataPath = path.join(staticPath, 'data');

      const results = { trails: 0, rivers: 0, errors: [] };

      // Helper function to consolidate features by name
      function consolidateFeatures(features) {
        const byName = {};
        for (const feature of features) {
          const name = feature.properties?.name || 'Unnamed';
          if (!byName[name]) {
            byName[name] = [];
          }
          byName[name].push(feature.geometry);
        }

        const consolidated = [];
        for (const [name, geometries] of Object.entries(byName)) {
          let geometry;
          if (geometries.length === 1) {
            geometry = geometries[0];
          } else {
            // Merge into MultiLineString
            const allCoords = geometries.map(g =>
              g.type === 'MultiLineString' ? g.coordinates : [g.coordinates]
            ).flat();
            geometry = { type: 'MultiLineString', coordinates: allCoords };
          }
          consolidated.push({ name, geometry });
        }
        return consolidated;
      }

      // Import trails
      if (feature_type === 'trail' || feature_type === 'all') {
        try {
          const trailsFile = path.join(dataPath, 'cvnp-trails.geojson');
          const trailsData = JSON.parse(await fs.readFile(trailsFile, 'utf-8'));
          const consolidatedTrails = consolidateFeatures(trailsData.features);

          for (const trail of consolidatedTrails) {
            try {
              await pool.query(`
                INSERT INTO pois (name, poi_type, geometry)
                VALUES ($1, 'trail', $2)
                ON CONFLICT (name) DO UPDATE SET
                  geometry = EXCLUDED.geometry,
                  poi_type = EXCLUDED.poi_type,
                  updated_at = CURRENT_TIMESTAMP
              `, [trail.name, JSON.stringify(trail.geometry)]);
              results.trails++;
            } catch (err) {
              results.errors.push(`Trail "${trail.name}": ${err.message}`);
            }
          }
        } catch (err) {
          results.errors.push(`Failed to read trails file: ${err.message}`);
        }
      }

      // Import rivers
      if (feature_type === 'river' || feature_type === 'all') {
        try {
          const riverFile = path.join(dataPath, 'cvnp-river.geojson');
          const riverData = JSON.parse(await fs.readFile(riverFile, 'utf-8'));
          const consolidatedRivers = consolidateFeatures(riverData.features);

          for (const river of consolidatedRivers) {
            try {
              await pool.query(`
                INSERT INTO pois (name, poi_type, geometry)
                VALUES ($1, 'river', $2)
                ON CONFLICT (name) DO UPDATE SET
                  geometry = EXCLUDED.geometry,
                  poi_type = EXCLUDED.poi_type,
                  updated_at = CURRENT_TIMESTAMP
              `, [river.name, JSON.stringify(river.geometry)]);
              results.rivers++;
            } catch (err) {
              results.errors.push(`River "${river.name}": ${err.message}`);
            }
          }
        } catch (err) {
          results.errors.push(`Failed to read river file: ${err.message}`);
        }
      }

      console.log(`Admin ${req.user.email} imported linear features: ${results.trails} trails, ${results.rivers} rivers`);
      res.json({
        success: true,
        imported: {
          trails: results.trails,
          rivers: results.rivers
        },
        errors: results.errors.length > 0 ? results.errors : undefined
      });
    } catch (error) {
      console.error('Error importing linear features:', error);
      res.status(500).json({ error: 'Failed to import linear features' });
    }
  });

  return router;
}
