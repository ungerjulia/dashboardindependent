import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import * as recharts from "recharts";
import { jsPDF } from "jspdf";
import "jspdf-autotable";

const { AreaChart, Area, BarChart, Bar, ComposedChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } = recharts;

// ══════════════════════════════════════════════════════════════
//  PDF REPORT GENERATION
// ══════════════════════════════════════════════════════════════
function generateEmbarcadosPDF(data) {
  const doc = new jsPDF("landscape");
  const now = new Date();
  const monthName = data.currentMonthName;

  // Header
  doc.setFillColor(10, 14, 23);
  doc.rect(0, 0, 297, 30, "F");
  doc.setFontSize(18);
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.text("INDEPENDENT BRAZIL", 15, 15);
  doc.setFontSize(10);
  doc.setTextColor(150, 150, 150);
  doc.text(`Trading Desk • Processos Embarcados • ${monthName} ${now.getFullYear()}`, 15, 22);
  doc.setFontSize(9);
  doc.text(`Gerado em: ${now.toLocaleDateString("pt-BR")} ${now.toLocaleTimeString("pt-BR")}`, 250, 22);

  // Filter embarcado rows from LOB data
  const rows = data._rawCurrentMonth.filter(r => r.status.toLowerCase() === "embarcado");

  doc.setFontSize(12);
  doc.setTextColor(0, 0, 0);
  doc.text(`Total: ${rows.length} processos embarcados`, 15, 38);

  // Table
  doc.autoTable({
    startY: 42,
    head: [["Processo", "Resp. Operacional", "Trader", "Linha de Negócio", "Cliente", "Fornecedor", "ETD", "LOB (USD)"]],
    body: rows.map(r => [
      r.processo,
      r.responsavel,
      r.trader,
      r.linha,
      r.cliente ? r.cliente.substring(0, 30) : "",
      r.fornecedor ? r.fornecedor.substring(0, 30) : "",
      r.etd ? r.etd.toLocaleDateString("pt-BR") : "",
      `$ ${r.lob.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
    ]),
    styles: { fontSize: 8, cellPadding: 3, font: "helvetica" },
    headStyles: { fillColor: [10, 14, 23], textColor: [255, 255, 255], fontStyle: "bold", fontSize: 9 },
    alternateRowStyles: { fillColor: [240, 240, 245] },
    foot: [["", "", "", "", "", "", "TOTAL", `$ ${rows.reduce((s, r) => s + r.lob, 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`]],
    footStyles: { fillColor: [10, 14, 23], textColor: [0, 230, 118], fontStyle: "bold", fontSize: 10 },
  });

  // Footer
  const pageCount = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text(`Independent Brazil • Trading Desk • Página ${i}/${pageCount}`, 15, doc.internal.pageSize.height - 8);
  }

  doc.save(`IB_Embarcados_${monthName}_${now.getFullYear()}.pdf`);
}

function generateResumoMesPDF(data) {
  const doc = new jsPDF("landscape");
  const now = new Date();
  const monthName = data.currentMonthName;
  const d = data;

  // Header
  doc.setFillColor(10, 14, 23);
  doc.rect(0, 0, 297, 30, "F");
  doc.setFontSize(18);
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.text("INDEPENDENT BRAZIL", 15, 15);
  doc.setFontSize(10);
  doc.setTextColor(150, 150, 150);
  doc.text(`Trading Desk • Resumo Geral • ${monthName} ${now.getFullYear()}`, 15, 22);
  doc.setFontSize(9);
  doc.text(`Gerado em: ${now.toLocaleDateString("pt-BR")} ${now.toLocaleTimeString("pt-BR")}`, 250, 22);

  let y = 38;

  // KPIs
  doc.setFontSize(14);
  doc.setTextColor(0, 0, 0);
  doc.setFont("helvetica", "bold");
  doc.text("INDICADORES DO MÊS", 15, y);
  y += 8;
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  const fUSD = (v) => `$ ${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  doc.text(`LOB Mensal: ${fUSD(d.lobMesAtual)}  |  Meta: ${fUSD(d.metaMesAtual)}  |  Diferença: ${fUSD(d.lobMesAtual - d.metaMesAtual)}`, 15, y);
  y += 6;
  doc.text(`LOB Trimestral: ${fUSD(d.lobTrimestral)}  |  Meta: ${fUSD(d.metaTrimestral)}`, 15, y);
  y += 6;
  doc.text(`LOB Anual: ${fUSD(d.lobAnoTotal)}  |  Meta: ${fUSD(d.metaAnoTotal)}`, 15, y);
  y += 6;
  doc.text(`Processos no mês: ${d.totalOps}  |  Processos no ano: ${d.totalOpsAno}`, 15, y);
  y += 10;

  // Status breakdown
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text("STATUS DOS PROCESSOS", 15, y);
  y += 2;
  doc.autoTable({
    startY: y,
    head: [["Status", "Quantidade", "LOB (USD)"]],
    body: Object.entries(d.statusData).sort((a, b) => b[1].lob - a[1].lob).map(([status, sdata]) => [
      status, sdata.count.toString(), fUSD(sdata.lob),
    ]),
    styles: { fontSize: 9, cellPadding: 3 },
    headStyles: { fillColor: [10, 14, 23], textColor: [255, 255, 255], fontStyle: "bold" },
    margin: { left: 15, right: 150 },
  });

  y = doc.lastAutoTable.finalY + 10;

  // Trader ranking
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text("RANKING DE TRADERS", 15, y);
  y += 2;
  doc.autoTable({
    startY: y,
    head: [["#", "Trader", "LOB Mês (USD)", "Meta Mês", "% Atingido", "Processos"]],
    body: d.traderRanking.map((t, i) => [
      (i + 1).toString(), t.name, fUSD(t.lobMes), fUSD(t.metaMes), `${t.pctMes.toFixed(1)}%`, t.opsMes.toString(),
    ]),
    styles: { fontSize: 9, cellPadding: 3 },
    headStyles: { fillColor: [10, 14, 23], textColor: [255, 255, 255], fontStyle: "bold" },
  });

  y = doc.lastAutoTable.finalY + 10;

  // Linhas de negócio
  if (y > 170) { doc.addPage(); y = 20; }
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text("LINHAS DE NEGÓCIO", 15, y);
  y += 2;
  doc.autoTable({
    startY: y,
    head: [["Linha", "LOB Mês (USD)", "Meta Mês", "% Atingido", "LOB Ano", "Meta Ano", "% Ano"]],
    body: d.linhaRanking.map(l => [
      l.name, fUSD(l.lobMes), fUSD(l.metaMes), `${l.pctMes.toFixed(1)}%`, fUSD(l.lobAno), fUSD(l.metaAno), `${l.pctAno.toFixed(1)}%`,
    ]),
    styles: { fontSize: 9, cellPadding: 3 },
    headStyles: { fillColor: [10, 14, 23], textColor: [255, 255, 255], fontStyle: "bold" },
  });

  // All processes table
  doc.addPage();
  doc.setFillColor(10, 14, 23);
  doc.rect(0, 0, 297, 20, "F");
  doc.setFontSize(14);
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.text(`TODOS OS PROCESSOS — ${monthName.toUpperCase()} ${now.getFullYear()}`, 15, 13);

  const allRows = d._rawCurrentMonth;
  doc.autoTable({
    startY: 25,
    head: [["Processo", "Resp.", "Trader", "Linha", "Status", "Cliente", "ETD", "LOB (USD)"]],
    body: allRows.map(r => [
      r.processo, r.responsavel, r.trader, r.linha, r.status,
      r.cliente ? r.cliente.substring(0, 25) : "",
      r.etd ? r.etd.toLocaleDateString("pt-BR") : "",
      fUSD(r.lob),
    ]),
    styles: { fontSize: 7, cellPadding: 2, font: "helvetica" },
    headStyles: { fillColor: [10, 14, 23], textColor: [255, 255, 255], fontStyle: "bold", fontSize: 8 },
    alternateRowStyles: { fillColor: [240, 240, 245] },
    foot: [["", "", "", "", "", "", "TOTAL", fUSD(allRows.reduce((s, r) => s + r.lob, 0))]],
    footStyles: { fillColor: [10, 14, 23], textColor: [0, 230, 118], fontStyle: "bold", fontSize: 9 },
  });

  // Footer on all pages
  const pageCount = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text(`Independent Brazil • Trading Desk • Página ${i}/${pageCount}`, 15, doc.internal.pageSize.height - 8);
  }

  doc.save(`IB_Resumo_${monthName}_${now.getFullYear()}.pdf`);
}

// ══════════════════════════════════════════════════════════════
//  CONFIG
// ══════════════════════════════════════════════════════════════
const SHEET_ID = "1t4i_3MRtouTGNgdircWiJHouCfrQgUKRc1-XUwKjIQ4";
const CLIENT_ID = "954287281463-fcgcg4uuoi56thmev4d8qsj9gdk3gqli.apps.googleusercontent.com";
const API_KEY = "AIzaSyB9h4KWCNFYSZ8nzajsL2zll07jSyEGlvw";
const SCOPES = "https://www.googleapis.com/auth/spreadsheets.readonly";
const REFRESH_MS = 60000; // 1 minute
const MONTH_NAMES = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
const MONTH_SHORT = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
const FONT = "'Helvetica Neue', Helvetica, Arial, sans-serif";
const C = {
  bg: "#0a0e17", panel: "#111827", panelBorder: "#1e293b",
  green: "#00e676", red: "#ff1744", blue: "#2979ff",
  cyan: "#00e5ff", amber: "#ffab00", white: "#e2e8f0",
  muted: "#64748b", dimText: "#475569",
};

// ══════════════════════════════════════════════════════════════
//  GOOGLE SHEETS FETCH
// ══════════════════════════════════════════════════════════════
let _accessToken = null;

function setAccessToken(token) { _accessToken = token; }

async function fetchSheet(sheetName) {
  if (!_accessToken) throw new Error("Não autenticado com Google");
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(sheetName)}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${_accessToken}` }
  });
  if (res.status === 401) throw new Error("TOKEN_EXPIRED");
  if (!res.ok) throw new Error(`Erro ${res.status} ao buscar aba "${sheetName}"`);
  const json = await res.json();
  const rows = json.values;
  if (!rows || rows.length < 2) return [];
  const headers = rows[0];
  return rows.slice(1).map(row => {
    const obj = {};
    headers.forEach((h, i) => { obj[h] = row[i] || ""; });
    return obj;
  });
}

function parseCSV(text) {
  const lines = text.split("\n").filter(l => l.trim());
  if (lines.length < 2) return [];
  const headers = parseLine(lines[0]);
  return lines.slice(1).map(line => {
    const vals = parseLine(line);
    const obj = {};
    headers.forEach((h, i) => { obj[h] = vals[i] || ""; });
    return obj;
  });
}

function parseLine(line) {
  const result = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

function parseMoney(val) {
  if (!val) return 0;
  return parseFloat(val.replace(/[$R\s.]/g, "").replace(",", ".")) || 0;
}

function parseETD(val) {
  if (!val) return null;
  const parts = val.split("/");
  if (parts.length === 3) {
    const d = parseInt(parts[0]), m = parseInt(parts[1]) - 1, y = parseInt(parts[2]);
    return new Date(y, m, d);
  }
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d;
}

function fmtUSD(v) {
  if (Math.abs(v) >= 1e6) return `$ ${(v / 1e6).toFixed(2)}M`;
  if (Math.abs(v) >= 1e3) return `$ ${(v / 1e3).toFixed(1)}K`;
  return `$ ${v.toFixed(0)}`;
}

// ══════════════════════════════════════════════════════════════
//  DATA PROCESSING
// ══════════════════════════════════════════════════════════════
function processData(lob, metasTrader, metaLinha, metaGlobal, operacao, financial) {
  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();

  // Parse LOB rows
  // Map headers flexibly once
  const sampleKeys = lob.length > 0 ? Object.keys(lob[0]) : [];
  const headerMap = {};
  sampleKeys.forEach(k => {
    const lk = k.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[_\s]/g, "");
    if (lk.includes("numero") || lk.includes("processo") && !lk.includes("status")) headerMap.processo = k;
    if (lk.includes("responsavel") || lk.includes("operacional")) headerMap.responsavel = k;
    if (lk === "trader") headerMap.trader = k;
    if (lk.includes("linhadenegocio") || (lk.includes("linha") && lk.includes("negocio"))) headerMap.linha = k;
    if (lk.includes("status")) headerMap.status = k;
    if (lk === "cliente") headerMap.cliente = k;
    if (lk === "fornecedor") headerMap.fornecedor = k;
    if (lk === "produto") headerMap.produto = k;
    if (lk.includes("margem")) headerMap.margem = k;
    if (lk === "etd") headerMap.etd = k;
    if (lk === "lob") headerMap.lob = k;
    if (lk === "tipo") headerMap.tipo = k;
    if (lk === "pais" || lk === "país") headerMap.pais = k;
  });

  const rows = lob.map(r => {
    const etd = parseETD(r[headerMap.etd] || "");
    return {
      processo: r[headerMap.processo] || "",
      responsavel: r[headerMap.responsavel] || "",
      trader: (r[headerMap.trader] || "").trim(),
      linha: (r[headerMap.linha] || "").trim(),
      status: (r[headerMap.status] || "").trim(),
      cliente: r[headerMap.cliente] || "",
      fornecedor: r[headerMap.fornecedor] || "",
      produto: r[headerMap.produto] || "",
      margem: parseMoney(r[headerMap.margem] || "0"),
      etd,
      etdMonth: etd ? etd.getMonth() : -1,
      etdYear: etd ? etd.getFullYear() : -1,
      lob: parseMoney(r[headerMap.lob] || "0"),
      tipo: (() => { const t = (r[headerMap.tipo] || "").trim().toLowerCase(); if (t.startsWith("import")) return "IMPO"; if (t.startsWith("export")) return "EXPO"; return t.toUpperCase(); })(),
      pais: (r[headerMap.pais] || "").trim(),
    };
  });

  // Filter by current year
  const yearRows = rows.filter(r => r.etdYear === currentYear);

  // Monthly LOB — show from (currentMonth-1) to (currentMonth+2), split by embarcado
  const chartStart = Math.max(0, currentMonth - 1);
  const chartEnd = Math.min(11, currentMonth + 2);
  const monthlyLOB = [];
  for (let i = chartStart; i <= chartEnd; i++) {
    const monthRows = yearRows.filter(r => r.etdMonth === i);
    const lobEmbarcado = monthRows.filter(r => r.status.toLowerCase() === "embarcado").reduce((s, r) => s + r.lob, 0);
    const lobOutros = monthRows.filter(r => r.status.toLowerCase() !== "embarcado").reduce((s, r) => s + r.lob, 0);
    monthlyLOB.push({ month: MONTH_SHORT[i], monthIndex: i, embarcado: lobEmbarcado, outros: lobOutros, lob: lobEmbarcado + lobOutros });
  }

  // LOB by trader for current month
  const currentMonthRows = yearRows.filter(r => r.etdMonth === currentMonth);
  const traderMap = {};
  yearRows.forEach(r => {
    if (!r.trader) return;
    if (!traderMap[r.trader]) traderMap[r.trader] = { name: r.trader, lobMes: 0, lobAno: 0, ops: 0, opsMes: 0 };
    traderMap[r.trader].lobAno += r.lob;
    traderMap[r.trader].ops += 1;
  });
  currentMonthRows.forEach(r => {
    if (!r.trader) return;
    if (!traderMap[r.trader]) traderMap[r.trader] = { name: r.trader, lobMes: 0, lobAno: 0, ops: 0, opsMes: 0 };
    traderMap[r.trader].lobMes += r.lob;
    traderMap[r.trader].opsMes += 1;
  });

  // Parse Metas_Trader
  const traderMetas = {};
  metasTrader.forEach(r => {
    const keys = Object.keys(r);
    const nameKey = keys.find(k => k.toLowerCase().includes("trader")) || keys[0];
    const name = (r[nameKey] || "").trim();
    const currentMonthName = MONTH_NAMES[currentMonth];
    const normalizedMonth = currentMonthName.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    let monthKey = keys.find(k => k.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim() === normalizedMonth);
    if (!monthKey) monthKey = keys.find(k => k.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim().startsWith(normalizedMonth.substring(0, 3)));
    const metaMes = parseMoney(monthKey ? (r[monthKey] || "0") : "0");
    const totalKey = keys.find(k => k.toLowerCase().trim() === "total") || keys.find(k => k.toLowerCase().includes("total"));
    const metaAno = parseMoney(totalKey ? (r[totalKey] || "0") : "0");
    if (name) traderMetas[name] = { metaMes, metaAno };
  });

  const findTraderMeta = (traderName) => {
    if (traderMetas[traderName]) return traderMetas[traderName];
    const norm = traderName.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
    for (const [k, v] of Object.entries(traderMetas)) {
      const nk = k.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
      if (nk === norm || nk.includes(norm) || norm.includes(nk)) return v;
    }
    return { metaMes: 0, metaAno: 0 };
  };

  // Get known trader names from metas sheet
  const knownTraderNames = new Set(Object.keys(traderMetas).map(n => n.toLowerCase().trim()));

  const traderRanking = Object.values(traderMap)
    .filter(t => {
      // Exclude entries that are linha de negocio names, not traders
      const tn = t.name.toLowerCase().trim();
      // If we have known traders, only include those; otherwise include all
      if (knownTraderNames.size > 0) {
        return knownTraderNames.has(tn) || Object.keys(traderMetas).some(k => 
          k.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim() === 
          tn.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim()
        );
      }
      return true;
    })
    .map(t => {
      const meta = findTraderMeta(t.name);
      return {
        ...t,
        metaMes: meta.metaMes,
        metaAno: meta.metaAno,
        pctMes: meta.metaMes ? (t.lobMes / meta.metaMes * 100) : 0,
        pctAno: meta.metaAno ? (t.lobAno / meta.metaAno * 100) : 0,
      };
    }).sort((a, b) => b.lobMes - a.lobMes);

  // LOB by Linha de Negócio
  const linhaMap = {};
  yearRows.forEach(r => {
    if (!r.linha) return;
    if (!linhaMap[r.linha]) linhaMap[r.linha] = { name: r.linha, lobMes: 0, lobAno: 0, ops: 0 };
    linhaMap[r.linha].lobAno += r.lob;
    linhaMap[r.linha].ops += 1;
  });
  currentMonthRows.forEach(r => {
    if (!r.linha) return;
    if (!linhaMap[r.linha]) linhaMap[r.linha] = { name: r.linha, lobMes: 0, lobAno: 0, ops: 0 };
    linhaMap[r.linha].lobMes += r.lob;
  });

  const linhaMetas = {};
  metaLinha.forEach(r => {
    const keys = Object.keys(r);
    const nameKey = keys.find(k => k.toLowerCase().replace(/[_\s]/g, "").includes("linha")) || keys[0];
    const name = (r[nameKey] || "").trim();
    // Find month column - try exact match first, then partial
    const currentMonthName = MONTH_NAMES[currentMonth];
    const normalizedMonth = currentMonthName.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    let monthKey = keys.find(k => k.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim() === normalizedMonth);
    if (!monthKey) monthKey = keys.find(k => k.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim().startsWith(normalizedMonth.substring(0, 3)));
    if (!monthKey) monthKey = keys.find(k => normalizedMonth.startsWith(k.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim().substring(0, 3)));
    const metaMes = parseMoney(monthKey ? (r[monthKey] || "0") : "0");
    const totalKey = keys.find(k => k.toLowerCase().trim() === "total") || keys.find(k => k.toLowerCase().includes("total"));
    const metaAno = parseMoney(totalKey ? (r[totalKey] || "0") : "0");
    if (name) linhaMetas[name] = { metaMes, metaAno };
    console.log("Meta Linha:", name, "MonthKey:", monthKey, "MetaMes:", metaMes, "MetaAno:", metaAno, "Keys:", keys);
  });

  // Helper to match linha names flexibly
  const findLinhaMeta = (linhaName) => {
    if (linhaMetas[linhaName]) return linhaMetas[linhaName];
    const norm = linhaName.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
    for (const [k, v] of Object.entries(linhaMetas)) {
      const nk = k.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
      if (nk === norm || nk.includes(norm) || norm.includes(nk)) return v;
    }
    return { metaMes: 0, metaAno: 0 };
  };

  const linhaRanking = Object.values(linhaMap).map(l => {
    const meta = findLinhaMeta(l.name);
    return {
      ...l,
      metaMes: meta.metaMes,
      metaAno: meta.metaAno,
      pctMes: meta.metaMes ? (l.lobMes / meta.metaMes * 100) : 0,
      pctAno: meta.metaAno ? (l.lobAno / meta.metaAno * 100) : 0,
    };
  }).sort((a, b) => b.lobAno - a.lobAno);

  // Meta Global
  const globalMetas = {};
  metaGlobal.forEach(r => {
    // Try multiple possible column names
    const keys = Object.keys(r);
    const mesKey = keys.find(k => k.trim().toLowerCase().startsWith("m") && k.trim().length < 10) || keys[0];
    const metaKey = keys.find(k => k.trim().toLowerCase().includes("meta")) || keys[1];
    const mes = (r[mesKey] || "").trim();
    const val = parseMoney(r[metaKey] || "0");
    if (mes) globalMetas[mes] = val;
  });

  // Also try matching month names with accents removed
  const matchMeta = (monthName) => {
    if (globalMetas[monthName]) return globalMetas[monthName];
    const normalized = monthName.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    for (const [k, v] of Object.entries(globalMetas)) {
      const nk = k.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
      if (nk === normalized) return v;
    }
    return 0;
  };

  const lobMesAtual = currentMonthRows.reduce((s, r) => s + r.lob, 0);
  const metaMesAtual = matchMeta(MONTH_NAMES[currentMonth]);
  const lobAnoTotal = yearRows.reduce((s, r) => s + r.lob, 0);
  const metaAnoTotal = MONTH_NAMES.reduce((s, m) => s + matchMeta(m), 0);

  // Trimestral
  const qStart = Math.floor(currentMonth / 3) * 3;
  const lobTrimestral = yearRows.filter(r => r.etdMonth >= qStart && r.etdMonth <= currentMonth).reduce((s, r) => s + r.lob, 0);
  const metaTrimestral = MONTH_NAMES.slice(qStart, qStart + 3).reduce((s, m) => s + matchMeta(m), 0);

  // Status count with LOB
  const statusData = {};
  currentMonthRows.forEach(r => {
    if (!r.status) return;
    if (!statusData[r.status]) statusData[r.status] = { count: 0, lob: 0 };
    statusData[r.status].count += 1;
    statusData[r.status].lob += r.lob;
  });

  // Monthly LOB with meta for chart
  const monthlyWithMeta = monthlyLOB.map(m => ({
    ...m,
    meta: matchMeta(MONTH_NAMES[m.monthIndex]),
  }));

  // Top/Bottom margins for current month
  const margensDoMes = currentMonthRows
    .filter(r => r.margem > 0 && r.processo)
    .map(r => ({ processo: r.processo, cliente: r.cliente, produto: r.produto, trader: r.trader, linha: r.linha, margem: r.margem, lob: r.lob }));
  const topMargens = [...margensDoMes].sort((a, b) => b.margem - a.margem).slice(0, 3);
  const bottomMargens = [...margensDoMes].sort((a, b) => a.margem - b.margem).slice(0, 3);

  // Products per linha for pizza charts (current month)
  const produtosPorLinha = {};
  currentMonthRows.forEach(r => {
    if (!r.linha || !r.produto) return;
    if (!produtosPorLinha[r.linha]) produtosPorLinha[r.linha] = {};
    if (!produtosPorLinha[r.linha][r.produto]) produtosPorLinha[r.linha][r.produto] = { count: 0, lob: 0 };
    produtosPorLinha[r.linha][r.produto].count += 1;
    produtosPorLinha[r.linha][r.produto].lob += r.lob;
  });

  // Globe data — countries for current month
  const paisData = {};
  currentMonthRows.forEach(r => {
    if (!r.pais) return;
    const paisNorm = r.pais.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
    if (paisNorm === "brasil" || paisNorm === "brazil") return;
    const key = `${r.pais}|${r.tipo}`;
    if (!paisData[key]) paisData[key] = { pais: r.pais, tipo: r.tipo, lob: 0, count: 0 };
    paisData[key].lob += r.lob;
    paisData[key].count += 1;
  });
  const globeData = Object.values(paisData).sort((a, b) => b.lob - a.lob);

  // ── Operational Analysis ──
  // ETD Pontualidade: full month (01 to last day)
  const etdStart = new Date(currentYear, currentMonth, 1);
  const etdEnd = new Date(currentYear, currentMonth + 1, 0); // last day of current month
  // Envio Documentos: 26 of prev month to 25 of current month
  const docStart = new Date(currentYear, currentMonth - 1, 26);
  const docEnd = new Date(currentYear, currentMonth, 25);

  // Parse operação rows
  const opParsed = (operacao || []).map(r => {
    const keys = Object.keys(r);
    const processoKey = keys.find(k => k.toLowerCase().replace(/[_\s]/g, "").includes("numero")) || keys[0];
    const responsavelKey = keys.find(k => k.toLowerCase().replace(/[_\s]/g, "").includes("responsavel")) || keys[1];
    const traderKey = keys.find(k => k.toLowerCase() === "trader") || keys[2];
    const etdInicialKey = keys.find(k => k.toLowerCase().replace(/[_\s]/g, "").includes("etdinicial") || k.toLowerCase().replace(/[_\s]/g, "").includes("inicial")) || keys[3];
    const etdKey = keys.find(k => { const lk = k.toLowerCase().replace(/[_\s]/g, ""); return lk === "etd"; }) || keys[4];
    const envioKey = keys.find(k => k.toLowerCase().replace(/[_\s]/g, "").includes("envio") || k.toLowerCase().replace(/[_\s]/g, "").includes("documento")) || keys[5];
    return {
      processo: (r[processoKey] || "").trim(),
      responsavel: (r[responsavelKey] || "").trim(),
      trader: (r[traderKey] || "").trim(),
      etdInicial: parseETD(r[etdInicialKey] || ""),
      etd: parseETD(r[etdKey] || ""),
      envioDoc: parseETD(r[envioKey] || ""),
    };
  });

  // Filter for ETD Pontualidade: full month
  const etdFiltered = opParsed.filter(r => r.etd && r.etd >= etdStart && r.etd <= etdEnd);

  // Filter for Doc analysis: 26-25 period
  const docFiltered = opParsed.filter(r => r.etd && r.etd >= docStart && r.etd <= docEnd);

  // Analysis 1: ETD Pontualidade (ETD inicial vs ETD real) — full month
  const etdAnalysis = { noPrazo: 0, antecipado: 0, atrasado: 0, semDados: 0, total: etdFiltered.length };
  etdFiltered.forEach(r => {
    if (!r.etdInicial || !r.etd) { etdAnalysis.semDados++; return; }
    const diffDays = Math.round((r.etd - r.etdInicial) / (1000 * 60 * 60 * 24));
    if (diffDays === 0) etdAnalysis.noPrazo++;
    else if (diffDays < 0) etdAnalysis.antecipado++;
    else etdAnalysis.atrasado++;
  });

  // Analysis 2: Envio de Documentos (ETD vs Envio, prazo 15 dias) — 26 to 25 period
  const docAnalysis = { noPrazo: 0, antecipado: 0, atrasado: 0, semDados: 0, total: docFiltered.length };
  docFiltered.forEach(r => {
    if (!r.etd || !r.envioDoc) { docAnalysis.semDados++; return; }
    const diffDays = Math.round((r.envioDoc - r.etd) / (1000 * 60 * 60 * 24));
    if (diffDays <= 15 && diffDays >= 0) docAnalysis.noPrazo++;
    else if (diffDays < 0) docAnalysis.antecipado++;
    else docAnalysis.atrasado++;
  });

  const etdPeriod = `01/${(currentMonth+1).toString().padStart(2,"0")} a ${etdEnd.getDate()}/${(currentMonth+1).toString().padStart(2,"0")}`;
  const docPeriod = `${docStart.getDate().toString().padStart(2,"0")}/${(docStart.getMonth()+1).toString().padStart(2,"0")} a ${docEnd.getDate().toString().padStart(2,"0")}/${(docEnd.getMonth()+1).toString().padStart(2,"0")}`;

  const operationalData = {
    etdPeriod,
    docPeriod,
    etdAnalysis,
    docAnalysis,
    totalEtd: etdFiltered.length,
    totalDoc: docFiltered.length,
  };

  return {
    monthlyLOB: monthlyWithMeta,
    traderRanking,
    linhaRanking,
    lobMesAtual, metaMesAtual,
    lobTrimestral, metaTrimestral,
    lobAnoTotal, metaAnoTotal,
    totalOps: currentMonthRows.length,
    totalOpsAno: yearRows.length,
    statusData,
    topMargens,
    bottomMargens,
    produtosPorLinha,
    globeData,
    operationalData,

    // ── Financial Analysis ──
    financialData: (() => {
      const finRows = (financial || []).map(r => {
        const keys = Object.keys(r);
        const findK = (s) => keys.find(k => k.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[_\s]/g, "").includes(s)) || "";
        const processoKey = findK("numero") || findK("processo") || keys[0];
        const traderKey = keys.find(k => k.toLowerCase() === "trader") || findK("trader") || keys[1];
        const etdKey = keys.find(k => { const lk = k.toLowerCase().replace(/[_\s]/g, ""); return lk === "etd"; }) || findK("etd") || keys[2];
        const fornecedorKey = findK("fornecedor") || keys[3];
        const clienteKey = findK("cliente") || keys[4];
        const pgtoKey = findK("pgtofornecedor") || findK("prazo_pgto") || findK("pgto") || keys[5];
        const recebKey = findK("recebimentocliente") || findK("prazo_recebimento") || findK("recebimento") || keys[6];
        const cicloKey = findK("ciclofinanceiro") || findK("ciclo") || keys[7];
        const etd = parseETD(r[etdKey] || "");
        const pgto = parseFloat((r[pgtoKey] || "").toString().replace(/[^\d.-]/g, "")) || 0;
        const receb = parseFloat((r[recebKey] || "").toString().replace(/[^\d.-]/g, "")) || 0;
        const ciclo = parseFloat((r[cicloKey] || "").toString().replace(/[^\d.-]/g, "")) || 0;
        return {
          processo: (r[processoKey] || "").trim(),
          trader: (r[traderKey] || "").trim(),
          etd,
          etdYear: etd ? etd.getFullYear() : -1,
          fornecedor: (r[fornecedorKey] || "").trim(),
          cliente: (r[clienteKey] || "").trim(),
          pgto, receb, ciclo,
          complete: pgto !== 0 && receb !== 0 && ciclo !== 0,
        };
      });

      // Filter: current year + all 3 columns filled
      const valid = finRows.filter(r => r.etdYear === currentYear && r.complete);
      if (valid.length === 0) return { cicloMedio: 0, total: 0, byTrader: [], topClientes: [], worstClientes: [], topFornecedores: [], worstFornecedores: [], monthlyCiclo: [] };

      const cicloMedio = valid.reduce((s, r) => s + r.ciclo, 0) / valid.length;

      // By Trader
      const traderMap = {};
      valid.forEach(r => {
        if (!r.trader) return;
        if (!traderMap[r.trader]) traderMap[r.trader] = { name: r.trader, totalCiclo: 0, count: 0 };
        traderMap[r.trader].totalCiclo += r.ciclo;
        traderMap[r.trader].count += 1;
      });
      const byTrader = Object.values(traderMap).map(t => ({ ...t, media: t.totalCiclo / t.count })).sort((a, b) => a.media - b.media);

      // By Cliente — using column G (Prazo_recebimento_cliente), lower/negative = better
      const clienteMap = {};
      valid.forEach(r => {
        if (!r.cliente) return;
        if (!clienteMap[r.cliente]) clienteMap[r.cliente] = { name: r.cliente, totalVal: 0, count: 0 };
        clienteMap[r.cliente].totalVal += r.receb;
        clienteMap[r.cliente].count += 1;
      });
      const allClientes = Object.values(clienteMap).map(c => ({ ...c, media: c.totalVal / c.count })).sort((a, b) => a.media - b.media);
      const topClientes = allClientes.slice(0, 3);
      const worstClientes = allClientes.slice(-3).reverse();

      // By Fornecedor — using column F (Prazo_pgto_fornecedor), higher/more positive = better
      const fornMap = {};
      valid.forEach(r => {
        if (!r.fornecedor) return;
        if (!fornMap[r.fornecedor]) fornMap[r.fornecedor] = { name: r.fornecedor, totalVal: 0, count: 0 };
        fornMap[r.fornecedor].totalVal += r.pgto;
        fornMap[r.fornecedor].count += 1;
      });
      const allForn = Object.values(fornMap).map(f => ({ ...f, media: f.totalVal / f.count })).sort((a, b) => b.media - a.media);
      const topFornecedores = allForn.slice(0, 3);
      const worstFornecedores = allForn.slice(-3).reverse();

      // Monthly ciclo average (column H) by ETD month
      const monthlyCiclo = [];
      for (let m = 0; m <= currentMonth; m++) {
        const monthRows = valid.filter(r => r.etd && r.etd.getMonth() === m);
        if (monthRows.length > 0) {
          const avg = monthRows.reduce((s, r) => s + r.ciclo, 0) / monthRows.length;
          monthlyCiclo.push({ month: MONTH_SHORT[m], monthFull: MONTH_NAMES[m], media: avg, count: monthRows.length });
        }
      }

      return { cicloMedio, total: valid.length, byTrader, topClientes, worstClientes, topFornecedores, worstFornecedores, monthlyCiclo };
    })(),

    currentMonthName: MONTH_NAMES[currentMonth],
    _rawCurrentMonth: currentMonthRows,
  };
}

// ══════════════════════════════════════════════════════════════
//  UI COMPONENTS
// ══════════════════════════════════════════════════════════════

function Panel({ title, children, style, icon }) {
  return (
    <div style={{ background: C.panel, border: `1px solid ${C.panelBorder}`, borderRadius: 8, padding: "14px 18px", display: "flex", flexDirection: "column", gap: 10, ...style }}>
      {title && (
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {icon && <span style={{ fontSize: 14 }}>{icon}</span>}
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.5, textTransform: "uppercase", color: "#fff", fontFamily: FONT }}>{title}</span>
        </div>
      )}
      {children}
    </div>
  );
}

function GaugeChart({ value, max, period, color }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 150) : 0;
  const displayPct = max > 0 ? (value / max) * 100 : 0;
  const remaining = max - value;
  const arcPct = Math.min(pct, 100);
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, flex: 1, minWidth: 120 }}>
      <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.2, color: "#fff", textTransform: "uppercase", fontFamily: FONT }}>{period}</span>
      <div style={{ position: "relative", width: 120, height: 75 }}>
        <svg viewBox="0 0 120 75" style={{ width: "100%", height: "100%" }}>
          <path d="M 10 65 A 50 50 0 0 1 110 65" fill="none" stroke={C.panelBorder} strokeWidth="8" strokeLinecap="round" />
          <path d="M 10 65 A 50 50 0 0 1 110 65" fill="none" stroke={displayPct >= 100 ? C.green : color} strokeWidth="8" strokeLinecap="round" strokeDasharray={`${(arcPct / 100) * 157} 157`} style={{ filter: `drop-shadow(0 0 6px ${color}60)`, transition: "stroke-dasharray 1s ease" }} />
        </svg>
        <div style={{ position: "absolute", top: "45%", left: "50%", transform: "translate(-50%, -10%)", textAlign: "center" }}>
          <div style={{ fontSize: 20, fontWeight: 800, color: displayPct >= 100 ? C.green : "#fff", fontFamily: FONT, lineHeight: 1 }}>{displayPct.toFixed(1)}%</div>
        </div>
      </div>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 12, color: "#fff", fontWeight: 700, fontFamily: FONT }}>{fmtUSD(value)}</div>
        <div style={{ fontSize: 10, color: "#fff", fontFamily: FONT, opacity: 0.7 }}>
          {remaining > 0 ? <>Faltam <span style={{ color: C.amber, fontWeight: 700, opacity: 1 }}>{fmtUSD(remaining)}</span></> : <span style={{ color: C.green, fontWeight: 700, opacity: 1 }}>Meta batida! +{fmtUSD(Math.abs(remaining))}</span>}
        </div>
      </div>
    </div>
  );
}

function KPICard({ label, value, meta, icon, color }) {
  return (
    <div style={{ background: `linear-gradient(135deg, ${C.panel}, ${color}08)`, border: `1px solid ${C.panelBorder}`, borderRadius: 8, padding: "14px 16px", flex: 1, minWidth: 140, position: "relative", overflow: "hidden" }}>
      <div style={{ position: "absolute", top: -10, right: -10, fontSize: 50, opacity: 0.04, color }}>{icon}</div>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.2, color: C.white, textTransform: "uppercase", fontFamily: FONT, marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color: "#fff", fontFamily: FONT, marginBottom: 4 }}>{value}</div>
      {meta && <div style={{ fontSize: 13, color: C.green, fontWeight: 700, fontFamily: FONT }}>Meta: {meta}</div>}
    </div>
  );
}

function TraderRow({ rank, t, maxLob, viewMode }) {
  const lobVal = viewMode === "ano" ? t.lobAno : t.lobMes;
  const metaVal = viewMode === "ano" ? t.metaAno : t.metaMes;
  const pctVal = viewMode === "ano" ? t.pctAno : t.pctMes;
  const barW = maxLob > 0 ? (lobVal / maxLob) * 100 : 0;
  const medals = ["🥇", "🥈", "🥉"];
  const avatar = t.name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: 6, background: rank === 0 ? `${C.green}08` : "transparent", borderLeft: rank < 3 ? `3px solid ${[C.green, C.cyan, C.amber][rank]}` : "3px solid transparent" }}>
      <span style={{ fontSize: 16, width: 24, textAlign: "center" }}>
        {rank < 3 ? medals[rank] : <span style={{ color: C.dimText, fontSize: 13, fontWeight: 700, fontFamily: FONT }}>{rank + 1}</span>}
      </span>
      <div style={{ width: 32, height: 32, borderRadius: "50%", background: `linear-gradient(135deg, ${C.blue}, ${C.cyan})`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800, color: "#fff", flexShrink: 0 }}>{avatar}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 3 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: C.white, fontFamily: FONT }}>{t.name}</span>
          <span style={{ fontSize: 13, fontWeight: 800, color: C.white, fontFamily: FONT, flexShrink: 0 }}>{fmtUSD(lobVal)}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ flex: 1, height: 4, background: C.panelBorder, borderRadius: 2, overflow: "hidden" }}>
            <div style={{ width: `${Math.min(barW, 100)}%`, height: "100%", background: `linear-gradient(90deg, ${C.blue}, ${C.cyan})`, borderRadius: 2, transition: "width 1s ease" }} />
          </div>
          <span style={{ fontSize: 10, color: pctVal >= 100 ? C.green : C.amber, fontWeight: 700, fontFamily: FONT, flexShrink: 0 }}>{pctVal.toFixed(0)}%</span>
          <span style={{ fontSize: 10, color: C.muted, fontFamily: FONT, flexShrink: 0 }}>{viewMode === "ano" ? t.ops : t.opsMes} proc.</span>
        </div>
      </div>
    </div>
  );
}

function LinhaRow({ l, viewMode }) {
  const lobVal = viewMode === "ano" ? l.lobAno : l.lobMes;
  const metaVal = viewMode === "ano" ? l.metaAno : l.metaMes;
  const pctVal = viewMode === "ano" ? l.pctAno : l.pctMes;
  const remaining = metaVal - lobVal;
  const colors = { "Import": C.blue, "Feed Meal": C.cyan, "Meat": C.red };
  const color = colors[l.name] || C.amber;
  return (
    <div style={{ background: `${color}10`, border: `1px solid ${color}30`, borderRadius: 8, padding: "12px 14px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <span style={{ fontSize: 14, fontWeight: 700, color: C.white, fontFamily: FONT }}>{l.name}</span>
        <span style={{ fontSize: 14, fontWeight: 800, color, fontFamily: FONT }}>{fmtUSD(lobVal)}</span>
      </div>
      <div style={{ height: 6, background: C.panelBorder, borderRadius: 3, overflow: "hidden", marginBottom: 6 }}>
        <div style={{ width: `${Math.min(pctVal, 100)}%`, height: "100%", background: color, borderRadius: 3, transition: "width 1s ease" }} />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: C.muted, fontFamily: FONT }}>
        <span>Meta: {fmtUSD(metaVal)}</span>
        <span style={{ color: pctVal >= 100 ? C.green : C.amber, fontWeight: 700 }}>{pctVal.toFixed(1)}%</span>
        <span>{remaining > 0 ? `Faltam ${fmtUSD(remaining)}` : "Batida!"}</span>
      </div>
    </div>
  );
}

function Clock() {
  const [time, setTime] = useState(new Date());
  useEffect(() => { const t = setInterval(() => setTime(new Date()), 1000); return () => clearInterval(t); }, []);
  return <span style={{ fontSize: 18, fontWeight: 800, color: C.white, fontFamily: FONT, letterSpacing: 2 }}>{time.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</span>;
}

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: "#1a2332ee", border: `1px solid ${C.panelBorder}`, borderRadius: 6, padding: "10px 14px" }}>
      <div style={{ fontSize: 11, color: C.muted, marginBottom: 6, fontWeight: 600, fontFamily: FONT }}>{label}</div>
      {payload.map((p, i) => <div key={i} style={{ fontSize: 12, color: p.color || C.white, fontWeight: 700, fontFamily: FONT, marginBottom: 2 }}>{p.name}: {fmtUSD(p.value)}</div>)}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
//  LOGIN SCREEN
// ══════════════════════════════════════════════════════════════
function LoginScreen({ onLogin }) {
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Load Google Identity Services
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    document.head.appendChild(script);
    return () => document.head.removeChild(script);
  }, []);

  const handleGoogleLogin = () => {
    setLoading(true);
    setError("");
    try {
      const client = window.google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: SCOPES,
        callback: (response) => {
          if (response.error) {
            setError("Erro na autenticação: " + response.error);
            setLoading(false);
            return;
          }
          setAccessToken(response.access_token);
          // Auto-refresh token before expiry
          const expiresIn = (response.expires_in - 60) * 1000;
          setInterval(() => {
            client.requestAccessToken({ prompt: "" });
          }, expiresIn);
          onLogin(true);
        },
      });
      client.requestAccessToken();
    } catch (e) {
      setError("Erro ao iniciar autenticação Google");
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", background: C.bg, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: FONT }}>
      <div style={{ background: C.panel, border: `1px solid ${C.panelBorder}`, borderRadius: 16, padding: "40px 36px", width: 380, textAlign: "center" }}>
        <div style={{ marginBottom: 8 }}>
          <svg viewBox="0 0 100 100" width="60" height="60" xmlns="http://www.w3.org/2000/svg">
            <rect x="2" y="2" width="96" height="96" fill="white" stroke="#111" strokeWidth="8"/>
            <text x="50" y="68" textAnchor="middle" fontFamily={FONT} fontSize="52" fontWeight="900" fill="#111">IB</text>
          </svg>
        </div>
        <div style={{ fontSize: 22, fontWeight: 900, color: C.white, marginBottom: 4 }}>INDEPENDENT BRAZIL</div>
        <div style={{ fontSize: 11, color: C.muted, letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 30 }}>Trading Desk</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {error && <div style={{ fontSize: 12, color: C.red, fontWeight: 600 }}>{error}</div>}
          <button onClick={handleGoogleLogin} disabled={loading} style={{ padding: "12px", fontSize: 14, fontWeight: 700, fontFamily: FONT, background: `linear-gradient(135deg, ${C.blue}, ${C.cyan})`, color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", letterSpacing: 0.5, opacity: loading ? 0.6 : 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
            {loading ? "Conectando..." : "Entrar com Google"}
          </button>
          <div style={{ fontSize: 11, color: C.dimText, marginTop: 4 }}>Use sua conta @independentbrazil.com</div>
        </div>
        <div style={{ fontSize: 10, color: C.dimText, marginTop: 20 }}>Acesso restrito • Independent Brazil © {new Date().getFullYear()}</div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
//  SETTINGS PANEL
// ══════════════════════════════════════════════════════════════
function SettingsPanel({ config, setConfig, onClose }) {
  const toggle = (key) => setConfig(prev => ({ ...prev, [key]: !prev[key] }));
  const toggleSlide = (idx) => setConfig(prev => {
    const newSlides = { ...prev.tvSlides };
    newSlides[idx] = !newSlides[idx];
    return { ...prev, tvSlides: newSlides };
  });
  const sections = [
    { key: "showKPIs", label: "KPIs Principais" },
    { key: "showChart", label: "Gráfico LOB Mensal" },
    { key: "showTraders", label: "Ranking de Traders" },
    { key: "showLinhas", label: "Linhas de Negócio" },
    { key: "showStatus", label: "Status dos Processos" },
  ];
  const views = [
    { key: "viewMode", value: "mes", label: "Visão Mensal" },
    { key: "viewMode", value: "ano", label: "Visão Anual" },
  ];
  const slideIcons = ["📊", "🏆", "🏷️", "📦", "🎯", "📈", "🥧", "🌍", "⚙️", "💰", "📅", "🏢"];

  return (
    <div style={{ position: "fixed", top: 0, right: 0, bottom: 0, width: 340, background: C.panel, borderLeft: `1px solid ${C.panelBorder}`, zIndex: 1000, padding: "20px", display: "flex", flexDirection: "column", gap: 14, overflowY: "auto", boxShadow: "-4px 0 20px rgba(0,0,0,0.5)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 16, fontWeight: 800, color: C.white, fontFamily: FONT }}>Configurações</span>
        <button onClick={onClose} style={{ background: "none", border: "none", color: C.muted, fontSize: 20, cursor: "pointer" }}>✕</button>
      </div>

      <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, letterSpacing: 1, textTransform: "uppercase", fontFamily: FONT }}>Seções do Dashboard</div>
      {sections.map(s => (
        <label key={s.key} style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
          <div onClick={() => toggle(s.key)} style={{ width: 40, height: 22, borderRadius: 11, background: config[s.key] ? C.green : C.panelBorder, position: "relative", transition: "background 0.3s", cursor: "pointer" }}>
            <div style={{ width: 18, height: 18, borderRadius: "50%", background: "#fff", position: "absolute", top: 2, left: config[s.key] ? 20 : 2, transition: "left 0.3s" }} />
          </div>
          <span style={{ fontSize: 13, color: C.white, fontFamily: FONT }}>{s.label}</span>
        </label>
      ))}

      <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, letterSpacing: 1, textTransform: "uppercase", fontFamily: FONT, marginTop: 8 }}>Visão dos Rankings</div>
      {views.map(v => (
        <label key={v.value} style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }} onClick={() => setConfig(prev => ({ ...prev, viewMode: v.value }))}>
          <div style={{ width: 18, height: 18, borderRadius: "50%", border: `2px solid ${config.viewMode === v.value ? C.cyan : C.panelBorder}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
            {config.viewMode === v.value && <div style={{ width: 10, height: 10, borderRadius: "50%", background: C.cyan }} />}
          </div>
          <span style={{ fontSize: 13, color: C.white, fontFamily: FONT }}>{v.label}</span>
        </label>
      ))}

      <div style={{ fontSize: 11, fontWeight: 700, color: C.cyan, letterSpacing: 1, textTransform: "uppercase", fontFamily: FONT, marginTop: 12 }}>📺 Slides do Modo TV</div>
      <div style={{ fontSize: 11, color: C.muted, fontFamily: FONT, marginBottom: 4 }}>Selecione quais visões aparecem no carrossel</div>
      {SLIDE_NAMES.map((name, i) => (
        <label key={i} style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }} onClick={() => toggleSlide(i)}>
          <div style={{ width: 22, height: 22, borderRadius: 4, border: `2px solid ${config.tvSlides[i] ? C.cyan : C.panelBorder}`, background: config.tvSlides[i] ? `${C.cyan}20` : "transparent", display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.2s" }}>
            {config.tvSlides[i] && <span style={{ color: C.cyan, fontSize: 14, fontWeight: 900 }}>✓</span>}
          </div>
          <span style={{ fontSize: 13 }}>{slideIcons[i] || "📄"}</span>
          <span style={{ fontSize: 13, color: config.tvSlides[i] ? "#fff" : C.muted, fontFamily: FONT }}>{name}</span>
        </label>
      ))}

      <div style={{ marginTop: "auto", paddingTop: 16, borderTop: `1px solid ${C.panelBorder}`, fontSize: 10, color: C.dimText, fontFamily: FONT }}>
        Dados atualizam a cada 1 minuto<br/>Planilha: Dashboard IB
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
//  CAROUSEL SLIDES
// ══════════════════════════════════════════════════════════════
const SLIDE_NAMES = ["Visão Geral", "Ranking de Traders", "Linhas de Negócio", "Status dos Processos", "Metas Globais", "Margens de Venda", "Produtos por Linha", "Operações Globais", "Análise Operacional", "Ciclo Financeiro", "Ciclo Mensal", "Prazos Clientes & Fornecedores"];
const SLIDE_INTERVAL = 20000;
const SLIDE_TIMES = { 7: 30000 }; // Slide 7 (Globe) = 30s, others = 20s

function SlideOverview({ d }) {
  // Custom label for bars showing total and difference vs meta
  const DiffLabel = (props) => {
    const { x, y, width, index } = props;
    if (!d.monthlyLOB[index]) return null;
    const item = d.monthlyLOB[index];
    const total = item.embarcado + item.outros;
    const meta = item.meta || 0;
    const diff = total - meta;
    if (total === 0) return null;
    return (
      <g>
        <text x={x + width / 2} y={y - 38} textAnchor="middle" fill="#fff" fontSize={14} fontWeight={800} fontFamily={FONT}>{fmtUSD(total)}</text>
        {meta > 0 && <text x={x + width / 2} y={y - 20} textAnchor="middle" fill={diff >= 0 ? C.green : C.red} fontSize={12} fontWeight={700} fontFamily={FONT}>{diff >= 0 ? "+" : ""}{fmtUSD(diff)}</text>}
      </g>
    );
  };
  // Custom dot for meta line showing value below the dot
  const MetaDot = (props) => {
    const { cx, cy, value } = props;
    if (!value) return null;
    return (
      <g>
        <circle cx={cx} cy={cy} r={5} fill={C.red} />
        <text x={cx} y={cy + 20} textAnchor="middle" fill={C.red} fontSize={11} fontWeight={700} fontFamily={FONT}>{fmtUSD(value)}</text>
      </g>
    );
  };
  // Current month status breakdown for CEO summary
  const totalMes = d.lobMesAtual;
  const metaMes = d.metaMesAtual;
  const diffMes = totalMes - metaMes;
  const statusEntries = Object.entries(d.statusData).sort((a, b) => b[1].lob - a[1].lob);
  const statusColors = { "Embarcado": "#fff", "Com Booking": C.cyan, "Sem Booking": C.amber, "Claim": C.red, "Stand by": C.muted };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, flex: 1, padding: "0 20px" }}>
      <div style={{ display: "flex", gap: 12 }}>
        <KPICard label={`LOB ${d.currentMonthName}`} value={fmtUSD(d.lobMesAtual)} meta={fmtUSD(d.metaMesAtual)} icon="💰" color={C.green} />
        <KPICard label="LOB Trimestral" value={fmtUSD(d.lobTrimestral)} meta={fmtUSD(d.metaTrimestral)} icon="📊" color={C.cyan} />
        <KPICard label="LOB Anual" value={fmtUSD(d.lobAnoTotal)} meta={fmtUSD(d.metaAnoTotal)} icon="🏆" color={C.amber} />
        <KPICard label="Processos do Mês" value={`${d.totalOps}`} meta={`Ano: ${d.totalOpsAno} processos`} icon="📋" color={C.blue} />
      </div>
      {/* CEO Summary — per status */}
      <div style={{ background: `linear-gradient(135deg, ${C.panel}, #1a2535)`, border: `1px solid ${C.panelBorder}`, borderRadius: 10, padding: "12px 24px", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, flexWrap: "wrap" }}>
        <span style={{ fontSize: 12, color: C.muted, fontFamily: FONT, fontWeight: 700, marginRight: 4 }}>{d.currentMonthName.toUpperCase()}</span>
        {statusEntries.map(([status, sdata], i) => {
          const sColor = statusColors[status] || C.blue;
          return (
            <div key={status} style={{ display: "flex", alignItems: "center", gap: 4 }}>
              {i > 0 && <span style={{ fontSize: 16, color: C.muted, fontWeight: 300, margin: "0 2px" }}>+</span>}
              <span style={{ fontSize: 11, color: C.muted, fontFamily: FONT }}>{status}:</span>
              <span style={{ fontSize: 16, fontWeight: 800, color: sColor, fontFamily: FONT }}>{fmtUSD(sdata.lob)}</span>
            </div>
          );
        })}
        <span style={{ fontSize: 18, color: C.muted, fontWeight: 300, margin: "0 4px" }}>=</span>
        <span style={{ fontSize: 11, color: C.muted, fontFamily: FONT }}>Total:</span>
        <span style={{ fontSize: 22, fontWeight: 900, color: C.cyan, fontFamily: FONT }}>{fmtUSD(totalMes)}</span>
        <div style={{ width: 2, height: 28, background: C.panelBorder, margin: "0 8px" }} />
        <span style={{ fontSize: 11, color: C.muted, fontFamily: FONT }}>Meta:</span>
        <span style={{ fontSize: 18, fontWeight: 800, color: C.red, fontFamily: FONT }}>{fmtUSD(metaMes)}</span>
        <div style={{ background: diffMes >= 0 ? `${C.green}20` : `${C.red}20`, border: `1px solid ${diffMes >= 0 ? C.green : C.red}40`, borderRadius: 8, padding: "4px 12px", marginLeft: 4 }}>
          <span style={{ fontSize: 18, fontWeight: 900, color: diffMes >= 0 ? C.green : C.red, fontFamily: FONT }}>{diffMes >= 0 ? "+" : ""}{fmtUSD(diffMes)} {diffMes >= 0 ? "✓" : "✗"}</span>
        </div>
      </div>
      <Panel title="LOB Mensal vs Meta" icon="📈" style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center" }}>
        <ResponsiveContainer width="100%" height={380}>
          <ComposedChart data={d.monthlyLOB} margin={{ top: 55, right: 20, left: 10, bottom: 10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={C.panelBorder} />
            <XAxis dataKey="month" tick={{ fontSize: 16, fill: "#fff", fontFamily: FONT, fontWeight: 600 }} tickLine={false} axisLine={{ stroke: C.panelBorder }} />
            <YAxis tick={{ fontSize: 12, fill: "#fff", fontFamily: FONT }} tickLine={false} axisLine={false} tickFormatter={fmtUSD} width={80} />
            <Tooltip content={<CustomTooltip />} />
            <Bar dataKey="embarcado" name="Embarcado" stackId="lob" fill="#ffffff" maxBarSize={50} />
            <Bar dataKey="outros" name="Outros Status" stackId="lob" fill="#4a5568" radius={[4, 4, 0, 0]} maxBarSize={50} label={<DiffLabel />} />
            <Line type="monotone" dataKey="meta" name="Meta" stroke={C.red} strokeWidth={3} dot={<MetaDot />} />
          </ComposedChart>
        </ResponsiveContainer>
        <div style={{ display: "flex", gap: 24, justifyContent: "center", marginTop: 4 }}>
          <span style={{ fontSize: 13, color: "#fff", display: "flex", alignItems: "center", gap: 6, fontFamily: FONT }}><span style={{ width: 14, height: 10, background: "#fff", borderRadius: 2, display: "inline-block" }} /> Embarcado (confirmado)</span>
          <span style={{ fontSize: 13, color: "#fff", display: "flex", alignItems: "center", gap: 6, fontFamily: FONT }}><span style={{ width: 14, height: 10, background: "#4a5568", borderRadius: 2, display: "inline-block" }} /> Outros Status (projetado)</span>
          <span style={{ fontSize: 13, color: "#fff", display: "flex", alignItems: "center", gap: 6, fontFamily: FONT }}><span style={{ width: 14, height: 4, background: C.red, borderRadius: 2, display: "inline-block" }} /> Meta</span>
        </div>
      </Panel>
    </div>
  );
}

function SlideTraders({ d }) {
  const maxLob = d.traderRanking.length > 0 ? Math.max(...d.traderRanking.map(t => t.lobMes)) : 1;
  return (
    <div style={{ flex: 1, padding: "0 40px", display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ fontSize: 28, fontWeight: 900, color: "#fff", fontFamily: FONT, textAlign: "center", marginBottom: 8 }}>🏆 RANKING DE TRADERS — {d.currentMonthName.toUpperCase()}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1, justifyContent: "center" }}>
        {d.traderRanking.map((t, i) => {
          const medals = ["🥇", "🥈", "🥉"];
          const avatar = t.name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
          const barW = maxLob > 0 ? (t.lobMes / maxLob) * 100 : 0;
          return (
            <div key={t.name} style={{ display: "flex", alignItems: "center", gap: 16, padding: "12px 16px", borderRadius: 10, background: i === 0 ? `${C.green}10` : "transparent", borderLeft: i < 3 ? `4px solid ${[C.green, C.cyan, C.amber][i]}` : "4px solid transparent" }}>
              <span style={{ fontSize: 28, width: 40, textAlign: "center" }}>{i < 3 ? medals[i] : <span style={{ color: C.dimText, fontSize: 20, fontWeight: 800 }}>{i + 1}</span>}</span>
              <div style={{ width: 48, height: 48, borderRadius: "50%", background: `linear-gradient(135deg, ${C.blue}, ${C.cyan})`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, fontWeight: 800, color: "#fff" }}>{avatar}</div>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                  <span style={{ fontSize: 20, fontWeight: 700, color: "#fff", fontFamily: FONT }}>{t.name}</span>
                  <span style={{ fontSize: 22, fontWeight: 900, color: "#fff", fontFamily: FONT }}>{fmtUSD(t.lobMes)}</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ flex: 1, height: 6, background: C.panelBorder, borderRadius: 3, overflow: "hidden" }}>
                    <div style={{ width: `${Math.min(barW, 100)}%`, height: "100%", background: `linear-gradient(90deg, ${C.blue}, ${C.cyan})`, borderRadius: 3 }} />
                  </div>
                  <span style={{ fontSize: 14, color: t.pctMes >= 100 ? C.green : C.amber, fontWeight: 700, fontFamily: FONT }}>{t.pctMes.toFixed(0)}%</span>
                  <span style={{ fontSize: 12, color: C.muted, fontFamily: FONT }}>{t.opsMes} proc.</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SlideLinhas({ d }) {
  return (
    <div style={{ flex: 1, padding: "0 40px", display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ fontSize: 28, fontWeight: 900, color: "#fff", fontFamily: FONT, textAlign: "center" }}>🏷️ LINHAS DE NEGÓCIO — {d.currentMonthName.toUpperCase()}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 16, flex: 1, justifyContent: "center" }}>
        {d.linhaRanking.map(l => {
          const colors = { "Import": C.blue, "Feed Meal": C.cyan, "Meat": "#ff6b6b" };
          const color = colors[l.name] || C.amber;
          return (
            <div key={l.name} style={{ background: `${color}12`, border: `1px solid ${color}30`, borderRadius: 12, padding: "20px 24px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <span style={{ fontSize: 24, fontWeight: 800, color: "#fff", fontFamily: FONT }}>{l.name}</span>
                <span style={{ fontSize: 28, fontWeight: 900, color, fontFamily: FONT }}>{fmtUSD(l.lobMes)}</span>
              </div>
              <div style={{ height: 10, background: C.panelBorder, borderRadius: 5, overflow: "hidden", marginBottom: 8 }}>
                <div style={{ width: `${Math.min(l.pctMes, 100)}%`, height: "100%", background: color, borderRadius: 5 }} />
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 18, color: "#fff", fontFamily: FONT, alignItems: "center" }}>
                <span>Meta: {fmtUSD(l.metaMes)}</span>
                <span style={{ color: l.pctMes >= 100 ? C.green : C.amber, fontWeight: 900, fontSize: 24 }}>{l.pctMes.toFixed(1)}%</span>
                <span style={{ fontWeight: 700, fontSize: 18, color: l.metaMes - l.lobMes > 0 ? C.amber : C.green }}>{l.metaMes - l.lobMes > 0 ? `Faltam ${fmtUSD(l.metaMes - l.lobMes)}` : "Meta batida! 🎉"}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SlideStatus({ d }) {
  const entries = Object.entries(d.statusData).sort((a, b) => b[1].lob - a[1].lob);
  const statusColors = { "Embarcado": C.green, "Com Booking": C.cyan, "Sem Booking": C.amber, "Claim": C.red, "Stand by": C.muted };
  return (
    <div style={{ flex: 1, padding: "0 40px", display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ fontSize: 28, fontWeight: 900, color: "#fff", fontFamily: FONT, textAlign: "center" }}>📦 STATUS DOS PROCESSOS — {d.currentMonthName.toUpperCase()}</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16, flex: 1, alignContent: "center" }}>
        {entries.map(([status, data]) => {
          const color = statusColors[status] || C.blue;
          return (
            <div key={status} style={{ background: `${color}12`, border: `1px solid ${color}30`, borderRadius: 12, padding: "24px", textAlign: "center" }}>
              <div style={{ fontSize: 16, color: "#fff", fontWeight: 700, fontFamily: FONT, textTransform: "uppercase", letterSpacing: 1, marginBottom: 12 }}>{status}</div>
              <div style={{ fontSize: 32, fontWeight: 900, color: "#fff", fontFamily: FONT, marginBottom: 4 }}>{fmtUSD(data.lob)}</div>
              <div style={{ fontSize: 16, color, fontWeight: 700, fontFamily: FONT }}>{data.count} {data.count === 1 ? "processo" : "processos"}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SlideGauges({ d }) {
  const BigGauge = ({ value, max, period, color }) => {
    const pct = max > 0 ? Math.min((value / max) * 100, 150) : 0;
    const displayPct = max > 0 ? (value / max) * 100 : 0;
    const remaining = max - value;
    const arcPct = Math.min(pct, 100);
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, flex: 1 }}>
        <span style={{ fontSize: 20, fontWeight: 800, letterSpacing: 2, color: "#fff", textTransform: "uppercase", fontFamily: FONT }}>{period}</span>
        <div style={{ position: "relative", width: 260, height: 160 }}>
          <svg viewBox="0 0 120 75" style={{ width: "100%", height: "100%" }}>
            <path d="M 10 65 A 50 50 0 0 1 110 65" fill="none" stroke={C.panelBorder} strokeWidth="6" strokeLinecap="round" />
            <path d="M 10 65 A 50 50 0 0 1 110 65" fill="none" stroke={displayPct >= 100 ? C.green : color} strokeWidth="6" strokeLinecap="round" strokeDasharray={`${(arcPct / 100) * 157} 157`} style={{ filter: `drop-shadow(0 0 8px ${color}80)` }} />
          </svg>
          <div style={{ position: "absolute", top: "42%", left: "50%", transform: "translate(-50%, -10%)", textAlign: "center" }}>
            <div style={{ fontSize: 44, fontWeight: 900, color: displayPct >= 100 ? C.green : "#fff", fontFamily: FONT, lineHeight: 1 }}>{displayPct.toFixed(1)}%</div>
          </div>
        </div>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 22, color: "#fff", fontWeight: 800, fontFamily: FONT }}>{fmtUSD(value)}</div>
          <div style={{ fontSize: 16, color: "#fff", fontFamily: FONT, marginTop: 4 }}>
            {remaining > 0 ? <>Faltam <span style={{ color: C.amber, fontWeight: 800 }}>{fmtUSD(remaining)}</span></> : <span style={{ color: C.green, fontWeight: 800 }}>Meta batida! +{fmtUSD(Math.abs(remaining))}</span>}
          </div>
          <div style={{ fontSize: 13, color: C.muted, fontFamily: FONT, marginTop: 2 }}>Meta: {fmtUSD(max)}</div>
        </div>
      </div>
    );
  };
  return (
    <div style={{ flex: 1, padding: "0 40px", display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ fontSize: 28, fontWeight: 900, color: "#fff", fontFamily: FONT, textAlign: "center" }}>🎯 ATINGIMENTO DE META GLOBAL</div>
      <div style={{ display: "flex", gap: 20, justifyContent: "center", flex: 1, alignItems: "center" }}>
        <BigGauge value={d.lobMesAtual} max={d.metaMesAtual} period="Mensal" color={C.green} />
        <BigGauge value={d.lobTrimestral} max={d.metaTrimestral} period="Trimestral" color={C.cyan} />
        <BigGauge value={d.lobAnoTotal} max={d.metaAnoTotal} period="Anual" color={C.amber} />
      </div>
    </div>
  );
}

function SlideMargens({ d }) {
  const MargemCard = ({ item, rank, type }) => {
    const isTop = type === "top";
    const color = isTop ? C.green : C.red;
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 16, padding: "14px 20px", borderRadius: 10, background: `${color}08`, borderLeft: `4px solid ${color}` }}>
        <span style={{ fontSize: 28, fontWeight: 900, color, fontFamily: FONT, width: 40, textAlign: "center" }}>#{rank + 1}</span>
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
            <span style={{ fontSize: 16, fontWeight: 700, color: "#fff", fontFamily: FONT }}>{item.processo}</span>
            <span style={{ fontSize: 22, fontWeight: 900, color, fontFamily: FONT }}>{item.margem.toFixed(1)}%</span>
          </div>
          <div style={{ fontSize: 18, fontWeight: 800, color: C.cyan, fontFamily: FONT, marginBottom: 4 }}>{item.produto || "—"}</div>
          <div style={{ fontSize: 12, color: C.muted, fontFamily: FONT }}>
            {item.trader} • {item.linha} • {item.cliente ? item.cliente.substring(0, 40) : ""} • LOB: {fmtUSD(item.lob)}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div style={{ flex: 1, padding: "0 40px", display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ fontSize: 28, fontWeight: 900, color: "#fff", fontFamily: FONT, textAlign: "center" }}>📊 MARGENS DE VENDA — {d.currentMonthName.toUpperCase()}</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, flex: 1, alignContent: "center" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ fontSize: 18, fontWeight: 800, color: C.green, fontFamily: FONT, textAlign: "center", marginBottom: 8 }}>▲ TOP 3 MAIORES</div>
          {d.topMargens.map((m, i) => <MargemCard key={m.processo} item={m} rank={i} type="top" />)}
          {d.topMargens.length === 0 && <div style={{ color: C.muted, textAlign: "center", fontSize: 14 }}>Sem dados de margem no mês</div>}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ fontSize: 18, fontWeight: 800, color: C.red, fontFamily: FONT, textAlign: "center", marginBottom: 8 }}>▼ TOP 3 MENORES</div>
          {d.bottomMargens.map((m, i) => <MargemCard key={m.processo} item={m} rank={i} type="bottom" />)}
          {d.bottomMargens.length === 0 && <div style={{ color: C.muted, textAlign: "center", fontSize: 14 }}>Sem dados de margem no mês</div>}
        </div>
      </div>
    </div>
  );
}

const PIE_COLORS = ["#00e5ff", "#2979ff", "#ffab00", "#00e676", "#ff6b6b", "#ab47bc", "#26a69a", "#ff7043", "#78909c", "#5c6bc0", "#8d6e63", "#ef5350"];

// ══════════════════════════════════════════════════════════════
//  GLOBE — Country coordinates (lat, lng)
// ══════════════════════════════════════════════════════════════
const COUNTRY_COORDS = {
  "brasil": [-14.24, -51.93], "brazil": [-14.24, -51.93],
  "chile": [-35.68, -71.54], "argentina": [-38.42, -63.62],
  "uruguai": [-32.52, -55.77], "uruguay": [-32.52, -55.77],
  "paraguai": [-23.44, -58.44], "paraguay": [-23.44, -58.44],
  "peru": [-9.19, -75.02], "colombia": [4.57, -74.30],
  "equador": [-1.83, -78.18], "ecuador": [-1.83, -78.18],
  "venezuela": [6.42, -66.59], "bolivia": [-16.29, -63.59],
  "estados unidos": [37.09, -95.71], "eua": [37.09, -95.71], "usa": [37.09, -95.71], "united states": [37.09, -95.71],
  "canada": [56.13, -106.35], "canadá": [56.13, -106.35],
  "mexico": [23.63, -102.55], "méxico": [23.63, -102.55],
  "china": [35.86, 104.20], "japao": [36.20, 138.25], "japão": [36.20, 138.25], "japan": [36.20, 138.25],
  "coreia do sul": [35.91, 127.77], "south korea": [35.91, 127.77],
  "india": [20.59, 78.96], "índia": [20.59, 78.96],
  "tailandia": [15.87, 100.99], "tailândia": [15.87, 100.99], "thailand": [15.87, 100.99],
  "vietna": [14.06, 108.28], "vietnã": [14.06, 108.28], "vietnam": [14.06, 108.28],
  "indonesia": [-0.79, 113.92], "indonésia": [-0.79, 113.92],
  "malasia": [4.21, 101.98], "malásia": [4.21, 101.98], "malaysia": [4.21, 101.98],
  "filipinas": [12.88, 121.77], "philippines": [12.88, 121.77],
  "paquistao": [30.38, 69.35], "paquistão": [30.38, 69.35], "pakistan": [30.38, 69.35],
  "bangladesh": [23.68, 90.36],
  "alemanha": [51.17, 10.45], "germany": [51.17, 10.45],
  "franca": [46.23, 2.21], "frança": [46.23, 2.21], "france": [46.23, 2.21],
  "italia": [41.87, 12.57], "itália": [41.87, 12.57], "italy": [41.87, 12.57],
  "espanha": [40.46, -3.75], "spain": [40.46, -3.75],
  "portugal": [39.40, -8.22], "reino unido": [55.38, -3.44], "uk": [55.38, -3.44],
  "holanda": [52.13, 5.29], "netherlands": [52.13, 5.29], "paises baixos": [52.13, 5.29],
  "belgica": [50.50, 4.47], "bélgica": [50.50, 4.47],
  "suica": [46.82, 8.23], "suíça": [46.82, 8.23],
  "russia": [61.52, 105.32], "rússia": [61.52, 105.32],
  "turquia": [38.96, 35.24], "turkey": [38.96, 35.24],
  "emirados arabes": [23.42, 53.85], "uae": [23.42, 53.85], "dubai": [25.20, 55.27],
  "arabia saudita": [23.89, 45.08], "arábia saudita": [23.89, 45.08], "saudi arabia": [23.89, 45.08],
  "africa do sul": [-30.56, 22.94], "south africa": [-30.56, 22.94],
  "egito": [26.82, 30.80], "egypt": [26.82, 30.80],
  "nigeria": [9.08, 8.68], "marrocos": [31.79, -7.09], "morocco": [31.79, -7.09],
  "australia": [-25.27, 133.78], "nova zelandia": [-40.90, 174.89], "new zealand": [-40.90, 174.89],
  "taiwan": [23.70, 120.96], "hong kong": [22.40, 114.11], "singapura": [1.35, 103.82], "singapore": [1.35, 103.82],
  "noruega": [60.47, 8.47], "norway": [60.47, 8.47], "suecia": [60.13, 18.64], "sweden": [60.13, 18.64],
  "dinamarca": [56.26, 9.50], "denmark": [56.26, 9.50], "finlandia": [61.92, 25.75], "finland": [61.92, 25.75],
  "panama": [8.54, -80.78], "panamá": [8.54, -80.78], "costa rica": [9.75, -83.75],
  "republica dominicana": [18.74, -70.16], "cuba": [21.52, -77.78], "jamaica": [18.11, -77.30],
  "guatemala": [15.78, -90.23], "honduras": [15.20, -86.24], "el salvador": [13.79, -88.90],
  "nicaragua": [12.87, -85.21], "porto rico": [18.22, -66.59], "puerto rico": [18.22, -66.59],
  "trinidad": [10.69, -61.22], "trinidad e tobago": [10.69, -61.22],
  "gana": [7.95, -1.02], "ghana": [7.95, -1.02], "quenia": [-0.02, 37.91], "kenya": [-0.02, 37.91],
  "angola": [-11.20, 17.87], "mocambique": [-18.67, 35.53], "moçambique": [-18.67, 35.53],
};

function getCountryCoords(pais) {
  const normalized = pais.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  if (COUNTRY_COORDS[normalized]) return COUNTRY_COORDS[normalized];
  for (const [k, v] of Object.entries(COUNTRY_COORDS)) {
    if (normalized.includes(k) || k.includes(normalized)) return v;
  }
  return null;
}
function CicloBar({ name, media, maxAbs }) {
  const pct = maxAbs > 0 ? (Math.abs(media) / maxAbs) * 100 : 0;
  const isGood = media <= 0;
  const color = media <= -10 ? C.green : media <= 0 ? C.cyan : media <= 20 ? C.amber : C.red;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 12px" }}>
      <span style={{ fontSize: 13, fontWeight: 600, color: "#fff", fontFamily: FONT, width: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</span>
      <div style={{ flex: 1, height: 8, background: C.panelBorder, borderRadius: 4, position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", [isGood ? "right" : "left"]: "50%", width: `${pct / 2}%`, height: "100%", background: color, borderRadius: 4, transition: "width 1s" }} />
        <div style={{ position: "absolute", left: "50%", top: 0, bottom: 0, width: 2, background: "#fff" }} />
      </div>
      <span style={{ fontSize: 16, fontWeight: 800, color, fontFamily: FONT, width: 70, textAlign: "right" }}>{media.toFixed(0)}d</span>
    </div>
  );
}

function SlideFinancial1({ d }) {
  const fin = d.financialData;
  const cicloColor = fin.cicloMedio <= -10 ? C.green : fin.cicloMedio <= 0 ? C.cyan : fin.cicloMedio <= 20 ? C.amber : C.red;
  const maxTrader = fin.byTrader.length > 0 ? Math.max(...fin.byTrader.map(t => Math.abs(t.media))) : 1;

  return (
    <div style={{ flex: 1, padding: "0 40px", display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ fontSize: 28, fontWeight: 900, color: "#fff", fontFamily: FONT, textAlign: "center" }}>💰 CICLO FINANCEIRO — {new Date().getFullYear()}</div>
      <div style={{ fontSize: 13, color: C.muted, fontFamily: FONT, textAlign: "center" }}>{fin.total} processos com ciclo completo • Quanto mais negativo, melhor para o caixa</div>

      {/* Ciclo Médio Central */}
      <div style={{ display: "flex", justifyContent: "center", padding: "10px 0" }}>
        <div style={{ background: `${cicloColor}12`, border: `2px solid ${cicloColor}40`, borderRadius: 16, padding: "20px 50px", textAlign: "center" }}>
          <div style={{ fontSize: 14, color: C.muted, fontFamily: FONT, marginBottom: 4 }}>CICLO MÉDIO GERAL</div>
          <div style={{ fontSize: 52, fontWeight: 900, color: cicloColor, fontFamily: FONT, lineHeight: 1 }}>{fin.cicloMedio.toFixed(0)} dias</div>
          <div style={{ fontSize: 14, color: "#fff", fontFamily: FONT, marginTop: 6 }}>
            {fin.cicloMedio <= -10 ? "🟢 Excelente — recebendo bem antes de pagar" : fin.cicloMedio <= 0 ? "🔵 Bom — recebendo antes de pagar" : fin.cicloMedio <= 20 ? "🟡 Atenção — pagando antes de receber" : "🔴 Crítico — alto capital de giro necessário"}
          </div>
        </div>
      </div>

      {/* Trader + Linha side by side */}
      <div style={{ display: "flex", gap: 24, flex: 1 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 18, fontWeight: 800, color: "#fff", fontFamily: FONT, marginBottom: 8, textAlign: "center" }}>🏆 Por Trader</div>
          {fin.byTrader.map(t => <CicloBar key={t.name} name={t.name} media={t.media} maxAbs={maxTrader} />)}
          {fin.byTrader.length === 0 && <div style={{ color: C.muted, textAlign: "center" }}>Sem dados</div>}
        </div>
        <div style={{ width: 2, background: C.panelBorder }} />
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
          <div style={{ fontSize: 18, fontWeight: 800, color: "#fff", fontFamily: FONT, marginBottom: 16 }}>📊 Escala do Ciclo</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12, width: "80%" }}>
            {[
              { label: "Negativo (< 0 dias)", desc: "IB recebe antes de pagar", color: C.green, icon: "🟢" },
              { label: "Zero (0 dias)", desc: "Recebe e paga no mesmo prazo", color: C.cyan, icon: "🔵" },
              { label: "Positivo (1-20 dias)", desc: "IB paga antes de receber", color: C.amber, icon: "🟡" },
              { label: "Crítico (> 20 dias)", desc: "Alto capital de giro", color: C.red, icon: "🔴" },
            ].map(item => (
              <div key={item.label} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", background: `${item.color}08`, borderLeft: `3px solid ${item.color}`, borderRadius: 6 }}>
                <span style={{ fontSize: 18 }}>{item.icon}</span>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#fff", fontFamily: FONT }}>{item.label}</div>
                  <div style={{ fontSize: 11, color: C.muted, fontFamily: FONT }}>{item.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function SlideFinancialMensal({ d }) {
  const fin = d.financialData;
  const data = fin.monthlyCiclo;
  const maxAbs = data.length > 0 ? Math.max(...data.map(m => Math.abs(m.media))) : 1;

  return (
    <div style={{ flex: 1, padding: "0 40px", display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ fontSize: 28, fontWeight: 900, color: "#fff", fontFamily: FONT, textAlign: "center" }}>💰 CICLO FINANCEIRO — EVOLUÇÃO MENSAL</div>
      <div style={{ fontSize: 13, color: C.muted, fontFamily: FONT, textAlign: "center" }}>Média do ciclo financeiro (Coluna H) por mês • Quanto mais negativo, melhor para o caixa</div>

      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 12, justifyContent: "center", maxWidth: 800, margin: "0 auto", width: "100%" }}>
        {data.map((m, i) => {
          const color = m.media <= -10 ? C.green : m.media <= 0 ? C.cyan : m.media <= 20 ? C.amber : C.red;
          const barPct = maxAbs > 0 ? (Math.abs(m.media) / maxAbs) * 40 : 0;
          const isNeg = m.media <= 0;
          return (
            <div key={m.month} style={{ display: "flex", alignItems: "center", gap: 16, padding: "14px 20px", background: `${color}08`, borderRadius: 10, borderLeft: `4px solid ${color}` }}>
              <div style={{ width: 100 }}>
                <div style={{ fontSize: 18, fontWeight: 800, color: "#fff", fontFamily: FONT }}>{m.monthFull}</div>
                <div style={{ fontSize: 11, color: C.muted, fontFamily: FONT }}>{m.count} processos</div>
              </div>
              <div style={{ flex: 1, height: 12, background: C.panelBorder, borderRadius: 6, position: "relative", overflow: "hidden" }}>
                <div style={{ position: "absolute", left: "50%", top: 0, bottom: 0, width: 2, background: "#fff", zIndex: 1 }} />
                <div style={{ position: "absolute", [isNeg ? "right" : "left"]: "50%", width: `${barPct}%`, height: "100%", background: color, borderRadius: 6 }} />
              </div>
              <div style={{ width: 100, textAlign: "right" }}>
                <span style={{ fontSize: 28, fontWeight: 900, color, fontFamily: FONT }}>{m.media.toFixed(0)}</span>
                <span style={{ fontSize: 14, fontWeight: 600, color: C.muted, fontFamily: FONT }}> dias</span>
              </div>
            </div>
          );
        })}
        {data.length === 0 && <div style={{ color: C.muted, textAlign: "center", fontSize: 16 }}>Sem dados de ciclo financeiro completo</div>}
      </div>

      <div style={{ display: "flex", gap: 20, justifyContent: "center", fontSize: 12, color: C.muted, fontFamily: FONT }}>
        <span><span style={{ color: C.green }}>●</span> Excelente (&lt;-10d)</span>
        <span><span style={{ color: C.cyan }}>●</span> Bom (0 a -10d)</span>
        <span><span style={{ color: C.amber }}>●</span> Atenção (1-20d)</span>
        <span><span style={{ color: C.red }}>●</span> Crítico (&gt;20d)</span>
      </div>
    </div>
  );
}

function SlideFinancial2({ d }) {
  const fin = d.financialData;
  const RankCard = ({ items, title, type, unit }) => {
    const isTop = type === "top";
    return (
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 16, fontWeight: 800, color: isTop ? C.green : C.red, fontFamily: FONT, textAlign: "center", marginBottom: 10 }}>{isTop ? "▲" : "▼"} {title}</div>
        {items.map((item, i) => {
          const val = item.media;
          const color = isTop ? C.green : C.red;
          return (
            <div key={item.name} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", borderRadius: 8, background: `${color}08`, borderLeft: `4px solid ${color}`, marginBottom: 6 }}>
              <span style={{ fontSize: 22, fontWeight: 900, color, fontFamily: FONT, width: 30 }}>#{i + 1}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#fff", fontFamily: FONT, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.name}</div>
                <div style={{ fontSize: 11, color: C.muted, fontFamily: FONT }}>{item.count} {item.count === 1 ? "processo" : "processos"}</div>
              </div>
              <span style={{ fontSize: 20, fontWeight: 900, color, fontFamily: FONT }}>{val.toFixed(0)}d</span>
            </div>
          );
        })}
        {items.length === 0 && <div style={{ color: C.muted, textAlign: "center", fontSize: 13 }}>Sem dados</div>}
      </div>
    );
  };

  return (
    <div style={{ flex: 1, padding: "0 40px", display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ fontSize: 28, fontWeight: 900, color: "#fff", fontFamily: FONT, textAlign: "center" }}>💰 PRAZOS — CLIENTES & FORNECEDORES</div>
      <div style={{ fontSize: 13, color: C.muted, fontFamily: FONT, textAlign: "center" }}>Clientes: prazo de recebimento (menor = melhor) • Fornecedores: prazo de pagamento (maior = melhor) • {new Date().getFullYear()}</div>

      <div style={{ display: "flex", gap: 24, flex: 1, paddingTop: 8 }}>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ fontSize: 20, fontWeight: 900, color: "#fff", fontFamily: FONT, textAlign: "center" }}>🏢 CLIENTES (Prazo Recebimento)</div>
          <div style={{ fontSize: 11, color: C.muted, fontFamily: FONT, textAlign: "center" }}>Quanto menor, melhor — cliente paga mais rápido</div>
          <div style={{ display: "flex", gap: 16, flex: 1 }}>
            <RankCard items={fin.topClientes} title="PAGAM MAIS RÁPIDO" type="top" />
            <RankCard items={fin.worstClientes} title="PAGAM MAIS LENTO" type="worst" />
          </div>
        </div>

        <div style={{ width: 2, background: C.panelBorder }} />

        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ fontSize: 20, fontWeight: 900, color: "#fff", fontFamily: FONT, textAlign: "center" }}>🏭 FORNECEDORES (Prazo Pagamento)</div>
          <div style={{ fontSize: 11, color: C.muted, fontFamily: FONT, textAlign: "center" }}>Quanto maior, melhor — mais tempo pra pagar</div>
          <div style={{ display: "flex", gap: 16, flex: 1 }}>
            <RankCard items={fin.topFornecedores} title="MAIOR PRAZO" type="top" />
            <RankCard items={fin.worstFornecedores} title="MENOR PRAZO" type="worst" />
          </div>
        </div>
      </div>
    </div>
  );
}

