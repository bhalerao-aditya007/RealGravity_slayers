import sys
from typing import Any, List, Tuple, Dict


def max_min(lst: List[Any]) -> Tuple[Any, Any]:
    """
    Return a tuple containing the maximum and minimum elements of *lst*.

    The function does not use the built‑in ``max`` or ``min`` functions.
    Raises:
        ValueError: If *lst* is empty.
    """
    if not lst:
        raise ValueError("max_min() arg is an empty list")
    max_val = min_val = lst[0]
    for item in lst[1:]:
        if item > max_val:
            max_val = item
        if item < min_val:
            min_val = item
    return max_val, min_val


def remove_duplicates(lst: List[Any]) -> List[Any]:
    """
    Return a new list containing the elements of *lst* with duplicates removed,
    preserving the original order.

    No ``set`` is used to keep the order deterministic.
    """
    seen = {}
    result: List[Any] = []
    for item in lst:
        if item not in seen:
            seen[item] = True
            result.append(item)
    return result


def element_frequencies(lst: List[Any]) -> Dict[Any, int]:
    """
    Return a dictionary mapping each distinct element in *lst* to its frequency.
    """
    freq: Dict[Any, int] = {}
    for item in lst:
        freq[item] = freq.get(item, 0) + 1
    return freq


def reverse_list(lst: List[Any]) -> List[Any]:
    """
    Return a new list that is the reverse of *lst*.
    Does not use the ``list.reverse`` method.
    """
    reversed_lst: List[Any] = []
    for i in range(len(lst) - 1, -1, -1):
        reversed_lst.append(lst[i])
    return reversed_lst


def sort_ascending(lst: List[Any]) -> List[Any]:
    """
    Return a new list containing the elements of *lst* sorted in ascending order.
    Implements a simple insertion sort; does not use ``sorted`` or ``list.sort``.
    """
    sorted_lst = lst[:]  # make a shallow copy
    for i in range(1, len(sorted_lst)):
        key = sorted_lst[i]
        j = i - 1
        while j >= 0 and sorted_lst[j] > key:
            sorted_lst[j + 1] = sorted_lst[j]
            j -= 1
        sorted_lst[j + 1] = key
    return sorted_lst


def sort_descending(lst: List[Any]) -> List[Any]:
    """
    Return a new list containing the elements of *lst* sorted in descending order.
    Uses insertion sort with reversed comparison.
    """
    sorted_lst = lst[:]  # make a shallow copy
    for i in range(1, len(sorted_lst)):
        key = sorted_lst[i]
        j = i - 1
        while j >= 0 and sorted_lst[j] < key:
            sorted_lst[j + 1] = sorted_lst[j]
            j -= 1
        sorted_lst[j + 1] = key
    return sorted_lst


def second_largest(lst: List[Any]) -> Any:
    """
    Return the second largest distinct element from *lst*.

    Raises:
        ValueError: If the list has fewer than two distinct elements.
    """
    if len(lst) < 2:
        raise ValueError("second_largest() requires at least two elements")
    first = second = None
    for item in lst:
        if first is None or item > first:
            second = first
            first = item
        elif item != first and (second is None or item > second):
            second = item
    if second is None:
        raise ValueError("second_largest() requires at least two distinct elements")
    return second


def merge_unique(lst1: List[Any], lst2: List[Any]) -> List[Any]:
    """
    Merge *lst1* and *lst2* into a new list that contains each element only once,
    preserving the order of first appearance across both lists.
    """
    seen = {}
    merged: List[Any] = []
    for item in lst1 + lst2:
        if item not in seen:
            seen[item] = True
            merged.append(item)
    return merged


if __name__ == "__main__":
    # Simple sanity checks for each function
    sample = [3, 1, 4, 1, 5, 9, 2, 6, 5]

    # max_min
    try:
        mx, mn = max_min(sample)
        print(f"max_min: max={mx}, min={mn}")
    except ValueError as e:
        print(f"max_min error: {e}", file=sys.stderr)

    # remove_duplicates
    uniq = remove_duplicates(sample)
    print(f"remove_duplicates: {uniq}")

    # element_frequencies
    freq = element_frequencies(sample)
    print(f"element_frequencies: {freq}")

    # reverse_list
    rev = reverse_list(sample)
    print(f"reverse_list: {rev}")

    # sort_ascending
    asc = sort_ascending(sample)
    print(f"sort_ascending: {asc}")

    # sort_descending
    desc = sort_descending(sample)
    print(f"sort_descending: {desc}")

    # second_largest
    try:
        sec = second_largest(sample)
        print(f"second_largest: {sec}")
    except ValueError as e:
        print(f"second_largest error: {e}", file=sys.stderr)

    # merge_unique
    other = [5, 7, 2, 8, 3]
    merged = merge_unique(sample, other)
    print(f"merge_unique: {merged}")