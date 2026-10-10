import random
import sys
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Tuple, Protocol, runtime_checkable

# ----------------------------------------------------------------------
# Basic Types
# ----------------------------------------------------------------------
Position = Tuple[int, int]


@runtime_checkable
class Interactable(Protocol):
    """Protocol for objects that can be interacted with by entities."""

    def on_enter(self, engine: "GameEngine", entity: "Entity") -> None:
        ...

    def on_attack(self, engine: "GameEngine", attacker: "Entity") -> None:
        ...

    def on_pickup(self, engine: "GameEngine", picker: "Entity") -> None:
        ...


# ----------------------------------------------------------------------
# Core Data Model
# ----------------------------------------------------------------------
@dataclass
class Entity:
    """Base class for all moving objects in the game."""

    name: str
    char: str
    pos: Position
    hp: int
    max_hp: int
    blocks: bool = True  # Does this entity block movement?
    inventory: List["Item"] = field(default_factory=list)

    def is_alive(self) -> bool:
        return self.hp > 0

    def move(self, dx: int, dy: int, engine: "GameEngine") -> None:
        """Attempt to move the entity; handles collisions and map bounds."""
        new_x = self.pos[0] + dx
        new_y = self.pos[1] + dy
        if not engine.in_bounds((new_x, new_y)):
            # Out of bounds – ignore move
            return
        target = engine.get_entity_at((new_x, new_y))
        if target and target.blocks:
            # Collision with blocking entity – trigger interaction
            self.interact(target, engine)
            return
        # No blocking entity; move
        engine.move_entity(self, (new_x, new_y))

    def interact(self, other: "Entity", engine: "GameEngine") -> None:
        """Default interaction: attack if other is a Monster or Player."""
        if isinstance(other, (Monster, Player)):
            self.attack(other, engine)

    def attack(self, target: "Entity", engine: "GameEngine") -> None:
        """Simple attack: deal 1 damage."""
        if not self.is_alive() or not target.is_alive():
            return
        damage = 1
        target.hp = max(0, target.hp - damage)
        engine.log(f"{self.name} attacks {target.name} for {damage} damage.")
        if not target.is_alive():
            engine.log(f"{target.name} has died.")
            engine.remove_entity(target)

    def take_turn(self, engine: "GameEngine") -> None:
        """Base entities do nothing on their turn."""
        pass

    def on_enter(self, engine: "GameEngine", entity: "Entity") -> None:
        """Hook called when another entity steps onto this entity's tile."""
        pass

    def on_attack(self, engine: "GameEngine", attacker: "Entity") -> None:
        """Hook called when this entity is attacked."""
        pass

    def on_pickup(self, engine: "GameEngine", picker: "Entity") -> None:
        """Hook called when this entity is picked up."""
        pass


@dataclass
class Player(Entity):
    """The player character."""

    def take_turn(self, engine: "GameEngine") -> None:
        """Process a single player command."""
        engine.render()
        command = engine.get_player_input()
        if command == "q":
            engine.running = False
            return
        elif command == "i":
            self.show_inventory(engine)
            return
        dx, dy = {
            "w": (0, -1),
            "s": (0, 1),
            "a": (-1, 0),
            "d": (1, 0),
        }.get(command, (0, 0))
        if (dx, dy) != (0, 0):
            self.move(dx, dy, engine)

    def show_inventory(self, engine: "GameEngine") -> None:
        if not self.inventory:
            engine.log("Inventory is empty.")
            return
        engine.log("Inventory:")
        for idx, item in enumerate(self.inventory, 1):
            engine.log(f"  {idx}. {item.name}")

    def on_pickup(self, engine: "GameEngine", picker: "Entity") -> None:
        """Players automatically pick up items they step on."""
        if picker is self:
            self.inventory.append(self)  # type: ignore
            engine.log(f"{self.name} picks up {self.name}.")
            engine.remove_entity(self)


@dataclass
class Monster(Entity):
    """Simple AI monster."""

    def take_turn(self, engine: "GameEngine") -> None:
        """Randomly move or attack the player if adjacent."""
        if not self.is_alive():
            return
        # Check adjacency to player
        player = engine.player
        if player and self.is_adjacent(player):
            self.attack(player, engine)
            return
        # Random movement
        dx, dy = random.choice([(0, -1), (0, 1), (-1, 0), (1, 0), (0, 0)])
        self.move(dx, dy, engine)

    def is_adjacent(self, other: Entity) -> bool:
        return max(abs(self.pos[0] - other.pos[0]), abs(self.pos[1] - other.pos[1])) == 1


@dataclass
class Item(Entity, Interactable):
    """Collectible item."""

    blocks: bool = False

    def on_enter(self, engine: "GameEngine", entity: "Entity") -> None:
        """When an entity steps onto the item, trigger pickup."""
        entity.on_pickup(engine, entity)

    def on_pickup(self, engine: "GameEngine", picker: "Entity") -> None:
        """Add the item to the picker’s inventory."""
        if isinstance(picker, Player):
            picker.inventory.append(self)
            engine.log(f"{picker.name} picks up {self.name}.")
            engine.remove_entity(self)


# ----------------------------------------------------------------------
# Scheduler
# ----------------------------------------------------------------------
class Scheduler:
    """Simple round‑robin scheduler."""

    def __init__(self) -> None:
        self._queue: List[Entity] = []

    def add(self, entity: Entity) -> None:
        if entity not in self._queue:
            self._queue.append(entity)

    def remove(self, entity: Entity) -> None:
        if entity in self._queue:
            self._queue.remove(entity)

    def __iter__(self):
        """Iterate over a snapshot of the queue to allow safe removal."""
        return iter(self._queue.copy())


