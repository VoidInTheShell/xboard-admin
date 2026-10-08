import type { JsonObject } from './xray-wire'

// Keep preset rules editable and opt-in. Existing policy is never overwritten.
export const routingPresets: { label: string; rule: JsonObject }[] = [
  { label: '中国大陆 IP', rule: { type: 'field', ip: ['geoip:cn'], outboundTag: 'block', enabled: false } },
  { label: '广告域名', rule: { type: 'field', domain: ['geosite:category-ads-all'], outboundTag: 'block', enabled: false } },
  { label: '中国大陆域名', rule: { type: 'field', domain: ['geosite:cn'], outboundTag: 'block', enabled: false } },
  { label: 'Google 大陆域名', rule: { type: 'field', domain: [
    'geosite:google@cn', 'geosite:google-play@cn', 'domain:google.cn',
    'domain:googleapis.cn', 'domain:googlecnapps.cn', 'domain:gstatic.cn',
    'domain:gstaticcnapps.cn', 'domain:googleapis-cn.com', 'domain:googleapps-cn.com',
    'domain:gstatic-cn.com', 'domain:googleflights-cn.net', 'domain:google-analytics-cn.com',
    'domain:googleadservices-cn.com', 'domain:googlesyndication-cn.com',
    'domain:googletagmanager-cn.com', 'domain:googletagservices-cn.com',
    'domain:googletraveladservices-cn.com', 'domain:googleoptimize-cn.com',
    'domain:googleads-cn.com', 'domain:googlevads-cn.com',
  ], outboundTag: 'block', enabled: false } },
]

export function withRoutingPresets(rules: JsonObject[]): JsonObject[] {
  const next = [...rules]
  const covers = (rule: JsonObject, preset: JsonObject) => rule.outboundTag === preset.outboundTag
    && ['ip', 'domain'].every(key => !Array.isArray(preset[key]) ||
      (Array.isArray(rule[key]) && (preset[key] as unknown[]).every(value => (rule[key] as unknown[]).includes(value))))
  for (const { rule } of routingPresets) {
    if (!next.some(item => covers(item, rule))) next.push(structuredClone(rule))
  }
  // Exact health-check domains must precede mainland IP/domain rules.
  const health = ['full:www.gstatic.com', 'full:connectivitycheck.gstatic.com']
  const missing = health.filter(domain => !next.slice(0, next.findIndex(rule => rule.outboundTag === 'block'))
    .some(rule => rule.outboundTag === 'direct' && rule.enabled !== false && Array.isArray(rule.domain) && rule.domain.includes(domain)))
  if (missing.length) next.unshift({ type: 'field', domain: missing, outboundTag: 'direct', enabled: true })
  return next
}
