import type { CatalogTab } from './catalog-types'
import type { JsonObject } from './xray-wire'

export function certificateConfigForSave(
  value: JsonObject,
  nodeId: number,
): JsonObject {
  const next = { ...value }
  delete next.mode
  if (next.cert_mode === 'file') {
    const directory = `/etc/xboard-node/certs/node-${nodeId}`
    if (!String(next.cert_file ?? '').trim())
      next.cert_file = `${directory}/cert.pem`
    if (!String(next.key_file ?? '').trim())
      next.key_file = `${directory}/key.pem`
  }
  return next
}

export function certificateCatalog(nodeId: number): CatalogTab[] {
  const directory = `/etc/xboard-node/certs/node-${nodeId}`
  return [
    {
      id: 'certificate',
      title: '证书',
      sections: [
        {
          id: 'certificate',
          title: '实例证书',
          fields: [
            {
              key: 'cert_mode',
              label: '证书模式',
              control: 'select',
              span: 2,
              options: [
                { value: 'none', label: '不配置证书' },
                { value: 'file', label: '节点上的证书文件' },
                { value: 'content', label: '填写证书内容' },
                { value: 'http', label: 'HTTP 自动验证' },
                { value: 'dns', label: 'DNS 自动验证' },
                { value: 'self', label: '自签名证书' },
              ],
            },
            {
              key: 'domain',
              label: '证书域名',
              control: 'text',
              showWhen: { field: 'cert_mode', equals: ['http', 'dns', 'self'] },
            },
            {
              key: 'cert_file',
              label: '证书文件',
              control: 'text',
              defaultValue: `${directory}/cert.pem`,
              description:
                '将证书放到节点上的此路径；也可填写已有证书的完整路径。',
              showWhen: { field: 'cert_mode', equals: 'file' },
            },
            {
              key: 'key_file',
              label: '私钥文件',
              control: 'text',
              defaultValue: `${directory}/key.pem`,
              description: '填写与证书配对的私钥路径，并确保节点进程可读取。',
              showWhen: { field: 'cert_mode', equals: 'file' },
            },
            {
              key: 'email',
              label: 'ACME 邮箱',
              control: 'text',
              showWhen: { field: 'cert_mode', equals: ['http', 'dns'] },
            },
            {
              key: 'dns_provider',
              label: 'DNS 提供商',
              control: 'text',
              showWhen: { field: 'cert_mode', equals: 'dns' },
            },
            {
              key: 'dns_env',
              label: 'DNS 验证配置',
              control: 'code',
              language: 'json',
              sensitive: true,
              showWhen: { field: 'cert_mode', equals: 'dns' },
            },
            {
              key: 'http_port',
              label: 'HTTP 验证端口',
              control: 'number',
              defaultValue: 80,
              showWhen: { field: 'cert_mode', equals: 'http' },
            },
            {
              key: 'cert_content',
              label: 'PEM 证书内容',
              control: 'textarea',
              sensitive: true,
              showWhen: { field: 'cert_mode', equals: 'content' },
            },
            {
              key: 'key_content',
              label: 'PEM 私钥内容',
              control: 'textarea',
              sensitive: true,
              showWhen: { field: 'cert_mode', equals: 'content' },
            },
          ],
        },
      ],
    },
  ]
}
