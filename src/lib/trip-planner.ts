import { DateTime } from "luxon";
import type {
  LocationPoint,
  PlanTripRequest,
  RoutePoint,
  TripOption,
  TripPlanResponse,
  WeatherSnapshot,
} from "@/types/trip";

const TOMTOM_SEARCH_URL = "https://api.tomtom.com/search/2/search";
const TOMTOM_ROUTE_URL = "https://api.tomtom.com/routing/1/calculateRoute";
const OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast";

type TomTomSearchResult = {
  results?: Array<{
    address?: { freeformAddress?: string };
    position?: { lat?: number; lon?: number };
  }>;
};

type TomTomRouteResult = {
  routes?: Array<{
    summary?: {
      lengthInMeters?: number;
      travelTimeInSeconds?: number;
      noTrafficTravelTimeInSeconds?: number;
      historicTrafficTravelTimeInSeconds?: number;
      trafficDelayInSeconds?: number;
      departureTime?: string;
      arrivalTime?: string;
    };
    legs?: Array<{
      points?: Array<{ latitude?: number; longitude?: number }>;
    }>;
  }>;
};

type OpenMeteoResult = {
  hourly?: {
    time?: string[];
    weather_code?: number[];
    precipitation_probability?: number[];
    precipitation?: number[];
    wind_speed_10m?: number[];
  };
};

type WeatherCache = Map<string, Promise<OpenMeteoResult>>;

function requireTomTomKey() {
  const key = process.env.TOMTOM_API_KEY;

  if (!key) {
    throw new Error("Missing TOMTOM_API_KEY environment variable.");
  }

  return key;
}

function buildDepartureCandidates(request: PlanTripRequest) {
  const start = DateTime.fromISO(
    `${request.date}T${request.earliestDeparture}`,
    { zone: request.timeZone },
  );
  const end = DateTime.fromISO(
    `${request.date}T${request.latestDeparture}`,
    { zone: request.timeZone },
  );

  if (!start.isValid || !end.isValid) {
    throw new Error("Invalid departure window.");
  }

  if (end < start) {
    throw new Error("Latest departure must be after earliest departure.");
  }

  const candidates: DateTime[] = [];
  let cursor = start.startOf("minute");

  while (cursor <= end) {
    candidates.push(cursor);
    cursor = cursor.plus({ minutes: 30 });
  }

  if (candidates.at(-1)?.toISO() !== end.toISO()) {
    candidates.push(end);
  }

  if (candidates.length <= 6) {
    return candidates;
  }

  const first = candidates[0];
  const last = candidates[candidates.length - 1];
  const middleIndexes = [Math.floor(candidates.length / 4), Math.floor(candidates.length / 2), Math.floor((candidates.length * 3) / 4)];
  const reduced = [first, ...middleIndexes.map((index) => candidates[index]), last];

  return reduced.filter((candidate, index, list) => {
    return list.findIndex((entry) => entry.toISO() === candidate.toISO()) === index;
  });
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  mapper: (item: T, index: number) => Promise<R>,
) {
  const results: R[] = [];

  for (let index = 0; index < items.length; index += limit) {
    const chunk = items.slice(index, index + limit);
    const chunkResults = await Promise.all(
      chunk.map((item, chunkIndex) => mapper(item, index + chunkIndex)),
    );

    results.push(...chunkResults);

    if (index + limit < items.length) {
      await sleep(350);
    }
  }

  return results;
}

