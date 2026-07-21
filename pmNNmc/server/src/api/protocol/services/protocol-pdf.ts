import fs from 'fs';
import path from 'path';
import { PDFDocument, StandardFonts, rgb, PDFFont, PDFPage } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';

declare const strapi: any;

function resolveAssetsDir(): string {
  const candidates = [
    path.resolve(__dirname, '..', 'assets'),
    path.resolve(__dirname, '..', '..', '..', '..', 'src', 'api', 'protocol', 'assets'),
    path.resolve(process.cwd(), 'src', 'api', 'protocol', 'assets'),
    path.resolve(process.cwd(), 'dist', 'src', 'api', 'protocol', 'assets'),
  ];
  for (const dir of candidates) {
    if (fs.existsSync(path.join(dir, 'times.ttf'))) return dir;
  }
  return candidates[0];
}

const ASSETS_DIR = resolveAssetsDir();

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN = 40;
const CONTENT_W = PAGE_W - MARGIN * 2;

const COLOR_TEXT = rgb(0.13, 0.16, 0.22);
const COLOR_MUTED = rgb(0.42, 0.45, 0.5);
const COLOR_BORDER = rgb(0.85, 0.87, 0.91);
const COLOR_HEADER_BG = rgb(0.95, 0.96, 0.98);

type User = {
  id: number;
  fullName?: string | null;
  username?: string | null;
  email?: string | null;
};

type Task = {
  order?: number;
  title?: string;
  shortDescription?: string | null;
  description?: string | null;
  deadline?: string | null;
  responsibleId?: number | null;
  responsibleName?: string;
  fact?: string;
};

export type ProtocolPdfData = {
  theme: string;
  meetingDate?: string | null;
  creatorDepartmentName?: string | null;
  creator?: User | null;
  attendees: User[];
  tasks: Task[];
  conclusion?: string | null;
  nextMeetingDate?: string | null;
  version: number;
  generatedAt: Date;
};

function userLabel(user?: User | null): string {
  if (!user) return '';
  return user.fullName || user.username || user.email || `User #${user.id}`;
}

function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function formatDateTime(date: Date): string {
  return (
    date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' }) +
    ' ' +
    date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
  );
}

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  if (!text) return [''];
  const words = String(text).split(/\s+/);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      current = candidate;
    } else {
      if (current) lines.push(current);
      if (font.widthOfTextAtSize(word, size) > maxWidth) {
        let chunk = '';
        for (const ch of word) {
          const c2 = chunk + ch;
          if (font.widthOfTextAtSize(c2, size) <= maxWidth) {
            chunk = c2;
          } else {
            if (chunk) lines.push(chunk);
            chunk = ch;
          }
        }
        current = chunk;
      } else {
        current = word;
      }
    }
  }
  if (current) lines.push(current);
  return lines.length > 0 ? lines : [''];
}

