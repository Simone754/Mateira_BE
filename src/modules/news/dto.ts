export const NEWS_CATEGORIES = [
  "MATEIRA",
  "RICERCA",
  "PROGRAMMI",
  "VIAGGIO_TIRENAUTI",
  "INCONTRI",
  "COLLABORAZIONI",
  "APPUNTAMENTI",
  "PRESS",
  "COMUNICATI",
] as const;
export type NewsCategoryValue = (typeof NEWS_CATEGORIES)[number];

export const CONTENT_STATUSES = ["DRAFT", "PUBLISHED"] as const;
export type ContentStatusValue = (typeof CONTENT_STATUSES)[number];

export type ExternalLink = { label: string; url: string };

export type MediaRef = { id: string; url: string | null; mimeType: string; alt: string | null };

/** `body` is plain text: paragraphs are separated by a blank line. */
export type NewsPublicListItem = {
  slug: string;
  title: string;
  date: string;
  category: NewsCategoryValue;
  excerpt: string;
  author: string | null;
  image: MediaRef | null;
  publishedAt: string | null;
};

export type NewsPublicDetail = NewsPublicListItem & {
  body: string;
  attachments: MediaRef[];
  externalLinks: ExternalLink[];
};

export type NewsAdmin = NewsPublicDetail & {
  id: string;
  status: ContentStatusValue;
  createdAt: string;
  updatedAt: string;
};
