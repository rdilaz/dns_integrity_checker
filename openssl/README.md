# Demo certificates: generate locally, never commit

The spoofing demo needs two things that must **never** be in this repository:

- a throwaway **root CA** (`MyDemoRootCA.key` / `MyDemoRootCA.pem`), which you trust temporarily, and
- a **leaf certificate** for the fake site (`fakefacebook.key` / `fakefacebook.crt`), signed by that CA and served by `fake_facebook_server/serve_fake_page.py`.

You generate all of them yourself with the commands below. `.gitignore` blocks keys, certificates, CSRs and serial files so they can't be committed by accident.

> [!WARNING]
> **Trust the demo CA only while you run the demo, then remove it from your OS and browser trust store** ([removal steps](#remove-the-ca-after-the-demo)).
> While it is trusted, anyone holding `MyDemoRootCA.key` can mint certificates your machine accepts. Never share or commit that key, and generate a fresh CA for every demo.

> [!CAUTION]
> **Did you ever trust the CA that used to be committed in this folder?** Its private key was published in this repo, so anyone can use it to impersonate sites to your machine. **Remove it now** and never trust it again. It is *not* named "My Demo Root CA". It shows up as:
>
> | Field | Value |
> |---|---|
> | Issued to / Common Name | `ryo` (Organization `fakeguy`, Locality `Plymouth`) |
> | Expires | 1 March 2028 |
> | SHA-1 thumbprint | `0512D2EBAE85A4AF020596211533B12D4250368B` |
> | SHA-256 fingerprint | `55:BE:BB:69:AA:C1:0F:96:CE:88:0C:18:41:6F:13:C2:E0:DB:3B:C4:65:21:79:5F:49:87:90:38:77:8B:29:0D` |
>
> Remove it by thumbprint (a `-delstore` that finds nothing just prints an error, which is fine):
>
> - **Windows** (PowerShell or cmd): `certutil -user -delstore Root 0512D2EBAE85A4AF020596211533B12D4250368B`, then the same without `-user` in an **Administrator** terminal in case it was installed for the whole machine. Or use `certmgr.msc` / `certlm.msc` as described [below](#windows) and delete the entry issued to `ryo`.
> - **macOS**: `sudo security delete-certificate -t -Z 0512D2EBAE85A4AF020596211533B12D4250368B /Library/Keychains/System.keychain` and `security delete-certificate -t -Z 0512D2EBAE85A4AF020596211533B12D4250368B ~/Library/Keychains/login.keychain-db`.
> - **Linux (Debian/Ubuntu)**: `sudo rm -f /usr/local/share/ca-certificates/MyDemoRootCA.crt && sudo update-ca-certificates --fresh`.
> - **Chrome / Firefox**: if you imported it into the browser directly, delete it there too (see [Chrome](#chrome) and [Firefox](#firefox)).
>
> Also delete any old copies of `MyDemoRootCA.*` and `fakefacebook.*` from your checkout before generating new ones.

## What's in this folder

| File | In git? | Purpose |
|---|---|---|
| `README.md` | yes | This guide. |
| `demo.cnf` | yes | OpenSSL config for the CA (its name, and a name constraint limiting it to `facebook.com`) and for the CSR. It makes the commands independent of your system's `openssl.cnf`. |
| `v3.ext` | yes | Extensions for the leaf certificate, including the Subject Alternative Names (`www.facebook.com`, `facebook.com`, `login.facebook.com`, `m.facebook.com`). |
| `MyDemoRootCA.key` | **no** | Root CA private key. Generated. Delete it after signing the leaf. |
| `MyDemoRootCA.pem` | **no** | Root CA certificate: the file you trust during the demo. Generated. |
| `MyDemoRootCA.srl` | **no** | Serial-number file OpenSSL writes when signing. Generated. |
| `fakefacebook.key` | **no** | Leaf private key, loaded by the fake server. Generated. |
| `fakefacebook.csr` | **no** | Certificate signing request. Generated, only needed while signing. |
| `fakefacebook.crt` | **no** | Leaf certificate, loaded by the fake server. Generated. |

`fake_facebook_server/serve_fake_page.py` loads `openssl/fakefacebook.crt` and `openssl/fakefacebook.key` (relative to the repo root), so keep these file names and run the commands inside this `openssl/` folder.

## Generate a fresh CA and leaf certificate

Requires OpenSSL 1.1.1 or newer, or LibreSSL (the macOS default). Check with `openssl version`.

Every `openssl` command below is **identical in bash (Linux, macOS, WSL) and PowerShell (Windows)**. Where the shells differ, both versions are shown.

**0. Go to this folder and remove leftovers from a previous run.**

bash:

```bash
cd openssl
rm -f MyDemoRootCA.* fakefacebook.*
```

PowerShell:

```powershell
cd openssl
Remove-Item MyDemoRootCA.*, fakefacebook.* -ErrorAction SilentlyContinue
```

If a previous demo CA is still in your trust store, remove it first ([steps](#remove-the-ca-after-the-demo)).

**1. Create the root CA** (valid 30 days, named "DNS Integrity Checker Demo CA", restricted to `facebook.com` names):

```bash
openssl genrsa -out MyDemoRootCA.key 2048
openssl req -x509 -new -config demo.cnf -key MyDemoRootCA.key -sha256 -days 30 -out MyDemoRootCA.pem
```

**2. Create the leaf key and certificate for the fake site** (valid 30 days):

```bash
openssl genrsa -out fakefacebook.key 2048
openssl req -new -config demo.cnf -key fakefacebook.key -subj "/CN=www.facebook.com" -out fakefacebook.csr
openssl x509 -req -in fakefacebook.csr -CA MyDemoRootCA.pem -CAkey MyDemoRootCA.key -CAcreateserial -out fakefacebook.crt -days 30 -sha256 -extfile v3.ext
```

**3. Check the result.** The first command should print `fakefacebook.crt: OK`:

```bash
openssl verify -CAfile MyDemoRootCA.pem fakefacebook.crt
openssl x509 -in fakefacebook.crt -noout -subject -issuer -enddate
```

**4. Delete the CA private key** (recommended). The fake server needs only `fakefacebook.crt` and `fakefacebook.key`, and your browser needs only `MyDemoRootCA.pem`. Once the CA key is gone, nobody (including malware on your machine) can use your trusted CA to sign anything else. For the next demo you start again from step 0.

bash:

```bash
rm -f MyDemoRootCA.key MyDemoRootCA.srl fakefacebook.csr
cd ..
```

PowerShell:

```powershell
Remove-Item MyDemoRootCA.key, MyDemoRootCA.srl, fakefacebook.csr
cd ..
```

Notes:

- **Git Bash on Windows** rewrites `"/CN=..."` into a file path. Run step 2's `req` command as `MSYS_NO_PATHCONV=1 openssl req ...`, or use PowerShell.
- **Windows "can't open openssl.cnf" errors**: the `req` commands use `-config demo.cnf`, so they shouldn't need your system config. If another command still complains, point `OPENSSL_CONF` at your install's config for that session, for example `$env:OPENSSL_CONF = "C:\Program Files\OpenSSL-Win64\bin\cnf\openssl.cnf"` in PowerShell (the path depends on your OpenSSL build).
- **More hostnames**: add them to `[alt_names]` in `v3.ext` and to your hosts-file line, then re-run step 2. Only `facebook.com` and its subdomains will work, because `demo.cnf` limits the CA to those names. That is deliberate: even if this CA's key leaked, it could not be used against any other site.

## Trust the CA (only for the demo)

Install `MyDemoRootCA.pem` (not the leaf certificate) as a trusted root, then **fully restart the browser**:

- **Windows**: `certutil -user -addstore Root MyDemoRootCA.pem` (confirm the security prompt), or double-click `MyDemoRootCA.pem` → Install Certificate → Current User → Place all certificates in the following store → **Trusted Root Certification Authorities**.
- **macOS**: `sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain MyDemoRootCA.pem`, or drag it into Keychain Access → System → Certificates, open it, and set Trust → "When using this certificate" to **Always Trust**.
- **Linux (Debian/Ubuntu)**: `sudo cp MyDemoRootCA.pem /usr/local/share/ca-certificates/MyDemoRootCA.crt && sudo update-ca-certificates`. Chrome and Firefox on Linux keep their own stores; import it there if needed (see below).

## Remove the CA after the demo

Do this every time, right after the demo. The CA shows up as **DNS Integrity Checker Demo CA** (organization "dns_integrity_checker demo - REMOVE AFTER DEMO").

### Windows

- **GUI**: press Win+R, run `certmgr.msc`, open **Trusted Root Certification Authorities → Certificates**, right-click **DNS Integrity Checker Demo CA** → Delete. If you installed it for the whole machine instead of the current user, do the same in `certlm.msc` (as Administrator).
- **Command line** (PowerShell or cmd):

  ```powershell
  certutil -user -delstore Root "DNS Integrity Checker Demo CA"
  ```

  If you installed it for the whole machine, run this in an **Administrator** terminal:

  ```powershell
  certutil -delstore Root "DNS Integrity Checker Demo CA"
  ```

  To confirm it is gone, run `certutil -user -store Root "DNS Integrity Checker Demo CA"`. It should find no matching certificate.

### macOS

- **GUI**: open Keychain Access, select the **System** keychain (and then **login**) → Certificates, search for **DNS Integrity Checker Demo CA**, and delete it.
- **Command line**:

  ```bash
  sudo security delete-certificate -t -c "DNS Integrity Checker Demo CA" /Library/Keychains/System.keychain
  security delete-certificate -t -c "DNS Integrity Checker Demo CA" ~/Library/Keychains/login.keychain-db
  ```

  To confirm, run `security find-certificate -a -c "DNS Integrity Checker Demo CA"`. It should print nothing.

### Linux (Debian/Ubuntu)

```bash
sudo rm -f /usr/local/share/ca-certificates/MyDemoRootCA.crt && sudo update-ca-certificates --fresh
```

### Chrome

On Windows and macOS, Chrome trusts local roots through the OS store, so the steps above remove the CA from Chrome as well. If you imported the CA **into Chrome itself** (the usual way on Linux):

- Open `chrome://certificate-manager` → **Custom** → **Installed by you** → **Trusted certificates**, and delete **DNS Integrity Checker Demo CA**.
- In older Chrome versions: Settings → Privacy and security → Security → Manage certificates → **Authorities**, find the entry under "org-dns_integrity_checker demo - REMOVE AFTER DEMO", and delete it.

Then quit Chrome completely (or visit `chrome://restart`) so it drops cached connections.

### Firefox

Settings → Privacy & Security → Certificates → View Certificates → **Authorities**. Select **DNS Integrity Checker Demo CA** and click Delete or Distrust.

### Finally, delete the generated files

bash (from the repo root):

```bash
rm -f openssl/MyDemoRootCA.* openssl/fakefacebook.*
```

PowerShell (from the repo root):

```powershell
Remove-Item openssl\MyDemoRootCA.*, openssl\fakefacebook.* -ErrorAction SilentlyContinue
```
