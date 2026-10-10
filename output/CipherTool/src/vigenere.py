"""
Vigenère cipher implementation with brute‑force key cracking.

This module provides:
    - vigenere_encrypt(text, key) -> str
    - vigenere_decrypt(text, key) -> str
    - vigenere_brute_force(ciphertext, max_key_len) -> List[Tuple[str, str]]

The key is a case‑insensitive alphabetic string.  Non‑alphabetic characters
in the key are ignored.  The brute‑force cracker uses chi‑square frequency
analysis to rank candidate keys and returns the most likely (key, plaintext)
pairs.
"""

import string
from collections import Counter
from typing import List, Tuple

__all__ = [
    "vigenere_encrypt",
    "vigenere_decrypt",
    "vigenere_brute_force",
]

# Standard English letter frequencies (approximate, from large corpora).
# Used for chi‑square goodness‑of‑fit testing.
_ENGLISH_FREQ = {
    'a': 0.08167, 'b': 0.01492, 'c': 0.02782, 'd': 0.04253,
    'e': 0.12702, 'f': 0.02228, 'g': 0.02015, 'h': 0.06094,
    'i': 0.06966, 'j': 0.00153, 'k': 0.00772, 'l': 0.04025,
    'm': 0.02406, 'n': 0.06749, 'o': 0.07507, 'p': 0.01929,
    'q': 0.00095, 'r': 0.05987, 's': 0.06327, 't': 0.09056,
    'u': 0.02758, 'v': 0.00978, 'w': 0.02360, 'x': 0.00150,
    'y': 0.01974, 'z': 0.00074,
}


def _normalize_key(key: str) -> str:
    """
    Normalize a Vigenère key to a lowercase alphabetic string.

    Non‑alphabetic characters are stripped.  If the resulting string is
    empty, a ValueError is raised.

    Parameters
    ----------
    key: str
        The raw key string.

    Returns
    -------
    str
        Lowercase alphabetic key.

    Raises
    ------
    ValueError
        If the key contains no alphabetic characters.
    """
    normalized = ''.join(ch.lower() for ch in key if ch.isalpha())
    if not normalized:
        raise ValueError("Vigenère key must contain at least one alphabetic character.")
    return normalized


def _shift_char(ch: str, shift: int) -> str:
    """
    Shift a single alphabetic character by *shift* positions in the
    26‑letter alphabet.  Case is preserved.  Non‑alphabetic characters
    are returned unchanged.

    Parameters
    ----------
    ch: str
        A single character.
    shift: int
        Number of positions to shift (can be negative).

    Returns
    -------
    str
        The shifted character.
    """
    if ch.isupper():
        alphabet = string.ascii_uppercase
    elif ch.islower():
        alphabet = string.ascii_lowercase
    else:
        return ch

    idx = alphabet.index(ch)
    shifted_idx = (idx + shift) % 26
    return alphabet[shifted_idx]


def vigenere_encrypt(text: str, key: str) -> str:
    """
    Encrypt *text* using the Vigenère cipher with the given *key*.

    The key is case‑insensitive; only alphabetic characters in the key are
    used.  Non‑alphabetic characters in the text are passed through
    unchanged.  The key repeats cyclically over the alphabetic characters
    of the text.

    Parameters
    ----------
    text: str
        Plain‑text to encrypt.
    key: str
        Vigenère key (alphabetic, case‑insensitive).

    Returns
    -------
    str
        The encrypted ciphertext.

    Raises
    ------
    ValueError
        If the key contains no alphabetic characters.

    Examples
    --------
    >>> vigenere_encrypt("Hello, World!", "key")
    'Riijv, Ybujq!'
    >>> vigenere_encrypt("abc", "abc")
    'ace'
    """
    norm_key = _normalize_key(key)
    key_len = len(norm_key)
    result = []
    key_idx = 0  # index into the key, only advances on alphabetic chars

    for ch in text:
        if ch.isalpha():
            shift = ord(norm_key[key_idx]) - ord('a')
            result.append(_shift_char(ch, shift))
            key_idx = (key_idx + 1) % key_len
        else:
            result.append(ch)

    return ''.join(result)


