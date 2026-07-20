from fastapi import FastAPI, APIRouter, Header, HTTPException, Depends
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import uuid
import httpx
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional, Literal
from datetime import datetime, timezone, timedelta

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

import json as _json

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

app = FastAPI(title="mTree API")
api_router = APIRouter(prefix="/api")

# ------------------- Seed data -------------------
DEITIES = [
    {"id": 1, "name": "Zorath", "color_hex": "#FF6B35", "glow_hex": "#FF6B3540",
     "symbol_description": "Spiral flame with three pointed tips", "stone_texture": "rough dark stone"},
    {"id": 2, "name": "Kaelis", "color_hex": "#4E9AF1", "glow_hex": "#4E9AF140",
     "symbol_description": "Infinite loop wave with central eye", "stone_texture": "weathered gray stone"},
    {"id": 3, "name": "Tharun", "color_hex": "#45B764", "glow_hex": "#45B76440",
     "symbol_description": "Rooted triangle with branching lines", "stone_texture": "mossy brown stone"},
    {"id": 4, "name": "Vynel", "color_hex": "#C8D0DB", "glow_hex": "#C8D0DB40",
     "symbol_description": "Vortex of concentric spirals", "stone_texture": "pale ash stone"},
    {"id": 5, "name": "Aethis", "color_hex": "#A855F7", "glow_hex": "#A855F740",
     "symbol_description": "Star burst with 8 points connected by arcs", "stone_texture": "obsidian-dark stone"},
    {"id": 6, "name": "Solmara", "color_hex": "#FACC15", "glow_hex": "#FACC1540",
     "symbol_description": "Disc with radiating geometric rays and dot center", "stone_texture": "sandstone"},
    {"id": 7, "name": "Luneth", "color_hex": "#93C5FD", "glow_hex": "#93C5FD40",
     "symbol_description": "Crescent embracing a circle haloed by dots", "stone_texture": "cool blue-gray stone"},
]

CHANDRA_DASA = [
    {"day_number": i, "name": f"[CHANDRA_DASA_{i}]", "description": f"Day {i} energy"}
    for i in range(1, 31)
]

# Fallback English-only text for categories that have no curated multi-language content yet
# (namely the free-text "custom" goal). Real per-category, per-language affirmations live in
# AFFIRMATIONS_I18N below and are the primary source served by /affirmations/{category}.
AFFIRMATIONS = {
    "custom": "My intention is pure and my will is unstoppable. What I seek is already seeking me.",
}

# Curated affirmations across 35 goal categories x 54 languages, loaded from a static data file
# (data/affirmations_i18n.json). Structure: { category_id: { lang_code: text } }.
try:
    with open(ROOT_DIR / "data" / "affirmations_i18n.json", "r", encoding="utf-8") as _f:
        AFFIRMATIONS_I18N = _json.load(_f)
except Exception:
    AFFIRMATIONS_I18N = {}

# Some legacy goal_category keys used before the category expansion don't match the new
# curated data 1:1 — map them onto their closest equivalent so existing users still get text.
CATEGORY_ALIASES = {
    "relationship": "love",
}

# Frontend language slugs (used everywhere in the app/DB) -> 2/3-letter codes used in the
# curated affirmations data file.
LANGUAGE_CODE_MAP = {
    "english": "en", "hindi": "hi", "assamese": "as", "bengali": "bn", "bodo": "brx",
    "dogri": "doi", "gujarati": "gu", "kannada": "kn", "kashmiri": "ks", "konkani": "kok",
    "maithili": "mai", "malayalam": "ml", "manipuri": "mni", "marathi": "mr", "nepali": "ne",
    "odia": "or", "punjabi": "pa", "sanskrit": "sa", "santali": "sat", "sindhi": "sd",
    "tamil": "ta", "telugu": "te", "urdu": "ur",
    "spanish": "es", "french": "fr", "german": "de", "portuguese": "pt", "italian": "it",
    "dutch": "nl", "russian": "ru", "ukrainian": "uk", "polish": "pl", "turkish": "tr",
    "arabic": "ar", "persian": "fa", "hebrew": "he", "chinese": "zh", "japanese": "ja",
    "korean": "ko", "thai": "th", "vietnamese": "vi", "indonesian": "id", "malay": "ms",
    "filipino": "fil", "swahili": "sw", "greek": "el", "swedish": "sv", "norwegian": "no",
    "danish": "da", "finnish": "fi", "czech": "cs", "romanian": "ro", "hungarian": "hu",
}

