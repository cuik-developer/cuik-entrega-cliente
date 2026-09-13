"""Compose two new Apple Wallet pass mockups over the existing Gradual iPhone photo.
Keeps frame, status bar, Done, QR, Hold Near Reader. Repaints only the pass card."""
import math, random
from PIL import Image, ImageDraw, ImageFont

ROOT = "C:/Users/Checo/Downloads/cuik-entrega-cliente (1)/.claude/worktrees/loving-matsumoto/apps/web/public/landing/"
BASE = ROOT + "mockup-gradual-7.png"
FONT = "C:/Windows/Fonts/segoeui.ttf"
FONT_B = "C:/Windows/Fonts/segoeuib.ttf"
FONT_SL = "C:/Windows/Fonts/segoeuisl.ttf"

CARD = (614, 527, 1632, 1719)
R = 28
HEADER_BOTTOM = 731
STRIP_BOTTOM = 1076
QR_BOX = (955, 1315, 1280, 1640)
PAD = 50  # inner padding from card edge


def f(size, kind="r"):
    return ImageFont.truetype({"r": FONT, "b": FONT_B, "sl": FONT_SL}[kind], size)


def nfc(draw, cx, cy, color):
    # contactless symbol: dot + three arcs opening to the right
    draw.ellipse((cx - 7, cy - 7, cx + 7, cy + 7), fill=color)
    for i, r in enumerate((26, 44, 62)):
        draw.arc((cx - r, cy - r, cx + r, cy + r), start=-42, end=42, fill=color, width=8)


def rounded_card(im, header, body):
    d = ImageDraw.Draw(im)
    d.rounded_rectangle(CARD, radius=R, fill=body)
    # header band with only top corners rounded
    d.rounded_rectangle((CARD[0], CARD[1], CARD[2], HEADER_BOTTOM + R), radius=R, fill=header)
    d.rectangle((CARD[0], HEADER_BOTTOM, CARD[2], HEADER_BOTTOM + R), fill=body)
    d.rectangle((CARD[0], HEADER_BOTTOM, CARD[2], HEADER_BOTTOM), fill=header)
    return d


def strip_layer(w, h, bg, painter):
    layer = Image.new("RGBA", (w, h), bg)
    painter(ImageDraw.Draw(layer, "RGBA"), w, h)
    return layer


def text_right(draw, x_right, y, s, font, fill):
    wdt = draw.textlength(s, font=font)
    draw.text((x_right - wdt, y), s, font=font, fill=fill)


def compose(out, header_color, body_color, strip_bg, strip_painter, logo, header_field, fields, text_color, label_color, qr_bg_fix=None):
    im = Image.open(BASE).convert("RGBA")
    qr = im.crop(QR_BOX)
    d = rounded_card(im, header_color, body_color)
    # strip
    strip = strip_layer(CARD[2] - CARD[0], STRIP_BOTTOM - HEADER_BOTTOM, strip_bg, strip_painter)
    im.paste(strip, (CARD[0], HEADER_BOTTOM))
    d = ImageDraw.Draw(im)
    # logo (wordmark)
    logo(d, CARD[0] + PAD, CARD[1] + 60)
    # header field (right)
    lab, val = header_field
    text_right(d, CARD[2] - PAD, CARD[1] + 62, lab, f(40), label_color)
    text_right(d, CARD[2] - PAD, CARD[1] + 112, val, f(54), text_color)
    # secondary fields
    (l1, v1), (l2, v2) = fields
    d.text((CARD[0] + PAD, 1118), l1, font=f(38), fill=label_color)
    d.text((CARD[0] + PAD, 1166), v1, font=f(60), fill=text_color)
    xr = CARD[0] + 650
    d.text((xr, 1118), l2, font=f(38), fill=label_color)
    d.text((xr, 1166), v2, font=f(60), fill=text_color)
    # QR back in place
    if qr_bg_fix:
        # QR crop carries navy corners; replace navy with body color
        px = qr.load()
        for yy in range(qr.height):
            for xx in range(qr.width):
                r, g, b, a = px[xx, yy]
                if abs(r - 33) < 20 and abs(g - 44) < 20 and abs(b - 63) < 20:
                    px[xx, yy] = body_color + (255,)
    im.paste(qr, QR_BOX[:2])
    nfc(d, 1566, 1640, text_color)
    im.save(out)
    print("saved", out)


