import express from 'express';
import { isAdmin } from '../middleware/auth.js';
import {
  createSheetsService,
  createDriveService,
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
  SHEET_NAME
} from '../services/sheetsSync.js';

const router = express.Router();

export function createAdminRouter(pool) {
  // Helper to queue sync operation after a change
  async function queueDestinationSync(operation, recordId, data) {
    try {
      await queueSyncOperation(pool, operation, 'destinations', recordId, data);
    } catch (error) {
      console.error('Failed to queue sync operation:', error.message);
    }
  }
  // Update destination coordinates
  router.put('/destinations/:id/coordinates', isAdmin, async (req, res) => {
    const { id } = req.params;
    const { latitude, longitude } = req.body;

    if (latitude === undefined || longitude === undefined) {
      return res.status(400).json({ error: 'Latitude and longitude are required' });
    }

    // Validate coordinates are within reasonable bounds for CVNP area
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
        `UPDATE destinations
         SET latitude = $1, longitude = $2, updated_at = CURRENT_TIMESTAMP, locally_modified = TRUE, synced = FALSE
         WHERE id = $3
         RETURNING *`,
        [lat, lng, id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Destination not found' });
      }

      // Queue sync operation
      await queueDestinationSync('UPDATE', id, result.rows[0]);

      console.log(`Admin ${req.user.email} updated coordinates for destination ${id}: ${lat}, ${lng}`);
      res.json(result.rows[0]);
    } catch (error) {
      console.error('Error updating coordinates:', error);
      res.status(500).json({ error: 'Failed to update coordinates' });
    }
  });

  // Update destination (all editable fields)
  router.put('/destinations/:id', isAdmin, async (req, res) => {
    const { id } = req.params;
    const allowedFields = [
      'name', 'latitude', 'longitude', 'property_owner', 'brief_description',
      'era', 'historical_description', 'primary_activities', 'surface',
      'pets', 'cell_signal', 'more_info_link', 'image_url', 'icon_type'
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
        `UPDATE destinations
         SET ${setClause}, updated_at = CURRENT_TIMESTAMP, locally_modified = TRUE, synced = FALSE
         WHERE id = $${paramIndex}
         RETURNING *`,
        values
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Destination not found' });
      }

      // Queue sync operation
      await queueDestinationSync('UPDATE', id, result.rows[0]);

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
      'primary_activities', 'surface', 'pets', 'cell_signal', 'more_info_link', 'image_url', 'icon_type'
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
        `INSERT INTO destinations (${fields.join(', ')}, created_at, updated_at, locally_modified, synced)
         VALUES (${placeholders}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, TRUE, FALSE)
         RETURNING *`,
        values
      );

      // Queue sync operation
      await queueDestinationSync('INSERT', result.rows[0].id, result.rows[0]);

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
        `UPDATE destinations
         SET deleted = TRUE, locally_modified = TRUE, synced = FALSE, updated_at = CURRENT_TIMESTAMP
         WHERE id = $1
         RETURNING id, name`,
        [id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Destination not found' });
      }

      // Queue sync operation (delete from sheet)
      await queueDestinationSync('DELETE', id, { name: result.rows[0].name });

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
        'SELECT id, name, icon, sort_order FROM activities ORDER BY sort_order, name'
      );
      res.json(result.rows);
    } catch (error) {
      console.error('Error fetching activities:', error);
      res.status(500).json({ error: 'Failed to fetch activities' });
    }
  });

  // Create new activity (admin only)
  router.post('/activities', isAdmin, async (req, res) => {
    const { name, icon } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Activity name is required' });
    }

    try {
      // Get max sort_order
      const maxOrder = await pool.query('SELECT COALESCE(MAX(sort_order), 0) + 1 as next_order FROM activities');
      const sortOrder = maxOrder.rows[0].next_order;

      const result = await pool.query(
        `INSERT INTO activities (name, icon, sort_order)
         VALUES ($1, $2, $3)
         RETURNING id, name, icon, sort_order`,
        [name.trim(), icon || null, sortOrder]
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
    const { name, icon, sort_order } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Activity name is required' });
    }

    try {
      const result = await pool.query(
        `UPDATE activities
         SET name = $1, icon = $2, sort_order = COALESCE($3, sort_order), updated_at = CURRENT_TIMESTAMP
         WHERE id = $4
         RETURNING id, name, icon, sort_order`,
        [name.trim(), icon || null, sort_order, id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Activity not found' });
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
      const result = await pool.query(
        `UPDATE eras
         SET name = $1, year_start = $2, year_end = $3, description = $4,
             sort_order = COALESCE($5, sort_order), updated_at = CURRENT_TIMESTAMP
         WHERE id = $6
         RETURNING id, name, year_start, year_end, description, sort_order`,
        [name.trim(), year_start || null, year_end || null, description || null, sort_order, id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Era not found' });
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

  // Update surface (admin only)
  router.put('/surfaces/:id', isAdmin, async (req, res) => {
    const { id } = req.params;
    const { name, description, sort_order } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Surface name is required' });
    }

    try {
      const result = await pool.query(
        `UPDATE surfaces
         SET name = $1, description = $2,
             sort_order = COALESCE($3, sort_order), updated_at = CURRENT_TIMESTAMP
         WHERE id = $4
         RETURNING id, name, description, sort_order`,
        [name.trim(), description || null, sort_order, id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Surface not found' });
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

  // Reorder surfaces (admin only)
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

      // Verify credentials by trying to use them
      if (spreadsheetInfo.configured) {
        // Try to access the configured spreadsheet
        try {
          const sheets = createSheetsService(credentials);
          await sheets.spreadsheets.get({
            spreadsheetId: spreadsheetInfo.id,
            fields: 'spreadsheetId'
          });

          // Check if the spreadsheet is in the trash
          try {
            const drive = createDriveService(credentials);
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
      const result = await createAppSpreadsheet(sheets, pool, req.user.id);

      console.log(`Admin ${req.user.email} created spreadsheet: ${result.id}`);
      res.json({
        success: true,
        message: 'Spreadsheet created successfully',
        spreadsheet: result
      });
    } catch (error) {
      console.error('Error creating spreadsheet:', error);
      res.status(500).json({
        error: 'Failed to create spreadsheet',
        message: error.message
      });
    }
  });

  // Push all data from database to Google Sheets (Destinations + Activities + Eras + Surfaces)
  router.post('/sync/push', isAdmin, async (req, res) => {
    try {
      // Check if user has Google OAuth credentials
      if (!req.user.oauth_credentials) {
        return res.status(401).json({
          error: 'Google authentication required',
          message: 'Please sign in with Google to sync data'
        });
      }

      const sheets = createSheetsService(req.user.oauth_credentials);

      // Push Destinations
      const destCount = await pushAllToSheets(sheets, pool);

      // Push Activities
      const actCount = await pushActivitiesToSheets(sheets, pool);

      // Push Eras
      const erasCount = await pushErasToSheets(sheets, pool);

      // Push Surfaces
      const surfacesCount = await pushSurfacesToSheets(sheets, pool);

      console.log(`Admin ${req.user.email} pushed ${destCount} destinations, ${actCount} activities, ${erasCount} eras, and ${surfacesCount} surfaces to Google Sheets`);
      res.json({
        success: true,
        message: `Pushed ${destCount} destinations, ${actCount} activities, ${erasCount} eras, and ${surfacesCount} surfaces to Google Sheets`,
        destinations: destCount,
        activities: actCount,
        eras: erasCount,
        surfaces: surfacesCount
      });
    } catch (error) {
      console.error('Error pushing to sheets:', error);
      res.status(500).json({
        error: 'Failed to push to Google Sheets',
        message: error.message
      });
    }
  });

  // Pull all data from Google Sheets to database (Destinations + Activities + Eras + Surfaces)
  router.post('/sync/pull', isAdmin, async (req, res) => {
    try {
      // Check if user has Google OAuth credentials
      if (!req.user.oauth_credentials) {
        return res.status(401).json({
          error: 'Google authentication required',
          message: 'Please sign in with Google to sync data'
        });
      }

      const sheets = createSheetsService(req.user.oauth_credentials);

      // Pull Destinations
      const destCount = await pullAllFromSheets(sheets, pool);

      // Pull Activities
      const actCount = await pullActivitiesFromSheets(sheets, pool);

      // Pull Eras
      const erasCount = await pullErasFromSheets(sheets, pool);

      // Pull Surfaces
      const surfacesCount = await pullSurfacesFromSheets(sheets, pool);

      console.log(`Admin ${req.user.email} pulled ${destCount} destinations, ${actCount} activities, ${erasCount} eras, and ${surfacesCount} surfaces from Google Sheets`);
      res.json({
        success: true,
        message: `Pulled ${destCount} destinations, ${actCount} activities, ${erasCount} eras, and ${surfacesCount} surfaces from Google Sheets`,
        destinations: destCount,
        activities: actCount,
        eras: erasCount,
        surfaces: surfacesCount
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

      const sheets = createSheetsService(req.user.oauth_credentials);
      const result = await processSyncQueue(sheets, pool);

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

  // Wipe the local database (delete all destinations)
  router.delete('/sync/wipe-database', isAdmin, async (req, res) => {
    try {
      // Delete all destinations
      const destResult = await pool.query('DELETE FROM destinations RETURNING id');
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

  return router;
}
