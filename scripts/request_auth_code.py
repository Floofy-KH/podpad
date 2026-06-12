import argparse
import base64
import hashlib
import secrets
import urllib.parse
import webbrowser


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Request a Solid auth code with PKCE.")
    parser.add_argument("--client-id", required=True, help="Registered client ID")
    parser.add_argument("--issuer", default="https://solidcommunity.net", help="OIDC issuer base URL")
    parser.add_argument(
        "--redirect-uri",
        default="http://127.0.0.1:8787/callback",
        help="Redirect URI used during authorization",
    )
    parser.add_argument(
        "--scope",
        default="openid webid offline_access profile",
        help="OIDC scopes",
    )
    return parser.parse_args()


def b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def main() -> int:
    args = parse_args()

    pkce_verifier = b64url(secrets.token_bytes(64))
    pkce_challenge = b64url(hashlib.sha256(pkce_verifier.encode("ascii")).digest())
    state = b64url(secrets.token_bytes(24))

    params = {
        "response_type": "code",
        "client_id": args.client_id,
        "redirect_uri": args.redirect_uri,
        "scope": args.scope,
        "code_challenge": pkce_challenge,
        "code_challenge_method": "S256",
        "state": state,
        "prompt": "consent",
    }
    auth_url = f"{args.issuer.rstrip('/')}/.oidc/auth?{urllib.parse.urlencode(params)}"

    webbrowser.open(auth_url)
    callback_url = input("Paste callback URL: ").strip()

    parsed = urllib.parse.urlparse(callback_url)
    query = urllib.parse.parse_qs(parsed.query)
    auth_code = query.get("code", [None])[0]
    returned_state = query.get("state", [None])[0]

    if not auth_code:
        raise SystemExit("No code found in callback URL.")
    if not returned_state:
        raise SystemExit("No state found in callback URL.")
    if returned_state != state:
        raise SystemExit("State mismatch.")

    print(f"PODPAD_CLIENT_ID={args.client_id}")
    print(f"PODPAD_PKCE_VERIFIER={pkce_verifier}")
    print(f"PODPAD_AUTH_CODE={auth_code}")
    print(f"PODPAD_REDIRECT_URI={args.redirect_uri}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
