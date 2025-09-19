import os
import json
from typing import Any, Dict, List, Tuple

import numpy as np
import faiss  # type: ignore
from sentence_transformers import SentenceTransformer


MODEL_NAME_DEFAULT = os.environ.get("EMBEDDING_MODEL", "BAAI/bge-small-en-v1.5")
INDEX_TYPE_DEFAULT = os.environ.get("INDEX_TYPE", "IP").upper()  # IP or L2
INDEX_DIR = os.path.join(os.getcwd(), "data", "index")
TEXT_INDEX_PATH = os.path.join(INDEX_DIR, "text.index")
IMAGE_INDEX_PATH = os.path.join(INDEX_DIR, "image.index")
TEXT_META_PATH = os.path.join(INDEX_DIR, "text_meta.json")
IMAGE_META_PATH = os.path.join(INDEX_DIR, "image_meta.json")
TEXT_CFG_PATH = os.path.join(INDEX_DIR, "text_index_config.json")
IMAGE_CFG_PATH = os.path.join(INDEX_DIR, "image_index_config.json")


_model: SentenceTransformer | None = None


def _ensure_dirs() -> None:
    os.makedirs(INDEX_DIR, exist_ok=True)


def get_model(model_name: str | None = None) -> SentenceTransformer:
    global _model
    if _model is None:
        _model = SentenceTransformer(model_name or MODEL_NAME_DEFAULT)
    return _model


def embed_texts(texts: List[str], model_name: str | None = None, normalize: bool = True) -> np.ndarray:
    model = get_model(model_name)
    embeddings = model.encode(texts, normalize_embeddings=normalize, convert_to_numpy=True)
    if embeddings.dtype != np.float32:
        embeddings = embeddings.astype("float32")
    return embeddings


