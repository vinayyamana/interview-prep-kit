const dns = require("dns").promises;
const net = require("net");

// Blocks private, loopback, link-local, and other non-public IP ranges (SSRF prevention)
function isPrivateOrReservedIp(ip) {
  if (net.isIPv4(ip)) {
    const parts = ip.split(".").map(Number);
    const [a, b] = parts;
    if (a === 127) return true; // loopback
    if (a === 10) return true; // private
    if (a === 172 && b >= 16 && b <= 31) return true; // private
    if (a === 192 && b === 168) return true; // private
    if (a === 169 && b === 254) return true; // link-local (also covers cloud metadata 169.254.169.254)
    if (a === 0) return true; // "this network"
    if (a >= 224) return true; // multicast/reserved
    return false;
  }
  if (net.isIPv6(ip)) {
    const lower = ip.toLowerCase();
    if (lower === "::1") return true; // loopback
    if (lower.startsWith("fe80:")) return true; // link-local
    if (lower.startsWith("fc") || lower.startsWith("fd")) return true; // unique local
    return false;
  }
  return true; // unknown format — treat as unsafe
}

// Throws if the URL is not a safe, public http(s) URL. Resolves DNS to catch
// hostnames that point at private/loopback IPs (SSRF via DNS rebinding).
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

  const hostname = parsed.hostname;

  // Reject obvious localhost variants outright
  const lowerHost = hostname.toLowerCase();
  if (lowerHost === "localhost" || lowerHost.endsWith(".localhost")) {
    throw new Error("URLs pointing to localhost are not allowed");
  }

  // If hostname is already a literal IP, check it directly
  if (net.isIP(hostname)) {
    if (isPrivateOrReservedIp(hostname)) {
      throw new Error("URLs pointing to private or reserved IP addresses are not allowed");
    }
    return parsed;
  }

  // Otherwise resolve DNS and check every resolved address
  let addresses;
  try {
    addresses = await dns.lookup(hostname, { all: true });
  } catch {
    throw new Error("Could not resolve hostname");
  }

  for (const { address } of addresses) {
    if (isPrivateOrReservedIp(address)) {
      throw new Error("URL resolves to a private or reserved IP address");
    }
  }

  return parsed;
}

module.exports = { assertSafeUrl, isPrivateOrReservedIp };