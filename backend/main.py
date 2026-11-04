import os, re, logging
from datetime import datetime
from typing import List, Dict, Optional
from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.responses import PlainTextResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from fastembed import TextEmbedding
from groq import Groq
from supabase import create_client, Client

# ---- Config ----
GROQ_API_KEY    = os.environ.get("GROQ_API_KEY", "")
GROQ_MODEL      = os.environ.get("GROQ_MODEL", "llama-3.3-70b-versatile")
SUPABASE_URL    = os.environ.get("SUPABASE_URL", "")
SUPABASE_KEY    = os.environ.get("SUPABASE_KEY", "")
WHATSAPP_NUMBER = os.environ.get("WHATSAPP_NUMBER", "+2347067666205")
PRODUCTION_HOST = os.environ.get("PRODUCTION_HOST", "")
THRESHOLD       = float(os.environ.get("SIMILARITY_THRESHOLD", "0.10"))
TEMPERATURE     = float(os.environ.get("TEMPERATURE", "0.2"))
TOP_K           = int(os.environ.get("TOP_K", "12"))
ALLOWED_ORIGINS = os.environ.get("ALLOWED_ORIGINS", "*").split(",")

# Hardcoded to fastembed's official 384-dim model to prevent ValueError
EMBEDDER_MODEL  = "BAAI/bge-small-en-v1.5"

PRICING_KW = re.compile(r"\b(how much|cost|price|pricing|retainer|fee|quote|bill|charge|budget)\b", re.I)
CONTACT_KW = re.compile(r"\b(phone|contact|whatsapp|number|reach|call|email|get in touch)\b", re.I)

# All prices are intentionally null until Victor confirms real pricing.
# The deterministic_pricing() handler below produces a "scoped per project"
# message when no prices are set, so nothing fabricated is ever shown to users.
FALLBACK_PRICING = [
    {"service_key": "website_design", "service_name": "Website Design",
     "price_naira": None, "price_range_low": None, "price_range_high": None, "is_one_time": True, "note": ""},
    {"service_key": "website_development", "service_name": "Website Development",
     "price_naira": None, "price_range_low": None, "price_range_high": None, "is_one_time": True, "note": ""},
    {"service_key": "brand_identity_development", "service_name": "Brand Identity Development",
     "price_naira": None, "price_range_low": None, "price_range_high": None, "is_one_time": True, "note": ""},
    {"service_key": "digital_marketing_strategy", "service_name": "Digital Marketing Strategy",
     "price_naira": None, "price_range_low": None, "price_range_high": None, "is_one_time": True, "note": ""},
    {"service_key": "social_media_management", "service_name": "Social Media Management",
     "price_naira": None, "price_range_low": None, "price_range_high": None, "is_one_time": False, "note": ""},
    {"service_key": "seo_management", "service_name": "SEO Management",
     "price_naira": None, "price_range_low": None, "price_range_high": None, "is_one_time": False, "note": ""},
    {"service_key": "performance_marketing", "service_name": "Performance Marketing",
     "price_naira": None, "price_range_low": None, "price_range_high": None, "is_one_time": False, "note": ""},
    {"service_key": "lead_generation", "service_name": "Lead Generation",
     "price_naira": None, "price_range_low": None, "price_range_high": None, "is_one_time": False, "note": ""},
]

# ---- App ----
app = FastAPI(title="Veektor's Portfolio AI")
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

# ---- Smalltalk ----
GREETINGS = {"hello","hi","hey","hiya","howdy","sup","what's up","whats up","good morning",
             "good afternoon","good evening","yo","hello there","hi there","hey there"}
THANKS = {"thanks","thank you","thank you so much","thx","ty","cheers"}
BYES = {"bye","goodbye","see you","see ya","later","ciao","take care"}

GREETING_RESPONSE = (
    "Hello! I'm Veektor — Victor's portfolio AI assistant. 👋\n\n"
    "I can help with:\n• His digital marketing services\n"
    "• His skills (SEO, paid ads, social media, content, analytics, automation)\n"
    "• Work experience\n• Services & pricing\n• How to hire him\n\n"
    "What would you like to know?"
)
THANKS_RESPONSE = "You're welcome! Ask anything else about Victor's work, projects, or services. 😊"
GOODBYE_RESPONSE = "Thanks for stopping by! Hit the WhatsApp button anytime to discuss a project. 👋"

