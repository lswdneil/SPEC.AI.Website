"""Deploy the static site to Cloudflare Pages via Direct Upload API.

Usage (from repo root):
    $env:CLOUDFLARE_API_TOKEN = "cfut_..."   # 或写入 .env（已被 gitignore）
    python scripts/deploy.py

Builds a manifest {path: sha256} plus one multipart field per file,
then uploads to the Pages project. The latest upload becomes the
production deployment automatically.
"""
import os, sys, json, hashlib, uuid, urllib.request, urllib.error

ACC = "418811a8d8a2571eab803093f07685e0"
PROJ = os.environ.get("CLOUDFLARE_PAGES_PROJECT", "spec-ai-website")
URL = f"https://api.cloudflare.com/client/v4/accounts/{ACC}/pages/projects/{PROJ}/deployments"

EXCLUDE_DIRS = {".git", "node_modules", "tests", "site-preview", "scripts", ".github", "__pycache__"}
EXCLUDE_FILES = {"README.md", "REMINDERS.md", "APP-API.md", "LICENSE", "package.json", "package-lock.json", ".gitignore", "vercel.json"}


def get_token():
    tok = os.environ.get("CLOUDFLARE_API_TOKEN", "")
    if not tok:
        # 允许从仓库外或 .env 读取，避免明文入库
        for p in (".env", os.path.expanduser("~/.cloudflare/token")):
            try:
                with open(p, encoding="utf-8") as f:
                    for line in f:
                        line = line.strip()
                        if line.startswith("CLOUDFLARE_API_TOKEN="):
                            tok = line.split("=", 1)[1].strip().strip('"').strip("'")
                            break
            except OSError:
                continue
            if tok:
                break
    if not tok:
        sys.exit("CLOUDFLARE_API_TOKEN 未设置：export CLOUDFLARE_API_TOKEN=cfut_...")
    return tok


def collect(site_dir):
    files = {}
    for root, dirs, names in os.walk(site_dir):
        dirs[:] = [d for d in dirs if d not in EXCLUDE_DIRS]
        for n in names:
            if n in EXCLUDE_FILES:
                continue
            p = os.path.join(root, n)
            rel = os.path.relpath(p, site_dir).replace("\\", "/")
            files[rel] = p
    return files


def main():
    site_dir = os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else ".")
    files = collect(site_dir)
    manifest = {}
    parts = []
    boundary = "----dsh" + uuid.uuid4().hex
    for rel, path in sorted(files.items()):
        data = open(path, "rb").read()
        h = hashlib.sha256(data).hexdigest()
        manifest[rel] = h
        parts.append((h, os.path.basename(rel), data))
    body = bytearray()

    def add_field(name, value):
        body.extend(f"--{boundary}\r\nContent-Disposition: form-data; name=\"{name}\"\r\n\r\n".encode())
        body.extend(value if isinstance(value, bytes) else str(value).encode())
        body.extend(b"\r\n")

    add_field("manifest", json.dumps(manifest, separators=(",", ":")))
    for h, fname, data in parts:
        body.extend(f"--{boundary}\r\nContent-Disposition: form-data; name=\"{h}\"; filename=\"{fname}\"\r\nContent-Type: application/octet-stream\r\n\r\n".encode())
        body.extend(data)
        body.extend(b"\r\n")
    body.extend(f"--{boundary}--\r\n".encode())

    req = urllib.request.Request(URL, data=bytes(body), method="POST")
    req.add_header("Authorization", f"Bearer {get_token()}")
    req.add_header("Content-Type", f"multipart/form-data; boundary={boundary}")
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            out = json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        print("HTTP", e.code, e.read().decode()[:2000])
        sys.exit(1)
    if out.get("success"):
        r = out["result"]
        print("DEPLOYED", r.get("id"), "files:", len(manifest), "url:", r.get("url"))
    else:
        print("FAILED:", json.dumps(out.get("errors"), ensure_ascii=False))
        sys.exit(1)


if __name__ == "__main__":
    main()
