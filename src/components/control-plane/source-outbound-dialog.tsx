import { WireDialog } from './wire-editor'
import { useAdminApi } from '@/lib/auth'
import type {
  OutboundCandidate,
  RuntimeNode,
} from '@/lib/control-plane/runtime-api'
import type { CatalogTab } from '@/lib/control-plane/catalog-types'
import { applyEffectiveChanges, object } from '@/lib/control-plane/xray-wire'

export function SourceOutboundDialog({
  candidate,
  nodes,
  onClose,
  onSaved,
}: {
  candidate: Partial<OutboundCandidate>
  nodes: RuntimeNode[]
  onClose: () => void
  onSaved: () => void
}) {
  const api = useAdminApi()
  const overrides = { ...candidate.config_override }
  delete overrides.tag
  delete overrides.protocol
  const tabs: CatalogTab[] = [
    {
      id: 'source',
      title: '来源与凭据',
      sections: [
        {
          id: 'source',
          title: '使用已有入站',
          fields: [
            { key: 'name', label: '出站名称', control: 'text', required: true },
            {
              key: 'source_node_id',
              label: '来源节点',
              control: 'select',
              options: nodes
                .filter((node) =>
                  [
                    'vless',
                    'vmess',
                    'trojan',
                    'shadowsocks',
                    'socks',
                    'http',
                  ].includes(node.type),
                )
                .map((node) => ({
                  value: String(node.id),
                  label: node.name + ' · ' + node.type,
                })),
              required: true,
            },
            {
              key: 'resolution_mode',
              label: '参数更新方式',
              control: 'select',
              options: [
                { value: 'pinned', label: '使用保存时的参数' },
                { value: 'live', label: '随来源节点更新' },
              ],
            },
            {
              key: 'tag',
              label: '出站 Tag',
              control: 'text',
              placeholder: '留空自动生成',
            },
            {
              key: 'service_credential',
              label: '连接凭据',
              control: 'code',
              language: 'json',
              sensitive: true,
              placeholder: '{"uuid":"…"}',
              description:
                '填写来源入站可用的 UUID、用户名或密码。同一来源编辑时留空可保留已有凭据；切换来源后请重新填写。',
            },
            { key: 'enabled', label: '允许绑定', control: 'switch' },
          ],
        },
      ],
    },
    {
      id: 'advanced',
      title: '高级连接参数',
      sections: [
        {
          id: 'overrides',
          title: '自定义连接方式',
          fields: [
            {
              key: 'overrides',
              label: '连接参数',
              control: 'code',
              language: 'json',
              placeholder: '{}',
              description:
                '可设置 sendThrough、targetStrategy、streamSettings、proxySettings 和 mux。留空使用来源节点的参数。',
            },
          ],
        },
      ],
    },
  ]
  async function submit(value: Record<string, unknown>, validateOnly: boolean) {
    if (!String(value.name ?? '').trim()) throw new Error('请输入出站名称')
    const source = nodes.find(
      (node) => node.id === Number(value.source_node_id),
    )
    if (!source) throw new Error('请选择来源节点')
    if (
      value.overrides !== undefined &&
      (value.overrides === null ||
        Array.isArray(value.overrides) ||
        typeof value.overrides !== 'object')
    )
      throw new Error('连接参数必须是 JSON 对象')
    const patch = applyEffectiveChanges(
      {},
      overrides,
      object(value.overrides),
    )
    const editingExisting = candidate.id !== undefined && candidate.id !== null
    const sourceChanged =
      editingExisting && Number(candidate.source_node_id) !== source.id
    if (
      (!editingExisting || sourceChanged) &&
      Object.keys(object(value.service_credential)).length === 0
    )
      throw new Error(
        sourceChanged ? '切换来源后请填写连接凭据' : '请填写连接凭据',
      )
    await api.post(
      validateOnly ? 'server/outbound/validate' : 'server/outbound/save',
      {
        id: candidate.id,
        name: value.name,
        enabled: value.enabled,
        source_type: 'server',
        source_node_id: source.id,
        resolution_mode: value.resolution_mode,
        ...(value.service_credential
          ? { service_credential: value.service_credential }
          : {}),
        config_patch: {
          ...patch,
          tag: String(value.tag ?? '').trim() || null,
        },
      },
    )
    if (!validateOnly) onSaved()
  }
  return (
    <WireDialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={candidate.id ? '编辑来源出站' : '从已有节点添加出站'}
      description="复用节点的连接地址、传输和安全参数。"
      tabs={tabs}
      errorPrefix="config"
      value={{
        name: candidate.name ?? '',
        source_node_id: String(candidate.source_node_id ?? ''),
        resolution_mode: candidate.resolution_mode ?? 'pinned',
        tag: candidate.config_override?.tag ?? '',
        enabled: candidate.enabled ?? true,
        overrides,
      }}
      onValidate={(value) => submit(value, true)}
      onSave={(value) => submit(value, false)}
    />
  )
}
