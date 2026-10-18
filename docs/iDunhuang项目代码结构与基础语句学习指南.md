# iDunhuang 项目代码结构与基础语句学习指南

从真实源码理解组件 数据 样式和交互

适用对象：准备参加黑客松的网站开发初学者　整理日期：2026年10月17日

## 1 先看清这个项目是什么

**这个网站是使用 React、TypeScript、Vite 和 Three.js 编写的单页数字展。**学习时应沿着“入口 → 组件 → 数据 → 样式 → 交互”阅读，不必先钻进最复杂的 3D 计算。

源码位置为 /Users/thuee25/Desktop/iDunhuang-project/。本文根据当前文件讲解；示例标注对应文件和行号，较长语句有排版换行。为便于阅读而删去部分属性的片段，会明确标为节选或简化。本文不修改该项目源码。

### 1.1 各种工具在项目中的角色

| 工具 | 负责什么 | 从哪里能看到 |
| --- | --- | --- |
| React | 用组件组织界面，随状态更新显示 | App.tsx、Homepage.tsx |
| TypeScript | 在开发时检查类型，帮助发现错误 | .ts、.tsx、tsconfig.json |
| Vite | 提供开发服务并构建可发布的资源 | package.json、vite.config.ts |
| Three.js | 在浏览器中绘制 3D 场景 | ScrollScene.tsx、BuddhaModel.tsx |
| CSS | 决定配色、排版与响应式布局 | 三份 .css 文件 |

依据：[package.json 第 6—24 行](/Users/thuee25/Desktop/iDunhuang-project/package.json:6)。其中的版本是依赖声明范围，不能直接当作当前实际安装版本。

### 1.2 它目前具备怎样的架构

浏览器先加载页面入口，再运行构建后的前端脚本；脚本读取项目中的展品与固定问答数据，加载图片和 GLB 模型，并响应滚动、旋转、放大及点击。

**当前源码中的问答是固定内容切换，没有调用生成式模型的问答接口，也没有数据库持久化逻辑。**“3D 模型”指已生成的几何与纹理文件，和“语言模型 API”是两种概念。静态托管服务器仍会响应文件请求，所以“没有业务后端”不等于“没有网络请求”。

问答内容见 [data.ts 第 108 行起](/Users/thuee25/Desktop/iDunhuang-project/src/data.ts:108)，切换逻辑见 [App.tsx 第 101 行起](/Users/thuee25/Desktop/iDunhuang-project/src/App.tsx:101)。

### 1.3 页面结构与组件结构

页面顺序是：序章 → 敦煌 → 伦敦 → 巴黎 → 数字相逢 → 来源。它们是同一长页面中的区域，导航通过 #journey 等锚点滚动定位，并非每个导航项都对应一份 HTML 文件。

App 组合导航、Entrance、多个 Artifact、页尾和 Reader。Artifact 再组合展品资料、展示区和 ExhibitQuestions。佛像展示由 BuddhaViewer 控制照片与模型切换，BuddhaModel 完成 3D 绘制。

**建议阅读顺序：**main.tsx → App.tsx 的 return 部分 → data.ts → ExhibitQuestions → Reader → CSS → 首页滚动 → 3D。

<!-- pagebreak -->

## 2 文件各自负责什么

下表中的名称均对应这个项目的实际文件。路径以本项目目录为起点；不要因为出现 scripts 或配置文件，就把它们当成业务后端。

