import argparse
import logging
import sys
import string
from collections import Counter
from itertools import product

# ----------------------------------------------------------------------
# Logging configuration
# ----------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)

# ----------------------------------------------------------------------
# Helper utilities
# ----------------------------------------------------------------------
def read_input(text_arg: str | None) -> str:
    """
    Return the plaintext/ciphertext to process.
    If ``text_arg`` is provided, it is returned unchanged.
    Otherwise the function reads from ``stdin`` until EOF.
    """
    if text_arg is not None:
        logger.debug("Using text supplied via argument.")
        return text_arg
    logger.debug("Reading text from stdin.")
    return sys.stdin.read().rstrip("\n")

def normalize_key_caesar(key: str) -> int:
    """
    Convert a Caesar key to an integer shift in the range 0‑25.
    Raises ValueError if the key cannot be interpreted as an integer.
    """
    try:
        shift = int(key) % 26
        logger.debug("Normalized Caesar key %s to shift %d.", key, shift)
        return shift
    except ValueError as exc:
        raise ValueError(f"Caesar key must be an integer, got '{key}'.") from exc

def normalize_key_vigenere(key: str) -> str:
    """
    Validate a Vigenère key – it must consist only of alphabetic characters.
    Returns the key in uppercase.
    """
    if not key.isalpha():
        raise ValueError("Vigenère key must contain only letters.")
    normalized = key.upper()
    logger.debug("Normalized Vigenère key to %s.", normalized)
    return normalized

def shift_char(ch: str, shift: int) -> str:
    """
    Shift a single alphabetic character by ``shift`` positions.
    Non‑alphabetic characters are returned unchanged.
    """
    if ch.isupper():
        base = ord('A')
        return chr((ord(ch) - base + shift) % 26 + base)
    if ch.islower():
        base = ord('a')
        return chr((ord(ch) - base + shift) % 26 + base)
    return ch

# ----------------------------------------------------------------------
# Cipher implementations
# ----------------------------------------------------------------------
def caesar_encrypt(text: str, shift: int) -> str:
    """Encrypt ``text`` using a Caesar shift."""
    logger.debug("Encrypting with Caesar shift %d.", shift)
    return "".join(shift_char(ch, shift) for ch in text)

def caesar_decrypt(text: str, shift: int) -> str:
    """Decrypt ``text`` using a Caesar shift."""
    logger.debug("Decrypting with Caesar shift %d.", shift)
    return "".join(shift_char(ch, -shift) for ch in text)

def vigenere_encrypt(text: str, key: str) -> str:
    """Encrypt ``text`` using the Vigenère cipher."""
    logger.debug("Encrypting with Vigenère key %s.", key)
    result = []
    key_idx = 0
    for ch in text:
        if ch.isalpha():
            shift = ord(key[key_idx % len(key)]) - ord('A')
            result.append(shift_char(ch, shift))
            key_idx += 1
        else:
            result.append(ch)
    return "".join(result)

def vigenere_decrypt(text: str, key: str) -> str:
    """Decrypt ``text`` using the Vigenère cipher."""
    logger.debug("Decrypting with Vigenère key %s.", key)
    result = []
    key_idx = 0
    for ch in text:
        if ch.isalpha():
            shift = ord(key[key_idx % len(key)]) - ord('A')
            result.append(shift_char(ch, -shift))
            key_idx += 1
        else:
            result.append(ch)
    return "".join(result)

# ----------------------------------------------------------------------
# Brute‑force cracking utilities
# ----------------------------------------------------------------------
def caesar_brute_force(ciphertext: str) -> list[tuple[int, str]]:
    """
    Try all 26 Caesar shifts and return a list of tuples
    ``(shift, plaintext)`` sorted by descending English‑letter frequency score.
    """
    logger.info("Starting Caesar brute‑force (26 possibilities).")
    candidates = [(s, caesar_decrypt(ciphertext, s)) for s in range(26)]

    def english_score(text: str) -> float:
        # Simple frequency‑based scoring: higher score for common letters.
        freq = Counter(c.upper() for c in text if c.isalpha())
        total = sum(freq.values()) or 1
        # Relative frequencies of ETAOIN SHRDLU (most common in English)
        common = "ETAOINSHRDLU"
        return sum(freq.get(ch, 0) for ch in common) / total

    candidates.sort(key=lambda pair: english_score(pair[1]), reverse=True)
    logger.debug("Caesar brute‑force completed.")
    return candidates

def vigenere_brute_force(ciphertext: str, max_key_len: int = 3) -> list[tuple[str, str]]:
    """
    Brute‑force Vigenère keys up to ``max_key_len`` characters.
    Returns a list of ``(key, plaintext)`` sorted by a simple English score.
    The search space grows as 26**len, so keep ``max_key_len`` small.
    """
    logger.info(
        "Starting Vigenère brute‑force (key lengths 1‑%d, total combos ≈ %d).",
        max_key_len,
        sum(26 ** i for i in range(1, max_key_len + 1)),
    )
    candidates = []

    alphabet = string.ascii_uppercase
    for length in range(1, max_key_len + 1):
        for tup in product(alphabet, repeat=length):
            key = "".join(tup)
            plaintext = vigenere_decrypt(ciphertext, key)
            candidates.append((key, plaintext))

    def english_score(text: str) -> float:
        freq = Counter(c.upper() for c in text if c.isalpha())
        total = sum(freq.values()) or 1
        common = "ETAOINSHRDLU"
        return sum(freq.get(ch, 0) for ch in common) / total

    candidates.sort(key=lambda pair: english_score(pair[1]), reverse=True)
    logger.debug("Vigenère brute‑force completed.")
    return candidates

