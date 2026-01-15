import { google } from 'googleapis';
import {
  ensureDriveFolders,
  moveFileToFolder,
  getDriveSetting,
  setDriveSetting,
  getAllDriveSettings,
  uploadIconToDrive,
  downloadFileFromDrive,
  deleteFileFromDrive
} from './driveImageService.js';

// Default source spreadsheet (read-only, for initial import via CSV)
const SOURCE_SPREADSHEET_ID = '1uSrTrLadkvfy8eeKlhJD0V-F79sOTYC06qOw6Z4YUiw';
const SOURCE_SHEET_NAME = 'CVNP Discovery Dataset Table Export';

// The app's own spreadsheet sheet names
const APP_SHEET_NAME = 'Destinations';
const ACTIVITIES_SHEET_NAME = 'Activities';
const ERAS_SHEET_NAME = 'Eras';
const SURFACES_SHEET_NAME = 'Surfaces';
const ICONS_SHEET_NAME = 'Icons';
const INTEGRATION_SHEET_NAME = 'Google Integration';
const LINEAR_FEATURES_SHEET_NAME = 'Trails & Rivers';

// Column mapping for the destinations spreadsheet
// Note: image_url and icon_type removed - images stored in DB via Drive, icons auto-determined
const COLUMNS = {
  name: 0,
  latitude: 1,
  longitude: 2,
  property_owner: 3,
  brief_description: 4,
  era: 5,
  historical_description: 6,
  primary_activities: 7,
  surface: 8,
  pets: 9,
  cell_signal: 10,
  more_info_link: 11,
  image_drive_file_id: 12
};

// Headers for the destinations spreadsheet
const HEADERS = [
  'Name', 'Latitude', 'Longitude', 'Property Owner', 'Brief Description',
  'Era', 'Historical Description', 'Primary Activities', 'Surface',
  'Pets', 'Cell Signal', 'More Info Link', 'Image Drive File ID'
];

// Column mapping for the activities spreadsheet (icon removed - now in icons table)
const ACTIVITIES_COLUMNS = {
  name: 0,
  sort_order: 1
};

// Headers for the activities spreadsheet
const ACTIVITIES_HEADERS = ['Name', 'Sort Order'];

// Column mapping for the eras spreadsheet
const ERAS_COLUMNS = {
  name: 0,
  year_start: 1,
  year_end: 2,
  description: 3,
  sort_order: 4
};

// Headers for the eras spreadsheet
const ERAS_HEADERS = ['Name', 'Year Start', 'Year End', 'Description', 'Sort Order'];

// Column mapping for the surfaces spreadsheet
const SURFACES_COLUMNS = {
  name: 0,
  description: 1,
  sort_order: 2
};

// Headers for the surfaces spreadsheet
const SURFACES_HEADERS = ['Name', 'Description', 'Sort Order'];

// Column mapping for the icons spreadsheet
const ICONS_COLUMNS = {
  name: 0,
  label: 1,
  svg_filename: 2,
  title_keywords: 3,
  activity_fallbacks: 4,
  sort_order: 5,
  enabled: 6,
  drive_file_id: 7
};

// Headers for the icons spreadsheet
const ICONS_HEADERS = ['Name', 'Label', 'SVG Filename', 'Title Keywords', 'Activity Fallbacks', 'Sort Order', 'Enabled', 'Drive File ID'];

// Column mapping for the integration settings spreadsheet
const INTEGRATION_COLUMNS = {
  setting: 0,
  value: 1,
  updated_at: 2
};

// Headers for the integration settings spreadsheet
const INTEGRATION_HEADERS = ['Setting', 'Value', 'Updated At'];

// Column mapping for the linear features (trails & rivers) spreadsheet
const LINEAR_FEATURES_COLUMNS = {
  name: 0,
  feature_type: 1,
  property_owner: 2,
  brief_description: 3,
  era: 4,
  historical_description: 5,
  primary_activities: 6,
  surface: 7,
  pets: 8,
  cell_signal: 9,
  more_info_link: 10,
  length_miles: 11,
  difficulty: 12,
  image_drive_file_id: 13
};

// Headers for the linear features spreadsheet
// Note: geometry not synced to sheets (too large), stored in database only
const LINEAR_FEATURES_HEADERS = [
  'Name', 'Type', 'Property Owner', 'Brief Description', 'Era', 'Historical Description',
  'Primary Activities', 'Surface', 'Pets', 'Cell Signal', 'More Info Link',
  'Length (miles)', 'Difficulty', 'Image Drive File ID'
];

/**
 * Create Google Sheets service using OAuth credentials from session
 */
export function createSheetsService(credentials) {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );
  oauth2Client.setCredentials(credentials);
  return google.sheets({ version: 'v4', auth: oauth2Client });
}

/**
 * Create Google Drive service using OAuth credentials
 */
export function createDriveService(credentials) {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );
  oauth2Client.setCredentials(credentials);
  return google.drive({ version: 'v3', auth: oauth2Client });
}

/**
 * Check if a file is in the trash
 */
export async function isFileTrashed(drive, fileId) {
  try {
    const response = await drive.files.get({
      fileId,
      fields: 'trashed'
    });
    return response.data.trashed === true;
  } catch (error) {
    // If we can't access the file, it might be permanently deleted
    if (error.code === 404) {
      return null; // File not found (permanently deleted)
    }
    throw error;
  }
}

/**
 * Get the configured spreadsheet ID from the database
 */
export async function getSpreadsheetId(pool) {
  const result = await pool.query(
    "SELECT value FROM admin_settings WHERE key = 'sync_spreadsheet_id'"
  );
  return result.rows[0]?.value || null;
}

/**
 * Save the spreadsheet ID to the database
 */
export async function setSpreadsheetId(pool, spreadsheetId, userId = null) {
  await pool.query(`
    INSERT INTO admin_settings (key, value, updated_at, updated_by)
    VALUES ('sync_spreadsheet_id', $1, CURRENT_TIMESTAMP, $2)
    ON CONFLICT (key) DO UPDATE SET
      value = EXCLUDED.value,
      updated_at = CURRENT_TIMESTAMP,
      updated_by = EXCLUDED.updated_by
  `, [spreadsheetId, userId]);
}

/**
 * Create a new spreadsheet for the app with proper headers
 * If drive is provided, the spreadsheet will be moved into the Roots of The Valley folder
 */
