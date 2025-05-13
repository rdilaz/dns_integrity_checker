import http.server
import socketserver
import ssl
import os

PORT = 443 # Standard HTTPS port, requires sudo/admin to run
# PORT = 8443 # Or use a non-privileged port like 8443

# --- Configuration ---
# Directory containing the script (fake_facebook_server)
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
# Directory containing certificates (assumes 'openssl' is sibling to SCRIPT_DIR)
CERT_DIR = os.path.join(SCRIPT_DIR, '..', 'openssl')

# Certificate files
CERT_FILE = os.path.join(CERT_DIR, 'fakefacebook.crt')
KEY_FILE = os.path.join(CERT_DIR, 'fakefacebook.key')

# --- Validation ---
if not os.path.exists(CERT_FILE) or not os.path.exists(KEY_FILE):
    print(f"Error: Certificate or Key file not found.")
    print(f"Looked for cert: {CERT_FILE}")
    print(f"Looked for key:  {KEY_FILE}")
    print("Please ensure certificates are generated in the 'openssl' directory adjacent to this server's directory.")
    exit(1)

# --- Server Setup ---
# Change to the script's directory to serve index.html from here
os.chdir(SCRIPT_DIR)

# Create the base HTTP request handler
Handler = http.server.SimpleHTTPRequestHandler

# Create an SSL context
# Use PROTOCOL_TLS_SERVER for modern TLS, better than older SSL versions
context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)

# Load the server certificate and private key
try:
    context.load_cert_chain(certfile=CERT_FILE, keyfile=KEY_FILE)
except ssl.SSLError as e:
    print(f"Error loading certificate chain: {e}")
    print("Ensure the certificate and key files are valid and match.")
    exit(1)
except FileNotFoundError:
    # This case should be caught by the earlier check, but belts and suspenders
    print(f"Error: load_cert_chain could not find cert/key files.")
    print(f"Cert path: {CERT_FILE}")
    print(f"Key path:  {KEY_FILE}")
    exit(1)

# Create the TCPServer instance
# We create it first, then wrap its socket with SSL
try:
    httpd = socketserver.TCPServer(("", PORT), Handler)
except OSError as e:
    print(f"Error creating server on port {PORT}: {e}")
    if PORT == 443 and os.name != 'nt': # Common permission error on Linux/macOS for port 443
         print("Hint: Running on port 443 typically requires administrator (sudo) privileges.")
    elif PORT == 443 and os.name == 'nt':
         print("Hint: Running on port 443 may require running the terminal as Administrator.")
    exit(1)

# Wrap the server's socket with the SSL context BEFORE serving
httpd.socket = context.wrap_socket(httpd.socket, server_side=True)

print(f"Serving FAKE Facebook page over HTTPS at https://localhost:{PORT}")
print(f"Using cert: {CERT_FILE}")
print(f"Using key:  {KEY_FILE}")
print(f"If spoofing, direct 'www.facebook.com' to your local IP (port {PORT}).")
print("Ensure MyDemoRootCA.pem is installed and trusted in your system/browser.")
print("Press Ctrl+C to stop the server.")

try:
    httpd.serve_forever()
except KeyboardInterrupt:
    print("\nServer stopped.")
except Exception as e:
    print(f"Server runtime error: {e}")
finally:
    print("Shutting down server.")
    httpd.server_close()