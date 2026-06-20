import {
  Document, Packer, Paragraph, TextRun, Header, Footer,
  AlignmentType, HeadingLevel, BorderStyle, ExternalHyperlink,
  PageNumber, TabStopType, TabStopPosition,
} from 'docx';
import fs from 'fs';
import type { ChdBriefContent } from './types';
import { docxPath } from './paths';

const hrParagraph = () => new Paragraph({
  children: [new TextRun('')],
  border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: 'CCCCCC', space: 1 } },
  spacing: { after: 240 },
});

function articleParagraphs(a: ChdBriefContent['articles'][0], idx: number): Paragraph[] {
  const paras: Paragraph[] = [];

  paras.push(new Paragraph({
    heading: HeadingLevel.HEADING_2,
    children: [new TextRun({ text: `${idx + 1}. ${a.titleNews}`, font: 'Arial', size: 26, bold: true })],
    spacing: { before: 360, after: 120 },
  }));

  paras.push(new Paragraph({
    children: [new TextRun({ text: a.hook, font: 'Arial', size: 22, italics: true, color: '1F3864' })],
    spacing: { after: 140 },
  }));

  paras.push(new Paragraph({
    children: [new TextRun({ text: a.body, font: 'Arial', size: 22 })],
    spacing: { after: 200 },
  }));

  paras.push(new Paragraph({
    children: [new TextRun('')],
    border: { bottom: { style: BorderStyle.SINGLE, size: 2, color: 'DDDDDD', space: 1 } },
    spacing: { after: 80 },
  }));

  paras.push(new Paragraph({
    children: [new TextRun({ text: a.titleOriginal, font: 'Arial', size: 18, italics: true, color: '555555' })],
    spacing: { after: 40 },
  }));

  paras.push(new Paragraph({
    children: [new TextRun({ text: `${a.author} | ${a.journal} | ${a.date}`, font: 'Arial', size: 18, color: '555555' })],
    spacing: { after: 40 },
  }));

  const doiLink = a.doi || '';
  if (doiLink) {
    paras.push(new Paragraph({
      children: [new ExternalHyperlink({
        children: [new TextRun({ text: doiLink, font: 'Arial', size: 18, style: 'Hyperlink' })],
        link: doiLink,
      })],
      spacing: { after: 40 },
    }));
  }

  paras.push(hrParagraph());
  return paras;
}

export async function buildDocx(content: ChdBriefContent): Promise<string> {
  const { DATE_VN, DATE_ISO, TOPIC, articles } = content;
  const outPath = docxPath(DATE_ISO);

  const doc = new Document({
    styles: {
      default: { document: { run: { font: 'Arial', size: 22 } } },
      paragraphStyles: [
        { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true,
          run: { size: 34, bold: true, font: 'Arial', color: '1F3864' },
          paragraph: { spacing: { before: 0, after: 200 }, outlineLevel: 0 } },
        { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true,
          run: { size: 26, bold: true, font: 'Arial', color: '2E5090' },
          paragraph: { spacing: { before: 360, after: 120 }, outlineLevel: 1 } },
      ],
    },
    sections: [{
      properties: {
        page: {
          size: { width: 11906, height: 16838 },
          margin: { top: 1134, right: 1134, bottom: 1134, left: 1134 },
        },
      },
      headers: {
        default: new Header({
          children: [new Paragraph({
            children: [
              new TextRun({ text: 'CHD Daily Brief', font: 'Arial', size: 18, bold: true, color: '2E5090' }),
              new TextRun({ text: '\t' + DATE_ISO, font: 'Arial', size: 18, color: '888888' }),
            ],
            tabStops: [{ type: TabStopType.RIGHT, position: TabStopPosition.MAX }],
            border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: 'CCCCCC', space: 1 } },
          })],
        }),
      },
      footers: {
        default: new Footer({
          children: [new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new TextRun({ text: 'Trang ', font: 'Arial', size: 18, color: '888888' }),
              new TextRun({ children: [PageNumber.CURRENT], font: 'Arial', size: 18, color: '888888' }),
              new TextRun({ text: ' / ', font: 'Arial', size: 18, color: '888888' }),
              new TextRun({ children: [PageNumber.TOTAL_PAGES], font: 'Arial', size: 18, color: '888888' }),
            ],
          })],
        }),
      },
      children: [
        new Paragraph({
          heading: HeadingLevel.HEADING_1,
          children: [new TextRun({ text: `CHD Daily Brief - ${DATE_VN}`, font: 'Arial', size: 34, bold: true })],
          spacing: { after: 120 },
        }),
        new Paragraph({
          children: [new TextRun({
            text: `5 bài lọc từ PubMed | ${TOPIC} | Ưu tiên: ứng dụng lâm sàng cao, mới nhất trước`,
            font: 'Arial', size: 20, italics: true, color: '666666',
          })],
          border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: '2E5090', space: 1 } },
          spacing: { after: 400 },
        }),
        ...articles.flatMap((a, i) => articleParagraphs(a, i)),
        new Paragraph({
          children: [new TextRun({ text: 'Nguon: PubMed.', font: 'Arial', size: 18, italics: true, color: '888888' })],
          spacing: { before: 200 },
        }),
      ],
    }],
  });

  const buf = await Packer.toBuffer(doc);
  fs.writeFileSync(outPath, buf);
  const stat = fs.statSync(outPath);
  if (stat.size <= 0) throw new Error('DOCX file is empty');
  return outPath;
}
