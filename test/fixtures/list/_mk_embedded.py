# 日本語フォントを埋め込んだ販売図面を模したPDF（文字はすべて架空）。
# ブラウザが埋め込みフォントを読み込めない環境でも資料画像から文字が消えないかを確かめる。
import os
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib.pagesizes import A4, landscape
pdfmetrics.registerFont(TTFont('IPAG', '/usr/share/fonts/opentype/ipafont-gothic/ipag.ttf'))
dst = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'embedded.pdf')
W, H = landscape(A4)
c = canvas.Canvas(dst, pagesize=(W, H))
c.setFont('IPAG', 28); c.drawString(40, H - 60, 'テストレジデンス西宮 602号室')
c.setFont('IPAG', 40); c.drawString(40, H - 160, '5,180万円')
c.setFont('IPAG', 14)
y = H - 220
for line in ['専有面積（壁芯）76.54㎡', '阪急神戸線「西宮北口」駅 徒歩10分', '築年月 平成10年3月',
             '所在地 兵庫県西宮市テスト町1-2', 'リフォーム内容 フローリング新規貼替 システムキッチン新規交換']:
    c.drawString(40, y, line); y -= 26
c.setFont('IPAG', 12); c.drawString(40, 40, '株式会社サンプル不動産　TEL 06-0000-0000')
c.showPage(); c.save()
