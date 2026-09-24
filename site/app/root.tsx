import { RootProvider } from "fumadocs-ui/provider/react-router";
import { isRouteErrorResponse, Links, Meta, Outlet, Scripts, ScrollRestoration } from "react-router";
import type { Route } from "./+types/root";
import "./app.css";

const GOOGLE_FONTS_URL =
  "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500&family=Noto+Sans+Thai:wght@400;500;600;700&display=swap";

export function links(): Route.LinkDescriptors {
  return [
    { rel: "icon", type: "image/svg+xml", href: `${import.meta.env.BASE_URL}icon.svg` },
    { rel: "preconnect", href: "https://fonts.googleapis.com" },
    { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
    { rel: "stylesheet", href: GOOGLE_FONTS_URL },
  ];
}

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th" suppressHydrationWarning>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body className="flex min-h-screen flex-col">
        <RootProvider theme={{ attribute: ["class", "data-theme"], defaultTheme: "light" }} search={{ enabled: false }}>{children}</RootProvider>
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  return <Outlet />;
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  const title = isRouteErrorResponse(error) ? `${error.status} ${error.statusText}` : "เกิดข้อผิดพลาด";
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-16">
      <h1 className="text-2xl font-semibold">{title}</h1>
      <a href="/" className="mt-4 inline-block text-fd-primary underline">กลับหน้าแรก</a>
    </main>
  );
}
