# 文字ありページと、文字が取り出せない（スキャン画像相当の）ページが混ざった資料
import os
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.cidfonts import UnicodeCIDFont
from reportlab.lib.pagesizes import A4
pdfmetrics.registerFont(UnicodeCIDFont('HeiseiKakuGo-W5'))
dst = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'scanned.pdf')
c = canvas.Canvas(dst, pagesize=A4); W, H = A4; F = 'HeiseiKakuGo-W5'

def text_page(name, price, walk, area, share):
    c.setFont(F, 16); c.drawString(40, H - 40, '株式会社サンプル不動産')
    c.setFont(F, 12); y = H - 120
    for line in ['物件種目　中古マンション', '建物名称　' + name, '総額　%s 万円' % price,
                 '阪急神戸線 西宮北口 駅 徒歩 %d 分' % walk, '専有面積　%s㎡' % area,
                 '共有持分　' + share, '築年月　2015年6月']:
        c.drawString(40, y, line); y -= 22
    c.setFont(F, 11); c.drawString(40, 72, 'TEL：03-1111-2222　担当：鈴木 一郎')
    c.showPage()

def image_page(seed):
    # 文字を一切置かない＝テキスト層の無いページ（スキャン資料と同じ状態）
    for i in range(14):
        c.setFillGray(0.55 + 0.03 * ((i + seed) % 8))
        c.rect(40 + (i % 4) * 130, 120 + (i // 4) * 150, 110, 120, stroke=0, fill=1)
    c.showPage()

text_page('テストレジデンスA', '4,280', 8, '68.50', '7049 709457')
image_page(1)
text_page('テストレジデンスB', '5,120', 5, '72.10', '7210 245724')
image_page(2)
c.showPage()          # 5ページ目：完全な白紙
c.save()
print('wrote', dst)
