"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { DateTime } from "luxon";
import type {
  PlanTripRequest,
  TripOption,
  TripPlanResponse,
  WeatherSnapshot,
} from "@/types/trip";

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
  origin: "",
  destination: "",
  date: today,
  earliestDeparture: "07:00",
  latestDeparture: "11:00",
  timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
};

function getScoreTone(score: number) {
  if (score <= 24) {
    return {
      label: "Good",
      badgeClass: "bg-emerald-600 text-white",
      accentClass: "text-emerald-600",
    };
  }

  if (score <= 44) {
    return {
      label: "Caution",
      badgeClass: "bg-amber-400 text-amber-950",
      accentClass: "text-amber-600",
    };
  }

  return {
    label: "Poor",
    badgeClass: "bg-rose-600 text-white",
    accentClass: "text-rose-500",
  };
}

function buildTripWarning(plan: TripPlanResponse) {
  const allOptions = [plan.recommendation, ...plan.alternatives];

  if (!allOptions.every((option) => option.score >= 45)) {
    return null;
  }

  const worstSnapshot = allOptions
    .flatMap((option) => option.weatherSnapshots)
    .sort((a, b) => b.riskScore - a.riskScore)[0];
  const worstTrafficDelay = Math.max(...allOptions.map((option) => option.trafficDelayMinutes));
  const worstTypicalDelay = Math.max(
    ...allOptions.map((option) => option.typicalTrafficDelayMinutes),
  );

  if (!worstSnapshot) {
    return "Warning: every tested departure time scored poorly. Conditions look rough across the route, so consider waiting for a better window.";
  }

  const weatherReason = `${worstSnapshot.condition} is showing up near ${worstSnapshot.label.toLowerCase()}, with rain chances up to ${Math.round(
    worstSnapshot.precipitationProbability,
  )}% and winds around ${Math.round(worstSnapshot.windSpeed)} mph.`;
  const trafficReason =
    worstTrafficDelay >= 20 || worstTypicalDelay >= 20
      ? ` Traffic is also elevated, with delays reaching about ${worstTrafficDelay} live minutes and ${worstTypicalDelay} minutes of typical congestion.`
      : "";

  return `Warning: the weather will not be good across any tested departure window. ${weatherReason}${trafficReason}`;
}

function scrollToMapOnMobile(element: HTMLElement | null) {
  if (!element || typeof window === "undefined" || window.innerWidth >= 1024) {
    return;
  }

  window.setTimeout(() => {
    element.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }, 120);
}

function metricLabel(label: string, value: string) {
  return (
    <div className="rounded-3xl border border-[var(--panel-border)] bg-[var(--card-bg)] p-4 shadow-[0_12px_30px_rgba(15,23,42,0.07)]">
      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--muted)]">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-[var(--foreground)]">{value}</p>
    </div>
  );
}

