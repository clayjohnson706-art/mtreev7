import asyncio
import base64
import os
from dotenv import load_dotenv
from emergentintegrations.llm.chat import LlmChat, UserMessage
from PIL import Image

load_dotenv("/app/backend/.env")
api_key = os.getenv("EMERGENT_LLM_KEY")

# App's actual dark, premium, cosmic-mystical palette (see /app/frontend/src/theme/index.ts):
#   bg/void: near-black indigo (#08081a / #030308)   gold accent: #F5C542
#   electric indigo accent: #818CF8                  cyan accent: #22D3EE
#   off-white text: #F5F0E8
# Previous rejected concepts used an earthy emerald-green -> gold gradient which reads as a
# "wellness/nature" brand, not this app's actual dark, minimal, "premium mystical night-sky"
# aesthetic. New concepts below lean into solid/gradient GOLD line-art on transparent
# backgrounds (no green), so the mark reads correctly on the app's near-black surfaces.
#
# STRATEGY FOR IDENTICAL ICON: we generate ONE lockup image per concept (icon + wordmark,
# generously spaced, on a fully transparent canvas). A single deterministic image-processing
# pass (split_and_crop) then crops the SAME pixels into (a) a trimmed full lockup ("primary")
# and (b) an icon-only crop ("secondary"). Since both come from the exact same source raster,
# the icon is guaranteed pixel-identical between the two — it is never regenerated or redrawn
# by the model a second time.

CONCEPTS = {
    "a_constellation": (
        "A bold, confident gold (#F5C542) line-art mark, thick uniform-weight strokes (not "
        "hairline-thin, more like a substantial brushed-metal ribbon line), forming a "
        "stylized tree fused with the letter M: two strong upward branch-like peaks forming "
        "the M's shoulders, one thick tapered trunk stroke as the M's center leg. Add "
        "complexity: several smaller secondary branch offshoots forking from the main "
        "branches partway up, and fine thin constellation linking lines connecting the "
        "glowing star-dot accents at the branch tips to each other and down toward the "
        "trunk, like a star chart overlaid on the tree. At the base, the trunk flares into "
        "a small subtle root flourish — two or three thin curved root lines fanning outward "
        "into the ground. Layered, richly detailed yet still clean vector line art, "
        "sacred-geometry inspired, premium and intricate rather than sparse. Absolutely no "
        "green, no brown, no earthy colors — gold line only on a fully transparent "
        "background."
    ),
    "b_faceted_gem": (
        "A minimal faceted low-poly gold (#F5C542) gem-like canopy made of a few clean "
        "geometric triangular facets, sitting atop one slender tapered trunk stroke that "
        "forms the two legs of a subtle letter M silhouette. Tiny sharp electric-indigo "
        "(#818CF8) facet highlight accents catching light. Crystalline, luxury, jewel-like, "
        "flat vector faceted style, no green, no brown, no earthy colors, isolated on a "
        "fully transparent background."
    ),
    "c_circular_sigil": (
        "A perfectly thin gold (#F5C542) circular ring outline, like a minimal halo or "
        "sacred coin emblem, with a small minimal tree-fused-with-letter-M monogram mark "
        "centered inside it in solid gold — two upward branch peaks forming the M shoulders, "
        "one slender trunk stroke as the center leg. Clean geometric badge/sigil composition, "
        "modern, premium, minimal, no green, no brown, no earthy colors, isolated on a fully "
        "transparent background."
    ),
}

LOCKUP_TEMPLATE = (
    "{icon_desc} "
    "Composition: the icon mark is centered in the upper ~55% of a tall canvas with generous "
    "empty transparent padding all around it. Directly below it, separated by a clearly "
    "visible empty transparent gap (no overlap with the icon), add the wordmark 'mTree' in a "
    "modern minimal sans-serif, solid warm gold (#F5C542), lowercase 'm', generous "
    "letter-spacing, small-caps feel, no tagline, no other text. The entire image must be on "
    "a fully transparent background (alpha channel), no background shape, no card, no drop "
    "shadow, no border around the whole canvas, crisp clean vector edges, high resolution "
    "premium brand artwork, perfectly centered horizontally."
)


async def generate(prompt: str, out_path: str):
    chat = LlmChat(
        api_key=api_key,
        session_id=f"mtree-logo-{os.path.basename(out_path)}",
        system_message="You are a world-class minimal premium brand/logo designer specializing in dark, modern app icons.",
    )
    chat.with_model("gemini", "gemini-3-pro-image-preview").with_params(modalities=["image", "text"])
    msg = UserMessage(text=prompt)
    text, images = await chat.send_message_multimodal_response(msg)
    if not images:
        print(f"NO IMAGE returned for {out_path}. Text: {text[:200] if text else None}")
        return False
    image_bytes = base64.b64decode(images[0]["data"])
    with open(out_path, "wb") as f:
        f.write(image_bytes)
    print(f"Saved {out_path} ({len(image_bytes)} bytes)")
    return True