export async function generateProtocolPdf(data: ProtocolPdfData): Promise<Buffer> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);

  let regular: PDFFont;
  let bold: PDFFont;
  try {
    const regularBytes = fs.readFileSync(path.join(ASSETS_DIR, 'times.ttf'));
    const boldBytes = fs.readFileSync(path.join(ASSETS_DIR, 'timesbd.ttf'));
    regular = await doc.embedFont(regularBytes, { subset: true });
    bold = await doc.embedFont(boldBytes, { subset: true });
  } catch (e: any) {
    try {
      strapi?.log?.error(
        `[protocol-pdf] failed to load Times font from ${ASSETS_DIR}: ${e?.message || e}. Falling back to Helvetica (no Cyrillic).`
      );
    } catch {}
    throw new Error(
      `Cyrillic font not found in ${ASSETS_DIR}. Add times.ttf and timesbd.ttf there or fix the path.`
    );
  }

  let logoImage: any = null;
  try {
    const logoBytes = fs.readFileSync(path.join(ASSETS_DIR, 'logo.png'));
    logoImage = await doc.embedPng(logoBytes);
  } catch {
    logoImage = null;
  }

  let page = doc.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - MARGIN;

  const ensureSpace = (needed: number) => {
    if (y - needed < MARGIN + 30) {
      addFooter(page, regular, data);
      page = doc.addPage([PAGE_W, PAGE_H]);
      y = PAGE_H - MARGIN;
    }
  };

  const drawText = (text: string, x: number, options: { font?: PDFFont; size?: number; color?: any } = {}) => {
    page.drawText(text, {
      x,
      y,
      size: options.size ?? 11,
      font: options.font ?? regular,
      color: options.color ?? COLOR_TEXT,
    });
  };

  // Header with logo
  if (logoImage) {
    const logoH = 50;
    const logoW = (logoImage.width / logoImage.height) * logoH;
    page.drawImage(logoImage, { x: MARGIN, y: y - logoH, width: logoW, height: logoH });
  }
  page.drawText('АО «Национальный научный медицинский центр»', {
    x: MARGIN + 70,
    y: y - 20,
    size: 12,
    font: bold,
    color: COLOR_TEXT,
  });
  page.drawText('Протокол совещания', {
    x: MARGIN + 70,
    y: y - 36,
    size: 10,
    font: regular,
    color: COLOR_MUTED,
  });
  y -= 70;

  // Header info block
  ensureSpace(70);
  page.drawRectangle({
    x: MARGIN,
    y: y - 70,
    width: CONTENT_W,
    height: 70,
    color: COLOR_HEADER_BG,
    borderColor: COLOR_BORDER,
    borderWidth: 0.5,
  });
  const headerYStart = y - 14;
  const headerLine = (label: string, value: string, lineIndex: number) => {
    page.drawText(label, { x: MARGIN + 10, y: headerYStart - lineIndex * 14, size: 9.5, font: bold, color: COLOR_MUTED });
    page.drawText(value, { x: MARGIN + 140, y: headerYStart - lineIndex * 14, size: 10, font: regular, color: COLOR_TEXT });
  };
  headerLine('Отдел:', data.creatorDepartmentName || '—', 0);
  headerLine('Дата совещания:', formatDate(data.meetingDate), 1);
  headerLine('Тема:', data.theme || '—', 2);
  headerLine('Протокол подготовил:', userLabel(data.creator), 3);
  y -= 80;

  // Attendees
  ensureSpace(40);
  drawText('Присутствовали:', MARGIN, { font: bold, size: 11 });
  y -= 16;
  if (data.attendees.length === 0) {
    drawText('—', MARGIN + 10, { font: regular, size: 10, color: COLOR_MUTED });
    y -= 14;
  } else {
    for (const attendee of data.attendees) {
      ensureSpace(14);
      drawText(`• ${userLabel(attendee)}`, MARGIN + 10, { font: regular, size: 10 });
      y -= 14;
    }
  }
  y -= 8;

  // Tasks table
  ensureSpace(60);
  drawText('Задачи:', MARGIN, { font: bold, size: 11 });
  y -= 16;

  const cols = { num: 24, title: 80, short: 90, description: 105, deadline: 62, responsible: 105, fact: 49 };
  const tableWidth = cols.num + cols.title + cols.short + cols.description + cols.deadline + cols.responsible + cols.fact;
  const headers = ['№', 'Название', 'Кратко', 'Описание задачи', 'Срок', 'Ответственный', 'Факт'];
  const colWidths = [cols.num, cols.title, cols.short, cols.description, cols.deadline, cols.responsible, cols.fact];

  // Table header
  ensureSpace(22);
  page.drawRectangle({
    x: MARGIN,
    y: y - 18,
    width: tableWidth,
    height: 18,
    color: COLOR_HEADER_BG,
    borderColor: COLOR_BORDER,
    borderWidth: 0.5,
  });
  let xCursor = MARGIN;
  for (let i = 0; i < headers.length; i += 1) {
    page.drawText(headers[i], {
      x: xCursor + 4,
      y: y - 13,
      size: 8,
      font: bold,
      color: COLOR_TEXT,
    });
    xCursor += colWidths[i];
  }
  y -= 18;

  if (data.tasks.length === 0) {
    ensureSpace(20);
    page.drawRectangle({
      x: MARGIN,
      y: y - 18,
      width: tableWidth,
      height: 18,
      borderColor: COLOR_BORDER,
      borderWidth: 0.5,
    });
    page.drawText('Задач не задано', {
      x: MARGIN + 8,
      y: y - 13,
      size: 9.5,
      font: regular,
      color: COLOR_MUTED,
    });
    y -= 18;
  } else {
    data.tasks.forEach((task, index) => {
      const num = String(index + 1);
      const title = task.title || '—';
      const shortDescription = task.shortDescription || '—';
      const description = task.description || '—';
      const deadline = formatDate(task.deadline);
      const responsible = task.responsibleName || '—';
      const fact = task.fact || '—';

      const titleLines = wrapText(title, regular, 8.5, cols.title - 8);
      const shortLines = wrapText(shortDescription, regular, 8.5, cols.short - 8);
      const descriptionLines = wrapText(description, regular, 8.5, cols.description - 8);
      const respLines = wrapText(responsible, regular, 8.5, cols.responsible - 8);
      const factLines = wrapText(fact, regular, 8.5, cols.fact - 8);
      const rowH = Math.max(18, Math.max(titleLines.length, shortLines.length, descriptionLines.length, respLines.length, factLines.length) * 11 + 6);

      ensureSpace(rowH + 2);
      page.drawRectangle({
        x: MARGIN,
        y: y - rowH,
        width: tableWidth,
        height: rowH,
        borderColor: COLOR_BORDER,
        borderWidth: 0.5,
      });

      let cx = MARGIN;
      const drawCell = (lines: string[], col: number, mono = false) => {
        let cy = y - 12;
        for (const line of lines) {
          page.drawText(line, {
            x: cx + 4,
            y: cy,
            size: 8.5,
            font: regular,
            color: mono ? COLOR_MUTED : COLOR_TEXT,
          });
          cy -= 11;
        }
      };

      drawCell([num], 0);
      cx += cols.num;
      drawCell(titleLines, 1);
      cx += cols.title;
      drawCell(shortLines, 2);
      cx += cols.short;
      drawCell(descriptionLines, 3);
      cx += cols.description;
      drawCell([deadline], 4, true);
      cx += cols.deadline;
      drawCell(respLines, 5);
      cx += cols.responsible;
      drawCell(factLines, 6);

      y -= rowH;
    });
  }

  y -= 16;

  // Conclusion
  if (data.conclusion && data.conclusion.trim()) {
    ensureSpace(30);
    drawText('Заключение:', MARGIN, { font: bold, size: 11 });
    y -= 16;
    const lines = wrapText(data.conclusion.trim(), regular, 10, CONTENT_W);
    for (const line of lines) {
      ensureSpace(14);
      drawText(line, MARGIN + 10, { font: regular, size: 10 });
      y -= 13;
    }
    y -= 6;
  }

  // Next meeting
  if (data.nextMeetingDate) {
    ensureSpace(20);
    drawText(`Следующее совещание: ${formatDate(data.nextMeetingDate)}`, MARGIN, {
      font: bold,
      size: 11,
    });
    y -= 16;
  }

  addFooter(page, regular, data);

  const bytes = await doc.save();
  return Buffer.from(bytes);
}

function addFooter(page: PDFPage, font: PDFFont, data: ProtocolPdfData) {
  page.drawLine({
    start: { x: MARGIN, y: 40 },
    end: { x: PAGE_W - MARGIN, y: 40 },
    color: COLOR_BORDER,
    thickness: 0.5,
  });
  page.drawText(`Версия ${data.version}`, {
    x: MARGIN,
    y: 26,
    size: 8.5,
    font,
    color: COLOR_MUTED,
  });
  const right = `Сформирован: ${formatDateTime(data.generatedAt)}`;
  const rightWidth = font.widthOfTextAtSize(right, 8.5);
  page.drawText(right, {
    x: PAGE_W - MARGIN - rightWidth,
    y: 26,
    size: 8.5,
    font,
    color: COLOR_MUTED,
  });
}
