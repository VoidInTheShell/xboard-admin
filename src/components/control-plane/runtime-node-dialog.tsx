import * as React from 'react'
import { toast } from 'sonner'
import { useAdminApi } from '@/lib/auth'
import { getErrorMessage, useAdminQuery } from '@/hooks/use-admin-query'
import type { RuntimeNode } from '@/lib/control-plane/runtime-api'
import { object } from '@/lib/control-plane/xray-wire'
import {
  certificateRequirementFor,
  type CertificateSelection,
} from '@/lib/control-plane/certificate-types'
import { CertificateSelector } from '@/components/control-plane/certificate-selector'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Field,
  FieldGroup,
  FieldLabel,
  FieldDescription,
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectGroup,
  SelectItem,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Checkbox } from '@/components/ui/checkbox'
import { Plus, Trash2 } from 'lucide-react'

function inferredSecurity(settings: Record<string, unknown>) {
  if (String(settings.security ?? '').trim()) return String(settings.security)
  return settings.tls && settings.tls !== 0 && settings.tls !== false ? 'tls' : 'none'
}

function selectionFromNode(node?: RuntimeNode): CertificateSelection | null {
  if (!node) return null
  const mode = String(node.certificate_ref_mode ?? '')
  const certificateId = String(node.certificate_id ?? '')
  const certificatePath = String(node.certificate_path ?? '')
  const privateKeyPath = String(node.private_key_path ?? '')
  if (mode === 'path' && (certificatePath || privateKeyPath))
    return {
      mode: 'path',
      certificateId: certificateId || `path:${certificatePath}:${privateKeyPath}`,
      certificatePath,
      privateKeyPath,
    }
  return certificateId ? { mode: 'server_certificate', certificateId } : null
}

function certificateRequirementForDraft(draft: Record<string, unknown>) {
  const settings = object(draft.protocol_settings)
  return certificateRequirementFor(draft.type, draft.security ?? inferredSecurity(settings), settings.network)
}

function certificateFieldVisible(draft: Record<string, unknown>) {
  const settings = object(draft.protocol_settings)
  const security = String(draft.security ?? inferredSecurity(settings)).trim().toLowerCase()
  const requirement = certificateRequirementForDraft(draft)
  return requirement === 'required' || (requirement === 'conditional' && security === 'tls')
}

function certificateFieldRequired(draft: Record<string, unknown>) {
  return certificateRequirementForDraft(draft) === 'required'
}

