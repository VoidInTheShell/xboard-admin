export type UpdateChannel = "stable" | "dev"
export type UpdateSection = "panel" | "servers"
export type InstalledComponent = { component: string; name: string; version: string | null }
export type UpdateInstance = { id: string; name: string; version: string | null; installation_method: string; updater_ready: boolean; reason?: string }
export type UpdateMachine = { id: string; name: string; online: boolean; architecture: string; instances: UpdateInstance[] }
export type UpdateRelease = {
  component: string
  version: string
  channel: UpdateChannel
  published_at: string
  notes: string
  compatible: boolean
  reason?: string
  components: InstalledComponent[]
}
export type UpdateTarget = {
  id: string
  name: string
  component: string
  version: string | null
  server: string
  ready: boolean
  reason?: string
  machineId?: string
  instanceId?: string
  method?: string
}
export function versionChannel(version: string | null): UpdateChannel | null {
  if (!version || version.trim() !== version) return null
  if (/^v\d+\.\d+\.\d+-dev\.\d+\.\d+$/.test(version)) return "dev"
  return /^v\d+\.\d+\.\d+$/.test(version) ? "stable" : null
}
export function newestRelease(releases: UpdateRelease[], channel: UpdateChannel | null) {
  if (!channel) return undefined
  return releases.filter(item => item.channel === channel && versionChannel(item.version) === channel).sort((a, b) => {
    const left = a.version.match(/\d+/g)!.map(BigInt)
    const right = b.version.match(/\d+/g)!.map(BigInt)
    for (let index = 0; index < Math.max(left.length, right.length); index++) {
      const delta = (right[index] ?? 0n) - (left[index] ?? 0n)
      if (delta) return delta > 0n ? 1 : -1
    }
    return 0
  })[0]
}
export type UpdateTask = {
  task_id: string
  target_name: string
  target_version: string
  status: string
  created_at: string
  message?: string
}
export type UpdateOverview = {
  panel: { name: string; updater_ready: boolean; reason?: string; components: InstalledComponent[] }
  machines: UpdateMachine[]
  tasks: UpdateTask[]
}
export const updateStatusLabels: Record<string, string> = {
  queued: "等待执行", preparing: "准备中", backing_up: "备份中", installing: "更新中", verifying: "验证中",
  succeeded: "更新成功", rolling_back: "回滚中", rolled_back: "已回滚", rollback_failed: "回滚失败", failed: "更新失败",
}
export function updateError(error: unknown) {
  return error instanceof Error ? error.message : "无法连接更新服务，请重试。"
}
