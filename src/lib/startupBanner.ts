export type StartupBannerOptions = {
  baseUrl: string;
  docsEnabled: boolean;
};

/**
 * Plain-text startup message: where the API listens and where its documentation lives.
 * Pure on purpose, so the caller decides where it is printed.
 */
export function formatStartupBanner({ baseUrl, docsEnabled }: StartupBannerOptions): string {
  const base = baseUrl.replace(/\/+$/, "");
  const headline = `Mateira API in ascolto su ${base}`;
  if (!docsEnabled) return [headline, "Documentazione disattivata (DOCS_ENABLED=false)"].join("\n");

  return [
    headline,
    "",
    "Documentazione",
    `  Swagger UI   ${base}/docs`,
    `  OpenAPI      ${base}/openapi.json`,
  ].join("\n");
}