def detect_smalltalk(msg: str) -> Optional[str]:
    clean = msg.strip().lower().rstrip("!.,?")
    if clean in GREETINGS: return GREETING_RESPONSE
    if clean in THANKS:    return THANKS_RESPONSE
    if clean in BYES:      return GOODBYE_RESPONSE
    return None

def deterministic_contact(q: str) -> Optional[str]:
    if CONTACT_KW.search(q):
        return (f"Victor's WhatsApp is {WHATSAPP_NUMBER}. "
                f"Click the WhatsApp button (📱) in this chat to message him directly.\n\n"
                f"Email: victorodjes@gmail.com")
    return None

def deterministic_pricing(q: str) -> Optional[str]:
    if not PRICING_KW.search(q):
        return None

    ql = q.lower()
    data = pricing_cache or FALLBACK_PRICING
    kw_map = {
        "website": "website_design", "site": "website_design",
        "development": "website_development",
        "brand": "brand_identity_development", "branding": "brand_identity_development",
        "strategy": "digital_marketing_strategy", "consult": "digital_marketing_strategy",
        "social": "social_media_management",
        "seo": "seo_management", "search engine": "seo_management",
        "performance": "performance_marketing", "ads": "performance_marketing",
        "advertising": "performance_marketing", "paid": "performance_marketing",
        "lead": "lead_generation",
        "content": "content_marketing",
        "email": "email_marketing",
        "automation": "workflow_automation",
        "crm": "crm_setup_management",
    }
    key = next((v for k, v in kw_map.items() if k in ql), None)

    def fmt(s):
        if s.get("price_naira"):
            return f"₦{s['price_naira']:,}"
        lo, hi = s.get("price_range_low"), s.get("price_range_high")
        if lo and hi:
            return f"₦{lo:,} – ₦{hi:,}"
        return None  # no price set

    # Check whether ANY row has a real price. If not, avoid the wall-of-"custom quote".
    any_price_set = any(fmt(s) for s in data)

    if not any_price_set:
        # No prices published — cleaner single message
        if key:
            service = next((x for x in data if x.get("service_key") == key), None)
            name = service["service_name"] if service else "this service"
            return (
                f"Pricing for {name} is scoped per project — Victor quotes each "
                f"engagement individually based on requirements. "
                f"📞 Click the WhatsApp button (📱) to get a tailored quote."
            )
        return (
            "Victor doesn't publish fixed rates — every project is scoped and quoted "
            "individually based on requirements. "
            "📞 Click the WhatsApp button (📱) to discuss your project and get a quote."
        )

    # Normal path — some/all prices are set
    lines: List[str] = []
    if key:
        s = next((x for x in data if x.get("service_key") == key), None)
        if s:
            price_str = fmt(s)
            period = "one-time setup" if s.get("is_one_time", True) else "per month"
            if price_str:
                lines.append(f"{s['service_name']} – {price_str} ({period})")
            else:
                lines.append(f"{s['service_name']} – custom quote ({period})")
            if s.get("note"):
                lines.append(s["note"])

    if not lines:
        lines.append("Here are Victor's standard pricing ranges:\n")
        for s in data:
            price_str = fmt(s)
            period = "(one-time)" if s.get("is_one_time", True) else "(per month)"
            if price_str:
                lines.append(f"• {s['service_name']} – {price_str} {period}")
            else:
                lines.append(f"• {s['service_name']} – custom quote {period}")

    lines.append("\n📞 For a tailored quote, click the WhatsApp button (📱) to contact Victor.")
    return "\n".join(lines)

# ---- Retrieval ----
def vector_search(q: str, top_k: int = TOP_K) -> List[Dict]:
    db = get_supabase()
    if not db: return []

    # fastembed returns a generator
    emb_generator = get_embedder().embed([q])
    emb = list(emb_generator)[0].tolist()

    res = db.rpc("match_portfolio_chunks", {
        "query_embedding": emb, "match_threshold": THRESHOLD, "match_count": top_k,
    }).execute()
    return res.data or []

