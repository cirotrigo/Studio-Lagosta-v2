'use client'

import { useState } from 'react'
import { ProjectAnalyticsResponse } from '@/hooks/use-project-analytics'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Download, FileText, FileSpreadsheet } from 'lucide-react'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'

interface AnalyticsExportProps {
  data: ProjectAnalyticsResponse
  projectName?: string
}

export function AnalyticsExport({ data, projectName }: AnalyticsExportProps) {
  const [isExporting, setIsExporting] = useState(false)

  const exportToCSV = () => {
    setIsExporting(true)

    try {
      // CSV Header
      const headers = [
        'ID',
        'Tipo',
        'Caption',
        'Data de Publicação',
        'URL',
        'Curtidas',
        'Comentários',
        'Compartilhamentos',
        'Alcance',
        'Impressões',
        'Engagement',
        'Taxa de Engagement (%)',
        'Última Atualização',
      ]

      // CSV Rows
      const rows = data.posts.map((post) => {
        const engagementRate =
          post.analyticsEngagement && post.analyticsReach
            ? ((post.analyticsEngagement / post.analyticsReach) * 100).toFixed(2)
            : '-'

        return [
          post.id,
          post.postType,
          post.caption ? `"${post.caption.replace(/"/g, '""')}"` : '-',
          post.sentAt
            ? format(new Date(post.sentAt), 'dd/MM/yyyy HH:mm', {
                locale: ptBR,
              })
            : '-',
          post.publishedUrl || '-',
          post.analyticsLikes ?? '-',
          post.analyticsComments ?? '-',
          post.analyticsShares ?? '-',
          post.analyticsReach ?? '-',
          post.analyticsImpressions ?? '-',
          post.analyticsEngagement ?? '-',
          engagementRate,
          post.analyticsFetchedAt
            ? format(new Date(post.analyticsFetchedAt), 'dd/MM/yyyy HH:mm', {
                locale: ptBR,
              })
            : '-',
        ]
      })

      // Create CSV content
      const csvContent = [
        headers.join(','),
        ...rows.map((row) => row.join(',')),
      ].join('\n')

      // Add BOM for proper Excel UTF-8 support
      const BOM = '\uFEFF'
      const blob = new Blob([BOM + csvContent], {
        type: 'text/csv;charset=utf-8;',
      })

      // Download file
      const link = document.createElement('a')
      const url = URL.createObjectURL(blob)
      link.setAttribute('href', url)
      link.setAttribute(
        'download',
        `analytics-${projectName || 'projeto'}-${format(new Date(), 'yyyy-MM-dd')}.csv`
      )
      link.style.visibility = 'hidden'
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
    } catch (error) {
      console.error('Error exporting CSV:', error)
      alert('Erro ao exportar CSV. Tente novamente.')
    } finally {
      setIsExporting(false)
    }
  }

  const exportToPDF = () => {
    setIsExporting(true)

    try {
      // Create a formatted HTML report
      const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Relatório de Analytics - ${projectName || 'Projeto'}</title>
  <style>
    body {
      font-family: Arial, sans-serif;
      padding: 40px;
      color: #333;
    }
    h1 {
      color: #1a1a1a;
      border-bottom: 3px solid #3b82f6;
      padding-bottom: 10px;
    }
    h2 {
      color: #4b5563;
      margin-top: 30px;
      border-bottom: 1px solid #e5e7eb;
      padding-bottom: 5px;
    }
    .summary {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 20px;
      margin: 20px 0;
    }
    .summary-card {
      background: #f9fafb;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      padding: 15px;
    }
    .summary-card h3 {
      font-size: 14px;
      color: #6b7280;
      margin: 0 0 5px 0;
    }
    .summary-card p {
      font-size: 24px;
      font-weight: bold;
      color: #1a1a1a;
      margin: 0;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 20px;
      font-size: 12px;
    }
    th {
      background: #3b82f6;
      color: white;
      padding: 10px;
      text-align: left;
      font-weight: 600;
    }
    td {
      padding: 8px;
      border-bottom: 1px solid #e5e7eb;
    }
    tr:hover {
      background: #f9fafb;
    }
    .caption {
      max-width: 300px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .footer {
      margin-top: 40px;
      padding-top: 20px;
      border-top: 1px solid #e5e7eb;
      text-align: center;
      color: #6b7280;
      font-size: 12px;
    }
  </style>
</head>
<body>
  <h1>📊 Relatório de Analytics</h1>
  <p><strong>Projeto:</strong> ${projectName || 'Sem nome'}</p>
  <p><strong>Data do Relatório:</strong> ${format(new Date(), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}</p>

  <h2>Resumo Geral</h2>
  <div class="summary">
    <div class="summary-card">
      <h3>Total de Posts</h3>
      <p>${data.summary.totalPosts}</p>
    </div>
    <div class="summary-card">
      <h3>Total de Curtidas</h3>
      <p>${data.summary.totalLikes.toLocaleString()}</p>
    </div>
    <div class="summary-card">
      <h3>Total de Comentários</h3>
      <p>${data.summary.totalComments.toLocaleString()}</p>
    </div>
    <div class="summary-card">
      <h3>Alcance Total</h3>
      <p>${data.summary.totalReach.toLocaleString()}</p>
    </div>
    <div class="summary-card">
      <h3>Impressões Totais</h3>
      <p>${data.summary.totalImpressions.toLocaleString()}</p>
    </div>
    <div class="summary-card">
      <h3>Taxa de Engagement Média</h3>
      <p>${data.summary.avgEngagementRate.toFixed(1)}%</p>
    </div>
  </div>

  <h2>Top 5 Posts por Engagement</h2>
  <table>
    <thead>
      <tr>
        <th>Tipo</th>
        <th>Caption</th>
        <th>Data</th>
        <th>Curtidas</th>
        <th>Comentários</th>
        <th>Engagement</th>
      </tr>
    </thead>
    <tbody>
      ${data.topPerformers.byEngagement
        .map(
          (post) => `
        <tr>
          <td>${post.postType}</td>
          <td class="caption">${post.caption || '-'}</td>
          <td>${post.sentAt ? format(new Date(post.sentAt), 'dd/MM/yyyy', { locale: ptBR }) : '-'}</td>
          <td>${post.analyticsLikes?.toLocaleString() || '-'}</td>
          <td>${post.analyticsComments?.toLocaleString() || '-'}</td>
          <td>${post.analyticsEngagement?.toLocaleString() || '-'}</td>
        </tr>
      `
        )
        .join('')}
    </tbody>
  </table>

  <h2>Todos os Posts</h2>
  <table>
    <thead>
      <tr>
        <th>Tipo</th>
        <th>Caption</th>
        <th>Data</th>
        <th>Curtidas</th>
        <th>Comentários</th>
        <th>Alcance</th>
        <th>Engagement</th>
      </tr>
    </thead>
    <tbody>
      ${data.posts
        .map(
          (post) => `
        <tr>
          <td>${post.postType}</td>
          <td class="caption">${post.caption || '-'}</td>
          <td>${post.sentAt ? format(new Date(post.sentAt), 'dd/MM/yyyy', { locale: ptBR }) : '-'}</td>
          <td>${post.analyticsLikes?.toLocaleString() || '-'}</td>
          <td>${post.analyticsComments?.toLocaleString() || '-'}</td>
          <td>${post.analyticsReach?.toLocaleString() || '-'}</td>
          <td>${post.analyticsEngagement?.toLocaleString() || '-'}</td>
        </tr>
      `
        )
        .join('')}
    </tbody>
  </table>

  <div class="footer">
    <p>Relatório gerado automaticamente por Studio Lagosta</p>
    <p>${format(new Date(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}</p>
  </div>
</body>
</html>
      `

      // Create blob and download
      const blob = new Blob([htmlContent], { type: 'text/html' })
      const link = document.createElement('a')
      const url = URL.createObjectURL(blob)
      link.setAttribute('href', url)
      link.setAttribute(
        'download',
        `analytics-${projectName || 'projeto'}-${format(new Date(), 'yyyy-MM-dd')}.html`
      )
      link.style.visibility = 'hidden'
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)

      // Note: For true PDF export, we would need a library like jsPDF or react-pdf
      // For now, we export as HTML which can be printed to PDF by the user
      alert(
        'Relatório HTML exportado! Abra o arquivo e use "Imprimir > Salvar como PDF" para gerar um PDF.'
      )
    } catch (error) {
      console.error('Error exporting PDF:', error)
      alert('Erro ao exportar relatório. Tente novamente.')
    } finally {
      setIsExporting(false)
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" disabled={isExporting}>
          <Download className="mr-2 h-4 w-4" />
          Exportar
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={exportToCSV} disabled={isExporting}>
          <FileSpreadsheet className="mr-2 h-4 w-4" />
          Exportar CSV
        </DropdownMenuItem>
        <DropdownMenuItem onClick={exportToPDF} disabled={isExporting}>
          <FileText className="mr-2 h-4 w-4" />
          Exportar Relatório (HTML/PDF)
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
