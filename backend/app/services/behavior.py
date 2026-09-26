"""Static behavior class of a route so far (classes from docs/figures/stage2_data_overview.png).

Pure; used by the watch rows and by the per-frame risk rubric. Distances in meters, bearings in
degrees from north.
"""

from itertools import combinations, pairwise

from app.domain.geo import LatLon
from app.domain.track import Track, TrackPoint
from app.domain.tuning import BehaviorTuning, GroupTuning
from app.domain.watch import BehaviorClass
from app.services.geo import bearing_deg, haversine_m

# The patterns that count as danger in themselves (looping around / orbiting the base).
DANGER_PATTERNS: tuple[BehaviorClass, ...] = ("loops_around_base", "fixed_range_orbit")

# Behavior classes (thresholds from docs/figures/stage2_data_overview.png)
PARKED_MAX_PATH_M = 300.0
LEAVING_START_M = 1300.0
LEAVING_GAIN_M = 1500.0
LOOP_SWEEP_DEG = 270.0
ORBIT_MIN_PATH_M = 12000.0
ORBIT_MAX_RANGE_M = 600.0
APPROACH_GAIN_M = 1500.0
DEFAULT_BEHAVIOR = BehaviorTuning(
    parked_max_path_m=PARKED_MAX_PATH_M,
    leaving_start_m=LEAVING_START_M,
    leaving_gain_m=LEAVING_GAIN_M,
    loop_sweep_deg=LOOP_SWEEP_DEG,
    orbit_min_path_m=ORBIT_MIN_PATH_M,
    orbit_max_range_m=ORBIT_MAX_RANGE_M,
    approach_gain_m=APPROACH_GAIN_M,
)


def behavior_class(points: list[TrackPoint], base: LatLon) -> BehaviorClass:
    """Static classification of a route so far (see the overview figure for the classes)."""
    if len(points) < 3:
        return "unknown"
    dists = [haversine_m(p.position, base) for p in points]
    path = sum(haversine_m(a.position, b.position) for a, b in pairwise(points))
    bearings = [bearing_deg(base, p.position) for p in points]
    sweep, unwrapped = 0.0, 0.0
    for a, b in pairwise(bearings):
        unwrapped += (b - a + 180) % 360 - 180
        sweep = max(sweep, abs(unwrapped))
    if path < PARKED_MAX_PATH_M:
        return "parked"
    if dists[0] < LEAVING_START_M and dists[-1] - dists[0] > LEAVING_GAIN_M:
        return "leaving_base"
    if sweep > LOOP_SWEEP_DEG:
        return "loops_around_base"
    if path > ORBIT_MIN_PATH_M and max(dists) - min(dists) < ORBIT_MAX_RANGE_M:
        return "fixed_range_orbit"
    if dists[0] - dists[-1] > APPROACH_GAIN_M:
        return "steady_approach"
    return "mixed_transit"


# Moving together: at least LARGE_GROUP vehicles, each moving, pairwise linked when within
# GROUP_RADIUS_M at each of their last GROUP_SAMPLES positions. Vehicles that only meet at the end
# (every track ends inside its drone frame at capture time) do not count.
LARGE_GROUP = 4
GROUP_RADIUS_M = 500.0
GROUP_SAMPLES = 3  # 15 minutes at 5-minute steps
GROUP_MIN_MOVE_M = 150.0  # over those samples; parked cars are not a group
DEFAULT_GROUPS = GroupTuning(
    large_group=LARGE_GROUP, group_radius_m=GROUP_RADIUS_M, group_min_move_m=GROUP_MIN_MOVE_M
)


def moving_groups(tracks: list[Track], minute: int) -> dict[str, list[str]]:
    """Track id -> ids of the vehicles moving with it (itself included), for groups of 2+.
    Only tracks with a sample exactly at `minute` take part."""
    recent: dict[str, list[TrackPoint]] = {}
    for tr in tracks:
        pts = [p for p in tr.points if p.time_min <= minute][-GROUP_SAMPLES:]
        if len(pts) < GROUP_SAMPLES or pts[-1].time_min != minute:
            continue
        if sum(haversine_m(a.position, b.position) for a, b in pairwise(pts)) < GROUP_MIN_MOVE_M:
            continue
        recent[tr.track_id] = pts
    parent = {t: t for t in recent}

    def find(t: str) -> str:
        while parent[t] != t:
            parent[t] = parent[parent[t]]
            t = parent[t]
        return t

    for a, b in combinations(recent, 2):
        together = all(
            haversine_m(pa.position, pb.position) <= GROUP_RADIUS_M
            for pa, pb in zip(recent[a], recent[b], strict=True)
        )
        if together:
            parent[find(a)] = find(b)
    members: dict[str, list[str]] = {}
    for t in recent:
        members.setdefault(find(t), []).append(t)
    return {t: sorted(g) for g in members.values() if len(g) > 1 for t in g}
