import assert from 'node:assert/strict'
import {
  validateLogoFile,
  logoCropBounds,
  CLIENT_LOGO_SIZE,
} from '../src/lib/client-logo.ts'
import {
  certificateCatalog,
  certificateConfigForSave,
} from '../src/lib/control-plane/certificate-catalog.ts'
import { fromWire, toWire } from '../src/lib/control-plane/xray-wire.ts'
import {
  configIssues,
  validateConfigFields,
} from '../src/lib/control-plane/config-validation.ts'

for (const type of ['image/png', 'image/jpeg', 'image/webp'])
  validateLogoFile({ type, size: 1024 })
for (const input of [
  { type: 'text/plain', size: 10 },
  { type: 'image/png', size: 0 },
  { type: 'image/jpeg', size: 2097153 },
])
  assert.throws(() => validateLogoFile(input))
assert.equal(CLIENT_LOGO_SIZE, 256)
assert.deepEqual(
  logoCropBounds(800, 600, {
    unit: '%',
    x: 25,
    y: 10,
    width: 50,
    height: 66.66666666666667,
  }),
  { x: 200, y: 60, side: 400 },
)
for (const [w, h, crop] of [
  [1e5, 1e5, { unit: '%', x: 0, y: 0, width: 100, height: 100 }],
  [800, 600, { unit: '%', x: 90, y: 0, width: 50, height: 50 }],
  [800, 600, { unit: '%', x: 0, y: 0, width: NaN, height: 50 }],
])
  assert.throws(() => logoCropBounds(w, h, crop))
console.log(
  'PASS logo accepted formats, byte/pixel limits and square crop bounds',
)
const tabs = certificateCatalog(99)
const values = fromWire(tabs, { cert_mode: 'file' })
const saved = certificateConfigForSave(
  toWire(tabs, values, { cert_mode: 'file' }),
  99,
)
assert.equal(saved.cert_file, '/etc/xboard-node/certs/node-99/cert.pem')
assert.equal(saved.key_file, '/etc/xboard-node/certs/node-99/key.pem')
assert.equal(saved.http_port, undefined)
const existing = {
  cert_mode: 'file',
  cert_file: '/custom/site.crt',
  key_file: '/custom/site.key',
}
assert.deepEqual(toWire(tabs, fromWire(tabs, existing), existing), existing)
const content = toWire(
  tabs,
  fromWire(tabs, {
    cert_mode: 'content',
    cert_content: 'cert',
    key_content: 'key',
  }),
  { cert_mode: 'content', cert_content: 'cert', key_content: 'key' },
)
assert.equal(content.cert_file, undefined)
assert.equal(content.key_file, undefined)
assert.equal(content.email, undefined)
console.log(
  'PASS certificate default paths, existing paths and content-mode field isolation',
)

const validationTabs = [
  {
    id: 'basic',
    title: '基础',
    sections: [
      {
        id: 'basic',
        title: '基础',
        fields: [
          { key: 'port', label: '监听端口', control: 'number' },
          { key: 'protocol', label: '协议', control: 'select' },
          {
            key: 'settings.clients',
            label: '连接用户',
            control: 'code',
            language: 'json',
            showWhen: { field: 'protocol', equals: 'vless' },
          },
          {
            key: 'clientSettings.encryption',
            label: '客户端参数',
            control: 'text',
          },
        ],
      },
    ],
  },
]
assert.throws(
  () =>
    validateConfigFields(
      validationTabs,
      { protocol: 'vless', port: -1 },
      'independent-inbound',
    ),
  (error) => error.fieldErrors.port.length > 0,
)
validateConfigFields(
  validationTabs,
  { protocol: 'vless', port: 0, listen: '/run/proxy.sock' },
  'independent-inbound',
)
validateConfigFields(
  validationTabs,
  { protocol: 'tunnel', port: 443, 'settings.clients': 'not-json' },
  'independent-inbound',
)
assert.throws(
  () =>
    validateConfigFields(validationTabs, {
      protocol: 'vless',
      port: 443,
      'settings.clients': '{bad-secret',
    }),
  (error) => !JSON.stringify(error.fieldErrors).includes('bad-secret'),
)
console.log(
  'PASS preflight validates visible fields, Unix sockets and JSON without echoing input',
)
const issue = configIssues(
  {
    fieldErrors: {
      'xray_config.inbounds.2.settings.clients.0.id': ['请填写用户标识。'],
    },
  },
  validationTabs,
  { protocol: 'vless' },
  'xray_config.inbounds.2',
)[0]
assert.equal(issue.field, 'settings.clients')
assert.equal(issue.path, 'xray_config.inbounds.2.settings.clients.0.id')
assert.equal(
  configIssues(
    {
      fieldErrors: {
        'client_settings.encryption.encryption': ['缺少客户端参数'],
      },
    },
    validationTabs,
    { protocol: 'vless' },
  )[0].field,
  'clientSettings.encryption',
)
assert.deepEqual(
  configIssues(
    {
      fieldErrors: {
        'xray_config.inbounds.2.settings.clients.0.id': ['请填写用户标识。'],
        xray_config: ['Xray 配置无效。'],
      },
    },
    validationTabs,
    { protocol: 'vless' },
    'xray_config.inbounds.2',
  ).map(({ path }) => path),
  ['xray_config.inbounds.2.settings.clients.0.id'],
)
assert.deepEqual(
  configIssues(
    {
      fieldErrors: {
        'cert_config.cert_content': ['证书内容必须包含完整 PEM 证书。'],
        xray_config: ['配置检查未通过，请修正标记字段后重试。'],
      },
    },
    tabs,
    { cert_mode: 'content', cert_content: 'invalid', key_content: 'invalid' },
    'cert_config',
  ).map(({ path }) => path),
  ['cert_config.cert_content'],
)
assert.equal(
  configIssues(
    { fieldErrors: { config_patch: ['出站覆盖配置格式错误。'] } },
    [
      {
        id: 'source',
        label: '来源',
        sections: [
          {
            title: '覆盖',
            fields: [{ key: 'overrides', label: '覆盖配置', control: 'code' }],
          },
        ],
      },
    ],
    {},
  )[0].field,
  'overrides',
)
console.log(
  'PASS backend paths locate exact fields and suppress broader compatibility errors',
)
assert.throws(
  () =>
    validateConfigFields(
      tabs,
      { cert_mode: 'content', cert_content: '', key_content: '' },
      'certificate',
    ),
  (error) => Object.keys(error.fieldErrors).length === 2,
)
validateConfigFields(
  tabs,
  { cert_mode: 'none', cert_content: '', key_content: '' },
  'certificate',
)
console.log(
  'PASS certificate mode requires both PEM fields and ignores inactive fields',
)
