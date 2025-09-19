import os
import uuid
import json
from typing import Any, Dict, List, Tuple

try:
    # Preferred import path
    from unstructured.partition.pdf import partition_pdf
except Exception:  # pragma: no cover - fallback for older versions
    # Some environments use a different namespace
    from unstructured.partition.pdf import partition_pdf  # type: ignore


DEFAULT_CHUNKING: Dict[str, Any] = {
    "chunking_strategy": "by_title",
    "max_characters": 1000,
    "new_after_n_chars": 800,
    "combine_text_under_n_chars": 200,
}


def ensure_dirs() -> Dict[str, str]:
    base_dir = os.getcwd()
    static_dir = os.path.join(base_dir, "static")
    uploads_dir = os.path.join(static_dir, "uploads")
    images_dir = os.path.join(static_dir, "images")
    data_dir = os.path.join(base_dir, "data", "index")
    for d in [static_dir, uploads_dir, images_dir, data_dir]:
        os.makedirs(d, exist_ok=True)
    return {
        "base": base_dir,
        "uploads": uploads_dir,
        "images": images_dir,
        "data": data_dir,
    }


def _placeholder_caption(page_number: int, section: str | None) -> str:
    if section:
        return f"Image on page {page_number} from section {section}"
    return f"Image on page {page_number}"


def process_pdf(
    pdf_path: str,
    *,
    ocr_enabled: bool = False,
    ocr_languages: str = "eng",
    chunking_overrides: Dict[str, Any] | None = None,
    max_pages: int | None = None,
) -> Tuple[str, List[Dict[str, Any]], List[Dict[str, Any]], List[Dict[str, Any]]]:
    """
    Parses a PDF into text chunks, extracted images, and tables using Unstructured.

    Returns (doc_id, text_chunks, images, tables). Also persists per-doc JSON files.
    """
    paths = ensure_dirs()
    doc_id = str(uuid.uuid4())

    chunking_params = DEFAULT_CHUNKING.copy()
    if chunking_overrides:
        chunking_params.update(chunking_overrides)

    strategy = "hi_res" if ocr_enabled else None

    elements = partition_pdf(
        filename=pdf_path,
        extract_images_in_pdf=True,
        infer_table_structure=True,
        image_output_dir_path=paths["images"],
        ocr_languages=ocr_languages,
        strategy=strategy,  # Only used when OCR is needed
        **chunking_params,
    )

    text_chunks: List[Dict[str, Any]] = []
    images: List[Dict[str, Any]] = []
    tables: List[Dict[str, Any]] = []

    chunk_id_counter = 0

    # Unstructured elements provide .text and .metadata
    for el in elements:
        try:
            category = getattr(el, "category", None) or getattr(el, "type", None)
            metadata = getattr(el, "metadata", None)
            page_number = None
            section = None
            image_path = None

            if metadata:
                page_number = getattr(metadata, "page_number", None) or metadata.get("page_number") if isinstance(metadata, dict) else None
                section = getattr(metadata, "section", None) or getattr(metadata, "title", None)
                image_path = getattr(metadata, "image_path", None) or (metadata.get("image_path") if isinstance(metadata, dict) else None)

            # Cap total pages if requested
            if max_pages and page_number and page_number > max_pages:
                continue

            if category in {"Table", "table"}:
                # Tables: keep the raw text or HTML; downstream can parse to CSV if needed
                tables.append(
                    {
                        "doc_id": doc_id,
                        "page_number": page_number,
                        "section": section,
                        "content": getattr(el, "text", "") or str(el),
                        "type": "table",
                    }
                )
            elif category in {"Image", "image", "Figure", "figure"} or image_path:
                # Images extracted to static/images by Unstructured, record path and simple caption
                caption = _placeholder_caption(page_number or -1, section)
                images.append(
                    {
                        "doc_id": doc_id,
                        "page_number": page_number,
                        "section": section,
                        "image_path": image_path,
                        "caption": caption,
                    }
                )
            else:
                # Treat everything else as text chunk
                content = getattr(el, "text", None)
                if not content:
                    continue
                text_chunks.append(
                    {
                        "doc_id": doc_id,
                        "chunk_id": chunk_id_counter,
                        "page_number": page_number,
                        "section": section,
                        "type": category or "text",
                        "content": content,
                    }
                )
                chunk_id_counter += 1
        except Exception:
            # Skip malformed elements but continue processing others
            continue

    # Persist per-document metadata JSON files
    text_path = os.path.join(paths["data"], f"{doc_id}_text.json")
    images_path = os.path.join(paths["data"], f"{doc_id}_images.json")
    tables_path = os.path.join(paths["data"], f"{doc_id}_tables.json")
    with open(text_path, "w", encoding="utf-8") as f:
        json.dump(text_chunks, f, ensure_ascii=False, indent=2)
    with open(images_path, "w", encoding="utf-8") as f:
        json.dump(images, f, ensure_ascii=False, indent=2)
    with open(tables_path, "w", encoding="utf-8") as f:
        json.dump(tables, f, ensure_ascii=False, indent=2)

    # Update global catalog
    catalog_path = os.path.join(paths["data"], "catalog.json")
    catalog: List[Dict[str, Any]] = []
    if os.path.exists(catalog_path):
        try:
            with open(catalog_path, "r", encoding="utf-8") as f:
                catalog = json.load(f)
        except Exception:
            catalog = []
    catalog.append(
        {
            "doc_id": doc_id,
            "pdf_path": pdf_path,
            "text_json": text_path,
            "images_json": images_path,
            "tables_json": tables_path,
        }
    )
    with open(catalog_path, "w", encoding="utf-8") as f:
        json.dump(catalog, f, ensure_ascii=False, indent=2)

    return doc_id, text_chunks, images, tables