| 文件或目录 | 实际职责 | 适合修改什么 |
| --- | --- | --- |
| index.html | 页面外壳、标签页标题、挂载位置 | 浏览器标题、页面描述、图标 |
| src/main.tsx | 初始化 React 并显示 App | 应用入口，一般少改 |
| src/App.tsx | 组合整页、城市文字、导航、阅读弹窗和问答组件 | 导航、章节文案、阅读器交互 |
| src/Homepage.tsx | 序章三幕文字与滚动进度 | 首屏标题、章节按钮、动画阶段 |
| src/data.ts | 展品类型、资料、固定问答、模型地址 | 展品名称、摘要、问答和来源 |
| src/heroReveal.ts | 根据进度计算显现程度 | 佛像显现曲线 |
| src/BuddhaViewer.tsx | 照片与模型切换、加载状态、复位 | 展示器按钮和状态提示 |
| src/BuddhaModel.tsx | 加载 GLB、场景、镜头、控制器与清理 | 模型渲染逻辑 |
| src/ScrollScene.tsx | 生成卷轴场景、贴图和热点 | 卷轴展示与热点说明 |
| src/styles.css | 通用规则、卷轴、阅读弹窗 | 全局基础与弹窗外观 |
| src/homepage.css | 首页与序章样式 | 首屏文字、背景、显现效果 |
| src/journey.css | 展览章节与展品布局等规则 | 两栏布局、章节色彩、小屏适配 |
| public/assets/ | 浏览器直接访问的图片、图标和模型 | 页面使用的静态资源 |
| assets/ | 原始素材、模型输入和备份等 | 素材管理，不自动等于发布内容 |
| scripts/prepare-netlify.mjs | 构建后准备专用发布目录 | 发布资源清单 |
| tests/hero-reveal.test.mjs | 检查显现曲线的关键性质 | 动画计算的测试 |

### 2.1 后缀该怎么读

.html 是文档结构；.css 是样式；.ts 是 TypeScript；.tsx 是允许 JSX 界面描述的 TypeScript；.mjs 是 JavaScript 模块文件，本项目中用于 Node.js 脚本和测试。后缀本身不能决定代码运行在浏览器还是服务器，要看它如何被调用。

### 2.2 图片路径为什么没有 public

[data.ts 第 52 行](/Users/thuee25/Desktop/iDunhuang-project/src/data.ts:52) 写的是 /assets/diamond-frontispiece.jpg，对应磁盘上的 public/assets/diamond-frontispiece.jpg。Vite 按静态资源规则提供它，网址中不包含 public。

以 / 开头的是网站根路径；./data 等 import 相对路径则相对于当前代码文件。两种路径有不同的解析规则。vite.config.ts 的 base: './' 也不会自动把任意字符串中的根路径都改成相对路径。[R6]

<!-- pagebreak -->

## 3 从 HTML 入口一路找到页面

### 3.1 index.html 提供页面外壳

源码节选：[index.html 第 9—13 行](/Users/thuee25/Desktop/iDunhuang-project/index.html:9)。

```html
<title>敦煌有信 · 文物与遗书数字展</title>
```

```html
<div id="root"></div>
<script type="module" src="/src/main.tsx"></script>
```

title 设置浏览器标签页标题。div 是容器，id="root" 为它提供标识。script 指向开发入口；经过构建后，发布页面通常引用处理好的 JavaScript 资源。浏览器不能直接按普通 JavaScript 规则执行原始 TSX，需要 Vite 等工具处理。

这里几乎没有展览正文，正文由 React 组件生成。**所以只在 index.html 里搜索“一眼，千年”，会找不到真正的显示位置。**

### 3.2 main.tsx 把组件放进容器

源码：[main.tsx 第 1—10 行](/Users/thuee25/Desktop/iDunhuang-project/src/main.tsx:1)。

```tsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
```

逐段阅读：import 从其他模块引入内容；./App 指向同目录下的 App 模块；单独导入 CSS，让工具把样式纳入应用。getElementById 找到 root 容器；createRoot 创建 React 根；render 显示组件。[R1]

<App /> 表示使用 App 组件，并不是新建一个名为 App 的 HTML 标签。StrictMode 是开发检查机制，某些初始化及 Effect 检查会在开发时重复执行，不代表上线后用户会看到两份页面。

root 后的 ! 是 TypeScript 的非空断言，意思是开发者告诉类型检查器“这里不会是 null”。它不会在运行时替你创建容器；如果 root 实际不存在，仍可能出错。

### 3.3 再从 App 找到子组件

在 [App.tsx 第 166 行起](/Users/thuee25/Desktop/iDunhuang-project/src/App.tsx:166) 找 return，可以看到 JourneyNavigation、Entrance、Artifact 和 Reader 的使用。第一次读代码，先把每个组件理解为一个有名字的界面模块，再进入对应定义。

<!-- pagebreak -->

## 4 JavaScript 基础语句怎么读

### 4.1 变量 数组 对象

实际例子来自 [Homepage.tsx 第 7 行](/Users/thuee25/Desktop/iDunhuang-project/src/Homepage.tsx:7) 和 [App.tsx 第 17—19 行](/Users/thuee25/Desktop/iDunhuang-project/src/App.tsx:17)。

