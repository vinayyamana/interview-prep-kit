const net = require("net");
const dns = require("dns").promises;

// Private/loopback targets are blocked only in production,
// unless explicitly allowed (e.g. local fixtures for batch evaluation).
function allowPrivateTargets() {
  if (process.env.ALLOW_PRIVATE_URLS === "true") return true;
  if (process.env.ALLOW_PRIVATE_URLS === "false") return false;
  return process.env.NODE_ENV !== "production";
}

function isPrivateOrReservedIp(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    if (a === 0) return true;
    if (a >= 224) return true;
    return false;
  }
  if (net.isIPv6(ip)) {
    const lower = ip.toLowerCase();
    if (lower === "::1" || lower === "::") return true;
    if (lower.startsWith("::ffff:")) {
      const mapped = lower.slice(7);
      if (net.isIPv4(mapped)) return isPrivateOrReservedIp(mapped);
      return true;
    }
    if (lower.startsWith("fe80:")) return true;
    if (lower.startsWith("fc") || lower.startsWith("fd")) return true;
    return false;
  }
  return true; // unknown format: treat as unsafe
}

// Throws if the URL is not a safe http(s) URL. Resolves DNS to catch
// hostnames that point at private/loopback IPs (SSRF via DNS rebinding).
// In non-production (or ALLOW_PRIVATE_URLS=true) private targets are allowed.
async function assertSafeUrl(rawUrl) {
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error("Invalid URL");
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("Only http/https URLs are allowed");
  }

  const allowPrivate = allowPrivateTargets();
  const hostname = parsed.hostname.replace(/^\[|\]$/g, "");
  const lowerHost = hostname.toLowerCase();

  if (!allowPrivate && (lowerHost === "localhost" || lowerHost.endsWith(".localhost"))) {
    throw new Error("URLs pointing to localhost are not allowed");
  }

  if (net.isIP(hostname)) {
    if (!allowPrivate && isPrivateOrReservedIp(hostname)) {
      throw new Error("URLs pointing to private or reserved IP addresses are not allowed");
    }
    return parsed;
  }

  let addresses;
  try {
    addresses = await dns.lookup(hostname, { all: true });
  } catch {
    throw new Error("Could not resolve hostname");
  }

  if (!allowPrivate) {
    for (const { address } of addresses) {
      if (isPrivateOrReservedIp(address)) {
        throw new Error("URL resolves to a private or reserved IP address");
      }
    }
  }

  return parsed;
}

module.exports = { assertSafeUrl, isPrivateOrReservedIp };