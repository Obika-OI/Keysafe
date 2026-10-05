import os
import time
import secrets
import re
import uuid
import json
from typing import Optional, List, Dict, Any
from urllib.parse import urlparse
from fastapi import FastAPI, Request, Response, HTTPException, Depends, Query
from fastapi.responses import HTMLResponse, StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
import httpx
from pydantic import BaseModel
from dotenv import load_dotenv
import jwt

load_dotenv()

# Configuration & Secrets from Render Environment
PORT = int(os.getenv("PORT", "3000"))
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
STRIPE_SECRET_KEY = os.getenv("STRIPE_SECRET_KEY", "")
PAYSTACK_SECRET_KEY = os.getenv("PAYSTACK_SECRET_KEY", "")
PAYSTACK_LIVE_SECRET_KEY = os.getenv("PAYSTACK_LIVE_SECRET_KEY", "")
PAYSTACK_TEST_SECRET_KEY = os.getenv("PAYSTACK_TEST_SECRET_KEY", "")
CENTRAL_APP_SECRET = os.getenv("CENTRAL_APP_SECRET", "")

# Approved Whitelist (Web Apps + Expo Go + Android APK / Play Store + iOS App)
default_allowed_origins = [
    # 1. Web Apps
    "https://dome-2030.web.app",
    "https://dome-2030.firebaseapp.com",
    "https://backpack-9e1e0.web.app",
    "https://backpack-9e1e0.firebaseapp.com",
    "https://backpack-edu.com",
    "https://www.backpack-edu.com",
    "https://ais-dev-em5hvt6ivvti3ncrt6y4oc-252111450112.europe-west3.run.app",
    "https://ais-pre-em5hvt6ivvti3ncrt6y4oc-252111450112.europe-west3.run.app",
    "http://localhost:5173",
    "http://localhost:3000",
    "http://localhost:4173",
    # 2. Expo Go & React Native Dev Bundlers
    "exp://",
    "http://localhost:8081",
    "http://10.0.2.2:8081",
    "http://10.0.2.2:3000",
    # 3. Mobile Apps (Android APK / Play Store & iOS App / TestFlight)
    "capacitor://localhost",
    "ionic://localhost",
    "https://localhost",
    "http://localhost",
    "file://",
    "app://",
]

# Ensure default system origins are always whitelisted even if custom ALLOWED_ORIGINS is set on Render dashboard
env_allowed = os.getenv("ALLOWED_ORIGINS", "")
env_origins = [o.strip() for o in env_allowed.split(",") if o.strip()] if env_allowed else []
allowed_origins = list(set(default_allowed_origins + env_origins))

LIVEKIT_API_KEY = os.getenv("LIVEKIT_API_KEY", "")
LIVEKIT_API_SECRET = os.getenv("LIVEKIT_API_SECRET", "")
LIVEKIT_URL = os.getenv("LIVEKIT_URL", "")

app = FastAPI(
    title="Secure Edge Gateway",
    docs_url=None,       # Disable Swagger docs in public view
    redoc_url=None,      # Disable Redoc
    openapi_url=None     # Disable OpenAPI schema leak
)

# Permanent CORS Configuration with 24-hour preflight cache & mobile headers support
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"] if "*" in allowed_origins else allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=[
        "*",
        "X-App-Platform",
        "X-App-Package",
        "X-Client-Type",
        "X-Requested-With",
        "X-Attestation-Token",
        "X-Attestation-Platform",
        "User-Agent",
    ],
    max_age=86400,       # Cache CORS preflight for 24 hours
    expose_headers=["X-RateLimit-Limit", "X-RateLimit-Remaining", "X-Proxy-Duration-Ms"]
)