```ts
const chapters = ['见微', '观像', '有信']
const currentPage = readerPages[page]
```

const 声明不能重新赋值的绑定；chapters 是数组，用方括号组织多个值，数组下标从 0 开始。readerPages[page] 表示根据 page 的数值选出一项。const 不代表对象或数组内部的内容绝对不能修改；React 状态还需要遵守专门的更新规则。[R2]

[data.ts 第 41—44 行](/Users/thuee25/Desktop/iDunhuang-project/src/data.ts:41) 是对象字段的节选：

```ts
id: 'diamond',
index: '01',
name: '《金刚经》卷轴',
english: 'The Diamond Sutra',
```

对象用大括号包住“字段名: 值”，例如 item.name 读取名称，byId[id] 按变量中的键取展品。对象是结构化数据；数组则常用于组织一组这样的对象。

### 4.2 函数 return 与箭头函数

函数是一段可以被调用的逻辑。function App() 定义组件函数；return 给出本次调用的结果。组件通常返回 JSX，普通计算函数则可能返回数字。

[App.tsx 第 102 行](/Users/thuee25/Desktop/iDunhuang-project/src/App.tsx:102)：

```ts
const questions = conversations.filter(
  (entry) => entry.exhibit === id
)
```

(entry) => ... 是箭头函数，表示接收一项 entry，返回等号比较结果。这里没有函数体大括号，表达式结果会直接返回；若写成大括号函数体，通常需要明确写 return 才能返回所需值。

### 4.3 条件 循环与注释

[App.tsx 第 105 行](/Users/thuee25/Desktop/iDunhuang-project/src/App.tsx:105) 的 if (!active) return null 表示没有可用问答时提前结束，界面不输出该组件内容。! 在这里是逻辑“非”，与上一节 root 后的非空断言不同。

[heroReveal.ts 第 5 行](/Users/thuee25/Desktop/iDunhuang-project/src/heroReveal.ts:5) 的 for 循环依次检查进度区间。let 用于循环索引等会重新赋值的变量；index++ 表示索引增加 1。// 是单行注释，主要解释代码，不显示为网页正文。

**符号要用英文半角。**代码中的引号、括号、逗号和冒号不能随意换成中文全角符号。项目里常省略行末分号，不等于可以任意换行；修改时保留周围代码风格。

<!-- pagebreak -->

## 5 常见运算符和数组操作

| 写法 | 如何理解 | 项目中的用途 |
| --- | --- | --- |
| = | 赋值或初始化 | const item = byId[id] |
| === 与 !== | 严格比较相等或不等 | phase === index |
| && | 逻辑与并按条件短路 | 有模型地址时才显示模型区域 |
| ? : | 条件成立选前者，否则选后者 | 两种按钮文案切换 |
| ?. | 前面的值不为空才继续访问或调用 | dialogRef.current?.close() |
| ?? | 左边是 null 或 undefined 时使用右边 | questions[0] 作为候选回退 |
| &#124;&#124; | 左边是假值时使用右边 | 模型地址为空时用默认地址 |
| + | 数字相加或字符串拼接 | 'dialogue-' + id |

?? 与 || 不完全相同：0、false 和空字符串会触发 || 的回退，但不会触发 ?? 的回退。?. 只处理链条上指定位置的空值，不是“忽略所有错误”的开关。[R3]

### 5.1 filter find map 各做什么

**filter 筛选一组。**上节代码从 conversations 中保留 exhibit 与当前 id 相同的问答，结果还是数组。

**find 找第一项。**[App.tsx 第 104 行](/Users/thuee25/Desktop/iDunhuang-project/src/App.tsx:104)：

```ts
const active = questions.find(
  (entry) => entry.id === activeId
) ?? questions[0]
```

先寻找当前选中的问答；找不到时尝试第一项。若第一项也不存在，后面的 if (!active) 会停止渲染。

**map 将每项转换成新结果。**问答组件把每条问答变为按钮。以下是依据 [App.tsx 第 109 行](/Users/thuee25/Desktop/iDunhuang-project/src/App.tsx:109) 删去辅助属性后的简化片段：

