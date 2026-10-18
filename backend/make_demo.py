"""Generate self-authored Chinese test material; requires requirements-dev.txt."""
from pathlib import Path
from textwrap import wrap
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.cidfonts import UnicodeCIDFont
from reportlab.pdfgen.canvas import Canvas

LESSONS = [
    ('线性系统', [
        '线性系统必须同时满足可加性和齐次性。',
        '可加性：两个输入相加后产生的输出，等于两个输入分别产生的输出之和。',
        '齐次性：输入乘以常数后，输出也乘以同一个常数。',
        '两项缺一不可；仅满足其中一项，不能判定系统线性。',
    ]),
    ('时不变与线性是不同条件', [
        '时不变性：输入沿时间平移，输出应当只发生同样的时间平移。',
        '系统 y(t)=t*x(t) 是线性的，但不是时不变的。',
        '线性讨论输入的叠加与倍乘，时不变性讨论时间平移，两者不能互相替代。',
    ]),
    ('因果性', [
        '因果系统当前时刻的输出只依赖当前和过去的输入，不能依赖未来输入。',
        '系统 y(t)=x(t+1) 不是因果系统，因为它使用了未来的输入。',
        '本材料只解释基础概念，不包含考试时间、教室或教师信息。',
    ]),
]

def generate(path):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    pdfmetrics.registerFont(UnicodeCIDFont('STSong-Light'))
    canvas = Canvas(str(path), pagesize=(595, 842), invariant=True)
    canvas.setTitle('信号与系统：自制演示讲义')
    for page, (title, paragraphs) in enumerate(LESSONS, 1):
        canvas.setFont('STSong-Light', 22)
        canvas.drawString(45, 785, title)
        canvas.setFont('STSong-Light', 12)
        canvas.drawString(45, 755, '学习 Agent 自制演示材料，不是教师讲义。')
        y = 710
        for paragraph in paragraphs:
            for line in wrap(paragraph, 35):
                canvas.drawString(45, y, line)
                y -= 24
            y -= 16
        canvas.drawString(45, 45, f'文件第 {page} 页 / 共 3 页')
        canvas.showPage()
    canvas.save()
    return path

if __name__ == '__main__':
    print(generate(Path(__file__).resolve().parent.parent / 'examples' / 'signals-systems-demo.pdf'))
