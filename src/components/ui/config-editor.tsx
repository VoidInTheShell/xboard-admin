import * as React from "react"
import Editor, { loader } from "@monaco-editor/react"
import * as monaco from "monaco-editor/esm/vs/editor/editor.api.js"
import "monaco-editor/esm/vs/language/json/monaco.contribution.js"
import "monaco-editor/esm/vs/language/html/monaco.contribution.js"
import "monaco-editor/esm/vs/basic-languages/yaml/yaml.contribution.js"
import editorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker"
import jsonWorker from "monaco-editor/esm/vs/language/json/json.worker?worker"
import htmlWorker from "monaco-editor/esm/vs/language/html/html.worker?worker"
import { Braces, Check, Copy, Expand, FileCode2, Trash2, WandSparkles } from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ButtonGroup } from "@/components/ui/button-group"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { cn } from "@/lib/utils"

type MonacoEnvironment = {
  getWorker: (_moduleId: string, label: string) => Worker
}

const browserGlobal = globalThis as typeof globalThis & { MonacoEnvironment?: MonacoEnvironment }

browserGlobal.MonacoEnvironment = {
  getWorker: (_moduleId, label) => label === "json" ? new jsonWorker() : label === "html" ? new htmlWorker() : new editorWorker(),
}

loader.config({ monaco })

export type ConfigEditorLanguage = "json" | "yaml" | "html" | "text"

type ConfigEditorProps = {
  value: string
  onChange: (value: string) => void
  label: string
  language?: ConfigEditorLanguage
  placeholder?: string
  rows?: number
  className?: string
  disabled?: boolean
}

const languageLabels: Record<ConfigEditorLanguage, string> = {
  json: "JSON",
  yaml: "YAML",
  html: "HTML",
  text: "纯文本",
}

function getJsonState(value: string, language: ConfigEditorLanguage) {
  if (language !== "json") return { valid: true, message: languageLabels[language] }
  if (!value.trim()) return { valid: true, message: "等待输入" }

  try {
    JSON.parse(value)
    return { valid: true, message: "JSON 有效" }
  } catch {
    return { valid: false, message: "JSON 格式错误" }
  }
}

function EditorSurface({
  value,
  onChange,
  label,
  language,
  placeholder,
  height,
  disabled,
}: Omit<ConfigEditorProps, "rows" | "className" | "language"> & {
  language: ConfigEditorLanguage
  height: number | string
}) {
  return (
    <div className="relative overflow-hidden bg-[#1e1e1e]" style={{ height }}>
      <Editor
        height="100%"
        theme="vs-dark"
        language={language === "text" ? "plaintext" : language}
        value={value}
        onChange={(next) => onChange(next ?? "")}
        loading={<div className="flex h-full items-center justify-center bg-[#1e1e1e] text-sm text-zinc-400">正在加载配置编辑器…</div>}
        options={{
          ariaLabel: `${label}配置编辑器`,
          automaticLayout: true,
          bracketPairColorization: { enabled: true },
          folding: true,
          fontFamily: "Consolas, 'Cascadia Code', 'SFMono-Regular', monospace",
          fontLigatures: true,
          fontSize: 13,
          formatOnPaste: language === "json",
          formatOnType: language === "json",
          guides: { bracketPairs: true, indentation: true },
          lineHeight: 22,
          lineNumbers: "on",
          minimap: { enabled: true, maxColumn: 80, renderCharacters: false },
          padding: { top: 12, bottom: 12 },
          renderLineHighlight: "line",
          scrollBeyondLastLine: false,
          smoothScrolling: true,
          tabSize: 2,
          wordWrap: "on",
          wrappingIndent: "indent",
          readOnly: disabled,
        }}
      />
      {!value && placeholder ? (
        <div className="pointer-events-none absolute top-3 right-24 left-[66px] truncate font-data text-xs leading-[22px] text-zinc-500">
          {placeholder.replace(/\n/g, " ")}
        </div>
      ) : null}
    </div>
  )
}