export async function createAppSpreadsheet(sheets, pool, userId = null, drive = null) {
  // Ensure the ROTV folder structure exists if drive is provided
  let rootFolderId = null;
  if (drive) {
    const folders = await ensureDriveFolders(drive, pool);
    rootFolderId = folders.rootFolderId;
  }

  // Create the spreadsheet with all sheets: Destinations, Activities, Eras, Surfaces, Icons, Google Integration
  const response = await sheets.spreadsheets.create({
    requestBody: {
      properties: {
        title: 'Roots of The Valley - Destinations'
      },
      sheets: [
        {
          properties: {
            title: APP_SHEET_NAME,
            gridProperties: {
              frozenRowCount: 1 // Freeze header row
            }
          }
        },
        {
          properties: {
            title: ACTIVITIES_SHEET_NAME,
            gridProperties: {
              frozenRowCount: 1 // Freeze header row
            }
          }
        },
        {
          properties: {
            title: ERAS_SHEET_NAME,
            gridProperties: {
              frozenRowCount: 1 // Freeze header row
            }
          }
        },
        {
          properties: {
            title: SURFACES_SHEET_NAME,
            gridProperties: {
              frozenRowCount: 1 // Freeze header row
            }
          }
        },
        {
          properties: {
            title: ICONS_SHEET_NAME,
            gridProperties: {
              frozenRowCount: 1 // Freeze header row
            }
          }
        },
        {
          properties: {
            title: INTEGRATION_SHEET_NAME,
            gridProperties: {
              frozenRowCount: 1 // Freeze header row
            }
          }
        }
      ]
    }
  });

  const spreadsheetId = response.data.spreadsheetId;
  const spreadsheetUrl = response.data.spreadsheetUrl;

  // Add headers to the Destinations sheet
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `'${APP_SHEET_NAME}'!A1:M1`,
    valueInputOption: 'RAW',
    requestBody: {
      values: [HEADERS]
    }
  });

  // Add headers to the Activities sheet
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `'${ACTIVITIES_SHEET_NAME}'!A1:B1`,
    valueInputOption: 'RAW',
    requestBody: {
      values: [ACTIVITIES_HEADERS]
    }
  });

  // Add headers to the Eras sheet
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `'${ERAS_SHEET_NAME}'!A1:E1`,
    valueInputOption: 'RAW',
    requestBody: {
      values: [ERAS_HEADERS]
    }
  });

  // Add headers to the Surfaces sheet
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `'${SURFACES_SHEET_NAME}'!A1:C1`,
    valueInputOption: 'RAW',
    requestBody: {
      values: [SURFACES_HEADERS]
    }
  });

  // Add headers to the Icons sheet
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `'${ICONS_SHEET_NAME}'!A1:H1`,
    valueInputOption: 'RAW',
    requestBody: {
      values: [ICONS_HEADERS]
    }
  });

  // Add headers to the Google Integration sheet
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `'${INTEGRATION_SHEET_NAME}'!A1:C1`,
    valueInputOption: 'RAW',
    requestBody: {
      values: [INTEGRATION_HEADERS]
    }
  });

  // Format header rows (bold, background color) for all sheets
  const destinationsSheetId = response.data.sheets[0].properties.sheetId;
  const activitiesSheetId = response.data.sheets[1].properties.sheetId;
  const erasSheetId = response.data.sheets[2].properties.sheetId;
  const surfacesSheetId = response.data.sheets[3].properties.sheetId;
  const iconsSheetId = response.data.sheets[4].properties.sheetId;
  const integrationSheetId = response.data.sheets[5].properties.sheetId;

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [
        // Format Destinations header
        {
          repeatCell: {
            range: {
              sheetId: destinationsSheetId,
              startRowIndex: 0,
              endRowIndex: 1
            },
            cell: {
              userEnteredFormat: {
                backgroundColor: { red: 0.2, green: 0.4, blue: 0.1 },
                textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 } }
              }
            },
            fields: 'userEnteredFormat(backgroundColor,textFormat)'
          }
        },
        {
          autoResizeDimensions: {
            dimensions: {
              sheetId: destinationsSheetId,
              dimension: 'COLUMNS',
              startIndex: 0,
              endIndex: 13
            }
          }
        },
        // Format Activities header
        {
          repeatCell: {
            range: {
              sheetId: activitiesSheetId,
              startRowIndex: 0,
              endRowIndex: 1
            },
            cell: {
              userEnteredFormat: {
                backgroundColor: { red: 0.3, green: 0.2, blue: 0.5 },
                textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 } }
              }
            },
            fields: 'userEnteredFormat(backgroundColor,textFormat)'
          }
        },
        {
          autoResizeDimensions: {
            dimensions: {
              sheetId: activitiesSheetId,
              dimension: 'COLUMNS',
              startIndex: 0,
              endIndex: 3
            }
          }
        },
        // Format Eras header
        {
          repeatCell: {
            range: {
              sheetId: erasSheetId,
              startRowIndex: 0,
              endRowIndex: 1
            },
            cell: {
              userEnteredFormat: {
                backgroundColor: { red: 0.6, green: 0.4, blue: 0.2 },
                textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 } }
              }
            },
            fields: 'userEnteredFormat(backgroundColor,textFormat)'
          }
        },
        {
          autoResizeDimensions: {
            dimensions: {
              sheetId: erasSheetId,
              dimension: 'COLUMNS',
              startIndex: 0,
              endIndex: 5
            }
          }
        },
        // Format Surfaces header
        {
          repeatCell: {
            range: {
              sheetId: surfacesSheetId,
              startRowIndex: 0,
              endRowIndex: 1
            },
            cell: {
              userEnteredFormat: {
                backgroundColor: { red: 0.2, green: 0.5, blue: 0.5 },
                textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 } }
              }
            },
            fields: 'userEnteredFormat(backgroundColor,textFormat)'
          }
        },
        {
          autoResizeDimensions: {
            dimensions: {
              sheetId: surfacesSheetId,
              dimension: 'COLUMNS',
              startIndex: 0,
              endIndex: 3
            }
          }
        },
        // Format Icons header
        {
          repeatCell: {
            range: {
              sheetId: iconsSheetId,
              startRowIndex: 0,
              endRowIndex: 1
            },
            cell: {
              userEnteredFormat: {
                backgroundColor: { red: 0.5, green: 0.3, blue: 0.6 },
                textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 } }
              }
            },
            fields: 'userEnteredFormat(backgroundColor,textFormat)'
          }
        },
        {
          autoResizeDimensions: {
            dimensions: {
              sheetId: iconsSheetId,
              dimension: 'COLUMNS',
              startIndex: 0,
              endIndex: 8
            }
          }
        },
        // Format Google Integration header
        {
          repeatCell: {
            range: {
              sheetId: integrationSheetId,
              startRowIndex: 0,
              endRowIndex: 1
            },
            cell: {
              userEnteredFormat: {
                backgroundColor: { red: 0.1, green: 0.3, blue: 0.6 },
                textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 } }
              }
            },
            fields: 'userEnteredFormat(backgroundColor,textFormat)'
          }
        },
        {
          autoResizeDimensions: {
            dimensions: {
              sheetId: integrationSheetId,
              dimension: 'COLUMNS',
              startIndex: 0,
              endIndex: 3
            }
          }
        }
      ]
    }
  });

  // Save the spreadsheet ID to the database
  await setSpreadsheetId(pool, spreadsheetId, userId);

  // Record creation in sync status
  await pool.query(`
    INSERT INTO sync_status (key, value, updated_at)
    VALUES ('spreadsheet_created', $1, CURRENT_TIMESTAMP)
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = CURRENT_TIMESTAMP
  `, [new Date().toISOString()]);

  // Move the spreadsheet into the ROTV folder if drive is available
  if (drive && rootFolderId) {
    try {
      await moveFileToFolder(drive, spreadsheetId, rootFolderId);
      console.log('Spreadsheet moved to Roots of The Valley folder');
    } catch (error) {
      console.error('Failed to move spreadsheet to folder:', error.message);
      // Non-fatal error - spreadsheet is still usable at root level
    }
  }

  return {
    id: spreadsheetId,
    url: spreadsheetUrl,
    name: 'Roots of The Valley - Destinations'
  };
}

/**
 * Parse coordinate - accepts decimal degrees (41.2626) or legacy format (41.2626° N)
 */
function parseCoordinate(coordStr, type) {
  if (!coordStr) return null;
  const str = coordStr.toString().trim();

  // Try to parse as plain decimal degrees first
  const plainNum = parseFloat(str);
  if (!isNaN(plainNum)) return plainNum;

  // Fall back to parsing legacy format with direction indicators
  const numMatch = str.match(/[-]?[\d.]+/);
  if (!numMatch) return null;
  let value = parseFloat(numMatch[0]);
  if (isNaN(value)) return null;
  const upperStr = str.toUpperCase();
  if (type === 'lat' && upperStr.includes('S')) {
    value = -Math.abs(value);
  } else if (type === 'lng' && upperStr.includes('W')) {
    value = -Math.abs(value);
  }
  return value;
}

/**
 * Parse cell signal (could be "4/5" or just "4")
 */
function parseCellSignal(cellStr) {
  if (!cellStr) return null;
  const match = cellStr.toString().match(/(\d)/);
  return match ? parseInt(match[1]) : null;
}

/**
 * Format coordinate for spreadsheet - decimal degrees (e.g., 41.2626 or -81.4193)
 */
function formatCoordinate(value, type) {
  if (value === null || value === undefined) return '';
  const num = parseFloat(value);
  if (isNaN(num)) return '';
  return num.toString();
}

/**
 * Format cell signal for spreadsheet (e.g., "4/5")
 */
function formatCellSignal(level) {
  if (level === null || level === undefined) return '';
  return `${level}/5`;
}

/**
 * Convert a spreadsheet row to a destination object
 * Note: image_url and icon_type not in spreadsheet - images stored in DB, icons auto-determined
 */
function rowToDestination(row) {
  return {
    name: row[COLUMNS.name] || '',
    latitude: parseCoordinate(row[COLUMNS.latitude], 'lat'),
    longitude: parseCoordinate(row[COLUMNS.longitude], 'lng'),
    property_owner: row[COLUMNS.property_owner] || null,
    brief_description: row[COLUMNS.brief_description] || null,
    era: row[COLUMNS.era] || null,
    historical_description: row[COLUMNS.historical_description] || null,
    primary_activities: row[COLUMNS.primary_activities] || null,
    surface: row[COLUMNS.surface] || null,
    pets: row[COLUMNS.pets] || null,
    cell_signal: parseCellSignal(row[COLUMNS.cell_signal]),
    more_info_link: row[COLUMNS.more_info_link] || null,
    image_drive_file_id: row[COLUMNS.image_drive_file_id] || null
  };
}

