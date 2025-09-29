"use client";

import React from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Search } from "lucide-react";

interface Column<T> {
  key: keyof T | string;
  header: string;
  render?: (item: T) => React.ReactNode;
  className?: string;
}

interface DataTableProps<T> {
  data: T[];
  columns: Column<T>[];
  searchable?: boolean;
  searchPlaceholder?: string;
  searchKeys?: (keyof T)[];
  onSearch?: (term: string) => void;
  searchTerm?: string;
  loading?: boolean;
  emptyMessage?: string;
  showCount?: boolean;
  countLabel?: string;
  headerContent?: React.ReactNode;
  className?: string;
}

export function DataTable<T extends Record<string, unknown>>({
  data,
  columns,
  searchable = true,
  searchPlaceholder = "Pesquisar...",
  searchKeys,
  onSearch,
  searchTerm: controlledSearchTerm,
  loading = false,
  emptyMessage = "Nenhum item encontrado",
  showCount = true,
  countLabel = "itens",
  headerContent,
  className = "",
}: DataTableProps<T>) {
  const [internalSearchTerm, setInternalSearchTerm] = React.useState("");
  const searchTerm = controlledSearchTerm ?? internalSearchTerm;

  const filteredData = React.useMemo(() => {
    if (!searchable || !searchTerm || !searchKeys) return data;

    return data.filter((item) =>
      searchKeys.some((key) => {
        const value = item[key as keyof T];
        // Handle nested objects (like user.name, user.email)
        if (typeof value === 'object' && value !== null) {
          return Object.values(value).some(nestedValue =>
            nestedValue?.toString().toLowerCase().includes(searchTerm.toLowerCase())
          );
        }
        return value?.toString().toLowerCase().includes(searchTerm.toLowerCase());
      })
    );
  }, [data, searchTerm, searchKeys, searchable]);

  const handleSearchChange = (value: string) => {
    if (onSearch) {
      onSearch(value);
    } else {
      setInternalSearchTerm(value);
    }
  };

  const displayData = searchKeys ? filteredData : data;

  if (loading) {
    return (
      <Card className={className}>
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      </Card>
    );
  }

  return (
    <Card className={className}>
      {(searchable || headerContent || showCount) && (
        <div className="p-6 border-b border-border">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4 flex-1">
              {searchable && (
                <div className="relative flex-1 max-w-sm">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    type="search"
                    placeholder={searchPlaceholder}
                    className="pl-10"
                    value={searchTerm}
                    onChange={(e) => handleSearchChange(e.target.value)}
                  />
                </div>
              )}
              {showCount && (
                <Badge variant="secondary">
                  {displayData.length} {countLabel}
                </Badge>
              )}
            </div>
            {headerContent && <div>{headerContent}</div>}
          </div>
        </div>
      )}

      <Table>
        <TableHeader>
          <TableRow className="border-border">
            {columns.map((column) => (
              <TableHead
                key={typeof column.key === 'string' ? column.key : String(column.key)}
                className={`text-muted-foreground ${column.className || ""}`}
              >
                {column.header}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {displayData.length === 0 ? (
            <TableRow className="border-border">
              <TableCell
                colSpan={columns.length}
                className="text-center text-muted-foreground py-6"
              >
                {emptyMessage}
              </TableCell>
            </TableRow>
          ) : (
            displayData.map((item, index) => (
              <TableRow key={(item as { id?: string | number }).id || index} className="border-border">
                {columns.map((column) => (
                  <TableCell
                    key={typeof column.key === 'string' ? column.key : String(column.key)}
                    className={column.className}
                  >
                    {column.render
                      ? column.render(item)
                      : String(item[column.key as keyof T] || '')
                    }
                  </TableCell>
                ))}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </Card>
  );
}