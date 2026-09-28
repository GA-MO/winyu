import { index, route, type RouteConfig } from "@react-router/dev/routes";

export default [index("routes/home.tsx"), route("booth", "routes/booth.tsx"), route("docs/*", "routes/docs.tsx")] satisfies RouteConfig;
