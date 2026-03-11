"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { DateTime } from "luxon";
import type { PlanTripRequest, TripOption, TripPlanResponse } from "@/types/trip";

const RouteMap = dynamic(
  () => import("@/components/route-map").then((module) => module.RouteMap),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[320px] items-center justify-center rounded-[28px] border border-white/30 bg-white/60 text-sm text-slate-600">
        Loading map...
      </div>
    ),
  },
);

const today = DateTime.now().toISODate() ?? "";

const defaultForm: PlanTripRequest = {
  origin: "New York, NY",
  destination: "Boston, MA",
  date: today,
  earliestDeparture: "07:00",
  latestDeparture: "11:00",
  timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
};

function metricLabel(label: string, value: string) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white/90 p-4 shadow-[0_12px_30px_rgba(15,23,42,0.07)]">
      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-slate-950">{value}</p>
    </div>
  );
}

function OptionCard({
  option,
  isRecommended,
}: {
  option: TripOption;
  isRecommended?: boolean;
}) {
  return (
    <article
      className={`rounded-[28px] border p-5 shadow-[0_18px_45px_rgba(15,23,42,0.08)] ${
        isRecommended
          ? "border-teal-300 bg-teal-50/90"
          : "border-white/40 bg-white/85"
      }`}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.25em] text-slate-500">
            {isRecommended ? "Best departure" : "Alternative"}
          </p>
          <h3 className="mt-2 text-2xl font-semibold text-slate-950">{option.departureLabel}</h3>
        </div>
        <div className="rounded-full bg-slate-950 px-4 py-2 text-sm font-semibold text-white">
          Score {option.score}
        </div>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3 text-sm text-slate-700 sm:grid-cols-4">
        {metricLabel("Arrival", option.arrivalLabel)}
        {metricLabel("Drive", `${option.travelMinutes} min`)}
        {metricLabel("Traffic", `${option.trafficDelayMinutes} min`)}
        {metricLabel("Distance", `${option.distanceMiles} mi`)}
      </div>

      <ul className="mt-5 space-y-2 text-sm text-slate-700">
        {option.reasons.map((reason) => (
          <li key={reason} className="rounded-2xl bg-white/80 px-4 py-3">
            {reason}
          </li>
        ))}
      </ul>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        {option.weatherSnapshots.map((snapshot) => (
          <div key={`${snapshot.label}-${snapshot.timeIso}`} className="rounded-2xl bg-slate-950 px-4 py-4 text-white">
            <div className="flex items-center justify-between gap-4">
              <p className="text-sm font-semibold">{snapshot.label}</p>
              <p className="text-xs uppercase tracking-[0.2em] text-white/70">
                {DateTime.fromISO(snapshot.timeIso).toFormat("h:mm a")}
              </p>
            </div>
            <p className="mt-2 text-lg font-semibold capitalize">{snapshot.condition}</p>
            <p className="mt-1 text-sm text-white/75">
              Rain {snapshot.precipitationProbability}% · Wind {Math.round(snapshot.windSpeed)} mph
            </p>
          </div>
        ))}
      </div>
    </article>
  );
}

