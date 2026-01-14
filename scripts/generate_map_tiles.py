#!/usr/bin/env python3
"""Generate OpenStreetMap tile URLs for all destinations."""

import json
import urllib.request
import csv
import sys

API_URL = "http://localhost:8080/api/destinations"

def get_map_tile_url(lat, lng, zoom=15):
    lat_f = float(lat)
    lng_f = float(lng)
    return f"https://staticmap.openstreetmap.de/staticmap.php?center={lat_f},{lng_f}&zoom={zoom}&size=800x400&maptype=mapnik&markers={lat_f},{lng_f},red-pushpin"

def main():
    with urllib.request.urlopen(API_URL) as response:
        destinations = json.loads(response.read().decode())

    writer = csv.writer(sys.stdout)
    writer.writerow(['Name', 'Image URL'])

    for dest in destinations:
        name = dest['name']
        lat = dest.get('latitude')
        lng = dest.get('longitude')

        if lat and lng:
            url = get_map_tile_url(lat, lng)
            writer.writerow([name, url])
        else:
            writer.writerow([name, ''])

    print(f"Generated {len(destinations)} map tile URLs", file=sys.stderr)

if __name__ == '__main__':
    main()
