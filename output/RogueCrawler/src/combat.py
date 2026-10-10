"""
src/combat.py

Turn-based combat and inventory system for the rogue-like dungeon crawler.

Provides:
    - StatusEffect / StatusEffectManager for temporary buffs/debuffs.
    - Item / Weapon / Armor / Consumable classes.
    - Inventory with add/remove, equip/unequip, and consumable usage.
    - CombatResolver for attack rolls, damage calculation, and status application.
    - EnemyAI for basic chase-and-attack behaviour.
    - CombatAction helpers that consume a turn via the engine scheduler.
"""

import random
import sys
from dataclasses import dataclass, field
from enum import Enum, auto
from typing import Dict, List, Optional, Tuple, Any, Callable

# ----------------------------------------------------------------------
# Import engine types (graceful fallback if engine module is unavailable)
# ----------------------------------------------------------------------
try:
    from src.engine import Entity, GameEngine, Position
except ImportError:
    # Fallback stubs so the module can be imported standalone for testing
    Position = Tuple[int, int]

    class Entity:
        """Minimal fallback Entity for standalone testing."""
        def __init__(self, name: str = "Test", char: str = "?",
                     pos: Position = (0, 0), hp: int = 10, max_hp: int = 10,
                     blocks: bool = True):
            self.name = name
            self.char = char
            self.pos = pos
            self.hp = hp
            self.max_hp = max_hp
            self.blocks = blocks
            self.inventory: List[Any] = []

        def is_alive(self) -> bool:
            return self.hp > 0

    class GameEngine:
        """Minimal fallback GameEngine for standalone testing."""
        def __init__(self):
            self.entities: List[Entity] = []
            self.turn_count: int = 0
            self._scheduler: List[Callable] = []

        def in_bounds(self, pos: Position) -> bool:
            return True

        def get_entity_at(self, pos: Position) -> Optional[Entity]:
            for e in self.entities:
                if e.pos == pos and e.is_alive():
                    return e
            return None

        def schedule(self, fn: Callable) -> None:
            self._scheduler.append(fn)

        def advance_turn(self) -> None:
            self.turn_count += 1
            while self._scheduler:
                fn = self._scheduler.pop(0)
                fn()


# ----------------------------------------------------------------------
# Status Effects
# ----------------------------------------------------------------------
class StatusType(Enum):
    """Enumeration of all possible status effect types."""
    POISON = auto()
    BURN = auto()
    FROST = auto()
    STUN = auto()
    BLEED = auto()
    SHIELD = auto()
    HASTE = auto()
    SLOW = auto()


