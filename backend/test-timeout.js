/**
 * Test Playwright timeout handling and fallback behavior
 */
import { renderJavaScriptPage, isJavaScriptHeavySite } from './services/jsRenderer.js';

async function testTimeout() {
  // Test with a slow-loading site that caused issues
  const slowUrl = 'https://www.cvsr.org/stations/';

  console.log(`Testing timeout handling for: ${slowUrl}\n`);

  console.log('1. Testing with standard timeout (20s)...');
  const result = await renderJavaScriptPage(slowUrl, {
    waitTime: 2000,
    timeout: 20000
  });

  if (result.success) {
    console.log(`   ✓ Success!`);
    console.log(`   Title: ${result.title}`);
    console.log(`   Text length: ${result.text.length} chars`);
    console.log(`   Links found: ${result.links?.length || 0}`);
  } else {
    console.log(`   ⚠ Failed (expected for slow sites): ${result.error}`);
  }

  // Test with Conservancy site that should work
  const conservancyUrl = 'https://www.conservancyforcvnp.org/news/';

  console.log(`\n2. Testing with Conservancy site: ${conservancyUrl}`);
  const conservancyResult = await renderJavaScriptPage(conservancyUrl, {
    waitTime: 4000,
    timeout: 20000
  });

  if (conservancyResult.success) {
    console.log(`   ✓ Success!`);
    console.log(`   Title: ${conservancyResult.title}`);
    console.log(`   Text length: ${conservancyResult.text.length} chars`);
    console.log(`   Links found: ${conservancyResult.links?.length || 0}`);
  } else {
    console.log(`   ❌ Failed: ${conservancyResult.error}`);
  }
}

testTimeout()
  .then(() => {
    console.log('\n✓ Timeout test complete');
    process.exit(0);
  })
  .catch(err => {
    console.error('\n❌ Test failed:', err);
    process.exit(1);
  });