# ----------------------------------------------------------------------
# Game Engine
# ----------------------------------------------------------------------
class GameEngine:
    """Main engine handling map, entities, rendering and the game loop."""

    def __init__(self, width: int = 20, height: int = 10) -> None:
        self.width = width
        self.height = height
        self.entities: Dict[Position, Entity] = {}
        self.scheduler = Scheduler()
        self.player: Optional[Player] = None
        self.running: bool = True
        self.message_log: List[str] = []

    # ------------------------------------------------------------------
    # Map utilities
    # ------------------------------------------------------------------
    def in_bounds(self, pos: Position) -> bool:
        x, y = pos
        return 0 <= x < self.width and 0 <= y < self.height

    def get_entity_at(self, pos: Position) -> Optional[Entity]:
        return self.entities.get(pos)

    def add_entity(self, entity: Entity) -> None:
        if not self.in_bounds(entity.pos):
            raise ValueError(f"Entity {entity.name} position out of bounds: {entity.pos}")
        if entity.pos in self.entities and self.entities[entity.pos].blocks:
            raise ValueError(f"Tile {entity.pos} already occupied by blocking entity.")
        self.entities[entity.pos] = entity
        self.scheduler.add(entity)
        if isinstance(entity, Player):
            self.player = entity

    def move_entity(self, entity: Entity, new_pos: Position) -> None:
        if not self.in_bounds(new_pos):
            return
        old_pos = entity.pos
        target = self.get_entity_at(new_pos)
        if target:
            # Trigger interaction hooks
            target.on_enter(self, entity)
            entity.on_enter(self, target)
        # Update position if still alive and tile not blocked
        if entity.is_alive() and (new_pos not in self.entities or not self.entities[new_pos].blocks):
            del self.entities[old_pos]
            entity.pos = new_pos
            self.entities[new_pos] = entity

    def remove_entity(self, entity: Entity) -> None:
        if entity.pos in self.entities:
            del self.entities[entity.pos]
        self.scheduler.remove(entity)
        if isinstance(entity, Player):
            self.player = None

    # ------------------------------------------------------------------
    # Rendering & I/O
    # ------------------------------------------------------------------
    def render(self) -> None:
        """Print a simple ASCII map to stdout."""
        sys.stdout.write("\x1b[2J\x1b[H")  # Clear screen
        for y in range(self.height):
            line = ""
            for x in range(self.width):
                entity = self.entities.get((x, y))
                line += entity.char if entity else "."
            sys.stdout.write(line + "\n")
        sys.stdout.write("\n".join(self.message_log[-5:]) + "\n")
        sys.stdout.flush()

    def log(self, message: str) -> None:
        self.message_log.append(message)

    def get_player_input(self) -> str:
        """Read a single character from stdin."""
        self.log("Enter command (w/a/s/d = move, i = inventory, q = quit):")
        while True:
            ch = sys.stdin.read(1)
            if ch:
                return ch.lower()

    # ------------------------------------------------------------------
    # Game Loop
    # ------------------------------------------------------------------
    def main_loop(self) -> None:
        """Run the main game loop until the player quits or dies."""
        while self.running and self.player and self.player.is_alive():
            for entity in self.scheduler:
                if not self.running:
                    break
                if entity.is_alive():
                    entity.take_turn(self)
        self.render()
        if self.player and not self.player.is_alive():
            self.log("You have perished. Game over.")
        else:
            self.log("Thanks for playing!")

    # ------------------------------------------------------------------
    # Helper for automated simulations
    # ------------------------------------------------------------------
    def run_simulation(self, max_turns: int = 100) -> None:
        """Run the game without user input; monsters move randomly."""
        turn = 0
        while self.running and self.player and self.player.is_alive() and turn < max_turns:
            for entity in self.scheduler:
                if not self.running:
                    break
                if entity.is_alive():
                    entity.take_turn(self)
            turn += 1
        self.log(f"Simulation ended after {turn} turns.")


# ----------------------------------------------------------------------
# Example usage / simple test scenario
# ----------------------------------------------------------------------
def _create_demo_game() -> GameEngine:
    engine = GameEngine(width=30, height=15)

    # Create player in the centre
    player = Player(name="Hero", char="@",
                    pos=(engine.width // 2, engine.height // 2),
                    hp=10, max_hp=10)
    engine.add_entity(player)

    # Populate with a few monsters
    for _ in range(5):
        while True:
            x = random.randint(0, engine.width - 1)
            y = random.randint(0, engine.height - 1)
            if not engine.get_entity_at((x, y)):
                monster = Monster(name="Goblin", char="g",
                                  pos=(x, y), hp=3, max_hp=3)
                engine.add_entity(monster)
                break

    # Scatter some items
    for _ in range(3):
        while True:
            x = random.randint(0, engine.width - 1)
            y = random.randint(0, engine.height - 1)
            if not engine.get_entity_at((x, y)):
                potion = Item(name="Health Potion", char="!",
                              pos=(x, y), hp=0, max_hp=0)
                engine.add_entity(potion)
                break

    return engine


if __name__ == "__main__":
    # Run an interactive demo if executed directly.
    demo_engine = _create_demo_game()
    demo_engine.main_loop()
    # Uncomment the following line to run a headless simulation instead:
    # demo_engine.run_simulation(max_turns=200)