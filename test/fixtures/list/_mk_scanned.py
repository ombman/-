# 文字ありページと、文字データを持たない「スキャンした紙」のページが混ざった資料。
# スキャンページは columns.pdf を画像に焼いたもの（実際のスキャン資料と同じ状態）。
import os
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.cidfonts import UnicodeCIDFont
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.utils import ImageReader
here = os.path.dirname(os.path.abspath(__file__))
pdfmetrics.registerFont(UnicodeCIDFont('HeiseiKakuGo-W5'))
F = 'HeiseiKakuGo-W5'

# ---- スキャンだけの資料（全ページ画像） ----
img = ImageReader(os.path.join(here, '_scan_page.png'))
W, H = landscape(A4)
c = canvas.Canvas(os.path.join(here, 'scan_only.pdf'), pagesize=landscape(A4))
c.drawImage(img, 0, 0, width=W, height=H)
c.showPage(); c.save()

# ---- 文字ページとスキャンページが混ざった資料 ----
W2, H2 = A4
c = canvas.Canvas(os.path.join(here, 'scanned.pdf'), pagesize=A4)

def text_page(name, price, walk, area, share):
    c.setPageSize(A4)
    c.setFont(F, 16); c.drawString(40, H2 - 40, '株式会社サンプル不動産')
    c.setFont(F, 12); y = H2 - 120
    for line in ['物件種目　中古マンション', '建物名称　' + name, '総額　%s 万円' % price,
                 '阪急神戸線 西宮北口 駅 徒歩 %d 分' % walk, '専有面積　%s㎡' % area,
                 '共有持分　' + share, '築年月　2015年6月']:
        c.drawString(40, y, line); y -= 22
    c.setFont(F, 11); c.drawString(40, 72, 'TEL：03-1111-2222　担当：鈴木 一郎')
    c.showPage()

def scan_page():
    c.setPageSize(landscape(A4))
    c.drawImage(img, 0, 0, width=W, height=H)
    c.showPage()

text_page('テストレジデンスA', '4,280', 8, '68.50', '7049 709457')
scan_page()
text_page('テストレジデンスB', '5,120', 5, '72.10', '7210 245724')
scan_page()
c.setPageSize(A4); c.showPage()          # 5ページ目：完全な白紙
c.save()
print('wrote scanned.pdf / scan_only.pdf')
