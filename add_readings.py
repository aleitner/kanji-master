#!/usr/bin/env python3

"""
Add Kun/On Readings to Kanji Metadata

Fetches readings from Jiten API and adds them to your metadata.
Fast and focused - only adds kunReadings and onReadings.

Usage: python3 add_readings.py
"""

import json
import time
import sys
import urllib.request
import urllib.parse
from typing import Dict, Any, Optional

# Configuration
INPUT_FILE = 'kanji_metadata.json'
OUTPUT_FILE = 'kanji_metadata_with_readings.json'
JITEN_API = 'https://api.jiten.moe/api/kanji/'
DELAY_SECONDS = 0.2  # Fast since we're only getting readings

# Statistics
stats = {
    'total': 0,
    'processed': 0,
    'success': 0,
    'failed': 0,
    'already_have': 0
}

def fetch_kanji_data(kanji: str) -> Optional[Dict[str, Any]]:
    """Fetch kanji data from Jiten API"""
    try:
        # URL encode the kanji
        encoded = urllib.parse.quote(kanji, safe='')
        url = f"{JITEN_API}{encoded}"
        
        req = urllib.request.Request(url)
        req.add_header('User-Agent', 'Mozilla/5.0')
        req.add_header('Accept', 'application/json')
        
        with urllib.request.urlopen(req, timeout=20) as response:
            if response.status == 200:
                return json.loads(response.read().decode('utf-8'))
    except Exception as e:
        print(f"    Error: {e}")
    return None

def process_kanji(kanji: str, metadata: Dict[str, Any]) -> bool:
    """Add readings to a single kanji. Returns True if successful."""
    stats['processed'] += 1
    progress = f"[{stats['processed']}/{stats['total']}]"
    
    # Check if already has readings
    current = metadata[kanji]
    if 'kunReadings' in current and 'onReadings' in current:
        print(f"{progress} {kanji} - Already has readings, skipping")
        stats['already_have'] += 1
        return True
    
    print(f"{progress} {kanji} - Fetching...", end=' ')
    
    # Fetch from Jiten API
    data = fetch_kanji_data(kanji)
    
    if not data or 'onReadings' not in data:
        print("✗ Failed")
        stats['failed'] += 1
        return False
    
    # Extract readings
    kun_readings = data.get('kunReadings', [])
    on_readings = data.get('onReadings', [])
    
    # Add to metadata
    metadata[kanji]['kunReadings'] = kun_readings
    metadata[kanji]['onReadings'] = on_readings
    
    stats['success'] += 1
    print(f"✓ (kun: {len(kun_readings)}, on: {len(on_readings)})")
    return True

def save_metadata(metadata: Dict[str, Any], filename: str):
    """Save metadata to file"""
    with open(filename, 'w', encoding='utf-8') as f:
        json.dump(metadata, f, ensure_ascii=False, indent=2)

def main():
    """Main execution"""
    start_time = time.time()
    
    print("\n" + "=" * 60)
    print("📖 ADD KUN/ON READINGS TO METADATA")
    print("=" * 60 + "\n")
    
    # Load existing metadata
    print(f"Loading {INPUT_FILE}...")
    try:
        with open(INPUT_FILE, 'r', encoding='utf-8') as f:
            metadata = json.load(f)
    except FileNotFoundError:
        print(f"❌ Error: {INPUT_FILE} not found!")
        sys.exit(1)
    
    kanji_list = list(metadata.keys())
    stats['total'] = len(kanji_list)
    print(f"✓ Found {stats['total']} kanji\n")
    
    print("=" * 60)
    print("🚀 Starting...\n")
    
    try:
        for i, kanji in enumerate(kanji_list):
            process_kanji(kanji, metadata)
            
            # Delay between requests
            if i < len(kanji_list) - 1:
                time.sleep(DELAY_SECONDS)
            
            # Save progress every 100 kanji
            if (i + 1) % 100 == 0:
                print(f"\n{'='*60}")
                print(f"💾 Saving progress: {i + 1}/{stats['total']}")
                save_metadata(metadata, OUTPUT_FILE)
                print(f"   Success: {stats['success']}, Failed: {stats['failed']}")
                print(f"{'='*60}\n")
        
        # Final save
        print(f"\n💾 Saving final output to {OUTPUT_FILE}...")
        save_metadata(metadata, OUTPUT_FILE)
        print("✓ Saved!\n")
        
        # Summary
        duration = (time.time() - start_time) / 60
        success_rate = (stats['success'] / stats['total'] * 100) if stats['total'] > 0 else 0
        
        print("=" * 60)
        print("🎉 COMPLETE!")
        print("=" * 60)
        print(f"Total kanji:         {stats['total']}")
        print(f"✓ Already had:       {stats['already_have']}")
        print(f"✓ Added readings:    {stats['success']} ({success_rate:.1f}%)")
        print(f"✗ Failed:            {stats['failed']}")
        print(f"Duration:            {duration:.1f} minutes")
        print(f"Output file:         {OUTPUT_FILE}")
        print("=" * 60 + "\n")
        
        if stats['failed'] > 0:
            print(f"⚠️  {stats['failed']} kanji failed. You can re-run to retry.\n")
        else:
            print("✨ All kanji now have readings!\n")
        
        print("Next steps:")
        print(f"  mv {OUTPUT_FILE} {INPUT_FILE}")
        print("  git add kanji_metadata.json app.js")
        print("  git commit -m 'Add kun/on readings'")
        print("  git push\n")
            
    except KeyboardInterrupt:
        print("\n\n⏸️  Interrupted. Saving progress...")
        save_metadata(metadata, OUTPUT_FILE)
        sys.exit(1)
    except Exception as e:
        print(f"\n❌ Fatal error: {e}")
        print("💾 Saving partial progress...")
        save_metadata(metadata, OUTPUT_FILE)
        sys.exit(1)

if __name__ == '__main__':
    main()