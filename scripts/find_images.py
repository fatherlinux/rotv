#!/usr/bin/env python3
"""
Find images for Roots of The Valley destinations.
Searches Wikimedia Commons, falls back to OpenStreetMap static tiles.
"""

import json
import urllib.request
import urllib.parse
import time
import csv
import sys

API_URL = "http://localhost:8080/api/destinations"
WIKIMEDIA_API = "https://commons.wikimedia.org/w/api.php"

def search_wikimedia(query):
    """Search Wikimedia Commons for images matching the query."""
    params = {
        'action': 'query',
        'format': 'json',
        'generator': 'search',
        'gsrnamespace': '6',  # File namespace
        'gsrsearch': f'filetype:bitmap {query}',
        'gsrlimit': '5',
        'prop': 'imageinfo',
        'iiprop': 'url|size',
        'iiurlwidth': '800'
    }

    url = f"{WIKIMEDIA_API}?{urllib.parse.urlencode(params)}"

    try:
        with urllib.request.urlopen(url, timeout=10) as response:
            data = json.loads(response.read().decode())

        if 'query' not in data or 'pages' not in data['query']:
            return None

        pages = data['query']['pages']

        # Find the best image (prefer larger, landscape orientation)
        best_url = None
        best_score = 0

        for page_id, page in pages.items():
            if 'imageinfo' not in page:
                continue
            info = page['imageinfo'][0]

            # Skip tiny images
            width = info.get('width', 0)
            height = info.get('height', 0)
            if width < 400 or height < 300:
                continue

            # Score based on size and aspect ratio
            score = width * height
            if width > height:  # Prefer landscape
                score *= 1.2

            if score > best_score:
                best_score = score
                # Use the thumbnail URL at 800px width
                best_url = info.get('thumburl', info.get('url'))

        return best_url

    except Exception as e:
        print(f"  Error searching Wikimedia: {e}", file=sys.stderr)
        return None

def get_map_tile_url(lat, lng, zoom=15):
    """Generate an OpenStreetMap static tile URL."""
    # Use OpenStreetMap's static tile service
    # This creates a URL that shows a map centered on the coordinates
    lat_f = float(lat)
    lng_f = float(lng)

    # Use the free staticmap service from OpenStreetMap
    return f"https://staticmap.openstreetmap.de/staticmap.php?center={lat_f},{lng_f}&zoom={zoom}&size=800x400&maptype=mapnik&markers={lat_f},{lng_f},red-pushpin"

def main():
    print("Fetching destinations from API...", file=sys.stderr)

    with urllib.request.urlopen(API_URL) as response:
        destinations = json.loads(response.read().decode())

    print(f"Found {len(destinations)} destinations\n", file=sys.stderr)

    # Output CSV header
    writer = csv.writer(sys.stdout)
    writer.writerow(['Name', 'Image URL', 'Source'])

    wikimedia_found = 0
    map_fallback = 0

    for i, dest in enumerate(destinations):
        name = dest['name']
        lat = dest.get('latitude')
        lng = dest.get('longitude')

        print(f"[{i+1}/{len(destinations)}] {name}...", file=sys.stderr, end=' ')

        # Try Wikimedia Commons first
        # Search with location name + "Cuyahoga" for better results
        search_queries = [
            f"{name} Cuyahoga Valley",
            f"{name} Ohio",
            name
        ]

        image_url = None
        for query in search_queries:
            image_url = search_wikimedia(query)
            if image_url:
                break
            time.sleep(0.5)  # Rate limiting

        if image_url:
            print("Found on Wikimedia!", file=sys.stderr)
            writer.writerow([name, image_url, 'wikimedia'])
            wikimedia_found += 1
        elif lat and lng:
            print("Using map tile", file=sys.stderr)
            map_url = get_map_tile_url(lat, lng)
            writer.writerow([name, map_url, 'map'])
            map_fallback += 1
        else:
            print("No image or coordinates", file=sys.stderr)
            writer.writerow([name, '', 'none'])

        # Small delay to be nice to Wikimedia API
        time.sleep(0.3)

    print(f"\n=== Summary ===", file=sys.stderr)
    print(f"Wikimedia images found: {wikimedia_found}", file=sys.stderr)
    print(f"Map tile fallbacks: {map_fallback}", file=sys.stderr)
    print(f"No image: {len(destinations) - wikimedia_found - map_fallback}", file=sys.stderr)

if __name__ == '__main__':
    main()
