# OCR Web · 浏览器端 OCR 工作台

纯浏览器端 OCR 工作台，支持本地图片识别、参数调整、历史记录等功能。无需服务器，所有推理均在浏览器中完成。

## ✨ 功能特性

- **纯前端运行**：基于 ONNX Runtime Web，所有推理在浏览器中完成，无需后端服务器
- **三档模型**：支持 PP-OCRv6 Tiny（1.5MB）/ Small（7.7MB）/ Medium（34.5MB）三档模型，平衡速度与精度
- **灵活参数调整**：支持调整检测阈值、膨胀系数、最小框尺寸等参数，适配不同场景
- **智能空格保留**：自动识别文本排版，按视觉行分组并智能插入空格
- **多种输入方式**：支持拖放、文件选择、剪贴板粘贴（Ctrl+V / ⌘+V）图片
- **历史记录**：自动保存识别历史，支持查看、对比历史结果
- **结果导出**：支持复制格式化文本（保留空格）或原始逐行文本
- **实时预览**：识别结果在图片上可视化标注，鼠标悬停高亮对应文本框

## 🚀 快速开始

### 环境要求

- 现代浏览器（推荐 Chrome 90+ / Edge 90+）
- 本地 Web 服务器（用于加载模型文件）

### 安装运行

1. **克隆项目**
   ```bash
   git clone https://github.com/mindon/ocr-web
   cd ocr-web
   ```

2. **下载 PP-OCRv6 模型(若无)**
   
   从 [PaddleOCR 官方仓库](https://github.com/PaddlePaddle/PaddleOCR)  下载 ONNX 格式模型，放置到 `static/ppocrv6/` 目录：
   ```
   static/
   └── ppocrv6/
       ├── tiny/
       │   ├── det/
       │   └── rec/
       ├── small/
       │   ├── det/
       │   └── rec/
       └── medium/
           ├── det/
           └── rec/
   ```

3. **启动开发服务器**
   ```bash
   biu --serve
   ```

4. **打开浏览器**
   
   访问 `http://localhost:3000`

## 📖 使用指南

### 基本使用

1. **输入图片**：
   - 拖放图片到虚线框
   - 点击虚线框选择文件
   - 直接粘贴剪贴板图片（Ctrl+V / ⌘+V）

2. **调整参数**（可选）：
   - 模型规格：Tiny（最快）/ Small（均衡）/ Medium（最准）
   - 检测参数：调整二值化阈值、框置信度、膨胀系数等

3. **开始识别**：点击「开始识别」按钮

4. **查看结果**：
   - 左侧图片区：鼠标悬停高亮文本框
   - 右侧结果区：逐行显示识别文本和置信度
   - 底部文本框：格式化文本（自动保留空格）

### 参数说明

#### 检测参数

| 参数 | 默认值 | 说明 |
|------|--------|------|
| `detLimitSideLen` | 960 | 输入图像最大边长，超过会等比缩放 |
| `detThresh` | 0.2 | 二值化阈值，越低召回越多但噪声增多 |
| `detBoxThresh` | 0.4 | 文本框置信度阈值，低于该值的框会被过滤 |
| `detUnclipRatio` | 1.4 | 检测框膨胀系数，越高框包含的文字范围越大 |
| `detMinSize` | 3 | 最小文本框尺寸，宽或高小于该值的区域会被过滤 |

#### 识别参数

| 参数 | 默认值 | 说明 |
|------|--------|------|
| `recScoreThresh` | 0.5 | 识别结果置信度过滤阈值 |

#### 分场景参数推荐

| 场景 | 推荐配置 |
|------|----------|
| 日常快速识别（截图、普通文档） | 模型=Tiny，其余默认 |
| 高精度识别（合同、发票、低分辨率扫描件） | 模型=Medium，`detLimitSideLen=1280~1920`，`detThresh=0.15~0.18`，`detUnclipRatio=1.6` |
| 噪声较多图片（手机拍照、歪斜文档） | `detThresh=0.15`，`detBoxThresh=0.3`，`detUnclipRatio=1.6~1.8` |

## 🏗️ 项目结构

```
ocr-web/
├── src/                      # 源代码
│   ├── app.ts               # 应用入口
│   ├── index.html            # HTML 入口
│   ├── ocr/                 # OCR 核心模块
│   │   ├── types.ts         # 类型定义
│   │   ├── engine.ts        # OCR 引擎（协调检测+识别）
│   │   ├── det.ts           # 文本检测（DBNet）
│   │   ├── rec.ts           # 文本识别（CTC）
│   │   ├── format.ts        # 文本格式化（空格保留）
│   │   ├── image.ts         # 图像预处理
│   │   └── ort-loader.ts   # ONNX Runtime 加载器
│   ├── components/          # Web Components
│   │   ├── ocr-workbench.ts # OCR 工作台主组件
│   │   └── result-view.ts   # 识别结果展示组件
│   └── state/               # 状态管理
│       └── store.ts         # 历史记录存储
├── static/                  # 静态资源
│   ├── ppocrv6_onnx/       # PP-OCRv6 ONNX 模型
│   └── onnxruntime/        # ONNX Runtime Web 运行时
└── dist/                    # 构建输出
```

## 🛠️ 技术栈

- **前端框架**：Lit 3（Web Components）
- **OCR 引擎**：PP-OCRv6（飞桨）
- **推理运行时**：ONNX Runtime Web
- **构建工具**：biu（Bun 构建工具）
- **语言**：TypeScript

## 📚 参考项目

本项目参考了以下开源项目：

- [PaddleOCR](https://github.com/PaddlePaddle/PaddleOCR) - PP-OCRv6 官方实现

## 📄 许可证

本项目遵循 MIT 许可证。PP-OCRv6 模型权重遵循 Apache 2.0 许可证。

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！
