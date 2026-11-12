// Test end-to-end de scheduled-health.
import path from 'node:path';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';

const packageDir = path.resolve(import.meta.dirname, '..');
const tmpDir = path.join(packageDir, 'test', 'tmp');
rmSync(tmpDir, { recursive: true, force: true });
const home = path.join(tmpDir, 'dsh-home');
mkdirSync(path.join(home, 'scheduled-health'), { recursive: true });
const configFile = path.join(home, 'scheduled-health', 'config.json');
writeFileSync(configFile, JSON.stringify({ checks: [
  { name: 'memoria', type: 'memory', minFreeMb: 1 },
  { name: 'disco', type: 'disk-free', path: tmpDir, minFreeGb: 0 },
  { name: 'config-existe', type: 'file', path: configFile, mustExist: true },
  { name: 'archivo-malo', type: 'file', path: path.join(tmpDir, 'no-existe.txt'), mustExist: true },
] }), 'utf8');

function makeClient() {
  const entry = process.env.SCHEALTH_SERVER ? path.resolve(process.env.SCHEALTH_SERVER) : path.join(packageDir, 'server.mjs');
  const transport = new StdioClientTransport({ command: process.execPath, args: [entry], env: { SystemRoot: process.env.SystemRoot || 'C:\\Windows', PATH: process.env.PATH, USERPROFILE: process.env.USERPROFILE, HOME: process.env.HOME || process.env.USERPROFILE, TEMP: process.env.TEMP, TMP: process.env.TMP, DSH_HOME: home }, stderr: 'pipe' });
  transport.stderr?.on('data', (c) => process.stderr.write(`[server] ${c}`));
  const client = new Client({ name: 'schealth-test', version: '1.0.0' }, { capabilities: {}, versionNegotiation: { mode: 'auto' } });
  return client.connect(transport).then(() => ({ client, transport }));
}
const textOf = (r) => (r.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n');

const { client, transport } = await makeClient();
console.log('tools:', (await client.listTools()).tools.map((t) => t.name).join(', '));
const status = textOf(await client.callTool({ name: 'status', arguments: {} }));
console.log('--- status ---'); console.log(status);
console.log('4 checks:', status.includes('Checks: 4'));
const run = await client.callTool({ name: 'run', arguments: {} });
const runText = textOf(run);
console.log('--- run ---'); console.log(runText);
console.log('4 checks, 3 ok, 1 fallo:', runText.includes('Chequeos: 4 · OK: 3 · fallos: 1'));
console.log('memoria ok:', runText.includes('✅ memoria'));
console.log('disco ok:', runText.includes('✅ disco'));
console.log('archivo malo falla:', runText.includes('❌ archivo-malo'));
const history1 = textOf(await client.callTool({ name: 'history', arguments: {} }));
console.log('historial 1:', history1.includes('OK') || history1.includes('FALLOS'));
await client.callTool({ name: 'run', arguments: {} });
const history2 = textOf(await client.callTool({ name: 'history', arguments: {} }));
console.log('historial crece a 2:', history2.split('\n').filter(Boolean).length === 2);
await client.close(); try { await transport.close?.(); } catch {}
console.log('OK');
