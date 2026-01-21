/**
 * Test script for Perplexity API integration
 * Run with: node test-perplexity.js
 */

import { testApiKey, generateTextWithCustomPrompt } from './services/perplexityService.js';

async function runTests() {
  console.log('=== Testing Perplexity API Integration ===\n');

  // Test 1: API Key Validity
  console.log('Test 1: Validating API key...');
  try {
    const response = await testApiKey();
    console.log('✓ API key is valid');
    console.log(`  Response: ${response}\n`);
  } catch (error) {
    console.error('✗ API key test failed:', error.message);
    process.exit(1);
  }

  // Test 2: Sample News Search
  console.log('Test 2: Sample news search for Cuyahoga Valley National Park...');
  const testPrompt = `Search for recent news and upcoming events about Cuyahoga Valley National Park.

Return a JSON object with this structure:
{
  "news": [
    {
      "title": "News article title",
      "summary": "Brief summary",
      "published_date": "2026-01-15",
      "source_url": "https://..."
    }
  ],
  "events": [
    {
      "title": "Event title",
      "description": "Event description",
      "start_date": "2026-02-01",
      "end_date": "2026-02-01",
      "source_url": "https://..."
    }
  ]
}

Find up to 3 news items and 3 events. Use current web search results.`;

  try {
    const response = await generateTextWithCustomPrompt(null, testPrompt, null);
    console.log('✓ Search completed successfully');
    console.log(`  Response length: ${response.length} chars\n`);

    // Try to parse JSON
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const result = JSON.parse(jsonMatch[0]);
      console.log(`  Found ${result.news?.length || 0} news items`);
      console.log(`  Found ${result.events?.length || 0} events`);

      if (result.news && result.news.length > 0) {
        console.log('\n  Sample news item:');
        console.log(`    Title: ${result.news[0].title}`);
        console.log(`    Date: ${result.news[0].published_date}`);
      }

      if (result.events && result.events.length > 0) {
        console.log('\n  Sample event:');
        console.log(`    Title: ${result.events[0].title}`);
        console.log(`    Date: ${result.events[0].start_date}`);
      }
    } else {
      console.log('  Warning: No JSON found in response');
      console.log(`  Response preview: ${response.substring(0, 200)}...`);
    }
  } catch (error) {
    console.error('✗ Search test failed:', error.message);
    process.exit(1);
  }

  console.log('\n=== All tests passed! ===');
  console.log('Perplexity API is working correctly.\n');
}

runTests();