# Approximate fixed exchange rates (units of currency per 1 INR) — used ONLY for display
# conversion and for rolling up admin donation totals into one comparable currency (USD).
# No live payment gateway is wired up yet, so these don't need to track real-time FX rates.
CURRENCY_RATE_PER_INR = {
    "INR": 1, "USD": 0.0121, "EUR": 0.0111, "GBP": 0.0095,
    "AED": 0.0445, "SAR": 0.0453, "QAR": 0.044, "KWD": 0.0037, "OMR": 0.00465, "BHD": 0.00456,
    "CAD": 0.0165, "AUD": 0.0184, "NZD": 0.0202, "SGD": 0.0162,
    "MYR": 0.0537, "IDR": 190.5, "PHP": 0.685, "THB": 0.418, "VND": 305.2,
    "BDT": 1.325, "PKR": 3.36, "LKR": 3.62, "NPR": 1.6, "MMK": 25.4,
    "CNY": 0.0868, "JPY": 1.84, "KRW": 16.4, "HKD": 0.0942, "TWD": 0.373,
    "BRL": 0.0637, "MXN": 0.206, "ARS": 12.1, "CLP": 11.4, "COP": 47.3,
    "ZAR": 0.221, "NGN": 18.9, "KES": 1.56, "EGP": 0.594, "GHS": 0.156, "MAD": 0.121,
    "TZS": 30.7, "UGX": 44.6, "TRY": 0.412, "RUB": 1.09, "UAH": 0.503,
    "PLN": 0.0479, "CZK": 0.276, "HUF": 4.31, "RON": 0.0552, "SEK": 0.128, "NOK": 0.131,
    "DKK": 0.0828, "CHF": 0.0107, "ILS": 0.0446, "IQD": 15.9, "JOD": 0.00858, "LBP": 1080,
    "KZT": 5.86, "UZS": 155, "AZN": 0.0206, "GEL": 0.0327,
}

def to_usd(amount: float, currency_code: str) -> float:
    """Converts an amount in any supported currency to USD using the fixed rate table above,
    with INR as the pivot. Unknown currency codes are treated as already being INR."""
    rate = CURRENCY_RATE_PER_INR.get((currency_code or "INR").upper(), 1.0)
    usd_rate = CURRENCY_RATE_PER_INR["USD"]
    inr_amount = amount / rate if rate else amount
    return round(inr_amount * usd_rate, 2)

# ------------------- Models -------------------
class UserProfile(BaseModel):
    user_id: str
    email: str
    name: str
    picture: Optional[str] = None
    gender: Optional[str] = None
    dob: Optional[str] = None
    deity_id: Optional[int] = None
    is_public: bool = True
    is_premium: bool = False
    premium_expires_at: Optional[datetime] = None
    affirmation_language: str = "english"
    notification_count: int = 0
    notification_busy_start: Optional[str] = None
    notification_busy_end: Optional[str] = None
    busy_hours_enabled: bool = False
    reminder_mode: str = "random"
    reminder_times: List[str] = []
    onboarding_done: bool = False
    profile_done: bool = False
    tour_done: bool = False
    journey_intro_seen: bool = False
    created_at: datetime

class ProfileUpdate(BaseModel):
    name: Optional[str] = None
    gender: Optional[str] = None
    dob: Optional[str] = None
    deity_id: Optional[int] = None
    country: Optional[str] = None
    is_public: Optional[bool] = None
    affirmation_language: Optional[str] = None
    notification_count: Optional[int] = None
    notification_busy_start: Optional[str] = None
    notification_busy_end: Optional[str] = None
    busy_hours_enabled: Optional[bool] = None
    reminder_mode: Optional[str] = None
    reminder_times: Optional[List[str]] = None
    onboarding_done: Optional[bool] = None
    profile_done: Optional[bool] = None
    tour_done: Optional[bool] = None
    journey_intro_seen: Optional[bool] = None

class SessionRequest(BaseModel):
    session_id: str

class ManifestationCreate(BaseModel):
    goal_category: str
    goal_custom: Optional[str] = None
    goal_description: Optional[str] = None
    sacrifice_category: str
    sacrifice_custom: Optional[str] = None
    sacrifice_description: Optional[str] = None
    cycle_days: int
    reminder_count: int = 0
    reminder_mode: str = "random"
    reminder_times: List[str] = []
    affirmation_enabled: bool = False
    fasting_enabled: bool = False
    hustle_enabled: bool = False
    is_public: bool = True
    chandra_dasa_at_start: Optional[str] = None
    cosmic_level_at_start: Optional[int] = None
    moon_phase_at_start: Optional[str] = None

class Manifestation(BaseModel):
    id: str
    user_id: str
    goal_category: str
    goal_custom: Optional[str] = None
    goal_description: Optional[str] = None
    sacrifice_category: str
    sacrifice_custom: Optional[str] = None
    sacrifice_description: Optional[str] = None
    cycle_days: int
    current_day: int = 0
    streak_count: int = 0
    max_streak: int = 0
    tree_stage: int = 1
    reminder_count: int = 0
    reminder_mode: str = "random"
    reminder_times: List[str] = []
    reminders_ever_enabled: bool = False
    affirmation_enabled: bool = False
    fasting_enabled: bool = False
    hustle_enabled: bool = False
    moon_phase_at_start: Optional[str] = None
    chandra_dasa_at_start: Optional[str] = None
    cosmic_level_at_start: Optional[int] = None
    started_at: datetime
    last_ritual_at: Optional[datetime] = None
    last_ritual_local_date: Optional[str] = None
    last_shown_at: Optional[datetime] = None
    status: str = "active"
    is_public: bool = True
    manifested_at: Optional[datetime] = None
    donated: bool = False
    donation_amount: int = 0
    donation_currency: str = "INR"
    testimony: Optional[str] = None
    deity_id: Optional[int] = None
    user_name: Optional[str] = None
    created_at: datetime