export function RuntimeNodeDialog({
  node,
  machineId,
  onClose,
  onSaved,
  business = false,
}: {
  node?: RuntimeNode
  machineId?: number
  onClose: () => void
  onSaved: () => void
  business?: boolean
}) {
  const api = useAdminApi()
  const groups = useAdminQuery(
    React.useCallback(
      (signal) =>
        api.get<{ id: number; name: string }[]>(
          'server/group/fetch',
          undefined,
          signal,
        ),
      [api],
    ),
  )
  const [draft, setDraft] = React.useState<Record<string, unknown>>(() =>
    node
      ? {
          ...node,
          group_ids: Array.isArray(node.group_ids)
            ? node.group_ids.map(Number)
            : [],
          security: String(node.security ?? inferredSecurity(object(node.protocol_settings))),
        }
      : {
          name: '',
          type: 'vless',
          machine_id: machineId,
          host: '127.0.0.1',
          port: 443,
          server_port: 30080,
          enabled: true,
          show: 1,
          rate: 1,
          group_ids: [],
          transfer_enable: 0,
          tags: [],
          security: 'none',
          certificate_id: null,
          certificate_ref_mode: 'server_certificate',
          protocol_settings: { tls: 0, network: 'tcp' },
        },
  )
  const [certificateSelection, setCertificateSelection] = React.useState<CertificateSelection | null>(() => selectionFromNode(node))
  const [busy, setBusy] = React.useState(false)
  const update = (key: string, value: unknown) =>
    setDraft((current) => ({ ...current, [key]: value }))
  async function save() {
    setBusy(true)
    try {
      if (!String(draft.name).trim()) throw new Error('请输入实例名称')
      const protocol = object(draft.protocol_settings)
      const security = String(draft.security ?? inferredSecurity(protocol))
      const requirement = certificateRequirementFor(draft.type, security, protocol.network)
      const activeCertificateSelection = requirement === 'none' ? null : certificateSelection
      if (requirement === 'required' && !activeCertificateSelection)
        throw new Error('当前协议和安全模式需要选择服务器证书。')
      if (activeCertificateSelection?.mode === 'path' && (!activeCertificateSelection.certificatePath.trim() || !activeCertificateSelection.privateKeyPath.trim()))
        throw new Error('证书路径模式需要同时填写证书和私钥路径。')
      const payload = {
        ...draft,
        show: Number(Boolean(draft.show)),
        security,
        protocol_settings: { ...protocol, security },
        certificate_ref_mode: activeCertificateSelection?.mode ?? null,
        certificate_id: activeCertificateSelection?.certificateId ?? null,
        ...(activeCertificateSelection?.mode === 'path'
          ? {
              certificate_path: activeCertificateSelection.certificatePath,
              private_key_path: activeCertificateSelection.privateKeyPath,
            }
          : {}),
        port: Number(draft.port),
        server_port: Number(draft.server_port),
        rate: Number(draft.rate),
        transfer_enable: Number(draft.transfer_enable ?? 0),
      }
      await api.post('server/manage/save', payload)
      toast.success('节点已保存')
      onSaved()
      onClose()
    } catch (error) {
      toast.error(getErrorMessage(error))
    } finally {
      setBusy(false)
    }
  }
  return (
    <Dialog open onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {business ? '节点业务属性' : node ? '编辑运行实例' : '新增运行实例'}
          </DialogTitle>
          <DialogDescription>
            {business
              ? '配置订阅可见性、权限和计费策略。'
              : '设置入站协议、监听端口和发布地址。'}
          </DialogDescription>
        </DialogHeader>
        <FieldGroup className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="node-name">名称</FieldLabel>
            <Input
              id="node-name"
              value={String(draft.name ?? '')}
              onChange={(event) => update('name', event.target.value)}
            />
          </Field>
          {!business && (
            <Field>
              <FieldLabel htmlFor="node-protocol">协议</FieldLabel>
              <Select
                value={String(draft.type)}
                disabled={Boolean(node)}
                onValueChange={(value) => {
                  update('type', value)
                  update(
                    'protocol_settings',
                    value === 'shadowsocks'
                      ? { cipher: 'aes-128-gcm' }
                      : value === 'hysteria'
                        ? { version: 2, tls: {}, bandwidth: { up: 0, down: 0 } }
                        : { tls: 0, network: 'tcp' },
                  )
                  update('security', value === 'hysteria' ? 'tls' : 'none')
                }}
              >
                <SelectTrigger id="node-protocol">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {[
                      'vless',
                      'vmess',
                      'trojan',
                      'shadowsocks',
                      'socks',
                      'http',
                      'hysteria',
                    ].map((value) => (
                      <SelectItem key={value} value={value}>
                        {value}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
          )}
          {!business && (
            <Field>
              <FieldLabel htmlFor="node-security">安全模式</FieldLabel>
              <Select
                value={String(draft.security ?? inferredSecurity(object(draft.protocol_settings)))}
                onValueChange={(value) => {
                  update('security', value)
                  update('protocol_settings', {
                    ...object(draft.protocol_settings),
                    security: value,
                    tls: value === 'tls' ? 1 : 0,
                  })
                }}
              >
                <SelectTrigger id="node-security"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="none">不启用 TLS</SelectItem>
                    <SelectItem value="tls">TLS</SelectItem>
                    <SelectItem value="reality">REALITY</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
              <FieldDescription>选择 REALITY 或不启用 TLS 时，不要求服务器证书。</FieldDescription>
            </Field>
          )}
          <Field>
            <FieldLabel htmlFor="node-host">发布地址</FieldLabel>
            <Input
              id="node-host"
              value={String(draft.host ?? '')}
              onChange={(event) => update('host', event.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="node-port">发布端口</FieldLabel>
            <Input
              id="node-port"
              type="number"
              min={1}
              max={65535}
              value={String(draft.port ?? '')}
              onChange={(event) => update('port', event.target.value)}
            />
          </Field>
          {!business && (
            <Field>
              <FieldLabel htmlFor="node-listen-port">监听端口</FieldLabel>
              <Input
                id="node-listen-port"
                type="number"
                min={1}
                max={65535}
                value={String(draft.server_port ?? draft.port)}
                onChange={(event) => update('server_port', event.target.value)}
              />
            </Field>
          )}
          {!business && certificateFieldVisible(draft) && machineId ? (
            <CertificateSelector
              machineId={machineId}
              value={certificateSelection}
              onChange={setCertificateSelection}
              required={certificateFieldRequired(draft)}
              disabled={busy}
            />
          ) : null}
          {business && (
            <>
              <Field>
                <FieldLabel htmlFor="node-rate">流量倍率</FieldLabel>
                <Input
                  id="node-rate"
                  type="number"
                  min={0}
                  step="0.1"
                  value={String(draft.rate ?? 1)}
                  onChange={(event) => update('rate', event.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="node-quota">
                  节点累计流量上限（字节）
                </FieldLabel>
                <Input
                  id="node-quota"
                  type="number"
                  min={0}
                  value={String(draft.transfer_enable ?? 0)}
                  onChange={(event) =>
                    update('transfer_enable', event.target.value)
                  }
                />
                <FieldDescription>0 表示不限制。</FieldDescription>
              </Field>
              <Field className="sm:col-span-2">
                <FieldLabel htmlFor="node-tags">标签</FieldLabel>
                <Input
                  id="node-tags"
                  value={(Array.isArray(draft.tags) ? draft.tags : []).join(
                    ', ',
                  )}
                  onChange={(event) =>
                    update(
                      'tags',
                      event.target.value
                        .split(',')
                        .map((value) => value.trim())
                        .filter(Boolean),
                    )
                  }
                />
              </Field>
            </>
          )}
          <Field
            orientation="horizontal"
            className="sm:col-span-2 justify-between"
          >
            <FieldLabel htmlFor="node-enabled">运行实例启用</FieldLabel>
            <Switch
              id="node-enabled"
              checked={Boolean(draft.enabled)}
              onCheckedChange={(value) => update('enabled', value)}
            />
          </Field>
          {business && (
            <Field className="sm:col-span-2">
              <div className="flex items-center justify-between">
                <FieldLabel htmlFor="node-time-rate">分时流量倍率</FieldLabel>
                <Switch
                  id="node-time-rate"
                  checked={Boolean(draft.rate_time_enable)}
                  onCheckedChange={(value) => update('rate_time_enable', value)}
                />
              </div>
              {Boolean(draft.rate_time_enable) && (
                <>
                  <div className="flex flex-col gap-2">
                    {(Array.isArray(draft.rate_time_ranges)
                      ? draft.rate_time_ranges
                      : []
                    ).map((range, index) => (
                      <div
                        key={index}
                        className="grid grid-cols-[1fr_1fr_1fr_auto] items-end gap-2"
                      >
                        <Field>
                          <FieldLabel htmlFor={'rate-start-' + index}>
                            开始
                          </FieldLabel>
                          <Input
                            id={'rate-start-' + index}
                            type="time"
                            value={String(range.start)}
                            onChange={(event) =>
                              update(
                                'rate_time_ranges',
                                (
                                  draft.rate_time_ranges as Record<
                                    string,
                                    unknown
                                  >[]
                                ).map((item, i) =>
                                  i === index
                                    ? { ...item, start: event.target.value }
                                    : item,
                                ),
                              )
                            }
                          />
                        </Field>
                        <Field>
                          <FieldLabel htmlFor={'rate-end-' + index}>
                            结束
                          </FieldLabel>
                          <Input
                            id={'rate-end-' + index}
                            type="time"
                            value={String(range.end)}
                            onChange={(event) =>
                              update(
                                'rate_time_ranges',
                                (
                                  draft.rate_time_ranges as Record<
                                    string,
                                    unknown
                                  >[]
                                ).map((item, i) =>
                                  i === index
                                    ? { ...item, end: event.target.value }
                                    : item,
                                ),
                              )
                            }
                          />
                        </Field>
                        <Field>
                          <FieldLabel htmlFor={'rate-value-' + index}>
                            倍率
                          </FieldLabel>
                          <Input
                            id={'rate-value-' + index}
                            type="number"
                            min={0}
                            step="0.1"
                            value={String(range.rate)}
                            onChange={(event) =>
                              update(
                                'rate_time_ranges',
                                (
                                  draft.rate_time_ranges as Record<
                                    string,
                                    unknown
                                  >[]
                                ).map((item, i) =>
                                  i === index
                                    ? {
                                        ...item,
                                        rate: Number(event.target.value),
                                      }
                                    : item,
                                ),
                              )
                            }
                          />
                        </Field>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="移除倍率时段"
                          onClick={() =>
                            update(
                              'rate_time_ranges',
                              (draft.rate_time_ranges as unknown[]).filter(
                                (_, i) => i !== index,
                              ),
                            )
                          }
                        >
                          <Trash2 />
                        </Button>
                      </div>
                    ))}
                  </div>
                  <Button
                    variant="outline"
                    onClick={() =>
                      update('rate_time_ranges', [
                        ...(Array.isArray(draft.rate_time_ranges)
                          ? draft.rate_time_ranges
                          : []),
                        { start: '00:00', end: '06:00', rate: 1 },
                      ])
                    }
                  >
                    <Plus />
                    添加时段
                  </Button>
                  <FieldDescription>
                    未匹配时段的流量使用基础倍率。
                  </FieldDescription>
                </>
              )}
            </Field>
          )}
          <Field
            orientation="horizontal"
            className="sm:col-span-2 justify-between"
          >
            <FieldLabel htmlFor="node-visible">在订阅中显示</FieldLabel>
            <Switch
              id="node-visible"
              checked={Boolean(draft.show)}
              onCheckedChange={(value) => update('show', value ? 1 : 0)}
            />
          </Field>
          <Field className="sm:col-span-2">
            <FieldLabel>用户权限组</FieldLabel>
            <div className="flex flex-wrap gap-4">
              {groups.data?.map((group) => (
                <label
                  key={group.id}
                  className="flex items-center gap-2 text-sm"
                >
                  <Checkbox
                    checked={((draft.group_ids as number[]) ?? []).includes(
                      group.id,
                    )}
                    onCheckedChange={(checked) =>
                      update(
                        'group_ids',
                        checked
                          ? [...((draft.group_ids as number[]) ?? []), group.id]
                          : ((draft.group_ids as number[]) ?? []).filter(
                              (id) => id !== group.id,
                            ),
                      )
                    }
                  />
                  {group.name}
                </label>
              ))}
            </div>
            <FieldDescription>允许所选权限组中的用户连接。</FieldDescription>
          </Field>
        </FieldGroup>
        <DialogFooter>
          <Button variant="outline" disabled={busy} onClick={onClose}>
            取消
          </Button>
          <Button disabled={busy || groups.loading} onClick={() => void save()}>
            {busy ? '保存中…' : '保存'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