# ---------- 1. Lumi Nail Bar — descuento ----------
def lumi_strip(d, w, h):
    random.seed(7)
    # soft diagonal bands + tiny sparkles
    for i in range(-h, w, 120):
        d.polygon([(i, h), (i + 60, h), (i + 60 + h, 0), (i + h, 0)], fill=(246, 214, 224, 60))
    for _ in range(46):
        x, y = random.randint(20, w - 20), random.randint(20, h - 20)
        s = random.choice((10, 14, 18))
        col = (216, 120, 150, 170)
        d.polygon([(x, y - s), (x + s * 0.28, y - s * 0.28), (x + s, y), (x + s * 0.28, y + s * 0.28),
                   (x, y + s), (x - s * 0.28, y + s * 0.28), (x - s, y), (x - s * 0.28, y - s * 0.28)], fill=col)
    # a few nail-polish drops
    for x, y, r in ((160, 250, 34), (520, 120, 26), (860, 270, 30), (1240, 150, 24), (1560, 240, 32), (2020, 140, 28)):
        d.ellipse((x - r, y - r, x + r, y + r), fill=(214, 92, 128, 210))
        d.ellipse((x - r * 0.45, y - r * 0.55, x - r * 0.05, y - r * 0.15), fill=(255, 255, 255, 150))


def lumi_logo(d, x, y):
    d.text((x, y - 6), "lumi", font=f(118, "b"), fill=(255, 255, 255))
    d.text((x + 300, y + 48), "NAIL BAR", font=f(34), fill=(240, 205, 220))
    d.ellipse((x + 258, y + 20, x + 284, y + 46), fill=(214, 92, 128))


compose(
    ROOT + "mockup-lumi-descuento.png",
    header_color=(72, 34, 86), body_color=(72, 34, 86),
    strip_bg=(250, 232, 238, 255), strip_painter=lumi_strip,
    logo=lumi_logo,
    header_field=("TU BENEFICIO", "20% martes"),
    fields=(("Nombre", "Valeria Ruiz"), ("Cliente desde", "Mar 2025")),
    text_color=(255, 255, 255), label_color=(224, 200, 216), qr_bg_fix=True,
)


# ---------- 2. Aroma Spa — cupón de regalo ----------
def aroma_strip(d, w, h):
    random.seed(3)
    # leaf shapes in two greens, low contrast, scattered
    for _ in range(38):
        x, y = random.randint(0, w), random.randint(0, h)
        L = random.randint(70, 130)
        ang = random.uniform(-0.9, 0.9)
        col = random.choice(((118, 150, 120, 120), (92, 128, 100, 110), (160, 176, 140, 110)))
        pts = []
        for t in range(0, 21):
            u = t / 20 * math.pi
            px_ = math.cos(u) * L / 2
            py_ = math.sin(u) * L / 5
            pts.append((x + px_ * math.cos(ang) - py_ * math.sin(ang), y + px_ * math.sin(ang) + py_ * math.cos(ang)))
        for t in range(0, 21):
            u = math.pi + t / 20 * math.pi
            px_ = math.cos(u) * L / 2
            py_ = math.sin(u) * L / 5
            pts.append((x + px_ * math.cos(ang) - py_ * math.sin(ang), y + px_ * math.sin(ang) + py_ * math.cos(ang)))
        d.polygon(pts, fill=col)
        d.line([pts[0], pts[20]], fill=(80, 100, 84, 90), width=3)


def aroma_logo(d, x, y):
    # small leaf mark + wordmark
    d.ellipse((x + 4, y + 14, x + 64, y + 74), fill=(150, 190, 160))
    d.polygon([(x + 34, y + 6), (x + 66, y + 44), (x + 34, y + 82), (x + 2, y + 44)], fill=(196, 222, 200))
    d.text((x + 84, y - 26), "aroma", font=f(112, "sl"), fill=(244, 240, 228))
    d.text((x + 92, y + 92), "S P A", font=f(28), fill=(196, 222, 200))


compose(
    ROOT + "mockup-aroma-regalo.png",
    header_color=(20, 68, 66), body_color=(20, 68, 66),
    strip_bg=(236, 229, 210, 255), strip_painter=aroma_strip,
    logo=aroma_logo,
    header_field=("CUPÓN DE REGALO", "1 masaje"),
    fields=(("Para", "Lucía Paredes"), ("Válido hasta", "31 dic 2026")),
    text_color=(244, 240, 228), label_color=(190, 212, 200), qr_bg_fix=True,
)