@dataclass
class StatusEffect:
    """
    A temporary effect applied to an entity.

    Attributes
    ----------
    effect_type : StatusType
        The kind of status (poison, burn, etc.).
    magnitude : int
        Numeric value (damage per turn, damage reduction, speed modifier).
    remaining_turns : int
        How many turns the effect persists.
    source : Optional[str]
        Name of the entity or ability that applied the effect.
    """
    effect_type: StatusType
    magnitude: int
    remaining_turns: int
    source: Optional[str] = None

    def tick(self) -> int:
        """
        Advance the effect by one turn.

        Returns
        -------
        int
            Damage dealt (or negative for healing) this tick.
            0 if the effect has no per-turn damage.
        """
        if self.remaining_turns <= 0:
            return 0

        damage = 0
        if self.effect_type in (StatusType.POISON, StatusType.BURN, StatusType.BLEED):
            damage = self.magnitude
        elif self.effect_type == StatusType.FROST:
            # Frost deals minor damage and slows
            damage = max(1, self.magnitude // 3)

        self.remaining_turns -= 1
        return damage

    def is_expired(self) -> bool:
        return self.remaining_turns <= 0


class StatusEffectManager:
    """
    Manages all active status effects on a single entity.

    Effects are stored in a list; multiple instances of the same type
    can coexist (e.g., two different poisons).
    """

    def __init__(self):
        self._effects: List[StatusEffect] = []

    def apply(self, effect: StatusEffect) -> None:
        """Apply a new status effect to the entity."""
        self._effects.append(effect)

    def remove(self, effect_type: StatusType) -> None:
        """Remove all effects of the given type."""
        self._effects = [e for e in self._effects if e.effect_type != effect_type]

    def remove_all(self) -> None:
        """Remove all active effects."""
        self._effects.clear()

    def get_effects(self, effect_type: StatusType) -> List[StatusEffect]:
        """Return all active effects of a specific type."""
        return [e for e in self._effects if e.effect_type == effect_type]

    def has_effect(self, effect_type: StatusType) -> bool:
        """Check if any effect of the given type is active."""
        return any(e.effect_type == effect_type for e in self._effects)

    def tick_all(self) -> int:
        """
        Advance all effects by one turn.

        Returns
        -------
        int
            Total damage dealt by all effects this tick.
        """
        total_damage = 0
        for effect in self._effects:
            total_damage += effect.tick()
        # Remove expired effects
        self._effects = [e for e in self._effects if not e.is_expired()]
        return total_damage

    def get_damage_reduction(self) -> int:
        """Return total damage reduction from shield effects."""
        return sum(e.magnitude for e in self._effects
                   if e.effect_type == StatusType.SHIELD)

    def get_speed_modifier(self) -> int:
        """
        Return net speed modifier.
        Positive = faster (haste), negative = slower (slow/frost).
        """
        modifier = 0
        for e in self._effects:
            if e.effect_type == StatusType.HASTE:
                modifier += e.magnitude
            elif e.effect_type in (StatusType.SLOW, StatusType.FROST):
                modifier -= e.magnitude
        return modifier

    def is_stunned(self) -> bool:
        """Check if the entity is currently stunned."""
        return self.has_effect(StatusType.STUN)

    def __len__(self) -> int:
        return len(self._effects)

    def __repr__(self) -> str:
        active = [f"{e.effect_type.name}({e.magnitude}, {e.remaining_turns}t)"
                  for e in self._effects]
        return f"StatusEffectManager({', '.join(active)})"


# ----------------------------------------------------------------------
# Items
# ----------------------------------------------------------------------
class ItemType(Enum):
    """Enumeration of item categories."""
    WEAPON = auto()
    ARMOR = auto()
    CONSUMABLE = auto()
    ACCESSORY = auto()


@dataclass
class Item:
    """
    Base class for all items in the inventory.

    Attributes
    ----------
    name : str
        Display name of the item.
    item_type : ItemType
        Category of the item.
    description : str
        Flavor text / description.
    value : int
        Gold value of the item.
    stackable : bool
        Whether multiple copies can be stacked.
    """
    name: str
    item_type: ItemType
    description: str = ""
    value: int = 0
    stackable: bool = False

    def use(self, user: Entity, engine: GameEngine) -> str:
        """
        Use the item (for consumables). Override in subclasses.

        Returns
        -------
        str
            A message describing the result of using the item.
        """
        return f"{user.name} cannot use {self.name}."


@dataclass
class Weapon(Item):
    """
    A weapon item that provides attack bonus and damage range.

    Attributes
    ----------
    attack_bonus : int
        Bonus added to attack rolls.
    min_damage : int
        Minimum damage on hit.
    max_damage : int
        Maximum damage on hit.
    status_chance : float
        Probability (0.0-1.0) of applying a status effect on hit.
    status_type : Optional[StatusType]
        The status effect applied on hit (if any).
    status_magnitude : int
        Magnitude of the status effect.
    status_duration : int
        Duration in turns of the status effect.
    """
    attack_bonus: int = 0
    min_damage: int = 1
    max_damage: int = 3
    status_chance: float = 0.0
    status_type: Optional[StatusType] = None
    status_magnitude: int = 0
    status_duration: int = 0

    def __post_init__(self):
        self.item_type = ItemType.WEAPON
        if not self.description:
            self.description = (
                f"A weapon dealing {self.min_damage}-{self.max_damage} damage "
                f"with +{self.attack_bonus} attack bonus."
            )


@dataclass
class Armor(Item):
    """
    An armor item that provides defense bonus.

    Attributes
    ----------
    defense_bonus : int
        Bonus added to defense (reduces incoming damage).
    """
    defense_bonus: int = 0

    def __post_init__(self):
        self.item_type = ItemType.ARMOR
        if not self.description:
            self.description = f"Armor providing +{self.defense_bonus} defense."


@dataclass
class Consumable(Item):
    """
    A consumable item that can be used for an immediate effect.

    Attributes
    ----------
    heal_amount : int
        Amount of HP restored (0 for non-healing consumables).
    status_type : Optional[StatusType]
        Status effect applied when used (if any).
    status_magnitude : int
        Magnitude of the status effect.
    status_duration : int
        Duration in turns of the status effect.
    """
    heal_amount: int = 0
    status_type: Optional[StatusType] = None
    status_magnitude: int = 0
    status_duration: int = 0

    def __post_init__(self):
        self.item_type = ItemType.CONSUMABLE
        self.stackable = True
        if not self.description:
            if self.heal_amount > 0:
                self.description = f"Restores {self.heal_amount} HP."
            elif self.status_type:
                self.description = f"Applies {self.status_type.name} effect."
            else:
                self.description = "A consumable item."

    def use(self, user: Entity, engine: GameEngine) -> str:
        """
        Use the consumable item.

        Returns
        -------
        str
            A message describing the result.
        """
        messages = []

        # Heal
        if self.heal_amount > 0:
            healed = min(self.heal_amount, user.max_hp - user.hp)
            user.hp += healed
            messages.append(f"{user.name} heals {healed} HP.")

        # Apply status
        if self.status_type is not None:
            effect = StatusEffect(
                effect_type=self.status_type,
                magnitude=self.status_magnitude,
                remaining_turns=self.status_duration,
                source=self.name
            )
            # Get or create status manager on the entity
            if not hasattr(user, 'status_manager'):
                user.status_manager = StatusEffectManager()
            user.status_manager.apply(effect)
            messages.append(f"{user.name} is affected by {self.status_type.name}.")

        if not messages:
            messages.append(f"{user.name} uses {self.name} (no effect).")

        return " ".join(messages)


@dataclass
class Accessory(Item):
    """
    An accessory that provides passive bonuses.

    Attributes
    ----------
    attack_bonus : int
        Bonus to attack rolls.
    defense_bonus : int
        Bonus to defense.
    max_hp_bonus : int
        Bonus to maximum HP.
    """
    attack_bonus: int = 0
    defense_bonus: int = 0
    max_hp_bonus: int = 0

    def __post_init__(self):
        self.item_type = ItemType.ACCESSORY
        if not self.description:
            bonuses = []
            if self.attack_bonus:
                bonuses.append(f"+{self.attack_bonus} ATK")
            if self.defense_bonus:
                bonuses.append(f"+{self.defense_bonus} DEF")
            if self.max_hp_bonus:
                bonuses.append(f"+{self.max_hp_bonus} HP")
            self.description = "Accessory: " + ", ".join(bonuses) if bonuses else "A passive accessory."


# ----------------------------------------------------------------------
# Inventory
# ----------------------------------------------------------------------
class Inventory:
    """
    Manages a collection of items for an entity.

    Supports:
        - Adding and removing items
        - Equipping and unequipping weapons/armor/accessories
        - Using consumables
        - Querying equipped items and their bonuses
    """

    MAX_SLOTS: int = 20  # Maximum number of item slots

    def __init__(self, owner: Optional[Entity] = None):
        self.owner = owner
        self._items: List[Item] = []
        self._equipped: Dict[ItemType, Item] = {}  # One equipped item per type

    @property
    def items(self) -> List[Item]:
        """Return a copy of the item list."""
        return list(self._items)

    @property
    def equipped(self) -> Dict[ItemType, Item]:
        """Return a copy of the equipped items dictionary."""
        return dict(self._equipped)

    def __len__(self) -> int:
        return len(self._items)

    def __contains__(self, item: Item) -> bool:
        return item in self._items

    def add(self, item: Item) -> bool:
        """
        Add an item to the inventory.

        Parameters
        ----------
        item : Item
            The item to add.

        Returns
        -------
        bool
            True if the item was added, False if inventory is full.
        """
        if len(self._items) >= self.MAX_SLOTS:
            return False
        self._items.append(item)
        return True

    def remove(self, item: Item) -> bool:
        """
        Remove an item from the inventory.

        If the item is equipped, it is unequipped first.

        Parameters
        ----------
        item : Item
            The item to remove.

        Returns
        -------
        bool
            True if the item was removed, False if not found.
        """
        if item not in self._items:
            return False

        # Unequip if currently equipped
        for slot_type, equipped_item in list(self._equipped.items()):
            if equipped_item is item:
                del self._equipped[slot_type]
                break

        self._items.remove(item)
        return True

    def remove_at(self, index: int) -> Optional[Item]:
        """
        Remove an