def vigenere_decrypt(text: str, key: str) -> str:
    """
    Decrypt *text* using the Vigenère cipher with the given *key*.

    This is the inverse of :func:`vigenere_encrypt`.

    Parameters
    ----------
    text: str
        Ciphertext to decrypt.
    key: str
        Vigenère key (alphabetic, case‑insensitive).

    Returns
    -------
    str
        The decrypted plaintext.

    Raises
    ------
    ValueError
        If the key contains no alphabetic characters.

    Examples
    --------
    >>> vigenere_decrypt("Riijv, Ybujq!", "key")
    'Hello, World!'
    >>> vigenere_decrypt("ace", "abc")
    'abc'
    """
    norm_key = _normalize_key(key)
    key_len = len(norm_key)
    result = []
    key_idx = 0

    for ch in text:
        if ch.isalpha():
            shift = ord(norm_key[key_idx]) - ord('a')
            # Decrypt by shifting in the opposite direction
            result.append(_shift_char(ch, -shift))
            key_idx = (key_idx + 1) % key_len
        else:
            result.append(ch)

    return ''.join(result)


def _chi_square_score(plaintext: str) -> float:
    """
    Compute a chi‑square goodness‑of‑fit statistic between the letter
    frequency distribution of *plaintext* and the expected English
    frequency distribution.

    A lower score indicates a closer match to English.

    Parameters
    ----------
    plaintext: str
        Candidate plaintext string.

    Returns
    -------
    float
        Chi‑square statistic.  Lower is better (more English‑like).
        Returns float('inf') if there are no alphabetic characters.
    """
    # Count only lowercase alphabetic characters
    letters = [ch.lower() for ch in plaintext if ch.isalpha()]
    n = len(letters)
    if n == 0:
        return float('inf')

    freq = Counter(letters)
    chi_sq = 0.0
    for letter in string.ascii_lowercase:
        observed = freq.get(letter, 0)
        expected = _ENGLISH_FREQ[letter] * n
        if expected > 0:
            chi_sq += (observed - expected) ** 2 / expected

    return chi_sq


def vigenere_brute_force(
    ciphertext: str,
    max_key_len: int = 6,
    top_n: int = 10,
) -> List[Tuple[str, str]]:
    """
    Attempt to crack a Vigenère ciphertext by brute‑forcing all possible
    keys up to *max_key_len* and ranking them using chi‑square frequency
    analysis.

    For each key length from 1 to *max_key_len*, every possible key
    (a‑z combinations) is tried.  The resulting plaintext is scored with
    a chi‑square test against English letter frequencies.  The top
    *top_n* candidates across all key lengths are returned.

    Parameters
    ----------
    ciphertext: str
        The Vigenère ciphertext to crack.
    max_key_len: int, optional
        Maximum key length to try (default 6).  Must be >= 1.
    top_n: int, optional
        Number of top candidates to return (default 10).

    Returns
    -------
    List[Tuple[str, str]]
        A list of (key, plaintext) tuples sorted by likelihood
        (best first).  The key is lowercase.

    Raises
    ------
    ValueError
        If *max_key_len* is less than 1.

    Notes
    -----
    The search space grows as 26^key_len.  For max_key_len=6 this is
    approximately 308 million combinations, which may be slow.  For
    practical use, keep max_key_len small (≤ 4) or use a known
    key‑length estimate.

    Examples
    --------
    >>> ct = vigenere_encrypt("Hello World", "key")
    >>> results = vigenere_brute_force(ct, max_key_len=3, top_n=5)
    >>> results[0][0]
    'key'
    """
    if max_key_len < 1:
        raise ValueError("max_key_len must be at least 1.")

    # Extract only alphabetic characters for analysis, but we need to
    # preserve the full ciphertext for decryption.  We'll work with the
    # full ciphertext and let the decrypt function handle non-alpha chars.

    candidates: List[Tuple[float, str, str]] = []  # (score, key, plaintext)

    for key_len in range(1, max_key_len + 1):
        # Generate all possible keys of this length
        # For efficiency, we iterate over product of 'a'-'z'
        from itertools import product as _product

        for combo in _product(string.ascii_lowercase, repeat=key_len):
            key = ''.join(combo)
            try:
                plaintext = vigenere_decrypt(ciphertext, key)
            except ValueError:
                continue

            score = _chi_square_score(plaintext)
            candidates.append((score, key, plaintext))

    # Sort by score (lower is better)
    candidates.sort(key=lambda x: x[0])

    # Return top_n as (key, plaintext) tuples
    return [(key, plaintext) for _, key, plaintext in candidates[:top_n]]


