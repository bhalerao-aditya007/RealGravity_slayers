import random
from dataclasses import dataclass, field
from typing import List, Tuple, Optional

# ----------------------------------------------------------------------
# Tile definition
# ----------------------------------------------------------------------
Position = Tuple[int, int]


@dataclass
class Tile:
    """
    Represents a single cell in the dungeon grid.

    Attributes
    ----------
    walkable: bool
        Whether entities can move onto this tile.
    blocks_sight: bool
        Whether the tile blocks line‑of‑sight.
    char: str
        ASCII character used for rendering.
    color: Tuple[int, int, int]
        RGB colour for rendering (optional, defaults to white).
    interactable: Optional[object]
        An object implementing the ``Interactable`` protocol (e.g. doors,
        chests).  ``None`` means the tile has no special interaction.
    """

    walkable: bool
    blocks_sight: bool
    char: str = " "
    color: Tuple[int, int, int] = (255, 255, 255)
    interactable: Optional[object] = None


# ----------------------------------------------------------------------
# Simple rectangle helper
# ----------------------------------------------------------------------
@dataclass(frozen=True)
class Rect:
    """Axis‑aligned rectangle used for room placement."""

    x1: int
    y1: int
    x2: int
    y2: int

    @property
    def width(self) -> int:
        return self.x2 - self.x1

    @property
    def height(self) -> int:
        return self.y2 - self.y1

    @property
    def center(self) -> Position:
        """Return the centre point of the rectangle (rounded down)."""
        return ((self.x1 + self.x2) // 2, (self.y1 + self.y2) // 2)

    def intersect(self, other: "Rect") -> bool:
        """Return True if this rectangle overlaps another."""
        return (self.x1 <= other.x2 and self.x2 >= other.x1 and
                self.y1 <= other.y2 and self.y2 >= other.y1)


# ----------------------------------------------------------------------
# Dungeon generation
# ----------------------------------------------------------------------
def _create_empty_map(width: int, height: int) -> List[List[Tile]]:
    """Create a map filled with solid wall tiles."""
    wall = Tile(walkable=False, blocks_sight=True, char="#")
    return [[wall for _ in range(height)] for _ in range(width)]


def _carve_room(dungeon: List[List[Tile]], room: Rect) -> None:
    """Carve a rectangular room into the dungeon (replace walls with floor)."""
    floor = Tile(walkable=True, blocks_sight=False, char=".")
    for x in range(room.x1, room.x2):
        for y in range(room.y1, room.y2):
            dungeon[x][y] = floor


def _carve_h_corridor(dungeon: List[List[Tile]], x1: int, x2: int, y: int) -> None:
    """Carve a horizontal corridor (inclusive)."""
    floor = Tile(walkable=True, blocks_sight=False, char=".")
    for x in range(min(x1, x2), max(x1, x2) + 1):
        dungeon[x][y] = floor


def _carve_v_corridor(dungeon: List[List[Tile]], y1: int, y2: int, x: int) -> None:
    """Carve a vertical corridor (inclusive)."""
    floor = Tile(walkable=True, blocks_sight=False, char=".")
    for y in range(min(y1, y2), max(y1, y2) + 1):
        dungeon[x][y] = floor


def generate_dungeon(width: int,
                     height: int,
                     room_count: int,
                     min_room_size: int = 4,
                     max_room_size: int = 10) -> Tuple[List[List[Tile]], Position]:
    """
    Generate a dungeon consisting of non‑overlapping rectangular rooms linked by
    L‑shaped corridors.

    Parameters
    ----------
    width, height : int
        Dimensions of the overall map.
    room_count : int
        Desired number of rooms. The algorithm may place fewer if it cannot
        find non‑overlapping positions after a reasonable number of attempts.
    min_room_size, max_room_size : int
        Bounds for random room dimensions.

    Returns
    -------
    dungeon : List[List[Tile]]
        2‑D array (width × height) of :class:`Tile` objects.
    entrance : Position
        Coordinate of the entrance tile (centre of the first room placed).

    Notes
    -----
    The function guarantees that every room is reachable from every other
    because each new room is connected to the previous one with a corridor.
    """
    if width <= 0 or height <= 0:
        raise ValueError("Map dimensions must be positive integers.")
    if room_count <= 0:
        raise ValueError("room_count must be a positive integer.")
    if min_room_size < 2 or max_room_size < min_room_size:
        raise ValueError("Invalid room size bounds.")

    dungeon = _create_empty_map(width, height)
    rooms: List[Rect] = []
    entrance: Optional[Position] = None

    max_attempts = room_count * 5  # give some slack for placement failures
    attempts = 0

    while len(rooms) < room_count and attempts < max_attempts:
        attempts += 1

        w = random.randint(min_room_size, max_room_size)
        h = random.randint(min_room_size, max_room_size)
        x = random.randint(1, width - w - 2)   # keep a 1‑tile border for walls
        y = random.randint(1, height - h - 2)

        new_room = Rect(x, y, x + w, y + h)

        # Check for overlap with existing rooms
        if any(new_room.intersect(other) for other in rooms):
            continue  # overlap – try again

        # Carve the room into the map
        _carve_room(dungeon, new_room)

        # Connect to previous room with a corridor
        if rooms:
            (prev_x, prev_y) = rooms[-1].center
            (new_x, new_y) = new_room.center

            # Randomly decide whether to go horizontal then vertical or vice‑versa
            if random.choice([True, False]):
                _carve_h_corridor(dungeon, prev_x, new_x, prev_y)
                _carve_v_corridor(dungeon, prev_y, new_y, new_x)
            else:
                _carve_v_corridor(dungeon, prev_y, new_y, prev_x)
                _carve_h_corridor(dungeon, prev_x, new_x, new_y)

        else:
            # First room – remember its centre as the entrance
            entrance = new_room.center

        rooms.append(new_room)

    if entrance is None:
        # This should never happen because room_count > 0, but guard anyway.
        raise RuntimeError("Failed to place any rooms in the dungeon.")

    return dungeon, entrance


# ----------------------------------------------------------------------
# Helper for engine integration (example usage)
# ----------------------------------------------------------------------
def place_player_at_entrance(dungeon: List[List[Tile]],
                             entrance: Position,
                             player_entity) -> None:
    """
    Position the supplied player entity on the entrance tile.

    Parameters
    ----------
    dungeon : List[List[Tile]]
        The generated dungeon map.
    entrance : Position
        Coordinate returned by :func:`generate_dungeon`.
    player_entity : Any
        An object with a ``pos`` attribute (e.g. ``engine.Entity``) that will be
        mutated in‑place.
    """
    max_x = len(dungeon)
    max_y = len(dungeon[0]) if max_x else 0
    x, y = entrance
    if not (0 <= x < max_x and 0 <= y < max_y):
        raise ValueError("Entrance position is out of dungeon bounds.")
    if not dungeon[x][y].walkable:
        raise RuntimeError("Entrance tile is not walkable.")
    player_entity.pos = entrance


# ----------------------------------------------------------------------
# Simple test harness (executed when run as a script)
# ----------------------------------------------------------------------
if __name__ == "__main__":
    # Example: generate a 50×30 map with 12 rooms and print a crude ASCII view.
    WIDTH, HEIGHT, ROOMS = 50, 30, 12
    dungeon_map, entrance_pos = generate_dungeon(WIDTH, HEIGHT, ROOMS)

    # Render to console
    for y in range(HEIGHT):
        line = ""
        for x in range(WIDTH):
            tile = dungeon_map[x][y]
            if (x, y) == entrance_pos:
                line += "@"
            else:
                line += tile.char
        print(line)

    print(f"\nEntrance located at {entrance_pos}")
    # The script does not depend on the rest of the engine; it demonstrates that
    # the generator works in isolation. Integration with the full game engine
    # would involve calling ``place_player_at_entrance`` after creating the
    # player ``Entity`` instance.