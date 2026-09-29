import os
import time
import secrets
from typing import Optional, List, Dict, Any
from urllib.parse import urlparse
from fastapi import FastAPI, Request, Response, HTTPException, Depends, Query
from fastapi.responses import HTMLResponse, StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
import httpx
from pydantic import BaseModel
from dotenv import load_dotenv

load_dotenv()

# Configuration & Secrets from Render Environment
PORT = int(os.getenv("PORT", "3000"))
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
STRIPE_SECRET_KEY = os.getenv("STRIPE_SECRET_KEY", "")
PAYSTACK_SECRET_KEY = os.getenv("PAYSTACK_SECRET_KEY", "")

# Approved Frontend Origins (Permanent Whitelist - No Expiration)
default_allowed_origins = [
    "https://dome-2030.web.app",
    "https://dome-2030.firebaseapp.com",
    "http://localhost:5173",
    "http://localhost:3000",
    "http://localhost:4173",
]
env_allowed = os.getenv("ALLOWED_ORIGINS", "")
if env_allowed:
    allowed_origins = [o.strip() for o in env_allowed.split(",") if o.strip()]
else:
    allowed_origins = default_allowed_origins

app = FastAPI(
    title="Secure Edge Gateway",
    docs_url=None,       # Disable Swagger docs in public view
    redoc_url=None,      # Disable Redoc
    openapi_url=None     # Disable OpenAPI schema leak
)

# Permanent CORS Configuration with 24-hour preflight cache
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins if "*" not in allowed_origins else ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    max_age=86400,       # Cache CORS preflight for 24 hours (86,400 seconds)
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

# Root endpoint displays false 403 Forbidden warning to web browsers
@app.get("/", response_class=HTMLResponse, status_code=403)
async def root_disguise():
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
    # Direct match or prefix match
    for allowed in allowed_list:
        if allowed == "*":
            return True
        if origin_or_url.startswith(allowed):
            return True
        # Parse scheme + netloc
        try:
            parsed_origin = urlparse(origin_or_url)
            parsed_allowed = urlparse(allowed)
            if parsed_origin.netloc and parsed_origin.netloc == parsed_allowed.netloc:
                return True
        except Exception:
            pass
    return False

# --- PERMANENT APPROVED ORIGIN VALIDATION ---
async def verify_approved_origin(request: Request):
    """
    Permanent, unexpiring authorization for all requests originating from approved frontend domains.
    No tokens, no sessions, and no expiration timeouts.
    """
    if "*" in allowed_origins or os.getenv("NODE_ENV") != "production":
        return True

    origin = request.headers.get("origin") or ""
    referer = request.headers.get("referer") or ""

    if is_domain_matching(origin, allowed_origins) or is_domain_matching(referer, allowed_origins):
        return True

    raise HTTPException(
        status_code=403,
        detail="Forbidden: Request origin is not in the approved frontend domain whitelist."
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

# =========================================================================
# SERVICE 1: GEMINI AI PROXY (Permanent Access for Whitelisted Frontends)
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
# SERVICE 2: GEMINI STREAMING (Permanent Access for Whitelisted Frontends)
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
# SERVICE 3: STRIPE PAYMENT INTENT (Permanent Access for Whitelisted Frontends)
# =========================================================================
@app.post("/api/payments/create-stripe-intent", dependencies=[Depends(verify_approved_origin)])
async def create_stripe_intent(body: StripeIntentRequest):
    stripe_key = STRIPE_SECRET_KEY
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
# SERVICE 4: PAYSTACK INITIALIZE (Permanent Access for Whitelisted Frontends)
# =========================================================================
@app.post("/api/payments/paystack-init", dependencies=[Depends(verify_approved_origin)])
async def paystack_init(body: PaystackInitRequest):
    paystack_key = PAYSTACK_SECRET_KEY
    if not paystack_key:
        return {
            "success": True,
            "authorization_url": f"https://checkout.paystack.com/mock_{secrets.token_hex(8)}",
            "reference": f"ref_{secrets.token_hex(10)}",
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
        }

# =========================================================================
# SERVICE 5: UNIVERSAL PROXY (Permanent Access for Whitelisted Frontends)
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