# ----------------------------------------------------------------------
# CLI implementation
# ----------------------------------------------------------------------
def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="cipher_tool",
        description="Encrypt, decrypt, and brute‑force Caesar and Vigenère ciphers.",
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    # ------------------------------------------------------------------
    # Caesar sub‑command
    # ------------------------------------------------------------------
    caesar_parser = subparsers.add_parser(
        "caesar", help="Encrypt or decrypt using the Caesar cipher."
    )
    caesar_parser.add_argument(
        "-t", "--text", type=str, help="Plaintext or ciphertext. If omitted, read from stdin."
    )
    caesar_parser.add_argument(
        "-k", "--key", type=str, required=True, help="Integer shift (e.g., 3)."
    )
    mode_group = caesar_parser.add_mutually_exclusive_group(required=True)
    mode_group.add_argument("-e", "--encrypt", action="store_true", help="Encrypt the input.")
    mode_group.add_argument("-d", "--decrypt", action="store_true", help="Decrypt the input.")
    caesar_parser.add_argument("-v", "--verbose", action="store_true", help="Enable debug logging.")

    # ------------------------------------------------------------------
    # Vigenère sub‑command
    # ------------------------------------------------------------------
    vig_parser = subparsers.add_parser(
        "vigenere", help="Encrypt or decrypt using the Vigenère cipher."
    )
    vig_parser.add_argument(
        "-t", "--text", type=str, help="Plaintext or ciphertext. If omitted, read from stdin."
    )
    vig_parser.add_argument(
        "-k", "--key", type=str, required=True, help="Alphabetic key (e.g., SECRET)."
    )
    mode_group = vig_parser.add_mutually_exclusive_group(required=True)
    mode_group.add_argument("-e", "--encrypt", action="store_true", help="Encrypt the input.")
    mode_group.add_argument("-d", "--decrypt", action="store_true", help="Decrypt the input.")
    vig_parser.add_argument("-v", "--verbose", action="store_true", help="Enable debug logging.")

    # ------------------------------------------------------------------
    # Crack sub‑command
    # ------------------------------------------------------------------
    crack_parser = subparsers.add_parser(
        "crack", help="Brute‑force attack on Caesar or Vigenère ciphertexts."
    )
    crack_parser.add_argument(
        "-t", "--text", type=str, help="Ciphertext to crack. If omitted, read from stdin."
    )
    crack_parser.add_argument(
        "-a",
        "--algorithm",
        choices=["caesar", "vigenere"],
        required=True,
        help="Cipher algorithm to attack.",
    )
    crack_parser.add_argument(
        "-k",
        "--key",
        type=str,
        help="Optional known key (used only for Vigenère to limit search).",
    )
    crack_parser.add_argument(
        "--max-key-len",
        type=int,
        default=3,
        help="Maximum key length for Vigenère brute‑force (default: 3).",
    )
    crack_parser.add_argument("-v", "--verbose", action="store_true", help="Enable debug logging.")
    return parser

def main() -> None:
    parser = build_parser()
    args = parser.parse_args()

    # Adjust logging level if verbose flag is set on any sub‑command
    if getattr(args, "verbose", False):
        logger.setLevel(logging.DEBUG)
        logger.debug("Verbose mode enabled.")

    # ------------------------------------------------------------------
    # Caesar command handling
    # ------------------------------------------------------------------
    if args.command == "caesar":
        text = read_input(args.text)
        shift = normalize_key_caesar(args.key)

        if args.encrypt:
            result = caesar_encrypt(text, shift)
            logger.info("Caesar encryption completed.")
        else:
            result = caesar_decrypt(text, shift)
            logger.info("Caesar decryption completed.")

        print(result)

    # ------------------------------------------------------------------
    # Vigenère command handling
    # ------------------------------------------------------------------
    elif args.command == "vigenere":
        text = read_input(args.text)
        key = normalize_key_vigenere(args.key)

        if args.encrypt:
            result = vigenere_encrypt(text, key)
            logger.info("Vigenère encryption completed.")
        else:
            result = vigenere_decrypt(text, key)
            logger.info("Vigenère decryption completed.")

        print(result)

    # ------------------------------------------------------------------
    # Crack command handling
    # ------------------------------------------------------------------
    elif args.command == "crack":
        ciphertext = read_input(args.text)

        if args.algorithm == "caesar":
            candidates = caesar_brute_force(ciphertext)
            print("=== Caesar brute‑force results (most likely first) ===")
            for shift, plaintext in candidates:
                print(f"[Shift {shift:2d}] {plaintext}")

        else:  # Vigenère
            if args.key:
                # If a key is supplied we only test that single key.
                key = normalize_key_vigenere(args.key)
                plaintext = vigenere_decrypt(ciphertext, key)
                print(f"[Key {key}] {plaintext}")
            else:
                candidates = vigenere_brute_force(ciphertext, max_key_len=args.max_key_len)
                print("=== Vigenère brute‑force results (most likely first) ===")
                for key, plaintext in candidates[:10]:  # show top 10 to avoid flood
                    print(f"[Key {key}] {plaintext}")

    else:
        parser.error("Unknown command.")  # Should never happen due to argparse enforcement.

if __name__ == "__main__":
    main()