/**
 * Convert a destination object to a spreadsheet row
 * Note: image_url and icon_type not synced - images stored in DB, icons auto-determined
 */
function destinationToRow(dest) {
  return [
    dest.name || '',
    formatCoordinate(dest.latitude, 'lat'),
    formatCoordinate(dest.longitude, 'lng'),
    dest.property_owner || '',
    dest.brief_description || '',
    dest.era || '',
    dest.historical_description || '',
    dest.primary_activities || '',
    dest.surface || '',
    dest.pets || '',
    formatCellSignal(dest.cell_signal),
    dest.more_info_link || '',
    dest.image_drive_file_id || ''
  ];
}

/**
 * Read all destinations from a Google Sheet
 */
export async function readDestinations(sheets, spreadsheetId, sheetName) {
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `'${sheetName}'!A2:M`,
  });

  const rows = response.data.values || [];
  return rows
    .map(rowToDestination)
    .filter(d => d.name && d.name !== 'Name');
}

/**
 * Find the row number for a destination by name
 */
async function findRowByName(sheets, spreadsheetId, sheetName, name) {
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `'${sheetName}'!A:A`,
  });

  const values = response.data.values || [];
  for (let i = 0; i < values.length; i++) {
    if (values[i][0] === name) {
      return i + 1;
    }
  }
  return null;
}

/**
 * Append a new destination to the spreadsheet
 */
export async function appendDestination(sheets, spreadsheetId, destination) {
  const row = destinationToRow(destination);
  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `'${APP_SHEET_NAME}'!A:N`,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: {
      values: [row]
    }
  });
}

/**
 * Update an existing destination in the spreadsheet
 */
export async function updateDestination(sheets, spreadsheetId, name, destination) {
  const rowNum = await findRowByName(sheets, spreadsheetId, APP_SHEET_NAME, name);
  if (!rowNum) {
    await appendDestination(sheets, spreadsheetId, destination);
    return;
  }

  const row = destinationToRow(destination);
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `'${APP_SHEET_NAME}'!A${rowNum}:N${rowNum}`,
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: [row]
    }
  });
}

/**
 * Delete a destination from the spreadsheet
 */
export async function deleteDestination(sheets, spreadsheetId, name) {
  const rowNum = await findRowByName(sheets, spreadsheetId, APP_SHEET_NAME, name);
  if (!rowNum || rowNum === 1) return;

  const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId });
  const sheet = spreadsheet.data.sheets.find(
    s => s.properties.title === APP_SHEET_NAME
  );

  if (!sheet) return;

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [{
        deleteDimension: {
          range: {
            sheetId: sheet.properties.sheetId,
            dimension: 'ROWS',
            startIndex: rowNum - 1,
            endIndex: rowNum
          }
        }
      }]
    }
  });
}

/**
 * Push all destinations from database to the app's spreadsheet
 */
export async function pushAllToSheets(sheets, pool) {
  const spreadsheetId = await getSpreadsheetId(pool);
  if (!spreadsheetId) {
    throw new Error('No spreadsheet configured. Please create a spreadsheet first.');
  }

  const result = await pool.query(`
    SELECT * FROM destinations
    WHERE (deleted IS NULL OR deleted = FALSE)
    ORDER BY name
  `);

  const destinations = result.rows;

  // Clear existing data (keep header)
  await sheets.spreadsheets.values.clear({
    spreadsheetId,
    range: `'${APP_SHEET_NAME}'!A2:M`,
  });

  // Write all destinations
  if (destinations.length > 0) {
    const rows = destinations.map(destinationToRow);
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `'${APP_SHEET_NAME}'!A2:M`,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: rows
      }
    });
  }

  // Mark all as synced
  await pool.query(`
    UPDATE destinations SET synced = TRUE
    WHERE (deleted IS NULL OR deleted = FALSE)
  `);

  // Update sync status
  await pool.query(`
    INSERT INTO sync_status (key, value, updated_at)
    VALUES ('last_push', $1, CURRENT_TIMESTAMP)
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = CURRENT_TIMESTAMP
  `, [new Date().toISOString()]);

  return destinations.length;
}

/**
 * Pull all destinations from the app's spreadsheet to database
 */
export async function pullAllFromSheets(sheets, pool, drive = null) {
  const spreadsheetId = await getSpreadsheetId(pool);
  if (!spreadsheetId) {
    throw new Error('No spreadsheet configured. Please create a spreadsheet first.');
  }

  const destinations = await readDestinations(sheets, spreadsheetId, APP_SHEET_NAME);

  // Clear local data
  await pool.query('DELETE FROM destinations');

  // Insert all from sheets
  for (const dest of destinations) {
    if (!dest.name) continue;

    // Insert destination first to get the ID
    // Note: image_url set later after downloading from Drive, icon_type auto-determined
    const result = await pool.query(`
      INSERT INTO destinations (
        name, latitude, longitude, property_owner, brief_description,
        era, historical_description, primary_activities, surface,
        pets, cell_signal, more_info_link, image_drive_file_id,
        synced, locally_modified, deleted, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, TRUE, FALSE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      RETURNING id
    `, [
      dest.name, dest.latitude, dest.longitude, dest.property_owner,
      dest.brief_description, dest.era, dest.historical_description,
      dest.primary_activities, dest.surface, dest.pets, dest.cell_signal,
      dest.more_info_link, dest.image_drive_file_id
    ]);

    const destId = result.rows[0].id;

    // Download image from Drive if available
    if (dest.image_drive_file_id && drive) {
      try {
        const imageBuffer = await downloadFileFromDrive(drive, dest.image_drive_file_id);
        if (imageBuffer) {
          // Try to determine MIME type from buffer (first bytes indicate format)
          let mimeType = 'image/jpeg'; // default
          if (imageBuffer[0] === 0x89 && imageBuffer[1] === 0x50) {
            mimeType = 'image/png';
          } else if (imageBuffer[0] === 0x47 && imageBuffer[1] === 0x49) {
            mimeType = 'image/gif';
          } else if (imageBuffer[0] === 0x52 && imageBuffer[1] === 0x49) {
            mimeType = 'image/webp';
          }

          // Store image in database (URL computed from ID: /api/destinations/{id}/image)
          await pool.query(`
            UPDATE destinations
            SET image_data = $1, image_mime_type = $2
            WHERE id = $3
          `, [imageBuffer, mimeType, destId]);

          console.log(`Downloaded image for destination ${dest.name}`);
        }
      } catch (imageError) {
        console.warn(`Failed to download image for ${dest.name}:`, imageError.message);
        // Continue without the image
      }
    }
  }

  // Update sync status
  await pool.query(`
    INSERT INTO sync_status (key, value, updated_at)
    VALUES ('last_pull', $1, CURRENT_TIMESTAMP)
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = CURRENT_TIMESTAMP
  `, [new Date().toISOString()]);

  return destinations.length;
}

/**
 * Process the sync queue - push pending changes to sheets
 */
export async function processSyncQueue(sheets, pool) {
  const spreadsheetId = await getSpreadsheetId(pool);
  if (!spreadsheetId) {
    throw new Error('No spreadsheet configured. Please create a spreadsheet first.');
  }

  const result = await pool.query(`
    SELECT * FROM sync_queue ORDER BY created_at ASC
  `);

  const queue = result.rows;
  let processed = 0;
  const errors = [];

  for (const item of queue) {
    try {
      const data = item.data;

      if (item.table_name === 'destinations') {
        if (item.operation === 'INSERT') {
          await appendDestination(sheets, spreadsheetId, data);
        } else if (item.operation === 'UPDATE') {
          await updateDestination(sheets, spreadsheetId, data.name, data);
        } else if (item.operation === 'DELETE') {
          await deleteDestination(sheets, spreadsheetId, data.name);
        }
      }

      await pool.query(`
        UPDATE destinations SET synced = TRUE WHERE id = $1
      `, [item.record_id]);

      await pool.query('DELETE FROM sync_queue WHERE id = $1', [item.id]);
      processed++;
    } catch (error) {
      console.error(`Sync error for queue item ${item.id}:`, error.message);
      errors.push({ id: item.id, error: error.message });
    }
  }

  if (processed > 0) {
    await pool.query(`
      INSERT INTO sync_status (key, value, updated_at)
      VALUES ('last_sync', $1, CURRENT_TIMESTAMP)
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = CURRENT_TIMESTAMP
    `, [new Date().toISOString()]);
  }

  return { processed, errors };
}

/**
 * Queue a sync operation for background processing
 */
