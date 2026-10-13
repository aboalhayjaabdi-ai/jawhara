/** This store ships exclusively via 4PX and YunExpress -- every real tracking number seen so
 * far (confirmed in migration 0035's comment, re-confirmed against live tracking_cache data)
 * starts with one of these two prefixes, so the carrier never needs to be entered by hand.
 * Anything else falls back to null, which leaves 17TRACK to auto-detect the carrier itself
 * (lib/tracking/lookup.ts's registerFulfillmentsForTracking already supports this -- a null
 * carrier code is the documented, correct way to ask 17TRACK to auto-detect). */
export function detectCarrierFromTrackingNumber(trackingNumber: string): string | null {
  const normalized = trackingNumber.trim().toUpperCase();
  if (normalized.startsWith("4PX")) return "4PX";
  if (normalized.startsWith("YT")) return "YunExpress";
  return null;
}
