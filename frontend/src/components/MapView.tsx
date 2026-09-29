import { useState, useMemo, useEffect, useRef } from 'react';
import Map, { Source, Layer, NavigationControl, Marker } from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import CompactLayerManager from './CompactLayerManager';
import CompactMapHUD from './CompactMapHUD';
import type { IncidentContext } from '../contexts/IncidentContext';
import { WAKASHIO_MAP_FEATURES } from '../contexts/IncidentContext';

const ESRI_SATELLITE_STYLE = {
  version: 8,
  sources: {
    'esri-imagery': {
      type: 'raster',
      // Esri World Imagery delivers 256×256 tiles — declaring 128 caused MapLibre
      // to request coarser zoom tiles and stretch them, producing visible blur.
      tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
      tileSize: 256,
      maxzoom: 19,
      attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
    },
    'esri-labels': {
      type: 'raster',
      tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}'],
      tileSize: 256,
      maxzoom: 19
    }
  },
  layers: [
    {
      id: 'satellite-basemap',
      type: 'raster',
      source: 'esri-imagery',
      minzoom: 0,
      maxzoom: 19
    },
    {
      id: 'satellite-labels',
      type: 'raster',
      source: 'esri-labels',
      minzoom: 0,
      maxzoom: 19
    }
  ]
};

interface MapViewProps {
  vessels: any[];
  selectedSpill: any;
  selectedCandidate: any;
  candidates: any[];
  driftDuration: number;
  environment: any;
  isInvestigationMode: boolean;
  currentTimelineTime: number;
  replayLayerStates: any;
  incidentContext?: IncidentContext;
  activeScene?: any;
  dataMode?: string;
  selectedVessel?: any;
  // LIVE-mode vessel selection (MMSI-keyed, explicit user action only)
  selectedMmsi?: string | null;
  flyToRequest?: { lat: number; lon: number; zoom?: number } | null;
  onClearFlyTo?: () => void;
  onOpenEvidenceViewer?: () => void;
  activeView?: string;
  onCloseLayerPanel?: () => void;
}

