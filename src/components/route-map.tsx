"use client";

import { divIcon, type LatLngExpression, point } from "leaflet";
import { useEffect, useMemo } from "react";
import {
  MapContainer,
  Marker,
  Polyline,
  Popup,
  TileLayer,
  ZoomControl,
  useMap,
} from "react-leaflet";
import type { TripOption, TripPlanResponse, WeatherSnapshot } from "@/types/trip";

type RouteMapProps = {
  plan: TripPlanResponse;
  theme: "light" | "dark";
  selectedSnapshot: WeatherSnapshot | null;
  option: TripOption;
};

function buildBounds(points: LatLngExpression[]) {
  return points as [number, number][];
}

function buildMarkerIcon(color: string, label: string) {
  return divIcon({
    className: "trip-pin-wrapper",
    html: `<div class="trip-pin" style="--pin-color:${color}"><span>${label}</span></div>`,
    iconSize: point(44, 44),
    iconAnchor: point(22, 22),
  });
}

function buildPopupOffset(selectedSnapshot: WeatherSnapshot | null) {
  if (!selectedSnapshot || selectedSnapshot.segment.points.length < 2) {
    return point(0, -36);
  }

  const first = selectedSnapshot.segment.points[0];
  const last =
    selectedSnapshot.segment.points[selectedSnapshot.segment.points.length - 1];
  const latDelta = Math.abs(last.lat - first.lat);
  const lonDelta = Math.abs(last.lon - first.lon);

  if (latDelta > lonDelta) {
    return point(132, -8);
  }

  return point(0, -56);
}

function buildViewportPadding(selectedSnapshot: WeatherSnapshot | null) {
  if (!selectedSnapshot || selectedSnapshot.segment.points.length < 2) {
    return {
      paddingTopLeft: point(56, 56),
      paddingBottomRight: point(56, 56),
      maxZoom: undefined as number | undefined,
    };
  }

  const first = selectedSnapshot.segment.points[0];
  const last =
    selectedSnapshot.segment.points[selectedSnapshot.segment.points.length - 1];
  const latDelta = Math.abs(last.lat - first.lat);
  const lonDelta = Math.abs(last.lon - first.lon);

  if (latDelta > lonDelta) {
    return {
      paddingTopLeft: point(56, 56),
      paddingBottomRight: point(220, 56),
      maxZoom: 7,
    };
  }

  return {
    paddingTopLeft: point(56, 132),
    paddingBottomRight: point(56, 56),
    maxZoom: 7,
  };
}

function MapViewport({
  route,
  selectedSnapshot,
}: {
  route: [number, number][];
  selectedSnapshot: WeatherSnapshot | null;
}) {
  const map = useMap();

  useEffect(() => {
    const targetPoints =
      selectedSnapshot?.segment.points.map((point) => [point.lat, point.lon] as [number, number]) ??
      route;
    const fitPoints = targetPoints.length > 1 ? targetPoints : route;
    const viewportPadding = buildViewportPadding(selectedSnapshot);

    map.fitBounds(fitPoints, {
      paddingTopLeft: viewportPadding.paddingTopLeft,
      paddingBottomRight: viewportPadding.paddingBottomRight,
      maxZoom: viewportPadding.maxZoom,
    });
  }, [map, route, selectedSnapshot]);

  return null;
}

export function RouteMap({ plan, theme, selectedSnapshot, option }: RouteMapProps) {
  const route = useMemo(
    () =>
      option.routePoints.map(
        (point) => [point.lat, point.lon] as [number, number],
      ),
    [option.routePoints],
  );
  const bounds = buildBounds(route as LatLngExpression[]);
  const tileUrl =
    theme === "dark"
      ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
      : "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png";
  const tileAttribution =
    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>';
  const originIcon = buildMarkerIcon("#f97316", "A");
  const destinationIcon = buildMarkerIcon("#0f766e", "B");
  const selectedSegment = useMemo(
    () =>
      selectedSnapshot?.segment.points.map(
        (point) => [point.lat, point.lon] as LatLngExpression,
      ) ?? null,
    [selectedSnapshot],
  );
  const popupOffset = useMemo(
    () => buildPopupOffset(selectedSnapshot),
    [selectedSnapshot],
  );

  return (
    <MapContainer
      bounds={bounds}
      boundsOptions={{ padding: [36, 36] }}
      scrollWheelZoom
      zoomControl={false}
      className="h-[320px] w-full rounded-[28px] md:h-[420px]"
    >
      <MapViewport route={route} selectedSnapshot={selectedSnapshot} />
      <ZoomControl position="bottomright" />
      <TileLayer attribution={tileAttribution} url={tileUrl} />
      <Polyline
        positions={route}
        pathOptions={{
          color: theme === "dark" ? "#e2e8f0" : "#cbd5e1",
          opacity: theme === "dark" ? 0.2 : 0.75,
          weight: 11,
          lineCap: "round",
          lineJoin: "round",
        }}
      />
      <Polyline
        positions={route}
        pathOptions={{
          color: theme === "dark" ? "#2dd4bf" : "#0f766e",
          opacity: 0.95,
          weight: 5,
          lineCap: "round",
          lineJoin: "round",
        }}
      />
      {selectedSegment && selectedSegment.length > 1 ? (
        <Polyline
          positions={selectedSegment}
          pathOptions={{
            color: "#f59e0b",
            opacity: 1,
            weight: 8,
            lineCap: "round",
            lineJoin: "round",
          }}
        />
      ) : null}
      <Marker position={[plan.origin.lat, plan.origin.lon]} icon={originIcon}>
        <Popup>{plan.origin.name}</Popup>
      </Marker>
      <Marker position={[plan.destination.lat, plan.destination.lon]} icon={destinationIcon}>
        <Popup>{plan.destination.name}</Popup>
      </Marker>
      {selectedSnapshot ? (
        <Popup
          position={[
            selectedSnapshot.segment.midpoint.lat,
            selectedSnapshot.segment.midpoint.lon,
          ]}
          offset={popupOffset}
          autoPan={false}
        >
          <div className="space-y-0.5">
            <p className="text-xs font-semibold">{selectedSnapshot.label}</p>
            <p className="text-xs capitalize">
              {selectedSnapshot.condition} · Rain {Math.round(selectedSnapshot.precipitationProbability)}%
            </p>
            <p className="text-xs">
              Wind {Math.round(selectedSnapshot.windSpeed)} mph · Traffic{" "}
              {selectedSnapshot.segment.estimatedTrafficDelayMinutes} min
            </p>
          </div>
        </Popup>
      ) : null}
    </MapContainer>
  );
}
