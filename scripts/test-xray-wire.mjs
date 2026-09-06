import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'
import { extname } from 'node:path'

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (
      specifier.startsWith('.') &&
      context.parentURL?.endsWith('.ts') &&
      !extname(specifier)
    )
      return nextResolve(specifier + '.ts', context)
    return nextResolve(specifier, context)
  },
})
const { fromWire, toWire, writePath, applyEffectiveChanges } =
  await import('../src/lib/control-plane/xray-wire.ts')
const {
  runtimeOutboundCatalog: outbound,
  runtimeRuleCatalog: routing,
  runtimeXrayCatalog: global,
  runtimeInboundCatalog: inbound,
  runtimeIndependentInboundCatalog: independent,
} = await import('../src/lib/control-plane/runtime-catalog.ts')
let passed = 0
function check(name, run) {
  run()
  passed++
  console.info('PASS ' + name)
}
function edit(tabs, base, changes, kind = '') {
  return toWire(tabs, { ...fromWire(tabs, base, kind), ...changes }, base, kind)
}

check('user-facing help contains no implementation narrative', () => {
  for (const tabs of [outbound, routing, global, inbound, independent])
    for (const tab of tabs) {
      const descriptions = [
        tab.description,
        ...tab.sections.flatMap((section) => [
          section.description,
          ...section.fields.map((field) => field.description),
        ]),
      ]
      assert.equal(
        descriptions.some((text) =>
          /3x-?ui|xboard|投影|编译|原型|控制面|后端|schema|\bwire\b|运行字段|下发|序列化|表单/i.test(
            text ?? '',
          ),
        ),
        false,
      )
    }
})

check('native catalogs exclude product fields and retired core options', () => {
  const managedKeys = inbound.flatMap((tab) =>
    tab.sections.flatMap((section) => section.fields.map((field) => field.key)),
  )
  for (const key of [
    'enable',
    'remark',
    'settings.clients',
    'settings.encryption',
    'settings.publicKey',
    'sniffing.ipsExcluded',
    'allocate.strategy',
  ])
    assert.equal(managedKeys.includes(key), false, key)
  assert.ok(managedKeys.includes('settings.flow'))
  assert.ok(managedKeys.includes('clientSettings.encryption'))
  const globalKeys = global.flatMap((tab) =>
    tab.sections.flatMap((section) => section.fields.map((field) => field.key)),
  )
  assert.equal(
    globalKeys.some(
      (key) => key.startsWith('api.') || key.startsWith('transport.'),
    ),
    false,
  )
  const protocol = independent
    .flatMap((tab) => tab.sections.flatMap((section) => section.fields))
    .find((field) => field.key === 'protocol')
  assert.ok(protocol.options.some((option) => option.value === 'socks'))
  assert.equal(
    protocol.options.some((option) =>
      ['mtproto', 'amneziawg'].includes(option.value),
    ),
    false,
  )
})

check(
  'source override patches preserve untouched options and remove explicitly cleared fields',
  () => {
    const before = {
      mux: { enabled: true, concurrency: 4 },
      sendThrough: '127.0.0.1',
    }
    assert.deepEqual(applyEffectiveChanges({}, before, before), {})
    assert.deepEqual(
      applyEffectiveChanges({}, before, {
        mux: { enabled: true, concurrency: 8 },
      }),
      { mux: { enabled: true, concurrency: 8 }, sendThrough: null },
    )
  },
)

check('disabling VLESS flow remains an explicit native empty value', () => {
  const base = {
    protocol: 'vless',
    settings: { decryption: 'none', flow: 'xtls-rprx-vision' },
  }
  assert.equal(
    edit(inbound, base, { 'settings.flow': '' }, 'inbound').settings.flow,
    '',
  )
})

check(
  'independent Hysteria selects version 2 and unsupported core fields stay absent',
  () => {
    const result = edit(
      independent,
      { protocol: 'tunnel', tag: 'test', settings: {} },
      { protocol: 'hysteria' },
      'independent-inbound',
    )
    assert.equal(result.settings.version, 2)
    const keys = independent.flatMap((tab) =>
      tab.sections.flatMap((section) =>
        section.fields.map((field) => field.key),
      ),
    )
    for (const key of [
      'settings.subnetIp',
      'settings.subnetCidr',
      'settings.dns',
      'settings.gateway',
      'settings.autoSystemRoutingTable',
      'settings.autoOutboundsInterface',
      'streamSettings.finalmask.quicParams.bbrProfile',
    ])
      assert.equal(keys.includes(key), false, key)
  },
)

