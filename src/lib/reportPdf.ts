import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { ReportData } from "./types";
import { fmtMoney, fmtQty } from "./format";
import { paymentLabel } from "./constants";

export function generateReportPdf(report: ReportData, from: string, to: string): jsPDF {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();

  // Colors
  const zincDark = { r: 39, g: 39, b: 42 };
  const zincMid = { r: 113, g: 113, b: 122 };

  // Header
  doc.setFillColor(24, 24, 27); // surface-900
  doc.rect(0, 0, pageW, 28, "F");

  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("TuOrden POS", 14, 13);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(161, 161, 170);
  doc.text("Reporte de Ventas", 14, 19);

  // Period badge on header right
  const periodText = `${from}  →  ${to}`;
  doc.setFontSize(8);
  doc.setTextColor(255, 255, 255);
  const periodW = doc.getTextWidth(periodText) + 12;
  const periodX = pageW - 14 - periodW;
  doc.setFillColor(255, 255, 255);
  // @ts-ignore - setFillColor with alpha not supported, use normal
  doc.setFillColor(39, 39, 42);
  doc.roundedRect(periodX, 8, periodW, 12, 2, 2, "F");
  doc.setDrawColor(63, 63, 70);
  doc.roundedRect(periodX, 8, periodW, 12, 2, 2, "S");
  doc.text(periodText, periodX + 6, 15.5);

  // Generated at
  doc.setTextColor(113, 113, 122);
  doc.setFontSize(7);
  doc.text(`Generado: ${new Date().toLocaleString("es-AR")}  •  TuOrden v0.2.0`, 14, 33);

  let y = 38;

  // Title + subtitle
  doc.setTextColor(zincDark.r, zincDark.g, zincDark.b);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text("Resumen del período", 14, y);
  y += 4;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(zincMid.r, zincMid.g, zincMid.b);
  const marginPct = report.totalSales > 0 ? ((report.totalProfit / report.totalSales) * 100).toFixed(1) : "0";
  doc.text(
    `${report.countSales} transacciones  •  ${report.totalItems} artículos  •  Margen ${marginPct}%`,
    14,
    y,
  );
  y += 6;

  // Stats cards as table (2 cols per row visually via autotable 2-col table? We'll do a 4-row 2-col table: Concepto | Valor)
  const resumenRows = [
    ["Ventas totales", fmtMoney(report.totalSales)],
    ["Inversión", fmtMoney(report.totalInvestment)],
    ["Ganancia", fmtMoney(report.totalProfit)],
    ["Ticket promedio", fmtMoney(report.avgTicket)],
    ["Transacciones", String(report.countSales)],
    ["Artículos vendidos", fmtQty(report.totalItems)],
  ];

  autoTable(doc, {
    startY: y,
    head: [["Concepto", "Valor"]],
    body: resumenRows,
    theme: "grid",
    headStyles: { fillColor: [16, 185, 129], textColor: 255, fontStyle: "bold", fontSize: 8 },
    bodyStyles: { fontSize: 8, textColor: [39, 39, 42] },
    columnStyles: {
      0: { cellWidth: 60, fontStyle: "bold", fillColor: [244, 244, 245] },
      1: { cellWidth: 40, halign: "right" },
    },
    margin: { left: 14, right: pageW - 14 - 100 }, // narrow left table
    tableWidth: 100,
    styles: { cellPadding: 2.5, lineColor: [228, 228, 231], lineWidth: 0.2 },
  });

  // Keep y for next section
  // @ts-ignore
  const afterResumenY = (doc as any).lastAutoTable.finalY + 8;
  y = afterResumenY;

  // Ventas por día
  if (report.byDay.length > 0) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(zincDark.r, zincDark.g, zincDark.b);
    doc.text("Ventas por día", 14, y);
    y += 4;

    const dayRows = report.byDay.map((d) => [
      d.date,
      fmtMoney(d.total),
      String(d.count),
      d.count > 0 ? fmtMoney(d.total / d.count) : "-",
    ]);

    autoTable(doc, {
      startY: y,
      head: [["Fecha", "Total", "Ventas", "Ticket prom."]],
      body: dayRows,
      theme: "striped",
      headStyles: { fillColor: [39, 39, 42], textColor: 255, fontSize: 8 },
      bodyStyles: { fontSize: 7.5 },
      columnStyles: {
        0: { halign: "left" },
        1: { halign: "right" },
        2: { halign: "center" },
        3: { halign: "right" },
      },
      margin: { left: 14, right: 14 },
      styles: { cellPadding: 2, lineWidth: 0.1, lineColor: [228, 228, 231] },
      didDrawPage: (data) => {
        // footer on each page where this table draws
        addFooter(data.doc);
      },
    });
    // @ts-ignore
    y = (doc as any).lastAutoTable.finalY + 8;
    if (y > pageH - 20) {
      doc.addPage();
      y = 14;
    }
  } else {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(8);
    doc.setTextColor(zincMid.r, zincMid.g, zincMid.b);
    doc.text("Sin ventas por día en este período.", 14, y);
    y += 8;
  }

  // Productos vendidos
  if (y > pageH - 40) {
    doc.addPage();
    y = 14;
  }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(zincDark.r, zincDark.g, zincDark.b);
  doc.text("Productos vendidos", 14, y);
  y += 4;

  if (report.byProduct.length === 0) {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(8);
    doc.setTextColor(zincMid.r, zincMid.g, zincMid.b);
    doc.text("Sin productos vendidos en este período.", 14, y);
    y += 8;
  } else {
    const prodRows = report.byProduct.map((p) => [
      p.name,
      fmtQty(p.qty),
      fmtMoney(p.total),
      fmtMoney(p.profit),
    ]);

    autoTable(doc, {
      startY: y,
      head: [["Producto", "Cant.", "Total", "Ganancia"]],
      body: prodRows,
      theme: "striped",
      headStyles: { fillColor: [16, 185, 129], textColor: 24, fontStyle: "bold", fontSize: 8 },
      bodyStyles: { fontSize: 7.5 },
      columnStyles: {
        0: { cellWidth: 80, halign: "left" },
        1: { halign: "center", cellWidth: 20 },
        2: { halign: "right", cellWidth: 30 },
        3: { halign: "right", cellWidth: 30 },
      },
      margin: { left: 14, right: 14 },
      styles: { cellPadding: 2, lineWidth: 0.1, lineColor: [228, 228, 231] },
      didDrawPage: (data) => addFooter(data.doc),
    });
    // @ts-ignore
    y = (doc as any).lastAutoTable.finalY + 8;
    if (y > pageH - 30) {
      doc.addPage();
      y = 14;
    }
  }

  // Métodos de pago
  if (y > pageH - 40) {
    doc.addPage();
    y = 14;
  }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(zincDark.r, zincDark.g, zincDark.b);
  doc.text("Métodos de pago", 14, y);
  y += 4;

  if (report.byPayment.length === 0) {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(8);
    doc.setTextColor(zincMid.r, zincMid.g, zincMid.b);
    doc.text("Sin datos de pago.", 14, y);
    y += 8;
  } else {
    const payRows = report.byPayment.map((p) => [
      paymentLabel(p.method),
      String(p.count),
      fmtMoney(p.total),
      p.count > 0 ? fmtMoney(p.total / p.count) : "-",
    ]);

    autoTable(doc, {
      startY: y,
      head: [["Método", "Ventas", "Total", "Ticket prom."]],
      body: payRows,
      theme: "grid",
      headStyles: { fillColor: [39, 39, 42], textColor: 255, fontSize: 8 },
      bodyStyles: { fontSize: 7.5 },
      columnStyles: {
        0: { halign: "left" },
        1: { halign: "center" },
        2: { halign: "right" },
        3: { halign: "right" },
      },
      margin: { left: 14, right: 14 },
      styles: { cellPadding: 2.5, lineWidth: 0.1, lineColor: [228, 228, 231] },
      didDrawPage: (data) => addFooter(data.doc),
    });
    // @ts-ignore
    y = (doc as any).lastAutoTable.finalY + 8;
  }

  // Final footer for all pages
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    addFooter(doc, i, totalPages);
  }

  // Add subtle watermark / branding at bottom of last page if not already footer
  return doc;

  function addFooter(d: jsPDF, page?: number, total?: number) {
    const p = page ?? (d as any).internal.getCurrentPageInfo?.().pageNumber ?? 1;
    const t = total ?? d.getNumberOfPages();
    const footerY = pageH - 8;
    d.setFont("helvetica", "normal");
    d.setFontSize(6.5);
    d.setTextColor(161, 161, 170);
    d.text(`TuOrden POS  •  Reporte ${from} → ${to}`, 14, footerY);
    const pageText = `Página ${p} de ${t}`;
    d.text(pageText, pageW - 14 - d.getTextWidth(pageText), footerY);
    // line above footer
    d.setDrawColor(228, 228, 231);
    d.setLineWidth(0.15);
    d.line(14, footerY - 4, pageW - 14, footerY - 4);
  }
}
