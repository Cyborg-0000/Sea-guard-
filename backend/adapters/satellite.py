from typing import List, Optional, Tuple
from datetime import datetime, timezone
import uuid
import json
import os
import httpx
from abc import ABC, abstractmethod

from schemas.pydantic_schemas import SpillCandidate
from services.sar_processor import SARProcessor

class BaseSatelliteAdapter(ABC):
    def __init__(self):
        self.health_status = "UNKNOWN"
    
    @abstractmethod
    def fetch_spill_candidates(self, bbox: Tuple[float, float, float, float], wind_speed_kn: Optional[float]) -> List[SpillCandidate]:
        pass

class SentinelAdapter(BaseSatelliteAdapter):
    """
    Tier B implementation: Queries CDSE STAC API for Sentinel-1 products,
    exchanges CDSE credentials for a Sentinel Hub token, and downloads
    a FLOAT32 GeoTIFF representing linear backscatter via Process API.
    """
    def __init__(self, sar_processor: SARProcessor):
        super().__init__()
        self.sar_processor = sar_processor
        self.stac_url = "https://stac.dataspace.copernicus.eu/v1/search"
        self.token_url = "https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token"
        self.process_url = "https://sh.dataspace.copernicus.eu/api/v1/process"
        self.client_id = os.environ.get("CDSE_CLIENT_ID")
        self.client_secret = os.environ.get("CDSE_CLIENT_SECRET")
        self._cached_token = None
        self._token_expires_at = 0
        self._check_health()
        
    def _check_health(self):
        """Check if STAC API is reachable and Auth is possible."""
        try:
            response = httpx.get("https://stac.dataspace.copernicus.eu/v1/", timeout=5.0)
            if response.status_code == 200:
                if self.client_id and self.client_secret:
                    # Try getting token
                    token = self._get_cdse_token()
                    if token:
                        self.health_status = "CONNECTED"
                    else:
                        self.health_status = "DEGRADED"
                else:
                    self.health_status = "DEGRADED" 
            else:
                self.health_status = "UNAVAILABLE"
        except Exception:
            self.health_status = "UNAVAILABLE"

    def _get_cdse_token(self) -> Optional[str]:
        if not self.client_id or not self.client_secret:
            return None
            
        now = datetime.now(timezone.utc).timestamp()
        if self._cached_token and now < self._token_expires_at:
            return self._cached_token
            
        try:
            payload = {
                "grant_type": "client_credentials",
                "client_id": self.client_id,
                "client_secret": self.client_secret
            }
            resp = httpx.post(self.token_url, data=payload, timeout=10.0)
            if resp.status_code == 200:
                data = resp.json()
                self._cached_token = data.get("access_token")
                # Usually expires in 3600 seconds, add a small buffer
                self._token_expires_at = now + data.get("expires_in", 3600) - 60
                return self._cached_token
            return None
        except Exception:
            return None

    def discover_products(self, bbox: Tuple[float, float, float, float]) -> dict:
        """Queries CDSE STAC API for Sentinel-1 GRD products."""
        payload = {
            "collections": ["sentinel-1-grd"],
            "bbox": list(bbox),
            "limit": 10,
            "sortby": [{"field": "datetime", "direction": "desc"}]
        }
        try:
            response = httpx.post(self.stac_url, json=payload, timeout=10.0)
            if response.status_code == 200:
                return response.json()
            return {}
        except Exception:
            return {}

    def _select_best_product(self, bbox: Tuple[float, float, float, float], target_time_iso: Optional[str] = None) -> Optional[dict]:
        stac_data = self.discover_products(bbox)
        if not stac_data or "features" not in stac_data or not stac_data["features"]:
            return None
            
        features = stac_data["features"]
        if not target_time_iso:
            return features[0]
            
        try:
            target_dt = datetime.fromisoformat(target_time_iso.replace('Z', '+00:00'))
        except ValueError:
            return features[0]
            
        best_feature = None
        min_diff = float('inf')
        
        for f in features:
            props = f.get("properties", {})
            dt_str = props.get("datetime")
            if dt_str:
                try:
                    dt = datetime.fromisoformat(dt_str.replace('Z', '+00:00'))
                    diff = abs((dt - target_dt).total_seconds())
                    if diff < min_diff:
                        min_diff = diff
                        best_feature = f
                except ValueError:
                    continue
                    
        return best_feature or features[0]

    def _process_scene(self, feature: dict, bbox: Tuple[float, float, float, float], token: str) -> Optional[str]:
        """Requests exactly linear SIGMA0_ELLIPSOID FLOAT32 TIFF from CDSE."""
        headers = {
            "Authorization": f"Bearer {token}",
            "Accept": "image/tiff"
        }
        
        # We request linear backscatter directly. SARProcessor expects this format.
        evalscript = '''
        // VERSION=3
        function setup() {
            return {
                input: [{
                    bands: ["VV", "dataMask"]
                }],
                output: {
                    id: "default",
                    bands: 1,
                    sampleType: "FLOAT32"
                }
            };
        }
        
        function evaluatePixel(sample) {
            if (sample.dataMask == 0) return [0];
            return [sample.VV];
        }
        '''
        
        # We use a 512x512 resolution for fast processing in MVP
        payload = {
            "input": {
                "bounds": {
                    "bbox": list(bbox),
                    "properties": {"crs": "http://www.opengis.net/def/crs/EPSG/0/4326"}
                },
                "data": [
                    {
                        "type": "sentinel-1-grd",
                        "dataFilter": {
                            "resolution": "HIGH"
                        },
                        "processing": {
                            "backCoeff": "SIGMA0_ELLIPSOID",
                            "orthorectify": True
                        }
                    }
                ]
            },
            "output": {
                "width": 512,
                "height": 512,
                "responses": [
                    {
                        "identifier": "default",
                        "format": {
                            "type": "image/tiff"
                        }
                    }
                ]
            },
            "evalscript": evalscript
        }
        
        import tempfile
        try:
            resp = httpx.post(self.process_url, headers=headers, json=payload, timeout=60.0)
            if resp.status_code == 200:
                temp_tiff = tempfile.NamedTemporaryFile(suffix=".tif", delete=False)
                temp_tiff.write(resp.content)
                temp_tiff.close()
                return temp_tiff.name
            else:
                self.health_status = "DEGRADED"
                return None
        except Exception:
            self.health_status = "DEGRADED"
            return None

    def fetch_spill_candidates(self, bbox: Tuple[float, float, float, float], wind_speed_kn: Optional[float]) -> List[SpillCandidate]:
        if self.health_status == "UNAVAILABLE":
            return []
            
        token = self._get_cdse_token()
        if not token:
            self.health_status = "DEGRADED"
            return []
            
        # Target time for demo is today
        feature = self._select_best_product(bbox)
        if not feature:
            return []
            
        product_id = feature.get("id", "UNKNOWN_PRODUCT")
        obs_time = datetime.now(timezone.utc)
        if "properties" in feature and "datetime" in feature["properties"]:
            try:
                obs_time = datetime.fromisoformat(feature["properties"]["datetime"].replace('Z', '+00:00'))
            except ValueError:
                pass
                
        tiff_path = self._process_scene(feature, bbox, token)
        if not tiff_path:
            return []
            
        import rasterio
        # Sanity check raster before processing
        try:
            with rasterio.open(tiff_path) as src:
                if src.read(1).size == 0 or src.crs is None:
                    self.health_status = "DEGRADED"
                    os.unlink(tiff_path)
                    return []
        except Exception:
            self.health_status = "DEGRADED"
            if os.path.exists(tiff_path):
                os.unlink(tiff_path)
            return []

        candidates = self.sar_processor.detect_spill_candidates(
            geotiff_path=tiff_path,
            wind_speed_kn=wind_speed_kn,
            observation_time=obs_time,
            product_id=product_id
        )
        
        # Embed processing provenance
        for c in candidates:
            c.processing_notes.append("CDSE Sentinel Hub processing configuration applied: SIGMA0_ELLIPSOID, orthorectify=True")
            c.processing_notes.append(f"Provenance selection reason: STAC overlap and closest acquisition time.")
        
        # Cleanup
        os.unlink(tiff_path)
        
        # Retain CONNECTED status even if 0 candidates
        self.health_status = "CONNECTED"
        return candidates

