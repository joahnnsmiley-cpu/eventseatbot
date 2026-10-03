#!/usr/bin/env python3
"""Copy every object of the tickets buckets from Supabase Cloud into the local
Storage API. Reads only from the source; overwrites same-named local objects.
Safe to re-run — that is how the final copy before switch-over is made.

Goes through the Storage API on both sides rather than touching files on disk,
so the object index in schema `storage` stays consistent with the files.

Run by copy-files.sh, which puts it on the compose network. Environment:
  OLD_URL, OLD_KEY   source project URL and service_role key
  NEW_URL, NEW_KEY   local Storage API base URL and service_role key
"""
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request

OLD_URL = os.environ["OLD_URL"].rstrip("/") + "/storage/v1"
OLD_KEY = os.environ["OLD_KEY"]
NEW_URL = os.environ["NEW_URL"].rstrip("/")
NEW_KEY = os.environ["NEW_KEY"]
BUCKETS = ["posters", "layouts", "tickets"]
PAGE = 1000


def call(base, key, method, path, body=None, headers=None):
    hdrs = {"Authorization": "Bearer " + key, "apikey": key}
    hdrs.update(headers or {})
    req = urllib.request.Request(base + path, data=body, method=method, headers=hdrs)
    with urllib.request.urlopen(req, timeout=120) as resp:
        return resp.read(), resp.headers


def post_json(base, key, path, payload):
    raw, _ = call(base, key, "POST", path, json.dumps(payload).encode(),
                  {"Content-Type": "application/json"})
    return json.loads(raw)


def walk(bucket, prefix=""):
    """Yield (path, metadata) for every object under prefix. Folders come back
    from the list endpoint as entries with a null id."""
    offset = 0
    while True:
        page = post_json(OLD_URL, OLD_KEY, "/object/list/" + bucket,
                         {"prefix": prefix, "limit": PAGE, "offset": offset,
                          "sortBy": {"column": "name", "order": "asc"}})
        for entry in page:
            path = prefix + entry["name"]
            if entry.get("id") is None:
                yield from walk(bucket, path + "/")
            else:
                yield path, entry.get("metadata") or {}
        if len(page) < PAGE:
            return
        offset += PAGE


def ensure_bucket(bucket):
    info = json.loads(call(OLD_URL, OLD_KEY, "GET", "/bucket/" + bucket)[0])
    try:
        post_json(NEW_URL, NEW_KEY, "/bucket",
                  {"id": bucket, "name": bucket, "public": bool(info.get("public"))})
    except urllib.error.HTTPError as err:
        # 400/409 "already exists" on a re-run; anything else is real.
        if b"exists" not in err.read():
            raise


def main():
    total = size = 0
    for bucket in BUCKETS:
        ensure_bucket(bucket)
        count = 0
        for path, meta in walk(bucket):
            quoted = urllib.parse.quote(path)
            data, _ = call(OLD_URL, OLD_KEY, "GET", "/object/%s/%s" % (bucket, quoted))
            call(NEW_URL, NEW_KEY, "POST", "/object/%s/%s" % (bucket, quoted), data, {
                "Content-Type": meta.get("mimetype") or "application/octet-stream",
                "Cache-Control": meta.get("cacheControl") or "max-age=3600",
                "x-upsert": "true",
            })
            if meta.get("size") is not None and meta["size"] != len(data):
                sys.exit("size mismatch on %s/%s" % (bucket, path))
            count += 1
            size += len(data)
        print("%-8s %d objects" % (bucket, count))
        total += count
    print("total    %d objects, %.1f MB" % (total, size / 1e6))


if __name__ == "__main__":
    main()
