import random
import pytest

# Import the core game modules.  The tests assume that the modules expose
# the following public API.  If any of the functions are missing the tests
# will raise an AttributeError – this is intentional because the test suite
# is meant to validate a *complete* implementation.
from src.engine import GameEngine, Entity
from src.dungeon import Rect, Tile
from src.combat import Item, Weapon, Armor, Consumable, CombatResolver, EnemyAI


# ----------------------------------------------------------------------
# Fixtures
# ----------------------------------------------------------------------
@pytest.fixture(scope="session")
def deterministic_seed():
    """
    Return a deterministic random seed that can be used by the game engine
    and any other random number generators.  The seed is chosen to be
    reproducible across test runs.
    """
    return 12345


@pytest.fixture
def engine(deterministic_seed):
    """
    Create a fresh GameEngine instance for each test.  The engine is
    seeded with a deterministic value so that dungeon generation,
    monster placement, and combat outcomes are reproducible.
    """
    # The GameEngine constructor is expected to accept a seed argument.
    return GameEngine(seed=deterministic_seed)


@pytest.fixture
def dungeon(engine):
    """
    Generate a dungeon using the engine.  The engine is expected to expose
    a ``generate_dungeon`` method that returns a list of rooms (Rect)
    and populates the internal map grid with Tile objects.
    """
    engine.generate_dungeon()
    return engine.map  # assume the engine stores the map in ``engine.map``


@pytest.fixture
def player(engine):
    """
    Create a player entity and place it at the centre of the first room.
    The engine is expected to provide a ``place_entity`` method that
    validates the position and updates the internal state.
    """
    # Pick the first room and compute its centre.
    first_room = engine.rooms[0]
    centre_x = (first_room.x1 + first_room.x2) // 2
    centre_y = (first_room.y1 + first_room.y2) // 2
    player = Entity(
        name="Hero",
        char="@",
        pos=(centre_x, centre_y),
        hp=30,
        max_hp=30,
    )
    engine.place_entity(player)
    return player


@pytest.fixture
def monsters(engine, player):
    """
    Spawn a small number of monsters in the dungeon.  The engine is
    expected to expose a ``spawn_monster`` method that accepts a
    monster type and a position.  For the purposes of the test we
    spawn one goblin and one orc at random walkable tiles.
    """
    monster_types = ["Goblin", "Orc"]
    spawned = []
    for mtype in monster_types:
        # Find a random walkable tile that is not occupied by the player.
        while True:
            x = random.randint(0, engine.width - 1)
            y = random.randint(0, engine.height - 1)
            if engine.is_walkable((x, y)) and (x, y) != player.pos:
                break
        monster = Entity(
            name=mtype,
            char="g" if mtype == "Goblin" else "o",
            pos=(x, y),
            hp=10 if mtype == "Goblin" else 20,
            max_hp=10 if mtype == "Goblin" else 20,
        )
        engine.place_entity(monster)
        spawned.append(monster)
    return spawned


# ----------------------------------------------------------------------
# Helper functions
# ----------------------------------------------------------------------
def bfs_reachable(engine, start):
    """
    Perform a breadth‑first search from ``start`` over walkable tiles
    and return the set of reachable positions.
    """
    from collections import deque

    visited = set()
    queue = deque([start])
    while queue:
        pos = queue.popleft()
        if pos in visited:
            continue
        visited.add(pos)
        x, y = pos
        for dx, dy in [(-1, 0), (1, 0), (0, -1), (0, 1)]:
            nx, ny = x + dx, y + dy
            if engine.in_bounds((nx, ny)) and engine.is_walkable((nx, ny)):
                queue.append((nx, ny))
    return visited


# ----------------------------------------------------------------------
# Tests
# ----------------------------------------------------------------------
def test_dungeon_connectivity(engine, dungeon):
    """
    Verify that all rooms in the dungeon are reachable from the first
    room.  This ensures that the dungeon generation algorithm creates a
    single connected component.
    """
    # Pick the centre of the first room as the starting point.
    first_room = engine.rooms[0]
    start = ((first_room.x1 + first_room.x2) // 2,
             (first_room.y1 + first_room.y2) // 2)

    reachable = bfs_reachable(engine, start)

    # All room tiles must be reachable.
    for room in engine.rooms:
        for x in range(room.x1, room.x2):
            for y in range(room.y1, room.y2):
                assert (x, y) in reachable, f"Tile {(x, y)} not reachable"


def test_player_survival_and_inventory(engine,