export async function queueSyncOperation(pool, operation, tableName, recordId, data) {
  await pool.query(`
    INSERT INTO sync_queue (operation, table_name, record_id, data, created_at)
    VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
  `, [operation, tableName, recordId, JSON.stringify(data)]);
}

/**
 * Get sync status information
 */
export async function getSyncStatus(pool) {
  const statusResult = await pool.query('SELECT * FROM sync_status');
  const queueResult = await pool.query('SELECT COUNT(*) as count FROM sync_queue');
  const unsyncedResult = await pool.query(`
    SELECT COUNT(*) as count FROM destinations
    WHERE (synced IS NULL OR synced = FALSE)
    AND (deleted IS NULL OR deleted = FALSE)
  `);

  const status = {};
  for (const row of statusResult.rows) {
    status[row.key] = row.value;
  }

  return {
    last_sync: status.last_sync || null,
    last_push: status.last_push || null,
    last_pull: status.last_pull || null,
    spreadsheet_created: status.spreadsheet_created || null,
    pending_operations: parseInt(queueResult.rows[0].count),
    unsynced_destinations: parseInt(unsyncedResult.rows[0].count)
  };
}

/**
 * Check if database has any destinations
 */
export async function isDatabaseEmpty(pool) {
  const result = await pool.query('SELECT COUNT(*) as count FROM destinations');
  return parseInt(result.rows[0].count) === 0;
}

/**
 * Get spreadsheet info for display
 */
export async function getSpreadsheetInfo(pool) {
  const spreadsheetId = await getSpreadsheetId(pool);
  if (!spreadsheetId) {
    return {
      configured: false,
      source: {
        id: SOURCE_SPREADSHEET_ID,
        name: SOURCE_SHEET_NAME,
        url: `https://docs.google.com/spreadsheets/d/${SOURCE_SPREADSHEET_ID}`
      }
    };
  }

  return {
    configured: true,
    id: spreadsheetId,
    name: 'Roots of The Valley - Destinations',
    sheetName: APP_SHEET_NAME,
    url: `https://docs.google.com/spreadsheets/d/${spreadsheetId}`,
    source: {
      id: SOURCE_SPREADSHEET_ID,
      name: SOURCE_SHEET_NAME,
      url: `https://docs.google.com/spreadsheets/d/${SOURCE_SPREADSHEET_ID}`
    }
  };
}

// ============================================
// Activities Sync Functions
// ============================================

/**
 * Convert a spreadsheet row to an activity object
 */
function rowToActivity(row) {
  return {
    name: row[ACTIVITIES_COLUMNS.name] || '',
    sort_order: parseInt(row[ACTIVITIES_COLUMNS.sort_order]) || 0
  };
}

/**
 * Convert an activity object to a spreadsheet row
 */
function activityToRow(activity) {
  return [
    activity.name || '',
    activity.sort_order || 0
  ];
}

/**
 * Read all activities from the Activities sheet
 */
export async function readActivities(sheets, spreadsheetId) {
  try {
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `'${ACTIVITIES_SHEET_NAME}'!A2:B`,
    });

    const rows = response.data.values || [];
    return rows
      .map(rowToActivity)
      .filter(a => a.name && a.name !== 'Name');
  } catch (error) {
    // If sheet doesn't exist, return empty array
    if (error.message?.includes('Unable to parse range')) {
      return [];
    }
    throw error;
  }
}

/**
 * Push all activities from database to the spreadsheet
 */
export async function pushActivitiesToSheets(sheets, pool) {
  const spreadsheetId = await getSpreadsheetId(pool);
  if (!spreadsheetId) {
    throw new Error('No spreadsheet configured. Please create a spreadsheet first.');
  }

  // Ensure Activities sheet exists
  await ensureActivitiesSheet(sheets, spreadsheetId);

  const result = await pool.query(`
    SELECT name, sort_order FROM activities
    ORDER BY sort_order, name
  `);

  const activities = result.rows;

  // Clear existing data (keep header)
  try {
    await sheets.spreadsheets.values.clear({
      spreadsheetId,
      range: `'${ACTIVITIES_SHEET_NAME}'!A2:B`,
    });
  } catch (error) {
    // Ignore if sheet is empty
  }

  // Write all activities
  if (activities.length > 0) {
    const rows = activities.map(activityToRow);
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `'${ACTIVITIES_SHEET_NAME}'!A2:B`,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: rows
      }
    });
  }

  // Update sync status
  await pool.query(`
    INSERT INTO sync_status (key, value, updated_at)
    VALUES ('last_activities_push', $1, CURRENT_TIMESTAMP)
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = CURRENT_TIMESTAMP
  `, [new Date().toISOString()]);

  return activities.length;
}

/**
 * Pull all activities from the spreadsheet to database
 */
export async function pullActivitiesFromSheets(sheets, pool) {
  const spreadsheetId = await getSpreadsheetId(pool);
  if (!spreadsheetId) {
    throw new Error('No spreadsheet configured. Please create a spreadsheet first.');
  }

  const activities = await readActivities(sheets, spreadsheetId);

  // Clear local activities
  await pool.query('DELETE FROM activities');

  // Insert all from sheets
  for (const activity of activities) {
    if (!activity.name) continue;

    await pool.query(`
      INSERT INTO activities (name, sort_order, created_at, updated_at)
      VALUES ($1, $2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT (name) DO UPDATE SET
        sort_order = EXCLUDED.sort_order,
        updated_at = CURRENT_TIMESTAMP
    `, [activity.name, activity.sort_order]);
  }

  // Update sync status
  await pool.query(`
    INSERT INTO sync_status (key, value, updated_at)
    VALUES ('last_activities_pull', $1, CURRENT_TIMESTAMP)
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = CURRENT_TIMESTAMP
  `, [new Date().toISOString()]);

  return activities.length;
}

/**
 * Ensure the Activities sheet exists in the spreadsheet
 */
async function ensureActivitiesSheet(sheets, spreadsheetId) {
  console.log(`Ensuring Activities sheet exists in spreadsheet ${spreadsheetId}`);
  try {
    // Check if Activities sheet exists
    const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId });
    const sheetNames = spreadsheet.data.sheets.map(s => s.properties.title);
    console.log('Existing sheets:', sheetNames);

    const activitiesSheet = spreadsheet.data.sheets.find(
      s => s.properties.title === ACTIVITIES_SHEET_NAME
    );

    if (!activitiesSheet) {
      console.log(`Activities sheet "${ACTIVITIES_SHEET_NAME}" not found, creating...`);
      // Create the Activities sheet
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [{
            addSheet: {
              properties: {
                title: ACTIVITIES_SHEET_NAME,
                gridProperties: {
                  frozenRowCount: 1
                }
              }
            }
          }]
        }
      });

      console.log('Activities sheet created successfully');

      // Add headers
      console.log('Adding headers to Activities sheet...');
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `'${ACTIVITIES_SHEET_NAME}'!A1:B1`,
        valueInputOption: 'RAW',
        requestBody: {
          values: [ACTIVITIES_HEADERS]
        }
      });
      console.log('Headers added');

      // Format header
      const updatedSpreadsheet = await sheets.spreadsheets.get({ spreadsheetId });
      const newSheet = updatedSpreadsheet.data.sheets.find(
        s => s.properties.title === ACTIVITIES_SHEET_NAME
      );

      if (newSheet) {
        await sheets.spreadsheets.batchUpdate({
          spreadsheetId,
          requestBody: {
            requests: [{
              repeatCell: {
                range: {
                  sheetId: newSheet.properties.sheetId,
                  startRowIndex: 0,
                  endRowIndex: 1
                },
                cell: {
                  userEnteredFormat: {
                    backgroundColor: { red: 0.3, green: 0.2, blue: 0.5 },
                    textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 } }
                  }
                },
                fields: 'userEnteredFormat(backgroundColor,textFormat)'
              }
            }]
          }
        });
      }
      console.log('Activities sheet setup complete');
    } else {
      console.log('Activities sheet already exists');
    }
  } catch (error) {
    console.error('Error ensuring Activities sheet:', error.message);
    throw error;
  }
}

// ============================================
// Eras Sync Functions
// ============================================

/**
 * Convert a spreadsheet row to an era object
 */
function rowToEra(row) {
  return {
    name: row[ERAS_COLUMNS.name] || '',
    year_start: row[ERAS_COLUMNS.year_start] ? parseInt(row[ERAS_COLUMNS.year_start]) : null,
    year_end: row[ERAS_COLUMNS.year_end] ? parseInt(row[ERAS_COLUMNS.year_end]) : null,
    description: row[ERAS_COLUMNS.description] || null,
    sort_order: parseInt(row[ERAS_COLUMNS.sort_order]) || 0
  };
}

