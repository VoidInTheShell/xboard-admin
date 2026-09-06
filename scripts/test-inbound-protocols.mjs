import assert from 'node:assert/strict'
import { extname } from 'node:path'
import { registerHooks } from 'node:module'

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

const {
  ensureIndependentInboundTag,
  fromWire,
  generateInboundTag,
  toWire,
} = await import('../src/lib/control-plane/xray-wire.ts')
const {
  catalogForProtocol,
  runtimeIndependentInboundCatalog: independent,
  runtimeOutboundCatalog: outbound,
} = await import('../src/lib/control-plane/runtime-catalog.ts')

let passed = 0
function check(name, run) {
  run()
  passed += 1
  console.info('PASS ' + name)
}

const fields = (tabs) =>
  tabs.flatMap((tab) =>
    tab.sections.flatMap((section) => section.fields),
  )

function edit(tabs, base, changes, kind, context) {
  return toWire(
    tabs,
    { ...fromWire(tabs, base, kind, context), ...changes },
    base,
    kind,
    context,
  )
}

check('new independent inbound does not silently default to VLESS', () => {
  const base = { listen: '127.0.0.1', port: 30081, settings: {} }
  const values = fromWire(independent, base, 'independent-inbound')
  assert.equal(values.protocol, '')
  assert.throws(
    () => toWire(independent, values, base, 'independent-inbound'),
    /必须先选择协议/,
  )
})

check('generated tags avoid aliases, duplicate ports and unsaved siblings', () => {
  assert.equal(
    generateInboundTag('dokodemo-door', '0443', [
      'tunnel-443',
      { protocol: 'tunnel', port: 443, tag: '' },
      { protocol: 'vless', port: 443, tag: 'vless-443' },
    ]),
    'tunnel-443-3',
  )
  assert.throws(() => generateInboundTag('tunnel', -1), /监听端口/)
  assert.throws(() => generateInboundTag('', 443), /选择协议/)
})

check('editing an explicit inbound tag keeps its exact spelling', () => {
  const base = {
    protocol: 'tunnel',
    tag: '  Native-Tunnel  ',
    port: 30081,
    settings: {},
  }
  const result = edit(
    independent,
    base,
    { port: 30082 },
    'independent-inbound',
    {
      existingInbounds: [base, { protocol: 'tunnel', port: 30082, tag: 'tunnel-30082' }],
      editingIndex: 0,
    },
  )
  assert.equal(result.tag, base.tag)
})

check('empty independent tags are generated consistently for save and check', () => {
  const base = {
    protocol: 'tunnel',
    tag: '',
    listen: '127.0.0.1',
    port: 30081,
    settings: {},
  }
  const context = {
    existingInbounds: [
      { protocol: 'tunnel', tag: 'tunnel-30081' },
      { protocol: 'tunnel', tag: 'tunnel-30081-2' },
    ],
    editingIndex: 2,
  }
  const values = fromWire(independent, base, 'independent-inbound', context)
  const checked = toWire(
    independent,
    values,
    base,
    'independent-inbound',
    context,
  )
  const saved = toWire(
    independent,
    values,
    base,
    'independent-inbound',
    context,
  )
  assert.equal(checked.tag, 'tunnel-30081-3')
  assert.deepEqual(saved, checked)
})

