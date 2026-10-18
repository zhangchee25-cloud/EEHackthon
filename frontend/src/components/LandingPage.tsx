import { useState } from 'react';
import { ArrowDown, ArrowRight, ArrowUpRight, BookOpen, Check, ChevronRight, CircleCheck, FileText, Focus, Layers, Leaf, Plus, Quote, Sparkles, Target } from 'lucide-react';
import BackgroundPaths from './BackgroundPaths';

const steps = [
  { label: '阅读材料', short: '阅读', icon: BookOpen, title: '带着目标，翻开这一页。', description: '把讲义放在手边，给这次学习设一个小目标。让注意力回到真正想弄懂的问题。' },
  { label: '核对出处', short: '核对', icon: Quote, title: '每一个回答，都有迹可循。', description: '围绕材料提问，跟着引用回到原文。看清答案从哪里来，也给自己的判断留出空间。' },
  { label: '留下理解', short: '理解', icon: Layers, title: '用自己的话，留下理解。', description: '直接保存 AI 卡片，或用自己的话改写。在课程白板里连接概念，让下次复习有处可循。' },
];

function LearningPreview() {
  const [step, setStep] = useState(1);
  const [showSource, setShowSource] = useState(false);
  function selectStep(next: number) { setStep(next); setShowSource(false); }
  return <div className="preview-wrap">
    <div className="preview-step-switch" role="group" aria-label="切换学习流程示意">{steps.map(({ icon: Icon, label }, i) => <button type="button" key={label} aria-pressed={step === i} onClick={() => selectStep(i)}><Icon size={15} /><span>{label}</span><span className="preview-step-number">0{i + 1}</span></button>)}</div>
    <div className="product-preview" aria-label="学习空间交互示意，使用自制电容讲义">
      <div className="preview-toolbar"><div className="preview-window-dots" aria-hidden="true"><i /><i /><i /></div><span><BookOpen size={14} />我的学习空间</span><span className="preview-demo-label">交互示意 · 自制材料</span></div>
      <div className="preview-goal"><Target size={15} /><span>本次目标</span><strong>理解电容如何储存能量</strong><span className="preview-focus"><Focus size={13} />专注于此刻</span></div>
      <div className="preview-body">
        <aside className="preview-sidebar" aria-label="示意材料"><span className="preview-sidebar-heading">我的材料 <span>01</span></span><div className="preview-material"><FileText size={17} /><span>电容储能讲义<small>自制 PDF · 3 页</small></span></div><div className="preview-sidebar-note"><Leaf size={16} /><p>一次一个问题，<br />一点一点读懂。</p></div></aside>
        <div className="preview-document"><div className="preview-file"><FileText size={13} /><span>电容储能讲义.pdf</span><span>2 / 3</span></div><div className="preview-paper"><span className="preview-chapter">PHYSICS NOTES <span>02</span></span><h3>Energy stored<br />in a capacitor<span>电容中的能量</span></h3><p className={showSource ? 'source-highlight' : ''}>Energy is stored in the electric field.</p><div className="preview-formula">U = <span>½</span> CV<sup>2</sup></div><div className="preview-paper-lines" aria-hidden="true"><i /><i /><i /></div><span className="preview-paper-note">读懂一个公式，也理解它背后的关系。</span><div className="preview-paper-footer"><span>THU O PAL / 学习笔记</span><span>02</span></div></div></div>
        <div className="preview-assistant"><div className="preview-assistant-heading"><Sparkles size={15} /><span>{step === 2 ? '我的理解' : '学习搭子'}</span><span className="preview-assistant-dot" /></div><div key={step} className="preview-assistant-content">
          {step === 0 ? <><span className="preview-section-label">从一个小目标开始</span><h4>今天，想弄懂什么？</h4><p>先读一遍原文。遇到疑问时，学习搭子就在旁边。</p><div className="preview-note"><Target size={16} /><span>理解电容如何储存能量</span></div><div className="preview-tip"><BookOpen size={16} /><span>读材料 → 提出问题 → 核对原文</span></div><button className="preview-next" type="button" onClick={() => selectStep(1)}>看看如何核对出处<ArrowRight size={14} /></button></> : step === 1 ? <><div className="preview-question">电容的能量储存在哪里？</div><div className="preview-answer-author"><span><Sparkles size={12} /></span>学习搭子<small>示例回答</small></div><p>电容的能量储存在两极之间的<strong>电场</strong>中。可以通过电容和电压的关系，理解它储存了多少能量。</p><button type="button" className="preview-citation" aria-pressed={showSource} onClick={() => setShowSource(!showSource)}><Quote size={12} />{showSource ? '已高亮原文 · 第 2 页' : '查看出处 · 讲义第 2 页'}<ArrowUpRight size={12} /></button><button className="preview-next" type="button" onClick={() => selectStep(2)}><Plus size={14} />看看理解卡片<ArrowRight size={14} /></button></> : <><span className="preview-section-label">我的理解卡片 · 示意</span><div className="preview-understanding"><span><Layers size={14} />电容如何储能</span><p>电容把能量储存在两极之间的电场里。同样的电容，电压越高，储存的能量就越多。</p><small><Quote size={11} />自制讲义 · 第 2 页</small></div><div className="preview-tip"><CircleCheck size={15} /><span>自己的表述，才是理解的开始。</span></div><a className="preview-next" href="#study">去写下我的第一张卡片<ArrowRight size={14} /></a></>}
        </div><div className="preview-assistant-footer"><span /><span /><span /><small>让思考，慢慢发生</small></div></div>
      </div><div className="preview-status"><span><span className="status-dot" />给专注留一点空间</span><span>阅读 · 核对 · 理解</span></div>
    </div><p className="preview-caption">你的材料、问题和思考，终于在同一个地方。</p>
  </div>;
}