async function fetchJson<T>(url: string) {
  const response = await fetch(url, {
    headers: {
      accept: "application/json",
    },
    next: { revalidate: 0 },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Request failed (${response.status}): ${text}`);
  }

  return (await response.json()) as T;
}

async function geocodePlace(query: string, tomtomKey: string): Promise<LocationPoint> {
  const url = new URL(`${TOMTOM_SEARCH_URL}/${encodeURIComponent(query)}.json`);
  url.searchParams.set("key", tomtomKey);
  url.searchParams.set("limit", "1");

  const data = await fetchJson<TomTomSearchResult>(url.toString());
  const match = data.results?.[0];
  const lat = match?.position?.lat;
  const lon = match?.position?.lon;

  if (typeof lat !== "number" || typeof lon !== "number") {
    throw new Error(`Could not find a location match for "${query}".`);
  }

  return {
    lat,
    lon,
    name: match?.address?.freeformAddress ?? query,
  };
}

function pickSamplePoints(points: RoutePoint[], travelSeconds: number) {
  if (points.length < 2) {
    return points;
  }

  const desiredStops = Math.min(
    12,
    Math.max(4, Math.ceil(travelSeconds / (6 * 60 * 60)) + 1),
  );
  const indexes = Array.from({ length: desiredStops }, (_, index) => {
    if (desiredStops === 1) {
      return 0;
    }

    return Math.round((index / (desiredStops - 1)) * (points.length - 1));
  });
  const unique = [...new Set(indexes)];

  return unique.map((index) => points[index]);
}

function weatherConditionLabel(weatherCode: number) {
  if ([0].includes(weatherCode)) return "clear";
  if ([1, 2].includes(weatherCode)) return "partly cloudy";
  if ([3].includes(weatherCode)) return "overcast";
  if ([45, 48].includes(weatherCode)) return "fog";
  if ([51, 53, 55, 56, 57].includes(weatherCode)) return "drizzle";
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(weatherCode)) return "rain";
  if ([71, 73, 75, 77, 85, 86].includes(weatherCode)) return "snow";
  if ([95, 96, 99].includes(weatherCode)) return "thunderstorms";
  return "mixed conditions";
}

function weatherCodeRisk(weatherCode: number) {
  if ([95, 96, 99].includes(weatherCode)) return 10;
  if ([71, 73, 75, 77, 85, 86].includes(weatherCode)) return 8;
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(weatherCode)) return 7;
  if ([45, 48].includes(weatherCode)) return 6;
  if ([51, 53, 55, 56, 57].includes(weatherCode)) return 4;
  if ([3].includes(weatherCode)) return 2;
  return 0;
}

async function getWeatherForecast(
  point: RoutePoint,
  startDate: string,
  endDate: string,
  cache: WeatherCache,
) {
  const cacheKey = `${point.lat.toFixed(3)},${point.lon.toFixed(3)}:${startDate}:${endDate}`;

  if (!cache.has(cacheKey)) {
    const url = new URL(OPEN_METEO_URL);
    url.searchParams.set("latitude", point.lat.toString());
    url.searchParams.set("longitude", point.lon.toString());
    url.searchParams.set(
      "hourly",
      "weather_code,precipitation_probability,precipitation,wind_speed_10m",
    );
    url.searchParams.set("wind_speed_unit", "mph");
    url.searchParams.set("start_date", startDate);
    url.searchParams.set("end_date", endDate);
    url.searchParams.set("timezone", "UTC");

    cache.set(cacheKey, fetchJson<OpenMeteoResult>(url.toString()));
  }

  return cache.get(cacheKey)!;
}

function findNearestHourlyIndex(hourlyTimes: string[], targetIso: string) {
  const target = DateTime.fromISO(targetIso, { zone: "utc" }).toMillis();
  let bestIndex = 0;
  let bestDistance = Number.POSITIVE_INFINITY;

  hourlyTimes.forEach((time, index) => {
    const distance = Math.abs(DateTime.fromISO(time, { zone: "utc" }).toMillis() - target);

    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = index;
    }
  });

  return bestIndex;
}

async function buildWeatherSnapshots(
  routePoints: RoutePoint[],
  departureUtc: DateTime,
  travelSeconds: number,
  cache: WeatherCache,
): Promise<WeatherSnapshot[]> {
  const samples = pickSamplePoints(routePoints, travelSeconds);
  const arrivalUtc = departureUtc.plus({ seconds: travelSeconds });
  const startDate = departureUtc.toISODate();
  const endDate = arrivalUtc.toISODate();

  if (!startDate || !endDate) {
    return [];
  }

  const forecasts = await Promise.all(
    samples.map((point) => getWeatherForecast(point, startDate, endDate, cache)),
  );

  return samples.map((point, index) => {
    const progress = samples.length === 1 ? 0 : index / (samples.length - 1);
    const sampleTime = departureUtc.plus({ seconds: Math.round(travelSeconds * progress) });
    const hourly = forecasts[index].hourly;
    const times = hourly?.time ?? [];

    const label =
      index === 0
        ? "Start"
        : index === samples.length - 1
          ? "Arrival"
          : `Leg ${index}`;

    if (times.length === 0) {
      return {
        label,
        timeIso: sampleTime.toISO() ?? departureUtc.toISO() ?? "",
        weatherCode: 0,
        condition: "forecast unavailable",
        precipitationProbability: 0,
        precipitation: 0,
        windSpeed: 0,
        riskScore: 0,
      };
    }

    const hourlyIndex = findNearestHourlyIndex(times, sampleTime.toISO() ?? "");
    const weatherCode = hourly?.weather_code?.[hourlyIndex] ?? 0;
    const precipitationProbability = hourly?.precipitation_probability?.[hourlyIndex] ?? 0;
    const precipitation = hourly?.precipitation?.[hourlyIndex] ?? 0;
    const windSpeed = hourly?.wind_speed_10m?.[hourlyIndex] ?? 0;
    const riskScore =
      weatherCodeRisk(weatherCode) +
      precipitationProbability / 20 +
      precipitation * 2 +
      Math.max(0, (windSpeed - 20) / 5);

    return {
      label,
      timeIso: sampleTime.toISO() ?? departureUtc.toISO() ?? "",
      weatherCode,
      condition: weatherConditionLabel(weatherCode),
      precipitationProbability,
      precipitation,
      windSpeed,
      riskScore: Number(riskScore.toFixed(1)),
    };
  });
}

async function routeTrip(
  origin: LocationPoint,
  destination: LocationPoint,
  departure: DateTime,
  timeZone: string,
  tomtomKey: string,
  weatherCache: WeatherCache,
): Promise<TripOption> {
  const url = new URL(
    `${TOMTOM_ROUTE_URL}/${origin.lat},${origin.lon}:${destination.lat},${destination.lon}/json`,
  );

  url.searchParams.set("key", tomtomKey);
  url.searchParams.set("traffic", "true");
  url.searchParams.set("routeType", "fastest");
  url.searchParams.set("travelMode", "car");
  url.searchParams.set("computeTravelTimeFor", "all");
  url.searchParams.set("routeRepresentation", "polyline");
  url.searchParams.set("departAt", departure.toUTC().toISO() ?? "");

  const data = await fetchJson<TomTomRouteResult>(url.toString());
  const route = data.routes?.[0];
  const summary = route?.summary;
  const routePoints =
    route?.legs?.flatMap((leg) =>
      (leg.points ?? [])
        .filter(
          (point): point is { latitude: number; longitude: number } =>
            typeof point.latitude === "number" && typeof point.longitude === "number",
        )
        .map((point) => ({
          lat: point.latitude,
          lon: point.longitude,
        })),
    ) ?? [];

  if (!summary?.travelTimeInSeconds || routePoints.length === 0) {
    throw new Error("TomTom routing did not return a usable route.");
  }

  const departureUtc = departure.toUTC();
  const weatherSnapshots = await buildWeatherSnapshots(
    routePoints,
    departureUtc,
    summary.travelTimeInSeconds,
    weatherCache,
  );

  const trafficDelayMinutes = Math.max(
    0,
    Math.round((summary.trafficDelayInSeconds ?? 0) / 60),
  );
  const typicalTrafficDelayMinutes = Math.max(
    0,
    Math.round(
      ((summary.historicTrafficTravelTimeInSeconds ?? summary.travelTimeInSeconds) -
        (summary.noTrafficTravelTimeInSeconds ?? summary.travelTimeInSeconds)) /
        60,
    ),
  );
  const weatherRisk = weatherSnapshots.reduce((highest, snapshot) => {
    return Math.max(highest, snapshot.riskScore);
  }, 0);
  const score = Math.ceil(
    trafficDelayMinutes * 1.15 + typicalTrafficDelayMinutes * 0.65 + weatherRisk * 7.5,
  );
  const localDeparture = departureUtc.setZone(timeZone);
  const localArrival = departureUtc.plus({ seconds: summary.travelTimeInSeconds }).setZone(timeZone);
  const reasons: string[] = [];

  if (trafficDelayMinutes <= 10) {
    reasons.push("Low live traffic delay on the route.");
  } else {
    reasons.push(`${trafficDelayMinutes} min of live traffic delay expected.`);
  }

  if (typicalTrafficDelayMinutes <= 10) {
    reasons.push("Historic traffic looks manageable for this window.");
  } else {
    reasons.push(`${typicalTrafficDelayMinutes} min of typical congestion risk.`);
  }

  if (weatherRisk < 5) {
    reasons.push("No major weather risk detected along the route.");
  } else {
    const worstStop = [...weatherSnapshots].sort((a, b) => b.riskScore - a.riskScore)[0];
    reasons.push(`Watch for ${worstStop.condition} around ${worstStop.label.toLowerCase()}.`);
  }

  return {
    departureIso: localDeparture.toISO() ?? "",
    departureLabel: localDeparture.toFormat("ccc, LLL d • h:mm a"),
    arrivalIso: localArrival.toISO() ?? "",
    arrivalLabel: localArrival.toFormat("ccc, LLL d • h:mm a"),
    score,
    trafficDelayMinutes,
    typicalTrafficDelayMinutes,
    travelMinutes: Math.round(summary.travelTimeInSeconds / 60),
    distanceMiles: Number(((summary.lengthInMeters ?? 0) * 0.000621371).toFixed(1)),
    routePoints,
    weatherSnapshots,
    reasons,
  };
}

export async function planTrip(request: PlanTripRequest): Promise<TripPlanResponse> {
  const tomtomKey = requireTomTomKey();
  const weatherCache: WeatherCache = new Map();
  const [origin, destination] = await Promise.all([
    geocodePlace(request.origin, tomtomKey),
    geocodePlace(request.destination, tomtomKey),
  ]);
  const candidates = buildDepartureCandidates(request);
  const options = await mapWithConcurrency(
    candidates,
    2,
    (departure) =>
      routeTrip(origin, destination, departure, request.timeZone, tomtomKey, weatherCache),
  );
  const sorted = options.sort((a, b) => a.score - b.score);

  return {
    timeZone: request.timeZone,
    origin,
    destination,
    recommendation: sorted[0],
    alternatives: sorted.slice(1),
  };
}
