// Polyfill fetch for Node.js environments where it's not globally available
import fetch, { Headers, Request, Response } from 'node-fetch';
if (!globalThis.fetch) {
  globalThis.fetch = fetch;
  globalThis.Headers = Headers;
  globalThis.Request = Request;
  globalThis.Response = Response;
}

import { GoogleGenerativeAI } from '@google/generative-ai';

// Default prompt templates - designed to avoid generic AI slop
const DEFAULT_PROMPTS = {
  gemini_prompt_brief: `You are a local historian writing for the Cuyahoga Valley National Park visitor guide.

Research and write a 2-3 sentence overview for: {{name}}

REQUIREMENTS:
- Include at least one specific date, name, or verifiable fact
- Mention what visitors can actually see or do there TODAY
- NO generic phrases like "rich history", "beloved destination", "step back in time"
- If you cannot find specific facts, say "Historical details pending research"

Location context: {{era}}, {{property_owner}}`,

  gemini_prompt_historical: `You are writing for Arcadia Publishing's "Images of America" series about Cuyahoga Valley.

Research and write 2-3 paragraphs about: {{name}}

REQUIREMENTS:
- Include specific dates, names of people, and historical events
- Reference primary sources when possible (newspapers, deeds, oral histories)
- Describe what the place looked like historically vs today
- Connect to broader Ohio & Erie Canal corridor history if relevant
- NO filler phrases: avoid "rich tapestry", "testament to", "bygone era"
- If information is uncertain, say "According to local accounts..." or "Records suggest..."
- If you cannot verify facts, acknowledge the gaps

Location context: Era: {{era}}, Owner: {{property_owner}}`
};

// Research prompt for filling all fields - {{activities_list}}, {{eras_list}}, and {{surfaces_list}} placeholders will be filled dynamically
const RESEARCH_PROMPT_TEMPLATE = `You are a researcher for Cuyahoga Valley National Park. Search the web and find accurate information about this location.

Location to research: {{name}}
{{#if coordinates}}Coordinates: {{latitude}}, {{longitude}}{{/if}}

Search for information from NPS.gov, Ohio History Connection, local historical societies, and reliable sources.

Return a JSON object with these fields (use null if you cannot find reliable information):

{
  "era": "The primary historical era - MUST be one from the ALLOWED ERAS list below",
  "property_owner": "Current owner/manager (e.g., 'Federal (NPS)', 'Cleveland Metroparks', 'Private')",
  "primary_activities": "Comma-separated activities from the ALLOWED ACTIVITIES list ONLY",
  "surface": "Trail/path surface type - MUST be one from the ALLOWED SURFACES list below",
  "pets": "Pet policy: 'Yes', 'No', or 'Leashed'",
  "brief_description": "2-3 sentences with specific facts about what makes this place notable. Include dates and names.",
  "historical_description": "2-3 paragraphs of historical narrative with specific dates, people, and events. Written in warm local history style.",
  "sources": ["Array of source URLs or references used"]
}

ALLOWED ERAS (era MUST be one of these exact names):
{{eras_list}}

ALLOWED ACTIVITIES (only use activities from this list):
{{activities_list}}

ALLOWED SURFACES (surface MUST be one of these exact names):
{{surfaces_list}}

IMPORTANT:
- For era, you MUST select exactly one era from the ALLOWED ERAS list above based on when this place was most historically significant
- For primary_activities, ONLY use activities from the ALLOWED ACTIVITIES list above
- For surface, you MUST select exactly one surface from the ALLOWED SURFACES list above based on the trail/path surface type
- Select activities that apply to this specific location based on what's actually available there
- Only include facts you can verify from search results
- Use null for fields where you have no reliable information
- Avoid generic filler text - specific facts or nothing
- The brief_description and historical_description should contain real, searchable facts`;

/**
 * Get default prompt for a given key
 */
export function getDefaultPrompt(promptKey) {
  return DEFAULT_PROMPTS[promptKey] || '';
}

/**
 * Initialize Gemini client with API key from database
 */
export async function createGeminiClient(pool) {
  const result = await pool.query(
    "SELECT value FROM admin_settings WHERE key = 'gemini_api_key'"
  );

  if (!result.rows.length || !result.rows[0].value) {
    throw new Error('Gemini API key not configured. Please add your API key in Settings.');
  }

  return new GoogleGenerativeAI(result.rows[0].value);
}

/**
 * Get prompt template from database with fallback to defaults
 */
export async function getPromptTemplate(pool, promptKey) {
  const result = await pool.query(
    'SELECT value FROM admin_settings WHERE key = $1',
    [promptKey]
  );

  if (result.rows.length && result.rows[0].value) {
    return result.rows[0].value;
  }

  return getDefaultPrompt(promptKey);
}

/**
 * Replace {{placeholder}} variables with actual destination data
 */
