export type LocationPoint = {
  lat: number;
  lon: number;
  name: string;
};

export type RoutePoint = {
  lat: number;
  lon: number;
};

export type RouteSegment = {
  startIndex: number;
  endIndex: number;
  points: RoutePoint[];
  midpoint: RoutePoint;
  estimatedTrafficDelayMinutes: number;
  estimatedTypicalTrafficDelayMinutes: number;
};

export type PlanTripRequest = {
  origin: string;
  destination: string;
  date: string;
  earliestDeparture: string;
  latestDeparture: string;
  timeZone: string;
};

export type WeatherSnapshot = {
  label: string;
  timeIso: string;
  weatherCode: number;
  condition: string;
  precipitationProbability: number;
  precipitation: number;
  windSpeed: number;
  riskScore: number;
  segment: RouteSegment;
};

export type TripOption = {
  departureIso: string;
  departureLabel: string;
  arrivalIso: string;
  arrivalLabel: string;
  score: number;
  trafficDelayMinutes: number;
  typicalTrafficDelayMinutes: number;
  travelMinutes: number;
  distanceMiles: number;
  routePoints: RoutePoint[];
  weatherSnapshots: WeatherSnapshot[];
  reasons: string[];
};

export type TripPlanResponse = {
  timeZone: string;
  origin: LocationPoint;
  destination: LocationPoint;
  recommendation: TripOption;
  alternatives: TripOption[];
};
