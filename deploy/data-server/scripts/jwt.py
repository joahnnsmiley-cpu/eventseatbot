#!/usr/bin/env python3
"""Mint a Supabase-style key: an HS256 JWT carrying {"role": <role>}.

PostgREST and Storage read the `role` claim and switch Postgres role
accordingly, so a token signed with OUR secret works exactly like the key
Supabase Cloud issued — the application code does not change.

Usage: jwt.py <secret> <anon|service_role>

Ten years on purpose: an expiry nobody is watching for turns into a silent
total outage. Rotate deliberately instead.
"""
import base64
import hashlib
import hmac
import json
import sys
import time


def b64(raw: bytes) -> bytes:
    return base64.urlsafe_b64encode(raw).rstrip(b"=")


def main() -> None:
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    secret, role = sys.argv[1], sys.argv[2]
    if len(secret) < 32:
        sys.exit("secret is shorter than 32 characters; PostgREST rejects it")
    now = int(time.time())
    head = b64(json.dumps({"alg": "HS256", "typ": "JWT"}, separators=(",", ":")).encode())
    body = b64(json.dumps(
        {"role": role, "iss": "data-1", "iat": now, "exp": now + 10 * 365 * 24 * 3600},
        separators=(",", ":"),
    ).encode())
    sig = b64(hmac.new(secret.encode(), head + b"." + body, hashlib.sha256).digest())
    print((head + b"." + body + b"." + sig).decode())


if __name__ == "__main__":
    main()
