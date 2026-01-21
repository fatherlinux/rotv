/**
 * Tests for JavaScript renderer (Playwright)
 */
import { describe, it, expect } from 'vitest';
import { isJavaScriptHeavySite, renderJavaScriptPage, extractEventContent } from '../services/jsRenderer.js';

describe('JavaScript Renderer', () => {
  describe('isJavaScriptHeavySite', () => {
    it('should detect Wix sites', async () => {
      const result = await isJavaScriptHeavySite('https://www.conservancyforcvnp.org/', { checkContent: false });
      expect(result).toBe(true);
    });

    it('should detect force-rendered sites', async () => {
      const result = await isJavaScriptHeavySite('https://www.preservethevalley.com/', { checkContent: false });
      expect(result).toBe(true);
    });

    it('should not detect regular sites', async () => {
      const result = await isJavaScriptHeavySite('https://www.example.com/', { checkContent: false });
      expect(result).toBe(false);
    });

    it('should handle invalid URLs gracefully', async () => {
      const result = await isJavaScriptHeavySite('No website available');
      expect(result).toBe(false);
    });
  });

  describe('renderJavaScriptPage', () => {
    it('should render Conservancy news page and extract links', async () => {
      const result = await renderJavaScriptPage('https://www.conservancyforcvnp.org/news/', {
        waitTime: 3000,
        timeout: 20000
      });

      expect(result.success).toBe(true);
      expect(result.title).toContain('Conservancy');
      expect(result.text.length).toBeGreaterThan(1000);
      expect(result.links.length).toBeGreaterThan(50);
    }, 30000); // 30 second timeout for this test

    it('should handle timeout gracefully with fallback', async () => {
      // This test may pass or fail depending on network, but should not hang
      const result = await renderJavaScriptPage('https://www.cvsr.org/stations/', {
        waitTime: 2000,
        timeout: 15000
      });

      // Should either succeed or fail gracefully
      expect(result).toBeDefined();
      expect(result).toHaveProperty('success');
      if (!result.success) {
        expect(result.error).toBeDefined();
      }
    }, 25000);

    it('should ignore SSL errors', async () => {
      // Test with a site that has SSL issues (if it ever comes back up)
      // For now, just verify the ignoreHTTPSErrors flag is working
      const result = await renderJavaScriptPage('https://self-signed.badssl.com/', {
        waitTime: 1000,
        timeout: 10000
      });

      // Should not fail due to SSL certificate errors
      // (though it may fail for other reasons)
      if (!result.success) {
        expect(result.error).not.toContain('certificate');
        expect(result.error).not.toContain('SSL');
      }
    }, 15000);
  });

  describe('extractEventContent', () => {
    it('should extract event-related content', () => {
      const sampleText = `
        Home
        About
        Contact
        Upcoming Events
        Join us for a hike on January 15, 2026
        Nature walk in February
        Navigation footer
      `;

      const result = extractEventContent(sampleText);
      expect(result).toContain('January');
      expect(result).toContain('February');
      expect(result).not.toContain('Navigation footer');
    });

    it('should filter out navigation keywords', () => {
      const sampleText = 'Home\nAbout\nContact\nEvent on March 10';

      const result = extractEventContent(sampleText);
      expect(result).not.toContain('Home');
      expect(result).not.toContain('About');
      expect(result).toContain('March');
    });
  });
});
