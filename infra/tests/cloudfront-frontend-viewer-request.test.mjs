import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const templatePath = path.join(
  repoRoot,
  'infra/modules/cloudfront/functions/frontend-viewer-request.js.tftpl',
);
const template = await readFile(templatePath, 'utf8');
const source = template
  .replace('${canonical_frontend_origin_json}', JSON.stringify('https://pilo.my'))
  .replace('${legacy_redirect_hostnames_json}', JSON.stringify(['dev.pilo.my']))
  .replace('${legacy_redirect_status_code}', '302');

const context = {};
vm.runInNewContext(`${source}\nthis.cloudfrontHandler = handler;`, context);

function request(host, uri, rawQueryString) {
  return {
    uri,
    headers: {
      host: { value: host },
    },
    rawQueryString() {
      return rawQueryString;
    },
  };
}

const redirect = context.cloudfrontHandler({
  request: request('dev.pilo.my', '/workspace/42', 'tab=board&filter=open%20issue'),
});
assert.equal(redirect.statusCode, 302);
assert.equal(redirect.statusDescription, 'Found');
assert.equal(
  redirect.headers.location.value,
  'https://pilo.my/workspace/42?tab=board&filter=open%20issue',
);
assert.equal(redirect.headers['cache-control'].value, 'no-store');

const noQueryRedirect = context.cloudfrontHandler({
  request: request('dev.pilo.my', '/workspace/43'),
});
assert.equal(
  noQueryRedirect.headers.location.value,
  'https://pilo.my/workspace/43',
);

const emptyQueryRedirect = context.cloudfrontHandler({
  request: request('dev.pilo.my', '/workspace/44', ''),
});
assert.equal(
  emptyQueryRedirect.headers.location.value,
  'https://pilo.my/workspace/44?',
);

const root = request('pilo.my', '/');
assert.equal(context.cloudfrontHandler({ request: root }).uri, '/index.html');

const route = request('pilo.my', '/settings/profile');
assert.equal(
  context.cloudfrontHandler({ request: route }).uri,
  '/settings/profile/index.html',
);

const trailingSlash = request('pilo.my', '/settings/');
assert.equal(
  context.cloudfrontHandler({ request: trailingSlash }).uri,
  '/settings/index.html',
);

const nextAsset = request('pilo.my', '/_next/static/chunk.js');
assert.equal(
  context.cloudfrontHandler({ request: nextAsset }).uri,
  '/_next/static/chunk.js',
);

const publicAsset = request('pilo.my', '/favicon.ico');
assert.equal(context.cloudfrontHandler({ request: publicAsset }).uri, '/favicon.ico');

console.log('CloudFront frontend redirect and route rewrite are verified.');
