import sqlite3
import json

db_path = r"C:\Users\Lenovo\.local\share\opencode\opencode.db"
conn = sqlite3.connect(db_path)
c = conn.cursor()

print("=== Recent Sessions in session_v2 ===")
c.execute("""
    SELECT id, title, model, tokens_input, tokens_output, datetime(time_created/1000, 'unixepoch', 'localtime') 
    FROM session_v2 
    ORDER BY time_created DESC 
    LIMIT 5
""")
for r in c.fetchall():
    print(f"Session ID: {r[0]} | Title: {r[1]} | Model: {r[2]}")
    print(f"  Input Tokens: {r[3]} | Output Tokens: {r[4]} | Created: {r[5]}")

print("\n=== Recent Messages in session_message ===")
c.execute("PRAGMA table_info(session_message)")
cols = [col[1] for col in c.fetchall()]
print("Columns in session_message:", cols)

c.execute("SELECT * FROM session_message ORDER BY rowid DESC LIMIT 5")
for r in c.fetchall():
    print("Row:", r)
