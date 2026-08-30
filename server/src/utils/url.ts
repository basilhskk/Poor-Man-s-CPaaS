import { resolve4, resolve6 } from "dns/promises";

const BLOCKED_PREFIXES = ["127.", "10.", "0.", "192.168.", "::1", "fc", "fd"];

function isPrivateIp(ip: string): boolean {
  return (
    BLOCKED_PREFIXES.some((p) => ip.startsWith(p)) ||
    ip === "0.0.0.0" ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(ip)
  );
}

export async function isSafeWebhookUrl(raw: string): Promise<boolean> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") return false;

  const host = url.hostname;

  if (/^\d+\.\d+\.\d+\.\d+$/.test(host) || host.startsWith("[")) {
    return !isPrivateIp(host.replace(/[\[\]]/g, ""));
  }

  try {
    const [v4, v6] = await Promise.allSettled([resolve4(host), resolve6(host)]);
    const ips: string[] = [
      ...(v4.status === "fulfilled" ? v4.value : []),
      ...(v6.status === "fulfilled" ? v6.value : []),
    ];
    if (ips.length === 0) return false; // DNS failed entirely
    return ips.every((ip) => !isPrivateIp(ip)); // all must be public
  } catch {
    return false;
  }
}
