"""Baseline risk rubric (AGENT_DESIGN §3 step 7). Placeholder weights; calibrate on real data."""

from app.domain.detection import Detection, TrackMatch
from app.domain.report import ReportAssessment, ReportClaim
from app.domain.risk import RISK_LEVELS, RiskFactor, RiskLevel, VehicleRisk
from app.domain.track import MotionProfile
from app.domain.watch import BehaviorClass, WatchLevel
from app.services.behavior import DANGER_PATTERNS, LARGE_GROUP, RECON_SIGNS
from app.services.geo import angle_diff_deg

TYPE_POINTS = {"truck": 10, "bus": 8, "van": 5}
LONG_STOP_MIN = 20
STOP_NEAR_BASE_M = 6000
MOVING_MS = 1.0
HEADING_TOLERANCE_DEG = 30


# What counts as danger (user decisions, 26-27 Sep; movement analysis in AGENT_DESIGN §3 step 7).
# Looping around the base and orbiting it at a fixed range are the main danger patterns; probing
# (approach, pull back, come back) and a stakeout (drove in, parked by the perimeter) are
# reconnaissance signs worth MEDIUM. Driving toward the base at normal speed is traffic (moving
# vehicles here drive 4-7.5 m/s; roads lead to the base), and cars that were by the base from the
# start are its own traffic. One definition for the whole app: watch mode and the per-frame rubric.
PATTERN_POINTS: dict[str, int] = {
    "loops_around_base": 35,
    "fixed_range_orbit": 30,
    "probing_return": 25,
    "perimeter_stakeout": 20,
}
AT_BASE_M = 1000  # this close to the base may be HIGH, if the vehicle drove in
ARRIVED_FROM_M = 1500  # "drove in": first seen at least this far from the base
BASE_TRAFFIC: tuple[BehaviorClass, ...] = ("parked", "leaving_base")  # there from the start
PATTERN_HIGH_M = 5000  # a danger pattern within this distance may be HIGH, else MEDIUM
APPROACH_HEADING_DEG = 45  # "driving at the base"
APPROACH_HIGH_M, APPROACH_HIGH_ETA_MIN = 1500, 5.0  # very close final approach: HIGH allowed


def level_ceiling(
    dist_m: float,
    closing_now: bool,
    heading_vs_base_deg: float | None,
    eta_min: float | None,
    behavior: BehaviorClass,
    group_size: int = 1,
    *,
    start_m: float | None = None,
    closest_m: float | None = None,
) -> WatchLevel:
    """Highest level a vehicle may get (m, degrees, minutes; `start_m` = distance when first seen,
    `closest_m` = closest approach so far, None if unknown):
    - looping around / orbiting the base: HIGH within PATTERN_HIGH_M, else MEDIUM;
    - probing (approach, pull back, come back): HIGH if it came within AT_BASE_M, else MEDIUM;
    - approaching now (closing, pointed at the base) within APPROACH_HIGH_M or
      APPROACH_HIGH_ETA_MIN: HIGH;
    - within AT_BASE_M after driving in (first seen beyond ARRIVED_FROM_M): HIGH; cars that were
      by the base from the start (parked, leaving) are its own traffic;
    - a stakeout (drove in, parked by the perimeter): MEDIUM;
    - moving in a large group (LARGE_GROUP+ vehicles together): MEDIUM;
    - anything else (normal-speed approaches, stops, parked, transit): LOW."""
    if behavior in DANGER_PATTERNS:
        return "HIGH" if dist_m <= PATTERN_HIGH_M else "MEDIUM"
    if behavior == "probing_return":
        return "HIGH" if closest_m is not None and closest_m <= AT_BASE_M else "MEDIUM"
    pointed = heading_vs_base_deg is not None and heading_vs_base_deg <= APPROACH_HEADING_DEG
    close = dist_m <= APPROACH_HIGH_M or (eta_min is not None and eta_min <= APPROACH_HIGH_ETA_MIN)
    if closing_now and pointed and close:
        return "HIGH"
    arrived = start_m is None or start_m >= ARRIVED_FROM_M
    if dist_m <= AT_BASE_M and arrived and behavior not in BASE_TRAFFIC:
        return "HIGH"
    if behavior in RECON_SIGNS:
        return "MEDIUM"
    return "MEDIUM" if group_size >= LARGE_GROUP else "LOW"


def motion_ceiling(
    motion: MotionProfile | None, dist_m: float | None, behavior: BehaviorClass, group_size: int = 1
) -> WatchLevel:
    """`level_ceiling` for a frame vehicle: closing now = moving at the base in the last 10 min."""
    if motion is None:
        return "HIGH" if dist_m is not None and dist_m <= AT_BASE_M else "MEDIUM"
    heading_diff = (
        None
        if motion.heading_deg is None
        else angle_diff_deg(motion.heading_deg, motion.bearing_to_base_deg)
    )
    moving = motion.last10_speed_ms >= MOVING_MS
    # A frame's motion window has no reliable first sighting: treated as having driven in.
    return level_ceiling(
        motion.dist_now_m,
        moving,
        heading_diff,
        motion.eta_to_base_min,
        behavior,
        group_size,
        closest_m=motion.min_dist_m,
    )


