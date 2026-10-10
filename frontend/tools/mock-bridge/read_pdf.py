import sys
import os

if len(sys.argv) < 2:
    sys.exit(1)

file_path = sys.argv[1]
if not os.path.exists(file_path):
    print(f"File not found: {file_path}", file=sys.stderr)
    sys.exit(1)

try:
    from pypdf import PdfReader
    reader = PdfReader(file_path)
    text_parts = []
    for page in reader.pages:
        txt = page.extract_text()
        if txt:
            text_parts.append(txt)
    print("\n".join(text_parts))
except Exception as e:
    print(f"PDF extraction error: {e}", file=sys.stderr)
    sys.exit(1)