/**
 * Convert an era object to a spreadsheet row
 */
function eraToRow(era) {
  return [
    era.name || '',
    era.year_start || '',
    era.year_end || '',
    era.description || '',
    era.sort_order || 0
  ];
}

/**
 * Read all eras from the Eras sheet
 */
export async function readEras(sheets, spreadsheetId) {
  try {
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `'${ERAS_SHEET_NAME}'!A2:E`,
    });

    const rows = response.data.values || [];
    return rows
      .map(rowToEra)
      .filter(e => e.name && e.name !== 'Name');
  } catch (error) {
    // If sheet doesn't exist, return empty array
    if (error.message?.includes('Unable to parse range')) {
      return [];
    }
    throw error;
  }
}

/**
 * Push all eras from database to the spreadsheet
 */
export async function pushErasToSheets(sheets, pool) {
  const spreadsheetId = await getSpreadsheetId(pool);
  if (!spreadsheetId) {
    throw new Error('No spreadsheet configured. Please create a spreadsheet first.');
  }

  // Ensure Eras sheet exists
  await ensureErasSheet(sheets, spreadsheetId);

  const result = await pool.query(`
    SELECT name, year_start, year_end, description, sort_order FROM eras
    ORDER BY sort_order, name
  `);

  const eras = result.rows;

  // Clear existing data (keep header)
  try {
    await sheets.spreadsheets.values.clear({
      spreadsheetId,
      range: `'${ERAS_SHEET_NAME}'!A2:E`,
    });
  } catch (error) {
    // Ignore if sheet is empty
  }

  // Write all eras
  if (eras.length > 0) {
    const rows = eras.map(eraToRow);
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `'${ERAS_SHEET_NAME}'!A2:E`,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: rows
      }
    });
  }

  // Update sync status
  await pool.query(`
    INSERT INTO sync_status (key, value, updated_at)
    VALUES ('last_eras_push', $1, CURRENT_TIMESTAMP)
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = CURRENT_TIMESTAMP
  `, [new Date().toISOString()]);

  return eras.length;
}

/**
 * Pull all eras from the spreadsheet to database
 */
export async function pullErasFromSheets(sheets, pool) {
  const spreadsheetId = await getSpreadsheetId(pool);
  if (!spreadsheetId) {
    throw new Error('No spreadsheet configured. Please create a spreadsheet first.');
  }

  const eras = await readEras(sheets, spreadsheetId);

  // Clear local eras
  await pool.query('DELETE FROM eras');

  // Insert all from sheets
  for (const era of eras) {
    if (!era.name) continue;

    await pool.query(`
      INSERT INTO eras (name, year_start, year_end, description, sort_order, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT (name) DO UPDATE SET
        year_start = EXCLUDED.year_start,
        year_end = EXCLUDED.year_end,
        description = EXCLUDED.description,
        sort_order = EXCLUDED.sort_order,
        updated_at = CURRENT_TIMESTAMP
    `, [era.name, era.year_start, era.year_end, era.description, era.sort_order]);
  }

  // Update sync status
  await pool.query(`
    INSERT INTO sync_status (key, value, updated_at)
    VALUES ('last_eras_pull', $1, CURRENT_TIMESTAMP)
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = CURRENT_TIMESTAMP
  `, [new Date().toISOString()]);

  return eras.length;
}

/**
 * Ensure the Eras sheet exists in the spreadsheet
 */
async function ensureErasSheet(sheets, spreadsheetId) {
  console.log(`Ensuring Eras sheet exists in spreadsheet ${spreadsheetId}`);
  try {
    // Check if Eras sheet exists
    const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId });
    const sheetNames = spreadsheet.data.sheets.map(s => s.properties.title);
    console.log('Existing sheets:', sheetNames);

    const erasSheet = spreadsheet.data.sheets.find(
      s => s.properties.title === ERAS_SHEET_NAME
    );

    if (!erasSheet) {
      console.log(`Eras sheet "${ERAS_SHEET_NAME}" not found, creating...`);
      // Create the Eras sheet
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [{
            addSheet: {
              properties: {
                title: ERAS_SHEET_NAME,
                gridProperties: {
                  frozenRowCount: 1
                }
              }
            }
          }]
        }
      });

      console.log('Eras sheet created successfully');

      // Add headers
      console.log('Adding headers to Eras sheet...');
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `'${ERAS_SHEET_NAME}'!A1:E1`,
        valueInputOption: 'RAW',
        requestBody: {
          values: [ERAS_HEADERS]
        }
      });
      console.log('Headers added');

      // Format header
      const updatedSpreadsheet = await sheets.spreadsheets.get({ spreadsheetId });
      const newSheet = updatedSpreadsheet.data.sheets.find(
        s => s.properties.title === ERAS_SHEET_NAME
      );

      if (newSheet) {
        await sheets.spreadsheets.batchUpdate({
          spreadsheetId,
          requestBody: {
            requests: [{
              repeatCell: {
                range: {
                  sheetId: newSheet.properties.sheetId,
                  startRowIndex: 0,
                  endRowIndex: 1
                },
                cell: {
                  userEnteredFormat: {
                    backgroundColor: { red: 0.6, green: 0.4, blue: 0.2 },
                    textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 } }
                  }
                },
                fields: 'userEnteredFormat(backgroundColor,textFormat)'
              }
            }]
          }
        });
      }
      console.log('Eras sheet setup complete');
    } else {
      console.log('Eras sheet already exists');
    }
  } catch (error) {
    console.error('Error ensuring Eras sheet:', error.message);
    throw error;
  }
}

// ============================================
// Surfaces Sync Functions
// ============================================

/**
 * Convert a spreadsheet row to a surface object
 */
function rowToSurface(row) {
  return {
    name: row[SURFACES_COLUMNS.name] || '',
    description: row[SURFACES_COLUMNS.description] || null,
    sort_order: parseInt(row[SURFACES_COLUMNS.sort_order]) || 0
  };
}

/**
 * Convert a surface object to a spreadsheet row
 */
function surfaceToRow(surface) {
  return [
    surface.name || '',
    surface.description || '',
    surface.sort_order || 0
  ];
}

/**
 * Read all surfaces from the Surfaces sheet
 */
export async function readSurfaces(sheets, spreadsheetId) {
  try {
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `'${SURFACES_SHEET_NAME}'!A2:C`,
    });

    const rows = response.data.values || [];
    return rows
      .map(rowToSurface)
      .filter(s => s.name && s.name !== 'Name');
  } catch (error) {
    // If sheet doesn't exist, return empty array
    if (error.message?.includes('Unable to parse range')) {
      return [];
    }
    throw error;
  }
}

/**
 * Push all surfaces from database to the spreadsheet
 */
export async function pushSurfacesToSheets(sheets, pool) {
  const spreadsheetId = await getSpreadsheetId(pool);
  if (!spreadsheetId) {
    throw new Error('No spreadsheet configured. Please create a spreadsheet first.');
  }

  // Ensure Surfaces sheet exists
  await ensureSurfacesSheet(sheets, spreadsheetId);

  const result = await pool.query(`
    SELECT name, description, sort_order FROM surfaces
    ORDER BY sort_order, name
  `);

  const surfaces = result.rows;

  // Clear existing data (keep header)
  try {
    await sheets.spreadsheets.values.clear({
      spreadsheetId,
      range: `'${SURFACES_SHEET_NAME}'!A2:C`,
    });
  } catch (error) {
    // Ignore if sheet is empty
  }

  // Write all surfaces
  if (surfaces.length > 0) {
    const rows = surfaces.map(surfaceToRow);
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `'${SURFACES_SHEET_NAME}'!A2:C`,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: rows
      }
    });
  }

  // Update sync status
  await pool.query(`
    INSERT INTO sync_status (key, value, updated_at)
    VALUES ('last_surfaces_push', $1, CURRENT_TIMESTAMP)
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = CURRENT_TIMESTAMP
  `, [new Date().toISOString()]);

  return surfaces.length;
}

/**
 * Pull all surfaces from the spreadsheet to database
 */
