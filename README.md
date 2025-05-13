# DNS Integrity Checker Project

This project provides a Chrome Extension to detect potential DNS manipulation by comparing the IP address your browser connects to against results from a trusted DNS-over-HTTPS (DoH) provider. It also includes helper scripts to demonstrate DNS spoofing locally using a fake HTTPS server.

## Chrome Extension (`dns_detector_chrome_extension/`)

Monitors websites you visit in real-time. If the IP address your browser connects to for a domain differs significantly (i.e., is not an exact match and not within a likely related network range based on `/16` or `/48` prefixes) from the IPs returned by Google DoH, it triggers a browser notification and logs the event. The extension includes an On/Off toggle in its popup.

### Features

*   Listens for completed web requests (`webRequest.onCompleted`).
*   Extracts the final connected IP address.
*   Performs DoH lookups (for IPv4 & IPv6) for the requested domain using Google DoH.
*   Compares the connected IP against DoH results using exact matching and network range heuristics (/16 for IPv4, /48 for IPv6) to reduce false positives from CDNs.
*   Shows a Chrome notification on significant mismatch.
*   Stores recent alerts in `chrome.storage.local`.
*   Provides a popup UI to view recent alerts and toggle monitoring On/Off.

### Installation (Loading Unpacked Extension)

1.  **Ensure Code:** Make sure you have the `dns_detector_chrome_extension` directory containing `manifest.json`, `background.js`, `helpers.js`, `popup.html`, `popup.js`, `style.css`, and the `icons/` folder (with `icon16.png`, `icon48.png`, `icon128.png`).
2.  **Open Chrome Extensions:** Open Google Chrome, navigate to `chrome://extensions`.
3.  **Enable Developer Mode:** Ensure the "Developer mode" toggle switch (usually in the top-right corner) is turned ON.
4.  **Load Unpacked:** Click the "Load unpacked" button.
5.  **Select Directory:** In the file dialog, navigate to and select the `dns_detector_chrome_extension` directory (the one containing `manifest.json`). Click "Select Folder".
6.  **Verify:** The "DNS Integrity Checker" extension should now appear in your list of extensions. Ensure it's enabled and there are no errors displayed on its card. Click the puzzle icon in your toolbar to pin the extension for easy access to the popup.

## Demoing DNS Spoofing with a Fake HTTPS Server

This setup allows you to redirect a real HTTPS site (like `www.facebook.com`) to a fake page served locally from your machine, demonstrating how the extension detects the resulting IP mismatch. This involves creating local SSL certificates and temporarily trusting them.

**⚠️ Security Warning:** This process involves creating and trusting a custom Root Certificate Authority (CA). This temporarily lowers your system's security for connections to the spoofed domain. **It is CRITICAL to remove the custom Root CA from your system's trust store after completing the demo.**

### Prerequisites

