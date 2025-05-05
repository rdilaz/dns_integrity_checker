import socket
import argparse
import sys
from typing import Set, Optional
import requests
from requests.exceptions import RequestException
import json

# --- Configuration ---
DOH_RESOLVER_URL = "https://dns.google/resolve"
REQUEST_TIMEOUT = 5  # seconds

# --- Core Functions ---

def resolve_system(domain: str) -> Set[str]:
    """
    Resolves a domain name to a set of IPv4 addresses using the system's
    default resolver.

    Args:
        domain: The domain name to resolve.

    Returns:
        A set of IPv4 address strings, or an empty set if resolution fails
        or no IPv4 addresses are found.
    """
    ips: Set[str] = set()
    try:
        # Use getaddrinfo for robust resolution (handles IPv4/IPv6)
        # Filter for IPv4 (AF_INET) addresses
        addr_info = socket.getaddrinfo(domain, None, socket.AF_INET)
        for item in addr_info:
            # item[4] is the sockaddr tuple, item[4][0] is the IP address
            ips.add(item[4][0])
    except socket.gaierror as e:
        print(f"[!] System DNS Error for {domain}: {e}", file=sys.stderr)
    except Exception as e:
        print(f"[!] Unexpected System DNS Error for {domain}: {e}", file=sys.stderr)
    return ips

def resolve_doh(domain: str) -> Set[str]:
    """
    Resolves a domain name to a set of IPv4 addresses using a DNS-over-HTTPS
    (DoH) provider (Google).

    Args:
        domain: The domain name to resolve.

    Returns:
        A set of IPv4 address strings, or an empty set if resolution fails,
        no A records are found, or an error occurs.
    """
    ips: Set[str] = set()
    params = {'name': domain, 'type': 'A'}
    headers = {'accept': 'application/dns-json'}

    try:
        response = requests.get(
            DOH_RESOLVER_URL,
            params=params,
            headers=headers,
            timeout=REQUEST_TIMEOUT
        )
        response.raise_for_status()  # Raise HTTPError for bad responses (4xx or 5xx)

        data = response.json()

        # Check if the 'Answer' key exists and is a list
        if data.get('Status') == 0 and 'Answer' in data and isinstance(data['Answer'], list):
            for record in data['Answer']:
                # Standard A record type is 1
                if record.get('type') == 1 and 'data' in record:
                    ips.add(record['data'])
        elif data.get('Status') != 0:
            # NXDOMAIN or other DNS error reported by DoH server
            print(f"[-] DoH Warning for {domain}: Status code {data.get('Status')}", file=sys.stderr)

    except RequestException as e:
        print(f"[!] DoH Request Error for {domain}: {e}", file=sys.stderr)
    except json.JSONDecodeError as e:
        print(f"[!] DoH JSON Parse Error for {domain}: {e}", file=sys.stderr)
    except Exception as e:
        print(f"[!] Unexpected DoH Error for {domain}: {e}", file=sys.stderr)

    return ips

def compare_ips(sys_ips: Set[str], doh_ips: Set[str]) -> Set[str]:
    """
    Compares system-resolved IPs against DoH-resolved IPs.

    Args:
        sys_ips: Set of IPs from the system resolver.
        doh_ips: Set of IPs from the DoH resolver.

    Returns:
        A set containing IPs found by the system resolver but NOT by the DoH
        resolver. An empty set indicates no discrepancies were found (or one
        of the lookups failed entirely).
    """
    # We are interested in IPs the system resolved but the trusted source did not.
    # Handle cases where one or both lookups might have failed and returned empty sets.
    if not sys_ips or not doh_ips:
        return set() # Cannot compare if one source failed

    suspicious_ips = sys_ips - doh_ips
    return suspicious_ips

# --- Main Execution ---

def main():
    parser = argparse.ArgumentParser(
        description="Compare system DNS resolution with DoH resolution for potential spoofing detection."
    )
    parser.add_argument(
        "domains",
        metavar="DOMAIN",
        type=str,
        nargs='+',
        help="One or more domain names to check."
    )
    args = parser.parse_args()

    print("--- DNS Integrity Check ---")

    all_clear = True
    for domain in args.domains:
        print(f"\n[*] Checking domain: {domain}")

        sys_ips = resolve_system(domain)
        doh_ips = resolve_doh(domain)

        print(f"    System IPs: {sys_ips or 'Resolution failed/No IPs found'}")
        print(f"    DoH IPs   : {doh_ips or 'Resolution failed/No IPs found'}")

        if not sys_ips and not doh_ips:
            print(f"[-] Could not resolve {domain} via either method.")
            continue # Skip comparison if both failed

        if not sys_ips:
            print(f"[-] System resolver failed for {domain}, skipping comparison.")
            continue

        if not doh_ips:
             print(f"[-] DoH resolver failed for {domain}, skipping comparison.")
             continue # Optionally, you could flag this as suspicious too

        suspicious_ips = compare_ips(sys_ips, doh_ips)

        if suspicious_ips:
            all_clear = False
            print(f"[!] WARNING: Potential DNS Spoofing Detected for {domain}!")
            print(f"    Suspicious IPs (System only): {suspicious_ips}")
        else:
            print(f"[+] OK: System and DoH resolutions match for {domain}.")

    print("\n--- Check Complete ---")
    if all_clear:
        print("Result: No discrepancies detected in the checked domains.")
    else:
        print("Result: Discrepancies detected. Review warnings above.")
        sys.exit(1) # Exit with error code if issues found


if __name__ == "__main__":
    main()