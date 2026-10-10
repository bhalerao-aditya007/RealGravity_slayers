import sys
from typing import Any, Dict, List, Tuple, Iterable


def build_graph(edges: Iterable[Tuple[Any, Any]]) -> Dict[Any, List[Any]]:
    """
    Build an undirected adjacency‑list representation from an iterable of edges.

    Each edge is a tuple ``(src, dst)``.  For an undirected graph the function
    adds ``dst`` to ``src``'s adjacency list and vice‑versa.  Duplicate edges are
    ignored, and self‑loops are stored only once.

    Parameters
    ----------
    edges :
        An iterable of ``(src, dst)`` tuples.  ``src`` and ``dst`` can be any
        hashable objects.

    Returns
    -------
    dict
        A dictionary mapping each vertex to a list of its neighboring vertices.

    Example
    -------
    >>> build_graph([(1, 2), (2, 3), (1, 3)])
    {1: [2, 3], 2: [1, 3], 3: [2, 1]}
    """
    graph: Dict[Any, List[Any]] = {}
    for src, dst in edges:
        # Initialise adjacency lists if necessary
        if src not in graph:
            graph[src] = []
        if dst not in graph:
            graph[dst] = []

        # Avoid duplicate entries
        if dst not in graph[src]:
            graph[src].append(dst)
        if src not in graph[dst]:
            graph[dst].append(src)

    return graph


def neighbors(graph: Dict[Any, List[Any]], vertex: Any) -> List[Any]:
    """
    Return the list of neighboring vertices for *vertex*.

    If *vertex* is not present in *graph*, an empty list is returned.

    Parameters
    ----------
    graph :
        An adjacency‑list dictionary as produced by :func:`build_graph`.
    vertex :
        The vertex whose neighbours are requested.

    Returns
    -------
    list
        A list of neighbours (may be empty).

    Example
    -------
    >>> g = build_graph([(1, 2), (2, 3)])
    >>> neighbors(g, 2)
    [1, 3]
    """
    return list(graph.get(vertex, []))


def node_exists(graph: Dict[Any, List[Any]], node: Any) -> bool:
    """
    Determine whether *node* exists in the graph.

    A node exists if it appears as a key in the adjacency list or if it is
    present in any neighbour list.

    Parameters
    ----------
    graph :
        An adjacency‑list dictionary.
    node :
        The node to test.

    Returns
    -------
    bool
        ``True`` if the node is part of the graph, otherwise ``False``.

    Example
    -------
    >>> g = build_graph([(1, 2)])
    >>> node_exists(g, 2)
    True
    >>> node_exists(g, 3)
    False
    """
    if node in graph:
        return True
    for neighbours in graph.values():
        if node in neighbours:
            return True
    return False


def node_degrees(graph: Dict[Any, List[Any]]) -> Dict[Any, int]:
    """
    Compute the degree of each node in an undirected graph.

    The degree is the number of incident edges.  For a self‑loop (e.g. ``(v, v)``)
    the degree contribution is counted as ``2`` because the edge touches the
    vertex twice.

    Parameters
    ----------
    graph :
        An adjacency‑list dictionary.

    Returns
    -------
    dict
        Mapping from node to its degree.

    Example
    -------
    >>> g = build_graph([(1, 2), (2, 3), (3, 1)])
    >>> node_degrees(g)
    {1: 2, 2: 2, 3: 2}
    """
    degrees: Dict[Any, int] = {}
    for node, nbrs in graph.items():
        # Normal neighbours contribute 1 each
        deg = len(nbrs)

        # Adjust for self‑loops: they appear once in the list but count twice
        if node in nbrs:
            deg += 1  # already counted once, add one more

        degrees[node] = deg

    # Ensure nodes that only appear as neighbours (possible if build_graph was not used)
    # are also represented.
    for nbrs in graph.values():
        for nbr in nbrs:
            if nbr not in degrees:
                # Count how many times the node appears in adjacency lists
                count = sum(1 for lst in graph.values() if nbr in lst)
                # Self‑loop correction handled above when the node is a key
                degrees[nbr] = count

    return degrees


if __name__ == "__main__":
    # Example usage ---------------------------------------------------------
    example_edges = [
        ("A", "B"),
        ("A", "C"),
        ("B", "C"),
        ("C", "D"),
        ("D", "D"),  # self‑loop example
        ("E", "F"),
    ]

    # Build the graph
    g = build_graph(example_edges)
    print("Adjacency list:")
    for v, nbrs in g.items():
        print(f"  {v}: {nbrs}")

    # Query neighbours
    print("\nNeighbours of 'C':", neighbors(g, "C"))
    print("Neighbours of 'E':", neighbors(g, "E"))
    print("Neighbours of missing node 'Z':", neighbors(g, "Z"))

    # Existence checks
    print("\nNode existence:")
    for node in ["A", "D", "Z", "F"]:
        print(f"  {node}: {node_exists(g, node)}")

    # Degree calculation
    print("\nNode degrees:")
    degs = node_degrees(g)
    for node, deg in degs.items():
        print(f"  {node}: {deg}")

    # Simple sanity assertions (will raise AssertionError if broken)
    assert neighbors(g, "A") == ["B", "C"]
    assert node_exists(g, "Z") is False
    assert degs["D"] == 3  # D connected to C, itself (self‑loop counts twice)
    assert degs["E"] == 1
    assert degs["F"] == 1

    print("\nAll example checks passed.")