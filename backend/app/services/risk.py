"""Baseline risk rubric (AGENT_DESIGN §3 step 7). Placeholder weights; calibrate on real data."""

from app.domain.detection import Detection, TrackMatch
from app.domain.report import ReportAssessment, ReportClaim
from app.domain.risk import RISK_LEVELS, RiskFactor, RiskLevel, VehicleRisk
from app.domain.track import MotionProfile
from app.services.geo import angle_diff_deg

TYPE_POINTS = {"truck": 10, "bus": 8, "van": 5}
LONG_STOP_MIN = 20
STOP_NEAR_BASE_M = 6000
MOVING_MS = 1.0
HEADING_TOLERANCE_DEG = 30


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
            points=_tier(rate, ((50, 25), (20, 15), (5, 5)), below=False),
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
            points=10 if pointing else 0,
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
    stop_pts = 0 if not long_stops else 10 + (5 if len(long_stops) > 1 else 0)
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
) -> VehicleRisk:
    """Score one vehicle 0-100 with an explicit factor breakdown."""
    factors: list[RiskFactor] = []
    dist = motion.dist_now_m if motion else detection.distance_to_base_m
    if dist is not None:
        factors.append(distance_factor(dist))

    if motion is not None:
        factors.extend(motion_factors(motion))
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
    return VehicleRisk(
        detection_id=detection.id,
        track_id=match.track_id if match else None,
        score=score,
        level=level_for(score),
        factors=factors,
    )


def frame_level(risks: list[VehicleRisk]) -> RiskLevel:
    """Frame level = highest vehicle level; LOW when nothing was detected."""
    return max((r.level for r in risks), key=RISK_LEVELS.index, default="LOW")
