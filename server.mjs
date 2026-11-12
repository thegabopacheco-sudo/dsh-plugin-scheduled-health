#!/usr/bin/env node
// dsh-plugin-scheduled-health — chequeos locales de salud con historial.
// Tools: status, run, history.

import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { McpServer } from '@modelcontextprotocol/server';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { z } from 'zod';

const VERSION = '0.1.0';
const DSH_HOME = (() => {
  const v = process.env.DSH_HOME && process.env.DSH_HOME.trim();
  return v || path.join(process.env.USERPROFILE || process.env.HOME || os.homedir(), '.dsh');
})();
const CONFIG_FILE = path.join(DSH_HOME, 'scheduled-health', 'config.json');
const HISTORY_FILE = path.join(DSH_HOME, 'cache', 'scheduled-health', 'history.jsonl');
const log = (m) => process.stderr.write(`[schealth] ${m}\n`);

function loadConfig() {
  try {
    if (existsSync(CONFIG_FILE)) {
      const data = JSON.parse(readFileSync(CONFIG_FILE, 'utf8')) || {};
      if (Array.isArray(data.checks)) return { checks: data.checks };
    }
  } catch { /* defaults */ }
  return { checks: [{ name: 'memoria', type: 'memory', minFreeMb: 256 }, { name: 'disco', type: 'disk-free', path: DSH_HOME, minFreeGb: 0.1 }] };
}
function diskFreeGb(target) {
  const resolved = path.resolve(target);
  const drive = resolved.slice(0, 2).replace(':', '');
  const result = spawnSync('powershell', ['-NoProfile', '-Command', `(Get-PSDrive -Name ${drive} -ErrorAction Stop).Free`], { encoding: 'utf8', timeout: 20000, windowsHide: true });
  if (result.status !== 0) throw new Error(`no se pudo leer el disco ${drive}: ${(result.stderr || '').trim().slice(0, 160)}`);
  return Number(String(result.stdout).trim()) / 1024 ** 3;
}
function evaluate(check) {
  if (!check || typeof check !== 'object' || !check.name || !check.type) return { name: check?.name || '(sin nombre)', ok: false, detail: 'check inválido (falta name/type)' };
  if (check.type === 'memory') {
    const freeMb = os.freemem() / 1024 ** 2;
    return { name: check.name, ok: freeMb >= (check.minFreeMb ?? 128), detail: `libre ${freeMb.toFixed(0)} MB (mín ${check.minFreeMb ?? 128} MB)` };
  }
  if (check.type === 'disk-free') {
    try { const freeGb = diskFreeGb(check.path || DSH_HOME); return { name: check.name, ok: freeGb >= (check.minFreeGb ?? 1), detail: `libre ${freeGb.toFixed(2)} GB (mín ${check.minFreeGb ?? 1} GB)` }; }
    catch (error) { return { name: check.name, ok: false, detail: error.message }; }
  }
  if (check.type === 'file') {
    const exists = existsSync(check.path || '');
    const want = check.mustExist !== false;
    return { name: check.name, ok: exists === want, detail: `${check.path} ${exists ? 'existe' : 'no existe'}` };
  }
  return { name: check.name, ok: false, detail: `tipo no soportado: ${check.type}` };
}
function textResult(text) { return { content: [{ type: 'text', text }] }; }
function readHistory(limit) {
  if (!existsSync(HISTORY_FILE)) return [];
  try { return readFileSync(HISTORY_FILE, 'utf8').split('\n').filter(Boolean).map((line) => { try { return JSON.parse(line); } catch { return null; } }).filter(Boolean).slice(-limit); } catch { return []; }
}

function buildInstructions() {
  return [
    'Scheduled Health: ejecuta chequeos locales de salud y guarda historial.',
    '',
    'Tipos: memory (minFreeMb), disk-free (path, minFreeGb), file (path, mustExist).',
    '',
    'Herramientas: status, run, history.',
    '',
    'Reglas:',
    '- run evalúa los checks configurados y agrega una muestra al historial local.',
    '- Reporta valores reales (memoria/disco) y fallos concretos.',
    '- No ejecuta comandos arbitrarios; pensado para llamarse desde automatizaciones.',
  ].join('\n');
}

function buildServer() {
  const server = new McpServer({ name: 'dsh-plugin-scheduled-health', version: VERSION }, { capabilities: { tools: {} }, instructions: buildInstructions() });
  server.registerTool('status', { title: 'Estado', description: 'Checks configurados y muestras guardadas.', inputSchema: z.object({}) }, async () => {
    const checks = loadConfig().checks;
    return textResult([`Checks: ${checks.length}`, ...checks.map((check) => `- ${check.name} (${check.type})`), `Historial: ${readHistory(1000).length} muestras`].join('\n'));
  });
  server.registerTool('run', { title: 'Ejecutar chequeos', description: 'Evalúa los checks y guarda historial.', inputSchema: z.object({}) }, async () => {
    const checks = loadConfig().checks;
    if (checks.length === 0) return textResult('Sin checks configurados.');
    const results = checks.map(evaluate);
    const ok = results.filter((result) => result.ok).length;
    const entry = { ts: new Date().toISOString(), ok: ok === results.length, results };
    try { mkdirSync(path.dirname(HISTORY_FILE), { recursive: true }); appendFileSync(HISTORY_FILE, JSON.stringify(entry) + '\n', 'utf8'); } catch (error) { log(`no se pudo guardar historial: ${error.message}`); }
    return textResult([
      `Chequeos: ${results.length} · OK: ${ok} · fallos: ${results.length - ok}`,
      '',
      ...results.map((result) => `${result.ok ? '✅' : '❌'} ${result.name}: ${result.detail}`),
    ].join('\n'));
  });
  server.registerTool('history', { title: 'Historial', description: 'Últimas muestras guardadas.', inputSchema: z.object({ limit: z.number().int().min(1).max(200).optional() }) }, async (args) => {
    const history = readHistory(args.limit ?? 20);
    if (history.length === 0) return textResult('Sin historial. Ejecuta run.');
    return textResult(history.map((entry) => `${entry.ts} · ${entry.ok ? 'OK' : 'FALLOS'} · ${entry.results.length} checks`).join('\n'));
  });
  return server;
}

try { mkdirSync(path.join(DSH_HOME, 'cache', 'scheduled-health'), { recursive: true }); } catch { /* ignora */ }
log('scheduled-health listo');
serveStdio(buildServer, { onerror: (e) => log(`serveStdio: ${e.message}`) });
process.on('uncaughtException', (e) => log(`excepción: ${e.message}`));
process.on('unhandledRejection', (e) => log(`rechazo: ${e && e.message ? e.message : String(e)}`));
