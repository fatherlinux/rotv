/**
 * Quick test of Playwright rendering for Open Trail Collective
 */
import { renderJavaScriptPage, isJavaScriptHeavySite, extractEventContent } from './services/jsRenderer.js';

async function test() {
  const url = 'https://www.opentrailcollective.org/adventures';

  console.log(`Testing JavaScript detection and rendering for: ${url}\n`);

  // Test 1: Detection
  console.log('1. Testing isJavaScriptHeavySite()...');
  const isJSHeavy = await isJavaScriptHeavySite(url);
  console.log(`   Result: ${isJSHeavy ? '✓ Detected as JS-heavy' : '❌ NOT detected as JS-heavy'}\n`);

  // Test 2: Rendering
  console.log('2. Rendering page with Playwright...');
  const rendered = await renderJavaScriptPage(url, {
    waitTime: 4000,
    timeout: 20000
  });

  if (rendered.success) {
    console.log(`   ✓ Success!`);
    console.log(`   Title: ${rendered.title}`);
    console.log(`   Text length: ${rendered.text.length} chars`);
    console.log(`   HTML length: ${rendered.html.length} chars\n`);

    // Test 3: Event extraction
    console.log('3. Extracting event content...');
    const eventContent = extractEventContent(rendered.text);
    console.log(`   Extracted ${eventContent.length} chars of event-related content\n`);

    // Show a preview
    console.log('Preview of rendered text (first 1000 chars):');
    console.log('─'.repeat(60));
    console.log(rendered.text.substring(0, 1000));
    console.log('─'.repeat(60));

    console.log('\nPreview of event content (first 1000 chars):');
    console.log('─'.repeat(60));
    console.log(eventContent.substring(0, 1000));
    console.log('─'.repeat(60));

  } else {
    console.log(`   ❌ Failed: ${rendered.error}`);
  }
}

test()
  .then(() => {
    console.log('\n✓ Test complete');
    process.exit(0);
  })
  .catch(err => {
    console.error('\n❌ Test failed:', err);
    process.exit(1);
  });