function OptionCard({
  option,
  isRecommended,
  selectedSnapshotKey,
  onSelectSnapshot,
}: {
  option: TripOption;
  isRecommended?: boolean;
  selectedSnapshotKey: string | null;
  onSelectSnapshot: (option: TripOption, snapshot: WeatherSnapshot) => void;
}) {
  const scoreTone = getScoreTone(option.score);

  return (
    <article
      className={`rounded-[28px] border p-5 shadow-[0_18px_45px_rgba(15,23,42,0.08)] ${
        isRecommended
          ? "border-teal-400/60 bg-[color:var(--accent-panel)]"
          : "border-[var(--panel-border)] bg-[var(--panel-bg)]"
      }`}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.25em] text-[var(--muted)]">
            {isRecommended ? "Best departure" : "Alternative"}
          </p>
          <h3 className="mt-2 text-2xl font-semibold text-[var(--foreground)]">{option.departureLabel}</h3>
        </div>
        <div className="group relative">
          <button
            type="button"
            aria-label="Explain trip score"
            className={`rounded-full px-4 py-2 text-sm font-semibold ${scoreTone.badgeClass}`}
          >
            {scoreTone.label}
          </button>
          <div className="pointer-events-none absolute right-0 top-[calc(100%+0.75rem)] z-[500] w-72 rounded-2xl border border-[var(--panel-border)] bg-[var(--card-bg)] p-4 text-left text-sm text-[var(--secondary-foreground)] opacity-0 shadow-[0_18px_45px_rgba(15,23,42,0.18)] transition duration-150 group-hover:opacity-100 group-focus-within:opacity-100">
            Lower is better. The score combines live traffic delay, typical congestion,
            and the worst weather risk found along the route. Green means a better
            window, yellow means use caution, and red means conditions look poor.
          </div>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3 text-sm text-[var(--secondary-foreground)] sm:grid-cols-4">
        {metricLabel("Arrival", option.arrivalLabel)}
        {metricLabel("Drive", `${option.travelMinutes} min`)}
        {metricLabel("Traffic", `${option.trafficDelayMinutes} min`)}
        {metricLabel("Distance", `${option.distanceMiles} mi`)}
      </div>

      <ul className="mt-5 space-y-2 text-sm text-[var(--secondary-foreground)]">
        {option.reasons.map((reason) => (
          <li key={reason} className="rounded-2xl bg-[var(--card-bg)] px-4 py-3">
            {reason}
          </li>
        ))}
      </ul>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        {option.weatherSnapshots.map((snapshot) => (
          <button
            key={`${snapshot.label}-${snapshot.timeIso}`}
            type="button"
            onClick={() => onSelectSnapshot(option, snapshot)}
            className={`rounded-2xl bg-[var(--weather-card-bg)] px-4 py-4 text-left text-[var(--weather-card-foreground)] transition ${
              selectedSnapshotKey === `${snapshot.label}-${snapshot.timeIso}`
                ? "ring-2 ring-amber-400"
                : "hover:opacity-90"
            }`}
          >
            <div className="flex items-center justify-between gap-4">
              <p className="text-sm font-semibold">{snapshot.label}</p>
              <p className="text-xs uppercase tracking-[0.2em] text-[var(--weather-card-muted)]">
                {DateTime.fromISO(snapshot.timeIso).toFormat("h:mm a")}
              </p>
            </div>
            <p className="mt-2 text-lg font-semibold capitalize">{snapshot.condition}</p>
            <p className="mt-1 text-sm text-[var(--weather-card-muted)]">
              Rain {snapshot.precipitationProbability}% · Wind {Math.round(snapshot.windSpeed)} mph
            </p>
            <p className="mt-2 text-xs uppercase tracking-[0.16em] text-amber-300">
              Click to highlight on map
            </p>
          </button>
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
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [selectedSnapshot, setSelectedSnapshot] = useState<WeatherSnapshot | null>(null);
  const [activeOption, setActiveOption] = useState<TripOption | null>(null);
  const [isAlternativesOpen, setIsAlternativesOpen] = useState(false);
  const mapSectionRef = useRef<HTMLElement | null>(null);

  const alternatives = plan?.alternatives.slice(0, 3) ?? [];
  const tripWarning = plan ? buildTripWarning(plan) : null;

  useEffect(() => {
    const storedTheme = window.localStorage.getItem("leave-smart-theme");

    if (storedTheme === "light" || storedTheme === "dark") {
      setTheme(storedTheme);
      return;
    }

    const systemTheme = window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";

    setTheme(systemTheme);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem("leave-smart-theme", theme);
  }, [theme]);

  useEffect(() => {
    if (!plan) {
      return;
    }

    scrollToMapOnMobile(mapSectionRef.current);
  }, [plan]);

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
      setActiveOption(data.recommendation);
      setSelectedSnapshot(null);
      setIsAlternativesOpen(false);
    } catch (caughtError) {
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
    <main className="min-h-screen bg-[var(--page-bg)] px-4 py-6 text-[var(--foreground)] transition-colors sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <section className="grid gap-6 lg:grid-cols-[420px_minmax(0,1fr)] lg:items-start">
          <div className="rounded-[32px] border border-[var(--panel-border)] bg-[var(--panel-bg)] p-5 shadow-[0_22px_60px_rgba(15,23,42,0.12)] backdrop-blur md:p-6 lg:self-start">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.28em] text-teal-600 dark:text-teal-300">
                  Leave Smart
                </p>
              </div>
              <button
                type="button"
                onClick={() => setTheme((current) => (current === "dark" ? "light" : "dark"))}
                className="rounded-full border border-[var(--panel-border)] bg-[var(--card-bg)] px-4 py-2 text-sm font-semibold text-[var(--foreground)] transition hover:border-teal-500/50"
              >
                {theme === "dark" ? "Light mode" : "Dark mode"}
              </button>
            </div>
            <h1 className="mt-3 text-4xl font-semibold tracking-tight text-[var(--foreground)]">
              Find the safest window to get on the road.
            </h1>
            <p className="mt-4 text-base leading-7 text-[var(--secondary-foreground)]">
              Enter where you are headed, when you want to leave, and this planner
              scores each departure slot against traffic plus forecast risk.
            </p>

            <form className="mt-8 space-y-4" onSubmit={handleSubmit}>
              <label className="block">
                <span className="mb-2 block text-sm font-semibold text-[var(--secondary-foreground)]">Starting point</span>
                <input
                  required
                  value={form.origin}
                  onChange={(event) => {
                    setForm((current) => ({ ...current, origin: event.target.value }));
                    setSelectedSnapshot(null);
                  }}
                  className="w-full rounded-2xl border border-[var(--panel-border)] bg-[var(--card-bg)] px-4 py-3 text-base text-[var(--foreground)] outline-none ring-0 transition placeholder:text-[var(--muted)] focus:border-teal-500"
                  placeholder="Raleigh, NC"
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-semibold text-[var(--secondary-foreground)]">Destination</span>
                <input
                  required
                  value={form.destination}
                  onChange={(event) => {
                    setForm((current) => ({ ...current, destination: event.target.value }));
                    setSelectedSnapshot(null);
                  }}
                  className="w-full rounded-2xl border border-[var(--panel-border)] bg-[var(--card-bg)] px-4 py-3 text-base text-[var(--foreground)] outline-none ring-0 transition placeholder:text-[var(--muted)] focus:border-teal-500"
                  placeholder="Asheville, NC"
                />
              </label>

              <div className="grid gap-4 md:grid-cols-3">
                <label className="block min-w-0">
                  <span className="mb-2 block text-sm font-semibold text-[var(--secondary-foreground)]">Date</span>
                  <input
                    required
                    type="date"
                    min={today}
                    value={form.date}
                    onChange={(event) => {
                      setForm((current) => ({ ...current, date: event.target.value }));
                      setSelectedSnapshot(null);
                    }}
                    className="block w-full min-w-0 rounded-2xl border border-[var(--panel-border)] bg-[var(--card-bg)] px-4 py-3 text-base text-[var(--foreground)] outline-none transition focus:border-teal-500"
                  />
                </label>

                <label className="block min-w-0">
                  <span className="mb-2 block text-sm font-semibold text-[var(--secondary-foreground)]">Earliest</span>
                  <input
                    required
                    type="time"
                    value={form.earliestDeparture}
                    onChange={(event) => {
                      setForm((current) => ({
                        ...current,
                        earliestDeparture: event.target.value,
                      }));
                      setSelectedSnapshot(null);
                    }}
                    className="block w-full min-w-0 rounded-2xl border border-[var(--panel-border)] bg-[var(--card-bg)] px-4 py-3 text-base text-[var(--foreground)] outline-none transition focus:border-teal-500"
                  />
                </label>

                <label className="block min-w-0">
                  <span className="mb-2 block text-sm font-semibold text-[var(--secondary-foreground)]">Latest</span>
                  <input
                    required
                    type="time"
                    value={form.latestDeparture}
                    onChange={(event) => {
                      setForm((current) => ({
                        ...current,
                        latestDeparture: event.target.value,
                      }));
                      setSelectedSnapshot(null);
                    }}
                    className="block w-full min-w-0 rounded-2xl border border-[var(--panel-border)] bg-[var(--card-bg)] px-4 py-3 text-base text-[var(--foreground)] outline-none transition focus:border-teal-500"
                  />
                </label>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-2xl bg-[var(--chip-bg)] px-5 py-4 text-base font-semibold text-[var(--chip-foreground)] transition hover:opacity-90 disabled:cursor-wait disabled:opacity-50"
              >
                {loading ? "Scoring departure times..." : "Find best leave time"}
              </button>
            </form>

            <div aria-live="polite" className="mt-4 min-h-6 text-sm text-rose-500">
              {error}
            </div>

            <div className="mt-8 rounded-[28px] bg-[var(--info-bg)] p-5 text-[var(--info-foreground)]">
              <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--info-muted)]">
                API stack
              </p>
              <p className="mt-3 text-lg font-semibold">Open-Meteo + TomTom</p>
              <p className="mt-3 text-sm leading-6 text-[var(--info-muted)]">
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
                {tripWarning ? (
                  <section className="rounded-[28px] border border-rose-400/50 bg-rose-500/10 p-5 shadow-[0_18px_45px_rgba(15,23,42,0.08)]">
                    <p className="text-sm font-semibold uppercase tracking-[0.22em] text-rose-500">
                      Route warning
                    </p>
                    <p className="mt-3 text-base leading-7 text-[var(--foreground)]">
                      {tripWarning}
                    </p>
                  </section>
                ) : null}
                <section
                  ref={mapSectionRef}
                  className="overflow-hidden rounded-[32px] border border-[var(--panel-border)] bg-[var(--panel-bg)] p-4 shadow-[0_22px_60px_rgba(15,23,42,0.12)] backdrop-blur md:p-5"
                >
                  <div className="mb-4 flex items-center justify-between gap-4">
                    <div>
                      <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--muted)]">
                        Route view
                      </p>
                      <h2 className="mt-1 text-xl font-semibold text-[var(--foreground)]">
                        {plan.origin.name} to {plan.destination.name}
                      </h2>
                    </div>
                    <div className="rounded-full bg-[var(--card-bg)] px-4 py-2 text-sm text-[var(--secondary-foreground)]">
                      {(activeOption ?? plan.recommendation).distanceMiles} mi
                    </div>
                  </div>
                  <RouteMap
                    key={`${plan.origin.lat},${plan.origin.lon}:${plan.destination.lat},${plan.destination.lon}:${(activeOption ?? plan.recommendation).departureIso}`}
                    plan={plan}
                    theme={theme}
                    selectedSnapshot={selectedSnapshot}
                    option={activeOption ?? plan.recommendation}
                  />
                </section>
                <OptionCard
                  option={plan.recommendation}
                  isRecommended
                  selectedSnapshotKey={
                    selectedSnapshot ? `${selectedSnapshot.label}-${selectedSnapshot.timeIso}` : null
                  }
                  onSelectSnapshot={(option, snapshot) => {
                    setActiveOption(option);
                    setSelectedSnapshot(snapshot);
                    mapSectionRef.current?.scrollIntoView({
                      behavior: "smooth",
                      block: "start",
                    });
                  }}
                />
                {alternatives.length > 0 ? (
                  <section className="rounded-[28px] border border-[var(--panel-border)] bg-[var(--panel-bg)] p-5 shadow-[0_18px_45px_rgba(15,23,42,0.08)]">
                    <button
                      type="button"
                      onClick={() => setIsAlternativesOpen((current) => !current)}
                      className="flex w-full items-start justify-between gap-4 text-left"
                      aria-expanded={isAlternativesOpen}
                    >
                      <div>
                        <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--muted)]">
                          Backup windows
                        </p>
                        <h2 className="mt-2 text-2xl font-semibold text-[var(--foreground)]">
                          Other departure times worth considering
                        </h2>
                        <p className="mt-2 text-sm text-[var(--secondary-foreground)]">
                          Expand to compare alternate departure windows.
                        </p>
                      </div>
                      <span
                        className={`mt-1 inline-flex h-10 w-10 items-center justify-center rounded-full bg-[var(--card-bg)] transition-transform duration-200 ${
                          isAlternativesOpen ? "rotate-[-90deg]" : "rotate-90"
                        }`}
                      >
                        <Image
                          src="/right.png"
                          alt=""
                          width={16}
                          height={16}
                          className="opacity-80"
                        />
                      </span>
                    </button>
                    <div
                      className={`grid transition-[grid-template-rows,opacity,margin] duration-300 ease-out ${
                        isAlternativesOpen
                          ? "mt-5 grid-rows-[1fr] opacity-100"
                          : "mt-0 grid-rows-[0fr] opacity-0"
                      }`}
                    >
                      <div className="overflow-hidden">
                        <div className="space-y-4">
                      {alternatives.map((option) => (
                        <OptionCard
                          key={option.departureIso}
                          option={option}
                          selectedSnapshotKey={
                            selectedSnapshot
                              ? `${selectedSnapshot.label}-${selectedSnapshot.timeIso}`
                              : null
                          }
                          onSelectSnapshot={(selectedOption, snapshot) => {
                            setActiveOption(selectedOption);
                            setSelectedSnapshot(snapshot);
                            mapSectionRef.current?.scrollIntoView({
                              behavior: "smooth",
                              block: "start",
                            });
                          }}
                        />
                      ))}
                        </div>
                      </div>
                    </div>
                  </section>
                ) : null}
              </>
            ) : (
              <section className="flex min-h-[560px] flex-col justify-between rounded-[32px] border border-dashed border-[var(--panel-border)] bg-[var(--panel-bg)] p-6 shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
                <div>
                  <p className="text-sm font-semibold uppercase tracking-[0.25em] text-[var(--muted)]">
                    Preview
                  </p>
                  <h2 className="mt-3 text-3xl font-semibold text-[var(--foreground)]">
                    Your route and departure recommendation will show up here.
                  </h2>
                  <p className="mt-4 max-w-2xl text-base leading-7 text-[var(--secondary-foreground)]">
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