function SlideOperacional({ d }) {
  const op = d.operationalData;
  const etd = op.etdAnalysis;
  const doc = op.docAnalysis;

  const DonutChart = ({ data, title, colors, labels, period, totalProc }) => {
    const total = data.reduce((s, v) => s + v, 0);
    if (total === 0) return <div style={{ textAlign: "center", color: C.muted, fontSize: 14 }}>Sem dados</div>;
    const pieData = data.map((v, i) => ({ name: labels[i], value: v, pct: ((v / total) * 100).toFixed(1) })).filter(d => d.value > 0);

    return (
      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
        <div style={{ fontSize: 20, fontWeight: 800, color: "#fff", fontFamily: FONT, textAlign: "center" }}>{title}</div>
        <div style={{ fontSize: 14, color: C.muted, fontFamily: FONT }}>{period} • {totalProc} processos</div>
        <ResponsiveContainer width="100%" height={250}>
          <PieChart>
            <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} innerRadius={50} paddingAngle={3}
              label={({ name, pct, cx: pcx, cy: pcy, midAngle, outerRadius: or }) => {
                const rad = -midAngle * Math.PI / 180;
                const x = pcx + (or + 25) * Math.cos(rad);
                const y = pcy + (or + 25) * Math.sin(rad);
                return <text x={x} y={y} textAnchor="middle" fill="#fff" fontSize={12} fontWeight={700} fontFamily={FONT}>{pct}%</text>;
              }}
              labelLine={{ stroke: C.muted, strokeWidth: 1 }}>
              {pieData.map((_, i) => <Cell key={i} fill={colors[labels.indexOf(pieData[i]?.name)] || C.muted} />)}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, width: "100%" }}>
          {pieData.map((p, i) => {
            const color = colors[labels.indexOf(p.name)] || C.muted;
            return (
              <div key={p.name} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 16px", borderRadius: 8, background: `${color}10`, borderLeft: `4px solid ${color}` }}>
                <span style={{ fontSize: 28, fontWeight: 900, color, fontFamily: FONT }}>{p.value}</span>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#fff", fontFamily: FONT }}>{p.name}</div>
                  <div style={{ fontSize: 12, color: C.muted, fontFamily: FONT }}>{p.pct}% dos processos</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div style={{ flex: 1, padding: "0 40px", display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ fontSize: 28, fontWeight: 900, color: "#fff", fontFamily: FONT, textAlign: "center" }}>⚙️ ANÁLISE OPERACIONAL — {d.currentMonthName.toUpperCase()}</div>
      <div style={{ fontSize: 14, color: C.muted, fontFamily: FONT, textAlign: "center" }}>Embarque: {op.etdPeriod} ({op.totalEtd} proc.) • Documentos: {op.docPeriod} ({op.totalDoc} proc.)</div>
      <div style={{ display: "flex", gap: 40, flex: 1, justifyContent: "center", alignItems: "flex-start", paddingTop: 12 }}>
        <DonutChart
          data={[etd.noPrazo, etd.antecipado, etd.atrasado, etd.semDados]}
          title="📦 Pontualidade de Embarque"
          colors={[C.green, C.cyan, C.red, C.muted]}
          labels={["No prazo", "Antecipado", "Atrasado", "Sem dados"]}
          period={op.etdPeriod}
          totalProc={op.totalEtd}
        />
        <div style={{ width: 2, background: C.panelBorder, alignSelf: "stretch", margin: "40px 0" }} />
        <DonutChart
          data={[doc.noPrazo, doc.antecipado, doc.atrasado, doc.semDados]}
          title="📄 Envio de Documentos (15 dias)"
          colors={[C.green, C.cyan, C.red, C.muted]}
          labels={["No prazo (≤15d)", "Antes do embarque", "Atrasado (>15d)", "Sem dados"]}
          period={op.docPeriod}
          totalProc={op.totalDoc}
        />
      </div>
    </div>
  );
}

function SlideGlobe({ d }) {
  const mountRef = useRef(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    let animId = null;
    let renderer = null;
    let destroyed = false;

    // Check if Three.js already loaded
    function init() {
      if (destroyed) return;
      const THREE = window.THREE;
      if (!THREE) return;

      const W = mount.clientWidth || 700;
      const H = mount.clientHeight || 500;

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(45, W / H, 0.1, 1000);
      camera.position.z = 2.6;

      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setSize(W, H);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setClearColor(0x000000, 0);
      mount.innerHTML = "";
      mount.appendChild(renderer.domElement);

      // Globe with Earth texture
      const textureLoader = new THREE.TextureLoader();
      const earthTex = textureLoader.load("https://unpkg.com/three-globe@2.31.1/example/img/earth-blue-marble.jpg");
      const globe = new THREE.Mesh(
        new THREE.SphereGeometry(1, 64, 64),
        new THREE.MeshPhongMaterial({ map: earthTex, bumpScale: 0.02, specular: new THREE.Color(0x222222), shininess: 10 })
      );
      scene.add(globe);

      // Atmosphere
      scene.add(new THREE.Mesh(
        new THREE.SphereGeometry(1.03, 64, 64),
        new THREE.MeshBasicMaterial({ color: 0x2979ff, transparent: true, opacity: 0.07, side: THREE.BackSide })
      ));

      // Lights
      scene.add(new THREE.AmbientLight(0x606060, 1.5));
      const dLight = new THREE.DirectionalLight(0xffffff, 1);
      dLight.position.set(5, 3, 5);
      scene.add(dLight);

      // Lat/Lng to 3D
      function ll2v(lat, lng, r) {
        const phi = (90 - lat) * Math.PI / 180;
        const theta = (lng + 180) * Math.PI / 180;
        return new THREE.Vector3(-r * Math.sin(phi) * Math.cos(theta), r * Math.cos(phi), r * Math.sin(phi) * Math.sin(theta));
      }

      // Marker group (rotates with globe)
      const group = new THREE.Group();

      // Brazil marker
      const brPos = ll2v(-14.24, -51.93, 1.015);
      const brMarker = new THREE.Mesh(new THREE.SphereGeometry(0.022, 16, 16), new THREE.MeshBasicMaterial({ color: 0x00e676 }));
      brMarker.position.copy(brPos);
      group.add(brMarker);
      const brGlow = new THREE.Mesh(new THREE.SphereGeometry(0.045, 16, 16), new THREE.MeshBasicMaterial({ color: 0x00e676, transparent: true, opacity: 0.25 }));
      brGlow.position.copy(brPos);
      group.add(brGlow);

      // Country markers and arcs
      d.globeData.forEach(function(item) {
        var coords = getCountryCoords(item.pais);
        if (!coords) return;
        var isImpo = item.tipo === "IMPO";
        var color = isImpo ? 0xffffff : 0x2979ff;
        var pos = ll2v(coords[0], coords[1], 1.015);
        var sz = 0.014 + Math.min(item.count * 0.004, 0.016);

        // Marker
        var marker = new THREE.Mesh(new THREE.SphereGeometry(sz, 12, 12), new THREE.MeshBasicMaterial({ color: color }));
        marker.position.copy(pos);
        group.add(marker);

        // Glow
        var glow = new THREE.Mesh(new THREE.SphereGeometry(sz * 2.5, 12, 12), new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: 0.15 }));
        glow.position.copy(pos);
        group.add(glow);

        // Arc from Brazil
        var mid = new THREE.Vector3().addVectors(brPos, pos).multiplyScalar(0.5);
        var dist = brPos.distanceTo(pos);
        mid.normalize().multiplyScalar(1 + dist * 0.35);
        var curve = new THREE.QuadraticBezierCurve3(brPos, mid, pos);
        var arcLine = new THREE.Line(
          new THREE.BufferGeometry().setFromPoints(curve.getPoints(40)),
          new THREE.LineBasicMaterial({ color: color, transparent: true, opacity: 0.3 })
        );
        group.add(arcLine);
      });

      scene.add(group);

      // Start facing Americas
      globe.rotation.y = -1.5;
      group.rotation.y = -1.5;

      // Animation loop
      function animate() {
        if (destroyed) return;
        globe.rotation.y += 0.0015;
        group.rotation.y += 0.0015;
        renderer.render(scene, camera);
        animId = requestAnimationFrame(animate);
      }
      animate();
    }

    // Load Three.js if not already loaded
    if (window.THREE) {
      init();
    } else {
      var script = document.createElement("script");
      script.src = "https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js";
      script.onload = init;
      document.head.appendChild(script);
    }

    return function() {
      destroyed = true;
      if (animId) cancelAnimationFrame(animId);
      if (renderer) {
        renderer.dispose();
        renderer.forceContextLoss();
      }
      if (mount) mount.innerHTML = "";
    };
  }, [d.globeData]);

  var impoData = d.globeData.filter(function(g) { return g.tipo === "IMPO"; });
  var expoData = d.globeData.filter(function(g) { return g.tipo === "EXPO"; });
  var totalImpo = impoData.reduce(function(s, g) { return s + g.lob; }, 0);
  var totalExpo = expoData.reduce(function(s, g) { return s + g.lob; }, 0);

  return (
    <div style={{ flex: 1, padding: "0 20px", display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={{ fontSize: 28, fontWeight: 900, color: "#fff", fontFamily: FONT, textAlign: "center" }}>🌍 OPERAÇÕES GLOBAIS — {d.currentMonthName.toUpperCase()}</div>
      <div style={{ display: "flex", flex: 1, gap: 8 }}>
        <div style={{ width: 220, display: "flex", flexDirection: "column", gap: 6, justifyContent: "center", padding: "0 8px" }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: "#fff", fontFamily: FONT, marginBottom: 8, display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ width: 12, height: 12, background: "#fff", borderRadius: "50%", display: "inline-block", boxShadow: "0 0 6px rgba(255,255,255,0.5)" }} /> IMPORTAÇÃO
          </div>
          {impoData.length > 0 ? impoData.map(function(g) { return (
            <div key={g.pais} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "#fff", fontFamily: FONT, padding: "4px 0", borderBottom: "1px solid " + C.panelBorder }}>
              <span style={{ fontWeight: 600 }}>{g.pais}</span>
              <span style={{ fontWeight: 800 }}>{fmtUSD(g.lob)} <span style={{ color: C.muted, fontWeight: 400 }}>({g.count})</span></span>
            </div>
          ); }) : <div style={{ fontSize: 12, color: C.muted }}>Sem dados no mês</div>}
          {impoData.length > 0 && <div style={{ fontSize: 14, fontWeight: 800, color: "#fff", fontFamily: FONT, marginTop: 4, paddingTop: 6, borderTop: "2px solid " + C.panelBorder }}>Total: {fmtUSD(totalImpo)}</div>}
        </div>
        <div ref={mountRef} style={{ flex: 1, minHeight: 450 }} />
        <div style={{ width: 220, display: "flex", flexDirection: "column", gap: 6, justifyContent: "center", padding: "0 8px" }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: C.blue, fontFamily: FONT, marginBottom: 8, display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ width: 12, height: 12, background: C.blue, borderRadius: "50%", display: "inline-block", boxShadow: "0 0 6px " + C.blue + "80" }} /> EXPORTAÇÃO
          </div>
          {expoData.length > 0 ? expoData.map(function(g) { return (
            <div key={g.pais} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: C.blue, fontFamily: FONT, padding: "4px 0", borderBottom: "1px solid " + C.panelBorder }}>
              <span style={{ fontWeight: 600 }}>{g.pais}</span>
              <span style={{ fontWeight: 800 }}>{fmtUSD(g.lob)} <span style={{ color: C.muted, fontWeight: 400 }}>({g.count})</span></span>
            </div>
          ); }) : <div style={{ fontSize: 12, color: C.muted }}>Sem dados no mês</div>}
          {expoData.length > 0 && <div style={{ fontSize: 14, fontWeight: 800, color: C.blue, fontFamily: FONT, marginTop: 4, paddingTop: 6, borderTop: "2px solid " + C.panelBorder }}>Total: {fmtUSD(totalExpo)}</div>}
        </div>
      </div>
    </div>
  );
}

