export type OpenApiOperationLike = { summary?: string; tags?: string[]; security?: unknown[] };

/** The part of an OpenAPI document the banner reads. `openApiSpec` satisfies it as is. */
export type OpenApiLike = {
  tags?: { name: string }[];
  paths: Record<string, Record<string, OpenApiOperationLike>>;
};

export type StartupBannerOptions = {
  baseUrl: string;
  docsEnabled: boolean;
  spec: OpenApiLike;
};

type Route = { method: string; path: string; admin: boolean };

// Every method an OpenAPI path item can hold, in the order they are listed under one path.
const METHOD_ORDER = ["get", "post", "put", "patch", "delete", "head", "options", "trace"];
const METHOD_WIDTH = 8;
const UNTAGGED_GROUP = "Altre";

/**
 * Plain-text startup message: where the API listens, where its documentation lives and every
 * documented route grouped by tag. Pure on purpose, so the caller decides where it is printed.
 */
export function formatStartupBanner({ baseUrl, docsEnabled, spec }: StartupBannerOptions): string {
  const base = baseUrl.replace(/\/+$/, "");
  const headline = `Mateira API in ascolto su ${base}`;
  if (!docsEnabled) return [headline, "Documentazione disattivata (DOCS_ENABLED=false)"].join("\n");

  const { groups, total, pathWidth } = groupRoutes(spec);

  const lines = [
    headline,
    "",
    "Documentazione",
    `  Swagger UI   ${base}/docs`,
    `  OpenAPI      ${base}/openapi.json`,
    "",
    `Rotte (${total})`,
  ];
  for (const [name, routes] of groups) {
    lines.push(`  ${name}`);
    for (const { method, path, admin } of routes) {
      const target = admin ? `${path.padEnd(pathWidth)}  (admin)` : path;
      lines.push(`    ${method.padEnd(METHOD_WIDTH)}${target}`);
    }
  }
  return lines.join("\n");
}

function groupRoutes(spec: OpenApiLike): { groups: Map<string, Route[]>; total: number; pathWidth: number } {
  // Declared tags first, in the order of the document. Unlisted tags are added as they appear, after them.
  const tagged = new Map<string, Route[]>((spec.tags ?? []).map((tag) => [tag.name, []]));
  const untagged: Route[] = [];
  let total = 0;
  let pathWidth = 0;

  for (const [path, item] of Object.entries(spec.paths)) {
    for (const method of METHOD_ORDER) {
      const operation: OpenApiOperationLike | undefined = item[method];
      if (!operation) continue;

      const route: Route = { method: method.toUpperCase(), path, admin: (operation.security?.length ?? 0) > 0 };
      const tag = operation.tags?.[0];
      if (tag) {
        const group = tagged.get(tag);
        if (group) group.push(route);
        else tagged.set(tag, [route]);
      } else {
        untagged.push(route);
      }
      total += 1;
      pathWidth = Math.max(pathWidth, path.length);
    }
  }

  const groups = new Map([...tagged].filter(([, routes]) => routes.length > 0));
  if (untagged.length > 0) {
    const existing = groups.get(UNTAGGED_GROUP);
    if (existing) existing.push(...untagged);
    else groups.set(UNTAGGED_GROUP, untagged);
  }
  return { groups, total, pathWidth };
}