export async function pullSurfacesFromSheets(sheets, pool) {
  const spreadsheetId = await getSpreadsheetId(pool);
  if (!spreadsheetId) {
    throw new Error('No spreadsheet configured. Please create a spreadsheet first.');
  }

  const surfaces = await readSurfaces(sheets, spreadsheetId);

  // Clear local surfaces
  await pool.query('DELETE FROM surfaces');

  // Insert all from sheets
  for (const surface of surfaces) {
    if (!surface.name) continue;

    await pool.query(`
      INSERT INTO surfaces (name, description, sort_order, created_at, updated_at)
      VALUES ($1, $2, $3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT (name) DO UPDATE SET
        description = EXCLUDED.description,
        sort_order = EXCLUDED.sort_order,
        updated_at = CURRENT_TIMESTAMP
    `, [surface.name, surface.description, surface.sort_order]);
  }

  // Update sync status
  await pool.query(`
    INSERT INTO sync_status (key, value, updated_at)
    VALUES ('last_surfaces_pull', $1, CURRENT_TIMESTAMP)
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = CURRENT_TIMESTAMP
  `, [new Date().toISOString()]);

  return surfaces.length;
}

/**
 * Ensure the Surfaces sheet exists in the spreadsheet
 */
async function ensureSurfacesSheet(sheets, spreadsheetId) {
  console.log(`Ensuring Surfaces sheet exists in spreadsheet ${spreadsheetId}`);
  try {
    // Check if Surfaces sheet exists
    const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId });
    const sheetNames = spreadsheet.data.sheets.map(s => s.properties.title);
    console.log('Existing sheets:', sheetNames);

    const surfacesSheet = spreadsheet.data.sheets.find(
      s => s.properties.title === SURFACES_SHEET_NAME
    );

    if (!surfacesSheet) {
      console.log(`Surfaces sheet "${SURFACES_SHEET_NAME}" not found, creating...`);
      // Create the Surfaces sheet
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [{
            addSheet: {
              properties: {
                title: SURFACES_SHEET_NAME,
                gridProperties: {
                  frozenRowCount: 1
                }
              }
            }
          }]
        }
      });

      console.log('Surfaces sheet created successfully');

      // Add headers
      console.log('Adding headers to Surfaces sheet...');
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `'${SURFACES_SHEET_NAME}'!A1:C1`,
        valueInputOption: 'RAW',
        requestBody: {
          values: [SURFACES_HEADERS]
        }
      });
      console.log('Headers added');

      // Format header
      const updatedSpreadsheet = await sheets.spreadsheets.get({ spreadsheetId });
      const newSheet = updatedSpreadsheet.data.sheets.find(
        s => s.properties.title === SURFACES_SHEET_NAME
      );

      if (newSheet) {
        await sheets.spreadsheets.batchUpdate({
          spreadsheetId,
          requestBody: {
            requests: [{
              repeatCell: {
                range: {
                  sheetId: newSheet.properties.sheetId,
                  startRowIndex: 0,
                  endRowIndex: 1
                },
                cell: {
                  userEnteredFormat: {
                    backgroundColor: { red: 0.2, green: 0.5, blue: 0.5 },
                    textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 } }
                  }
                },
                fields: 'userEnteredFormat(backgroundColor,textFormat)'
              }
            }]
          }
        });
      }
      console.log('Surfaces sheet setup complete');
    } else {
      console.log('Surfaces sheet already exists');
    }
  } catch (error) {
    console.error('Error ensuring Surfaces sheet:', error.message);
    throw error;
  }
}

// ============================================
// Icons Sync Functions
// ============================================

/**
 * Convert a spreadsheet row to an icon object
 */
function rowToIcon(row) {
  return {
    name: row[ICONS_COLUMNS.name] || '',
    label: row[ICONS_COLUMNS.label] || '',
    svg_filename: row[ICONS_COLUMNS.svg_filename] || null,
    title_keywords: row[ICONS_COLUMNS.title_keywords] || null,
    activity_fallbacks: row[ICONS_COLUMNS.activity_fallbacks] || null,
    sort_order: parseInt(row[ICONS_COLUMNS.sort_order]) || 0,
    enabled: row[ICONS_COLUMNS.enabled] !== 'FALSE' && row[ICONS_COLUMNS.enabled] !== 'false',
    drive_file_id: row[ICONS_COLUMNS.drive_file_id] || null
  };
}

/**
 * Convert an icon object to a spreadsheet row
 */
function iconToRow(icon) {
  return [
    icon.name || '',
    icon.label || '',
    icon.svg_filename || '',
    icon.title_keywords || '',
    icon.activity_fallbacks || '',
    icon.sort_order || 0,
    icon.enabled ? 'TRUE' : 'FALSE',
    icon.drive_file_id || ''
  ];
}

/**
 * Read all icons from the Icons sheet
 */
export async function readIcons(sheets, spreadsheetId) {
  try {
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `'${ICONS_SHEET_NAME}'!A2:H`,
    });

    const rows = response.data.values || [];
    return rows
      .map(rowToIcon)
      .filter(i => i.name && i.name !== 'Name');
  } catch (error) {
    // If sheet doesn't exist, return empty array
    if (error.message?.includes('Unable to parse range')) {
      return [];
    }
    throw error;
  }
}

/**
 * Push all icons from database to the spreadsheet
 */
export async function pushIconsToSheets(sheets, pool) {
  const spreadsheetId = await getSpreadsheetId(pool);
  if (!spreadsheetId) {
    throw new Error('No spreadsheet configured. Please create a spreadsheet first.');
  }

  // Ensure Icons sheet exists
  await ensureIconsSheet(sheets, spreadsheetId);

  const result = await pool.query(`
    SELECT name, label, svg_filename, title_keywords, activity_fallbacks, sort_order, enabled, drive_file_id FROM icons
    ORDER BY sort_order, name
  `);

  const icons = result.rows;

  // Clear existing data (keep header)
  try {
    await sheets.spreadsheets.values.clear({
      spreadsheetId,
      range: `'${ICONS_SHEET_NAME}'!A2:H`,
    });
  } catch (error) {
    // Ignore if sheet is empty
  }

  // Write all icons
  if (icons.length > 0) {
    const rows = icons.map(iconToRow);
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `'${ICONS_SHEET_NAME}'!A2:H`,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: rows
      }
    });
  }

  // Update sync status
  await pool.query(`
    INSERT INTO sync_status (key, value, updated_at)
    VALUES ('last_icons_push', $1, CURRENT_TIMESTAMP)
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = CURRENT_TIMESTAMP
  `, [new Date().toISOString()]);

  return icons.length;
}

/**
 * Pull all icons from the spreadsheet to database
 * If drive is provided, downloads SVG content from Google Drive for icons with drive_file_id
 */
export async function pullIconsFromSheets(sheets, pool, drive = null) {
  const spreadsheetId = await getSpreadsheetId(pool);
  if (!spreadsheetId) {
    throw new Error('No spreadsheet configured. Please create a spreadsheet first.');
  }

  const icons = await readIcons(sheets, spreadsheetId);

  // Clear local icons
  await pool.query('DELETE FROM icons');

  // Insert all from sheets
  for (const icon of icons) {
    if (!icon.name) continue;

    // If drive_file_id exists and drive is available, download SVG content
    let svgContent = null;
    if (icon.drive_file_id && drive) {
      try {
        const buffer = await downloadFileFromDrive(drive, icon.drive_file_id);
        if (buffer) {
          svgContent = buffer.toString('utf-8');
          console.log(`Downloaded SVG for icon: ${icon.name}`);
        }
      } catch (error) {
        console.warn(`Failed to download icon ${icon.name} from Drive:`, error.message);
      }
    }

    await pool.query(`
      INSERT INTO icons (name, label, svg_filename, title_keywords, activity_fallbacks, sort_order, enabled, drive_file_id, svg_content, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT (name) DO UPDATE SET
        label = EXCLUDED.label,
        svg_filename = EXCLUDED.svg_filename,
        title_keywords = EXCLUDED.title_keywords,
        activity_fallbacks = EXCLUDED.activity_fallbacks,
        sort_order = EXCLUDED.sort_order,
        enabled = EXCLUDED.enabled,
        drive_file_id = EXCLUDED.drive_file_id,
        svg_content = EXCLUDED.svg_content,
        updated_at = CURRENT_TIMESTAMP
    `, [icon.name, icon.label, icon.svg_filename, icon.title_keywords, icon.activity_fallbacks, icon.sort_order, icon.enabled, icon.drive_file_id, svgContent]);
  }

  // Update sync status
  await pool.query(`
    INSERT INTO sync_status (key, value, updated_at)
    VALUES ('last_icons_pull', $1, CURRENT_TIMESTAMP)
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = CURRENT_TIMESTAMP
  `, [new Date().toISOString()]);

  return icons.length;
}

/**
 * Ensure the Icons sheet exists with proper headers
 */