def cap_level(level: RiskLevel, ceiling: WatchLevel) -> RiskLevel:
    """`level` limited to `ceiling` (a HIGH ceiling also allows CRITICAL)."""
    if ceiling == "HIGH":
        return level
    return min(level, ceiling, key=RISK_LEVELS.index)


GROUP_POINTS = 15


def group_factor(group_size: int) -> RiskFactor:
    """Points for moving in a large group (LARGE_GROUP+ vehicles together)."""
    points = GROUP_POINTS if group_size >= LARGE_GROUP else 0
    return RiskFactor(name="group", points=points, detail=f"{group_size} moving together")


def pattern_factor(behavior: BehaviorClass) -> RiskFactor:
    """Points for the danger patterns (looping around / orbiting the base)."""
    return RiskFactor(name="pattern", points=PATTERN_POINTS.get(behavior, 0), detail=behavior)


def level_for(score: int) -> RiskLevel:
    """0-24 LOW, 25-49 MEDIUM, 50-74 HIGH, 75-100 CRITICAL."""
    return RISK_LEVELS[min(3, score // 25)]


def _tier(value: float, tiers: tuple[tuple[float, int], ...], below: bool) -> int:
    for threshold, points in tiers:
        if (value < threshold) if below else (value > threshold):
            return points
    return 0


def distance_factor(dist_m: float) -> RiskFactor:
    """Points for the current distance to the base (m)."""
    pts = _tier(dist_m, ((1000, 30), (2000, 20), (4000, 10)), below=True)
    return RiskFactor(name="distance_to_base", points=pts, detail=f"{dist_m:.0f} m")


def motion_factors(motion: MotionProfile) -> list[RiskFactor]:
    """Approach-rate, heading-at-base and long-stop points from a track's motion."""
    factors: list[RiskFactor] = []
    rate = motion.approach_rate_m_per_min
    factors.append(
        RiskFactor(
            name="approach_rate",
            points=_tier(rate, ((80, 15), (50, 8)), below=False),
            detail=f"{rate:+.1f} m/min over 60 min",
        )
    )
    pointing = (
        motion.heading_deg is not None
        and motion.last10_speed_ms >= MOVING_MS
        and angle_diff_deg(motion.heading_deg, motion.bearing_to_base_deg) < HEADING_TOLERANCE_DEG
    )
    factors.append(
        RiskFactor(
            name="heading_to_base",
            points=5 if pointing else 0,
            detail=(
                f"heading {motion.heading_deg:.0f}°, base at {motion.bearing_to_base_deg:.0f}°"
                if motion.heading_deg is not None
                else "stationary"
            ),
        )
    )
    long_stops = [
        s
        for s in motion.stops
        if s.duration_min >= LONG_STOP_MIN and s.distance_to_base_m <= STOP_NEAR_BASE_M
    ]
    stop_pts = 0 if not long_stops else 5 + (5 if len(long_stops) > 1 else 0)
    factors.append(
        RiskFactor(
            name="stops_near_base",
            points=stop_pts,
            detail=f"{len(long_stops)} stop(s) ≥ {LONG_STOP_MIN} min within 6 km",
        )
    )
    return factors


def score_vehicle(
    detection: Detection,
    match: TrackMatch | None,
    motion: MotionProfile | None,
    assessments: list[ReportAssessment],
    claims: dict[str, ReportClaim],
    behavior: BehaviorClass = "unknown",
    group_size: int = 1,
) -> VehicleRisk:
    """Score one vehicle 0-100 with an explicit factor breakdown."""
    factors: list[RiskFactor] = []
    dist = motion.dist_now_m if motion else detection.distance_to_base_m
    if dist is not None:
        factors.append(distance_factor(dist))

    if motion is not None:
        factors.extend(motion_factors(motion))
        factors.append(pattern_factor(behavior))
        factors.append(group_factor(group_size))
    else:
        factors.append(RiskFactor(name="no_track", points=0, detail="unknown history"))

    factors.append(
        RiskFactor(
            name="vehicle_type",
            points=TYPE_POINTS.get(detection.label, 0),
            detail=detection.label,
        )
    )

    corroborated = [
        a.report_id
        for a in assessments
        if a.verdict == "CORROBORATED"
        and detection.id in a.linked_detection_ids
        and claims[a.report_id].claim_kind == "SIGHTING"
    ]
    if corroborated:
        factors.append(
            RiskFactor(
                name="corroborated_report",
                points=10,
                detail=", ".join(corroborated),
            )
        )

    score = min(100, sum(f.points for f in factors))
    ceiling = motion_ceiling(motion, dist, behavior, group_size)
    level = cap_level(level_for(score), ceiling)
    if level != level_for(score):
        factors.append(
            RiskFactor(name="ceiling", points=0, detail=f"score {score}: capped at {ceiling}")
        )
    return VehicleRisk(
        detection_id=detection.id,
        track_id=match.track_id if match else None,
        score=score,
        level=level,
        factors=factors,
    )


def frame_level(risks: list[VehicleRisk]) -> RiskLevel:
    """Frame level = highest vehicle level; LOW when nothing was detected."""
    return max((r.level for r in risks), key=RISK_LEVELS.index, default="LOW")
