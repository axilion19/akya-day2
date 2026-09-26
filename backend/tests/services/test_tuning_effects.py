"""Changing one threshold changes the outcome; defaults keep today's outcome (spec §6)."""

import math

from app.domain.geo import LatLon
from app.domain.track import TrackPoint
from app.domain.tuning import Tier
from app.services import risk
from app.services.behavior import DEFAULT_BEHAVIOR, behavior_class
from app.services.geo import offset_m
from app.services.risk import DEFAULT_CEILING, DEFAULT_RUBRIC, level_ceiling, level_for

BASE = LatLon(lat=39.93, lon=32.85)


def _arc(sweep_deg: float, radius_m: float = 2000, steps: int = 12) -> list[TrackPoint]:
    """Points on a circle around BASE covering `sweep_deg`, 5 minutes apart."""
    points = []
    for i in range(steps + 1):
        bearing = math.radians(sweep_deg * i / steps)
        minute = 600 + i * 5
        points.append(
            TrackPoint(
                time=f"{minute // 60:02d}:{minute % 60:02d}",
                time_min=minute,
                position=offset_m(BASE, radius_m * math.sin(bearing), radius_m * math.cos(bearing)),
            )
        )
    return points


def test_half_loop_is_a_loop_only_with_a_lower_sweep_threshold() -> None:
    half = _arc(200)
    assert behavior_class(half, BASE) != "loops_around_base"
    lower = DEFAULT_BEHAVIOR.model_copy(update={"loop_sweep_deg": 180.0})
    assert behavior_class(half, BASE, lower) == "loops_around_base"


def test_parked_car_at_1500_m_may_be_high_only_with_a_wider_at_base_radius() -> None:
    def ceiling(**kw: object) -> str:
        return level_ceiling(1500, 0.0, False, None, None, "parked", **kw)  # type: ignore[arg-type]

    assert ceiling() == "LOW"
    assert ceiling(cfg=DEFAULT_CEILING.model_copy(update={"at_base_m": 2000.0})) == "HIGH"


def test_three_vehicle_group_is_medium_only_with_large_group_three() -> None:
    def ceiling(**kw: object) -> str:
        return level_ceiling(8000, 10.0, False, None, None, "mixed_transit", 3, **kw)  # type: ignore[arg-type]

    assert ceiling() == "LOW"
    assert ceiling(large_group=3) == "MEDIUM"
    assert risk.group_factor(3).points == 0
    assert risk.group_factor(3, large_group=3).points == risk.GROUP_POINTS


def test_level_step_moves_the_level_bands() -> None:
    assert level_for(30) == "MEDIUM"
    assert level_for(30, DEFAULT_RUBRIC.model_copy(update={"level_step": 40})) == "LOW"


def test_distance_tiers_are_read_from_the_rubric() -> None:
    assert risk.distance_factor(900).points == 30
    tiers = [Tier(limit=500, points=30), Tier(limit=2000, points=20), Tier(limit=4000, points=10)]
    custom = DEFAULT_RUBRIC.model_copy(update={"distance_tiers": tiers})
    assert risk.distance_factor(900, custom).points == 20
