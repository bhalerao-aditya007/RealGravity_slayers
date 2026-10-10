"""
Keyring and secure credential resolution.
Loads keys from OS keyring with fallback to environment variables.
"""
from __future__ import annotations
import os
from typing import Optional


class KeyringResolver:
    @staticmethod
    def resolve_key(key_ref: str, env_var: Optional[str] = None) -> Optional[str]:
        """Resolves a key reference e.g. 'keyring:groq-1' or from an environment variable."""
        # Try OS keyring if available
        if key_ref.startswith("keyring:"):
            service = "realgravity"
            username = key_ref.split(":", 1)[1]
            try:
                import keyring  # type: ignore
                val = keyring.get_password(service, username)
                if val:
                    return val
            except Exception:
                pass

        # Try env var
        if env_var and os.getenv(env_var):
            return os.getenv(env_var)

        # Fallback to key_ref as env var name if uppercase
        if os.getenv(key_ref):
            return os.getenv(key_ref)

        return None
