from datetime import datetime, timedelta
import json
import math
from typing import List, Dict, Any, Tuple
from schemas.pydantic_schemas import EvidenceNode, EvidenceEdge, TimelineEvent, InvestigationSummary

def build_investigation_graph(spill_event, environment, drift_duration: float, candidates, vessels, top_sat_candidate=None) -> InvestigationSummary:
    """
    Builds the Evidence Graph and Timeline for Phase 6/7 Investigation Mode.
    """
    nodes = []
    edges = []
    timeline = []

    # Defensive defaults — some fields may be None on demo models
    spill_confidence = spill_event.confidence or 0.91
    spill_area = getattr(spill_event, 'area_km2', None) or 12.4
    spill_severity = getattr(spill_event, 'severity', None) or 'HIGH'
    spill_source = getattr(spill_event, 'source', None) or 'Sentinel-1 SAR'
    
    # 1. Spill Node & Timeline Event
    nodes.append(EvidenceNode(
        id="node-spill-1",
        type="spill",
        title="Spill Detection",
        source=spill_source,
        timestamp=spill_event.detected_at,
        location={"lat": spill_event.latitude, "lon": spill_event.longitude},
        confidence=spill_confidence,
        data={"area_km2": spill_area, "severity": spill_severity}
    ))
    
    timeline.append(TimelineEvent(
        id="evt-spill",
        timestamp=spill_event.detected_at,
        type="SPILL_DETECTED",
        title="Oil Spill Detected",
        description=f"Anomaly detected at {spill_event.latitude:.3f}°N, {spill_event.longitude:.3f}°E with {int(spill_confidence*100)}% confidence.",
        related_node_id="node-spill-1"
    ))
    
    # 2. Satellite Node
    sat_data = {"image_id": "UNKNOWN", "acquisition_time": (spill_event.detected_at - timedelta(minutes=5)).isoformat()}
    sat_conf = 1.0
    look_alike = "UNKNOWN"
    
    if top_sat_candidate:
        sat_data["candidate_id"] = top_sat_candidate.id
        sat_data["area_km2"] = top_sat_candidate.area_km2
        sat_conf = top_sat_candidate.confidence_score
        look_alike = top_sat_candidate.look_alike_risk
        sat_data["look_alike_risk"] = top_sat_candidate.look_alike_risk
        sat_data["confidence_breakdown"] = top_sat_candidate.confidence_breakdown
        sat_data["product_id"] = top_sat_candidate.product_id
        sat_data["polarization"] = top_sat_candidate.polarization
        sat_data["processing_notes"] = top_sat_candidate.processing_notes
        sat_data["backscatter_db"] = top_sat_candidate.backscatter_db
        sat_data["acquisition_time"] = top_sat_candidate.observation_time.isoformat()
        if hasattr(top_sat_candidate, 'provenance'):
            sat_data["provenance"] = top_sat_candidate.provenance
    elif hasattr(spill_event, 'satellite_candidate_id') and spill_event.satellite_candidate_id:
        sat_data["candidate_id"] = spill_event.satellite_candidate_id
        sat_data["area_km2"] = spill_area
        sat_conf = getattr(spill_event, 'confidence', 0.85) or 0.85
        look_alike = "LOW" if sat_conf > 0.8 else "MEDIUM"
        sat_data["look_alike_risk"] = look_alike
        sat_data["confidence_breakdown"] = {
            "anomaly_strength": 0.6,
            "shape_compatibility": 0.3,
            "environmental_penalty": -0.05
        }

    nodes.append(EvidenceNode(
        id="node-sat-1",
        type="satellite",
        title="SAR Anomaly Candidate",
        source="Sentinel-1 SAR",
        timestamp=top_sat_candidate.observation_time if top_sat_candidate else (spill_event.detected_at - timedelta(minutes=5)),
        location={"lat": spill_event.latitude, "lon": spill_event.longitude},
        confidence=sat_conf,
        data=sat_data
    ))
    
    edges.append(EvidenceEdge(source_id="node-sat-1", target_id="node-spill-1", label="derived from"))
    
    timeline.append(TimelineEvent(
        id="evt-sat",
        timestamp=spill_event.detected_at - timedelta(minutes=5),
        type="SATELLITE_ACQUISITION",
        title="SAR Anomaly Detection",
        description=f"Candidate generated with {int(sat_conf*100)}% heuristic confidence. Look-alike risk: {look_alike}.",
        related_node_id="node-sat-1"
    ))
    
    # 3. Environment Node
    if environment:
        env_prov = environment.provenance if hasattr(environment, 'provenance') else "SIMULATED_HISTORICAL" if spill_event.data_mode == "HISTORICAL" else "REAL"
        nodes.append(EvidenceNode(
            id="node-env-1",
            type="environment",
            title="Environmental Conditions",
            source=environment.source,
            timestamp=environment.observation_time,
            location={"lat": environment.latitude, "lon": environment.longitude},
            confidence=environment.confidence,
            data={
                "wind": f"{environment.wind_direction}° @ {environment.wind_speed}kn",
                "current": f"{environment.current_direction}° @ {environment.current_speed}m/s",
                "provenance": env_prov
            }
        ))
        timeline.append(TimelineEvent(
            id="evt-env",
            timestamp=environment.observation_time,
            type="ENVIRONMENT_OBSERVATION",
            title="MetOcean Data Integrated",
            description=f"Regional currents at {environment.current_direction}° and wind at {environment.wind_direction}° incorporated into model.",
            related_node_id="node-env-1"
        ))
        
    # 4. Drift Hypothesis & Source Corridor
    # Source Corridor estimation happens `drift_duration` hours before the spill
    est_source_time = spill_event.detected_at - timedelta(hours=drift_duration)
    
    nodes.append(EvidenceNode(
        id="node-drift-1",
        type="drift",
        title="Drift Hypothesis",
        source="MarineGuard Vector Model",
        timestamp=est_source_time,
        confidence=environment.confidence if environment else 0.7,
        data={"duration_hours": drift_duration, "provenance": "COMPUTED"}
    ))
    
    nodes.append(EvidenceNode(
        id="node-corridor-1",
        type="corridor",
        title="Potential Source Corridor",
        source="MarineGuard Vector Model",
        timestamp=est_source_time,
        confidence=environment.confidence if environment else 0.7,
        data={"estimated_source_time": est_source_time.isoformat(), "provenance": "COMPUTED"}
    ))
    
    edges.append(EvidenceEdge(source_id="node-spill-1", target_id="node-drift-1", label="drifted for"))
    if environment:
        edges.append(EvidenceEdge(source_id="node-env-1", target_id="node-drift-1", label="informs"))
    edges.append(EvidenceEdge(source_id="node-drift-1", target_id="node-corridor-1", label="derived from"))
    
    # Best Hypothesis Event
    timeline.append(TimelineEvent(
        id="evt-hypothesis",
        timestamp=environment.observation_time + timedelta(hours=1),
        type="BEST_HYPOTHESIS_SELECTED",
        title="BEST DRIFT HYPOTHESIS IDENTIFIED",
        description=f"{int(drift_duration)} hour source window selected based on strongest Source-Time Fit.",
        related_node_id="node-corridor-1"
    ))

    timeline.append(TimelineEvent(
        id="evt-corridor",
        timestamp=environment.observation_time + timedelta(hours=2),
        type="SOURCE_CORRIDOR_REVEALED",
        title="Source Corridor Modeled",
        description=f"Reverse drift calculated for {drift_duration} hours.",
        related_node_id="node-corridor-1"
    ))
    
    # Process Candidates
    top_candidate = None
    if candidates and len(candidates) > 0:
        top_candidate = max(candidates, key=lambda c: c.overall_score)
        
        for idx, candidate in enumerate(candidates):
            vessel = next((v for v in vessels if v.id == candidate.vessel_id), None)
            if not vessel: continue
            
            vid = f"node-vessel-{idx}"
            nodes.append(EvidenceNode(
                id=vid,
                type="vessel",
                title=vessel.name,
                source="AIS Database",
                data={"mmsi": vessel.mmsi, "type": vessel.vessel_type, "flag": vessel.flag}
            ))
            edges.append(EvidenceEdge(source_id="node-corridor-1", target_id=vid, label="intersects"))
            
            # AIS Observations for this vessel around the source time
            if hasattr(vessel, 'positions') and vessel.positions:
                for p_idx, pos in enumerate(vessel.positions):
                    # Check if this AIS is near the source time
                    time_diff = abs((pos.timestamp - est_source_time).total_seconds())
                    
                    spd = getattr(pos, 'speed', None) or '—'
                    crs = getattr(pos, 'course', None) or '—'
                    desc = f"Vessel speed: {spd}kn, heading: {crs}°."
                    title = f"AIS: {vessel.name}"
                    
                    if time_diff < 7200: # Within 2 hours of source
                        if vessel.id == top_candidate.vessel_id:
                            title = f"{vessel.name.upper()} ENTERS SOURCE REGION"
                            desc = f"Trajectory overlaps the estimated source corridor. Speed: {spd}kn."
                        else:
                            title = f"{vessel.name.upper()} IN VICINITY"
                            desc = f"Vessel recorded near source zone, evaluating trajectory fit..."
                            
                    timeline.append(TimelineEvent(
                        id=f"evt-ais-{vessel.id}-{p_idx}",
                        timestamp=pos.timestamp,
                        type="AIS_OBSERVATION",
                        title=title,
                        description=desc,
                        related_node_id=vid
                    ))
            
            # Attribution Result Node
            attr_id = f"node-attr-{idx}"
            nodes.append(EvidenceNode(
                id=attr_id,
                type="attribution",
                title=f"Attribution ({candidate.overall_score:.1f}/100)",
                source="MarineGuard Correlation Engine",
                confidence=candidate.overall_score / 100,
                data=candidate.dict()
            ))
            edges.append(EvidenceEdge(source_id=vid, target_id=attr_id, label="evaluated as"))
            
            # Additional analysis timeline event
            timeline.append(TimelineEvent(
                id=f"evt-analysis-{idx}",
                timestamp=spill_event.detected_at + timedelta(minutes=10 + idx),
                type="ATTRIBUTION_COMPLETE" if vessel.id == top_candidate.vessel_id else "CANDIDATE_ANALYSIS",
                title=f"Attribution Analysis Complete" if vessel.id == top_candidate.vessel_id else f"Analyzing: {vessel.name}",
                description=f"{vessel.name} ranks #1 with likelihood {candidate.overall_score:.1f}/100" if vessel.id == top_candidate.vessel_id else f"Evaluating spatial and temporal compatibility...",
                related_node_id=attr_id
            ))

    # Sort timeline chronologically
    timeline.sort(key=lambda e: e.timestamp)
    
    # Calculate Evidence Strength (Strong > 80, Moderate > 60, Weak > 40, Contradictory < 40)
    evidence_strength = "WEAK"
    if top_candidate:
        if top_candidate.overall_score >= 80: evidence_strength = "STRONG"
        elif top_candidate.overall_score >= 60: evidence_strength = "MODERATE"
        elif top_candidate.overall_score >= 40: evidence_strength = "WEAK"
        else: evidence_strength = "CONTRADICTORY"
        
    return InvestigationSummary(
        incident_id=spill_event.id,
        detection_confidence=spill_confidence,
        best_drift_hypothesis=drift_duration,
        model_confidence=environment.confidence if environment else 0.7,
        top_candidate_id=top_candidate.vessel_id if top_candidate else "",
        top_candidate_score=top_candidate.overall_score if top_candidate else 0.0,
        evidence_strength=evidence_strength,
        data_quality=0.85,
        nodes=nodes,
        edges=edges,
        timeline=timeline
    )
