#!/usr/bin/env python3
"""
Generates LinguaFill extension icons (16, 32, 48, 128 px) using only the Python
standard library (struct, zlib, math).

Chrome Web Store icon spec for 128x128:
  - 96x96 px main artwork centered inside a 128x128 canvas
  - 16 px transparent margin on all four sides (RGBA, hasAlpha: yes)
"""
from __future__ import annotations

import math
import os
import struct
import zlib
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / "assets" / "icons"


def clamp(x: float, lo: float = 0.0, hi: float = 1.0) -> float:
    return lo if x < lo else (hi if x > hi else x)


def smoothstep(edge0: float, edge1: float, x: float) -> float:
    t = clamp((x - edge0) / (edge1 - edge0))
    return t * t * (3.0 - 2.0 * t)


def sd_rounded_box(px: float, py: float, cx: float, cy: float, hw: float, hh: float, r: float) -> float:
    qx = abs(px - cx) - (hw - r)
    qy = abs(py - cy) - (hh - r)
    return math.hypot(max(qx, 0.0), max(qy, 0.0)) + min(max(qx, qy), 0.0) - r


def sd_segment(px: float, py: float, ax: float, ay: float, bx: float, by: float) -> float:
    vx, vy = bx - ax, by - ay
    wx, wy = px - ax, py - ay
    denom = vx * vx + vy * vy
    t = clamp((wx * vx + wy * vy) / denom) if denom > 0 else 0.0
    dx = px - (ax + t * vx)
    dy = py - (ay + t * vy)
    return math.hypot(dx, dy)


def blend(dst: tuple[float, float, float, float], src: tuple[float, float, float, float]) -> tuple[float, float, float, float]:
    sr, sg, sb, sa = src
    dr, dg, db, da = dst
    out_a = sa + da * (1.0 - sa)
    if out_a <= 1e-6:
        return (0.0, 0.0, 0.0, 0.0)
    out_r = (sr * sa + dr * da * (1.0 - sa)) / out_a
    out_g = (sg * sa + dg * da * (1.0 - sa)) / out_a
    out_b = (sb * sa + db * da * (1.0 - sa)) / out_a
    return (out_r, out_g, out_b, out_a)


