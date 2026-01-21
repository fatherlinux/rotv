import { chromium } from 'playwright';

/**
 * Detect if a URL is likely a JavaScript-heavy site that needs rendering
 * @param {string} url - URL to check
 * @param {Object} options - Detection options
 * @returns {Promise<boolean>} - True if site should be rendered with browser
 */
export async function isJavaScriptHeavySite(url, options = {}) {
  const { checkContent = true } = options;

  if (!url || url === 'No website available' || url === 'No dedicated events page' || url === 'No dedicated news page') {
    return false;
  }

  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname.toLowerCase();

    // Known JavaScript-heavy platforms (domain-based detection)
    const jsHeavyDomains = [
      'wix.com',
      'wixsite.com',
      'wixstatic.com',
      'squarespace.com',
      'webflow.io',
      'webflow.com',
      'carrd.co',
      'weebly.com',
      'wordpress.com', // WordPress.com (hosted) often uses heavy JS
      'sites.google.com',
      'conservancyforcvnp.org', // Force rendering to extract structured data and links
      'preservethevalley.com' // Force rendering for better link extraction
    ];

    // Quick check: domain-based
    if (jsHeavyDomains.some(domain => hostname.includes(domain))) {
      return true;
    }

    // Optional: Check HTML content for Wix/other framework signatures
    if (checkContent) {
      try {
        const response = await fetch(url, {
          method: 'GET',
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          },
          signal: AbortSignal.timeout(5000)
        });

        // Check response headers for Wix signatures
        const server = response.headers.get('server') || '';
        const xWixRequestId = response.headers.get('x-wix-request-id');

        if (server.toLowerCase().includes('pepyaka') || xWixRequestId) {
          console.log(`[JS Renderer] Detected Wix site via headers: ${url}`);
          return true;
        }

        // Check HTML content for framework signatures
        const html = await response.text();
        const htmlLower = html.toLowerCase();

        const signatures = [
          'wix.com',
          'wixstatic.com',
          'parastorage.com',
          'squarespace.com',
          'webflow.com',
          'window.wixSite',
          'thunderbolt',
          '__NEXT_DATA__' // Next.js (often needs rendering)
        ];

        if (signatures.some(sig => htmlLower.includes(sig))) {
          console.log(`[JS Renderer] Detected JS-heavy framework in HTML: ${url}`);
          return true;
        }
      } catch (fetchError) {
        // If fetch fails, assume we might need rendering
        console.log(`[JS Renderer] Fetch failed for ${url}, will try rendering: ${fetchError.message}`);
        return true;
      }
    }

    return false;
  } catch (error) {
    console.error(`[JS Renderer] Error checking site ${url}:`, error.message);
    return false;
  }
}

/**
 * Render a JavaScript-heavy page and extract content
 * @param {string} url - URL to render
 * @param {Object} options - Rendering options
 * @returns {Promise<Object>} - { text, html, title, success }
 */
