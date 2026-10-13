export type MediaDto = {
  id: string;
  url: string | null;
  mimeType: string;
  size: number | null;
  alt: string | null;
  createdAt: string;
};

export type PresignResponse = {
  uploadUrl: string;
  method: "PUT";
  headers: Record<string, string>;
  media: MediaDto;
};