class RitualResult(BaseModel):
    manifestation: Manifestation
    new_stage: bool = False

class ManifestedRequest(BaseModel):
    testimony: Optional[str] = None
    donation_amount: int = 0
    donation_currency: str = "INR"

class RitualRequest(BaseModel):
    local_date: Optional[str] = None

class ReminderUpdate(BaseModel):
    reminder_count: int
    reminder_mode: str = "random"
    reminder_times: List[str] = []

class SubscribeRequest(BaseModel):
    plan: Literal["first_month", "monthly", "6_month", "yearly"]

class AdminUserUpdate(BaseModel):
    is_premium: Optional[bool] = None
    is_public: Optional[bool] = None
    name: Optional[str] = None

class BlockUserRequest(BaseModel):
    days: Optional[int] = None  # None/omitted = permanent block

class ExtendPremiumRequest(BaseModel):
    days: int

# ------------------- Admin -------------------
ADMIN_EMAILS = {e.strip().lower() for e in os.environ.get("ADMIN_EMAILS", "").split(",") if e.strip()}

# ------------------- Helpers -------------------
async def get_current_user(authorization: Optional[str] = Header(None)) -> dict:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated")
    token = authorization[7:]
    session = await db.user_sessions.find_one({"session_token": token}, {"_id": 0})
    if not session:
        raise HTTPException(status_code=401, detail="Invalid session")
    expires = session.get("expires_at")
    if expires and expires.tzinfo is None:
        expires = expires.replace(tzinfo=timezone.utc)
    if expires and expires < datetime.now(timezone.utc):
        raise HTTPException(status_code=401, detail="Session expired")
    user = await db.users.find_one({"user_id": session["user_id"]}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    # Enforce admin-issued block (temporary or permanent). Temporary blocks auto-expire.
    if user.get("is_blocked"):
        until = user.get("blocked_until")
        if until:
            if until.tzinfo is None:
                until = until.replace(tzinfo=timezone.utc)
            if until < datetime.now(timezone.utc):
                await db.users.update_one({"user_id": user["user_id"]}, {"$set": {"is_blocked": False, "blocked_until": None}})
                user["is_blocked"] = False
                user["blocked_until"] = None
            else:
                raise HTTPException(status_code=403, detail="Your account has been temporarily blocked. Contact support.")
        else:
            raise HTTPException(status_code=403, detail="Your account has been blocked. Contact support.")
    # Downgrade premium if expired
    if user.get("is_premium") and user.get("premium_expires_at"):
        exp = user["premium_expires_at"]
        if exp.tzinfo is None:
            exp = exp.replace(tzinfo=timezone.utc)
        if exp < datetime.now(timezone.utc):
            await db.users.update_one({"user_id": user["user_id"]}, {"$set": {"is_premium": False}})
            user["is_premium"] = False
    return user

def clean_user(u: dict) -> dict:
    d = {k: v for k, v in u.items() if k != "_id"}
    d["is_admin"] = d.get("email", "").lower() in ADMIN_EMAILS
    return d

async def get_current_admin(user: dict = Depends(get_current_user)) -> dict:
    if user.get("email", "").lower() not in ADMIN_EMAILS:
        raise HTTPException(status_code=403, detail="Admin access required")
    return user

# ------------------- Startup -------------------
@app.on_event("startup")
async def startup():
    await db.users.create_index("email", unique=True)
    await db.users.create_index("user_id", unique=True)
    await db.user_sessions.create_index("session_token", unique=True)
    await db.user_sessions.create_index("expires_at", expireAfterSeconds=0)
    await db.manifestations.create_index("user_id")
    await db.manifestations.create_index("is_public")
    await db.manifestations.create_index("status")
    await db.manifestations.create_index("last_shown_at")

# ------------------- Auth Routes -------------------
@api_router.post("/auth/dev-login")
async def dev_login(email: str = "test@mtree.dev", name: str = "Test User"):
    """DEV-ONLY endpoint: create/fetch a user and issue a session_token without Google OAuth.
    Used only for automated testing. Disabled by default in production — requires
    ENABLE_DEV_LOGIN=true env var AND the email must be on the internal @mtree.dev test
    domain, so it can never be used to take over a real user's Google-signed-in account."""
    if os.environ.get("ENABLE_DEV_LOGIN", "false").lower() != "true":
        raise HTTPException(status_code=404, detail="Not found")
    if not email.endswith("@mtree.dev"):
        raise HTTPException(status_code=403, detail="dev-login is restricted to @mtree.dev test emails")
    import secrets
    now = datetime.now(timezone.utc)
    existing = await db.users.find_one({"email": email}, {"_id": 0})
    if existing:
        user_id = existing["user_id"]
    else:
        user_id = f"user_{uuid.uuid4().hex[:12]}"
        await db.users.insert_one({
            "user_id": user_id, "email": email, "name": name, "picture": None,
            "gender": None, "dob": None, "deity_id": None,
            # TEMP (internal testing phase): everyone gets premium by default since real
            # Google Play Billing isn't wired up yet. Revert to False once billing ships.
            "is_public": True, "is_premium": True, "premium_expires_at": None,
            "affirmation_language": "english", "notification_count": 0,
            "notification_busy_start": None, "notification_busy_end": None,
            "busy_hours_enabled": False,
            "onboarding_done": False, "profile_done": False, "tour_done": False,
            "journey_intro_seen": False,
            "created_at": now,
        })
    session_token = f"devtok_{secrets.token_urlsafe(32)}"
    await db.user_sessions.insert_one({
        "session_token": session_token, "user_id": user_id,
        "created_at": now, "expires_at": now + timedelta(days=7),
    })
    user = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    return {"session_token": session_token, "user": clean_user(user)}

@api_router.post("/auth/session")
async def auth_session(req: SessionRequest):
    """Exchange session_id from Emergent auth for a session_token, upsert user."""
    async with httpx.AsyncClient(timeout=15.0) as client_http:
        r = await client_http.get(
            "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data",
            headers={"X-Session-ID": req.session_id},
        )
        if r.status_code != 200:
            raise HTTPException(status_code=401, detail="Invalid session_id")
        data = r.json()
    email = data.get("email")
    name = data.get("name") or email.split("@")[0]
    picture = data.get("picture")
    session_token = data.get("session_token")
    if not email or not session_token:
        raise HTTPException(status_code=400, detail="Malformed session data")

    now = datetime.now(timezone.utc)
    existing = await db.users.find_one({"email": email}, {"_id": 0})
    if existing:
        user_id = existing["user_id"]
    else:
        user_id = f"user_{uuid.uuid4().hex[:12]}"
        new_user = {
            "user_id": user_id,
            "email": email,
            "name": name,
            "picture": picture,
            "gender": None,
            "dob": None,
            "deity_id": None,
            # TEMP (internal testing phase): everyone gets premium by default since real
            # Google Play Billing isn't wired up yet. Revert to False once billing ships.
            "is_public": True,
            "is_premium": True,
            "premium_expires_at": None,
            "affirmation_language": "english",
            "notification_count": 0,
            "notification_busy_start": None,
            "notification_busy_end": None,
            "busy_hours_enabled": False,
            "onboarding_done": False,
            "profile_done": False,
            "tour_done": False,
            "journey_intro_seen": False,
            "created_at": now,
        }
        await db.users.insert_one(new_user)

    await db.user_sessions.update_one(
        {"session_token": session_token},
        {"$set": {
            "session_token": session_token,
            "user_id": user_id,
            "created_at": now,
            "expires_at": now + timedelta(days=7),
        }},
        upsert=True,
    )
    user = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    return {"session_token": session_token, "user": clean_user(user)}

@api_router.get("/auth/me")
async def get_me(user: dict = Depends(get_current_user)):
    return clean_user(user)

@api_router.post("/auth/logout")
async def logout(authorization: Optional[str] = Header(None)):
    if authorization and authorization.startswith("Bearer "):
        await db.user_sessions.delete_one({"session_token": authorization[7:]})
    return {"ok": True}

@api_router.delete("/account")
async def delete_account(user: dict = Depends(get_current_user)):
    """Permanently deletes the user's account and all associated data (Google Play account-deletion requirement)."""
    uid = user["user_id"]
    manifestation_ids = [m["id"] for m in await db.manifestations.find({"user_id": uid}, {"_id": 0, "id": 1}).to_list(1000)]
    await db.manifestations.delete_many({"user_id": uid})
    await db.garden.delete_many({"user_id": uid})
    await db.saved_manifestations.delete_many({"user_id": uid})
    if manifestation_ids:
        await db.saved_manifestations.delete_many({"manifestation_id": {"$in": manifestation_ids}})
    await db.user_sessions.delete_many({"user_id": uid})
    await db.users.delete_one({"user_id": uid})
    return {"ok": True}

# ------------------- Profile -------------------
@api_router.patch("/profile")
async def update_profile(req: ProfileUpdate, user: dict = Depends(get_current_user)):
    updates = {k: v for k, v in req.dict().items() if v is not None}
    if updates:
        updates["updated_at"] = datetime.now(timezone.utc)
        await db.users.update_one({"user_id": user["user_id"]}, {"$set": updates})
    updated = await db.users.find_one({"user_id": user["user_id"]}, {"_id": 0})
    return clean_user(updated)

# ------------------- Static data -------------------
@api_router.get("/deities")
async def get_deities():
    return DEITIES

@api_router.get("/chandra-dasa/today")
async def chandra_dasa_today():
    today = datetime.now(timezone.utc)
    day_of_year = today.timetuple().tm_yday
    day_number = (day_of_year % 30) + 1
    entry = next((c for c in CHANDRA_DASA if c["day_number"] == day_number), CHANDRA_DASA[0])
    return entry

@api_router.get("/affirmations/{category}")
async def get_affirmation(category: str, language: str = "english"):
    lookup_category = CATEGORY_ALIASES.get(category, category)
    lang_code = LANGUAGE_CODE_MAP.get(language, "en")
    per_lang = AFFIRMATIONS_I18N.get(lookup_category)

    if per_lang:
        resolved_category = category
        text = per_lang.get(lang_code) or per_lang.get("en") or AFFIRMATIONS["custom"]
        text_english = per_lang.get("en") or text
    else:
        # Category has no curated multi-language data (e.g. "custom") — fall back to the
        # static English-only text.
        resolved_category = "custom"
        text = AFFIRMATIONS["custom"]
        text_english = text

    return {
        "goal_category": resolved_category,
        "language": language,
        "text": text,
        "text_english": text_english,
    }

# ------------------- Subscriptions (Stubbed) -------------------
@api_router.post("/subscribe")
async def subscribe(req: SubscribeRequest, user: dict = Depends(get_current_user)):
    """Stubbed Google Play Billing — marks user premium immediately."""
    duration = {
        "first_month": 30, "monthly": 30, "6_month": 180, "yearly": 365
    }[req.plan]
    amount = {"first_month": 29, "monthly": 49, "6_month": 249, "yearly": 399}[req.plan]
    now = datetime.now(timezone.utc)
    expires = now + timedelta(days=duration)
    await db.users.update_one(
        {"user_id": user["user_id"]},
        {"$set": {"is_premium": True, "premium_expires_at": expires}},
    )
    sub = {
        "id": str(uuid.uuid4()),
        "user_id": user["user_id"],
        "plan": req.plan,
        "amount_inr": amount,
        "started_at": now,
        "expires_at": expires,
        "status": "active",
        "created_at": now,
    }
    await db.subscriptions.insert_one(sub)
    return {"is_premium": True, "expires_at": expires.isoformat(), "plan": req.plan}

# ------------------- Manifestations -------------------
@api_router.post("/manifestations")
async def create_manifestation(req: ManifestationCreate, user: dict = Depends(get_current_user)):
    now = datetime.now(timezone.utc)
    # Abandon any active manifestation
    await db.manifestations.update_many(
        {"user_id": user["user_id"], "status": "active"},
        {"$set": {"status": "abandoned"}},
    )
    m = {
        "id": str(uuid.uuid4()),
        "user_id": user["user_id"],
        "user_name": user.get("name"),
        "deity_id": user.get("deity_id"),
        **req.dict(),
        "current_day": 0,
        "streak_count": 0,
        "max_streak": 0,
        "tree_stage": 1,
        "reminders_ever_enabled": req.reminder_count > 0,
        "started_at": now,
        "last_ritual_at": None,
        "status": "active",
        "manifested_at": None,
        "donated": False,
        "donation_amount": 0,
        "testimony": None,
        "created_at": now,
    }
    await db.manifestations.insert_one(m)
    return clean_user(m)

@api_router.get("/manifestations/active")
async def get_active(user: dict = Depends(get_current_user)):
    m = await db.manifestations.find_one(
        {"user_id": user["user_id"], "status": "active"}, {"_id": 0}
    )
    return m

@api_router.post("/manifestations/{mid}/ritual")
async def perform_ritual(mid: str, req: RitualRequest = RitualRequest(), user: dict = Depends(get_current_user)):
    m = await db.manifestations.find_one({"id": mid, "user_id": user["user_id"]}, {"_id": 0})
    if not m:
        raise HTTPException(404, "Manifestation not found")
    now = datetime.now(timezone.utc)
    # Check if already done today. Prefer the client's local calendar date (avoids UTC vs
    # user-timezone day-boundary mismatches); fall back to UTC date comparison for old clients.
    prev_local = m.get("last_ritual_local_date")
    if req.local_date:
        if prev_local == req.local_date:
            raise HTTPException(400, "Already performed today")
    else:
        last = m.get("last_ritual_at")
        if last:
            if last.tzinfo is None:
                last = last.replace(tzinfo=timezone.utc)
            if last.date() == now.date():
                raise HTTPException(400, "Already performed today")
    # Determine whether today continues the streak (performed on the very next calendar day)
    # or breaks it (a full day or more was missed) — a gap of exactly 1 day continues the
    # streak, no previous ritual at all starts a fresh streak, and any larger gap resets it
    # back to 1. current_day (total days completed) always increments regardless — it tracks
    # lifetime rituals performed, not the consecutive streak.
    streak_continues = True
    if req.local_date:
        if prev_local:
            try:
                prev_date = datetime.strptime(prev_local, "%Y-%m-%d").date()
                curr_date = datetime.strptime(req.local_date, "%Y-%m-%d").date()
                streak_continues = (curr_date - prev_date).days == 1
            except ValueError:
                streak_continues = True  # malformed date — don't punish the user for it
    else:
        last = m.get("last_ritual_at")
        if last:
            if last.tzinfo is None:
                last = last.replace(tzinfo=timezone.utc)
            streak_continues = (now.date() - last.date()).days == 1
    # Increment day, streak
    new_day = m["current_day"] + 1
    new_streak = (m["streak_count"] + 1) if streak_continues else 1
    max_streak = max(m["max_streak"], new_streak)
    # Compute new stage
    days_per_stage = max(1, (m["cycle_days"] + 4) // 5)
    new_stage = min(5, (new_day // days_per_stage) + 1)
    is_new_stage = new_stage > m["tree_stage"]
    updates = {
        "current_day": new_day,
        "streak_count": new_streak,
        "max_streak": max_streak,
        "tree_stage": new_stage,
        "last_ritual_at": now,
        "last_ritual_local_date": req.local_date,
    }
    await db.manifestations.update_one({"id": mid}, {"$set": updates})
    await db.daily_rituals.insert_one({
        "id": str(uuid.uuid4()),
        "user_id": user["user_id"],
        "manifestation_id": mid,
        "day_number": new_day,
        "performed_at": now,
        # Stored alongside the UTC timestamp so the streak calendar (frontend) can render an
        # accurate completed-vs-missed grid using the SAME calendar-day boundaries the streak
        # logic itself uses, instead of re-deriving (and potentially mis-deriving, across a
        # timezone boundary) a date from performed_at.
        "local_date": req.local_date,
    })
    updated = await db.manifestations.find_one({"id": mid}, {"_id": 0})
    return {"manifestation": updated, "new_stage": is_new_stage, "streak_continued": streak_continues}

@api_router.get("/manifestations/{mid}/ritual-history")
async def get_ritual_history(mid: str, user: dict = Depends(get_current_user)):
    """Returns every completed ritual's day number + local calendar date for this
    manifestation, powering the graphical streak calendar/timeline in the app (which days
    were completed vs. missed). Older entries recorded before local_date tracking existed
    fall back to a date derived from their UTC performed_at timestamp."""
    m = await db.manifestations.find_one({"id": mid, "user_id": user["user_id"]}, {"_id": 0})
    if not m:
        raise HTTPException(404, "Manifestation not found")
    cursor = db.daily_rituals.find(
        {"manifestation_id": mid, "user_id": user["user_id"]},
        {"_id": 0, "day_number": 1, "local_date": 1, "performed_at": 1},
    ).sort("day_number", 1)
    rituals = await cursor.to_list(length=1000)
    for r in rituals:
        if not r.get("local_date") and r.get("performed_at"):
            pa = r["performed_at"]
            if isinstance(pa, datetime):
                r["local_date"] = pa.strftime("%Y-%m-%d")
        r.pop("performed_at", None)
    return {"rituals": rituals}



@api_router.post("/manifestations/{mid}/manifested")
async def mark_manifested(mid: str, req: ManifestedRequest, user: dict = Depends(get_current_user)):
    m = await db.manifestations.find_one({"id": mid, "user_id": user["user_id"]}, {"_id": 0})
    if not m:
        raise HTTPException(404, "Manifestation not found")
    now = datetime.now(timezone.utc)
    updates = {
        "status": "manifested",
        "manifested_at": now,
        "testimony": req.testimony,
        "donated": req.donation_amount > 0,
        "donation_amount": req.donation_amount,
        "donation_currency": req.donation_currency,
    }
    await db.manifestations.update_one({"id": mid}, {"$set": updates})
    # Add to garden
    await db.garden.insert_one({
        "id": str(uuid.uuid4()),
        "user_id": user["user_id"],
        "manifestation_id": mid,
        "testimony": req.testimony,
        "achieved_at": now,
    })
    updated = await db.manifestations.find_one({"id": mid}, {"_id": 0})
    return updated

@api_router.post("/manifestations/{mid}/abandon")
async def abandon(mid: str, user: dict = Depends(get_current_user)):
    await db.manifestations.update_one(
        {"id": mid, "user_id": user["user_id"]},
        {"$set": {"status": "abandoned"}},
    )
    return {"ok": True}

@api_router.patch("/manifestations/{mid}/reminders")
async def update_reminders(mid: str, req: ReminderUpdate, user: dict = Depends(get_current_user)):
    """Quick-access reminder center — updates reminder_count/mode/times on an active
    manifestation, without needing to abandon/recreate it. `reminders_ever_enabled` is sticky:
    once reminders have been turned on at least once (at setup or later), the Home bell icon
    stays visible forever for this manifestation, only its active/muted appearance changes."""
    m = await db.manifestations.find_one({"id": mid, "user_id": user["user_id"]}, {"_id": 0})
    if not m:
        raise HTTPException(404, "Manifestation not found")
    count = max(0, min(10, req.reminder_count))
    ever_enabled = bool(m.get("reminders_ever_enabled")) or count > 0
    await db.manifestations.update_one(
        {"id": mid},
        {"$set": {
            "reminder_count": count,
            "reminder_mode": req.reminder_mode,
            "reminder_times": req.reminder_times,
            "reminders_ever_enabled": ever_enabled,
        }},
    )
    updated = await db.manifestations.find_one({"id": mid}, {"_id": 0})
    return clean_user(updated)

# ------------------- Garden -------------------
@api_router.get("/garden")
async def get_garden(user: dict = Depends(get_current_user)):
    items = await db.garden.find({"user_id": user["user_id"]}, {"_id": 0}).sort("achieved_at", -1).to_list(200)
    # enrich with manifestation details (single batch query instead of N+1)
    mids = [g["manifestation_id"] for g in items]
    manifestations = await db.manifestations.find({"id": {"$in": mids}}, {"_id": 0}).to_list(len(mids))
    m_by_id = {m["id"]: m for m in manifestations}
    result = [{**g, "manifestation": m_by_id[g["manifestation_id"]]} for g in items if g["manifestation_id"] in m_by_id]
    return result

# ------------------- Community Wall -------------------
@api_router.get("/community/wall")
async def wall(
    user: dict = Depends(get_current_user),
    goal_category: Optional[str] = None,
    sacrifice_category: Optional[str] = None,
    cycle_days: Optional[int] = None,
    fasting_enabled: Optional[bool] = None,
    limit: int = 20,
):
    if not user.get("is_premium"):
        raise HTTPException(403, "Premium required")
    limit = max(1, min(50, limit))
    # Only completed manifestations are shown on the wall (showcase of successes)
    query: dict = {"is_public": True, "status": "manifested"}
    if goal_category:
        query["goal_category"] = goal_category
    if sacrifice_category:
        query["sacrifice_category"] = sacrifice_category
    if cycle_days:
        query["cycle_days"] = cycle_days
    if fasting_enabled is not None:
        query["fasting_enabled"] = fasting_enabled

    # Fair rotation: entries never shown (missing last_shown_at) sort first, then the
    # least-recently-shown ones — so every completed manifestation gets a turn, and if
    # there aren't enough fresh ones the oldest-shown entries are naturally reused.
    items = await db.manifestations.find(query, {"_id": 0}).sort(
        [("last_shown_at", 1), ("manifested_at", -1)]
    ).limit(limit).to_list(limit)

    if items:
        now = datetime.now(timezone.utc)
        ids = [i["id"] for i in items]
        await db.manifestations.update_many({"id": {"$in": ids}}, {"$set": {"last_shown_at": now}})
    return items

@api_router.get("/community/leaderboard")
async def leaderboard(user: dict = Depends(get_current_user)):
    if not user.get("is_premium"):
        raise HTTPException(403, "Premium required")
    items = await db.manifestations.find(
        {"is_public": True}, {"_id": 0}
    ).sort("max_streak", -1).limit(50).to_list(50)
    return items

@api_router.post("/community/save/{mid}")
async def save_manifestation(mid: str, user: dict = Depends(get_current_user)):
    if not user.get("is_premium"):
        raise HTTPException(403, "Premium required")
    existing = await db.saved_manifestations.find_one(
        {"user_id": user["user_id"], "manifestation_id": mid}
    )
    if existing:
        await db.saved_manifestations.delete_one({"_id": existing["_id"]})
        return {"saved": False}
    now = datetime.now(timezone.utc)
    await db.saved_manifestations.insert_one({
        "id": str(uuid.uuid4()), "user_id": user["user_id"],
        "manifestation_id": mid, "saved_at": now,
    })
    return {"saved": True}

@api_router.get("/community/saved")
async def get_saved(user: dict = Depends(get_current_user)):
    saved = await db.saved_manifestations.find({"user_id": user["user_id"]}, {"_id": 0}).to_list(100)
    mids = [s["manifestation_id"] for s in saved]
    result = await db.manifestations.find({"id": {"$in": mids}}, {"_id": 0}).to_list(len(mids))
    return result

# ------------------- Admin API -------------------
@api_router.get("/admin/stats")
async def admin_stats(admin: dict = Depends(get_current_admin)):
    total_users = await db.users.count_documents({})
    premium_users = await db.users.count_documents({"is_premium": True})
    total_manifestations = await db.manifestations.count_documents({})
    active_manifestations = await db.manifestations.count_documents({"status": "active"})
    completed_manifestations = await db.manifestations.count_documents({"status": "manifested"})
    wall_posts = await db.manifestations.count_documents({"status": "manifested", "is_public": True})
    return {
        "total_users": total_users,
        "premium_users": premium_users,
        "total_manifestations": total_manifestations,
        "active_manifestations": active_manifestations,
        "completed_manifestations": completed_manifestations,
        "wall_posts": wall_posts,
    }

@api_router.get("/admin/users")
async def admin_list_users(
    admin: dict = Depends(get_current_admin),
    search: Optional[str] = None,
    skip: int = 0,
    limit: int = 50,
):
    # Admin accounts are excluded from the manageable users list — they're not "normal" users
    # and should never be at risk of accidental block/delete from this screen.
    query: dict = {"email": {"$nin": list(ADMIN_EMAILS)}}
    if search:
        query["$or"] = [
            {"email": {"$regex": search, "$options": "i"}},
            {"name": {"$regex": search, "$options": "i"}},
        ]
    total = await db.users.count_documents(query)
    users = await db.users.find(query, {"_id": 0}).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
    return {"total": total, "users": [clean_user(u) for u in users]}

async def _get_target_user_or_404(user_id: str) -> dict:
    """Fetches a user by id and blocks any mutating admin action against another admin
    account — defense in depth even if the frontend somehow sent an admin's user_id."""
    u = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    if not u:
        raise HTTPException(status_code=404, detail="User not found")
    if u.get("email", "").lower() in ADMIN_EMAILS:
        raise HTTPException(status_code=400, detail="Cannot perform this action on an admin account")
    return u

@api_router.get("/admin/users/{user_id}")
async def admin_get_user(user_id: str, admin: dict = Depends(get_current_admin)):
    u = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    if not u:
        raise HTTPException(status_code=404, detail="User not found")
    manifestations = await db.manifestations.find({"user_id": user_id}, {"_id": 0}).sort("created_at", -1).to_list(200)
    total_donated_usd = round(sum(
        to_usd(m.get("donation_amount", 0), m.get("donation_currency", "INR"))
        for m in manifestations if m.get("donated")
    ), 2)
    return {"user": clean_user(u), "manifestations": manifestations, "total_donated_usd": total_donated_usd}

@api_router.patch("/admin/users/{user_id}")
async def admin_update_user(user_id: str, req: AdminUserUpdate, admin: dict = Depends(get_current_admin)):
    await _get_target_user_or_404(user_id)
    updates = {k: v for k, v in req.dict().items() if v is not None}
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")
    await db.users.update_one({"user_id": user_id}, {"$set": updates})
    u = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    return clean_user(u)

@api_router.post("/admin/users/{user_id}/block")
async def admin_block_user(user_id: str, req: BlockUserRequest, admin: dict = Depends(get_current_admin)):
    """Blocks a user's access — temporarily (req.days) or permanently (days omitted).
    Existing sessions are checked against this on every request (get_current_user), so the
    block takes effect immediately without needing to log the user out."""
    await _get_target_user_or_404(user_id)
    blocked_until = datetime.now(timezone.utc) + timedelta(days=req.days) if req.days else None
    await db.users.update_one(
        {"user_id": user_id},
        {"$set": {"is_blocked": True, "blocked_until": blocked_until}},
    )
    u = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    return clean_user(u)

@api_router.post("/admin/users/{user_id}/unblock")
async def admin_unblock_user(user_id: str, admin: dict = Depends(get_current_admin)):
    await _get_target_user_or_404(user_id)
    await db.users.update_one(
        {"user_id": user_id},
        {"$set": {"is_blocked": False, "blocked_until": None}},
    )
    u = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    return clean_user(u)

@api_router.post("/admin/users/{user_id}/extend-premium")
async def admin_extend_premium(user_id: str, req: ExtendPremiumRequest, admin: dict = Depends(get_current_admin)):
    """Grants/extends premium by req.days — stacks on top of a still-active expiry, otherwise
    starts counting from now."""
    u = await _get_target_user_or_404(user_id)
    now = datetime.now(timezone.utc)
    current_expiry = u.get("premium_expires_at")
    if current_expiry and current_expiry.tzinfo is None:
        current_expiry = current_expiry.replace(tzinfo=timezone.utc)
    base = current_expiry if (current_expiry and current_expiry > now) else now
    new_expiry = base + timedelta(days=req.days)
    await db.users.update_one(
        {"user_id": user_id},
        {"$set": {"is_premium": True, "premium_expires_at": new_expiry}},
    )
    updated = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    return clean_user(updated)

@api_router.post("/admin/users/{user_id}/revoke-premium")
async def admin_revoke_premium(user_id: str, admin: dict = Depends(get_current_admin)):
    await _get_target_user_or_404(user_id)
    await db.users.update_one(
        {"user_id": user_id},
        {"$set": {"is_premium": False, "premium_expires_at": None}},
    )
    u = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    return clean_user(u)

@api_router.post("/admin/users/{user_id}/force-logout")
async def admin_force_logout(user_id: str, admin: dict = Depends(get_current_admin)):
    """Revokes all active sessions for a user, forcing them to sign in again everywhere."""
    await _get_target_user_or_404(user_id)
    result = await db.user_sessions.delete_many({"user_id": user_id})
    return {"ok": True, "sessions_revoked": result.deleted_count}

@api_router.delete("/admin/users/{user_id}")
async def admin_delete_user(user_id: str, admin: dict = Depends(get_current_admin)):
    await _get_target_user_or_404(user_id)
    manifestation_ids = [m["id"] for m in await db.manifestations.find({"user_id": user_id}, {"_id": 0, "id": 1}).to_list(1000)]
    await db.manifestations.delete_many({"user_id": user_id})
    await db.garden.delete_many({"user_id": user_id})
    await db.saved_manifestations.delete_many({"user_id": user_id})
    if manifestation_ids:
        await db.saved_manifestations.delete_many({"manifestation_id": {"$in": manifestation_ids}})
    await db.user_sessions.delete_many({"user_id": user_id})
    await db.users.delete_one({"user_id": user_id})
    return {"ok": True}

@api_router.get("/admin/manifestations")
async def admin_list_manifestations(
    admin: dict = Depends(get_current_admin),
    status_filter: Optional[str] = None,
    skip: int = 0,
    limit: int = 50,
):
    query: dict = {}
    if status_filter:
        query["status"] = status_filter
    total = await db.manifestations.count_documents(query)
    items = await db.manifestations.find(query, {"_id": 0}).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
    return {"total": total, "items": items}

@api_router.delete("/admin/manifestations/{mid}")
async def admin_delete_manifestation(mid: str, admin: dict = Depends(get_current_admin)):
    result = await db.manifestations.delete_one({"id": mid})
    await db.saved_manifestations.delete_many({"manifestation_id": mid})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Manifestation not found")
    return {"ok": True}

# ------------------- Root -------------------
@api_router.get("/")
async def root():
    return {"message": "mTree API", "status": "ok"}

app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