check('protocol-scoped catalogs show only applicable Hysteria controls', () => {
  const hysteriaInbound = catalogForProtocol(independent, 'hysteria', {
    lockProtocol: true,
  })
  const hysteriaFields = fields(hysteriaInbound)
  assert.equal(hysteriaFields.some((field) => field.key === 'protocol'), false)
  assert.ok(hysteriaFields.some((field) => field.key === 'settings.version'))
  const network = hysteriaFields.find(
    (field) => field.key === 'streamSettings.network',
  )
  assert.deepEqual(network.options, [
    { value: 'hysteria', label: 'Hysteria / QUIC' },
  ])
  assert.equal(network.defaultValue, 'hysteria')
  const security = hysteriaFields.find(
    (field) => field.key === 'streamSettings.security',
  )
  assert.deepEqual(security.options, [{ value: 'tls', label: 'TLS' }])
  assert.equal(
    hysteriaInbound.find((tab) => tab.id === 'security').title,
    'TLS',
  )
  assert.equal(
    hysteriaInbound.some((tab) =>
      `${tab.title} ${tab.description ?? ''}`.match(/REALITY/i),
    ),
    false,
  )

  const hysteriaOutbound = catalogForProtocol(outbound, 'hysteria', {
    lockProtocol: true,
  })
  const outboundFields = fields(hysteriaOutbound)
  const outboundNetwork = outboundFields.find(
    (field) => field.key === 'streamSettings.network',
  )
  assert.deepEqual(outboundNetwork.options, [
    { value: 'hysteria', label: 'Hysteria / QUIC' },
  ])
  const outboundSecurity = outboundFields.find(
    (field) => field.key === 'streamSettings.security',
  )
  assert.deepEqual(outboundSecurity.options, [{ value: 'tls', label: 'TLS' }])
  assert.equal(
    hysteriaOutbound.find((tab) => tab.id === 'outbound-security').description,
    'Hysteria 使用 TLS 安全层及证书、握手参数。',
  )
  assert.equal(
    hysteriaOutbound.some((tab) =>
      `${tab.title} ${tab.description ?? ''}`.match(/REALITY/i),
    ),
    false,
  )
})

check('Hysteria serialization forces version 2, hysteria transport and TLS', () => {
  const tabs = catalogForProtocol(independent, 'hysteria', {
    lockProtocol: true,
  })
  const base = {
    protocol: 'hysteria',
    tag: 'hy-30081',
    port: 30081,
    settings: { clients: [{ auth: 'token', email: 'user@example.test' }] },
    streamSettings: {
      network: 'tcp',
      security: 'none',
      hysteriaSettings: { udpIdleTimeout: 60 },
      futureTransportExtension: { keep: true },
    },
  }
  const result = edit(tabs, base, {}, 'independent-inbound', {
    defaultProtocol: 'hysteria',
  })
  assert.equal(result.protocol, 'hysteria')
  assert.equal(result.settings.version, 2)
  assert.equal(result.streamSettings.network, 'hysteria')
  assert.equal(result.streamSettings.security, 'tls')
  assert.equal(result.streamSettings.hysteriaSettings.version, 2)
  assert.deepEqual(result.streamSettings.futureTransportExtension, { keep: true })
})

check('new Hysteria outbound serializes numeric versions and fixed transport', () => {
  const tabs = catalogForProtocol(outbound, 'hysteria', { lockProtocol: true })
  const base = { tag: 'hy-out', settings: {}, streamSettings: {} }
  const context = { defaultProtocol: 'hysteria' }
  const values = {
    ...fromWire(tabs, base, 'outbound', context),
    'settings.address': 'upstream.example.test',
    'settings.port': 443,
  }
  assert.equal(values.protocol, 'hysteria')
  const result = toWire(tabs, values, base, 'outbound', context)
  assert.equal(result.protocol, 'hysteria')
  assert.equal(result.settings.version, 2)
  assert.equal(result.streamSettings.network, 'hysteria')
  assert.equal(result.streamSettings.security, 'tls')
  assert.equal(result.streamSettings.hysteriaSettings.version, 2)
  assert.equal(typeof result.streamSettings.hysteriaSettings.version, 'number')
})

check('outbound protocol switches remap credentials without mixing settings branches', () => {
  const base = {
    protocol: 'vmess',
    tag: 'upstream-switch',
    settings: {
      vnext: [
        {
          address: 'vmess.example.test',
          port: 443,
          users: [
            {
              id: '11111111-1111-4111-8111-111111111111',
              security: 'auto',
              level: 0,
              email: 'user@example.test',
            },
          ],
        },
      ],
      futureSettingsExtension: { keep: true },
    },
    streamSettings: { network: 'ws', wsSettings: { path: '/proxy' } },
  }
  const values = {
    ...fromWire(outbound, base, 'outbound'),
    protocol: 'vless',
    'settings.address': 'vless.example.test',
    'settings.id': '22222222-2222-4222-8222-222222222222',
    'settings.encryption': 'none',
  }
  const result = toWire(outbound, values, base, 'outbound')
  assert.equal(result.protocol, 'vless')
  assert.equal(result.settings.vnext, undefined)
  assert.equal(result.settings.address, 'vless.example.test')
  assert.equal(result.settings.port, 443)
  assert.equal(result.settings.id, '22222222-2222-4222-8222-222222222222')
  assert.equal(result.settings.encryption, 'none')
  assert.deepEqual(result.settings.futureSettingsExtension, { keep: true })
})

