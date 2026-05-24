import { createServer } from 'node:http';
import nextEnv from '@next/env';
import next from 'next';
import WebSocket, { WebSocketServer } from 'ws';

const dev = process.env.NODE_ENV !== 'production';
const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd(), dev);
const hostname = process.env.HOST ?? '0.0.0.0';
const port = Number(process.env.PORT ?? 3000);
const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();
const lspProxyServer = new WebSocketServer({ noServer: true });

await app.prepare();
const handleUpgrade = app.getUpgradeHandler();

const server = createServer((request, response) => {
  handle(request, response);
});

server.on('upgrade', (request, socket, head) => {
  const language = languageFromProxyPath(request.url ?? '');
  if (!language) {
    handleUpgrade(request, socket, head).catch((error) => {
      console.error('[next-upgrade] failed:', error);
      socket.destroy();
    });
    return;
  }

  lspProxyServer.handleUpgrade(request, socket, head, (browserSocket) => {
    lspProxyServer.emit('connection', browserSocket, request, language);
  });
});

lspProxyServer.on('connection', (browserSocket, _request, language) => {
  proxyLspConnection(browserSocket, language);
});

server.listen(port, hostname, () => {
  console.log(`Next.js ready on http://${hostname}:${port}`);
  console.log('LSP proxy routes: /api/lsp/java /api/lsp/cpp /api/lsp/python /api/lsp/js /api/lsp/rust /api/lsp/go');
  console.log(`LSP upstream: ${lspUpstreamBaseUrl()}`);
  console.log(`LSP token forwarding: ${process.env.LSP_AUTH_TOKEN?.trim() ? 'enabled' : 'disabled'}`);
});

function languageFromProxyPath(url) {
  const path = new URL(url, 'ws://localhost').pathname;
  const match = path.match(/^\/api\/lsp\/(java|cpp|python|js|rust|go)$/);
  return match?.[1];
}

function proxyLspConnection(browserSocket, language) {
  const token = process.env.LSP_AUTH_TOKEN?.trim();
  if (!token) {
    browserSocket.close(1011, 'LSP proxy token is not configured.');
    return;
  }

  const upstreamUrl = lspUpstreamUrl(language);
  const upstream = new WebSocket(upstreamUrl, {
    headers: { Authorization: `Bearer ${token}` },
  });

  let upstreamOpen = false;
  let browserClosed = false;
  const pendingBrowserMessages = [];

  upstream.on('open', () => {
    upstreamOpen = true;
    for (const message of pendingBrowserMessages.splice(0)) upstream.send(message);
  });

  upstream.on('message', (message, isBinary) => {
    if (browserSocket.readyState === browserSocket.OPEN) browserSocket.send(isBinary ? message : message.toString());
  });

  upstream.on('error', (error) => {
    if (!browserClosed) console.error(`[next-lsp-proxy:${language}] upstream error:`, error);
    if (!browserClosed && browserSocket.readyState === browserSocket.OPEN) browserSocket.close(1011, 'LSP upstream connection failed.');
  });

  upstream.on('close', (code, reason) => {
    if (browserSocket.readyState === browserSocket.OPEN) browserSocket.close(code || 1011, reason.toString() || 'LSP upstream closed.');
  });

  browserSocket.on('message', (message) => {
    const textMessage = message.toString();
    if (upstreamOpen && upstream.readyState === upstream.OPEN) upstream.send(textMessage);
    else pendingBrowserMessages.push(textMessage);
  });

  browserSocket.on('close', () => {
    browserClosed = true;
    if (upstream.readyState === upstream.OPEN) upstream.close();
    else if (upstream.readyState === upstream.CONNECTING) upstream.terminate();
  });
}

function lspUpstreamBaseUrl() {
  return process.env.LSP_SERVER_WS_BASE ?? 'ws://127.0.0.1:3101';
}

function lspUpstreamUrl(language) {
  const baseUrl = new URL(lspUpstreamBaseUrl());
  if (baseUrl.protocol === 'https:') baseUrl.protocol = 'wss:';
  if (baseUrl.protocol === 'http:') baseUrl.protocol = 'ws:';

  const basePath = baseUrl.pathname.endsWith('/') ? baseUrl.pathname : `${baseUrl.pathname}/`;
  baseUrl.pathname = `${basePath}lsp/${language}`.replace(/\/+/g, '/');
  baseUrl.search = '';
  baseUrl.hash = '';

  return baseUrl;
}
