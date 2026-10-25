import React, { useCallback, useState } from 'react';
import { ClipboardCopy, Download, Check } from 'lucide-react';
import Button from '../../../common/Button';
import { cm3ToM3, kgToTonnes } from '../../../../utils/schedule/capacityRules';

// The highest-trust feature in the demo for an Excel user: it says we are not
// taking the spreadsheet away. He pastes the week into Excel and keeps his own
// pivot tables through the parallel run.

/** Tab-separated, which is what Excel accepts directly from the clipboard. */
export function matrixToTsv(matrix) {
  const header = ['Lorry', 'Tone', 'Window', ...matrix.dateKeys, 'Total'];
  const rows = [header];

  for (const group of matrix.rowGroups) {
    for (const row of group.rows) {
      rows.push([
        group.truck.plate,
        group.truck.tone ? `${group.truck.tone}t` : '',
        row.label,
        ...row.cells.map(cell => {
          if (cell.closed) return 'CLOSED';
          if (cell.offDay) return 'OFF';
          const lane = cell.lane;
          if (!lane || lane.capacity.doCount === 0) return '';
          return lane.orders.map(o => o.doNo).join(' ');
        }),
        '',
      ]);
    }
    // Per-lorry summary row, mirroring his SUM() column.
    rows.push([
      `${group.truck.plate} total`, '', '',
      ...dayTotalsForTruck(group, matrix.dateKeys),
      String(group.total),
    ]);
  }

  rows.push([
    'Day total', '', '',
    ...matrix.columnTotals.map(c => (c.closed ? '' : `${c.doCount}/${c.doCapacity}`)),
    String(matrix.grandTotal),
  ]);

  return rows.map(cells => cells.join('\t')).join('\n');
}

function dayTotalsForTruck(group, dateKeys) {
  return dateKeys.map((dateKey) => {
    const n = group.rows.reduce((sum, row) => {
      const cell = row.cells.find(c => c.dateKey === dateKey);
      return sum + (cell?.lane?.capacity.doCount ?? 0);
    }, 0);
    return n ? String(n) : '';
  });
}

/** One row per DO — the long form, for pivoting. */
export function matrixToCsv(matrix) {
  const header = [
    'Date', 'Window', 'Time', 'Lorry', 'Tone', 'Crew', 'DO No', 'Status',
    'Approval', 'Customer ID', 'Building ID', 'Slot volume m3', 'Slot tonnes', 'Slot DOs',
  ];
  const rows = [header];

  for (const group of matrix.rowGroups) {
    for (const row of group.rows) {
      for (const cell of row.cells) {
        const lane = cell.lane;
        if (!lane) continue;
        for (const order of lane.orders) {
          rows.push([
            cell.dateKey, row.label, lane.timeLabel,
            group.truck.plate, group.truck.tone ?? '', lane.teamName ?? '',
            order.doNo, order.status, order.assignmentStatus,
            order.customerId ?? '', order.buildingId ?? '',
            cm3ToM3(lane.capacity.volumeCm3).toFixed(2),
            lane.capacity.weightKnown ? kgToTonnes(lane.capacity.weightKg).toFixed(2) : '',
            lane.capacity.doCount,
          ]);
        }
      }
    }
  }

  // Quote anything containing a comma, quote or newline, per RFC 4180.
  const escape = (value) => {
    const s = String(value ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return rows.map(cells => cells.map(escape).join(',')).join('\n');
}

export default function GridExportButton({ matrix, rangeLabel }) {
  const [copied, setCopied] = useState(false);

  const copyTsv = useCallback(async () => {
    const tsv = matrixToTsv(matrix);
    try {
      await navigator.clipboard.writeText(tsv);
    } catch {
      // Older browsers and non-secure contexts: fall back to a hidden textarea.
      const ta = document.createElement('textarea');
      ta.value = tsv;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); } finally { document.body.removeChild(ta); }
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [matrix]);

  const downloadCsv = useCallback(() => {
    const blob = new Blob([matrixToCsv(matrix)], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ce-hub-schedule-${(rangeLabel ?? 'week').replace(/[^\w-]+/g, '-')}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [matrix, rangeLabel]);

  return (
    <div className="flex gap-1 print:hidden">
      <Button
        variant="secondary" size="sm"
        icon={copied ? Check : ClipboardCopy}
        onClick={copyTsv}
        title="Copy the week as tab-separated text, ready to paste into Excel"
      >
        {copied ? 'Copied' : 'Copy for Excel'}
      </Button>
      <Button
        variant="secondary" size="sm" icon={Download}
        onClick={downloadCsv}
        title="Download one row per delivery order"
      >
        CSV
      </Button>
    </div>
  );
}
