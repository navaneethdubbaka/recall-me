import os
import io
import json
import base64
from typing import Any, Dict, List, Tuple

import fitz  # PyMuPDF
import numpy as np
import torch
from PIL import Image
from transformers import CLIPModel, CLIPProcessor
from langchain_core.documents import Document
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain_community.vectorstores import FAISS


BASE_DIR = os.getcwd()
STORE_DIR = os.path.join(BASE_DIR, "data", "index", "langchain")
FAISS_DIR = os.path.join(STORE_DIR, "faiss_lc")
IMAGE_DATA_JSON = os.path.join(STORE_DIR, "image_data.json")

_clip_model: CLIPModel | None = None
_clip_processor: CLIPProcessor | None = None


def _ensure_dirs() -> None:
    os.makedirs(STORE_DIR, exist_ok=True)


def get_clip() -> Tuple[CLIPModel, CLIPProcessor]:
    global _clip_model, _clip_processor
    if _clip_model is None or _clip_processor is None:
        _clip_model = CLIPModel.from_pretrained("openai/clip-vit-base-patch32")
        _clip_model.eval()
        _clip_processor = CLIPProcessor.from_pretrained("openai/clip-vit-base-patch32")
    return _clip_model, _clip_processor


def embed_text_clip(texts: List[str]) -> np.ndarray:
    model, processor = get_clip()
    with torch.no_grad():
        inputs = processor(text=texts, return_tensors="pt", padding=True, truncation=True, max_length=77)
        feats = model.get_text_features(**inputs)
        feats = feats / feats.norm(dim=-1, keepdim=True)
    return feats.cpu().numpy().astype("float32")


def embed_image_clip(pil_images: List[Image.Image]) -> np.ndarray:
    if not pil_images:
        return np.zeros((0, 512), dtype="float32")
    model, processor = get_clip()
    with torch.no_grad():
        inputs = processor(images=pil_images, return_tensors="pt")
        feats = model.get_image_features(**inputs)
        feats = feats / feats.norm(dim=-1, keepdim=True)
    return feats.cpu().numpy().astype("float32")


def _to_base64_png(image: Image.Image) -> str:
    buf = io.BytesIO()
    image.save(buf, format="PNG")
    return base64.b64encode(buf.getvalue()).decode()


def build_unified_index(pdf_path: str) -> Dict[str, Any]:
    """
    Parses a PDF using PyMuPDF, splits text, extracts images, embeds both with CLIP,
    and builds a unified FAISS index using LangChain's FAISS vectorstore.
    Persists FAISS locally and a JSON mapping of image_id -> base64 PNG.
    """
    _ensure_dirs()

    doc = fitz.open(pdf_path)
    splitter = RecursiveCharacterTextSplitter(chunk_size=500, chunk_overlap=100)

    docs: List[Document] = []
    vectors: List[np.ndarray] = []
    image_data_store: Dict[str, str] = {}

    for page_index, page in enumerate(doc):
        # Text
        text = page.get_text() or ""
        if text.strip():
            temp_doc = Document(page_content=text, metadata={"page": page_index, "type": "text"})
            chunks = splitter.split_documents([temp_doc])
            chunk_texts = [c.page_content for c in chunks]
            if chunk_texts:
                text_embs = embed_text_clip(chunk_texts)
                vectors.extend(list(text_embs))
                docs.extend(chunks)

        # Images
        for img_index, img in enumerate(page.get_images(full=True)):
            try:
                xref = img[0]
                base_image = doc.extract_image(xref)
                image_bytes = base_image.get("image")
                pil_image = Image.open(io.BytesIO(image_bytes)).convert("RGB")

                image_id = f"page_{page_index}_img_{img_index}"
                image_data_store[image_id] = _to_base64_png(pil_image)

                img_emb = embed_image_clip([pil_image])
                if img_emb.shape[0] == 1:
                    vectors.append(img_emb[0])
                    docs.append(
                        Document(
                            page_content=f"[Image: {image_id}]",
                            metadata={"page": page_index, "type": "image", "image_id": image_id},
                        )
                    )
            except Exception:
                continue

    doc.close()

    if not docs or not vectors:
        # Create an empty store placeholder if needed
        # but typically return early
        return {"added": 0, "total": 0}

    embeddings_array = np.stack(vectors).astype("float32")
    pairs = [(d.page_content, v) for d, v in zip(docs, embeddings_array)]
    metadatas = [d.metadata for d in docs]

    vs = FAISS.from_embeddings(text_embeddings=pairs, embedding=None, metadatas=metadatas)
    vs.save_local(FAISS_DIR)

    with open(IMAGE_DATA_JSON, "w", encoding="utf-8") as f:
        json.dump(image_data_store, f, ensure_ascii=False, indent=2)

    return {"added": len(docs), "total": len(docs)}


def _load_store() -> Tuple[FAISS | None, Dict[str, str]]:
    _ensure_dirs()
    img_map: Dict[str, str] = {}
    if os.path.exists(IMAGE_DATA_JSON):
        try:
            with open(IMAGE_DATA_JSON, "r", encoding="utf-8") as f:
                img_map = json.load(f)
        except Exception:
            img_map = {}
    if not os.path.isdir(FAISS_DIR):
        return None, img_map
    vs = FAISS.load_local(FAISS_DIR, embeddings=None, allow_dangerous_deserialization=True)
    return vs, img_map


def search_unified_lc(query: str, k: int = 5) -> Dict[str, Any]:
    vs, img_map = _load_store()
    if vs is None:
        return {"hits": [], "images": img_map}
    q_vec = embed_text_clip([query])[0]
    results = vs.similarity_search_by_vector(embedding=q_vec, k=k)
    # Convert Documents to simple dicts
    hits: List[Dict[str, Any]] = []
    for rank, d in enumerate(results, start=1):
        hits.append(
            {
                "rank": rank,
                "content": d.page_content,
                "metadata": d.metadata,
            }
        )
    return {"hits": hits, "images": img_map}


