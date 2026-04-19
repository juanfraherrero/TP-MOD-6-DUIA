import type { Device } from "@/db/types";

// Detección simple por regex sobre User-Agent. Sirve para clasificar eventos
// entre mobile/tablet/desktop sin depender de ua-parser-js. Para el caso del
// TP es suficiente; si se necesita mayor granularidad se puede swap a esa lib.
export function parseDevice(userAgent: string): Device {
  if (!userAgent) return "desktop";
  // Tablet primero porque Android tablet matchea también Mobile.
  if (/iPad|Android(?!.*Mobile)|Tablet/i.test(userAgent)) return "tablet";
  if (/Mobile|iPhone|iPod|Android|BlackBerry|IEMobile|Opera Mini/i.test(userAgent)) {
    return "mobile";
  }
  return "desktop";
}