```tsx
{questions.map((entry) => (
  <button key={entry.id} onClick={() => setActiveId(entry.id)}>
    {entry.question}
  </button>
))}
```

在这里，map 产生一组可渲染的元素。key 帮助 React 对应列表中的项目，通常应稳定且在同级列表中唯一；它不是按钮的显示文字。[R4]

### 5.2 import 与 export 连接文件

App.tsx 的 export default App 是默认导出，因此 main.tsx 可以用 import App from './App' 引入。Homepage.tsx 的 export function Entrance 是命名导出，使用时写 import { Entrance } from './Homepage'。import 后的 {} 在这里代表导入指定名字，和对象字面量、JSX 表达式的括号不是一回事。

<!-- pagebreak -->

## 6 TypeScript 类型语句怎么读

TypeScript 的类型主要用于开发时检查，不会自动验证服务器返回的数据，也不保证程序一定不出错。[R5]

### 6.1 用类型约束数据的形状

[data.ts 第 1 行](/Users/thuee25/Desktop/iDunhuang-project/src/data.ts:1)：

```ts
export type ExhibitId = 'diamond' | 'pipa' | 'buddha'
```

type 定义类型别名；| 表示联合。ExhibitId 只允许这三个字符串值。这里的 | 是类型语法，不是把三个字符串连接起来。

下面是 [data.ts 第 3—28 行](/Users/thuee25/Desktop/iDunhuang-project/src/data.ts:3) 中部分字段的节选，外层结构保留：

```ts
export type Exhibit = {
  id: ExhibitId
  name: string
  modelUrl?: string
  modelRotationY?: number
}
```

name: string 规定名称为字符串；number 表示数字；modelUrl? 表示这个字段可以缺省。实际 Exhibit 还定义了年代、摘要、来源等更多字段。

```ts
export const exhibits: Exhibit[] = [
```

这是 [data.ts 第 39 行](/Users/thuee25/Desktop/iDunhuang-project/src/data.ts:39) 的数组声明开头：Exhibit[] 说明数组中每一项都应符合 Exhibit 类型。

### 6.2 参数 解构与可选回调

[App.tsx 第 116 行](/Users/thuee25/Desktop/iDunhuang-project/src/App.tsx:116) 的函数签名换行如下：

```tsx
function Artifact(
  { id, onOpenReader }: { id: ExhibitId; onOpenReader?: () => void }
) {
```

第一个 {} 从传入对象中取出 id 和 onOpenReader，叫“解构”；冒号后的对象描述参数类型。onOpenReader?: () => void 表示可选函数，调用时不需要参数，也不要求有可用返回值。

### 6.3 认得即可 暂时不用背的写法

useRef<HTMLDivElement>(null) 的尖括号为引用提供元素类型；useState<'model' | 'photo'>(...) 限定状态取值。data.ts 最后一行的 as Record<ExhibitId, Exhibit> 是类型断言，把索引结构告诉检查器；它不会额外执行数据校验。

**修改建议：**初期可从名称、摘要和按钮文案入手；不要随意改变 id、类型名或字段名。修改 'diamond' 这样的内部标识，可能同时影响数据索引、条件分支和锚点。

<!-- pagebreak -->

## 7 JSX 把数据放进界面

JSX 看起来像 HTML，但允许嵌入 JavaScript 表达式。TSX 文件同时容纳类型、逻辑和 JSX；不必把整份文件都当成 HTML。[R1]

### 7.1 固定文字与变量文字

[Homepage.tsx 第 73 行](/Users/thuee25/Desktop/iDunhuang-project/src/Homepage.tsx:73)：

```tsx
<h1>一眼，<em>千年。</em></h1>
```

h1 表示一级标题，em 包住一部分文字；它的实际颜色与样式来自 CSS。这里的“一眼”和“千年”直接写在 JSX 中。

[App.tsx 第 134 行](/Users/thuee25/Desktop/iDunhuang-project/src/App.tsx:134)：

```tsx
<p className="artifact-summary">{item.summary}</p>
```

{item.summary} 读取当前展品的 summary，所以要到 data.ts 修改内容。className 把元素关联到 CSS 类；在 React JSX 中通常使用 className，而非 HTML 中的 class。

### 7.2 属性 事件和条件渲染

