import { useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowRight, BookOpen, Check, FileText, Leaf, MessageSquare, Quote, Sparkles } from 'lucide-react';

// Original SVG paths: no copied component code or animation dependency.
function BackgroundPaths() {
  return <svg className="background-paths" viewBox="0 0 1440 760" fill="none" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
    <g>{Array.from({ length: 14 }, (_, i) => <path key={`left-${i}`} d={`M ${-240 + i * 27} -60 C ${160 + i * 19} 120 ${-180 + i * 25} 360 ${130 + i * 20} 500 S ${700 + i * 11} 520 ${660 + i * 17} 830`} />)}</g>
    <g>{Array.from({ length: 14 }, (_, i) => <path key={`right-${i}`} d={`M ${1640 - i * 27} -100 C ${1150 - i * 17} 130 ${1630 - i * 20} 350 ${1340 - i * 19} 510 S ${860 - i * 15} 550 ${800 - i * 12} 840`} />)}</g>
  </svg>;
}

export default function LandingPage() {
  const hero = useRef<HTMLElement>(null);
  const [animate, setAnimate] = useState(false);
  useEffect(() => {
    const element = hero.current;
    if (!element) return;
    let visible = false;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setAnimate(visible && !document.hidden && !reduced.matches);
    const observer = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; update(); });
    observer.observe(element);
    document.addEventListener('visibilitychange', update); reduced.addEventListener('change', update);
    return () => { observer.disconnect(); document.removeEventListener('visibilitychange', update); reduced.removeEventListener('change', update); };
  }, []);
  return <div className="landing-page">
    <header className="landing-header"><a className="brand" href="#home"><span className="brand-mark"><BookOpen size={23} /></span><span>知页<span className="brand-en">个人课程学习空间</span></span></a><nav aria-label="首页导航"><a href="#how-it-works">如何使用</a><a className="button secondary" href="#study">进入学习空间<ArrowRight size={15} /></a></nav></header>
    <main>
      <section ref={hero} className={`landing-hero ${animate ? 'paths-running' : ''}`} aria-labelledby="home-title">
        <BackgroundPaths />
        <div className="hero-copy"><span className="hero-kicker"><Leaf size={14} />为真正读懂，留一点空间</span>
          <h1 id="home-title">让每一次阅读，<br /><span>都留下理解。</span></h1>
          <p>把讲义、疑问与自己的思考放在一起。<br />读原文，问清楚，再用自己的话记下来。</p>
          <div className="hero-actions"><a className="button primary" href="#study">开始我的学习<ArrowRight size={17} /></a><a className="button hero-secondary" href="#how-it-works">看看如何使用<ArrowDown size={16} /></a></div>
          <div className="hero-footnote"><span><Check size={13} />有出处的问答</span><span><Check size={13} />自己改写的卡片</span><span><Check size={13} />本机学习空间</span></div>
        </div>
        <a className="hero-scroll" href="#how-it-works">从一份材料开始<ArrowDown size={15} /></a>
      </section>
      <section id="how-it-works" className="workflow-section" aria-labelledby="workflow-title">
        <div className="workflow-heading"><div><span className="eyebrow">一个完整的学习过程</span><h2 id="workflow-title">从「看过了」，到「说得清」。</h2></div><a className="text-button" href="#study/guide">打开工作台，跟着做<ArrowRight size={16} /></a></div>
        <div className="product-preview" aria-label="学习流程示意，使用自制电容讲义">
          <div className="preview-toolbar"><span><BookOpen size={16} />我的学习空间</span><span>流程示意 · 自制材料</span></div>
          <div className="preview-body">
            <div className="preview-document"><div className="preview-file"><FileText size={15} />电容储能 · 自制讲义<span>第 2 页</span></div><div className="preview-paper"><span className="preview-chapter">02 / ENERGY</span><h3>Energy stored<br />in a capacitor</h3><p>Energy is stored in the electric field.</p><div className="preview-formula">U = ½ CV²</div><p className="preview-paper-note">读懂一个公式，也理解它背后的关系。</p></div></div>
            <div className="preview-process"><article><span className="process-icon"><BookOpen size={18} /></span><div><span className="step-label">01 · 阅读</span><h3>先确定这次想弄懂什么</h3><p>设一个目标，上传一份文本 PDF。原文始终在手边。</p></div></article><article><span className="process-icon"><MessageSquare size={18} /></span><div><span className="step-label">02 · 核对</span><h3>带着问题，回到出处</h3><p>围绕当前材料提问，点击引用跳回对应页，核对原文。</p><span className="preview-citation"><Quote size={13} />文件第 2 页 · 电场中的能量</span></div></article><article><span className="process-icon"><Sparkles size={18} /></span><div><span className="step-label">03 · 理解</span><h3>留下自己能解释的表述</h3><p>把回答转为草稿，亲手改写并保存，标记下次需要复习的内容。</p></div></article></div>
          </div>
        </div>
        <div className="workflow-bottom"><p>不急着积累更多答案。先把一个问题，真正想明白。</p><a className="button primary" href="#study">开始我的学习<ArrowRight size={16} /></a></div>
      </section>
    </main>
    <footer className="landing-footer"><span><BookOpen size={16} />知页 · 每一页，都有你的思考</span><span>507 队 · 本机演示</span></footer>
  </div>;
}
