import math
from datetime import datetime, timezone, timedelta
from typing import List, Optional, Tuple
from schemas.pydantic_schemas import VesselPosition

# ============================================================
# AIS Validation Constants
# All thresholds are centralized here — adapters must import
# from this module rather than hard-coding their own limits.
# ============================================================

# Hard physical limit: any implied movement above this is implausible
# for any surface vessel. 100 knots ≈ 185 km/h.
MAX_VESSEL_SPEED_KNOTS = 100.0

# Suspicious (but technically possible for fast patrol / hydrofoil)
SUSPICIOUS_SPEED_KNOTS = 50.0

# Stale observation thresholds (seconds)
FRESHNESS_FRESH_SECONDS = 120       # < 2 min  → FRESH
FRESHNESS_DEGRADED_SECONDS = 600    # 2–10 min → DEGRADED
# > 10 min                          →           STALE


class AISValidationWarning:
    """Represents a validation issue with an AIS position (non-fatal)."""
    def __init__(self, code: str, message: str, position_id: Optional[str] = None):
        self.code = code
        self.message = message
        self.position_id = position_id

    def __repr__(self):
        return f"AISValidationWarning({self.code}: {self.message})"


class AISValidator:
    """
    Centralized AIS data quality validation.

    All AIS adapters (AISStreamAdapter, HistoricalAISAdapter, DemoAISAdapter)
    should call these methods after normalization to ensure data quality.

    Policy:
    - Invalid coordinates → reject (raise ValueError)
    - Invalid timestamps → raise ValueError
    - Impossible movement → warn (do not reject, flag for investigation)
    - Duplicates → deduplicate silently
    - Stale data → tag with quality_status
    """

    def validate_coordinate(self, lat: float, lon: float, position_id: str = "") -> None:
        """Raises ValueError if coordinates are physically impossible."""
        if not (-90.0 <= lat <= 90.0):
            raise ValueError(f"Invalid latitude {lat} for position {position_id}")
        if not (-180.0 <= lon <= 180.0):
            raise ValueError(f"Invalid longitude {lon} for position {position_id}")

    def validate_timestamp(self, ts: datetime, position_id: str = "") -> datetime:
        """
        Ensures the timestamp is timezone-aware UTC.
        Raises ValueError if the timestamp is naive.
        """
        if ts.tzinfo is None:
            raise ValueError(
                f"Naive datetime for position {position_id}. "
                "All AIS timestamps must be timezone-aware UTC."
            )
        return ts

    def deduplicate(self, positions: List[VesselPosition]) -> List[VesselPosition]:
        """
        Removes exact duplicates: same vessel_id + timestamp + lat + lon.
        Order is preserved; first occurrence is kept.
        """
        seen = set()
        result = []
        for p in positions:
            key = (p.vessel_id, p.timestamp, round(p.latitude, 6), round(p.longitude, 6))
            if key not in seen:
                seen.add(key)
                result.append(p)
        return result

    def get_freshness_status(self, observation_time: datetime, now: Optional[datetime] = None) -> str:
        """
        Returns FRESH, DEGRADED, or STALE based on observation age.

        last_update must be the latest *valid* AIS observation time,
        not merely the last WebSocket heartbeat.
        """
        if now is None:
            now = datetime.now(timezone.utc)
        age_seconds = (now - observation_time).total_seconds()
        if age_seconds < FRESHNESS_FRESH_SECONDS:
            return "FRESH"
        elif age_seconds < FRESHNESS_DEGRADED_SECONDS:
            return "DEGRADED"
        else:
            return "STALE"

    def check_impossible_movement(
        self,
        pos_a: VesselPosition,
        pos_b: VesselPosition,
    ) -> Optional[AISValidationWarning]:
        """
        Checks if the implied speed between two consecutive AIS observations
        exceeds the hard physical threshold (MAX_VESSEL_SPEED_KNOTS = 100 kn).

        Returns an AISValidationWarning if implausible, None if OK.
        Uses Course Over Ground geometry (lat/lon), NOT the vessel's self-reported speed.
        """
        dt_seconds = abs((pos_b.timestamp - pos_a.timestamp).total_seconds())
        if dt_seconds < 1:
            # Simultaneous or near-simultaneous — can't compute speed
            return None

        dist_km = self._haversine(pos_a.latitude, pos_a.longitude, pos_b.latitude, pos_b.longitude)
        dist_nm = dist_km / 1.852
        dt_hours = dt_seconds / 3600.0
        implied_speed_knots = dist_nm / dt_hours

        if implied_speed_knots > MAX_VESSEL_SPEED_KNOTS:
            return AISValidationWarning(
                code="IMPOSSIBLE_MOVEMENT",
                message=(
                    f"Implied speed {implied_speed_knots:.1f} kn between {pos_a.id} and {pos_b.id} "
                    f"exceeds hard limit of {MAX_VESSEL_SPEED_KNOTS} kn. "
                    "Observation flagged as physically implausible."
                ),
                position_id=pos_b.id,
            )
        elif implied_speed_knots > SUSPICIOUS_SPEED_KNOTS:
            return AISValidationWarning(
                code="SUSPICIOUS_MOVEMENT",
                message=(
                    f"Implied speed {implied_speed_knots:.1f} kn between {pos_a.id} and {pos_b.id} "
                    f"is above suspicious threshold ({SUSPICIOUS_SPEED_KNOTS} kn)."
                ),
                position_id=pos_b.id,
            )
        return None

    def validate_positions_batch(
        self,
        positions: List[VesselPosition],
        reject_impossible: bool = True,
    ) -> Tuple[List[VesselPosition], List[AISValidationWarning]]:
        """
        Validates a batch of AIS positions:
          1. Validates coordinates (rejects invalid)
          2. Validates timestamps (rejects naive)
          3. Deduplicates
          4. Checks impossible movement (flags or rejects)

        Returns (valid_positions, warnings).
        """
        valid = []
        warnings: List[AISValidationWarning] = []

        for p in positions:
            try:
                self.validate_coordinate(p.latitude, p.longitude, p.id)
                self.validate_timestamp(p.timestamp, p.id)
                valid.append(p)
            except ValueError as e:
                warnings.append(AISValidationWarning("REJECTED", str(e), p.id))

        valid = self.deduplicate(valid)

        # Check consecutive movement per vessel
        from itertools import groupby
        from operator import attrgetter

        by_vessel = {}
        for p in valid:
            by_vessel.setdefault(p.vessel_id, []).append(p)

        final_valid = []
        for vessel_id, vpositions in by_vessel.items():
            sorted_pos = sorted(vpositions, key=lambda p: p.timestamp)
            for i, p in enumerate(sorted_pos):
                if i > 0:
                    warn = self.check_impossible_movement(sorted_pos[i - 1], p)
                    if warn:
                        warnings.append(warn)
                        if reject_impossible and warn.code == "IMPOSSIBLE_MOVEMENT":
                            continue  # skip this position
                final_valid.append(p)

        return final_valid, warnings

    @staticmethod
    def _haversine(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
        """Returns distance in km between two lat/lon points."""
        R = 6371.0
        d_lat = math.radians(lat2 - lat1)
        d_lon = math.radians(lon2 - lon1)
        a = (math.sin(d_lat / 2) ** 2 +
             math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(d_lon / 2) ** 2)
        return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