```tsx
<button onClick={startJourney}>从敦煌出发</button>
```

上面是对 [Homepage.tsx 第 87 行](/Users/thuee25/Desktop/iDunhuang-project/src/Homepage.tsx:87) 去掉样式与箭头图标后的简化。onClick={startJourney} 传入函数，等用户点击才调用。写成 onClick={startJourney()} 会在渲染时立即调用，通常不是预期行为。

{condition && <Element />} 常用于满足条件才显示；condition ? A : B 用于二选一。使用 && 时应留意左边若是数值 0，React 可能把 0 显示出来，所以条件应表达清楚。

### 7.3 为什么有反引号和双层大括号

[App.tsx 第 45—46 行](/Users/thuee25/Desktop/iDunhuang-project/src/App.tsx:45) 的两种写法：

```tsx
className={`reader-image ${page === 3 ? 'overview' : ''}`}
style={{ width: `${zoom * 100}%` }}
```

反引号创建模板字符串，${...} 把表达式结果插入字符串。page 为 3 时类名中增加 overview。style={{...}} 外层 {} 进入 JavaScript，内层 {} 是样式对象；zoom 为 1.5 时，width 对应 150%。

### 7.4 界面属性并不全是文案

href 决定跳转位置，src 决定资源地址，alt 描述图片，aria-label 为辅助工具提供名称。按钮显示文字改变后，有时还应同步检查 aria-label；不要把 id、className 或 href 当成显示文案随意翻译。

<!-- pagebreak -->

## 8 React 用状态和参数连接交互

### 8.1 useState 让组件记住当前选择

[App.tsx 第 17—19 行](/Users/thuee25/Desktop/iDunhuang-project/src/App.tsx:17)：

```tsx
const [page, setPage] = useState(0)
const [zoom, setZoom] = useState(1)
const currentPage = readerPages[page]
```

page 是当前页序号，setPage 请求更新该状态，0 是初始值；zoom 同理。方括号把 useState 返回的两个值分别取出。状态更新会请求 React 重新渲染；当前事件处理中的旧变量不会被同步改写。[R7]

点击卷页按钮时，项目调用 setPage(index)，同时 setZoom(1)。因此图片切换后会回到默认放大比例。只把普通变量改成 1，不会自动产生相同的界面更新。

### 8.2 props 是父组件传给子组件的参数

[App.tsx 第 187 行](/Users/thuee25/Desktop/iDunhuang-project/src/App.tsx:187)：

```tsx
<Artifact
  id="diamond"
  onOpenReader={() => dialogRef.current?.showModal()}
/>
```

id 决定显示哪件展品；onOpenReader 传递打开阅读弹窗的函数。App 管理弹窗引用，Artifact 负责在合适位置提供入口；这样子组件无需知道整页所有细节。

### 8.3 useRef 保存元素引用

[App.tsx 第 148 行](/Users/thuee25/Desktop/iDunhuang-project/src/App.tsx:148)：

```tsx
const dialogRef = useRef<HTMLDialogElement>(null)
```

Reader 把它关联到 dialog 元素。dialogRef.current 指向实际元素；showModal() 打开弹窗，close() 关闭。修改 ref.current 通常不会触发重新渲染；需要显示变化时应判断是否使用状态。

### 8.4 事件如何从点击走到弹窗

用户点击“展开经卷” → Artifact 调用传入的 onOpenReader → App 中的回调找到 dialog → showModal() 打开 Reader。这条流程没有请求业务后端。

BuddhaViewer 中 setResetToken((previous) => previous + 1) 采用函数式更新，依据先前状态计算下一值。BuddhaModel 再监听 resetToken 的变化进行镜头复位；它不是刷新整个网页。

<!-- pagebreak -->

## 9 完整追踪一次问答按钮点击

这一部分把前面的语句连接成完整流程。阅读 [App.tsx 第 101—113 行](/Users/thuee25/Desktop/iDunhuang-project/src/App.tsx:101) 时，可以先把样式和辅助属性暂放一边，聚焦数据与状态。

### 9.1 第一步 从资料中取出当前展品的问题

```ts
const questions = conversations.filter((entry) => entry.exhibit === id)
const [activeId, setActiveId] = useState(questions[0]?.id)
const active = questions.find((entry) => entry.id === activeId) ?? questions[0]
if (!active) return null
```

