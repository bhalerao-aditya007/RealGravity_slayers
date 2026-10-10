"""
Topology and role quota management for Swarm Mode.
Maps N -> default function-role quotas for the Build phase and elastic slot assignment.
"""
from __future__ import annotations
from dataclasses import dataclass
from typing import Dict, List, Literal

FunctionRole = Literal["scout", "coder", "tester", "critic", "redteam", "integrator", "judge", "archivist"]


@dataclass
class RoleQuotas:
    scouts: int
    squads_count: int
    coders_per_squad: int
    testers_per_squad: int
    critics_per_squad: int
    integrators: int
    judges: int
    redteam: int
    archivist: int

    @property
    def total(self) -> int:
        squad_total = self.squads_count * (self.coders_per_squad + self.testers_per_squad + self.critics_per_squad)
        return (
            self.scouts +
            squad_total +
            self.integrators +
            self.judges +
            self.redteam +
            self.archivist
        )


DEFAULT_ROLE_QUOTAS_BY_N: Dict[int, RoleQuotas] = {
    10: RoleQuotas(scouts=1, squads_count=1, coders_per_squad=4, testers_per_squad=1, critics_per_squad=1, integrators=1, judges=1, redteam=0, archivist=1),
    20: RoleQuotas(scouts=2, squads_count=2, coders_per_squad=5, testers_per_squad=1, critics_per_squad=1, integrators=2, judges=1, redteam=0, archivist=1),
    30: RoleQuotas(scouts=3, squads_count=3, coders_per_squad=5, testers_per_squad=1, critics_per_squad=1, integrators=2, judges=2, redteam=1, archivist=1),
    40: RoleQuotas(scouts=4, squads_count=4, coders_per_squad=5, testers_per_squad=1, critics_per_squad=1, integrators=3, judges=2, redteam=2, archivist=1),
    50: RoleQuotas(scouts=5, squads_count=5, coders_per_squad=5, testers_per_squad=1, critics_per_squad=1, integrators=4, judges=3, redteam=2, archivist=1),
}


def get_role_quotas(n: int) -> RoleQuotas:
    if n in DEFAULT_ROLE_QUOTAS_BY_N:
        return DEFAULT_ROLE_QUOTAS_BY_N[n]
    # Fallback nearest
    closest_n = min(DEFAULT_ROLE_QUOTAS_BY_N.keys(), key=lambda k: abs(k - n))
    return DEFAULT_ROLE_QUOTAS_BY_N[closest_n]