export async function renderJavaScriptPage(url, options = {}) {
  const {
    timeout = 15000,
    waitForSelector = null,
    waitTime = 3000, // Extra wait for dynamic content
    extractSelectors = [] // Optional specific selectors to extract
  } = options;

  console.log(`[JS Renderer] Starting browser for: ${url}`);

  let browser = null;
  try {
    // Launch browser
    browser = await chromium.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu'
      ]
    });

    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      ignoreHTTPSErrors: true // Ignore SSL certificate errors for sites with invalid certs
    });

    const page = await context.newPage();

    // Navigate to the page
    console.log(`[JS Renderer] Navigating to ${url}...`);
    try {
      await page.goto(url, {
        waitUntil: 'networkidle',
        timeout
      });
    } catch (navError) {
      // If networkidle times out, try with domcontentloaded as fallback
      if (navError.message.includes('Timeout') || navError.message.includes('timeout')) {
        console.log(`[JS Renderer] Network idle timeout, retrying with domcontentloaded...`);
        await page.goto(url, {
          waitUntil: 'domcontentloaded',
          timeout: Math.min(timeout, 10000) // Shorter timeout for fallback
        });
      } else {
        throw navError;
      }
    }

    // Wait for specific selector if provided
    if (waitForSelector) {
      console.log(`[JS Renderer] Waiting for selector: ${waitForSelector}`);
      await page.waitForSelector(waitForSelector, { timeout: 10000 }).catch(() => {
        console.log(`[JS Renderer] Selector ${waitForSelector} not found, continuing anyway`);
      });
    }

    // Wait additional time for dynamic content to load
    console.log(`[JS Renderer] Waiting ${waitTime}ms for dynamic content...`);
    await page.waitForTimeout(waitTime);

    // Extract content including structured links
    const content = await page.evaluate((selectors) => {
      // Helper to get text from specific selectors
      const getTextFromSelectors = (sels) => {
        const results = {};
        sels.forEach(sel => {
          const elements = document.querySelectorAll(sel);
          results[sel] = Array.from(elements).map(el => el.innerText.trim()).filter(t => t.length > 0);
        });
        return results;
      };

      // Extract all links with context for event/news deep linking
      const extractLinks = () => {
        const links = [];
        const anchorElements = document.querySelectorAll('a[href]');

        anchorElements.forEach(anchor => {
          const href = anchor.href;

          // Skip navigation links, social media, mailto, tel, etc.
          if (!href ||
              href.startsWith('mailto:') ||
              href.startsWith('tel:') ||
              href.startsWith('#') ||
              href === window.location.href ||
              href.includes('facebook.com') ||
              href.includes('twitter.com') ||
              href.includes('instagram.com') ||
              href.includes('linkedin.com')) {
            return;
          }

          // Get link text and surrounding context
          const linkText = anchor.innerText?.trim() || anchor.textContent?.trim() || '';

          // Get parent container text for context
          let contextText = '';
          let parent = anchor.parentElement;
          let depth = 0;

          // Traverse up to find meaningful context (event card, article, etc.)
          while (parent && depth < 3) {
            const classList = Array.from(parent.classList || []);
            const className = parent.className || '';

            // Check if parent looks like an event/article container
            const isContainer = classList.some(c =>
              c.includes('event') || c.includes('article') || c.includes('news') ||
              c.includes('card') || c.includes('item') || c.includes('post')
            ) || className.includes('event') || className.includes('article');

            if (isContainer) {
              contextText = parent.innerText?.trim() || '';
              break;
            }

            parent = parent.parentElement;
            depth++;
          }

          // Fallback to immediate parent text if no container found
          if (!contextText && anchor.parentElement) {
            contextText = anchor.parentElement.innerText?.trim() || '';
          }

          // Limit context text length
          if (contextText.length > 500) {
            contextText = contextText.substring(0, 500);
          }

          links.push({
            url: href,
            text: linkText,
            context: contextText,
            className: anchor.className || '',
            parentClassName: anchor.parentElement?.className || ''
          });
        });

        return links;
      };

      return {
        text: document.body.innerText,
        html: document.body.innerHTML,
        title: document.title,
        url: window.location.href,
        selectedContent: selectors.length > 0 ? getTextFromSelectors(selectors) : null,
        links: extractLinks()
      };
    }, extractSelectors);

    console.log(`[JS Renderer] ✓ Extracted ${content.text.length} characters from ${url}`);
    console.log(`[JS Renderer]   Title: ${content.title}`);
    console.log(`[JS Renderer]   Found ${content.links.length} links on page`);

    await browser.close();

    return {
      ...content,
      success: true
    };

  } catch (error) {
    console.error(`[JS Renderer] ❌ Error rendering ${url}:`, error.message);

    if (browser) {
      await browser.close().catch(() => {});
    }

    return {
      text: '',
      html: '',
      title: '',
      url: url,
      success: false,
      error: error.message
    };
  }
}

/**
 * Extract event-like content from rendered page text
 * @param {string} text - Rendered page text
 * @returns {string} - Cleaned text focused on events
 */
export function extractEventContent(text) {
  // Remove common navigation/footer text
  const lines = text.split('\n');

  // Filter out lines that are likely navigation/footer
  const eventLines = lines.filter(line => {
    const lower = line.toLowerCase().trim();

    // Skip empty lines
    if (lower.length === 0) return false;

    // Skip common navigation items
    const navKeywords = ['home', 'about', 'contact', 'login', 'sign in', 'sign up', 'menu', 'search'];
    if (navKeywords.some(kw => lower === kw)) return false;

    // Keep lines that look like event-related content
    const eventKeywords = [
      'event', 'adventure', 'program', 'workshop', 'class', 'tour',
      'hike', 'walk', 'festival', 'concert', 'volunteer',
      'january', 'february', 'march', 'april', 'may', 'june',
      'july', 'august', 'september', 'october', 'november', 'december',
      '2026', '2025', 'upcoming', 'register', 'rsvp'
    ];

    return eventKeywords.some(kw => lower.includes(kw));
  });

  return eventLines.join('\n');
}
