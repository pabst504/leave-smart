"use client";

import { divIcon, type LatLngExpression, point } from "leaflet";
import { MapContainer, Marker, Polyline, Popup, TileLayer, ZoomControl } from "react-leaflet";
import type { TripPlanResponse } from "@/types/trip";

type RouteMapProps = {
  plan: TripPlanResponse;
  theme: "light" | "dark";
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

export function RouteMap({ plan, theme }: RouteMapProps) {
  const route = plan.recommendation.routePoints.map(
    (point) => [point.lat, point.lon] as LatLngExpression,
  );
  const bounds = buildBounds(route);
  const tileUrl =
    theme === "dark"
      ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
      : "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png";
  const tileAttribution =
    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>';
  const originIcon = buildMarkerIcon("#f97316", "A");
  const destinationIcon = buildMarkerIcon("#0f766e", "B");

  return (
    <MapContainer
      bounds={bounds}
      boundsOptions={{ padding: [36, 36] }}
      scrollWheelZoom
      zoomControl={false}
      className="h-[320px] w-full rounded-[28px] md:h-[420px]"
    >
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
      <Marker position={[plan.origin.lat, plan.origin.lon]} icon={originIcon}>
        <Popup>{plan.origin.name}</Popup>
      </Marker>
      <Marker position={[plan.destination.lat, plan.destination.lon]} icon={destinationIcon}>
        <Popup>{plan.destination.name}</Popup>
      </Marker>
    </MapContainer>
  );
}