export default function LandingPage() {
  return <div className="landing-page">
    <a className="skip-link" href="#how-it-works">跳到学习流程</a>
    <header className="landing-header"><a className="brand" href="#home" aria-label="清大搭首页"><span className="brand-mark"><BookOpen size={22} strokeWidth={1.7} /></span><span>清大搭<span className="brand-en" lang="en">THU O PAL</span></span></a><nav aria-label="首页导航"><a href="#how-it-works">学习方式</a><a href="#study/guide">使用指引<ArrowUpRight size={12} /></a></nav><a className="landing-nav-cta" href="#study">进入学习空间<ArrowUpRight size={15} /></a></header>
    <main>
      <section className="landing-hero" aria-labelledby="home-title"><BackgroundPaths /><div className="hero-glow" aria-hidden="true" /><div className="hero-copy"><a className="hero-kicker" href="#how-it-works"><span><Leaf size={12} />为成长而学</span><span>给专注一点新可能<ArrowRight size={12} /></span></a><h1 id="home-title">让每一次阅读，<br /><span>都留下理解<span className="hero-title-period">。</span></span></h1><p>把讲义、疑问与自己的思考放在一起。<br />有出处的回答，有温度的陪伴，有属于你的成长。</p><div className="hero-actions"><a className="landing-primary" href="#study">开始我的学习<ArrowRight size={17} /></a><a className="landing-secondary" href="#how-it-works"><span className="hero-play"><ChevronRight size={14} /></span>看看如何使用</a></div><div className="hero-footnote"><span><Check size={13} />回到原文，核对出处</span><span className="hero-footnote-separator" /><span><Check size={13} />用自己的话，留下理解</span></div></div><a className="hero-scroll" href="#how-it-works" aria-label="向下探索学习方式"><span>SCROLL TO EXPLORE</span><ArrowDown size={14} /></a></section>
      <section id="how-it-works" className="workflow-section" aria-labelledby="workflow-title"><div className="workflow-heading"><span className="eyebrow"><span />不止是一个答案</span><h2 id="workflow-title">从「看过了」，到「说得清」。</h2><p>让 AI 陪你多想一步，把学到的，变成真正懂得的。</p></div><LearningPreview /><div className="learning-principles">{steps.map(({ icon: Icon, short, title, description }, i) => <article key={short}><div className="principle-top"><span><Icon size={19} strokeWidth={1.6} /></span><span>0{i + 1} / {short}</span></div><h3>{title}</h3><p>{description}</p></article>)}</div></section>
      <section className="landing-closing" aria-labelledby="closing-title"><div className="closing-orbit" aria-hidden="true"><Leaf size={24} strokeWidth={1.3} /></div><span className="eyebrow">一页原文，一个问题，一点新的理解</span><h2 id="closing-title">成长，从读懂这一页开始。</h2><p>不急着积累更多答案，先把一个问题，真正想明白。</p><a className="landing-primary" href="#study">开启我的学习空间<ArrowRight size={16} /></a><a className="closing-guide" href="#study/guide">第一次来？跟着指引开始<ArrowUpRight size={12} /></a></section>
    </main><footer className="landing-footer"><a className="footer-brand" href="#home"><BookOpen size={17} />清大搭<span>每一页，都有你的思考。</span></a><span>507 队 · 校园学习生活<span className="footer-dot">·</span><span lang="en">Made for curious minds.</span></span></footer>
  </div>;
}