def strip_checkerboard_to_alpha(img: Image.Image, low: float = 8.0, high: float = 40.0) -> Image.Image:
    """The image model bakes its 'transparent background' as a literal opaque gray
    checkerboard (not a real alpha channel) — every pixel comes back with alpha=255.
    The checkerboard is low-saturation neutral gray, while the actual gold/accent artwork
    is highly saturated. We rebuild a REAL alpha channel from per-pixel color saturation
    (max(R,G,B) - min(R,G,B)), soft-thresholded between `low` and `high` for anti-aliased
    edges, so the checkerboard becomes truly transparent."""
    import numpy as np

    arr = np.array(img.convert("RGB")).astype(np.float32)
    maxc = arr.max(axis=2)
    minc = arr.min(axis=2)
    sat = maxc - minc
    alpha = np.clip((sat - low) / (high - low), 0, 1) * 255.0
    rgba = np.dstack([arr, alpha]).astype("uint8")
    return Image.fromarray(rgba, "RGBA")


def _row_has_content(px_row, threshold=6):
    return any(a > threshold for (_, _, _, a) in px_row)


def split_and_crop(lockup_path: str, primary_out: str, secondary_out: str, pad_frac: float = 0.06):
    """Deterministically derive (primary=trimmed full lockup, secondary=icon-only) from ONE
    generated raster so the icon pixels are guaranteed identical in both outputs."""
    raw = Image.open(lockup_path).convert("RGB")
    img = strip_checkerboard_to_alpha(raw)
    w, h = img.size
    rows_with_content = []
    for y in range(h):
        row = list(img.crop((0, y, w, y + 1)).getdata())
        rows_with_content.append(_row_has_content(row))

    content_rows = [y for y, has in enumerate(rows_with_content) if has]
    if not content_rows:
        raise RuntimeError(f"No non-transparent content found in {lockup_path}")
    top, bottom = content_rows[0], content_rows[-1]

    # find the largest contiguous empty-row gap strictly between top and bottom -> boundary
    # between icon (above) and wordmark (below)
    best_gap = (0, -1)  # (length, start_y)
    gap_start = None
    for y in range(top, bottom + 1):
        if not rows_with_content[y]:
            if gap_start is None:
                gap_start = y
        else:
            if gap_start is not None:
                gap_len = y - gap_start
                if gap_len > best_gap[0]:
                    best_gap = (gap_len, gap_start)
                gap_start = None
    if best_gap[0] <= 0:
        raise RuntimeError(f"Could not find icon/wordmark gap in {lockup_path}; regenerate with more spacing.")
    gap_len, gap_start = best_gap
    split_y = gap_start + gap_len // 2

    # ---- icon crop: bbox within [top, split_y) ----
    icon_region = img.crop((0, top, w, split_y))
    icon_bbox = icon_region.getbbox()
    if icon_bbox is None:
        raise RuntimeError(f"Empty icon region in {lockup_path}")
    icon_crop = icon_region.crop(icon_bbox)
    iw, ih = icon_crop.size
    side = int(max(iw, ih) * (1 + pad_frac * 2))
    icon_canvas = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    icon_canvas.paste(icon_crop, ((side - iw) // 2, (side - ih) // 2), icon_crop)
    icon_canvas.save(secondary_out)
    print(f"Saved icon-only (secondary) {secondary_out} size={icon_canvas.size}")

    # ---- full lockup trim: bbox of entire content, with padding ----
    full_bbox = img.getbbox()
    full_crop = img.crop(full_bbox)
    fw, fh = full_crop.size
    pad_x = int(fw * pad_frac)
    pad_y = int(fh * pad_frac)
    full_canvas = Image.new("RGBA", (fw + pad_x * 2, fh + pad_y * 2), (0, 0, 0, 0))
    full_canvas.paste(full_crop, (pad_x, pad_y), full_crop)
    full_canvas.save(primary_out)
    print(f"Saved full lockup (primary) {primary_out} size={full_canvas.size}")


RUN_KEYS = ["a_constellation"]  # user chose the first (constellation) concept


async def main():
    for key in RUN_KEYS:
        icon_desc = CONCEPTS[key]
        prompt = LOCKUP_TEMPLATE.format(icon_desc=icon_desc)
        raw_path = f"/app/backend/gen_logo_{key}_v2_raw.png"
        ok = await generate(prompt, raw_path)
        if not ok:
            continue
        try:
            split_and_crop(
                raw_path,
                primary_out=f"/app/backend/gen_logo_{key}_v2_primary.png",
                secondary_out=f"/app/backend/gen_logo_{key}_v2_secondary.png",
            )
        except Exception as e:
            print(f"Post-processing failed for {key}: {e}")


asyncio.run(main())