check('switching VLESS to Hysteria clears known incompatible fields only', () => {
  const base = {
    protocol: 'vless',
    tag: 'switch-me',
    port: 30081,
    settings: {
      decryption: 'none',
      flow: 'xtls-rprx-vision',
      clients: [{ id: '11111111-1111-4111-8111-111111111111', flow: '' }],
      futureSettingsExtension: { keep: true },
      fallbacks: [{ dest: 8080 }],
    },
    streamSettings: {
      network: 'ws',
      security: 'tls',
      wsSettings: { path: '/old', future: true },
      futureTransportExtension: { keep: true },
    },
  }
  const values = {
    ...fromWire(independent, base, 'independent-inbound'),
    protocol: 'hysteria',
  }
  const result = toWire(
    independent,
    values,
    base,
    'independent-inbound',
    { defaultProtocol: 'hysteria' },
  )
  assert.equal(result.protocol, 'hysteria')
  assert.equal(result.settings.decryption, undefined)
  assert.equal(result.settings.flow, undefined)
  assert.equal(result.settings.fallbacks, undefined)
  assert.equal(result.settings.clients, undefined)
  assert.equal(result.streamSettings.wsSettings.path, undefined)
  assert.equal(result.streamSettings.wsSettings.future, true)
  assert.equal(result.streamSettings.network, 'hysteria')
  assert.deepEqual(result.settings.futureSettingsExtension, { keep: true })
  assert.deepEqual(result.streamSettings.futureTransportExtension, { keep: true })
})

check('switching Hysteria to VLESS clears Hysteria-only fields only', () => {
  const base = {
    protocol: 'hysteria',
    tag: 'switch-back',
    port: 30081,
    settings: {
      version: 2,
      clients: [{ auth: 'token' }],
      futureSettingsExtension: { keep: true },
    },
    streamSettings: {
      network: 'hysteria',
      security: 'tls',
      hysteriaSettings: {
        version: 2,
        auth: 'transport-token',
        futureTransportExtension: { keep: true },
      },
      finalMask: { udp: [{ type: 'salamander', settings: {} }] },
    },
  }
  const values = {
    ...fromWire(independent, base, 'independent-inbound'),
    protocol: 'vless',
    'settings.decryption': 'none',
    'settings.clients':
      '[{"id":"11111111-1111-4111-8111-111111111111","flow":""}]',
  }
  const result = toWire(
    independent,
    values,
    base,
    'independent-inbound',
  )
  assert.equal(result.protocol, 'vless')
  assert.equal(result.settings.version, undefined)
  assert.equal(result.settings.decryption, 'none')
  assert.deepEqual(result.settings.clients, [
    { id: '11111111-1111-4111-8111-111111111111', flow: '' },
  ])
  assert.equal(result.streamSettings.network, 'tcp')
  assert.equal(result.streamSettings.hysteriaSettings.version, undefined)
  assert.equal(result.streamSettings.hysteriaSettings.auth, undefined)
  assert.deepEqual(
    result.streamSettings.hysteriaSettings.futureTransportExtension,
    { keep: true },
  )
  assert.equal(result.streamSettings.finalMask.udp, undefined)
  assert.deepEqual(result.settings.futureSettingsExtension, { keep: true })
})

check('unchanged native extensions survive a protocol-scoped form', () => {
  const tabs = catalogForProtocol(independent, 'tunnel', { lockProtocol: true })
  const base = {
    protocol: 'tunnel',
    tag: 'native-tunnel',
    port: 30082,
    settings: { rewriteAddress: '127.0.0.1', unknown: { keep: true } },
    streamSettings: { futureTransportExtension: { keep: true } },
  }
  assert.deepEqual(edit(tabs, base, {}, 'independent-inbound'), base)
})

check('independent inbound keeps protocol selection while filtering its controls', () => {
  const tabs = catalogForProtocol(independent, 'hysteria')
  const selector = fields(tabs).find((field) => field.key === 'protocol')
  assert.ok(selector.options.some((option) => option.value === 'vless'))
  assert.ok(selector.options.some((option) => option.value === 'tunnel'))
  assert.equal(fields(tabs).some((field) => field.key === 'settings.decryption'), false)
})

console.info('Inbound protocol adapter: ' + passed + ' passed')