# ---- Groq answer ----
async def grounded_reply(q: str, chunks: List[Dict]) -> str:
    if not chunks:
        return ("I couldn't find that in Victor's knowledge base. Please tap the WhatsApp "
                "button (📱) to reach him directly.\n\nAsk me about his services, skills, "
                "experience, or pricing.")

    ctx = "\n\n---\n\n".join(
        f"[{i}] {c['content']}\n(Source: {c.get('source_url','manual')})"
        for i, c in enumerate(chunks, 1)
    )

    prompt = f"""You are Kevs AI — the portfolio assistant for Victor
(Digital Marketing Strategist).

RULES:
1. Answer ONLY from the context below. Never invent facts, prices, or projects.
2. Cite sources inline as [1], [2] etc.
3. If pricing is asked — the system already handled it, don't guess prices.
4. For skill questions, synthesise ALL categories found (Strategy, SEO, Paid Ads,
   Social, Content, Analytics, Automation) — group them.
5. If partially covered, say what you know and suggest WhatsApp for the rest.
6. Never invent URLs, names, dates.
7. Warm, confident, third-person about Victor.
8. End with "📞 Want a tailored quote? → WhatsApp" ONLY if they seem ready to hire.

CONTEXT:
{ctx}

QUESTION: {q}

ANSWER:"""

    try:
        if not GROQ_API_KEY:
            raise ValueError("GROQ_API_KEY is missing.")
        client = Groq(api_key=GROQ_API_KEY)
        resp = client.chat.completions.create(
            model=GROQ_MODEL,
            messages=[{"role": "user", "content": prompt}],
            temperature=TEMPERATURE,
            max_tokens=700,
        )
        reply = resp.choices[0].message.content
    except Exception as e:
        logger.exception(f"Groq error: {e}")
        reply = ("I'm having trouble right now. Please tap the WhatsApp button (📱) "
                 "to reach Victor directly.")

    sources = list(dict.fromkeys(c.get("source_url", "manual") for c in chunks))
    if sources:
        reply += "\n\n**Sources:**\n" + "\n".join(f"• {s}" for s in sources)
    return reply

# ---- Knowledge admin ----
async def add_chunk(content: str, source_url: str = "manual"):
    db = get_supabase()
    if not db: raise HTTPException(500, "Database not connected")

    emb_generator = get_embedder().embed([content])
    emb = list(emb_generator)[0].tolist()

    db.table("portfolio_knowledge").insert({
        "source_url": source_url, "content": content, "embedding": emb,
    }).execute()

# ---- Endpoints ----
@app.post("/api/chat")
async def chat(req: ChatRequest):
    try:
        if (r := detect_smalltalk(req.message)):           return {"response": r}
        if (r := deterministic_contact(req.message)):      return {"response": r}
        if (r := deterministic_pricing(req.message)):      return {"response": r}
        results = vector_search(req.message)
        return {"response": await grounded_reply(req.message, results)}
    except Exception as e:
        logger.exception(f"chat error: {e}")
        raise HTTPException(500, "Internal error")

@app.post("/api/knowledge/add")
async def add_knowledge(req: ManualChunkRequest):
    try:
        await add_chunk(req.content, req.source_url)
        return {"message": "added"}
    except Exception as e:
        raise HTTPException(500, str(e))

@app.get("/api/knowledge/list")
async def list_knowledge(limit: int = 50):
    db = get_supabase()
    if not db: return {"count": 0, "chunks": []}
    data = db.table("portfolio_knowledge")\
        .select("id,source_url,content,created_at").limit(limit).execute().data
    return {"count": len(data or []), "chunks": data or []}

@app.delete("/api/knowledge/delete")
async def delete_knowledge(req: DeleteChunkRequest):
    db = get_supabase()
    if db:
        db.table("portfolio_knowledge").delete().eq("id", req.chunk_id).execute()
    return {"message": f"deleted {req.chunk_id}"}

@app.post("/api/admin/reembed")
async def reembed(bg: BackgroundTasks):
    async def work():
        db, model = get_supabase(), get_embedder()
        if not db: return
        rows = db.table("portfolio_knowledge").select("id,content").execute().data or []
        for r in rows:
            emb_generator = model.embed([r["content"]])
            emb = list(emb_generator)[0].tolist()
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
