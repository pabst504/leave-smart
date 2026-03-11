# Leave Smart

Leave Smart is a mobile-first roadtrip helper built with Next.js and TypeScript. It accepts an origin, destination, travel date, and departure window, then recommends the best time to leave based on traffic-aware routing and weather risk along the route.

## Stack

- Next.js 16 App Router
- TypeScript
- Tailwind CSS 4
- Leaflet with `react-leaflet`
- TomTom Search + Routing APIs
- Open-Meteo forecast API

## Why these APIs

- Open-Meteo is a strong weather fit because it provides free hourly forecast data, including precipitation, wind, and WMO weather codes, without requiring a key for basic usage.
- TomTom is a practical routing fit because it supports place search plus traffic-aware route calculations for a specific departure time.

## Setup

1. Copy `.env.example` to `.env.local`.
2. Add a TomTom API key.
3. Start the app.

```bash
cp .env.example .env.local
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Notes

- The planner samples route weather at several checkpoints between the start and destination.
- Departure slots are evaluated every 30 minutes within the selected window.
- The recommendation score favors lower live traffic delay, lower historic congestion, and lighter weather risk.
