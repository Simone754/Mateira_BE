/** Documents and publications point to an uploaded PDF (a Media) or to an external address: exactly one of the two. */
export const EXTERNAL_URL_MAX = 500;
export const FILE_OR_URL = "a file or an external URL is required, not both";

export type LinkFields = { fileId?: string | null; externalUrl?: string | null };

export type LinkPublic = { url: string | null; kind: "file" | "external"; mimeType: string | null };
export type FileRef = { id: string; url: string | null; mimeType: string; alt: string | null };