const MapView = ({
  vessels, selectedSpill, selectedCandidate, candidates, driftDuration, environment,
  isInvestigationMode, currentTimelineTime, replayLayerStates,
  incidentContext, activeScene, dataMode, selectedVessel,
  selectedMmsi, flyToRequest, onClearFlyTo,
  onOpenEvidenceViewer, activeView, onCloseLayerPanel
}: MapViewProps) => {
  const effectiveLayersVisible = (replayLayerStates && isInvestigationMode) ? replayLayerStates : null;
  const mapRef = useRef<any>(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [layersVisible, setLayersVisible] = useState<Record<string, boolean>>({
    satellite: true,
    spill: true,
    tracks: true,
    vessels: true,
    corridor: true,
    forward: true,
    wind: true,
    current: true
  });
  
  const [vesselFilters, setVesselFilters] = useState<Record<string, boolean>>({
    ALL: false, TANKER: true, CARGO: false, CONTAINER: false, PASSENGER: false, UNKNOWN: false
  });
  const [nasaGibsFailed, setNasaGibsFailed] = useState(false);

  const [corridorGeoJson, setCorridorGeoJson] = useState<any>(null);
  const [forwardGeoJson, setForwardGeoJson] = useState<any>(null);

  // Fetch Corridor and Forward Drift from API — only for non-historical modes or when selectedSpill has a real API id
  useEffect(() => {
    if (!selectedSpill) return;
    // For HISTORICAL_INCIDENT, selectedSpill.id may be the Wakashio candidate id — corridor/drift come from the backend correlate response
    // Only fetch if the spill id looks like a real API id (not prefixed HIST)
    const id = selectedSpill?.id;
    if (!id || String(id).startsWith('HIST')) return;

    fetch(`http://localhost:8000/api/spills/${id}/source-corridor?duration_hours=${driftDuration}`)
      .then(res => res.json())
      .then(data => setCorridorGeoJson(data))
      .catch(err => console.warn('Corridor fetch:', err));
      
    fetch(`http://localhost:8000/api/spills/${id}/drift?duration_hours=${driftDuration}`)
      .then(res => res.json())
      .then(data => setForwardGeoJson(data))
      .catch(err => console.warn('Drift fetch:', err));
  }, [selectedSpill, driftDuration]);

  // ── Spill GeoJSON ──────────────────────────────────────────────────────────
  const spillGeoJson = useMemo(() => {
    if (dataMode === 'HISTORICAL_INCIDENT' && (effectiveLayersVisible?.showSpill ?? true)) {
      // Use Wakashio's canonical spill polygon
      return {
        type: 'FeatureCollection',
        features: [{
          type: 'Feature',
          geometry: WAKASHIO_MAP_FEATURES.spillPolygon,
          properties: { id: 'wakashio-spill' }
        }]
      };
    }
    if (!selectedSpill?.geometry) return null;
    return {
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        geometry: selectedSpill.geometry,
        properties: { id: selectedSpill.id }
      }]
    };
  }, [selectedSpill, dataMode, effectiveLayersVisible]);

  // ── Wakashio Grounding Circle ──────────────────────────────────────────────
  const groundingCircleGeoJson = useMemo(() => {
    if (dataMode !== 'HISTORICAL_INCIDENT') return null;
    const [lon, lat] = WAKASHIO_MAP_FEATURES.groundingPoint;
    return {
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [lon, lat] },
        properties: { label: 'MV WAKASHIO GROUNDING' }
      }]
    };
  }, [dataMode]);

  // ── Candidates GeoJSON ─────────────────────────────────────────────────────
  const candidatesGeoJson = useMemo(() => {
    if (!candidates || candidates.length === 0) return null;
    return {
      type: 'FeatureCollection',
      features: candidates.map((c: any) => ({
        type: 'Feature',
        geometry: {
          type: 'Polygon',
          coordinates: (c.footprint && c.footprint.length > 0) ? c.footprint :
                       (c.polygon && c.polygon.length > 0) ? c.polygon : 
                       [[
                         [c.centroid_lon - 0.05, c.centroid_lat - 0.05],
                         [c.centroid_lon + 0.05, c.centroid_lat - 0.05],
                         [c.centroid_lon + 0.05, c.centroid_lat + 0.05],
                         [c.centroid_lon - 0.05, c.centroid_lat + 0.05],
                         [c.centroid_lon - 0.05, c.centroid_lat - 0.05]
                       ]]
        },
        properties: { 
          id: c.id,
          confidence: c.confidence_score,
          isSelected: selectedCandidate?.id === c.id
        }
      }))
    };
  }, [candidates, selectedCandidate]);

  // ── Vessel Tracks GeoJSON ──────────────────────────────────────────────────
  const tracksGeoJson = useMemo(() => {
    if (!vessels) return null;
    const filteredVessels = vessels.filter((v: any) => {
      if (vesselFilters['ALL']) return true;
      // Use vessel_type (normalized WebSocket field) with fallback to legacy v.type
      const type = (v.vessel_type || v.type || 'UNKNOWN').toUpperCase();
      if (type.includes('TANKER') && vesselFilters['TANKER']) return true;
      if (type.includes('CARGO') && vesselFilters['CARGO']) return true;
      if (type.includes('CONTAINER') && vesselFilters['CONTAINER']) return true;
      if (type.includes('PASSENGER') && vesselFilters['PASSENGER']) return true;
      if (type === 'UNKNOWN' && vesselFilters['UNKNOWN']) return true;
      return false;
    });

    const features = filteredVessels.filter((v: any) => v.positions && v.positions.length > 0).map((v: any) => {
      let sortedPos = [...v.positions].sort((a: any, b: any) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
      
      if (isInvestigationMode && currentTimelineTime) {
         sortedPos = sortedPos.filter((p: any) => new Date(p.timestamp).getTime() <= currentTimelineTime);
      }
      
      return {
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: sortedPos.map((p: any) => [p.longitude, p.latitude])
        },
        properties: {
          id: v.id,
          mmsi: v.mmsi,
          name: v.name,
          // In LIVE mode, selection is by MMSI; in other modes by vessel id
          isSelected: selectedMmsi
            ? v.mmsi === selectedMmsi
            : (selectedCandidate?.vessel_id === v.id || selectedVessel?.id === v.id),
          isCandidate: candidates?.some((c: any) => c.vessel_id === v.id)
        }
      };
    });
    return { type: 'FeatureCollection', features };
  }, [vessels, selectedCandidate, candidates, isInvestigationMode, currentTimelineTime, vesselFilters]);



  const currentPositionsGeoJson = useMemo(() => {
    if (!vessels) return null;
    // In LIVE mode, always show the latest position if not in investigation mode.
    // If in investigation mode, show interpolated position based on timeline.
    const filteredVessels = vessels.filter((v: any) => {
      if (vesselFilters['ALL']) return true;
      // Use vessel_type (normalized WebSocket field) with fallback to legacy v.type
      const type = (v.vessel_type || v.type || 'UNKNOWN').toUpperCase();
      if (type.includes('TANKER') && vesselFilters['TANKER']) return true;
      if (type.includes('CARGO') && vesselFilters['CARGO']) return true;
      if (type.includes('CONTAINER') && vesselFilters['CONTAINER']) return true;
      if (type.includes('PASSENGER') && vesselFilters['PASSENGER']) return true;
      if (type === 'UNKNOWN' && vesselFilters['UNKNOWN']) return true;
      return false;
    });

    const features: any[] = [];
    filteredVessels.forEach((v: any) => {
      if (!v.positions || v.positions.length === 0) return;
      const sorted = [...v.positions].sort((a: any, b: any) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
      
      let pos: any = null;
      for (let i = sorted.length - 1; i >= 0; i--) {
         const t = new Date(sorted[i].timestamp).getTime();
         if (t <= currentTimelineTime) {
            pos = sorted[i];
            break;
         }
      }
      
      // If we're not in investigation mode (i.e. LIVE), just show the latest position
      if (!isInvestigationMode || !currentTimelineTime) {
        pos = sorted[sorted.length - 1];
      }
      
      if (pos) {
        features.push({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [pos.longitude, pos.latitude] },
          properties: {
            id: v.id,
            mmsi: v.mmsi,
            name: v.name,
            vessel_type: v.vessel_type,
            heading: pos.heading !== null && pos.heading !== undefined ? pos.heading : pos.course,
            isSelected: selectedMmsi
              ? v.mmsi === selectedMmsi
              : (selectedCandidate?.vessel_id === v.id || selectedVessel?.id === v.id),
          }
        });
      }
    });
    
    return { type: 'FeatureCollection', features };
  }, [vessels, isInvestigationMode, currentTimelineTime, selectedCandidate, vesselFilters]);

  // ── Reset GIBS failure flag on mode change ────────────────────────────────
  // Prevents a historical GIBS 404 from causing a blank map after returning to LIVE.
  useEffect(() => {
    setNasaGibsFailed(false);
  }, [dataMode]);

  // ── Camera Transitions ─────────────────────────────────────────────────────
  const prevIncidentId = useRef<string | null>(null);
  useEffect(() => {
    if (!incidentContext || !mapRef.current || !mapLoaded) return;
    if (prevIncidentId.current === incidentContext.incidentId) return;
    prevIncidentId.current = incidentContext.incidentId;
    mapRef.current.flyTo({
      center: incidentContext.center,
      zoom: incidentContext.defaultZoom,
      duration: 2000
    });
  }, [incidentContext, mapLoaded]);

  // ── LIVE explicit user-selected vessel fly-to ──────────────────────────────
  // flyToRequest is set ONLY by explicit user clicks (vessel list, search, map marker click).
  // AIS position updates NEVER modify flyToRequest → camera stays where user left it.
  const prevFlyToRef = useRef<string>('');
  useEffect(() => {
    if (!flyToRequest || !mapRef.current || !mapLoaded) return;
    const key = `${flyToRequest.lat},${flyToRequest.lon}`;
    if (prevFlyToRef.current === key) return; // dedupe identical requests
    prevFlyToRef.current = key;
    mapRef.current.flyTo({
      center: [flyToRequest.lon, flyToRequest.lat],
      zoom: flyToRequest.zoom ?? 11,
      duration: 1500,
      essential: true,
    });
    onClearFlyTo?.();
  }, [flyToRequest, mapLoaded, onClearFlyTo]);

  const prevCandidateId = useRef<string | null>(null);
  const prevSpillId = useRef<string | null>(null);

  useEffect(() => {
    if (!mapRef.current || !mapLoaded) return;
    if (selectedCandidate && dataMode !== 'LIVE') {
      if (prevCandidateId.current !== selectedCandidate.vessel_id) {
        const v = vessels.find(v => v.id === selectedCandidate.vessel_id);
        if (v?.positions?.length > 0) {
          prevCandidateId.current = selectedCandidate.vessel_id;
          const last = v.positions[v.positions.length - 1];
          mapRef.current.flyTo({ center: [last.longitude, last.latitude], zoom: 11, duration: 1500 });
        }
      }
    } else if (selectedSpill && !incidentContext) {
      if (prevSpillId.current !== selectedSpill.id) {
        prevSpillId.current = selectedSpill.id;
        mapRef.current.flyTo({ center: [selectedSpill.longitude, selectedSpill.latitude], zoom: 9, duration: 1500 });
      }
    }
  }, [selectedCandidate, selectedSpill, vessels, incidentContext, mapLoaded, dataMode]);

  // Wakashio AOI GeoJSON
  const wakashioAoiGeoJson = useMemo(() => {
    if (dataMode !== 'HISTORICAL_INCIDENT') return null;
    const [west, south, east, north] = WAKASHIO_MAP_FEATURES.spillRegionBbox;
    return {
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        properties: {},
        geometry: {
          type: 'Polygon',
          coordinates: [[
            [west, south],
            [east, south],
            [east, north],
            [west, north],
            [west, south]
          ]]
        }
      }]
    };
  }, [dataMode]);

  // Environment Vectors GeoJSON
  const environmentGeoJson = useMemo(() => {
    if (!environment || !(effectiveLayersVisible?.showEnvironment ?? true)) return null;
    const center = selectedSpill ? [selectedSpill.longitude, selectedSpill.latitude] : incidentContext?.center || [57.75, -20.45];
    const windDir = environment.wind?.direction ?? environment.wind_direction;
    const windSpd = environment.wind?.speed_knots ?? environment.wind_speed;
    const currDir = environment.current?.direction ?? environment.current_direction;
    const currSpd = environment.current?.speed_ms ?? environment.current_speed;
    
    return {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [center[0] + 0.08, center[1] + 0.05] },
          properties: { label: `WIND ${windSpd?.toFixed(1)}kn @ ${windDir}°`, icon: 'wind', rotation: windDir }
        },
        {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [center[0] - 0.08, center[1] - 0.05] },
          properties: { label: `CURRENT ${currSpd?.toFixed(2)}m/s @ ${currDir}°`, icon: 'current', rotation: currDir }
        }
      ]
    };
  }, [environment, effectiveLayersVisible, selectedSpill, incidentContext]);

  // Satellite Footprint GeoJSON
  const satelliteFootprintGeoJson = useMemo(() => {
    if (!activeScene) return null;
    return {
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        properties: { id: activeScene.id, provenance: activeScene.provenance },
        geometry: {
          type: 'Polygon',
          coordinates: [[
            [activeScene.bbox[0], activeScene.bbox[1]],
            [activeScene.bbox[2], activeScene.bbox[1]],
            [activeScene.bbox[2], activeScene.bbox[3]],
            [activeScene.bbox[0], activeScene.bbox[3]],
            [activeScene.bbox[0], activeScene.bbox[1]]
          ]]
        }
      }]
    };
  }, [activeScene]);

  // ── Whether to show Wakashio-specific layers ───────────────────────────────
  const isHistorical = dataMode === 'HISTORICAL_INCIDENT';
  const wakashioEventTime = (event_type: string) => {
    if (!isHistorical || !incidentContext?.timeline) return Infinity;
    const evt = incidentContext.timeline.find(e => e.event_type === event_type);
    return evt ? new Date(evt.timestamp).getTime() : Infinity;
  };
  
  const showGrounding = isHistorical && (currentTimelineTime >= wakashioEventTime('GROUNDING'));
  const showSpillLayer = isHistorical ? (currentTimelineTime >= wakashioEventTime('SPILL_START')) : (layersVisible.spill && (effectiveLayersVisible ? effectiveLayersVisible.showSpill : true));
  const showSatelliteLayer = layersVisible.satellite && (effectiveLayersVisible ? effectiveLayersVisible.showSatellite : true);

