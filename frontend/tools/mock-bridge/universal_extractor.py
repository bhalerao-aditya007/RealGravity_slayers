import sys
import os
import json
import zipfile

def extract_any(file_path):
    if not os.path.exists(file_path):
        return f"Error: Path does not exist: {file_path}"

    if os.path.isdir(file_path):
        # Index Directory
        tree = []
        for root, dirs, files in os.walk(file_path):
            dirs[:] = [d for d in dirs if d not in ['.git', 'node_modules', '__pycache__', '.venv', 'dist', 'build']]
            rel_root = os.path.relpath(root, file_path)
            for f in files[:30]:
                tree.append(os.path.join(rel_root, f) if rel_root != '.' else f)
        summary = f"Directory Structure ({len(tree)} files indexed):\n" + "\n".join(tree[:50])
        # Check for README or package info
        for spec in ['README.md', 'package.json', 'requirements.txt', 'pyproject.toml']:
            spec_path = os.path.join(file_path, spec)
            if os.path.exists(spec_path):
                with open(spec_path, 'r', encoding='utf-8', errors='ignore') as sf:
                    summary += f"\n\n--- Content of {spec} ---\n" + sf.read()[:3000]
        return summary

    ext = os.path.splitext(file_path)[1].lower()

    # 1. PDF
    if ext == '.pdf':
        try:
            from pypdf import PdfReader
            reader = PdfReader(file_path)
            return "\n".join(p.extract_text() or "" for p in reader.pages)
        except ImportError:
            os.system('pip install --quiet pypdf')
            from pypdf import PdfReader
            reader = PdfReader(file_path)
            return "\n".join(p.extract_text() or "" for p in reader.pages)

    # 2. Excel / CSV / TSV / Tabular
    if ext in ['.csv', '.tsv', '.txt', '.log']:
        with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
            return f.read(50000)

    if ext in ['.xlsx', '.xls']:
        try:
            import openpyxl
            wb = openpyxl.load_workbook(file_path, data_only=True)
            res = []
            for sheet in wb.sheetnames[:3]:
                ws = wb[sheet]
                res.append(f"Sheet: {sheet}")
                for row in list(ws.iter_rows(values_only=True))[:40]:
                    res.append("\t".join(str(c) if c is not None else "" for c in row))
            return "\n".join(res)
        except Exception:
            # Fallback quick csv/text or install openpyxl
            try:
                os.system('pip install --quiet openpyxl')
                import openpyxl
                wb = openpyxl.load_workbook(file_path, data_only=True)
                return "\n".join(f"Sheet: {s}" for s in wb.sheetnames)
            except Exception as e:
                return f"Excel file {os.path.basename(file_path)}: {e}"

    # 3. Word Documents (.docx)
    if ext == '.docx':
        try:
            import docx
            doc = docx.Document(file_path)
            return "\n".join(p.text for p in doc.paragraphs if p.text)
        except Exception:
            # Native XML fallback without extra deps
            with zipfile.ZipFile(file_path) as z:
                xml_content = z.read('word/document.xml').decode('utf-8', errors='ignore')
                import re
                return "\n".join(re.findall(r'<w:t[^>]*>(.*?)</w:t>', xml_content))

    # 4. JSON / YAML / XML / Code Files
    if ext in ['.json', '.jsonl', '.yaml', '.yml', '.xml', '.py', '.js', '.ts', '.tsx', '.jsx', '.html', '.css', '.c', '.cpp', '.h', '.java', '.go', '.rs', '.sql', '.sh', '.md']:
        with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
            return f.read(50000)

    # 5. Zip Archives
    if ext in ['.zip']:
        with zipfile.ZipFile(file_path, 'r') as z:
            names = z.namelist()
            return f"Zip Archive ({len(names)} files):\n" + "\n".join(names[:50])

    # Default text attempt
    try:
        with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
            return f.read(50000)
    except Exception as e:
        return f"Binary or unsupported file ({os.path.basename(file_path)}, size: {os.path.getsize(file_path)} bytes)"

if __name__ == '__main__':
    if len(sys.argv) > 1:
        print(extract_any(sys.argv[1]))
