#!/usr/bin/env python3
"""
Generate a coordinate validation report with suggested fixes.
"""

import json
import urllib.request
import urllib.parse
import math

API_URL = "http://localhost:8080/api/destinations"

# Known good coordinates from USGS and NPS sources
KNOWN_COORDINATES = {
    'Peninsula Dam': (41.2425, -81.55),
    'Lock 29 Peninsula': (41.2425, -81.55),
    'Brandywine Falls': (41.2767, -81.5382),
    'Blue Hen Falls': (41.2659, -81.5657),
    'Bridal Veil Falls': (41.3762, -81.5354),
    'Beaver Marsh': (41.1814, -81.5832),
    'Deep Lock Quarry': (41.2331, -81.5510),
    'Tinkers Creek Gorge': (41.3762, -81.5354),
}


def haversine_distance(lat1, lon1, lat2, lon2):
    R = 6371000
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)
    a = math.sin(delta_phi/2)**2 + math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda/2)**2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))
    return R * c


def get_usgs_sites():
    """Fetch all USGS sites in the Cuyahoga Valley area."""
    params = {
        'format': 'rdb',
        'bBox': '-81.70,41.05,-81.40,41.45',
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
        print(f"Error fetching USGS data: {e}")
        return []


def main():
    print("Fetching destinations...")
    with urllib.request.urlopen(API_URL) as response:
        destinations = json.loads(response.read().decode())

    print("Fetching USGS sites...")
    usgs_sites = get_usgs_sites()
    print(f"Found {len(usgs_sites)} USGS monitoring sites\n")

    # Check each destination
    issues = []

    for dest in destinations:
        name = dest['name']
        lat = float(dest['latitude']) if dest['latitude'] else None
        lng = float(dest['longitude']) if dest['longitude'] else None

        if lat is None or lng is None:
            continue

        # Check against known coordinates
        if name in KNOWN_COORDINATES:
            known_lat, known_lng = KNOWN_COORDINATES[name]
            distance = haversine_distance(lat, lng, known_lat, known_lng)
            if distance > 100:
                issues.append({
                    'name': name,
                    'current': (lat, lng),
                    'suggested': (known_lat, known_lng),
                    'distance': distance,
                    'source': 'Known/USGS'
                })

    # Sort by distance (worst first)
    issues.sort(key=lambda x: -x['distance'])

    print("=" * 70)
    print("COORDINATE ISSUES FOUND")
    print("=" * 70)

    if not issues:
        print("\nNo issues found with known landmark coordinates!")
    else:
        for issue in issues:
            print(f"\n{issue['name']}")
            print(f"  Current:   {issue['current'][0]:.6f}, {issue['current'][1]:.6f}")
            print(f"  Suggested: {issue['suggested'][0]:.6f}, {issue['suggested'][1]:.6f}")
            print(f"  Distance:  {issue['distance']:.0f} meters off")
            print(f"  Source:    {issue['source']}")

    # List all USGS sites for reference
    print("\n" + "=" * 70)
    print("USGS MONITORING SITES IN CUYAHOGA VALLEY (for reference)")
    print("=" * 70)
    for site in sorted(usgs_sites, key=lambda x: x['name']):
        print(f"  {site['name']}: {site['lat']:.6f}, {site['lng']:.6f}")


if __name__ == '__main__':
    main()
