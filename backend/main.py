import os, re, logging
from datetime import datetime
from typing import List, Dict, Optional
from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from fastembed import TextEmbedding  # <-- CHANGED: Lightweight ONNX embedder
from groq import Groq
from supabase import create_client, Client

# ---- Config ----
GROQ_API_KEY    = os.environ.get("GROQ_API_KEY", "")
GROQ_MODEL      = os.environ.get("GROQ_MODEL", "llama-3.3-70b-versatile")
SUPABASE_URL    = os.environ.get("SUPABASE_URL", "")
SUPABASE_KEY    = os.environ.get("SUPABASE_KEY", "")
WHATSAPP_NUMBER = os.environ.get("WHATSAPP_NUMBER", "+2347067666205")
THRESHOLD       = float(os.environ.get("SIMILARITY_THRESHOLD", "0.15"))
TEMPERATURE     = float(os.environ.get("TEMPERATURE", "0.2"))
TOP_K           = int(os.environ.get("TOP_K", "12"))
ALLOWED_ORIGINS = os.environ.get("ALLOWED_ORIGINS", "*").split(",")
EMBEDDER_MODEL  = os.environ.get("EMBEDDER_MODEL", "sentence-transformers/all-MiniLM-L6-v2")

PRICING_KW = re.compile(r"\b(how much|cost|price|pricing|retainer|fee|quote|bill|charge|budget)\b", re.I)
CONTACT_KW = re.compile(r"\b(phone|contact|whatsapp|number|reach|call|email|get in touch)\b", re.I)

# (FALLBACK_PRICING remains unchanged)
FALLBACK_PRICING = [
    {"service_key": "website_design", "service_name": "Website Design", "price_range_low": 250000, "price_range_high": 600000, "is_one_time": True, "note": "One-time setup."},
    {"service_key": "website_development", "service_name": "Website Development", "price_range_low": 400000, "price_range_high": 1200000, "is_one_time": True, "note": "One-time setup."},
    {"service_key": "brand_identity_development", "service_name": "Brand Identity Development", "price_range_low": 300000, "price_range_high": 800000, "is_one_time": True, "note": "One-time setup."},
    {"service_key": "digital_marketing_strategy", "service_name": "Digital Marketing Strategy", "price_range_low": 200000, "price_range_high": 500000, "is_one_time": True, "note": "Consultation / strategy engagement."},
    {"service_key": "social_media_management", "service_name": "Social Media Management", "price_range_low": 200000, "price_range_high": 600000, "is_one_time": False, "note": "Tiered monthly retainer."},
    {"service_key": "seo_management", "service_name": "Search Engine Optimisation (SEO)", "price_range_low": 200000, "price_range_high": 500000, "is_one_time": False, "note": "Tiered monthly retainer."},
    {"service_key": "performance_marketing", "service_name": "Performance Marketing", "price_range_low": 250000, "price_range_high": 700000, "is_one_time": False, "note": "Tiered monthly retainer. Excludes ad spend."},
    {"service_key": "lead_generation", "service_name": "Lead Generation", "price_range_low": 200000, "price_range_high": 600000, "is_one_time": False, "note": "Tiered monthly retainer."},
]

# ---- App ----
app = FastAPI(title="Kevs Portfolio AI")
app.add_middleware(CORSMiddleware, allow_origins=ALLOWED_ORIGINS,
                   allow_credentials=True, allow_methods=["*"], allow_headers=["*"])
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class ChatRequest(BaseModel): message: str
class ManualChunkRequest(BaseModel): content: str; source_url: str = "manual"
class DeleteChunkRequest(BaseModel): chunk_id: int

# ---- Globals ----
_embedder: Optional[TextEmbedding] = None
_supabase: Optional[Client] = None
pricing_cache: List[Dict] = []

def get_embedder():
    global _embedder
    if _embedder is None:
        logger.info(f"Loading embedder {EMBEDDER_MODEL}...")
        _embedder = TextEmbedding(model_name=EMBEDDER_MODEL)
    return _embedder

def get_supabase():
    global _supabase
    if _supabase is None:
        if not SUPABASE_URL or not SUPABASE_KEY:
            logger.error("Supabase credentials missing!")
            return None
        _supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
    return _supabase

# (Smalltalk, Pricing, Retrieval logic remain unchanged)
# ... [Copy the detect_smalltalk, deterministic_contact, deterministic_pricing from your previous code] ...

def vector_search(q: str, top_k: int = TOP_K) -> List[Dict]:
    db = get_supabase()
    if not db: return []
    # CHANGED: fastembed returns a generator, so we wrap it in list()
    emb = list(get_embedder().embed([q]))[0].tolist()
    res = db.rpc("match_portfolio_chunks", {
        "query_embedding": emb, "match_threshold": THRESHOLD, "match_count": top_k,
    }).execute()
    return res.data or []

# (grounded_reply remains unchanged)
# ... [Copy grounded_reply from previous code] ...

# ---- Knowledge admin ----
async def add_chunk(content: str, source_url: str = "manual"):
    db = get_supabase()
    if not db: raise HTTPException(500, "Database not connected")
    # CHANGED: fastembed returns a generator, so we wrap it in list()
    emb = list(get_embedder().embed([content]))[0].tolist()
    db.table("portfolio_knowledge").insert({
        "source_url": source_url, "content": content, "embedding": emb,
    }).execute()

# (Endpoints remain unchanged)
# ... [Copy the endpoints from previous code] ...

@app.post("/api/admin/reembed")
async def reembed(bg: BackgroundTasks):
    async def work():
        db, model = get_supabase(), get_embedder()
        if not db: return
        rows = db.table("portfolio_knowledge").select("id,content").execute().data or []
        for r in rows:
            emb = list(model.embed([r["content"]]))[0].tolist()
            db.table("portfolio_knowledge").update({"embedding": emb}).eq("id", r["id"]).execute()
        logger.info(f"Re-embedded {len(rows)} chunks.")
    bg.add_task(work)
    return {"message": "re-embedding started"}

@app.get("/health")
async def health():
    return {"status": "ok", "ts": datetime.now().isoformat()}

@app.on_event("startup")
async def startup():
    global pricing_cache
    try:
        db = get_supabase()
        if db:
            pricing_cache = db.table("service_pricing")\
                .select("*").eq("is_active", True).execute().data or []
    except Exception as e:
        logger.warning(f"pricing load failed: {e}")
        pricing_cache = FALLBACK_PRICING
    logger.info(f"Startup complete. {len(pricing_cache)} pricing rows.")
