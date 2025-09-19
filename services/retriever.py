from typing import Any, Dict, List

from .indexer import search_text as _search_text
from .indexer import search_images as _search_images


def search(query: str, k: int = 3, model_name: str | None = None, index_type: str | None = None) -> Dict[str, List[Dict[str, Any]]]:
    text_hits = _search_text(query, k, model_name=model_name, index_type=index_type)
    image_hits = _search_images(query, k, model_name=model_name, index_type=index_type)
    return {
        "text_hits": text_hits,
        "images": image_hits,
    }


