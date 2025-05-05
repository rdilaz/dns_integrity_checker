/**
 * Performs DNS-over-HTTPS (DoH) lookups for both A (IPv4) and AAAA (IPv6)
 * records using Google's public DNS
 *
 * @param {string} domain The domain name to look up.
 * @returns {Promise<Set<string>>} A promise that resolves to a Set containing both
 *                                 IPv4 and IPv6 address strings found.
 *                                 Returns an empty Set if lookups fail or no
 *                                 A/AAAA records are found.
 */
export async function dohLookup(domain) { // <<< ENSURE 'export' IS HERE
    const aQueryUrl = `https://dns.google/resolve?name=${encodeURIComponent(domain)}&type=A`;
    const aaaaQueryUrl = `https://dns.google/resolve?name=${encodeURIComponent(domain)}&type=AAAA`;
    const allIps = new Set();
  
    const fetchOptions = {
      method: 'GET',
      headers: { 'accept': 'application/dns-json' },
    };
  
    try {
      const results = await Promise.allSettled([
        fetch(aQueryUrl, fetchOptions),
        fetch(aaaaQueryUrl, fetchOptions)
      ]);
  
      for (const result of results) {
        if (result.status === 'fulfilled') {
          const response = result.value;
          if (!response.ok) {
            console.warn(`DoH request failed for ${domain} (${response.url}): ${response.status} ${response.statusText}`);
            continue;
          }
          try {
            const json = await response.json();
            if (json.Status === 0 && Array.isArray(json.Answer)) {
              json.Answer.forEach(record => {
                if ((record.type === 1 || record.type === 28) && record.data) {
                  allIps.add(record.data);
                }
              });
            }
          } catch (parseError) {
            console.error(`Error parsing DoH JSON response for ${domain} (${response.url}):`, parseError);
          }
        } else {
          console.error(`DoH fetch promise rejected for ${domain}:`, result.reason);
        }
      }
    } catch (error) {
      console.error(`Unexpected error during parallel DoH lookups for ${domain}:`, error);
    }
    return allIps;
  }
  
  
  /**
   * Checks if the connected IP is either an exact match or within a similar
   * heuristically determined network range (/48 for v6, /16 for v4)
   * as any of the IPs resolved via DoH. This helps reduce false positives
   * from CDNs and load balancers using large IP pools.
   *
   * @param {string} connectedIp The IP the browser connected to.
   * @param {Set<string>} dohIpSet The set of IPs resolved via DoH.
   * @returns {boolean} True if an exact match or similar range is found, false otherwise.
   */
  export function isIpRelatedToDohSet(connectedIp, dohIpSet) { // <<< ENSURE 'export' IS HERE
      // First, check for an exact match (most common and reliable)
      if (dohIpSet.has(connectedIp)) {
          return true;
      }
  
      // If no exact match, iterate through DoH IPs and check ranges
      for (const dohIp of dohIpSet) {
          if (areIPsInSimilarRange(connectedIp, dohIp)) {
               console.debug(`[isIpRelatedToDohSet] Related IP found via range check: ${connectedIp} seems related to DoH IP ${dohIp}`);
              return true; // Found a related IP
          }
      }
  
      // No exact match and no similar range found
      return false;
  }
  
  // --- Internal Helper Functions ---
  
  /**
   * Expands IPv6 shorthand notation to a more canonical form for comparison.
   * Note: This is a simplified version and might not handle all edge cases perfectly.
   * A dedicated IP address library would be more robust.
   * @param {string} ip - IPv6 address string.
   * @returns {string} Expanded IPv6 address string or original if not v6/error.
   */
  function expandIPv6(ip) {
      if (!ip || !ip.includes(':')) return ip; // Not IPv6 or empty
  
      // Handle the :: case
      if (ip.includes('::')) {
          const parts = ip.split('::');
          const segmentsBefore = parts[0] ? parts[0].split(':').filter(s => s.length > 0) : [];
          const segmentsAfter = parts[1] ? parts[1].split(':').filter(s => s.length > 0) : [];
          const segmentsMissing = 8 - (segmentsBefore.length + segmentsAfter.length);
  
          if (segmentsMissing < 0) return ip; // Invalid format
  
          const zeroes = Array(segmentsMissing).fill('0000');
          // Handle edge cases like '::1' or '1::'
          if (segmentsBefore.length === 0 && segmentsAfter.length > 0) { // Starts with ::
               ip = [...zeroes, ...segmentsAfter].join(':');
          } else if (segmentsBefore.length > 0 && segmentsAfter.length === 0) { // Ends with ::
               ip = [...segmentsBefore, ...zeroes].join(':');
          } else if (segmentsBefore.length > 0 && segmentsAfter.length > 0) { // :: is in the middle
               ip = [...segmentsBefore, ...zeroes, ...segmentsAfter].join(':');
          } else { // Only ::
               ip = zeroes.join(':');
          }
      }
  
      // Pad individual segments
      const finalSegments = ip.split(':').map(segment => segment.padStart(4, '0'));
      if (finalSegments.length !== 8) return ip; // Invalid format after expansion attempt
  
      return finalSegments.join(':');
  }
  
  /**
   * Checks if two IP addresses likely belong to the same network range,
   * focusing on common *allocation* sizes for comparison (/48 for v6, /16 for v4).
   * THIS IS A HEURISTIC AND NOT A PERFECT NETWORK CHECK. Aims to reduce noise.
   *
   * @param {string} ipA An IP address string (v4 or v6).
   * @param {string} ipB Another IP address string (v4 or v6).
   * @returns {boolean} True if they seem to be in the same wider range, false otherwise.
   */
  function areIPsInSimilarRange(ipA, ipB) { // <<< NOTE: This one is INTERNAL, no 'export' needed
      const isIpAV6 = ipA.includes(':');
      const isIpBV6 = ipB.includes(':');
  
      if (isIpAV6 && isIpBV6) {
          // --- IPv6 Comparison: Compare the /48 prefix (first 3 segments) ---
          try {
              const expandedA = expandIPv6(ipA);
              const expandedB = expandIPv6(ipB);
  
              if (!expandedA.includes(':') || !expandedB.includes(':') || expandedA.length < 15 || expandedB.length < 15) {
                   return false;
              }
  
              const prefixA = expandedA.split(':').slice(0, 3).join(':');
              const prefixB = expandedB.split(':').slice(0, 3).join(':');
  
              const unspecifiedPrefix = '0000:0000:0000';
              if (prefixA === unspecifiedPrefix && prefixB !== unspecifiedPrefix) return false;
  
              return prefixA === prefixB;
          } catch (e) {
               console.warn("Error during IPv6 /48 range comparison:", e, ipA, ipB);
               return false;
          }
  
      } else if (!isIpAV6 && !isIpBV6) {
          // --- IPv4 Comparison: Compare the /16 prefix (first 2 octets) ---
          try {
              const partsA = ipA.split('.');
              const partsB = ipB.split('.');
              if (partsA.length !== 4 || partsB.length !== 4) return false;
  
              const prefixA = partsA.slice(0, 2).join('.');
              const prefixB = partsB.slice(0, 2).join('.');
  
              if (!/^\d{1,3}(\.\d{1,3})$/.test(prefixA) || !/^\d{1,3}(\.\d{1,3})$/.test(prefixB)) {
                  return false;
              }
              return prefixA === prefixB;
          } catch (e) {
              console.warn("Error during IPv4 /16 range comparison:", e, ipA, ipB);
              return false;
          }
      }
  
      return false; // Mix of v4 and v6
  }
  
  
  /**
   * [STUB FUNCTION - Kept for structural consistency but NOT USED by background.js anymore]
   * Checks if a given domain is on a basic allowlist.
   * This approach is superseded by the isIpRelatedToDohSet range check.
   */
  export function isCdnAllowlisted(ip, domain) { // <<< ENSURE 'export' IS HERE (even though it's not used for alerting)
      // console.debug("isCdnAllowlisted function called (but its result is ignored)");
      return false; // Always return false as the logic is handled elsewhere now
  }