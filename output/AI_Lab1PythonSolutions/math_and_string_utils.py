import math
from typing import List, Dict


def factorial(n: int) -> int:
    """
    Compute the factorial of a non‑negative integer *n* using an iterative approach.

    Parameters
    ----------
    n : int
        The number whose factorial is to be computed. Must be >= 0.

    Returns
    -------
    int
        The factorial of *n* (``n!``). By definition, ``0!`` and ``1!`` are ``1``.

    Raises
    ------
    ValueError
        If *n* is negative.
    """
    if n < 0:
        raise ValueError("factorial() not defined for negative values")
    result = 1
    for i in range(2, n + 1):
        result *= i
    return result


def fibonacci(n: int) -> List[int]:
    """
    Generate a list containing the first *n* Fibonacci numbers.

    The sequence starts with ``0, 1, 1, 2, 3, …``.  If *n* is less than or
    equal to zero, an empty list is returned.

    Parameters
    ----------
    n : int
        Number of Fibonacci numbers to generate.

    Returns
    -------
    List[int]
        A list of length *n* with the Fibonacci sequence.
    """
    if n <= 0:
        return []
    if n == 1:
        return [0]

    fibs = [0, 1]
    while len(fibs) < n:
        fibs.append(fibs[-1] + fibs[-2])
    return fibs[:n]


def is_prime(n: int) -> bool:
    """
    Determine whether *n* is a prime number.

    Parameters
    ----------
    n : int
        Integer to test for primality.

    Returns
    -------
    bool
        ``True`` if *n* is prime, ``False`` otherwise.
    """
    if n <= 1:
        return False
    if n <= 3:
        return True
    if n % 2 == 0 or n % 3 == 0:
        return False

    limit = int(math.isqrt(n))
    i = 5
    while i <= limit:
        if n % i == 0 or n % (i + 2) == 0:
            return False
        i += 6
    return True


def count_characters(s: str) -> Dict[str, int]:
    """
    Count various categories of characters in *s*.

    The returned dictionary contains the following keys:
    - ``vowels``      : a, e, i, o, u (both cases)
    - ``consonants``  : alphabetic characters that are not vowels
    - ``digits``      : 0‑9
    - ``spaces``      : space characters (``' '``)
    - ``special``     : any other character

    Parameters
    ----------
    s : str
        Input string to analyse.

    Returns
    -------
    dict
        Mapping of category names to their respective counts.
    """
    vowels_set = set("aeiouAEIOU")
    counts = {
        "vowels": 0,
        "consonants": 0,
        "digits": 0,
        "spaces": 0,
        "special": 0,
    }

    for ch in s:
        if ch.isalpha():
            if ch in vowels_set:
                counts["vowels"] += 1
            else:
                counts["consonants"] += 1
        elif ch.isdigit():
            counts["digits"] += 1
        elif ch == " ":
            counts["spaces"] += 1
        else:
            counts["special"] += 1

    return counts


def is_palindrome(s: str) -> bool:
    """
    Check whether *s* reads the same forward and backward, ignoring case
    and any non‑alphanumeric characters.

    Parameters
    ----------
    s : str
        String to test.

    Returns
    -------
    bool
        ``True`` if *s* is a palindrome under the described constraints,
        ``False`` otherwise.
    """
    filtered = [ch.lower() for ch in s if ch.isalnum()]
    return filtered == filtered[::-1]


__all__ = [
    "factorial",
    "fibonacci",
    "is_prime",
    "count_characters",
    "is_palindrome",
]


if __name__ == "__main__":
    # Demonstration of the utilities
    print("Factorial examples:")
    for i in range(6):
        print(f"{i}! = {factorial(i)}")

    print("\nFibonacci examples:")
    for n in range(1, 8):
        print(f"First {n} numbers: {fibonacci(n)}")

    print("\nPrime checking examples:")
    test_numbers = [0, 1, 2, 3, 4, 17, 20, 23, 24, 97]
    for num in test_numbers:
        print(f"{num} is prime? {is_prime(num)}")

    print("\nCharacter counting example:")
    sample = "Hello World! 123"
    print(f"Input: {sample!r}")
    print("Counts:", count_characters(sample))

    print("\nPalindrome checking examples:")
    palindromes = ["A man, a plan, a canal: Panama", "RaceCar", "Hello"]
    for txt in palindromes:
        print(f"{txt!r} -> {is_palindrome(txt)}")