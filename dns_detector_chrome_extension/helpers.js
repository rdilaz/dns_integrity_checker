/**
 * DNS-over-HTTPS lookups for both IPv4 and IPv6 records using Google DNS
 * @param {string} domain Domain to look up
 * @returns {Promise<Set<string>>} Set of IP addresses
 */
export async function dohLookup(domain) {
  const aQueryUrl = `https://dns.google/resolve?name=${encodeURIComponent(
    domain
  )}&type=A`;
  const aaaaQueryUrl = `https://dns.google/resolve?name=${encodeURIComponent(
    domain
  )}&type=AAAA`;
  const allIps = new Set();

  const fetchOptions = {
    method: "GET",
    headers: { accept: "application/dns-json" },
  };

  try {
    // Make parallel requests for IPv4 and IPv6
    const results = await Promise.allSettled([
      fetch(aQueryUrl, fetchOptions),
      fetch(aaaaQueryUrl, fetchOptions),
    ]);

    for (const result of results) {
      if (result.status === "fulfilled") {
        const response = result.value;
        if (!response.ok) {
          console.warn(`DoH request failed for ${domain}: ${response.status}`);
          continue;
        }
        try {
          const json = await response.json();
          if (json.Status === 0 && Array.isArray(json.Answer)) {
            json.Answer.forEach((record) => {
              // Type 1=IPv4, 28=IPv6
              if ((record.type === 1 || record.type === 28) && record.data) {
                allIps.add(record.data);
              }
            });
          }
        } catch (parseError) {
          console.error(
            `Error parsing DoH response for ${domain}:`,
            parseError
          );
        }
      } else {
        console.error(`DoH fetch failed for ${domain}:`, result.reason);
      }
    }
  } catch (error) {
    console.error(`Error during DoH lookups for ${domain}:`, error);
  }
  return allIps;
}

/**
 * Checks if IP matches or is in similar network as DoH results
 * Uses /48 for IPv6, /16 for IPv4 to handle CDN deployments
 * @param {string} connectedIp Browser's connected IP
 * @param {Set<string>} dohIpSet IPs from DoH lookup
 * @returns {boolean} True if related
 */
export function isIpRelatedToDohSet(connectedIp, dohIpSet) {
  // Check for exact match first
  if (dohIpSet.has(connectedIp)) {
    return true;
  }

  // Check network ranges if no exact match
  for (const dohIp of dohIpSet) {
    if (areIPsInSimilarRange(connectedIp, dohIp)) {
      console.debug(`IP range match: ${connectedIp} related to ${dohIp}`);
      return true;
    }
  }

  return false;
}

/**
 * Expands IPv6 shorthand to canonical form
 */
function expandIPv6(ip) {
  if (!ip || !ip.includes(":")) return ip;

  // Handle :: compression
  if (ip.includes("::")) {
    const parts = ip.split("::");
    const segmentsBefore = parts[0]
      ? parts[0].split(":").filter((s) => s.length > 0)
      : [];
    const segmentsAfter = parts[1]
      ? parts[1].split(":").filter((s) => s.length > 0)
      : [];
    const segmentsMissing = 8 - (segmentsBefore.length + segmentsAfter.length);

    if (segmentsMissing < 0) return ip;

    const zeroes = Array(segmentsMissing).fill("0000");
    if (segmentsBefore.length === 0 && segmentsAfter.length > 0) {
      ip = [...zeroes, ...segmentsAfter].join(":");
    } else if (segmentsBefore.length > 0 && segmentsAfter.length === 0) {
      ip = [...segmentsBefore, ...zeroes].join(":");
    } else if (segmentsBefore.length > 0 && segmentsAfter.length > 0) {
      ip = [...segmentsBefore, ...zeroes, ...segmentsAfter].join(":");
    } else {
      ip = zeroes.join(":");
    }
  }

  // Pad segments with leading zeros
  const finalSegments = ip
    .split(":")
    .map((segment) => segment.padStart(4, "0"));
  if (finalSegments.length !== 8) return ip;

  return finalSegments.join(":");
}

/**
 * Checks if IPs are in same network range
 */
function areIPsInSimilarRange(ipA, ipB) {
  const isIpAV6 = ipA.includes(":");
  const isIpBV6 = ipB.includes(":");

  if (isIpAV6 && isIpBV6) {
    // IPv6: Compare /48 prefix (first 3 segments)
    try {
      const expandedA = expandIPv6(ipA);
      const expandedB = expandIPv6(ipB);

      if (
        !expandedA.includes(":") ||
        !expandedB.includes(":") ||
        expandedA.length < 15 ||
        expandedB.length < 15
      ) {
        return false;
      }

      const prefixA = expandedA.split(":").slice(0, 3).join(":");
      const prefixB = expandedB.split(":").slice(0, 3).join(":");

      // Special case for ::
      const unspecifiedPrefix = "0000:0000:0000";
      if (prefixA === unspecifiedPrefix && prefixB !== unspecifiedPrefix)
        return false;

      return prefixA === prefixB;
    } catch (e) {
      console.warn("IPv6 range comparison error:", e);
      return false;
    }
  } else if (!isIpAV6 && !isIpBV6) {
    // IPv4: Compare /16 prefix (first 2 octets)
    try {
      const partsA = ipA.split(".");
      const partsB = ipB.split(".");
      if (partsA.length !== 4 || partsB.length !== 4) return false;

      const prefixA = partsA.slice(0, 2).join(".");
      const prefixB = partsB.slice(0, 2).join(".");

      if (
        !/^\d{1,3}(\.\d{1,3})$/.test(prefixA) ||
        !/^\d{1,3}(\.\d{1,3})$/.test(prefixB)
      ) {
        return false;
      }

      return prefixA === prefixB;
    } catch (e) {
      console.warn("IPv4 range comparison error:", e);
      return false;
    }
  }

  return false; // One IPv4, one IPv6
}

/**
 * Stub function kept for future use
 */
export function isCdnAllowlisted(ip, domain) {
  return false;
}