# HTML False Warning Page Template
def render_false_warning_page() -> str:
    utc_time = time.strftime("%a, %d %b %Y %H:%M:%S GMT", time.gmtime())
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>403 Forbidden</title>
  <style>
    body {{ font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; background-color: #f8f9fa; color: #212529; padding: 50px 20px; text-align: center; }}
    .container {{ max-width: 600px; margin: 40px auto; background: #fff; padding: 40px 30px; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.08); border-top: 4px solid #dc3545; }}
    h1 {{ font-size: 24px; color: #dc3545; margin-bottom: 12px; font-weight: 600; }}
    p {{ font-size: 14px; line-height: 1.6; color: #6c757d; margin-bottom: 20px; }}
    .code {{ font-family: monospace; background: #e9ecef; padding: 6px 12px; border-radius: 4px; font-size: 13px; color: #495057; display: inline-block; margin-bottom: 20px; }}
    .footer {{ font-size: 12px; color: #adb5bd; border-top: 1px solid #dee2e6; padding-top: 15px; margin-top: 20px; }}
  </style>
</head>
<body>
  <div class="container">
    <h1>403 Forbidden</h1>
    <p>Access to this server cluster is restricted. Direct web browser browsing is disabled by security firewall policy.</p>
    <div class="code">Error Code: ERR_RESTRICTED_HOST_ACCESS</div>
    <p>If you believe this is an error, verify your client credentials or contact the network administrator.</p>
    <div class="footer">Server ID: node-edge-sec-09 · Timestamp: {utc_time}</div>
  </div>
</body>
</html>"""

# Root endpoint displays false 403 Forbidden warning to browsers, but allows authorized secrets-carrying backends
@app.get("/")
async def root_disguise(request: Request):
    if CENTRAL_APP_SECRET:
        header_secret = request.headers.get("X-App-Secret") or ""
        auth_header = request.headers.get("Authorization") or ""
        bearer_secret = ""
        if auth_header.lower().startswith("bearer "):
            bearer_secret = auth_header[7:].strip()
        
        if header_secret == CENTRAL_APP_SECRET or bearer_secret == CENTRAL_APP_SECRET:
            return {
                "success": True,
                "message": "Access authorized. Welcome to KeySafe Gateway Cluster."
            }
            
    return HTMLResponse(content=render_false_warning_page(), status_code=403)

# Render Health Check (Minimal non-leaking status)
@app.get("/healthz")
@app.get("/api/health")
async def health_check():
    return {"status": "ok", "timestamp": int(time.time() * 1000)}

def is_domain_matching(origin_or_url: str, allowed_list: List[str]) -> bool:
    """Helper to check if origin or referer matches approved whitelist permanently."""
    if not origin_or_url:
        return False

    for allowed in allowed_list:
        if allowed == "*":
            return True
        if origin_or_url.startswith(allowed):
            return True
        # Local network IPs for Expo / Metro bundler (192.168.x.x or 10.0.x.x)
        if re.match(r"^http://(192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+)(:\d+)?", origin_or_url):
            return True
        # Parse scheme + netloc
        try:
            parsed_origin = urlparse(origin_or_url)
            parsed_allowed = urlparse(allowed)
            if parsed_origin.scheme in ["exp", "capacitor", "ionic", "file", "app"]:
                return True
            if parsed_origin.netloc and parsed_origin.netloc == parsed_allowed.netloc:
                return True
        except Exception:
            pass
    return False

# --- CRYPTOGRAPHIC ATTESTATION HELPERS ---

async def verify_android_play_integrity(token: str, request: Request) -> bool:
    """
    Verifies Android Play Integrity token directly via Google's API, and strictly
    enforces that the app's package name / application ID starts with 'com.devekene'
    and is included in the whitelisted PLAY_INTEGRITY_PACKAGE_NAME comma-separated list.
    Ref: https://developer.android.com/google/play/integrity/verifying-token-backend
    """
    credentials_json = os.getenv("PLAY_INTEGRITY_CREDENTIALS_JSON", "")
    raw_packages = os.getenv("PLAY_INTEGRITY_PACKAGE_NAME", "")
    client_app_package = request.headers.get("X-App-Package") or request.headers.get("x-app-package") or ""

    allowed_packages = [p.strip() for p in raw_packages.split(",") if p.strip()]

    # Strict Sandbox validation (when Google credentials are not yet configured on Render)
    if not credentials_json or not allowed_packages:
        # Check that the sandbox request is for an authorized package starting with 'com.devekene'
        if client_app_package and not client_app_package.startswith("com.devekene"):
            raise HTTPException(
                status_code=403,
                detail=f"Forbidden: App Package '{client_app_package}' is not authorized. Must belong to developer identifier 'com.devekene'."
            )
        
        if token.startswith("mock_") or os.getenv("NODE_ENV") != "production":
            print(f"⚠️ Play Integrity: Sandbox bypass allowed for developer package '{client_app_package or 'com.devekene.default'}'")
            return True
            
        raise HTTPException(
            status_code=403,
            detail="Forbidden: Play Integrity is active but PLAY_INTEGRITY_CREDENTIALS_JSON or PLAY_INTEGRITY_PACKAGE_NAME is unconfigured in Render."
        )

    # In production, verify that ALL listed packages start with com.devekene
    for pkg in allowed_packages:
        if not pkg.startswith("com.devekene"):
            raise HTTPException(
                status_code=403,
                detail=f"Forbidden: Configured package name '{pkg}' must begin with 'com.devekene'."
            )

    # Resolve target package name (prefer client header if valid, else default to the first allowed package)
    target_package = client_app_package if client_app_package in allowed_packages else allowed_packages[0]

    try:
        from google.oauth2 import service_account
        import google.auth.transport.requests

        creds_data = json.loads(credentials_json)
        credentials = service_account.Credentials.from_service_account_info(
            creds_data, scopes=["https://www.googleapis.com/auth/playintegrity"]
        )
        req_auth = google.auth.transport.requests.Request()
        credentials.refresh(req_auth)
        access_token = credentials.token

        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.post(
                f"https://playintegrity.googleapis.com/v1/{target_package}:decodeIntegrityToken",
                headers={
                    "Authorization": f"Bearer {access_token}",
                    "Content-Type": "application/json"
                },
                json={"integrityToken": token}
            )
            
            if resp.status_code != 200:
                raise Exception(f"Play Integrity API returned {resp.status_code}: {resp.text}")

            result = resp.json()
            token_payload = result.get("tokenPayloadExternal", {})
            app_integrity = token_payload.get("appIntegrity", {})
            
            # Extract decrypted package name from Google Play Integrity Verdict
            decrypted_package = app_integrity.get("packageName", "")
            if not decrypted_package or decrypted_package not in allowed_packages:
                raise Exception(f"Application Package verification failed. Package '{decrypted_package}' is not in the authorized whitelist: {allowed_packages}")

            device_integrity = token_payload.get("deviceIntegrity", {})
            recognition_verdicts = device_integrity.get("deviceRecognitionVerdict", [])

            # Meets minimum basic, device, or strong integrity thresholds (i.e. not rooted, jailbroken, or emulated)
            has_device_integrity = any(
                verdict in recognition_verdicts 
                for verdict in ["MEETS_STRONG_INTEGRITY", "MEETS_DEVICE_INTEGRITY", "MEETS_BASIC_INTEGRITY"]
            )

            if not has_device_integrity:
                raise Exception("Device does not meet the necessary hardware or software integrity checks.")
            return True

    except Exception as e:
        if os.getenv("NODE_ENV") != "production":
            print(f"Play Integrity Check bypassed due to validation error in Sandbox: {e}")
            return True
        raise HTTPException(
            status_code=403,
            detail=f"Android Cryptographic Proof Verification Failed: {str(e)}"
        )

async def verify_apple_device_check(token: str) -> bool:
    """
    Verifies iOS DeviceCheck token directly with Apple's production and sandbox servers.
    Ref: https://developer.apple.com/documentation/devicecheck/accessing_the_devicecheck_service
    """
    key_id = os.getenv("APPLE_DEVICECHECK_KEY_ID", "")
    team_id = os.getenv("APPLE_DEVICECHECK_TEAM_ID", "")
    private_key_content = os.getenv("APPLE_DEVICECHECK_PRIVATE_KEY", "")

    if not key_id or not private_key_content or not team_id:
        if token.startswith("mock_") or os.getenv("NODE_ENV") != "production":
            print("⚠️ DeviceCheck: Keys missing. Bypassing in Sandbox/Dev mode.")
            return True
        raise HTTPException(
            status_code=403,
            detail="Forbidden: iOS DeviceCheck is active but APPLE_DEVICECHECK credentials are not configured in Render."
        )

    try:
        import jwt

        # Create the ES256 Client JWT for Apple
        headers = {
            "alg": "ES256",
            "kid": key_id
        }
        payload = {
            "iss": team_id,
            "iat": int(time.time())
        }

        # Normalize private key format
        if not private_key_content.startswith("-----BEGIN PRIVATE KEY-----"):
            formatted_key = f"-----BEGIN PRIVATE KEY-----\n{private_key_content}\n-----END PRIVATE KEY-----"
        else:
            formatted_key = private_key_content

        client_jwt = jwt.encode(payload, formatted_key, algorithm="ES256", headers=headers)

        request_body = {
            "device_token": token,
            "transaction_id": str(uuid.uuid4()),
            "timestamp": int(time.time() * 1000)
        }

        # Send validation to Apple (fallback to development if production rejects)
        async with httpx.AsyncClient(timeout=15.0) as client:
            apple_url = "https://api.devicecheck.apple.com/v1/validate_device_token"
            resp = await client.post(
                apple_url,
                headers={
                    "Authorization": f"Bearer {client_jwt}",
                    "Content-Type": "application/json"
                },
                json=request_body
            )

            # Check sandbox if prod fails
            if resp.status_code != 200:
                sandbox_url = "https://api.development.devicecheck.apple.com/v1/validate_device_token"
                resp = await client.post(
                    sandbox_url,
                    headers={
                        "Authorization": f"Bearer {client_jwt}",
                        "Content-Type": "application/json"
                    },
                    json=request_body
                )

            if resp.status_code != 200:
                raise Exception(f"Apple returned {resp.status_code}: {resp.text}")

            return True

    except Exception as e:
        if os.getenv("NODE_ENV") != "production":
            print(f"DeviceCheck Check bypassed due to validation error in Sandbox: {e}")
            return True
        raise HTTPException(
            status_code=403,
            detail=f"iOS Cryptographic Attestation Verification Failed: {str(e)}"
        )


# --- PERMANENT APPROVED ORIGIN & CRYPTOGRAPHIC VALIDATION ---
async def verify_approved_origin(request: Request):
    """
    Permanent, unexpiring authorization for all requests originating from approved frontend domains,
    cryptographically verified iOS / Android apps, or trusted backends carrying CENTRAL_APP_SECRET.
    """
    # 0. Check for Trusted Shared App Secret (Server-to-Server and trusted backdoors)
    if CENTRAL_APP_SECRET:
        header_secret = request.headers.get("X-App-Secret") or ""
        auth_header = request.headers.get("Authorization") or ""
        bearer_secret = ""
        if auth_header.lower().startswith("bearer "):
            bearer_secret = auth_header[7:].strip()
            
        if header_secret == CENTRAL_APP_SECRET or bearer_secret == CENTRAL_APP_SECRET:
            return True

    if "*" in allowed_origins or os.getenv("NODE_ENV") != "production":
        return True

    origin = request.headers.get("origin") or ""
    referer = request.headers.get("referer") or ""

    # 1. Match against Origin / Referer (Web / Local Dev browsers)
    if is_domain_matching(origin, allowed_origins) or is_domain_matching(referer, allowed_origins):
        return True

    # 2. Native Mobile Apps (Expo Go, Android APK, iOS App)
    # Native mobile apps omit the Origin header or send "null" / "file://".
    # Since browsers cannot strip or spoof Origin, native apps MUST provide cryptographic proofs
    # from Play Integrity (Android) or DeviceCheck (iOS) to bypass CORS checks.
    if not origin or origin.lower() in ["null", "file://"]:
        attestation_token = request.headers.get("X-Attestation-Token") or ""
        attestation_platform = (request.headers.get("X-Attestation-Platform") or "").lower()

        if not attestation_token:
            raise HTTPException(
                status_code=403,
                detail="Forbidden: Native mobile request rejected. Missing cryptographic attestation headers (X-Attestation-Token)."
            )

        if attestation_platform == "android":
            await verify_android_play_integrity(attestation_token, request)
            return True
        elif attestation_platform == "ios":
            await verify_apple_device_check(attestation_token)
            return True
        else:
            raise HTTPException(
                status_code=400,
                detail="Forbidden: Invalid attestation platform specified in X-Attestation-Platform header."
            )

    raise HTTPException(
        status_code=403,
        detail="Forbidden: Request origin is not in the approved frontend domain/app whitelist."
    )

# --- Pydantic Request Models ---
class GeminiRequest(BaseModel):
    prompt: Optional[str] = None
    contents: Optional[Any] = None
    systemInstruction: Optional[str] = None
    modelName: Optional[str] = "gemini-2.5-flash"
    config: Optional[Dict[str, Any]] = None
    generationConfig: Optional[Dict[str, Any]] = None

class StripeIntentRequest(BaseModel):
    amount: int
    currency: Optional[str] = "usd"
    payment_method_types: Optional[List[str]] = ["card"]
    metadata: Optional[Dict[str, Any]] = None

class PaystackInitRequest(BaseModel):
    email: str
    amount: int
    callback_url: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None
    is_live: Optional[bool] = None
    isLive: Optional[bool] = None
    mode: Optional[str] = None

class PaystackSubaccountRequest(BaseModel):
    business_name: str
    settlement_bank: str
    account_number: str
    percentage_charge: float
    is_live: Optional[bool] = None
    isLive: Optional[bool] = None
    mode: Optional[str] = None

class PaystackSplitInitRequest(BaseModel):
    email: str
    amount: int
    subaccount_code: str
    callback_url: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None
    is_live: Optional[bool] = None
    isLive: Optional[bool] = None
    mode: Optional[str] = None

class LivekitTokenRequest(BaseModel):
    room: str
    identity: str

# =========================================================================
# SERVICE 1: GEMINI AI PROXY
# =========================================================================
@app.post("/api/ai/generate", dependencies=[Depends(verify_approved_origin)])
async def generate_gemini_content(body: GeminiRequest):
    api_key = GEMINI_API_KEY
    if not api_key:
        raise HTTPException(status_code=500, detail="GEMINI_API_KEY is not configured in Render environment.")

    model_name = body.modelName or "gemini-2.5-flash"
    if model_name in ["gemini-1.5-flash"]:
        model_name = "gemini-2.5-flash"
    elif model_name in ["gemini-1.5-pro"]:
        model_name = "gemini-2.5-pro"

    contents = body.contents
    if not contents and body.prompt:
        contents = [{"parts": [{"text": body.prompt}]}]
    elif isinstance(contents, str):
        contents = [{"parts": [{"text": contents}]}]

    upstream_payload: Dict[str, Any] = {"contents": contents}
    if body.systemInstruction:
        upstream_payload["systemInstruction"] = {
            "parts": [{"text": body.systemInstruction}]
        }

    merged_config = {**(body.generationConfig or {}), **(body.config or {})}
    if merged_config:
        upstream_payload["generationConfig"] = merged_config

    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent"

    async with httpx.AsyncClient(timeout=60.0) as client:
        try:
            resp = await client.post(
                url,
                headers={
                    "Content-Type": "application/json",
                    "x-goog-api-key": api_key,
                },
                json=upstream_payload,
            )
            data = resp.json()
            if resp.status_code != 200:
                raise HTTPException(status_code=resp.status_code, detail=data)

            output_text = ""
            if "candidates" in data and len(data["candidates"]) > 0:
                candidate = data["candidates"][0]
                parts = candidate.get("content", {}).get("parts", [])
                output_text = "".join([p.get("text", "") for p in parts])

            return {
                "success": True,
                "text": output_text,
                "model": model_name,
            }
        except Exception as e:
            if isinstance(e, HTTPException):
                raise e
            raise HTTPException(status_code=500, detail=f"Gemini Proxy Error: {str(e)}")

# =========================================================================
# SERVICE 2: GEMINI STREAMING (Server-Sent Events)
# =========================================================================
@app.post("/api/ai/stream", dependencies=[Depends(verify_approved_origin)])
async def stream_gemini_content(body: GeminiRequest):
    api_key = GEMINI_API_KEY
    if not api_key:
        raise HTTPException(status_code=500, detail="GEMINI_API_KEY not configured in Render environment.")

    model_name = body.modelName or "gemini-2.5-flash"
    prompt_text = body.prompt or (body.contents if isinstance(body.contents, str) else "")
    contents = [{"parts": [{"text": prompt_text}]}]

    upstream_payload: Dict[str, Any] = {"contents": contents}
    if body.systemInstruction:
        upstream_payload["systemInstruction"] = {"parts": [{"text": body.systemInstruction}]}

    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:streamGenerateContent?alt=sse"

    async def event_generator():
        async with httpx.AsyncClient(timeout=120.0) as client:
            async with client.stream(
                "POST",
                url,
                headers={"Content-Type": "application/json", "x-goog-api-key": api_key},
                json=upstream_payload,
            ) as response:
                async for line in response.aiter_lines():
                    if line.startswith("data: "):
                        yield f"{line}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")

# =========================================================================
# SERVICE 3: STRIPE PAYMENT INTENT
# =========================================================================
@app.post("/api/payments/create-stripe-intent", dependencies=[Depends(verify_approved_origin)])
async def create_stripe_intent(body: StripeIntentRequest):
    stripe_key = STRIPE_SECRET_KEY
    if stripe_key:
        stripe_key = stripe_key.strip().replace('"', '').replace("'", "")

    # Proactive Validation: Warn if they configured a public key (starts with pk_) instead of a secret key (must start with sk_)
    if stripe_key and stripe_key.startswith("pk_"):
        raise HTTPException(
            status_code=400,
            detail={
                "status": False,
                "message": "Invalid key configuration: It looks like you configured a Stripe PUBLIC key (starts with 'pk_') instead of a SECRET key (must start with 'sk_') in your Render environment variables (e.g. STRIPE_SECRET_KEY)."
            }
        )

    if not stripe_key:
        return {
            "success": True,
            "clientSecret": f"pi_mock_{secrets.token_hex(12)}_secret_{secrets.token_hex(12)}",
            "amount": body.amount,
            "currency": body.currency,
        }

    form_data = {
        "amount": str(body.amount),
        "currency": body.currency or "usd",
    }
    for idx, pm in enumerate(body.payment_method_types or ["card"]):
        form_data[f"payment_method_types[{idx}]"] = pm

    if body.metadata:
        for k, v in body.metadata.items():
            form_data[f"metadata[{k}]"] = str(v)

    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(
            "https://api.stripe.com/v1/payment_intents",
            headers={
                "Authorization": f"Bearer {stripe_key}",
                "Content-Type": "application/x-www-form-urlencoded",
            },
            data=form_data,
        )
        data = resp.json()
        if resp.status_code != 200:
            raise HTTPException(status_code=resp.status_code, detail=data)

        return {
            "success": True,
            "clientSecret": data.get("client_secret"),
            "id": data.get("id"),
            "amount": data.get("amount"),
            "currency": data.get("currency"),
            "status": data.get("status"),
        }

# =========================================================================
# SERVICE 4: PAYSTACK INITIALIZE
# =========================================================================
@app.post("/paystack-init", dependencies=[Depends(verify_approved_origin)])
@app.post("/api/paystack-init", dependencies=[Depends(verify_approved_origin)])
@app.post("/api/payments/paystack-init", dependencies=[Depends(verify_approved_origin)])
async def paystack_init(body: PaystackInitRequest):
    # Determine mode & select appropriate Paystack secret key
    is_live_req = False
    if body.is_live is not None:
        is_live_req = body.is_live
    elif body.isLive is not None:
        is_live_req = body.isLive
    elif body.mode == "live":
        is_live_req = True
    elif body.metadata and (body.metadata.get("is_live") is True or body.metadata.get("isLive") is True or body.metadata.get("mode") == "live"):
        is_live_req = True

    # Use live key if requested, otherwise test key, with defaults cascading to PAYSTACK_SECRET_KEY
    if is_live_req:
        paystack_key = PAYSTACK_LIVE_SECRET_KEY or PAYSTACK_SECRET_KEY
    else:
        paystack_key = PAYSTACK_TEST_SECRET_KEY or PAYSTACK_SECRET_KEY

    # If they are trying to initialize a test/sandbox transaction, but only have a live key configured:
    if not is_live_req and not paystack_key and PAYSTACK_LIVE_SECRET_KEY:
        raise HTTPException(
            status_code=400,
            detail={
                "status": False,
                "message": "PAYSTACK_TEST_SECRET_KEY is not defined in your Render environment variables. You have configured PAYSTACK_LIVE_SECRET_KEY, but to use it you must explicitly request a live transaction by passing 'is_live': true in your JSON request body or metadata."
            }
        )

    if paystack_key:
        paystack_key = paystack_key.strip().replace('"', '').replace("'", "")

    # Proactive Validation: Warn if they configured a public key (starts with pk_) instead of a secret key (must start with sk_)
    if paystack_key and paystack_key.startswith("pk_"):
        raise HTTPException(
            status_code=400,
            detail={
                "status": False,
                "message": "Invalid key configuration: It looks like you configured a Paystack PUBLIC key (starts with 'pk_') instead of a SECRET key (must start with 'sk_') in your Render environment variables (e.g. PAYSTACK_TEST_SECRET_KEY / PAYSTACK_LIVE_SECRET_KEY)."
            }
        )

    if not paystack_key:
        return {
            "success": True,
            "authorization_url": f"https://checkout.paystack.com/mock_{secrets.token_hex(8)}",
            "reference": f"ref_{secrets.token_hex(10)}",
            "isMock": True,
            "mode": "test"
        }

    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(
            "https://api.paystack.co/transaction/initialize",
            headers={
                "Authorization": f"Bearer {paystack_key}",
                "Content-Type": "application/json",
            },
            json={
                "email": body.email,
                "amount": body.amount,
                "callback_url": body.callback_url,
                "metadata": body.metadata,
            },
        )
        data = resp.json()
        if resp.status_code != 200 or not data.get("status"):
            raise HTTPException(status_code=resp.status_code, detail=data)

        return {
            "success": True,
            "authorization_url": data.get("data", {}).get("authorization_url"),
            "access_code": data.get("data", {}).get("access_code"),
            "reference": data.get("data", {}).get("reference"),
            "mode": "live" if is_live_req else "test"
        }

# =========================================================================
# SERVICE 4.1: PAYSTACK SUBACCOUNT CREATION
# =========================================================================
@app.post("/subaccount", dependencies=[Depends(verify_approved_origin)])
@app.post("/api/subaccount", dependencies=[Depends(verify_approved_origin)])
@app.post("/api/payments/subaccount", dependencies=[Depends(verify_approved_origin)])
async def create_paystack_subaccount(body: PaystackSubaccountRequest):
    # Determine mode & select appropriate Paystack secret key
    is_live_req = False
    if body.is_live is not None:
        is_live_req = body.is_live
    elif body.isLive is not None:
        is_live_req = body.isLive
    elif body.mode == "live":
        is_live_req = True

    if is_live_req:
        paystack_key = PAYSTACK_LIVE_SECRET_KEY or PAYSTACK_SECRET_KEY
    else:
        paystack_key = PAYSTACK_TEST_SECRET_KEY or PAYSTACK_SECRET_KEY

    if not is_live_req and not paystack_key and PAYSTACK_LIVE_SECRET_KEY:
        raise HTTPException(
            status_code=400,
            detail={
                "status": False,
                "message": "PAYSTACK_TEST_SECRET_KEY is not defined in your Render environment variables. You have configured PAYSTACK_LIVE_SECRET_KEY, but to use it you must explicitly request a live transaction by passing 'is_live': true in your JSON request body or metadata."
            }
        )

    if paystack_key:
        paystack_key = paystack_key.strip().replace('"', '').replace("'", "")

    if paystack_key and paystack_key.startswith("pk_"):
        raise HTTPException(
            status_code=400,
            detail={
                "status": False,
                "message": "Invalid key configuration: It looks like you configured a Paystack PUBLIC key (starts with 'pk_') instead of a SECRET key (must start with 'sk_')."
            }
        )

    if not paystack_key:
        return {
            "status": True,
            "message": "Subaccount created successfully (MOCK)",
            "data": {
                "subaccount_code": f"ACCT_mock_{secrets.token_hex(6)}",
                "business_name": body.business_name,
                "settlement_bank": body.settlement_bank,
                "account_number": body.account_number,
                "percentage_charge": body.percentage_charge,
                "is_mock": True,
                "mode": "test"
            }
        }

    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(
            "https://api.paystack.co/subaccount",
            headers={
                "Authorization": f"Bearer {paystack_key}",
                "Content-Type": "application/json",
            },
            json={
                "business_name": body.business_name,
                "settlement_bank": body.settlement_bank,
                "account_number": body.account_number,
                "percentage_charge": body.percentage_charge,
            },
        )
        data = resp.json()
        if resp.status_code not in (200, 201) or not data.get("status"):
            raise HTTPException(status_code=resp.status_code, detail=data)

        return data

# =========================================================================
# SERVICE 4.2: PAYSTACK SPLIT PAYMENT INITIALIZE
# =========================================================================
@app.post("/split-payment", dependencies=[Depends(verify_approved_origin)])
@app.post("/api/split-payment", dependencies=[Depends(verify_approved_origin)])
@app.post("/api/payments/split-payment", dependencies=[Depends(verify_approved_origin)])
@app.post("/api/payments/paystack-split-init", dependencies=[Depends(verify_approved_origin)])
async def init_paystack_split_payment(body: PaystackSplitInitRequest):
    # Determine mode & select appropriate Paystack secret key
    is_live_req = False
    if body.is_live is not None:
        is_live_req = body.is_live
    elif body.isLive is not None:
        is_live_req = body.isLive
    elif body.mode == "live":
        is_live_req = True
    elif body.metadata and (body.metadata.get("is_live") is True or body.metadata.get("isLive") is True or body.metadata.get("mode") == "live"):
        is_live_req = True

    if is_live_req:
        paystack_key = PAYSTACK_LIVE_SECRET_KEY or PAYSTACK_SECRET_KEY
    else:
        paystack_key = PAYSTACK_TEST_SECRET_KEY or PAYSTACK_SECRET_KEY

    if not is_live_req and not paystack_key and PAYSTACK_LIVE_SECRET_KEY:
        raise HTTPException(
            status_code=400,
            detail={
                "status": False,
                "message": "PAYSTACK_TEST_SECRET_KEY is not defined in your Render environment variables. You have configured PAYSTACK_LIVE_SECRET_KEY, but to use it you must explicitly request a live transaction by passing 'is_live': true in your JSON request body or metadata."
            }
        )

    if paystack_key:
        paystack_key = paystack_key.strip().replace('"', '').replace("'", "")

    if paystack_key and paystack_key.startswith("pk_"):
        raise HTTPException(
            status_code=400,
            detail={
                "status": False,
                "message": "Invalid key configuration: It looks like you configured a Paystack PUBLIC key (starts with 'pk_') instead of a SECRET key (must start with 'sk_')."
            }
        )

    if not paystack_key:
        return {
            "status": True,
            "message": "Transaction initialized successfully (MOCK SPLIT)",
            "data": {
                "authorization_url": f"https://checkout.paystack.com/mock_split_{secrets.token_hex(8)}",
                "access_code": f"mock_access_{secrets.token_hex(10)}",
                "reference": f"ref_split_{secrets.token_hex(10)}",
                "is_mock": True,
                "mode": "test"
            }
        }

    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(
            "https://api.paystack.co/transaction/initialize",
            headers={
                "Authorization": f"Bearer {paystack_key}",
                "Content-Type": "application/json",
            },
            json={
                "email": body.email,
                "amount": body.amount,
                "callback_url": body.callback_url,
                "metadata": body.metadata,
                "subaccount": body.subaccount_code,
            },
        )
        data = resp.json()
        if resp.status_code != 200 or not data.get("status"):
            raise HTTPException(status_code=resp.status_code, detail=data)

        return data

# =========================================================================
# SERVICE 4.5: SECURE CONFIGURATION DIAGNOSTICS
# =========================================================================
@app.get("/diagnostics")
@app.get("/api/diagnostics")
async def secure_diagnostics():
    def analyze_key(key: str) -> dict:
        if not key:
            return {"defined": False, "length": 0, "prefix": None, "suffix": None}
        cleaned = key.strip().replace('"', '').replace("'", "")
        return {
            "defined": True,
            "length": len(cleaned),
            "prefix": f"{cleaned[:8]}..." if len(cleaned) >= 8 else cleaned,
            "suffix": f"...{cleaned[-4:]}" if len(cleaned) >= 4 else cleaned,
            "has_quotes": '"' in key or "'" in key,
            "is_public_key": cleaned.startswith("pk_"),
            "is_secret_key": cleaned.startswith("sk_"),
        }

    return {
        "success": True,
        "environment": {
            "PAYSTACK_SECRET_KEY": analyze_key(PAYSTACK_SECRET_KEY),
            "PAYSTACK_TEST_SECRET_KEY": analyze_key(PAYSTACK_TEST_SECRET_KEY),
            "PAYSTACK_LIVE_SECRET_KEY": analyze_key(PAYSTACK_LIVE_SECRET_KEY),
            "STRIPE_SECRET_KEY": analyze_key(STRIPE_SECRET_KEY),
            "GEMINI_API_KEY_defined": bool(GEMINI_API_KEY),
            "LIVEKIT_API_KEY_defined": bool(LIVEKIT_API_KEY),
            "LIVEKIT_API_SECRET_defined": bool(LIVEKIT_API_SECRET),
        }
    }

# =========================================================================
# SERVICE 5: LIVEKIT ACCESS TOKEN GENERATION
# =========================================================================
@app.api_route("/livekit", methods=["GET", "POST"], dependencies=[Depends(verify_approved_origin)])
@app.api_route("/api/livekit", methods=["GET", "POST"], dependencies=[Depends(verify_approved_origin)])
@app.api_route("/api/livekit/token", methods=["GET", "POST"], dependencies=[Depends(verify_approved_origin)])
async def get_livekit_token(
    request: Request,
    room: Optional[str] = Query(None),
    identity: Optional[str] = Query(None)
):
    api_key = LIVEKIT_API_KEY
    api_secret = LIVEKIT_API_SECRET
    
    resolved_room = room
    resolved_identity = identity
    
    # Resolve parameters from JSON body if method is POST
    if request.method == "POST":
        try:
            body_bytes = await request.body()
            if body_bytes:
                req_json = json.loads(body_bytes)
                if isinstance(req_json, dict):
                    resolved_room = req_json.get("room") or resolved_room
                    resolved_identity = req_json.get("identity") or resolved_identity
        except Exception:
            pass

    if not resolved_room or not resolved_identity:
        raise HTTPException(
            status_code=400,
            detail="Both 'room' and 'identity' parameters are required (pass as JSON body or query parameters)."
        )
    
    if not api_key or not api_secret:
        # Mock/sandbox fallback token using pyjwt
        mock_payload = {
            "iss": "mock_api_key",
            "sub": resolved_identity,
            "video": {
                "room": resolved_room,
                "roomJoin": True,
            }
        }
        mock_token = jwt.encode(mock_payload, "mock_secret", algorithm="HS256")
        return {
            "success": True,
            "token": mock_token,
            "room": resolved_room,
            "identity": resolved_identity,
            "isMock": True,
            "livekitUrl": LIVEKIT_URL or "ws://localhost:7880"
        }
        
    try:
        import time
        now = int(time.time())
        payload = {
            "iss": api_key,
            "sub": resolved_identity,
            "nbf": now - 5,
            "exp": now + 3600, # 1 hour validity
            "video": {
                "room": resolved_room,
                "roomJoin": True,
                "canPublish": True,
                "canSubscribe": True
            }
        }
        
        token = jwt.encode(payload, api_secret, algorithm="HS256")
        return {
            "success": True,
            "token": token,
            "room": resolved_room,
            "identity": resolved_identity,
            "livekitUrl": LIVEKIT_URL or "wss://your-livekit-server.com"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Livekit Token Generation Error: {str(e)}")

# =========================================================================
# SERVICE 6: UNIVERSAL PROXY
# =========================================================================
@app.api_route("/api/proxy", methods=["GET", "POST", "PUT", "PATCH", "DELETE"], dependencies=[Depends(verify_approved_origin)])
async def universal_proxy(request: Request, target: Optional[str] = Query(None)):
    target_url = target or request.headers.get("x-target-url")
    if not target_url:
        raise HTTPException(status_code=400, detail="Missing target query parameter or X-Target-URL header")

    body_bytes = await request.body()
    headers_to_strip = {"host", "x-target-url", "connection", "content-length"}
    forward_headers = {k: v for k, v in request.headers.items() if k.lower() not in headers_to_strip}

    async with httpx.AsyncClient(timeout=60.0) as client:
        try:
            resp = await client.request(
                method=request.method,
                url=target_url,
                headers=forward_headers,
                content=body_bytes if request.method not in ["GET", "HEAD"] else None,
            )
            return Response(
                content=resp.content,
                status_code=resp.status_code,
                headers=dict(resp.headers),
            )
        except Exception as e:
            raise HTTPException(status_code=502, detail=f"Proxy upstream error: {str(e)}")

# Catch-all route for any unmapped paths
@app.api_route("/{full_path:path}", methods=["GET", "POST", "PUT", "DELETE", "HEAD", "OPTIONS"])
async def catch_all(full_path: str):
    return HTMLResponse(content=render_false_warning_page(), status_code=404)
