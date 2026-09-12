import { FileCode2 } from 'lucide-react'
import type { CatalogTab } from "@/lib/control-plane/catalog-types"

const templateClients = [
  { id: "singbox", title: "Sing-box", language: "json" as const },
  { id: "clash", title: "Clash", language: "yaml" as const },
  { id: "clashmeta", title: "Clash Meta", language: "yaml" as const },
  { id: "stash", title: "Stash", language: "yaml" as const },
  { id: "surge", title: "Surge", language: "text" as const },
  { id: "surfboard", title: "Surfboard", language: "text" as const },
] as const

export const subscriptionTemplateCatalog: CatalogTab[] = templateClients.map((client) => ({
  id: client.id,
  title: client.title,
  icon: FileCode2,
  description: `维护 ${client.title} 客户端使用的订阅模板。`,
  sections: [
    {
      id: `${client.id}-template`,
      title: `${client.title} 订阅模板`,
      description: "模板通过 XBoard SubscribeTemplate 持久化；保存后会重新读取确认。",
      fields: [
        {
          key: `subscribe_template.${client.id}`,
          backendKey: `subscribe_template_${client.id}`,
          label: "模板内容",
          control: "code",
          language: client.language,
          rows: 18,
          span: 2,
        },
      ],
    },
  ],
}))
