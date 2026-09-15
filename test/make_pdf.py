# テキストフィクスチャから日本語PDFを生成（pdf.js のテキスト抽出テスト用）
import sys, os
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.cidfonts import UnicodeCIDFont
from reportlab.lib.pagesizes import A4

pdfmetrics.registerFont(UnicodeCIDFont('HeiseiKakuGo-W5'))
here = os.path.dirname(os.path.abspath(__file__))
for name in ('house', 'mansion', 'mansion2'):
    src = os.path.join(here, 'fixtures', name + '.txt')
    dst = os.path.join(here, 'fixtures', name + '.pdf')
    c = canvas.Canvas(dst, pagesize=A4)
    c.setFont('HeiseiKakuGo-W5', 10.5)
    y = A4[1] - 50
    for line in open(src, encoding='utf-8').read().splitlines():
        c.drawString(45, y, line)
        y -= 16
        if y < 45:
            c.showPage(); c.setFont('HeiseiKakuGo-W5', 10.5); y = A4[1] - 50
    c.save()
    print('generated', dst)
