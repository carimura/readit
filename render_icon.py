#!/usr/bin/env python3
# Renders the Read It bullhorn to transparent PNGs (16/32/48/128) with no deps.
# Shapes are defined in a 128 logical space, sampled at 4x and area-downsampled
# (premultiplied) for clean antialiased, alpha-correct edges.
import zlib, struct, os

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "icons")
LOGICAL = 128
SS = 4
MASTER = LOGICAL * SS

BLUE = (45, 127, 249)
WHITE = (255, 255, 255)
TILE_R = 26

# Bullhorn, enlarged to fill the tile (≈8px margins).
BELL = [(32, 50), (32, 78), (88, 100), (88, 28)]
MOUTH = (16, 55, 16, 18, 4)  # x, y, w, h, r
WAVE_HALF = 3.5


def in_round_rect(x, y, x0, y0, w, h, r):
    if x < x0 or x > x0 + w or y < y0 or y > y0 + h:
        return False
    cx = min(max(x, x0 + r), x0 + w - r)
    cy = min(max(y, y0 + r), y0 + h - r)
    dx, dy = x - cx, y - cy
    return dx * dx + dy * dy <= r * r


def in_poly(x, y, pts):
    inside = False
    j = len(pts) - 1
    for i in range(len(pts)):
        xi, yi = pts[i]
        xj, yj = pts[j]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi) + xi:
            inside = not inside
        j = i
    return inside


def quad(p0, c, p1, steps=26):
    out = []
    for k in range(steps + 1):
        t = k / steps
        mt = 1 - t
        out.append((mt * mt * p0[0] + 2 * mt * t * c[0] + t * t * p1[0],
                    mt * mt * p0[1] + 2 * mt * t * c[1] + t * t * p1[1]))
    return out


def segs_of(curve):
    return list(zip(curve, curve[1:]))


WAVES = segs_of(quad((96, 46), (110, 64), (96, 82))) + \
        segs_of(quad((106, 36), (122, 64), (106, 92)))


def dist2_seg(px, py, a, b):
    ax, ay = a
    bx, by = b
    dx, dy = bx - ax, by - ay
    d = dx * dx + dy * dy
    t = 0 if d == 0 else ((px - ax) * dx + (py - ay) * dy) / d
    t = 0 if t < 0 else 1 if t > 1 else t
    ex, ey = px - (ax + t * dx), py - (ay + t * dy)
    return ex * ex + ey * ey


def on_wave(x, y):
    h2 = WAVE_HALF * WAVE_HALF
    for a, b in WAVES:
        if dist2_seg(x, y, a, b) <= h2:
            return True
    return False


# Render the supersampled master as premultiplied RGBA.
master = bytearray(MASTER * MASTER * 4)
for j in range(MASTER):
    y = (j + 0.5) / SS
    row = j * MASTER
    for i in range(MASTER):
        x = (i + 0.5) / SS
        idx = (row + i) * 4
        if not in_round_rect(x, y, 0, 0, 128, 128, TILE_R):
            continue
        if in_poly(x, y, BELL) or in_round_rect(x, y, *MOUTH) or (x >= 88 and on_wave(x, y)):
            r, g, b = WHITE
        else:
            r, g, b = BLUE
        master[idx] = r
        master[idx + 1] = g
        master[idx + 2] = b
        master[idx + 3] = 255


def downsample(size):
    out = bytearray(size * size * 4)
    scale = MASTER / size
    for oy in range(size):
        y0, y1 = int(oy * scale), int((oy + 1) * scale)
        for ox in range(size):
            x0, x1 = int(ox * scale), int((ox + 1) * scale)
            sr = sg = sb = sa = cnt = 0
            for yy in range(y0, y1):
                base = (yy * MASTER) * 4
                for xx in range(x0, x1):
                    p = base + xx * 4
                    a = master[p + 3]
                    sr += master[p] * a
                    sg += master[p + 1] * a
                    sb += master[p + 2] * a
                    sa += a
                    cnt += 1
            o = (oy * size + ox) * 4
            if sa:
                out[o] = round(sr / sa)
                out[o + 1] = round(sg / sa)
                out[o + 2] = round(sb / sa)
            out[o + 3] = round(sa / cnt) if cnt else 0
    return out


def write_png(path, size, rgba):
    def chunk(typ, data):
        return (struct.pack(">I", len(data)) + typ + data +
                struct.pack(">I", zlib.crc32(typ + data) & 0xffffffff))
    raw = bytearray()
    for y in range(size):
        raw.append(0)
        raw += rgba[y * size * 4:(y + 1) * size * 4]
    png = (b"\x89PNG\r\n\x1a\n" +
           chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)) +
           chunk(b"IDAT", zlib.compress(bytes(raw), 9)) +
           chunk(b"IEND", b""))
    with open(path, "wb") as f:
        f.write(png)


for size in (16, 32, 48, 128):
    write_png(os.path.join(OUT, f"icon{size}.png"), size, downsample(size))
    print(f"wrote icon{size}.png")
