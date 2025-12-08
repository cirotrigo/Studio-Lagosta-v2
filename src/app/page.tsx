import { SalesPage } from "@/components/sales/SalesPage"
import { Metadata } from "next"

export const revalidate = 0

export const metadata: Metadata = {
  title: "Lagosta Criativa | Marketing Gastronômico que Gera Vendas",
  description: "Não vendemos posts. Vendemos mesas ocupadas. A única empresa do ES que une produção audiovisual, marketing estratégico e automação para restaurantes.",
  openGraph: {
    title: "Lagosta Criativa | Marketing Gastronômico",
    description: "Escale seu restaurante com método e precisão.",
    type: "website",
  }
}

export default function HomePage() {
  return <SalesPage />
}