class DemoSatelliteAdapter(BaseSatelliteAdapter):
    """
    Used when DATA_MODE = DEMO_REPLAY.
    Returns hardcoded spills from demo data.
    """
    def __init__(self):
        super().__init__()
        self.health_status = "SIMULATED"
        self.demo_spills_path = os.path.join(os.path.dirname(__file__), '..', '..', 'data', 'demo', 'spills.json')
        
    def fetch_spill_candidates(self, bbox: Tuple[float, float, float, float], wind_speed_kn: Optional[float]) -> List[SpillCandidate]:
        candidates = []
        try:
            with open(self.demo_spills_path, 'r') as f:
                data = json.load(f)
                
            for s in data:
                # We map the demo SpillEvent to a SpillCandidate to simulate the pipeline
                candidates.append(SpillCandidate(
                    id=f"cand-{s['id']}",
                    centroid_lat=s['latitude'],
                    centroid_lon=s['longitude'],
                    area_km2=s.get('area_km2', 5.0),
                    confidence_score=s.get('confidence', 0.9),
                    confidence_breakdown={
                        "anomaly_strength": 0.6,
                        "shape_compatibility": 0.3,
                        "environmental_penalty": 0.0
                    },
                    backscatter_db=-15.0,
                    polygon=s.get('geometry', {}),
                    observation_time=datetime.fromisoformat(s['detected_at'].replace('Z', '+00:00')),
                    product_id="S1A_IW_GRDH_1SDV_DEMO",
                    polarization="VV",
                    look_alike_risk="LOW",
                    processing_notes=["Simulated candidate loaded from DEMO_REPLAY.", "Provenance selection reason: deterministic offline mock."]
                ))
        except Exception:
            pass
            
        return candidates
