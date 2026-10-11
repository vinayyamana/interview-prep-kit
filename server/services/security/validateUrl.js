const net = require("net");
const dns = require("dns");
const { Agent } = require("undici"); // npm i undici

const DNS_TIMEOUT_MS = 5000;

// Private/loopback targets are blocked in production, unless explicitly allowed
// (e.g. local fixtures for batch evaluation: ALLOW_PRIVATE_URLS=true).
function allowPrivateTargets() {
  if (process.env.ALLOW_PRIVATE_URLS === "true") return true;
  if (process.env.ALLOW_PRIVATE_URLS === "false") return false;
  return process.env.NODE_ENV !== "production";
}

function urlError(code, message) {
  const err = new Error(message);
  err.code = code;
  return err;
}

function isPrivateIpv4(ip) {
  const [a, b, c] = ip.split(".").map(Number);
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 192 && b === 0 && c === 0) return true; // 192.0.0.0/24
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  if (a === 198 && (b === 18 || b === 19)) return true; // benchmarking
  if (a >= 224) return true; // multicast, reserved, broadcast (incl. 240/4)
  return false;
}

function isPrivateOrReservedIp(ip) {
  if (net.isIPv4(ip)) return isPrivateIpv4(ip);

  if (net.isIPv6(ip)) {
    const lower = ip.toLowerCase();
    if (lower === "::1" || lower === "::") return true;

    // IPv4-mapped: ::ffff:1.2.3.4 or hex form ::ffff:7f00:1 (URL parser normalises to hex)
    if (lower.startsWith("::ffff:")) {
      const rest = lower.slice(7);
      if (net.isIPv4(rest)) return isPrivateIpv4(rest);
      const m = rest.match(/^([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
      if (m) {
        const hi = parseInt(m[1], 16);
        const lo = parseInt(m[2], 16);
        return isPrivateIpv4(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`);
      }
      return true;
    }
    if (/^fe[89ab]/.test(lower)) return true; // fe80::/10 link-local
    if (/^f[cd]/.test(lower)) return true; // fc00::/7 unique local
    if (lower.startsWith("ff")) return true; // multicast
    return false;
  }
  return true; // unknown format: treat as unsafe
}

function lookupAll(hostname) {
  return Promise.race([
    dns.promises.lookup(hostname, { all: true }),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error("DNS timeout")), DNS_TIMEOUT_MS)
    ),
  ]);
}

// Throws (with err.code) if the URL is not a safe http(s) URL.
// Call it on the start URL AND on every redirect hop.
async function assertSafeUrl(rawUrl) {
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw urlError("INVALID_URL", "Invalid URL");
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw urlError("URL_BLOCKED", "Only http/https URLs are allowed");
  }
  if (parsed.username || parsed.password) {
    throw urlError("URL_BLOCKED", "URLs with embedded credentials are not allowed");
  }

  const allowPrivate = allowPrivateTargets();
  if (!allowPrivate && parsed.port && !["80", "443"].includes(parsed.port)) {
    throw urlError("URL_BLOCKED", "Only ports 80 and 443 are allowed");
  }

  const hostname = parsed.hostname.replace(/^\[|\]$/g, "");
  const lowerHost = hostname.toLowerCase();

  if (!allowPrivate && (lowerHost === "localhost" || lowerHost.endsWith(".localhost"))) {
    throw urlError("URL_BLOCKED", "URLs pointing to localhost are not allowed");
  }

  if (net.isIP(hostname)) {
    if (!allowPrivate && isPrivateOrReservedIp(hostname)) {
      throw urlError("URL_BLOCKED", "URLs pointing to private or reserved IP addresses are not allowed");
    }
    return parsed;
  }

  let addresses;
  try {
    addresses = await lookupAll(hostname);
  } catch {
    throw urlError("DNS_FAILED", "Could not resolve hostname");
  }

  if (!allowPrivate && addresses.some(({ address }) => isPrivateOrReservedIp(address))) {
    throw urlError("URL_BLOCKED", "URL resolves to a private or reserved IP address");
  }
  return parsed;
}

// Re-checks the IP at connect time, closing the DNS-rebinding window between
// assertSafeUrl() and the real connection. Pass as `dispatcher` to fetch().
const safeAgent = new Agent({
  connect: {
    lookup(host, opts, cb) {
      dns.lookup(host, opts, (err, addrs, family) => {
        if (err) return cb(err);
        const list = Array.isArray(addrs) ? addrs : [{ address: addrs }];
        if (!allowPrivateTargets() && list.some((a) => isPrivateOrReservedIp(a.address))) {
          return cb(urlError("URL_BLOCKED", "URL resolves to a private or reserved IP address"));
        }
        cb(null, addrs, family);
      });
    },
  },
});

module.exports = { assertSafeUrl, isPrivateOrReservedIp, safeAgent };