export async function ensureIconsSheet(sheets, spreadsheetId) {
  try {
    // Get existing sheets
    const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId });
    const existingSheets = spreadsheet.data.sheets.map(s => s.properties.title);
    console.log('Existing sheets:', existingSheets);

    // Create Icons sheet if it doesn't exist
    if (!existingSheets.includes(ICONS_SHEET_NAME)) {
      console.log('Creating Icons sheet...');
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [{
            addSheet: {
              properties: {
                title: ICONS_SHEET_NAME,
                gridProperties: {
                  frozenRowCount: 1
                }
              }
            }
          }]
        }
      });

      console.log('Icons sheet created successfully');

      // Add headers
      console.log('Adding headers to Icons sheet...');
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `'${ICONS_SHEET_NAME}'!A1:G1`,
        valueInputOption: 'RAW',
        requestBody: {
          values: [ICONS_HEADERS]
        }
      });
      console.log('Headers added');

      // Format header
      const updatedSpreadsheet = await sheets.spreadsheets.get({ spreadsheetId });
      const newSheet = updatedSpreadsheet.data.sheets.find(
        s => s.properties.title === ICONS_SHEET_NAME
      );

      if (newSheet) {
        await sheets.spreadsheets.batchUpdate({
          spreadsheetId,
          requestBody: {
            requests: [{
              repeatCell: {
                range: {
                  sheetId: newSheet.properties.sheetId,
                  startRowIndex: 0,
                  endRowIndex: 1
                },
                cell: {
                  userEnteredFormat: {
                    backgroundColor: { red: 0.2, green: 0.4, blue: 0.6 },
                    textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 } }
                  }
                },
                fields: 'userEnteredFormat(backgroundColor,textFormat)'
              }
            }]
          }
        });
      }
      console.log('Icons sheet setup complete');
    } else {
      console.log('Icons sheet already exists');
    }
  } catch (error) {
    console.error('Error ensuring Icons sheet:', error.message);
    throw error;
  }
}

// ============================================
// Integration Settings Sync Functions
// ============================================

/**
 * Push integration settings (API keys, Drive folder IDs, etc.) to the spreadsheet
 */
export async function pushIntegrationToSheets(sheets, pool) {
  const spreadsheetId = await getSpreadsheetId(pool);
  if (!spreadsheetId) {
    throw new Error('No spreadsheet configured. Please create a spreadsheet first.');
  }

  // Ensure Integration sheet exists
  await ensureIntegrationSheet(sheets, spreadsheetId);

  // Get settings from admin_settings table
  const adminResult = await pool.query(`
    SELECT key, value, updated_at FROM admin_settings
    WHERE key IN ('gemini_api_key', 'gemini_prompt_brief', 'gemini_prompt_historical')
    ORDER BY key
  `);

  // Get Drive settings (folder IDs)
  const driveResult = await pool.query(`
    SELECT key, value, updated_at FROM drive_settings
    ORDER BY key
  `);

  // Combine both settings
  const settings = [...adminResult.rows, ...driveResult.rows];

  // Clear existing data (keep header)
  try {
    await sheets.spreadsheets.values.clear({
      spreadsheetId,
      range: `'${INTEGRATION_SHEET_NAME}'!A2:C`,
    });
  } catch (error) {
    // Ignore if sheet is empty
  }

  // Write all settings (including API keys - this is the user's private spreadsheet)
  if (settings.length > 0) {
    const rows = settings.map(s => [
      s.key,
      s.value || '',
      s.updated_at ? new Date(s.updated_at).toISOString() : ''
    ]);
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `'${INTEGRATION_SHEET_NAME}'!A2:C`,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: rows
      }
    });
  }

  return settings.length;
}

/**
 * Pull integration settings (API keys, etc.) from the spreadsheet
 */
export async function pullIntegrationFromSheets(sheets, pool) {
  const spreadsheetId = await getSpreadsheetId(pool);
  if (!spreadsheetId) {
    throw new Error('No spreadsheet configured. Please create a spreadsheet first.');
  }

  try {
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `'${INTEGRATION_SHEET_NAME}'!A2:C`,
    });

    const rows = response.data.values || [];
    let restored = 0;

    for (const row of rows) {
      const key = row[INTEGRATION_COLUMNS.setting];
      const value = row[INTEGRATION_COLUMNS.value];

      if (!key || !value) continue;

      // Restore admin settings
      if (['gemini_api_key', 'gemini_prompt_brief', 'gemini_prompt_historical'].includes(key)) {
        await pool.query(`
          INSERT INTO admin_settings (key, value, updated_at)
          VALUES ($1, $2, CURRENT_TIMESTAMP)
          ON CONFLICT (key) DO UPDATE SET
            value = EXCLUDED.value,
            updated_at = CURRENT_TIMESTAMP
        `, [key, value]);
        restored++;
        console.log(`Restored setting: ${key}`);
      }

      // Restore Drive settings (folder IDs)
      if (['root_folder_id', 'icons_folder_id', 'images_folder_id'].includes(key)) {
        await setDriveSetting(pool, key, value);
        restored++;
        console.log(`Restored Drive setting: ${key}`);
      }
    }

    // Update sync status
    await pool.query(`
      INSERT INTO sync_status (key, value, updated_at)
      VALUES ('last_integration_pull', $1, CURRENT_TIMESTAMP)
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = CURRENT_TIMESTAMP
    `, [new Date().toISOString()]);

    return restored;
  } catch (error) {
    // If sheet doesn't exist, return 0
    if (error.message?.includes('Unable to parse range')) {
      return 0;
    }
    throw error;
  }
}

/**
 * Ensure the Integration sheet exists with proper headers
 */
export async function ensureIntegrationSheet(sheets, spreadsheetId) {
  try {
    // Get existing sheets
    const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId });
    const existingSheets = spreadsheet.data.sheets.map(s => s.properties.title);

    // Create Integration sheet if it doesn't exist
    if (!existingSheets.includes(INTEGRATION_SHEET_NAME)) {
      console.log('Creating Integration sheet...');
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [{
            addSheet: {
              properties: {
                title: INTEGRATION_SHEET_NAME,
                gridProperties: {
                  frozenRowCount: 1
                }
              }
            }
          }]
        }
      });

      console.log('Integration sheet created successfully');

      // Add headers
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `'${INTEGRATION_SHEET_NAME}'!A1:C1`,
        valueInputOption: 'RAW',
        requestBody: {
          values: [INTEGRATION_HEADERS]
        }
      });

      // Format header
      const updatedSpreadsheet = await sheets.spreadsheets.get({ spreadsheetId });
      const newSheet = updatedSpreadsheet.data.sheets.find(
        s => s.properties.title === INTEGRATION_SHEET_NAME
      );

      if (newSheet) {
        await sheets.spreadsheets.batchUpdate({
          spreadsheetId,
          requestBody: {
            requests: [{
              repeatCell: {
                range: {
                  sheetId: newSheet.properties.sheetId,
                  startRowIndex: 0,
                  endRowIndex: 1
                },
                cell: {
                  userEnteredFormat: {
                    backgroundColor: { red: 0.5, green: 0.5, blue: 0.5 },
                    textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 } }
                  }
                },
                fields: 'userEnteredFormat(backgroundColor,textFormat)'
              }
            }]
          }
        });
      }
      console.log('Integration sheet setup complete');
    }
  } catch (error) {
    console.error('Error ensuring Integration sheet:', error.message);
    throw error;
  }
}

// ============================================
// Linear Features (Trails & Rivers) Sync Functions
// ============================================

/**
 * Convert a spreadsheet row to a linear feature object
 */
function rowToLinearFeature(row) {
  return {
    name: row[LINEAR_FEATURES_COLUMNS.name] || '',
    feature_type: row[LINEAR_FEATURES_COLUMNS.feature_type] || 'trail',
    property_owner: row[LINEAR_FEATURES_COLUMNS.property_owner] || null,
    brief_description: row[LINEAR_FEATURES_COLUMNS.brief_description] || null,
    era: row[LINEAR_FEATURES_COLUMNS.era] || null,
    historical_description: row[LINEAR_FEATURES_COLUMNS.historical_description] || null,
    primary_activities: row[LINEAR_FEATURES_COLUMNS.primary_activities] || null,
    surface: row[LINEAR_FEATURES_COLUMNS.surface] || null,
    pets: row[LINEAR_FEATURES_COLUMNS.pets] || null,
    cell_signal: parseCellSignal(row[LINEAR_FEATURES_COLUMNS.cell_signal]),
    more_info_link: row[LINEAR_FEATURES_COLUMNS.more_info_link] || null,
    length_miles: row[LINEAR_FEATURES_COLUMNS.length_miles] ? parseFloat(row[LINEAR_FEATURES_COLUMNS.length_miles]) : null,
    difficulty: row[LINEAR_FEATURES_COLUMNS.difficulty] || null,
    image_drive_file_id: row[LINEAR_FEATURES_COLUMNS.image_drive_file_id] || null
  };
}

