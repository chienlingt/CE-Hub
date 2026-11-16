// FR-10-005: export the performance summary to CSV or PDF, in the browser.
import jsPDF from 'jspdf';

export const SUMMARY_COLUMNS = [
  { key: 'rank', label: 'Rank' },
  { key: 'name', label: 'Employee' },
  { key: 'roles', label: 'Role' },
  { key: 'teams', label: 'Team' },
  { key: 'completed_orders', label: 'Orders' },
  { key: 'item_points', label: 'Item pts' },
  { key: 'manual_points', label: 'Extra pts' },
  { key: 'total_points', label: 'Total pts' },
  { key: 'incentive_rm', label: 'Incentive (RM)' },
];

// Plain table rows for a ranking row set.
export function summaryRows(rows) {
  return rows.map(row => ({
    ...row,
    roles: (row.award_roles || []).join(' / '),
    teams: (row.teams || []).join(' / '),
    incentive_rm: Number(row.incentive_rm).toFixed(2),
  }));
}

// Spreadsheet apps run text cells starting with = + - @ as formulas; prefix them.
const csvCell = value => {
  let text = value == null ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(text) && Number.isNaN(Number(text))) text = `'${text}`;
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

export function buildCsv(rows) {
  const lines = [SUMMARY_COLUMNS.map(c => csvCell(c.label)).join(',')];
  summaryRows(rows).forEach(row => lines.push(SUMMARY_COLUMNS.map(c => csvCell(row[c.key])).join(',')));
  return lines.join('\r\n');
}

function save(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function exportCsv(rows, filename) {
  // BOM so Excel reads UTF-8 names correctly.
  save(new Blob(['\ufeff', buildCsv(rows)], { type: 'text/csv;charset=utf-8' }), filename);
}

export function exportPdf(rows, { title, subtitle, filename }) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  const width = doc.internal.pageSize.getWidth();
  const height = doc.internal.pageSize.getHeight();
  const margin = 36;
  const widths = [36, 160, 100, 120, 52, 60, 60, 64, 84];
  const lineHeight = 18;
  const data = summaryRows(rows);
  let y = margin;

  const header = () => {
    doc.setFont('helvetica', 'bold').setFontSize(9).setFillColor(240, 240, 240);
    doc.rect(margin, y - 12, width - margin * 2, lineHeight, 'F');
    let x = margin + 4;
    SUMMARY_COLUMNS.forEach((c, i) => { doc.text(c.label, x, y); x += widths[i]; });
    y += lineHeight;
    doc.setFont('helvetica', 'normal');
  };

  doc.setFont('helvetica', 'bold').setFontSize(15).text(title, margin, y);
  y += 18;
  doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(100).text(subtitle, margin, y);
  doc.setTextColor(0);
  y += 24;
  header();
  data.forEach(row => {
    if (y > height - margin) { doc.addPage(); y = margin; header(); }
    let x = margin + 4;
    SUMMARY_COLUMNS.forEach((c, i) => {
      const text = String(row[c.key] ?? '');
      doc.setFontSize(9).text(doc.splitTextToSize(text, widths[i] - 6)[0] || '', x, y);
      x += widths[i];
    });
    y += lineHeight;
  });
  if (!data.length) doc.text('No completed deliveries in this period.', margin + 4, y);
  doc.save(filename);
}