*   **Git:** Required for cloning/managing the project.
*   **Python 3:** Required to run the local fake web server.
*   **OpenSSL:** Required for generating certificates.
    *   Linux/macOS: Usually pre-installed. Verify with `openssl version`.
    *   Windows: Download and install from a reputable source like [slproweb.com/products/Win32OpenSSL.html](https://slproweb.com/products/Win32OpenSSL.html). Ensure `openssl.exe` is in your system's PATH.
*   **Administrator/sudo privileges:** Needed for installing the Root CA, modifying the hosts file, and potentially running the server on port 443.

### Setup Steps

**(Perform these steps inside the project's root directory in your terminal/command prompt)**

1.  **Generate Certificates:**
    *   Navigate to the `openssl` (or `mitm_certs`) directory within the project.
        ```bash
        cd openssl
        ```
    *   **Windows Only - Set OpenSSL Config Path:** Find your `openssl.cnf` file (e.g., in `C:\Program Files\OpenSSL-Win64\share`). Set the environment variable *before* running openssl commands:
        ```powershell
        # In PowerShell (replace with your actual path)
        $env:OPENSSL_CONF="C:\Program Files\OpenSSL-Win64\share\openssl.cnf"
        ```
        ```cmd
        # In CMD (replace with your actual path)
        set OPENSSL_CONF=C:\Program Files\OpenSSL-Win64\share\openssl.cnf
        ```
    *   Generate Root CA key:
        ```bash
        openssl genrsa -out MyDemoRootCA.key 2048
        ```
    *   Generate Root CA certificate (`.pem` file): (Enter dummy info, use "My Demo Root CA" for Common Name)
        ```bash
        openssl req -x509 -new -nodes -key MyDemoRootCA.key -sha256 -days 1024 -out MyDemoRootCA.pem
        ```
    *   Generate Fake Server key: (Using `fakefacebook` as example)
        ```bash
        openssl genrsa -out fakefacebook.key 2048
        ```
    *   Create CSR for Fake Server: (**Crucially, use `www.facebook.com` for Common Name**)
        ```bash
        openssl req -new -key fakefacebook.key -out fakefacebook.csr
        ```
    *   Ensure `v3.ext` file exists in this directory with correct SANs (Subject Alternative Names):
        ```ini
        # v3.ext content:
        authorityKeyIdentifier=keyid,issuer
        basicConstraints=CA:FALSE
        keyUsage = digitalSignature, nonRepudiation, keyEncipherment, dataEncipherment
        subjectAltName = @alt_names

        [alt_names]
        DNS.1 = www.facebook.com
        DNS.2 = facebook.com
        DNS.3 = login.facebook.com
        # Add other relevant subdomains if needed
        ```
    *   Sign the Server CSR with your Root CA:
        ```bash
        openssl x509 -req -in fakefacebook.csr -CA MyDemoRootCA.pem -CAkey MyDemoRootCA.key -CAcreateserial -out fakefacebook.crt -days 500 -sha256 -extfile v3.ext
        ```
    *   Navigate back to the project root directory: `cd ..`

2.  **Install Your Root CA (`MyDemoRootCA.pem`) as Trusted:**
    *   **Windows:** Double-click `openssl/MyDemoRootCA.pem`, Install Certificate -> Current User -> Place in store -> Browse -> **Trusted Root Certification Authorities** -> OK -> Next -> Finish. Acknowledge warnings.
    *   **macOS:** Open Keychain Access.app -> System keychain -> Drag `openssl/MyDemoRootCA.pem` into certificates -> Find "My Demo Root CA" -> Double-click -> Trust -> Set "When using..." to "**Always Trust**" -> Close (enter password if needed).
    *   **Linux (Debian/Ubuntu):** `sudo cp openssl/MyDemoRootCA.pem /usr/local/share/ca-certificates/MyDemoRootCA.crt && sudo update-ca-certificates`. Import into Firefox manually if needed.
    *   **Restart your browser completely** after installing the certificate.

3.  **Modify Hosts File:**
    *   Edit your system's hosts file with administrator/sudo privileges.
    *   Add the line (ensure it's not commented out with `#`):
        ```
        127.0.0.1 www.facebook.com facebook.com login.facebook.com m.facebook.com
        ```
    *   Save the hosts file.

4.  **Flush DNS Cache:**
    *   Windows: `ipconfig /flushdns` (as admin)
    *   macOS: `sudo dscacheutil -flushcache; sudo killall -HUP mDNSResponder`
    *   Linux: `sudo systemd-resolve --flush-caches` or `sudo resolvectl flush-caches`

5.  **Start the Fake HTTPS Server:**
    *   Navigate to the server directory (e.g., `fake_facebook_server`).
        ```bash
        cd fake_facebook_server
        ```
    *   Run the Python HTTPS server script (using `sudo`/admin if using port 443):
        ```bash
        # If using port 443
        sudo python3 serve_fake_fb_https.py
        # Or (Windows Admin terminal): python3 .\serve_fake_fb_https.py
        # Or (If using port like 8443): python3 serve_fake_fb_https.py
        ```
    *   Keep this terminal running.

### Running the Demo

1.  **Check Extension:** Ensure the DNS Integrity Checker extension is loaded, enabled (via popup toggle), and has no errors. Open its Service Worker console to view logs (`chrome://extensions` -> DNS Integrity Checker -> Service worker).
2.  **Clear Browser Cache:** (Recommended) Clear browser cache and host cache (`chrome://net-internals/#dns` -> Clear host cache) one last time. Restarting Chrome can help.
3.  **Visit Spoofed Site:** Open a new tab and navigate to `https://www.facebook.com` (or `https://www.facebook.com/login.php`).
4.  **Observe:**
    *   The browser should connect to your local Python HTTPS server (running on `127.0.0.1`).
    *   Because you installed and trusted `MyDemoRootCA.pem`, the browser should trust the `fakefacebook.crt` presented by the server. You should see your fake Facebook page load over HTTPS (check the padlock details - it should show verified by "My Demo Root CA").
    *   The Python server terminal will show successful HTTPS requests (e.g., `GET / HTTP/1.1" 200 -`).
    *   The **DNS Integrity Checker** extension's Service Worker console will log the connection (`Connected IP=127.0.0.1`). It will perform a DoH lookup for `www.facebook.com` (getting real Facebook IPs). The range check between `127.0.0.1` and real Facebook IPs will fail (`isConsideredMatch: false`).
    *   An **Alert** notification should appear, and the event should be logged in the extension's popup.

### !! CRITICAL CLEANUP !!

1.  **Stop the Fake Server:** Press `Ctrl+C` in its terminal.
2.  **Remove Hosts File Entry:** Edit your hosts file (admin/sudo) and delete or comment out the `127.0.0.1 ...facebook.com...` line. Save the file.
3.  **Flush DNS Cache:** Run the flush command for your OS again.
4.  **Uninstall/Remove the Custom Root CA:** This is essential!
    *   **Windows:** Control Panel -> Internet Options -> Content -> Certificates -> Trusted Root Certification Authorities -> Find "My Demo Root CA" -> Remove.
    *   **macOS:** Keychain Access -> System -> Certificates -> Find "My Demo Root CA" -> Right-click/Delete.
    *   **Linux:** `sudo rm /usr/local/share/ca-certificates/MyDemoRootCA.crt && sudo update-ca-certificates`. Remove from Firefox store if added.
5.  **Restart your browser.**

---