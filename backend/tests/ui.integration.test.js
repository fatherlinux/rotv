import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { chromium } from 'playwright';

describe('UI Integration Tests', () => {
  let browser;
  let page;
  const baseUrl = 'http://localhost:8080';

  beforeAll(async () => {
    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    page = await browser.newPage();
  });

  afterAll(async () => {
    if (page) await page.close();
    if (browser) await browser.close();
  });

  describe('Satellite Imagery Toggle', () => {
    it('should load the map page successfully', async () => {
      await page.goto(baseUrl, { waitUntil: 'networkidle' });

      // Verify page title
      const title = await page.title();
      expect(title).toContain('Roots of The Valley');

      // Verify map container exists
      const mapContainer = await page.locator('.leaflet-container').count();
      expect(mapContainer).toBeGreaterThan(0);
    }, 30000);

    it('should have a satellite toggle button', async () => {
      await page.goto(baseUrl, { waitUntil: 'networkidle' });

      // Wait for the map controls to render
      await page.waitForSelector('.zoom-locate-control', { timeout: 10000 });

      // Verify satellite toggle button exists
      const satelliteButton = await page.locator('.satellite-toggle-button');
      expect(await satelliteButton.count()).toBe(1);

      // Verify button has correct attributes
      const title = await satelliteButton.getAttribute('title');
      expect(title).toBe('Switch to satellite view');

      const ariaLabel = await satelliteButton.getAttribute('aria-label');
      expect(ariaLabel).toBe('Switch to satellite view');
    }, 30000);

    it('should toggle satellite mode on and off', async () => {
      await page.goto(baseUrl, { waitUntil: 'networkidle' });

      // Wait for the map controls to render
      await page.waitForSelector('.zoom-locate-control', { timeout: 10000 });

      const satelliteButton = await page.locator('.satellite-toggle-button');

      // Verify button is not active initially
      let hasActiveClass = await satelliteButton.evaluate(el => el.classList.contains('active'));
      expect(hasActiveClass).toBe(false);

      // Click to enable satellite mode
      await satelliteButton.click();

      // Wait a bit for the class to update
      await page.waitForTimeout(500);

      // Verify button is now active
      hasActiveClass = await satelliteButton.evaluate(el => el.classList.contains('active'));
      expect(hasActiveClass).toBe(true);

      // Verify title changed
      let title = await satelliteButton.getAttribute('title');
      expect(title).toBe('Switch to map view');

      // Click again to disable satellite mode
      await satelliteButton.click();

      // Wait a bit for the class to update
      await page.waitForTimeout(500);

      // Verify button is no longer active
      hasActiveClass = await satelliteButton.evaluate(el => el.classList.contains('active'));
      expect(hasActiveClass).toBe(false);

      // Verify title changed back
      title = await satelliteButton.getAttribute('title');
      expect(title).toBe('Switch to satellite view');
    }, 30000);

    it('should switch between OpenStreetMap and Esri satellite tiles', async () => {
      await page.goto(baseUrl, { waitUntil: 'networkidle' });

      // Wait for the map controls to render
      await page.waitForSelector('.zoom-locate-control', { timeout: 10000 });

      const satelliteButton = await page.locator('.satellite-toggle-button');

      // Verify button starts inactive (regular map mode)
      let hasActiveClass = await satelliteButton.evaluate(el => el.classList.contains('active'));
      expect(hasActiveClass).toBe(false);

      // Click satellite toggle to enable satellite mode
      await satelliteButton.click();

      // Wait for state change
      await page.waitForTimeout(1000);

      // Verify button is now active
      hasActiveClass = await satelliteButton.evaluate(el => el.classList.contains('active'));
      expect(hasActiveClass).toBe(true);

      // Check for Esri attribution after switching to satellite
      const attribution = await page.locator('.leaflet-control-attribution').textContent();
      expect(attribution).toContain('Esri');

      // Click again to switch back to regular map
      await satelliteButton.click();

      // Wait for state change
      await page.waitForTimeout(1000);

      // Verify button is no longer active
      hasActiveClass = await satelliteButton.evaluate(el => el.classList.contains('active'));
      expect(hasActiveClass).toBe(false);
    }, 40000);
  });

  describe('Map Controls', () => {
    it('should have zoom in, zoom out, GPS locate, and satellite toggle buttons', async () => {
      await page.goto(baseUrl, { waitUntil: 'networkidle' });

      // Wait for controls to render
      await page.waitForSelector('.zoom-locate-control', { timeout: 10000 });

      // Verify all 4 buttons exist
      const zoomInBtn = await page.locator('.zoom-in-btn').count();
      expect(zoomInBtn).toBe(1);

      const zoomOutBtn = await page.locator('.zoom-out-btn').count();
      expect(zoomOutBtn).toBe(1);

      const locateBtn = await page.locator('.locate-button').count();
      expect(locateBtn).toBe(1);

      const satelliteBtn = await page.locator('.satellite-toggle-button').count();
      expect(satelliteBtn).toBe(1);
    }, 30000);

    it('should have correct button order in control', async () => {
      await page.goto(baseUrl, { waitUntil: 'networkidle' });

      // Wait for controls to render
      await page.waitForSelector('.zoom-locate-control', { timeout: 10000 });

      // Get all buttons in order
      const buttons = await page.locator('.zoom-locate-control .zoom-locate-btn').all();
      expect(buttons.length).toBe(4);

      // Verify order: zoom in, zoom out, locate, satellite
      const classNames = await Promise.all(buttons.map(btn => btn.getAttribute('class')));
      expect(classNames[0]).toContain('zoom-in-btn');
      expect(classNames[1]).toContain('zoom-out-btn');
      expect(classNames[2]).toContain('locate-button');
      expect(classNames[3]).toContain('satellite-toggle-button');
    }, 30000);
  });
});
