import uuid
from datetime import datetime, timezone
import numpy as np
import rasterio
from rasterio.features import shapes
from rasterio.warp import transform
from scipy.ndimage import uniform_filter, label, find_objects
from shapely.geometry import shape, MultiPolygon
from global_land_mask import globe
from typing import List, Optional, Tuple, Dict, Any

from schemas.pydantic_schemas import SpillCandidate

class SARProcessor:
    """
    Scientifically grounded SAR-based anomaly detection baseline for generating oil-spill candidates.
    Uses pre-calibrated backscatter (sigma nought), geographic land masking, 
    adaptive thresholding, and contextual look-alike filtering.
    """
    
    def __init__(self):
        # Configuration parameters for the detection pipeline
        self.min_area_km2 = 0.1
        self.max_area_km2 = 200.0
        self.low_wind_threshold_kn = 3.0
        self.lee_filter_size = 3
        
    def _lee_filter(self, img: np.ndarray, size: int) -> np.ndarray:
        """Applies a standard Lee filter to reduce SAR speckle."""
        img_mean = uniform_filter(img, (size, size))
        img_sqr_mean = uniform_filter(img**2, (size, size))
        img_variance = img_sqr_mean - img_mean**2
        
        overall_variance = np.var(img)
        # Avoid division by zero
        weights = img_variance / (img_variance + overall_variance + 1e-10)
        img_output = img_mean + weights * (img - img_mean)
        return img_output

    def _get_pixel_latlon(self, transform_affine, row, col) -> Tuple[float, float]:
        """Convert pixel coordinates to lat/lon using the raster affine transform."""
        lon, lat = transform_affine * (col, row)
        return lat, lon

    def _create_ocean_mask(self, data_shape: tuple, transform_affine, crs) -> np.ndarray:
        """
        Create a boolean mask where True = Ocean, False = Land.
        Uses global-land-mask based on lat/lon coordinates of pixels.
        """
        rows, cols = np.indices(data_shape)
        
        # This can be slow for very large arrays, but for cropped AOIs it's acceptable.
        # Optimize by computing lat/lon for the grid
        # For an affine transform: x = a*col + b*row + c, y = d*col + e*row + f
        # Assuming unrotated standard North-up transform for simplicity:
        lons, lats = rasterio.transform.xy(transform_affine, rows, cols)
        lons_arr = np.array(lons)
        lats_arr = np.array(lats)
        
        # globe.is_ocean returns True for ocean, False for land
        is_ocean = globe.is_ocean(lats_arr, lons_arr)
        return is_ocean.reshape(data_shape)

    def _otsu_threshold(self, values: np.ndarray) -> float:
        """Calculates Otsu's threshold for an array of values."""
        if len(values) == 0:
            return 0.0
            
        bins = 256
        hist, bin_edges = np.histogram(values, bins=bins)
        bin_mids = (bin_edges[:-1] + bin_edges[1:]) / 2.0
        
        weight1 = np.cumsum(hist)
        weight2 = np.cumsum(hist[::-1])[::-1]
        
        mean1 = np.cumsum(hist * bin_mids) / (weight1 + 1e-10)
        mean2 = (np.cumsum((hist * bin_mids)[::-1]) / (weight2[::-1] + 1e-10))[::-1]
        
        variance12 = weight1[:-1] * weight2[1:] * (mean1[:-1] - mean2[1:]) ** 2
        
        idx = np.argmax(variance12)
        return bin_mids[idx]

    def _calculate_polygon_area_km2(self, geom: dict) -> float:
        """Approximates the area of a GeoJSON polygon in km2."""
        s = shape(geom)
        # Very rough approximation for WGS84: 1 sq degree ~ 111^2 km2 ~ 12321 km2 (at equator)
        # For more accurate, project to local UTM. For MVP, use a rough scalar based on latitude.
        centroid_lat = s.centroid.y
        # 1 degree lat = 111 km. 1 degree lon = 111 * cos(lat) km
        km_per_deg_lat = 111.0
        km_per_deg_lon = 111.0 * np.cos(np.radians(centroid_lat))
        area_sq_degrees = s.area
        area_km2 = area_sq_degrees * km_per_deg_lat * km_per_deg_lon
        return area_km2

    def detect_spill_candidates(
        self, 
        geotiff_path: str,
        wind_speed_kn: Optional[float], 
        observation_time: datetime = datetime.now(timezone.utc),
        product_id: str = "UNKNOWN_PRODUCT"
    ) -> List[SpillCandidate]:
        """
        Runs the full Level-2 SAR anomaly detection pipeline.
        Returns a list of Oil-Spill Candidates.
        """
        processing_notes = []
        processing_notes.append("Initiated SAR anomaly detection pipeline.")
        
        with rasterio.open(geotiff_path) as src:
            # 1. Load Data (assuming Band 1 is VV sigma0 in linear or dB)
            # Sentinel Hub outputs FLOAT32, we assume it's linear backscatter coefficient
            raw_data = src.read(1)
            transform_affine = src.transform
            
            # 2. Speckle Filter
            filtered_data = self._lee_filter(raw_data, self.lee_filter_size)
            processing_notes.append(f"Applied Lee filter (kernel size: {self.lee_filter_size}).")
            
            # Convert to dB if not already (assuming linear > 0)
            # A common check: if min value >= 0 and max < 10, it's likely linear.
            # For robustness, we will work in dB for thresholding.
            # Handle zeros or negative values to avoid log10 errors
            safe_data = np.clip(filtered_data, 1e-10, None)
            data_db = 10 * np.log10(safe_data)
            
            # 3. Geographic Land Mask
            ocean_mask = self._create_ocean_mask(raw_data.shape, transform_affine, src.crs)
            processing_notes.append("Applied geographic ocean/land mask.")
            
            # Valid ocean pixels
            valid_pixels = data_db[ocean_mask]
            
            if len(valid_pixels) < 100:
                processing_notes.append("Insufficient ocean pixels for analysis.")
                return []
                
            # 4. Otsu Threshold on Valid Ocean Pixels
            threshold_db = self._otsu_threshold(valid_pixels)
            # Oil spills are dark, so we look for pixels *below* the threshold
            # Typically Otsu separates water and land/bright ships. 
            # To find spills, we need a threshold significantly lower than the mean ocean backscatter.
            mean_ocean_db = np.mean(valid_pixels)
            std_ocean_db = np.std(valid_pixels)
            
            # A more robust anomaly threshold: Otsu often finds the split between wind-roughened and calm water.
            # Alternatively, use mean - k * std
            anomaly_threshold = min(threshold_db, mean_ocean_db - 1.5 * std_ocean_db)
            
            processing_notes.append(f"Calculated anomaly threshold: {anomaly_threshold:.2f} dB (mean ocean: {mean_ocean_db:.2f} dB).")
            
            # 5. Segmentation (Connected Components)
            # Anomaly mask: True where pixel is ocean AND backscatter < threshold
            anomaly_mask = ocean_mask & (data_db < anomaly_threshold)
            
            labeled_array, num_features = label(anomaly_mask)
            processing_notes.append(f"Segmented {num_features} initial dark-region anomalies.")
            
            candidates = []
            
            # Iterate through connected components
            for i, slice_obj in enumerate(find_objects(labeled_array), 1):
                component_mask = (labeled_array[slice_obj] == i)
                
                # We need the geometry. We'll pad the slice slightly to extract shapes properly
                # For simplicity, extract shapes from the boolean mask of this specific component
                full_component_mask = (labeled_array == i).astype('uint8')
                
                # 6. Extract Polygon
                polygons = []
                for geom, val in shapes(full_component_mask, mask=full_component_mask, transform=transform_affine):
                    polygons.append(geom)
                
                if not polygons:
                    continue
                    
                # Use the largest polygon if multiple (holes might create multiple)
                main_polygon = polygons[0]
                geom_shape = shape(main_polygon)
                
                # 7. Look-alike Filtering (Area)
                area_km2 = self._calculate_polygon_area_km2(main_polygon)
                
                if area_km2 < self.min_area_km2:
                    continue # Reject noise
                if area_km2 > self.max_area_km2:
                    continue # Reject massive low-wind zones
                    
                # Calculate mean backscatter of this specific anomaly
                anomaly_backscatter_db = np.mean(data_db[full_component_mask == 1])
                
                # 8. Shape Analysis (Elongation)
                # A simple proxy: Length / Width of bounding box
                minx, miny, maxx, maxy = geom_shape.bounds
                width = maxx - minx
                height = maxy - miny
                if width == 0 or height == 0:
                    continue
                elongation = max(width/height, height/width)
                shape_score = min(1.0, elongation / 10.0) # Cap at 1.0
                
                # 9. Environmental Context & Heuristic Confidence
                # Base anomaly score (how much darker than the mean ocean)
                # e.g., if anomaly is 5 dB lower than mean, score is high.
                db_diff = mean_ocean_db - anomaly_backscatter_db
                anomaly_score = min(1.0, max(0.0, db_diff / 10.0)) # 10 dB diff = max score
                
                # Wind penalty
                wind_penalty = 0.0
                look_alike_risk = "LOW"
                if wind_speed_kn is not None:
                    if wind_speed_kn < self.low_wind_threshold_kn:
                        wind_penalty = 0.4 # Significant penalty for low wind
                        look_alike_risk = "HIGH"
                    elif wind_speed_kn < 5.0:
                        wind_penalty = 0.1
                        look_alike_risk = "MEDIUM"
                else:
                    wind_penalty = 0.2 # Unknown wind is risky
                    look_alike_risk = "MEDIUM"
                
                confidence_score = (anomaly_score * 0.6) + (shape_score * 0.4) - wind_penalty
                confidence_score = min(1.0, max(0.0, confidence_score)) # Clamp 0-1
                
                # Force high risk if area is very large but confidence survived
                if area_km2 > 50.0 and look_alike_risk == "LOW":
                    look_alike_risk = "MEDIUM"
                
                c_notes = list(processing_notes)
                c_notes.append(f"Area {area_km2:.2f} km2 passed size filters.")
                c_notes.append(f"Elongation ratio proxy: {elongation:.1f}.")
                if wind_speed_kn is not None:
                    c_notes.append(f"Wind context: {wind_speed_kn:.1f} kn applied to look-alike risk assessment.")
                
                candidates.append(SpillCandidate(
                    id=str(uuid.uuid4()),
                    centroid_lat=geom_shape.centroid.y,
                    centroid_lon=geom_shape.centroid.x,
                    area_km2=area_km2,
                    confidence_score=confidence_score,
                    confidence_breakdown={
                        "anomaly_strength": round(anomaly_score * 0.6, 2),
                        "shape_compatibility": round(shape_score * 0.4, 2),
                        "environmental_penalty": -round(wind_penalty, 2)
                    },
                    backscatter_db=anomaly_backscatter_db,
                    polygon=main_polygon,
                    observation_time=observation_time,
                    product_id=product_id,
                    polarization="VV",
                    look_alike_risk=look_alike_risk,
                    processing_notes=c_notes
                ))
                
        # Sort by confidence descending
        candidates.sort(key=lambda x: x.confidence_score, reverse=True)
        return candidates