export function interpolatePrompt(template, destination) {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    const value = destination[key];
    if (value === null || value === undefined || value === '') {
      return '(not specified)';
    }
    return String(value);
  });
}

/**
 * Get the interpolated prompt (template with placeholders filled in)
 */
export async function getInterpolatedPrompt(pool, promptKey, destination) {
  const template = await getPromptTemplate(pool, promptKey);
  return interpolatePrompt(template, destination);
}

/**
 * Generate text content using Gemini with Google Search grounding
 */
export async function generateText(pool, promptKey, destination) {
  const genAI = await createGeminiClient(pool);

  // Enable Google Search grounding for better factual content
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.0-flash',
    tools: [{
      googleSearch: {}
    }]
  });

  const template = await getPromptTemplate(pool, promptKey);
  const prompt = interpolatePrompt(template, destination);

  console.log(`Generating ${promptKey} for destination: ${destination.name} (with Google Search)`);

  const result = await model.generateContent(prompt);
  const response = result.response;
  const text = response.text();

  return text;
}

/**
 * Generate text content using a custom prompt with Google Search grounding
 */
export async function generateTextWithCustomPrompt(pool, customPrompt) {
  const genAI = await createGeminiClient(pool);

  // Enable Google Search grounding
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.0-flash',
    tools: [{
      googleSearch: {}
    }]
  });

  console.log(`Generating with custom prompt (${customPrompt.length} chars, with Google Search)`);

  const result = await model.generateContent(customPrompt);
  const response = result.response;
  const text = response.text();

  return text;
}

/**
 * Research a location and return structured data for all fields
 * @param {object} pool - Database pool
 * @param {object} destination - Destination data with name, coordinates, etc.
 * @param {string[]} availableActivities - List of standardized activity names
 * @param {string[]} availableEras - List of standardized era names
 * @param {string[]} availableSurfaces - List of standardized surface names
 */
export async function researchLocation(pool, destination, availableActivities = [], availableEras = [], availableSurfaces = []) {
  const genAI = await createGeminiClient(pool);

  // Enable Google Search grounding for research
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.0-flash',
    tools: [{
      googleSearch: {}
    }]
  });

  // Build the prompt with the activities, eras, and surfaces lists
  let promptTemplate = RESEARCH_PROMPT_TEMPLATE;
  const activitiesList = availableActivities.length > 0
    ? availableActivities.join(', ')
    : 'Hiking, Biking, Photography, Bird Watching, Fishing, Picnicking, Camping, Wildlife Viewing, Historical Tours';
  promptTemplate = promptTemplate.replace('{{activities_list}}', activitiesList);

  const erasList = availableEras.length > 0
    ? availableEras.join(', ')
    : 'Pre-Colonial, Early Settlement, Canal Era, Railroad Era, Industrial Era, Conservation Era, Modern Era';
  promptTemplate = promptTemplate.replace('{{eras_list}}', erasList);

  const surfacesList = availableSurfaces.length > 0
    ? availableSurfaces.join(', ')
    : 'Paved, Gravel, Boardwalk, Dirt, Grass, Sand, Rocky, Water, Rail, Mixed';
  promptTemplate = promptTemplate.replace('{{surfaces_list}}', surfacesList);

  const prompt = interpolatePrompt(promptTemplate, destination);

  console.log(`Researching location: ${destination.name} (with Google Search, ${availableActivities.length} activities, ${availableEras.length} eras, ${availableSurfaces.length} surfaces available)`);

  const result = await model.generateContent(prompt);
  const response = result.response;
  const text = response.text();

  try {
    // Try to extract JSON from the response
    // Sometimes Gemini returns markdown code blocks or duplicated JSON
    let jsonText = text;

    // Remove markdown code blocks if present
    const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonText = jsonMatch[1].trim();
    }

    // If there are multiple JSON objects, take the first complete one
    const firstBrace = jsonText.indexOf('{');
    if (firstBrace > 0) {
      jsonText = jsonText.substring(firstBrace);
    }

    // Find the matching closing brace for the first opening brace
    let braceCount = 0;
    let endIndex = -1;
    for (let i = 0; i < jsonText.length; i++) {
      if (jsonText[i] === '{') braceCount++;
      if (jsonText[i] === '}') braceCount--;
      if (braceCount === 0 && jsonText[i] === '}') {
        endIndex = i + 1;
        break;
      }
    }

    if (endIndex > 0) {
      jsonText = jsonText.substring(0, endIndex);
    }

    const data = JSON.parse(jsonText);
    return data;
  } catch (e) {
    console.error('Failed to parse research response as JSON:', e);
    console.error('Raw response:', text);
    throw new Error('AI returned invalid format. Please try again.');
  }
}

/**
 * Test API key validity with a simple request
 */
export async function testApiKey(pool) {
  const genAI = await createGeminiClient(pool);
  const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

  const result = await model.generateContent('Respond with exactly: API key verified');
  const text = result.response.text();

  return text;
}