def render_icon(size: int) -> bytes:
    # 128 px icon uses exact 16 px transparent padding (96x96 artwork).
    # Smaller toolbar sizes use minimal padding so they stay legible at 16 px.
    pad = 16.0 if size == 128 else round(size * 0.0625, 2)
    art = size - 2.0 * pad
    cx = cy = size * 0.5
    half = art * 0.5
    corner = art * 0.24
    aa = 0.85

    raw = bytearray()
    for y in range(size):
        raw.append(0)  # PNG filter type 0 (None)
        py = y + 0.5
        for x in range(size):
            px = x + 0.5
            col = (0.0, 0.0, 0.0, 0.0)

            # Soft drop shadow (kept inside the 16 px margin)
            if size >= 48:
                d_shadow = sd_rounded_box(px, py - art * 0.025, cx, cy, half, half, corner)
                sh_alpha = (1.0 - smoothstep(-art * 0.02, art * 0.09, d_shadow)) * 0.28
                if sh_alpha > 0:
                    col = blend(col, (18.0, 14.0, 46.0, sh_alpha))

            # Main rounded-square badge (purple #7C5CFF -> blue #3B82F6 -> cyan #06B6D4)
            d_box = sd_rounded_box(px, py, cx, cy, half, half, corner)
            box_alpha = 1.0 - smoothstep(-aa, aa, d_box)
            if box_alpha > 0:
                u = clamp((px - pad) / art)
                v = clamp((py - pad) / art)
                t = clamp(u * 0.62 + v * 0.52)
                if t < 0.55:
                    k = t / 0.55
                    r = 124.0 * (1.0 - k) + 59.0 * k
                    g = 92.0 * (1.0 - k) + 130.0 * k
                    b = 255.0 * (1.0 - k) + 246.0 * k
                else:
                    k = (t - 0.55) / 0.45
                    r = 59.0 * (1.0 - k) + 6.0 * k
                    g = 130.0 * (1.0 - k) + 210.0 * k
                    b = 246.0 * (1.0 - k) + 218.0 * k

                # Subtle inner top highlight
                border_d = abs(d_box + art * 0.012)
                rim = (1.0 - smoothstep(0.0, art * 0.025, border_d)) * max(0.0, 1.0 - v * 1.4) * 0.28
                r = min(255.0, r + (255.0 - r) * rim)
                g = min(255.0, g + (255.0 - g) * rim)
                b = min(255.0, b + (255.0 - b) * rim)
                col = blend(col, (r, g, b, box_alpha))

                # Form input card outline inside the badge
                card_cx = cx
                card_cy = cy - art * 0.02
                card_hw = art * 0.30
                card_hh = art * 0.19
                card_r = art * 0.07
                stroke = max(1.3, art * 0.036)
                d_card = sd_rounded_box(px, py, card_cx, card_cy, card_hw, card_hh, card_r)

                # Frosted interior fill of the input box
                inside_card = 1.0 - smoothstep(-aa, aa, d_card)
                if inside_card > 0:
                    col = blend(col, (255.0, 255.0, 255.0, inside_card * 0.14))

                # White outline of the input box (with cutout around the bottom-left globe badge)
                gx = card_cx - card_hw * 0.35
                gy = card_cy + card_hh * 0.92
                gr = art * 0.105
                d_globe_cut = math.hypot(px - gx, py - gy) - (gr + stroke * 0.65)
                if d_globe_cut > 0:
                    outline_alpha = 1.0 - smoothstep(stroke * 0.5 - aa, stroke * 0.5 + aa, abs(d_card))
                    if outline_alpha > 0:
                        col = blend(col, (255.0, 255.0, 255.0, outline_alpha * 0.98))

                # Typing caret + text bar inside the input
                caret_x = card_cx - card_hw * 0.58
                d_caret = sd_segment(px, py, caret_x, card_cy - card_hh * 0.42, caret_x, card_cy + card_hh * 0.38)
                caret_alpha = 1.0 - smoothstep(stroke * 0.42 - aa, stroke * 0.42 + aa, d_caret)
                if caret_alpha > 0:
                    col = blend(col, (255.0, 255.0, 255.0, caret_alpha * 0.96))

                # Sparkle / lightning bolt on the right side (symbolising instant auto-fill)
                sx = card_cx + card_hw * 0.25
                sy = card_cy - card_hh * 0.04
                d_spark = min(
                    sd_segment(px, py, sx + art * 0.03, sy - art * 0.08, sx - art * 0.03, sy + art * 0.01),
                    sd_segment(px, py, sx - art * 0.03, sy + art * 0.01, sx + art * 0.03, sy + art * 0.01),
                    sd_segment(px, py, sx + art * 0.03, sy + art * 0.01, sx - art * 0.02, sy + art * 0.09),
                )
                spark_alpha = 1.0 - smoothstep(stroke * 0.38 - aa, stroke * 0.38 + aa, d_spark)
                if spark_alpha > 0:
                    col = blend(col, (165.0, 243.0, 252.0, spark_alpha * 0.98))

                # Language globe badge (bottom-left of the input frame)
                d_globe = math.hypot(px - gx, py - gy) - gr
                globe_ring = 1.0 - smoothstep(stroke * 0.42 - aa, stroke * 0.42 + aa, abs(d_globe))
                globe_fill = 1.0 - smoothstep(-aa, aa, d_globe)
                if globe_fill > 0:
                    col = blend(col, (255.0, 255.0, 255.0, globe_fill * 0.98))
                    # Meridians / equator etched in brand blue
                    thin = max(0.9, art * 0.016)
                    d_eq = abs(py - gy)
                    d_mer = abs(math.hypot((px - gx) * 1.55, py - gy) - gr * 0.62)
                    d_v = abs(px - gx)
                    grid_d = min(d_eq, d_mer, d_v)
                    if math.hypot(px - gx, py - gy) < gr - thin * 0.9:
                        grid_alpha = 1.0 - smoothstep(thin * 0.5 - aa * 0.6, thin * 0.5 + aa * 0.6, grid_d)
                        if grid_alpha > 0:
                            col = blend(col, (67.0, 97.0, 238.0, grid_alpha * 0.9))
                if globe_ring > 0:
                    col = blend(col, (255.0, 255.0, 255.0, globe_ring))

            r8 = int(round(clamp(col[0] / 255.0) * 255))
            g8 = int(round(clamp(col[1] / 255.0) * 255))
            b8 = int(round(clamp(col[2] / 255.0) * 255))
            a8 = int(round(clamp(col[3]) * 255))
            raw.extend((r8, g8, b8, a8))

    def chunk(tag: bytes, data: bytes) -> bytes:
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)

    ihdr = struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)  # 8-bit RGBA
    idat = zlib.compress(bytes(raw), level=9)
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr) + chunk(b"IDAT", idat) + chunk(b"IEND", b"")


def main() -> None:
    os.makedirs(OUT_DIR, exist_ok=True)
    for size in (16, 32, 48, 128):
        path = OUT_DIR / f"icon{size}.png"
        path.write_bytes(render_icon(size))
        print(f"Wrote {path.relative_to(ROOT)} ({size}x{size} RGBA)")


if __name__ == "__main__":
    main()