function SlideProdutos({ d }) {
  const linhas = Object.entries(d.produtosPorLinha);
  const linhaColors = { "Import": C.blue, "Feed Meal": C.cyan, "Meat": "#ff6b6b" };

  return (
    <div style={{ flex: 1, padding: "0 20px", display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ fontSize: 28, fontWeight: 900, color: "#fff", fontFamily: FONT, textAlign: "center" }}>🥧 PRODUTOS POR LINHA DE NEGÓCIO — {d.currentMonthName.toUpperCase()}</div>
      <div style={{ display: "flex", gap: 16, flex: 1, justifyContent: "center", alignItems: "center" }}>
        {linhas.map(([linha, produtos]) => {
          const entries = Object.entries(produtos).sort((a, b) => b[1].lob - a[1].lob);
          const totalLob = entries.reduce((s, [, v]) => s + v.lob, 0);
          const pieData = entries.map(([name, v]) => ({ name: name.length > 25 ? name.substring(0, 25) + "..." : name, fullName: name, value: Math.max(v.lob, 0.01), count: v.count, pct: totalLob > 0 ? ((v.lob / totalLob) * 100).toFixed(1) : 0 }));
          const color = linhaColors[linha] || C.amber;
          const isSingle = pieData.length === 1;

          return (
            <div key={linha} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 8, maxWidth: linhas.length > 2 ? "33%" : "50%" }}>
              <div style={{ fontSize: 20, fontWeight: 800, color, fontFamily: FONT }}>{linha}</div>
              <div style={{ fontSize: 16, color: "#fff", fontWeight: 700, fontFamily: FONT }}>{fmtUSD(totalLob)}</div>
              <ResponsiveContainer width="100%" height={isSingle ? 180 : 240}>
                <PieChart>
                  <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={isSingle ? 70 : 90} innerRadius={isSingle ? 30 : 40} paddingAngle={isSingle ? 0 : 2} startAngle={90} endAngle={-270} label={isSingle ? false : ({ pct }) => `${pct}%`} labelLine={isSingle ? false : { stroke: C.muted, strokeWidth: 1 }}>
                    {pieData.map((_, idx) => <Cell key={idx} fill={PIE_COLORS[idx % PIE_COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v) => fmtUSD(v)} contentStyle={{ background: "#1a2332ee", border: `1px solid ${C.panelBorder}`, borderRadius: 6, fontFamily: FONT }} itemStyle={{ color: "#fff" }} labelStyle={{ color: C.muted }} />
                </PieChart>
              </ResponsiveContainer>
              <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 140, overflow: "auto", width: "100%" }}>
                {pieData.map((p, idx) => (
                  <div key={p.fullName} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#fff", fontFamily: FONT }}>
                    <span style={{ width: 10, height: 10, borderRadius: 2, background: PIE_COLORS[idx % PIE_COLORS.length], flexShrink: 0, display: "inline-block" }} />
                    <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.fullName}</span>
                    <span style={{ fontWeight: 700, flexShrink: 0 }}>{p.pct}%</span>
                    <span style={{ color: C.muted, flexShrink: 0 }}>({p.count} proc.)</span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
//  MAIN DASHBOARD WITH CAROUSEL
// ══════════════════════════════════════════════════════════════
export default function App() {
  const [loggedIn, setLoggedIn] = useState(false);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [tvMode, setTvMode] = useState(false);
  const [currentSlide, setCurrentSlide] = useState(0);
  const [paused, setPaused] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [reportsOpen, setReportsOpen] = useState(false);
  const [config, setConfig] = useState({
    showKPIs: true, showChart: true, showGauges: true,
    showTraders: true, showLinhas: true, showStatus: true,
    viewMode: "mes",
    tvSlides: { 0: true, 1: true, 2: true, 3: true, 4: true, 5: true, 6: true, 7: true, 8: true, 9: true, 10: true, 11: true },
  });

  const loadData = useCallback(async () => {
    try {
      const [lob, metasTrader, metaLinha, metaGlobal, operacao, financial] = await Promise.all([
        fetchSheet("LOB"), fetchSheet("Metas_Trader"),
        fetchSheet("Meta_linhadenegocio"), fetchSheet("Meta_Global"),
        fetchSheet("Operação").catch(() => fetchSheet("Operacao").catch(() => [])),
        fetchSheet("Fiancial").catch(() => fetchSheet("Financial").catch(() => [])),
      ]);
      const processed = processData(lob, metasTrader, metaLinha, metaGlobal, operacao, financial);
      setData(processed);
      setLastUpdate(new Date());
      setError(null);
      setLoading(false);
    } catch (e) {
      if (e.message === "TOKEN_EXPIRED") {
        setLoggedIn(false);
        setAccessToken(null);
      } else {
        setError("Erro ao carregar dados: " + e.message);
      }
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!loggedIn) return;
    loadData();
    const iv = setInterval(loadData, REFRESH_MS);
    return () => clearInterval(iv);
  }, [loggedIn, loadData]);

  const enabledCount = SLIDE_NAMES.filter((_, i) => config.tvSlides[i]).length || 1;

  useEffect(() => {
    if (!tvMode || paused || !data) return;
    const enabledIdx = SLIDE_NAMES.map((_, i) => i).filter(i => config.tvSlides[i]);
    const origIdx = enabledIdx[currentSlide % enabledIdx.length] || 0;
    const time = SLIDE_TIMES[origIdx] || SLIDE_INTERVAL;
    const iv = setTimeout(() => {
      setCurrentSlide(prev => (prev + 1) % enabledIdx.length);
    }, time);
    return () => clearTimeout(iv);
  }, [tvMode, paused, data, currentSlide, config.tvSlides]);

  const goNext = () => setCurrentSlide(prev => (prev + 1) % enabledCount);
  const goPrev = () => setCurrentSlide(prev => (prev - 1 + enabledCount) % enabledCount);

  if (!loggedIn) return <LoginScreen onLogin={setLoggedIn} />;

  if (loading) return (
    <div style={{ minHeight: "100vh", background: C.bg, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: FONT }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 18, color: C.cyan, fontWeight: 700, marginBottom: 8 }}>Carregando dados...</div>
        <div style={{ fontSize: 12, color: C.muted }}>Conectando ao Google Sheets</div>
      </div>
    </div>
  );

  if (error && !data) return (
    <div style={{ minHeight: "100vh", background: C.bg, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: FONT }}>
      <div style={{ textAlign: "center", maxWidth: 400 }}>
        <div style={{ fontSize: 18, color: C.red, fontWeight: 700, marginBottom: 8 }}>Erro de conexão</div>
        <div style={{ fontSize: 12, color: C.muted, marginBottom: 16 }}>{error}</div>
        <button onClick={loadData} style={{ marginTop: 16, padding: "10px 24px", background: C.blue, color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontFamily: FONT, fontWeight: 700 }}>Tentar novamente</button>
      </div>
    </div>
  );

  if (!data) return null;
  const d = data;
  const maxTraderLob = d.traderRanking.length > 0 ? Math.max(...d.traderRanking.map(t => config.viewMode === "ano" ? t.lobAno : t.lobMes)) : 1;

  // ── TV MODE ──
  if (tvMode) {
    const allSlides = [<SlideOverview d={d} />, <SlideTraders d={d} />, <SlideLinhas d={d} />, <SlideStatus d={d} />, <SlideGauges d={d} />, <SlideMargens d={d} />, <SlideProdutos d={d} />, <SlideGlobe d={d} />, <SlideOperacional d={d} />, <SlideFinancial1 d={d} />, <SlideFinancialMensal d={d} />, <SlideFinancial2 d={d} />];
    const enabledIndices = SLIDE_NAMES.map((_, i) => i).filter(i => config.tvSlides[i]);
    const slides = enabledIndices.map(i => allSlides[i]);
    const slideNames = enabledIndices.map(i => SLIDE_NAMES[i]);
    const safeSlide = currentSlide % (slides.length || 1);
    const originalIdx = enabledIndices[safeSlide] || 0;
    return (
      <div style={{ background: C.bg, minHeight: "100vh", color: C.white, fontFamily: FONT, display: "flex", flexDirection: "column" }}>
        <style>{`@keyframes pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.5;transform:scale(.8)}}@keyframes fadeIn{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}*{box-sizing:border-box;margin:0;padding:0}`}</style>
        <div style={{ padding: "10px 24px", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: `1px solid ${C.panelBorder}`, background: `linear-gradient(180deg, #0d1220, ${C.bg})` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div style={{ width: 40, height: 40, borderRadius: 6, background: "#fff", display: "flex", alignItems: "center", justifyContent: "center", padding: 2 }}>
              <svg viewBox="0 0 100 100" width="34" height="34" xmlns="http://www.w3.org/2000/svg"><rect x="2" y="2" width="96" height="96" fill="white" stroke="#111" strokeWidth="8"/><text x="50" y="68" textAnchor="middle" fontFamily={FONT} fontSize="52" fontWeight="900" fill="#111">IB</text></svg>
            </div>
            <div>
              <div style={{ fontSize: 18, fontWeight: 900, fontFamily: FONT, color: "#fff" }}>INDEPENDENT BRAZIL</div>
              <div style={{ fontSize: 10, color: C.muted, fontWeight: 600, letterSpacing: 1.5, textTransform: "uppercase", fontFamily: FONT }}>Trading Desk • {d.currentMonthName} {new Date().getFullYear()}</div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ display: "flex", gap: 5 }}>{slideNames.map((name, i) => (<div key={i} onClick={() => setCurrentSlide(i)} title={name} style={{ width: i === safeSlide ? 22 : 8, height: 8, borderRadius: 4, background: i === safeSlide ? C.cyan : C.panelBorder, cursor: "pointer", transition: "all 0.3s" }} />))}</div>
            <button onClick={goPrev} style={{ background: "none", border: `1px solid ${C.panelBorder}`, borderRadius: 6, padding: "4px 10px", color: "#fff", cursor: "pointer", fontSize: 14 }}>◀</button>
            <button onClick={() => setPaused(!paused)} style={{ background: paused ? C.green : "none", border: `1px solid ${paused ? C.green : C.panelBorder}`, borderRadius: 6, padding: "4px 10px", color: "#fff", cursor: "pointer", fontSize: 14, minWidth: 32 }}>{paused ? "▶" : "⏸"}</button>
            <button onClick={goNext} style={{ background: "none", border: `1px solid ${C.panelBorder}`, borderRadius: 6, padding: "4px 10px", color: "#fff", cursor: "pointer", fontSize: 14 }}>▶</button>
            <button onClick={() => { setTvMode(false); setPaused(false); }} style={{ background: `linear-gradient(135deg, ${C.red}cc, ${C.red})`, border: "none", borderRadius: 6, padding: "6px 14px", color: "#fff", cursor: "pointer", fontSize: 12, fontFamily: FONT, fontWeight: 700 }}>✕ Sair do Modo TV</button>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginLeft: 4 }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: C.green, animation: "pulse 2s ease-in-out infinite", boxShadow: `0 0 8px ${C.green}80` }} />
              <span style={{ fontSize: 11, fontWeight: 700, color: C.green, fontFamily: FONT }}>LIVE</span>
            </div>
            <Clock />
          </div>
        </div>
        {!paused && (<div style={{ height: 3, background: C.panelBorder }}><div key={safeSlide} style={{ height: "100%", background: C.cyan, animation: `progress ${SLIDE_TIMES[originalIdx] || SLIDE_INTERVAL}ms linear`, width: "100%" }} /><style>{`@keyframes progress{from{width:0}to{width:100%}}`}</style></div>)}
        <div key={safeSlide} style={{ flex: 1, display: "flex", flexDirection: "column", padding: "16px 0", animation: "fadeIn 0.5s ease" }}>{slides[safeSlide]}</div>
        <div style={{ padding: "6px 24px", borderTop: `1px solid ${C.panelBorder}`, display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 10, color: C.dimText, fontFamily: FONT }}>
          <span>🔗 Google Sheets • Atualização a cada 1 min</span>
          <span style={{ fontSize: 12, color: C.muted, fontWeight: 600 }}>📺 {slideNames[safeSlide]} ({safeSlide + 1}/{slides.length})</span>
          <span>Último update: {lastUpdate ? lastUpdate.toLocaleTimeString("pt-BR") : "—"} • INDEPENDENT BRAZIL v4.0</span>
        </div>
      </div>
    );
  }

  // ── DASHBOARD MODE (Home) ──
  return (
    <div style={{ background: C.bg, minHeight: "100vh", color: C.white, fontFamily: FONT, display: "flex", flexDirection: "column" }}>
      <style>{`@keyframes pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.5;transform:scale(.8)}}*{box-sizing:border-box;margin:0;padding:0}::-webkit-scrollbar{width:4px}::-webkit-scrollbar-track{background:${C.bg}}::-webkit-scrollbar-thumb{background:${C.panelBorder};border-radius:4px}`}</style>
      {settingsOpen && <SettingsPanel config={config} setConfig={setConfig} onClose={() => setSettingsOpen(false)} />}
      {/* Header */}
      <div style={{ padding: "12px 24px", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: `1px solid ${C.panelBorder}`, background: `linear-gradient(180deg, #0d1220, ${C.bg})` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ width: 44, height: 44, borderRadius: 6, background: "#fff", display: "flex", alignItems: "center", justifyContent: "center", padding: 3 }}>
            <svg viewBox="0 0 100 100" width="38" height="38" xmlns="http://www.w3.org/2000/svg"><rect x="2" y="2" width="96" height="96" fill="white" stroke="#111" strokeWidth="8"/><text x="50" y="68" textAnchor="middle" fontFamily={FONT} fontSize="52" fontWeight="900" fill="#111">IB</text></svg>
          </div>
          <div>
            <div style={{ fontSize: 20, fontWeight: 900, fontFamily: FONT, color: "#fff" }}>INDEPENDENT BRAZIL</div>
            <div style={{ fontSize: 10, color: C.muted, fontWeight: 600, letterSpacing: 1.5, textTransform: "uppercase", fontFamily: FONT }}>Trading Desk • {d.currentMonthName} {new Date().getFullYear()}</div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button onClick={() => { setTvMode(true); setCurrentSlide(0); setPaused(false); }} style={{ background: `linear-gradient(135deg, ${C.blue}, ${C.cyan})`, border: "none", borderRadius: 8, padding: "8px 16px", cursor: "pointer", fontSize: 13, color: "#fff", fontFamily: FONT, fontWeight: 700, display: "flex", alignItems: "center", gap: 6 }}>📺 Modo TV</button>
          <div style={{ position: "relative" }}>
            <button onClick={() => setReportsOpen(!reportsOpen)} style={{ background: `linear-gradient(135deg, ${C.amber}, #ff9800)`, border: "none", borderRadius: 8, padding: "8px 16px", cursor: "pointer", fontSize: 13, color: "#fff", fontFamily: FONT, fontWeight: 700, display: "flex", alignItems: "center", gap: 6 }}>📄 Relatórios</button>
            {reportsOpen && (
              <div style={{ position: "absolute", top: "100%", right: 0, marginTop: 8, background: C.panel, border: `1px solid ${C.panelBorder}`, borderRadius: 10, padding: "8px", minWidth: 260, boxShadow: "0 8px 24px rgba(0,0,0,0.5)", zIndex: 100 }}>
                <button onClick={() => { generateEmbarcadosPDF(d); setReportsOpen(false); }} style={{ width: "100%", background: "none", border: "none", padding: "10px 14px", cursor: "pointer", textAlign: "left", borderRadius: 6, color: "#fff", fontFamily: FONT, fontSize: 13, display: "flex", alignItems: "center", gap: 8 }} onMouseOver={e => e.currentTarget.style.background = C.panelBorder} onMouseOut={e => e.currentTarget.style.background = "none"}>
                  📦 <span>Processos Embarcados — {d.currentMonthName}</span>
                </button>
                <button onClick={() => { generateResumoMesPDF(d); setReportsOpen(false); }} style={{ width: "100%", background: "none", border: "none", padding: "10px 14px", cursor: "pointer", textAlign: "left", borderRadius: 6, color: "#fff", fontFamily: FONT, fontSize: 13, display: "flex", alignItems: "center", gap: 8 }} onMouseOver={e => e.currentTarget.style.background = C.panelBorder} onMouseOut={e => e.currentTarget.style.background = "none"}>
                  📊 <span>Resumo Geral — {d.currentMonthName}</span>
                </button>
              </div>
            )}
          </div>
          <button onClick={() => setSettingsOpen(true)} style={{ background: C.panelBorder, border: "none", borderRadius: 8, padding: "8px 12px", cursor: "pointer", fontSize: 16, color: C.muted }} title="Configurações">⚙️</button>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: C.green, animation: "pulse 2s ease-in-out infinite", boxShadow: `0 0 8px ${C.green}80` }} />
            <span style={{ fontSize: 11, fontWeight: 700, color: C.green, fontFamily: FONT }}>LIVE</span>
          </div>
          <Clock />
        </div>
      </div>
      {/* KPIs with gauges */}
      {config.showKPIs && (
        <div style={{ display: "flex", gap: 12, padding: "14px 20px" }}>
          {[
            { label: `LOB ${d.currentMonthName}`, value: d.lobMesAtual, meta: d.metaMesAtual, color: C.green },
            { label: "LOB Trimestral", value: d.lobTrimestral, meta: d.metaTrimestral, color: C.cyan },
            { label: "LOB Anual", value: d.lobAnoTotal, meta: d.metaAnoTotal, color: C.amber },
          ].map((kpi, idx) => {
            const pct = kpi.meta > 0 ? (kpi.value / kpi.meta * 100) : 0;
            const arcPct = Math.min(pct, 100);
            const remaining = kpi.meta - kpi.value;
            return (
              <div key={idx} style={{ background: `linear-gradient(135deg, ${C.panel}, ${kpi.color}08)`, border: `1px solid ${C.panelBorder}`, borderRadius: 8, padding: "14px 20px", flex: 1, display: "flex", alignItems: "center", gap: 20 }}>
                <div style={{ position: "relative", width: 80, height: 55, flexShrink: 0 }}>
                  <svg viewBox="0 0 120 75" style={{ width: "100%", height: "100%" }}>
                    <path d="M 10 65 A 50 50 0 0 1 110 65" fill="none" stroke={C.panelBorder} strokeWidth="7" strokeLinecap="round" />
                    <path d="M 10 65 A 50 50 0 0 1 110 65" fill="none" stroke={pct >= 100 ? C.green : kpi.color} strokeWidth="7" strokeLinecap="round" strokeDasharray={`${(arcPct / 100) * 157} 157`} style={{ filter: `drop-shadow(0 0 4px ${kpi.color}60)` }} />
                  </svg>
                  <div style={{ position: "absolute", top: "36%", left: "50%", transform: "translate(-50%, -10%)", fontSize: 14, fontWeight: 900, color: pct >= 100 ? C.green : "#fff", fontFamily: FONT }}>{pct.toFixed(0)}%</div>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1, color: "#fff", textTransform: "uppercase", fontFamily: FONT, marginBottom: 2 }}>{kpi.label}</div>
                  <div style={{ fontSize: 22, fontWeight: 800, color: "#fff", fontFamily: FONT }}>{fmtUSD(kpi.value)}</div>
                  <div style={{ fontSize: 12, color: C.green, fontWeight: 700, fontFamily: FONT }}>Meta: {fmtUSD(kpi.meta)}</div>
                  <div style={{ fontSize: 10, color: remaining > 0 ? C.amber : C.green, fontWeight: 600, fontFamily: FONT }}>{remaining > 0 ? `Faltam ${fmtUSD(remaining)}` : `+${fmtUSD(Math.abs(remaining))}`}</div>
                </div>
              </div>
            );
          })}
          <div style={{ background: `linear-gradient(135deg, ${C.panel}, ${C.blue}08)`, border: `1px solid ${C.panelBorder}`, borderRadius: 8, padding: "14px 20px", flex: 1, display: "flex", flexDirection: "column", justifyContent: "center" }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1, color: "#fff", textTransform: "uppercase", fontFamily: FONT, marginBottom: 4 }}>Processos do Mês</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: "#fff", fontFamily: FONT }}>{d.totalOps}</div>
            <div style={{ fontSize: 12, color: C.green, fontWeight: 700, fontFamily: FONT }}>Ano: {d.totalOpsAno} processos</div>
          </div>
        </div>
      )}
      {/* Main Grid */}
      <div style={{ flex: 1, display: "grid", gridTemplateColumns: "1fr 360px", gap: 12, padding: "0 20px 16px" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {config.showChart && (
            <Panel title="LOB Mensal vs Meta" icon="📈" style={{ flex: 1 }}>
              <ResponsiveContainer width="100%" height={260}>
                <ComposedChart data={d.monthlyLOB} margin={{ top: 45, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={C.panelBorder} />
                  <XAxis dataKey="month" tick={{ fontSize: 12, fill: "#fff", fontFamily: FONT }} tickLine={false} axisLine={{ stroke: C.panelBorder }} />
                  <YAxis tick={{ fontSize: 11, fill: "#fff", fontFamily: FONT }} tickLine={false} axisLine={false} tickFormatter={fmtUSD} width={75} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="embarcado" name="Embarcado" stackId="lob" fill="#ffffff" maxBarSize={32} />
                  <Bar dataKey="outros" name="Outros Status" stackId="lob" fill="#4a5568" radius={[3, 3, 0, 0]} maxBarSize={32} label={(props) => { const { x, y, width, index } = props; const item = d.monthlyLOB[index]; if (!item) return null; const total = item.embarcado + item.outros; const meta = item.meta || 0; const diff = total - meta; if (total <= 0) return null; return (<g><text x={x + width / 2} y={y - 28} textAnchor="middle" fill="#fff" fontSize={11} fontWeight={800} fontFamily={FONT}>{fmtUSD(total)}</text>{meta > 0 && <text x={x + width / 2} y={y - 14} textAnchor="middle" fill={diff >= 0 ? C.green : C.red} fontSize={9} fontWeight={700} fontFamily={FONT}>{diff >= 0 ? "+" : ""}{fmtUSD(diff)}</text>}</g>); }} />
                  <Line type="monotone" dataKey="meta" name="Meta" stroke={C.red} strokeWidth={2} dot={(props) => { const { cx, cy, value } = props; if (!value) return null; return (<g><circle cx={cx} cy={cy} r={4} fill={C.red} /><text x={cx} y={cy + 16} textAnchor="middle" fill={C.red} fontSize={9} fontWeight={700} fontFamily={FONT}>{fmtUSD(value)}</text></g>); }} />
                </ComposedChart>
              </ResponsiveContainer>
              <div style={{ display: "flex", gap: 18, justifyContent: "center", marginTop: 4 }}>
                <span style={{ fontSize: 11, color: "#fff", display: "flex", alignItems: "center", gap: 5, fontFamily: FONT }}><span style={{ width: 12, height: 3, background: "#fff", borderRadius: 2, display: "inline-block" }} /> Embarcado</span>
                <span style={{ fontSize: 11, color: "#fff", display: "flex", alignItems: "center", gap: 5, fontFamily: FONT }}><span style={{ width: 12, height: 3, background: "#4a5568", borderRadius: 2, display: "inline-block" }} /> Outros</span>
                <span style={{ fontSize: 11, color: "#fff", display: "flex", alignItems: "center", gap: 5, fontFamily: FONT }}><span style={{ width: 12, height: 3, background: C.red, borderRadius: 2, display: "inline-block" }} /> Meta</span>
              </div>
            </Panel>
          )}
          {config.showLinhas && (
            <Panel title={`Linhas de Negócio — ${config.viewMode === "ano" ? "Anual" : d.currentMonthName}`} icon="🏷️">
              <div style={{ display: "flex", gap: 12 }}>
                {d.linhaRanking.map(l => <div key={l.name} style={{ flex: 1 }}><LinhaRow l={l} viewMode={config.viewMode} /></div>)}
              </div>
            </Panel>
          )}
          {config.showStatus && Object.keys(d.statusData).length > 0 && (
            <Panel title={`Status dos Processos — ${d.currentMonthName}`} icon="📦">
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                {Object.entries(d.statusData).sort((a, b) => b[1].lob - a[1].lob).map(([status, sdata]) => (
                  <div key={status} style={{ background: `${C.blue}15`, border: `1px solid ${C.blue}30`, borderRadius: 8, padding: "12px 16px", minWidth: 130, flex: 1 }}>
                    <div style={{ fontSize: 12, color: "#fff", fontWeight: 700, fontFamily: FONT, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>{status}</div>
                    <div style={{ fontSize: 18, fontWeight: 800, color: "#fff", fontFamily: FONT }}>{fmtUSD(sdata.lob)}</div>
                    <div style={{ fontSize: 11, color: C.cyan, fontWeight: 600, fontFamily: FONT }}>{sdata.count} {sdata.count === 1 ? "processo" : "processos"}</div>
                  </div>
                ))}
              </div>
            </Panel>
          )}
        </div>
        {config.showTraders && (
          <Panel title={`Ranking de Traders — ${config.viewMode === "ano" ? "Anual" : d.currentMonthName}`} icon="🏆" style={{ overflow: "hidden" }}>
            <div style={{ flex: 1, overflow: "auto", display: "flex", flexDirection: "column", gap: 2 }}>
              {d.traderRanking.map((t, i) => <TraderRow key={t.name} rank={i} t={t} maxLob={maxTraderLob} viewMode={config.viewMode} />)}
            </div>
            <div style={{ borderTop: `1px solid ${C.panelBorder}`, paddingTop: 10, marginTop: 4, display: "flex", justifyContent: "space-between", fontSize: 11, color: C.muted, fontFamily: FONT }}>
              <span>Total: <span style={{ color: C.white, fontWeight: 700 }}>{fmtUSD(d.traderRanking.reduce((s, t) => s + (config.viewMode === "ano" ? t.lobAno : t.lobMes), 0))}</span></span>
              <span>Processos: <span style={{ color: C.white, fontWeight: 700 }}>{d.traderRanking.reduce((s, t) => s + (config.viewMode === "ano" ? t.ops : t.opsMes), 0)}</span></span>
            </div>
          </Panel>
        )}
      </div>
      <div style={{ padding: "8px 24px", borderTop: `1px solid ${C.panelBorder}`, display: "flex", justifyContent: "space-between", fontSize: 10, color: C.dimText, fontFamily: FONT }}>
        <span>🔗 Google Sheets • Atualização a cada 1 min</span>
        <span>Último update: {lastUpdate ? lastUpdate.toLocaleTimeString("pt-BR") : "—"}</span>
        <span>INDEPENDENT BRAZIL • Trading Desk v4.0 • {new Date().getFullYear()}</span>
      </div>
    </div>
  );
}
