import type { ContentStatusValue } from "../news/dto";

export { CONTENT_STATUSES } from "../news/dto";
export type { ContentStatusValue } from "../news/dto";

export const HOME_BLOCK_TYPES = ["HERO", "TICKER", "CTA", "FEATURED"] as const;
export type HomeBlockTypeValue = (typeof HOME_BLOCK_TYPES)[number];

/** A call to action: a label and where it leads. `href` is an internal path or a normalised http(s) address. */
export type HomeCta = { label: string; href: string };

export type HeroContent = {
  title: string;
  text: string | null;
  primaryCta: HomeCta;
  secondaryCta: HomeCta | null;
};

export type TickerItem = { text: string; href: string | null };
export type TickerContent = { items: TickerItem[] };

export type CtaContent = { title: string; text: string | null; cta: HomeCta };

/** What is stored: the image of a card is only the id of a Media row (no foreign key, the row may disappear). */
export type FeaturedStoredItem = { title: string; text: string | null; href: string; imageId: string | null };
export type FeaturedStoredContent = { title: string; items: FeaturedStoredItem[] };

export type StoredContent = HeroContent | TickerContent | CtaContent | FeaturedStoredContent;

export type HomeImage = { id: string; url: string | null; alt: string | null };

/** What is served: `imageId` is replaced by the resolved `image` (null when the card has none or the media is gone). */
export type FeaturedItem = { title: string; text: string | null; href: string; image: HomeImage | null };
export type FeaturedContent = { title: string; items: FeaturedItem[] };

export type HomeBlockContent = HeroContent | TickerContent | CtaContent | FeaturedContent;

export type HomeBlockPublic = { id: string; type: HomeBlockTypeValue; content: HomeBlockContent };

export type HomeBlockAdmin = HomeBlockPublic & {
  position: number;
  status: ContentStatusValue;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
};
