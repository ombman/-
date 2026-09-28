# 縦長の用紙に、横長の販売図面を横倒し（90度回転）で貼った文字データの無い資料。
# 実物では、文字をすべて図形に変換した資料にこの形のものがあった。
import os
from PIL import Image
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import A4
from reportlab.lib.utils import ImageReader
here = os.path.dirname(os.path.abspath(__file__))
im = Image.open(os.path.join(here, '_scan_page.png')).rotate(90, expand=True)
tmp = os.path.join(here, '_rot_tmp.png'); im.save(tmp)
W, H = A4
c = canvas.Canvas(os.path.join(here, 'rotated.pdf'), pagesize=A4)
c.drawImage(ImageReader(tmp), 0, 0, width=W, height=H)
c.showPage(); c.save()
os.remove(tmp)
print('wrote rotated.pdf')