/**
 * Convert a linear feature object to a spreadsheet row
 */
function linearFeatureToRow(feature) {
  return [
    feature.name || '',
    feature.feature_type || 'trail',
    feature.property_owner || '',
    feature.brief_description || '',
    feature.era || '',
    feature.historical_description || '',
    feature.primary_activities || '',
    feature.surface || '',
    feature.pets || '',
    formatCellSignal(feature.cell_signal),
    feature.more_info_link || '',
    feature.length_miles || '',
    feature.difficulty || '',
    feature.image_drive_file_id || ''
  ];
}

/**
 * Read all linear features from the Trails & Rivers sheet
 */
export async function readLinearFeatures(sheets, spreadsheetId) {
  try {
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `'${LINEAR_FEATURES_SHEET_NAME}'!A2:N`,
    });

    const rows = response.data.values || [];
    return rows
      .map(rowToLinearFeature)
      .filter(f => f.name && f.name !== 'Name');
  } catch (error) {
    // If sheet doesn't exist, return empty array
    if (error.message?.includes('Unable to parse range')) {
      return [];
    }
    throw error;
  }
}

/**
 * Push all linear features from database to the spreadsheet
 */
export async function pushLinearFeaturesToSheets(sheets, pool) {
  const spreadsheetId = await getSpreadsheetId(pool);
  if (!spreadsheetId) {
    throw new Error('No spreadsheet configured. Please create a spreadsheet first.');
  }

  // Ensure Linear Features sheet exists
  await ensureLinearFeaturesSheet(sheets, spreadsheetId);

  const result = await pool.query(`
    SELECT name, feature_type, property_owner, brief_description, era,
           historical_description, primary_activities, surface, pets,
           cell_signal, more_info_link, length_miles, difficulty, image_drive_file_id
    FROM linear_features
    WHERE (deleted IS NULL OR deleted = FALSE)
    ORDER BY feature_type, name
  `);

  const features = result.rows;

  // Clear existing data (keep header)
  try {
    await sheets.spreadsheets.values.clear({
      spreadsheetId,
      range: `'${LINEAR_FEATURES_SHEET_NAME}'!A2:N`,
    });
  } catch (error) {
    // Ignore if sheet is empty
  }

  // Write all linear features
  if (features.length > 0) {
    const rows = features.map(linearFeatureToRow);
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `'${LINEAR_FEATURES_SHEET_NAME}'!A2:N`,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: rows
      }
    });
  }

  // Update sync status
  await pool.query(`
    INSERT INTO sync_status (key, value, updated_at)
    VALUES ('last_linear_features_push', $1, CURRENT_TIMESTAMP)
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = CURRENT_TIMESTAMP
  `, [new Date().toISOString()]);

  return features.length;
}

/**
 * Pull all linear features from the spreadsheet to database
 * Note: Only updates metadata - geometry must be imported from GeoJSON separately
 */
export async function pullLinearFeaturesFromSheets(sheets, pool, drive = null) {
  const spreadsheetId = await getSpreadsheetId(pool);
  if (!spreadsheetId) {
    throw new Error('No spreadsheet configured. Please create a spreadsheet first.');
  }

  const features = await readLinearFeatures(sheets, spreadsheetId);

  // Update existing linear features by name (don't delete - we need to preserve geometry)
  for (const feature of features) {
    if (!feature.name) continue;

    // Check if feature exists
    const existing = await pool.query(
      'SELECT id, image_drive_file_id FROM linear_features WHERE name = $1 AND feature_type = $2',
      [feature.name, feature.feature_type]
    );

    if (existing.rows.length > 0) {
      // Update existing feature (preserve geometry)
      const featureId = existing.rows[0].id;

      await pool.query(`
        UPDATE linear_features SET
          property_owner = $1, brief_description = $2, era = $3,
          historical_description = $4, primary_activities = $5, surface = $6,
          pets = $7, cell_signal = $8, more_info_link = $9,
          length_miles = $10, difficulty = $11, image_drive_file_id = $12,
          updated_at = CURRENT_TIMESTAMP, synced = TRUE, locally_modified = FALSE
        WHERE id = $13
      `, [
        feature.property_owner, feature.brief_description, feature.era,
        feature.historical_description, feature.primary_activities, feature.surface,
        feature.pets, feature.cell_signal, feature.more_info_link,
        feature.length_miles, feature.difficulty, feature.image_drive_file_id,
        featureId
      ]);

      // Download image from Drive if available and changed
      if (feature.image_drive_file_id && drive && feature.image_drive_file_id !== existing.rows[0].image_drive_file_id) {
        try {
          const imageBuffer = await downloadFileFromDrive(drive, feature.image_drive_file_id);
          if (imageBuffer) {
            let mimeType = 'image/jpeg';
            if (imageBuffer[0] === 0x89 && imageBuffer[1] === 0x50) mimeType = 'image/png';
            else if (imageBuffer[0] === 0x47 && imageBuffer[1] === 0x49) mimeType = 'image/gif';
            else if (imageBuffer[0] === 0x52 && imageBuffer[1] === 0x49) mimeType = 'image/webp';

            await pool.query(`
              UPDATE linear_features SET image_data = $1, image_mime_type = $2 WHERE id = $3
            `, [imageBuffer, mimeType, featureId]);
            console.log(`Downloaded image for linear feature: ${feature.name}`);
          }
        } catch (imageError) {
          console.warn(`Failed to download image for ${feature.name}:`, imageError.message);
        }
      }
    }
    // Note: We don't insert new features from sheets since geometry is required
    // New trails/rivers must be imported from GeoJSON
  }

  // Update sync status
  await pool.query(`
    INSERT INTO sync_status (key, value, updated_at)
    VALUES ('last_linear_features_pull', $1, CURRENT_TIMESTAMP)
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = CURRENT_TIMESTAMP
  `, [new Date().toISOString()]);

  return features.length;
}

/**
 * Ensure the Linear Features sheet exists with proper headers
 */
async function ensureLinearFeaturesSheet(sheets, spreadsheetId) {
  try {
    const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId });
    const existingSheets = spreadsheet.data.sheets.map(s => s.properties.title);

    if (!existingSheets.includes(LINEAR_FEATURES_SHEET_NAME)) {
      console.log('Creating Trails & Rivers sheet...');
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [{
            addSheet: {
              properties: {
                title: LINEAR_FEATURES_SHEET_NAME,
                gridProperties: {
                  frozenRowCount: 1
                }
              }
            }
          }]
        }
      });

      // Add headers
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `'${LINEAR_FEATURES_SHEET_NAME}'!A1:N1`,
        valueInputOption: 'RAW',
        requestBody: {
          values: [LINEAR_FEATURES_HEADERS]
        }
      });

      // Format header
      const updatedSpreadsheet = await sheets.spreadsheets.get({ spreadsheetId });
      const newSheet = updatedSpreadsheet.data.sheets.find(
        s => s.properties.title === LINEAR_FEATURES_SHEET_NAME
      );

      if (newSheet) {
        await sheets.spreadsheets.batchUpdate({
          spreadsheetId,
          requestBody: {
            requests: [{
              repeatCell: {
                range: {
                  sheetId: newSheet.properties.sheetId,
                  startRowIndex: 0,
                  endRowIndex: 1
                },
                cell: {
                  userEnteredFormat: {
                    backgroundColor: { red: 0.55, green: 0.27, blue: 0.07 }, // Brown for trails
                    textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 } }
                  }
                },
                fields: 'userEnteredFormat(backgroundColor,textFormat)'
              }
            },
            {
              autoResizeDimensions: {
                dimensions: {
                  sheetId: newSheet.properties.sheetId,
                  dimension: 'COLUMNS',
                  startIndex: 0,
                  endIndex: 14
                }
              }
            }]
          }
        });
      }
      console.log('Trails & Rivers sheet setup complete');
    }
  } catch (error) {
    console.error('Error ensuring Linear Features sheet:', error.message);
    throw error;
  }
}

// Export constants for admin routes
export const SPREADSHEET_ID = null; // No longer used - app creates its own
export const SHEET_NAME = APP_SHEET_NAME;
export const ACTIVITIES_SHEET = ACTIVITIES_SHEET_NAME;
export const ERAS_SHEET = ERAS_SHEET_NAME;
export const SURFACES_SHEET = SURFACES_SHEET_NAME;
export const LINEAR_FEATURES_SHEET = LINEAR_FEATURES_SHEET_NAME;
