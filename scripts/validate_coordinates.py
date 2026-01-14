#!/usr/bin/env python3
"""
Validate destination coordinates against known data sources.
Checks:
1. Coordinates are within Cuyahoga Valley National Park bounds
2. Water features (dams, rivers, lakes) are near actual water bodies
3. Reverse geocode to verify location names match
"""

import json
import urllib.request
import urllib.parse
import time
import csv
import sys
import math

API_URL = "http://localhost:8080/api/destinations"

# Cuyahoga Valley National Park approximate bounding box
CVNP_BOUNDS = {
    'min_lat': 41.10,
    'max_lat': 41.38,
    'min_lng': -81.70,
    'max_lng': -81.50
}

# Keywords that indicate water features
WATER_KEYWORDS = ['dam', 'river', 'lake', 'pond', 'marsh', 'falls', 'waterfall',
                  'creek', 'canal', 'lock', 'aqueduct', 'reservoir']

# USGS Water Services API
USGS_API = "https://waterservices.usgs.gov/nwis/site/"


def haversine_distance(lat1, lon1, lat2, lon2):
    """Calculate distance between two points in meters."""
    R = 6371000  # Earth's radius in meters
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)

    a = math.sin(delta_phi/2)**2 + math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda/2)**2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))

    return R * c


def is_within_bounds(lat, lng):
    """Check if coordinates are within CVNP bounds."""
    return (CVNP_BOUNDS['min_lat'] <= lat <= CVNP_BOUNDS['max_lat'] and
            CVNP_BOUNDS['min_lng'] <= lng <= CVNP_BOUNDS['max_lng'])


def is_water_feature(name):
    """Check if destination name suggests it's a water feature."""
    name_lower = name.lower()
    return any(keyword in name_lower for keyword in WATER_KEYWORDS)


def get_nearby_usgs_sites(lat, lng, radius_miles=1):
    """Query USGS for water monitoring sites near coordinates."""
    params = {
        'format': 'rdb',
        'bBox': f'{lng-0.02},{lat-0.02},{lng+0.02},{lat+0.02}',
        'siteStatus': 'all',
        'hasDataTypeCd': 'iv,dv'
    }

    url = f"{USGS_API}?{urllib.parse.urlencode(params)}"

    try:
        req = urllib.request.Request(url, headers={'Accept': 'text/plain'})
        with urllib.request.urlopen(req, timeout=10) as response:
            data = response.read().decode('utf-8')

            # Parse RDB format - look for sites
            sites = []
            for line in data.split('\n'):
                if line.startswith('USGS'):
                    parts = line.split('\t')
                    if len(parts) >= 5:
                        try:
                            site_lat = float(parts[4])
                            site_lng = float(parts[5])
                            site_name = parts[2] if len(parts) > 2 else "Unknown"
                            distance = haversine_distance(lat, lng, site_lat, site_lng)
                            sites.append({
                                'name': site_name,
                                'lat': site_lat,
                                'lng': site_lng,
                                'distance_m': distance
                            })
                        except (ValueError, IndexError):
                            continue

            return sorted(sites, key=lambda x: x['distance_m'])
    except Exception as e:
        return []


def reverse_geocode(lat, lng):
    """Use OpenStreetMap Nominatim to reverse geocode."""
    url = f"https://nominatim.openstreetmap.org/reverse?lat={lat}&lon={lng}&format=json"

    try:
        req = urllib.request.Request(url, headers={
            'User-Agent': 'ROTV-Validator/1.0 (coordinate validation script)'
        })
        with urllib.request.urlopen(req, timeout=10) as response:
            data = json.loads(response.read().decode())
            return data.get('display_name', ''), data.get('address', {})
    except Exception as e:
        return '', {}


def validate_destination(dest):
    """Validate a single destination's coordinates."""
    issues = []
    suggestions = []

    name = dest['name']
    lat = float(dest['latitude']) if dest['latitude'] else None
    lng = float(dest['longitude']) if dest['longitude'] else None

    if lat is None or lng is None:
        return {'status': 'MISSING', 'issues': ['No coordinates'], 'suggestions': []}

    # Check bounds
    if not is_within_bounds(lat, lng):
        issues.append(f'Outside CVNP bounds')

    # For water features, check USGS data
    if is_water_feature(name):
        usgs_sites = get_nearby_usgs_sites(lat, lng)
        if usgs_sites:
            nearest = usgs_sites[0]
            if nearest['distance_m'] > 500:
                issues.append(f"Water feature {nearest['distance_m']:.0f}m from nearest USGS site")
                suggestions.append(f"Consider: {nearest['lat']:.6f}, {nearest['lng']:.6f} ({nearest['name']})")
            else:
                suggestions.append(f"Near USGS site: {nearest['name']} ({nearest['distance_m']:.0f}m)")

    # Reverse geocode to check location
    display_name, address = reverse_geocode(lat, lng)
    if display_name:
        # Check if it's in expected area
        if 'Summit' not in display_name and 'Cuyahoga' not in display_name:
            issues.append(f'Geocode outside expected counties')
        suggestions.append(f'Geocoded to: {display_name[:80]}...' if len(display_name) > 80 else f'Geocoded to: {display_name}')

    if issues:
        status = 'WARNING'
    else:
        status = 'OK'

    return {'status': status, 'issues': issues, 'suggestions': suggestions}


def main():
    print("Fetching destinations from API...", file=sys.stderr)

    with urllib.request.urlopen(API_URL) as response:
        destinations = json.loads(response.read().decode())

    print(f"Validating {len(destinations)} destinations...\n", file=sys.stderr)

    # Output CSV
    writer = csv.writer(sys.stdout)
    writer.writerow(['Name', 'Latitude', 'Longitude', 'Status', 'Issues', 'Suggestions'])

    stats = {'OK': 0, 'WARNING': 0, 'MISSING': 0}

    for i, dest in enumerate(destinations):
        name = dest['name']
        lat = dest.get('latitude', '')
        lng = dest.get('longitude', '')

        print(f"[{i+1}/{len(destinations)}] {name}...", file=sys.stderr, end=' ')

        result = validate_destination(dest)
        stats[result['status']] += 1

        print(result['status'], file=sys.stderr)

        writer.writerow([
            name,
            lat,
            lng,
            result['status'],
            '; '.join(result['issues']),
            '; '.join(result['suggestions'])
        ])

        # Rate limit for external APIs
        time.sleep(1.1)  # Nominatim requires 1 req/sec

    print(f"\n=== Summary ===", file=sys.stderr)
    print(f"OK: {stats['OK']}", file=sys.stderr)
    print(f"WARNING: {stats['WARNING']}", file=sys.stderr)
    print(f"MISSING: {stats['MISSING']}", file=sys.stderr)


if __name__ == '__main__':
    main()
