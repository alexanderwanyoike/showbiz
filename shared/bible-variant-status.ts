export const BIBLE_VARIANT_STATUSES = ["candidate", "approved", "rejected"] as const;
export type BibleAssetVariantStatus = (typeof BIBLE_VARIANT_STATUSES)[number];
export const isBibleVariantStatus = (value: string): value is BibleAssetVariantStatus =>
  (BIBLE_VARIANT_STATUSES as readonly string[]).includes(value);
