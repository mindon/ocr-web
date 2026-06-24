// OCR 结果导出工具：支持 CSV / Markdown / Excel 格式

import type { OcrResult } from "./types.ts";

/**
 * 将 OCR 结果导出为 CSV 格式
 * 包含：行号、文本、置信度、文本框坐标
 */
export function exportCsv(result: OcrResult): string {
  // BOM + CSV 表头
  const BOM = "\uFEFF";
  const header = "行号,文本,置信度(%),左上,右上,右下,左下\n";

  const rows = result.lines.map((ln, i) => {
    const text = `"${ln.text.replace(/"/g, '""')}"`; // CSV 转义双引号
    const score = (ln.score * 100).toFixed(1);
    const box = ln.box
      .map(([x, y]) => `(${Math.round(x)},${Math.round(y)})`)
      .join(" ");
    return `${i + 1},${text},${score},${box}`;
  });

  return BOM + header + rows.join("\n");
}

/**
 * 将 OCR 结果导出为 Markdown 格式
 * 包含：标题、基本信息、逐行结果表格、格式化文本
 */
export function exportMarkdown(result: OcrResult, fileName: string): string {
  const lines = [
    `# OCR 识别结果`,
    ``,
    `> 文件：${fileName}`,
    `> 尺寸：${result.width}×${result.height}px`,
    `> 耗时：检测 ${result.timing.detect.toFixed(0)}ms / 识别 ${
      result.timing.recognize.toFixed(0)
    }ms / 总计 ${result.timing.total.toFixed(0)}ms`,
    `> 识别行数：${result.lines.length}`,
    ``,
    `## 逐行结果`,
    ``,
    `| 行号 | 文本 | 置信度 |`,
    `| ---- | ---- | -------- |`,
  ];

  result.lines.forEach((ln, i) => {
    const text = ln.text.replace(/\|/g, "\\|"); // Markdown 转义竖线
    const score = (ln.score * 100).toFixed(1);
    lines.push(`| ${i + 1} | ${text} | ${score}% |`);
  });

  lines.push(``);
  lines.push(`## 完整文本`);
  lines.push(``);
  lines.push("```");
  lines.push(
    result.formattedText || result.lines.map((l) => l.text).join("\n"),
  );
  lines.push("```");
  lines.push(``);

  return lines.join("\n");
}

/**
 * 将 OCR 结果导出为 Excel (XLSX) 格式
 * 纯前端实现，无需依赖后端
 * 生成 Office Open XML (XLSX) 格式
 */
export function exportExcel(result: OcrResult, fileName: string): Blob {
  // 简易 XLSX 生成（纯前端，无依赖）
  // 1. 构建工作表数据
  const rows = [];

  // 标题行
  rows.push(["OCR 识别结果"]);
  rows.push([]);
  rows.push(["文件", fileName]);
  rows.push(["尺寸", `${result.width}×${result.height}px`]);
  rows.push(["检测耗时", `${result.timing.detect.toFixed(0)}ms`]);
  rows.push(["识别耗时", `${result.timing.recognize.toFixed(0)}ms`]);
  rows.push(["总耗时", `${result.timing.total.toFixed(0)}ms`]);
  rows.push(["识别行数", result.lines.length]);
  rows.push([]);

  // 表头
  rows.push([
    "行号",
    "文本",
    "置信度(%)",
    "左上坐标",
    "右上坐标",
    "右下坐标",
    "左下坐标",
  ]);

  // 数据行
  result.lines.forEach((ln, i) => {
    const boxStr = ln.box.map(
      ([x, y]) => `${Math.round(x)},${Math.round(y)}`,
    );
    rows.push([
      i + 1,
      ln.text,
      parseFloat((ln.score * 100).toFixed(1)),
      boxStr[0],
      boxStr[1],
      boxStr[2],
      boxStr[3],
    ]);
  });

  rows.push([]);
  rows.push(["完整文本"]);
  rows.push([
    result.formattedText || result.lines.map((l) => l.text).join("\n"),
  ]);

  // 2. 生成 XML
  const xml = generateXlsxXml(rows, fileName);

  // 3. 返回 Blob
  return new Blob([xml], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

/**
 * 生成 Office Open XML (XLSX) 格式
 * 简化实现，仅包含必要的工作表数据
 */
function generateXlsxXml(
  rows: (string | number)[][],
  sheetName: string,
): string {
  // 转义 XML 特殊字符
  const esc = (s: string) =>
    s.replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");

  // 生成行 XML
  let sheetData = "";
  rows.forEach((row, rowIdx) => {
    // 跳过空行（但保留其存在）
    if (row.length === 0) {
      sheetData += `<row r="${rowIdx + 1}"></row>`;
      return;
    }

    let cells = "";
    row.forEach((cell, colIdx) => {
      const col = columnName(colIdx);
      const ref = `${col}${rowIdx + 1}`;
      const value = String(cell);

      if (value === "") {
        cells += `<c r="${ref}" />`;
      } else if (typeof cell === "number") {
        cells += `<c r="${ref}"><v>${value}</v></c>`;
      } else {
        cells += `<c r="${ref}" t="inlineStr"><is><t>${
          esc(value)
        }</t></is></c>`;
      }
    });

    sheetData += `<row r="${rowIdx + 1}">${cells}</row>`;
  });

  // 完整 XLSX XML
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData>
    ${sheetData}
  </sheetData>
</worksheet>`;
}

/**
 * 将列索引转换为 Excel 列名（0 -> A, 1 -> B, ... 26 -> AA）
 */
function columnName(idx: number): string {
  let name = "";
  let i = idx;
  while (i >= 0) {
    name = String.fromCharCode(65 + (i % 26)) + name;
    i = Math.floor(i / 26) - 1;
  }
  return name;
}

/**
 * 触发浏览器下载
 */
export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 100);
}

/**
 * 导出并下载 CSV
 */
export function exportAndDownloadCsv(
  result: OcrResult,
  fileName: string,
): void {
  const csv = exportCsv(result);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const name = fileName.replace(/\.[^.]+$/, "") + "_ocr.csv";
  downloadBlob(blob, name);
}

/**
 * 导出并下载 Markdown
 */
export function exportAndDownloadMarkdown(
  result: OcrResult,
  fileName: string,
): void {
  const md = exportMarkdown(result, fileName);
  const blob = new Blob([md], { type: "text/markdown;charset=utf-8;" });
  const name = fileName.replace(/\.[^.]+$/, "") + "_ocr.md";
  downloadBlob(blob, name);
}

/**
 * 导出并下载 Excel
 */
export function exportAndDownloadExcel(
  result: OcrResult,
  fileName: string,
): void {
  const blob = exportExcel(result, fileName);
  const name = fileName.replace(/\.[^.]+$/, "") + "_ocr.xlsx";
  downloadBlob(blob, name);
}
