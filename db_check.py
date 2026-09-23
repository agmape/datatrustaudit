
import sqlite3
import os

db_path = r"d:\FISTPOWER\TRACKNOLOGY\TRACKNOLOGY_CLAUDE\GTMAUDIT\db\gtmaudit.db"

if not os.path.exists(db_path):
    print(f"Database not found at {db_path}")
else:
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT id, url, status, created_at FROM scans ORDER BY created_at DESC LIMIT 5")
        rows = cursor.fetchall()
        print("Last 5 scans:")
        for row in rows:
            print(row)
            
        cursor.execute("SELECT count(*) FROM scans WHERE status='failed'")
        failed_count = cursor.fetchone()[0]
        print(f"Total failed scans: {failed_count}")
        
        # Check for errors in raw_results if failed
        cursor.execute("SELECT id, url, raw_results FROM scans WHERE status='failed' LIMIT 1")
        failed_scan = cursor.fetchone()
        if failed_scan:
            print(f"Sample failed scan ID {failed_scan[0]} for {failed_scan[1]}")
            # print(failed_scan[2][:500]) # results might be huge
    except Exception as e:
        print(f"Error: {e}")
    finally:
        conn.close()
