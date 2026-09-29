from typing import List
from models.database_models import SpillEvent, Vessel
from schemas.pydantic_schemas import AttributionResultBase
from services.drift_model import DriftModel
from datetime import timedelta

class CorrelationEngine:
    def __init__(self, drift_model: DriftModel):
        self.drift_model = drift_model

    def _point_to_segment_distance(self, p_lat, p_lon, a_lat, a_lon, b_lat, b_lon):
        # A simple approximation for distance from point to segment in km
        # Not perfectly geodetic but fast and sufficient for MVP
        dist_ab = self.drift_model._haversine(a_lat, a_lon, b_lat, b_lon)
        if dist_ab == 0:
            return self.drift_model._haversine(p_lat, p_lon, a_lat, a_lon)
            
        t = ((p_lat - a_lat) * (b_lat - a_lat) + (p_lon - a_lon) * (b_lon - a_lon)) / (dist_ab**2)
        t = max(0, min(1, t))
        
        proj_lat = a_lat + t * (b_lat - a_lat)
        proj_lon = a_lon + t * (b_lon - a_lon)
        
        return self.drift_model._haversine(p_lat, p_lon, proj_lat, proj_lon)

    def _distance_to_corridor(self, lat, lon, corridor_centerline):
        min_dist = float('inf')
        for i in range(len(corridor_centerline) - 1):
            p1 = corridor_centerline[i]
            p2 = corridor_centerline[i+1]
            d = self._point_to_segment_distance(lat, lon, p1[0], p1[1], p2[0], p2[1])
            if d < min_dist:
                min_dist = d
        return min_dist

    def run_attribution(self, spill: SpillEvent, vessels: List[Vessel], drift_duration_hours: float = 5.0) -> List[AttributionResultBase]:
        results = []
        env = self.drift_model.get_default_demo_env(spill.detected_at)
        
        # 1. Generate Reverse Drift (Source Corridor)
        corridor_centerline = self.drift_model.simulate_drift(
            spill.latitude, spill.longitude, env, drift_duration_hours, reverse=True
        )
        estimated_source_lat, estimated_source_lon = corridor_centerline[-1]
        estimated_source_time = spill.detected_at - timedelta(hours=drift_duration_hours)
        
        drift_vector = self.drift_model.calculate_drift_vector(env)
        drift_heading = drift_vector.bearing()

        for vessel in vessels:
            if not vessel.positions:
                continue

            # Find closest position in time to the ESTIMATED SOURCE TIME (not the spill detection time)
            closest_pos = min(vessel.positions, key=lambda p: abs((p.timestamp - estimated_source_time).total_seconds()))
            time_diff_hours = abs((closest_pos.timestamp - estimated_source_time).total_seconds()) / 3600.0

            # Find closest approach geographically to the estimated source point
            closest_geo_pos = min(vessel.positions, key=lambda p: self.drift_model._haversine(p.latitude, p.longitude, estimated_source_lat, estimated_source_lon))
            closest_dist_to_source = self.drift_model._haversine(closest_geo_pos.latitude, closest_geo_pos.longitude, estimated_source_lat, estimated_source_lon)

            # Check if trajectory intersects corridor (distance to centerline)
            # Find the minimum distance from any vessel position to the corridor centerline
            min_dist_to_corridor = min([self._distance_to_corridor(p.latitude, p.longitude, corridor_centerline) for p in vessel.positions])

            # Check temporal coverage explicitly
            if time_diff_hours <= 1.0:
                coverage = "FULL"
                coverage_penalty = 1.0
            elif time_diff_hours <= 3.0:
                coverage = "PARTIAL"
                coverage_penalty = 0.5
            else:
                coverage = "INSUFFICIENT"
                coverage_penalty = 0.0

            # -- Scoring Components --

            # 1. Spatial (25%): Proximity to the estimated source
            spatial_score = max(0.0, 100.0 - (closest_dist_to_source * 2.0))

            # 2. Temporal (20%): Proximity in time to the estimated source time
            temporal_score = max(0.0, 100.0 - (time_diff_hours * 15.0))

            # 3. Trajectory Compatibility (25%): Distance to source corridor
            if min_dist_to_corridor <= 1.0: trajectory_score = 100.0
            elif min_dist_to_corridor <= 5.0: trajectory_score = 85.0
            elif min_dist_to_corridor <= 10.0: trajectory_score = 65.0
            elif min_dist_to_corridor <= 25.0: trajectory_score = 40.0
            else: trajectory_score = max(0.0, 40.0 - (min_dist_to_corridor - 25.0))

            # 4. Drift Compatibility (20%): Heading match and environment fit
            heading_diff = min(abs(closest_geo_pos.heading - drift_heading), 360 - abs(closest_geo_pos.heading - drift_heading)) if closest_geo_pos.heading is not None else 90.0
            heading_score = max(0.0, 100.0 - (heading_diff * 0.5))
            drift_score = (trajectory_score * 0.6) + (heading_score * 0.4)

            # 5. Vessel Context (10%)
            context_score = 100.0 if vessel.vessel_type == "Tanker" else 50.0 if vessel.vessel_type == "Cargo" else 0.0

            raw_overall_score = (spatial_score * 0.25) + (temporal_score * 0.20) + (trajectory_score * 0.25) + (drift_score * 0.20) + (context_score * 0.10)
            overall_score = raw_overall_score * coverage_penalty
            
            source_time_fit = (temporal_score * 0.5) + (trajectory_score * 0.5)
            
            # Formulate the explicit explanation
            explanation = {
                "summary": f"Analytical Assessment: {env.confidence * 100:.0f}% environmental model confidence.",
                "ais_coverage": coverage,
                "details": [
                    {
                        "factor": "Spatial",
                        "score": round(spatial_score * 0.25, 1),
                        "max": 25,
                        "text": f"Passed within {closest_dist_to_source:.1f} km of estimated source location"
                    },
                    {
                        "factor": "Temporal",
                        "score": round(temporal_score * 0.20, 1),
                        "max": 20,
                        "text": f"{time_diff_hours:.1f}h offset from estimated source time (Coverage: {coverage})"
                    },
                    {
                        "factor": "Trajectory",
                        "score": round(trajectory_score * 0.25, 1),
                        "max": 25,
                        "text": f"Trajectory passes {min_dist_to_corridor:.1f} km from potential source corridor"
                    },
                    {
                        "factor": "Drift",
                        "score": round(drift_score * 0.20, 1),
                        "max": 20,
                        "text": f"{heading_diff:.0f}° heading deviation from predicted drift vector"
                    },
                    {
                        "factor": "Context",
                        "score": round(context_score * 0.10, 1),
                        "max": 10,
                        "text": f"Vessel type ({vessel.vessel_type}) is consistent with spill profile"
                    }
                ],
                "source_time_fit": source_time_fit,
                "drift_duration_hours": drift_duration_hours
            }

            if coverage == "INSUFFICIENT":
                final_confidence = "INSUFFICIENT"
            else:
                final_confidence = "HIGH" if overall_score > 75 else "MEDIUM" if overall_score > 50 else "LOW"

            res = AttributionResultBase(
                spill_event_id=spill.id,
                vessel_id=vessel.id,
                spatial_score=spatial_score * 0.25,
                temporal_score=temporal_score * 0.20,
                trajectory_score=trajectory_score * 0.25,
                drift_score=drift_score * 0.20,
                context_score=context_score * 0.10,
                overall_score=overall_score,
                confidence=final_confidence,
                explanation=explanation
            )
            results.append(res)
            
        results.sort(key=lambda x: x.overall_score, reverse=True)
        return results
