import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Leave Smart",
  description:
    "Roadtrip planner that recommends the best departure window using traffic and weather data.",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