def _read_index_config(cfg_path: str) -> Dict[str, Any] | None:
    if os.path.exists(cfg_path):
        try:
            with open(cfg_path, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return None
    return None


def _write_index_config(cfg_path: str, cfg: Dict[str, Any]) -> None:
    with open(cfg_path, "w", encoding="utf-8") as f:
        json.dump(cfg, f, ensure_ascii=False, indent=2)


def _create_index(dimension: int, index_type: str) -> faiss.Index:
    if index_type == "L2":
        return faiss.IndexFlatL2(dimension)
    return faiss.IndexFlatIP(dimension)


def _load_or_create_index(path: str, cfg_path: str, dimension: int, desired_index_type: str) -> Tuple[faiss.Index, str]:
    _ensure_dirs()
    cfg = _read_index_config(cfg_path)
    if os.path.exists(path) and cfg:
        # Use existing index and its type
        return faiss.read_index(path), cfg.get("type", "IP").upper()
    # Create new index with desired type
    used_type = (desired_index_type or INDEX_TYPE_DEFAULT).upper()
    index = _create_index(dimension, used_type)
    _write_index_config(cfg_path, {"type": used_type, "dim": dimension})
    return index, used_type


def _load_meta(path: str) -> List[Dict[str, Any]]:
    if os.path.exists(path):
        try:
            with open(path, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return []
    return []


def _save_index_and_meta(index: faiss.Index, index_path: str, meta: List[Dict[str, Any]], meta_path: str) -> None:
    _ensure_dirs()
    faiss.write_index(index, index_path)
    with open(meta_path, "w", encoding="utf-8") as f:
        json.dump(meta, f, ensure_ascii=False, indent=2)


def add_to_text_index(
    chunks: List[Dict[str, Any]],
    model_name: str | None = None,
    index_type: str | None = None,
) -> Tuple[int, int]:
    """Add text chunks to the global text index. Returns (added, total)."""
    if not chunks:
        return 0, _count_index(TEXT_META_PATH)
    texts = [c.get("content", "") for c in chunks]
    # Load or create index and determine normalization
    # Need dimension before creating index: embed one sample minimally
    probe = embed_texts([texts[0] if texts else ""], model_name, normalize=True)
    dim = probe.shape[1]
    index, used_type = _load_or_create_index(TEXT_INDEX_PATH, TEXT_CFG_PATH, dim, (index_type or INDEX_TYPE_DEFAULT))
    normalize = used_type == "IP"
    embeddings = embed_texts(texts, model_name, normalize=normalize)
    meta = _load_meta(TEXT_META_PATH)
    index.add(embeddings)
    meta.extend(chunks)
    _save_index_and_meta(index, TEXT_INDEX_PATH, meta, TEXT_META_PATH)
    return len(chunks), len(meta)


def add_to_image_index(
    images: List[Dict[str, Any]],
    model_name: str | None = None,
    index_type: str | None = None,
) -> Tuple[int, int]:
    """Add image captions to the global image index. Returns (added, total)."""
    if not images:
        return 0, _count_index(IMAGE_META_PATH)
    captions = [img.get("caption", "") for img in images]
    # Determine index and normalization
    probe = embed_texts([captions[0] if captions else ""], model_name, normalize=True)
    dim = probe.shape[1]
    index, used_type = _load_or_create_index(IMAGE_INDEX_PATH, IMAGE_CFG_PATH, dim, (index_type or INDEX_TYPE_DEFAULT))
    normalize = used_type == "IP"
    embeddings = embed_texts(captions, model_name, normalize=normalize)
    meta = _load_meta(IMAGE_META_PATH)
    index.add(embeddings)
    meta.extend(images)
    _save_index_and_meta(index, IMAGE_INDEX_PATH, meta, IMAGE_META_PATH)
    return len(images), len(meta)


def _count_index(meta_path: str) -> int:
    meta = _load_meta(meta_path)
    return len(meta)


def search_text(
    query: str,
    k: int = 3,
    model_name: str | None = None,
    index_type: str | None = None,
) -> List[Dict[str, Any]]:
    if not os.path.exists(TEXT_INDEX_PATH):
        return []
    meta = _load_meta(TEXT_META_PATH)
    if not meta:
        return []
    cfg = _read_index_config(TEXT_CFG_PATH) or {"type": (index_type or INDEX_TYPE_DEFAULT)}
    used_type = str(cfg.get("type", INDEX_TYPE_DEFAULT)).upper()
    normalize = used_type == "IP"
    q = embed_texts([query], model_name, normalize=normalize)
    index = faiss.read_index(TEXT_INDEX_PATH)
    scores, indices = index.search(q, min(k, len(meta)))
    hits: List[Dict[str, Any]] = []
    for rank, (idx, score) in enumerate(zip(indices[0], scores[0])):
        if idx == -1:
            continue
        m = meta[idx]
        hits.append(
            {
                "rank": rank + 1,
                "score": float(score),
                "content": m.get("content"),
                "page": m.get("page_number"),
                "section": m.get("section"),
                "doc_id": m.get("doc_id"),
                "chunk_id": m.get("chunk_id"),
            }
        )
    return hits


def search_images(
    query: str,
    k: int = 3,
    model_name: str | None = None,
    index_type: str | None = None,
) -> List[Dict[str, Any]]:
    if not os.path.exists(IMAGE_INDEX_PATH):
        return []
    meta = _load_meta(IMAGE_META_PATH)
    if not meta:
        return []
    cfg = _read_index_config(IMAGE_CFG_PATH) or {"type": (index_type or INDEX_TYPE_DEFAULT)}
    used_type = str(cfg.get("type", INDEX_TYPE_DEFAULT)).upper()
    normalize = used_type == "IP"
    q = embed_texts([query], model_name, normalize=normalize)
    index = faiss.read_index(IMAGE_INDEX_PATH)
    scores, indices = index.search(q, min(k, len(meta)))
    hits: List[Dict[str, Any]] = []
    for rank, (idx, score) in enumerate(zip(indices[0], scores[0])):
        if idx == -1:
            continue
        m = meta[idx]
        hits.append(
            {
                "rank": rank + 1,
                "score": float(score),
                "image_path": m.get("image_path"),
                "caption": m.get("caption"),
                "page": m.get("page_number"),
                "doc_id": m.get("doc_id"),
            }
        )
    return hits


