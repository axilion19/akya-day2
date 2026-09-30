"""Render the watcher-supervisor architecture figure (Turkish labels, for the jury slides).

    python3 docs/figures/render_agent_architecture.py   # writes agent_architecture_tr.svg

The PNG is rendered from the SVG with headless Chrome (see the end of this file).
"""

from pathlib import Path
from xml.sax.saxutils import escape

W, H = 1600, 900
SANS = "Helvetica Neue, Helvetica, Arial, sans-serif"
MONO = "Menlo, Consolas, monospace"

INK, MUTED = "#0f172a", "#475569"
TEAL, TEAL_BG = "#0f766e", "#f0fdfa"
SKY, SKY_BG = "#0369a1", "#f0f9ff"
SLATE, SLATE_BG = "#334155", "#f1f5f9"
AMBER, AMBER_BG = "#b45309", "#fffbeb"
RED = "#b91c1c"

out: list[str] = []


def rect(x, y, w, h, stroke, fill, r=14, dash=False, sw=2):
    d = ' stroke-dasharray="7 6"' if dash else ""
    out.append(
        f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{r}" fill="{fill}" '
        f'stroke="{stroke}" stroke-width="{sw}"{d}/>'
    )


def text(x, y, s, size=15, color=INK, weight="normal", anchor="start", font=SANS, italic=False):
    st = ' font-style="italic"' if italic else ""
    out.append(
        f'<text x="{x}" y="{y}" font-family="{font}" font-size="{size}" fill="{color}" '
        f'font-weight="{weight}" text-anchor="{anchor}"{st}>{escape(s)}</text>'
    )


def chips(x, y, names, color, size=13):
    """Tool names as rounded monospace chips on one line; returns the end x."""
    for name in names:
        w = len(name) * size * 0.61 + 16
        out.append(
            f'<rect x="{x}" y="{y - size - 3}" width="{w:.0f}" height="{size + 10}" rx="6" '
            f'fill="white" stroke="{color}" stroke-opacity="0.45"/>'
        )
        text(x + 8, y + 1, name, size=size, color=color, font=MONO)
        x += w + 8
    return x


def arrow(x1, y1, x2, y2, color=MUTED, dash=False, sw=2):
    d = ' stroke-dasharray="6 5"' if dash else ""
    out.append(
        f'<line x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}" stroke="{color}" stroke-width="{sw}"'
        f'{d} marker-end="url(#head-{color[1:]})"/>'
    )


def marker(color):
    out.append(
        f'<marker id="head-{color[1:]}" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="7" '
        f'markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" '
        f'fill="{color}"/></marker>'
    )


out.append(f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}">')
out.append("<defs>")
for c in (MUTED, TEAL, SKY, RED, SLATE, AMBER):
    marker(c)
out.append("</defs>")
out.append(f'<rect width="{W}" height="{H}" fill="white"/>')

# Title
text(70, 62, "Gözcü – Baş Denetçi Mimarisi", size=32, weight="bold")
text(70, 94, "Her 5 dakikada bir (tik): kod hesaplar, LLM ajanları değerlendirir, insan karar verir",
     size=17, color=MUTED)

# Operator
rect(640, 118, 320, 74, SLATE, SLATE_BG)
text(800, 150, "İnsan Operatör", size=20, weight="bold", anchor="middle")
text(800, 176, "uyarıları alır · baş denetçiyle konuşur", size=14, color=MUTED, anchor="middle")

# Operator <-> supervisor
arrow(740, 250, 740, 197, RED, sw=2.5)
text(728, 228, "uyarı · aciliyet derecesiyle", size=14, color=RED, anchor="end")
arrow(860, 197, 860, 250, SLATE, sw=2.5)
text(872, 228, "mesaj: “Doğu Yolu'nu izle”, “aracımız geliyor”", size=14, color=SLATE)

# Supervisor
sx, sy, sw_, sh = 430, 254, 740, 196
rect(sx, sy, sw_, sh, TEAL, TEAL_BG, sw=2.5)
text(sx + 24, sy + 36, "Baş Denetçi", size=23, weight="bold", color=TEAL)
text(sx + 170, sy + 36, "LLM · tüm sektörler", size=16, color=MUTED)
text(sx + 24, sy + 64, "Sektörleri birleştirir, sektörler arası örüntüleri görür, seviye verir, operatörü uyarır",
     size=15)
text(sx + 24, sy + 97, "Araçlar", size=13, color=MUTED, weight="bold")
chips(sx + 90, sy + 98, ["set_level", "alert_operator", "get_route", "get_notes", "get_reports"], TEAL)
text(sx + 24, sy + 134, "Sohbet", size=13, color=MUTED, weight="bold")
chips(sx + 90, sy + 135, ["create_watcher", "register_expected_vehicle", "reply_operator"], TEAL)
text(sx + 24, sy + 176, "Çıktı: submit_supervisor_decision · durum özeti, genel tehdit, alan raporu kararları",
     size=14, color=MUTED)

# Tick loop (left)
rect(70, 254, 330, 196, SLATE, "white", sw=1.5)
text(92, 286, "Bir tik (5 dk)", size=18, weight="bold")
for i, line in enumerate([
    "1  Drone kareleri YOLO ile analiz edilir",
    "2  Gözcüler sektörlerini paralel değerlendirir",
    "3  Baş denetçi seviye ve uyarı kararı verir",
    "4  Operatör uyarılır, sohbet cevaplanır",
]):
    text(92, 320 + i * 30, line, size=14.5, color=INK)

