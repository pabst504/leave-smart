import { NextResponse } from "next/server";
import { planTrip } from "@/lib/trip-planner";
import type { PlanTripRequest } from "@/types/trip";

function validateRequest(body: unknown): body is PlanTripRequest {
  if (!body || typeof body !== "object") {
    return false;
  }

  const candidate = body as Record<string, unknown>;

  return [
    "origin",
    "destination",
    "date",
    "earliestDeparture",
    "latestDeparture",
    "timeZone",
  ].every((field) => typeof candidate[field] === "string" && candidate[field].toString().trim().length > 0);
}

export async function POST(request: Request) {
  try {
    const body: unknown = await request.json();

    if (!validateRequest(body)) {
      return NextResponse.json(
        { error: "Missing or invalid trip planning fields." },
        { status: 400 },
      );
    }

    const result = await planTrip(body);
    return NextResponse.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to build a trip recommendation.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