check('no-op preserves native fields and optional object shapes', () => {
  const base = {
    tag: 'vless-upstream',
    protocol: 'vless',
    settings: {
      vnext: [
        {
          address: 'example.test',
          port: 443,
          users: [
            {
              id: '11111111-1111-4111-8111-111111111111',
              encryption: 'none',
              level: 3,
            },
          ],
        },
      ],
    },
    streamSettings: {
      network: 'xhttp',
      xhttpSettings: { extra: { future: true } },
    },
  }
  assert.deepEqual(edit(outbound, base, {}, 'outbound'), base)
})
check(
  'VLESS Reverse uses supported simplified settings and preserves credentials',
  () => {
    const base = {
      tag: 'next',
      protocol: 'vless',
      settings: {
        vnext: [
          {
            address: 'example.test',
            port: 443,
            users: [
              {
                id: '11111111-1111-4111-8111-111111111111',
                encryption: 'none',
                level: 3,
              },
            ],
          },
        ],
      },
    }
    const result = edit(
      outbound,
      base,
      { 'settings.reverseTag': 'reverse-in' },
      'outbound',
    )
    assert.equal(result.settings.reverse.tag, 'reverse-in')
    assert.equal(result.settings.level, 3)
    assert.equal(result.settings.address, 'example.test')
    assert.equal(result.settings.vnext, undefined)
  },
)
check(
  'new protocol serializes required default port and VMess user security',
  () => {
    const result = edit(
      outbound,
      { tag: 'next', protocol: 'freedom', settings: {} },
      {
        protocol: 'vmess',
        'settings.address': 'example.test',
        'settings.id': '11111111-1111-4111-8111-111111111111',
      },
      'outbound',
    )
    assert.equal(result.settings.vnext[0].port, 443)
    assert.equal(result.settings.vnext[0].users[0].security, 'auto')
  },
)
check('Policy levels remain a JSON object', () => {
  const result = edit(global, {}, { 'policy.levels.0.handshake': 8 })
  assert.equal(Array.isArray(result.policy.levels), false)
  assert.equal(result.policy.levels['0'].handshake, 8)
})
check('DNS and metrics switches create and remove real objects', () => {
  const result = edit(
    global,
    {},
    {
      'dns.enabled': true,
      'metrics.enabled': true,
      'metrics.listen': '127.0.0.1:42190',
    },
  )
  assert.ok(result.dns)
  assert.equal(result.metrics.listen, '127.0.0.1:42190')
  assert.equal(result.metrics.enabled, undefined)
  assert.equal(edit(global, result, { 'dns.enabled': false }).dns, undefined)
})
check(
  'socket and Happy Eyeballs switches never leak enabled pseudo-fields',
  () => {
    const result = edit(
      outbound,
      { tag: 'next', protocol: 'freedom', settings: {} },
      {
        'streamSettings.sockopt.enabled': true,
        'streamSettings.sockopt.happyEyeballs.enabled': true,
      },
      'outbound',
    )
    assert.ok(result.streamSettings.sockopt.happyEyeballs)
    assert.equal(result.streamSettings.sockopt.enabled, undefined)
    assert.equal(result.streamSettings.sockopt.happyEyeballs.enabled, undefined)
  },
)
check('routing preserves native multi-condition AND and target port', () => {
  const result = edit(
    routing,
    { type: 'field', outboundTag: 'direct' },
    {
      'routing.rule.ip': ['127.0.0.1/32'],
      'routing.rule.domain': ['full:example.test'],
      'routing.rule.port': '443',
      'routing.rule.outboundTag': 'my-outbound',
    },
  )
  assert.deepEqual(result, {
    type: 'field',
    outboundTag: 'my-outbound',
    ip: ['127.0.0.1/32'],
    domain: ['full:example.test'],
    port: '443',
  })
})
check(
  'inbound settings retain unknown extensions during targeted changes',
  () => {
    const result = edit(
      inbound,
      {
        protocol: 'vless',
        port: 12345,
        settings: { decryption: 'none', fallbacks: [{ dest: 80 }] },
        streamSettings: {
          network: 'ws',
          wsSettings: { path: '/old', future: 1 },
        },
      },
      { 'streamSettings.wsSettings.path': '/new' },
      'inbound',
    )
    assert.equal(result.streamSettings.wsSettings.future, 1)
    assert.equal(result.settings.fallbacks[0].dest, 80)
  },
)
check('shared defaults are not silently copied into instance overrides', () => {
  assert.deepEqual(
    applyEffectiveChanges(
      {},
      { dns: { servers: ['localhost'] }, log: { loglevel: 'warning' } },
      { dns: { servers: ['localhost'] }, log: { loglevel: 'error' } },
    ),
    { log: { loglevel: 'error' } },
  )
  assert.deepEqual(
    applyEffectiveChanges({}, { metrics: { listen: ':12345' } }, {}),
    { metrics: null },
  )
})
check('malformed JSON and prototype mutation are rejected', () => {
  assert.throws(() => edit(global, {}, { 'dns.hosts': '{no' }), /JSON/)
  assert.throws(() => writePath({}, '__proto__.polluted', true), /路径/)
})
console.info('Xray adapter: ' + passed + ' passed')
