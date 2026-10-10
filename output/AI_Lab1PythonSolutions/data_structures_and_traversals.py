"""
data_structures_and_traversals.py

This module provides implementations of fundamental data structures (Stack and Queue)
and graph traversal algorithms (BFS and DFS), along with a utility to compare their
behavior on a given graph.

Classes:
    Stack: A LIFO (Last-In, First-Out) data structure.
    Queue: A FIFO (First-In, First-Out) data structure.

Functions:
    bfs: Breadth-First Search on an adjacency-list graph.
    dfs: Depth-First Search on an adjacency-list graph using an explicit stack.
    compare_traversals: Compares BFS and DFS results and prints a detailed report.
"""

from collections import deque
from typing import Any, Dict, List, Optional


class Stack:
    """
    A Stack data structure implemented using a Python list.
    
    Attributes:
        _items (List[Any]): The internal list storing the stack elements.
    """

    def __init__(self) -> None:
        """Initialize an empty stack."""
        self._items: List[Any] = []

    def push(self, item: Any) -> None:
        """
        Push an item onto the top of the stack.

        Args:
            item: The element to be added to the stack.
        """
        self._items.append(item)

    def pop(self) -> Any:
        """
        Remove and return the item on the top of the stack.

        Returns:
            The top item of the stack.

        Raises:
            IndexError: If the stack is empty.
        """
        if not self._items:
            raise IndexError("pop from empty stack")
        return self._items.pop()

    def peek(self) -> Any:
        """
        Return the item on the top of the stack without removing it.

        Returns:
            The top item of the stack.

        Raises:
            IndexError: If the stack is empty.
        """
        if not self._items:
            raise IndexError("peek from empty stack")
        return self._items[-1]

    def display(self) -> List[Any]:
        """
        Return a copy of the internal list representing the stack.

        Returns:
            A new list containing the elements of the stack.
        """
        return self._items.copy()

    def is_empty(self) -> bool:
        """
        Check if the stack is empty.

        Returns:
            True if the stack has no elements, False otherwise.
        """
        return len(self._items) == 0

    def __len__(self) -> int:
        """Return the number of items in the stack."""
        return len(self._items)

    def __repr__(self) -> str:
        """Return a string representation of the stack."""
        return f"Stack({self._items})"


class Queue:
    """
    A Queue data structure implemented using collections.deque for O(1) operations.
    
    Attributes:
        _items (deque): The internal deque storing the queue elements.
    """

    def __init__(self) -> None:
        """Initialize an empty queue."""
        self._items: deque = deque()

    def enqueue(self, item: Any) -> None:
        """
        Add an item to the rear of the queue.

        Args:
            item: The element to be added to the queue.
        """
        self._items.append(item)

    def dequeue(self) -> Any:
        """
        Remove and return the item from the front of the queue.

        Returns:
            The front item of the queue.

        Raises:
            IndexError: If the queue is empty.
        """
        if not self._items:
            raise IndexError("dequeue from empty queue")
        return self._items.popleft()

    def front(self) -> Any:
        """
        Return the item at the front of the queue without removing it.

        Returns:
            The front item of the queue.

        Raises:
            IndexError: If the queue is empty.
        """
        if not self._items:
            raise IndexError("front from empty queue")
        return self._items[0]

    def display(self) -> List[Any]:
        """
        Return a list representation of the queue.

        Returns:
            A list containing the elements of the queue in order.
        """
        return list(self._items)

    def is_empty(self) -> bool:
        """
        Check if the queue is empty.

        Returns:
            True if the queue has no elements, False otherwise.
        """
        return len(self._items) == 0

    def __len__(self) -> int:
        """Return the number of items in the queue."""
        return len(self._items)

    def __repr__(self) -> str:
        """Return a string representation of the queue."""
        return f"Queue({list(self._items)})"


def bfs(graph: Dict[Any, List[Any]], start: Any) -> List[Any]:
    """
    Perform Breadth-First Search (BFS) on a graph represented as an adjacency list.

    Args:
        graph: A dictionary where keys are nodes and values are lists of adjacent nodes.
        start: The starting node for the traversal.

    Returns:
        A list of nodes in the order they were visited.
    """
    if start not in graph:
        return []

    visited: List[Any] = []
    queue: deque = deque([start])
    seen: set = {start}

    while queue:
        node = queue.popleft()
        visited.append(node)

        for neighbor in graph.get(node, []):
            if neighbor not in seen:
                seen.add(neighbor)
                queue.append(neighbor)

    return visited


def dfs(graph: Dict[Any, List[Any]], start: Any) -> List[Any]:
    """
    Perform Depth-First Search (DFS) on a graph represented as an adjacency list
    using an explicit stack.

    Args:
        graph: A dictionary where keys are nodes and values are lists of adjacent nodes.
        start: The starting node for the traversal.

    Returns:
        A list of nodes in the order they were visited.
    """
    if start not in graph:
        return []

    visited: List[Any] = []
    stack: List[Any] = [start]
    seen: set = set()

    while stack:
        node = stack.pop()
        if node not in seen:
            seen.add(node)
            visited.append(node)
            # Push neighbors in reverse order to maintain consistent traversal
            # (optional, but helps with deterministic output if order matters)
            for neighbor in reversed(graph.get(node, [])):
                if neighbor not in seen:
                    stack.append(neighbor)

    return visited


def compare_traversals(graph: Dict[Any, List[Any]], start: Any) -> None:
    """
    Compare BFS and DFS traversals on a given graph and print a detailed report.

    Args:
        graph: A dictionary where keys are nodes and values are lists of adjacent nodes.
        start: The starting node for the traversal.
    """
    bfs_result = bfs(graph, start)
    dfs_result = dfs(graph, start)

    num_nodes = len(graph)
    num_edges = sum(len(neighbors) for neighbors in graph.values()) // 2  # Undirected graph

    print("=" * 60)
    print("TRAVERSAL COMPARISON REPORT")
    print("=" * 60)
    print(f"Graph: {num_nodes} nodes, {num_edges} edges")
    print(f"Start Node: {start}")
    print("-" * 60)

    # Print BFS Results
    print(f"BFS Traversal Order: {bfs_result}")
    print(f"BFS Visited Nodes:   {len(bfs_result)}")
    print(f"BFS Time Complexity: O(V + E)")
    print(f"BFS Space Complexity: O(V)")
    print("BFS Applications: Shortest path in unweighted graphs, level-order traversal,")
    print("                  finding connected components, BFS-based algorithms.")
    print("-" * 60)

    # Print DFS Results
    print(f"DFS Traversal Order: {dfs_result}")
    print(f"DFS Visited Nodes:   {len(dfs_result)}")
    print(f"DFS Time Complexity: O(V + E)")
    print(f"DFS Space Complexity: O(V)")
    print("DFS Applications: Topological sorting, cycle detection, finding strongly")
    print("                  connected components, solving mazes, backtracking.")
    print("=" * 60)


if __name__ == "__main__":
    # Sample graph for demonstration
    # Graph structure:
    #   1 -- 2
    #   |    |
    #   3 -- 4
    #   |
    #   5
    sample_graph: Dict[int