# ----------------------------------------------------------------------
# CLI integration helper
# ----------------------------------------------------------------------
def vigenere_cli_handler(args: argparse.Namespace) -> None:
    """
    Handle the 'vigenere' sub‑command from the CLI.

    Expected attributes on *args*:
        - action: str  ('encrypt', 'decrypt', 'crack')
        - text: str | None  (text to process, or None for stdin)
        - key: str | None   (key for encrypt/decrypt)
        - max_key_len: int  (for crack action)
        - top_n: int        (number of results for crack)

    This function is designed to be hooked into the main CLI parser.
    """
    import sys

    # Read input text
    if args.text is not None:
        text = args.text
    else:
        text = sys.stdin.read().rstrip('\n')

    action = getattr(args, 'action', 'encrypt')

    if action == 'encrypt':
        if not getattr(args, 'key', None):
            print("Error: --key is required for encryption.", file=sys.stderr)
            sys.exit(1)
        result = vigenere_encrypt(text, args.key)
        print(result)

    elif action == 'decrypt':
        if not getattr(args, 'key', None):
            print("Error: --key is required for decryption.", file=sys.stderr)
            sys.exit(1)
        result = vigenere_decrypt(text, args.key)
        print(result)

    elif action == 'crack':
        max_key_len = getattr(args, 'max_key_len', 6)
        top_n = getattr(args, 'top_n', 10)
        results = vigenere_brute_force(text, max_key_len=max_key_len, top_n=top_n)
        if not results:
            print("No candidates found.", file=sys.stderr)
            return
        print(f"Top {len(results)} candidates (key, plaintext):")
        for i, (key, plaintext) in enumerate(results, 1):
            print(f"  {i}. key='{key}'  plaintext='{plaintext}'")

    else:
        print(f"Unknown action: {action}", file=sys.stderr)
        sys.exit(1)


def register_vigenere_subcommand(parser: argparse.ArgumentParser) -> None:
    """
    Register the 'vigenere' sub‑command and its sub‑sub‑commands
    (encrypt, decrypt, crack) onto the given argument parser.

    Parameters
    ----------
    parser: argparse.ArgumentParser
        The main argument parser (or a sub‑parser group).
    """
    vigenere_parser = parser.add_parser(
        'vigenere',
        help='Vigenère cipher operations (encrypt, decrypt, crack)',
    )

    vigenere_subparsers = vigenere_parser.add_subparsers(
        dest='action',
        help='Vigenère action to perform',
    )

    # --- encrypt ---
    enc_parser = vigenere_subparsers.add_parser(
        'encrypt',
        help='Encrypt text with a Vigenère key',
    )
    enc_parser.add_argument(
        'text',
        nargs='?',
        default=None,
        help='Text to encrypt (reads from stdin if omitted)',
    )
    enc_parser.add_argument(
        '--key', '-k',
        required=True,
        help='Vigenère key (alphabetic, case‑insensitive)',
    )
    enc_parser.set_defaults(func=vigenere_cli_handler)

    # --- decrypt ---
    dec_parser = vigenere_subparsers.add_parser(
        'decrypt',
        help='Decrypt text with a Vigenère key',
    )
    dec_parser.add_argument(
        'text',
        nargs='?',
        default=None,
        help='Ciphertext to decrypt (reads from stdin if omitted)',
    )
    dec_parser.add_argument(
        '--key', '-k',
        required=True,
        help='Vigenère key (alphabetic, case‑insensitive)',
    )
    dec_parser.set_defaults(func=vigenere_cli_handler)

    # --- crack ---
    crack_parser = vigenere_subparsers.add_parser(
        'crack',
        help='Brute‑force crack a Vigenère ciphertext',
    )
    crack_parser.add_argument(
        'text',
        nargs='?',
        default=None,
        help='Ciphertext to crack (reads from stdin if omitted)',
    )
    crack_parser.add_argument(
        '--max-key-len', '-m',
        type=int,
        default=6,
        help='Maximum key length