export function ConfigEditor({
  value,
  onChange,
  label,
  language = "json",
  placeholder,
  rows = 8,
  className,
  disabled = false,
}: ConfigEditorProps) {
  const [fullscreenOpen, setFullscreenOpen] = React.useState(false)
  const [clearArmed, setClearArmed] = React.useState(false)
  const jsonState = React.useMemo(() => getJsonState(value, language), [language, value])
  const lineCount = value ? value.split("\n").length : 1
  const editorHeight = Math.min(Math.max(rows * 24 + 52, 184), 520)

  React.useEffect(() => {
    if (!clearArmed) return
    const timeout = window.setTimeout(() => setClearArmed(false), 3000)
    return () => window.clearTimeout(timeout)
  }, [clearArmed])

  async function copyValue() {
    try {
      await navigator.clipboard.writeText(value)
      toast.success(`${label}已复制`)
    } catch {
      toast.error("复制失败，请在编辑器内手动复制")
    }
  }

  function formatJson() {
    if (language !== "json" || !value.trim()) return

    try {
      onChange(JSON.stringify(JSON.parse(value), null, 2))
      toast.success("JSON 已格式化")
    } catch {
      toast.error("JSON 格式有误，修正后才能格式化")
    }
  }

  function clearValue() {
    if (!clearArmed) {
      setClearArmed(true)
      toast.warning("再次点击“确认清空”才会删除当前内容")
      return
    }

    onChange("")
    setClearArmed(false)
    toast.success(`${label}内容已清空`)
  }

  const toolbar = (
    <div className="flex min-w-0 flex-col gap-2 border-b bg-muted/35 p-2.5">
      <div className="flex min-w-0 items-center gap-2 px-1 text-sm font-medium">
        <FileCode2 className="size-4 text-muted-foreground" aria-hidden="true" />
        <span className="whitespace-nowrap">配置编辑器</span>
        <Badge variant="secondary" className="font-data text-[10px]">{languageLabels[language]}</Badge>
      </div>
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <ButtonGroup aria-label={`${label}编辑器操作`}>
          <Button type="button" variant="outline" size="sm" disabled={disabled || language !== "json" || !value.trim()} onClick={formatJson}>
            <WandSparkles data-icon="inline-start" aria-hidden="true" />
            格式化
          </Button>
          <Button type="button" variant="outline" size="sm" disabled={!value} onClick={copyValue}>
            <Copy data-icon="inline-start" aria-hidden="true" />
            复制
          </Button>
        </ButtonGroup>
        <Button
          type="button"
          variant={clearArmed ? "destructive" : "outline"}
          size="sm"
          className={clearArmed ? undefined : "text-destructive hover:text-destructive"}
          disabled={disabled || !value}
          onClick={clearValue}
        >
          <Trash2 data-icon="inline-start" aria-hidden="true" />
          {clearArmed ? "确认清空" : "清空"}
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => setFullscreenOpen(true)}>
          <Expand data-icon="inline-start" aria-hidden="true" />
          全屏编辑
        </Button>
      </div>
    </div>
  )

  return (
    <>
      <div className={cn("overflow-hidden rounded-2xl border bg-card shadow-xs", className)}>
        {toolbar}
        <EditorSurface
          value={value}
          onChange={onChange}
          label={label}
          language={language}
          placeholder={placeholder}
          height={editorHeight}
          disabled={disabled}
        />
        <div className="flex flex-wrap items-center justify-between gap-2 border-t bg-muted/25 px-3 py-2 text-[11px] text-muted-foreground">
          <span className="font-data">共 {lineCount} 行 · {value.length} 字符</span>
          <span className={cn("flex items-center gap-1.5", !jsonState.valid && "text-destructive")}>
            {language === "json" ? (jsonState.valid ? <Check className="size-3.5" aria-hidden="true" /> : <Braces className="size-3.5" aria-hidden="true" />) : null}
            {jsonState.message}
          </span>
        </div>
      </div>

      <Dialog open={fullscreenOpen} onOpenChange={setFullscreenOpen}>
        <DialogContent
          bodyClassName="overflow-hidden p-5 sm:p-5"
          className="h-[calc(100dvh-2rem)] max-h-none w-[calc(100vw-2rem)] max-w-none sm:max-w-none"
          showCloseButton={false}
        >
          <DialogHeader className="pr-0">
            <DialogTitle>{label}</DialogTitle>
            <DialogDescription>全屏配置编辑器 · {languageLabels[language]} · 修改会同步回当前表单。</DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-hidden rounded-2xl border shadow-sm">
            <EditorSurface
              value={value}
              onChange={onChange}
              label={label}
              language={language}
              placeholder={placeholder}
              height="100%"
              disabled={disabled}
            />
          </div>
          <DialogFooter className="items-center sm:justify-between">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Badge variant={jsonState.valid ? "secondary" : "destructive"}>{jsonState.message}</Badge>
              <span className="font-data">{lineCount} 行 · {value.length} 字符</span>
            </div>
            <Button type="button" onClick={() => setFullscreenOpen(false)}>
              <Check data-icon="inline-start" aria-hidden="true" />
              完成编辑
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
