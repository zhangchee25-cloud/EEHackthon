from io import BytesIO

PAGES = [
    "A linear system satisfies additivity and homogeneity. Additivity means T(x1+x2)=T(x1)+T(x2). Homogeneity means T(a*x)=a*T(x). Both conditions must hold for linearity.",
    "A time-invariant system gives the same output shift when the input is shifted in time. For y(t)=t*x(t), the system is linear but time-varying.",
    "A causal system depends only on present and past input values. The system y(t)=x(t+1) is noncausal because it depends on a future input value.",
]


def make_pdf(pages=None):
    from reportlab.pdfgen.canvas import Canvas
    from textwrap import wrap
    stream = BytesIO()
    canvas = Canvas(stream, pagesize=(595, 842), invariant=True)
    canvas.setTitle("Signals and Systems - Self-authored Demo")
    for index, text in enumerate(PAGES if pages is None else pages, 1):
        canvas.setFont("Helvetica-Bold", 15)
        canvas.drawString(45, 790, f"Signals and Systems - Page {index}")
        canvas.setFont("Helvetica", 12)
        for line_index, line in enumerate(wrap(text, 75)):
            canvas.drawString(45, 750 - line_index * 20, line)
        canvas.showPage()
    canvas.save()
    return stream.getvalue()

