# DNS Integrity Checker Project

This project provides tools to detect potential DNS manipulation by comparing results from the system/browser's resolver against a trusted DNS-over-HTTPS (DoH) provider.

It consists of two main parts:

1.  **Python CLI Script (`dns_detector_python/`):** A standalone script to manually check domain resolutions.
2.  **Chrome Extension (`dns_detector_chrome/`):** An extension that monitors browser connections in real-time and alerts on discrepancies.

## 1. Python CLI Script (`dns_detector.py`)

Checks DNS resolution for specified domains using both the system resolver and Google's DoH service, flagging discrepancies.

### Features

-   Accepts one or more domain names via CLI.
-   Resolves domains using `socket.getaddrinfo` (system resolver).
-   Resolves domains using Google DoH (`https://dns.google/resolve`).
-   Compares IP address sets and warns if system resolution includes IPs not found via DoH.
-   Basic error handling for network and resolution issues.

### Requirements

-   Python 3.6+
-   `requests` library (`pip install requests`)

### Usage

```bash
# Install dependencies
pip install requests

# Run the script
python dns_detector_python/dns_detector.py <domain1> [domain2 ...]

# Example
python dns_detector_python/dns_detector.py example.com google.com nonexistentsite.xyz

# Testing:
1. Modify /etc/hosts (Linux/macOS)  C:\Windows\System32\drivers\etc\hosts (Windows):
    Add an entry to manually override a domain's IP address. For example, add this line to point example.com to a local or incorrect IP
    "1.2.3.4 example.com"

2. Run the script:
    python dns_detector_python/dns_detector.py example.com

3. Expected Output:
You should see a warning indicating that 1.2.3.4 (or whatever IP you used) was resolved by the system but not found in the DoH results.
    [*] Checking domain: example.com
        System IPs: {'1.2.3.4', '93.184.216.34'}  <-- May vary depending on your hosts file and actual DNS
        DoH IPs   : {'93.184.216.34'}             <-- Actual IPs from Google DoH
    [!] WARNING: Potential DNS Spoofing Detected for example.com!
        Suspicious IPs (System only): {'1.2.3.4'}

