# 添付資料と同じ構成の販売図面：左に物件情報、右に物件概要（分譲会社なども含む）、
# 最下部に情報元の帯（社名・免許番号・電話・担当者）
import os
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.cidfonts import UnicodeCIDFont
from reportlab.lib.pagesizes import A4, landscape
pdfmetrics.registerFont(UnicodeCIDFont('HeiseiKakuGo-W5'))
dst = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'columns.pdf')
W, H = landscape(A4)
c = canvas.Canvas(dst, pagesize=landscape(A4))
F = 'HeiseiKakuGo-W5'
c.setFont(F, 11)

left = ['物件種目　中古マンション', '総額　5,880 万円',
        '阪急神戸線 夙川 駅 徒歩 4 分', '専有面積　71.31㎡',
        '共有持分　7131 245724', '築年月　2000年3月',
        '間取り　3LDK', '現況　空家']
right = ['物件名　グランクレスト夙川', '所在　西宮市大井手町9-4',
         '共有持分　7131 / 245724', '分譲会社／ダイア建設株式会社',
         '管理会社／株式会社東急コミュニティー', 'ペット　飼育可能（制限有）1匹',
         '管理費　月額 14,260円', '株式会社マイプレイス 大阪営業部']
# 1行目の上端が H*0.100 に来るように置く（テスト側の測定位置と合わせる）
top = H * 0.100
for i in range(8):
    y = H - top - 26 * i - 14
    c.drawString(20, y, left[i])
    c.drawString(W * 0.54, y, right[i])

# 最下部：情報元の帯（切り取られるべき範囲）
c.setFont(F, 10)
c.drawString(20, 62, '国土交通大臣（4）第7356号　株式会社マイプレイス［大阪営業部］')
c.drawString(20, 46, 'TEL：06-7653-7127　FAX：06-7653-7128　www.my-place.jp')
c.drawString(20, 30, '担当／信木 修人　nobuki.syuto@my-place.jp')
c.showPage(); c.save()
print('wrote', dst)
