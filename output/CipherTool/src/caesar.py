import string
from typing import List, Tuple

__all__ = [
    "caesar_encrypt",
    "caesar_decrypt",
    "caesar_brute_force",
]


def _shift_char(ch: str, shift: int) -> str:
    """
    Shift a single alphabetic character by *shift* positions.
    Upper‑case letters stay upper‑case, lower‑case stay lower‑case.
    Non‑alphabetic characters are returned unchanged.
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


def caesar_encrypt(text: str, shift: int) -> str:
    """
    Encrypt *text* using a Caesar cipher with the given *shift*.

    Parameters
    ----------
    text: str
        Plain‑text to encrypt.
    shift: int
        Number of positions to shift each alphabetic character.
        Positive values shift forward; negative values shift backward.
        The shift is normalized to the range 0‑25.

    Returns
    -------
    str
        The encrypted ciphertext, preserving the original case and
        leaving non‑alphabetic characters untouched.

    Examples
    --------
    >>> caesar_encrypt("Hello, World!", 3)
    'Khoor, Zruog!'
    >>> caesar_encrypt("abcXYZ", -2)
    'yzaVWX'
    """
    normalized_shift = shift % 26
    return "".join(_shift_char(ch, normalized_shift) for ch in text)


def caesar_decrypt(text: str, shift: int) -> str:
    """
    Decrypt *text* that was encrypted with a Caesar cipher using *shift*.

    Parameters
    ----------
    text: str
        Cipher‑text to decrypt.
    shift: int
        The shift that was originally used for encryption.
        The function automatically normalizes the shift to the range 0‑25.

    Returns
    -------
    str
        The recovered plain‑text.

    Examples
    --------
    >>> caesar_decrypt("Khoor, Zruog!", 3)
    'Hello, World!'
    >>> caesar_decrypt("yzaVWX", -2)
    'abcXYZ'
    """
    # Decryption is encryption with the inverse shift.
    return caesar_encrypt(text, -shift)


def caesar_brute_force(ciphertext: str) -> List[Tuple[int, str]]:
    """
    Perform a brute‑force attack on a Caesar‑encrypted *ciphertext*.

    The function tries every possible shift value (0‑25) and returns a list
    of tuples ``(shift, plaintext)`` where *plaintext* is the result of
    decrypting *ciphertext* with that shift.

    Parameters
    ----------
    ciphertext: str
        The text to analyse.

    Returns
    -------
    List[Tuple[int, str]]
        A list of 26 tuples, one for each possible shift.  The list is ordered
        by increasing shift value.

    Examples
    --------
    >>> results = caesar_brute_force("Khoor")
    >>> any(plain == "Hello" for _, plain in results)
    True
    """
    results: List[Tuple[int, str]] = []
    for shift in range(26):
        plain = caesar_decrypt(ciphertext, shift)
        results.append((shift, plain))
    return results