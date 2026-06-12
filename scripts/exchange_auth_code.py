import argparse
import base64
import json
import urllib.error
import urllib.parse
import urllib.request


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Exchange auth code for refresh token.")
    parser.add_argument("--client-id", required=True, help="Registered client ID")
    parser.add_argument("--client-secret", required=True, help="Registered client secret")
    parser.add_argument("--auth-code", required=True, help="Authorization code from callback")
    parser.add_argument("--pkce-verifier", required=True, help="PKCE verifier used during auth")
    parser.add_argument("--issuer", default="https://solidcommunity.net", help="OIDC issuer base URL")
    parser.add_argument(
        "--redirect-uri",
        default="http://127.0.0.1:8787/callback",
        help="Redirect URI used during authorization",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()

    basic = base64.b64encode(f"{args.client_id}:{args.client_secret}".encode("ascii")).decode("ascii")
    body = urllib.parse.urlencode(
        {
            "grant_type": "authorization_code",
            "code": args.auth_code,
            "redirect_uri": args.redirect_uri,
            "code_verifier": args.pkce_verifier,
        }
    ).encode("ascii")

    req = urllib.request.Request(
        f"{args.issuer.rstrip('/')}/.oidc/token",
        data=body,
        headers={
            "Authorization": f"Basic {basic}",
            "Content-Type": "application/x-www-form-urlencoded",
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(req) as resp:
            token = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        details = exc.read().decode("utf-8", errors="replace")
        raise SystemExit(f"Token exchange failed ({exc.code}): {details}") from exc

    refresh_token = token.get("refresh_token")
    if not refresh_token:
        raise SystemExit("No refresh_token returned.")

    print(f"Refresh token: {refresh_token}")
    print(f"PODPAD_REFRESH_TOKEN={refresh_token}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
