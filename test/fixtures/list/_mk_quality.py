# ① 写真が多くて重い販売図面（掲載できる大きさに収まるかの確認用）
# ② 文字データが一部しか無い資料（見出しだけ文字、表は画像）
import os, random
from PIL import Image
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.cidfonts import UnicodeCIDFont
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.utils import ImageReader
here = os.path.dirname(os.path.abspath(__file__))
pdfmetrics.registerFont(UnicodeCIDFont('HeiseiKakuGo-W5'))
F = 'HeiseiKakuGo-W5'
random.seed(7)

# 圧縮の効かない写真（ノイズ）を4枚。実際の物件写真より厳しい条件。
noise = Image.frombytes('RGB', (900, 700),
        bytes(random.getrandbits(8) for _ in range(900*700*3)))
npath = os.path.join(here, '_noise.png'); noise.save(npath)
img = ImageReader(npath)

W, H = A4
c = canvas.Canvas(os.path.join(here, 'photo.pdf'), pagesize=A4)
for i in range(4):
    c.drawImage(img, 30 + (i % 2) * 270, H - 260 - (i // 2) * 210, width=250, height=190)
c.setFont(F, 12); y = H - 500
for line in ['物件種目　中古マンション', '建物名称　フォトレジデンス甲子園',
             '総額　4,290 万円', '阪神本線 甲子園 駅 徒歩 7 分',
             '専有面積　73.05㎡', '共有持分　7305 512300', '築年月　2000年9月']:
    c.drawString(40, y, line); y -= 22
c.setFont(F, 11)
c.drawString(40, 70, '株式会社マイプレイス［大阪営業部］　国土交通大臣（4）第7356号')
c.drawString(40, 54, 'TEL：06-7653-7127　担当／信木 修人')
c.showPage(); c.save()

# ② 見出しだけ文字データ、中身は画像（実際の資料に多い形）
scan = ImageReader(os.path.join(here, '_scan_page.png'))
LW, LH = landscape(A4)
c = canvas.Canvas(os.path.join(here, 'hybrid.pdf'), pagesize=landscape(A4))
c.drawImage(scan, 0, 0, width=LW, height=LH)
c.setFont(F, 9)
c.drawString(LW - 150, LH - 14, '物件資料')    # 文字データはこれだけ
c.showPage(); c.save()
os.remove(npath)
print('wrote photo.pdf / hybrid.pdf')
