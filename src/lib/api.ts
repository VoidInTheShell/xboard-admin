export type ApiQueryValue = string | number | boolean | null | undefined

export type ApiRequestOptions = Omit<RequestInit, "body" | "headers"> & {
  body?: unknown
  headers?: HeadersInit
  query?: Record<string, ApiQueryValue | ApiQueryValue[]>
}

type ApiEnvelope<T> = {
  status: "success" | "fail"
  message?: string
  data?: T
  error?: unknown
}

export class ApiError extends Error {
  readonly status: number
  readonly payload: unknown
  readonly fieldErrors: Record<string, string[]>

  constructor(message: string, status: number, payload?: unknown) {
    super(message)
    this.name = "ApiError"
    this.status = status
    this.payload = payload
    this.fieldErrors = extractFieldErrors(payload)
  }
}

const apiOrigin = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/+$/, "")
export const adminApiPath = activeAdminPath()
export const adminApiBase = `/api/v2/${adminApiPath}`

export async function apiRequest<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const { body, headers: suppliedHeaders, query, ...requestInit } = options
  const headers = new Headers(suppliedHeaders)
  headers.set("Accept", "application/json")

  let requestBody: BodyInit | undefined
  if (body instanceof FormData || body instanceof URLSearchParams || typeof body === "string") {
    requestBody = body
  } else if (body !== undefined) {
    headers.set("Content-Type", "application/json")
    requestBody = JSON.stringify(body)
  }

  const response = await fetch(buildUrl(path, query), {
    credentials: "same-origin",
    ...requestInit,
    headers,
    body: requestBody,
  })

  const payload = await readPayload(response)
  const envelope = isEnvelope<T>(payload) ? payload : null
  const failedEnvelope = envelope?.status === "fail"

  if (!response.ok || failedEnvelope) {
    throw new ApiError(
      messageFromPayload(payload) ?? fallbackResponseMessage(response, "请求失败"),
      response.status,
      payload,
    )
  }

  return (envelope ? envelope.data : payload) as T
}

export class AdminApiClient {
  private readonly authData: string
  private readonly onUnauthorized?: () => void
  readonly clientId: string

  constructor(
    authData: string,
    onUnauthorized?: () => void,
  ) {
    this.authData = authData
    this.onUnauthorized = onUnauthorized
    this.clientId = getAdminClientId()
  }

  async request<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
    const headers = new Headers(options.headers)
    headers.set("Authorization", this.authData)
    headers.set("X-Xboard-Admin-Client-Id", this.clientId)

    try {
      return await apiRequest<T>(`${adminApiBase}/${path.replace(/^\/+/, "")}`, {
        ...options,
        headers,
      })
    } catch (error) {
      if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
        this.onUnauthorized?.()
      }
      throw error
    }
  }

  get<T>(path: string, query?: ApiRequestOptions["query"], signal?: AbortSignal) {
    return this.request<T>(path, { method: "GET", query, signal })
  }

  post<T>(path: string, body?: unknown, signal?: AbortSignal) {
    return this.request<T>(path, { method: "POST", body, signal })
  }

  async download(path: string, body?: unknown, signal?: AbortSignal, method: "GET" | "POST" = "POST") {
    const headers = new Headers({
      Accept: "text/csv, application/octet-stream, application/json",
      Authorization: this.authData,
      "Content-Type": "application/json",
      "X-Xboard-Admin-Client-Id": this.clientId,
    })
    const response = await fetch(buildUrl(`${adminApiBase}/${path.replace(/^\/+/, "")}`), {
      method,
      credentials: "same-origin",
      headers,
      body: method === "GET" || body === undefined ? undefined : JSON.stringify(body),
      signal,
    })
    const contentType = response.headers.get("content-type") ?? ""

    if (!response.ok || contentType.includes("application/json")) {
      const payload = await readPayload(response)
      const envelope = isEnvelope<unknown>(payload) ? payload : null
      if (!response.ok || envelope?.status === "fail") {
        throw new ApiError(messageFromPayload(payload) ?? fallbackResponseMessage(response, "下载失败"), response.status, payload)
      }
      throw new ApiError("下载接口没有返回文件。", response.status, payload)
    }

    const disposition = response.headers.get("content-disposition") ?? ""
    const filename = disposition.match(/filename\*?=(?:UTF-8''|")?([^";]+)/i)?.[1]
    return { blob: await response.blob(), filename: filename ? decodeURIComponent(filename) : "download.csv" }
  }

  async stream(path: string, query?: ApiRequestOptions["query"], signal?: AbortSignal) {
    const response = await fetch(buildUrl(`${adminApiBase}/${path.replace(/^\/+/, "")}`, query), {
      method: "GET",
      credentials: "same-origin",
      headers: {
        Accept: "text/event-stream",
        Authorization: this.authData,
        "X-Xboard-Admin-Client-Id": this.clientId,
      },
      signal,
    })

    if (!response.ok) {
      const payload = await readPayload(response)
      if (response.status === 401 || response.status === 403) this.onUnauthorized?.()
      throw new ApiError(
        messageFromPayload(payload) ?? fallbackResponseMessage(response, "同步连接失败"),
        response.status,
        payload,
      )
    }

    return response
  }
}

