#!/usr/bin/env python3
"""
Quick validation of water features against USGS monitoring sites.
"""

import json
import urllib.request
import urllib.parse
import math
import csv
import sys

API_URL = "http://localhost:8080/api/destinations"

WATER_KEYWORDS = ['dam', 'river', 'lake', 'pond', 'marsh', 'falls', 'waterfall',
                  'creek', 'canal', 'lock', 'aqueduct', 'reservoir', 'gorge']


def haversine_distance(lat1, lon1, lat2, lon2):
    """Calculate distance between two points in meters."""
    R = 6371000
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)
    a = math.sin(delta_phi/2)**2 + math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda/2)**2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))
    return R * c


def is_water_feature(name):
    name_lower = name.lower()
    return any(keyword in name_lower for keyword in WATER_KEYWORDS)


def get_usgs_sites_in_area():
    """Fetch all USGS sites in the Cuyahoga Valley area."""
    # Bounding box covering CVNP
    params = {
        'format': 'rdb',
        'bBox': '-81.70,41.10,-81.45,41.40',
        'siteStatus': 'all'
    }
    url = f"https://waterservices.usgs.gov/nwis/site/?{urllib.parse.urlencode(params)}"

    try:
        req = urllib.request.Request(url, headers={'Accept': 'text/plain'})
        with urllib.request.urlopen(req, timeout=30) as response:
            data = response.read().decode('utf-8')

            sites = []
            for line in data.split('\n'):
                if line.startswith('USGS'):
                    parts = line.split('\t')
                    if len(parts) >= 6:
                        try:
                            sites.append({
                                'id': parts[1],
                                'name': parts[2],
                                'lat': float(parts[4]),
                                'lng': float(parts[5])
                            })
                        except (ValueError, IndexError):
                            continue
            return sites
    except Exception as e:
        print(f"Error fetching USGS data: {e}", file=sys.stderr)
        return []


def find_nearest_usgs_site(lat, lng, usgs_sites):
    """Find nearest USGS site to given coordinates."""
    nearest = None
    min_distance = float('inf')

    for site in usgs_sites:
        distance = haversine_distance(lat, lng, site['lat'], site['lng'])
        if distance < min_distance:
            min_distance = distance
            nearest = site

    return nearest, min_distance


def main():
    print("Fetching destinations...", file=sys.stderr)
    with urllib.request.urlopen(API_URL) as response:
        destinations = json.loads(response.read().decode())

    print("Fetching USGS monitoring sites in Cuyahoga Valley...", file=sys.stderr)
    usgs_sites = get_usgs_sites_in_area()
    print(f"Found {len(usgs_sites)} USGS sites\n", file=sys.stderr)

    # Filter to water features
    water_features = [d for d in destinations if is_water_feature(d['name'])]
    print(f"Checking {len(water_features)} water-related destinations:\n", file=sys.stderr)

    writer = csv.writer(sys.stdout)
    writer.writerow(['Name', 'Current Lat', 'Current Lng', 'Distance to USGS (m)',
                     'Nearest USGS Site', 'USGS Lat', 'USGS Lng', 'Status'])

    issues = []
    for dest in water_features:
        name = dest['name']
        lat = float(dest['latitude']) if dest['latitude'] else None
        lng = float(dest['longitude']) if dest['longitude'] else None

        if lat is None or lng is None:
            writer.writerow([name, '', '', '', '', '', '', 'MISSING COORDS'])
            continue

        nearest, distance = find_nearest_usgs_site(lat, lng, usgs_sites)

        if nearest:
            status = 'OK' if distance < 300 else 'CHECK' if distance < 1000 else 'FAR'
            writer.writerow([
                name, f"{lat:.6f}", f"{lng:.6f}", f"{distance:.0f}",
                nearest['name'], f"{nearest['lat']:.6f}", f"{nearest['lng']:.6f}",
                status
            ])
            if status != 'OK':
                issues.append((name, distance, nearest))
        else:
            writer.writerow([name, f"{lat:.6f}", f"{lng:.6f}", '', 'No USGS sites found', '', '', 'NO DATA'])

    print(f"\n=== Issues Found ===", file=sys.stderr)
    for name, distance, nearest in sorted(issues, key=lambda x: -x[1]):
        print(f"  {name}: {distance:.0f}m from {nearest['name']}", file=sys.stderr)
        print(f"    Current: {dest['latitude']}, {dest['longitude']}", file=sys.stderr)
        print(f"    Suggest: {nearest['lat']:.6f}, {nearest['lng']:.6f}", file=sys.stderr)


if __name__ == '__main__':
    main()
