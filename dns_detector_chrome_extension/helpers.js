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
          // console.warn(`DoH request failed for ${domain} (${response.url}): ${response.status} ${response.statusText}`); // More detail
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
            `Error parsing DoH response for ${domain} (${response.url}):`, // More detail
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
      // console.debug(`[isIpRelatedToDohSet] IP range match: ${connectedIp} related to ${dohIp}`); // Reduced logging
      return true;
    }
  }

  return false;
}

/**
 * Expands IPv6 shorthand to canonical form
 * Internal helper function - no 'export'
 */
function expandIPv6(ip) {
  if (!ip || !ip.includes(":")) return ip;

  if (ip.includes("::")) {
    const parts = ip.split("::");
    const segmentsBefore = parts[0]
      ? parts[0].split(":").filter((s) => s.length > 0)
      : [];
    const segmentsAfter = parts[1]
      ? parts[1].split(":").filter((s) => s.length > 0)
      : [];
    const segmentsMissing = 8 - (segmentsBefore.length + segmentsAfter.length);

    if (segmentsMissing < 0) return ip; // Invalid format

    const zeroes = Array(segmentsMissing).fill("0000");
    if (segmentsBefore.length === 0 && segmentsAfter.length > 0) {
      ip = [...zeroes, ...segmentsAfter].join(":");
    } else if (segmentsBefore.length > 0 && segmentsAfter.length === 0) {
      ip = [...segmentsBefore, ...zeroes].join(":");
    } else if (segmentsBefore.length > 0 && segmentsAfter.length > 0) {
      ip = [...segmentsBefore, ...zeroes, ...segmentsAfter].join(":");
    } else { // Only ::
      ip = zeroes.join(":");
    }
  }

  const finalSegments = ip
    .split(":")
    .map((segment) => segment.padStart(4, "0"));
  // Check if it formed a valid IPv6 length after padding; if not, return original to avoid breaking malformed input further.
  if (finalSegments.length !== 8 && ip.includes(':')) return ip;

  return finalSegments.join(":");
}

/**
 * Checks if IPs are in same network range (/48 for v6, /16 for v4)
 * Internal helper function - no 'export'
 */
function areIPsInSimilarRange(ipA, ipB) {
  const isIpAV6 = ipA.includes(":");
  const isIpBV6 = ipB.includes(":");

  if (isIpAV6 && isIpBV6) {
    try {
      const expandedA = expandIPv6(ipA);
      const expandedB = expandIPv6(ipB);

      // After expansion, ensure they are valid-looking full IPv6 for proper slicing
      if (
        !expandedA.includes(":") ||
        !expandedB.includes(":") ||
        expandedA.split(':').length !== 8 || // Check for 8 segments after expansion
        expandedB.split(':').length !== 8
      ) {
        return false;
      }

      const prefixA = expandedA.split(":").slice(0, 3).join(":"); // /48 prefix
      const prefixB = expandedB.split(":").slice(0, 3).join(":");

      const unspecifiedPrefix = "0000:0000:0000"; // /48 unspecified
      if (prefixA === unspecifiedPrefix && prefixB !== unspecifiedPrefix)
        return false;

      return prefixA === prefixB;
    } catch (e) {
      console.warn("IPv6 range comparison error:", e, ipA, ipB);
      return false;
    }
  } else if (!isIpAV6 && !isIpBV6) {
    try {
      const partsA = ipA.split(".");
      const partsB = ipB.split(".");
      if (partsA.length !== 4 || partsB.length !== 4) return false;

      const prefixA = partsA.slice(0, 2).join("."); // /16 prefix
      const prefixB = partsB.slice(0, 2).join(".");

      if (
        !/^\d{1,3}(\.\d{1,3})$/.test(prefixA) ||
        !/^\d{1,3}(\.\d{1,3})$/.test(prefixB)
      ) {
        return false;
      }

      return prefixA === prefixB;
    } catch (e) {
      console.warn("IPv4 range comparison error:", e, ipA, ipB);
      return false;
    }
  }
  return false; // One IPv4, one IPv6
}

/**
 * Checks if a given domain is on a basic hardcoded allowlist OR a user-defined custom allowlist.
 * This function is now ASYNCHRONOUS as it needs to fetch the custom list from chrome.storage.
 *
 * @param {string} ip The IP address the browser connected to (currently unused for allowlisting).
 * @param {string} domain The domain being accessed.
 * @returns {Promise<boolean>} A promise that resolves to `true` if the domain matches
 *                             any allowlist pattern, `false` otherwise.
 */
export async function isCdnAllowlisted(ip, domain) {
  // Hardcoded default allowlist patterns
  const defaultAllowlistPatterns = [
    // Suffixes (start with '.')
    '.doubleclick.net',
    '.google.com', // Catches www.google.com, accounts.google.com, aistudio.google.com etc.
    '.googleapis.com',
    '.googleusercontent.com',
    '.googlevideo.com',
    '.gstatic.com',
    '.googletagmanager.com',
    '.googleadservices.com', // Specific for this, as .google.com should catch its parent
    '.facebook.com',
    '.fbcdn.net',
    '.cdninstagram.com',
    '.akamaized.net',
    '.cloudfront.net',
    '.azureedge.net',
    '.cdn.cloudflare.net',
    '.cdn.fastly.net',
    '.openwebmp.com', // Added based on previous feedback
    // Add more common CDN/Ad suffixes here as needed
  ];

  // Check domain against the default hardcoded list
  if (domain) { // Ensure domain is valid
    for (const pattern of defaultAllowlistPatterns) {
      if (pattern.startsWith('.') && domain.endsWith(pattern)) {
        // console.debug(`[Allowlist Check - Default] Domain '${domain}' matches suffix '${pattern}'. Allowlisted.`);
        return true; // Immediately return true if a match is found
      } else if (!pattern.startsWith('.') && domain === pattern) { // For exact domain matches
        // console.debug(`[Allowlist Check - Default] Domain '${domain}' matches exact '${pattern}'. Allowlisted.`);
        return true;
      }
    }
  }

  // Fetch and check custom allowlist from storage
  try {
    const { customAllowlist = [] } = await chrome.storage.local.get({ customAllowlist: [] });
    if (domain) { // Ensure domain is valid
      for (const pattern of customAllowlist) {
        if (pattern.startsWith('.') && domain.endsWith(pattern)) {
          // console.debug(`[Allowlist Check - Custom] Domain '${domain}' matches suffix '${pattern}'. Allowlisted.`);
          return true;
        } else if (!pattern.startsWith('.') && domain === pattern) {
          // console.debug(`[Allowlist Check - Custom] Domain '${domain}' matches exact '${pattern}'. Allowlisted.`);
          return true;
        }
      }
    }
  } catch (error) {
    console.error("Error fetching/checking custom allowlist:", error);
    // Fall through to return false if there's an error reading storage
  }

  // console.debug(`[Allowlist Check] Domain '${domain}' not on any allowlist.`);
  return false; // Default: Not allowlisted if no match found in either list
}