const adminClientIdStorageKey = "xboard-admin-client-id-v1"

function getAdminClientId() {
  const existing = sessionStorage.getItem(adminClientIdStorageKey)
  if (existing && /^[A-Za-z0-9_-]{1,64}$/.test(existing)) return existing

  const created = typeof crypto.randomUUID === "function"
    ? crypto.randomUUID().replaceAll("-", "")
    : Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) => byte.toString(16).padStart(2, "0")).join("")
  sessionStorage.setItem(adminClientIdStorageKey, created)
  return created
}

function buildUrl(path: string, query?: ApiRequestOptions["query"]) {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`
  const search = new URLSearchParams()

  Object.entries(query ?? {}).forEach(([key, value]) => {
    const values = Array.isArray(value) ? value : [value]
    values.forEach((item) => {
      if (item !== null && item !== undefined && item !== "") search.append(key, String(item))
    })
  })

  const suffix = search.size ? `?${search.toString()}` : ""
  return `${apiOrigin}${normalizedPath}${suffix}`
}

async function readPayload(response: Response): Promise<unknown> {
  if (response.status === 204) return null
  const contentType = response.headers.get("content-type") ?? ""
  if (contentType.includes("application/json")) return response.json()

  const text = await response.text()
  if (!text) return null
  try {
    return JSON.parse(text) as unknown
  } catch {
    return text
  }
}

function isEnvelope<T>(payload: unknown): payload is ApiEnvelope<T> {
  return isRecord(payload) && (payload.status === "success" || payload.status === "fail")
}

function messageFromPayload(payload: unknown): string | null {
  if (typeof payload === "string") {
    const message = payload.trim()
    if (!message || /<(?:!doctype|html|head|body|title|h1)\b/i.test(message)) return null
    return message.length > 500 ? `${message.slice(0, 497)}...` : message
  }
  if (!isRecord(payload)) return null
  if (typeof payload.message === "string" && payload.message.trim()) return payload.message
  if (typeof payload.error === "string" && payload.error.trim()) return payload.error
  return null
}

function fallbackResponseMessage(response: Response, action: string) {
  const contentType = response.headers.get("content-type") ?? ""
  if (contentType.includes("text/html")) {
    return `后端接口不可用（HTTP ${response.status}），请检查 API 反向代理配置。`
  }
  return `${action}（HTTP ${response.status}）`
}

function extractFieldErrors(payload: unknown): Record<string, string[]> {
  if (!isRecord(payload)) return {}
  const source = isRecord(payload.errors)
    ? payload.errors
    : isRecord(payload.error)
      ? payload.error
      : null
  if (!source) return {}

  return Object.fromEntries(
    Object.entries(source).flatMap(([key, value]) => {
      if (Array.isArray(value)) return [[key, value.map(String)]]
      if (typeof value === "string") return [[key, [value]]]
      return []
    }),
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
import { activeAdminPath } from "@/lib/admin-entry"
