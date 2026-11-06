/**
 * Smoke UI: login (staff select) → Module 7 month sheet → Nhiệm vụ + edit + bold.
 */
import fs from 'fs';
import path from 'path';
import puppeteer from 'puppeteer-core';

const BASE = process.env.APP_URL || 'http://127.0.0.1:5173';
const OUT = '/opt/cursor/artifacts';
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const browser = await puppeteer.launch({
    executablePath: '/usr/bin/google-chrome-stable',
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1440,900'],
    defaultViewport: { width: 1440, height: 900 },
  });
  const page = await browser.newPage();
  page.setDefaultTimeout(20000);
  const result = {
    login: false,
    monthOpened: false,
    nhiemVuHeaderFull: false,
    nhiemVuHeaderText: '',
    taskCellEditable: false,
    boldPersists: false,
    notes: [],
  };

  try {
    await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 60000 });
    await sleep(800);

    // Staff select — native <select> or custom dropdown
    const selected = await page.evaluate(() => {
      const select = document.querySelector('select');
      if (select) {
        const opt = [...select.options].find((o) => /00017|Lợi|Loi/i.test(o.textContent || '') || o.value === '00017');
        if (opt) {
          select.value = opt.value;
          select.dispatchEvent(new Event('change', { bubbles: true }));
          return { type: 'select', value: opt.value, text: opt.textContent };
        }
        return { type: 'select', options: [...select.options].slice(0, 20).map((o) => o.textContent) };
      }
      return { type: 'none' };
    });
    result.notes.push(`staffSelect=${JSON.stringify(selected)}`);

    if (selected.type === 'none' || selected.options) {
      // Custom dropdown: click placeholder then option
      await page.evaluate(() => {
        const el = [...document.querySelectorAll('button, [role="combobox"], .select-trigger, div')]
          .find((n) => /Chọn nhân viên/i.test(n.textContent || ''));
        el?.click();
      });
      await sleep(500);
      await page.evaluate(() => {
        const opt = [...document.querySelectorAll('[role="option"], li, button, div')]
          .find((n) => /00017|Lợi/.test(n.textContent || ''));
        opt?.click();
      });
      await sleep(400);
    }

    await sleep(400);
    const pass = await page.$('input[type="password"]');
    if (pass) {
      await pass.click({ clickCount: 3 });
      await pass.type('1111');
    }
    await page.evaluate(() => {
      const btn = [...document.querySelectorAll('button')]
        .find((b) => /Đăng nhập/i.test(b.textContent || ''));
      btn?.click();
    });
    await sleep(3000);
    result.login = !(await page.evaluate(() => /Đăng nhập/i.test(document.body.innerText)
      && /Chọn nhân viên|Mật khẩu/i.test(document.body.innerText)));
    await page.screenshot({ path: path.join(OUT, 'month_sheet_after_login.png') });

    if (!result.login) {
      // Try typing into searchable staff field
      result.notes.push('still on login — dump inputs');
      const dump = await page.evaluate(() => ({
        selects: [...document.querySelectorAll('select')].map((s) => ({
          name: s.name,
          value: s.value,
          opts: [...s.options].slice(0, 30).map((o) => ({ v: o.value, t: o.textContent?.trim() })),
        })),
        inputs: [...document.querySelectorAll('input')].map((i) => ({
          type: i.type, name: i.name, placeholder: i.placeholder, disabled: i.disabled,
        })),
      }));
      result.notes.push(JSON.stringify(dump));
      fs.writeFileSync(path.join(OUT, 'month_sheet_smoke.json'), JSON.stringify(result, null, 2));
      console.log(JSON.stringify(result, null, 2));
      await browser.close();
      process.exit(1);
    }

    // Workspace → module 7
    await page.evaluate(() => {
      const hit = [...document.querySelectorAll('button, a, [role="button"], div, span')]
        .find((el) => /Không gian làm việc|Workspace/i.test((el.textContent || '').trim())
          && (el.textContent || '').trim().length < 40);
      hit?.click();
    });
    await sleep(1000);

    await page.evaluate(() => {
      const hit = [...document.querySelectorAll('button, a, [role="button"], .module-card, div')]
        .find((el) => /Lịch khoa|lich-khoa|Xếp lịch khoa|Quản lý lịch làm việc/i.test(el.textContent || ''));
      hit?.click();
    });
    await sleep(2000);
    await page.screenshot({ path: path.join(OUT, 'month_sheet_module7.png') });

    // Month tab
    await page.evaluate(() => {
      const hit = [...document.querySelectorAll('button, a, [role="tab"], span, div')]
        .find((el) => {
          const t = (el.textContent || '').trim();
          return t === 'Tháng' || t === 'Lịch tháng';
        });
      hit?.click();
    });
    await sleep(2500);
    result.monthOpened = await page.evaluate(() => !!document.querySelector('.month-sheet'));
    await page.screenshot({ path: path.join(OUT, 'month_sheet_view.png') });

    const headerInfo = await page.evaluate(() => {
      const texts = [];
      document.querySelectorAll('.month-sheet th, .month-sheet .month-task-head span, .month-sheet .month-task-head')
        .forEach((el) => {
          const t = (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();
          if (t) texts.push({ t, w: Math.round(el.getBoundingClientRect().width) });
        });
      return {
        texts,
        full: texts.some((x) => x.t.includes('Nhiệm vụ')),
        truncated: texts.some((x) => /Nhiệ\.\.\.|Nhiệm\s*\.\.\./i.test(x.t)),
      };
    });
    result.nhiemVuHeaderText = JSON.stringify(headerInfo.texts.slice(0, 12));
    result.nhiemVuHeaderFull = headerInfo.full && !headerInfo.truncated;

    const editInfo = await page.evaluate(() => {
      const cell = document.querySelector('.month-sheet .ht_master td.month-role');
      if (!cell) return { found: false };
      const r = cell.getBoundingClientRect();
      return { found: true, x: r.left + r.width / 2, y: r.top + r.height / 2, text: cell.innerText?.trim() };
    });
    result.notes.push(`editInfo=${JSON.stringify(editInfo)}`);
    if (editInfo.found) {
      await page.mouse.click(editInfo.x, editInfo.y, { clickCount: 2 });
      await sleep(500);
      let editing = await page.evaluate(() => !!document.querySelector('.handsontableInput, textarea.handsontableInput'));
      if (!editing) {
        await page.mouse.click(editInfo.x, editInfo.y);
        await sleep(200);
        await page.keyboard.press('Enter');
        await sleep(300);
        editing = await page.evaluate(() => !!document.querySelector('.handsontableInput, textarea.handsontableInput'));
      }
      if (editing) {
        await page.keyboard.type('TESTNV');
        await page.keyboard.press('Enter');
        await sleep(400);
        result.taskCellEditable = true;
      } else {
        result.taskCellEditable = false;
        result.notes.push('editor did not open');
      }
    }
    await page.screenshot({ path: path.join(OUT, 'month_sheet_task_edit.png') });

    // Week bold
    await page.evaluate(() => {
      const hit = [...document.querySelectorAll('button, a, [role="tab"], span')]
        .find((el) => {
          const t = (el.textContent || '').trim();
          return t === 'Tuần' || t === 'Lịch tuần';
        });
      hit?.click();
    });
    await sleep(2000);

    const weekCell = await page.evaluate(() => {
      const td = document.querySelector('.sheet-grid-host:not(.is-parked):not(.month-sheet) .ht_master tbody td')
        || document.querySelector('.sheet-zoom > .sheet-grid-host:not(.is-parked) .ht_master tbody td');
      if (!td) return null;
      const r = td.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    });
    if (weekCell) {
      await page.mouse.click(weekCell.x, weekCell.y);
      await sleep(300);
      await page.evaluate(() => {
        const bold = [...document.querySelectorAll('button')]
          .find((b) => /bold|đậm/i.test(b.title || b.getAttribute('aria-label') || '')
            || b.querySelector('svg.lucide-bold'));
        bold?.click();
      });
      await sleep(600);
      const before = await page.evaluate(() => !!document.querySelector('.sheet-grid-host:not(.is-parked) td.fmt-bold'));
      await sleep(4000);
      const after = await page.evaluate(() => !!document.querySelector('.sheet-grid-host:not(.is-parked) td.fmt-bold'));
      result.boldPersists = before && after;
      result.notes.push(`bold before=${before} after4s=${after}`);
      await page.screenshot({ path: path.join(OUT, 'week_sheet_bold_persist.png') });
    } else {
      result.notes.push('no week cell');
      await page.screenshot({ path: path.join(OUT, 'week_sheet_missing.png') });
    }
  } catch (err) {
    result.notes.push(String(err?.stack || err));
    await page.screenshot({ path: path.join(OUT, 'month_sheet_error.png'), fullPage: true }).catch(() => {});
  }

  fs.writeFileSync(path.join(OUT, 'month_sheet_smoke.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
  await browser.close();
  process.exit(result.nhiemVuHeaderFull && result.taskCellEditable ? 0 : 1);
}

main();
