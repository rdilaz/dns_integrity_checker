# DNS Integrity Checker - Chrome Extension

This Chrome extension monitors websites you visit in real-time. If the IP address your browser connects to for a domain is not found in the list of valid IPs obtained via Google DoH (and isn't recognized as a common CDN IP), it triggers a browser notification and logs the event.

## Installation (Loading Unpacked Extension)

1.  **Download/Clone:** Make sure you have the `dns_detector_chrome` directory containing `manifest.json`, `background.js`, `helpers.js`, `popup.html`, `popup.js`, `style.css`, and the `icons/` folder.
2.  **Create Icons:** Create placeholder icons named `icon16.png`, `icon48.png`, and `icon128.png` inside the `icons/` directory. Simple colored squares will work for testing.
3.  **Open Chrome Extensions:** Open Google Chrome, navigate to `chrome://extensions`.
4.  **Enable Developer Mode:** Ensure the "Developer mode" toggle switch (usually in the top-right corner) is turned ON.
5.  **Load Unpacked:** Click the "Load unpacked" button.
6.  **Select Directory:** In the file dialog, navigate to and select the `dns_detector_chrome` directory (the one containing `manifest.json`). Click "Select Folder".
7.  **Verify:** The "DNS Integrity Checker" extension should now appear in your list of extensions. Ensure there are no errors displayed on its card.

## Testing DNS Spoofing

To effectively test the extension, you need to make your *browser* resolve a domain name to an IP address that differs from the IP addresses returned by Google's DoH service (`https://dns.google/resolve`).

**Method: Using `dnsmasq` on a Local Network (Recommended)**

This simulates a more realistic network-level spoofing scenario.

1.  **Set up a Test Machine:** Use a separate machine (physical or VM) on your local network. Let's call its IP address `192.168.1.100` (replace with the actual IP).
2.  **Install `dnsmasq`:** On the test machine (`192.168.1.100`), install `dnsmasq`.
    *   Debian/Ubuntu: `sudo apt update && sudo apt install dnsmasq`
    *   Fedora/CentOS: `sudo dnf install dnsmasq` or `sudo yum install dnsmasq`
    *   macOS (Homebrew): `brew install dnsmasq`
3.  **Configure `dnsmasq`:** Edit the `dnsmasq` configuration file (e.g., `/etc/dnsmasq.conf` or create a file in `/etc/dnsmasq.d/`). Add a line to spoof a specific domain. For example, to make `test-spoof.com` resolve to `1.2.3.4`:
    ```conf
    # /etc/dnsmasq.conf or /etc/dnsmasq.d/spoof.conf
    address=/test-spoof.com/1.2.3.4
    # Optional: Point other queries to a real upstream DNS
    server=8.8.8.8
    server=1.1.1.1
    ```
    *Important:* Choose a domain you *don't* normally use (`test-spoof.com` is just an example). Using common domains like `example.com` might cause issues if they use HSTS preloading.
4.  **Restart `dnsmasq`:** Apply the changes:
    ```bash
    sudo systemctl restart dnsmasq
    # or
    sudo service dnsmasq restart
    # or for brew on macOS
    sudo brew services restart dnsmasq
    ```
5.  **Configure Client DNS:** On the machine where you are running Chrome *with the extension installed*, change its DNS settings to point *only* to the `dnsmasq` server (`192.168.1.100`).
    *   **Windows:** Network & Internet settings -> Change adapter options -> Right-click connection -> Properties -> IPv4 -> Properties -> Use the following DNS server addresses -> Set Preferred DNS server to `192.168.1.100`.
    *   **macOS:** System Preferences/Settings -> Network -> Select active connection (Wi-Fi/Ethernet) -> Advanced... -> DNS -> Remove existing servers and add `192.168.1.100`.
    *   **Linux:** Network Manager GUI or edit `/etc/resolv.conf` (may be overwritten) to contain only `nameserver 192.168.1.100`.
6.  **Flush DNS Cache:** Clear the local DNS cache on the client machine.
    *   Windows: `ipconfig /flushdns` (in Command Prompt as Admin)
    *   macOS: `sudo dscacheutil -flushcache; sudo killall -HUP mDNSResponder`
    *   Linux: Depends on system (`sudo systemd-resolve --flush-caches` or `sudo resolvectl flush-caches` or `sudo /etc/init.d/nscd restart`).
7.  **Clear Browser Cache:** Clear Chrome's cache (especially host cache: `chrome://net-internals/#dns` -> Clear host cache). Restart Chrome for good measure.
8.  **Test Navigation:** Open Chrome and navigate to `http://test-spoof.com` (use HTTP first to avoid potential HTTPS certificate errors immediately stopping the connection).
9.  **Verify Notification:** The extension should perform the DoH lookup for `test-spoof.com` (which will return legitimate IPs or NXDOMAIN) but see that the browser connected to `1.2.3.4`. Since `1.2.3.4` is not in the DoH set (and not allowlisted), a Chrome notification should appear.
10. **Check Popup:** Click the extension icon. The popup should list the alert for `test-spoof.com`.
11. **Clean Up:** Remember to revert the DNS settings on your client machine and stop/disable the spoofing rule in `dnsmasq` on the test server.

**Alternative (Less Reliable): `/etc/hosts`**

While the Python script uses `/etc/hosts` effectively, browsers (especially Chrome) often bypass `/etc/hosts` for various reasons (internal DNS client, DoH settings in the browser itself, prefetching). It's less reliable for *forcing* the browser to connect to the spoofed IP for this specific extension test. Use the `dnsmasq` method if possible.

## Testing CDN Allowlisting (Negative Test)

1.  Ensure your client machine's DNS settings are back to normal (e.g., automatic/DHCP or pointing to standard resolvers like 8.8.8.8).
2.  Navigate to websites known to be heavily reliant on CDNs, such as:
    *   `https://www.cloudflare.com/`
    *   `https://aws.amazon.com/` (uses CloudFront)
    *   `https://www.google.com/` (uses Google Global Cache)
    *   Major news websites often use Akamai or Fastly.
3.  **Expected Behavior:** You should *not* receive DNS spoofing notifications for these sites. Even though the IP you connect to might differ from the *origin server's* A records (which DoH often returns), the `isCdnAllowlisted` function (once properly implemented) would ideally recognize these IPs as legitimate CDN nodes. *Currently, the stub function returns `false`, so you might get false positives until it's implemented.*

## Viewing Logs

You can view `console.log`, `console.warn`, and `console.error` messages from the background script:
1. Go to `chrome://extensions`.
2. Find the "DNS Integrity Checker" extension card.
3. Click the "Service worker" link. This opens the DevTools for the background script. Check the "Console" tab.