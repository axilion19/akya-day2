"""Baseline risk rubric (AGENT_DESIGN §3 step 7). Placeholder weights; calibrate on real data."""

from app.domain.detection import Detection, TrackMatch
from app.domain.report import ReportAssessment, ReportClaim
from app.domain.risk import RISK_LEVELS, RiskFactor, RiskLevel, VehicleRisk
from app.domain.track import MotionProfile
from app.domain.tuning import CeilingTuning, PatternPoints, RubricTuning, Tier, TypePoints
from app.domain.watch import BehaviorClass, WatchLevel
from app.services.behavior import DANGER_PATTERNS, LARGE_GROUP
from app.services.geo import angle_diff_deg

TYPE_POINTS = {"truck": 10, "bus": 8, "van": 5}
LONG_STOP_MIN = 20
STOP_NEAR_BASE_M = 6000
MOVING_MS = 1.0
HEADING_TOLERANCE_DEG = 30


# What counts as danger (user decision, 26 Sep): looping around the base and orbiting it at a
# fixed range are the main danger patterns. Driving toward the base is normal traffic (roads lead
# to it; about half the vehicles approach it at some point): only a very high approach may reach
# MEDIUM or HIGH. One definition for the whole app: watch mode and the per-frame rubric.
PATTERN_POINTS: dict[str, int] = {"loops_around_base": 35, "fixed_range_orbit": 30}
AT_BASE_M = 1000  # this close to the base may be HIGH whatever it does
PATTERN_HIGH_M = 5000  # a danger pattern within this distance may be HIGH, else MEDIUM
APPROACH_HEADING_DEG = 45  # "driving at the base"
APPROACH_HIGH_M, APPROACH_HIGH_ETA_MIN = 1500, 5.0  # very high approach: HIGH allowed
APPROACH_MEDIUM_MS = 4.0  # fast approach ...
APPROACH_MEDIUM_M, APPROACH_MEDIUM_ETA_MIN = 3000, 12.0  # ... this close or soon: MEDIUM allowed
GROUP_POINTS = 15
DISTANCE_TIERS = ((1000, 30), (2000, 20), (4000, 10))  # dist < m -> points
APPROACH_RATE_TIERS = ((80, 15), (50, 8))  # rate > m/min -> points
HEADING_POINTS = 5
STOP_POINTS_FIRST, STOP_POINTS_EXTRA = 5, 5
LEVEL_STEP = 25

DEFAULT_RUBRIC = RubricTuning(
    distance_tiers=[Tier(limit=m, points=p) for m, p in DISTANCE_TIERS],
    approach_rate_tiers=[Tier(limit=r, points=p) for r, p in APPROACH_RATE_TIERS],
    heading_points=HEADING_POINTS,
    heading_tolerance_deg=HEADING_TOLERANCE_DEG,
    long_stop_min=LONG_STOP_MIN,
    stop_near_base_m=STOP_NEAR_BASE_M,
    stop_points_first=STOP_POINTS_FIRST,
    stop_points_extra=STOP_POINTS_EXTRA,
    pattern_points=PatternPoints(
        loops_around_base=PATTERN_POINTS["loops_around_base"],
        fixed_range_orbit=PATTERN_POINTS["fixed_range_orbit"],
    ),
    group_points=GROUP_POINTS,
    type_points=TypePoints(
        truck=TYPE_POINTS["truck"], bus=TYPE_POINTS["bus"], van=TYPE_POINTS["van"]
    ),
    level_step=LEVEL_STEP,
)
DEFAULT_CEILING = CeilingTuning(
    at_base_m=AT_BASE_M,
    pattern_high_m=PATTERN_HIGH_M,
    approach_heading_deg=APPROACH_HEADING_DEG,
    approach_high_m=APPROACH_HIGH_M,
    approach_high_eta_min=APPROACH_HIGH_ETA_MIN,
    approach_medium_ms=APPROACH_MEDIUM_MS,
    approach_medium_m=APPROACH_MEDIUM_M,
    approach_medium_eta_min=APPROACH_MEDIUM_ETA_MIN,
)


def level_ceiling(
    dist_m: float,
    speed_ms: float,
    closing_now: bool,
    heading_vs_base_deg: float | None,
    eta_min: float | None,
    behavior: BehaviorClass,
    group_size: int = 1,
) -> WatchLevel:
    """Highest level a vehicle may get (m, m/s, degrees, minutes):
    - within AT_BASE_M: HIGH;
    - looping around / orbiting the base: HIGH within PATTERN_HIGH_M, else MEDIUM;
    - approaching now (closing, pointed at the base): HIGH if within APPROACH_HIGH_M or
      APPROACH_HIGH_ETA_MIN; MEDIUM if faster than APPROACH_MEDIUM_MS and within
      APPROACH_MEDIUM_M or APPROACH_MEDIUM_ETA_MIN;
    - moving in a large group (LARGE_GROUP+ vehicles together): MEDIUM;
    - anything else (other approaches, stops, parked, transit): LOW."""
    if dist_m <= AT_BASE_M:
        return "HIGH"
    if behavior in DANGER_PATTERNS:
        return "HIGH" if dist_m <= PATTERN_HIGH_M else "MEDIUM"
    pointed = heading_vs_base_deg is not None and heading_vs_base_deg <= APPROACH_HEADING_DEG
    if closing_now and pointed:
        if dist_m <= APPROACH_HIGH_M or (eta_min is not None and eta_min <= APPROACH_HIGH_ETA_MIN):
            return "HIGH"
        near = dist_m <= APPROACH_MEDIUM_M or (
            eta_min is not None and eta_min <= APPROACH_MEDIUM_ETA_MIN
        )
        if speed_ms >= APPROACH_MEDIUM_MS and near:
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
    return level_ceiling(
        motion.dist_now_m,
        motion.last10_speed_ms,
        moving,
        heading_diff,
        motion.eta_to_base_min,
        behavior,
        group_size,
    )


def cap_level(level: RiskLevel, ceiling: WatchLevel) -> RiskLevel:
    """`level` limited to `ceiling` (a HIGH ceiling also allows CRITICAL)."""
    if ceiling == "HIGH":
        return level
    return min(level, ceiling, key=RISK_LEVELS.index)


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