例如 id 是 'diamond'，filter 找出《金刚经》的三条问题。useState 首次以第一条问题的 id 作为选择。find 查找对应对象，找不到则回退到第一项；完全没有内容时不显示模块。

### 9.2 第二步 把问题变成按钮

每条问题经 map 生成按钮。按钮文字来自 entry.question；点击回调执行 setActiveId(entry.id)。React 重新渲染后，active 会根据新的 activeId 指向另一条记录。

下面是 [App.tsx 第 111 行](/Users/thuee25/Desktop/iDunhuang-project/src/App.tsx:111) 中答案显示位置的节选：

```tsx
<p>{active.answer}</p>
```

旁边的来源链接读取 active.sourceUrl 与 active.sourceLabel。答案与链接都来自同一条固定记录，不是点击后才由语言模型生成。

### 9.3 第三步 用属性让样式反映当前选择

按钮的 aria-pressed={active.id === entry.id} 表达是否选中。[journey.css 第 82 行](/Users/thuee25/Desktop/iDunhuang-project/src/journey.css:82) 根据 aria-pressed=true 改变背景色和文字颜色。**数据决定选中项，组件写出属性，CSS 根据属性改变外观。**

### 9.4 修改任务怎样落到文件

想把“你来自哪一年？”改成更自然的提问，找 data.ts 中该记录的 question；想改答案，找 answer；想改“问 / 答”栏目标题，找 App.tsx 的固定 JSX；想改选中按钮颜色，找 journey.css。

**自测：**若只把 question 改了，按钮点击后出现的新答案会变吗？

参考答案：不会自动变。问题和答案是不同字段；在保持 id 不变的情况下，按钮文字变化，但它仍指向原来的问答记录。若想把这个模块改为论文自由问答，还需要输入框、请求逻辑、后端、加载与错误状态等配合。

<!-- pagebreak -->

## 10 CSS 基础语句和实际修改位置

### 10.1 选择器 大括号 属性和值

[journey.css 第 51 行](/Users/thuee25/Desktop/iDunhuang-project/src/journey.css:51) 原规则换行展示：

```css
.artifact-summary {
  font-size: 14px;
  line-height: 1.95;
  color: #d2c8b7;
}
```

.artifact-summary 选中具有该类名的元素；大括号包含规则；属性和值用冒号分开，以分号分隔多条声明。font-size 是字号，line-height 是行高，这里的 1.95 是相对字号的倍率；color 是文字颜色。[R8]

### 10.2 同一元素为什么会有多条规则

journey.css 第 91 行另有 .city-paris .artifact-summary 的颜色规则。空格表示后代选择关系：在巴黎区域内部的摘要使用该规则。在通常的同层级规则中，更具体的选择器可覆盖一般规则；来源、层叠层、!important 和顺序等也会影响结果，不能只记“后面的永远覆盖前面的”。

### 10.3 两栏与小屏幕布局

[journey.css 第 46 行](/Users/thuee25/Desktop/iDunhuang-project/src/journey.css:46) 的声明节选：

```css
display: grid;
grid-template-columns: minmax(0, 1.13fr) minmax(0, .87fr);
gap: 65px;
```

两列按 1.13 与 0.87 的份额分配可用空间，gap 是列间距。宽屏下显示展品与说明两栏；该文件第 128 行起的 @media (max-width: 680px) 在窄屏生效，第 148 行把列定义改为 minmax(0, 1fr)，成为单列。

### 10.4 常见符号速记

| 写法 | 作用 | 在项目中的例子 |
| --- | --- | --- |
| .类名 | 按 className 选择元素 | .artifact-summary |
| A B | 选择 A 内部的 B | .city-paris .artifact-summary |
| A > B | 只选择直接子元素 | .sources-list > div |
| :hover、:disabled | 选择悬停、禁用等状态 | 查看器的禁用复位按钮 |
| ::before | 创建伪元素 | 敦煌区域背景中的“敦”字 |
| --名称、var(...) | CSS 自定义属性及其读取 | --dh-gold、var(--dh-gold) |

**一个实用发现：**背景中的“敦”来自 journey.css 第 20 行的 content: '敦'，并不在 JSX 正文中。搜文字时也要考虑 CSS 生成内容。

