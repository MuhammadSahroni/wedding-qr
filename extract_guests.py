#!/usr/bin/env python3
"""
Extract guest data from 'QR List Tamu Undangan - WILDAN AISYAH' PDF.
Outputs guests.json with all 505 guest records.

PDF Table Structure: No | Nama | Status Relasi | ID Tamu | QR CODE
"""

import json
import re
import sys
import os

try:
    import pdfplumber
except ImportError:
    print("Installing pdfplumber...")
    os.system(f"{sys.executable} -m pip install pdfplumber")
    import pdfplumber


def extract_guests(pdf_path: str, output_path: str):
    guests = []
    seen_ids = set()
    current_category = ""  # Track category across rows (it only appears on first row of group)
    
    print(f"Opening PDF: {pdf_path}")
    
    with pdfplumber.open(pdf_path) as pdf:
        print(f"Total pages: {len(pdf.pages)}")
        
        for page_num, page in enumerate(pdf.pages, 1):
            tables = page.extract_tables()
            
            if not tables:
                continue
            
            for table in tables:
                for row in table:
                    if not row or len(row) < 4:
                        continue
                    
                    # Clean up None values
                    cleaned = [str(cell).strip() if cell else "" for cell in row]
                    
                    # Skip header rows
                    if cleaned[0].lower() in ('no', 'no.', '#'):
                        continue
                    
                    try:
                        no_str = cleaned[0].replace('.', '').strip()
                        if not no_str.isdigit():
                            continue
                        
                        no = int(no_str)
                        name = cleaned[1].strip()
                        
                        # Column 2 = Status Relasi (category)
                        # It only appears on the first row of each category group
                        category_cell = cleaned[2].strip()
                        if category_cell and category_cell.lower() not in ('none', ''):
                            current_category = category_cell
                        
                        # Column 3 = ID Tamu
                        guest_id = cleaned[3].strip() if len(cleaned) > 3 else ""
                        
                        # Skip if no valid name
                        if not name or len(name) < 1:
                            continue
                        
                        # Skip if ID already processed (prevent duplicates)
                        if guest_id and guest_id in seen_ids:
                            continue
                        
                        # Build QR payload (Nama|Kategori format as specified in PRD)
                        qr_payload = f"{name}|{current_category}" if current_category else name
                        
                        guest = {
                            "no": no,
                            "id": guest_id,
                            "name": name,
                            "category": current_category,
                            "qr_payload": qr_payload
                        }
                        
                        guests.append(guest)
                        if guest_id:
                            seen_ids.add(guest_id)
                        
                    except (ValueError, IndexError):
                        continue
            
            if page_num % 10 == 0:
                print(f"  Processed {page_num} pages, {len(guests)} guests found so far...")
    
    # Sort by number
    guests.sort(key=lambda g: g['no'])
    
    # Save to JSON
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(guests, f, ensure_ascii=False, indent=2)
    
    print(f"\n[OK] Extraction complete!")
    print(f"   Total guests extracted: {len(guests)}")
    print(f"   Output saved to: {output_path}")
    
    # Print categories found
    categories = set(g['category'] for g in guests if g['category'])
    print(f"\n[CATEGORIES] {len(categories)} categories found:")
    for cat in sorted(categories):
        count = sum(1 for g in guests if g['category'] == cat)
        print(f"   - {cat}: {count} guests")
    
    # Print sample
    if guests:
        print(f"\n[SAMPLE] First 10 guests:")
        for g in guests[:10]:
            print(f"   {g['no']:3d}. [{g['id']}] {g['name']} ({g['category']})")
    
    # Verify completeness
    missing_ids = [g for g in guests if not g['id']]
    if missing_ids:
        print(f"\n[WARNING] {len(missing_ids)} guests have no ID!")
        for g in missing_ids[:5]:
            print(f"   No.{g['no']}: {g['name']}")
    
    return guests


if __name__ == "__main__":
    script_dir = os.path.dirname(os.path.abspath(__file__))
    pdf_filename = "QR List Tamu Undangan - WILDAN AISYAH - TAMU 1-508.pdf"
    pdf_path = os.path.join(script_dir, pdf_filename)
    output_path = os.path.join(script_dir, "guests.json")
    
    if not os.path.exists(pdf_path):
        print(f"[ERROR] PDF not found: {pdf_path}")
        print(f"   Please ensure the PDF file is in the same directory as this script.")
        sys.exit(1)
    
    extract_guests(pdf_path, output_path)
