"use client";

import { MapContainer, Polyline, TileLayer, CircleMarker, Popup } from "react-leaflet";
import type { LatLngExpression } from "leaflet";
import type { TripPlanResponse } from "@/types/trip";

type RouteMapProps = {
  plan: TripPlanResponse;
};

function buildBounds(points: LatLngExpression[]) {
  return points as [number, number][];
}

export function RouteMap({ plan }: RouteMapProps) {
  const route = plan.recommendation.routePoints.map(
    (point) => [point.lat, point.lon] as LatLngExpression,
  );
  const bounds = buildBounds(route);

  return (
    <MapContainer
      bounds={bounds}
      scrollWheelZoom={false}
      className="h-[320px] w-full rounded-[28px] md:h-[420px]"
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <Polyline positions={route} pathOptions={{ color: "#0d9488", weight: 5 }} />
      <CircleMarker
        center={[plan.origin.lat, plan.origin.lon]}
        radius={10}
        pathOptions={{ color: "#f97316", fillColor: "#fb923c", fillOpacity: 0.95 }}
      >
        <Popup>{plan.origin.name}</Popup>
      </CircleMarker>
      <CircleMarker
        center={[plan.destination.lat, plan.destination.lon]}
        radius={10}
        pathOptions={{ color: "#1d4ed8", fillColor: "#60a5fa", fillOpacity: 0.95 }}
      >
        <Popup>{plan.destination.name}</Popup>
      </CircleMarker>
    </MapContainer>
  );
}
