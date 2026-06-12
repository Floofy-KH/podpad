import argparse
import json
import urllib.error
import urllib.request


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Register an OIDC client for PodPad.")
    parser.add_argument("--issuer", default="https://solidcommunity.net", help="OIDC issuer base URL")
    parser.add_argument("--client-name", default="PodPad CLI", help="Client name to register")
    parser.add_argument(
        "--redirect-uri",
        default="http://127.0.0.1:8787/callback",
        help="Redirect URI registered with the issuer",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()

    body = {
        "client_name": args.client_name,
        "redirect_uris": [args.redirect_uri],
        "grant_types": ["authorization_code", "refresh_token"],
        "response_types": ["code"],
        "token_endpoint_auth_method": "client_secret_basic",
    }

    req = urllib.request.Request(
        f"{args.issuer.rstrip('/')}/.oidc/reg",
        data=json.dumps(body).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    try:
        with urllib.request.urlopen(req) as resp:
            client = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        details = exc.read().decode("utf-8", errors="replace")
        raise SystemExit(f"Client registration failed ({exc.code}): {details}") from exc

    client_id = client.get("client_id")
    client_secret = client.get("client_secret")
    if not client_id or not client_secret:
        raise SystemExit("Registration response did not include client_id/client_secret.")

    print(f"Client ID:     {client_id}")
    print(f"Client Secret: {client_secret}")
    print()
    print(f"PODPAD_CLIENT_ID={client_id}")
    print(f"PODPAD_CLIENT_SECRET={client_secret}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