return (
    <div className="relative w-full h-full bg-[#03080c]">
      <Map
        ref={mapRef}
        // LIVE mode: English Channel operational fallback (50.5°N, -2.5°W, z=7)
        // This is a temporary fallback — future: derive from AIS bounding-box snapshot.
        // Non-LIVE: use incidentContext center or global default.
        initialViewState={{
          longitude: dataMode === 'LIVE' ? -2.5 : (incidentContext?.center[0] ?? (dataMode === 'HISTORICAL_INCIDENT' ? 57.75 : 0)),
          latitude:  dataMode === 'LIVE' ? 50.5 : (incidentContext?.center[1] ?? (dataMode === 'HISTORICAL_INCIDENT' ? -20.45 : 20)),
          zoom:      dataMode === 'LIVE' ? 7    : (incidentContext?.defaultZoom ?? (dataMode === 'HISTORICAL_INCIDENT' ? 10 : 4))
        }}
        mapStyle={ESRI_SATELLITE_STYLE as any}
        interactiveLayerIds={['vessel-tracks', 'spill-polygon', 'wakashio-grounding-halo', 'vessel-positions']}
        onLoad={() => setMapLoaded(true)}
        onClick={(e) => {
          if (e.features && e.features.length > 0) {
            const feature = e.features.find(
              f => f.layer.id === 'vessel-positions' || f.layer.id === 'vessel-tracks'
            );
            if (feature && feature.properties) {
              // Forward both id and mmsi — LIVE mode uses mmsi as authoritative identifier
              const event = new CustomEvent('selectVessel', {
                detail: {
                  id: feature.properties.id,
                  mmsi: feature.properties.mmsi ?? null,
                }
              });
              window.dispatchEvent(event);
            }
          }
        }}
        onError={(e: any) => {
          if (e.error?.message?.includes('nasa-gibs-modis') || e.sourceId === 'nasa-gibs-modis') {
            setNasaGibsFailed(true);
          }
        }}
      >
        <NavigationControl position="top-right" />

        {/* ── INCIDENT AOI ──────────────────────────────────────────────────── */}
        {wakashioAoiGeoJson && (
          <Source id="wakashio-aoi" type="geojson" data={wakashioAoiGeoJson}>
            <Layer
              id="wakashio-aoi-fill"
              type="fill"
              paint={{ 'fill-color': '#AAB8C5', 'fill-opacity': 0.05 }}
            />
            <Layer
              id="wakashio-aoi-line"
              type="line"
              paint={{ 'line-color': '#AAB8C5', 'line-width': 1, 'line-dasharray': [4, 4], 'line-opacity': 0.5 }}
            />
          </Source>
        )}

        {/* ── NASA GIBS REAL SATELLITE LAYER (HISTORICAL MODE ONLY) ─────────────────── */}
        {/* This is real satellite imagery of Mauritius during the oil spill */}
        {isHistorical && layersVisible.satellite && !nasaGibsFailed && (
          <Source
            key={`gibs-${activeScene ? activeScene.id : 'default'}`}
            id="nasa-gibs-modis"
            type="raster"
            tiles={[
              `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/MODIS_Terra_CorrectedReflectance_TrueColor/default/${activeScene ? activeScene.acquisition_time.split('T')[0] : '2020-08-11'}/GoogleMapsCompatible/{z}/{y}/{x}.jpg`
            ]}
            tileSize={256}
            attribution={`NASA GIBS / Terra MODIS — ${activeScene ? activeScene.acquisition_time.split('T')[0] : '2020-08-11'}`}
          >
            <Layer
              id="nasa-gibs-layer"
              type="raster"
              paint={{ 'raster-opacity': 0.75 }}
              source-layer="nasa-gibs-modis" // This triggers MapLibre's internal error handler appropriately
            />
          </Source>
        )}
        
        {/* We use an invisible layer to detect NASA GIBS load errors */}
        {isHistorical && layersVisible.satellite && !nasaGibsFailed && (
          <Source id="nasa-gibs-fallback-detector" type="image" url="invalid-gibs-fallback" coordinates={[[0,0],[0,0],[0,0],[0,0]]}>
            <Layer id="nasa-gibs-detector" type="raster" paint={{ 'raster-opacity': 0 }} />
          </Source>
        )}

        {/* ── SATELLITE OBSERVATION FOOTPRINT (vector only — NO raster on map) ───── */}
        {/* Uses stable source IDs to prevent MapLibre blank-screen crash on scene change */}
        {showSatelliteLayer && activeScene && satelliteFootprintGeoJson && (
          <Source id="active-sat-footprint" type="geojson" data={satelliteFootprintGeoJson}>
            <Layer
              id="active-sat-footprint-fill"
              type="fill"
              paint={{
                'fill-color': activeScene.provenance === 'REAL_HISTORICAL' ? '#34D399' : '#F59E0B',
                'fill-opacity': 0.06
              }}
            />
            <Layer
              id="active-sat-footprint-line"
              type="line"
              paint={{
                'line-color': activeScene.provenance === 'REAL_HISTORICAL' ? '#34D399' : '#F59E0B',
                'line-width': 2,
                'line-dasharray': [4, 3]
              }}
            />
          </Source>
        )}

        {/* Footprint center marker — opens Evidence Viewer */}
        {showSatelliteLayer && activeScene && (
          <Marker
            longitude={(activeScene.bbox[0] + activeScene.bbox[2]) / 2}
            latitude={(activeScene.bbox[1] + activeScene.bbox[3]) / 2}
            anchor="center"
          >
            <div
              onClick={onOpenEvidenceViewer}
              className={`flex flex-col items-center justify-center px-3 py-2 rounded backdrop-blur-md border transition-all cursor-pointer hover:scale-105 ${
                activeScene.provenance === 'REAL_HISTORICAL'
                  ? 'bg-[#071018]/80 border-[#34D399]/50'
                  : 'bg-[#071018]/80 border-[#F59E0B]/50'
              }`}
            >
              <div className={`text-[10px] font-mono uppercase tracking-widest font-bold ${
                activeScene.provenance === 'REAL_HISTORICAL' ? 'text-[#34D399]' : 'text-[#F59E0B]'
              }`}>
                {activeScene.satellite} OBS FOOTPRINT
              </div>
              <div className="text-[9px] text-marine-muted mt-0.5 uppercase font-mono">
                {new Date(activeScene.acquisition_time).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
              </div>
              <div className={`mt-1.5 text-[8px] px-2 py-0.5 rounded uppercase border font-bold tracking-wider ${
                activeScene.provenance === 'REAL_HISTORICAL'
                  ? 'bg-[#34D399]/10 border-[#34D399]/30 text-[#34D399]'
                  : 'bg-[#F59E0B]/10 border-[#F59E0B]/30 text-[#F59E0B]'
              }`}>
                VIEWING IN PANEL →
              </div>
            </div>
          </Marker>
        )}

        {/* ── DEMO_REPLAY OR SCANNED CANDIDATES ─────────────────────────────── */}
        {!isInvestigationMode && candidatesGeoJson && (
          <Source id="candidates" type="geojson" data={candidatesGeoJson}>
            <Layer
              id="candidates-fill"
              type="fill"
              paint={{
                'fill-color': ['case', ['boolean', ['get', 'isSelected'], false], '#38BDF8', '#6F8292'],
                'fill-opacity': ['case', ['boolean', ['get', 'isSelected'], false], 0.2, 0.05]
              }}
            />
            <Layer
              id="candidates-line"
              type="line"
              paint={{
                'line-color': ['case', ['boolean', ['get', 'isSelected'], false], '#38BDF8', '#6F8292'],
                'line-width': ['case', ['boolean', ['get', 'isSelected'], false], 2, 1],
                'line-dasharray': [2, 2]
              }}
            />
          </Source>
        )}



        {/* ── WAKASHIO GROUNDING LOCATION ──────────────────────────────────── */}
        {showGrounding && groundingCircleGeoJson && (
          <>
            <Source id="wakashio-grounding" type="geojson" data={groundingCircleGeoJson}>
              {/* Pulsing halo */}
              <Layer
                id="wakashio-grounding-halo"
                type="circle"
                paint={{
                  'circle-radius': 28,
                  'circle-color': 'transparent',
                  'circle-stroke-color': '#ef4444',
                  'circle-stroke-width': 2,
                  'circle-opacity': 0.0,
                  'circle-stroke-opacity': 0.6,
                }}
              />
              {/* Inner marker */}
              <Layer
                id="wakashio-grounding-dot"
                type="circle"
                paint={{
                  'circle-radius': 10,
                  'circle-color': '#ef4444',
                  'circle-stroke-color': '#ffffff',
                  'circle-stroke-width': 2,
                  'circle-opacity': 0.9,
                }}
              />
            </Source>
            {/* DOM marker for label */}
            <Marker longitude={WAKASHIO_MAP_FEATURES.groundingPoint[0]} latitude={WAKASHIO_MAP_FEATURES.groundingPoint[1]} anchor="bottom">
              <div className="flex flex-col items-center pointer-events-none">
                <div className="bg-[#ef4444]/90 text-white text-[9px] font-bold tracking-widest uppercase px-2 py-0.5 rounded shadow-lg whitespace-nowrap border border-red-300/30 mb-1">
                  ▲ GROUNDING SITE
                </div>
              </div>
            </Marker>
          </>
        )}

        {/* ── SPILL POLYGON ─────────────────────────────────────────────────── */}
        {showSpillLayer && spillGeoJson && (
          <Source id="spill" type="geojson" data={spillGeoJson}>
            <Layer
              id="spill-polygon"
              type="fill"
              paint={{
                'fill-color': isHistorical ? '#F59E0B' : '#EF4444',
                'fill-opacity': 0.25,
              }}
            />
            <Layer
              id="spill-outline"
              type="line"
              paint={{
                'line-color': isHistorical ? '#F59E0B' : '#EF4444',
                'line-width': 1,
                'line-dasharray': isHistorical ? [3, 2] : undefined,
              }}
            />
          </Source>
        )}

        {/* ── SOURCE CORRIDOR ───────────────────────────────────────────────── */}
        {layersVisible.corridor && corridorGeoJson && (effectiveLayersVisible ? effectiveLayersVisible.showCorridor : true) && (
          <Source id="corridor" type="geojson" data={corridorGeoJson}>
            {/* Uncertainty Cone / Fill */}
            <Layer id="corridor-fill" type="fill" paint={{ 'fill-color': '#06b6d4', 'fill-opacity': 0.15 }} />
            {/* Outline */}
            <Layer id="corridor-line" type="line" paint={{ 'line-color': '#06b6d4', 'line-width': 1, 'line-dasharray': [2, 2], 'line-opacity': 0.5 }} />
            {/* Centerline (if available in the geojson, fallback to outline if not) */}
          </Source>
        )}

        {/* ── FORWARD DRIFT ─────────────────────────────────────────────────── */}
        {layersVisible.forward && forwardGeoJson && (
          <Source id="forward" type="geojson" data={forwardGeoJson}>
            <Layer id="forward-line" type="line" paint={{ 'line-color': '#ff0000', 'line-width': 2, 'line-dasharray': [2, 2] }} />
          </Source>
        )}

        {/* ── VESSEL TRACKS ─────────────────────────────────────────────────── */}
        {layersVisible.tracks && tracksGeoJson && (
          <Source id="tracks" type="geojson" data={tracksGeoJson}>
            <Layer
              id="vessel-tracks-bg"
              type="line"
              paint={{
                'line-color': ['case', ['boolean', ['get', 'isSelected'], false], '#ffffff', '#101C26'],
                'line-width': ['case', ['boolean', ['get', 'isSelected'], false], 4, 2],
                'line-opacity': ['case', ['boolean', ['get', 'isSelected'], false], 1, 0.4],
                'line-dasharray': dataMode === 'HISTORICAL_INCIDENT' ? [2, 2] : [1]
              }}
            />
            <Layer
              id="vessel-tracks"
              type="line"
              paint={{
                'line-color': ['case', ['boolean', ['get', 'isSelected'], false], '#38BDF8', '#6F8292'],
                'line-width': ['case', ['boolean', ['get', 'isSelected'], false], 2, 1],
                'line-opacity': ['case', ['boolean', ['get', 'isSelected'], false], 1, 0.6],
                'line-dasharray': dataMode === 'HISTORICAL_INCIDENT' ? [2, 2] : [1]
              }}
            />
          </Source>
        )}

        {/* ── CURRENT VESSEL POSITIONS ──────────────────────────────────────── */}
        {layersVisible.tracks && currentPositionsGeoJson && (
          <>
            {/* vessel-positions: invisible MapLibre circle = clickable hit target
                registered in interactiveLayerIds — enables onClick feature detection */}
            <Source id="current-positions" type="geojson" data={currentPositionsGeoJson}>
              <Layer
                id="vessel-positions"
                type="circle"
                paint={{
                  'circle-radius': 18,
                  'circle-opacity': 0,
                  'circle-stroke-width': 0,
                }}
              />
            </Source>

            {/* DOM Markers for Vessels — SVG triangle, heading-aware, clickable */}
            {currentPositionsGeoJson.features.map((f: any) => {
              const p = f.properties;
              const isSelected = p.isSelected;
              const color = isSelected ? '#38BDF8' : '#e5f0ff';
              const glowColor = isSelected ? 'rgba(56,189,248,0.55)' : 'rgba(100,160,220,0.25)';
              return (
                <Marker
                  key={`vessel-pos-${p.id}`}
                  longitude={f.geometry.coordinates[0]}
                  latitude={f.geometry.coordinates[1]}
                  anchor="center"
                  style={{ zIndex: isSelected ? 20 : 10, cursor: 'pointer' }}
                  onClick={() => {
                    // Direct click on DOM marker — dispatch selectVessel with both id + mmsi
                    const evt = new CustomEvent('selectVessel', {
                      detail: { id: p.id, mmsi: p.mmsi ?? null }
                    });
                    window.dispatchEvent(evt);
                  }}
                >
                  <div className="flex flex-col items-center" style={{ pointerEvents: 'none' }}>
                    {/* Outer halo — always visible, stronger when selected */}
                    <div
                      style={{
                        position: 'absolute',
                        width: isSelected ? 32 : 22,
                        height: isSelected ? 32 : 22,
                        borderRadius: '50%',
                        background: glowColor,
                        filter: 'blur(4px)',
                        transform: 'translate(-50%, -50%)',
                        top: '50%',
                        left: '50%',
                        pointerEvents: 'none',
                      }}
                    />
                    {/* Triangle vessel marker */}
                    <div
                      className="transition-transform duration-500 ease-linear"
                      style={{
                        transform: `rotate(${p.heading || 0}deg)`,
                        color: color,
                        filter: isSelected
                          ? 'drop-shadow(0 0 5px #38BDF8) drop-shadow(0 0 2px #000)'
                          : 'drop-shadow(0 0 2px #000a14)',
                        position: 'relative',
                        zIndex: 1,
                      }}
                    >
                      <svg width="18" height="26" viewBox="0 0 14 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M7 0L14 16L7 13L0 16L7 0Z" fill="currentColor" stroke="#000814" strokeWidth="1.2" strokeLinejoin="round"/>
                      </svg>
                    </div>
                    {/* Selected: vessel name label */}
                    {isSelected && (
                      <div className="mt-1 text-[8px] font-mono tracking-widest text-[#38BDF8] bg-[#071018]/95 px-1.5 py-0.5 rounded border border-[#38BDF8]/40 whitespace-nowrap shadow-lg">
                        {p.name || p.mmsi || 'UNKNOWN'}
                      </div>
                    )}
                  </div>
                </Marker>
              );
            })}

            {/* SIMULATED VESSEL STAND-IN Label for Historical Mode */}
            {dataMode === 'HISTORICAL_INCIDENT' && currentPositionsGeoJson.features.map((f: any, index: number) => (
              <Marker key={`vessel-lbl-${index}`} longitude={f.geometry.coordinates[0]} latitude={f.geometry.coordinates[1]} anchor="left">
                <div className="ml-3 flex flex-col pointer-events-none">
                  <div className="text-[9px] font-bold tracking-widest uppercase text-[#F59E0B] bg-[#0a131c]/80 px-1.5 py-0.5 rounded border border-[#F59E0B]/30">
                    SIMULATED VESSEL
                  </div>
                  <div className="text-[8px] font-mono text-marine-muted mt-0.5">STAND-IN DATA</div>
                </div>
              </Marker>
            ))}
          </>
        )}


        {/* ── ENVIRONMENT VECTORS ───────────────────────────────────────────── */}
        {environmentGeoJson && layersVisible.wind && (
          <>
            <Source id="environment-vectors" type="geojson" data={environmentGeoJson}>
              <Layer
                id="environment-labels"
                type="symbol"
                layout={{
                  'text-field': ['get', 'label'],
                  'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
                  'text-size': 10,
                  'text-offset': [0, 1.5],
                  'text-anchor': 'top',
                }}
                paint={{
                  'text-color': '#38BDF8',
                  'text-halo-color': '#071018',
                  'text-halo-width': 2
                }}
              />
            </Source>
            
            {/* Draw simple DOM markers for the arrows so they can animate/rotate easily */}
            {environmentGeoJson.features.map((f: any, i: number) => (
              <Marker key={`env-vec-${i}`} longitude={f.geometry.coordinates[0]} latitude={f.geometry.coordinates[1]} anchor="center">
                <div 
                  className="w-12 flex justify-center text-marine-blue pointer-events-none opacity-70"
                  style={{ transform: `rotate(${f.properties.rotation}deg)` }}
                >
                  <span className="text-xl leading-none">→</span>
                </div>
              </Marker>
            ))}
          </>
        )}
      </Map>

        <CompactLayerManager
          layersVisible={layersVisible}
          setLayersVisible={setLayersVisible}
          vesselFilters={vesselFilters}
          setVesselFilters={setVesselFilters}
          dataMode={dataMode || ''}
          isOpen={activeView === 'layers'}
          onClose={() => onCloseLayerPanel && onCloseLayerPanel()}
        />
      <CompactMapHUD dataMode={dataMode || 'LIVE'} activeScene={activeScene ?? null} />

      {/* ── MAP LEGEND ────────────────────────────────────────────────────────── */}
      <div className="absolute bottom-6 right-6 bg-marine-panel/90 backdrop-blur border border-marine-border p-3 rounded text-[10px] space-y-2 text-marine-text shadow-xl z-10 font-mono tracking-wide">
        {isHistorical ? (
          <>
            <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full border-2 border-marine-red"></div><span>GROUNDING SITE</span></div>
            <div className="flex items-center gap-2"><div className="w-3 h-3 bg-marine-amber/30 border border-marine-amber"></div><span>SPILL REGION</span></div>
            <div className="flex items-center gap-2"><div className="w-3 h-3 border border-marine-blue border-dashed bg-marine-blue/20"></div><span>SOURCE CORRIDOR</span></div>
            <div className="flex items-center gap-2"><div className="w-3 h-0.5 bg-marine-tertiary"></div><span>SIMULATED AIS STAND-IN</span></div>
          </>
        ) : (
          <>
            <div className="flex items-center gap-2"><div className="w-3 h-3 bg-marine-red/30 border border-marine-red"></div><span>OBSERVED SPILL</span></div>
            <div className="flex items-center gap-2"><div className="w-3 h-0.5 bg-marine-red"></div><span>FORWARD DRIFT</span></div>
            <div className="flex items-center gap-2"><div className="w-3 h-3 border border-marine-amber border-dashed bg-marine-amber/20"></div><span>SOURCE CORRIDOR</span></div>
            <div className="flex items-center gap-2"><div className="w-3 h-0.5 bg-marine-blue"></div><span>VESSEL TRACK</span></div>
          </>
        )}
      </div>
    </div>
  );
};

export default MapView;
