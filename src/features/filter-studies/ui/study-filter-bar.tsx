"use client";

import { SearchIcon } from "lucide-react";

import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/shared/ui/input-group";
import { ToggleGroup, ToggleGroupItem } from "@/shared/ui/toggle-group";

import type { StudyFilter, WorkStatusFilter } from "../model/types";

const STATUS_OPTIONS: { value: WorkStatusFilter; label: string }[] = [
  { value: "all", label: "전체" },
  { value: "untouched", label: "미작업" },
  { value: "in-progress", label: "작업 중" },
  { value: "done", label: "완료" },
];

export interface StudyFilterBarProps {
  value: StudyFilter;
  onChange: (value: StudyFilter) => void;
}

export function StudyFilterBar({ value, onChange }: StudyFilterBarProps) {
  return (
    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
      <InputGroup className="md:max-w-md">
        <InputGroupAddon>
          <SearchIcon aria-hidden />
        </InputGroupAddon>
        <InputGroupInput
          type="search"
          aria-label="검사 검색"
          placeholder="검사 날짜·식별자로 검색"
          value={value.query}
          onChange={(event) =>
            onChange({ ...value, query: event.currentTarget.value })
          }
        />
      </InputGroup>
      <ToggleGroup
        aria-label="작업 상태"
        variant="outline"
        spacing={0}
        value={[value.status]}
        onValueChange={(next: unknown[]) => {
          // 선택된 항목을 다시 눌러 아무 상태도 없게 만들지 않는다.
          const selected = next.at(-1) as WorkStatusFilter | undefined;
          if (selected && selected !== value.status)
            onChange({ ...value, status: selected });
        }}
      >
        {STATUS_OPTIONS.map((option) => (
          <ToggleGroupItem key={option.value} value={option.value}>
            {option.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
  );
}