<!-- pagebreak -->

## 11 滚动动画和 useEffect 怎么理解

### 11.1 滚动位置先变成进度

在 [Homepage.tsx 第 17—46 行](/Users/thuee25/Desktop/iDunhuang-project/src/Homepage.tsx:17)，Effect 注册滚动与窗口变化监听。每次更新计算 0 到 1 的进度 p，再写入 --p、--camera、--reveal 等 CSS 属性，样式据此调整透明度、位置与缩放。

把流程读成：滚动事件 → 安排一帧更新 → 计算进度 → 更新 CSS 变量和阶段状态 → 页面与镜头变化。requestAnimationFrame 把更新安排在合适的渲染时机；它本身不负责理解页面内容。

### 11.2 用一个短函数学习判断与计算

[heroReveal.ts 第 2—14 行](/Users/thuee25/Desktop/iDunhuang-project/src/heroReveal.ts:2) 的完整计算主体：

```ts
const stops = [[0, .04], [.12, .12], [.25, .70], [.36, 1]] as const

export function heroReveal(progress: number) {
  for (let index = 1; index < stops.length; index++) {
    const [end, value] = stops[index]
    const [start, previous] = stops[index - 1]
    if (progress <= end) {
      const t = Math.max(0, Math.min(1, (progress - start) / (end - start)))
      return previous + (value - previous) * t * t * (3 - 2 * t)
    }
  }
  return 1
}
```

stops 每项是“进度、显现值”一对数字；解构把一对数字分别取出。循环找到当前区间后，把区间内进度限制在 0—1，再平滑插值。这里不必先推导公式，只需知道 progress=0 返回约 0.04，0.25 返回约 0.70，0.36 及以后返回 1。

### 11.3 Effect 为什么需要清理

useEffect 用于让组件与浏览器监听、观察器、3D 等外部系统同步。返回的函数负责移除监听、取消动画或释放资源。否则组件重新挂载或相关依赖变化后，可能残留旧逻辑。[R9]

空依赖数组 [] 表示该 Effect 不随组件的 props 或 state 变化重新执行；组件挂载会建立它，开发环境 StrictMode 还可能执行额外的建立与清理检查。它不等于“整个网站生命周期绝对只运行一次”。

模型 Effect 的 [url, mode, rotationY] 则表示这些依赖改变时，要先清理旧实例，再按新值建立。初学者修改文案时，一般无需碰这些依赖和清理代码。

<!-- pagebreak -->

## 12 3D 加载和失败回退怎么读

### 12.1 先分清控制界面与绘制场景

BuddhaViewer 管“显示照片还是模型、加载到了哪一步、复位按钮能不能点”；BuddhaModel 管“如何加载 GLB、设置镜头灯光并渲染”。ScrollScene 则在代码中创建卷轴几何与贴图，并管理热点，和直接加载坐佛 GLB 的实现方式不同。

在 [BuddhaViewer.tsx 第 13—20 行](/Users/thuee25/Desktop/iDunhuang-project/src/BuddhaViewer.tsx:13)，IntersectionObserver 观察展示器是否接近视口，接近时才准备模型展示。这样可以避免展品区尚未接近用户视线时就建立该处渲染组件。

### 12.2 lazy 和 Suspense 分别负责什么

项目用 lazy 动态导入复杂组件，并用 Suspense 在组件代码加载期间提供备用显示。**组件代码载入完成，不代表 GLB 文件已经加载并画出第一帧。**模型内部还需要 ready、fallback 等状态管理。

### 12.3 Promise then catch 与 try catch

[BuddhaModel.tsx 第 138—154 行](/Users/thuee25/Desktop/iDunhuang-project/src/BuddhaModel.tsx:138) 使用 loadModel(url).then(...).catch(...)：加载是异步操作，then 在成功后处理模型，catch 在这条异步链失败后执行回退。这里的 loadAsync 会加载资源，源码没有显式写 fetch 也仍然会产生资源请求。

[BuddhaModel.tsx 第 38—44 行](/Users/thuee25/Desktop/iDunhuang-project/src/BuddhaModel.tsx:38) 还用 try/catch 捕获建立 WebGL 渲染器时的同步错误。两种 catch 的上下文不同，不能认为任何 try/catch 都会自动捕获未来异步回调的错误。

