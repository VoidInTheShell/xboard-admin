import * as React from 'react'
import {
  Bold,
  Code2,
  Eye,
  Heading2,
  Italic,
  Link2,
  List,
  ListOrdered,
  Quote,
  TextCursorInput,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

type MarkdownEditorProps = {
  id?: string
  value: string
  onValueChange: (value: string) => void
  disabled?: boolean
  invalid?: boolean
  placeholder?: string
  describedBy?: string
  className?: string
}

type MarkdownTool = {
  label: string
  icon: LucideIcon
  kind: 'prefix' | 'wrap'
  prefix: string
  suffix?: string
  fallback?: string
}

const markdownTools: MarkdownTool[] = [
  {
    label: '二级标题',
    icon: Heading2,
    kind: 'prefix',
    prefix: '## ',
  },
  {
    label: '加粗',
    icon: Bold,
    kind: 'wrap',
    prefix: '**',
    suffix: '**',
    fallback: '重点内容',
  },
  {
    label: '斜体',
    icon: Italic,
    kind: 'wrap',
    prefix: '*',
    suffix: '*',
    fallback: '强调内容',
  },
  {
    label: '链接',
    icon: Link2,
    kind: 'wrap',
    prefix: '[',
    suffix: '](https://)',
    fallback: '链接文字',
  },
  {
    label: '无序列表',
    icon: List,
    kind: 'prefix',
    prefix: '- ',
  },
  {
    label: '有序列表',
    icon: ListOrdered,
    kind: 'prefix',
    prefix: '1. ',
  },
  {
    label: '引用',
    icon: Quote,
    kind: 'prefix',
    prefix: '> ',
  },
  {
    label: '行内代码',
    icon: Code2,
    kind: 'wrap',
    prefix: '`',
    suffix: '`',
    fallback: '命令或参数',
  },
]

export function MarkdownEditor({
  id,
  value,
  onValueChange,
  disabled = false,
  invalid = false,
  placeholder = '使用 Markdown 编写正文…',
  describedBy,
  className,
}: MarkdownEditorProps) {
  const textareaRef = React.useRef<HTMLTextAreaElement>(null)
  const [view, setView] = React.useState<'write' | 'preview'>('write')

  function focusSelection(start: number, end: number) {
    window.requestAnimationFrame(() => {
      const textarea = textareaRef.current
      if (!textarea) return
      textarea.focus()
      textarea.setSelectionRange(start, end)
    })
  }

  function wrapSelection(prefix: string, suffix: string, fallback: string) {
    const textarea = textareaRef.current
    const start = textarea?.selectionStart ?? value.length
    const end = textarea?.selectionEnd ?? value.length
    const selected = value.slice(start, end) || fallback
    const next = value.slice(0, start) + prefix + selected + suffix + value.slice(end)
    onValueChange(next)
    focusSelection(start + prefix.length, start + prefix.length + selected.length)
  }

  function prefixSelectedLines(prefix: string) {
    const textarea = textareaRef.current
    const rawStart = textarea?.selectionStart ?? value.length
    const rawEnd = textarea?.selectionEnd ?? value.length
    const start = value.lastIndexOf('\n', Math.max(0, rawStart - 1)) + 1
    const endBreak = value.indexOf('\n', rawEnd)
    const end = endBreak === -1 ? value.length : endBreak
    const current = value.slice(start, end) || '输入内容'
    const nextBlock = current
      .split('\n')
      .map((line) => prefix + line)
      .join('\n')
    const next = value.slice(0, start) + nextBlock + value.slice(end)
    onValueChange(next)
    focusSelection(start, start + nextBlock.length)
  }

  function runTool(tool: MarkdownTool) {
    if (tool.kind === 'prefix') {
      prefixSelectedLines(tool.prefix)
      return
    }
    wrapSelection(tool.prefix, tool.suffix ?? '', tool.fallback ?? '')
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (!event.metaKey && !event.ctrlKey) return
    const key = event.key.toLowerCase()
    if (key === 'b') {
      event.preventDefault()
      wrapSelection('**', '**', '重点内容')
    }
    if (key === 'i') {
      event.preventDefault()
      wrapSelection('*', '*', '强调内容')
    }
  }

  return (
    <Tabs
      value={view}
      onValueChange={(next) => setView(next as 'write' | 'preview')}
      className={cn('rounded-2xl border bg-card', invalid && 'border-destructive', className)}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2">
        <TabsList variant="line" className="h-8 gap-1 rounded-none bg-transparent p-0">
          <TabsTrigger value="write" className="h-8 rounded-md px-2.5 text-xs">
            <TextCursorInput data-icon="inline-start" aria-hidden="true" />
            编辑
          </TabsTrigger>
          <TabsTrigger value="preview" className="h-8 rounded-md px-2.5 text-xs">
            <Eye data-icon="inline-start" aria-hidden="true" />
            预览
          </TabsTrigger>
        </TabsList>
        <span className="font-data text-[11px] text-muted-foreground">
          Markdown
        </span>
      </div>
      <TabsContent value="write" className="m-0">
        <TooltipProvider>
          <div
            className="flex flex-wrap items-center gap-1 border-b px-3 py-2"
            role="toolbar"
            aria-label="Markdown 格式工具"
          >
            {markdownTools.map((tool) => {
              const Icon = tool.icon
              return (
                <Tooltip key={tool.label}>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label={tool.label}
                      disabled={disabled}
                      onClick={() => runTool(tool)}
                    >
                      <Icon aria-hidden="true" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">{tool.label}</TooltipContent>
                </Tooltip>
              )
            })}
          </div>
        </TooltipProvider>
        <Textarea
          ref={textareaRef}
          id={id}
          value={value}
          disabled={disabled}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          placeholder={placeholder}
          spellCheck={false}
          className="min-h-72 resize-y rounded-none border-0 bg-transparent px-4 py-3 font-data text-sm leading-6 shadow-none focus-visible:ring-0"
          onChange={(event) => onValueChange(event.target.value)}
          onKeyDown={handleKeyDown}
        />
      </TabsContent>
      <TabsContent value="preview" className="m-0">
        <ScrollArea className="h-80">
          <div className="p-4">
            <MarkdownPreview source={value} />
          </div>
        </ScrollArea>
      </TabsContent>
    </Tabs>
  )
}

export function MarkdownPreview({ source }: { source?: string }) {
  if (!source?.trim()) {
    return (
      <p className="text-sm text-muted-foreground">暂无正文内容。</p>
    )
  }

  const lines = source.replace(/\r\n/g, '\n').split('\n')
  const blocks: React.ReactNode[] = []
  let index = 0

  while (index < lines.length) {
    const line = lines[index]
    const trimmed = line.trim()

    if (!trimmed) {
      index += 1
      continue
    }

    if (trimmed.startsWith('```')) {
      const language = trimmed.slice(3).trim()
      const code: string[] = []
      index += 1
      while (index < lines.length && !lines[index].trim().startsWith('```')) {
        code.push(lines[index])
        index += 1
      }
      if (index < lines.length) index += 1
      blocks.push(
        <pre
          key={`code-${index}`}
          className="overflow-x-auto rounded-xl bg-muted px-4 py-3 font-data text-xs leading-6 text-foreground"
        >
          {language ? <code data-language={language}>{code.join('\n')}</code> : <code>{code.join('\n')}</code>}
        </pre>,
      )
      continue
    }

    const heading = trimmed.match(/^(#{1,6})\s+(.+)$/)
    if (heading) {
      blocks.push(renderHeading(heading[1].length, heading[2], index))
      index += 1
      continue
    }

    if (/^(---|\*\*\*|___)$/.test(trimmed)) {
      blocks.push(<div key={`rule-${index}`} className="border-t" />)
      index += 1
      continue
    }

    if (trimmed.startsWith('>')) {
      const quote: string[] = []
      const start = index
      while (index < lines.length && lines[index].trim().startsWith('>')) {
        quote.push(lines[index].trim().replace(/^>\s?/, ''))
        index += 1
      }
      blocks.push(
        <blockquote key={`quote-${start}`} className="border-l-2 border-primary/40 pl-4 text-sm leading-6 text-muted-foreground">
          {renderInline(quote.join(' '))}
        </blockquote>,
      )
      continue
    }

    const ordered = /^\d+\.\s+/.test(trimmed)
    const unordered = /^[-*+]\s+/.test(trimmed)
    if (ordered || unordered) {
      const items: string[] = []
      const start = index
      const pattern = ordered ? /^\d+\.\s+/ : /^[-*+]\s+/
      while (index < lines.length && pattern.test(lines[index].trim())) {
        items.push(lines[index].trim().replace(pattern, ''))
        index += 1
      }
      const listItems = items.map((item, itemIndex) => (
        <li key={`${start}-${itemIndex}`}>{renderInline(item)}</li>
      ))
      blocks.push(
        ordered ? (
          <ol key={`ordered-${start}`} className="flex list-decimal flex-col gap-1 pl-5 text-sm leading-6">
            {listItems}
          </ol>
        ) : (
          <ul key={`unordered-${start}`} className="flex list-disc flex-col gap-1 pl-5 text-sm leading-6">
            {listItems}
          </ul>
        ),
      )
      continue
    }

    const paragraph: string[] = [trimmed]
    const start = index
    index += 1
    while (index < lines.length && lines[index].trim() && !isBlockStart(lines[index].trim())) {
      paragraph.push(lines[index].trim())
      index += 1
    }
    blocks.push(
      <p key={`paragraph-${start}`} className="text-sm leading-7 text-foreground">
        {renderInline(paragraph.join(' '))}
      </p>,
    )
  }

  return <div className="flex flex-col gap-3">{blocks}</div>
}

function isBlockStart(line: string) {
  return (
    line.startsWith('```') ||
    /^(#{1,6})\s+/.test(line) ||
    /^(---|\*\*\*|___)$/.test(line) ||
    line.startsWith('>') ||
    /^[-*+]\s+/.test(line) ||
    /^\d+\.\s+/.test(line)
  )
}

function renderHeading(level: number, content: string, key: number) {
  const className = cn(
    'font-semibold tracking-tight text-foreground',
    level === 1 && 'text-2xl',
    level === 2 && 'text-xl',
    level === 3 && 'text-lg',
    level >= 4 && 'text-base',
  )
  switch (level) {
    case 1:
      return <h1 key={`heading-${key}`} className={className}>{renderInline(content)}</h1>
    case 2:
      return <h2 key={`heading-${key}`} className={className}>{renderInline(content)}</h2>
    case 3:
      return <h3 key={`heading-${key}`} className={className}>{renderInline(content)}</h3>
    case 4:
      return <h4 key={`heading-${key}`} className={className}>{renderInline(content)}</h4>
    case 5:
      return <h5 key={`heading-${key}`} className={className}>{renderInline(content)}</h5>
    default:
      return <h6 key={`heading-${key}`} className={className}>{renderInline(content)}</h6>
  }
}

function renderInline(value: string): React.ReactNode {
  const pattern = /(`[^`]+`)|(\[([^\]]+)\]\(([^)\s]+)\))|(\*\*([^*]+)\*\*)|(__(.+?)__)|(\*([^*]+)\*)|(_([^_]+)_)/g
  const nodes: React.ReactNode[] = []
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = pattern.exec(value)) !== null) {
    if (match.index > lastIndex) nodes.push(value.slice(lastIndex, match.index))
    if (match[1]) {
      nodes.push(
        <code key={`code-${match.index}`} className="rounded bg-muted px-1 py-0.5 font-data text-[0.85em]">
          {match[1].slice(1, -1)}
        </code>,
      )
    } else if (match[2]) {
      const label = match[3]
      const href = match[4]
      nodes.push(
        isSafeHref(href) ? (
          <a
            key={`link-${match.index}`}
            href={href}
            target="_blank"
            rel="noreferrer"
            className="font-medium text-primary underline underline-offset-4 hover:opacity-80"
          >
            {label}
          </a>
        ) : (
          label
        ),
      )
    } else if (match[6] || match[8]) {
      nodes.push(<strong key={`bold-${match.index}`}>{match[6] ?? match[8]}</strong>)
    } else {
      nodes.push(<em key={`italic-${match.index}`}>{match[10] ?? match[12]}</em>)
    }
    lastIndex = pattern.lastIndex
  }

  if (lastIndex < value.length) nodes.push(value.slice(lastIndex))
  return nodes.length ? nodes : value
}

function isSafeHref(href: string) {
  if (href.startsWith('#') || href.startsWith('/')) return true
  try {
    const url = new URL(href)
    return ['http:', 'https:', 'mailto:'].includes(url.protocol)
  } catch {
    return false
  }
}