# Registry (right), read and written by the supervisor and the watchers
arrow(1172, 352, 1197, 352, AMBER, sw=2)
arrow(1198, 372, 1173, 372, AMBER, sw=2)

# Registry (right)
rect(1200, 254, 330, 196, AMBER, AMBER_BG, sw=1.5)
text(1222, 286, "Araç Kaydı (ortak hafıza)", size=18, weight="bold", color=AMBER)
for i, line in enumerate([
    "Seviyeler: DÜŞÜK · ORTA · YÜKSEK",
    "Yükseltme bir sonraki kontrolde onaylanır",
    "Gözcü notları, önceki kararlar",
    "Operatörün bildirdiği araçlar",
]):
    text(1222, 320 + i * 30, line, size=14.5)

# Watchers (all report to the supervisor: arrow heads spread along its bottom edge)
wy, wh, ww, gap, wx0 = 540, 128, 270, 24, 77
TARGETS = [540, 670, 800, 930, 1060]
watchers = [
    ("W1", "Kuzey Yolu", "Kuzeydoğu Kavşağı"),
    ("W2", "Doğu Yolu", "Güneydoğu Yerleşimi"),
    ("W3", "Güney Kapısı Yaklaşımı", "Güneybatı Yolu"),
    ("W4", "Batı Yerleşimi", "Kuzeybatı Yolu"),
]
for i, (wid, a, b) in enumerate(watchers):
    x = wx0 + i * (ww + gap)
    rect(x, wy, ww, wh, SKY, SKY_BG, sw=2)
    text(x + 18, wy + 32, f"Gözcü {wid}", size=19, weight="bold", color=SKY)
    text(x + 118, wy + 32, "LLM", size=14, color=MUTED)
    text(x + 18, wy + 62, a, size=15)
    text(x + 18, wy + 86, b, size=15)
    text(x + 18, wy + 113, "her tik 1 sektör, sırayla", size=13, color=MUTED, italic=True)
    arrow(x + ww / 2, wy - 4, TARGETS[i], sy + sh + 6, SKY)
x5 = wx0 + 4 * (ww + gap)
rect(x5, wy, ww, wh, SKY, "white", dash=True, sw=2)
text(x5 + 18, wy + 32, "Gözcü W5", size=19, weight="bold", color=SKY)
text(x5 + 118, wy + 32, "LLM", size=14, color=MUTED)
text(x5 + 18, wy + 62, "Operatör isteğiyle", size=15)
text(x5 + 18, wy + 86, "tek sektör: Doğu Yolu", size=15)
text(x5 + 18, wy + 113, "her tik, create_watcher ile", size=13, color=MUTED, italic=True)
arrow(x5 + ww / 2, wy - 4, TARGETS[4], sy + sh + 6, SKY, dash=True)
label = "sektör raporu: araç seviyeleri + gerekçe + kanıt, saha raporu kararları"
out.append(f'<rect x="{800 - 262}" y="{482}" width="524" height="26" rx="6" fill="white"/>')
text(800, 500, label, size=14, color=SKY, anchor="middle")

# Watcher tools line
text(77, 704, "Gözcü araçları", size=13, color=MUTED, weight="bold")
end = chips(190, 705, ["get_route", "get_notes", "get_reports"], SKY)
text(end + 4, 705, "→", size=16, color=MUTED)
end = chips(end + 26, 705, ["submit_watch_report"], SKY)
text(end + 6, 705, "araç seviyeleri · notlar · rapor kararı ve 0–100 güven puanı", size=14, color=MUTED)

# Code layer
cy = 742
rect(77, cy, 1446, 128, SLATE, SLATE_BG, sw=1.5)
text(100, cy + 32, "Kod katmanı", size=19, weight="bold", color=SLATE)
text(222, cy + 32, "deterministik · LLM hiçbir sayıyı kendisi hesaplamaz", size=15, color=MUTED)
text(1500, cy + 32, "Girdiler: drone kareleri · araç izleri · saha raporları (güvenilmez)",
     size=14, color=MUTED, anchor="end")
cols = [
    ("YOLO araç tespiti", "drone karelerinde araç ve tipi", "(1. gün modelimiz)"),
    ("İz ve hareket hesabı", "mesafe, hız, varış süresi, rota deseni:", "dönme · yörünge · yoklama · gözetleme"),
    ("Kurallar ve denetim", "araç başına seviye tavanı, şema doğrulama,", "hatalıysa düzeltme, gerekirse yedek karar"),
]
for i, (h, l1, l2) in enumerate(cols):
    x = 100 + i * 480
    text(x, cy + 68, h, size=16, weight="bold")
    text(x, cy + 92, l1, size=14, color=MUTED)
    text(x, cy + 113, l2, size=14, color=MUTED)
for x in (212, 506, 800, 1094):
    arrow(x, cy - 4, x, 715 + 0, SLATE, dash=True, sw=1.5)
text(1523, 734, "hesaplanmış bilgiler yukarı · kurallar her kararı sınırlar",
     size=13, color=SLATE, anchor="end", italic=True)

out.append("</svg>")
Path(__file__).with_name("agent_architecture_tr.svg").write_text("\n".join(out), encoding="utf-8")
print("wrote agent_architecture_tr.svg")

# PNG (2x):
# "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless --hide-scrollbars \
#   --force-device-scale-factor=2 --window-size=1600,900 \
#   --screenshot=docs/figures/agent_architecture_tr.png docs/figures/agent_architecture_tr.svg