### 12.4 加载状态怎样决定界面

| 状态 | 组件在做什么 | 用户看到什么 |
| --- | --- | --- |
| loading | 等待组件或模型绘制完成 | 照片与加载提示等备用内容 |
| ready | 模型第一帧已绘制并上报 | 可旋转、缩放或随滚动展示的模型 |
| fallback | 渲染器或资源等失败 | 回到照片并保留展品说明 |

这里的状态名是项目自行约定的字符串，不是浏览器自动提供的三个固定状态。

### 12.5 为什么清理代码这么长

渲染器、控制器、观察器和事件监听各有需要释放的资源。BuddhaModel 的清理代码见第 156 行起；共享缓存中的几何和纹理由缓存所有，不能简单地把所有资源都按同一种方式销毁。初学阶段理解职责即可，暂时不必逐项改动。

**迁移到论文助手的启发：**解析或模型请求也需要清楚的等待、成功、失败状态，以及可继续阅读的备用内容。

<!-- pagebreak -->

## 13 配置 练习与迁移到论文助手

### 13.1 项目启动命令来自哪里

[package.json 第 6—11 行](/Users/thuee25/Desktop/iDunhuang-project/package.json:6) 定义运行任务。npm run dev 启动 Vite 开发服务；npm test 运行现有测试；npm run build 先做 TypeScript 检查，再构建；npm run preview 预览已构建的结果。预览与开发不是同一个步骤。

本项目 README 特别记录了 dist/ 中历史素材的保留问题，因此学习期间不要随意清空 dist，也不要为了“看看效果”直接覆盖构建产物。本文只阅读源码，没有执行构建或部署。

netlify.toml 指定 build:netlify 和 sites/netlify-dist。prepare-netlify.mjs 只复制清单中的发布资源；新增图片时，除了在组件中使用，还要检查专用发布清单是否需要更新。这个脚本是构建工具，并不是问答 API。

### 13.2 可以在副本中进行的四个练习

| 练习 | 应该寻找的位置 | 验证方式 |
| --- | --- | --- |
| 修改标签页标题 | index.html 第 9 行 | 浏览器标签页标题变化 |
| 修改“一眼，千年” | Homepage.tsx 第 73 行 | 首屏变化，页面其他部分正常 |
| 修改一条固定问答 | data.ts 第 112—113 行附近 | 点击对应问题，核对答案 |
| 修改摘要字号 | journey.css 第 51 行 | 展品摘要变化，检查窄屏与换行 |

先预测影响，再一次只改一处，观察后记录。改完看浏览器 Console 是否报错。失败时优先核对括号、引号、路径和字段名，不要连续改很多位置后再找原因。

### 13.3 哪些结构可以迁移到论文助手

Artifact 的“按数据复用组件”可以用于论文卡片；Reader 的“页码与缩放状态”可以启发阅读器交互，但它目前展示的是图片，不能直接当成完整 PDF 阅读器；ExhibitQuestions 的“选择与回答分区”可以启发问答布局。

**真实论文问答还需要补充：**文件上传、PDF 文本提取、问题输入、后端模型请求、答案与原文定位，以及按需求保存记录。data.ts 中的固定数组可以用于最初的界面演示，接入真实数据时要重新约定接口和状态。

### 13.4 官方学习资料

源码讲解以本项目当前文件为依据；以下资料用于核对语法与工具概念，查阅日期为 2026年10月17日。

[R1] [React JSX 与大括号](https://react.dev/learn/javascript-in-jsx-with-curly-braces)　[R2] [MDN JavaScript 语法与类型](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Grammar_and_types)

[R3] [MDN 可选链](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Optional_chaining)　[R4] [MDN 数组 map](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/map)

[R5] [TypeScript 常见类型](https://www.typescriptlang.org/docs/handbook/2/everyday-types.html)　[R6] [Vite 静态资源](https://vite.dev/guide/assets)

[R7] [React 组件状态](https://react.dev/learn/state-a-components-memory)　[R8] [MDN CSS 基础](https://developer.mozilla.org/en-US/docs/Learn_web_development/Getting_started/Your_first_website/Styling_the_content)

[R9] [React Effect 与清理](https://react.dev/learn/synchronizing-with-effects)
