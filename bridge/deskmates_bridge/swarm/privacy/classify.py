"""
Local repository file classifier and privacy scanner.
Labels files: restricted, internal, public.
"""
from __future__ import annotations
import fnmatch
from pathlib import Path
from typing import Dict, List, Literal
from .redact import redact_text

FileClassification = Literal["restricted", "internal", "public"]

DEFAULT_RESTRICTED_GLOBS = [
    "**/.env*",
    "**/*.pem",
    "**/*.key",
    "**/secrets/**",
    "**/*credential*",
    "**/id_rsa*",
    "**/*.p12",
    "**/*.pfx",
]

PUBLIC_GLOBS = [
    "**/README*",
    "**/LICENSE*",
    "**/NOTICE*",
    "**/docs/**",
    "**/public/**",
]


class FileClassifier:
    def __init__(self, root: str | Path, extra_restricted_globs: List[str] | None = None) -> None:
        self.root = Path(root).resolve()
        self.restricted_globs = list(DEFAULT_RESTRICTED_GLOBS) + (extra_restricted_globs or [])
        self.overrides: Dict[str, FileClassification] = {}
        self._load_repo_privacy_file()

    def _load_repo_privacy_file(self) -> None:
        privacy_file = self.root / ".realgravity-privacy"
        if privacy_file.exists():
            try:
                for line in privacy_file.read_text(encoding="utf-8").splitlines():
                    line = line.strip()
                    if not line or line.startswith("#"):
                        continue
                    if ":" in line:
                        glob_pat, label = line.split(":", 1)
                        lbl = label.strip().lower()
                        if lbl in ("restricted", "internal", "public"):
                            self.overrides[glob_pat.strip()] = lbl  # type: ignore[assignment]
            except Exception:
                pass

    def _matches_pattern(self, path_str: str, base_name: str, pat: str) -> bool:
        if fnmatch.fnmatch(path_str, pat) or fnmatch.fnmatch(base_name, pat):
            return True
        if pat.startswith("**/"):
            stripped = pat[3:]
            if fnmatch.fnmatch(path_str, stripped) or fnmatch.fnmatch(base_name, stripped):
                return True
        return False

    def classify_file(self, rel_path: str | Path) -> FileClassification:
        path_str = str(rel_path).replace("\\", "/")
        base_name = Path(path_str).name

        # Check explicit overrides
        for pat, lbl in self.overrides.items():
            if self._matches_pattern(path_str, base_name, pat):
                return lbl

        # Check restricted globs
        for pat in self.restricted_globs:
            if self._matches_pattern(path_str, base_name, pat):
                return "restricted"

        # Check content if file exists
        full_path = (self.root / rel_path).resolve()
        if full_path.is_file() and full_path.stat().st_size < 200_000:
            try:
                content = full_path.read_text(encoding="utf-8", errors="ignore")
                _, redactions = redact_text(content)
                if any("KEY" in r or "PRIVATE" in r or "SECRET" in r for r in redactions):
                    return "restricted"
            except Exception:
                pass

        # Check public
        for pat in PUBLIC_GLOBS:
            if self._matches_pattern(path_str, base_name, pat):
                return "public"

        return "internal"

    def make_stub(self, rel_path: str, symbols: List[str] | None = None) -> str:
        syms_str = ", ".join(symbols) if symbols else "none"
        return f"<restricted file: {rel_path}, symbols: {syms_str}>"
