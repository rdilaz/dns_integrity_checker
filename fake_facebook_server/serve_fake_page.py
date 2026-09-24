import http.server
import socketserver
import ssl
import os

# Default to standard HTTPS port (443)
PORT = 443

# Get the paths for the files we need
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
CERT_DIR = os.path.join(SCRIPT_DIR, "..", "openssl")

# Certificate files - should have www.facebook.com as CN
CERT_FILE = os.path.join(CERT_DIR, "fakefacebook.crt")
KEY_FILE = os.path.join(CERT_DIR, "fakefacebook.key")

# Verify cert files exist
if not os.path.exists(CERT_FILE) or not os.path.exists(KEY_FILE):
    print(f"Error: Certificate or Key file not found.")
    print(f"Looked for cert: {CERT_FILE}")
    print(f"Looked for key:  {KEY_FILE}")
    print("These files are not in the repo. Generate them first: see openssl/README.md")
    exit(1)

# Change to script directory to serve files from there
os.chdir(SCRIPT_DIR)

# Set up HTTP request handler
Handler = http.server.SimpleHTTPRequestHandler

# Set up SSL context
context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)

# Load certificate and key
try:
    context.load_cert_chain(certfile=CERT_FILE, keyfile=KEY_FILE)
except Exception as e:
    print(f"Error with certificates: {e}")
    exit(1)

# Create server
try:
    httpd = socketserver.TCPServer(("", PORT), Handler)
except OSError as e:
    print(f"Error: Can't use port {PORT}: {e}")
    if PORT < 1024:
        print("You probably need to run with admin/sudo for port 443")
    exit(1)

# Enable HTTPS
httpd.socket = context.wrap_socket(httpd.socket, server_side=True)

# Show server info
print(f"Serving FAKE Facebook page over HTTPS at https://localhost:{PORT}")
print(f"Using cert: {CERT_FILE}")
print(f"Using key:  {KEY_FILE}")
print("Press Ctrl+C to stop the server.")

# Run server
try:
    httpd.serve_forever()
except KeyboardInterrupt:
    # Handle Ctrl+C
    print("\nServer stopped.")
except Exception as e:
    # Catch other server errors
    print(f"Error: {e}")
finally:
    print("Shutting down server.")
    httpd.server_close()