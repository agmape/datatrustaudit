
import sqlite3
import os

db_path = r"d:\FISTPOWER\TRACKNOLOGY\TRACKNOLOGY_CLAUDE\GTMAUDIT\db\gtmaudit.db"

if os.path.exists(db_path):
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    cursor.execute("PRAGMA table_info(scans)")
    columns = cursor.fetchall()
    print("Columns in 'scans' table:")
    for col in columns:
        print(col)
    conn.close()