export function TripPlanner() {
  const [form, setForm] = useState(defaultForm);
  const [plan, setPlan] = useState<TripPlanResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const alternatives = plan?.alternatives.slice(0, 3) ?? [];

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/plan", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(form),
      });
      const data = (await response.json()) as TripPlanResponse & { error?: string };

      if (!response.ok) {
        throw new Error(data.error ?? "Unable to build your departure recommendation.");
      }

      setPlan(data);
    } catch (caughtError) {
      setPlan(null);
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Unable to build your departure recommendation.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(45,212,191,0.22),_transparent_36%),linear-gradient(180deg,_#f8fafc_0%,_#e2e8f0_100%)] px-4 py-6 text-slate-950 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <section className="grid gap-6 lg:grid-cols-[420px_minmax(0,1fr)]">
          <div className="rounded-[32px] border border-white/40 bg-white/75 p-5 shadow-[0_22px_60px_rgba(15,23,42,0.12)] backdrop-blur md:p-6">
            <p className="text-sm font-semibold uppercase tracking-[0.28em] text-teal-700">
              Leave Smart
            </p>
            <h1 className="mt-3 text-4xl font-semibold tracking-tight text-slate-950">
              Find the safest window to get on the road.
            </h1>
            <p className="mt-4 text-base leading-7 text-slate-700">
              Enter where you are headed, when you want to leave, and this planner
              scores each departure slot against traffic plus forecast risk.
            </p>

            <form className="mt-8 space-y-4" onSubmit={handleSubmit}>
              <label className="block">
                <span className="mb-2 block text-sm font-semibold text-slate-700">Starting point</span>
                <input
                  required
                  value={form.origin}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, origin: event.target.value }))
                  }
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base outline-none ring-0 transition focus:border-teal-500"
                  placeholder="Raleigh, NC"
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-semibold text-slate-700">Destination</span>
                <input
                  required
                  value={form.destination}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, destination: event.target.value }))
                  }
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base outline-none ring-0 transition focus:border-teal-500"
                  placeholder="Asheville, NC"
                />
              </label>

              <div className="grid gap-4 sm:grid-cols-3">
                <label className="block sm:col-span-1">
                  <span className="mb-2 block text-sm font-semibold text-slate-700">Date</span>
                  <input
                    required
                    type="date"
                    min={today}
                    value={form.date}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, date: event.target.value }))
                    }
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base outline-none transition focus:border-teal-500"
                  />
                </label>

                <label className="block">
                  <span className="mb-2 block text-sm font-semibold text-slate-700">Earliest</span>
                  <input
                    required
                    type="time"
                    value={form.earliestDeparture}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        earliestDeparture: event.target.value,
                      }))
                    }
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base outline-none transition focus:border-teal-500"
                  />
                </label>

                <label className="block">
                  <span className="mb-2 block text-sm font-semibold text-slate-700">Latest</span>
                  <input
                    required
                    type="time"
                    value={form.latestDeparture}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        latestDeparture: event.target.value,
                      }))
                    }
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base outline-none transition focus:border-teal-500"
                  />
                </label>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-2xl bg-slate-950 px-5 py-4 text-base font-semibold text-white transition hover:bg-slate-800 disabled:cursor-wait disabled:bg-slate-400"
              >
                {loading ? "Scoring departure times..." : "Find best leave time"}
              </button>
            </form>

            <div aria-live="polite" className="mt-4 min-h-6 text-sm text-rose-700">
              {error}
            </div>

            <div className="mt-8 rounded-[28px] bg-slate-950 p-5 text-white">
              <p className="text-sm font-semibold uppercase tracking-[0.22em] text-white/60">
                API stack
              </p>
              <p className="mt-3 text-lg font-semibold">Open-Meteo + TomTom</p>
              <p className="mt-3 text-sm leading-6 text-white/75">
                Open-Meteo is a strong fit for forecast sampling because it is fast,
                free to start, and exposes the hourly precipitation, wind, and weather
                code data this scoring model needs. TomTom handles location search and
                departure-aware routing with traffic data.
              </p>
            </div>
          </div>

          <div className="space-y-6">
            {plan ? (
              <>
                <section className="rounded-[32px] border border-white/40 bg-white/75 p-4 shadow-[0_22px_60px_rgba(15,23,42,0.12)] backdrop-blur md:p-5">
                  <RouteMap plan={plan} />
                </section>
                <OptionCard option={plan.recommendation} isRecommended />
                {alternatives.length > 0 ? (
                  <section className="space-y-4">
                    <div>
                      <p className="text-sm font-semibold uppercase tracking-[0.22em] text-slate-600">
                        Backup windows
                      </p>
                      <h2 className="mt-2 text-2xl font-semibold text-slate-950">
                        Other departure times worth considering
                      </h2>
                    </div>
                    {alternatives.map((option) => (
                      <OptionCard key={option.departureIso} option={option} />
                    ))}
                  </section>
                ) : null}
              </>
            ) : (
              <section className="flex min-h-[560px] flex-col justify-between rounded-[32px] border border-dashed border-slate-300 bg-white/50 p-6 shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
                <div>
                  <p className="text-sm font-semibold uppercase tracking-[0.25em] text-slate-500">
                    Preview
                  </p>
                  <h2 className="mt-3 text-3xl font-semibold text-slate-950">
                    Your route and departure recommendation will show up here.
                  </h2>
                  <p className="mt-4 max-w-2xl text-base leading-7 text-slate-700">
                    The planner tests each half-hour departure slot in your window,
                    compares traffic-aware travel time against weather risk sampled along
                    the route, and recommends the lowest-risk option.
                  </p>
                </div>

                <div className="grid gap-4 md:grid-cols-3">
                  {metricLabel("Traffic", "Live + historic")}
                  {metricLabel("Weather", "Hourly route checks")}
                  {metricLabel("Map", "Leaflet + OpenStreetMap")}
                </div>
              </section>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
